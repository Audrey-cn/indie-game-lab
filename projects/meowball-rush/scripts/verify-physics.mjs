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
    hammerHitCd: 0, rollingPinHitCd: 0, bumperHitCd: 0,
    boostFlash: 0, burstTimer: 0, supportPlatform: null };
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
    rollingPins: (track.rollingPins || []).map(def => ({ def,
      mesh: { position: new Vector3(def.x, def.y, def.z), rotation: { x: 0, y: 0, z: 0 } },
      roller: { rotation: { x: 0, y: 0, z: 0 } } })),
    bumpers: (track.bumpers || []).map(def => ({ def, pulse: 0 })),
    steamVents: (track.steamVents || []).map(def => ({ def, active: false, touching: false })),
  };
  const events = [];
  const context = vm.createContext({
    THREE: { Vector3 }, state, dynamicMeshes,
    CATS, TRACKS, Math, console,
    getSideWallOpenings: (...args) => trackBuilder.getSideWallOpenings(...args),
    getEndWallOpenings: (...args) => trackBuilder.getEndWallOpenings(...args),
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
  return { state, b, events, context, dynamicMeshes, step(dt, driveX = 0, driveZ = 0) {
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
    rollingPins: [], bumpers: [], steamVents: [],
    finish: { x: 10000, y: 8, z: 10000 }, ...overrides };
}
const flat = { kind: 'grass', x: 0, y: 8, z: 0, w: 600, d: 600, h: 1 };
const checks = [];
function check(name, fn) {
  try { const receipt = fn(); checks.push({ name, pass: true, ...receipt }); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); }
}

check('v2 hazards remain on supported course plazas', () => {
  const expected = [
    ['honey', 'rollingPins', 1], ['clockwork', 'rollingPins', 1],
    ['gear_outpost', 'steamVents', 1], ['clockwork', 'steamVents', 1],
    ['aurora', 'bumpers', 2], ['sky_finale', 'bumpers', 2],
  ];
  for (const [id, key, count] of expected) {
    const track = TRACKS.find(t => t.id === id);
    assert.equal(track?.[key]?.length, count, `${id}: missing ${key} course lesson`);
    for (const def of track[key]) {
      const pad = track.platforms.find(p => p.walls && p.y === (key === 'rollingPins' ? def.y - 0.48 : def.y)
        && Math.abs(def.x - p.x) + (key === 'rollingPins' ? def.width / 2 : def.r) <= p.w / 2
        && Math.abs(def.z - p.z) + (key === 'rollingPins' ? def.ampZ + 0.48 : def.r) <= p.d / 2);
      assert(pad, `${id}: ${key} at (${def.x},${def.z}) lacks a supporting walled plaza`);
    }
  }
  for (const id of ['belfry', 'sky_finale']) assert(TRACKS.find(t => t.id === id).hammers.some(h => h.variant === 'flail'), `${id}: missing flail lesson`);
  return { courseLessons: expected.length };
});

check('rolling pin elastic rebound and contact cooldown', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const pin = { x: 0, y: 8.55, z: 0, width: 4, r: 0.48, speed: 1.3, phase: 0, ampZ: 0 };
    const fixture = testTrack([flat], { start: { x: 0, y: 8.62, z: 0.85 }, rollingPins: [pin] });
    const hit = makeHarness(fixture);
    hit.b.vz = -4;
    hit.step(dt);
    assert(hit.b.vz > 2, `dt=${dt}: pin did not reverse incoming velocity: ${hit.b.vz}`);
    assert(hit.b.rollingPinHitCd > 0.1, `dt=${dt}: pin contact has no cooldown`);
    assert.equal(hit.state.pops, 0, `dt=${dt}: pin contact popped the bubble`);
    assert(Math.hypot(hit.b.vx, hit.b.vz) <= 15.21, `dt=${dt}: pin bypassed burst speed cap`);
    const protectedContact = makeHarness(fixture);
    protectedContact.b.vz = -4;
    protectedContact.b.rollingPinHitCd = 0.2;
    protectedContact.step(dt);
    assert(protectedContact.b.vz < -3, `dt=${dt}: pin reapplied impulse during cooldown`);
    assert(Math.abs(protectedContact.b.rollingPinHitCd - (0.2 - dt)) < 1e-8, `dt=${dt}: pin cooldown does not count down in seconds`);
    const readyContact = makeHarness(fixture);
    readyContact.b.vz = -4; readyContact.b.rollingPinHitCd = dt * 0.5; readyContact.step(dt);
    assert(readyContact.b.vz > 2, `dt=${dt}: expired pin cooldown still blocks collision`);
    const miss = makeHarness(testTrack([flat], { start: { x: 3.5, y: 8.62, z: 0.85 }, rollingPins: [pin] }));
    miss.b.vz = -4; miss.step(dt);
    assert(miss.b.vz < -3 && miss.b.rollingPinHitCd === 0, `dt=${dt}: pin hits outside its cylinder span`);
    receipts.push({ dt, reboundVz: +hit.b.vz.toFixed(4), cooldown: +hit.b.rollingPinHitCd.toFixed(4) });
  }
  return { receipts };
});

