// Load the authored GLBs and exercise the browser's actual normalization/mounting
// functions without WebGL. This checks geometry and async behavior, not pixels.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildTrackScene } from '../src/cel-builder.mjs';
import { TRACKS } from '../src/config.mjs';

const source = await readFile(new URL('../src/main.mjs', import.meta.url), 'utf8');
function extract(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing model integration source: ${start}`);
  return source.slice(a, b);
}
const code = extract('function loadGlbModel(', 'const SAVE_KEY')
  + extract('function mountTrackModels(', 'function loadTrack(');
const keys = ['hazard-rolling-pin', 'hazard-flail', 'hazard-bumper', 'hazard-vent', 'hazard-seesaw'];
const authored = Object.fromEntries(await Promise.all(keys.map(async key => {
  const data = await readFile(new URL(`../src/models/${key}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  return [key, gltf];
})));
const gradient = { addColorStop() {} };
const canvasContext = new Proxy({}, { get: (_, key) => /create.*Gradient/.test(key) ? () => gradient : () => {} });
globalThis.document = { createElement: () => ({ getContext: () => canvasContext }) };

function harness(built, mode = 'ready') {
  const jobs = [], errors = [];
  const context = vm.createContext({
    THREE, SkeletonUtils, trackRoot: built.group,
    GLB_MODELS: mode === 'missing' ? {} : Object.fromEntries(keys.map(key => [key, key])),
    loadedGlbCache: {}, pendingGlbLoads: new Map(),
    gltfLoader: { load(key, ready, progress, fail) {
      jobs.push(() => mode === 'failed' ? fail(new Error('fixture load failure')) : ready(authored[key]));
    } },
    console: { warn: (...args) => errors.push(args) },
  });
  vm.runInContext(`${code}\nthis.mountTrackModels = mountTrackModels;`, context);
  context.mountTrackModels(built);
  return { context, jobs, errors, flush() { for (const job of jobs.splice(0)) job(); } };
}
function slots(meshes) {
  return [
    ...(meshes.rollingPins || []).map(s => ({ ...s, key: keys[0] })),
    ...meshes.hammers.filter(s => s.def.variant === 'flail').map(s => ({ ...s, key: keys[1], fallback: s.headFallback })),
    ...(meshes.bumpers || []).map(s => ({ ...s, key: keys[2] })),
    ...(meshes.steamVents || []).map(s => ({ ...s, key: keys[3] })),
    ...meshes.propSlots.filter(s => s.key === keys[4]).map(s => ({ ...s, modelAnchor: s.anchor })),
  ];
}
const seen = new Set();
let mounts = 0;
for (const track of TRACKS) {
  for (const mode of ['ready', 'missing', 'failed', 'stale']) {
    const built = buildTrackScene(track);
    const registrations = slots(built.dynamicMeshes);
    const h = harness(built, mode);
    if (mode === 'stale') h.context.trackRoot = new THREE.Group();
    h.flush();
    for (const slot of registrations) {
      assert(slot.fallback, `${track.id} ${slot.key}: missing fallback`);
      if (mode !== 'ready') {
        assert(slot.fallback.visible, `${mode}: fallback disappeared`);
        assert(slot.modelAnchor.children.every(child => child === slot.fallback), `${mode}: unexpected mounted GLB`);
        continue;
      }
      seen.add(slot.key); mounts++;
      assert.equal(slot.fallback.visible, false, `${slot.key}: fallback still shown after loading`);
      assert.equal(slot.modelAnchor.children.length, 1, `${slot.key}: missing mounted model`);
      built.group.updateMatrixWorld(true);
      const model = slot.modelAnchor.children[0];
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      assert([...box.min, ...box.max].every(Number.isFinite), `${slot.key}: nonfinite bounds`);
      assert(Math.min(size.x, size.y, size.z) > 0.01, `${slot.key}: empty model`);
      if (slot.key === keys[0]) {
        const barrel = model.getObjectByName('Cylinder');
        assert(barrel, 'Authored pin barrel missing');
        const barrelSize = new THREE.Box3().setFromObject(barrel).getSize(new THREE.Vector3());
        assert(Math.abs(barrelSize.x - slot.def.width) < 0.001, 'Pin barrel width must match collider');
        assert(Math.abs(size.y - 0.96) < 0.001 && Math.abs(size.z - 0.96) < 0.001, 'Pin radial bounds');
      }
      if (slot.key === keys[2] || slot.key === keys[3]) {
        assert(Math.abs(Math.max(size.x, size.z) - 2 * slot.def.r) < 0.001, `${slot.key}: footprint/collision mismatch`);
        assert(Math.abs(box.min.y - slot.def.y) < 0.001, `${slot.key}: model is not grounded`);
      }
      if (slot.plume) assert(slot.plume.parent && slot.plume !== slot.fallback, 'Wind plume must survive GLB mounting');
    }
  }
}
assert.deepEqual([...seen].sort(), [...keys].sort(), 'All five supplied models must be mounted');
console.log(`Passed ${mounts} authored hazard model mounts, with missing-file, failed-load and stale-track fallback checks.`);
