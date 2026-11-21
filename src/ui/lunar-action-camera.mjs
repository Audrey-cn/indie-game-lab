import { MathUtils, Vector3 } from "three";

const { clamp, damp, lerp, smootherstep } = MathUtils;

const FRAMINGS = {
  sample: [
    { angle: 1.03, distance: 1.76, rise: 0.72, fov: 37 },
    { angle: 0.68, distance: 2.02, rise: 1.10, fov: 38 },
    { angle: 1.34, distance: 2.24, rise: 0.94, fov: 39 },
  ],
  survey: [
    { angle: 0.98, distance: 2.10, rise: 0.88, fov: 39 },
    { angle: 1.29, distance: 2.45, rise: 1.25, fov: 40 },
  ],
  workshop: [
    { angle: 0.62, distance: 2.00, rise: 0.66, fov: 39 },
    { angle: 0.99, distance: 2.22, rise: 0.80, fov: 37 },
  ],
  uplink: [
    { angle: 1.32, distance: 3.52, rise: 0.82, fov: 41 },
    { angle: 1.05, distance: 3.74, rise: 1.02, fov: 41 },
  ],
  installation: [
    { angle: 1.39, distance: 2.90, rise: 1.24, fov: 41 },
    { angle: 0.89, distance: 2.66, rise: 1.63, fov: 40 },
    { angle: 1.25, distance: 3.34, rise: 1.40, fov: 42 },
  ],
};

// An action uses one move, chosen at its start. Holding, small contact losses
// and the transition from drilling to stowing do not select another angle.
export function createLunarActionCamera({ height, blocked, reducedMotion }) {
  const position = new Vector3(), focus = new Vector3(), subject = new Vector3();
  const axisOrigin = new Vector3(), axisTarget = new Vector3();
  const counts = new Map();
  const frame = { mix: 0, fov: 43, blend: 4.6, detail: null };
  let key = null, profile, sinceStart = 0, absent = 0, suppressed = false;
  let handedness = 0, motionTime = 0, speedFraming = 0;

  function reset() {
    key = null;
    profile = null;
    frame.detail = null;
    sinceStart = absent = speedFraming = 0;
    counts.clear();
  }

  function place(outX, outZ, direction, distance, rise, angle) {
    const forward = Math.cos(angle) * distance;
    const side = Math.sin(angle) * distance * direction;
    const x = focus.x + outX * forward - outZ * side;
    const z = focus.z + outZ * forward + outX * side;
    position.set(x, Math.max(focus.y + rise, height(x, z) + 0.69), z);
  }

  function visible(from, to) {
    for (let sample = 0; sample <= 7; sample++) {
      const portion = sample / 8;
      const x = lerp(from.x, to.x, portion), y = lerp(from.y, to.y, portion);
      const z = lerp(from.z, to.z, portion);
      if (y < height(x, z) + 0.11 || blocked(x, y, z)) return false;
    }
    return true;
  }

  function apply({ action, rover, targetPosition, targetFocus, aspect, driving, looking, speed, boost, time, dt, baseFov }) {
    if (time < motionTime) reset();
    motionTime = time;
    const reduce = reducedMotion.matches;
    const interrupted = driving || looking || reduce;
    const speedTarget = reduce ? 0 : smootherstep(Math.abs(speed), 2.8, 7.6) * (boost ? 4.2 : 3.1);
    speedFraming = damp(speedFraming, speedTarget, 3.6, dt);
    Object.assign(frame, { mix: 0, fov: baseFov + speedFraming, blend: interrupted ? 8.5 : 4.6, detail: null });

    if (action) {
      if (action.key !== key) {
        key = action.key;
        const count = counts.get(action.kind) ?? 0;
        profile = FRAMINGS[action.kind][count % FRAMINGS[action.kind].length];
        counts.set(action.kind, count + 1);
        sinceStart = 0;
        handedness = 0;
        suppressed = false;
      }
      sinceStart += dt;
      absent = 0;
      suppressed ||= interrupted;
      subject.copy(action.subject);
      axisTarget.copy(action.axisTarget ?? action.subject);
      axisOrigin.copy(action.axisOrigin ?? rover.position);
    } else {
      absent += dt;
      suppressed ||= interrupted;
      if (absent > 0.16 || interrupted) return frame;
    }
    if (!profile || suppressed || interrupted) return frame;

    const aspectPadding = lerp(1.45, 1, clamp((aspect - 0.45) / 0.8, 0, 1));
    const arc = smootherstep(sinceStart, 0.10, 2.75);
    const dx = axisTarget.x - axisOrigin.x, dz = axisTarget.z - axisOrigin.z;
    const span = Math.hypot(dx, dz);
    const outX = span > 0.08 ? dx / span : -Math.sin(rover.rotation.y);
    const outZ = span > 0.08 ? dz / span : -Math.cos(rover.rotation.y);
    const angle = profile.angle + 0.14 * arc;
    const distance = profile.distance * aspectPadding * (1 - 0.09 * arc);
    focus.copy(subject);
    if (!handedness) {
      // Prefer the illuminated side; stay on the alternate side if a boulder blocks it.
      handedness = Math.sign(15 * outZ + 11.8 * outX) || 1;
      place(outX, outZ, handedness, distance, profile.rise, angle);
      if (!visible(position, focus)) handedness *= -1;
    }
    place(outX, outZ, handedness, distance, profile.rise + 0.05 * arc, angle);
    if (!visible(position, focus)) return frame;

    const entry = smootherstep(sinceStart, 0, 0.62);
    const exit = 1 - smootherstep(absent, 0, 0.16);
    const strength = 1 - 0.30 * smootherstep(sinceStart, 3.6, 5.2);
    frame.mix = entry * exit * strength;
    frame.fov = lerp(frame.fov, profile.fov + (aspect < 1 ? 11 : 0), frame.mix);
    frame.detail = key;
    targetPosition.lerp(position, frame.mix);
    targetFocus.lerp(focus, frame.mix);
    return frame;
  }

  return { apply, reset, get detail() { return frame.detail; } };
}
