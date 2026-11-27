// Node-only scene structure and geometry checks. This does not render WebGL or
// validate lighting, textures, frame rate, visual appearance, or runtime physics.
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildTrackScene, getSideWallOpenings, getEndWallOpenings } from "../src/cel-builder.mjs";
import { TRACKS } from "../src/config.mjs";

// Procedural textures only need a canvas-shaped object to construct the scenes.
// Drawing calls are deliberately no-ops; pixel output is outside this check.
const gradient = { addColorStop() {} };
const context = new Proxy({}, {
  get: (_, key) => key === "createLinearGradient" || key === "createRadialGradient"
    ? () => gradient
    : () => {},
});
globalThis.document = { createElement: () => ({ getContext: () => context }) };

const close = (actual, expected, label, tolerance = 0.00001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
};

const results = [];
// Exercise every new mechanism even if a course accidentally loses its definition.
const hazardFixture = { ...TRACKS[0], id: 'hazard-fixture',
  rollingPins: [{ x: 0, y: 8.48, z: -1, width: 2, ampZ: 0.9, speed: 1.2, phase: 0 }],
  bumpers: [{ x: 2, y: 8, z: 0, r: 0.8 }],
  steamVents: [{ x: 0, y: 8, z: 1, r: 0.7, period: 4, duty: 0.4, vy: 4, vz: -6 }],
  hammers: [{ x: 0, y: 12, z: -2, len: 3, amp: 0.7, speed: 1, phase: 0, variant: 'flail' }],
};
const isVisible = (node) => !node || (node.visible && isVisible(node.parent));
function verifyFallback(fallback, anchor, parent, label) {
  assert.equal(fallback?.parent, parent, `${label}: fallback detached from moving hazard`);
  assert.equal(anchor?.parent, parent, `${label}: GLB anchor detached from moving hazard`);
  assert.notEqual(fallback, anchor, `${label}: fallback and GLB need independent visibility`);
  let visibleGeometry = 0;
  fallback.traverse((node) => { if (node.isMesh && isVisible(node)) visibleGeometry++; });
  assert.ok(visibleGeometry > 0, `${label}: missing visible primitive fallback before GLB load`);
}
function verifyHazardEntries(track, dynamicMeshes) {
  for (const key of ['rollingPins', 'bumpers', 'steamVents']) {
    assert.ok(Array.isArray(dynamicMeshes[key]), `${track.id}: missing ${key} dynamic registration`);
    assert.equal(dynamicMeshes[key].length, (track[key] || []).length, `${track.id}: ${key} registration count`);
    for (const entry of dynamicMeshes[key]) {
      assert.ok(track[key].includes(entry.def), `${track.id}: ${key} registration lost its definition`);
      const parent = key === 'rollingPins' ? entry.roller : entry.mesh;
      verifyFallback(entry.fallback, entry.modelAnchor, parent, `${track.id}: ${key}`);
      close(entry.mesh.position.x, entry.def.x, `${track.id}: ${key} X`);
      close(entry.mesh.position.y, entry.def.y, `${track.id}: ${key} Y`);
      close(entry.mesh.position.z, entry.def.z, `${track.id}: ${key} Z`);
      if (key === 'rollingPins') {
        assert.equal(entry.roller.parent, entry.mesh, `${track.id}: pin spin detached from translating body`);
        const bounds = new THREE.Box3().setFromObject(entry.fallback, true);
        assert.ok(bounds.max.x - bounds.min.x >= entry.def.width, `${track.id}: pin barrel not aligned along X`);
        assert.ok(bounds.max.z - bounds.min.z < 1.1, `${track.id}: pin cylinder radius differs from physics`);
      }
      if (key === 'steamVents') {
        assert.equal(entry.plume?.parent, entry.mesh, `${track.id}: plume hidden with the replaced fallback/model`);
        assert.equal(entry.plume.visible, false, `${track.id}: inactive plume should start hidden`);
        entry.fallback.visible = false;
        entry.plume.visible = true;
        assert.ok(isVisible(entry.plume), `${track.id}: loaded GLB would hide the steam plume`);
        entry.fallback.visible = true;
        entry.plume.visible = false;
      }
    }
  }
  for (const entry of dynamicMeshes.hammers) {
    verifyFallback(entry.headFallback, entry.modelAnchor, entry.head, `${track.id}: ${entry.def.variant || 'hammer'}`);
    assert.equal(entry.head.parent, entry.pivot, `${track.id}: hammer/flail head must follow pendulum pivot`);
    close(entry.head.position.y, -entry.def.len, `${track.id}: hammer/flail contact center`);
  }
}
verifyHazardEntries(hazardFixture, buildTrackScene(hazardFixture).dynamicMeshes);
for (const track of TRACKS) {
  const { group, dynamicMeshes } = buildTrackScene(track);
  verifyHazardEntries(track, dynamicMeshes);
  group.updateMatrixWorld(true);
  let meshes = 0;
  let vertices = 0;
  group.traverse((node) => {
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), `${track.id}: invalid transform`);
    if (!node.isMesh) return;
    meshes++;
    const positions = node.geometry?.attributes?.position;
    if (!positions) return;
    vertices += positions.count;
    assert.ok(positions.array.every(Number.isFinite), `${track.id}: invalid geometry in ${node.name || node.type}`);
    const normals = node.geometry.attributes.normal;
    if (normals) assert.ok(normals.array.every(Number.isFinite), `${track.id}: invalid normals`);
  });

  for (const pad of track.platforms.filter(p => p.endWalls)) for (const side of [-1, 1]) {
    const z = pad.z + side * (pad.d / 2 + 0.12);
    const openings = getEndWallOpenings(pad, track.platforms, side, track.gears);
    const timber = group.children.filter(node => node.name === 'end-curb-timber'
      && Math.abs(node.position.z - z) < 1e-8 && Math.abs(node.position.y - pad.y - 0.495) < 1e-8);
    assert.ok(timber.length, `${track.id}: missing rendered bumper plaza end curbs`);
    let length = 0;
    for (const curb of timber) {
      curb.geometry.computeBoundingBox();
      const bounds = curb.geometry.boundingBox;
      close(curb.position.y + bounds.max.y, pad.y + 0.55, `${track.id}: end curb height`);
      const lo = curb.position.x + bounds.min.x, hi = curb.position.x + bounds.max.x;
      length += hi - lo;
      for (const [doorLo, doorHi] of openings) assert.ok(Math.min(hi, doorHi) - Math.max(lo, doorLo) < 1e-6,
        `${track.id}: end curb blocks a real connector doorway`);
    }
    const closedLength = pad.w - openings.reduce((total, [lo, hi]) => total + Math.max(0, Math.min(hi, pad.x + pad.w / 2) - Math.max(lo, pad.x - pad.w / 2)), 0);
    close(length, closedLength, `${track.id}: end curbs leave an unprotected gap`);
  }

  const elevators = track.platforms.filter((p) => p.kind === "elevator");
  assert.equal(dynamicMeshes.elevators.length, elevators.length, `${track.id}: elevator registration`);
  for (const { def, mesh } of dynamicMeshes.elevators) {
    assert.ok(elevators.includes(def), `${track.id}: unknown elevator definition`);
    close(mesh.position.x, def.x, `${track.id}: elevator X`);
    close(mesh.position.y, def.y, `${track.id}: elevator initial Y`);
    close(mesh.position.z, def.z, `${track.id}: elevator Z`);
    const slab = mesh.children[0];
    slab.geometry.computeBoundingBox();
    close(slab.geometry.boundingBox.max.y + slab.position.y, 0, `${track.id}: slab top`);
    close(slab.geometry.boundingBox.min.y + slab.position.y, -(def.h ?? 0.65), `${track.id}: slab underside`);
    const curbs = mesh.children.filter((node) => node.name.startsWith("side-curb-"));
    if (def.walls) assert.ok(curbs.length >= 2, `${track.id}: missing moving curbs`);
    for (const curb of curbs) {
      curb.geometry.computeBoundingBox();
      const bounds = curb.geometry.boundingBox;
      const innerFace = Math.abs(curb.position.x) - bounds.max.x;
      close(innerFace, def.w / 2, `${track.id}: curb inner face`);
      if (curb.name === "side-curb-timber") {
        close(curb.position.y + bounds.max.y, 0.55, `${track.id}: moving curb height`);
      }
    }
    const originalY = mesh.position.y;
    mesh.position.y += 1.75;
    mesh.updateMatrixWorld(true);
    for (const curb of curbs) {
      close(curb.getWorldPosition(new THREE.Vector3()).y, curb.position.y + originalY + 1.75, `${track.id}: curb follows lift`);
    }
    mesh.position.y = originalY;
    mesh.updateMatrixWorld(true);
  }

  const troughs = track.platforms.filter((p) => p.kind === "trough");
  const channels = group.children.filter((node) => node.name === "parabolic-stone-trough");
  assert.equal(channels.length, troughs.length, `${track.id}: trough rendering`);
  channels.forEach((channel, index) => {
    const def = troughs[index];
    const positions = channel.children[0].geometry.attributes.position;
    const centerTop = [];
    const edgeTop = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      if (Math.abs(x) < 0.00001) centerTop.push(y);
      if (Math.abs(Math.abs(x) - def.w / 2) < 0.00001) edgeTop.push(y);
    }
    close(Math.max(...centerTop), 0, `${track.id}: trough center floor`);
    close(Math.max(...edgeTop), 0.6, `${track.id}: trough edge floor`);
    for (const wall of [channel.children[1], channel.children[3]]) {
      wall.geometry.computeBoundingBox();
      close(wall.geometry.boundingBox.max.y, 1.35, `${track.id}: trough wall height`);
    }
  });

  assert.ok(dynamicMeshes.floaters.length >= 8, `${track.id}: valley coverage`);
  for (const { mesh } of dynamicMeshes.floaters) {
    const bounds = new THREE.Box3().setFromObject(mesh, true);
    if (bounds.max.x < 0) {
      assert.ok(bounds.max.x <= -22 && bounds.min.x >= -38, `${track.id}: left scenery enters route or exceeds valley`);
    } else {
      assert.ok(bounds.min.x >= 22 && bounds.max.x <= 38, `${track.id}: right scenery enters route or exceeds valley`);
    }
  }
  results.push({ track: track.id, lifts: elevators.length, troughs: troughs.length,
    pins: dynamicMeshes.rollingPins.length, bumpers: dynamicMeshes.bumpers.length,
    vents: dynamicMeshes.steamVents.length, flails: dynamicMeshes.hammers.filter(h => h.def.variant === 'flail').length,
    cliffs: dynamicMeshes.floaters.length, meshes, vertices });
}

