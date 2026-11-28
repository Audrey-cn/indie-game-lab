import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const WINDOW = 45;
const EPS = 1e-8;
const finitePoint = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;

function geometry(route) {
  if (!Array.isArray(route?.points) || route.points.length < 2 || route.points.some(p => !finitePoint(p))) {
    throw new TypeError(`Route ${route?.id ?? ''} needs at least two finite xyz points`);
  }
  const points = [route.points[0]], distances = [0], headings = [];
  for (const p of route.points.slice(1)) {
    const a = points.at(-1), length = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
    if (length < EPS) continue;
    headings.push(Math.atan2(p.z - a.z, p.x - a.x));
    distances.push(distances.at(-1) + length); points.push(p);
  }
  const turns = distances.map((_, i) => i > 0 && i < points.length - 1
    ? Math.abs(Math.atan2(Math.sin(headings[i] - headings[i - 1]), Math.cos(headings[i] - headings[i - 1]))) * 180 / Math.PI : 0);
  const at = distance => {
    const d = clamp(distance, 0, distances.at(-1));
    let lo = 1, hi = points.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (distances[m] < d) lo = m + 1; else hi = m; }
    if (points.length === 1) return { ...points[0] };
    const a = points[lo - 1], b = points[lo], t = (d - distances[lo - 1]) / (distances[lo] - distances[lo - 1]);
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
  };
  return { points, distances, turns, length: distances.at(-1), at };
}

// Check the action's actual floor/tier even when it claims a routeId or along.
// A decoration on a distant road must never excuse a featureless window.
function projectAction(route, data, action, kind) {
  if (!finitePoint(action) || action.routeId !== undefined && action.routeId !== route.id) return null;
  const y = action.y - (kind === 'hammer' ? (action.len ?? 0) + .62 : kind === 'rollingPin' ? .53 : 0);
  let best = null;
  for (let i = 1; i < data.points.length; i++) {
    const a = data.points[i - 1], b = data.points[i], dx = b.x - a.x, dz = b.z - a.z;
    const flat = Math.hypot(dx, dz), t = clamp(((action.x - a.x) * dx + (action.z - a.z) * dz) / (flat * flat || 1), 0, 1);
    const separation = Math.hypot(action.x - mix(a.x, b.x, t), action.z - mix(a.z, b.z, t));
    const height = Math.abs(y - mix(a.y, b.y, t)), score = separation ** 2 + height ** 2 * 4;
    if (!best || score < best.score) best = { score, separation, height, distance: mix(data.distances[i - 1], data.distances[i], t), tx: dx / (flat || 1), tz: dz / (flat || 1) };
  }
  if (!best) return null;
  let radius = Math.max(.2, Math.abs(action.r ?? .75));
  if (kind === 'boost') radius = (Math.abs(best.tx) * action.w + Math.abs(best.tz) * action.d) / 2;
  if (kind === 'hammer') radius = .92 + Math.abs(action.len ?? 0) * Math.sin(Math.min(Math.PI / 2, Math.abs(action.amp ?? 0)));
  if (kind === 'critter') radius += Math.abs(action.patrol ?? 0);
  if (best.separation > (route.width ?? 3) / 2 + radius || best.height > 1.35) return null;
  return { kind, id: action.id, start: Math.max(0, best.distance - radius), end: Math.min(data.length, best.distance + radius) };
}

