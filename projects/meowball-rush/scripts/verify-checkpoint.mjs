import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resetBallToCheckpoint } from '../src/checkpoint-runtime.mjs';
import { createDirector } from '../src/director.mjs';
import { createMagicBurst, updateMagicBursts } from '../src/magic-effects.mjs';
import * as THREE from 'three';

const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/shell.html', import.meta.url), 'utf8');
const slice = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert(start >= 0 && end > start, `Missing checkpoint integration marker ${from}`);
  return source.slice(start, end);
};
const resetCode = slice('function respawnToCheckpoint()', 'function openPause()');
const keyCode = slice('window.addEventListener("keydown"', 'window.addEventListener("keyup"');
const buttonCode = slice("document.getElementById('btn-respawn-checkpoint')", 'document.getElementById("btn-restart-stage")');
const checkpoint = { x: 12, y: 7, z: -30 };
let resets = 0;
for (const trigger of ['KeyR', 'btn-hud-reset', 'btn-respawn-checkpoint']) {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { hidden: false });
    return elements.get(id);
  } };
  const ball = { r: .62, x: -90, y: -12, z: 80, vx: 13, vy: -8, vz: 7,
    popTimer: 1, chuteRide: {}, chuteTangent: { x: 1, z: 0 }, launchAssist: {},
    fallRecovery: {}, dizzyTimer: 3, boostFlash: 1, propCooldowns: new Map([['critter', .7]]) };
  const state = { phase: trigger === 'KeyR' ? 'playing' : 'paused', ball,
    checkpoint, checkpointIdx: 2, track: { startYaw: .8 }, stars: 4, timeLeft: 63,
    pops: 1, elapsed: 40, input: { keys: new Set(['KeyW']), ix: 1, iz: 1, mouseAccX: 5 },
    director: { focus: { x: -90, y: -12, z: 80 }, distance: 2.2 }, fallEffects: [] };
  const rig = { bubbleMesh: {}, kitty: {}, accGroup: {}, furball: {},
    root: { scale: { setScalar: n => assert.equal(n, 1) } } };
  let rendered = 0, hud = 0, cameraResets = 0, prevented = 0;
  const context = vm.createContext({ state, resetBallToCheckpoint, createDirector, document,
    kittyRig: rig, pauseScreen: {}, trailPoints: [1, 2],
    cameraOcclusion: { reset: () => cameraResets++ }, cameraSightline: { reset: () => cameraResets++ },
    updateFallEffects: () => {}, updateMagicBursts, sfx: { setPaused: () => {} },
    updateVisuals(dt) { assert.equal(dt, 0); rendered++; }, syncHud: () => hud++, showToast: () => {},
    window: { addEventListener(type, fn) { context.onKey = fn; } },
  });
  vm.runInContext(`${resetCode}\n${keyCode}\n${buttonCode}`, context);
  if (trigger === 'KeyR') {
    context.onKey({ code: 'KeyR', repeat: false, target: { tagName: 'BODY' }, preventDefault() { prevented++; } });
    assert.equal(prevented, 1);
    context.onKey({ code: 'KeyR', repeat: true, preventDefault() { assert.fail('held R repeats reset'); } });
  } else document.getElementById(trigger).onclick();
  assert.deepEqual([ball.x, ball.y, ball.z], [checkpoint.x, checkpoint.y + .62 + .06, checkpoint.z]);
  assert.deepEqual([ball.vx, ball.vy, ball.vz], [0, 0, 0]);
  for (const field of ['chuteRide', 'launchAssist', 'fallRecovery', 'supportRoute', 'supportPlatform']) assert.equal(ball[field], null);
  assert.equal(ball.popTimer, 0); assert.equal(ball.dizzyTimer, 0); assert.equal(ball.propCooldowns.size, 0);
  assert.equal(state.phase, 'playing'); assert.equal(state.director.distance, 12); assert.equal(state.director.focus, undefined);
  assert.equal(state.input.keys.size, 0); assert.equal(context.trailPoints.length, 0);
  assert.equal(rig.furball.visible, false); assert.equal(rig.bubbleMesh.visible, true);
  assert.equal(cameraResets, 2); assert.equal(rendered, 1); assert.equal(hud, 1);
  assert.deepEqual([state.checkpointIdx, state.stars, state.timeLeft, state.pops, state.elapsed], [2, 4, 63, 1, 40]);
  resets++;
}
assert(html.indexOf('id="btn-respawn-checkpoint"') < html.indexOf('id="btn-restart-stage"'));
assert(html.includes('✨ 回到检查点 (R)') && html.includes('id="btn-hud-reset"'));
const parent = new THREE.Group(), effects = [];
createMagicBurst(parent, effects, checkpoint);
assert.equal(parent.children.length, 1); assert.equal(effects[0].group.children.length, 18);
updateMagicBursts(effects, .2);
assert(effects[0].material.opacity < 1 && effects[0].group.children[0].position.y > 0);
updateMagicBursts(effects, 1);
assert.equal(effects.length, 0); assert.equal(parent.children.length, 0);
console.log(`Passed checkpoint respawn integration (${resets} inputs) and sparkle lifetime checks.`);
