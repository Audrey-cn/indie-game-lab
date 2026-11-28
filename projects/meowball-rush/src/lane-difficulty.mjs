// v4.1 authoring helpers. No track or runtime mutation: callers distribute the
// returned spike/bumper/pendulum/critter definitions into the existing lists.
import { GUARDED_CLEAR_WIDTH, getRouteRibbonRows, getRouteFloorTriangles, polylineLength, samplePath } from './course-math.mjs';

export const BALL_RADIUS = .62;
export const PLAYABLE_LANE_WIDTH = 1.45;
export const MIN_SAFE_PASSING_WIDTH = 1.55;
export const LANE_WIDTHS = Object.freeze({ narrow2: 2.95, tight2: 3.25, standard3: 4.35, wideMud: 5.8, plaza: 6.8 });
const EPS = 1e-7;
const KINDS = new Map([
  ['spike', 'spike'], ['spikes', 'spike'], ['pendulum', 'pendulum'], ['pendulums', 'pendulum'],
  ['hammer', 'pendulum'], ['hammers', 'pendulum'], ['bumper', 'bumper'], ['bumpers', 'bumper'],
  ['critter', 'critter'], ['critters', 'critter'], ['patrolling_critter', 'critter'],
]);
const MOVING_CRITTER_TYPES = new Set(['ducklings', 'sheep', 'snow_bunny', 'snow_bunnies', 'penguin', 'penguins']);
function stageNumber(stageIndex) {
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex > 9) throw new RangeError('stageIndex must be an integer from 0 to 9');
  return stageIndex;
}

export function difficultyProfileForStage(stageIndex) {
  const t = stageNumber(stageIndex) / 9;
  const roadWidthMix = { narrow2: .06 + .26 * t, tight2: .10 + .16 * t,
    standard3: .24 + .08 * t, wideMud: .30 - .24 * t, plaza: .30 - .26 * t };
  const challengeCorridorWidth = LANE_WIDTHS.standard3 + (4.2 - LANE_WIDTHS.standard3) * t;
  const targetRoadWidth = Object.entries(roadWidthMix).reduce((sum, [key, share]) =>
    sum + share * (key === 'standard3' ? challengeCorridorWidth : LANE_WIDTHS[key]), 0);
  return { stageIndex, stageNumber: stageIndex + 1, roadWidthMix, challengeCorridorWidth, targetRoadWidth,
    twoLaneShare: roadWidthMix.narrow2 + roadWidthMix.tight2, threeLaneShare: roadWidthMix.standard3,
    trapDensityMultiplier: 1 + 1.6 * t, spikeCycleSpeed: 1 + .65 * t,
    pendulumSweepSpeed: 1 + .8 * t, minHazardSpacing: 10 - 2 * t,
    minSafePassingWidth: MIN_SAFE_PASSING_WIDTH };
}

