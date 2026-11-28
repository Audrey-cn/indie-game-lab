import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { getChuteFrame, getChuteShellRows, nearestRouteSurface, polylineLength } from '../src/course-math.mjs';
import { chuteShellGeometry } from '../src/course-geometry.mjs';
import { advanceChute, captureChute } from '../src/course-runtime.mjs';

// These assertions also give a useful RED result before the modules exist.
for (const file of ['../src/chute-styles.mjs', '../src/mud-curve.mjs']) {
  assert(existsSync(new URL(file, import.meta.url)), `Missing v4.1 module: ${file}`);
}
const { CHUTE_STYLES, buildChuteStylePoints, createStyledChute } = await import('../src/chute-styles.mjs');
const { evaluateDryCurveOffset, isPointOnDryCurve, sampleDryCurvePoints,
  buildDryCurveRibbonMesh, sampleDryCurveStars, mudSpecForStage } = await import('../src/mud-curve.mjs');

let checks = 0;
function check(name, run) {
  run(); checks++;
  console.log(`PASS ${name}`);
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const near = (a, b, tolerance = 1e-7) => assert(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const fixture = { start: { x: 3, y: 24, z: 7 }, end: { x: 17, y: 2, z: -65 },
  radius: 7, turns: 1.5, waves: 2.5, sway: 8, bankPeak: .58, steps: 384 };
const chutes = new Map();

check('four distinct styles are exposed and invalid definitions fail clearly', () => {
  assert.deepEqual(CHUTE_STYLES, ['rollercoaster', 'banked_slalom', 'corkscrew_drop', 'helix']);
  assert.throws(() => buildChuteStylePoints({ ...fixture, style: 'unknown' }), /style/i);
  assert.throws(() => createStyledChute({ ...fixture, start: { x: NaN, y: 0, z: 0 } }), /start/i);
});

for (const style of CHUTE_STYLES) {
  check(`${style}: exact endpoints, finite frames, smooth curvature and horizontal mouths`, () => {
    const chute = createStyledChute({ ...fixture, style, id: `test-${style}`, theme: 'honey', speed: 16 });
    chutes.set(style, chute);
    assert.equal(chute.id, `test-${style}`); assert.equal(chute.theme, 'honey');
    assert.equal(chute.style, style); assert.equal(chute.cameraMode, 'LOCKED_CHUTE');
    assert(chute.width > 0 && chute.speed > 0 && chute.speed <= 24);
    near(distance(chute.points[0], fixture.start), 0);
    near(distance(chute.points.at(-1), fixture.end), 0);
    near(distance(chute.entry, fixture.start), 0); near(distance(chute.exit, fixture.end), 0);
    near(distance(chute.receiving, fixture.end), 0);
    assert.equal(chute.points.length, fixture.steps + 1);
    assert.equal(chute.bankProfile.length, chute.points.length);
    near(chute.bankProfile[0], 0); near(chute.bankProfile.at(-1), 0);
    for (const p of chute.points) for (const key of ['x', 'y', 'z']) assert(Number.isFinite(p[key]));
    for (const bank of chute.bankProfile) assert(Number.isFinite(bank) && Math.abs(bank) <= .65 + 1e-8);
    const lengths = [], directions = [];
    for (let i = 1; i < chute.points.length; i++) {
      const a = chute.points[i - 1], b = chute.points[i], length = distance(a, b);
      assert(length > 1e-5, 'duplicate path sample'); lengths.push(length);
      directions.push(new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).divideScalar(length));
    }
    assert(Math.max(...lengths) / Math.min(...lengths) < 1.15, 'uneven rail sampling');
    for (let i = 1; i < directions.length; i++) {
      const angle = Math.acos(THREE.MathUtils.clamp(directions[i - 1].dot(directions[i]), -1, 1));
      assert(angle < .4, `${style}: abrupt tangent change ${angle}`);
      assert(angle / ((lengths[i - 1] + lengths[i]) / 2) < 1.1, `${style}: unbounded curvature`);
    }
    for (const u of [0, .1, .5, .9, 1]) {
      const frame = getChuteFrame(chute, u);
      near(Math.hypot(frame.tx, frame.ty, frame.tz), 1);
    }
    assert(Math.abs(getChuteFrame(chute, 0).ty) < .04, 'sloped entry seam');
    assert(Math.abs(getChuteFrame(chute, 1).ty) < .04, 'sloped exit seam');
    assert(getChuteShellRows(chute).rows.length > 100);
    const geometry = chuteShellGeometry(chute);
    for (const v of geometry.getAttribute('position').array) assert(Number.isFinite(v));
    geometry.dispose();
  });

  check(`${style}: actual rail runtime bounds speed and releases at its receiving endpoint`, () => {
    const chute = chutes.get(style);
    for (const hz of [30, 60, 120]) {
      const ball = { ...fixture.start, y: fixture.start.y + .55, r: .55 };
      const ride = captureChute(ball, chute);
      let riding = true, ticks = 0;
      while (riding && ticks++ < hz * 60) {
        const before = { ...ball };
        riding = advanceChute(ball, ride, 1 / hz);
        assert(distance(before, ball) <= chute.speed / hz + .026, 'rail position jumps');
        assert(Math.hypot(ball.vx, ball.vy, ball.vz) <= chute.speed + 1e-7);
      }
      assert(!riding, 'chute never releases');
      near(ball.x, fixture.end.x); near(ball.z, fixture.end.z);
      near(ball.y - ball.r, fixture.end.y + .025);
    }
  });
}

check('geometric signatures distinguish hills, slalom, whip-turn and multi-turn helix', () => {
  const roller = chutes.get('rollercoaster'), slalom = chutes.get('banked_slalom');
  const rises = roller.points.slice(1).map((p, i) => p.y - roller.points[i].y);
  const crests = rises.slice(1).filter((v, i) => rises[i] > 0 && v <= 0).length;
  assert(crests >= 2 && crests <= 3, `rollercoaster has ${crests} crests`);
  assert(slalom.points.slice(1).every((p, i) => p.y <= slalom.points[i].y + 1e-8), 'slalom climbs uphill');
  assert(Math.max(...slalom.bankProfile) >= .45 && Math.min(...slalom.bankProfile) <= -.45, 'slalom lacks strong alternating banking');
  const whip = chutes.get('corkscrew_drop');
  const entry = getChuteFrame(whip, 0), exit = getChuteFrame(whip, 1);
  assert(entry.tx * exit.tx + entry.tz * exit.tz < -.95, 'whip exit does not turn 180 degrees');
  assert(whip.points.some((p, i) => i && (p.y - whip.points[i - 1].y) / distance(p, whip.points[i - 1]) < -.35), 'corkscrew lacks a dive');
  const helix = chutes.get('helix'); let rotation = 0;
  for (let i = 2; i < helix.points.length; i++) {
    const a = helix.points[i - 2], b = helix.points[i - 1], c = helix.points[i];
    const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
    rotation += Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
  }
  assert(rotation > Math.PI * 3, 'helix has lost its multi-turn spiral');
  const all = [...chutes.values()];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    let square = 0;
    for (let k = 0; k <= 100; k++) square += distance(getChuteFrame(all[i], k / 100), getChuteFrame(all[j], k / 100)) ** 2;
    assert(Math.sqrt(square / 101) > 2, `${all[i].style} duplicates ${all[j].style}`);
  }
});

