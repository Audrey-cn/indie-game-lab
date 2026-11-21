import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeEquipmentFinish } from "../rendering/lunar-equipment-finish.mjs";

export const SURVEY_SITES = [
  { x: -7.4, z: 1.4, seconds: 2.7, name: "浅层震动", nameEn: "Seismic probe",
    finding: "浅层震动已记录 · 松软月壤下有致密岩层", findingEn: "Seismic reading logged · Dense rock beneath loose regolith" },
  { x: 4, z: 7.45, seconds: 3.4, name: "坡脚光谱", nameEn: "Slope spectrometer",
    finding: "坡脚光谱已记录 · 深色碎屑与浅色岩粒混合", findingEn: "Spectrum logged · Dark fragments mixed with pale grains" },
];

const UP = new THREE.Vector3(0, 1, 0);
const TURN = Math.PI / 2;
const rotation = new THREE.Matrix4();
const cylinder = (top, bottom, length, sides = 20) => new THREE.CylinderGeometry(top, bottom, length, sides);
const revolved = (profile, sides = 32) => new THREE.LatheGeometry(
  profile.map(([radius, height]) => new THREE.Vector2(radius, height)), sides,
);

function batch(parent) {
  const groups = new Map();
  function add(material, geometry, x, y, z, rx = 0, ry = 0, rz = 0) {
    rotation.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
    rotation.setPosition(x, y, z);
    geometry.applyMatrix4(rotation);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push(part);
  }
  function box(material, w, h, d, x, y, z, bevel = 0.004) {
    add(material, new RoundedBoxGeometry(w, h, d, 1, bevel), x, y, z);
  }
  function finish() {
    for (const [material, parts] of groups) {
      const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts);
      if (parts.length > 1) for (const part of parts) part.dispose();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  return { add, box, finish };
}

function instrumentPlate(code, purpose) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 88;
  const paint = canvas.getContext("2d");
  paint.fillStyle = "#393832";
  paint.fillRect(0, 0, 192, 88);
  paint.strokeStyle = "#c2bbac";
  paint.lineWidth = 3;
  paint.strokeRect(4, 4, 184, 80);
  paint.fillStyle = "#ddd5c4";
  paint.font = "bold 32px monospace";
  paint.fillText(code, 15, 37);
  paint.font = "15px monospace";
  paint.fillText(purpose, 15, 61);
  paint.fillRect(15, 68, 108, 5);
  paint.fillStyle = "#aa8156";
  paint.fillRect(163, 13, 12, 22);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.04 });
}