function validateRoute(route) {
  if (!route || !Number.isFinite(route.width) || route.width <= 0 || !Array.isArray(route.points)
    || route.points.length < 2 || route.points.some(p => !p || !['x', 'y', 'z'].every(k => Number.isFinite(p[k]))))
    throw new TypeError('A lane route needs a positive width and at least two finite xyz points');
  if (!(polylineLength(route.points) > EPS)) throw new RangeError('A lane route needs a nonzero length');
}
const laneCountFor = width => width <= 3.4 ? 2 : width <= 4.6 ? 3 : 0;
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
function sectionAt(route, distance) {
  const data = getRouteRibbonRows(route), d = Math.max(0, Math.min(data.distances.at(-1), distance));
  const center = samplePath(route.points, d), flat = Math.hypot(center.tx, center.tz) || 1;
  const tx = center.tx / flat, tz = center.tz / flat, nx = -tz, nz = tx;
  const project = p => (p.x - center.x) * nx + (p.z - center.z) * nz;
  // A mitered row is diagonal. Cut the actual floor triangles perpendicular to
  // travel instead of treating that longer diagonal as playable road width.
  const spans = [];
  for (const triangle of getRouteFloorTriangles(route)) {
    const vertices = [triangle.a, triangle.b, triangle.c], cut = [];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i], b = vertices[(i + 1) % 3];
      const sa = (a.x - center.x) * tx + (a.z - center.z) * tz;
      const sb = (b.x - center.x) * tx + (b.z - center.z) * tz;
      if (Math.abs(sa) < 1e-5) cut.push(a);
      if (sa * sb < 0) cut.push(mix(a, b, sa / (sa - sb)));
    }
    if (cut.length < 2) continue;
    cut.sort((a, b) => project(a) - project(b));
    spans.push({ left: project(cut[0]), right: project(cut.at(-1)), points: cut });
  }
  spans.sort((a, b) => a.left - b.left);
  const components = [];
  for (const span of spans) {
    const last = components.at(-1);
    if (last && span.left <= last.right + 1e-5) { last.right = Math.max(last.right, span.right); last.points.push(...span.points); }
    else components.push({ ...span, points: [...span.points] });
  }
  const component = components.find(c => c.left <= EPS && c.right >= -EPS);
  const row = component ? component.points.sort((a, b) => project(a) - project(b)) : [{ ...center }, { ...center }];
  const left = row[0], right = row.at(-1), width = component ? component.right - component.left : 0;
  return { row, left, right, center, nx, nz, tx, tz, width, distance: d };
}
function floorAt(section, lateral) {
  const project = p => (p.x - section.center.x) * section.nx + (p.z - section.center.z) * section.nz;
  for (let i = 1; i < section.row.length; i++) {
    const a = project(section.row[i - 1]), b = project(section.row[i]);
    if (lateral <= b + EPS) return mix(section.row[i - 1], section.row[i], Math.max(0, Math.min(1, (lateral - a) / (b - a || 1))));
  }
  return { ...section.right };
}
function nearestDistance(route, hazard) {
  let best = { squared: Infinity, distance: 0 }, walked = 0;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, b.y - a.y, dz);
    const t = Math.max(0, Math.min(1, ((hazard.x - a.x) * dx + (hazard.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const squared = (hazard.x - a.x - dx * t) ** 2 + (hazard.z - a.z - dz * t) ** 2;
    if (squared < best.squared) best = { squared, distance: walked + length * t };
    walked += length;
  }
  return best.distance;
}
function envelope(hazard, section) {
  const kind = KINDS.get(hazard.kind) || (MOVING_CRITTER_TYPES.has(hazard.type) ? 'critter' : undefined);
  // Match the current runtime: hammer heads have a .92m collider and swing in
  // world X; moving critters also patrol in world X. Reserve their ENTIRE sweep.
  const radius = kind === 'pendulum' ? .92 : hazard.r;
  const amplitude = kind === 'pendulum' ? Math.abs(hazard.len) * Math.sin(Math.min(Math.PI / 2, Math.abs(hazard.amp)))
    : kind === 'critter' ? Math.abs(hazard.patrol) : 0;
  const isTangent = kind === 'pendulum' && hazard.swingMode === 'tangent';
  return { kind, radius, amplitude,
    lateral: radius + (isTangent ? 0 : amplitude * Math.abs(section.nx)),
    longitudinal: radius + (isTangent ? amplitude : amplitude * Math.abs(section.tx)) };
}
function freeIntervals(left, right, blocked) {
  const gaps = []; let cursor = left;
  for (const [a, b] of blocked.filter(([a, b]) => b > left && a < right).sort((a, b) => a[0] - b[0])) {
    if (a > cursor) gaps.push([cursor, Math.min(right, a)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < right) gaps.push([cursor, right]);
  return gaps;
}

/** Return plain definitions with kind, laneSlot (-1/0/+1), routeId, along,
 * laneOffset and the existing runtime fields (r, phase, len/amp, patrol, etc).
 * count is a maximum; short, pinched or sharply bent routes can fit fewer.
 * The default count applies the stage density. Narrower than 2.79m or wider
 * than 4.6m routes get no lane traps. Existing routes and points are untouched.
 */
export function placeLaneBlockingHazards(route, { stageIndex = 0, count, kinds = ['spike', 'pendulum', 'bumper', 'critter'] } = {}) {
  validateRoute(route);
  const profile = difficultyProfileForStage(stageIndex), length = polylineLength(route.points), laneCount = laneCountFor(route.width);
  if (!Array.isArray(kinds)) throw new TypeError('kinds must be an array');
  const selectedKinds = kinds.map(kind => { const canonical = KINDS.get(kind); if (!canonical) throw new RangeError(`Unknown lane hazard kind: ${kind}`); return canonical; });
  const requested = count ?? Math.max(1, Math.floor(length / 24 * profile.trapDensityMultiplier));
  if (!Number.isInteger(requested) || requested < 0) throw new RangeError('count must be a nonnegative integer');
  if (!laneCount || !requested || !selectedKinds.length || route.width < MIN_SAFE_PASSING_WIDTH + 1.24 - EPS) return [];
  const hazards = [], padding = 4;
  const capacity = Math.max(0, Math.floor((length - padding * 2) / profile.minHazardSpacing) + 1);
  const target = Math.min(requested, capacity), stride = (length - padding * 2) / Math.max(1, target - 1);
  for (let i = 0; i < target; i++) {
    const distance = target === 1 ? length / 2 : padding + stride * i;
    const section = sectionAt(route, distance), kind = selectedKinds[hazards.length % selectedKinds.length];
    // A gently bending neighbourhood gives one conservative frame for the full
    // collider/sweep. Check all authored rows so short taper pinches cannot hide.
    const window = 2.5, data = getRouteRibbonRows(route);
    const samples = [distance - window, distance + window, ...data.distances.filter(d => d > distance - window && d < distance + window)];
    let left = -Infinity, right = Infinity, straight = true;
    for (const d of samples) {
      const s = sectionAt(route, d);
      if (s.nx * section.nx + s.nz * section.nz < .97) straight = false;
      const project = p => (p.x - section.center.x) * section.nx + (p.z - section.center.z) * section.nz;
      left = Math.max(left, project(s.left)); right = Math.min(right, project(s.right));
    }
    const width = right - left;
    if (!straight || width < Math.max(1.24 + MIN_SAFE_PASSING_WIDTH, route.walls ? GUARDED_CLEAR_WIDTH : 0) - EPS) continue;
    let slot = (laneCount === 2 ? [-1, 1] : [-1, 0, 1])[(i + stageIndex) % laneCount];
    if (kind === 'pendulum' && slot === 0) slot = i % 2 ? 1 : -1;
    const phase = stageIndex * .37 + i * 1.1;
    const intrusion = Math.min(PLAYABLE_LANE_WIDTH, width - MIN_SAFE_PASSING_WIDTH);
    // A 2.95m floor cannot fit a 1.45m body AND a 1.55m gap. Its 1.40m
    // body still blocks a whole playable lane for a .62m-radius rolling ball.
    const occupied = slot === 0 ? Math.min(PLAYABLE_LANE_WIDTH, width - 2 * MIN_SAFE_PASSING_WIDTH) : intrusion;
    if (occupied < 1 - EPS) continue;
    const base = { kind, laneSlot: slot, routeId: route.id, along: distance, phase };
    if (kind === 'pendulum') Object.assign(base, { r: .92, headRadius: .92, len: 2.8, amp: .52,
      speed: 1.55 * profile.pendulumSweepSpeed, axis: 'z', swingMode: 'tangent', variant: 'pendulum' });
    // Use one compact bunny: the existing sheep skin is a two-animal group
    // wider than a lane regardless of its collision radius.
    else if (kind === 'critter') Object.assign(base, { type: 'snow_bunny', bouncy: true, patrol: .1,
      speed: .8 * profile.pendulumSweepSpeed, r: (occupied - .2 * Math.abs(section.nx)) / 2 });
    else Object.assign(base, { r: occupied / 2 });
    if (kind === 'spike') Object.assign(base, { telegraph: .55, activeDuration: 1.1 / profile.spikeCycleSpeed,
      retractDuration: 2.35 / profile.spikeCycleSpeed - .55, cycleSpeed: profile.spikeCycleSpeed });
    if (kind === 'bumper') Object.assign(base, { bounce: 5.5, variant: 'mushroom' });
    const extent = envelope(base, section).lateral;
    // Hanging heads may extend beyond the outer rail. Their swept INWARD edge
    // stays inside one lane, including the runtime's fixed .92m head collider.
    const offset = slot < 0 ? left + occupied - extent : slot > 0 ? right - occupied + extent : (left + right) / 2;
    const floor = floorAt(section, offset), p = samplePath(route.points, distance);
    Object.assign(base, { x: section.center.x + section.nx * offset, y: floor.y + (kind === 'pendulum' ? base.len + BALL_RADIUS : 0),
      z: section.center.z + section.nz * offset, laneOffset: offset, laneWidth: PLAYABLE_LANE_WIDTH,
      footprintWidth: 2 * extent, tx: p.tx, tz: p.tz, nx: section.nx, nz: section.nz,
      id: `${route.id || 'route'}-lane-${kind}-${stageIndex}-${i}` });
    // Geometric proximity also catches folded-back routes with distant arclength.
    if (hazards.some(h => Math.hypot(h.x - base.x, h.z - base.z) < 5)) continue;
    const audit = auditLaneThreat(route, [...hazards, base]);
    if (audit.ok) { base.safePassingWidth = audit.minClearWidth; hazards.push(base); }
    else if (kind === 'pendulum') {
      const fb = { kind: 'spike', laneSlot: slot, routeId: route.id, along: distance, phase, r: occupied / 2,
        telegraph: .55, activeDuration: 1.1 / profile.spikeCycleSpeed, retractDuration: 2.35 / profile.spikeCycleSpeed - .55,
        cycleSpeed: profile.spikeCycleSpeed, x: base.x, y: floor.y, z: base.z, laneOffset: offset,
        laneWidth: PLAYABLE_LANE_WIDTH, footprintWidth: occupied, tx: p.tx, tz: p.tz, nx: section.nx, nz: section.nz,
        id: `${route.id || 'route'}-lane-spike-fb-${stageIndex}-${i}` };
      const fbAudit = auditLaneThreat(route, [...hazards, fb]);
      if (fbAudit.ok) { fb.safePassingWidth = fbAudit.minClearWidth; hazards.push(fb); }
    }
  }
  return hazards;
}

/** Conservative all-active/full-sweep audit, independent of claimed clearance
 * metadata. minClearWidth is free FLOOR width, so a 1.55m gap admits the 1.24m
 * ball with .31m spare. Invalid, off-lane, wide-field, elevated and combined
 * lane-sealing definitions fail. The audit covers each trap neighbourhood;
 * adjoining routes supply the other half of diagonal butt seams at endpoints.
 * No animation phase can make this audit kinder.
 */
export function auditLaneThreat(route, hazards = []) {
  validateRoute(route);
  if (!Array.isArray(hazards)) throw new TypeError('hazards must be an array');
  const laneCount = laneCountFor(route.width), length = polylineLength(route.points), issues = [], hazardAudits = [];
  const data = getRouteRibbonRows(route), sampleDistances = new Set();
  if (!laneCount) issues.push('Route is wider than a three-lane challenge corridor');
  for (const hazard of hazards) {
    if (!hazard || !['x', 'y', 'z'].every(k => Number.isFinite(hazard[k]))) { issues.push('Non-finite hazard position'); continue; }
    const distance = nearestDistance(route, hazard), s = sectionAt(route, distance), e = envelope(hazard, s);
    if (!e.kind || ![e.radius, e.amplitude].every(Number.isFinite) || e.radius <= 0
      || e.kind === 'pendulum' && !(hazard.len > 0)) { issues.push('Invalid hazard kind or collision envelope'); continue; }
    const lateral = (hazard.x - s.center.x) * s.nx + (hazard.z - s.center.z) * s.nz;
    const left = (s.left.x - s.center.x) * s.nx + (s.left.z - s.center.z) * s.nz;
    const right = left + s.width;
    const slot = hazard.laneSlot, validSlot = [-1, 1].includes(slot) || laneCount === 3 && slot === 0;
    const laneWidth = s.width / (laneCount || 1), laneCenter = slot < 0 ? left + laneWidth / 2 : slot > 0 ? right - laneWidth / 2 : (left + right) / 2;
    const laneLeft = laneCenter - laneWidth / 2, laneRight = laneCenter + laneWidth / 2;
    const bodyLeft = lateral - e.lateral, bodyRight = lateral + e.lateral;
    const overlap = Math.max(0, Math.min(bodyRight, laneRight) - Math.max(bodyLeft, laneLeft));
    const fullLaneBlocked = bodyLeft - BALL_RADIUS <= laneLeft + BALL_RADIUS + EPS
      && bodyRight + BALL_RADIUS >= laneRight - BALL_RADIUS - EPS;
    const floor = floorAt(s, lateral), headY = hazard.y - (e.kind === 'pendulum' ? hazard.len : 0);
    const grounded = Math.abs(headY - floor.y - (e.kind === 'pendulum' ? BALL_RADIUS : 0)) < .2;
    const meaningful = !!laneCount && validSlot && overlap >= Math.min(1, laneWidth * .65) - EPS && fullLaneBlocked && grounded;
    if (!meaningful) issues.push(`${hazard.id || e.kind}: hazard does not block its declared lane at floor height`);
    if (hazard.routeId !== undefined && hazard.routeId !== route.id) issues.push(`${hazard.id || e.kind}: wrong routeId`);
    const reach = (e.longitudinal + BALL_RADIUS) / Math.max(.1, Math.hypot(s.center.tx, s.center.tz));
    const entry = { hazard, distance, section: s, ...e, reach, bodyLeft, bodyRight, laneCoverage: overlap / laneWidth, fullLaneBlocked, meaningful };
    hazardAudits.push(entry);
    const start = Math.max(0, distance - reach), end = Math.min(length, distance + reach);
    for (const d of [distance, start, end, ...data.distances.filter(d => d >= start && d <= end)]) sampleDistances.add(d);
    for (let d = start; d < end; d += .25) sampleDistances.add(d);
  }
  let minClearWidth = hazardAudits.length ? Infinity : route.width;
  for (const d of [...sampleDistances].sort((a, b) => a - b)) {
    const s = sectionAt(route, d), left = (s.left.x - s.center.x) * s.nx + (s.left.z - s.center.z) * s.nz;
    const blocked = [];
    for (const entry of hazardAudits) {
      if (Math.abs(entry.distance - d) > entry.reach + EPS) continue;
      const e = envelope(entry.hazard, s), lateral = (entry.hazard.x - s.center.x) * s.nx + (entry.hazard.z - s.center.z) * s.nz;
      blocked.push([lateral - e.lateral, lateral + e.lateral]);
    }
    const gaps = freeIntervals(left, left + s.width, blocked);
    minClearWidth = Math.min(minClearWidth, Math.max(0, ...gaps.map(([a, b]) => b - a)));
  }
  const safe = minClearWidth >= MIN_SAFE_PASSING_WIDTH - EPS;
  if (!safe) issues.push(`Safe floor passage is only ${minClearWidth.toFixed(3)}m; requires ${MIN_SAFE_PASSING_WIDTH}m`);
  const meaningful = hazards.length > 0 && hazardAudits.length === hazards.length && hazardAudits.every(h => h.meaningful);
  return { ok: safe && meaningful && issues.length === 0, safe, meaningful, narrowRoute: !!laneCount,
    laneCount, minClearWidth, hazardAudits, issues };
}
