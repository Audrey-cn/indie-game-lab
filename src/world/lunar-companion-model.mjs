import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeEquipmentFinish } from "../rendering/lunar-equipment-finish.mjs";

const { clamp, damp } = THREE.MathUtils;
const HALF_PI = Math.PI / 2;

function standard(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function shellParts(parent) {
  const batches = new Map();

  function add(material, source, x, y, z, axis) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    if (axis === "z") geometry.rotateX(HALF_PI);
    if (axis === "x") geometry.rotateZ(HALF_PI);
    geometry.translate(x, y, z);
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry);
  }

  return {
    plate(material, w, h, d, x, y, z, bevel) {
      add(material, new RoundedBoxGeometry(w, h, d, 1, bevel), x, y, z);
    },
    panel(material, outline, y, h, bevel) {
      const shape = new THREE.Shape();
      outline.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: h, steps: 1, bevelEnabled: true,
        bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1,
      }).rotateX(-HALF_PI);
      add(material, geometry, 0, y, 0);
    },
    pin(material, top, bottom, h, x, y, z, axis, segments = 8) {
      add(material, new THREE.CylinderGeometry(top, bottom, h, segments), x, y, z, axis);
    },
    optic(material, radius, depth, x, y, z) {
      const dome = new THREE.SphereGeometry(radius, 16, 8).scale(1, 1, depth / radius);
      add(material, dome, x, y, z);
    },
    mount() {
      for (const [material, items] of batches) {
        const geometry = items.length === 1 ? items[0] : mergeGeometries(items);
        if (items.length > 1) for (const item of items) item.dispose();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = material.emissiveIntensity < 0.95;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    },
  };
}

