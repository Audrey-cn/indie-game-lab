import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { TRACKS } from '../src/config.mjs';
import { getRouteRibbonRows, getChuteShellRows, getCompanionChute, polylineLength } from '../src/course-math.mjs';
import { createCameraOcclusion, isCameraOccluder } from '../src/camera-occlusion.mjs';

const moduleURL = new URL('../src/world-landmarks-v42.mjs', import.meta.url);
assert(existsSync(moduleURL), 'Missing src/world-landmarks-v42.mjs');
const { populateStageV42Landmarks, animateStageV42Landmarks } = await import(moduleURL);
assert.equal(typeof populateStageV42Landmarks, 'function');
assert.equal(typeof animateStageV42Landmarks, 'function');

const expectedKinds = {
  academy: ['storybook-watermill', 'flower-stone-arch', 'brook-windmill'],
  garden: ['towering-bookcase', 'glowing-floor-lamp', 'toy-castle', 'toy-train-viaduct'],
  honey: ['striped-market-stalls', 'bread-oven-chimney', 'tiered-town-fountain'],
  mushroom: ['gothic-waterfall-arch'],
  clockwork: ['copper-pot-hood'],
  pendulum: ['gilded-clocktower', 'smoking-rooftop-chimney', 'gothic-bell-gable'],
  foundry: ['emerald-sky-pagoda', 'pastel-cloud-ring', 'sky-windmill'],
  aurora: ['snowy-attic-gable', 'turquoise-ice-arch', 'pastel-aurora-ribbons'],
  prism: ['floating-planetary-rings'],
  sanctum: ['golden-sanctum-towers', 'festival-sky-lanterns', 'starlight-firework-rings'],
};
const movingKinds = new Set(['storybook-watermill', 'brook-windmill', 'gilded-clocktower', 'sky-windmill',
  'pastel-aurora-ribbons', 'floating-planetary-rings', 'festival-sky-lanterns', 'starlight-firework-rings']);
assert.deepEqual(TRACKS.map(track => track.id), Object.keys(expectedKinds), 'Verify the actual ten stage IDs');

// Match cel-builder's material factory without importing its browser texture URLs.
const materialCalls = [];
function toonMat(color, emissive = 0x000000, emissiveIntensity = 0) {
  materialCalls.push({ color, emissive, emissiveIntensity });
  return new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity });
}
const counts = { stages: 0, placements: 0, meshes: 0, geometries: 0, clearanceChecks: 0,
  animatedFrames: 0, sweptVertices: 0, rejectedCandidates: 0 };
