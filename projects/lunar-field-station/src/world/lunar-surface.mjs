import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

function randomSequence(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function hash(x, y, seed = 0) {
  let n = Math.imul(x ^ 0x758ca093, 0x27d4eb2d) ^ Math.imul(y ^ seed, 0x165667b1);
  n = Math.imul(n ^ n >>> 15, 0x85ebca6b);
  return ((n ^ n >>> 13) >>> 0) / 4294967296;
}

function periodicNoise(x, y, cells, salt) {
  const px = x * cells, py = y * cells;
  const i = Math.floor(px), j = Math.floor(py);
  const u = px - i, v = py - j;
  const sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
  const x0 = i & (cells - 1), x1 = (i + 1) & (cells - 1);
  const y0 = j & (cells - 1), y1 = (j + 1) & (cells - 1);
  const a = hash(x0, y0, salt), b = hash(x1, y0, salt);
  const c = hash(x0, y1, salt), d = hash(x1, y1, salt);
  const top = a + (b - a) * sx;
  return top + (c + (d - c) * sx - top) * sy;
}

const impactBowls = [
  { x: -4.4, z: 0.85, radius: 2.24, depth: 0.16, lip: 0.22, azimuth: 1.17, age: 0.72 },
  { x: 7.8, z: -7.45, radius: 1.92, depth: 0.15, lip: 0.20, azimuth: 2.28, age: 0.16 },
  { x: 2.85, z: 8.42, radius: 1.73, depth: 0.28, lip: 0.15, azimuth: 0.42, age: 0.48 },
  { x: -8.31, z: 5.85, radius: 2.15, depth: 0.24, lip: 0.21, azimuth: 4.1, age: 0.35 },
  { x: -7.60, z: -8.62, radius: 1.65, depth: 0.137, lip: 0.115, azimuth: 5.2, age: 0.83 },
  { x: 3.92, z: 2.57, radius: 0.95, depth: 0.105, lip: 0.10, azimuth: 2.21, age: 0.29 },
  { x: -7.4, z: -18.8, radius: 2.46, depth: 0.26, lip: 0.15, azimuth: 2.83, age: 0.55 },
  { x: -16.7, z: -15.8, radius: 2.91, depth: 0.30, lip: 0.20, azimuth: 5.12, age: 0.29 },
  { x: 20.1, z: 5.8, radius: 2.72, depth: 0.28, lip: 0.16, azimuth: 0.21, age: 0.67 },
  { x: 14.8, z: 17.5, radius: 2.81, depth: 0.30, lip: 0.18, azimuth: 1.86, age: 0.46 },
  { x: -24.1, z: 20.4, radius: 3.21, depth: 0.49, lip: 0.21, azimuth: 2.71, age: 0.24, terraced: true },
  { x: 23.8, z: 20.3, radius: 3.42, depth: 0.43, lip: 0.24, azimuth: 4.17, age: 0.42, terraced: true },
  { x: 25.1, z: 15.8, radius: 1.42, depth: 0.27, lip: 0.16, azimuth: 0.58, age: 0.31 },
];
const shallowPits = [
  [-3.37, 3.73, 0.48, 0.043], [4.78, 2.37, 0.40, 0.033],
  [3.25, 3.19, 0.34, 0.031], [-5.96, -1.90, 0.43, 0.047],
  [0.90, 5.84, 0.52, 0.036], [7.14, -5.74, 0.49, 0.052],
  [9.11, -7.14, 0.32, 0.031], [-7.43, 4.09, 0.54, 0.047],
];

// Orientale-like ring morphology at the map's compressed, driveable scale.
// The inner ring is clumpy, the outer ring broadly scarp-like, and both break
// into gentle access gaps. The two margins have different wear and infill.
const multiRingBasins = [
  { x: 19.8, z: -22.35, radius: 7.24, depth: 0.98, rim: 0.38, inner: 0.53, phase: 0.83, fill: 0.72 },
  { x: -22.75, z: -12.95, radius: 7.28, depth: 0.82, rim: 0.32, inner: 0.48, phase: 3.91, fill: 0.88 },
];

const protectedOuterPads = [
  [13.2, -14.0], [20.5, -14.7], [-13.6, 12.0], [-20.7, 11.4],
];

// Taper the ejecta towards the plain and keep large areas between the tongues
// open. Their world positions also span the edge of the playable ground mesh.
const peripheralDeposits = [
  { x: 26.1, z: -16.9, bearing: 0.63, width: 1.65, length: 7.9, light: 0.16, grains: 58 },
  { x: 29.8, z: -25.5, bearing: -0.46, width: 2.35, length: 9.9, light: 0.13, grains: 66 },
  { x: 18.7, z: -33.3, bearing: -1.44, width: 2.10, length: 7.1, light: 0.10, grains: 46 },
  { x: 4.9, z: -32.6, bearing: -1.22, width: 2.75, length: 8.6, light: -0.07, grains: 43 },
  { x: -13.6, z: -29.8, bearing: -1.95, width: 2.65, length: 9.0, light: 0.12, grains: 55 },
  { x: -23.2, z: -30.6, bearing: -2.07, width: 2.20, length: 8.4, light: 0.11, grains: 51 },
  { x: -31.0, z: -19.0, bearing: -2.61, width: 2.0, length: 8.1, light: 0.14, grains: 63 },
  { x: -31.8, z: 4.1, bearing: 2.91, width: 2.8, length: 6.1, light: -0.06, grains: 42 },
  { x: -28.0, z: 24.4, bearing: 2.36, width: 1.8, length: 8.8, light: 0.13, grains: 54 },
  { x: -14.7, z: 27.2, bearing: 1.87, width: 2.4, length: 9.2, light: 0.095, grains: 46 },
  { x: 0.1, z: 33.1, bearing: 1.65, width: 2.7, length: 7.5, light: -0.06, grains: 38 },
  { x: 19.8, z: 27.5, bearing: 1.82, width: 1.8, length: 9.1, light: 0.11, grains: 61 },
  { x: 29.0, z: 21.5, bearing: 0.39, width: 2.2, length: 6.6, light: 0.15, grains: 53 },
].map(deposit => ({ ...deposit, cosine: Math.cos(deposit.bearing), sine: Math.sin(deposit.bearing) }));

export function peripheralTint(x, z) {
  if (Math.abs(x) < 16.0 && Math.abs(z) < 19.0) return 0;
  let tint = 0;
  for (const deposit of peripheralDeposits) {
    const dx = x - deposit.x, dz = z - deposit.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) > deposit.length + deposit.width) continue;
    const along = (dx * deposit.cosine + dz * deposit.sine) / deposit.length;
    if (Math.abs(along) >= 1) continue;
    const across = (dz * deposit.cosine - dx * deposit.sine)
      / (deposit.width * (1 + along * 0.36)) + 0.10 * Math.sin(along * 4.5 + deposit.bearing);
    const profile = Math.hypot(along, across);
    const lobe = 1 - THREE.MathUtils.smoothstep(profile, 0.16, 1);
    const tracing = 0.57 + 0.22 * Math.cos(across * 6.8 + along * 7.1)
      + 0.21 * Math.sin(across * 11.0 - along * 10.3 + deposit.bearing);
    tint += deposit.light * lobe * tracing;
  }
  return tint;
}

