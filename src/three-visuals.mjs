import * as THREE from "three";
import { BLUE_MARBLE_DATA } from "./lunar-presentation.mjs";
import { fracturedStoneGeometry, peripheralFragments, peripheralTint } from "./lunar-surface.mjs";
import { createLunarOutlands } from "./lunar-outlands.mjs";

const skyVertex = /* glsl */ `
  varying vec2 screenUv;
  void main() {
    screenUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

export const earthDirection = new THREE.Vector3(-0.387, 0.125, -0.905).normalize();
// A selected daylight moment at the fictional near-polar site. At the pole
// itself NASA SVS 4944 places the Sun within 1.5° of the geometric horizon.
const solarX = -15, solarZ = 11.8;
const solarElevation = THREE.MathUtils.degToRad(5);
export const LUNAR_SUN_OFFSET = Object.freeze([
  solarX, Math.hypot(solarX, solarZ) * Math.tan(solarElevation), solarZ,
]);
const defaultSun = new THREE.Vector3(...LUNAR_SUN_OFFSET).normalize();

const skyFragment = /* glsl */ `
  uniform mat3 cameraBasis;
  uniform vec2 viewScale;
  uniform vec3 earthDirection;
  uniform vec3 sunDirection;
  uniform sampler2D blueMarble;
  uniform float earthReady;
  varying vec2 screenUv;

  float hash(vec3 p) {
    p = fract(p * 0.318309886 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  vec3 stars(vec2 uv, vec2 pixel, float density, float threshold, float salt) {
    vec2 cell = floor(uv * density);
    vec3 seed = vec3(cell, salt);
    float power = hash(seed);
    vec2 center = 0.19 + 0.62 * vec2(hash(seed + vec3(1.3, 5.8, 2.4)),
                                     hash(seed + vec3(2.6, 9.3, 6.1)));
    vec2 toStar = (fract(uv * density) - center) / max(pixel * density, vec2(0.008));
    float dist = length(toStar);
    float light = (1.0 - smoothstep(0.15, 1.12, dist)) * pow(power, 14.0) * step(threshold, power);
    vec3 tint = mix(vec3(0.66, 0.81, 1.0), vec3(1.0, 0.87, 0.71), hash(seed + 7.0));
    return tint * light;
  }

  void main() {
    vec3 ray = normalize(cameraBasis * vec3((screenUv * 2.0 - 1.0) * viewScale, -1.0));
    vec2 angular = vec2(atan(ray.x, -ray.z), asin(clamp(ray.y, -1.0, 1.0)));
    // Bound the derivative at the azimuth seam and let a skyward view adapt.
    // In a short ground exposure the stars remain nearly invisible.
    vec2 onePixel = clamp(fwidth(angular), vec2(0.0001), vec2(0.022));
    vec3 forward = -cameraBasis[2];
    float fromSun = length(ray - sunDirection);
    float awayFromSun = smoothstep(0.07, 0.35, fromSun);
    float highSky = smoothstep(0.055, 0.34, ray.y);
    float pitchExposure = smoothstep(-0.14, 0.015, forward.y);
    float skyExposure = highSky * mix(0.28, 1.0, pitchExposure);
    vec3 sky = vec3(0.00038, 0.00045, 0.00062);
    if (ray.y > 0.0 && awayFromSun > 0.01) {
      sky += stars(angular, onePixel, 17.0, 0.978, 9.8) * mix(0.002, 0.021, skyExposure) * awayFromSun;
      if (skyExposure > 0.016) {
        sky += stars(angular, onePixel, 58.0, 0.979, 5.3) * (0.015 * skyExposure) * awayFromSun;
      }
    }

    // About 0.53° across at 1 AU. The small shoulder represents camera glare.
    float sunEdge = clamp(fwidth(fromSun) * 0.55, 0.0003, 0.0021);
    float sunDisc = 1.0 - smoothstep(0.00465 - sunEdge, 0.00465 + sunEdge, fromSun);
    sky += sunDisc * vec3(2.2, 2.15, 2.0);
    sky += vec3(0.032, 0.026, 0.018) * exp(-fromSun * fromSun * 4400.0);

    vec3 planetRight = normalize(cross(earthDirection, vec3(0.0, 1.0, 0.0)));
    vec3 planetUp = cross(planetRight, earthDirection);
    // Mean angular radius from the lunar surface: asin(6378 / (384400 - 1737)).
    float radius = 0.01667;
    vec2 p = vec2(dot(ray, planetRight), dot(ray, planetUp)) / radius;
    float r = length(p);
    float edge = max(0.008, length(fwidth(p)) * 0.46);
    if (dot(ray, earthDirection) > 0.98 && r < 1.0 + 2.0 * edge) {
      float z = sqrt(max(0.0, 1.0 - dot(p, p)));
      vec3 normal = normalize(p.x * planetRight + p.y * planetUp - z * earthDirection);
      float day = dot(normal, sunDirection);
      vec3 earth = mix(vec3(0.017, 0.046, 0.11), texture2D(blueMarble, vec2(0.5) + p * 0.447).rgb, earthReady);
      earth *= 0.009 + 1.25 * pow(smoothstep(-0.065, 0.85, day), 0.7);
      earth += vec3(0.025, 0.14, 0.31) * pow(1.0 - z, 5.0) * smoothstep(-0.15, 0.40, day);
      float cover = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, r);
      sky = mix(sky, earth, cover);
    }

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

function createSky(sunDirection) {
  const cameraBasis = new THREE.Matrix3();
  const viewScale = new THREE.Vector2(1, 1);
  const earthReady = { value: 0 };
  const blueMarble = new THREE.TextureLoader().load(BLUE_MARBLE_DATA, () => {
    earthReady.value = 1;
  });
  blueMarble.colorSpace = THREE.SRGBColorSpace;
  blueMarble.anisotropy = 2;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        cameraBasis: { value: cameraBasis },
        viewScale: { value: viewScale },
        earthDirection: { value: earthDirection },
        sunDirection: { value: sunDirection },
        blueMarble: { value: blueMarble },
        earthReady,
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  mesh.name = "lunar-sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    cameraBasis.setFromMatrix4(camera.matrixWorld);
    const projection = camera.projectionMatrix.elements;
    viewScale.set(1 / projection[0], 1 / projection[5]);
  };
  return mesh;
}

function detail(x, z) {
  return 0.55 * Math.sin(x * 1.25 - z * 2.1)
    + 0.28 * Math.sin(x * 4.4 + z * 5.3 + 1.4)
    + 0.12 * Math.cos(x * 11.2 - z * 8.4)
    + 0.05 * Math.sin(x * 23.1 + z * 16.8);
}

// Broad massifs flank an open basalt valley in the Apollo 17 photographs.
// Coordinates describe the game vista, inspired by NASA SVS 4302 and LRO M192703697LR.
const massifs = [
  { side: -2.74, depth: 4.65, width: 2.72, length: 2.43, angle: -0.35, rise: 0.94, apron: 0.16 },
  { side: -4.52, depth: 2.57, width: 2.25, length: 1.59, angle: 0.57, rise: 0.55, apron: 0.11 },
  { side: 2.72, depth: 5.47, width: 3.18, length: 2.65, angle: 0.11, rise: 0.91, apron: 0.12 },
  { side: 4.65, depth: 2.07, width: 1.57, length: 2.25, angle: -0.45, rise: 0.44, apron: 0.12 },
  { side: -0.46, depth: 6.62, width: 2.60, length: 1.37, angle: 0.22, rise: 0.39, apron: 0.04 },
  { side: 3.51, depth: -3.11, width: 2.34, length: 2.89, angle: -0.41, rise: 0.54, apron: 0.11 },
  { side: -3.93, depth: -3.64, width: 2.82, length: 2.21, angle: 0.35, rise: 0.66, apron: 0.09 },
  { side: 0.21, depth: -5.92, width: 2.91, length: 1.76, angle: 0.08, rise: 0.32, apron: 0.07 },
].map(massif => ({ ...massif, cosine: Math.cos(massif.angle), sine: Math.sin(massif.angle) }));

const impacts = [
  { side: -0.69, depth: 2.07, radius: 0.49, floor: 0.072, rim: 0.040 },
  { side: 1.42, depth: 2.89, radius: 0.71, floor: 0.076, rim: 0.030 },
  { side: -2.45, depth: 3.19, radius: 0.57, floor: 0.068, rim: 0.024 },
  { side: 0.27, depth: 4.61, radius: 0.56, floor: 0.064, rim: 0.023 },
  { side: 2.66, depth: -2.26, radius: 0.45, floor: 0.052, rim: 0.029 },
  { side: 0.52, depth: -2.73, radius: 0.72, floor: 0.061, rim: 0.035 },
  { side: 0.90, depth: 1.48, radius: 0.24, floor: 0.034, rim: 0.019 },
  { side: -1.33, depth: 1.04, radius: 0.30, floor: 0.044, rim: 0.027 },
  { side: 0.52, depth: -1.74, radius: 0.38, floor: 0.055, rim: 0.035 },
];

const talusFans = [
  { side: -1.24, depth: 2.33, width: 0.57, length: 1.01, angle: 0.49, lift: 0.077 },
  { side: 2.00, depth: 3.13, width: 0.68, length: 0.89, angle: -0.83, lift: 0.057 },
  { side: -2.76, depth: 1.98, width: 0.59, length: 0.83, angle: -0.42, lift: 0.055 },
  { side: 0.97, depth: 4.18, width: 0.79, length: 0.93, angle: 0.41, lift: 0.039 },
  { side: -2.26, depth: -2.33, width: 0.74, length: 0.91, angle: 0.94, lift: 0.068 },
].map(fan => ({ ...fan, cosine: Math.cos(fan.angle), sine: Math.sin(fan.angle) }));

// Separate exposures on the two massif faces break up the broad valley profile.
const scarps = [
  { side: -2.99, depth: 3.66, length: 1.25, width: 0.36, angle: -0.34, step: 0.117, phase: 1.2 },
  { side: -2.07, depth: 4.08, length: 0.81, width: 0.31, angle: -0.41, step: 0.063, phase: 4.1 },
  { side: 2.98, depth: 4.03, length: 1.48, width: 0.41, angle: 0.25, step: 0.142, phase: 5.4 },
  { side: 3.46, depth: 3.43, length: 1.05, width: 0.28, angle: 0.16, step: 0.068, phase: 2.5 },
  { side: 1.14, depth: 5.10, length: 0.81, width: 0.31, angle: 0.40, step: 0.069, phase: 0.4 },
].map(scarp => ({ ...scarp, cosine: Math.cos(scarp.angle), sine: Math.sin(scarp.angle) }));

function researchBenchMask(side, depth, bench) {
  const across = (side - bench.side) / bench.width;
  const along = (depth - bench.depth) / bench.length;
  return 1 - THREE.MathUtils.smoothstep(Math.hypot(across, along), 0.61, 1.42);
}

function sampleScarps(side, depth, shape) {
  shape.rise = 0;
  shape.rock = 0;
  shape.scree = 0;
  for (const scarp of scarps) {
    const x = side - scarp.side, z = depth - scarp.depth;
    if (Math.abs(x) > 1.70 || Math.abs(z) > 1.35) continue;
    const strike = (x * scarp.cosine + z * scarp.sine) / scarp.length;
    if (Math.abs(strike) > 1.08) continue;
    const dip = (z * scarp.cosine - x * scarp.sine) / scarp.width
      + 0.21 * strike * strike - 0.17 * Math.sin(4.1 * strike + scarp.phase);
    const lateralMask = 1 - THREE.MathUtils.smoothstep(Math.abs(strike), 0.47, 1.08);
    const openings = 0.53 + 0.32 * Math.sin(6.1 * strike + scarp.phase) + 0.12 * Math.sin(15.2 * strike);
    const headwall = THREE.MathUtils.smoothstep(dip, -0.50, -0.13)
      * (1 - THREE.MathUtils.smoothstep(dip, 0.06, 0.78));
    const breakAway = THREE.MathUtils.smoothstep(dip, -0.96, -0.63)
      * (1 - THREE.MathUtils.smoothstep(dip, -0.54, -0.16));
    const apronMask = THREE.MathUtils.smoothstep(dip, -2.84, -1.70)
      * (1 - THREE.MathUtils.smoothstep(dip, -1.09, -0.61));
    shape.rise += scarp.step * lateralMask * (headwall * (0.38 + 0.62 * openings) - breakAway * 0.35 + apronMask * 0.16);
    shape.rock += lateralMask * headwall * openings;
    shape.scree += lateralMask * apronMask * (0.56 + 0.31 * Math.cos(5.63 * strike - scarp.phase));
  }
}

function talusField(side, depth) {
  let terrain = 0;
  for (const fan of talusFans) {
    const offsetX = side - fan.side, offsetY = depth - fan.depth;
    if (Math.abs(offsetX) > 1.21 || Math.abs(offsetY) > 1.31) continue;
    const u = (offsetX * fan.cosine + offsetY * fan.sine) / fan.width;
    const v = (offsetY * fan.cosine - offsetX * fan.sine) / fan.length;
    const distance = Math.hypot(u / (1 - 0.25 * Math.sin(v)), v);
    const edge = 1 - THREE.MathUtils.smoothstep(distance, 0.14, 1.02);
    const lobes = 0.74 + 0.19 * Math.cos(u * 3.65 + v) + 0.073 * Math.sin(u * 9.6 - v * 2.2);
    const head = 0.82 + 0.21 * THREE.MathUtils.smoothstep(v, -0.71, 0.20);
    terrain += fan.lift * edge * lobes * head;
  }
  return terrain;
}

function massifRelief(side, depth) {
  let relief = 0;
  for (const massif of massifs) {
    const lateral = side - massif.side, longitudinal = depth - massif.depth;
    if (Math.abs(lateral) > 4.7 || Math.abs(longitudinal) > 4.2) continue;
    const u = (lateral * massif.cosine + longitudinal * massif.sine) / massif.width;
    const v = (longitudinal * massif.cosine - lateral * massif.sine) / massif.length;
    const shoulder = 1 + 0.27 * u - 0.08 * u * v;
    const distance = Math.hypot(u, v * shoulder + 0.16 * u * u - 0.04);
    const crest = 1 - THREE.MathUtils.smoothstep(distance, 0.17, 1.04);
    const apron = 1 - THREE.MathUtils.smoothstep(distance, 0.51, 1.39);
    const slope = massif.rise * crest * (0.94 - 0.14 * v + 0.07 * u);
    const trace = u - 0.30 - 0.17 * v - 0.067 * Math.sin(v * 5.2 + massif.angle);
    const branch = u + 0.36 + 0.27 * v - 0.038 * Math.cos(v * 7.2);
    const flute = Math.exp(-78 * trace * trace) + 0.64 * Math.exp(-107 * branch * branch);
    const slopeBand = THREE.MathUtils.smoothstep(distance, 0.28, 0.62)
      * (1 - THREE.MathUtils.smoothstep(distance, 0.77, 1.11));
    const body = slope + massif.apron * apron - massif.rise * 0.037 * flute * slopeBand;
    const join = Math.max(0, 0.17 - Math.abs(body - relief)) * THREE.MathUtils.smoothstep(body, 0.015, 0.17);
    relief = Math.max(relief, body) + join * join * 1.15;
  }
  return relief;
}

function craterRelief(side, depth) {
  let relief = 0;
  for (const impact of impacts) {
    const u = (side - impact.side) / impact.radius;
    const v = (depth - impact.depth) / impact.radius;
    if (Math.abs(u) > 1.73 || Math.abs(v) > 1.49) continue;
    const distance = Math.hypot(u * 0.94 + 0.13 * v, v) + 0.044 * detail(u + impact.side, v);
    if (distance > 1.43) continue;
    const bowl = 1 - THREE.MathUtils.smoothstep(distance, 0.24, 0.96);
    const rim = THREE.MathUtils.smoothstep(distance, 0.70, 0.98) *
      (1 - THREE.MathUtils.smoothstep(distance, 1.00, 1.31));
    const eroded = 0.68 + 0.26 * Math.sin(u * 3.2 + v * 4.9 + impact.side);
    relief += impact.rim * rim * eroded - impact.floor * bowl;
  }
  return relief;
}

function terrainHeight(radial, side, depth, scarpRise, bench, graded) {
  const nearMask = THREE.MathUtils.smoothstep(radial, 1.0, 1.46);
  const outerMask = 1 - THREE.MathUtils.smoothstep(radial, 7.20, 8.0);
  const massif = massifRelief(side, depth);
  const trace = depth - (1.94 + 0.20 * side + 0.17 * Math.sin(side * 1.7));
  const fault = 0.066 * (1 - THREE.MathUtils.smoothstep(Math.abs(side + 0.51), 0.68, 2.45))
    * THREE.MathUtils.smoothstep(trace, -0.07, 0.12)
    * (1 - THREE.MathUtils.smoothstep(trace, 0.31, 0.83));
  const surface = detail(side * 0.79, depth * 0.73);
  const skirt = 0.026 * Math.sin(side * 2.1 - depth * 2.8 + 0.27)
    + surface * (0.009 + 0.023 * massif) + 0.005 * Math.cos(side * 10.2 + depth * 6.7);
  const native = massif + fault + scarpRise + talusField(side, depth) + craterRelief(side, depth) + skirt - 0.021;
  const grade = bench.rise - 0.035 * (depth - bench.depth) + 0.006 * (side - bench.side);
  return nearMask * outerMask * THREE.MathUtils.lerp(native, grade, graded);
}

function createRegolithTexture() {
  const size = 128;
  const texels = new Uint8Array(size * size * 4);
  let seed = 827427;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      const coarse = detail(x * 0.075, y * 0.075) * 18;
      const shade = Math.round(204 + coarse + (seed / 4294967296 - 0.5) * 44);
      const p = (y * size + x) * 4;
      texels[p] = texels[p + 1] = texels[p + 2] = shade;
      texels[p + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(texels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function sampleDistantSunlight(positions, rings, segments, radius, groundY, sunDirection) {
  const visibility = new Float32Array(positions.length / 3).fill(1);
  const horizontal = Math.hypot(sunDirection.x, sunDirection.z);
  if (horizontal < 0.001 || sunDirection.y <= 0) return visibility;
  const vx = sunDirection.x / horizontal;
  const vz = sunDirection.z / horizontal;
  const slope = sunDirection.y / horizontal;
  const steps = [0.57, 1.27, 2.13, 3.29, 4.84, 6.85, 9.72, 13.76, 19.35, 27.0, 37.0, 50.0];

  function yAt(x, z) {
    const radial = Math.hypot(x, z) / radius;
    if (radial <= 1 || radial >= 8) return groundY;
    let angular = Math.atan2(z, x) * segments / (2 * Math.PI);
    if (angular < 0) angular += segments;
    const row = ((radial - 1) / 7) ** (1 / 1.56) * rings;
    const i = Math.min(rings - 1, Math.floor(row)), j = Math.floor(angular);
    const column = j % segments, next = (j + 1) % segments;
    const ax = angular - j;
    const a = THREE.MathUtils.lerp(positions[(i * segments + column) * 3 + 1], positions[(i * segments + next) * 3 + 1], ax);
    const b = THREE.MathUtils.lerp(positions[((i + 1) * segments + column) * 3 + 1], positions[((i + 1) * segments + next) * 3 + 1], ax);
    return THREE.MathUtils.lerp(a, b, row - i);
  }

  // Carry the distant shadow separately from the surface pigment so local
  // indirect light remains when the solar disc is below a neighbouring crest.
  for (let index = segments; index < positions.length / 3; index++) {
    const offset = index * 3;
    const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
    const radial = Math.hypot(x, z) / radius;
    const beyondPlayable = THREE.MathUtils.smoothstep(radial, 1.08, 1.58);
    if (beyondPlayable < 0.001) continue;
    let blocker = 0;
    for (const distance of steps) {
      const clearance = yAt(x + vx * distance, z + vz * distance) - y - slope * distance;
      blocker = Math.max(blocker, clearance / (0.51 + 0.027 * distance));
      if (blocker >= 1) break;
    }
    const occlusion = THREE.MathUtils.smoothstep(blocker, 0.09, 0.82) * beyondPlayable;
    visibility[index] = 1 - occlusion;
  }
  return visibility;
}

function applyDistantShadow(material) {
  const previousCompile = material.onBeforeCompile;
  const programKey = material.customProgramCacheKey();
  material.onBeforeCompile = shader => {
    previousCompile.call(material, shader);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", /* glsl */ `
      #include <common>
      attribute float solarVisibility;
      varying float distantSunlight;
    `).replace("#include <begin_vertex>", /* glsl */ `
      #include <begin_vertex>
      distantSunlight = solarVisibility;
    `);
    const directLight = THREE.ShaderChunk.lights_fragment_begin.replace(
      "getDirectionalLightInfo( directionalLight, directLight );",
      /* glsl */ `getDirectionalLightInfo( directionalLight, directLight );
      #if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
        directLight.color *= distantSunlight;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", /* glsl */ `
      #include <common>
      varying float distantSunlight;
    `).replace("#include <lights_fragment_begin>", directLight);
  };
  material.customProgramCacheKey = () => `${programKey}/baked-direct-sun`;
  return material;
}

function createTerrain(radius, groundY, awayAngle, { surfaceTexture, surfaceNormal, surfaceRoughness, surfaceNormalScale, rimColor, sunDirection, bench }) {
  const rings = 96;
  const segments = 256;
  const vertices = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const rockColor = new THREE.Color();
  const dark = new THREE.Color("#323334");
  const grey = new THREE.Color("#7f7b76");
  const distant = new THREE.Color("#535457");
  const landslide = new THREE.Color("#817a70");
  const exposedRock = new THREE.Color("#474443");
  const scree = new THREE.Color("#8b8073");
  const anorthosite = new THREE.Color("#827e79");
  const gradedGround = new THREE.Color("#767067");
  const scarp = { rise: 0, rock: 0, scree: 0 };
  for (let radialIndex = 0; radialIndex <= rings; radialIndex++) {
    const radial = 1 + 7.0 * (radialIndex / rings) ** 1.56;
    for (let azimuthIndex = 0; azimuthIndex < segments; azimuthIndex++) {
      const theta = Math.PI * 2 * azimuthIndex / segments;
      const x = Math.cos(theta) * radial * radius;
      const z = Math.sin(theta) * radial * radius;
      const side = Math.sin(theta - awayAngle) * radial;
      const depth = Math.cos(theta - awayAngle) * radial;
      sampleScarps(side, depth, scarp);
      const graded = researchBenchMask(side, depth, bench);
      const rise = terrainHeight(radial, side, depth, scarp.rise, bench, graded);
      const y = rise * radius + groundY;
      vertices.push(x, y, z);
      if (surfaceTexture) uvs.push(x / 28 + 0.5, 0.5 - z / 28);
      else uvs.push(x * 0.31, z * 0.31);
      const grit = detail(x * 0.24, z * 0.24);
      const surfaceScars = Math.sin(y * 1.43 + 1.59 * grit + x * 0.12) * 0.032;
      const shade = THREE.MathUtils.clamp(0.39 + rise * 0.43 + grit * 0.095 + surfaceScars, 0.15, 0.83);
      rockColor.copy(dark).lerp(grey, shade).lerp(distant, Math.min(0.60, (radial - 1) * 0.13));
      const depositAxis = (side + 1.62 + (depth - 2.10) * 0.71) / 0.82;
      const depositBase = (depth - 2.10) / 1.34;
      const deposit = Math.max(0, 1 - Math.hypot(depositAxis, depositBase)) ** 1.7;
      const talus = THREE.MathUtils.smoothstep(talusField(side, depth), 0.011, 0.056);
      rockColor.lerp(landslide, Math.min(0.44, deposit * 0.28 + talus * 0.15));
      const fragments = Math.max(0, 0.62 + 0.74 * detail(9.7 * side, 8.9 * depth));
      const paleSeam = scarp.rock * THREE.MathUtils.smoothstep(detail(2.1 * side, 2.7 * depth), 0.12, 0.52);
      rockColor.lerp(exposedRock, Math.min(0.77, scarp.rock * 1.24 * fragments))
        .lerp(anorthosite, Math.min(0.43, paleSeam * 1.37 * fragments))
        .lerp(scree, Math.min(0.41, scarp.scree * 0.72 * fragments));
      rockColor.lerp(gradedGround, graded * 0.50);
      if (rimColor) rockColor.lerp(rimColor, 1 - THREE.MathUtils.smoothstep(radial, 1, 1.58));
      if (radial < 1.56) {
        const depositTint = peripheralTint(x, z) * THREE.MathUtils.smoothstep(radial, 1.0, 1.08);
        rockColor.multiplyScalar(1 + depositTint * 0.63);
      }
      colors.push(rockColor.r, rockColor.g, rockColor.b);
      if (radialIndex === rings) continue;
      const next = (azimuthIndex + 1) % segments;
      const a = radialIndex * segments + azimuthIndex;
      const b = radialIndex * segments + next;
      const c = (radialIndex + 1) * segments + azimuthIndex;
      const d = (radialIndex + 1) * segments + next;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("solarVisibility", new THREE.BufferAttribute(sampleDistantSunlight(vertices, rings, segments, radius, groundY, sunDirection), 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const regolith = surfaceTexture ?? createRegolithTexture();
  const terrain = new THREE.Mesh(geometry, applyDistantShadow(new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: regolith,
    bumpMap: surfaceNormal ? null : regolith,
    bumpScale: 0.028,
    normalMap: surfaceNormal ?? null,
    normalScale: surfaceNormalScale ?? new THREE.Vector2(1, 1),
    roughnessMap: surfaceRoughness ?? null,
    roughness: 1,
    metalness: 0,
  })));
  terrain.name = "lunar-ridges";
  terrain.userData.rings = rings;
  terrain.userData.segments = segments;
  terrain.receiveShadow = true;
  return terrain;
}

function sampleBackdrop(terrain, radius, x, z, pigment) {
  const { rings, segments } = terrain.userData;
  const positions = terrain.geometry.attributes.position;
  const colors = terrain.geometry.attributes.color;
  const light = terrain.geometry.attributes.solarVisibility;
  const sector = 2 * Math.PI / segments;
  const theta = Math.atan2(z, x);
  const column = Math.floor(theta / sector);
  const left = (column + segments) % segments;
  const right = (left + 1) % segments;
  const clampedAngle = theta - column * sector;
  const chord = Math.cos(sector * 0.5) / Math.cos(clampedAngle - sector * 0.5);
  const distance = Math.hypot(x, z) / (radius * chord);
  const row = THREE.MathUtils.clamp(
    Math.floor(((Math.max(1, distance) - 1) / 7) ** (1 / 1.56) * rings), 0, rings - 1,
  );
  const a = row * segments + left, b = row * segments + right;
  const c = a + segments, d = b + segments;
  function sampleTriangle(i, j, k, acceptBoundary) {
    const bx = positions.getX(j) - positions.getX(k), bz = positions.getZ(j) - positions.getZ(k);
    const ax = positions.getX(i) - positions.getX(k), az = positions.getZ(i) - positions.getZ(k);
    const px = x - positions.getX(k), pz = z - positions.getZ(k);
    const area = ax * bz - az * bx;
    const u = (px * bz - pz * bx) / area, v = (ax * pz - az * px) / area, w = 1 - u - v;
    if (!acceptBoundary && Math.min(u, v, w) < -0.001) return undefined;
    pigment.setRGB(
      colors.getX(i) * u + colors.getX(j) * v + colors.getX(k) * w,
      colors.getY(i) * u + colors.getY(j) * v + colors.getY(k) * w,
      colors.getZ(i) * u + colors.getZ(j) * v + colors.getZ(k) * w,
    );
    return {
      elevation: positions.getY(i) * u + positions.getY(j) * v + positions.getY(k) * w,
      sunlight: light.getX(i) * u + light.getX(j) * v + light.getX(k) * w,
    };
  }
  return sampleTriangle(a, b, c, false) ?? sampleTriangle(b, d, c, true);
}

function createRockField(radius, awayAngle, terrain) {
  let seed = 213715;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const groups = new THREE.Group();
  groups.name = "intermittent talus and broken blocks";
  const material = applyDistantShadow(new THREE.MeshStandardMaterial({ roughness: 0.94, vertexColors: true }));
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  const horizonX = Math.cos(awayAngle), horizonZ = Math.sin(awayAngle);
  const deposits = peripheralFragments(radius, radius * 1.56, radius / Math.SQRT2);
  for (const [batch, [variant, count]] of [[6289, 38], [15177, 36], [92031, 32]].entries()) {
    const localDeposits = deposits.filter(({ variant }) => variant % 3 === batch);
    const capacity = count + localDeposits.length;
    const geometry = fracturedStoneGeometry(2, variant);
    const sunlight = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    geometry.setAttribute("solarVisibility", sunlight);
    const rocks = new THREE.InstancedMesh(geometry, material, capacity);
    rocks.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const radial = 1.34 + random() ** 1.95 * 2.42;
      let x = Math.cos(theta) * radial * radius, z = Math.sin(theta) * radial * radius;
      const outcrop = i < count * 0.24;
      if (outcrop) {
        const scarp = scarps[(i + variant) % scarps.length];
        const strike = (random() - 0.5) * 1.53 * scarp.length;
        const plunge = -0.25 * scarp.width + (random() - 0.5) * 0.46 * scarp.width;
        const side = scarp.side + strike * scarp.cosine - plunge * scarp.sine;
        const depth = scarp.depth + strike * scarp.sine + plunge * scarp.cosine;
        x = (depth * horizonX - side * horizonZ) * radius;
        z = (depth * horizonZ + side * horizonX) * radius;
      } else if (i < count * 0.66) {
        const fan = talusFans[Math.floor(random() * talusFans.length)];
        const bearing = fan.angle + (random() - 0.5) * 3.9;
        const distance = (0.19 + random() ** 1.9) * 0.86;
        const side = fan.side + distance * Math.sin(bearing) * fan.width;
        const depth = fan.depth - 0.19 - distance * Math.cos(bearing) * fan.length;
        x = (depth * horizonX - side * horizonZ) * radius;
        z = (depth * horizonZ + side * horizonX) * radius;
      }
      const scale = (0.008 + random() ** 3.7 * (outcrop ? 0.037 : 0.045)) * radius;
      const floor = sampleBackdrop(terrain, radius, x, z, color);
      sunlight.setX(i, floor.sunlight);
      pose.position.set(x, floor.elevation + scale * (0.04 + random() * 0.11), z);
      pose.scale.set(
        scale * (0.89 + random() * 1.39),
        scale * (outcrop ? 0.32 + random() * 0.44 : 0.42 + random() * 0.64),
        scale * (0.72 + random() * 0.94),
      );
      pose.rotation.set((random() - 0.5) * 0.81, random() * Math.PI * 2, (random() - 0.5) * 0.85);
      pose.updateMatrix();
      rocks.setMatrixAt(i, pose.matrix);
      rocks.setColorAt(i, color.multiplyScalar(0.52 + 0.46 * random()));
    }
    for (const [index, part] of localDeposits.entries()) {
      const { x, z, scale, stretch, vertical, yaw, tilt, tint } = part;
      const floor = sampleBackdrop(terrain, radius, x, z, color);
      sunlight.setX(count + index, floor.sunlight);
      pose.position.set(x, floor.elevation - 0.11 * scale, z);
      pose.rotation.set(tilt, yaw, -0.75 * tilt);
      pose.scale.set(scale * stretch, scale * vertical, scale * 0.68);
      pose.updateMatrix();
      rocks.setMatrixAt(count + index, pose.matrix);
      rocks.setColorAt(count + index, color.multiplyScalar(0.56 + 0.39 * tint));
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.instanceColor.needsUpdate = true;
    groups.add(rocks);
  }
  return groups;
}

export function addLunarBackdrop(scene, {
  arenaRadius = 10, camera, groundY = -0.08, surfaceTexture, surfaceNormal, surfaceRoughness, surfaceNormalScale, rimColor,
  sunDirection = defaultSun,
} = {}) {
  if (!Number.isFinite(arenaRadius) || arenaRadius <= 0) {
    throw new RangeError("arenaRadius must be positive");
  }
  const awayAngle = camera && Math.hypot(camera.position.x, camera.position.z) > 0.1
    ? Math.atan2(-camera.position.z, -camera.position.x)
    : -Math.PI * 0.68;
  const backdrop = new THREE.Group();
  backdrop.name = "lunar-backdrop";
  const sun = sunDirection.clone().normalize();
  const siteScale = Math.min(1, 26.8 / arenaRadius);
  const bench = { side: 0.27 * siteScale, depth: 2.10 * siteScale, width: 0.71 * siteScale,
    length: 0.38 * siteScale, rise: 0.041 * siteScale };
  const terrain = createTerrain(arenaRadius, groundY - 0.006, awayAngle, {
    surfaceTexture, surfaceNormal, surfaceRoughness, surfaceNormalScale, rimColor, sunDirection: sun, bench,
  });
  const stationX = arenaRadius * (bench.depth * Math.cos(awayAngle) - bench.side * Math.sin(awayAngle));
  const stationZ = arenaRadius * (bench.depth * Math.sin(awayAngle) + bench.side * Math.cos(awayAngle));
  const pigment = new THREE.Color();
  const sampleGround = (x, z) => sampleBackdrop(terrain, arenaRadius, x, z, pigment).elevation;
  const outpostRadius = Math.min(arenaRadius, 32);
  const outlands = createLunarOutlands({
    x: stationX, z: stationZ, yaw: 0.41, sampleGround, sunlight: sun,
    applyDistantShadow,
    relaySites: [[outpostRadius * 1.41, -outpostRadius * 0.91, 0.7], [-outpostRadius * 1.22, outpostRadius * 0.94, 2.4]],
  });
  backdrop.add(createSky(sun), terrain, createRockField(arenaRadius, awayAngle, terrain), outlands);
  scene.add(backdrop);
  return backdrop;
}
