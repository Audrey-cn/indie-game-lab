// Camera yaw is the actual view's backward XZ direction. All devices share it.
export const CAMERA_MODES = Object.freeze({
  DEFAULT_FOLLOW: 'DEFAULT_FOLLOW', MANUAL_ORBIT: 'MANUAL_ORBIT',
  LOCKED_CHUTE: 'LOCKED_CHUTE', LOCKED_SETPIECE: 'LOCKED_SETPIECE',
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angle = (v) => Math.atan2(Math.sin(v), Math.cos(v));
const smooth = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const FOLLOW_DEADZONE = 22 * Math.PI / 180;
const FOLLOW_DELAY = 0.45;
const FOLLOW_MAX_SPEED = 7 * Math.PI / 180;
const CHUTE_EXIT_SECONDS = 0.35;
const MIN_DISTANCE = 8;
const CHUTE_MIN_DISTANCE = 5.8;
const MAX_DISTANCE_SPEED = 8;
const headingOf = (v, fallback) => v && Math.hypot(v.x, v.z) > 1e-6
  ? Math.atan2(-v.x, -v.z) : fallback;
export function cameraRelativeInput(rawX, rawZ, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: rawX * c + rawZ * s, z: -rawX * s + rawZ * c };
}
export function createDirector(yaw = 0) {
  return { mode: CAMERA_MODES.DEFAULT_FOLLOW, yaw, pitch: 0.62, distance: 12,
    zoom: 1, manualHold: 0, followTurnTime: 0, followTurnSign: 0,
    setpieceTime: 0, wasChuteRide: false, chuteExit: null, pose: null };
}
export function triggerSetpiece(director, duration = 1.2) {
  director.setpieceTime = clamp(duration, 0.9, 1.5);
}
export function alignDirectorToWarp(d, ball, yaw, duration = .45) {
  d.yaw = angle(yaw);
  d.focus = { x: ball.x, y: ball.y, z: ball.z };
  d.pose = null;
  d.warpHold = duration;
  d.warpYaw = d.yaw;
  d.manualHold = 0;
  d.followTurnTime = 0; d.followTurnSign = 0;
  d.chuteExit = null; d.wasChuteRide = false; d.setpieceTime = 0;
  d.distance = Math.max(MIN_DISTANCE, d.distance);
}
export function updateDirector(d, { ball: b, track, dt, elapsed = 0, manualDelta = 0,
  pitchDelta = 0, zoomDelta = 0, orbitHeld = false, aspect = 1.6,
  lateralInput = 0, forwardInput = 0 }) {
  const warping = d.warpHold > 0;
  if (warping) { d.yaw = d.warpYaw; d.warpHold = Math.max(0, d.warpHold - dt); }
  const zone = (track.cameraZones || []).find(z => z.type === 'orbit'
    && Math.hypot(b.x - z.x, b.z - z.z) <= (z.r || 5)
    && b.y >= (z.minY ?? z.y - 2) && b.y <= (z.maxY ?? z.y + 6));
  d.setpieceTime = Math.max(0, d.setpieceTime - dt);
  const speed = Math.hypot(b.vx, b.vz);
  const tangent = b.routeTangent || { x: b.vx, z: b.vz };
  const lateralSteering = Math.abs(lateralInput) > 0.08;
  const riding = !!b.chuteRide;
  const previousMode = d.mode;
  if (riding) {
    d.chuteHeading = headingOf(b.chuteTangent || tangent, d.yaw);
    d.chuteExit = null;
  } else if (d.wasChuteRide) {
    // Capture once: a nearest receiving-route tangent can change abruptly.
    d.chuteExit = { from: d.yaw, to: headingOf(b.chuteTangent, d.chuteHeading ?? d.yaw), elapsed: 0 };
  }
  d.wasChuteRide = riding;
  if (d.chuteExit && (lateralSteering || manualDelta || orbitHeld)) {
    d.chuteExit = null;
    d.manualHold = 1.6;
  }
  if (d.chuteExit) {
    const exit = d.chuteExit;
    exit.elapsed += dt;
    const t = clamp(exit.elapsed / CHUTE_EXIT_SECONDS, 0, 1);
    d.yaw = angle(exit.from + angle(exit.to - exit.from) * t * t * (3 - 2 * t));
    if (t >= 1) d.chuteExit = null;
  }
  const freeMode = d.setpieceTime > 0 ? CAMERA_MODES.LOCKED_SETPIECE
    : zone ? CAMERA_MODES.MANUAL_ORBIT : CAMERA_MODES.DEFAULT_FOLLOW;
  // Preserve the chute mode while its short framing expands back to >=8m.
  // Ordinary/manual mode can then resume without either violating its minimum
  // or forcing an instantaneous 2.2m outward jump on release.
  d.mode = riding || d.chuteExit || d.distance < MIN_DISTANCE ? CAMERA_MODES.LOCKED_CHUTE : freeMode;
  const locked = warping || riding || !!d.chuteExit || freeMode === CAMERA_MODES.LOCKED_SETPIECE;
  if (previousMode !== d.mode) {
    d.followTurnTime = 0;
    d.followTurnSign = 0;
    if (previousMode === CAMERA_MODES.LOCKED_CHUTE || previousMode === CAMERA_MODES.LOCKED_SETPIECE)
      d.manualHold = 1.6;
  }
  if (!locked) {
    if (manualDelta || pitchDelta || zoomDelta || orbitHeld) d.manualHold = 1.6;
    else d.manualHold = Math.max(0, d.manualHold - dt);
    d.zoom = clamp(d.zoom + zoomDelta, 0.65, 1.55);
    // Apply explicit orbit exactly once. There is no decaying yaw offset that
    // can keep turning the view after the player releases Q/E or a drag.
    if (manualDelta) d.yaw = angle(d.yaw + manualDelta);
    if (freeMode === CAMERA_MODES.MANUAL_ORBIT) {
      d.orbitPitch = clamp((d.orbitPitch ?? 0.77) + pitchDelta, 0.35, 1.22);
    } else {
      const error = angle(headingOf(tangent, d.yaw) - d.yaw);
      const tangentLength = Math.hypot(tangent.x, tangent.z);
      const forwardMotion = (b.vx * tangent.x + b.vz * tangent.z) / (speed * tangentLength || 1);
      const canFollow = !lateralSteering && forwardInput > 0.15 && speed > 0.65
        && forwardMotion > 0.65 && !orbitHeld && d.manualHold <= 0 && Math.abs(error) > FOLLOW_DEADZONE;
      if (canFollow) {
        const sign = Math.sign(error);
        if (sign !== d.followTurnSign) d.followTurnTime = 0;
        d.followTurnSign = sign;
        const previousTime = d.followTurnTime;
        d.followTurnTime += dt;
        const turnDt = Math.max(0, d.followTurnTime - FOLLOW_DELAY) - Math.max(0, previousTime - FOLLOW_DELAY);
        const excess = error - sign * FOLLOW_DEADZONE;
        d.yaw = angle(d.yaw + clamp(excess * (1 - Math.exp(-turnDt * 0.55)),
          -FOLLOW_MAX_SPEED * turnDt, FOLLOW_MAX_SPEED * turnDt));
      } else {
        d.followTurnTime = 0;
        d.followTurnSign = 0;
      }
    }
  } else {
    d.followTurnTime = 0;
    d.followTurnSign = 0;
  }
  let dist = (11.8 + Math.min(4, Math.max(0, speed - 6) * 0.45)) * (track.worldType === 'indoor_home' ? 0.85 : 1);
  let pitch = 0.62, fov = aspect < 0.95 ? 54 : 46;
  if (freeMode === CAMERA_MODES.MANUAL_ORBIT) { dist = 15.2; pitch = d.orbitPitch ?? 0.77; fov += 3; }
  if (freeMode === CAMERA_MODES.LOCKED_SETPIECE) { dist = 16.5; pitch = 0.58; fov = 53; }
  if (riding) {
    d.yaw = angle(d.yaw + angle(d.chuteHeading - d.yaw) * (1 - Math.exp(-dt * 11)));
    dist = CHUTE_MIN_DISTANCE; pitch = Math.PI / 10; fov = 64;
  } else { dist = Math.max(MIN_DISTANCE, dist * d.zoom * (aspect < 0.95 ? 1.15 : 1)); }
  // Finish the last sub-millimetre of an exponential approach in finite
  // time, otherwise an 8m low-zoom exit would stay in chute mode forever.
  const nextDistance = Math.abs(d.distance - dist) < .001 ? dist
    : smooth(d.distance, dist, riding || d.chuteExit ? 6 : 3.5, dt);
  d.distance += clamp(nextDistance - d.distance, -MAX_DISTANCE_SPEED * dt, MAX_DISTANCE_SPEED * dt);
  if (!riding && !d.chuteExit && d.distance >= MIN_DISTANCE) d.mode = freeMode;
  d.pitch = smooth(d.pitch, pitch, 4, dt);
  const back = Math.cos(d.pitch) * d.distance;
  const lead = locked ? 0.65 : Math.min(2, speed * 0.14);
  const forwardX = -Math.sin(d.yaw), forwardZ = -Math.cos(d.yaw);
  const rate = locked ? 12 : 7;
  if (!d.focus) d.focus = { x: b.x, y: b.y, z: b.z };
  for (const k of ['x', 'y', 'z']) d.focus[k] = smooth(d.focus[k], b[k], rate, dt);
  d.lead = smooth(d.lead ?? lead, lead, rate, dt);
  d.lookDrop = smooth(d.lookDrop ?? (locked ? 0 : 0.15), locked ? 0 : 0.15, rate, dt);
  const target = { x: d.focus.x - forwardX * back, y: d.focus.y + Math.sin(d.pitch) * d.distance,
    z: d.focus.z - forwardZ * back, lookX: d.focus.x + forwardX * d.lead,
    lookY: d.focus.y - d.lookDrop, lookZ: d.focus.z + forwardZ * d.lead,
    fov: smooth(d.pose?.fov ?? fov, fov, rate, dt), aspect, mode: d.mode };
  // The focus can lag behind a moving ball. Normalize the rendered boom about
  // the ball so reverse motion and tight curves cannot shorten its safe radius.
  // Translate the aim by the same amount: view direction and steering yaw stay
  // exact, without adding another angular spring.
  const ox = target.x - b.x, oy = target.y - b.y, oz = target.z - b.z;
  const radialScale = d.distance / (Math.hypot(ox, oy, oz) || d.distance);
  const shiftX = ox * (radialScale - 1), shiftY = oy * (radialScale - 1), shiftZ = oz * (radialScale - 1);
  target.x += shiftX; target.y += shiftY; target.z += shiftZ;
  target.lookX += shiftX; target.lookY += shiftY; target.lookZ += shiftZ;
  // Both endpoints use the same yaw. Independent world-space lerps would add
  // a hidden second yaw spring.
  if (!d.pose) d.pose = target;
  else Object.assign(d.pose, target);
  return d.pose;
}