export function peripheralFragments(minRadius, maxRadius, playableLimit) {
  if (maxRadius < 25.5) return [];
  const random = randomSequence(393607);
  const fragments = [];
  for (const deposit of peripheralDeposits) {
    for (let i = 0; i < deposit.grains; i++) {
      const along = (random() + random() - 1) * 0.98;
      const across = (random() + random() - 1) * deposit.width * (1 + along * 0.36);
      const alongMeters = along * deposit.length;
      const x = deposit.x + alongMeters * deposit.cosine - across * deposit.sine;
      const z = deposit.z + across * deposit.cosine + alongMeters * deposit.sine;
      const reliefLimit = Math.max(Math.abs(x), Math.abs(z)) <= playableLimit + 1.48;
      const coarseness = (1 - Math.abs(along) * 0.60) * random() ** 3.3;
      const scale = reliefLimit ? 0.019 + coarseness * 0.060 : 0.065 + coarseness * 0.52;
      const stretch = 0.86 + random() * 0.79;
      const vertical = reliefLimit ? 0.25 + random() * 0.14 : 0.37 + random() * 0.29;
      const yaw = -deposit.bearing + (random() - 0.5) * 2.6;
      const tilt = (random() - 0.5) * (reliefLimit ? 0.18 : 0.73);
      const tint = 0.18 + random() * 0.60 + 0.65 * deposit.light;
      const variant = Math.min(4, Math.floor(random() * 5));
      const radial = Math.hypot(x, z);
      if (radial < minRadius || radial >= maxRadius) continue;
      fragments.push({ x, z, scale, stretch, vertical, yaw, tilt, tint, variant });
    }
  }
  return fragments;
}

function basinProtection(x, z) {
  let blend = THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), 14.7, 17.6);
  for (const [px, pz] of protectedOuterPads) {
    if (Math.abs(x - px) < 3.85 && Math.abs(z - pz) < 3.85) {
      blend *= THREE.MathUtils.smoothstep(Math.hypot(x - px, z - pz), 2.25, 3.85);
    }
  }
  return blend;
}

function rampBand(radius, inner, crest, outer) {
  return THREE.MathUtils.smoothstep(radius, inner, crest)
    * (1 - THREE.MathUtils.smoothstep(radius, crest, outer));
}

function basinProfile(x, z, pigmentation) {
  let result = 0;
  for (const basin of multiRingBasins) {
    const dx = (x - basin.x) / basin.radius, dz = (z - basin.z) / basin.radius;
    if (Math.abs(dx) > 1.45 || Math.abs(dz) > 1.45) continue;
    const angle = Math.atan2(dz, dx) - basin.phase;
    const radius = Math.hypot(dx + 0.09 * dz, dz * 0.90)
      * (1 + 0.031 * Math.sin(5 * angle) + 0.026 * Math.cos(3 * angle));
    if (radius > 1.37) continue;
    const broken = THREE.MathUtils.smoothstep(0.56 * Math.sin(8 * angle) + 0.36 * Math.cos(13 * angle), -0.35, 0.59);
    const gap = THREE.MathUtils.smoothstep(Math.cos(angle + 0.38), 0.74, 0.985);
    const slump = 0.52 + 0.29 * Math.sin(2 * angle - 0.63) + 0.18 * Math.cos(5 * angle + 0.41);
    const innerRadius = basin.inner + 0.033 * Math.sin(4 * angle + 0.6);
    const inner = rampBand(radius, innerRadius - 0.15, innerRadius, innerRadius + 0.105);
    const middle = rampBand(radius, 0.62, 0.748 + 0.045 * Math.cos(4 * angle), 0.87);
    const scarp = rampBand(radius, 0.83 - 0.064 * slump, 1.0 + 0.019 * Math.sin(6 * angle), 1.33);
    const floor = 1 - THREE.MathUtils.smoothstep(radius, 0.23 + 0.14 * basin.fill, 0.995);
    const ringPeaks = inner * (0.30 + 0.70 * broken) * (1 - 0.89 * gap);
    if (pigmentation) {
      const rays = rampBand(radius, 0.91, 1.09, 1.36) * (0.42 + 0.38 * Math.cos(11 * angle + radius * 5));
      result += -0.12 * floor + 0.16 * ringPeaks + 0.11 * middle * slump + 0.14 * scarp + 0.071 * rays;
    } else {
      result += -basin.depth * floor + 0.57 * ringPeaks
        + 0.24 * middle * (0.51 + 0.49 * slump) * (1 - 0.66 * gap)
        + basin.rim * scarp * (0.65 + 0.35 * slump) * (1 - 0.72 * gap);
    }
  }
  return result === 0 ? 0 : result * basinProtection(x, z);
}

function rimContour(dx, dz, angle) {
  return Math.hypot(dx * 0.93 + dz * 0.10, dz)
    * (1 + 0.043 * Math.sin(angle * 3) + 0.034 * Math.cos(angle * 7));
}

export function regolithHeight(x, z) {
  let elevation = 0;
  for (const impact of impactBowls) {
    const dx = (x - impact.x) / impact.radius;
    const dz = (z - impact.z) / impact.radius;
    if (Math.abs(dx) > 1.64 || Math.abs(dz) > 1.64) continue;
    const angle = Math.atan2(dz, dx) - impact.azimuth;
    const distance = rimContour(dx, dz, angle);
    if (distance > 1.40) continue;
    const slump = THREE.MathUtils.smoothstep(Math.cos(angle + 0.31), 0.12, 0.83);
    const bowl = 1 - THREE.MathUtils.smoothstep(distance, 0.21 + 0.15 * slump, 0.95);
    const wall = THREE.MathUtils.smoothstep(distance, 0.68, 0.94)
      * (1 - THREE.MathUtils.smoothstep(distance, 0.94, 1.32 + impact.age * 0.05));
    const breaks = 0.70 + 0.17 * Math.sin(angle * 3 - 0.44)
      + 0.09 * Math.cos(angle * 8 + 0.11);
    const shattered = breaks * (1 - (0.76 + 0.18 * impact.age) * slump);
    const infill = THREE.MathUtils.smoothstep(distance, 0.29, 0.59)
      * (1 - THREE.MathUtils.smoothstep(distance, 0.62, 0.94));
    elevation += wall * impact.lip * shattered + slump * infill * impact.depth * 0.14
      - impact.depth * bowl;
    if (impact.terraced) {
      const bench = rampBand(distance, 0.46, 0.63 + 0.041 * Math.cos(angle * 5), 0.79);
      const remnant = 1 - THREE.MathUtils.smoothstep(Math.hypot(dx - 0.09, dz + 0.12), 0.03, 0.26);
      elevation += bench * (0.037 + 0.102 * slump) + 0.12 * remnant;
    }
  }
  for (const [cx, cz, radius, depth] of shallowPits) {
    const dx = (x - cx) / radius, dz = (z - cz) / radius;
    if (Math.abs(dx) >= 1.18 || Math.abs(dz) >= 1.18) continue;
    const d = Math.hypot(dx, dz * 1.06);
    const floor = 1 - THREE.MathUtils.smoothstep(d, 0.19, 0.89);
    const shoulder = Math.max(0, 1 - 4.2 * Math.abs(d - 0.89));
    elevation += depth * (shoulder * Math.max(0, 0.28 + dx * 0.13) - floor);
  }
  return elevation + 0.068 * clusterPatch(x, z, 0.19) + basinProfile(x, z, false);
}

