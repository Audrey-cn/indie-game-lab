// Camera yaw is the actual view's backward XZ direction. All devices share it.
export const CAMERA_MODES = Object.freeze({
  DEFAULT_FOLLOW: 'DEFAULT_FOLLOW', MANUAL_ORBIT: 'MANUAL_ORBIT',
  LOCKED_CHUTE: 'LOCKED_CHUTE', LOCKED_SETPIECE: 'LOCKED_SETPIECE',
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angle = (v) => Math.atan2(Math.sin(v), Math.cos(v));
const smooth = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function cameraRelativeInput(rawX, rawZ, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: rawX * c + rawZ * s, z: -rawX * s + rawZ * c };
}
export function createDirector(yaw = 0) {
  return { mode: CAMERA_MODES.DEFAULT_FOLLOW, yaw, pitch: 0.62, distance: 12,
    zoom: 1, manualHold: 0, manualOffset: 0, setpieceTime: 0, pose: null };
}
export function triggerSetpiece(director, duration = 1.2) {
  director.setpieceTime = clamp(duration, 0.9, 1.5);
}
export function updateDirector(d, { ball: b, track, dt, elapsed = 0, manualDelta = 0,
  pitchDelta = 0, zoomDelta = 0, orbitHeld = false, aspect = 1.6 }) {
  const zone = (track.cameraZones || []).find(z => z.type === 'orbit'
    && Math.hypot(b.x - z.x, b.z - z.z) <= (z.r || 5)
    && b.y >= (z.minY ?? z.y - 2) && b.y <= (z.maxY ?? z.y + 6));
  d.setpieceTime = Math.max(0, d.setpieceTime - dt);
  d.mode = b.chuteRide ? CAMERA_MODES.LOCKED_CHUTE : d.setpieceTime > 0
    ? CAMERA_MODES.LOCKED_SETPIECE : zone ? CAMERA_MODES.MANUAL_ORBIT : CAMERA_MODES.DEFAULT_FOLLOW;
  const locked = d.mode === CAMERA_MODES.LOCKED_CHUTE || d.mode === CAMERA_MODES.LOCKED_SETPIECE;
  const tangent = b.routeTangent || { x: b.vx, z: b.vz };
  const moving = Math.hypot(tangent.x, tangent.z) > 0.15;
  const heading = moving ? Math.atan2(-tangent.x, -tangent.z) : d.yaw - d.manualOffset;
  if (!locked) {
    if (manualDelta || pitchDelta || zoomDelta || orbitHeld) d.manualHold = 1.6;
    else d.manualHold = Math.max(0, d.manualHold - dt);
    d.zoom = clamp(d.zoom + zoomDelta, 0.65, 1.55);
    if (d.mode === CAMERA_MODES.MANUAL_ORBIT) {
      d.yaw += manualDelta;
      d.orbitPitch = clamp((d.orbitPitch ?? 0.77) + pitchDelta, 0.35, 1.22);
    } else {
      const oldOffset = d.manualOffset;
      d.manualOffset = clamp(d.manualOffset + manualDelta, -0.85, 0.85);
      if (d.manualHold <= 0) d.manualOffset *= Math.exp(-dt * 0.8);
      if (!orbitHeld) d.yaw += angle(heading + d.manualOffset - d.yaw) * (1 - Math.exp(-dt * (d.manualHold > 0 ? 8 : 1.4)));
      else d.yaw += d.manualOffset - oldOffset;
    }
  }
  const speed = Math.hypot(b.vx, b.vz);
  let dist = (11.8 + Math.min(4, Math.max(0, speed - 6) * 0.45)) * (track.worldType === 'indoor_home' ? 0.85 : 1);
  let pitch = 0.62, fov = aspect < 0.95 ? 54 : 46;
  if (d.mode === CAMERA_MODES.MANUAL_ORBIT) { dist = 15.2; pitch = d.orbitPitch ?? 0.77; fov += 3; }
  if (d.mode === CAMERA_MODES.LOCKED_SETPIECE) { dist = 16.5; pitch = 0.58; fov = 53; }
  if (d.mode === CAMERA_MODES.LOCKED_CHUTE) {
    const rail = b.chuteTangent || tangent;
    d.yaw += angle(Math.atan2(-rail.x, -rail.z) - d.yaw) * (1 - Math.exp(-dt * 11));
    dist = 5.8; pitch = Math.PI / 10; fov = 64;
  } else { dist *= d.zoom * (aspect < 0.95 ? 1.15 : 1); }
  d.distance = smooth(d.distance, dist, locked ? 6 : 3.5, dt);
  d.pitch = smooth(d.pitch, pitch, 4, dt);
  const back = Math.cos(d.pitch) * d.distance;
  const lead = locked ? 0.65 : Math.min(2, speed * 0.14);
  const forwardX = -Math.sin(d.yaw), forwardZ = -Math.cos(d.yaw);
  const target = { x: b.x - forwardX * back, y: b.y + Math.sin(d.pitch) * d.distance,
    z: b.z - forwardZ * back, lookX: b.x + forwardX * lead,
    lookY: b.y - (locked ? 0 : 0.15), lookZ: b.z + forwardZ * lead, fov, mode: d.mode };
  if (!d.pose) d.pose = { ...target };
  for (const k of ['x','y','z','lookX','lookY','lookZ','fov']) d.pose[k] = smooth(d.pose[k], target[k], locked ? 12 : 7, dt);
  d.pose.mode = d.mode;
  return d.pose;
}