function routeActions(track, route, data) {
  const actions = [];
  const add = (action, kind) => { const p = projectAction(route, data, action, kind); if (p) actions.push(p); };
  for (const b of track.boosts ?? []) if (b.w > 0 && b.d > 0 && Math.hypot(b.fx ?? 0, b.fz ?? 0) > 0) add(b, 'boost');
  for (const [key, kind] of [['spikes', 'spike'], ['hammers', 'hammer'], ['bumpers', 'bumper'], ['rollingPins', 'rollingPin']]) {
    for (const action of track[key] ?? []) add(action, kind);
  }
  const critters = new Set(['ducklings', 'sheep', 'snow_bunny', 'snow_bunnies', 'penguin', 'penguins']);
  const bouncy = new Set(['pinball_bumper', 'bouncy_mushroom', 'bakery_barrel', 'cheese_wheel', 'toy_block_bumper']);
  for (const p of track.props ?? []) {
    if (critters.has(p.type)) add(p, 'critter');
    else if (p.bouncy === true || bouncy.has(p.type)) add(p, 'bumper');
    else if (['toaster', 'willow_branch', 'steam_vent', 'wind_cloud', 'spellbook_bridge'].includes(p.type)
      && finitePoint(p.target) && p.flightTime > 0) add(p, 'launch');
  }
  for (const p of track.mushrooms ?? []) add(p, 'launch');
  for (const p of track.portals ?? []) {
    if (p.entry) add({ ...p.entry, id: `${p.id}:entry` }, 'portal');
    if (p.exit) add({ ...p.exit, id: `${p.id}:exit` }, 'portal');
  }
  for (const c of track.chutes ?? []) {
    for (const [name, p] of [['entry', c.entry ?? c.points?.[0]], ['exit', c.receiving ?? c.exit ?? c.points?.at(-1)]]) {
      if (p) add({ ...p, r: c.width / 2 || 1.5, id: `${c.id}:${name}` }, 'chute');
    }
  }
  const mud = route.slowZone;
  if (mud && mud.dryWidth > 0 && mud.amplitude > .15 && mud.cycles >= 1.5
    && Number.isFinite(mud.routeHalfWidth) && mud.routeHalfWidth > mud.dryWidth / 2) {
    actions.push({ kind: 'slowZoneSCurve', id: route.id, start: 0, end: data.length });
  }
  if (route.width > 0 && route.width <= 3.4 && route.walls === false) {
    actions.push({ kind: 'unguardedNarrowBeam', id: route.id, start: 0, end: data.length });
  }
  return actions;
}

function windowMetrics(data, actions, start, window = WINDOW) {
  const end = start + window, ys = [data.at(start).y, data.at(end).y];
  let turnDeg = 0;
  for (let i = 1; i < data.points.length - 1; i++) {
    if (data.distances[i] > start + EPS && data.distances[i] < end - EPS) {
      ys.push(data.points[i].y); turnDeg += data.turns[i];
    }
  }
  const present = actions.filter(a => a.start <= end + EPS && a.end >= start - EPS);
  return { start, end, deltaY: Math.max(...ys) - Math.min(...ys), turnDeg, actionCount: present.length,
    actionKinds: [...new Set(present.map(a => a.kind))] };
}

// This is an event sweep, not a coarse 45m grid. Vertex/action events partition
// all possible window starts. Within each interval turns and action membership
// stay constant and height extrema are affine. Splitting at their crossings
// and 1.5m threshold roots proves even a sub-metre filler interval is inspected.
function candidateStarts(data, actions, window = WINDOW) {
  const last = data.length - window, breaks = new Set([0, last]);
  const add = d => { if (d >= 0 && d <= last) breaks.add(d); };
  for (const d of data.distances) { add(d); add(d - window); }
  for (const a of actions) { add(a.end); add(a.start - window); }
  const events = [...breaks].sort((a, b) => a - b), candidates = new Set(events);
  for (let j = 1; j < events.length; j++) {
    const left = events[j - 1], right = events[j], span = right - left;
    if (span <= EPS) continue;
    const mid = (left + right) / 2, lines = [
      [data.at(left).y, data.at(right).y], [data.at(left + window).y, data.at(right + window).y],
    ];
    const interior = data.points.filter((_, i) => data.distances[i] > mid && data.distances[i] < mid + window).map(p => p.y);
    if (interior.length) {
      const lo = Math.min(...interior), hi = Math.max(...interior);
      lines.push([lo, lo], [hi, hi]);
    }
    const roots = new Set([left, right]);
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
      const v0 = lines[a][0] - lines[b][0], v1 = lines[a][1] - lines[b][1];
      for (const threshold of [-1.5, 0, 1.5]) {
        const t = (threshold - v0) / (v1 - v0);
        if (Number.isFinite(t) && t > 0 && t < 1) roots.add(left + span * t);
      }
    }
    const sorted = [...roots].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) candidates.add((sorted[i - 1] + sorted[i]) / 2);
    for (const root of sorted) candidates.add(root);
  }
  return [...candidates].sort((a, b) => a - b);
}

