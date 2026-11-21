import * as THREE from "three";

const TEXTURE_SIDE = 2048;
const TILE_SIDE = 128;
const TILE_GRID = TEXTURE_SIDE / TILE_SIDE;
const PAGE_SIDE = TILE_SIDE + 2;
const CHANNELS = 3;
const PAGE_BYTES = PAGE_SIDE ** 2 * CHANNELS;
const STEP_LENGTH = 0.084;
const FILTER = 1 / 24;

function applyTrackSurface(material, uniforms) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function compileTrackSurface(shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "varying vec2 lunarTrackWorld;\n" + shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nlunarTrackWorld = (modelMatrix * vec4(transformed, 1.0)).xz;",
    );
    shader.fragmentShader = `
      uniform highp sampler2DArray lunarTrackPages;
      uniform sampler2D lunarTrackTiles;
      uniform bool lunarTrackActive;
      uniform bool lunarTrackDebug;
      uniform float lunarTrackScale;
      varying vec2 lunarTrackWorld;

      vec3 sampleLunarTrack(vec2 world) {
        vec2 texel = (0.5 + world * lunarTrackScale) * ${TEXTURE_SIDE}.0;
        vec2 tile = floor(texel / ${TILE_SIDE}.0);
        if (any(lessThan(tile, vec2(0.0))) || any(greaterThanEqual(tile, vec2(${TILE_GRID}.0)))) return vec3(0.0);
        vec2 address = floor(texture2D(lunarTrackTiles, (tile + 0.5) / ${TILE_GRID}.0).rg * 255.0 + 0.5);
        float page = dot(address, vec2(1.0, 256.0)) - 1.0;
        if (page < 0.0) return vec3(0.0);
        // The extra texel on either side reproduces the old full-map bilinear sample.
        vec2 local = texel - tile * ${TILE_SIDE}.0;
        return texture(lunarTrackPages, vec3((local + 1.0) / ${PAGE_SIDE}.0, page)).rgb;
      }

      vec3 sampleLunarTrackDebug(vec2 world) {
        vec2 uv = 0.5 + world * lunarTrackScale;
        if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) return vec3(0.0);
        vec2 tileCoord = uv * ${TILE_GRID}.0;
        vec2 tile = floor(tileCoord);
        vec2 cell = fract(tileCoord);
        float border = step(min(cell.x, cell.y), 0.032) + step(0.968, max(cell.x, cell.y));
        vec2 address = floor(texture2D(lunarTrackTiles, (tile + 0.5) / ${TILE_GRID}.0).rg * 255.0 + 0.5);
        float page = dot(address, vec2(1.0, 256.0)) - 1.0;
        vec3 base = page >= 0.0
          ? mix(vec3(0.10, 0.72, 0.78), vec3(0.98, 0.62, 0.22), fract(page * 0.21))
          : vec3(0.07, 0.10, 0.14);
        return mix(base, vec3(0.85, 0.95, 1.0), clamp(border, 0.0, 1.0) * 0.65);
      }
    ` + shader.fragmentShader.replace("#include <color_fragment>", /* glsl */ `
      #include <color_fragment>
      float trackDistance = length(vViewPosition);
      vec3 lunarImprint = vec3(0.0);
      if (lunarTrackActive && trackDistance < 29.0) lunarImprint = sampleLunarTrack(lunarTrackWorld);
      float trackVisibility = 1.0 - smoothstep(12.0, 29.0, trackDistance);
      float treadVisibility = 1.0 - smoothstep(6.0, 18.0, trackDistance);
      float trackPacked = lunarImprint.g * trackVisibility;
      float trackCleat = lunarImprint.r * treadVisibility;
      float trackSpill = lunarImprint.b * trackVisibility;
      // Modest band brightening from compaction, localized cleat shade and loose edges.
      diffuseColor.rgb *= (1.0 + 0.24 * trackPacked) * (1.0 - 0.35 * trackCleat - 0.14 * trackSpill);
      if (lunarTrackDebug) {
        vec3 heat = sampleLunarTrackDebug(lunarTrackWorld);
        diffuseColor.rgb = mix(diffuseColor.rgb, heat + vec3(0.45 * lunarImprint.g, 0.75 * lunarImprint.r, 0.2), 0.62);
      }
    `).replace("#include <roughnessmap_fragment>", /* glsl */ `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.79, trackPacked * 0.56);
    `).replace("#include <normal_fragment_maps>", /* glsl */ `
      #include <normal_fragment_maps>
      normal = normalize(mix(normal, nonPerturbedNormal, trackPacked * 0.56));
    `);
  };
  material.customProgramCacheKey = () => previousKey + ":lunar-track-pages";
  material.needsUpdate = true;
}

function makePageStorage(capacity) {
  const side = capacity ? PAGE_SIDE : 1;
  const depth = Math.max(1, capacity);
  const storage = new THREE.DataArrayTexture(new Uint8Array(side * side * depth * CHANNELS), side, side, depth);
  storage.format = THREE.RGBFormat;
  storage.internalFormat = "RGB8";
  storage.minFilter = storage.magFilter = THREE.LinearFilter;
  storage.needsUpdate = true;
  return storage;
}

