// Node-only scene structure and geometry checks. This does not render WebGL or
// validate lighting, textures, frame rate, visual appearance, or runtime physics.
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildTrackScene, getSideWallOpenings } from "../src/cel-builder.mjs";
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
for (const track of TRACKS) {
  const { group, dynamicMeshes } = buildTrackScene(track);
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
  results.push({ track: track.id, lifts: elevators.length, troughs: troughs.length, cliffs: dynamicMeshes.floaters.length, meshes, vertices });
}

// A connected side route must have a doorway; a deck at another elevation must not.
const deck = { kind: "grass", x: 0, y: 2, z: 0, w: 6, d: 8 };
const route = { kind: "wood", x: 5, y: 2, z: 1, w: 4, d: 2 };
assert.deepEqual(getSideWallOpenings(deck, [deck, route], 1), [[-0.2, 2.2]]);
assert.deepEqual(getSideWallOpenings(deck, [deck, route], -1), []);
assert.deepEqual(getSideWallOpenings(deck, [deck, { ...route, y: 4 }], 1), []);

console.table(results);
console.log(`Passed Node structural checks for all ${TRACKS.length} scenes. WebGL visual appearance remains unverified.`);