function primaryRouteChains(track, prepared) {
  const chains = []; let current = [];
  const flush = () => { if (current.length > 1) chains.push(current); current = []; };
  for (const step of track.primaryPath ?? []) {
    const next = step.type === 'route' ? prepared.get(step.id) : null;
    if (!next) { flush(); continue; }
    const previous = current.at(-1);
    if (previous && Math.hypot(...['x', 'y', 'z'].map(k => previous.data.points.at(-1)[k] - next.data.points[0][k])) > 1e-6) flush();
    current.push(next);
  }
  flush();
  return chains.map(chain => {
    const points = [], actions = []; let distance = 0;
    for (const entry of chain) {
      points.push(...entry.data.points.slice(points.length ? 1 : 0));
      actions.push(...entry.actions.map(a => ({ ...a, start: distance + a.start, end: distance + a.end })));
      distance += entry.data.length;
    }
    const routeIds = chain.map(e => e.route.id);
    return { routeIds, data: geometry({ id: `primary:${routeIds.join('>')}`, points }), actions };
  });
}

/** Audit every route (including secret routes) without mutating the track.
 * deltaY is the window's height range, so a meaningful hill that returns to
 * its starting altitude counts. A 45m failing subwindow also proves any longer
 * featureless stretch fails. Only physical, local runtime actions receive credit.
 */
export function auditZeroBoringStretches(track) {
  if (!Array.isArray(track?.routes)) throw new TypeError('track.routes must be an array');
  const failures = [], issues = [], routes = [], prepared = new Map();
  let windowsChecked = 0, chainsChecked = 0;
  for (const route of track.routes) {
    let data;
    try { data = geometry(route); }
    catch (error) { issues.push(error.message); continue; }
    const actions = routeActions(track, route, data), starts = data.length >= WINDOW - EPS ? candidateStarts(data, actions) : [];
    prepared.set(route.id, { route, data, actions });
    const routeFailures = [];
    for (const start of starts) {
      const metrics = windowMetrics(data, actions, start); windowsChecked++;
      if (metrics.deltaY < 1.5 - EPS && metrics.turnDeg < 22 - EPS && metrics.actionCount === 0) {
        routeFailures.push({ routeId: route.id, ...metrics });
      }
    }
    failures.push(...routeFailures);
    routes.push({ routeId: route.id, length: data.length, windowsChecked: starts.length, failures: routeFailures.length, actionCount: actions.length });
  }
  // Preserve per-route action ownership, but do not let artificial road splits
  // hide a 45m filler section. Warps, rail rides and real gaps break the chain.
  for (const chain of primaryRouteChains(track, prepared)) {
    if (chain.data.length < WINDOW - EPS) continue;
    chainsChecked++;
    for (const start of candidateStarts(chain.data, chain.actions)) {
      const metrics = windowMetrics(chain.data, chain.actions, start); windowsChecked++;
      if (metrics.deltaY < 1.5 - EPS && metrics.turnDeg < 22 - EPS && metrics.actionCount === 0) {
        failures.push({ routeId: `primary:${chain.routeIds.join('>')}`, routeIds: chain.routeIds, scope: 'primaryPath', ...metrics });
      }
    }
  }
  for (const failure of failures) issues.push(`${failure.routeId}: boring ${WINDOW}m window at ${failure.start.toFixed(3)}–${failure.end.toFixed(3)}m (Δy=${failure.deltaY.toFixed(3)}m, turn=${failure.turnDeg.toFixed(2)}°, actions=0)`);
  return { ok: issues.length === 0, windowMeters: WINDOW, routesChecked: routes.length, chainsChecked, windowsChecked, routes, failures, issues };
}