check('chutes respect translated/rotated authoring and speed limits', () => {
  for (const style of CHUTE_STYLES) {
    const a = buildChuteStylePoints({ ...fixture, style });
    const transform = p => ({ x: -p.z + 100, y: p.y + 3, z: p.x - 40 });
    const b = buildChuteStylePoints({ ...fixture, style, start: transform(fixture.start), end: transform(fixture.end) });
    for (let i = 0; i < a.length; i++) near(distance(transform(a[i]), b[i]), 0, 1e-6);
    assert(createStyledChute({ ...fixture, style, speed: 1000 }).speed <= 24);
  }
});

check('compact helix connectors have no cusp, including span = 3.2 * radius', () => {
  for (const span of [12, 25.6, 30, 75]) for (let turn = 8; turn <= 64; turn++) {
    const turns = turn / 16;
    const p = buildChuteStylePoints({ style: 'helix', start: { x: 0, y: 24, z: 0 },
      end: { x: 0, y: 2, z: -span }, radius: 8, turns, steps: 768 });
    for (let i = 2; i < p.length; i++) {
      const a = p[i - 2], b = p[i - 1], c = p[i];
      const incoming = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      const outgoing = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z).normalize();
      assert(incoming.dot(outgoing) > Math.cos(.4), `helix cusp at span ${span}, turns ${turns}`);
    }
  }
});

check('dry offset follows a continuous sine in metres, with safe edge clamping', () => {
  const spec = { routeHalfWidth: 5, dryWidth: 1.8, amplitude: 2, cycles: 1.5, phase: 0 };
  for (const [u, expected] of [[0, 0], [1 / 3, 2], [2 / 3, 0], [1, -2]]) near(evaluateDryCurveOffset(spec, u), expected);
  near(evaluateDryCurveOffset({ ...spec, amplitude: 100 }, 1 / 3), 3.75);
  for (let stage = 0; stage < 10; stage++) {
    const mud = mudSpecForStage(stage, 9);
    let previous = evaluateDryCurveOffset(mud, 0), min = previous, max = previous;
    for (let i = 1; i <= 10000; i++) {
      const d = evaluateDryCurveOffset(mud, i / 10000);
      assert(Math.abs(d - previous) <= Math.abs(mud.amplitude) * Math.PI * mud.cycles / 10000 + 1e-9, 'step jump');
      assert(Math.abs(d) + mud.dryWidth / 2 + .35 <= 4.5 + 1e-8, 'dry ribbon leaves route');
      min = Math.min(min, d); max = Math.max(max, d); previous = d;
    }
    assert(min < -.5 && max > .5, 'dry line is straight or lacks an S turn');
  }
});

