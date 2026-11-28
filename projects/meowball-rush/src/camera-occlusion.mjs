import * as THREE from 'three';
import { nearestRouteSurface } from './course-math.mjs';

// Only authored large scenery structures participate. General scenery names,
// small decorative props and legacy mushroom tags do not imply fade eligibility.
// Descendants inherit a structure marker so its outlines fade with the surface.
export function isCameraOccluder(mesh, root) {
  if (!mesh.isMesh) return false;
  // Flagship decks opt in explicitly. The supporting tier is protected in
  // update(); the very same geometry becomes a cutaway from a lower tier.
  let deck = false;
  for (let node = mesh; node; node = node.parent) {
    if (node.userData.cameraOcclusionIgnore) return false;
    if (node.userData.cameraOcclusionDeck) deck = true;
    if (node === root) break;
  }
  if (deck) return true;
  let scenery = false;
  for (let node = mesh; node; node = node.parent) {
    if (node.userData.cameraOcclusionIgnore || node.userData.courseRibbon
      || node.userData.routeBody || node.userData.structuralGuard
      || node.name.startsWith('v3-dock-') || node.name === 'chute-half-pipe-shell') return false;
    if (node.userData.cameraOcclusionStructure) scenery = true;
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
  const fading = new Map(), blocked = new Set(), candidates = [], supportingGuards = new Set();
  const deckMeshes = new Map();
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [.707, .707], [-.707, .707], [.707, -.707], [-.707, -.707]];
  let meshes = [];
  const visible = mesh => {
    for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  function refresh() {
    meshes = []; deckMeshes.clear();
    root.traverse(mesh => {
      if (!isCameraOccluder(mesh, root)) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      meshes.push(mesh);
      for (let node = mesh; node; node = node.parent) {
        if (node.userData.cameraOcclusionDeck) { deckMeshes.set(mesh, node); break; }
        if (node === root) break;
      }
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
    blocked.clear(); candidates.length = 0; supportingGuards.clear();
    if (distance > .01) {
      direction.divideScalar(distance);
      raycaster.set(origin, direction); raycaster.near = .01; raycaster.far = distance;
      const radius = ball.r || .62;
      view.position.copy(camera); view.lookAt(origin);
      view.near = .001; view.far = distance;
      view.fov = 2 * Math.asin(Math.min(.99, (radius + .01) / distance)) * 180 / Math.PI;
      view.updateProjectionMatrix(); view.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
      // Broad phase uses cached local bounds, so triangle raycasts only touch
      // props near the small view cone surrounding the ball silhouette.
      const supportCeiling = ball.y - radius + .55;
      for (const mesh of meshes) {
        if (!visible(mesh)) continue;
        bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        const deck = deckMeshes.get(mesh);
        if (deck) {
          const route = deck.userData.route;
          const support = route ? nearestRouteSurface([route], ball.x, ball.z, Infinity) : null;
          // Never fade the deck the ball is riding, even at a bank or ramp.
          const supporting = route && route === ball.supportRoute || support && support.y <= supportCeiling;
          const ownGuard = supporting && (mesh.userData.routeBody || mesh.userData.structuralGuard
            || mesh.name === 'chute-half-pipe-shell' && ball.chuteRide);
          if (supporting && !ownGuard || !support && !supporting && bounds.max.y <= supportCeiling) continue;
          // A close banked guard may hide the bubble from its own legal edge
          // station. Cut away just that guard on actual ray contact, while the
          // supporting ribbon retains its original material and shadows.
          if (ownGuard) supportingGuards.add(mesh);
          const overhead = support ? support.y > supportCeiling : bounds.min.y > supportCeiling;
          // Under-table cutaways are independent of the current camera angle:
          // the top, underside and bevel remain clear throughout an orbit.
          if (overhead && ball.x >= bounds.min.x - radius && ball.x <= bounds.max.x + radius
            && ball.z >= bounds.min.z - radius && ball.z <= bounds.max.z + radius) blocked.add(mesh);
        }
        sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
        sphere.radius += radius;
        if (!raycaster.ray.intersectsSphere(sphere)
          || origin.distanceTo(sphere.center) - sphere.radius > distance) continue;
        // Bounds conservatively cover the entire silhouette cone, including
        // thin twigs between rays and closed props enclosing either endpoint.
        // Limited extra fading at a bounding-box corner is preferable to
        // leaving any opaque fragment over the ball between sampled rays.
        if ((!supportingGuards.has(mesh) || mesh.userData.structuralGuard) && (frustum.intersectsBox(bounds) || bounds.containsPoint(camera)
          || bounds.containsPoint(origin))) blocked.add(mesh);
        // Bounds already require these structures to fade. Triangle casts
        // cannot change that decision and cost heavily on dense merged props.
        if(!blocked.has(mesh))candidates.push(mesh);
      }
      right.crossVectors(direction, THREE.Object3D.DEFAULT_UP);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      else right.normalize();
      up.crossVectors(right, direction).normalize();
      for (const [x, y] of offsets) {
        const normalizer=Math.hypot(x,y)||1;
        point.copy(origin).addScaledVector(right, x / normalizer * radius).addScaledVector(up, y / normalizer * radius);
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
        materials, opacities: originals.map(m => m.transparent ? m.opacity : 1), factor: 1 });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      mesh.castShadow = false;
    }
    for (const [mesh, entry] of fading) {
      // Both directions ease continuously; a newly crossed wall must not flash
      // transparent in one frame. The camera pose stays entirely with director.
      const target = blocked.has(mesh) ? (deckMeshes.has(mesh) ? .16 : .18) : 1;
      entry.factor += (target - entry.factor) * (1 - Math.exp(-(target < 1 ? 10 : 6) * Math.max(0, dt)));
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
