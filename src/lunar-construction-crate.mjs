import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeEquipmentFinish } from "./lunar-equipment-finish.mjs";

const ease = THREE.MathUtils.smootherstep;
let crateFinishes;
let crateTemplate;

function sharedFinishes() {
  crateFinishes ??= {
    shell: makeEquipmentFinish(0x9f9c84, "paint", 118),
    frame: new THREE.MeshStandardMaterial({ color: 0x374247, roughness: 0.58, metalness: 0.49 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x808783, roughness: 0.50, metalness: 0.71 }),
    marker: new THREE.MeshStandardMaterial({ color: 0xba8f4a, roughness: 0.69, metalness: 0.17 }),
  };
  return crateFinishes;
}

function hinge(parent, name, x, y, z) {
  const part = new THREE.Group();
  part.name = name;
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}

function makeParts(parent) {
  const batches = new Map();
  function add(finish, source, x, y, z) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.translate(x, y, z);
    if (!batches.has(finish)) batches.set(finish, []);
    batches.get(finish).push(geometry);
  }
  return {
    box(finish, w, h, d, x, y, z, bevel = 0) {
      add(finish, bevel ? new RoundedBoxGeometry(w, h, d, 1, bevel) : new THREE.BoxGeometry(w, h, d), x, y, z);
    },
    pin(finish, radius, length, x, y, z, axis) {
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
      if (axis === "x") geometry.rotateZ(Math.PI / 2);
      if (axis === "z") geometry.rotateX(Math.PI / 2);
      add(finish, geometry, x, y, z);
    },
    mount() {
      for (const [finish, parts] of batches) {
        const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts);
        if (parts.length > 1) for (const source of parts) source.dispose();
        const mesh = new THREE.Mesh(geometry, finish);
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
      }
    },
  };
}

