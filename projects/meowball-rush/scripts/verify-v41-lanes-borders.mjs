// Node-only authoring/geometry regressions. No WebGL rendering or input-driving
// gameplay is implied: config/main integration belongs to the parallel worker.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BALL_RADIUS, PLAYABLE_LANE_WIDTH, MIN_SAFE_PASSING_WIDTH, LANE_WIDTHS,
  difficultyProfileForStage, placeLaneBlockingHazards, auditLaneThreat } from '../src/lane-difficulty.mjs';
import { buildDenseTracksideCluster, populateForestDensityBorders } from '../src/forest-density-borders.mjs';
import { GUARDED_CLEAR_WIDTH, getRouteRibbonRows, prepareRouteGeometry, getRouteFloorTriangles } from '../src/course-math.mjs';
import { fairytalePropPosition, spikeState } from '../src/course-runtime.mjs';
import { isCameraOccluder, createCameraOcclusion } from '../src/camera-occlusion.mjs';
import { TRACKS } from '../src/config.mjs';

const close = (actual, expected, label, epsilon = 1e-5) => assert(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} != ${expected}`);
const counts = { stages: 0, corridors: 0, hazards: 0, motionSamples: 0, clusters: 0, meshes: 0,
  borderPlacements: 0, authoredTracks: 0, authoredBorders: 0, authoredHazards: 0 };
assert.equal(BALL_RADIUS, .62); assert.equal(PLAYABLE_LANE_WIDTH, 1.45);
close(GUARDED_CLEAR_WIDTH, 2.84, 'Existing guard convention');
assert.deepEqual(LANE_WIDTHS, { narrow2: 2.95, tight2: 3.25, standard3: 4.35, wideMud: 5.8, plaza: 6.8 });
let previous;
for (let stage = 0; stage < 10; stage++) {
  const profile = difficultyProfileForStage(stage);
  close(Object.values(profile.roadWidthMix).reduce((a, b) => a + b, 0), 1, 'Width mix sums to one');
  assert(Object.values(profile.roadWidthMix).every(share => share > 0 && share < 1));
  assert(profile.challengeCorridorWidth >= 4.2 && profile.challengeCorridorWidth <= 4.35);
  if (previous) {
    for (const key of ['trapDensityMultiplier', 'spikeCycleSpeed', 'pendulumSweepSpeed', 'twoLaneShare', 'threeLaneShare'])
      assert(profile[key] > previous[key], `Stage ${stage + 1} must strictly increase ${key}`);
    assert(profile.targetRoadWidth < previous.targetRoadWidth);
    assert(profile.challengeCorridorWidth < previous.challengeCorridorWidth);
    assert(profile.minHazardSpacing < previous.minHazardSpacing);
  }
  previous = profile; counts.stages++;
}
assert.equal(difficultyProfileForStage(0).trapDensityMultiplier, 1);
assert.equal(difficultyProfileForStage(9).trapDensityMultiplier, 2.6);
for (const bad of [-1, 10, .5, NaN]) assert.throws(() => difficultyProfileForStage(bad), RangeError);

function corridor(width, angle = 0, bank = 0, length = 120) {
  return { id: `lane-${width}-${angle}-${bank}`, width, kind: 'wood', walls: true, bank,
    points: [{ x: 0, y: 8, z: 0 }, { x: Math.sin(angle) * length, y: 8, z: -Math.cos(angle) * length }] };
}
function gapsFor(left, right, spans) {
  const gaps = []; let cursor = left;
  for (const [a, b] of spans.sort((a, b) => a[0] - b[0])) {
    if (a > cursor) gaps.push([cursor, Math.min(a, right)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < right) gaps.push([cursor, right]);
  return gaps.filter(([a, b]) => b > a);
}
// Independent of the audit's claimed intervals: inspect actual current-runtime
// world-X motion and .92 hammer collider across complete animation cycles.
function verifyMotion(route, hazards, angle, stageIndex) {
  const nx = Math.cos(angle), nz = Math.sin(angle), width = route.width;
  for (const hazard of hazards) {
    const laneCount = width <= 3.4 ? 2 : 3;
    assert((laneCount === 2 ? [-1, 1] : [-1, 0, 1]).includes(hazard.laneSlot));
    for (let i = 0; i <= 72; i++) {
      const time = i / 72 * Math.PI * 2 / (hazard.speed || 1);
      let position = hazard, radius = hazard.r;
      if (hazard.kind === 'pendulum') {
        const swing = Math.sin(time * hazard.speed + hazard.phase) * hazard.amp;
        if (hazard.swingMode === 'tangent' && Number.isFinite(hazard.tx) && Number.isFinite(hazard.tz)) {
          position = { ...hazard, x: hazard.x + hazard.tx * Math.sin(swing) * hazard.len,
            y: hazard.y - Math.cos(swing) * hazard.len, z: hazard.z + hazard.tz * Math.sin(swing) * hazard.len };
        } else {
          position = { ...hazard, x: hazard.x + Math.sin(swing) * hazard.len, y: hazard.y - Math.cos(swing) * hazard.len };
        }
        radius = .92;
      } else if (hazard.kind === 'critter') position = fairytalePropPosition(hazard, time);
      const center = position.x * nx + position.z * nz;
      const gaps = gapsFor(-width / 2, width / 2, [[center - radius, center + radius]]);
      const safe = gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
      assert(safe && safe[1] - safe[0] >= MIN_SAFE_PASSING_WIDTH - 2e-5, `Moving ${hazard.kind} seals ${width}m road`);
      const passCenter = (safe[0] + safe[1]) / 2;
      assert(Math.abs(passCenter - center) >= radius + BALL_RADIUS - 2e-5, 'Safe line clips a runtime collider');
      // Every legal ball center in the occupied lane must meet the body. A tiny
      // outer decoration with a decorative laneSlot cannot satisfy this check.
      const laneWidth = width / laneCount;
      const laneCenter = hazard.laneSlot < 0 ? -width / 2 + laneWidth / 2
        : hazard.laneSlot > 0 ? width / 2 - laneWidth / 2 : 0;
      for (const lateral of [laneCenter - laneWidth / 2 + BALL_RADIUS, laneCenter, laneCenter + laneWidth / 2 - BALL_RADIUS])
        assert(Math.abs(lateral - center) < radius + BALL_RADIUS, `${hazard.kind} does not block its playable lane`);
      counts.motionSamples++;
    }
    if (hazard.kind === 'spike') {
      assert(hazard.telegraph >= .55, 'Later stages must preserve the readable warning');
      assert(hazard.retractDuration > 0);
      const period = hazard.telegraph + hazard.activeDuration + hazard.retractDuration;
      close(period, 3.45 / difficultyProfileForStage(stageIndex).spikeCycleSpeed, 'Spike cycle speed');
      const states = Array.from({ length: 100 }, (_, i) => spikeState(hazard, i * period / 100));
      assert(states.some(s => s.active) && states.some(s => s.warning) && states.some(s => !s.active && !s.warning));
    }
  }
}
for (let stageIndex = 0; stageIndex < 10; stageIndex++) for (const width of [2.95, 3.25, 4.2, 4.35, 4.6])
  for (const angle of [0, .7, Math.PI / 2]) for (const bank of [0, .35]) {
    const route = corridor(width, angle, bank), before = JSON.stringify(route);
    const hazards = placeLaneBlockingHazards(route, { stageIndex, count: 8 });
    assert.equal(hazards.length, 8, 'Straight challenge corridor lost requested hazards');
    assert.equal(JSON.stringify(route), before, 'Lane authoring mutated a shared route');
    assert.deepEqual(placeLaneBlockingHazards(route, { stageIndex, count: 8 }), hazards, 'Placement must be deterministic');
    assert.equal(new Set(hazards.map(h => h.kind)).size, 4);
    assert.equal(new Set(hazards.map(h => h.laneSlot)).size, width <= 3.4 ? 2 : 3);
    const audit = auditLaneThreat(route, hazards);
    assert(audit.ok, JSON.stringify(audit.issues));
    assert(audit.minClearWidth >= MIN_SAFE_PASSING_WIDTH - 1e-7);
    assert(audit.hazardAudits.every(h => h.fullLaneBlocked && h.meaningful));
    verifyMotion(route, hazards, angle, stageIndex);
    counts.corridors++; counts.hazards += hazards.length;
  }

const route = corridor(2.95), [valid] = placeLaneBlockingHazards(route, { count: 1, kinds: ['spikes'] });
assert(!auditLaneThreat(route, [{ ...valid, x: 30, safePassingWidth: 99 }]).ok, 'Off-road trap passed the audit');
assert(!auditLaneThreat(route, [{ ...valid, y: valid.y + 5 }]).meaningful, 'Floating trap counted as threatening');
assert(!auditLaneThreat(route, [{ ...valid, r: 2, safePassingWidth: 99 }]).safe, 'Oversized trap trusted claimed clearance');
assert(!auditLaneThreat(route, [valid, { ...valid, id: 'opposing', x: -valid.x, laneSlot: 1 }]).safe, 'Opposing traps seal the road');
assert(!auditLaneThreat(corridor(7), [valid]).meaningful, 'Wide empty field counted as a lane threat');
assert.deepEqual(placeLaneBlockingHazards(corridor(7), { count: 4 }), []);
assert.deepEqual(placeLaneBlockingHazards(corridor(2.6), { count: 4 }), []);
assert.deepEqual(placeLaneBlockingHazards(corridor(2.95, 0, 0, 3), { count: 50 }), []);
assert.deepEqual(placeLaneBlockingHazards(route, { count: 0 }), []);
assert.deepEqual(placeLaneBlockingHazards(route, { kinds: [] }), []);
assert.throws(() => placeLaneBlockingHazards(route, { count: -1 }), RangeError);
assert.throws(() => placeLaneBlockingHazards(route, { kinds: ['unknown'] }), RangeError);
assert.throws(() => placeLaneBlockingHazards({ width: 3, points: [] }), TypeError);
const bend = { id: 'tapered-bend', width: 3.25, walls: true, kind: 'wood', points: [
  { x: 0, y: 8, z: 30 }, { x: 0, y: 8, z: 0 }, { x: 30, y: 8, z: 0 }, { x: 30, y: 8, z: -30 }] };
prepareRouteGeometry([bend]);
const bentHazards = placeLaneBlockingHazards(bend, { stageIndex: 9, count: 30 });
assert(bentHazards.length > 0); assert(auditLaneThreat(bend, bentHazards).ok);
const sharedHeadings = new Set(bentHazards.map(h => `${Math.round(h.tx)},${Math.round(h.tz)}`));
assert(sharedHeadings.size >= 2, 'Bend placements did not cover both travel directions');

// Same factory signature as cel-builder.toonMat, without importing its texture
// URLs into plain Node. Explicitly check emissive arguments reach the material.
const materialCalls = [];
function toonMat(color, emissive = 0x000000, emissiveIntensity = 0) {
  materialCalls.push({ color, emissive, emissiveIntensity });
  return new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity });
}
const worldTypes = ['grounded_nature', 'indoor_home', 'town_street', 'sky_floating', 'hybrid_winter', 'cosmic_warp', 'grand_medley', 'starlight_library'];
const expectedElements = {
  grounded_nature: ['layered-roadside-bush', 'wildflower-petal', 'pine-sapling-needles', 'mossy-rock'],
  indoor_home: ['hardcover-book', 'colorful-toy-block', 'teacup', 'spice-jar', 'biscuit-tin'],
  town_street: ['timber-flower-box', 'bakery-barrel', 'glowing-lantern', 'pastel-timber-shutter'],
  sky_floating: ['pastel-cloud-puff', 'glowing-crystal-fern', 'mini-mushroom-cap'],
  hybrid_winter: ['pine-snow-cap', 'soft-snowdrift', 'warm-snow-lantern'],
  cosmic_warp: ['floating-star-crystal', 'glowing-astrolabe-ring', 'hardcover-book', 'pastel-lamppost'],
  grand_medley: ['floral-urn-bowl', 'festival-garland-lantern', 'confetti-banner'],
};
function verifyCluster(cluster, root = cluster) {
  assert(cluster instanceof THREE.Group); assert(cluster.children.length >= 10);
  const names = new Set();
  cluster.traverse(node => {
    assert(node.userData.occludable, `${node.name} missing occlusion flag`);
    assert([...node.position.toArray(), ...node.scale.toArray(), ...node.quaternion.toArray()].every(Number.isFinite));
    if (!node.isMesh) return;
    names.add(node.name); assert(isCameraOccluder(node, root), `${node.name} missing existing cutaway flag`);
    for (const attribute of Object.values(node.geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
    node.geometry.computeBoundingSphere(); assert(Number.isFinite(node.geometry.boundingSphere.radius));
    assert(node.material.isMeshToonMaterial);
    counts.meshes++;
  });
  const bounds = new THREE.Box3().setFromObject(cluster);
  assert(!bounds.isEmpty()); assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  counts.clusters++; return names;
}
// Independent SAT against actual rendered triangles, so a center-only clearance
// check cannot hide leaves/lamps protruding into another floor or stacked tier.
function overlaps(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], nx = q.z - p.z, nz = p.x - q.x;
    if (Math.hypot(nx, nz) < 1e-9) continue;
    const aa = a.map(v => v.x * nx + v.z * nz), bb = b.map(v => v.x * nx + v.z * nz);
    if (Math.max(...aa) <= Math.min(...bb) + 1e-6 || Math.max(...bb) <= Math.min(...aa) + 1e-6) return false;
  }
  return true;
}
for (const worldType of worldTypes) for (const side of [-1, 1]) {
  const a = buildDenseTracksideCluster(THREE, worldType, side, 417, toonMat);
  const names = verifyCluster(a), category = worldType === 'starlight_library' ? 'cosmic_warp' : worldType;
  for (const element of expectedElements[category]) assert(names.has(element), `${worldType} missing ${element}`);
  const b = buildDenseTracksideCluster(THREE, worldType, side, 417, toonMat);
  assert.deepEqual(a.children.map(m => [m.name, ...m.position.toArray(), ...m.scale.toArray()]), b.children.map(m => [m.name, ...m.position.toArray(), ...m.scale.toArray()]));
  assert.equal(a.scale.y, b.scale.y);
  assert.equal(a.children[0].geometry, b.children[0].geometry, 'Clusters should reuse lightweight primitives');
  assert.equal(a.children[0].material, b.children[0].material, 'Clusters should reuse toon materials');
}
assert(materialCalls.some(c => c.emissive === c.color && c.emissiveIntensity > 0));
for (const worldType of worldTypes) {
  const parent = new THREE.Group(), floor = corridor(4.35, .42, .35, 80);
  const track = { id: `density-${worldType}`, worldType, routes: [floor], chutes: [], platforms: [] };
  let callbackCalls = 0;
  const borders = populateForestDensityBorders(THREE, track, parent, toonMat, { isClear(footprint, meta) {
    assert.equal(footprint.length, 4); assert.equal(meta.route, floor); assert([-1, 1].includes(meta.side));
    callbackCalls++; return true;
  } });
  assert.equal(borders.parent, parent); assert.equal(borders.userData.borderCount, borders.children.length);
  assert.equal(callbackCalls, borders.children.length); assert(borders.children.length >= 36, `${worldType} borders are sparse`);
  const triangles = getRouteFloorTriangles(floor);
  for (const side of [-1, 1]) {
    const clusters = borders.children.filter(c => c.userData.side === side);
    assert(clusters.length >= 18, `${worldType}: one roadside missing`);
    for (let i = 1; i < clusters.length; i++) {
      const spacing = clusters[i].userData.alongEdge - clusters[i - 1].userData.alongEdge;
      assert(spacing >= 3.2 - 1e-6 && spacing <= 4.2 + 1e-6, `Border spacing is ${spacing}`);
    }
    for (const cluster of clusters) {
      verifyCluster(cluster, parent);
      const edge = cluster.userData.edge;
      close((cluster.position.x - edge.x) * edge.nx + (cluster.position.z - edge.z) * edge.nz, .55, 'Tightly hugged edge');
      const bounds = new THREE.Box3().setFromObject(cluster);
      // All geometry corners fit the registered world footprint rectangle.
      const footprint = cluster.userData.footprint;
      assert(!triangles.some(t => overlaps(footprint, [t.a, t.b, t.c])), 'A complete cluster footprint enters a rendered floor');
      assert(!bounds.isEmpty()); counts.borderPlacements++;
    }
  }
}
const rejectedRoot = new THREE.Group();
const rejected = populateForestDensityBorders(THREE, { id: 'reject', worldType: 'grounded_nature', routes: [corridor(3.25)] }, rejectedRoot, toonMat, { isClear: () => false });
assert.equal(rejected.children.length, 0); assert(rejected.userData.rejectedCount > 0, 'Clearance callback was ignored');
const empty = populateForestDensityBorders(THREE, { worldType: 'indoor_home', routes: [] }, new THREE.Group(), toonMat);
assert.equal(empty.children.length, 0);

const nearA = corridor(3.25, 0, 0, 40), nearB = { ...corridor(3.25, 0, 0, 40), id: 'neighbour',
  points: [{ x: 3.8, y: 18, z: 0 }, { x: 3.8, y: 18, z: -40 }] };
const nearBorders = populateForestDensityBorders(THREE, { id: 'nearby-tiers', worldType: 'grounded_nature', routes: [nearA, nearB] }, new THREE.Group(), toonMat);
assert(nearBorders.userData.rejectedCount > 0, 'Neighbouring elevated floor was ignored');
assert(nearBorders.children.some(c => c.userData.routeId === nearA.id && c.userData.side === -1));
assert(!nearBorders.children.some(c => c.userData.routeId === nearA.id && c.userData.side === 1), 'Leaves intrude into adjacent upper-tier floor');
const platformBorders = populateForestDensityBorders(THREE, { worldType: 'indoor_home', routes: [nearA],
  platforms: [{ x: 0, y: 20, z: -20, w: 100, d: 100 }] }, new THREE.Group(), toonMat);
assert.equal(platformBorders.children.length, 0, 'Cluster footprint clearance ignored a platform');
const chuteBorders = populateForestDensityBorders(THREE, { worldType: 'sky_floating', routes: [nearA],
  chutes: [{ id: 'close-chute', width: 1.5, points: [{ x: 2.8, y: 15, z: 0 }, { x: 2.8, y: 5, z: -40 }] }] }, new THREE.Group(), toonMat);
assert(chuteBorders.userData.rejectedCount > 0, 'Cluster footprint clearance ignored a chute');

// Current authored worlds are read-only inputs, so this also catches sparse
// route sampling, diagonal route mouths and real banked scenery edges.
assert.equal(TRACKS.length, 10);
for (const [stageIndex, track] of TRACKS.entries()) {
  const borders = populateForestDensityBorders(THREE, track, new THREE.Group(), toonMat);
  assert(borders.children.length > 0, `${track.id}: no dense borders`);
  assert(borders.children.some(c => c.userData.side === -1) && borders.children.some(c => c.userData.side === 1));
  for (const route of track.routes.filter(r => r.width >= 2.79 && r.width <= 4.6)) {
    const hazards = placeLaneBlockingHazards(route, { stageIndex, count: 4 });
    if (hazards.length) {
      assert(auditLaneThreat(route, hazards).ok, `${track.id}/${route.id}: unsafe authored placement`);
      counts.authoredHazards += hazards.length;
    }
  }
  counts.authoredTracks++; counts.authoredBorders += borders.children.length;
}

// A real camera-controller smoke: roadside material is selected for fade when
// placed directly between a camera and the bubble. Reset restores shared mats.
const cameraRoot = new THREE.Group(), occluder = buildDenseTracksideCluster(THREE, 'hybrid_winter', 1, 9, toonMat);
occluder.position.set(0, 0, 3); cameraRoot.add(occluder);
const safety = createCameraOcclusion(cameraRoot), originals = occluder.children.map(m => m.material);
for (let i = 0; i < 90; i++) safety.update({ x: 0, y: .62, z: 0, r: .62 }, { x: 0, y: 1, z: 6 }, 1 / 60);
assert(occluder.children.some(m => m.material.transparent && m.material.opacity < 1), 'Roadside props did not participate in camera cutaway');
safety.reset(); occluder.children.forEach((m, i) => assert.equal(m.material, originals[i])); safety.dispose();

console.log(`PASS v4.1 lanes and borders: ${JSON.stringify(counts)}`);