check('difficulty narrows monotonically across ten stages and saturates outside them', () => {
  near(mudSpecForStage(0, 9).dryWidth, 1.85); near(mudSpecForStage(9, 9).dryWidth, 1.38);
  near(mudSpecForStage(0, 9).cycles, 1.5); near(mudSpecForStage(9, 9).cycles, 2.5);
  for (let i = -2; i < 13; i++) assert(mudSpecForStage(i + 1, 9).dryWidth <= mudSpecForStage(i, 9).dryWidth);
  assert.throws(() => mudSpecForStage(0, 0), /width/i);
});

const routes = [
  { id: 'straight-slope', width: 9, bank: .8, points: [{ x: 2, y: 6, z: 5 }, { x: 2, y: 3, z: -65 }] },
  { id: 'banked-bends', width: 9, bank: 1.2, points: [
    { x: 0, y: 9, z: 12 }, { x: 0, y: 7, z: -8 }, { x: 5, y: 5, z: -28 }, { x: 2, y: 3, z: -48 }, { x: 4, y: 2, z: -68 },
  ] },
  { id: 'right-angle-miter', width: 9, bank: .6, points: [
    { x: 0, y: 8, z: 0 }, { x: 0, y: 8, z: -20 }, { x: 20, y: 8, z: -20 },
  ] },
];
for (const route of routes) {
  check(`${route.id}: continuous world ribbon follows the exact rendered banked deck +0.06m`, () => {
    const mud = mudSpecForStage(6, route.width), samples = sampleDryCurvePoints(route, mud, 360);
    assert.equal(samples.length, 361);
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i], floor = nearestRouteSurface([route], p.x, p.z);
      assert(floor, 'dry centerline leaves deck'); near(p.y - floor.y, .06, 2e-6);
      if (i) assert(distance(p, samples[i - 1]) < polylineLength(route.points) / 360 * 2, 'world centerline jumps at a joint');
    }
    const material = new THREE.MeshStandardMaterial({ color: 0x9c723f });
    const mesh = buildDryCurveRibbonMesh(THREE, route, mud, material);
    assert(mesh.isMesh && mesh.geometry.isBufferGeometry);
    assert(mesh.material.polygonOffset && mesh.material.polygonOffsetFactor < 0);
    assert.equal(material.polygonOffset, false, 'shared source material was changed');
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
    for (let i = 0; i < positions.count; i++) {
      const floor = nearestRouteSurface([route], positions.getX(i), positions.getZ(i));
      assert(floor, 'dry ribbon edge leaves deck'); near(positions.getY(i) - floor.y, .06, 3e-6);
    }
    for (let i = 0; i < index.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(i));
      const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(i + 1));
      const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(i + 2));
      assert(b.sub(a).cross(c.sub(a)).y > 1e-7, 'flipped or degenerate ribbon face');
    }
    mesh.geometry.dispose(); mesh.material.dispose(); material.dispose();
  });

  check(`${route.id}: 100% of stars lie strictly on the dry curve centerline`, () => {
    for (let stage = 0; stage < 10; stage++) for (const count of [0, 1, 4, 17]) {
      const mud = mudSpecForStage(stage, route.width), stars = sampleDryCurveStars(route, mud, count);
      assert.equal(stars.length, count);
      for (let i = 0; i < count; i++) {
        const u = (i + 1) / (count + 1), star = stars[i];
        const center = sampleDryCurvePoints(route, mud, count + 1)[i + 1];
        near(Math.hypot(star.x - center.x, star.z - center.z), 0);
        const floor = nearestRouteSurface([route], star.x, star.z);
        assert(floor && star.y > floor.y);
        assert(isPointOnDryCurve(mud, u, floor.lateral), 'STAR IN MUD');
        near(floor.lateral, evaluateDryCurveOffset(mud, u), 1e-6);
        assert(!isPointOnDryCurve(mud, u, evaluateDryCurveOffset(mud, u) + mud.dryWidth / 2 + .001));
      }
    }
  });
}

console.log(`v4.1 chutes / mud: ${checks} checks passed; zero stars in mud.`);