export function regolithTint(x, z) {
  let tint = 0;
  for (const { x: centerX, z: centerZ, radius, azimuth, age } of impactBowls) {
    const dx = (x - centerX) / radius;
    const dz = (z - centerZ) / radius;
    if (Math.abs(dx) > 2.31 || Math.abs(dz) > 2.31) continue;
    const angle = Math.atan2(dz, dx) - azimuth;
    const distance = rimContour(dx, dz, angle);
    const floor = 1 - THREE.MathUtils.smoothstep(distance, 0.51, 0.92);
    const ejecta = THREE.MathUtils.smoothstep(distance, 0.71, 1.03)
      * (1 - THREE.MathUtils.smoothstep(distance, 1.19, 2.16));
    const fan = 0.40 + 0.23 * Math.cos(angle + 2.5) + 0.15 * Math.cos(5 * angle);
    const leadingRay = THREE.MathUtils.smoothstep(Math.cos(angle - 0.06 * distance), 0.58, 0.96);
    const crossRay = THREE.MathUtils.smoothstep(Math.cos(angle + 1.76 + 0.10 * distance), 0.78, 0.98);
    const taper = (1 - THREE.MathUtils.smoothstep(distance, 1.26, 2.09))
      * THREE.MathUtils.smoothstep(distance, 0.88, 1.14);
    const ragged = 0.68 + 0.19 * Math.cos(11 * angle + 2.9 * distance)
      + 0.11 * Math.sin(17 * angle - 4.9 * distance);
    const rays = (0.29 * leadingRay + 0.18 * crossRay) * taper * ragged;
    tint += -0.15 * floor + (1 - 0.74 * age) * (0.22 * ejecta * fan + rays);
  }
  return tint + 0.080 * clusterPatch(x, z, 0.36) + basinProfile(x, z, true) + peripheralTint(x, z);
}

function createTexture(data, size, renderer, color = false) {
  const texture = new THREE.DataTexture(new Uint8Array(data.buffer), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createLunarSurface(renderer) {
  const size = 1024;
  const grits = new Float32Array(size * size);
  const stoneDye = new Float32Array(size * size);
  const relief = new Float32Array(size * size);
  const random = randomSequence(12210673);
  const modulo = size - 1;

  for (let i = 0; i < 14600; i++) {
    const px = random() * size, py = random() * size;
    const gritBed = periodicNoise(px / size, py / size, 16, 71);
    if (random() > 0.41 + gritBed * 0.60) continue;
    const radius = 0.52 + Math.pow(random(), 6.8) * 10.2;
    const stretch = 0.45 + random() * 0.60;
    const angle = random() * Math.PI * 2;
    const rotationX = Math.cos(angle), rotationY = Math.sin(angle);
    const gritHeight = (0.15 + random() * 0.12) * Math.sqrt(radius);
    const dye = random() < 0.16 ? 9 + random() * 15 : -8 - random() * 24;
    const extent = Math.ceil(radius * 1.25 + 1);
    for (let y = Math.floor(py) - extent; y <= py + extent; y++) {
      for (let x = Math.floor(px) - extent; x <= px + extent; x++) {
        const dx = (x - px) / radius, dy = (y - py) / radius;
        const u = dx * rotationX + dy * rotationY;
        const v = (dy * rotationX - dx * rotationY) / stretch;
        const edge = Math.max(Math.abs(0.85 * u + 0.45 * v), Math.abs(0.22 * u - 0.97 * v), Math.abs(u * 0.88 - v * 0.57));
        if (edge >= 1) continue;
        const index = (y & modulo) * size + (x & modulo);
        const crown = Math.sqrt(1 - edge) * gritHeight;
        if (crown < grits[index]) continue;
        grits[index] = crown;
        stoneDye[index] = dye * Math.min(1, (1 - edge) * radius * 1.6);
      }
    }
  }

  const colorPixels = new Uint8ClampedArray(size * size * 4);
  const roughPixels = new Uint8ClampedArray(size * size * 4);
  const normalPixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const broad = periodicNoise(u, v, 4, 33);
      const lobes = periodicNoise(u + 0.10 * broad, v - 0.08 * broad, 16, 213);
      const sand = periodicNoise(u, v, 64, 139);
      const grains = periodicNoise(u, v, 256, 831);
      const micrograin = hash(x, y, 599) - 0.5;
      const mineral = periodicNoise(u + 0.09 * sand, v - 0.06 * sand, 32, 405);
      const packing = THREE.MathUtils.smoothstep(lobes, 0.23, 0.74);
      const dust = THREE.MathUtils.smoothstep(mineral + 0.11 * broad, 0.34, 0.82);
      const clast = THREE.MathUtils.smoothstep(grits[i], 0.05, 0.24);
      const glass = THREE.MathUtils.smoothstep(-stoneDye[i], 9, 27) * clast;
      const feldspar = THREE.MathUtils.smoothstep(stoneDye[i], 3, 20) * clast;
      relief[i] = broad * 0.51 + lobes * 0.40 + sand * (0.19 + 0.17 * packing)
        + grains * (0.10 + 0.10 * packing) + micrograin * 0.064 + grits[i];
      const shade = 198 + (broad - 0.5) * 24 + (lobes - 0.5) * 18
        + (sand - 0.5) * 15 + (grains - 0.5) * 12 + micrograin * 13 + stoneDye[i]
        + 10 * (dust - 0.5) * (1 - 0.74 * clast);
      const warmth = 8.4 * (dust - 0.32) + 3.0 * glass - 2.0 * feldspar;
      const roughness = 243 + dust * 8 - clast * 21 - glass * 44 + (hash(x, y, 15) - 0.5) * 12;
      const p = i * 4;
      colorPixels[p] = shade + warmth;
      colorPixels[p + 1] = shade + 0.12 * warmth;
      colorPixels[p + 2] = shade - 0.80 * warmth + feldspar * 3;
      colorPixels[p + 3] = 255;
      roughPixels[p] = roughPixels[p + 1] = roughPixels[p + 2] = roughness;
      roughPixels[p + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    const prevRow = ((y - 1) & modulo) * size, nextRow = ((y + 1) & modulo) * size;
    const priorCrest = ((y - 3) & modulo) * size, followingCrest = ((y + 3) & modulo) * size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, p = i * 4;
      const dx = (relief[y * size + ((x - 1) & modulo)] - relief[y * size + ((x + 1) & modulo)]) * 1.60
        + (relief[y * size + ((x - 3) & modulo)] - relief[y * size + ((x + 3) & modulo)]) * 0.28;
      const dy = (relief[prevRow + x] - relief[nextRow + x]) * 1.60
        + (relief[priorCrest + x] - relief[followingCrest + x]) * 0.28;
      const inverse = 1 / Math.hypot(dx, dy, 1);
      normalPixels[p] = (0.5 + dx * inverse * 0.5) * 255;
      normalPixels[p + 1] = (0.5 + dy * inverse * 0.5) * 255;
      normalPixels[p + 2] = (0.5 + inverse * 0.5) * 255;
      normalPixels[p + 3] = 255;
    }
  }

  const map = createTexture(colorPixels, size, renderer, true);
  const normalMap = createTexture(normalPixels, size, renderer);
  const roughnessMap = createTexture(roughPixels, size, renderer);
  const normalScale = new THREE.Vector2(0.96, 0.96);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, map, normalMap, normalScale, roughnessMap, roughness: 1, metalness: 0,
  });
  return { map, normalMap, roughnessMap, normalScale, material };
}