function makeCrateTemplate() {
  const group = new THREE.Group();
  group.name = "Sealed construction kit";
  const { shell, frame, steel, marker } = sharedFinishes();
  const lamp = new THREE.MeshStandardMaterial({ color: 0x8fa38c, roughness: 0.57, emissive: 0x81a58b, emissiveIntensity: 0.18 });

  const base = makeParts(group);
  base.box(frame, 0.425, 0.032, 0.294, 0, 0.019, 0, 0.008);
  base.box(shell, 0.419, 0.031, 0.287, 0, 0.045, 0, 0.007);
  base.box(steel, 0.24, 0.012, 0.178, 0, 0.062, 0, 0.003);
  for (const sign of [-1, 1]) {
    base.box(frame, 0.028, 0.019, 0.259, sign * 0.178, 0.01, 0, 0.003);
    base.box(steel, 0.012, 0.011, 0.144, sign * 0.101, 0.071, 0, 0.002);
    for (const side of [-1, 1]) {
      base.pin(steel, 0.010, 0.038, sign * 0.118, 0.059, side * 0.136, "x");
      base.pin(steel, 0.010, 0.035, sign * 0.206, 0.059, side * 0.068, "z");
      base.pin(frame, 0.007, 0.010, sign * 0.080, 0.072, side * 0.052, "y");
    }
  }
  base.box(lamp, 0.036, 0.010, 0.009, -0.077, 0.040, 0.145, 0.003);
  base.mount();
  group.children.find(part => part.material === lamp).name = "Construction kit status lamp";

  const front = hinge(group, "Front leaf", 0, 0.062, 0.137);
  const rear = hinge(group, "Rear leaf", 0, 0.062, -0.137);
  for (const sign of [-1, 1]) {
    const leaf = hinge(group, `Side leaf ${sign}`, sign * 0.207, 0.062, 0);
    const parts = makeParts(leaf);
    parts.box(shell, 0.025, 0.140, 0.245, 0, 0.070, 0, 0.006);
    for (const z of [-0.097, -0.044, 0.044, 0.097]) {
      parts.box(frame, 0.012, 0.094, 0.014, sign * 0.011, 0.067, z, 0.003);
    }
    parts.box(marker, 0.010, 0.031, 0.065, sign * 0.015, 0.099, 0, 0.002);
    parts.mount();
  }

  for (const [wall, sign] of [[front, 1], [rear, -1]]) {
    const parts = makeParts(wall);
    parts.box(shell, 0.392, 0.140, 0.024, 0, 0.070, 0, 0.006);
    parts.box(frame, 0.338, 0.017, 0.009, 0, 0.121, sign * 0.013, 0.003);
    for (const x of [-0.177, 0.177]) {
      parts.box(frame, 0.034, 0.111, 0.011, x, 0.067, sign * 0.013, 0.003);
      parts.pin(steel, 0.007, 0.010, x, 0.100, sign * 0.020, "z");
    }
    if (wall === front) parts.box(marker, 0.088, 0.029, 0.008, 0, 0.061, 0.014, 0.003);
    parts.mount();
  }

  for (const sign of [-1, 1]) {
    const latch = hinge(front, `Latch ${sign}`, sign * 0.126, 0.083, 0.017);
    const parts = makeParts(latch);
    parts.box(steel, 0.027, 0.057, 0.012, 0, 0.024, 0, 0.004);
    parts.box(frame, 0.019, 0.021, 0.008, 0, 0.019, 0.008, 0.002);
    parts.mount();
  }

  const lid = hinge(rear, "Lid", 0, 0.148, -0.004);
  const cover = makeParts(lid);
  cover.box(shell, 0.438, 0.032, 0.294, 0, 0.013, 0.141, 0.008);
  cover.box(frame, 0.286, 0.010, 0.184, 0, 0.034, 0.141, 0.004);
  cover.box(steel, 0.310, 0.006, 0.010, 0, -0.003, 0.245, 0.002);
  for (const sign of [-1, 1]) {
    cover.box(steel, 0.017, 0.014, 0.193, sign * 0.159, 0.035, 0.141, 0.003);
    cover.box(marker, 0.021, 0.010, 0.074, sign * 0.126, 0.041, 0.141, 0.002);
    cover.box(steel, 0.025, 0.027, 0.025, sign * 0.065, 0.044, 0.141, 0.004);
    cover.pin(steel, 0.011, 0.050, sign * 0.133, 0, 0, "x");
    cover.box(frame, 0.016, 0.007, 0.184, sign * 0.163, -0.004, 0.138, 0.002);
  }
  cover.box(frame, 0.128, 0.017, 0.025, 0, 0.053, 0.141, 0.006);
  cover.mount();

  const handle = new THREE.Object3D();
  handle.name = "Construction kit grab point";
  handle.position.set(0, 0.058, 0.141);
  lid.add(handle);
  return group;
}

export function createConstructionCrate() {
  crateTemplate ??= makeCrateTemplate();
  const group = crateTemplate.clone(true);
  const find = name => group.getObjectByName(name);
  const [front, rear, lid] = ["Front leaf", "Rear leaf", "Lid"].map(find);
  const [left, right] = ["Side leaf -1", "Side leaf 1"].map(find);
  const latches = ["Latch -1", "Latch 1"].map(find);
  const handle = find("Construction kit grab point");
  const lampMesh = find("Construction kit status lamp");
  const lamp = lampMesh.material = lampMesh.material.clone();

  function setOpening(progress) {
    const unlock = ease(progress, 0, 0.16);
    const lift = ease(progress, 0.07, 0.34);
    const lower = ease(progress, 0.35, 0.63);
    const unfold = ease(progress, 0.23, 0.56);
    const tuck = ease(progress, 0.34, 0.53);
    for (const latch of latches) latch.rotation.x = 1.56 * unlock - 0.92 * tuck;
    lid.rotation.x = -1.57 * lift;
    rear.rotation.x = -1.535 * lower;
    front.rotation.x = 1.52 * unfold;
    left.rotation.z = 1.52 * unfold;
    right.rotation.z = -1.52 * unfold;
  }

  function setTransfer(clamped) {
    lamp.emissiveIntensity = clamped ? 0.64 : 0.18;
  }

  return { group, handle, setOpening, setTransfer };
}
