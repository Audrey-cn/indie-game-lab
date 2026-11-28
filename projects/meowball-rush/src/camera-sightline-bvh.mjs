import * as THREE from 'three';

// Local-space acceleration is shared by instances/outline meshes. Nothing is
// attached to or changed on the rendered geometry. Matrix changes do not
// invalidate it; edited vertex/index buffers and draw ranges do.
const cache = new WeakMap();
export function sightlineGeometry(geometry) {
  const position = geometry.attributes.position, index = geometry.index;
  const drawStart = Math.max(0, geometry.drawRange.start), drawCount = geometry.drawRange.count;
  const groupsKey = geometry.groups.map(group => `${group.start}:${group.count}:${group.materialIndex}`).join(',');
  const old = cache.get(geometry);
  if (old && old.position === position && old.index === index && old.positionVersion === position.version
    && old.positionData === position.data && old.positionDataVersion === position.data?.version
    && old.indexVersion === index?.version && old.indexData === index?.data && old.indexDataVersion === index?.data?.version
    && old.drawStart === drawStart && old.drawCount === drawCount
    && old.groupsKey === groupsKey) return old;
  const end = Math.min(index?.count ?? position.count, drawStart + drawCount);
  const count = Math.max(0, Math.floor((end - drawStart) / 3));
  const vertices = new Float32Array(count * 9), triangleBounds = new Float32Array(count * 6);
  const groupIndices = new Int32Array(count), ids = Array.from({ length: count }, (_, i) => i);
  groupIndices.fill(-1);
  const box = new THREE.Box3();
  for (let triangle = 0; triangle < count; triangle++) {
    const offset = drawStart + triangle * 3, v = triangle * 9, b = triangle * 6;
    for (let corner = 0; corner < 3; corner++) {
      const i = index ? index.getX(offset + corner) : offset + corner;
      vertices[v + corner * 3] = position.getX(i);
      vertices[v + corner * 3 + 1] = position.getY(i);
      vertices[v + corner * 3 + 2] = position.getZ(i);
    }
    for (let axis = 0; axis < 3; axis++) {
      triangleBounds[b + axis] = Math.min(vertices[v + axis], vertices[v + 3 + axis], vertices[v + 6 + axis]);
      triangleBounds[b + axis + 3] = Math.max(vertices[v + axis], vertices[v + 3 + axis], vertices[v + 6 + axis]);
    }
    const group = geometry.groups.find(group => offset >= group.start && offset < group.start + group.count);
    groupIndices[triangle] = group?.materialIndex ?? -1;
  }
  function build(start, end) {
    const bounds = new THREE.Box3();
    for (let i = start; i < end; i++) {
      const b = ids[i] * 6;
      bounds.min.x = Math.min(bounds.min.x, triangleBounds[b]); bounds.max.x = Math.max(bounds.max.x, triangleBounds[b + 3]);
      bounds.min.y = Math.min(bounds.min.y, triangleBounds[b + 1]); bounds.max.y = Math.max(bounds.max.y, triangleBounds[b + 4]);
      bounds.min.z = Math.min(bounds.min.z, triangleBounds[b + 2]); bounds.max.z = Math.max(bounds.max.z, triangleBounds[b + 5]);
    }
    const node = { bounds, start, end, left: null, right: null };
    if (end - start <= 12) return node;
    const size = bounds.getSize(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
    const sorted = ids.slice(start, end).sort((a, b) => triangleBounds[a * 6 + axis] + triangleBounds[a * 6 + axis + 3]
      - triangleBounds[b * 6 + axis] - triangleBounds[b * 6 + axis + 3]);
    for (let i = 0; i < sorted.length; i++) ids[start + i] = sorted[i];
    const middle = (start + end) >> 1;
    node.left = build(start, middle); node.right = build(middle, end);
    return node;
  }
  const tree = count ? build(0, count) : null;
  if (tree) box.copy(tree.bounds);
  const result = { position, index, positionVersion: position.version, indexVersion: index?.version,
    positionData: position.data, positionDataVersion: position.data?.version, indexData: index?.data, indexDataVersion: index?.data?.version,
    drawStart, drawCount, groupsKey, vertices, triangleBounds, groupIndices, ids, tree, bounds: box,
    sphere: box.getBoundingSphere(new THREE.Sphere()) };
  cache.set(geometry, result);
  return result;
}

export function visitSightlineTriangles(geometry, intersectsBounds, visitTriangle) {
  if (!geometry.tree) return false;
  const stack = [geometry.tree];
  while (stack.length) {
    const node = stack.pop();
    if (!intersectsBounds(node.bounds)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) if (visitTriangle(geometry.ids[i])) return true;
  }
  return false;
}