const blockPlanes = [
  [1, -0.30, 0.10, 0.82], [-1, -0.15, -0.18, 0.91],
  [0.12, 1, 0.24, 0.88], [0.02, -1, 0.06, 0.59],
  [0.25, 0.13, 1, 0.82], [-0.27, 0.18, -1, 0.88],
  [0.62, 0.71, -0.38, 0.97], [-0.61, 0.34, 0.79, 0.91],
  [-0.79, 0.55, -0.44, 0.96], [0.62, -0.59, 0.69, 0.88],
  [0.42, 0.51, 0.84, 0.94], [-0.63, -0.53, -0.56, 0.92],
];

export function fracturedStoneGeometry(detail, seed, { split = 0, tint = 0xffffff } = {}) {
  const random = randomSequence(seed);
  const source = new THREE.IcosahedronGeometry(1, detail);
  source.deleteAttribute("uv");
  source.deleteAttribute("normal");
  const geometry = mergeVertices(source);
  source.dispose();

  const strength = detail >= 4 ? 0.13 : 0.11;
  const coat = new THREE.Color(tint);
  const inclusion = new THREE.Color();
  const positions = geometry.attributes.position;
  const colors = [];
  const surfaceZones = [];
  const fault = new THREE.Vector3(0.91, -0.37, 0.29).normalize();
  const seamOffset = 0.157;
  const center = fault.clone().multiplyScalar(split ? split * 0.37 + seamOffset : 0);
  const planes = blockPlanes.map(([x, y, z, distance]) => ({
    normal: new THREE.Vector3(x + (random() - 0.5) * 0.31, y, z + (random() - 0.5) * 0.30).normalize(),
    distance: distance + (random() - 0.5) * 0.20,
    fault: false,
  }));
  if (split) {
    planes.push({ normal: fault.clone().multiplyScalar(-split), distance: -0.043 - split * seamOffset, fault: true });
    planes.push({ normal: new THREE.Vector3(-0.53, 0.53, 0.65).normalize(), distance: 0.85, fault: false });
  }
  const phase = random() * Math.PI * 2;

  const ray = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < positions.count; vertex++) {
    ray.fromBufferAttribute(positions, vertex);
    let extent = Infinity;
    let face = planes[0];
    for (const plane of planes) {
      const direction = plane.normal.dot(ray);
      if (direction <= 0.001) continue;
      const at = (plane.distance - plane.normal.dot(center)) / direction;
      if (at >= extent) continue;
      extent = at;
      face = plane;
    }
    point.copy(center).addScaledVector(ray, extent);
    const { x, y, z } = point;
    const seam = 0.50 * Math.sin(x * 11.0 - y * 14.3 + z * 6.4 + phase)
      + 0.30 * Math.sin(x * 19.4 + y * 11.2 - z * 18.4);
    const pitting = Math.sin(x * 42.1 + z * 33.2) * Math.cos(y * 34.9 - z * 37.6 + phase);
    const spalls = Math.max(0, Math.sin(x * 8.1 + y * 10.5 + z * 6.7 + phase) * Math.cos(z * 5.2 - x * 7.2) - 0.44);
    const chipped = Math.max(seam - 0.16, 0) * 0.60 + 0.58 * spalls;
    let recess = 0;
    if (detail >= 4 && !face.fault) {
      const cavityX = split < 0 ? -0.45 : split > 0 ? 0.49 : -0.11;
      const width = split < 0 ? 0.38 : 0.21;
      const qx = (x - cavityX + 0.13 * y) / width;
      const qy = (y + (split < 0 ? 0.11 : 0.19) - 0.15 * x) / 0.24;
      const cavity = Math.max(0, 1 - Math.hypot(qx, qy));
      recess = Math.max(0, face.normal.z) ** 2 * cavity ** 1.12
        * (split < 0 ? 0.30 : 0.19);
      const scarDistance = Math.abs(x + y * 0.45 + z * 0.18 + 0.052 * seam - cavityX - 0.24);
      const hairline = 1 - THREE.MathUtils.smoothstep(scarDistance, 0.015, 0.065);
      const end = 1 - THREE.MathUtils.smoothstep(Math.abs(y + 0.06), 0.22, 0.45);
      recess += 0.036 * hairline * end;
    }
    const surface = seam * 0.39 + pitting * 0.12 - chipped;
    point.addScaledVector(face.normal, surface * strength * (face.fault ? 0.28 : 1.0) - recess);
    positions.setXYZ(vertex, point.x, point.y, point.z);

    const paleClast = Math.max(0, (Math.abs(seam + 0.18 * pitting) - 0.42) * 0.7);
    const fines = 1 - THREE.MathUtils.smoothstep(y + 0.071 * seam, -0.49, -0.14);
    const value = (face.fault ? 0.86 : 0.91) + paleClast * 0.52 + pitting * 0.048;
    inclusion.copy(coat).multiplyScalar(value);
    colors.push(inclusion.r, inclusion.g, inclusion.b);
    surfaceZones.push(fines, Number(face.fault), Math.min(1, recess * 4.8));
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("rockSurface", new THREE.Float32BufferAttribute(surfaceZones, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const blockClusters = [
  {
    x: -2.8, z: -12.16, yaw: 0.23,
    blocks: [
      [-0.08, 0, 1.58, 0.96, 1.08, 0, 0x635f5d, 10723, -1],
      [0.13, 0.17, 1.47, 0.79, 1.01, -0.07, 0x6a6562, 10723, 1],
      [-1.63, 0.37, 0.51, 0.26, 0.33, 0.61, 0x706c66, 47191],
      [1.48, 0.28, 0.36, 0.21, 0.46, -0.27, 0x6c6861, 9217],
      [0.58, 1.00, 0.31, 0.143, 0.22, 0.80, 0x706c67, 7261],
    ],
  },
  {
    x: 12.03, z: -3.69, yaw: 0.80,
    blocks: [
      [0, 0, 1.23, 0.62, 0.78, -0.19, 0x625f59, 55287],
      [1.39, 0.18, 0.62, 0.38, 0.49, 0.46, 0x7e7a72, 2617],
      [-0.86, -0.15, 0.39, 0.25, 0.32, -0.13, 0x878078, 8287],
    ],
  },
  {
    x: -12.20, z: 3.14, yaw: -1.01,
    blocks: [
      [0, 0, 0.81, 0.63, 0.74, -0.37, 0x6b655e, 40963],
      [0.94, 0.29, 0.52, 0.33, 0.41, 0.61, 0x88847b, 34733],
      [-1.03, -0.27, 0.43, 0.27, 0.33, 0.18, 0x7a756e, 15373],
    ],
  },
  {
    x: 3.06, z: 12.02, yaw: -0.32,
    blocks: [
      [0, 0, 1.01, 0.69, 0.81, -0.22, 0x625e56, 64823],
      [0.96, 0.40, 0.55, 0.32, 0.43, 0.71, 0x857e72, 4337],
      [1.58, 0.14, 0.31, 0.22, 0.28, -0.19, 0x69645d, 12253],
    ],
  },
  {
    x: 16.6, z: -12.0, yaw: -0.51, groundRelief: false,
    blocks: [[0, 0, 0.69, 0.095, 0.53, 0, 0x8a8072, 60209]],
  },
  {
    x: 17.36, z: -23.87, yaw: 1.02,
    blocks: [
      [0.0, 0.0, 0.84, 0.46, 0.54, -0.13, 0x716958, 61471],
      [-0.77, -0.68, 0.5, 0.22, 0.41, 0.47, 0x696662, 15289],
      [0.64, 0.72, 0.46, 0.18, 0.30, -0.27, 0x77716b, 59009],
    ],
  },
  {
    x: -23.87, z: -17.55, yaw: -0.915,
    blocks: [
      [0, 0.03, 0.81, 0.49, 0.65, 0.14, 0x7c7065, 57259],
      [1.52, 0.42, 0.53, 0.30, 0.51, 0.07, 0x706e66, 17783],
      [-0.58, 0.79, 0.32, 0.145, 0.31, -0.24, 0x827e73, 95071],
    ],
  },
];

function clusterPatch(x, z, offset = 0) {
  let patch = 0;
  for (const cluster of blockClusters) {
    if (cluster.groundRelief === false) continue;
    const dx = x - cluster.x, dz = z - cluster.z;
    if (Math.abs(dx) > 3.5 || Math.abs(dz) > 2.9) continue;
    const cosine = Math.cos(cluster.yaw), sine = Math.sin(cluster.yaw);
    const along = dx * cosine - dz * sine;
    const across = dx * sine + dz * cosine + offset;
    patch += Math.exp(-(along * along * 0.34 + across * across * 1.8))
      * (0.80 + 0.20 * Math.cos(along * 5.3 + across * 6.8));
  }
  return patch;
}

function createBrecciaMaterial() {
  const size = 512;
  const span = size - 1;
  const pits = new Float32Array(size * size);
  const clasts = new Float32Array(size * size);
  const random = randomSequence(201176);
  for (let pit = 0; pit < 1500; pit++) {
    const x = random() * size, y = random() * size;
    const radius = 1.4 + 17.3 * random() ** 3.6;
    const direction = random() * Math.PI * 2;
    const cosine = Math.cos(direction), sine = Math.sin(direction);
    const edge = Math.ceil(radius * 1.3);
    for (let sy = Math.floor(y) - edge; sy <= y + edge; sy++) {
      for (let sx = Math.floor(x) - edge; sx <= x + edge; sx++) {
        const dx = (sx - x) / radius, dy = (sy - y) / radius;
        const u = dx * cosine - dy * sine, v = dx * sine + dy * cosine;
        const distance = Math.max(Math.abs(u) + Math.abs(v) * 0.32, Math.abs(v) * 1.25 + Math.abs(u) * 0.30);
        const bowl = (1 - THREE.MathUtils.smoothstep(distance, 0.28, 0.81)) * -0.24;
        const rim = Math.max(0, 1 - 4.5 * Math.abs(distance - 0.83)) * 0.105;
        pits[(sy & span) * size + (sx & span)] += bowl + rim;
      }
    }
  }
  for (let fragment = 0; fragment < 1700; fragment++) {
    const x = random() * size, y = random() * size;
    const radius = 1.4 + 19.3 * random() ** 3.8;
    const angle = random() * Math.PI * 2;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const tint = random() > 0.35 ? 0.10 + random() * 0.29 : -0.15 - random() * 0.17;
    const extent = Math.ceil(radius * 1.15);
    for (let sy = Math.floor(y) - extent; sy <= y + extent; sy++) {
      for (let sx = Math.floor(x) - extent; sx <= x + extent; sx++) {
        const dx = (sx - x) / radius, dy = (sy - y) / radius;
        const u = dx * cosine - dy * sine, v = dx * sine + dy * cosine;
        const distance = Math.max(Math.abs(u + v * 0.34), Math.abs(v - u * 0.13) * 1.56, Math.abs(u * 0.80 - v * 0.51));
        if (distance >= 1) continue;
        const weight = 1 - THREE.MathUtils.smoothstep(distance, 0.72, 1.0);
        const index = (sy & span) * size + (sx & span);
        clasts[index] = THREE.MathUtils.lerp(clasts[index], tint, weight);
      }
    }
  }

  const pixels = new Uint8Array(size * size * 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const broad = periodicNoise(u, v, 8, 75);
      const mottled = periodicNoise(u, v, 32, 579);
      const fine = periodicNoise(u, v, 128, 619);
      const index = y * size + x;
      const relief = 0.29 + broad * 0.15 + mottled * 0.24 + fine * 0.065 + pits[index]
        + clasts[index] * 0.17;
      const mineral = 0.44 + (broad - 0.5) * 0.16 + (mottled - 0.5) * 0.14 + clasts[index];
      pixels[index * 2] = Math.round(255 * THREE.MathUtils.clamp(relief, 0.02, 0.96));
      pixels[index * 2 + 1] = Math.round(255 * THREE.MathUtils.clamp(mineral, 0.04, 0.95));
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.uniforms.brecciaTile = { value: texture };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", /* glsl */ `
      #include <common>
      attribute vec3 rockSurface;
      varying vec3 brecciaPosition;
      varying vec3 brecciaAxis;
      varying vec3 brecciaZone;
    `).replace("#include <begin_vertex>", /* glsl */ `
      #include <begin_vertex>
      brecciaPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      brecciaAxis = (vec4(transformedNormal, 0.0) * viewMatrix).xyz;
      brecciaZone = rockSurface;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", /* glsl */ `
      #include <common>
      uniform sampler2D brecciaTile;
      varying vec3 brecciaPosition;
      varying vec3 brecciaAxis;
      varying vec3 brecciaZone;

      vec2 brecciaDetail(vec3 point) {
        vec3 face = max(vec3(0.00001), abs(brecciaAxis));
        vec3 weights = pow(normalize(face), vec3(3.0));
        weights /= dot(weights, vec3(1.0));
        vec3 samplePoint = point * vec3(1.03, 0.98, 1.14);
        return texture2D(brecciaTile, samplePoint.zy).rg * weights.x
          + texture2D(brecciaTile, samplePoint.xz + 0.21).rg * weights.y
          + texture2D(brecciaTile, samplePoint.xy + 0.67).rg * weights.z;
      }
    `).replace("#include <color_fragment>", /* glsl */ `
      #include <color_fragment>
      vec2 surfaceSample = brecciaDetail(brecciaPosition);
      float pitting = surfaceSample.x;
      float freshFace = smoothstep(0.14, 0.84, brecciaZone.y);
      float recessOcclusion = smoothstep(0.16, 0.95, brecciaZone.z);
      float darkClast = (1.0 - smoothstep(0.24, 0.43, surfaceSample.y)) * freshFace;
      float paleClast = smoothstep(0.57, 0.78, surfaceSample.y) * freshFace;
      float dustFilm = brecciaZone.x * (0.36 + 0.22 * smoothstep(0.28, 0.61, surfaceSample.y))
        + 0.12 * smoothstep(0.48, 0.94, normalize(brecciaAxis).y) * surfaceSample.y;
      dustFilm *= 1.0 - 0.68 * freshFace;
      diffuseColor.rgb *= mix(0.77, 1.16, surfaceSample.y) * (1.0 - 0.31 * recessOcclusion);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.76, 0.72, 0.66), darkClast);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.170, 0.169, 0.159), 0.51 * paleClast);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.123, 0.113, 0.100), dustFilm);
    `).replace("#include <roughnessmap_fragment>", /* glsl */ `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor - freshFace * 0.06 - darkClast * 0.17, 0.99, dustFilm);
    `).replace("#include <normal_fragment_maps>", /* glsl */ `
      #include <normal_fragment_maps>
      vec3 rockDx = dFdx(-vViewPosition);
      vec3 rockDy = dFdy(-vViewPosition);
      vec3 tangentX = cross(rockDy, normal);
      vec3 tangentY = cross(normal, rockDx);
      float determinant = dot(rockDx, tangentX);
      vec3 pittingGradient = sign(determinant) * (dFdx(pitting) * tangentX + dFdy(pitting) * tangentY);
      float reliefStrength = mix(0.017 - freshFace * 0.007, 0.006, dustFilm);
      normal = normalize(max(0.000001, abs(determinant)) * normal - reliefStrength * pittingGradient);
    `);
  };
  return material;
}

const LOW_ROCK_GRID = 12;
const ROCK_BIN_WIDTH = 1.0;

function clipRockFootprint(vertices, indices, clearance) {
  const outline = vertices.filter(vertex => vertex.rise >= clearance);
  for (let i = 0; i < indices.length; i += 3) {
    const points = [vertices[indices[i]], vertices[indices[i + 1]], vertices[indices[i + 2]]];
    for (let side = 0; side < 3; side++) {
      const a = points[side], b = points[(side + 1) % 3];
      if ((a.rise < clearance) === (b.rise < clearance)) continue;
      const t = (clearance - a.rise) / (b.rise - a.rise);
      outline.push({
        x: THREE.MathUtils.lerp(a.x, b.x, t),
        z: THREE.MathUtils.lerp(a.z, b.z, t),
      });
    }
  }
  return outline;
}

function meshEllipse(points) {
  let meanX = 0, meanZ = 0, xx = 0, zz = 0, xz = 0;
  for (const { x, z } of points) {
    meanX += x;
    meanZ += z;
    xx += x * x;
    zz += z * z;
    xz += x * z;
  }
  meanX /= points.length;
  meanZ /= points.length;
  const varianceX = xx / points.length - meanX * meanX;
  const varianceZ = zz / points.length - meanZ * meanZ;
  const covariance = xz / points.length - meanX * meanZ;
  const angle = 0.5 * Math.atan2(2 * covariance, varianceX - varianceZ);
  const c = Math.cos(angle), s = Math.sin(angle);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { x, z } of points) {
    const u = c * (x - meanX) + s * (z - meanZ), v = -s * (x - meanX) + c * (z - meanZ);
    minX = Math.min(minX, u);
    maxX = Math.max(maxX, u);
    minZ = Math.min(minZ, v);
    maxZ = Math.max(maxZ, v);
  }
  const centerU = (minX + maxX) * 0.5, centerV = (minZ + maxZ) * 0.5;
  const x = meanX + c * centerU - s * centerV, z = meanZ + s * centerU + c * centerV;
  const halfX = Math.max(0.035, (maxX - minX) * 0.5), halfZ = Math.max(0.035, (maxZ - minZ) * 0.5);
  let coverage = 1;
  for (const point of points) {
    const dx = point.x - x, dz = point.z - z;
    coverage = Math.max(coverage, Math.hypot((c * dx + s * dz) / halfX, (-s * dx + c * dz) / halfZ));
  }
  const radiusX = halfX * coverage, radiusZ = halfZ * coverage;
  return { x, z, radiusX, radiusZ, radius: Math.max(radiusX, radiusZ), yaw: -angle };
}

function rasterRockSurface(vertices, indices, outline, height, top, rise) {
  const minX = Math.min(...outline.map(point => point.x));
  const maxX = Math.max(...outline.map(point => point.x));
  const minZ = Math.min(...outline.map(point => point.z));
  const maxZ = Math.max(...outline.map(point => point.z));
  if (Math.min(maxX - minX, maxZ - minZ) < 0.095) return null;
  // A small bleed allows tires to settle against angular mesh edges across
  // neighbouring samples without snapping up at a mathematically sharp edge.
  const margin = 0.085;
  const left = minX - margin, near = minZ - margin;
  const spanX = maxX - minX + 2 * margin, spanZ = maxZ - minZ + 2 * margin;
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]], b = vertices[indices[i + 1]], c = vertices[indices[i + 2]];
    if (Math.max(a.rise, b.rise, c.rise) < 0.012) continue;
    const bx = b.x - a.x, bz = b.z - a.z, cx = c.x - a.x, cz = c.z - a.z;
    const determinant = bx * cz - bz * cx;
    if (Math.abs(determinant) > 1e-10) triangles.push([a, b, c, bx, bz, cx, cz, 1 / determinant]);
  }
  const count = LOW_ROCK_GRID + 1;
  const samples = new Float32Array(count * count);
  for (let row = 1; row < LOW_ROCK_GRID; row++) {
    const z = near + spanZ * row / LOW_ROCK_GRID;
    for (let column = 1; column < LOW_ROCK_GRID; column++) {
      const x = left + spanX * column / LOW_ROCK_GRID;
      let roof = -Infinity;
      for (const [a, b, c, bx, bz, cx, cz, inverse] of triangles) {
        const dx = x - a.x, dz = z - a.z;
        const u = (dx * cz - dz * cx) * inverse, v = (bx * dz - bz * dx) * inverse;
        if (u >= 0 && v >= 0 && u + v <= 1) roof = Math.max(roof, a.y + u * (b.y - a.y) + v * (c.y - a.y));
      }
      if (Number.isFinite(roof)) samples[row * count + column] = Math.max(0, roof - height(x, z));
    }
  }
  return { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5, left, near, spanX, spanZ, top, rise, samples };
}

function createRockSupportIndex(height, playableLimit) {
  const tallRockFixtures = [];
  const lowRockSupports = [];
  const bins = new Map();
  const world = new THREE.Vector3();
  const key = (x, z) => x + z * 256;
  const cell = coordinate => Math.floor(coordinate / ROCK_BIN_WIDTH);
  function register(geometry, matrix) {
    const positions = geometry.attributes.position;
    const vertices = [];
    let peak = { rise: -Infinity };
    let top = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      world.fromBufferAttribute(positions, i);
      if (matrix) world.applyMatrix4(matrix);
      const { x, y, z } = world;
      top = Math.max(top, y);
      const vertex = { x, y, z, rise: y - height(x, z) };
      if (vertex.rise > peak.rise) peak = vertex;
      vertices.push(vertex);
    }
    if (Math.abs(peak.x) > playableLimit + 1.3 || Math.abs(peak.z) > playableLimit + 1.3 || peak.rise < 0.050) return;
    const indices = geometry.index.array;
    if (peak.rise >= 0.214) {
      const shape = meshEllipse(clipRockFootprint(vertices, indices, 0.115));
      tallRockFixtures.push({ ...shape, top, rise: peak.rise, kind: "rock" });
      return;
    }
    const outline = clipRockFootprint(vertices, indices, 0.014);
    const support = rasterRockSurface(vertices, indices, outline, height, top, peak.rise);
    if (!support) return;
    lowRockSupports.push(support);
    for (let iz = cell(support.near); iz <= cell(support.near + support.spanZ); iz++) {
      for (let ix = cell(support.left); ix <= cell(support.left + support.spanX); ix++) {
        const at = key(ix, iz);
        if (!bins.has(at)) bins.set(at, []);
        bins.get(at).push(support);
      }
    }
  }
  function sampleRockSupport(x, z) {
    const candidates = bins.get(key(cell(x), cell(z)));
    if (!candidates) return 0;
    const stride = LOW_ROCK_GRID + 1;
    let lift = 0;
    for (const { left, near, spanX, spanZ, samples } of candidates) {
      const u = (x - left) / spanX * LOW_ROCK_GRID, v = (z - near) / spanZ * LOW_ROCK_GRID;
      if (u <= 0 || v <= 0 || u >= LOW_ROCK_GRID || v >= LOW_ROCK_GRID) continue;
      const a = Math.floor(u), b = Math.floor(v);
      const top = b * stride + a, bottom = top + stride;
      lift = Math.max(lift, THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(samples[top], samples[top + 1], u - a),
        THREE.MathUtils.lerp(samples[bottom], samples[bottom + 1], u - a), v - b,
      ));
    }
    return lift;
  }
  return { tallRockFixtures, lowRockSupports, sampleRockSupport, register };
}

function addBlockClusters(rockField, height, clusters, register) {
  const transform = new THREE.Object3D();
  const fragments = [];
  for (const cluster of clusters) {
    const cosine = Math.cos(cluster.yaw), sine = Math.sin(cluster.yaw);
    for (const [dx, dz, width, rise, depth, rotation, tint, seed, split] of cluster.blocks) {
      const x = cluster.x + dx * cosine + dz * sine;
      const z = cluster.z - dx * sine + dz * cosine;
      const geometry = fracturedStoneGeometry(split ? 16 : 7, seed, { tint, split });
      transform.position.set(x, height(x, z) + rise * 0.42, z);
      transform.scale.set(width, rise, depth);
      transform.rotation.set(0, cluster.yaw + rotation, 0);
      transform.updateMatrix();
      geometry.applyMatrix4(transform.matrix);
      register(geometry);
      fragments.push(geometry);
    }
  }
  const geometry = mergeGeometries(fragments);
  for (const fragment of fragments) fragment.dispose();
  const blocks = new THREE.Mesh(geometry, createBrecciaMaterial());
  blocks.name = "fractured lunar breccia blocks";
  blocks.castShadow = blocks.receiveShadow = true;
  rockField.add(blocks);
}

const slopeUp = new THREE.Vector3(0, 1, 0);
const slopeNormal = new THREE.Vector3();
const slopeAlignQ = new THREE.Quaternion();
const slopeLocalQ = new THREE.Quaternion();
const slopeEuler = new THREE.Euler();

function seatRockOnSlope(pose, height, x, z, size, baseSink, rx, ry, rz) {
  const eps = 0.24;
  const dhdx = (height(x + eps, z) - height(x - eps, z)) / (2 * eps);
  const dhdz = (height(x, z + eps) - height(x, z - eps)) / (2 * eps);
  slopeNormal.set(-dhdx, 1, -dhdz).normalize();
  const steepness = 1 - slopeNormal.y;
  pose.position.set(x, height(x, z) - size * (baseSink + steepness * 0.65), z);
  slopeAlignQ.setFromUnitVectors(slopeUp, slopeNormal);
  slopeEuler.set(rx, ry, rz);
  slopeLocalQ.setFromEuler(slopeEuler);
  pose.quaternion.copy(slopeAlignQ).multiply(slopeLocalQ);
}

function addBlockFootRubble(rockField, height, material, clusters, register) {
  const random = randomSequence(57813);
  const bank = new THREE.InstancedMesh(fracturedStoneGeometry(1, 8167), material, 47 * clusters.length);
  const pose = new THREE.Object3D();
  const pigment = new THREE.Color();
  const matrix = new THREE.Color(0x5d5850);
  const powder = new THREE.Color(0x93897e);
  let index = 0;
  for (const cluster of clusters) {
    const cosine = Math.cos(cluster.yaw), sine = Math.sin(cluster.yaw);
    for (let fragment = 0; fragment < 47; fragment++) {
      const drift = (random() - 0.5) * 5.6;
      const slope = (random() ** 2.4) * 1.76 - 0.32;
      const x = cluster.x + drift * cosine + slope * sine;
      const z = cluster.z - drift * sine + slope * cosine;
      const fan = Math.exp(-(drift * drift) * 0.15 - Math.abs(slope) * 0.66);
      const size = 0.018 + (0.052 + 0.102 * fan) * random() ** 3.6;
      const long = size * (1.05 + 0.91 * random());
      seatRockOnSlope(pose, height, x, z, size, 0.18 + random() * 0.20,
        (random() - 0.5) * 0.45, cluster.yaw + (random() - 0.5) * 2.1, (random() - 0.5) * 0.45);
      pose.scale.set(long, size * (0.25 + random() * 0.38), size);
      pose.updateMatrix();
      if (size >= 0.10) register(bank.geometry, pose.matrix);
      bank.setMatrixAt(index, pose.matrix);
      bank.setColorAt(index++, pigment.copy(matrix).lerp(powder, 0.31 + random() * 0.52));
    }
  }
  bank.name = "angular fragments and regolith under boulders";
  bank.receiveShadow = true;
  bank.instanceMatrix.needsUpdate = true;
  bank.instanceColor.needsUpdate = true;
  rockField.add(bank);
}

function addEjecta(rockField, height, material, arenaRadius) {
  const random = randomSequence(296741);
  const pose = new THREE.Object3D();
  const dark = new THREE.Color(0x6c6155);
  const light = new THREE.Color(0xbdb099);
  const shade = new THREE.Color();
  const visibleImpacts = impactBowls.filter(({ x, z }) => Math.hypot(x, z) <= arenaRadius);
  const populations = visibleImpacts.map(({ radius, age }) => Math.round((51 + radius * 36) * (1 - 0.47 * age)));
  const count = populations.reduce((total, population) => total + population, 0);
  const ejecta = new THREE.InstancedMesh(
    fracturedStoneGeometry(1, 8), material, count,
  );
  let index = 0;
  for (const [indexInField, impact] of visibleImpacts.entries()) {
    const stonesPerCrater = populations[indexInField];
    for (let i = 0; i < stonesPerCrater; i++) {
      const fan = i < stonesPerCrater * 0.59 ? 0 : i % 2 ? 1 : 2;
      const theta = impact.azimuth + [0, -1.76, 2.36][fan]
        + (random() - 0.5) * (fan === 0 ? 1.41 : 0.87);
      const rad = impact.radius * (0.74 + random() ** 1.67 * (fan === 0 ? 1.22 : 0.94));
      const radialFalloff = Math.max(0.2, 1.26 - (rad / impact.radius - 0.71));
      const x = impact.x + Math.cos(theta) * rad;
      const z = impact.z + Math.sin(theta) * rad;
      const rim = 1 - Math.min(Math.abs(rad / impact.radius - 1) * 2, 1);
      const chip = i < Math.round((1 - impact.age) * 8) ? rim * 0.067 : 0;
      const size = 0.013 + random() ** 3.8 * (0.045 + 0.16 * rim) * radialFalloff + chip;
      seatRockOnSlope(pose, height, x, z, size, 0.20 + impact.age * 0.12,
        (random() - 0.5) * 0.55, theta + (random() - 0.5) * 1.30, (random() - 0.5) * 0.55);
      pose.scale.set(size * (0.90 + random() * 0.74), size * (0.38 + random() * 0.30), size * (0.48 + random() * 0.78));
      pose.updateMatrix();
      ejecta.setMatrixAt(index, pose.matrix);
      ejecta.setColorAt(index++, shade.copy(dark).lerp(light, 0.20 + random() * 0.79));
    }
  }
  ejecta.name = "impact crater ejecta fans";
  ejecta.instanceMatrix.needsUpdate = true;
  ejecta.instanceColor.needsUpdate = true;
  ejecta.receiveShadow = true;
  rockField.add(ejecta);
}

export function addEmbeddedRocks(scene, height, { arenaRadius = 15.4, playableLimit = arenaRadius / Math.SQRT2 } = {}) {
  const random = randomSequence(47329);
  const outerRandom = randomSequence(68714);
  const fringeRandom = randomSequence(7373352);
  const pose = new THREE.Object3D();
  const stain = new THREE.Color();
  const darkBasalt = new THREE.Color(0x504d48);
  const weathered = new THREE.Color(0x918d86);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  const rockField = new THREE.Group();
  rockField.name = "embedded basalt and regolith fragments";
  const { tallRockFixtures, lowRockSupports, sampleRockSupport, register } = createRockSupportIndex(height, playableLimit);
  Object.assign(rockField.userData, { tallRockFixtures, lowRockSupports, sampleRockSupport });

  // Sparse open ground leads into clusters of breccia and smaller ejecta.
  const innerRadius = Math.min(15.4, arenaRadius);
  const middleRadius = Math.min(26.8, arenaRadius);
  const outerAreaRatio = (middleRadius / innerRadius) ** 2 - 1;
  const fringeAreaRatio = (arenaRadius ** 2 - middleRadius ** 2) / (innerRadius ** 2);
  const deposits = peripheralFragments(0, arenaRadius - 0.01, playableLimit);
  for (let batch = 0; batch < 5; batch++) {
    const boulders = batch >= 3;
    const count = boulders ? 23 : 140;
    const outerCount = Math.round(outerAreaRatio * (boulders ? 10 : 108));
    const fringeCount = Math.round(fringeAreaRatio * (boulders ? 11 : 50));
    const scatterCount = count + outerCount + fringeCount;
    const localDeposits = deposits.filter(({ variant }) => variant === batch);
    const rocks = new THREE.InstancedMesh(fracturedStoneGeometry(1, batch + 1), material, scatterCount + localDeposits.length);
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const radius = boulders
        ? (0.72 + random() * 0.275) * innerRadius
        : (0.17 + random() * 0.81) * innerRadius;
      const x = Math.cos(theta) * radius, z = Math.sin(theta) * radius;
      const size = boulders ? 0.10 + random() ** 3.8 * (Math.max(Math.abs(x), Math.abs(z)) > 10.95 ? 0.57 : 0.16)
        : 0.015 + random() ** 3 * 0.103;
      pose.position.set(x, height(x, z) - size * (0.08 + random() * 0.12), z);
      pose.rotation.set((random() - 0.5) * 1.05, random() * Math.PI * 2, (random() - 0.5) * 1.05);
      pose.scale.set(size * (1.05 + random() * 0.62), size * (0.30 + random() * 0.46), size * (0.5 + random() * 0.49));
      pose.updateMatrix();
      if (size >= 0.087) register(rocks.geometry, pose.matrix);
      rocks.setMatrixAt(i, pose.matrix);
      rocks.setColorAt(i, stain.copy(darkBasalt).lerp(weathered, 0.24 + random() * 0.71));
    }
    for (let i = count; i < scatterCount; i++) {
      const fringe = i >= count + outerCount;
      const next = fringe ? fringeRandom : outerRandom;
      const theta = next() * Math.PI * 2;
      const inner = fringe ? middleRadius : innerRadius, outer = fringe ? arenaRadius : middleRadius;
      const radius = Math.sqrt(THREE.MathUtils.lerp(inner ** 2, (outer * 0.98) ** 2, next()));
      const x = Math.cos(theta) * radius, z = Math.sin(theta) * radius;
      const nearDrive = Math.max(Math.abs(x), Math.abs(z)) < (fringe ? playableLimit + 0.3 : 18.3);
      const scatteredSize = boulders ? 0.09 + next() ** 3.8 * (nearDrive ? 0.13 : 0.64)
        : 0.014 + next() ** 3 * 0.106;
      const atPad = protectedOuterPads.some(([px, pz]) => Math.hypot(x - px, z - pz) < 2.7);
      const size = atPad ? Math.min(0.03, scatteredSize) : scatteredSize;
      pose.position.set(x, height(x, z) - size * (0.09 + next() * 0.12), z);
      pose.rotation.set((next() - 0.5) * 1.05, next() * Math.PI * 2, (next() - 0.5) * 1.05);
      pose.scale.set(size * (1.07 + next() * 0.61), size * (0.31 + next() * 0.43), size * (0.5 + next() * 0.49));
      pose.updateMatrix();
      if (size >= 0.087) register(rocks.geometry, pose.matrix);
      rocks.setMatrixAt(i, pose.matrix);
      rocks.setColorAt(i, stain.copy(darkBasalt).lerp(weathered, 0.23 + next() * 0.72));
    }
    for (const [index, part] of localDeposits.entries()) {
      const { x, z, scale, stretch, vertical, yaw, tilt, tint } = part;
      pose.position.set(x, height(x, z) - 0.13 * scale, z);
      pose.rotation.set(tilt, yaw, -0.75 * tilt);
      pose.scale.set(scale * stretch, scale * vertical, scale * 0.68);
      pose.updateMatrix();
      rocks.setMatrixAt(scatterCount + index, pose.matrix);
      rocks.setColorAt(scatterCount + index, stain.copy(darkBasalt).lerp(weathered, tint));
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.instanceColor.needsUpdate = true;
    rocks.castShadow = boulders;
    rocks.receiveShadow = true;
    rockField.add(rocks);
  }
  const clusters = blockClusters.filter(({ x, z }) => Math.hypot(x, z) < arenaRadius);
  if (clusters.length) {
    addBlockClusters(rockField, height, clusters, register);
    addBlockFootRubble(rockField, height, material, clusters, register);
  }
  addEjecta(rockField, height, material, arenaRadius);
  scene.add(rockField);
  return rockField;
}