// Dirt stays in the terrain material. Allocate storage only for tiles touched by the rover.
export function createLunarTracks(material, { extent = 28 } = {}) {
  const directory = new Uint8Array(TILE_GRID ** 2 * 2);
  const tiles = new THREE.DataTexture(directory, TILE_GRID, TILE_GRID, THREE.RGFormat);
  tiles.unpackAlignment = 1;
  tiles.needsUpdate = true;
  const inverseSpan = 1 / (Math.max(1, extent) * 2);
  const texelsPerMeter = TEXTURE_SIDE * inverseSpan;
  let capacity = 0;
  let atlas = makePageStorage(capacity);
  const uniforms = {
    lunarTrackPages: { value: atlas }, lunarTrackTiles: { value: tiles },
    lunarTrackActive: { value: false }, lunarTrackDebug: { value: false }, lunarTrackScale: { value: inverseSpan },
  };
  applyTrackSurface(material, uniforms);

  const heads = new Map();
  const dirtyPages = new Set();
  const smooth = THREE.MathUtils.smoothstep;
  let allocated = 0;
  let directoryDirty = false;
  let elapsed = FILTER;
  let stampCount = 0;
  let coveredTexels = 0;

  function tileAddress(tileX, tileZ) { return (tileZ * TILE_GRID + tileX) * 2; }
  function pageAt(address) { return (directory[address] | (directory[address + 1] << 8)) - 1; }

  function allocatePage(address) {
    if (allocated === capacity) {
      const nextCapacity = capacity ? capacity * 2 : 4;
      const next = makePageStorage(nextCapacity);
      if (capacity) next.image.data.set(atlas.image.data);
      if (atlas !== uniforms.lunarTrackPages.value) atlas.dispose();
      atlas = next;
      capacity = nextCapacity;
    }
    const page = allocated++;
    directory[address] = (page + 1) & 255;
    directory[address + 1] = (page + 1) >> 8;
    directoryDirty = true;
    return page;
  }

  function writePage(page, x, z, cleat, packed, spill) {
    const start = page * PAGE_BYTES + (z * PAGE_SIDE + x) * CHANNELS;
    const data = atlas.image.data;
    data[start] = cleat;
    data[start + 1] = packed;
    data[start + 2] = spill;
    dirtyPages.add(page);
  }

  function writeHalo(tileX, tileZ, x, z, cleat, packed, spill) {
    if (tileX < 0 || tileX >= TILE_GRID || tileZ < 0 || tileZ >= TILE_GRID) return;
    const address = tileAddress(tileX, tileZ);
    const page = pageAt(address);
    // A blank neighbor may still need a border sample from this tile.
    writePage(page < 0 ? allocatePage(address) : page, x, z, cleat, packed, spill);
  }

  function paint(col, row, cleat, packed, spill) {
    if (!(cleat || packed || spill)) return;
    const tileX = Math.floor(col / TILE_SIDE), tileZ = Math.floor(row / TILE_SIDE);
    const x = col % TILE_SIDE, z = row % TILE_SIDE;
    const address = tileAddress(tileX, tileZ);
    let page = pageAt(address);
    if (page < 0) page = allocatePage(address);
    const start = page * PAGE_BYTES + ((z + 1) * PAGE_SIDE + x + 1) * CHANNELS;
    const data = atlas.image.data;
    if (cleat <= data[start] && packed <= data[start + 1] && spill <= data[start + 2]) return;
    if (!(data[start] || data[start + 1] || data[start + 2])) coveredTexels++;
    cleat = Math.max(cleat, data[start]);
    packed = Math.max(packed, data[start + 1]);
    spill = Math.max(spill, data[start + 2]);
    writePage(page, x + 1, z + 1, cleat, packed, spill);

    const across = x === 0 ? -1 : x === TILE_SIDE - 1 ? 1 : 0;
    const down = z === 0 ? -1 : z === TILE_SIDE - 1 ? 1 : 0;
    const haloX = across < 0 ? PAGE_SIDE - 1 : 0, haloZ = down < 0 ? PAGE_SIDE - 1 : 0;
    if (across) writeHalo(tileX + across, tileZ, haloX, z + 1, cleat, packed, spill);
    if (down) writeHalo(tileX, tileZ + down, x + 1, haloZ, cleat, packed, spill);
    if (across && down) writeHalo(tileX + across, tileZ + down, haloX, haloZ, cleat, packed, spill);
  }

  function stamp(x, z, heading, load, slip) {
    const centerX = (0.5 + x * inverseSpan) * TEXTURE_SIDE;
    const centerZ = (0.5 + z * inverseSpan) * TEXTURE_SIDE;
    const radius = 0.163 * texelsPerMeter;
    const startX = Math.max(1, Math.floor(centerX - radius));
    const endX = Math.min(TEXTURE_SIDE - 2, Math.ceil(centerX + radius));
    const startZ = Math.max(1, Math.floor(centerZ - radius));
    const endZ = Math.min(TEXTURE_SIDE - 2, Math.ceil(centerZ + radius));
    const sine = Math.sin(heading);
    const cosine = Math.cos(heading);
    const pressure = 0.41 + 0.59 * load;
    for (let row = startZ; row <= endZ; row++) {
      const dz = (row + 0.5 - centerZ) / texelsPerMeter;
      for (let col = startX; col <= endX; col++) {
        const dx = (col + 0.5 - centerX) / texelsPerMeter;
        const cross = Math.abs(dx * cosine - dz * sine);
        const along = dx * sine + dz * cosine;
        const grit = ((Math.imul(col, 0x45d9f3b) ^ Math.imul(row, 0x119de1f3)) >>> 26) / 63;
        const edgeRoughness = (grit - 0.5) * 0.012;
        const fullWidth = 1 - smooth(cross + edgeRoughness, 0.079, 0.113 + slip * 0.019);
        const foot = 1 - smooth(Math.abs(along), 0.043, 0.067);
        const packed = Math.round(255 * fullWidth * foot * pressure * (0.81 + 0.15 * grit));
        const cleat = (1 - smooth(Math.abs(along - (cross - 0.048) * 0.40), 0.010, 0.029))
          * fullWidth * pressure * (0.56 + grit * 0.35);
        const looseEdge = Math.max(0, 1 - Math.abs(cross - 0.113 - slip * 0.019 + edgeRoughness) / 0.038);
        const spill = Math.round(255 * looseEdge * foot * pressure * (0.19 + grit * 0.27 + slip * 0.25));
        const impression = Math.round(255 * cleat * (1 - slip * 0.27));

        paint(col, row, impression, packed, spill);
      }
    }
    stampCount++;
  }

  function record(id, { x, z, rockRise = 0 }, { heading, load = 1, slip = 0, touching = true }) {
    if (!touching || load < 0.045 || rockRise > 0.028) {
      heads.delete(id);
      return;
    }
    let head = heads.get(id);
    if (!head) {
      head = { x, z, remainder: 0 };
      heads.set(id, head);
      return;
    }
    const dx = x - head.x;
    const dz = z - head.z;
    const length = Math.hypot(dx, dz);
    // A reset or a correction into an obstacle should not draw a line through the terrain.
    if (length > 0.85) head.remainder = 0;
    else if (length >= 0.001) {
      const start = STEP_LENGTH - head.remainder;
      for (let offset = start; offset <= length; offset += STEP_LENGTH) {
        const fraction = offset / length;
        stamp(head.x + dx * fraction, head.z + dz * fraction, heading, load, slip);
      }
      head.remainder = (head.remainder + length) % STEP_LENGTH;
    }
    head.x = x;
    head.z = z;
  }

  function flush(dt = FILTER) {
    elapsed += Math.max(0, dt);
    if (!dirtyPages.size || elapsed < FILTER) return;
    const previous = uniforms.lunarTrackPages.value;
    if (previous !== atlas) {
      previous.dispose();
      uniforms.lunarTrackPages.value = atlas;
      // Keep every copied page in the initial upload, even if another flush precedes the first draw.
      for (let page = 0; page < allocated; page++) atlas.addLayerUpdate(page);
    } else {
      for (const page of dirtyPages) atlas.addLayerUpdate(page);
    }
    dirtyPages.clear();
    elapsed %= FILTER;
    atlas.needsUpdate = true;
    if (directoryDirty) {
      tiles.needsUpdate = true;
      directoryDirty = false;
    }
    uniforms.lunarTrackActive.value = true;
  }

  function restore() {
    flush(FILTER);
    atlas.clearLayerUpdates();
    atlas.needsUpdate = true;
    tiles.needsUpdate = true;
  }

  function reset() {
    heads.clear();
    if (allocated) {
      const previous = uniforms.lunarTrackPages.value;
      previous.dispose();
      if (atlas !== previous) atlas.dispose();
      capacity = allocated = 0;
      atlas = makePageStorage(capacity);
      uniforms.lunarTrackPages.value = atlas;
      uniforms.lunarTrackActive.value = false;
      directory.fill(0);
      tiles.needsUpdate = true;
    }
    directoryDirty = false;
    dirtyPages.clear();
    stampCount = 0;
    coveredTexels = 0;
    elapsed = FILTER;
  }

  function counts() {
    const published = uniforms.lunarTrackPages.value;
    const atlasBytes = atlas.image.data.byteLength;
    const publishedBytes = published.image.data.byteLength;
    return { stamps: stampCount, texels: coveredTexels, allocatedTiles: allocated, capacityTiles: capacity,
      cpuBytes: atlasBytes + (published === atlas ? 0 : publishedBytes) + directory.byteLength,
      gpuBytes: publishedBytes + directory.byteLength };
  }

  function setDebugView(enabled) {
    uniforms.lunarTrackDebug.value = Boolean(enabled);
  }

  return { record, flush, reset, restore, counts, setDebugView, totalTiles: TILE_GRID ** 2, fullMapBytes: TEXTURE_SIDE ** 2 * CHANNELS };
}