// A connected side route must have a doorway; a deck at another elevation must not.
const deck = { kind: "grass", x: 0, y: 2, z: 0, w: 6, d: 8 };
const route = { kind: "wood", x: 5, y: 2, z: 1, w: 4, d: 2 };
assert.deepEqual(getSideWallOpenings(deck, [deck, route], 1), [[-0.2, 2.2]]);
assert.deepEqual(getSideWallOpenings(deck, [deck, route], -1), []);
assert.deepEqual(getSideWallOpenings(deck, [deck, { ...route, y: 4 }], 1), []);

// A Z connector opens its real X footprint; a remote/higher deck leaves the end solid.
const endDeck = { kind: 'grass', x: 0, y: 2, z: 0, w: 8, d: 6 };
const endRoute = { kind: 'wood', x: 1, y: 2, z: -5, w: 2, d: 4 };
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck, endRoute], -1), [[-0.2, 2.2]]);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck, endRoute], 1), []);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck, { ...endRoute, y: 4 }], -1), []);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck], -1, [{ x: -1, y: 2, z: -5, r: 3 }]), [[-2.25, 0.25]]);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck], -1, [{ x: -1, y: 4, z: -5, r: 3 }]), []);

console.table(results);
console.log(`Passed Node structural checks for all ${TRACKS.length} scenes. WebGL visual appearance remains unverified.`);