check('rolling pin collider follows its animated body', () => {
  const pin = { x: 0, y: 8.55, z: -2, width: 4, speed: 1.3, phase: 0.2, ampZ: 1.1 };
  const h = makeHarness(testTrack([flat], { start: { x: 5, y: 8.62, z: 0 }, rollingPins: [pin] }));
  h.state.elapsed = 0.5;
  h.step(1 / 60);
  const expectedZ = -2 + Math.sin((0.5 + 1 / 60) * 1.3 + 0.2) * 1.1;
  assert(Math.abs(h.dynamicMeshes.rollingPins[0].mesh.position.z - expectedZ) < 1e-8,
    'Rolling pin body does not follow the level sine movement');
  const contact = makeHarness(testTrack([flat], { start: { x: 0, y: 8.62, z: expectedZ + 0.85 }, rollingPins: [pin] }));
  contact.state.elapsed = 0.5; contact.b.vz = -4; contact.step(1 / 60);
  assert(contact.b.vz > 2 && contact.b.rollingPinHitCd > 0, 'Rolling pin collision stayed at its original definition instead of following animation');
  return { animatedZ: +h.dynamicMeshes.rollingPins[0].mesh.position.z.toFixed(4), reboundVz: +contact.b.vz.toFixed(4) };
});

check('rolling pin finite endcaps leave the visible side lane clear', () => {
  const pin = { x: 0, y: 8.55, z: 0, width: 4, speed: 1.3, phase: 0, ampZ: 0 };
  const clear = makeHarness(testTrack([flat], { start: { x: 2.64, y: 8.62, z: 0 }, rollingPins: [pin] }));
  clear.step(1 / 60);
  assert.equal(clear.b.rollingPinHitCd, 0, 'Pin collider extends past finite barrel endcap into the side lane');
  assert(Math.hypot(clear.b.vx, clear.b.vz) < 0.001, 'Pin knocks a ball outside its finite endcap');
  const hit = makeHarness(testTrack([flat], { start: { x: 2.5, y: 8.62, z: 0 }, rollingPins: [pin] }));
  hit.b.vx = -3; hit.step(1 / 60);
  assert(hit.b.vx > 0 && hit.b.rollingPinHitCd > 0, 'Finite barrel endcap fails to rebound an overlapping ball');
  return { clearanceX: clear.b.x, endcapRebound: +hit.b.vx.toFixed(4) };
});

check('bumper radial elastic rebound and contact cooldown', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) for (const side of [-1, 1]) {
    const bumper = { x: 0, y: 8, z: 0, r: 0.9, bounce: 6 };
    const fixture = testTrack([flat], { start: { x: side * 1.3, y: 8.62, z: 0 }, bumpers: [bumper] });
    const hit = makeHarness(fixture);
    hit.b.vx = -side * 4;
    hit.step(dt);
    assert(side * hit.b.vx > 3, `dt=${dt} side=${side}: bumper did not bounce radially: ${hit.b.vx}`);
    assert(Math.abs(hit.b.vz) < 0.1, `dt=${dt} side=${side}: radial impact adds unrelated sideways force`);
    assert(hit.b.bumperHitCd > 0.1, `dt=${dt}: bumper contact has no cooldown`);
    assert.equal(hit.state.pops, 0);
    const protectedContact = makeHarness(fixture);
    protectedContact.b.vx = -side * 4;
    protectedContact.b.bumperHitCd = 0.2;
    protectedContact.step(dt);
    assert(side * protectedContact.b.vx < -3, `dt=${dt}: bumper reapplied impulse during cooldown`);
    assert(Math.abs(protectedContact.b.bumperHitCd - (0.2 - dt)) < 1e-8, `dt=${dt}: bumper cooldown does not count down in seconds`);
    const readyContact = makeHarness(fixture);
    readyContact.b.vx = -side * 4; readyContact.b.bumperHitCd = dt * 0.5; readyContact.step(dt);
    assert(side * readyContact.b.vx > 3, `dt=${dt}: expired bumper cooldown still blocks collision`);
    receipts.push({ dt, side, reboundVx: +hit.b.vx.toFixed(4), cooldown: +hit.b.bumperHitCd.toFixed(4) });
  }
  return { receipts };
});