export function createLunarSurvey(scene, height) {
  const anodized = makeEquipmentFinish(0xaea79b, "aluminum", 791);
  anodized.bumpScale = 0.0009;
  const alloy = makeEquipmentFinish(0x6d7373, "anodized", 792);
  alloy.bumpScale = 0.0011;
  const shroud = makeEquipmentFinish(0xb3ada1, "paint", 793);
  shroud.bumpScale = 0.0016;
  const ceramic = new THREE.MeshStandardMaterial({ color: 0x938779, metalness: 0.14, roughness: 0.86 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8e7250, metalness: 0.63, roughness: 0.58 });
  const black = new THREE.MeshStandardMaterial({ color: 0x252522, metalness: 0.09, roughness: 0.89 });
  const innerBaffle = new THREE.MeshStandardMaterial({ color: 0x171a1b, metalness: 0.18, roughness: 0.93 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x334247, metalness: 0.42, roughness: 0.13, clearcoat: 0.92, clearcoatRoughness: 0.11,
    iridescence: 0.42, iridescenceIOR: 1.29, iridescenceThicknessRange: [215, 315],
  });
  const lerp = THREE.MathUtils.lerp;
  const smooth = THREE.MathUtils.smootherstep;

  const stations = SURVEY_SITES.map(({ x, z }, index) => {
    const station = new THREE.Group();
    const ground = height(x, z);
    const yaw = index ? -2.43 : 0.38;
    station.position.set(x, ground, z);
    station.rotation.y = yaw;
    station.name = index ? "坡脚光谱仪" : "浅层震动仪";
    scene.add(station);
    function floor(dx, dz) {
      return height(x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
        z - dx * Math.sin(yaw) + dz * Math.cos(yaw)) - ground;
    }
    const support = batch(station);
    const headHeight = index ? 0.39 : 0.256;
    for (let i = 0; i < 3; i++) {
      const angle = 0.58 + i * Math.PI * 2 / 3;
      const tipX = Math.cos(angle) * 0.218, tipZ = Math.sin(angle) * 0.218;
      const footY = floor(tipX, tipZ) + 0.021;
      support.add(ceramic, cylinder(0.047, 0.062, 0.027, 10), tipX, footY, tipZ);
      support.add(anodized, cylinder(0.032, 0.039, 0.017, 12), tipX, footY + 0.022, tipZ);
      support.add(black, cylinder(0.024, 0.024, 0.012, 12), tipX, footY + 0.034, tipZ);
      const end = new THREE.Vector3(tipX, footY + 0.044, tipZ);
      const start = new THREE.Vector3(tipX * 0.36, headHeight - 0.076, tipZ * 0.36);
      const axis = end.clone().sub(start);
      const length = axis.length();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, axis.normalize());
      const turn = new THREE.Euler().setFromQuaternion(quaternion);
      for (const [material, radius, position, span] of [
        [alloy, 0.016, 0.60, 0.76], [anodized, 0.022, 0.24, 0.46], [black, 0.025, 0.48, 0.075],
      ]) {
        const p = start.clone().lerp(end, position);
        support.add(material, cylinder(radius, radius, span * length, 8), p.x, p.y, p.z, turn.x, turn.y, turn.z);
      }
    }
    support.add(alloy, cylinder(0.083, 0.112, 0.043, 16), 0, headHeight - 0.072, 0);
    support.add(anodized, cylinder(0.058, 0.067, 0.021, 16), 0, headHeight - 0.038, 0);
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.09, headHeight - 0.08, -0.07),
      new THREE.Vector3(-0.13, headHeight - 0.09, -0.145),
      new THREE.Vector3(-0.17, headHeight - 0.19, -0.185),
      new THREE.Vector3(-0.16, floor(-0.16, -0.227) + 0.035, -0.227),
      new THREE.Vector3(-0.088, floor(-0.088, -0.236) + 0.017, -0.236),
      new THREE.Vector3(0.026, floor(0.026, -0.215) + 0.025, -0.215),
    ]);
    support.add(black, new THREE.TubeGeometry(cable, 18, 0.008, 6, false), 0, 0, 0);
    support.add(bronze, cylinder(0.014, 0.014, 0.023, 10), -0.098, headHeight - 0.083, -0.082, TURN);
    support.box(alloy, 0.078, 0.042, 0.061, 0.052, floor(0.052, -0.209) + 0.022, -0.209, 0.007);
    support.box(shroud, 0.062, 0.009, 0.038, 0.052, floor(0.052, -0.209) + 0.043, -0.209);
    support.finish();

    const head = new THREE.Group();
    head.position.y = headHeight;
    station.add(head);
    const housing = batch(head);
    const indicator = new THREE.MeshStandardMaterial({ color: 0x676d59, emissive: 0xbcc19a, emissiveIntensity: 0, roughness: 0.46 });
    housing.box(alloy, 0.091, 0.029, 0.027, index ? -0.063 : 0.093, 0.014, 0.09);
    housing.box(indicator, 0.019, 0.009, 0.006, index ? -0.039 : 0.113, 0.014, 0.106, 0.002);
    let articulated;
    if (index === 0) {
      housing.box(alloy, 0.273, 0.091, 0.209, 0, -0.017, 0, 0.014);
      housing.box(black, 0.262, 0.009, 0.199, 0, 0.026, 0, 0.004);
      housing.box(shroud, 0.257, 0.052, 0.192, 0, 0.044, 0, 0.014);
      housing.add(instrumentPlate("SEIS-01", "GROUND COUPLER"), new THREE.PlaneGeometry(0.129, 0.059), 0.007, 0.071, 0.016, -TURN);
      for (const x of [-0.108, 0.108]) {
        for (const z of [-0.077, 0.077]) housing.add(anodized, cylinder(0.008, 0.009, 0.005, 6), x, 0.072, z);
        housing.box(black, 0.022, 0.025, 0.092, x * 1.22, 0.008, 0, 0.004);
      }
      housing.add(bronze, cylinder(0.012, 0.015, 0.023, 12), -0.089, -0.007, 0.107, TURN);
      const fixedSleeve = batch(station);
      fixedSleeve.add(alloy, cylinder(0.039, 0.046, 0.061, 20), 0, 0.165, 0);
      fixedSleeve.add(anodized, cylinder(0.031, 0.039, 0.016, 20), 0, 0.131, 0);
      fixedSleeve.finish();
      articulated = new THREE.Group();
      articulated.position.y = 0.133;
      station.add(articulated);
      const probe = batch(articulated);
      probe.add(anodized, cylinder(0.017, 0.018, 0.095), 0, -0.014, 0);
      probe.add(bronze, cylinder(0.019, 0.031, 0.019), 0, -0.065, 0);
      probe.add(alloy, cylinder(0.030, 0.024, 0.012), 0, -0.078, 0);
      probe.finish();
    } else {
      for (const side of [-1, 1]) {
        housing.box(alloy, 0.027, 0.14, 0.066, side * 0.107, 0.017, 0, 0.008);
        housing.add(anodized, cylinder(0.028, 0.028, 0.016, 16), side * 0.12, 0.043, 0, 0, 0, TURN);
      }
      articulated = new THREE.Group();
      articulated.position.y = 0.038;
      head.add(articulated);
      const lens = batch(articulated);
      lens.box(alloy, 0.19, 0.101, 0.144, 0, 0, -0.026, 0.017);
      lens.box(shroud, 0.17, 0.021, 0.131, 0, 0.057, -0.023, 0.008);
      lens.add(instrumentPlate("SP-02", "VNIR OPTICS"), new THREE.PlaneGeometry(0.128, 0.058), 0, 0.069, -0.029, -TURN);
      for (let i = 0; i < 5; i++) {
        lens.box(anodized, 0.009, 0.056, 0.008, 0.095, -0.002, -0.078 + 0.014 * i, 0.002);
      }
      for (const [material, profile] of [
        [black, [[0.067, 0.031], [0.067, 0.061], [0.060, 0.068], [0.060, 0.113]]],
        [alloy, [[0.060, 0.113], [0.068, 0.125], [0.070, 0.169], [0.067, 0.178], [0.056, 0.178]]],
        [innerBaffle, [[0.056, 0.178], [0.054, 0.156], [0.046, 0.152], [0.051, 0.148],
          [0.047, 0.131], [0.041, 0.13], [0.046, 0.125], [0.041, 0.117]]],
        [anodized, [[0.068, 0.059], [0.068, 0.062], [0.063, 0.069], [0.061, 0.069]]],
        [glass, [[0.043, 0.119], [0.033, 0.127], [0.022, 0.133], [0.011, 0.136], [0, 0.137]]],
      ]) {
        lens.add(material, revolved(profile), 0, -0.006, 0, TURN);
      }
      lens.add(bronze, cylinder(0.014, 0.015, 0.019, 12), -0.045, -0.013, -0.097, -TURN);
      lens.finish();
    }
    housing.finish();
    return { articulated, indicator, deployment: 0 };
  });

  function update(state, time, dt) {
    for (const [index, { articulated, indicator }] of stations.entries()) {
      const station = stations[index];
      const active = state.surveyHold && state.surveyIndex === index;
      const recorded = Boolean(state.surveyMask & (1 << index));
      station.deployment = lerp(station.deployment, active ? 1 : 0, 1 - Math.exp(-6 * dt));
      const progress = active ? state.surveyProgress : 0;
      const sample = smooth(progress, 0.22, 0.95);
      indicator.emissiveIntensity = active ? 0.85 + 0.18 * Math.sin(time * 6.5) : recorded ? 0.22 : 0;
      if (index === 0) {
        articulated.position.y = 0.133 - station.deployment * smooth(progress, 0, 0.29) * 0.043;
      } else {
        articulated.rotation.x = station.deployment * (0.58 + 0.17 * sample);
        articulated.rotation.y = station.deployment * (sample - 0.5) * 0.64;
      }
    }
  }
  return { update };
}
