import { createStyledChute } from './chute-styles.mjs';
import { mudSpecForStage } from './mud-curve.mjs';
import { placeLaneBlockingHazards } from './lane-difficulty.mjs';
import { nearestRouteSurface, polylineLength, prepareRouteGeometry, samplePath } from './course-math.mjs';

const PORTAL_STAGES = new Set([1, 3, 5, 6, 7, 8, 9]);
const SECOND_STYLES = ['banked_slalom', 'rollercoaster', 'corkscrew_drop', 'banked_slalom',
  'rollercoaster', 'banked_slalom', 'corkscrew_drop', 'rollercoaster', 'banked_slalom', 'rollercoaster'];
const point = p => ({ x: p.x, y: p.y, z: p.z });
const smooth = t => (t = Math.max(0, Math.min(1, t)), t * t * (3 - 2 * t));
const direction = (a, b) => {
  const n = Math.hypot(b.x - a.x, b.z - a.z);
  return n > 1e-8 ? { x: (b.x - a.x) / n, z: (b.z - a.z) / n } : { x: 0, z: -1 };
};
const advance = (p, f, d, side = 0, rise = 0) => ({
  x: p.x + f.x * d - f.z * side, y: p.y + rise, z: p.z + f.z * d + f.x * side,
});
const measuredLength = track => [...track.routes.filter(r => !r.secret), ...(track.chutes || [])]
  .reduce((sum, r) => sum + polylineLength(r.points), 0);
function maxClimb(points) {
  let slope = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    slope = Math.max(slope, Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)));
  }
  return slope * 180 / Math.PI;
}

// Keep the wavelength independent of the journey budget: a longer finale gets
// more bends, never a single S stretched into a kilometre of nearly flat road.
// Level, tangent mouths also give warps and kinetic rails real rolling runways.
function sweep(start, forward, span, { amplitude = 3, period = 38, rise = 0,
  hill = .65, runway = 7, exitRunway = 7 } = {}) {
  const count = Math.ceil(span / .8), active = span - runway - exitRunway;
  const cycles = active / period;
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const d = span * i / count, u = Math.max(0, Math.min(1, (d - runway) / active));
    const envelope = smooth(Math.min(1, (d - runway) / 6))
      * smooth(Math.min(1, (span - exitRunway - d) / 6));
    const side = amplitude * envelope * Math.sin(2 * Math.PI * cycles * u);
    const y = rise * smooth(u) + hill * envelope * Math.sin(2 * Math.PI * cycles * u);
    return advance(start, forward, d, side, y);
  });
  points[0] = point(start); points[count] = advance(start, forward, span, 0, rise);
  return points;
}

// Each narrow stretch has a readable straight trap bay followed by a sharp,
// smooth bend. The next stretch begins on that exact new tangent. This leaves
// a full 12m receiving runway ahead of the first lane-blocking hazard.
function gauntletStretch(start, forward, span, turn, rise) {
  const count = Math.ceil(span / .7), points = [point(start)];
  const initial = Math.atan2(forward.z, forward.x);
  const heading = t => initial + turn * smooth((t - .65) / .35);
  for (let i = 1; i <= count; i++) {
    const previous = points.at(-1), d = span / count, a = heading((i - .5) / count);
    points.push({ x: previous.x + Math.cos(a) * d, y: start.y + rise * smooth(i / count),
      z: previous.z + Math.sin(a) * d });
  }
  return points;
}

/**
 * Append four vertical setpieces to a CORE track ending at track.finish.
 * stageIndex is zero based (0..9); targetLength is the absolute rolling/rail
 * journey length, matching config.mjs (a warp's displacement adds no metres).
 * Mutates and returns track, including the renderer/runtime's derived lists.
 * Call before any later stage-wide width/star/checkpoint authoring passes.
 *
 * Four conceptual segments can contain multiple runtime routes: walls are a
 * route-wide boolean, so C needs separate guarded/open records; D separates
 * sticky floor from its dry boost plaza. A portal record defines BOTH mouths.
 * An infeasibly short positive budget throws before changing the core rather
 * than compressing 6m climbs into unrollable ramps or cutting out an act.
 */
