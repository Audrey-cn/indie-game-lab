import assert from 'node:assert/strict';
import * as THREE from 'three';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function verifyCameraOcclusion() {
  const url = new URL('../src/camera-occlusion.mjs', import.meta.url);
  assert(existsSync(url), 'Missing runtime camera line-of-sight safety net');
  const { createCameraOcclusion, isCameraOccluder } = await import(url);
  const root = new THREE.Group(), scenery = new THREE.Group();
  scenery.name = 'environment-test-room'; root.add(scenery);
  const original = new THREE.MeshBasicMaterial({ color: 0xabcdef });
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 1), original);
  blocker.position.z = 4; blocker.userData.cameraOcclusionStructure = true; scenery.add(blocker);
  const untouched = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), original);
  untouched.position.x = 20; scenery.add(untouched);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 8, .1), original);
  deck.position.z = 2; deck.userData.courseRibbon = true; root.add(deck);
  const ball = { x: 0, y: 0, z: 0, r: .62 }, camera = { x: 0, y: 0, z: 10 };
  const safety = createCameraOcclusion(root);
  for (const dt of [1 / 120, 1 / 60, 1 / 25]) {
    safety.reset(); safety.update(ball, camera, dt);
    assert(blocker.material.opacity > .18 && blocker.material.opacity < 1, 'First blocked frame must fade softly');
    const firstOpacity = blocker.material.opacity;
    assert(1 - firstOpacity <= 10 * dt + 1e-10, 'Large wall opacity jumped on contact');
    for (let i = 0; i < Math.ceil(1 / dt); i++) safety.update(ball, camera, dt);
    assert(blocker.material.opacity >= .18 && blocker.material.opacity < .181, 'Large wall never settles to 0.18');
    assert(blocker.material.transparent && !blocker.material.depthWrite, 'Faded wall still writes opaque depth');
    assert.equal(untouched.material, original, 'Shared material leaked fading to clear scenery');
    assert.equal(deck.material, original, 'Playable deck was faded');
    // The first surface can be behind a camera that is inside a closed prop.
    blocker.position.z = 10; safety.update(ball, camera, dt);
    assert(blocker.material.opacity < .181, 'Camera inside a closed structure is not protected');
    blocker.position.set(20, 0, 4);
    safety.update(ball, camera, dt);
    assert(blocker.material.opacity > .18 && blocker.material.opacity < 1, 'Restoration must be gradual');
    for (let t = 0; t < 3; t += dt) safety.update(ball, camera, dt);
    assert.equal(blocker.material, original, 'Clear wall did not regain its exact original material');
    blocker.position.set(0, 0, 4);
  }
  // A narrow prop at the ball silhouette must be caught even with a clear center ray.
  blocker.scale.set(.04, .04, 1); blocker.position.set(.39, 0, 4);
  safety.update(ball, camera, 1 / 60);
  assert(blocker.material.opacity < 1, 'Structural silhouette did not fade despite a clear center ray');
  // Newly attached meshes (including asynchronously loaded models) join the checks.
  const late = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), Array(6).fill(original));
  late.position.z = 6; late.userData.cameraOcclusionStructure = true; scenery.add(late); safety.refresh(); safety.update(ball, camera, 1 / 60);
  assert(late.material.every(m => m.opacity < 1 && m.opacity > .18), 'Late multi-material structure did not fade softly');
  safety.dispose();
  assert.equal(blocker.material, original, 'Stage teardown did not restore faded material');
  assert(late.material.every(m => m === original), 'Multi-material originals not restored');
  // Outside / behind camera geometry must never fade.
  const outside = createCameraOcclusion(root); blocker.scale.set(1, 1, 1);
  blocker.position.set(0, 0, 13); late.position.x = 20;
  outside.update(ball, camera, 1 / 60);
  assert.equal(blocker.material, original, 'Geometry beyond the camera faded');
  outside.dispose();
  // Match the side that the camera actually renders. A ball-to-camera ray sees
  // the back of an inward-facing, single-sided cutaway wall and misses it.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), original);
  wall.position.z = 4; wall.userData.cameraOcclusionStructure = true; scenery.add(wall);
  blocker.position.x = 20;
  const oneSided = createCameraOcclusion(root);
  oneSided.update(ball, camera, 1 / 60);
  assert(wall.material.opacity < 1, 'Camera-visible single-sided wall was missed');
  oneSided.dispose();
  wall.position.x = 20;
  const sliver = new THREE.Mesh(new THREE.BoxGeometry(.04, .04, .04), original);
  sliver.position.set(.16, .08, 4); scenery.add(sliver);
  const betweenRays = createCameraOcclusion(root);
  betweenRays.update(ball, camera, 1 / 60);
  assert.equal(sliver.material, original, 'Tiny scenery prop was faded');
  assert.equal(isCameraOccluder(sliver, root), false, 'Environment name made a tiny prop fade-eligible');
  betweenRays.dispose();
  sliver.position.x = 20;
  const opaqueAlpha = new THREE.MeshBasicMaterial({ opacity: .1, transparent: false });
  const lowAlpha = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), opaqueAlpha);
  lowAlpha.position.z = 4; lowAlpha.userData.cameraOcclusionStructure = true; scenery.add(lowAlpha);
  const opaqueSafety = createCameraOcclusion(root);
  opaqueSafety.update(ball, camera, 1 / 60);
  assert(lowAlpha.material.transparent && !lowAlpha.material.depthWrite,
    'Low alpha with opaque blending still hides the ball');
  assert(lowAlpha.material.opacity > .18 && lowAlpha.material.opacity < 1, 'Opaque blending must fade softly from effective full coverage');
  opaqueSafety.dispose();
  const excludedRoot = new THREE.Group();
  for (const marker of ['structuralGuard', 'routeBody', 'courseRibbon', 'decorativeProp', 'critter', 'cameraOccluder']) {
    const small = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .2), original);
    small.position.z = 4; small.userData[marker] = true; excludedRoot.add(small);
    if (['structuralGuard', 'routeBody', 'courseRibbon'].includes(marker)) small.userData.cameraOcclusionStructure = true;
  }
  const excluded = createCameraOcclusion(excludedRoot);
  for (let i = 0; i < 120; i++) excluded.update(ball, camera, 1 / 60);
  for (const small of excludedRoot.children) assert.equal(small.material, original, 'Rail or small prop was faded');
  excluded.dispose();
  console.log('Passed runtime camera occlusion: soft structural fades, rail/prop exclusions, silhouette, material isolation and restoration at 120/60/25Hz.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await verifyCameraOcclusion();
