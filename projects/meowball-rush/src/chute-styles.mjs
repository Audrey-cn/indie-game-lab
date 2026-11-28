import { polylineLength, samplePath } from './course-math.mjs';

export const CHUTE_STYLES = Object.freeze(['rollercoaster', 'banked_slalom', 'corkscrew_drop', 'helix']);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const smooth = t => (t = clamp(t, 0, 1), t ** 3 * (10 + t * (-15 + 6 * t)));
const defaults = {
  rollercoaster: { speed: 14, bankPeak: .32 },
  banked_slalom: { speed: 17, bankPeak: .58 },
  corkscrew_drop: { speed: 18, bankPeak: .62 },
  helix: { speed: 13, bankPeak: .42 },
};
function finite(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function endpoint(point, name) {
  if (!point || !['x', 'y', 'z'].every(key => Number.isFinite(point[key]))) {
    throw new TypeError(`${name} must be a finite {x, y, z} point`);
  }
  return { x: point.x, y: point.y, z: point.z };
}
function bezier(a, b, c, d, t) {
  const s = 1 - t;
  return { along: s ** 3 * a.along + 3 * s * s * t * b.along + 3 * s * t * t * c.along + t ** 3 * d.along,
    lateral: s ** 3 * a.lateral + 3 * s * s * t * b.lateral + 3 * s * t * t * c.lateral + t ** 3 * d.lateral };
}

/**
 * World coordinates use Y up; positive lateral is (-forward.z, forward.x).
 * Samples are evenly spaced by 3D arc length. Point.bank is signed roll in
 * radians, NOT course-math's symmetric route.bank cross-section height.
 */
export function buildChuteStylePoints({ style = 'helix', start, end, radius = 8,
  turns = 1.5, waves = 2.5, sway, bankPeak, steps = 288 } = {}) {
  if (!CHUTE_STYLES.includes(style)) throw new RangeError(`Unknown chute style: ${style}`);
  start = endpoint(start, 'start'); end = endpoint(end, 'end');
  radius = clamp(finite(radius, 8, 'radius'), 2, 60);
  turns = clamp(finite(turns, 1.5, 'turns'), .5, 4);
  waves = clamp(finite(waves, 2.5, 'waves'), 2, 3);
  sway = clamp(finite(sway, radius, 'sway'), 0, radius * 2);
  bankPeak = clamp(Math.abs(finite(bankPeak, defaults[style].bankPeak, 'bankPeak')), 0, .65);
  steps = Math.round(clamp(finite(steps, 288, 'steps'), 32, 4096));
  const dx = end.x - start.x, dz = end.z - start.z, span = Math.hypot(dx, dz);
  if (span < 1e-4) throw new RangeError('Chute start and end need horizontal separation');
  const fx = dx / span, fz = dz / span, nx = -fz, nz = fx;
  const drop = end.y - start.y;
  const world = (along, lateral, y) => ({ x: start.x + fx * along + nx * lateral,
    y, z: start.z + fz * along + nz * lateral });

  // Choose the coil phase so both circle tangents point towards their
  // connecting runways. Positive projection along each runway's chord makes
  // its cubic derivative nonzero, even for short spans and fractional turns.
  let coil;
  if (style === 'helix') {
    const delta = turns * Math.PI * 2, cosine = Math.cos(delta), sine = Math.sin(delta);
    for (const separation of [3, 4, 5]) {
      const side = -radius * separation, center = span / 2, norm = Math.hypot(center, side);
      const ax = center / norm, az = side / norm;
      const bx = (center * cosine - side * sine) / norm;
      const bz = (-center * sine - side * cosine) / norm;
      const score = Math.hypot(ax + bx, az + bz);
      if (coil && score <= coil.score) continue;
      const angle0 = Math.atan2(az + bz, ax + bx) - Math.PI / 2;
      const angle1 = angle0 + delta;
      const first = { along: center + radius * Math.cos(angle0), lateral: side + radius * Math.sin(angle0) };
      const last = { along: center + radius * Math.cos(angle1), lateral: side + radius * Math.sin(angle1) };
      const incomingLength = Math.hypot(first.along, first.lateral);
      const outgoingLength = Math.hypot(span - last.along, last.lateral);
      const inHandle = incomingLength * .32, outHandle = outgoingLength * .32;
      coil = { score, center, side, angle0, delta, first, last,
        inA: { along: first.along * .32, lateral: first.lateral * .32 },
        inB: { along: first.along + Math.sin(angle0) * inHandle, lateral: first.lateral - Math.cos(angle0) * inHandle },
        outA: { along: last.along - Math.sin(angle1) * outHandle, lateral: last.lateral + Math.cos(angle1) * outHandle },
        outB: { along: span - (span - last.along) * .32, lateral: last.lateral * .32 } };
    }
  }

  function pointAt(t) {
    const envelope = Math.sin(Math.PI * t) ** 2;
    if (style === 'rollercoaster') {
      return world(span * t, sway * envelope * Math.sin(Math.PI * 2 * t),
        start.y + drop * smooth(t) + radius * .95 * envelope * Math.sin(Math.PI * 2 * waves * t));
    }
    if (style === 'banked_slalom') {
      return world(span * t, (sway || radius) * envelope * Math.sin(Math.PI * 4 * t),
        start.y + drop * smooth(t));
    }
    if (style === 'corkscrew_drop') {
      // Overshoot the landing longitudinally, then whip back towards it.
      // The final derivative is -PI*radius: a true 180-degree exit, no cusp.
      return world(span * t + (span / Math.PI + radius) * Math.sin(Math.PI * t),
        radius * envelope, start.y + drop * smooth(t / .7));
    }

    // Keep the circular core independent of endpoint displacement. Translating
    // a circle along the chord would unwind a long chute into another S bend.
    // Cubic tangent runways connect arbitrary mouths to this genuine helix.
    if (t < .18) {
      const p = bezier({ along: 0, lateral: 0 }, coil.inA, coil.inB, coil.first, t / .18);
      return world(p.along, p.lateral, start.y);
    }
    if (t > .82) {
      const p = bezier(coil.last, coil.outA, coil.outB, { along: span, lateral: 0 }, (t - .82) / .18);
      return world(p.along, p.lateral, end.y);
    }
    const u = (t - .18) / .64, angle = coil.angle0 + coil.delta * u;
    return world(coil.center + radius * Math.cos(angle), coil.side + radius * Math.sin(angle), start.y + drop * smooth(u));
  }

  const denseSteps = Math.max(2048, steps * 12, Math.ceil(turns * 1024));
  const dense = Array.from({ length: denseSteps + 1 }, (_, i) => pointAt(i / denseSteps));
  dense[0] = start; dense[denseSteps] = end;
  const length = polylineLength(dense);
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const p = samplePath(dense, length * i / steps);
    return { x: p.x, y: p.y, z: p.z, bank: 0 };
  });
  Object.assign(points[0], start); Object.assign(points.at(-1), end);
  // Roll follows signed planar curvature, softened at both mouths. Scaling
  // after tapering keeps the authored peak meaningful across all four styles.
  const bends = points.map((p, i) => {
    if (!i || i === steps) return 0;
    const a = points[i - 1], b = points[i + 1];
    const ax = p.x - a.x, az = p.z - a.z, bx = b.x - p.x, bz = b.z - p.z;
    return Math.atan2(ax * bz - az * bx, ax * bx + az * bz)
      / Math.max(1e-6, (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2)
      * Math.sin(Math.PI * i / steps) ** 2;
  });
  const peak = Math.max(1e-9, ...bends.map(Math.abs));
  points.forEach((p, i) => { p.bank = bankPeak * bends[i] / peak; });
  return points;
}

/** bankProfile is a numeric array of signed roll radians, aligned with points. */
export function createStyledChute(spec = {}) {
  const style = spec.style ?? 'helix';
  const points = buildChuteStylePoints({ ...spec, style });
  const speed = clamp(finite(spec.speed, defaults[style].speed, 'speed'), 6, 24);
  const width = finite(spec.width, 3.6, 'width');
  if (width <= 0) throw new RangeError('Chute width must be positive');
  const frame = distance => samplePath(points, distance);
  const length = polylineLength(points);
  return { ...spec, id: spec.id ?? `chute-${style}`, style,
    theme: spec.theme ?? spec.material ?? 'wood', points, width, speed,
    cameraMode: 'LOCKED_CHUTE', entry: frame(0), exit: frame(length),
    bankProfile: points.map(p => p.bank), receiving: endpoint(points.at(-1), 'exit'),
    entryRadius: finite(spec.entryRadius, 1.8, 'entryRadius'),
    exitSpeed: clamp(finite(spec.exitSpeed, 6, 'exitSpeed'), 2, speed),
    brakeDistance: Math.max(1, finite(spec.brakeDistance, 12, 'brakeDistance')) };
}