check('configured bumper plazas contain eight ricochet directions', () => {
  const receipts = [];
  const failures = [];
  for (const track of TRACKS) for (const bumper of track.bumpers || []) {
    const pad = track.platforms.find(p => p.y === bumper.y && Math.abs(p.x - bumper.x) < p.w / 2 && Math.abs(p.z - bumper.z) < p.d / 2);
    assert(pad, `${track.id}: bumper has no supporting plaza`);
    for (const dt of [1 / 120, 1 / 60, 0.04]) for (let compass = 0; compass < 8; compass++) {
      const nx = Math.sin(compass * Math.PI / 4), nz = Math.cos(compass * Math.PI / 4);
      const h = makeHarness({ ...track, start: { x: bumper.x + nx * (bumper.r + 0.6), y: bumper.y + 0.62, z: bumper.z + nz * (bumper.r + 0.6) } });
      h.b.vx = -nx * 3; h.b.vz = -nz * 3;
      h.b.grounded = true; h.b.surfaceKind = pad.kind; h.b.supportPlatform = pad;
      let leftFloor = false, hits = 0, wasHit = false;
      for (let t = 0; t < 1.5; t += dt) {
        h.step(dt);
        if (h.b.bumperHitCd > 0 && !wasHit) hits++;
        wasHit = h.b.bumperHitCd > 0;
        // Project onto actual platform/gear heights so a valid lower connector
        // counts as supported, while a ball above open sky fails before deathY.
        const overFloor = track.platforms.some(p => h.context.sampleTrackSurface(h.b.x,
          h.context.platformFloor(p, h.b.x, h.b.z).y + h.b.r, h.b.z, h.b.r))
          || track.gears.some(g => h.context.sampleTrackSurface(h.b.x, g.y + h.b.r, h.b.z, h.b.r));
        if (!overFloor) leftFloor = true;
      }
      const receipt = { track: track.id, bumperX: bumper.x, bumperZ: bumper.z, dt, compass, hits,
        pops: h.state.pops, leftFloor, endX: +h.b.x.toFixed(3), endZ: +h.b.z.toFixed(3) };
      receipts.push(receipt);
      if (!hits || h.state.pops || leftFloor) failures.push(receipt);
    }
  }
  assert.equal(receipts.length, 96, 'Safety test must exercise four bumpers, eight directions, and three frame rates');
  assert.equal(failures.length, 0, `Unsafe configured bumper ricochets: ${JSON.stringify(failures)}`);
  return { ricochets: receipts.length, pops: 0, leftFloor: false };
});

