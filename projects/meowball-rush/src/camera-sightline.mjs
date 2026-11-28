import * as THREE from 'three';
import { isCameraOccluder } from './camera-occlusion.mjs';
import { sightlineGeometry, visitSightlineTriangles } from './camera-sightline-bvh.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const opaque = material => material?.visible && (!material.transparent || material.opacity >= .85);
const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
  [.707, .707], [-.707, .707], [.707, -.707], [-.707, -.707]];
const visible = mesh => {
  for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
  return true;
};
const meshPath = mesh => {
  const names = [];
  for (let node = mesh; node; node = node.parent) if (node.name) names.unshift(node.name);
  return names.join('/') || `${mesh.geometry?.type || mesh.type}@${mesh.position.toArray().map(n => n.toFixed(2)).join(',')}`;
};

// Diagnose rigid, playable surfaces without changing the director framing.
// Scenery fading is separate; no occluder is ever a camera collision surface.
export function createCameraSightline(root) {
  const raycaster = new THREE.Raycaster(), camera = new THREE.Vector3(), center = new THREE.Vector3();
  const direction = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), point = new THREE.Vector3();
  const sphere = new THREE.Sphere(), bubble = new THREE.Sphere(), entryPoint = new THREE.Vector3();
  const boxEntry = new THREE.Vector3(), scale = new THREE.Vector3();
  const localEye = new THREE.Vector3();
  const localRay = new THREE.Ray(), localHit = new THREE.Vector3(), localFar = new THREE.Vector3(), worldFar = new THREE.Vector3();
  const bounds = new THREE.Box3(), triangleBounds = new THREE.Box3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const view = new THREE.PerspectiveCamera(), frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  const hits = [], candidates = [];
  let meshes = [], raycasts = 0;
  function refresh() {
    meshes = [];
    root.traverse(mesh => {
      if (!mesh.isMesh || isCameraOccluder(mesh, root) || !mesh.geometry?.attributes.position) return;
      const geometry = sightlineGeometry(mesh.geometry);
      meshes.push({ mesh, geometry, localBounds: geometry.bounds, localSphere: geometry.sphere,
        worldBounds: new THREE.Box3(), worldSphere: new THREE.Sphere(), worldMatrix: new THREE.Matrix4(),
        inverse: new THREE.Matrix4(), normalMatrix: new THREE.Matrix3(), cone: new THREE.Frustum(), dirty: true });
    });
  }
  function materialAt(entry, triangleIndex) {
    return Array.isArray(entry.mesh.material) ? entry.mesh.material[entry.geometry.groupIndices[triangleIndex]] : entry.mesh.material;
  }
  function updateEntries() {
    for (const entry of meshes) {
      const geometry = sightlineGeometry(entry.mesh.geometry);
      if (geometry !== entry.geometry) {
        entry.geometry = geometry; entry.localBounds = geometry.bounds; entry.localSphere = geometry.sphere; entry.dirty = true;
      }
      if (!entry.dirty && entry.worldMatrix.equals(entry.mesh.matrixWorld)) continue;
      entry.worldMatrix.copy(entry.mesh.matrixWorld); entry.dirty = false;
      entry.sideSign = entry.worldMatrix.determinant() < 0 ? -1 : 1;
      entry.inverse.copy(entry.worldMatrix).invert(); entry.normalMatrix.getNormalMatrix(entry.inverse);
      entry.worldBounds.copy(entry.localBounds).applyMatrix4(entry.worldMatrix);
      entry.worldSphere.copy(entry.localSphere).applyMatrix4(entry.worldMatrix);
    }
  }
  function triangleVertices(entry, triangle, world = false) {
    const offset = triangle * 9, vertices = entry.geometry.vertices;
    a.fromArray(vertices, offset); b.fromArray(vertices, offset + 3); c.fromArray(vertices, offset + 6);
    if (world) { a.applyMatrix4(entry.worldMatrix); b.applyMatrix4(entry.worldMatrix); c.applyMatrix4(entry.worldMatrix); }
  }
  function triangleInCone(material, sideSign) {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const facing = normal.dot(new THREE.Vector3().subVectors(camera, a)) * sideSign;
    if (material.side === THREE.FrontSide && facing <= 0 || material.side === THREE.BackSide && facing >= 0) return false;
    let polygon = [a.clone(), b.clone(), c.clone()];
    for (const plane of frustum.planes) {
      const clipped = [];
      for (let i = 0; i < polygon.length; i++) {
        const from = polygon[i], to = polygon[(i + 1) % polygon.length];
        const fromDistance = plane.distanceToPoint(from), toDistance = plane.distanceToPoint(to);
        if (fromDistance >= 0) clipped.push(from);
        if ((fromDistance >= 0) !== (toDistance >= 0))
          clipped.push(from.clone().lerp(to, fromDistance / (fromDistance - toDistance)));
      }
      polygon = clipped;
      if (!polygon.length) return false;
    }
    const toBall = new THREE.Vector3().subVectors(center, camera), distance = toBall.length();
    const forward = toBall.clone().divideScalar(distance);
    const circleRadiusSq = bubble.radius ** 2 / (distance ** 2 - bubble.radius ** 2);
    const beforeSphere = point => {
      const toPoint = new THREE.Vector3().subVectors(point, camera), length = toPoint.length();
      const projected = toPoint.dot(toBall) / length;
      const discriminant = bubble.radius ** 2 - distance ** 2 + projected ** 2;
      if (discriminant < -1e-7) return false;
      return length < projected - Math.sqrt(Math.max(0, discriminant)) - .015;
    };
    const centroid = new THREE.Vector3();
    for (const point of polygon) {
      if (beforeSphere(point)) return true;
      centroid.add(point);
    }
    if (beforeSphere(centroid.divideScalar(polygon.length))) return true;
    for (let i = 0; i < polygon.length; i++) {
      const from = polygon[i], to = polygon[(i + 1) % polygon.length];
      const fromDelta = from.clone().sub(camera), toDelta = to.clone().sub(camera);
      const z1 = fromDelta.dot(forward), z2 = toDelta.dot(forward);
      const x1 = fromDelta.dot(right) / z1, y1 = fromDelta.dot(up) / z1;
      const dx = toDelta.dot(right) / z2 - x1, dy = toDelta.dot(up) / z2 - y1;
      const qa = dx * dx + dy * dy, qb = 2 * (x1 * dx + y1 * dy);
      const qc = x1 * x1 + y1 * y1 - circleRadiusSq;
      const values = qa > 1e-20 ? [clamp(-qb / (2 * qa), 0, 1)] : [];
      const discriminant = qb * qb - 4 * qa * qc;
      if (qa > 1e-20 && discriminant >= -1e-10) {
        const root = Math.sqrt(Math.max(0, discriminant));
        values.push((-qb - root) / (2 * qa), (-qb + root) / (2 * qa));
      }
      for (const t of values) {
        if (t < 0 || t > 1) continue;
        // Perspective interpolation recovers the world-space point at this
        // projected edge/circle intersection, where a thin blocker can hide
        // the rim even when every polygon vertex lies outside the circle.
        const u = t * z1 / ((1 - t) * z2 + t * z1);
        if (beforeSphere(from.clone().lerp(to, u))) return true;
      }
    }
    return false;
  }
  function cast(to) {
    direction.subVectors(to, camera);
    raycaster.far = Math.max(.01, direction.length() - .04);
    direction.normalize(); raycaster.set(camera, direction); raycaster.near = .01;
    if (raycaster.ray.intersectSphere(bubble, entryPoint))
      raycaster.far = Math.min(raycaster.far, Math.max(.01, camera.distanceTo(entryPoint) - .015));
    hits.length = 0; raycasts++;
    worldFar.copy(camera).addScaledVector(raycaster.ray.direction, raycaster.far);
    for (const entry of candidates) {
      if (!entry.worldBounds.containsPoint(camera)
        && (!raycaster.ray.intersectBox(entry.worldBounds, boxEntry) || camera.distanceTo(boxEntry) > raycaster.far)) continue;
      localRay.copy(raycaster.ray).applyMatrix4(entry.inverse);
      localFar.copy(worldFar).applyMatrix4(entry.inverse);
      const farSquared = localFar.distanceToSquared(localRay.origin);
      visitSightlineTriangles(entry.geometry, bounds => bounds.containsPoint(localRay.origin)
        || localRay.intersectBox(bounds, boxEntry) && boxEntry.distanceToSquared(localRay.origin) <= farSquared, triangle => {
        const material = materialAt(entry, triangle);
        if (!opaque(material)) return false;
        triangleVertices(entry, triangle);
        const intersection = material.side === THREE.BackSide
          ? localRay.intersectTriangle(c, b, a, true, localHit)
          : localRay.intersectTriangle(a, b, c, material.side !== THREE.DoubleSide, localHit);
        if (intersection) {
          localHit.applyMatrix4(entry.worldMatrix);
          const distance = localHit.distanceTo(camera);
          if (distance >= raycaster.near && distance <= raycaster.far) hits.push({ object: entry.mesh, distance });
        }
        return false;
      });
    }
    if (hits.length > 1) hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }
  function probe(pose, ball) {
    camera.set(pose.x, pose.y, pose.z); center.set(ball.x, ball.y, ball.z);
    direction.subVectors(center, camera);
    const distance = direction.length(), radius = ball.r || .62;
    bubble.set(center, radius);
    if (distance <= radius + .1) return { clear: false, blockers: 1, stop: 0 };
    direction.divideScalar(distance);
    raycaster.set(camera, direction);
    candidates.length = 0;
    for (const entry of meshes) {
      const { mesh } = entry;
      if (!visible(mesh) || !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(opaque)) continue;
      const parameters = mesh.geometry.parameters;
      if (mesh.geometry.type === 'SphereGeometry' && parameters?.radius) {
        mesh.matrixWorld.decompose(a, view.quaternion, scale);
        const innerRadius = parameters.radius * Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))
          * Math.cos((parameters.phiLength || Math.PI * 2) / parameters.widthSegments / 2)
          * Math.cos((parameters.thetaLength || Math.PI) / parameters.heightSegments / 2);
        // A closed, distant shell (for example the skydome) cannot intersect
        // this short segment from an eye deep inside its inscribed radius.
        if (innerRadius - camera.distanceTo(a) > distance + radius) continue;
      }
      if (!entry.geometry.tree) continue;
      sphere.copy(entry.worldSphere); sphere.radius += radius;
      if (!raycaster.ray.intersectsSphere(sphere)
        || camera.distanceTo(sphere.center) - sphere.radius > distance) continue;
      if (mesh.geometry.type === 'BoxGeometry' && entry.worldBounds.containsPoint(camera)) {
        localEye.copy(camera).applyMatrix4(entry.inverse);
        if (entry.localBounds.containsPoint(localEye))
          return { clear: false, blockers: 1, reason: 'containment', blockerNames: [meshPath(mesh)] };
      }
      candidates.push(entry);
    }
    const central = cast(center).filter(hit => hit.distance < distance - radius);
    if (central.length) return { clear: false, blockers: central.length, reason: 'center', blockerNames: central.slice(0, 3).map(hit => meshPath(hit.object)),
      stop: Math.max(0, distance - central.at(-1).distance - radius * .2) };
    direction.subVectors(center, camera).normalize();
    right.crossVectors(direction, THREE.Object3D.DEFAULT_UP).normalize();
    if (!right.lengthSq()) right.set(1, 0, 0);
    up.crossVectors(right, direction).normalize();
    for (const [x, y] of offsets.slice(1)) {
      point.copy(center).addScaledVector(right, x * radius).addScaledVector(up, y * radius);
      const intersections = cast(point);
      if (intersections.length) return { clear: false, blockers: intersections.length, reason: 'silhouette', blockerNames: intersections.slice(0, 3).map(hit => meshPath(hit.object)) };
    }
    // Conservative narrow cone catches strips between sampled rays. Test local
    // triangle bounds after mesh bounds, since an entire winding route's bounds
    // can enclose both the ball and an otherwise clear camera.
    view.position.copy(camera); view.lookAt(center); view.near = .01;
    view.far = distance + radius;
    view.fov = 2 * Math.asin(Math.min(.99, radius / distance)) * 180 / Math.PI;
    view.aspect = 1; view.updateProjectionMatrix(); view.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
    for (const entry of candidates) {
      const { mesh } = entry;
      bounds.copy(entry.worldBounds);
      if (!frustum.intersectsBox(bounds)) continue;
      entry.cone.copy(frustum);
      for (const plane of entry.cone.planes) plane.applyMatrix4(entry.inverse, entry.normalMatrix);
      const blocked = visitSightlineTriangles(entry.geometry, box => entry.cone.intersectsBox(box), triangle => {
        const material = materialAt(entry, triangle);
        if (!opaque(material)) return false;
        const offset = triangle * 6, triangleBox = entry.geometry.triangleBounds;
        triangleBounds.min.fromArray(triangleBox, offset); triangleBounds.max.fromArray(triangleBox, offset + 3);
        if (!entry.cone.intersectsBox(triangleBounds)) return false;
        triangleVertices(entry, triangle, true);
        return triangleInCone(material, entry.sideSign);
      });
      if (blocked) return { clear: false, blockers: 1, reason: 'cone', blockerNames: [meshPath(mesh)] };
    }
    return { clear: true, blockers: 0 };
  }
  function resolve(ball, desiredPose) {
    root.updateMatrixWorld(true); updateEntries(); raycasts = 0;
    const check = probe(desiredPose, ball);
    // Keep the old resolver API for audits, but make it strictly diagnostic.
    // A rail entering the silhouette must not trigger a different camera pose.
    return { ...desiredPose, sightline: { clear: check.clear, compressed: false, blockers: check.blockers,
      blockerNames: check.blockerNames || [], reason: check.reason, raycasts } };
  }
  refresh();
  return { resolve, refresh, reset() {} };
}