async function runSelfTests() {
  let checks = 0;
  const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
  const point = (x, y = 0, z = 0) => ({ x, y, z });
  const road = (id, points, extra = {}) => ({ id, points, width: 5.8, walls: true, ...extra });
  const flat = road('filler-tail', [point(0), point(180)]);
  check('flat straight filler tail is rejected; short roads are valid', () => {
    const audit = auditZeroBoringStretches({ routes: [flat] });
    assert(!audit.ok); assert(audit.failures.some(w => w.start === 0 && w.deltaY === 0));
    assert(auditZeroBoringStretches({ routes: [road('short', [point(0), point(44.9)])] }).ok);
    assert(!auditZeroBoringStretches({ routes: [road('exact-45', [point(0), point(45)])] }).ok);
  });
  check('sliding sweep catches a filler interval between grid-aligned windows', () => {
    const route = road('offset', [point(0), point(100)]);
    const boosts = [14.9, 64.95].map((x, i) => ({ id: `b${i}`, x, y: 0, z: 0, w: 4.9, d: 2, fx: 4, fz: 0 }));
    const audit = auditZeroBoringStretches({ routes: [route], boosts });
    assert(audit.failures.some(w => w.start > 17.35 && w.start < 17.55), 'missed the 0.15m interval between boost footprints');
  });
  check('contiguous short route splits cannot conceal a filler tail', () => {
    const routes = [0, 1, 2].map(i => road(`split-${i}`, [point(i * 30), point((i + 1) * 30)]));
    const primaryPath = routes.map(r => ({ type: 'route', id: r.id }));
    const audit = auditZeroBoringStretches({ routes, primaryPath });
    assert(!audit.ok && audit.failures.some(w => w.scope === 'primaryPath'));
    assert(auditZeroBoringStretches({ routes, primaryPath: [primaryPath[0], { type: 'portal', id: 'warp' }, primaryPath[1]] }).ok, 'warp displacement was treated as road');
  });
  check('distant, wrong-tier and wrong-route actions cannot hide boring road', () => {
    for (const extra of [{ z: 50 }, { y: 10 }, { routeId: 'another-road' }]) {
      const boosts = [20, 60, 100, 140].map(x => ({ x, y: 0, z: 0, w: 4, d: 2, fx: 4, fz: 0, ...extra }));
      assert(!auditZeroBoringStretches({ routes: [flat], boosts }).ok);
    }
    assert(!auditZeroBoringStretches({ routes: [{ ...flat, slowZone: { kind: 'mud' } }] }).ok, 'plain mud is not an S-curve setpiece');
    const at = { x: 22, y: 0, z: 0, routeId: 'empty' };
    const empty = road('empty', [point(0), point(45)]);
    assert(!auditZeroBoringStretches({ routes: [empty], props: [{ ...at, type: 'chair', target: point(30, 5), flightTime: 1 }] }).ok,
      'decorative target metadata cannot launch a ball');
    assert(!auditZeroBoringStretches({ routes: [empty], critters: [{ ...at, r: .6, patrol: .1 }] }).ok,
      'unused critters array cannot hide filler');
  });
  check('elevation range, cumulative bends and localized action coverage pass', () => {
    const hill = road('hill', Array.from({ length: 121 }, (_, i) => point(i, 2 * Math.sin(i * Math.PI / 30))));
    assert(auditZeroBoringStretches({ routes: [hill] }).ok);
    const bends = road('bends', Array.from({ length: 121 }, (_, i) => point(i, 0, 5 * Math.sin(i * Math.PI / 20))));
    assert(auditZeroBoringStretches({ routes: [bends] }).ok);
    const boosts = [20, 60, 100, 140, 175].map(x => ({ x, y: 0, z: 0, w: 4, d: 2, fx: 4, fz: 0 }));
    assert(auditZeroBoringStretches({ routes: [flat], boosts }).ok);
    assert(auditZeroBoringStretches({ routes: [{ ...flat, width: 3.25, walls: false }] }).ok);
    assert(!auditZeroBoringStretches({ routes: [{ ...flat, width: 3.25, walls: true }] }).ok);
  });
  check('all requested runtime action schemas are recognized locally', () => {
    const route = road('action-road', [point(0), point(45)]), at = { x: 22, y: 0, z: 0, routeId: route.id };
    const fixtures = [
      { spikes: [{ ...at, r: .7 }] },
      { hammers: [{ ...at, y: 3.42, len: 2.8, amp: .5 }] },
      { bumpers: [{ ...at, r: .7 }] },
      { rollingPins: [{ ...at, y: .53, r: .48 }] },
      { props: [{ ...at, type: 'snow_bunny', r: .6, patrol: .1 }] },
      { props: [{ ...at, type: 'wind_cloud', target: point(30, 5), flightTime: 1 }] },
      { mushrooms: [{ ...at, r: 1.5 }] },
      { portals: [{ id: 'warp', entry: { ...at, r: 1.5 }, exit: point(500, 15) }] },
      { chutes: [{ id: 'slide', width: 3.6, points: [at, point(500, -10)] }] },
    ];
    for (const fixture of fixtures) assert(auditZeroBoringStretches({ routes: [route], ...fixture }).ok, `unrecognized ${Object.keys(fixture)[0]}`);
    const slow = { ...route, slowZone: { kind: 'honey', dryWidth: 1.5, amplitude: 1, cycles: 2, routeHalfWidth: 2.9 } };
    assert(auditZeroBoringStretches({ routes: [slow] }).ok);
  });
  check('malformed routes fail clearly and the audit is non-mutating', () => {
    const fixture = { routes: [flat] }, before = JSON.stringify(fixture);
    auditZeroBoringStretches(fixture); assert.equal(JSON.stringify(fixture), before);
    assert(!auditZeroBoringStretches({ routes: [{ id: 'bad', points: [point(0), point(NaN)] }] }).ok);
    assert.throws(() => auditZeroBoringStretches({}), /routes/);
  });

  const { TRACKS } = await import('../src/config.mjs');
  const { buildVerticalSetpieceFinale } = await import('../src/setpiece-finale-builder.mjs');
  const { auditLaneThreat } = await import('../src/lane-difficulty.mjs');
  const { sampleDryCurvePoints } = await import('../src/mud-curve.mjs');
  const syntheticCore = stageIndex => ({ id: `synthetic-${stageIndex}`, index: stageIndex, worldType: 'indoor_home',
    routes: [road('core', [point(0), point(20)])], finish: point(20), length: 20,
    primaryPath: [{ type: 'route', id: 'core' }] });
  check('a generated synthetic finale passes; impossible budgets and repeat calls are explicit', () => {
    const core = syntheticCore(0), before = JSON.stringify(core);
    assert.throws(() => buildVerticalSetpieceFinale(core, { targetLength: 30, stageIndex: 0 }), /at least/);
    assert.equal(JSON.stringify(core), before, 'infeasible layout mutated its core');
    assert.throws(() => buildVerticalSetpieceFinale(core, { targetLength: 670, stageIndex: -1 }), /stageIndex/);
    buildVerticalSetpieceFinale(core, { targetLength: 670, stageIndex: 0 });
    const routes = core.routes.filter(r => r.verticalFinale), audit = auditZeroBoringStretches({ ...core, routes });
    assert(audit.ok, audit.issues.slice(0, 3).join('\n'));
    const once = JSON.stringify(core);
    assert.equal(buildVerticalSetpieceFinale(core, { targetLength: 670, stageIndex: 0 }), core);
    assert.equal(JSON.stringify(core), once, 'same target duplicated the finale');
    assert.throws(() => buildVerticalSetpieceFinale(core, { targetLength: 900, stageIndex: 0 }), /already/);
  });
  for (const [stageIndex, track] of TRACKS.entries()) {
    const audit = auditZeroBoringStretches(track);
    check(`${track.id}: live course has zero boring stretches`, () => {
      assert(audit.ok, audit.issues.slice(0, 3).join('\n'));
      assert(track.verticalFinale, 'live course never integrated its vertical finale');
    });
    const routes = track.routes.filter(r => r.verticalFinale);
    const targetLength = track.verticalFinale.targetLength, origin = track.verticalFinale.origin;
    const originalSteps = track.primaryPath.findIndex(s => s.id === routes[0].id);
    check(`${track.id}: generated vertical finale passes the 45m audit`, () => {
      assert(routes.length > 0, 'builder appended no routes');
      const audit = auditZeroBoringStretches({ ...track, routes });
      assert(audit.ok, audit.issues.slice(0, 3).join('\n'));
      assert(track.chutes.length >= 2 && track.chutes.some(c => c.verticalFinale), 'missing second kinetic chute');
      assert.notEqual(track.chutes.at(-1).style, track.chutes[0]?.style, 'second chute repeats first style');
      assert(Math.abs(track.length - targetLength) < .1, `length ${track.length} missed target ${targetLength}`);
      const samePoint = (a, b, label) => {
        for (const k of ['x', 'y', 'z']) assert.equal(a[k], b[k], `${label}: ${k} seam differs`);
      };
      samePoint(routes[0].points[0], origin, 'original finish');
      let previous = origin;
      const steps = track.primaryPath.slice(originalSteps);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.type === 'portal') {
          const p = track.portals.find(p => p.id === step.id);
          assert(p && finitePoint(p.entry) && finitePoint(p.exit), 'invalid portal pair');
          samePoint(previous, p.entry, 'portal entry'); previous = p.exit;
          const next = track.routes.find(r => r.id === steps[i + 1]?.id);
          assert(next, 'portal has no receiving route');
          const a = next.points[0], b = next.points[1], length = Math.hypot(b.x - a.x, b.z - a.z);
          const alignment = -Math.sin(p.exit.yaw) * (b.x - a.x) / length - Math.cos(p.exit.yaw) * (b.z - a.z) / length;
          assert(alignment > .999, 'portal exit yaw does not align to runway');
          assert(p.exit.y - p.entry.y >= 10 && p.exit.y - p.entry.y <= 18, 'portal lacks elevated vantage tier');
        } else if (step.type === 'route' || step.type === 'chute') {
          const element = (step.type === 'route' ? track.routes : track.chutes).find(r => r.id === step.id);
          assert(element, `missing ${step.type} ${step.id}`);
          samePoint(previous, element.points[0], `${step.type} entry`); previous = element.points.at(-1);
        } else assert.fail(`Unexpected finale path step ${step.type}`);
      }
      samePoint(previous, track.finish, 'finish');
      const narrow = routes.filter(r => r.finaleSegment === 'C');
      assert(narrow.length >= 2 && narrow.every(r => r.width >= 2.95 && r.width <= 3.35), 'gauntlet lacks two-lane micro-control road');
      assert(narrow.some(r => r.walls === false) && narrow.some(r => r.walls === true), 'gauntlet lacks alternating guards');
      const actualKinds = new Set();
      for (const r of narrow) {
        const hazards = track.laneHazards.filter(h => h.routeId === r.id), laneAudit = auditLaneThreat(r, hazards);
        assert(laneAudit.ok, `${r.id}: ${laneAudit.issues.join('; ')}`);
        for (const hazard of hazards) actualKinds.add(hazard.kind);
      }
      assert.deepEqual([...actualKinds].sort(), ['bumper', 'critter', 'pendulum', 'spike'], 'missing a required runtime lane hazard');
      const slow = routes.filter(r => r.slowZone);
      assert(slow.some(r => r.width >= 5.6 && r.width <= 6.4 && r.slowZone.amplitude > 0 && r.slowZone.cycles >= 1.5), 'missing continuous S-curve mud/honey sprint');
      assert(!track.stars.some(s => slow.some(r => r.id === s.routeId)), 'stars remain inside slowdown road');
      for (const r of slow) assert.equal(sampleDryCurvePoints(r, r.slowZone, 288).length, 289, 'dry line leaves its rendered floor');
      const expectsPortal = new Set([1, 3, 5, 6, 7, 8, 9]).has(stageIndex);
      assert.equal(track.verticalFinale.portalIds.length, expectsPortal ? 1 : 0, 'wrong portal stage mapping');
      if (!expectsPortal) {
        const launch = routes.find(r => r.finaleSegment === 'A');
        assert(launch.points.at(-1).y - launch.points[0].y >= 6, 'nonportal stage lacks a 6m climb');
      }
      for (const route of [...routes, ...track.chutes.filter(c => c.verticalFinale)]) for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i], rise = b.y - a.y;
        if (rise > 0) assert(Math.atan2(rise, Math.hypot(b.x - a.x, b.z - a.z)) * 180 / Math.PI <= 14 + 1e-5, `${route.id}: climb exceeds 14 degrees`);
      }
    });
  }
  for (const stageIndex of [0, 1, 4, 6, 9]) for (const deficit of [400, 1000]) {
    check(`synthetic stage ${stageIndex + 1}, ${deficit}m budget: exact length and no filler`, () => {
      const track = syntheticCore(stageIndex), targetLength = track.length + deficit;
      buildVerticalSetpieceFinale(track, { targetLength, stageIndex });
      const routes = track.routes.filter(r => r.verticalFinale);
      assert(Math.abs(track.length - targetLength) < .1, `${track.length} missed ${targetLength}`);
      const audit = auditZeroBoringStretches({ ...track, routes }); assert(audit.ok, audit.issues.slice(0, 3).join('\n'));
      for (const r of routes.filter(r => r.finaleSegment === 'C')) {
        const hazards = track.laneHazards.filter(h => h.routeId === r.id), laneAudit = auditLaneThreat(r, hazards);
        assert(laneAudit.ok, `${r.id}: ${laneAudit.issues.join('; ')}`);
      }
      const prepared = new Map(routes.map(route => { const data = geometry(route); return [route.id, { route, data, actions: routeActions(track, route, data) }]; }));
      for (const chain of primaryRouteChains(track, prepared)) for (const start of candidateStarts(chain.data, chain.actions, 35)) {
        const w = windowMetrics(chain.data, chain.actions, start, 35);
        assert(w.deltaY >= 1.5 - EPS || w.turnDeg >= 22 - EPS || w.actionCount > 0, `35m filler at ${start.toFixed(2)}m on ${chain.routeIds.join('>')}`);
      }
    });
  }
  console.log(`Zero-boring audit: ${checks} checks passed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSelfTests().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
}