check('steam vent active and inactive phases with smooth acceleration', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const vent = { x: 0, y: 8, z: 0, r: 1.1, period: 3, duty: 0.5, vy: 7.5, vz: -6 };
    const fixture = testTrack([flat], { steamVents: [vent] });
    const active = makeHarness(fixture);
    active.step(dt);
    const firstVy = active.b.vy;
    assert(active.b.vy > 0 && active.b.vy <= 44 * dt + 1e-8, `dt=${dt}: active vent must accelerate smoothly, vy=${active.b.vy}`);
    assert(active.b.vz < 0 && Math.abs(active.b.vz) <= 20 * dt + 1e-8, `dt=${dt}: active vent forward boost is an instant kick: ${active.b.vz}`);
    assert(!active.b.grounded, `dt=${dt}: active vent did not lift the ball`);
    assert(active.dynamicMeshes.steamVents[0].active, `dt=${dt}: active plume state not updated by physics`);
    let peakVy = active.b.vy;
    for (let t = dt; t < 0.45; t += dt) {
      active.step(dt);
      peakVy = Math.max(peakVy, active.b.vy);
      assert(active.b.vy <= vent.vy + 1e-8, `dt=${dt}: vent stacks vertical impulses above target`);
    }
    assert(peakVy > 3 && active.b.z < -0.5, `dt=${dt}: active vent provides no sustained lift and forward motion`);
    assert.equal(active.state.pops, 0);
    const inactive = makeHarness(fixture);
    inactive.state.elapsed = 2;
    for (let t = 0; t < 0.3; t += dt) inactive.step(dt);
    assert(inactive.b.grounded && Math.abs(inactive.b.y - 8.62) < 0.001, `dt=${dt}: inactive vent lifts the ball`);
    assert(Math.hypot(inactive.b.vx, inactive.b.vz) < 0.001 && inactive.b.boostFlash === 0, `dt=${dt}: inactive vent boosts the ball`);
    assert(!inactive.dynamicMeshes.steamVents[0].active);
    const fast = makeHarness(fixture);
    fast.b.vz = -9; fast.step(dt);
    assert(fast.b.vz < -8.8, `dt=${dt}: vent brakes faster forward travel`);
    const overhead = makeHarness(testTrack([flat], { start: { x: 0, y: 12.62, z: 0 }, steamVents: [vent] }));
    overhead.step(dt);
    assert(overhead.b.vy < 0 && Math.abs(overhead.b.vz) < 0.001, `dt=${dt}: plume boosts ball outside its height range`);
    receipts.push({ dt, firstVy: +firstVy.toFixed(4), peakVy: +peakVy.toFixed(4), forwardZ: +active.b.z.toFixed(4) });
  }
  return { receipts };
});

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
  honey: [[0, -10.5], [2.3, -11, 0.25], [2.3, -15.6, 0.3], [0, -18.5], [0, -43.5]],
  mushroom_canyon: [[0, -9.4], [0, -18.8], [0, -34], [0, -49.2]],
  gear_outpost: [[0, -16.8], [0, -30.2], [-1.6, -36.2], [1.6, -42], [0, -48]],
  belfry: [[0, -16.2], [0, -32.6], [0, -47.4]],
  clockwork: [[0, -14.8], [0, -22.5, 0.3], [2.5, -22.5, 0.2], [2.5, -25.6, 0.2], [0, -28.4], [0, -35.8], [-1.8, -41.4], [1.8, -47], [0, -60.8]],
  frost_slide: [[0, -15.6], [13.4, -15.6], [13.4, -33.6]],
  aurora: [[0, -16.8], [12.6, -16.8], [12.6, -32.5, 0.25], [9, -32.5, 0.25], [8.2, -34.2, 0.3], [0, -34.2], [0, -52.4]],
  sky_finale: [[0, -24.2], [-1.8, -25.3, 0.2], [-1.8, -30.2], [1.8, -36.2], [0, -42.2], [0, -60.6]],
  elevator_connection: [[0, 0]],
};
function runRoute(track, { dt = 1 / 120, speed = 5.5, maxTime = 90, startWait = 0, stopAfterPop = false } = {}) {
  const h = makeHarness(track);
  const points = routePoints[track.id].map(([x, z, radius = 0.9]) => ({ x, z, radius }));
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
    if (h.state.elapsed >= startWait && distance < (points[target].radius ?? 0.9) && canLeave && target < points.length - 1) {
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
    hz: +(1 / dt).toFixed(3),
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
  clockwork: { speed: 7.5, startWait: 3.3 },
  aurora: { speed: 7.5 },
  sky_finale: { speed: 7.5, startWait: 0.1 },
};
// Optional extra real-frame-rate runs: --route-hz=60 or --route-hz=25.
const routeHz = Number(process.argv.find(arg => arg.startsWith('--route-hz='))?.split('=')[1] || 120);
assert(Number.isFinite(routeHz) && routeHz >= 25 && routeHz <= 240, 'Route rate must be 25..240 Hz');
// The coarse-frame driver waits for a different safe hammer interval. These
// fixtures change input timing only; hazard motion and collisions stay live.
const waitsAt25Hz = { belfry: 1, aurora: 0.9 };
for (const track of TRACKS) check(`input-only route: ${track.id}`, () => {
  const strategy = { ...routeStrategies[track.id], dt: 1 / routeHz };
  if (routeHz === 25 && track.id in waitsAt25Hz) strategy.startWait = waitsAt25Hz[track.id];
  let result = runRoute(track, strategy);
  if (process.argv.includes('--search') && (!result.receipt.cleared || result.receipt.pops > 0)) {
    outer: for (const speed of [7.5, 9.5, 8.5, 6.5, 4.5, 3.5]) for (let wait = 0; wait < 4; wait += 0.1) {
      const candidate = runRoute(track, { speed, startWait: +wait.toFixed(2), stopAfterPop: true, dt: 1 / routeHz });
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
