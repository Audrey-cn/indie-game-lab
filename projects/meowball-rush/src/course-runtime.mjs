import { polylineLength, samplePath, computeLaunchVelocity, getRibbonBoundarySegments } from './course-math.mjs';

// Guardrails are vertical constraints. Their visible top/bevel is never a
// supporting surface: this response changes XZ only, including on a bank.
export function resolveHorizontalGuardrail(ball, nx, nz, penetration, { restitution=.18, tangentialRetention=.94 }={}) {
  const length=Math.hypot(nx,nz);
  if(length<1e-9 || penetration<=0)return false;
  nx/=length;nz/=length;
  ball.x-=nx*penetration;ball.z-=nz*penetration;
  const outward=ball.vx*nx+ball.vz*nz;
  if(outward>0) {
    // Resting contact cancels tiny motor/gravity pushes without repeatedly
    // scrubbing forward speed or creating a frame-rate dependent rail chatter.
    const impact=outward>.12,retention=impact?tangentialRetention:1;
    const tangentX=ball.vx-nx*outward,tangentZ=ball.vz-nz*outward;
    ball.vx=tangentX*retention-nx*outward*(impact?restitution:0);
    ball.vz=tangentZ*retention-nz*outward*(impact?restitution:0);
  }
  return true;
}

export function collideRouteGuardrails(ball, route, previousX=ball.x, previousZ=ball.z) {
  if(!route?.walls || !ball.grounded)return false;
  const edges=getRibbonBoundarySegments(route);
  let contacted=false;
  // Project all active edge half-planes to convergence. Two fixed passes leave
  // small penetrations at mitered/tapered corners and re-trigger every frame.
  for(let pass=0;pass<12;pass++) {
    let corrected=false;
    for(const edge of edges) {
      const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,len2=dx*dx+dz*dz;
      if(len2<1e-8)continue;
      const signed=(ball.x-edge.a.x)*edge.nx+(ball.z-edge.a.z)*edge.nz;
      if(signed<=-ball.r+1e-8)continue;
      const previous=(previousX-edge.a.x)*edge.nx+(previousZ-edge.a.z)*edge.nz;
      const crossing=previous<=-ball.r && signed>previous;
      const fraction=crossing?(-ball.r-previous)/(signed-previous):1;
      const hitX=previousX+(ball.x-previousX)*fraction,hitZ=previousZ+(ball.z-previousZ)*fraction;
      const hitU=((hitX-edge.a.x)*dx+(hitZ-edge.a.z)*dz)/len2;
      const currentU=((ball.x-edge.a.x)*dx+(ball.z-edge.a.z)*dz)/len2;
      // A sweep can cross the *extension* just before an adjoining edge starts
      // and finish on that finite edge. Its final overlap still needs solving.
      const u=hitU>=-1e-6 && hitU<=1+1e-6?hitU:currentU;
      if(u< -1e-6 || u>1+1e-6 || (!crossing && signed>ball.r+.15))continue;
      const floor=edge.a.y+(edge.b.y-edge.a.y)*Math.max(0,Math.min(1,u));
      if(Math.abs(ball.y-ball.r-floor)>1.25)continue;
      corrected=resolveHorizontalGuardrail(ball,edge.nx,edge.nz,signed+ball.r+1e-8)||corrected;
      contacted=true;
    }
    if(!corrected)break;
  }
  return contacted;
}

