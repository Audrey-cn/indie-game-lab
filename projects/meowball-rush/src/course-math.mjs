// Shared authored geometry: scene meshes, rail motion and collision use the same samples.
export function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return length;
}

const pathMetrics = new WeakMap();
function metrics(points) {
  let cached = pathMetrics.get(points);
  if (!cached) {
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    cached = { distances, length: distances.at(-1) || 0 };
    pathMetrics.set(points, cached);
  }
  return cached;
}

export function samplePath(points, distance) {
  if (!points?.length) throw new Error('A path needs at least one point');
  if (points.length === 1) return { ...points[0], tx: 0, ty: 0, tz: -1 };
  const { distances, length } = metrics(points);
  const d = Math.max(0, Math.min(length, distance));
  let lo = 1, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const a = points[lo - 1], b = points[lo];
  const span = distances[lo] - distances[lo - 1];
  const t = span > 1e-9 ? (d - distances[lo - 1]) / span : 0;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const norm = Math.hypot(dx, dy, dz) || 1;
  return { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t,
    tx: dx / norm, ty: dy / norm, tz: dz / norm };
}

export function getChuteFrame(chute, t) {
  return samplePath(chute.points, Math.max(0, Math.min(1, t)) * metrics(chute.points).length);
}

// Match the visible ribbon triangles, including mitered corners and bank rows.
// Cached floor planes avoid invisible capsule endcaps and cross-level snapping.
const floorMeshes = new WeakMap();
function floorTriangles(route) {
  let cached = floorMeshes.get(route);
  if (cached) return cached;
  const points = route.points, rows = [], triangles = [];
  const columns = 8;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const row = [];
    for (let j = 0; j <= columns; j++) {
      const t = j / columns, cross = (t - 0.5) * route.width;
      row.push({ x: points[i].x - dz / len * cross,
        y: points[i].y + (route.bank || 0) * (t * 2 - 1) ** 2,
        z: points[i].z + dx / len * cross });
    }
    rows.push(row);
  }
  function add(a, b, c, index) {
    const den = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(den) < 1e-10) return;
    triangles.push({ a, b, c, den, index,
      minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
      minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z),
      slopeX: ((b.y - a.y) * (c.z - a.z) - (c.y - a.y) * (b.z - a.z)) / den,
      slopeZ: ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / den });
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < columns; j++) {
    add(rows[i][j], rows[i][j + 1], rows[i + 1][j], i);
    add(rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j], i);
  }
  floorMeshes.set(route, triangles);
  return triangles;
}
export function nearestRouteSurface(routes, x, z, y = Infinity, contact = null) {
  let best = null;
  const priority = c => contact ? c.following ? 2 : c.crossed ? 1 : 0 : 0;
  function isBetter(candidate) {
    if (!best) return true;
    const rank = priority(candidate) - priority(best);
    if (rank) return rank > 0;
    if (contact) {
      if (candidate.crossed && best.crossed && !candidate.following) {
        if (Math.abs(candidate.y - best.y) > 1e-6) return candidate.y > best.y;
      } else {
        const difference = Math.abs(candidate.y - contact.bottom) - Math.abs(best.y - contact.bottom);
        if (Math.abs(difference) > 1e-6) return difference < 0;
      }
    }
    return candidate.distance < best.distance - 1e-6
      || (Math.abs(candidate.distance - best.distance) < 1e-6 && candidate.y > best.y);
  }
  for (const route of routes || []) for (const triangle of floorTriangles(route)) {
    const q = triangle;
    if (x < q.minX - 1e-6 || x > q.maxX + 1e-6 || z < q.minZ - 1e-6 || z > q.maxZ + 1e-6) continue;
    const dx = x - q.a.x, dz = z - q.a.z;
    const u = (dx * (q.c.z - q.a.z) - (q.c.x - q.a.x) * dz) / q.den;
    const v = ((q.b.x - q.a.x) * dz - dx * (q.b.z - q.a.z)) / q.den;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    const floor = q.a.y + q.slopeX * dx + q.slopeZ * dz;
    const bottom = contact?.bottom ?? y - 0.55;
    const crossed = !!contact && contact.previousBottom >= floor - 0.02 && bottom <= floor;
    const following = !!contact?.grounded && contact.supportRoute === route && Math.abs(floor - bottom) < 0.8;
    const near = floor - bottom <= 0.55 && bottom - floor <= 0.18;
    if (contact ? !near && !crossed && !following : floor > y + 1e-6) continue;
    const a = route.points[q.index], b = route.points[q.index + 1];
    const sx = b.x - a.x, sz = b.z - a.z, flat = Math.hypot(sx, sz) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / (flat * flat)));
    const tx = sx / flat, tz = sz / flat;
    const px = a.x + sx * t, pz = a.z + sz * t;
    const candidate = { y: floor, slopeX: q.slopeX, slopeZ: q.slopeZ, kind: route.kind,
      route, distance: Math.hypot(x - px, z - pz), tx, tz,
      lateral: (x - px) * -tz + (z - pz) * tx,
      normalX: -tz, normalZ: tx, halfWidth: route.width / 2, along: t, segmentIndex: q.index,
      crossed, following };
    if (isBetter(candidate)) best = candidate;
  }
  return best;
}

export function computeLaunchVelocity(start, target, flightTime, gravity = 26) {
  if (!(flightTime > 0)) throw new Error('Launch flightTime must be positive');
  return { vx: (target.x - start.x) / flightTime,
    vy: (target.y - start.y) / flightTime + gravity * flightTime / 2,
    vz: (target.z - start.z) / flightTime };
}
