import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

const facetedVein = [
  [-0.32, 0.15, -0.018, 0], [-0.19, 0.19, 0, 0.013],
  [0.09, 0.18, 0.029, -0.008], [0.27, 0.14, 0.033, -0.010],
  [0.36, 0.08, 0.020, -0.014],
];
const smokyPlates = [
  [-0.31, 0.13, 0, 0], [-0.12, 0.20, -0.02, 0.01],
  [0.14, 0.19, 0.025, 0.025], [0.22, 0.16, 0.004, 0.026],
];
const fracturedAmber = [
  [-0.31, 0.11, 0.01, 0], [-0.13, 0.23, 0, -0.023],
  [0.12, 0.18, -0.034, 0.02], [0.25, 0.16, -0.013, -0.01],
  [0.32, 0.10, -0.03, -0.035],
];
const greenPrisms = [
  [-0.39, 0.10, 0, 0], [-0.24, 0.14, 0, -0.012],
  [0.21, 0.119, -0.012, 0.005], [0.38, 0.091, 0.021, -0.011],
  [0.43, 0.045, 0.025, -0.010],
];
const splitCalcite = [
  [-0.32, 0.16, 0.01, 0], [-0.19, 0.179, -0.012, 0.02],
  [0.11, 0.17, 0.01, -0.01], [0.20, 0.13, 0.021, -0.007],
  [0.31, 0.06, 0.023, -0.018],
];

const palettes = [
  { name: "青灰石英", color: 0xa0b5ad, tint: 0x62ab9c, roughness: 0.23, transmission: 0.38, strata: facetedVein, sides: 6, flatten: 0.89, shards: 5 },
  { name: "烟紫片晶", color: 0xb0a4ba, tint: 0x9576ae, roughness: 0.29, transmission: 0.22, strata: smokyPlates, sides: 5, flatten: 0.58, shards: 4 },
  { name: "琥珀断晶", color: 0xc6a171, tint: 0xd39145, roughness: 0.21, transmission: 0.39, strata: fracturedAmber, sides: 7, flatten: 0.91, shards: 5 },
  { name: "深绿柱晶", color: 0x649789, tint: 0x5cbf90, roughness: 0.25, transmission: 0.29, strata: greenPrisms, sides: 6, flatten: 0.81, shards: 6 },
  { name: "银白方解石", color: 0xc8d2d0, tint: 0x95bdc9, roughness: 0.34, transmission: 0.14, strata: splitCalcite, sides: 5, flatten: 0.95, shards: 5 },
];

const offsets = [[0, 0, 0.94], [-0.16, 0.08, 0.58], [0.14, -0.071, 0.69],
  [-0.08, -0.13, 0.54], [0.142, 0.128, 0.40], [0.024, -0.16, 0.44]];

export function makeMineralStyle(index, hash) {
  const profile = palettes[index % palettes.length];
  const offsetLean = [0.20, 0.54, -0.23, 0.09, 0.36][index % palettes.length];
  const shards = offsets.slice(0, profile.shards).map(([x, z, size], blade) => {
    const points = [];
    const seed = 81 + index * 47 + blade * 11;
    for (const [y, radius, dx, dz] of profile.strata) {
      for (let side = 0; side < profile.sides; side++) {
        const angle = side / profile.sides * Math.PI * 2 + hash(side, seed) * 0.19;
        const width = radius * (0.76 + hash(side, seed + 31) * 0.43);
        points.push(new THREE.Vector3(dx + Math.cos(angle) * width,
          y + (hash(side + 2, seed + 4) - 0.5) * 0.088,
          dz + Math.sin(angle) * width * profile.flatten));
      }
    }
    const geometry = new ConvexGeometry(points);
    const litEdge = new THREE.Color();
    const vertexColors = [];
    const vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      const bx = vertices.getX(i), by = vertices.getY(i), bz = vertices.getZ(i);
      const grain = Math.sin(by * 22 - bx * 9 + bz * 12 + index * 1.7);
      const cloudy = Math.sin(bx * 12 + bz * 14 - by * 7) * 0.16 + 0.89;
      litEdge.setScalar(THREE.MathUtils.clamp(cloudy + grain * 0.09, 0.53, 1.09));
      vertexColors.push(litEdge.r, litEdge.g, litEdge.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
    return { geometry, x, z, size, bank: blade ? (hash(seed, 61) - 0.52) * (index === 1 ? 1.7 : 1.17) : offsetLean,
      yaw: hash(13, seed) * Math.PI, rake: (hash(7, seed) - 0.5) * 0.32 };
  });
  return { ...profile, shards };
}
