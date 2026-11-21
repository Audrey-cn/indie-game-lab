import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

// Stepped crystal strata with sharper quartz termination crowns for natural cleavage silhouettes.
const facetedVein = [
  [-0.36, 0.145, -0.014, 0], [-0.21, 0.182, 0.004, 0.011],
  [0.02, 0.172, 0.018, -0.006], [0.22, 0.132, 0.024, -0.009],
  [0.34, 0.062, 0.016, -0.010], [0.41, 0.012, 0.012, -0.008],
];
const smokyPlates = [
  [-0.34, 0.135, 0, 0], [-0.14, 0.195, -0.018, 0.012],
  [0.10, 0.185, 0.022, 0.022], [0.24, 0.135, 0.008, 0.020],
  [0.33, 0.024, 0.002, 0.014],
];
const fracturedAmber = [
  [-0.34, 0.115, 0.01, 0], [-0.15, 0.215, 0.002, -0.020],
  [0.08, 0.175, -0.028, 0.016], [0.24, 0.138, -0.014, -0.008],
  [0.34, 0.068, -0.022, -0.025], [0.40, 0.014, -0.018, -0.022],
];
const greenPrisms = [
  [-0.41, 0.105, 0, 0], [-0.25, 0.142, 0, -0.010],
  [0.18, 0.122, -0.010, 0.005], [0.35, 0.086, 0.016, -0.008],
  [0.44, 0.036, 0.020, -0.008], [0.49, 0.008, 0.018, -0.006],
];
const splitCalcite = [
  [-0.35, 0.155, 0.01, 0], [-0.20, 0.175, -0.010, 0.018],
  [0.08, 0.162, 0.010, -0.008], [0.22, 0.118, 0.018, -0.006],
  [0.33, 0.044, 0.019, -0.014], [0.38, 0.010, 0.016, -0.012],
];

const palettes = [
  { name: "青灰石英", color: 0xa6c4ba, tint: 0x62d6bf, roughness: 0.20, transmission: 0.38, strata: facetedVein, sides: 6, flatten: 0.89, shards: 9 },
  { name: "烟紫片晶", color: 0xb9a8cc, tint: 0xa67fd4, roughness: 0.24, transmission: 0.22, strata: smokyPlates, sides: 6, flatten: 0.64, shards: 8 },
  { name: "琥珀断晶", color: 0xd2a86e, tint: 0xe69f45, roughness: 0.19, transmission: 0.39, strata: fracturedAmber, sides: 7, flatten: 0.91, shards: 9 },
  { name: "深绿柱晶", color: 0x67a896, tint: 0x5cd8a4, roughness: 0.22, transmission: 0.29, strata: greenPrisms, sides: 6, flatten: 0.84, shards: 10 },
  { name: "银白方解石", color: 0xd0dcdc, tint: 0x99d0de, roughness: 0.28, transmission: 0.14, strata: splitCalcite, sides: 6, flatten: 0.94, shards: 9 },
];

// Layered hero spire + mid satellites + basal micro-crystals for natural geological cluster silhouette
const offsets = [
  [0, 0, 0.98],
  [-0.17, 0.08, 0.64],
  [0.15, -0.075, 0.72],
  [-0.09, -0.14, 0.56],
  [0.155, 0.135, 0.44],
  [0.025, -0.17, 0.46],
  [-0.21, -0.06, 0.34],
  [0.22, 0.03, 0.32],
  [-0.04, 0.20, 0.30],
  [0.11, -0.19, 0.27],
];

export function makeMineralStyle(index, hash) {
  const profile = palettes[index % palettes.length];
  const offsetLean = [0.18, 0.48, -0.21, 0.09, 0.32][index % palettes.length];
  const shards = offsets.slice(0, profile.shards).map(([x, z, size], blade) => {
    const points = [];
    const seed = 81 + index * 47 + blade * 11;
    for (const [y, radius, dx, dz] of profile.strata) {
      for (let side = 0; side < profile.sides; side++) {
        const angle = side / profile.sides * Math.PI * 2 + hash(side, seed) * 0.16;
        const width = radius * (0.78 + hash(side, seed + 31) * 0.38);
        points.push(new THREE.Vector3(dx + Math.cos(angle) * width,
          y + (hash(side + 2, seed + 4) - 0.5) * 0.065,
          dz + Math.sin(angle) * width * profile.flatten));
      }
    }
    const geometry = new ConvexGeometry(points);
    const litEdge = new THREE.Color();
    const vertexColors = [];
    const vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      const bx = vertices.getX(i), by = vertices.getY(i), bz = vertices.getZ(i);
      // Darker mineral root grading upward into luminous crystalline crowns + stepped cleavage bands
      const heightGrad = THREE.MathUtils.smoothstep(by, -0.36, 0.38);
      const strataBand = Math.sin(by * 28 - bx * 10 + bz * 11 + index * 1.7) * 0.08;
      const cloudy = Math.sin(bx * 14 + bz * 16 - by * 8) * 0.11;
      const shade = THREE.MathUtils.clamp(0.54 + heightGrad * 0.62 + strataBand + cloudy, 0.42, 1.18);
      litEdge.setScalar(shade);
      vertexColors.push(litEdge.r, litEdge.g, litEdge.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
    return {
      geometry, x, z, size,
      bank: blade ? (hash(seed, 61) - 0.50) * (blade >= 6 ? 1.45 : index === 1 ? 1.55 : 1.05) : offsetLean,
      yaw: hash(13, seed) * Math.PI * 2,
      rake: (hash(7, seed) - 0.5) * (blade >= 6 ? 0.58 : 0.30),
    };
  });
  return { ...profile, shards };
}
