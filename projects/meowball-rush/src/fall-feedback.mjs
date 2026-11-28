// Shared deterministic fall contacts: the renderer and verifier use these levels.
export const FALL_MESSAGES = Object.freeze({
  water: '💦 扑通！掉进溪水里啦',
  indoor: '🏠 滚落桌面啦，回到检查点！',
  bush: '🌿 滚进花丛啦，回到小路！',
  cloud: '☁️ 坠入云海啦！',
});
export function findFallZone(track, ball, previousBottom = ball.previousBottom) {
  if (ball.grounded || ball.chuteRide || ball.launchAssist || ball.fallRecovery || ball.popTimer > 0 || ball.vy > 0) return null;
  const bottom = ball.y - ball.r;
  const zones = [...(track.fallZones || [])].sort((a, b) => Number(!!a.fallback) - Number(!!b.fallback) || (b.priority || 0) - (a.priority || 0));
  const zone = zones.find(zone => {
    const inside = zone.fallback || (Math.abs(ball.x - zone.x) <= zone.w / 2 && Math.abs(ball.z - zone.z) <= zone.d / 2);
    const level = zone.triggerY ?? zone.y;
    return inside && bottom <= level;
  });
  if (zone) return zone;
  // Legacy/debug fixtures also get a contextual safety net. Production stages
  // have visible authored catch zones well above this last-resort threshold.
  if (bottom < (track.deathY ?? -16)) {
    const type = ['indoor_home'].includes(track.worldType) ? 'indoor'
      : ['grounded_nature', 'town_street', 'hybrid_winter'].includes(track.worldType) ? 'bush' : 'cloud';
    return { id: 'fallback-contact', type, x: ball.x, z: ball.z, y: track.deathY ?? -16, fallback: true };
  }
  return null;
}
export function beginFallRecovery(ball, zone) {
  const floor = zone.triggerY ?? zone.y;
  ball.fallRecovery = { zone, elapsed: 0, duration: 1.35, bounce: zone.type === 'indoor', floor, from: null };
  ball.y = floor + ball.r;
  ball.vy = zone.type === 'indoor' ? Math.min(3.4, Math.abs(ball.vy) * 0.22) : 0;
  ball.vx *= 0.24; ball.vz *= 0.24;
  ball.grounded = false; ball.supportRoute = ball.supportPlatform = null;
  ball.chuteRide = ball.launchAssist = null; ball.dizzyTimer = 0;
}
export function advanceFallRecovery(ball, dt, checkpoint) {
  const recovery = ball.fallRecovery;
  if (!recovery) return false;
  recovery.elapsed = Math.min(recovery.duration, recovery.elapsed + dt);
  if (recovery.elapsed < 0.75) {
    if (recovery.bounce) {
      ball.vy -= 26 * dt;
      ball.y = Math.max(recovery.floor + ball.r, ball.y + ball.vy * dt);
      if (ball.y <= recovery.floor + ball.r && ball.vy < 0) ball.vy = Math.abs(ball.vy) > 0.8 ? -ball.vy * 0.18 : 0;
    }
    ball.vx *= Math.exp(-8 * dt); ball.vz *= Math.exp(-8 * dt);
    ball.x += ball.vx * dt; ball.z += ball.vz * dt;
  } else {
    recovery.from ||= { x: ball.x, y: ball.y, z: ball.z };
    const t = Math.min(1, (recovery.elapsed - 0.75) / (recovery.duration - 0.75));
    const ease = t * t * (3 - 2 * t);
    ball.x = recovery.from.x + (checkpoint.x - recovery.from.x) * ease;
    ball.y = recovery.from.y + (checkpoint.y + ball.r + 0.06 - recovery.from.y) * ease;
    ball.z = recovery.from.z + (checkpoint.z - recovery.from.z) * ease;
    ball.vx = ball.vy = ball.vz = 0;
  }
  if (recovery.elapsed < recovery.duration) return true;
  ball.fallRecovery = null; ball.grounded = false; ball.previousBottom = ball.y - ball.r;
  ball.chuteCooldown = 0.35;
  return false;
}
