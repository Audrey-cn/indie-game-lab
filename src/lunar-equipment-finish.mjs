import * as THREE from "three";

const FINISHES = {
  paint: { roughness: 0.58, metalness: 0.29, dust: 0.83, wear: 0.67, relief: 0.0037 },
  aluminum: { roughness: 0.43, metalness: 0.71, dust: 0.38, wear: 0.31, relief: 0.0018 },
  steel: { roughness: 0.35, metalness: 0.88, dust: 0.19, wear: 0.27, relief: 0.0024, brush: 0.14 },
  anodized: { roughness: 0.63, metalness: 0.46, dust: 0.55, wear: 0.49, relief: 0.0024 },
};
const SIZE = 192;
const masks = new Map();
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

function random(x, y, seed) {
  let value = Math.imul(x + 17 * seed, 0x71eac45b) ^ Math.imul(y + 29 * seed, 0x6fd944b3);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  return ((value ^ (value >>> 12)) >>> 0) / 4294967296;
}

function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = smooth(x - ix, 0, 1), v = smooth(y - iy, 0, 1);
  return mix(mix(random(ix, iy, seed), random(ix + 1, iy, seed), u),
    mix(random(ix, iy + 1, seed), random(ix + 1, iy + 1, seed), u), v);
}

function stampScratches(seed) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  for (let i = 0; i < 68; i++) {
    const start = random(i, 3, seed);
    const x = (i % 2 === 0 ? start : start ** 3) * SIZE;
    const y = random(i, 4, seed) * SIZE;
    const length = 3 + 17 * random(i, 5, seed) ** 2;
    context.strokeStyle = `rgba(255,255,255,${0.12 + 0.61 * random(i, 8, seed)})`;
    context.lineWidth = 0.45 + random(i, 6, seed) * 0.61;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + (random(i, 7, seed) - 0.5) * length * 0.89);
    context.stroke();
  }
  return context.getImageData(0, 0, SIZE, SIZE).data;
}

function texture(bytes, color = false) {
  const data = new THREE.DataTexture(bytes, SIZE, SIZE);
  if (color) data.colorSpace = THREE.SRGBColorSpace;
  data.flipY = true;
  data.generateMipmaps = true;
  data.minFilter = THREE.LinearMipmapLinearFilter;
  data.magFilter = THREE.LinearFilter;
  data.anisotropy = 4;
  data.needsUpdate = true;
  return data;
}

function bakeFinish(profile, color, seed) {
  const base = new THREE.Color(color).getRGB(new THREE.Color(), THREE.SRGBColorSpace).toArray();
  const dustTone = [0.48, 0.45, 0.41];
  const scuffedMetal = [0.60, 0.59, 0.55];
  const scratches = stampScratches(seed);
  const size = SIZE * SIZE * 4;
  const albedo = new Uint8Array(size);
  const packed = new Uint8Array(size);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = (y * SIZE + x) * 4;
      const u = x / (SIZE - 1), v = y / (SIZE - 1);
      const edge = 1 - smooth(Math.min(u, 1 - u, v, 1 - v), 0.006, 0.052);
      const broad = noise(u * 4.2, v * 4.7, seed + 2);
      const granular = noise(u * 72, v * 69, seed + 13);
      const wearNoise = noise(u * 31, v * 37, seed + 17);
      const striation = noise(u * 3, v * 143, seed + 5);
      const powder = profile.dust * (0.28 + 0.58 * broad) * smooth(v, 0.56, 1.0)
        * (0.31 + 0.51 * granular);
      const exposed = profile.wear * (edge * smooth(wearNoise, 0.68, 0.94) + 0.72 * scratches[index + 3] / 255);
      const coating = 1 + (broad - 0.5) * 0.16 + (granular - 0.5) * 0.10
        + (striation - 0.5) * (profile.brush ?? 0.054);
      for (let channel = 0; channel < 3; channel++) {
        const surface = mix(base[channel] * coating, scuffedMetal[channel], exposed);
        albedo[index + channel] = Math.round(255 * clamp(mix(surface, dustTone[channel], powder), 0, 1));
      }
      albedo[index + 3] = 255;
      packed[index] = Math.round(255 * clamp(0.50 + (granular - 0.5) * 0.28 + striation * 0.11 - exposed * 0.34, 0, 1));
      packed[index + 1] = Math.round(255 * clamp(profile.roughness + powder * 0.29
        + (wearNoise - 0.5) * 0.13 - exposed * 0.21, 0.09, 1));
      packed[index + 2] = Math.round(255 * clamp(mix(profile.metalness, 0.88, exposed) * (1 - powder * 0.72), 0, 1));
      packed[index + 3] = 255;
    }
  }
  return { map: texture(albedo, true), packed: texture(packed) };
}

export function makeEquipmentFinish(color, kind = "paint", seed = 9) {
  const profile = FINISHES[kind];
  const key = `${color}:${kind}:${seed}`;
  let finish = masks.get(key);
  if (!finish) {
    finish = bakeFinish(profile, color, seed);
    masks.set(key, finish);
  }
  return new THREE.MeshStandardMaterial({
    map: finish.map, roughness: 1, metalness: 1,
    roughnessMap: finish.packed, metalnessMap: finish.packed, bumpMap: finish.packed, bumpScale: profile.relief,
  });
}