export function buildVerticalSetpieceFinale(track, { targetLength, stageIndex = track?.index } = {}) {
  if (!track || !Array.isArray(track.routes) || !track.routes.length
    || !track.finish || !['x', 'y', 'z'].every(k => Number.isFinite(track.finish[k]))) {
    throw new TypeError('A vertical finale needs core routes and a finite track.finish');
  }
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex > 9) {
    throw new RangeError('stageIndex must be an integer from 0 to 9');
  }
  if (!Number.isFinite(targetLength) || targetLength <= 0) throw new RangeError('targetLength must be positive and finite');
  const coreLength = measuredLength(track), deficit = targetLength - coreLength;
  if (deficit <= 1e-7) return track;
  if (track.verticalFinale) throw new Error('This track already has a vertical setpiece finale');

  const previous = track.routes.filter(r => !r.secret).at(-1);
  if (!previous?.points || previous.points.length < 2) throw new TypeError('A core needs a final primary route tangent');
  const origin = point(track.finish), forward = direction(previous.points.at(-2), previous.points.at(-1));
  const warp = PORTAL_STAGES.has(stageIndex), lift = warp ? 12 + stageIndex % 3 * 2 : 6 + stageIndex * .4;
  const prefix = `${track.id || `stage-${stageIndex + 1}`}-vertical-finale`;
  let style = SECOND_STYLES[stageIndex];
  if (style === track.chutes?.[0]?.style) style = ['rollercoaster', 'banked_slalom', 'corkscrew_drop'].find(s => s !== style);
  const kind = previous.kind || 'wood', actIndex = 5;
  const appearance = Object.fromEntries(['surfacePattern', 'edgeStyle', 'surfaceColor', 'accentColor']
    .filter(k => previous[k] !== undefined).map(k => [k, previous[k]]));

  const drop = warp ? lift - 2.5 : 6 + stageIndex * .35;
  const chuteAt = (start, span) => createStyledChute({ id: `${prefix}-kinetic-chute`, style, start,
    end: advance(start, forward, span, 0, -drop), width: 3.6,
    radius: style === 'rollercoaster' ? 2.2 : 7, sway: style === 'banked_slalom' ? 8 : 3,
    waves: 2.5, steps: 288, speed: 14 + stageIndex * .35, exitSpeed: 6,
    brakeDistance: 14, theme: track.chutes?.[0]?.theme || track.chutes?.[0]?.material || kind,
    material: track.chutes?.[0]?.material || kind, actIndex, extension: true, journeyExtension: true,
    verticalFinale: true, setpieceFinale: true, finaleSegment: 'B' });
  // Determine the minimum roller span once. Re-solving it during length fitting
  // could abruptly shorten a rail when one fewer stretch iteration was needed.
  let chuteBaseSpan = 48;
  for (let attempt = 0; attempt < 12 && maxClimb(chuteAt(origin, chuteBaseSpan).points) > 13.5; attempt++) {
    chuteBaseSpan *= 1.16;
  }

  function layout(scale) {
    const routes = [], chutes = [], portals = [], path = [];
    const addRoute = (name, segment, width, points, extra = {}) => {
      const r = { id: `${prefix}-${name}`, section: `vertical_finale_${name}`, kind, width, points,
        walls: true, actIndex, extension: true, journeyExtension: true,
        verticalFinale: true, setpieceFinale: true, finaleSegment: segment, ...appearance, ...extra };
      routes.push(r); path.push({ type: 'route', id: r.id, actIndex }); return r;
    };
    let start = origin;
    if (warp) {
      const dock = addRoute('warp-dock', 'A', 5.8, [point(origin), advance(origin, forward, 8)]);
      start = advance(origin, forward, 34, (stageIndex % 2 ? 1 : -1) * (38 + stageIndex), lift);
      const p = { id: `${prefix}-warp`, label: 'Finale vantage warp', color: [0x72deff, 0xffcb73, 0xd19aff][stageIndex % 3],
        entry: { ...point(dock.points.at(-1)), r: 1.5, routeId: dock.id },
        exit: { ...start, yaw: Math.atan2(-forward.x, -forward.z), speed: 7 } };
      portals.push(p); path.push({ type: 'portal', id: p.id, actIndex });
    }
    const launch = addRoute(warp ? 'vantage-runway' : 'rainbow-climb', 'A', 5.8,
      sweep(start, forward, (warp ? 48 : 78 + stageIndex * 6) * scale,
        { amplitude: 3.5 + stageIndex * .15, rise: warp ? 0 : lift,
          hill: warp ? .6 : .3, runway: warp ? 12 : 5, exitRunway: 8 }), { bank: .12 });
    if (warp) {
      const p = portals[0]; p.exit.routeId = launch.id;
      const f = direction(launch.points[0], launch.points[1]);
      p.exit.yaw = Math.atan2(-f.x, -f.z);
    }

    const chute = chuteAt(point(launch.points.at(-1)), chuteBaseSpan * scale);
    chutes.push(chute); path.push({ type: 'chute', id: chute.id, actIndex });

    let at = point(chute.receiving), tangent = direction(chute.points.at(-2), chute.points.at(-1));
    for (let i = 0; i < 4; i++) {
      const turn = [ .72, -1.25, 1.25, -.72 ][i] * (1 + stageIndex / 45);
      const points = gauntletStretch(at, tangent, (28 + stageIndex * .3) * scale, turn, [-.9, 1.4, -1.3, .8][i]);
      addRoute(`microcontrol-${i + 1}`, 'C', 3.35 - stageIndex / 30, points,
        { walls: i % 2 === 0, laneCount: 2, cameraMode: 'MANUAL_ORBIT', hazardBay: true });
      at = point(points.at(-1)); tangent = direction(points.at(-2), points.at(-1));
    }
    const slow = addRoute('dry-line-sprint', 'D', 5.8,
      sweep(at, tangent, 44 * scale, { amplitude: 2.5, period: 34, hill: .6, runway: 6, exitRunway: 6 }));
    slow.slowZone = { ...mudSpecForStage(stageIndex, 5.8),
      kind: track.worldType === 'indoor_home' ? 'honey' : 'mud' };
    // Use complete sine cycles so the continuous dry line enters AND leaves on
    // the center seam; dryWidth/amplitude still come from mudSpecForStage.
    slow.slowZone.cycles = 2 * Math.max(1, Math.ceil(polylineLength(slow.points) / 48));
    const sprint = addRoute('rainbow-boost-plaza', 'D', 6.8,
      sweep(slow.points.at(-1), tangent, 26 * scale,
        { amplitude: 3, period: 36, rise: .5, hill: .4, runway: 6, exitRunway: 6 }));
    return { routes, chutes, portals, path, launch, slow, sprint,
      length: [...routes, ...chutes].reduce((sum, r) => sum + polylineLength(r.points), 0) };
  }

  const minimum = layout(1);
  if (deficit + 1e-6 < minimum.length) {
    throw new RangeError(`Vertical finale needs at least ${Math.ceil(minimum.length)}m beyond the core; only ${deficit.toFixed(2)}m available`);
  }
  let lo = 1, hi = Math.max(2, deficit / minimum.length * 1.5);
  while (layout(hi).length < deficit) hi *= 1.5;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    if (layout(mid).length < deficit) lo = mid; else hi = mid;
  }
  const built = layout((lo + hi) / 2);
  // Adaptive sample-count boundaries can leave a sub-millimetre fitting error.
  // Absorb it on the final level tangent without moving another act or mouth.
  const correction = deficit - built.length, end = built.sprint.points.at(-1);
  if (Math.abs(correction) > .05) throw new Error('Could not fit a continuous vertical finale to targetLength');
  const finalTangent = direction(built.sprint.points.at(-2), end);
  built.sprint.points[built.sprint.points.length - 1] = advance(end, finalTangent, correction);
  built.length = [...built.routes, ...built.chutes].reduce((sum, r) => sum + polylineLength(r.points), 0);
  for (const r of [...built.routes, ...built.chutes]) {
    if (maxClimb(r.points) > 14 + 1e-7) throw new RangeError(`${r.id}: climb exceeds 14 degrees`);
  }
  // No track mutation has happened before the layout and slope checks pass.
  for (const key of ['chutes', 'portals', 'primaryPath', 'platforms', 'props', 'boosts', 'spikes',
    'hammers', 'bumpers', 'rollingPins', 'cameraZones', 'stars', 'checkpoints', 'landmarks', 'sections', 'route']) {
    track[key] ??= [];
  }
  track.routes.push(...built.routes); track.chutes.push(...built.chutes); track.portals.push(...built.portals);
  track.primaryPath.push(...built.path);
  prepareRouteGeometry(track.routes, track.chutes);

  const addBoosts = (r, first = 9) => {
    const length = polylineLength(r.points);
    for (let d = first; d < length - 3; d += 22) {
      const p = samplePath(r.points, d), n = Math.hypot(p.tx, p.tz) || 1;
      track.boosts.push({ id: `${r.id}-boost-${Math.round(d)}`, ...point(p), routeId: r.id,
        w: 2.6, d: 2.6, fx: p.tx / n * 5.5, fz: p.tz / n * 5.5, role: 'finale-rainbow' });
    }
  };
  addBoosts(built.launch, warp ? 15 : 8); addBoosts(built.sprint, 6);
  track.laneHazards ??= [];
  for (const [i, r] of built.routes.filter(r => r.finaleSegment === 'C').entries()) {
    const length = polylineLength(r.points);
    const hazards = placeLaneBlockingHazards(r, { stageIndex,
      count: length <= 60 ? 1 : Math.ceil(length / 20),
      kinds: [['pendulum', 'spike', 'bumper', 'critter'][i]] }).filter(h => i !== 0 || h.along >= 12);
    for (const h of hazards) {
      track.laneHazards.push(h);
      track[h.kind === 'pendulum' ? 'hammers' : h.kind === 'spike' ? 'spikes' : h.kind === 'bumper' ? 'bumpers' : 'props'].push(h);
    }
    for (let d = 0; d <= polylineLength(r.points); d += 6) {
      const p = samplePath(r.points, d);
      track.cameraZones.push({ type: 'orbit', ...point(p), r: 7, minY: p.y - 2, maxY: p.y + 5,
        routeId: r.id, mode: 'MANUAL_ORBIT' });
    }
  }

  const checkpointRoutes = new Map([[built.launch.id, polylineLength(built.launch.points) - 5],
    [built.routes.find(r => r.finaleSegment === 'C').id, 4], [built.slow.id, 5], [built.sprint.id, 4]]);
  let progress = coreLength;
  for (const step of built.path) {
    if (step.type === 'portal') {
      const p = built.portals.find(p => p.id === step.id);
      track.route.push({ ...point(p.entry), kind: 'portal', portalId: p.id },
        { ...point(p.exit), kind: 'portal_exit', portalId: p.id });
      continue;
    }
    const r = [...built.routes, ...built.chutes].find(r => r.id === step.id), length = polylineLength(r.points);
    if (checkpointRoutes.has(r.id)) {
      const along = checkpointRoutes.get(r.id), p = samplePath(r.points, along);
      track.checkpoints.push({ ...point(p), routeId: r.id, along, progress: progress + along,
        actIndex, glowing: true, id: `${r.id}-checkpoint` });
    }
    if (step.type === 'route') {
      track.sections.push({ id: r.id, name: r.section, kind: r.kind, start: point(r.points[0]),
        end: point(r.points.at(-1)), center: point(r.points[Math.floor(r.points.length / 2)]),
        ...(r.slowZone ? { slowZone: { ...r.slowZone } } : {}) });
      for (let d = 0; d < length; d += Math.min(8, length / 12)) {
        track.route.push({ ...point(samplePath(r.points, d)), kind: 'surface', routeId: r.id });
      }
      track.route.push({ ...point(r.points.at(-1)), kind: 'surface', routeId: r.id });
      // Sticky floors deliberately have NO candy, including on their dry line.
      if (!r.slowZone && r.width >= 5.8) {
        const p = samplePath(r.points, length * .65);
        track.stars.push({ ...point(p), y: p.y + 1.05, routeId: r.id });
      }
    } else {
      track.route.push({ ...point(r.points[0]), kind: 'chute', chuteId: r.id },
        { ...point(r.receiving), kind: 'chute_exit', chuteId: r.id });
      track.platforms.push({ ...point(r.receiving), kind, w: 7, d: 7, h: .65, walls: false,
        role: 'chute-receiver', routeId: built.routes.find(r => r.finaleSegment === 'C').id });
    }
    progress += length;
  }
  // Use actual floor height for raised center banks on recovery/boost overlays.
  for (const p of [...track.checkpoints, ...track.boosts].filter(p => built.routes.some(r => r.id === p.routeId))) {
    const r = built.routes.find(r => r.id === p.routeId);
    p.y = nearestRouteSurface([r], p.x, p.z, Infinity)?.y ?? p.y;
  }
  track.checkpoints.sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));
  track.finish = point(built.sprint.points.at(-1));
  track.platforms = track.platforms.filter(p => p.role !== 'finish');
  track.platforms.push({ ...track.finish, kind, w: 9, d: 9, h: .65, walls: false, role: 'finish' });
  for (const p of track.landmarks.filter(p => p.type === 'finale_beacon')) Object.assign(p, track.finish);
  for (const p of built.portals) {
    for (const mouth of ['entry', 'exit']) track.platforms.push({ ...point(p[mouth]), kind: 'crystal',
      w: mouth === 'entry' ? 7 : 8, d: 8, h: .65, walls: false, role: `portal-${p.id}-${mouth}` });
  }
  if (track.acts?.[actIndex]) {
    const act = track.acts[actIndex]; act.routeIds ??= []; act.pathIds ??= [];
    act.routeIds.push(...built.routes.map(r => r.id)); act.pathIds.push(...built.path.map(p => p.id));
    act.lengthMeters = (act.lengthMeters || 0) + built.length;
  }
  track.length = track.lengthMeters = measuredLength(track);
  track.laneHazardDensity = track.laneHazards.length / track.length;
  track.verticalFinale = { origin, stageIndex, targetLength, lengthMeters: built.length,
    routeIds: built.routes.map(r => r.id), chuteIds: built.chutes.map(c => c.id), portalIds: built.portals.map(p => p.id),
    segments: [
      { id: 'A', type: warp ? 'vantage_warp' : 'rainbow_climb', deltaY: lift },
      { id: 'B', type: 'kinetic_chute', style },
      { id: 'C', type: 'microcontrol_gauntlet', cameraMode: 'MANUAL_ORBIT' },
      { id: 'D', type: 'dry_line_boost_sprint' },
    ].map(s => ({ ...s, routeIds: built.routes.filter(r => r.finaleSegment === s.id).map(r => r.id),
      chuteIds: built.chutes.filter(r => r.finaleSegment === s.id).map(r => r.id) })) };
  return track;
}