const checkedGeometry = new Set(), vector = new THREE.Vector3();
const finite = (values, message) => assert(values.every(Number.isFinite), message);
const near = (a, b, message, tolerance = 1e-6) => assert(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
const bounds2 = polygon => ({ minX: Math.min(...polygon.map(p => p.x)), maxX: Math.max(...polygon.map(p => p.x)),
  minZ: Math.min(...polygon.map(p => p.z)), maxZ: Math.max(...polygon.map(p => p.z)) });

// Independent SAT over the rendered floor triangles. This deliberately does not
// trust the landmark's claimed radius or a nominal centerline/width clearance.
function overlap(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], nx = q.z - p.z, nz = p.x - q.x;
    if (Math.hypot(nx, nz) < 1e-9) continue;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const v of a) { const d = v.x * nx + v.z * nz; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
    for (const v of b) { const d = v.x * nx + v.z * nz; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
    if (aMax <= bMin + 1e-7 || bMax <= aMin + 1e-7) return false;
  }
  return true;
}
function independentFloorClearance(track) {
  const cells = new Map(), size = 16;
  const register = polygon => {
    const bounds = bounds2(polygon), entry = { polygon, bounds };
    for (let x = Math.floor(bounds.minX / size); x <= Math.floor(bounds.maxX / size); x++)
      for (let z = Math.floor(bounds.minZ / size); z <= Math.floor(bounds.maxZ / size); z++) {
        const key = `${x}/${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(entry);
      }
  };
  const chutes = track.chutes || [];
  for (const [paths, shell] of [[track.routes || [], false],
    [[...chutes, ...chutes.filter(chute => chute.doubleHelix).map(getCompanionChute)], true]]) {
    for (const path of paths) {
      const { rows, columns } = shell ? getChuteShellRows(path) : getRouteRibbonRows(path);
      for (let i = 1; i < rows.length; i++) for (let j = 1; j <= columns; j++) {
        const a = rows[i - 1][j - 1], b = rows[i - 1][j], c = rows[i][j - 1], d = rows[i][j];
        register([a, b, c]); register([b, d, c]);
      }
    }
  }
  for (const p of track.platforms || []) register([
    { x: p.x - p.w / 2, z: p.z - p.d / 2 }, { x: p.x + p.w / 2, z: p.z - p.d / 2 },
    { x: p.x + p.w / 2, z: p.z + p.d / 2 }, { x: p.x - p.w / 2, z: p.z + p.d / 2 },
  ]);
  return footprint => {
    assert(Array.isArray(footprint) && footprint.length >= 3, 'Clearance requires a complete polygon');
    for (const p of footprint) finite([p.x, p.z], 'Non-finite clearance polygon');
    const bounds = bounds2(footprint), seen = new Set();
    for (let x = Math.floor(bounds.minX / size); x <= Math.floor(bounds.maxX / size); x++)
      for (let z = Math.floor(bounds.minZ / size); z <= Math.floor(bounds.maxZ / size); z++)
        for (const entry of cells.get(`${x}/${z}`) || []) {
          if (seen.has(entry)) continue;
          seen.add(entry);
          const b = entry.bounds;
          if (bounds.maxX < b.minX || bounds.minX > b.maxX || bounds.maxZ < b.minZ || bounds.minZ > b.maxZ) continue;
          if (overlap(footprint, entry.polygon)) return false;
        }
    return true;
  };
}
function verifyTransforms(group) {
  group.updateMatrixWorld(true);
  group.traverse(node => {
    finite([...node.position.toArray(), ...node.scale.toArray(), ...node.quaternion.toArray(),
      ...node.matrixWorld.elements], `${node.name}: non-finite transform`);
    assert(node.scale.x > 0 && node.scale.y > 0 && node.scale.z > 0, `${node.name}: collapsed or mirrored geometry`);
  });
}
function verifyGeometry(group) {
  verifyTransforms(group);
  group.traverse(node => {
    assert.equal(node.userData.occludable, true, `${node.name}: missing occludable flag`);
    assert.equal(node.userData.cameraOcclusionStructure, true, `${node.name}: missing runtime cutaway flag`);
    if (!node.isMesh) return;
    counts.meshes++;
    assert(isCameraOccluder(node, group), `${node.name}: existing camera system ignores landmark`);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      assert(material?.isMeshToonMaterial, `${node.name}: not cel shaded`);
      finite([material.opacity, material.emissiveIntensity], `${node.name}: invalid material`);
    }
    const geometry = node.geometry;
    assert(geometry?.isBufferGeometry && geometry.getAttribute('position')?.count > 0, `${node.name}: empty geometry`);
    if (checkedGeometry.has(geometry)) return;
    checkedGeometry.add(geometry); counts.geometries++;
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      assert(attribute.count > 0, `${node.name}: empty ${name} attribute`);
      for (const n of attribute.array) assert(Number.isFinite(n), `${node.name}: non-finite ${name}`);
    }
    if (geometry.index) for (const index of geometry.index.array)
      assert(Number.isInteger(index) && index >= 0 && index < geometry.attributes.position.count, 'Invalid geometry index');
    geometry.computeBoundingSphere();
    assert(Number.isFinite(geometry.boundingSphere.radius) && geometry.boundingSphere.radius > 0, 'Invalid geometry bound');
  });
  assert(!new THREE.Box3().setFromObject(group).isEmpty(), 'Empty landmark scene');
}
function verifySweptGeometry(group, clear) {
  verifyTransforms(group);
  for (const placement of group.userData.placements) {
    assert(clear(placement.footprint), `${placement.stageId}/${placement.kind}: approved footprint enters a floor`);
    const bounds = bounds2(placement.footprint), tolerance = 2e-5;
    placement.mesh.traverse(node => {
      if (!node.isMesh) return;
      const position = node.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        vector.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
        assert(vector.x >= bounds.minX - tolerance && vector.x <= bounds.maxX + tolerance
          && vector.z >= bounds.minZ - tolerance && vector.z <= bounds.maxZ + tolerance,
        `${placement.stageId}/${placement.kind}/${node.name}: actual animated vertex escaped its clearance footprint`);
        counts.sweptVertices++;
      }
    });
  }
}
function signature(group) {
  return group.userData.placements.map(p => [p.stageId, p.kind, p.routeId, p.actId, p.side, p.alongRoute, p.radius,
    p.footprint, p.mesh.position.toArray(), p.mesh.rotation.toArray(), p.mesh.scale.toArray()]);
}
function transform(mesh) {
  return { position: mesh.position.clone(), quaternion: mesh.quaternion.clone(), scale: mesh.scale.clone() };
}
function verifyAnimationRates(dynamic, group) {
  const entries = dynamic.v42LandmarkAnimations;
  assert(Array.isArray(entries), 'Stage has no animation registry');
  if (!entries.length) {
    animateStageV42Landmarks(dynamic, 2, 1 / 60);
    verifyTransforms(group);
    return;
  }
  const initial = entries.map(entry => transform(entry.mesh));
  const results = [];
  for (const hz of [25, 60, 120]) {
    entries.forEach(({ mesh }, i) => { mesh.position.copy(initial[i].position); mesh.quaternion.copy(initial[i].quaternion); mesh.scale.copy(initial[i].scale); });
    animateStageV42Landmarks(dynamic, 0, 0);
    const motion = entries.map(() => 0);
    for (let i = 1; i <= hz * 2; i++) {
      const before = entries.map(entry => transform(entry.mesh));
      animateStageV42Landmarks(dynamic, i / hz, 1 / hz);
      entries.forEach(({ mesh }, j) => {
        finite([...mesh.position.toArray(), ...mesh.quaternion.toArray(), ...mesh.scale.toArray()], 'Invalid animation');
        const translation = mesh.position.distanceTo(before[j].position), rotation = mesh.quaternion.angleTo(before[j].quaternion);
        const scaling = mesh.scale.distanceTo(before[j].scale);
        assert(translation <= .35 && rotation <= .35 && scaling <= .35, `${entries[j].kind}: discontinuous ${hz}Hz animation`);
        motion[j] += translation + rotation + scaling;
      });
      counts.animatedFrames++;
    }
    assert(motion.some(distance => distance > .001), 'Animation registry never moves');
    results.push(entries.map(entry => transform(entry.mesh)));
  }
  for (const result of results.slice(1)) result.forEach((pose, i) => {
    near(pose.position.distanceTo(results[0][i].position), 0, 'Frame-dependent position', 2e-5);
    near(pose.quaternion.angleTo(results[0][i].quaternion), 0, 'Frame-dependent rotation', 2e-5);
    near(pose.scale.distanceTo(results[0][i].scale), 0, 'Frame-dependent scale', 2e-5);
  });
  verifyTransforms(group);
}

let cameraFixture;
for (const track of TRACKS) {
  const before = JSON.stringify(track), parent = new THREE.Group(), clear = independentFloorClearance(track);
  const sentinel = { preserved: true }, dynamic = { landmarkSpinners: [sentinel], unrelated: sentinel };
  const approved = new Set();
  const group = populateStageV42Landmarks(THREE, track, parent, dynamic, toonMat, { isClear(footprint) {
    counts.clearanceChecks++;
    const ok = clear(footprint);
    if (ok) approved.add(JSON.stringify(footprint));
    return ok;
  } });
  assert(group instanceof THREE.Group && group.parent === parent, `${track.id}: factory did not attach and return a Group`);
  assert.equal(group.name, 'stage-v42-landmarks');
  assert.equal(dynamic.v42Landmarks, group);
  assert.equal(dynamic.unrelated, sentinel); assert.deepEqual(dynamic.landmarkSpinners, [sentinel]);
  assert(Array.isArray(group.userData.placements) && group.userData.placements.length > 0, `${track.id}: empty landmarks`);
  assert.equal(group.userData.placements.length, group.children.length, 'Placement receipts omit landmark groups');
  const kinds = new Set(), paths = [...track.routes, ...track.chutes];
  for (const placement of group.userData.placements) {
    assert.equal(placement.stageId, track.id);
    kinds.add(placement.kind);
    assert(placement.mesh instanceof THREE.Group && placement.mesh.parent === group, 'Invalid placement group');
    assert([-1, 1].includes(placement.side));
    finite([placement.alongRoute, placement.radius], 'Invalid placement metrics');
    assert(placement.radius > 0);
    const path = paths.find(path => path.id === placement.routeId);
    assert(path, `${track.id}: unknown source route ${placement.routeId}`);
    assert(placement.alongRoute >= -1e-6 && placement.alongRoute <= polylineLength(path.points) + 1e-5, 'Placement exceeds source route');
    assert(approved.has(JSON.stringify(placement.footprint)), 'A rejected or unchecked footprint was published');
    if (movingKinds.has(placement.kind)) assert(dynamic.v42LandmarkAnimations.some(({ mesh }) => {
      for (let node = mesh; node; node = node.parent) if (node === placement.mesh) return true;
      return false;
    }), `${track.id}/${placement.kind}: requested moving setpiece has no registered animation`);
  }
  for (const kind of expectedKinds[track.id]) assert(kinds.has(kind), `${track.id}: missing ${kind}`);
  for (const route of paths.filter(route => route.points.length > 1)) {
    const along = group.userData.placements.filter(p => p.routeId === route.id).map(p => p.alongRoute).sort((a, b) => a - b);
    assert(along.length > 0, `${track.id}/${route.id}: route has no setpiece sights`);
    const length = polylineLength(route.points), intervals = [along[0], ...along.slice(1).map((d, i) => d - along[i]), length - along.at(-1)];
    const maximumSpacing = track.flagship ? 64 : 38;
    assert(Math.max(...intervals) <= maximumSpacing + 1e-5,
      `${track.id}/${route.id}: empty landmark stretch exceeds ${maximumSpacing}m`);
  }
  const initialSignature = signature(group);
  verifyGeometry(group);
  verifySweptGeometry(group, clear);
  verifyAnimationRates(dynamic, group);
  for (const elapsed of [2.25, 4.7, 11, 61, 3600]) {
    animateStageV42Landmarks(dynamic, elapsed, 1 / 60);
    verifySweptGeometry(group, clear);
  }
  const second = populateStageV42Landmarks(THREE, track, new THREE.Group(), {}, toonMat);
  assert.deepEqual(initialSignature, signature(second), `${track.id}: placement is not deterministic`);
  assert.equal(JSON.stringify(track), before, `${track.id}: factory mutated authored course data`);
  counts.stages++; counts.placements += group.userData.placements.length;
  if (!cameraFixture) cameraFixture = group.children[0];
  console.log(`PASS ${track.id}: ${group.children.length} landmark groups, ${dynamic.v42LandmarkAnimations.length} animated parts`);
}

// A callback veto must win even when the internal geometric check passes.
const rejectionTrack = { id: 'academy', routes: [{ id: 'fixture-straight', width: 4, points: [
  { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -90 }] }], chutes: [], platforms: [], acts: [] };
let vetoCalls = 0;
const rejectedDynamic = {}, rejected = populateStageV42Landmarks(THREE, rejectionTrack, new THREE.Group(), rejectedDynamic, toonMat,
  { isClear(footprint) { assert(footprint.length >= 3); vetoCalls++; return false; } });
assert(vetoCalls > 0, 'External clearance callback was never consulted');
assert.equal(rejected.children.length, 0, 'Vetoed landmarks attached to scene');
assert.equal(rejected.userData.placements.length, 0);
assert.equal(rejectedDynamic.v42LandmarkAnimations.length, 0, 'Rejected landmarks leaked animation entries');
assert(rejected.userData.rejectedCount > 0, 'Rejected placement count missing');
counts.rejectedCandidates += vetoCalls;

let retryCalls = 0;
const accepted = new Set(), retried = populateStageV42Landmarks(THREE, rejectionTrack, new THREE.Group(), {}, toonMat,
  { isClear(footprint) { retryCalls++; const ok = retryCalls > 3; if (ok) accepted.add(JSON.stringify(footprint)); return ok; } });
assert(retryCalls > 3 && retried.children.length > 0, 'Clearance rejections prevented all later safe placements');
for (const placement of retried.userData.placements) assert(accepted.has(JSON.stringify(placement.footprint)), 'Retry published an unapproved footprint');

// Test camera behavior on an actual landmark clone, aiming through a real
// surface triangle so a hollow arch/ring cannot accidentally miss the test ray.
const cameraRoot = new THREE.Group(), fixture = cameraFixture.clone(true); cameraRoot.add(fixture);
cameraRoot.updateMatrixWorld(true);
let target, triangle;
fixture.traverse(mesh => {
  if (target || !mesh.isMesh) return;
  const position = mesh.geometry.attributes.position, indices = mesh.geometry.index;
  for (let i = 0; i + 2 < (indices?.count ?? position.count); i += 3) {
    const vertices = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, indices ? indices.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
    const normal = new THREE.Vector3().subVectors(vertices[1], vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2], vertices[0]));
    if (normal.length() < .1) continue;
    target = mesh; triangle = { center: vertices[0].add(vertices[1]).add(vertices[2]).divideScalar(3), normal: normal.normalize() }; break;
  }
});
assert(target && triangle, 'No substantial landmark surface for camera test');
const ballPosition = triangle.center.clone().addScaledVector(triangle.normal, -6);
const cameraPosition = triangle.center.clone().addScaledVector(triangle.normal, 6);
const original = target.material, safety = createCameraOcclusion(cameraRoot);
for (let i = 0; i < 60; i++) safety.update({ ...ballPosition, r: .62 }, cameraPosition, 1 / 60);
assert((Array.isArray(target.material) ? target.material : [target.material]).some(material => material.transparent && material.opacity < .99),
  'Landmark blocking the camera did not fade through the existing camera system');
safety.dispose(); assert.equal(target.material, original, 'Camera teardown did not restore landmark material');

assert(materialCalls.some(call => call.emissive === call.color && call.emissiveIntensity > 0), 'No glowing material reached toonMat');
assert.doesNotThrow(() => animateStageV42Landmarks({}, 1, 1 / 60), 'Animation must tolerate absent landmark entries');
assert.doesNotThrow(() => animateStageV42Landmarks({ v42LandmarkAnimations: [] }, 1, 1 / 60));
console.log(`PASS v4.2 landmarks: ${JSON.stringify(counts)}`);
