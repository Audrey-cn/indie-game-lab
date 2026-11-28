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
  let contacted=false,unresolved=false;
  const contactSides=new Set(),normals=[];
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
      contactSides.add(edge.side);normals.push({x:edge.nx,z:edge.nz});
      contacted=true;
    }
    unresolved=corrected;
    if(!corrected)break;
  }
  const opposing=contactSides.size>1&&normals.some(a=>normals.some(b=>a.x*b.x+a.z*b.z<-.65));
  if(contacted&&(opposing||unresolved))recoverGuardrailPinch(ball,route);
  return contacted;
}

export function recoverGuardrailPinch(ball,route) {
  const nearest=nearestCenterline(route,ball.x,ball.z),length=polylineLength(route.points),edges=getRibbonBoundarySegments(route);
  const here=samplePath(route.points,nearest.distance),intent=ball.routeTangent||{x:ball.vx,z:ball.vz};
  const direction=intent.x*here.tx+intent.z*here.tz<-.01?-1:1;
  const safe=p=>edges.every(edge=>{
    const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,len2=dx*dx+dz*dz;
    const u=((p.x-edge.a.x)*dx+(p.z-edge.a.z)*dz)/(len2||1);
    if(u<0||u>1||Math.abs(p.y-(edge.a.y+(edge.b.y-edge.a.y)*u))>1.25)return true;
    const signed=(p.x-edge.a.x)*edge.nx+(p.z-edge.a.z)*edge.nz;
    return signed<=-ball.r+1e-7||signed>ball.r+.15;
  });
  const offsets=[.75,1.5,3,5,0,-.75,-1.5,-3,-5];
  const p=offsets.map(offset=>samplePath(route.points,Math.max(0,Math.min(length,nearest.distance+offset*direction)))).find(safe)||here;
  ball.x=p.x;ball.y=p.y+ball.r;ball.z=p.z;
  const horizontal=Math.hypot(p.tx,p.tz)||1,speed=Math.max(1.8,Math.min(3.5,Math.hypot(ball.vx,ball.vz)));
  ball.vx=p.tx/horizontal*speed*direction;ball.vz=p.tz/horizontal*speed*direction;
  ball.vy=p.ty/horizontal*speed*direction;ball.routeTangent={x:p.tx/horizontal,z:p.tz/horizontal};
  ball.guardRecoveryCount=(ball.guardRecoveryCount||0)+1;
  return true;
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
  const patrol = isMovingCritter(def);
  return { x: def.x + (patrol ? Math.sin(elapsed * (def.speed || 0.8) + (def.phase || 0)) * (def.patrol || 1.5) : 0),
    y: def.y, z: def.z };
}
const MOVING_CRITTERS=new Set(['ducklings','sheep','snow_bunny','snow_bunnies','penguin','penguins']);
const isMovingCritter=prop=>MOVING_CRITTERS.has(prop.type);
function nearestCenterline(route,x,z) {
  let best=null,distance=0;
  for(let i=1;i<route.points.length;i++) {
    const a=route.points[i-1],b=route.points[i],dx=b.x-a.x,dz=b.z-a.z,flat2=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(flat2||1)));
    const squared=(x-a.x-dx*t)**2+(z-a.z-dz*t)**2,length=Math.hypot(dx,b.y-a.y,dz);
    if(!best||squared<best.squared)best={squared,distance:distance+length*t};
    distance+=length;
  }
  return best||{squared:0,distance:0};
}
export function collideFairytaleCritters(track,ball,elapsed,onEvent=()=>{}) {
  if(ball.chuteRide||ball.launchAssist||ball.popTimer>0)return false;
  ball.propCooldowns||=new Map();let contacted=false;
  for(const prop of track.props||[]) {
    if(!isMovingCritter(prop)||Math.abs(ball.y-ball.r-prop.y)>1)continue;
    const pos=fairytalePropPosition(prop,elapsed),radius=(prop.r||1.2)+ball.r;
    let dx=ball.x-pos.x,dz=ball.z-pos.z,distance=Math.hypot(dx,dz);
    if(distance>=radius)continue;
    const patrolVx=Math.cos(elapsed*(prop.speed||.8)+(prop.phase||0))*(prop.speed||.8)*(prop.patrol||1.5);
    let nx=dx/(distance||1),nz=dz/(distance||1);
    if(distance<1e-8) {const relative=Math.hypot(ball.vx-patrolVx,ball.vz);nx=relative>1e-8?-(ball.vx-patrolVx)/relative:-(ball.routeTangent?.x||0);nz=relative>1e-8?-ball.vz/relative:-(ball.routeTangent?.z||-1);}
    const previousX=ball.x,previousZ=ball.z;
    ball.x=pos.x+nx*(radius+1e-6);ball.z=pos.z+nz*(radius+1e-6);
    // Keep a critter beside a rail solid after the rail's own projection. If
    // those constraints squeeze the sphere, escape along the route, where the
    // finite animal body leaves an open approach/rebound lane.
    if(ball.supportRoute?.walls&&ball.grounded) {
      collideRouteGuardrails(ball,ball.supportRoute,previousX,previousZ);
      if(Math.hypot(ball.x-pos.x,ball.z-pos.z)<radius-1e-7) {
        const route=ball.supportRoute,center=nearestCenterline(route,pos.x,pos.z),length=polylineLength(route.points);
        const direction=((previousX-pos.x)*(ball.routeTangent?.x||0)+(previousZ-pos.z)*(ball.routeTangent?.z||-1))>=0?1:-1;
        const candidates=[direction,-direction].map(side=>samplePath(route.points,Math.max(0,Math.min(length,center.distance+side*(radius+.25)))))
          .filter(p=>Math.hypot(p.x-pos.x,p.z-pos.z)>=radius);
        const escape=candidates.sort((a,b)=>Math.hypot(a.x-previousX,a.z-previousZ)-Math.hypot(b.x-previousX,b.z-previousZ))[0];
        if(escape) {ball.x=escape.x;ball.z=escape.z;ball.y=escape.y+ball.r;}
      }
      dx=ball.x-pos.x;dz=ball.z-pos.z;distance=Math.hypot(dx,dz);nx=dx/(distance||1);nz=dz/(distance||1);
    }
    const normalSpeed=(ball.vx-patrolVx)*nx+ball.vz*nz;
    const outward=Math.max(5.5,normalSpeed<0?-normalSpeed*.8:normalSpeed);
    ball.vx+=(outward-normalSpeed)*nx;ball.vz+=(outward-normalSpeed)*nz;
    const key=prop.id||prop;
    if(!ball.propCooldowns.has(key)) {
      ball.propCooldowns.set(key,.7);
      onEvent({type:'patrol',prop,position:{x:pos.x+nx*(prop.r||1.2),y:prop.y+.6,z:pos.z+nz*(prop.r||1.2)},normal:{x:nx,z:nz},impact:Math.max(0,-normalSpeed)});
    }
    contacted=true;
  }
  // A later animal can project into an earlier one. Reconcile the complete
  // final set along the route rather than leaving the last projection solid
  // only for the final animal in iteration order.
  const animals=(track.props||[]).filter(prop=>isMovingCritter(prop)&&Math.abs(ball.y-ball.r-prop.y)<=1)
    .map(prop=>({prop,pos:fairytalePropPosition(prop,elapsed),radius:(prop.r||1.2)+ball.r}));
  const clear=p=>animals.every(a=>Math.hypot(p.x-a.pos.x,p.z-a.pos.z)>=a.radius+1e-6);
  if(contacted&&!clear(ball)&&ball.supportRoute) {
    const route=ball.supportRoute,nearest=nearestCenterline(route,ball.x,ball.z),length=polylineLength(route.points);
    const offsets=[0];for(let step=1;step<=Math.ceil(length/.5);step++)offsets.push(step*.5,-step*.5);
    const escape=offsets.map(offset=>samplePath(route.points,Math.max(0,Math.min(length,nearest.distance+offset)))).find(clear);
    if(escape) {ball.x=escape.x;ball.y=escape.y+ball.r;ball.z=escape.z;}
  }
  if(contacted&&!clear(ball)&&!ball.supportRoute) {
    const origin={x:ball.x,z:ball.z};
    for(let pass=0;pass<8&&!clear(ball);pass++)for(const animal of animals) {
      const dx=ball.x-animal.pos.x,dz=ball.z-animal.pos.z,distance=Math.hypot(dx,dz);
      if(distance>=animal.radius+1e-6)continue;
      const nx=distance>1e-8?dx/distance:1,nz=distance>1e-8?dz/distance:0;
      ball.x=animal.pos.x+nx*(animal.radius+2e-6);ball.z=animal.pos.z+nz*(animal.radius+2e-6);
    }
    // Collinear circles can alternate projections forever. Choose the nearest
    // exposed arc, with an outside-all bound as a deterministic final escape.
    if(!clear(ball)) {
      const candidates=animals.flatMap(animal=>Array.from({length:32},(_,i)=>({
        x:animal.pos.x+Math.cos(i*Math.PI/16)*(animal.radius+2e-6),
        z:animal.pos.z+Math.sin(i*Math.PI/16)*(animal.radius+2e-6)})));
      candidates.push({x:Math.max(...animals.map(a=>a.pos.x+a.radius))+2e-6,z:origin.z});
      const escape=candidates.filter(clear).sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z))[0];
      ball.x=escape.x;ball.z=escape.z;
    }
  }
  return contacted;
}
export function updateFairytalePhysics(track, ball, elapsed, dt, onEvent = () => {}) {
  ball.propCooldowns ||= new Map();
  for (const [key, remaining] of ball.propCooldowns) {
    if (remaining <= dt) ball.propCooldowns.delete(key);
    else ball.propCooldowns.set(key, remaining - dt);
  }
  if (ball.chuteRide || ball.launchAssist || ball.popTimer > 0) return;
  collideFairytaleCritters(track,ball,elapsed,onEvent);
  for (const prop of track.props || []) {
    if(isMovingCritter(prop))continue;
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
    }
  }
}