export function createCompanionModel() {
  const ceramic = makeEquipmentFinish(0xd0d2c3, "paint", 158);
  ceramic.bumpScale = 0.0007;
  const graphite = standard(0x343d40, 0.55, 0.37);
  const alloy = standard(0x888c85, 0.43, 0.63);
  const cavity = standard(0x121d24, 0.61, 0.25);
  const stripe = standard(0x8c6035, 0.68, 0.18);
  const diode = new THREE.MeshStandardMaterial({
    color: 0x74a99b, metalness: 0.16, roughness: 0.4,
    emissive: 0x58c3ae, emissiveIntensity: 0.94,
  });
  const lens = new THREE.MeshStandardMaterial({
    color: 0x428a93, metalness: 0.37, roughness: 0.16,
    emissive: 0x288b85, emissiveIntensity: 0.42,
  });

  const group = new THREE.Group();
  group.name = "Lunar companion survey pod";
  const shell = shellParts(group);
  // The central chin branches around the optic, leaving clearance for its two axes.
  shell.panel(graphite, [
    [-0.188, 0.028], [-0.174, -0.083], [-0.104, -0.139], [-0.064, -0.139],
    [-0.061, -0.089], [0.061, -0.089], [0.064, -0.139], [0.104, -0.139],
    [0.174, -0.083], [0.188, 0.028], [0.137, 0.117], [0.093, 0.136],
    [-0.093, 0.136], [-0.137, 0.117],
  ], -0.045, 0.054, 0.009);
  shell.panel(cavity, [
    [-0.096, -0.062], [0.096, -0.062], [0.140, 0.032],
    [0.080, 0.110], [-0.078, 0.110], [-0.140, 0.032],
  ], -0.065, 0.019, 0.009);
  shell.panel(ceramic, [
    [-0.070, -0.070], [0.064, -0.070], [0.091, -0.024],
    [0.068, 0.098], [-0.060, 0.103], [-0.087, 0.053],
  ], 0.012, 0.041, 0.008);
  shell.plate(cavity, 0.104, 0.011, 0.095, 0, 0.052, 0.020, 0.004);
  shell.plate(alloy, 0.057, 0.010, 0.013, 0, 0.059, -0.020, 0.003);

  for (const side of [-1, 1]) {
    const reflect = points => points.map(([x, z]) => [side * x, z]);
    shell.panel(ceramic, reflect([
      [0.080, -0.125], [0.103, -0.131], [0.165, -0.079], [0.179, 0.019],
      [0.129, 0.086], [0.106, 0.072], [0.104, -0.021], [0.077, -0.073],
    ]), 0.011, 0.026, 0.006);
    shell.plate(cavity, 0.018, 0.032, 0.087, side * 0.178, -0.004, -0.007, 0.006);
    for (const z of [-0.035, -0.012, 0.011, 0.034]) {
      shell.plate(alloy, 0.011, 0.014, 0.006, side * 0.190, -0.002, z, 0.0015);
    }
    shell.pin(alloy, 0.006, 0.006, 0.004, side * 0.114, 0.044, -0.069, "y");
    shell.plate(diode, 0.030, 0.006, 0.009, side * 0.090, -0.006, -0.147, 0.002);
    shell.plate(diode, 0.008, 0.006, 0.036, side * 0.115, 0.044, 0.024, 0.002);
    shell.pin(alloy, 0.015, 0.010, 0.021, side * 0.136, -0.047, 0.113, "z", 10);
    shell.pin(cavity, 0.008, 0.008, 0.004, side * 0.136, -0.047, 0.125, "z", 10);

    // Recessed lower cold gas nozzles with separate throat and machined collar.
    shell.pin(graphite, 0.027, 0.027, 0.026, side * 0.126, -0.050, 0.034, "y", 12);
    shell.pin(alloy, 0.025, 0.021, 0.013, side * 0.126, -0.067, 0.034, "y", 12);
    shell.pin(cavity, 0.015, 0.014, 0.004, side * 0.126, -0.075, 0.034, "y", 12);
  }
  shell.plate(stripe, 0.057, 0.006, 0.012, -0.026, 0.061, 0.052, 0.002);
  shell.plate(stripe, 0.016, 0.006, 0.012, 0.023, 0.061, 0.052, 0.002);
  shell.plate(cavity, 0.154, 0.033, 0.017, 0, -0.017, 0.137, 0.006);
  for (const x of [-0.053, -0.035, -0.017, 0.017, 0.035, 0.053]) {
    shell.plate(alloy, 0.009, 0.014, 0.012, x, -0.017, 0.148, 0.002);
  }
  shell.plate(diode, 0.031, 0.005, 0.011, 0, 0.006, 0.144, 0.002);
  shell.plate(graphite, 0.089, 0.013, 0.056, 0, -0.050, 0.107, 0.005);
  for (const side of [-1, 1]) {
    shell.pin(alloy, 0.009, 0.010, 0.012, side * 0.031, -0.059, 0.107, "y");
  }
  shell.plate(graphite, 0.124, 0.030, 0.045, 0, -0.034, -0.086, 0.009);
  shell.pin(alloy, 0.015, 0.015, 0.111, 0, -0.048, -0.106, "x", 10);
  shell.mount();

  const gimbal = new THREE.Group();
  gimbal.position.set(0, -0.052, -0.109);
  gimbal.rotation.x = -0.21;
  group.add(gimbal);
  const head = shellParts(gimbal);
  head.plate(cavity, 0.105, 0.057, 0.053, 0, 0, -0.012, 0.012);
  head.pin(alloy, 0.025, 0.028, 0.010, 0.004, -0.003, -0.040, "z", 16);
  head.pin(cavity, 0.020, 0.020, 0.004, 0.004, -0.003, -0.046, "z", 16);
  head.optic(lens, 0.016, 0.006, 0.004, -0.003, -0.047);
  head.optic(cavity, 0.007, 0.002, 0.004, -0.003, -0.052);
  head.pin(lens, 0.005, 0.005, 0.005, -0.034, 0.004, -0.038, "z", 8);
  head.mount();

  const scanOrigin = new THREE.Object3D();
  scanOrigin.name = "Companion optical center";
  scanOrigin.position.set(0.004, -0.003, -0.055);
  gimbal.add(scanOrigin);

  const localTarget = new THREE.Vector3();
  function aim(worldTarget, dt) {
    let pitch = -0.21;
    let yaw = 0;
    if (worldTarget) {
      group.worldToLocal(localTarget.copy(worldTarget)).sub(gimbal.position);
      pitch = clamp(Math.atan2(localTarget.y, Math.hypot(localTarget.x, localTarget.z)), -1.55, 0.28);
      yaw = clamp(Math.atan2(-localTarget.x, -localTarget.z), -1.38, 1.38);
    }
    gimbal.rotation.set(
      damp(gimbal.rotation.x, pitch, 10, dt),
      damp(gimbal.rotation.y, yaw, 10, dt), 0, "YXZ",
    );
    lens.emissiveIntensity = damp(lens.emissiveIntensity, worldTarget ? 1.18 : 0.42, 7, dt);
  }

  return { group, aim, scanOrigin };
}
