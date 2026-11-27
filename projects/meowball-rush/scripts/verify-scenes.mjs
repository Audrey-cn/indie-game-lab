// Node-only scene structure and geometry checks. This does not render WebGL or
// validate lighting, textures, frame rate, visual appearance, or runtime physics.
import assert from "node:assert/strict";
import * as THREE from "three";
import "./verify-assets.mjs";
const { buildTrackScene, getSideWallOpenings, getEndWallOpenings } = await import("../src/cel-builder.mjs");
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
function isAttached(node, root) {
  for (let p = node; p; p = p.parent) if (p === root) return true;
  return false;
}
function checkGeometry(geometry, label, strict = false) {
  const positions = geometry?.attributes?.position;
  assert.ok(positions && positions.count > 0, `${label}: empty geometry`);
  assert.ok(positions.array.every(Number.isFinite), `${label}: non-finite vertices`);
  if (geometry.attributes.normal) assert.ok(geometry.attributes.normal.array.every(Number.isFinite), `${label}: invalid normals`);
  if (geometry.attributes.uv) assert.ok(geometry.attributes.uv.array.every(Number.isFinite), `${label}: invalid UV coordinates`);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  for (const v of [...geometry.boundingBox.min.toArray(), ...geometry.boundingBox.max.toArray(), geometry.boundingSphere.radius]) assert.ok(Number.isFinite(v), `${label}: invalid bounds`);
  assert.ok(geometry.boundingSphere.radius > 0, `${label}: collapsed geometry`);
  const index = geometry.index;
  if (index) for (const value of index.array) assert.ok(Number.isInteger(value) && value >= 0 && value < positions.count, `${label}: invalid triangle index ${value}`);
  const count = index?.count ?? positions.count;
  assert.equal(count % 3, 0, `${label}: incomplete triangle`);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0, collapsed = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(i) : i);
    b.fromBufferAttribute(positions, index ? index.getX(i+1) : i+1);
    c.fromBufferAttribute(positions, index ? index.getX(i+2) : i+2);
    const triangleArea = b.sub(a).cross(c.sub(a)).lengthSq();
    if (triangleArea <= 1e-14) collapsed++; else area += triangleArea;
  }
  assert.ok(area > 0, `${label}: no nondegenerate triangles`);
  if (strict) assert.equal(collapsed, 0, `${label}: collapsed authored ribbon triangles`);
  return positions.count;
}
const expectedWorlds = ['grounded_nature','indoor_home','town_street','grounded_nature','indoor_home','town_street','sky_floating','hybrid_winter','starlight_library','grand_medley'];
assert.equal(TRACKS.length, 10, 'v3 needs all ten approved stages');
for (const [stage, track] of TRACKS.entries()) {
  assert.equal(track.worldType, expectedWorlds[stage], `${track.id}: wrong blueprint environment`);
  const { group, dynamicMeshes } = buildTrackScene(track);
  verifyHazardEntries(track, dynamicMeshes);
  group.updateMatrixWorld(true);
  let meshes = 0, vertices = 0;
  group.traverse((node) => {
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), `${track.id}: invalid transform`);
    if (!node.isMesh) return;
    meshes++;
    vertices += checkGeometry(node.geometry, `${track.id}/${node.name || node.type}`, node.userData?.courseRibbon === true);
  });
  const world = group.getObjectByName(`v3-world-${track.worldType}`);
  assert.ok(world, `${track.id}: missing authentic world environment`);
  assert.ok(world.children.length >= 3, `${track.id}: empty environment dressing`);
  assert.ok(Array.isArray(dynamicMeshes.fairytaleProps), `${track.id}: missing interactive prop registration`);
  assert.equal(dynamicMeshes.fairytaleProps.length, (track.props || []).length, `${track.id}: interactive prop count`);
  for (const entry of dynamicMeshes.fairytaleProps) {
    assert.ok(track.props.includes(entry.def), `${track.id}: orphan prop definition`);
    assert.ok(isAttached(entry.mesh, group), `${track.id}/${entry.def.type}: prop is detached`);
    let propMeshes=0;entry.mesh.traverse(node=>{if(node.isMesh)propMeshes++;});
    assert.ok(propMeshes >= 2, `${track.id}/${entry.def.type}: missing sculpted prop parts`);
    close(entry.mesh.position.x, entry.def.x, `${track.id}: prop X`);
    close(entry.mesh.position.y, entry.def.y, `${track.id}: prop Y`);
    close(entry.mesh.position.z, entry.def.z, `${track.id}: prop Z`);
  }
  assert.ok(Array.isArray(dynamicMeshes.chutes), `${track.id}: missing chute registration`);
  assert.equal(dynamicMeshes.chutes.length, (track.chutes || []).length, `${track.id}: chute count`);
  for (const entry of dynamicMeshes.chutes) {
    assert.ok(track.chutes.includes(entry.def), `${track.id}: orphan chute definition`);
    assert.ok(isAttached(entry.mesh, group), `${track.id}: detached chute`);
    let translucent = 0, surfaceMeshes = 0;
    entry.mesh.traverse(node => {if (node.isMesh) {
      surfaceMeshes++;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      translucent += mats.filter(m => m.transparent && m.opacity > 0.15 && m.opacity < 1).length;
    }});
    assert.ok(surfaceMeshes >= 3, `${track.id}: chute lacks halfpipe and guard structure`);
    if (entry.def.material !== 'oak') assert.ok(translucent, `${track.id}: missing translucent chute material`);
    assert.ok(entry.rings?.length >= 3, `${track.id}: missing animated chute sparkle rings`);
    const bounds = new THREE.Box3().setFromObject(entry.mesh, true);
    for (const point of [entry.def.points[0], entry.def.points.at(-1)]) assert.ok(bounds.clone().expandByScalar(0.1).containsPoint(new THREE.Vector3(point.x, point.y, point.z)), `${track.id}: rendered chute misses its physics endpoint`);
  }
  for (const route of track.routes || []) {
    const mesh = group.getObjectByName(`route-${route.id}`);
    assert.ok(mesh, `${track.id}/${route.id}: missing continuous route ribbon`);
    assert.ok(isAttached(mesh, group));
  }
  if (track.worldType === 'grounded_nature') {
    assert.ok(world.getObjectByName('grounded-terrain'), `${track.id}: grounded valley has no surrounding terrain`);
    assert.ok(world.getObjectByName('valley-stream'), `${track.id}: grounded valley lacks its stream`);
  }
  if (track.worldType === 'indoor_home') {
    assert.ok(world.getObjectByName('room-floor'), `${track.id}: miniature room floor missing`);
    assert.ok(world.getObjectByName('sunlit-window'), `${track.id}: sunlit room window missing`);
  }
  if (track.worldType === 'town_street') {
    assert.ok(world.getObjectByName('town-canal'), `${track.id}: town canal missing`);
    assert.ok(world.getObjectByName('half-timbered-house'), `${track.id}: pastel half-timbered houses missing`);
  }
  results.push({stage:stage+1, track:track.id, world:track.worldType, routes:track.routes.length,
    chutes:dynamicMeshes.chutes.length, props:dynamicMeshes.fairytaleProps.length, meshes, vertices});
  const disposed = new Set();
  group.traverse(node=>{if(node.geometry && !disposed.has(node.geometry)){disposed.add(node.geometry);node.geometry.dispose();}});
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
console.log(`Passed v3 Node structural and geometry checks for all ${TRACKS.length} scenes. WebGL visual appearance remains unverified.`);
