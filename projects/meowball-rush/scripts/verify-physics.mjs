// Deterministic integration checks against the real browser physics functions.
// Rendering, audio and result UI are stubbed; collision and movement are not.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CATS, TRACKS } from '../src/config.mjs';
import * as trackBuilder from '../src/cel-builder.mjs';

const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing physics source markers: ${start}, ${end}`);
  return source.slice(a, b);
}
const surfaceCode = sourceBetween('// ===== DETERMINISTIC 3D SURFACE QUERY', 'function triggerBubblePop(');
const physicsCode = sourceBetween('function updatePhysics(dt)', 'function updateVisuals(dt)');
const popCode = sourceBetween('function triggerBubblePop(', 'function finishStage(');
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
const noop = () => {};
const visible = () => ({ visible: true, rotation: { y: 0 } });
function makeHarness(track, cat = CATS[0]) {
  const b = { ...track.start, vx: 0, vy: 0, vz: 0, r: 0.62,
    grounded: false, surfaceKind: 'grass', dizzyTimer: 0, popTimer: 0,
    hammerHitCd: 0, boostFlash: 0, burstTimer: 0, supportPlatform: null };
  const state = { track, cat, phase: 'playing', elapsed: 0, timeLeft: track.bonusTime || 180,
    ball: b, pops: 0, stars: 0, squashVel: 0, checkpoint: { ...track.start },
    checkpointIdx: -1, shownTips: new Set(), secretFound: false,
    input: { keys: new Set(), mouseAccX: 0, mouseAccZ: 0, ix: 0, iz: 0 } };
  const dynamicMeshes = {
    gears: track.gears.map(def => ({ def, mesh: { rotation: { y: 0 } } })),
    hammers: track.hammers.map(def => ({ def, pivot: { rotation: { z: 0 } }, worldHead: new Vector3() })),
    mushrooms: track.mushrooms.map(def => ({ def, bounceAnim: 0 })),
    stars: track.stars.map(def => ({ def, collected: false, mesh: { visible: true } })),
    elevators: track.platforms.filter(p => p.kind === 'elevator').map(def => ({ def, mesh: { position: new Vector3() } })),
  };
  const events = [];
  const context = vm.createContext({
    THREE: { Vector3 }, state, dynamicMeshes,
    CATS, TRACKS, Math, console,
    getSideWallOpenings: (...args) => trackBuilder.getSideWallOpenings(...args),
    gyroEnabled: false, gyroTiltX: 0, gyroTiltZ: 0,
    sfx: new Proxy({}, { get: () => noop }),
    kittyRig: { bubbleMesh: visible(), kitty: visible(), accGroup: visible(), dizzyHalo: visible(), furball: visible() },
    showToast: noop, showStarPop: noop,
    finishStage(cleared) { state.phase = 'ended'; state.cleared = cleared; },
  });
  vm.runInContext(`${surfaceCode}\n${popCode}\n${physicsCode}\nthis.updatePhysics = updatePhysics; this.sampleTrackSurface = sampleTrackSurface;`, context);
  const actualPop = context.triggerBubblePop;
  context.triggerBubblePop = (reason) => {
    if (b.popTimer <= 0) events.push({ type: 'pop', reason, time: state.elapsed, x: b.x, y: b.y, z: b.z });
    actualPop(reason);
  };
  return { state, b, events, context, step(dt, driveX = 0, driveZ = 0) {
    // Inverse of the game's screen-to-world camera yaw transform.
    const c = Math.cos(0.58), s = Math.sin(0.58);
    state.input.mouseAccX = driveX * c - driveZ * s;
    state.input.mouseAccZ = driveX * s + driveZ * c;
    state.elapsed += dt;
    state.timeLeft -= dt;
    if (state.timeLeft > 0) context.updatePhysics(dt);
    else { state.phase = 'ended'; state.cleared = false; }
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert(Number.isFinite(b[k]), `Non-finite ball.${k}`);
  }};
}

function testTrack(platforms, overrides = {}) {
  return { id: 'test', start: { x: 0, y: 8.62, z: 0 }, deathY: -30,
    platforms, boosts: [], mushrooms: [], gears: [], hammers: [], stars: [], checkpoints: [],
    finish: { x: 10000, y: 8, z: 10000 }, ...overrides };
}
const flat = { kind: 'grass', x: 0, y: 8, z: 0, w: 600, d: 600, h: 1 };
const checks = [];
function check(name, fn) {
  try { const receipt = fn(); checks.push({ name, pass: true, ...receipt }); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); }
}

check('flat speed under sustained drive', () => {
  const receipts = [];
  for (const cat of CATS) {
    const h = makeHarness(testTrack([flat]), cat);
    let peak = 0, atOneSecond = 0;
    for (let i = 0; i < 720; i++) {
      h.step(1 / 60, 0, -180); peak = Math.max(peak, Math.hypot(h.b.vx, h.b.vz));
      if (i === 59) atOneSecond = Math.hypot(h.b.vx, h.b.vz);
    }
    const limit = 10.2 * cat.stats.topSpeed;
    assert(Math.abs(atOneSecond - limit) < 0.001 && Math.abs(Math.hypot(h.b.vx, h.b.vz) - limit) < 0.001,
      `${cat.id}: sustained mouse drive did not plateau at cruise`);
    receipts.push({ cat: cat.id, peak: +peak.toFixed(4), atOneSecond: +atOneSecond.toFixed(4), limit: +limit.toFixed(4) });
  }
  console.log(JSON.stringify({ flatSpeedReceipt: receipts }));
  for (const r of receipts) assert(r.peak <= r.limit + 0.01, `${r.cat}: ${r.peak} exceeds ${r.limit}`);
  return { cats: receipts.length };
});

check('keyboard flat speed', () => {
  const h = makeHarness(testTrack([flat]));
  h.state.input.keys.add('KeyW');
  let peak = 0, atOneSecond = 0;
  for (let i = 0; i < 720; i++) {
    h.step(1 / 60); peak = Math.max(peak, Math.hypot(h.b.vx, h.b.vz));
    if (i === 59) atOneSecond = Math.hypot(h.b.vx, h.b.vz);
  }
  assert(peak <= 10.21, `Keyboard speed ${peak} exceeds cruise`);
  assert(Math.abs(atOneSecond - 10.2) < 0.001 && Math.abs(Math.hypot(h.b.vx, h.b.vz) - 10.2) < 0.001,
    'Sustained keyboard drive did not reach cruise by1s and hold it');
  const mixed = makeHarness(testTrack([flat]));
  mixed.state.input.keys.add('KeyW');
  for (let i = 0; i < 180; i++) mixed.step(1 / 60, 0, -180);
  const mixedSpeed = Math.hypot(mixed.b.vx, mixed.b.vz);
  assert(Math.abs(mixedSpeed - 10.2) < 0.001, `Combined keyboard+mouse speed ${mixedSpeed}`);
  return { peak: +peak.toFixed(4), atOneSecond: +atOneSecond.toFixed(4), mixedSpeed: +mixedSpeed.toFixed(4) };
});

check('boost cap and 0.6s decay with sustained input', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const h = makeHarness(testTrack([flat], { boosts: [{ x: 0, y: 8.05, z: 0, w: 3, d: 2, fx: 0, fz: -100 }] }));
    let peak = 0, effectEnd = null, settled = null;
    for (let t = 0; t < 3; t += dt) {
      h.step(dt, 0, -180);
      const speed = Math.hypot(h.b.vx, h.b.vz);
      peak = Math.max(peak, speed);
      if (h.b.boostFlash <= 0 && Math.abs(h.b.z) > 1.62 && effectEnd === null) effectEnd = h.state.elapsed;
      if (effectEnd !== null && h.state.elapsed - effectEnd >= 0.6 + dt && settled === null) settled = speed;
    }
    assert(peak <= 15.21, `dt=${dt}: boost speed ${peak} exceeds burst cap`);
    assert(settled !== null && settled <= 10.21, `dt=${dt}: boost does not settle in0.6s under continued drive: ${settled}`);
    receipts.push({ dt, peak: +peak.toFixed(4), effectEnd: +effectEnd.toFixed(4), settled: +settled.toFixed(4) });
  }
  return { receipts };
});

check('downhill gravity and burst cap without drive', () => {
  const p = { kind: 'ramp', x: 0, y: 25, z: -40, w: 20, d: 80, h: 0.8, yStart: 50, yEnd: 0, dir: '-z' };
  const h = makeHarness(testTrack([p, { ...flat, y: 0, z: -120, w: 20, d: 80 }], { start: { x: 0, y: 50.62, z: 0 } }));
  h.b.vz = -0.5;
  let peak = 0, speedAtTwoSeconds = 0;
  for (let i = 0; i < 20 * 120; i++) {
    h.step(1 / 120);
    const speed = Math.hypot(h.b.vx, h.b.vz);
    peak = Math.max(peak, speed);
    if (i === 239) speedAtTwoSeconds = speed;
  }
  assert(speedAtTwoSeconds > 8, `Coasting down slope did not accelerate: ${speedAtTwoSeconds}`);
  assert(peak <= 15.21, `Downhill exceeds burst cap: ${peak}`);
  assert(h.b.z < -80 && Math.hypot(h.b.vx, h.b.vz) <= 10.21, 'Downhill burst does not settle on flat landing');
  assert.equal(h.state.pops, 0);
  return { speedAtTwoSeconds: +speedAtTwoSeconds.toFixed(4), peak: +peak.toFixed(4), endZ: +h.b.z.toFixed(4) };
});

check('trough curved floor and centering', () => {
  const p = { kind: 'trough', x: 0, y: 8, z: 0, w: 6, d: 100, h: 0.8 };
  const h = makeHarness(testTrack([p], { start: { x: 1.7, y: 8.62 + 0.6 * (1.7 / 3) ** 2, z: 0 } }));
  h.b.grounded = true; h.b.surfaceKind = 'trough'; h.b.supportPlatform = p;
  const center = h.context.sampleTrackSurface(0, 8.62, 0, 0.62);
  const bank = h.context.sampleTrackSurface(1.7, h.b.y, 0, 0.62);
  assert(Math.abs(center.y - 8) < 1e-8);
  assert(bank.y > center.y + 0.15 && bank.slopeX > 0);
  let enteredCenter = false, maxFloorError = 0;
  for (let i = 0; i < 600; i++) {
    h.step(1 / 120);
    if (Math.abs(h.b.x) < 0.3) enteredCenter = true;
    const floorY = 8 + 0.6 * (h.b.x / 3) ** 2;
    maxFloorError = Math.max(maxFloorError, Math.abs(h.b.y - h.b.r - floorY));
  }
  assert(enteredCenter, 'Bank gravity did not bring ball through trough center');
  assert(maxFloorError < 0.02, `Trough contact clips floor by ${maxFloorError}`);
  return { endX: +h.b.x.toFixed(4), maxFloorError: +maxFloorError.toFixed(6) };
});

check('trough solid rails both sides at variable dt', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) for (const side of [-1, 1]) {
    const p = { kind: 'trough', x: 0, y: 8, z: 0, w: 6, d: 100, h: 0.8 };
    const h = makeHarness(testTrack([p]));
    h.b.grounded = true; h.b.surfaceKind = 'trough'; h.b.supportPlatform = p;
    let maxX = 0, bounced = false;
    for (let t = 0; t < 2; t += dt) {
      h.step(dt, side * 180, 0);
      maxX = Math.max(maxX, Math.abs(h.b.x));
      if (side * h.b.vx < -0.5) bounced = true;
    }
    assert(maxX <= 3 - h.b.r + 0.001, `dt=${dt} side=${side}: tunneled trough rail at${maxX}`);
    assert(bounced, `dt=${dt} side=${side}: no outward rail rebound`);
    assert.equal(h.state.pops, 0);
    receipts.push({ dt, side, maxX: +maxX.toFixed(4), bounced });
  }
  return { receipts };
});

check('solid wall rebound and connected side doorway', () => {
  const receipts = [];
  for (const side of [-1, 1]) {
    const p = { ...flat, w: 6, d: 14, walls: true };
    const solid = makeHarness(testTrack([p]));
    solid.b.grounded = true; solid.b.supportPlatform = p;
    let bounced = false;
    for (let i = 0; i < 120; i++) { solid.step(1 / 60, side * 80, 0); if (solid.b.vx * side < -0.5) bounced = true; }
    assert(bounced && Math.abs(solid.b.x) <= 2.381, `No wall rebound side${side}`);
    const q = { kind: 'grass', x: side * 5, y: 8, z: 0, w: 4, d: 6, h: 1 };
    const door = makeHarness(testTrack([p, q]));
    for (let i = 0; i < 75 && door.b.x * side < 4.5; i++) door.step(1 / 60, side * 18, 0);
    assert(door.b.x * side > 3.5, `Connected deck doorway blocked side${side} x=${door.b.x}`);
    assert(door.b.grounded && Math.abs(door.b.y - 8.62) < 0.02, `Doorway crossing lost support side${side}`);
    receipts.push({ side, bounced, doorwayX: +door.b.x.toFixed(4) });
  }
  return { receipts };
});

check('elevator riding full sine cycle', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const p = { kind: 'elevator', x: 0, y: 5, z: 0, w: 6, d: 6, h: 0.8, yMin: 5, yMax: 7, speed: 0.9, phase: -Math.PI / 2, walls: true };
    const h = makeHarness(testTrack([p], { start: { x: 0, y: 5.62, z: 0 } }));
    h.b.grounded = true; h.b.surfaceKind = 'elevator'; h.b.supportPlatform = p;
    let maxError = 0, airborneFrames = 0;
    const period = Math.PI * 2 / p.speed;
    for (let t = 0; t < period * 2; t += dt) {
      h.step(dt);
      const y = (p.yMin + p.yMax) / 2 + Math.sin(h.state.elapsed * p.speed + p.phase) * (p.yMax - p.yMin) / 2;
      maxError = Math.max(maxError, Math.abs(h.b.y - h.b.r - y));
      if (!h.b.grounded) airborneFrames++;
    }
    assert(maxError < 0.015 && airborneFrames === 0, `dt=${dt}: elevator contact drift ${maxError}, airborne${airborneFrames}`);
    receipts.push({ dt, cycles: 2, maxError: +maxError.toFixed(8), airborneFrames });
  }
  return { receipts };
});

check('raised elevator blocks entering underneath from low dock', () => {
  const receipts = [];
  for (const id of ['gear_outpost', 'sky_finale']) for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const track = TRACKS.find(t => t.id === id);
    const lift = track.platforms.find(p => p.kind === 'elevator');
    const lower = track.platforms.find(p => p !== lift && Math.abs(p.y - lift.yMin) < 0.01
      && Math.abs((p.z - p.d / 2) - (lift.z + lift.d / 2)) < 0.01);
    assert(lower, `${id}: missing adjoining low dock`);
    const h = makeHarness(track);
    h.b.x = lower.x; h.b.y = lower.y + h.b.r; h.b.z = lower.z - lower.d / 2 + 0.8;
    h.b.grounded = true; h.b.surfaceKind = lower.kind; h.b.supportPlatform = lower;
    h.state.elapsed = Math.PI / lift.speed;
    let minZ = h.b.z, minY = h.b.y;
    for (let t = 0; t < 1.5; t += dt) {
      h.step(dt, 0, -18);
      minZ = Math.min(minZ, h.b.z); minY = Math.min(minY, h.b.y);
    }
    assert.equal(h.state.pops, 0, `${id} dt=${dt}: popped under raised lift`);
    assert(h.b.grounded && h.b.supportPlatform === lower, `${id} dt=${dt}: lost low-dock support`);
    assert(minY >= lower.y + h.b.r - 0.02, `${id} dt=${dt}: clipped below low dock`);
    assert(minZ >= lower.z - lower.d / 2 + h.b.r - 0.02, `${id} dt=${dt}: entered under raised lift`);
    receipts.push({ track: id, dt, minZ: +minZ.toFixed(4), minY: +minY.toFixed(4) });
  }
  return { receipts };
});

const routePoints = {
  academy: [[0, -29], [0, -43.4]],
  garden: [[0, -13.4], [-10.4, -13.4], [-10.4, -26.2], [0, -26.2], [0, -42.2]],
  honey: [[0, -43.5]],
  mushroom_canyon: [[0, -9.4], [0, -18.8], [0, -34], [0, -49.2]],
  gear_outpost: [[0, -16.8], [0, -30.2], [-1.6, -36.2], [1.6, -42], [0, -48]],
  belfry: [[0, -16.2], [0, -32.6], [0, -47.4]],
  clockwork: [[0, -14.8], [0, -23.4], [0, -35.8], [-1.8, -41.4], [1.8, -47], [0, -60.8]],
  frost_slide: [[0, -15.6], [13.4, -15.6], [13.4, -33.6]],
  aurora: [[0, -16.8], [12.6, -16.8], [12.6, -34.2], [0, -34.2], [0, -52.4]],
  sky_finale: [[0, -24.2], [-1.8, -30.2], [1.8, -36.2], [0, -42.2], [0, -60.6]],
  elevator_connection: [[0, 0]],
};
function runRoute(track, { dt = 1 / 120, speed = 5.5, maxTime = 90, startWait = 0, stopAfterPop = false } = {}) {
  const h = makeHarness(track);
  const points = routePoints[track.id].map(([x, z]) => ({ x, z }));
  const elevator = track.platforms.find(p => p.kind === 'elevator');
  if (elevator) {
    points[points.length - 1].wait = 'low';
    points.push({ x: elevator.x, z: elevator.z, wait: 'high' }, { x: track.finish.x, z: track.finish.z });
  }
  let target = 0, peakSpeed = 0, minY = h.b.y, groundedTime = 0, elevatorGroundedTime = 0, elevatorError = 0;
  let previousPop = 0;
  for (let i = 0; i < maxTime / dt && h.state.phase === 'playing'; i++) {
    let { x: tx, z: tz } = points[target];
    if (h.state.elapsed < startWait) { tx = track.start.x; tz = track.start.z; }
    let dx = tx - h.b.x, dz = tz - h.b.z, distance = Math.hypot(dx, dz);
    let canLeave = true;
    if (points[target].wait) {
      const y = (elevator.yMin + elevator.yMax) / 2 + Math.sin(h.state.elapsed * elevator.speed + elevator.phase) * (elevator.yMax - elevator.yMin) / 2;
      const ascending = Math.cos(h.state.elapsed * elevator.speed + elevator.phase) > 0;
      canLeave = points[target].wait === 'low' ? (y < elevator.yMin + 0.25 && !ascending) : (y > elevator.yMax - 0.25 && ascending);
    }
    if (h.state.elapsed >= startWait && distance < 0.9 && canLeave && target < points.length - 1) {
      target++;
      ({ x: tx, z: tz } = points[target]); dx = tx - h.b.x; dz = tz - h.b.z; distance = Math.hypot(dx, dz);
    }
    const desiredSpeed = Math.min(speed, distance * 2.2);
    const desiredX = dx / (distance || 1) * desiredSpeed;
    const desiredZ = dz / (distance || 1) * desiredSpeed;
    // The driver can push or brake through ordinary mouse input only.
    const controlGain = h.b.grounded ? 8 : 3.5;
    const limit = 44;
    let driveX = Math.max(-limit, Math.min(limit, (desiredX - h.b.vx) * controlGain));
    let driveZ = Math.max(-limit, Math.min(limit, (desiredZ - h.b.vz) * controlGain));
    if (h.b.popTimer > 0) { driveX = 0; driveZ = 0; }
    h.step(dt, driveX, driveZ);
    if (stopAfterPop && h.state.pops > 0) break;
    peakSpeed = Math.max(peakSpeed, Math.hypot(h.b.vx, h.b.vz));
    minY = Math.min(minY, h.b.y);
    if (h.b.grounded) groundedTime += dt;
    if (h.b.grounded && h.b.supportPlatform?.kind === 'elevator') {
      elevatorGroundedTime += dt;
      const p = h.b.supportPlatform;
      const expectedY = (p.yMin + p.yMax) / 2 + Math.sin(h.state.elapsed * p.speed + p.phase) * (p.yMax - p.yMin) / 2;
      elevatorError = Math.max(elevatorError, Math.abs(h.b.y - h.b.r - expectedY));
    }
    if (h.state.pops > previousPop) { previousPop = h.state.pops; target = Math.max(0, target - 1); }
    if (process.argv.includes(`--trace=${track.id}`) && i % Math.round(1 / dt) === 0) console.log(JSON.stringify({ trace: track.id, time: +h.state.elapsed.toFixed(2), target, x: +h.b.x.toFixed(2), y: +h.b.y.toFixed(2), z: +h.b.z.toFixed(2), vx: +h.b.vx.toFixed(2), vy: +h.b.vy.toFixed(2), vz: +h.b.vz.toFixed(2), grounded: h.b.grounded, pop: h.b.popTimer }));
  }
  return { h, receipt: { track: track.id, cleared: !!h.state.cleared, seconds: +h.state.elapsed.toFixed(3),
    pops: h.state.pops, waypoint: target, speed, startWait, peakSpeed: +peakSpeed.toFixed(3), minY: +minY.toFixed(3),
    groundedSeconds: +groundedTime.toFixed(3), elevatorGroundedSeconds: +elevatorGroundedTime.toFixed(3), elevatorError: +elevatorError.toFixed(6),
    end: { x: +h.b.x.toFixed(2), y: +h.b.y.toFixed(2), z: +h.b.z.toFixed(2) } } };
}
check('elevator boarding and dismount through real input', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const lower = { kind: 'grass', x: 0, y: 5, z: 0, w: 6, d: 6, h: 1, walls: true };
    const lift = { kind: 'elevator', x: 0, y: 5, z: -6, w: 6, d: 6, h: 0.8, yMin: 5, yMax: 7, speed: 0.9, phase: -Math.PI / 2, walls: true };
    const upper = { kind: 'grass', x: 0, y: 7, z: -12, w: 6, d: 6, h: 1, walls: true };
    const track = testTrack([lower, lift, upper], { id: 'elevator_connection', start: { x: 0, y: 5.62, z: 0 }, finish: { x: 0, y: 7, z: -13 } });
    const { h, receipt } = runRoute(track, { dt });
    assert(receipt.cleared && receipt.pops === 0, `dt=${dt}: elevator mount/dismount failed ${JSON.stringify(receipt)}`);
    assert.equal(h.b.supportPlatform, upper, `dt=${dt}: finish not grounded on high dock`);
    receipts.push({ dt, seconds: receipt.seconds, pops: receipt.pops, support: h.b.surfaceKind });
  }
  return { receipts };
});

const routeStrategies = {
  belfry: { speed: 7.5, startWait: 2.3 },
  clockwork: { speed: 7.5, startWait: 2 },
  aurora: { speed: 7.5 },
  sky_finale: { speed: 7.5 },
};
for (const track of TRACKS) check(`input-only route: ${track.id}`, () => {
  let result = runRoute(track, routeStrategies[track.id]);
  if (process.argv.includes('--search') && (!result.receipt.cleared || result.receipt.pops > 0)) {
    outer: for (const speed of [7.5, 9.5, 8.5, 6.5, 4.5, 3.5]) for (let wait = 0; wait < 4; wait += 0.1) {
      const candidate = runRoute(track, { speed, startWait: +wait.toFixed(2), stopAfterPop: true });
      if (candidate.receipt.cleared) { result = candidate; break outer; }
    }
  }
  const { h, receipt } = result;
  console.log(JSON.stringify({ routeReceipt: receipt, events: h.events }));
  assert(receipt.cleared, `Route did not finish: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.pops, 0, `Route popped: ${JSON.stringify(receipt)}`);
  if (track.platforms.some(p => p.kind === 'elevator')) {
    assert(receipt.elevatorGroundedSeconds > 1, 'Route did not actually ride its elevator');
    assert(receipt.elevatorError < 0.015, `Route clipped elevator: ${receipt.elevatorError}`);
  }
  return receipt;
});

console.log(JSON.stringify({ checks, passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass).length }, null, 2));
if (checks.some(c => !c.pass)) process.exitCode = 1;
