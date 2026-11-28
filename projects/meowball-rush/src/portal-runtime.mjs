import { alignDirectorToWarp } from './director.mjs';

// The browser and input-only simulation share detection, teleport and recovery.
// Yaw uses the director's backward view axis: screen-up is (-sin(yaw),-cos(yaw)).
export const PORTAL_TIMING = Object.freeze({ flash: .45, steering: .45, cooldown: 1.1 });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function findPortalEntry(track, ball, previous = null) {
  if (ball.portalCooldown > 0 || ball.chuteRide || ball.launchAssist
    || ball.popTimer > 0 || ball.fallRecovery) return null;
  return (track.portals || []).find(({ entry: p }) => {
    if (Math.abs(ball.y - ball.r - p.y) > .8) return false;
    const radius = p.r ?? 1.5;
    if (Math.hypot(ball.x - p.x, ball.z - p.z) <= radius) return true;
    if (!previous || Math.abs((previous.y ?? ball.y) - ball.r - p.y) > .8) return false;
    const dx = ball.x - previous.x, dz = ball.z - previous.z;
    const t = clamp(((p.x - previous.x) * dx + (p.z - previous.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(previous.x + dx * t - p.x, previous.z + dz * t - p.z) <= radius;
  }) || null;
}

export function capturePortal(ball, portal, director = null) {
  const p = portal.exit, speed = clamp(p.speed ?? 7, 6, 8);
  const yaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw));
  Object.assign(ball, {
    x: p.x, y: p.y + ball.r + .04, z: p.z,
    vx: -Math.sin(yaw) * speed, vy: 0, vz: -Math.cos(yaw) * speed,
    grounded: false, supportRoute: null, supportPlatform: null,
    chuteRide: null, chuteTangent: null, launchAssist: null,
    routeTangent: { x: -Math.sin(yaw), z: -Math.cos(yaw) },
    rollSlopeX: 0, rollSlopeZ: 0, landingImpact: 0,
    portalCooldown: PORTAL_TIMING.cooldown, portalFlash: PORTAL_TIMING.flash,
    portalSteering: PORTAL_TIMING.steering, portalYaw: yaw,
    portalColor: portal.color, lastPortal: portal.id,
    warpCount: (ball.warpCount || 0) + 1, boostFlash: .45,
  });
  // A pre-warp floor must never qualify as a swept landing on another tier.
  ball.previousBottom = p.y + .04;
  if (director) alignDirectorToWarp(director, ball, yaw, PORTAL_TIMING.steering);
  return portal;
}

export function advancePortal(ball, dt) {
  for (const key of ['portalCooldown', 'portalFlash', 'portalSteering']) {
    const remaining = (ball[key] || 0) - dt;
    ball[key] = remaining < 1e-9 ? 0 : remaining;
  }
}

export function dampPortalSteering(ball, driveX, driveZ) {
  if (!(ball.portalSteering > 0)) return { x: driveX, z: driveZ };
  const t = clamp(ball.portalSteering / PORTAL_TIMING.steering, 0, 1);
  const blend = t * t * (3 - 2 * t), fx = -Math.sin(ball.portalYaw), fz = -Math.cos(ball.portalYaw);
  // Suppress stale sideways/reverse input under the flash, then return control
  // continuously. Exit runways remain genuine rolling surfaces, not a rail ride.
  return { x: driveX * (1 - blend) + fx * 18 * blend,
    z: driveZ * (1 - blend) + fz * 18 * blend };
}

export function updatePortalPhysics(track, ball, dt, { director = null, onWarp = () => {}, previous = null } = {}) {
  advancePortal(ball, dt);
  const portal = findPortalEntry(track, ball, previous);
  if (!portal) return null;
  capturePortal(ball, portal, director);
  onWarp(portal);
  return portal;
}