// Ground motion is shared by the browser and deterministic input-only harness.
// The motor is intentionally weaker than 16deg rolling gravity: climbs need a run-up.
export const ROLLING_PHYSICS = Object.freeze({ gravity:26, inertia:5/7, motor:4.05, inputRange:18, airControl:.24 });
const MATERIALS = Object.freeze({
  grass: { rolling:.36, drag:.12, grip:3.2, traction:1, restitution:.045 },
  carpet: { rolling:.64, drag:.22, grip:4.2, traction:.96, restitution:.025 },
  wood: { rolling:.13, drag:.055, grip:2.1, traction:1, restitution:.075 },
  stone: { rolling:.19, drag:.075, grip:2.55, traction:1, restitution:.065 },
  brass: { rolling:.12, drag:.045, grip:1.9, traction:1, restitution:.085 },
  ice: { rolling:.035, drag:.018, grip:.15, traction:.78, restitution:.095 },
  honey: { rolling:.58, drag:2.0, grip:3.4, traction:.72, restitution:.018 },
  mud: { rolling:.78, drag:1.65, grip:3.7, traction:.66, restitution:.02 },
});
export function materialPhysics(kind='wood') {
  if(kind==='ice_ramp')return MATERIALS.ice;
  if(kind==='ramp'||kind==='trough'||kind==='elevator'||kind==='cloud')return MATERIALS.wood;
  return MATERIALS[kind] || MATERIALS.wood;
}
export function surfaceGradient(surface) {
  return { x:surface?.slopeX || 0,z:surface?.slopeZ || 0 };
}
export function rollingSurfaceSpeed(ball, surface) {
  const s=surfaceGradient(surface),vy=s.x*ball.vx+s.z*ball.vz;
  return Math.hypot(ball.vx,vy,ball.vz);
}
export function rollingDownhill(surface, ball) {
  const s=surfaceGradient(surface);
  return !!surface && -(s.x*ball.vx+s.z*ball.vz)>.01;
}
export function integrateRollingMotion(ball, surface, driveX, driveZ, dt, stats={}) {
  const p=ROLLING_PHYSICS, raw=Math.hypot(driveX,driveZ), power=Math.min(1,raw/p.inputRange);
  const dx=raw>1e-8?driveX/raw:0,dz=raw>1e-8?driveZ/raw:0;
  if(!ball.grounded || !surface) {
    const airDrag=Math.exp(-.035*dt);
    ball.vx=(ball.vx+dx*power*p.motor*p.airControl*(stats.accel||1)*dt)*airDrag;
    ball.vz=(ball.vz+dz*power*p.motor*p.airControl*(stats.accel||1)*dt)*airDrag;
    ball.vy-=p.gravity*dt;
    return;
  }
  const s=surfaceGradient(surface),m=materialPhysics(surface.kind),grade2=s.x*s.x+s.z*s.z;
  // Transport tangent velocity across normals without losing energy at every bank row.
  const oldY=(ball.rollSlopeX??s.x)*ball.vx+(ball.rollSlopeZ??s.z)*ball.vz;
  const newY=s.x*ball.vx+s.z*ball.vz, oldSpeed=Math.hypot(ball.vx,oldY,ball.vz),newSpeed=Math.hypot(ball.vx,newY,ball.vz);
  const transport=newSpeed>1e-8?oldSpeed/newSpeed:1;
  ball.vx*=transport;ball.vz*=transport;
  const dirY=s.x*dx+s.z*dz,tangentNorm=Math.hypot(dx,dirY,dz)||1;
  const alongTangent=(ball.vx*dx+ball.vz*dz+(s.x*ball.vx+s.z*ball.vz)*dirY)/tangentNorm;
  const torque=Math.max(0,Math.min(1,(10.2*(stats.topSpeed||1)-alongTangent)/.9));
  const motor=p.motor*power*m.traction*(stats.accel||1)*torque/tangentNorm;
  const narrow=!!surface.route && (surface.halfWidth??surface.route.width/2)<=1.4;
  const precisionGrip=narrow?1.45:1;

  const gravity=p.gravity*p.inertia/(1+grade2);
  ball.vx+=(dx*motor-s.x*gravity)*dt;
  ball.vz+=(dz*motor-s.z*gravity)*dt;
  if(power>.02) {
    // Grip removes sideways slip without deleting the forward momentum of a banked turn.
    const side=-dz*ball.vx+dx*ball.vz;
    const lost=side*(1-Math.exp(-m.grip*precisionGrip*(stats.grip||1)*power*dt));
    ball.vx+=dz*lost;ball.vz-=dx*lost;
    const along=ball.vx*dx+ball.vz*dz;
    if(along<0 && dirY<=.01) {
      const brake=Math.min(-along,(narrow?7.4:5.2)*m.traction*(stats.grip||1)*power*dt);
      ball.vx+=dx*brake;ball.vz+=dz*brake;
    }
  }
  const speed=rollingSurfaceSpeed(ball,surface);
  if(speed>1e-8) {
    const afterDrag=speed*Math.exp(-m.drag*dt),afterRoll=Math.max(0,afterDrag-m.rolling*dt);
    const ratio=afterRoll/speed;ball.vx*=ratio;ball.vz*=ratio;
  }
  ball.vy=s.x*ball.vx+s.z*ball.vz;
  ball.rollSlopeX=s.x;ball.rollSlopeZ=s.z;
}
export function resolveRollingLanding(ball, surface, { bounce=true }={}) {
  const s=surfaceGradient(surface),m=materialPhysics(surface.kind),norm=Math.hypot(s.x,1,s.z);
  const nx=-s.x/norm,ny=1/norm,nz=-s.z/norm;
  const normalSpeed=ball.vx*nx+ball.vy*ny+ball.vz*nz,impact=Math.max(0,-normalSpeed);
  ball.vx-=nx*Math.min(0,normalSpeed);ball.vy-=ny*Math.min(0,normalSpeed);ball.vz-=nz*Math.min(0,normalSpeed);
  const rebound=bounce && impact>3.2?Math.min(.95,impact*m.restitution):0;
  if(rebound>.3) {ball.vx+=nx*rebound;ball.vy+=ny*rebound;ball.vz+=nz*rebound;}
  else ball.vy=s.x*ball.vx+s.z*ball.vz;
  ball.rollSlopeX=s.x;ball.rollSlopeZ=s.z;ball.landingImpact=impact;
  return { impact,rebound:rebound>.3?rebound:0,grounded:rebound<=.3 };
}

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
  const topSpeed = ride.chute.speed || 13;
  const exitSpeed = Math.max(2,Math.min(topSpeed,ride.chute.exitSpeed || topSpeed));
  const brakeDistance = Math.max(1,ride.chute.brakeDistance || 12);
  const deceleration = (topSpeed*topSpeed-exitSpeed*exitSpeed)/(2*brakeDistance);
  const brakeStart = Math.max(0,ride.length-brakeDistance);
  let seconds=dt;
  if(ride.distance<brakeStart) {
    const cruiseSeconds=Math.min(seconds,(brakeStart-ride.distance)/topSpeed);
    ride.distance+=topSpeed*cruiseSeconds;seconds-=cruiseSeconds;
  }
  if(seconds>0) {
    const speed=Math.sqrt(exitSpeed*exitSpeed+2*deceleration*Math.max(0,ride.length-ride.distance));
    const nextSpeed=Math.max(exitSpeed,speed-deceleration*seconds);
    ride.distance+=(speed+nextSpeed)*.5*seconds;
  }
  ride.elapsed += dt;
  ride.distance = Math.min(ride.length,ride.distance);
  const speed=Math.sqrt(exitSpeed*exitSpeed+2*deceleration*Math.min(brakeDistance,Math.max(0,ride.length-ride.distance)));
  ride.speed=speed;
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
