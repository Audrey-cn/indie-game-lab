import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { createCameraSightline } from '../src/camera-sightline.mjs';

const heading = p => Math.atan2(p.x - p.lookX, p.z - p.lookZ);
const delta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const distance = (p, b) => Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z);
const ball = { x: 0, y: 0, z: 0, r: .62 };
const pose = { x: 0, y: 6, z: 10, lookX: 0, lookY: 0, lookZ: -1, fov: 46, mode: 'MANUAL_ORBIT' };
function solid(root, geometry, position, material = new THREE.MeshBasicMaterial()) {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(position);
  mesh.userData.courseRibbon = true; root.add(mesh); return mesh;
}
function centerClear(root, p) {
  root.updateMatrixWorld(true);
  const from = new THREE.Vector3(p.x, p.y, p.z), to = new THREE.Vector3(ball.x, ball.y, ball.z);
  const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), .01, from.distanceTo(to) - ball.r);
  return !ray.intersectObject(root, true).some(hit => {
    for (let n = hit.object; n; n = n.parent) if (!n.visible) return false;
    const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
    return material?.visible && (!material.transparent || material.opacity >= .85);
  });
}
export function verifyCameraSightline() {
  let cases = 0;
  for (const hz of [120, 60, 25]) {
    const dt = 1 / hz, root = new THREE.Group();
    const deck = solid(root, new THREE.BoxGeometry(8, .4, 6), new THREE.Vector3(0, 2, 2));
    const floor = solid(root, new THREE.BoxGeometry(12, .1, 12), new THREE.Vector3(0, -.67, 0));
    const material = deck.material, vertices = Array.from(deck.geometry.attributes.position.array), requested = { ...pose };
    const safety = createCameraSightline(root);
    assert(!centerClear(root, pose), 'upper playable deck fixture does not block the original view');
    const corrected = safety.resolve(ball, pose, dt);
    assert(corrected.sightline.clear, 'upper deck did not yield a verified clear camera');
    assert(centerClear(root, corrected), 'corrected camera still sees opaque upper deck');
    assert(distance(corrected, ball) < distance(pose, ball), 'camera did not shorten its boom');
    assert(Math.abs(delta(heading(corrected), heading(pose))) < 1e-10, 'reframing changed movement yaw');
    const eye = new THREE.Vector3(corrected.x, corrected.y, corrected.z);
    const bubbleDirection = new THREE.Vector3().sub(eye), aim = new THREE.Vector3(corrected.lookX, corrected.lookY, corrected.lookZ).sub(eye);
    assert(bubbleDirection.angleTo(aim) + Math.asin(ball.r / eye.length()) < corrected.fov * Math.PI / 360,
      'compressed camera crops the bubble despite a clear sightline');
    assert.deepEqual(pose, requested, 'resolver mutated the director pose');
    assert.equal(deck.material, material, 'resolver faded a playable deck');
    assert.equal(material.opacity, 1, 'resolver changed playable opacity');
    assert.deepEqual(Array.from(deck.geometry.attributes.position.array), vertices, 'resolver changed playable geometry');
    deck.position.x = 30;
    const recovering = safety.resolve(ball, pose, dt);
    assert(distance(recovering, ball) > distance(corrected, ball), 'camera never restores its boom');
    assert(distance(recovering, ball) < distance(pose, ball), 'camera restores with a discontinuous outward jump');
    let restored = recovering;
    for (let i = 0; i < hz * 3; i++) restored = safety.resolve(ball, pose, dt);
    assert(Math.abs(distance(restored, ball) - distance(pose, ball)) < .01, 'clear camera failed to restore original framing');
    assert.equal(floor.material.opacity, 1, 'support floor was faded'); cases++;

    const thinRoot = new THREE.Group();
    solid(thinRoot, new THREE.BoxGeometry(.04, .04, .04), new THREE.Vector3(.16, .08, 4));
    const straight = { ...pose, y: 0, lookZ: 0 };
    const thin = createCameraSightline(thinRoot).resolve(ball, straight, dt);
    assert(thin.sightline.clear && thin.sightline.compressed, 'narrow strip between silhouette rays was missed');
    assert(Math.abs(delta(heading(thin), 0)) < 1e-10, 'narrow-strip avoidance adds yaw'); cases++;
    const reflectedRoot = new THREE.Group();
    const reflected = solid(reflectedRoot, new THREE.PlaneGeometry(.04, .04), new THREE.Vector3(.16, .08, 4));
    reflected.scale.x = -1;
    const reflectedPose = createCameraSightline(reflectedRoot).resolve(ball, straight, dt);
    assert(reflectedPose.sightline.clear && reflectedPose.sightline.compressed,
      'negative parent scale flipped the visible side of a narrow strip'); cases++;
    const closeStripRoot = new THREE.Group();
    solid(closeStripRoot, new THREE.BoxGeometry(.025, .025, .025), new THREE.Vector3(.5, .08, .4));
    const closeStrip = createCameraSightline(closeStripRoot).resolve(ball, straight, dt);
    assert(closeStrip.sightline.clear && closeStrip.sightline.compressed,
      'narrow opaque strip just outside the sphere front was missed between rays'); cases++;

    const lowRoot = new THREE.Group(), low = new THREE.MeshBasicMaterial({ opacity: .1, transparent: false });
    const lowDeck = solid(lowRoot, new THREE.BoxGeometry(8, .4, 6), new THREE.Vector3(0, 2, 2), low);
    const lowSafety = createCameraSightline(lowRoot), lowPose = lowSafety.resolve(ball, pose, dt);
    assert(lowPose.sightline.compressed && centerClear(lowRoot, lowPose), 'transparent=false low-opacity deck was treated as transparent');
    lowDeck.parent.visible = false; lowSafety.reset();
    assert(!lowSafety.resolve(ball, pose, dt).sightline.compressed, 'hidden parent still forces reframing'); cases++;

    const multiRoot = new THREE.Group(), materials = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({ visible: false }));
    materials[4] = new THREE.MeshBasicMaterial();
    solid(multiRoot, new THREE.BoxGeometry(8, 8, .2), new THREE.Vector3(0, 0, 4), materials);
    const multiSafety = createCameraSightline(multiRoot);
    assert(multiSafety.resolve(ball, straight, dt).sightline.compressed, 'opaque material group was missed');
    materials[4].visible = false; multiSafety.reset();
    assert(!multiSafety.resolve(ball, straight, dt).sightline.compressed, 'invisible material group still occludes'); cases++;

    // A visibility ray ends at the first sphere surface, rather than continuing
    // into the ball toward an equator-plane sampling point behind that surface.
    const contactRoot = new THREE.Group();
    solid(contactRoot, new THREE.BoxGeometry(.02, .02, .02), new THREE.Vector3(.58, 0, .13));
    const closePose = { ...straight, z: 2.2 };
    assert(!createCameraSightline(contactRoot).resolve(ball, closePose, dt).sightline.compressed,
      'geometry hidden behind the first visible bubble surface forced camera movement'); cases++;

    const insideRoot = new THREE.Group();
    const enclosingEye = solid(insideRoot, new THREE.BoxGeometry(8, 8, 2), new THREE.Vector3(0, 6, 10));
    const outsideEye = createCameraSightline(insideRoot).resolve(ball, pose, dt);
    assert(outsideEye.sightline.clear && outsideEye.sightline.compressed,
      'camera inside a single-sided closed deck was falsely reported safe');
    const enclosureBounds = new THREE.Box3().setFromObject(enclosingEye);
    assert(!enclosureBounds.containsPoint(new THREE.Vector3(outsideEye.x, outsideEye.y, outsideEye.z)),
      'corrected camera remains inside the closed solid'); cases++;

    const portraitRoot = new THREE.Group();
    solid(portraitRoot, new THREE.BoxGeometry(8, .4, 6), new THREE.Vector3(0, 2, 2));
    const portrait = createCameraSightline(portraitRoot).resolve(ball, { ...pose, aspect: .25, fov: 54 }, dt);
    const portraitEye = new THREE.Vector3(portrait.x, portrait.y, portrait.z);
    const toBall = new THREE.Vector3().sub(portraitEye);
    const toAim = new THREE.Vector3(portrait.lookX, portrait.lookY, portrait.lookZ).sub(portraitEye);
    const horizontalHalf = Math.atan(Math.tan(portrait.fov * Math.PI / 360) * .25);
    assert(toBall.angleTo(toAim) + Math.asin(ball.r / portraitEye.length()) < horizontalHalf,
      'portrait safety framing crops the bubble horizontally'); cases++;

    const enclosed = new THREE.Group();
    solid(enclosed, new THREE.SphereGeometry(1, 16, 12), new THREE.Vector3(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const impossible = createCameraSightline(enclosed).resolve(ball, pose, dt);
    assert.equal(impossible.sightline.clear, false, 'unresolved enclosed geometry was falsely reported clear'); cases++;

    for (const yaw of [.9, Math.PI - .01, -Math.PI + .01]) {
      const rotated = new THREE.Group();
      solid(rotated, new THREE.BoxGeometry(8, .4, 6), new THREE.Vector3(0, 2, 2)); rotated.rotation.y = yaw;
      const rotatedEye = new THREE.Vector3(pose.x, pose.y, pose.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      const rotatedAim = new THREE.Vector3(pose.lookX, pose.lookY, pose.lookZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      const request = { ...pose, x: rotatedEye.x, y: rotatedEye.y, z: rotatedEye.z,
        lookX: rotatedAim.x, lookY: rotatedAim.y, lookZ: rotatedAim.z };
      const safe = createCameraSightline(rotated).resolve(ball, request, dt);
      assert(safe.sightline.clear && centerClear(rotated, safe), 'rotated playable deck remains opaque');
      assert(Math.abs(delta(heading(safe), yaw)) < 1e-10, 'safety reframing rotates yaw across wrap boundary'); cases++;
    }

    const movingRoot = new THREE.Group(), movingParent = new THREE.Group(); movingRoot.add(movingParent);
    solid(movingParent, new THREE.BoxGeometry(8, .4, 6), new THREE.Vector3(0, 2, 2));
    movingParent.position.x = 30;
    const movingSafety = createCameraSightline(movingRoot);
    assert(!movingSafety.resolve(ball, pose, dt).sightline.compressed, 'clear moving platform starts blocked');
    movingParent.position.x = 0; movingParent.rotation.y = .3; movingParent.scale.set(1.1, 1, .9);
    const moved = movingSafety.resolve(ball, pose, dt);
    assert(moved.sightline.clear && moved.sightline.compressed && centerClear(movingRoot, moved),
      'cached geometry ignored a changed parent translation rotation or nonuniform scale'); cases++;

    const editedRoot = new THREE.Group(), editedGeometry = new THREE.BoxGeometry(8, .4, 6);
    editedGeometry.translate(30, 0, 0);
    solid(editedRoot, editedGeometry, new THREE.Vector3(0, 2, 2));
    const editedSafety = createCameraSightline(editedRoot);
    assert(!editedSafety.resolve(ball, pose, dt).sightline.compressed, 'clear edited geometry starts blocked');
    editedGeometry.translate(-30, 0, 0);
    const edited = editedSafety.resolve(ball, pose, dt);
    assert(edited.sightline.clear && edited.sightline.compressed && centerClear(editedRoot, edited),
      'cached triangles ignored the updated vertex buffer version'); cases++;

    const rangeRoot = new THREE.Group(), rangeGeometry = new THREE.BoxGeometry(8, .4, 6);
    rangeGeometry.setDrawRange(0, 0);
    solid(rangeRoot, rangeGeometry, new THREE.Vector3(0, 2, 2));
    const rangeSafety = createCameraSightline(rangeRoot);
    assert(!rangeSafety.resolve(ball, pose, dt).sightline.compressed, 'undrawn triangles block the camera');
    rangeGeometry.setDrawRange(0, Infinity);
    assert(rangeSafety.resolve(ball, pose, dt).sightline.compressed, 'updated draw range did not restore opaque triangles');
    const originalIndex = rangeGeometry.index.clone(); rangeGeometry.setIndex([]); rangeSafety.reset();
    assert(!rangeSafety.resolve(ball, pose, dt).sightline.compressed, 'removed index buffer triangles still block the camera');
    rangeGeometry.setIndex(originalIndex);
    assert(rangeSafety.resolve(ball, pose, dt).sightline.compressed, 'restored index buffer did not restore the blocker'); cases++;

    const interleavedRoot = new THREE.Group(), interleaved = new THREE.BufferGeometry();
    const buffer = new THREE.InterleavedBuffer(new Float32Array([19,-1,4,0,21,-1,4,0,21,1,4,0,19,1,4,0]), 4);
    const interleavedPosition = new THREE.InterleavedBufferAttribute(buffer, 3, 0);
    interleaved.setAttribute('position', interleavedPosition); interleaved.setIndex([0,1,2,0,2,3]);
    solid(interleavedRoot, interleaved, new THREE.Vector3());
    const interleavedSafety = createCameraSightline(interleavedRoot);
    assert(!interleavedSafety.resolve(ball, straight, dt).sightline.compressed, 'clear interleaved geometry starts blocked');
    for (let i = 0; i < interleavedPosition.count; i++) interleavedPosition.setX(i, interleavedPosition.getX(i) - 20);
    buffer.needsUpdate = true;
    const interleavedPose = interleavedSafety.resolve(ball, straight, dt);
    assert(interleavedPose.sightline.clear && interleavedPose.sightline.compressed,
      'updated interleaved position buffer did not invalidate cached triangles'); cases++;

  }
  return { rates: [120, 60, 25], cases };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(verifyCameraSightline(), null, 2));
