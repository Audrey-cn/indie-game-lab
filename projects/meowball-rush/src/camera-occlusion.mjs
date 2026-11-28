import * as THREE from 'three';

// Only scenery participates: the playable floor/guard/chute remains an honest
// depth reference. Descendants inherit their parent's classification (outlines too).
export function isCameraOccluder(mesh, root) {
  if (!mesh.isMesh) return false;
  let scenery = false;
  for (let node = mesh; node; node = node.parent) {
    if (node.userData.cameraOcclusionIgnore || node.userData.courseRibbon
      || node.userData.routeBody || node.userData.structuralGuard
      || node.name.startsWith('v3-dock-') || node.name === 'chute-half-pipe-shell') return false;
    if (node.userData.cameraOccluder || node.userData.decorativeProp
      || node.name.startsWith('environment-') || node.name.startsWith('v3-world-')) scenery = true;
    if (node === root) break;
  }
  return scenery;
}

export function createCameraOcclusion(root) {
  const raycaster = new THREE.Raycaster(), origin = new THREE.Vector3();
  const camera = new THREE.Vector3(), direction = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), point = new THREE.Vector3();
  const sphere = new THREE.Sphere(), bounds = new THREE.Box3(), hits = [];
  const view = new THREE.PerspectiveCamera(), frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  const fading = new Map(), blocked = new Set(), candidates = [];
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [.707, .707], [-.707, .707], [.707, -.707], [-.707, -.707]];
  let meshes = [];
  const visible = mesh => {
    for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  function refresh() {
    meshes = [];
    root.traverse(mesh => {
      if (!isCameraOccluder(mesh, root)) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      meshes.push(mesh);
    });
  }
  function restore(mesh, entry) {
    mesh.material = entry.original;
    mesh.castShadow = entry.castShadow;
    for (const material of entry.materials) material.dispose();
    fading.delete(mesh);
  }
  function reset() {
    for (const [mesh, entry] of fading) restore(mesh, entry);
    blocked.clear();
  }
  function update(ball, cameraPosition, dt) {
    root.updateMatrixWorld(true);
    origin.set(ball.x, ball.y, ball.z);
    camera.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    direction.subVectors(camera, origin);
    const distance = direction.length();
    blocked.clear(); candidates.length = 0;
    if (distance > .01) {
      direction.divideScalar(distance);
      raycaster.set(origin, direction); raycaster.near = .01; raycaster.far = distance;
      const radius = ball.r || .62;
      view.position.copy(camera); view.lookAt(origin);
      view.near = .001; view.far = distance;
      view.fov = 2 * Math.asin(Math.min(.99, radius / distance)) * 180 / Math.PI;
      view.updateProjectionMatrix(); view.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
      // Broad phase uses cached local bounds, so triangle raycasts only touch
      // props near the small view cone surrounding the ball silhouette.
      for (const mesh of meshes) {
        if (!visible(mesh)) continue;
        sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
        sphere.radius += radius;
        if (!raycaster.ray.intersectsSphere(sphere)
          || origin.distanceTo(sphere.center) - sphere.radius > distance) continue;
        candidates.push(mesh);
        bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        // Bounds conservatively cover the entire silhouette cone, including
        // thin twigs between rays and closed props enclosing either endpoint.
        // Limited extra fading at a bounding-box corner is preferable to
        // leaving any opaque fragment over the ball between sampled rays.
        if (frustum.intersectsBox(bounds) || bounds.containsPoint(camera)
          || bounds.containsPoint(origin)) blocked.add(mesh);
      }
      right.crossVectors(direction, THREE.Object3D.DEFAULT_UP);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      else right.normalize();
      up.crossVectors(right, direction).normalize();
      for (const [x, y] of offsets) {
        point.copy(origin).addScaledVector(right, x * radius).addScaledVector(up, y * radius);
        // Intersect from the rendered side so inward-facing single-sided
        // cutaway walls are tested exactly as the camera sees them.
        direction.subVectors(point, camera);
        raycaster.far = direction.length(); direction.normalize(); raycaster.set(camera, direction);
        hits.length = 0;
        raycaster.intersectObjects(candidates, false, hits);
        for (const hit of hits) blocked.add(hit.object);
      }
    }
    for (const mesh of blocked) {
      if (fading.has(mesh)) continue;
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!originals.some(m => m.visible && (!m.transparent || m.opacity > .18))) continue;
      const materials = originals.map(m => m.clone());
      fading.set(mesh, { original: mesh.material, castShadow: mesh.castShadow,
        materials, opacities: originals.map(m => m.transparent ? m.opacity : 1), factor: .18 });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      mesh.castShadow = false;
    }
    for (const [mesh, entry] of fading) {
      // Reveal on the first hit; easing into transparency would leave an opaque
      // obstruction on low-Hz frames. Restore gently to avoid visibility flicker.
      entry.factor = blocked.has(mesh) ? .18 : 1 - (1 - entry.factor) * Math.exp(-6 * dt);
      if (entry.factor > .998) { restore(mesh, entry); continue; }
      entry.materials.forEach((material, i) => {
        material.opacity = entry.opacities[i] * entry.factor;
        material.transparent = true; material.depthWrite = false;
      });
    }
    return blocked;
  }
  refresh();
  return { update, refresh, reset, dispose: reset };
}
