// Horizontal clearance is deliberately conservative even for scenery below a road.
// A circumscribed footprint must clear *every* route and both strands of a helix.
import { getCompanionChute } from './course-math.mjs';
export const SCENERY_MARGIN = 1;
function paths(track) {
  const result = [...(track.routes || []), ...(track.chutes || [])];
  for (const chute of track.chutes || []) if (chute.doubleHelix) result.push(getCompanionChute(chute));
  return result;
}
const trackPaths = new WeakMap();
function corridors(track) {
  if (!trackPaths.has(track)) trackPaths.set(track, paths(track));
  return trackPaths.get(track);
}
export function nearestSceneryClearance(track, prop) {
  let nearest = { margin: Infinity, x: prop.x, z: prop.z, required: 0 };
  for (const path of corridors(track)) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i];
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    const t = length2 ? Math.max(0, Math.min(1, ((prop.x - a.x) * dx + (prop.z - a.z) * dz) / length2)) : 0;
    const x = a.x + dx * t, z = a.z + dz * t;
    const distance = Math.hypot(prop.x - x, prop.z - z);
    const required = (path.width || 0) / 2 + prop.radius + SCENERY_MARGIN;
    const margin = distance - required;
    if (margin < nearest.margin) nearest = { margin, x, z, required, distance, pathId: path.id,
      nx: distance > 1e-7 ? (prop.x - x) / distance : -dz / (Math.sqrt(length2) || 1),
      nz: distance > 1e-7 ? (prop.z - z) / distance : dx / (Math.sqrt(length2) || 1) };
  }
  return nearest;
}
export function resolveSceneryPosition(track, prop) {
  const p = { ...prop };
  for (let i = 0; i < 96; i++) {
    const hit = nearestSceneryClearance(track, p);
    if (hit.margin >= 0.025) return p;
    const push = -hit.margin + 0.06;
    p.x += hit.nx * push; p.z += hit.nz * push;
  }
  // Concave pockets can have incompatible local pushes. Search outward from the
  // authored location deterministically; never silently keep an intersecting prop.
  const step = Math.max(2, prop.radius);
  for (let ring = 1; ring <= 160; ring++) for (let k = 0; k < 24; k++) {
    const angle = k * Math.PI / 12;
    p.x = prop.x + Math.cos(angle) * ring * step;
    p.z = prop.z + Math.sin(angle) * ring * step;
    if (nearestSceneryClearance(track, p).margin >= 0.025) return p;
  }
  throw new Error(`No clear scenery position for ${prop.name || 'prop'}`);
}
