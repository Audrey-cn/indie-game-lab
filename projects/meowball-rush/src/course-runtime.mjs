import { polylineLength, samplePath, computeLaunchVelocity } from './course-math.mjs';

export function findChuteEntry(track, ball) {
  if (ball.chuteCooldown > 0 || ball.chuteRide || ball.popTimer > 0) return null;
  return (track.chutes || []).find(c => {
    const p = c.points[0];
    return Math.hypot(ball.x - p.x, ball.z - p.z) < (c.entryRadius || 1.8)
      && Math.abs(ball.y - ball.r - p.y) < 1.1;
  }) || null;
}
export function captureChute(ball, chute) {
  const p = chute.points[0];
  const ride = { chute, distance: 0, elapsed: 0, length: polylineLength(chute.points),
    offset: { x: ball.x - p.x, y: ball.y - ball.r - p.y, z: ball.z - p.z } };
  ball.chuteRide = ride;
  ball.grounded = false;
  ball.supportPlatform = null;
  return ride;
}
export function advanceChute(ball, ride, dt, rawSway = 0) {
  const speed = ride.chute.speed || 13;
  ride.elapsed += dt;
  ride.distance = Math.min(ride.length, ride.distance + speed * dt);
  const p = samplePath(ride.chute.points, ride.distance);
  const capture = Math.max(0, 1 - ride.elapsed / 0.22) ** 2;
  const envelope = Math.sin(Math.PI * ride.distance / ride.length);
  const sway = Math.max(-1, Math.min(1, rawSway)) * 0.16 * envelope;
  const horizontal = Math.hypot(p.tx, p.tz) || 1;
  ball.x = p.x + ride.offset.x * capture + p.tz / horizontal * sway;
  ball.y = p.y + ball.r + ride.offset.y * capture;
  ball.z = p.z + ride.offset.z * capture - p.tx / horizontal * sway;
  ball.vx = p.tx * speed; ball.vy = p.ty * speed; ball.vz = p.tz * speed;
  ball.chuteTangent = { x: p.tx, y: p.ty, z: p.tz };
  ball.routeTangent = { x: p.tx, z: p.tz };
  ball.surfaceKind = 'chute';
  ball.grounded = false;
  if (ride.distance < ride.length) return true;
  ball.chuteRide = null;
  ball.chuteCooldown = 1;
  ball.boostFlash = 0.8;
  // The final straight rail segment is authored coplanar with its receiving deck.
  ball.previousBottom = p.y + 0.025;
  ball.y += 0.025;
  return false;
}
export function launchBall(ball, prop) {
  const v = prop.target ? computeLaunchVelocity(prop, prop.target, prop.flightTime || 0.9, 26)
    : { vx: prop.vx || 0, vy: prop.vy || 7, vz: prop.vz || 0 };
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  ball.grounded = false; ball.supportPlatform = null;
  ball.launchAssist = prop.target ? { elapsed: 0, duration: prop.flightTime || 0.9,
    start: { x: ball.x, y: ball.y, z: ball.z }, velocity: v, type: prop.type } : null;
  ball.boostFlash = 0.8;
}
export function advanceLaunch(ball, dt) {
  const a = ball.launchAssist;
  if (!a) return false;
  a.elapsed = Math.min(a.duration, a.elapsed + dt);
  const t = a.elapsed;
  ball.x = a.start.x + a.velocity.vx * t;
  ball.y = a.start.y + a.velocity.vy * t - 13 * t * t;
  ball.z = a.start.z + a.velocity.vz * t;
  ball.vx = a.velocity.vx; ball.vy = a.velocity.vy - 26 * t; ball.vz = a.velocity.vz;
  ball.grounded = false;
  if (t >= a.duration) {
    ball.launchAssist = null; ball.launchLanding = 0.25;
    if (a.type === 'spellbook_bridge') {
      // Fluttering pages catch the ball softly, leaving room to aim the next hop.
      const scale = Math.min(1, 2.4 / (Math.hypot(ball.vx, ball.vz) || 1));
      ball.vx *= scale; ball.vz *= scale;
    }
  }
  return true;
}
export function fairytalePropPosition(def, elapsed) {
  const patrol = ['ducklings','sheep','snow_bunny','penguin'].includes(def.type);
  return { x: def.x + (patrol ? Math.sin(elapsed * (def.speed || 0.8) + (def.phase || 0)) * (def.patrol || 1.5) : 0),
    y: def.y, z: def.z };
}
export function updateFairytalePhysics(track, ball, elapsed, dt, onEvent = () => {}) {
  ball.propCooldowns ||= new Map();
  for (const [key, remaining] of ball.propCooldowns) {
    if (remaining <= dt) ball.propCooldowns.delete(key);
    else ball.propCooldowns.set(key, remaining - dt);
  }
  if (ball.chuteRide || ball.launchAssist || ball.popTimer > 0) return;
  for (const prop of track.props || []) {
    const key = prop.id || prop;
    if (ball.propCooldowns.has(key)) continue;
    const pos = fairytalePropPosition(prop, elapsed);
    if (Math.hypot(ball.x - pos.x, ball.z - pos.z) > (prop.r || 1.2) + ball.r * 0.4
      || Math.abs(ball.y - ball.r - prop.y) > 1.0) continue;
    if (['toaster','willow_branch'].includes(prop.type) || (['wind_cloud','spellbook_bridge'].includes(prop.type) && (prop.target || prop.vy))) {
      if (prop.type === 'spellbook_bridge' && !ball.grounded) continue;
      if (ball.vy > 2) continue;
      // Start launches at their authored takeoff, preserving exact target reachability.
      ball.x = prop.x; ball.y = prop.y + ball.r; ball.z = prop.z;
      launchBall(ball, prop);
      ball.propCooldowns.set(key, 2.5);
      onEvent({ type: prop.type === 'spellbook_bridge' ? 'book_hop' : 'launch', prop });
    } else if (prop.type === 'hedgehog' || prop.type === 'toy_mouse') {
      const t = ball.routeTangent || { x: prop.fx || 0, z: prop.fz || -1 };
      const len = Math.hypot(t.x, t.z) || 1;
      ball.vx += t.x / len * 2.4; ball.vz += t.z / len * 2.4;
      ball.boostFlash = 0.65;
      ball.propCooldowns.set(key, 2);
      onEvent({ type: 'helper', prop });
    } else if (prop.type === 'turntable') {
      const dx = ball.x - prop.x, dz = ball.z - prop.z;
      const rate = Math.max(-1.2, Math.min(1.2, prop.omega || 0.8));
      ball.vx += dz * rate * dt * 4;
      ball.vz -= dx * rate * dt * 4;
    } else if (prop.type === 'wind_cloud') {
      ball.vx += (prop.fx || 0) * dt;
      ball.vz += (prop.fz || -2) * dt;
    } else if (['ducklings','sheep','snow_bunny','penguin'].includes(prop.type)) {
      // A friendly brush is safe: no vertical kick and bounded lateral influence.
      ball.vx += Math.cos(elapsed * (prop.speed || 0.8)) * Math.min(1.2, dt * 8);
      ball.propCooldowns.set(key, 0.7);
      onEvent({ type: 'patrol', prop });
    }
  }
}
