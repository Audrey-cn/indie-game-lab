// Deterministic integration checks against the real browser physics functions.
// Rendering, audio and result UI are stubbed; collision and movement are not.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import vm from 'node:vm';
import * as courseConfig from '../src/config.mjs';
import { createRouteRibbonGeometry } from '../src/v3-worlds.mjs';
import { CHUTE_STYLES } from '../src/chute-styles.mjs';
import { evaluateDryCurveOffset, sampleDryCurvePoints, mudSpecForStage } from '../src/mud-curve.mjs';
import { auditLaneThreat, difficultyProfileForStage, MIN_SAFE_PASSING_WIDTH } from '../src/lane-difficulty.mjs';
const { CATS, TRACKS } = courseConfig;
import './verify-assets.mjs';
import './verify-checkpoint.mjs';
import { verifyCameraStability } from './verify-camera.mjs';
import { verifyCameraSightline } from './verify-camera-sightline.mjs';
const trackBuilder = await import('../src/cel-builder.mjs');

const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing physics source markers: ${start}, ${end}`);
  return source.slice(a, b);
}
const surfaceCode = sourceBetween('// ===== DETERMINISTIC 3D SURFACE QUERY', 'function triggerBubblePop(');
const physicsCode = sourceBetween('function updatePhysics(dt)', 'function updateVisuals(dt)');
const popCode = sourceBetween('function triggerBubblePop(', 'function finishStage(');
const moduleAt = async name => existsSync(new URL(`../src/${name}.mjs`, import.meta.url))
  ? await import(`../src/${name}.mjs`) : null;
const courseMath = await moduleAt('course-math');
const directorApi = await moduleAt('director');
const runtimeApi = await moduleAt('course-runtime');
const portalApi = await moduleAt('portal-runtime');
const timeApi = await moduleAt('time-runtime');
const fallApi = await moduleAt('fall-feedback');
const fallEffectsApi = await moduleAt('fall-effects');
const { Vector3 } = THREE;
const noop = () => {};
const visible = () => ({ visible: true, rotation: { y: 0 } });
function makeHarness(track, cat = CATS[0]) {
  const b = { ...track.start, vx: 0, vy: 0, vz: 0, r: 0.62,
    grounded: false, surfaceKind: 'grass', dizzyTimer: 0, popTimer: 0,
    hammerHitCd: 0, rollingPinHitCd: 0, bumperHitCd: 0,
    boostFlash: 0, burstTimer: 0, supportPlatform: null };
  const state = { track, cat, phase: 'playing', elapsed: 0, timeLeft: track.bonusTime || 180,
    ball: b, pops: 0, stars: 0, squashVel: 0, fallEffects: [], checkpoint: { ...track.start },
    viewYaw: 0, director: directorApi?.createDirector(0), checkpointIdx: -1, shownTips: new Set(), secretFound: false,
    input: { keys: new Set(), mouseAccX: 0, mouseAccZ: 0, ix: 0, iz: 0 } };
  const dynamicMeshes = {
    gears: track.gears.map(def => ({ def, mesh: { rotation: { y: 0 } } })),
    hammers: track.hammers.map(def => ({ def, pivot: { rotation: { z: 0 } }, worldHead: new Vector3() })),
    mushrooms: track.mushrooms.map(def => ({ def, bounceAnim: 0 })),
    stars: track.stars.map(def => ({ def, collected: false, mesh: { visible: true } })),
    elevators: track.platforms.filter(p => p.kind === 'elevator').map(def => ({ def, mesh: { position: new Vector3() } })),
    rollingPins: (track.rollingPins || []).map(def => ({ def,
      mesh: { position: new Vector3(def.x, def.y, def.z), rotation: { x: 0, y: 0, z: 0 } },
      roller: { rotation: { x: 0, y: 0, z: 0 } } })),
    bumpers: (track.bumpers || []).map(def => ({ def, pulse: 0 })),
    steamVents: (track.steamVents || []).map(def => ({ def, active: false, touching: false })),
    fairytaleProps: (track.props || []).map(def => ({ def, mesh: { position: new Vector3(def.x,def.y,def.z),rotation:{x:0,y:0,z:0} } })),
    chutes: (track.chutes || []).map(def => ({def})),
  };
  const events = [];
  const context = vm.createContext({
    THREE, ...courseMath, ...directorApi, ...runtimeApi, ...portalApi, ...timeApi, ...fallApi, ...fallEffectsApi, trackRoot: new THREE.Group(), state, dynamicMeshes,
    CATS, TRACKS, Math, console,
    getSideWallOpenings: (...args) => trackBuilder.getSideWallOpenings(...args),
    getEndWallOpenings: (...args) => trackBuilder.getEndWallOpenings(...args),
    gyroEnabled: false, gyroTiltX: 0, gyroTiltZ: 0,
    sfx: new Proxy({}, { get: () => noop }),
    kittyRig: { bubbleMesh: visible(), kitty: visible(), accGroup: visible(), dizzyHalo: visible(), furball: visible() },
    showToast: noop, showStarPop: noop, showTimePenalty: noop, activateCheckpoint: noop, createMagicBurst: noop,
    finishStage(cleared) { state.phase = 'ended'; state.cleared = cleared; },
  });
  vm.runInContext(`${surfaceCode}\n${popCode}\n${physicsCode}\nthis.updatePhysics = updatePhysics; this.sampleTrackSurface = sampleTrackSurface;`, context);
  const actualFall = context.triggerContextualFall;
  context.triggerContextualFall = zone => {
    if(!b.fallRecovery && b.popTimer<=0)events.push({type:'fall',reason:zone.type,time:state.elapsed,x:b.x,y:b.y,z:b.z});
    actualFall(zone);
  };
  const actualPop = context.triggerBubblePop;
  context.triggerBubblePop = (reason) => {
    if (b.popTimer <= 0) events.push({ type: 'pop', reason, time: state.elapsed, x: b.x, y: b.y, z: b.z });
    actualPop(reason);
  };
  return { state, b, events, context, dynamicMeshes, step(dt, driveX = 0, driveZ = 0, screenLimit = Infinity) {
    // Inverse of the game's screen-to-world camera yaw transform.
    const yaw = state.viewYaw ?? state.director?.yaw ?? 0.58;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    state.input.mouseAccX = Math.max(-screenLimit, Math.min(screenLimit, driveX * c - driveZ * s));
    state.input.mouseAccZ = Math.max(-screenLimit, Math.min(screenLimit, driveX * s + driveZ * c));
    state.elapsed += dt;
    state.timeLeft -= dt;
    if (state.timeLeft > 0) context.updatePhysics(dt);
    else { state.phase = 'ended'; state.cleared = false; }
    if (directorApi && state.director) {
      const pose=directorApi.updateDirector(state.director,{ball:b,track,dt,elapsed:state.elapsed,aspect:1.6,
        lateralInput:state.input.lateralInput,forwardInput:state.input.forwardInput});
      state.viewYaw=Math.atan2(pose.x-pose.lookX,pose.z-pose.lookZ);
    }
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert(Number.isFinite(b[k]), `Non-finite ball.${k}`);
  }};
}

function testTrack(platforms, overrides = {}) {
  return { id: 'test', start: { x: 0, y: 8.62, z: 0 }, deathY: -30,
    routes: [], chutes: [], props: [], cameraZones: [], platforms, boosts: [], mushrooms: [], gears: [], hammers: [], stars: [], checkpoints: [],
    rollingPins: [], bumpers: [], steamVents: [],
    finish: { x: 10000, y: 8, z: 10000 }, ...overrides };
}
const flat = { kind: 'grass', x: 0, y: 8, z: 0, w: 600, d: 600, h: 1 };
const checks = [];
function check(name, fn) {
  const filter=process.argv.find(arg=>arg.startsWith('--check='))?.slice(8);
  if(filter&&!new RegExp(filter,'i').test(name))return;
  try { const receipt = fn(); checks.push({ name, pass: true, ...receipt }); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); }
}

check('v3.2 periodic spikes telegraph, active hit, safe retraction and contact latch',()=>{
  assert.equal(typeof runtimeApi.spikeState,'function','missing shared spike cycle');
  assert.equal(typeof runtimeApi.updateSpikePhysics,'function','missing actual spike collision');
  const def={id:'timed-spike',x:0,y:8,z:0,r:.8,phase:0};
  const states=[0,.549,.55,1.649,1.65,3.449,3.45].map(t=>runtimeApi.spikeState(def,t));
  assert.deepEqual(states.map(s=>s.phase),['telegraph','telegraph','active','active','retracted','retracted','telegraph']);
  for(const hz of [120,60,25]) {
    const h=makeHarness(testTrack([flat],{spikes:[def]}));
    h.b.grounded=true;h.b.vz=-3;
    h.state.elapsed=.6-1/hz;const before=h.state.timeLeft;h.step(1/hz);
    near(h.state.timeLeft,before-5-1/hz,'spike penalty applies through browser event handler');
    assert(Math.hypot(h.b.vx,h.b.vz)>3,'spike lacks elastic horizontal knockback');
    assert.equal(h.state.pops,0,'spike must rebound without popping');
    const events=[],b={x:.2,y:8.62,z:0,r:.62,vx:-3,vy:0,vz:0,grounded:true};
    runtimeApi.updateSpikePhysics({spikes:[def]},b,.6,1/hz,e=>events.push(e));
    assert.equal(events.filter(e=>e.type==='spike').length,1);assert.equal(events.find(e=>e.type==='spike').penalty,5);
    b.x=.2;b.z=0;runtimeApi.updateSpikePhysics({spikes:[def]},b,.6+1/hz,1/hz,e=>events.push(e));
    assert.equal(events.filter(e=>e.type==='spike').length,1,'overlap repeats penalty');
    for(const elapsed of [.2,2]) {
      const safe={x:0,y:8.62,z:0,r:.62,vx:0,vy:0,vz:0,grounded:true},safeEvents=[];
      runtimeApi.updateSpikePhysics({spikes:[def]},safe,elapsed,1/hz,e=>safeEvents.push(e));
      assert.equal(safeEvents.filter(e=>e.penalty>0).length,0);assert.equal(safe.vx,0);assert.equal(safe.vz,0);
    }
  }
  return{rates:[120,60,25],cycleSeconds:3.45};
});

check('v3.2 fast grazing spike contacts use swept collision while retracted plates stay safe',()=>{
  const def={id:'grazing',x:0,y:8,z:0,r:.7};
  let sweptHits=0;
  for(const hz of [120,60,25]) {
    const dt=1/hz,radius=def.r+.62;
    const x=Math.sqrt(radius**2-(15*dt*.3)**2),previous={x,z:-15*dt/2};
    const ball={x,y:8.62,z:15*dt/2,r:.62,vx:0,vy:0,vz:15,grounded:true};
    assert(Math.hypot(previous.x,previous.z)>radius&&Math.hypot(ball.x,ball.z)>radius);
    const events=[];runtimeApi.updateSpikePhysics({spikes:[def]},ball,.9,dt,e=>events.push(e),previous);
    assert.equal(events.filter(e=>e.type==='spike').length,1,'active grazing chord tunnels');
    assert(Math.hypot(ball.vx,ball.vz)>1);near(ball.y,8.62,'spike sweep injects vertical position');near(ball.vy,0,'spike sweep injects jump');sweptHits++;
    for(const [time,offset] of [[2,0],[.9,.03]]) {
      const safe={x:x+offset,y:8.62,z:15*dt/2,r:.62,vx:0,vy:0,vz:15,grounded:true},safeEvents=[];
      runtimeApi.updateSpikePhysics({spikes:[def]},safe,time,dt,e=>safeEvents.push(e),{x:x+offset,z:previous.z});
      assert.equal(safeEvents.filter(e=>e.type==='spike').length,0,'safe swept path triggers spike');
    }
  }
  return{sweptHits};
});

check('v3.2 fall costs eight seconds once and penalties immediately trigger timeout',()=>{
  assert.equal(typeof timeApi?.applyTimePenalty,'function','missing shared penalty clock');
  for(const hz of [120,60,25]) {
    const zone={id:'water',type:'water',x:0,z:0,w:20,d:20,y:4,triggerY:4};
    const h=makeHarness(testTrack([],{fallZones:[zone]}));
    h.b.y=3;const before=h.state.timeLeft;h.step(1/hz);
    near(h.state.timeLeft,before-8-1/hz,'fall does not deduct eight seconds');
    h.step(1/hz);near(h.state.timeLeft,before-8-2/hz,'fall recovery charged twice');
    const timeout=makeHarness(testTrack([],{fallZones:[zone]}));timeout.state.timeLeft=7;timeout.b.y=3;timeout.step(1/hz);
    assert.equal(timeout.state.timeLeft,0);assert.equal(timeout.state.phase,'ended');assert.equal(timeout.state.cleared,false);
    const spike=makeHarness(testTrack([flat],{spikes:[{id:'timeout-spike',x:0,y:8,z:0,r:.8,phase:0}]}));
    spike.state.timeLeft=4;spike.state.elapsed=.6-1/hz;spike.b.grounded=true;spike.step(1/hz);
    assert.equal(spike.state.timeLeft,0);assert.equal(spike.state.phase,'ended');assert.equal(spike.state.cleared,false);
  }
  const paused={phase:'paused',timeLeft:20};timeApi.applyTimePenalty(paused,8,'fall');assert.equal(paused.timeLeft,20);
  return{rates:[120,60,25],fallPenalty:8,hazardPenalty:5};
});

check('v3.2 playful bumper bodies remain solid during boing cooldown',()=>{
  for(const hz of [120,60,25]) {
    const def={x:0,y:8,z:0,r:.62,bounce:6},h=makeHarness(testTrack([flat],{start:{x:1,y:8.62,z:0},bumpers:[def]}));
    h.b.grounded=true;h.b.bumperHitCd=.2;h.b.vx=-3;
    const y=h.b.y,vy=h.b.vy;h.step(1/hz);
    assert(Math.hypot(h.b.x,h.b.z)>=def.r+h.b.r,'cooldown makes bumper permeable');
    near(h.b.y,y,'horizontal bumper changes height');near(h.b.vy,vy,'horizontal bumper adds jump');
    assert(h.b.vx>=0);assert.equal(h.state.pops,0);
  }
  return{rates:[120,60,25]};
});

check('v3.2 authored rail-side bouncy props cannot pinch or embed the ball',()=>{
  let cases=0,maxCorrection=0;
  for(const track of TRACKS)for(const def of track.bumpers)for(const hz of [120,60,25]) {
    const route=track.routes.find(r=>r.id===def.routeId),rows=courseMath.getRouteRibbonRows(route);
    const center=route.points.reduce((a,b)=>Math.hypot(b.x-def.x,b.z-def.z)<Math.hypot(a.x-def.x,a.z-def.z)?b:a);
    const dx=def.x-center.x,dz=def.z-center.z,n=Math.hypot(dx,dz)||1;
    // Original scenery bumpers exercise the trapped rail side. Lane blockers
    // exercise their playable inward face; their outward side can be off deck.
    const bumperFloor=courseMath.nearestRouteSurface([route],def.x,def.z,Infinity);assert(bumperFloor,`${track.id}/${def.id}: bumper has no floor`);
    const side=def.laneSlot===undefined?1:-1,offset=side>0?Math.min(.75,Math.max(.1,bumperFloor.halfWidth-Math.abs(bumperFloor.lateral)-.06)):.75;
    const x=def.x+dx/n*offset*side,z=def.z+dz/n*offset*side;
    const floor=courseMath.nearestRouteSurface([route],x,z,Infinity);assert(floor,`${track.id}/${def.id}: bumper contact fixture has no floor`);
    const h=makeHarness(testTrack([],{routes:[route],bumpers:[def],start:{x,y:floor.y+.62,z}}));
    h.b.grounded=true;h.b.supportRoute=route;h.b.bumperHitCd=.2;
    h.step(1/hz);
    assert(Math.hypot(h.b.x-def.x,h.b.z-def.z)>=def.r+h.b.r-1e-6,`${track.id}/${def.id}: rail projection embeds ball inside prop`);
    assert(h.b.grounded);assert.equal(h.state.pops,0);
    for(const edge of courseMath.getRibbonBoundarySegments(route)) {
      // A folded route can place distant rails on the other side of this
      // point's half-plane. Only rails near the original contact can constrain
      // the recovery; the total correction is bounded separately below.
      if(Math.abs((x-edge.a.x)*edge.nx+(z-edge.a.z)*edge.nz)>2)continue;
      const ex=edge.b.x-edge.a.x,ez=edge.b.z-edge.a.z,u=((h.b.x-edge.a.x)*ex+(h.b.z-edge.a.z)*ez)/(ex*ex+ez*ez);
      if(u<0||u>1)continue;
      assert((h.b.x-edge.a.x)*edge.nx+(h.b.z-edge.a.z)*edge.nz<=-h.b.r+1e-5,`${track.id}/${def.id}/${route.id}@${hz}Hz: prop recovery crosses rail; ball=${JSON.stringify({x:h.b.x,z:h.b.z})}, edge=${JSON.stringify(edge)}`);
    }
    maxCorrection=Math.max(maxCorrection,Math.hypot(h.b.x-x,h.b.z-z));cases++;
  }
  assert.equal(cases,TRACKS.reduce((n,t)=>n+t.bumpers.length*3,0));assert(maxCorrection<1.5,'prop correction skips too far along course');
  return{cases,maxCorrection};
});

check('v3.2 pendulum hit deducts five seconds once with elastic momentum',()=>{
  for(const hz of [120,60,25]) {
    const hammer={x:0,y:12,z:0,len:3.3,speed:1.4,amp:.65,phase:0};
    const h=makeHarness(testTrack([flat],{start:{x:0,y:8.62,z:.4},hammers:[hammer]}));
    const before=h.state.timeLeft;h.step(1/hz);
    near(h.state.timeLeft,before-5-1/hz,'pendulum penalty');
    assert(h.b.hammerHitCd>0);assert(Math.hypot(h.b.vx,h.b.vz)>3);assert.equal(h.state.pops,0);
    h.step(1/hz);near(h.state.timeLeft,before-5-2/hz,'pendulum cooldown repeated penalty');
  }
  return{rates:[120,60,25],penalty:5};
});

check('v3.2 pendulums remain solid during hit cooldown including coincident centers',()=>{
  for(const hz of [120,60,25])for(const z of [0,.04]) {
    const hammer={x:0,y:12,z:0,len:3.3,speed:0,amp:0,phase:0};
    const h=makeHarness(testTrack([],{start:{x:0,y:8.7,z},hammers:[hammer]}));
    h.b.hammerHitCd=.2;h.b.vz=-2;const before=h.state.timeLeft;
    h.step(1/hz);
    const head=h.dynamicMeshes.hammers[0].worldHead;
    assert(Math.hypot(h.b.x-head.x,h.b.y-head.y,h.b.z-head.z)>=1.54,'cooldown makes pendulum permeable');
    near(h.state.timeLeft,before-1/hz,'cooldown charges another penalty');
    assert.equal(h.state.pops,0);
  }
  return{cases:6};
});

check('v4 pendulum contacts preserve both the solid head and supporting tier floor',()=>{
  let contacts=0;
  for(const hz of [120,60,25])for(const height of [1.5,8,18,28])for(const cooldown of [false,true]){
    const platform={...flat,y:height},hammer={x:0,y:height+4,z:0,len:3.3,speed:0,amp:0,phase:0};
    const h=makeHarness(testTrack([platform],{start:{x:0,y:height+.62,z:.4},hammers:[hammer]}));
    h.b.grounded=true;h.b.supportPlatform=platform;if(cooldown)h.b.hammerHitCd=.2;h.step(1/hz);
    assert(h.b.y>=height+h.b.r-.00001,`${hz}Hz pendulum displacement drives ball below ${height}m supporting floor`);
    const head=h.dynamicMeshes.hammers[0].worldHead;assert(Math.hypot(h.b.x-head.x,h.b.y-head.y,h.b.z-head.z)>=h.b.r+.92-.00001,'floor correction embeds ball in pendulum head');
    assert(h.b.hammerHitCd>0,'fixture did not contact the pendulum');assert.equal(h.state.pops,0);contacts++;
  }
  return{contacts,rates:[120,60,25]};
});

// Reproduce the authoring frame (including its miter), then query the actual
// floor triangles. A normalized tangent offset would be wrong at clipped turns.
function routeLateralPoint(route, distance, lateral) {
  const data=courseMath.getRouteRibbonRows(route),d=Math.max(0,Math.min(data.distances.at(-1),distance));
  let i=0;while(i<data.distances.length-2&&data.distances[i+1]<d)i++;
  const fraction=(d-data.distances[i])/(data.distances[i+1]-data.distances[i]||1);
  const onRow=index=>{
    const sideWidth=lateral<0?data.leftWidths[index]:data.rightWidths[index];
    const column=data.columns/2+lateral/sideWidth*data.columns/2,j=Math.min(data.columns-1,Math.max(0,Math.floor(column))),u=column-j;
    const a=data.rows[index][j],b=data.rows[index][j+1];
    return{x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u};
  };
  const a=onRow(i),b=onRow(i+1),x=a.x+(b.x-a.x)*fraction,z=a.z+(b.z-a.z)*fraction;
  const floor=courseMath.nearestRouteSurface([route],x,z,Infinity);
  assert(floor,`${route.id}: lateral ${lateral}m leaves real floor at ${d}m`);
  return{x,y:floor.y,z};
}

check('v4.1 every mud field has a continuous sinusoidal whole-ball dry curve on its actual floor',()=>{
  let zones=0,contacts=0;
  const dryWidths=[];
  for(const [stageIndex,track] of TRACKS.entries()) {
    assert(track.routes.some(r=>r.slowZone),`${track.id}: no optional sticky skill challenge`);
    for(const route of track.routes) {
      assert(!['mud','honey'].includes(route.kind),`${track.id}/${route.id}: unavoidable full-width slowdown`);
      if(!route.slowZone)continue;zones++;
      assert(route.width>=5.6&&route.width<=6.4,`${track.id}/${route.id}: mud field width must be 5.6..6.4m`);
      const expected=mudSpecForStage(stageIndex,route.width),spec=route.slowZone;
      for(const key of ['routeHalfWidth','dryWidth','amplitude','phase'])near(spec[key],expected[key],`${track.id}/${route.id}: stage mud ${key}`);
      assert(spec.cycles>=1.5&&spec.cycles<=2.5,`${track.id}/${route.id}: continuous dry curve lacks authored sinusoidal cycles`);
      dryWidths.push(spec.dryWidth);
      const len=courseMath.polylineLength(route.points),samples=sampleDryCurvePoints(route,spec,120);
      let min=Infinity,max=-Infinity;
      for(let i=1;i<samples.length-1;i++) {
        const u=i/120,offset=evaluateDryCurveOffset(spec,u),p=samples[i];min=Math.min(min,offset);max=Math.max(max,offset);
        const center=courseMath.nearestRouteSurface([route],p.x,p.z,Infinity);
        assert(center,`${track.id}/${route.id}: dry curve floats off floor`);
        near(p.y-center.y,.06,`${track.id}/${route.id}: dry visual follows floor`,3e-5);
        for(const delta of [0,-spec.dryWidth/2+.04,spec.dryWidth/2-.04,-spec.dryWidth/2-.12,spec.dryWidth/2+.12]) {
          const q=routeLateralPoint(route,len*u,offset+delta),floor=courseMath.nearestRouteSurface([route],q.x,q.z,Infinity);
          assert.equal(floor.kind,Math.abs(delta)<spec.dryWidth/2?route.kind:spec.kind,`${track.id}/${route.id}[${i}]: wrong real material at dry offset ${delta}`);contacts++;
        }
      }
      assert(min<-.5&&max>.5,`${track.id}/${route.id}: dry skill line needs a continuous S turn`);
    }
  }
  near(Math.max(...dryWidths),1.85,'opening dry curve width');near(Math.min(...dryWidths),1.38,'final dry curve width');
  return{zones,contacts,dryWidths:[...new Set(dryWidths)]};
});

check('v4.1 zero authored stars stand over sticky floor, including curved mud fields',()=>{
  let stars=0,mudRouteStars=0;
  for(const track of TRACKS)for(const star of track.stars){
    const floor=courseMath.nearestRouteSurface(track.routes,star.x,star.z,star.y+.01);
    assert(floor,`${track.id}: star at ${star.x},${star.z} has no actual route floor`);
    assert(!['mud','honey'].includes(floor.kind),`${track.id}/${floor.route.id}: STAR IN ${floor.kind.toUpperCase()}`);
    if(floor.route.slowZone)mudRouteStars++;stars++;
  }
  assert(stars>0);assert(mudRouteStars>0,'no real dry-curve stars were exercised');
  return{stars,mudRouteStars,stickyFloorStars:0};
});

check('v4.1 lane hazards block real lanes while retaining at least 1.55m safe floor',()=>{
  let groups=0,hazards=0,twoLane=0,threeLane=0,minClearWidth=Infinity;
  const collisionKinds=new Set(),stageDensities=[],expectedCounts=[5,7,9,12,15,19,24,28,34,40];
  for(const [stageIndex,track] of TRACKS.entries()){
    assert(track.laneHazards?.length,`${track.id}: missing authored lane blockers`);
    assert.equal(track.laneHazards.length,expectedCounts[stageIndex],`${track.id}: stage-wide lane blocker count drift`);
    assert.deepEqual(track.difficultyProfile,difficultyProfileForStage(stageIndex),`${track.id}: difficulty profile drift`);
    const grouped=new Map(),stageKinds=new Set();
    for(const hazard of track.laneHazards){
      const colliders=hazard.kind==='spike'?track.spikes:hazard.kind==='pendulum'?track.hammers:hazard.kind==='bumper'?track.bumpers:hazard.kind==='critter'?track.props:[];
      assert(colliders.some(def=>def.id===hazard.id),`${track.id}/${hazard.id}: lane hazard is missing its real runtime collider`);
      collisionKinds.add(hazard.kind);stageKinds.add(hazard.kind);
      assert([-1,0,1].includes(hazard.laneSlot),`${track.id}/${hazard.id}: missing laneSlot`);
      assert(Number.isFinite(hazard.along)&&Number.isFinite(hazard.laneOffset),`${track.id}/${hazard.id}: missing longitudinal/lateral placement`);
      const route=track.routes.find(r=>r.id===hazard.routeId);assert(route,`${track.id}/${hazard.id}: missing lane route`);
      const bucket=grouped.get(route)||[];bucket.push(hazard);grouped.set(route,bucket);
    }
    for(const [route,defs] of grouped){
      const audit=auditLaneThreat(route,defs);assert(audit.ok,`${track.id}/${route.id}: ${audit.issues.join('; ')}`);
      assert(audit.minClearWidth>=MIN_SAFE_PASSING_WIDTH-1e-6,`${track.id}/${route.id}: sealed safe lane`);
      if(audit.laneCount===2){assert(route.width>=2.79&&route.width<=3.4);twoLane++;}
      else {assert.equal(audit.laneCount,3);assert(route.width>=4.2&&route.width<=4.6);threeLane++;}
      minClearWidth=Math.min(minClearWidth,audit.minClearWidth);groups++;hazards+=defs.length;
    }
    assert.deepEqual([...stageKinds].sort(),['bumper','critter','pendulum','spike'],`${track.id}: every stage needs all four real lane blocker kinds`);
    const measuredLength=track.routes.filter(route=>!route.secret).reduce((sum,route)=>sum+courseMath.polylineLength(route.points),0)+track.chutes.reduce((sum,chute)=>sum+courseMath.polylineLength(chute.points),0);
    const per100m=track.laneHazards.length/measuredLength*100,previous=stageDensities.at(-1);
    assert(!previous||per100m>previous.per100m+1e-6,`${track.id}: actual lane trap density ${per100m.toFixed(4)}/100m does not exceed ${previous?.track} ${previous?.per100m.toFixed(4)}/100m`);
    stageDensities.push({track:track.id,hazards:track.laneHazards.length,per100m});
  }
  assert(twoLane>0&&threeLane>0,'both two-lane and three-lane blockers must be authored');
  assert.deepEqual([...collisionKinds].sort(),['bumper','critter','pendulum','spike'],'missing real lane blocker collision kind');
  return{groups,hazards,twoLane,threeLane,minClearWidth,collisionKinds:[...collisionKinds].sort(),stageDensities};
});

check('v4.1 ten stages use their assigned distinct chute styles with signed banking',()=>{
  const styles=['rollercoaster','banked_slalom','rollercoaster','helix','helix','corkscrew_drop','rollercoaster','banked_slalom','corkscrew_drop','corkscrew_drop'];
  let chutes=0;
  for(const [i,track] of TRACKS.entries()){
    assert(track.chutes.length,`${track.id}: missing styled chute`);
    for(const chute of track.chutes){
      assert(CHUTE_STYLES.includes(chute.style));assert.equal(chute.style,styles[i],`${track.id}/${chute.id}: wrong stage chute style`);
      assert.equal(chute.bankProfile.length,chute.points.length,'bank profile must match real rail samples');
      assert(chute.bankProfile.every(bank=>Number.isFinite(bank)&&Math.abs(bank)<=.65),'chute bank roll exceeds safe authored bounds');
      if(chute.style!=='helix')assert(chute.bankProfile.some(bank=>Math.abs(bank)>.05),'styled chute has no visible signed banking');
      chutes++;
    }
  }
  return{chutes,styles};
});

check('v4 clipped asymmetric turns retain a real 1.5m dry skill lane on either edge',()=>{
  let contacts=0;
  for(const drySide of [-1,1]){
    const route={id:`asymmetric-dry-${drySide}`,kind:'wood',width:6,points:[{x:0,y:8,z:8},{x:0,y:8,z:1},{x:1,y:8,z:0},{x:8,y:8,z:0}],slowZone:{kind:'honey',drySide,dryWidth:1.5}};
    const data=courseMath.getRouteRibbonRows(route);
    assert(data.leftWidths.some((width,i)=>Math.abs(width-data.rightWidths[i])>1),'fixture did not exercise asymmetric inner-corner clipping');
    for(const index of [1,2]){
      const row=data.rows[index],edge=row[drySide===1?data.columns:0],opposite=row[drySide===1?0:data.columns],width=Math.hypot(opposite.x-edge.x,opposite.z-edge.z);
      for(const inset of [.13,.75,1.37,1.7]){
        const fraction=inset/width,x=edge.x+(opposite.x-edge.x)*fraction,z=edge.z+(opposite.z-edge.z)*fraction;
        const surface=courseMath.nearestRouteSurface([route],x,z,Infinity);assert(surface,'clipped turn lost a legal lane position');
        assert.equal(surface.kind,inset<1.5?'wood':'honey',`${drySide} edge clipped turn misclassifies ${inset}m skill lane inset`);contacts++;
      }
    }
  }
  return{contacts,dryWidth:1.5};
});

check('rolling pin elastic rebound and contact cooldown', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const pin = { x: 0, y: 8.55, z: 0, width: 4, r: 0.48, speed: 1.3, phase: 0, ampZ: 0 };
    const fixture = testTrack([flat], { start: { x: 0, y: 8.62, z: 0.85 }, rollingPins: [pin] });
    const hit = makeHarness(fixture);
    hit.b.vz = -4;
    hit.step(dt);
    assert(hit.b.vz > 2, `dt=${dt}: pin did not reverse incoming velocity: ${hit.b.vz}`);
    assert(hit.b.rollingPinHitCd > 0.1, `dt=${dt}: pin contact has no cooldown`);
    assert.equal(hit.state.pops, 0, `dt=${dt}: pin contact popped the bubble`);
    assert(Math.hypot(hit.b.vx, hit.b.vz) <= 15.21, `dt=${dt}: pin bypassed burst speed cap`);
    const protectedContact = makeHarness(fixture);
    protectedContact.b.vz = -4;
    protectedContact.b.rollingPinHitCd = 0.2;
    protectedContact.step(dt);
    assert(protectedContact.b.vz < -3, `dt=${dt}: pin reapplied impulse during cooldown`);
    assert(Math.abs(protectedContact.b.rollingPinHitCd - (0.2 - dt)) < 1e-8, `dt=${dt}: pin cooldown does not count down in seconds`);
    const readyContact = makeHarness(fixture);
    readyContact.b.vz = -4; readyContact.b.rollingPinHitCd = dt * 0.5; readyContact.step(dt);
    assert(readyContact.b.vz > 2, `dt=${dt}: expired pin cooldown still blocks collision`);
    const miss = makeHarness(testTrack([flat], { start: { x: 3.5, y: 8.62, z: 0.85 }, rollingPins: [pin] }));
    miss.b.vz = -4; miss.step(dt);
    assert(miss.b.vz < -3 && miss.b.rollingPinHitCd === 0, `dt=${dt}: pin hits outside its cylinder span`);
    receipts.push({ dt, reboundVz: +hit.b.vz.toFixed(4), cooldown: +hit.b.rollingPinHitCd.toFixed(4) });
  }
  return { receipts };
});

check('rolling pin collider follows its animated body', () => {
  const pin = { x: 0, y: 8.55, z: -2, width: 4, speed: 1.3, phase: 0.2, ampZ: 1.1 };
  const h = makeHarness(testTrack([flat], { start: { x: 5, y: 8.62, z: 0 }, rollingPins: [pin] }));
  h.state.elapsed = 0.5;
  h.step(1 / 60);
  const expectedZ = -2 + Math.sin((0.5 + 1 / 60) * 1.3 + 0.2) * 1.1;
  assert(Math.abs(h.dynamicMeshes.rollingPins[0].mesh.position.z - expectedZ) < 1e-8,
    'Rolling pin body does not follow the level sine movement');
  const contact = makeHarness(testTrack([flat], { start: { x: 0, y: 8.62, z: expectedZ + 0.85 }, rollingPins: [pin] }));
  contact.state.elapsed = 0.5; contact.b.vz = -4; contact.step(1 / 60);
  assert(contact.b.vz > 2 && contact.b.rollingPinHitCd > 0, 'Rolling pin collision stayed at its original definition instead of following animation');
  return { animatedZ: +h.dynamicMeshes.rollingPins[0].mesh.position.z.toFixed(4), reboundVz: +contact.b.vz.toFixed(4) };
});

check('rolling pin finite endcaps leave the visible side lane clear', () => {
  const pin = { x: 0, y: 8.55, z: 0, width: 4, speed: 1.3, phase: 0, ampZ: 0 };
  const clear = makeHarness(testTrack([flat], { start: { x: 2.64, y: 8.62, z: 0 }, rollingPins: [pin] }));
  clear.step(1 / 60);
  assert.equal(clear.b.rollingPinHitCd, 0, 'Pin collider extends past finite barrel endcap into the side lane');
  assert(Math.hypot(clear.b.vx, clear.b.vz) < 0.001, 'Pin knocks a ball outside its finite endcap');
  const hit = makeHarness(testTrack([flat], { start: { x: 2.5, y: 8.62, z: 0 }, rollingPins: [pin] }));
  hit.b.vx = -3; hit.step(1 / 60);
  assert(hit.b.vx > 0 && hit.b.rollingPinHitCd > 0, 'Finite barrel endcap fails to rebound an overlapping ball');
  return { clearanceX: clear.b.x, endcapRebound: +hit.b.vx.toFixed(4) };
});

check('bumper radial elastic rebound and contact cooldown', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) for (const side of [-1, 1]) {
    const bumper = { x: 0, y: 8, z: 0, r: 0.9, bounce: 6 };
    const fixture = testTrack([flat], { start: { x: side * 1.3, y: 8.62, z: 0 }, bumpers: [bumper] });
    const hit = makeHarness(fixture);
    hit.b.vx = -side * 4;
    hit.step(dt);
    assert(side * hit.b.vx > 3, `dt=${dt} side=${side}: bumper did not bounce radially: ${hit.b.vx}`);
    assert(Math.abs(hit.b.vz) < 0.1, `dt=${dt} side=${side}: radial impact adds unrelated sideways force`);
    assert(hit.b.bumperHitCd > 0.1, `dt=${dt}: bumper contact has no cooldown`);
    assert.equal(hit.state.pops, 0);
    const protectedContact = makeHarness(fixture);
    protectedContact.b.vx = -side * 4;
    protectedContact.b.bumperHitCd = 0.2;
    protectedContact.step(dt);
    assert(Math.abs(protectedContact.b.vx)<.001, `dt=${dt}: bumper cooldown should cancel inward penetration without another kick`);
    assert(Math.hypot(protectedContact.b.x-bumper.x,protectedContact.b.z-bumper.z)>=bumper.r+protectedContact.b.r, 'cooldown removes solid bumper body');
    assert.equal(protectedContact.dynamicMeshes.bumpers[0].pulse,0,'cooldown repeats boing feedback');
    assert(Math.abs(protectedContact.b.bumperHitCd - (0.2 - dt)) < 1e-8, `dt=${dt}: bumper cooldown does not count down in seconds`);
    const readyContact = makeHarness(fixture);
    readyContact.b.vx = -side * 4; readyContact.b.bumperHitCd = dt * 0.5; readyContact.step(dt);
    assert(side * readyContact.b.vx > 3, `dt=${dt}: expired bumper cooldown still blocks collision`);
    receipts.push({ dt, side, reboundVx: +hit.b.vx.toFixed(4), cooldown: +hit.b.bumperHitCd.toFixed(4) });
  }
  return { receipts };
});

check('steam vent active and inactive phases with smooth acceleration', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const vent = { x: 0, y: 8, z: 0, r: 1.1, period: 3, duty: 0.5, vy: 7.5, vz: -6 };
    const fixture = testTrack([flat], { steamVents: [vent] });
    const active = makeHarness(fixture);
    active.step(dt);
    const firstVy = active.b.vy;
    assert(active.b.vy > 0 && active.b.vy <= 44 * dt + 1e-8, `dt=${dt}: active vent must accelerate smoothly, vy=${active.b.vy}`);
    assert(active.b.vz < 0 && Math.abs(active.b.vz) <= 20 * dt + 1e-8, `dt=${dt}: active vent forward boost is an instant kick: ${active.b.vz}`);
    assert(!active.b.grounded, `dt=${dt}: active vent did not lift the ball`);
    assert(active.dynamicMeshes.steamVents[0].active, `dt=${dt}: active plume state not updated by physics`);
    let peakVy = active.b.vy;
    for (let t = dt; t < 0.45; t += dt) {
      active.step(dt);
      peakVy = Math.max(peakVy, active.b.vy);
      assert(active.b.vy <= vent.vy + 1e-8, `dt=${dt}: vent stacks vertical impulses above target`);
    }
    assert(peakVy > 3 && active.b.z < -0.5, `dt=${dt}: active vent provides no sustained lift and forward motion`);
    assert.equal(active.state.pops, 0);
    const inactive = makeHarness(fixture);
    inactive.state.elapsed = 2;
    for (let t = 0; t < 0.3; t += dt) inactive.step(dt);
    assert(inactive.b.grounded && Math.abs(inactive.b.y - 8.62) < 0.001, `dt=${dt}: inactive vent lifts the ball`);
    assert(Math.hypot(inactive.b.vx, inactive.b.vz) < 0.001 && inactive.b.boostFlash === 0, `dt=${dt}: inactive vent boosts the ball`);
    assert(!inactive.dynamicMeshes.steamVents[0].active);
    const fast = makeHarness(fixture);
    fast.b.vz = -9; fast.step(dt);
    assert(fast.b.vz < -8.8, `dt=${dt}: vent brakes faster forward travel`);
    const overhead = makeHarness(testTrack([flat], { start: { x: 0, y: 12.62, z: 0 }, steamVents: [vent] }));
    overhead.step(dt);
    assert(overhead.b.vy < 0 && Math.abs(overhead.b.vz) < 0.001, `dt=${dt}: plume boosts ball outside its height range`);
    receipts.push({ dt, firstVy: +firstVy.toFixed(4), peakVy: +peakVy.toFixed(4), forwardZ: +active.b.z.toFixed(4) });
  }
  return { receipts };
});

check('v3.1 full uphill input stalls at16deg while momentum and boosts climb', () => {
  const receipts=[];
  for(const dt of [1/120,1/60,1/25]) {
    const slope=Math.tan(16*Math.PI/180), ramp={kind:'ramp',x:0,y:8,z:-14,w:12,d:28,h:.8,yStart:8,yEnd:8+28*slope,dir:'-z'};
    let idle;const rollback=[];
    for(const cat of CATS){
      const h=makeHarness(testTrack([ramp],{start:{x:0,y:8+7*slope+.62,z:-7},cameraZones:[{type:'orbit',x:0,y:8,z:-7,r:100}]}),cat);
      h.b.grounded=true;h.b.supportPlatform=ramp;h.b.surfaceKind='ramp';h.state.input.keys.add('KeyW');
      for(let t=0;t<2;t+=dt)h.step(dt);
      assert(h.b.z>-6.7 && h.b.vz>.4,`dt=${dt}:${cat.id}:W powers uphill from rest z=${h.b.z},vz=${h.b.vz}`);
      rollback.push({cat:cat.id,vz:+h.b.vz.toFixed(3)});if(!idle)idle=h;
    }
    const approach={kind:'wood',x:0,y:8,z:7,w:12,d:14,h:.8};
    const run=makeHarness(testTrack([approach,ramp],{start:{x:0,y:8.62,z:10}}));
    for(let t=0;t<9 && run.b.z>-10;t+=dt)run.step(dt,0,-18,18);
    assert(run.b.z<-10,`dt=${dt}:ordinary approach momentum cannot climb16deg z=${run.b.z}`);
    const boost=makeHarness(testTrack([ramp],{start:{x:0,y:8+3*slope+.62,z:-3},boosts:[{x:0,y:8+3*slope,z:-3,w:3,d:2,fx:0,fz:-18}]}));
    for(let t=0;t<4 && boost.b.z>-11;t+=dt)boost.step(dt,0,-18,18);
    assert(boost.b.z<-11,`dt=${dt}:boost cannot climb16deg z=${boost.b.z}`);
    receipts.push({hz:Math.round(1/dt),restZ:+idle.b.z.toFixed(3),restVz:+idle.b.vz.toFixed(3),rollback,momentumZ:+run.b.z.toFixed(3),boostZ:+boost.b.z.toFixed(3)});
  }
  return{receipts};
});

check('v3.1 motor slope threshold lies between11and13deg',()=>{
  const receipts=[];
  for(const degrees of [11,12,13,16]) {
    const slope=Math.tan(degrees*Math.PI/180),ramp={kind:'ramp',x:0,y:8,z:0,w:20,d:100,h:.8,yStart:8-50*slope,yEnd:8+50*slope,dir:'-z'};
    const h=makeHarness(testTrack([ramp]));h.b.grounded=true;h.b.supportPlatform=ramp;h.b.surfaceKind='ramp';
    for(let t=0;t<3;t+=1/120)h.step(1/120,0,-18,18);
    if(degrees===11)assert(h.b.z<-.4 && h.b.vz<-.2,'motor cannot climb a gentle11deg ramp');
    if(degrees>=13)assert(h.b.z>=-.02,'motor bypasses the intended13deg stall threshold');
    receipts.push({degrees,z:+h.b.z.toFixed(3),vz:+h.b.vz.toFixed(3)});
  }
  return{receipts};
});

check('v3.1 materials preserve distinct rolling, ice drift and viscous drag',()=>{
  const receipts=[];
  for(const kind of ['carpet','grass','wood','stone','ice','honey','mud']) {
    const floor={...flat,kind},h=makeHarness(testTrack([floor]));
    for(let t=0;t<3;t+=1/120)h.step(1/120,0,-18,18);
    const drivenSpeed=Math.hypot(h.b.vx,h.b.vz);
    for(let t=0;t<1;t+=1/120)h.step(1/120);
    const coastSpeed=Math.hypot(h.b.vx,h.b.vz),beforeTurnZ=h.b.z;
    for(let t=0;t<1;t+=1/120)h.step(1/120,18,0,18);
    receipts.push({kind,drivenSpeed:+drivenSpeed.toFixed(3),coastLoss:+(drivenSpeed-coastSpeed).toFixed(3),drift:+(beforeTurnZ-h.b.z).toFixed(3)});
  }
  const of=k=>receipts.find(r=>r.kind===k);
  assert(of('carpet').coastLoss>of('grass').coastLoss+.25,'carpet does not feel heavier than grass');
  assert(of('grass').coastLoss>of('wood').coastLoss+.35,'grass has no extra rolling resistance');
  assert(of('stone').coastLoss>of('wood').coastLoss+.12,'stone and wood have identical rolling');
  assert(of('ice').drift>of('wood').drift*1.8,'ice lateral drift is not distinct');
  for(const k of ['honey','mud'])assert(of(k).drivenSpeed<of('wood').drivenSpeed*.35,`${k} lacks viscous drag`);
  return{receipts};
});

check('v3.1 brief reverse input microbrakes a narrow beam without reversing',()=>{
  const route={id:'beam',kind:'wood',width:1.8,walls:false,points:[{x:0,y:8,z:0},{x:0,y:8,z:-70}]};
  const fixture=testTrack([],{routes:[route]});
  const coast=makeHarness(fixture),brake=makeHarness(fixture);
  for(let i=0;i<180;i++){coast.step(1/120,0,-18,18);brake.step(1/120,0,-18,18);}
  const before=Math.abs(brake.b.vz);
  for(let i=0;i<18;i++){coast.step(1/120);brake.step(1/120,0,4.5,18);}
  assert(brake.b.vz<0 && brake.b.grounded,'a short brake tap reverses or unseats the ball');
  assert(Math.abs(brake.b.vz)<Math.abs(coast.b.vz)-.2,'partial reverse input has no useful microbraking effect');
  assert(Math.abs(brake.b.vz)>before*.75,'partial brake tap erases too much momentum');
  assert(Math.abs(brake.b.x)<.01,'beam microbrake introduces lateral motion');
  return{before:+before.toFixed(3),coastSpeed:+Math.abs(coast.b.vz).toFixed(3),brakedSpeed:+Math.abs(brake.b.vz).toFixed(3)};
});

check('v3.1 shared tangent integration conserves bank momentum and soft landings',()=>{
  const b={vx:4,vy:0,vz:6,grounded:true,rollSlopeX:0,rollSlopeZ:0};
  const initial=Math.hypot(b.vx,b.vz),surface={kind:'ice',slopeX:.4,slopeZ:0};
  runtimeApi.integrateRollingMotion(b,surface,0,0,1e-7,CATS[0].stats);
  assert(Math.abs(runtimeApi.rollingSurfaceSpeed(b,surface)-initial)<.00001,'bank tangent kinetic speed');
  const stone={vx:3,vy:-8,vz:-2},carpet={...stone};
  const hard=runtimeApi.resolveRollingLanding(stone,{kind:'stone',slopeX:0,slopeZ:0}),soft=runtimeApi.resolveRollingLanding(carpet,{kind:'carpet',slopeX:0,slopeZ:0});
  assert.equal(stone.vx,3,'landing preserves tangent X');assert.equal(stone.vz,-2,'landing preserves tangent Z');
  assert(hard.rebound>.3 && hard.rebound<.8,'stone landing has no subtle restitution');
  assert(soft.grounded && carpet.vy===0,'carpet landing should absorb the impact');
  return{bankSpeed:runtimeApi.rollingSurfaceSpeed(b,surface),stoneRebound:hard.rebound,carpetRebound:soft.rebound};
});

check('flat speed under sustained drive', () => {
  const receipts = [];
  for (const cat of CATS) {
    const h = makeHarness(testTrack([flat]), cat);
    let peak = 0, atOneSecond = 0;
    for (let i = 0; i < 720; i++) {
      h.step(1 / 60, 0, -180); peak = Math.max(peak, Math.hypot(h.b.vx, h.b.vz));
      if (i === 59) atOneSecond = Math.hypot(h.b.vx, h.b.vz);
    }
    const limit = 10.2 * cat.stats.topSpeed;
    assert(atOneSecond>2.6 && atOneSecond<4.7, `${cat.id}:motor fails weighted one-second acceleration ${atOneSecond}`);
    assert(Math.hypot(h.b.vx,h.b.vz)>limit*.9 && Math.hypot(h.b.vx,h.b.vz)<=limit,`${cat.id}:sustained mouse drive did not approach torque-limited cruise`);
    receipts.push({ cat: cat.id, peak: +peak.toFixed(4), atOneSecond: +atOneSecond.toFixed(4), limit: +limit.toFixed(4) });
  }
  console.log(JSON.stringify({ flatSpeedReceipt: receipts }));
  for (const r of receipts) assert(r.peak <= r.limit + 0.01, `${r.cat}: ${r.peak} exceeds ${r.limit}`);
  return { cats: receipts.length };
});

check('keyboard flat speed', () => {
  const h = makeHarness(testTrack([flat]));
  h.state.input.keys.add('KeyW');
  let peak = 0, atOneSecond = 0;
  for (let i = 0; i < 720; i++) {
    h.step(1 / 60); peak = Math.max(peak, Math.hypot(h.b.vx, h.b.vz));
    if (i === 59) atOneSecond = Math.hypot(h.b.vx, h.b.vz);
  }
  assert(peak <= 10.21, `Keyboard speed ${peak} exceeds cruise`);
  assert(atOneSecond>2.6 && atOneSecond<4.2,'keyboard motor must accelerate with weight');
  assert(Math.hypot(h.b.vx,h.b.vz)>9.2 && Math.hypot(h.b.vx,h.b.vz)<=10.2,'sustained keyboard drive did not approach cruise');
  const mixed = makeHarness(testTrack([flat]));
  mixed.state.input.keys.add('KeyW');
  for (let i = 0; i < 720; i++) mixed.step(1 / 60, 0, -180);
  const mixedSpeed = Math.hypot(mixed.b.vx, mixed.b.vz);
  assert(mixedSpeed>9.2 && mixedSpeed<=10.2, `Combined keyboard+mouse speed ${mixedSpeed}`);
  return { peak: +peak.toFixed(4), atOneSecond: +atOneSecond.toFixed(4), mixedSpeed: +mixedSpeed.toFixed(4) };
});

check('boost cap and force-driven momentum decay with sustained input', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const h = makeHarness(testTrack([flat], { boosts: [{ x: 0, y: 8.05, z: 0, w: 3, d: 2, fx: 0, fz: -100 }] }));
    let peak = 0, effectEnd = null, settled = null;
    for (let t = 0; t < 3; t += dt) {
      h.step(dt, 0, -180);
      const speed = Math.hypot(h.b.vx, h.b.vz);
      peak = Math.max(peak, speed);
      if (h.b.boostFlash <= 0 && Math.abs(h.b.z) > 1.62 && effectEnd === null) effectEnd = h.state.elapsed;
      if (effectEnd !== null && h.state.elapsed - effectEnd >= 0.6 + dt && settled === null) settled = speed;
    }
    assert(peak <= 15.21, `dt=${dt}: boost speed ${peak} exceeds burst cap`);
    assert(settled !== null && settled > 10.4 && settled <= 15.21, `dt=${dt}: boost momentum is artificially erased instead of coasting: ${settled}`);
    receipts.push({ dt, peak: +peak.toFixed(4), effectEnd: +effectEnd.toFixed(4), settled: +settled.toFixed(4) });
  }
  return { receipts };
});

check('downhill gravity and burst cap without drive', () => {
  const p = { kind: 'ramp', x: 0, y: 25, z: -40, w: 20, d: 80, h: 0.8, yStart: 50, yEnd: 0, dir: '-z' };
  const h = makeHarness(testTrack([p, { ...flat, y: 0, z: -240, w: 20, d: 320 }], { start: { x: 0, y: 50.62, z: 0 } }));
  h.b.vz = -0.5;
  let peak = 0, speedAtTwoSeconds = 0;
  for (let i = 0; i < 20 * 120; i++) {
    h.step(1 / 120);
    const speed = Math.hypot(h.b.vx, h.b.vz);
    peak = Math.max(peak, speed);
    if (i === 239) speedAtTwoSeconds = speed;
  }
  assert(speedAtTwoSeconds > 8, `Coasting down slope did not accelerate: ${speedAtTwoSeconds}`);
  assert(peak <= 15.21, `Downhill exceeds burst cap: ${peak}`);
  assert(h.b.z < -80 && Math.hypot(h.b.vx, h.b.vz) <= 10.21, 'Downhill burst does not settle on flat landing');
  assert.equal(h.state.pops, 0);
  return { speedAtTwoSeconds: +speedAtTwoSeconds.toFixed(4), peak: +peak.toFixed(4), endZ: +h.b.z.toFixed(4) };
});

check('trough curved floor and centering', () => {
  const p = { kind: 'trough', x: 0, y: 8, z: 0, w: 6, d: 100, h: 0.8 };
  const h = makeHarness(testTrack([p], { start: { x: 1.7, y: 8.62 + 0.6 * (1.7 / 3) ** 2, z: 0 } }));
  h.b.grounded = true; h.b.surfaceKind = 'trough'; h.b.supportPlatform = p;
  const center = h.context.sampleTrackSurface(0, 8.62, 0, 0.62);
  const bank = h.context.sampleTrackSurface(1.7, h.b.y, 0, 0.62);
  assert(Math.abs(center.y - 8) < 1e-8);
  assert(bank.y > center.y + 0.15 && bank.slopeX > 0);
  let enteredCenter = false, maxFloorError = 0;
  for (let i = 0; i < 600; i++) {
    h.step(1 / 120);
    if (Math.abs(h.b.x) < 0.3) enteredCenter = true;
    const floorY = 8 + 0.6 * (h.b.x / 3) ** 2;
    maxFloorError = Math.max(maxFloorError, Math.abs(h.b.y - h.b.r - floorY));
  }
  assert(enteredCenter, 'Bank gravity did not bring ball through trough center');
  assert(maxFloorError < 0.02, `Trough contact clips floor by ${maxFloorError}`);
  return { endX: +h.b.x.toFixed(4), maxFloorError: +maxFloorError.toFixed(6) };
});

check('trough solid rails both sides at variable dt', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) for (const side of [-1, 1]) {
    const p = { kind: 'trough', x: 0, y: 8, z: 0, w: 6, d: 100, h: 0.8 };
    const h = makeHarness(testTrack([p]));
    h.b.grounded = true; h.b.surfaceKind = 'trough'; h.b.supportPlatform = p;
    let maxX = 0, bounced = false;
    for (let t = 0; t < 2; t += dt) {
      h.step(dt, side * 180, 0);
      maxX = Math.max(maxX, Math.abs(h.b.x));
      if (side * h.b.vx < -0.5) bounced = true;
    }
    assert(maxX <= 3 - h.b.r + 0.001, `dt=${dt} side=${side}: tunneled trough rail at${maxX}`);
    assert(bounced, `dt=${dt} side=${side}: no outward rail rebound`);
    assert.equal(h.state.pops, 0);
    receipts.push({ dt, side, maxX: +maxX.toFixed(4), bounced });
  }
  return { receipts };
});

check('Zero-Pinch / No-Trap: actual boundary rails leave a clear corridor through all ten stages',()=>{
  const stages=[];
  for(const track of TRACKS) {
    let segments=0,guardedLength=0,authoredLength=0,minClearance=Infinity,minMeasuredWidth=Infinity,stations=0,minAllRowWidth=Infinity,rowsChecked=0;
    // Check every real row, including unguarded roads and seam openings where
    // no finite rail segment exists for the collision audit below.
    for(const route of track.routes){
      const data=courseMath.getRouteRibbonRows(route);
      for(let i=0;i<data.rows.length;i++){
        const width=data.leftWidths[i]+data.rightWidths[i];minAllRowWidth=Math.min(minAllRowWidth,width);rowsChecked++;
        assert(width>=2.84-1e-5,`${track.id}/${route.id}/${i}: actual floor row pinches to ${width.toFixed(3)}m`);
      }
    }
    const stageRails=track.routes.filter(r=>r.walls).flatMap(r=>courseMath.getRibbonBoundarySegments(r));
    for(const route of track.routes.filter(r=>r.walls)) {
      const rails=courseMath.getRibbonBoundarySegments(route),data=courseMath.getRouteRibbonRows(route);
      authoredLength+=courseMath.polylineLength(route.points);
      for(const edge of rails) {
        const i=edge.index,start=edge.start??0,end=edge.end??1;
        for(const t of [start,(start+end)/2,end]) {
          const left=data.leftWidths[i]*(1-t)+data.leftWidths[i+1]*t;
          const right=data.rightWidths[i]*(1-t)+data.rightWidths[i+1]*t;
          const clear=left+right;minClearance=Math.min(minClearance,clear);
          assert(clear>=2.84-1e-5,`${track.id}/${route.id}/${i}: actual guarded corridor pinches to ${clear.toFixed(3)}m`);
        }
        segments++;guardedLength+=Math.hypot(edge.b.x-edge.a.x,edge.b.z-edge.a.z)/2;
        const peers=track.routes.filter(other=>other!==route && other.points.some((p,j)=>[0,other.points.length-1].includes(j) && [route.points[0],route.points.at(-1)].some(q=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<1e-5)));
        for(const fraction of [.001,.25,.5,.75,.999]) {
          const p={x:edge.a.x+(edge.b.x-edge.a.x)*fraction,y:edge.a.y+(edge.b.y-edge.a.y)*fraction,z:edge.a.z+(edge.b.z-edge.a.z)*fraction};
          const inside=courseMath.nearestRouteSurface(peers,p.x+edge.nx*.025,p.z+edge.nz*.025,p.y+.15);
          assert(!inside || Math.abs(inside.y-p.y)>.15,`${track.id}/${route.id}: rail blocks connected floor at seam ${i}/${fraction}`);
        }
      }
      assert(rails.length>0,`${track.id}/${route.id}: guarded route lost every rail`);
      // Independently raycast every row and mid-row normal against the actual
      // finite rails, including other routes at this floor elevation. This
      // catches diagonal/miter and neighbouring-route traps hidden by widths.
      for(let i=0;i<route.points.length-1;i++)for(const fraction of [0,.5,1]) {
        const a=route.points[i],b=route.points[i+1],p={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,z:a.z+(b.z-a.z)*fraction};
        let nx=data.frames[i].nx*(1-fraction)+data.frames[i+1].nx*fraction,nz=data.frames[i].nz*(1-fraction)+data.frames[i+1].nz*fraction;
        const norm=Math.hypot(nx,nz);nx/=norm;nz/=norm;let left=Infinity,right=Infinity;
        for(const edge of stageRails) {
          const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,den=nx*dz-nz*dx;
          if(Math.abs(den)<1e-8)continue;
          const ax=edge.a.x-p.x,az=edge.a.z-p.z,distance=(ax*dz-az*dx)/den,u=(ax*nz-az*nx)/den;
          if(u< -1e-6||u>1+1e-6||Math.abs(edge.a.y+(edge.b.y-edge.a.y)*u-p.y)>1.25)continue;
          if(distance<0)left=Math.min(left,-distance);else right=Math.min(right,distance);
        }
        if(Number.isFinite(left+right)) {
          minMeasuredWidth=Math.min(minMeasuredWidth,left+right);stations++;
          assert(left+right>=2*.62+1.2-1e-5,`${track.id}/${route.id}/${i}: finite opposing rails trap the ball in ${(left+right).toFixed(3)}m`);
        }
      }
    }
    assert(segments>0&&stations>0);stages.push({track:track.id,segments,stations,rowsChecked,minAllRowWidth:+minAllRowWidth.toFixed(3),minClearWidth:+minClearance.toFixed(3),minMeasuredWidth:+minMeasuredWidth.toFixed(3),guardedLength:+guardedLength.toFixed(1),authoredLength:+authoredLength.toFixed(1)});
  }
  assert.equal(stages.length,10);return{stages};
});

check('guardrail impacts retain tangential travel without vertical energy or rail-top support', () => {
  const receipts=[];
  for(const hz of [120,60,25]) for(const side of [-1,1]) for(const speed of [2.5,7,14]) for(const degrees of [10,35,65]) {
    const dt=1/hz, angle=degrees*Math.PI/180;
    const route={id:'flat-guard-test',kind:'wood',width:8,walls:true,bank:0,points:[{x:0,y:8,z:30},{x:0,y:8,z:-100}]};
    const vx=side*speed*Math.sin(angle),vz=-speed*Math.cos(angle);
    const start={x:side*(4-.62-Math.abs(vx)*dt*.4),y:8.62,z:0};
    const hit=makeHarness(testTrack([],{routes:[route],start}));
    const clearRoute={...route,walls:false};
    const free=makeHarness(testTrack([],{routes:[clearRoute],start}));
    for(const h of [hit,free]) {h.b.grounded=true;h.b.supportRoute=h===hit?route:clearRoute;h.b.vx=vx;h.b.vz=vz;h.b.surfaceKind='wood';}
    free.step(dt);hit.step(dt);
    const restitution=-hit.b.vx/free.b.vx,retention=hit.b.vz/free.b.vz;
    assert(restitution>=.15 && restitution<=.20,`${hz}Hz ${speed}m/s ${degrees}deg: guard restitution ${restitution}, want .15..20`);
    assert(Math.abs(retention-.94)<1e-7,`${hz}Hz: guard scrubs tangential motion by ${retention}, want .94`);
    assert(Math.abs(hit.b.x)<=3.38+1e-6,`${hz}Hz: center escaped halfWidth-radius`);
    assert(hit.b.grounded && hit.b.supportRoute===route,'rail graze lost floor support');
    assert(Math.abs(hit.b.vy)<.08 && Math.abs(hit.b.y-8.62)<.08,'rail graze added height/vertical velocity');
    assert.equal(hit.state.pops,0);
    receipts.push({hz,side,speed,degrees,restitution:+restitution.toFixed(3),tangentialRetention:+retention.toFixed(3)});
  }
  return {cases:receipts.length,restitution:receipts[0].restitution,tangentialRetention:receipts[0].tangentialRetention};
});

check('horizontal guardrail response preserves vertical state and resting tangential speed',()=>{
  assert.equal(typeof runtimeApi.resolveHorizontalGuardrail,'function');
  const hit={x:4,z:2,y:8.62,vx:5,vz:-7,vy:-.9,r:.62,grounded:true};
  runtimeApi.resolveHorizontalGuardrail(hit,1,0,.62);
  assert(Math.abs(hit.x-3.38)<1e-9 && hit.z===2,'guardrail correction is not horizontal');
  assert(Math.abs(hit.vx+.9)<1e-9 && Math.abs(hit.vz+6.58)<1e-9,'guardrail response loses normal/tangential contract');
  assert.equal(hit.y,8.62);assert.equal(hit.vy,-.9);assert.equal(hit.grounded,true);
  const resting={x:3.39,z:0,y:8.62,vx:.04,vz:-4,vy:.75,r:.62,grounded:true};
  for(let frame=0;frame<240;frame++) {
    resting.x=3.39;resting.vx=.04;
    runtimeApi.resolveHorizontalGuardrail(resting,1,0,.01);
  }
  assert.equal(resting.vx,0,'resting contact chatters inward');
  assert.equal(resting.vz,-4,'resting contact repeatedly damps forward movement');
  assert.equal(resting.y,8.62);assert.equal(resting.vy,.75);
  return{impactRestitution:.18,tangentialRetention:.94,restingFrames:240};
});

check('opposing guard contacts recover along the route centerline instead of pinning the ball',()=>{
  const route={id:'malformed-overlap-regression',kind:'wood',width:4,walls:true,points:[{x:0,y:8,z:12},{x:0,y:8,z:0},{x:3.5,y:8,z:0},{x:3.5,y:8,z:12}]};
  const b={x:1.75,y:8.62,z:8,r:.62,vx:0,vy:0,vz:-.1,grounded:true,routeTangent:{x:0,z:-1}};
  runtimeApi.collideRouteGuardrails(b,route,b.x,b.z);
  assert(b.guardRecoveryCount>0,'opposing rail contacts did not invoke runtime recovery');
  const centerDistance=Math.min(Math.abs(b.x),Math.abs(b.x-3.5));
  assert(centerDistance<1e-6,'pinch recovery failed to return to a route centerline');
  assert(Math.hypot(b.vx,b.vz)>=1.8-1e-8,'pinch recovery leaves the ball motionless');
  const count=b.guardRecoveryCount;
  for(let frame=0;frame<120;frame++){const x=b.x,z=b.z;b.x+=b.vx/120;b.z+=b.vz/120;runtimeApi.collideRouteGuardrails(b,route,x,z);}
  assert.equal(b.guardRecoveryCount,count,'centerline recovery immediately re-enters the trap');
  return{recoveries:count,centerDistance,speed:Math.hypot(b.vx,b.vz)};
});

check('flat, sloped and curved guardrail grazing stays grounded without sticking or jitter', () => {
  const receipts=[];
  for(const shape of ['flat','sloped','curved']) for(const hz of [120,60,25]) for(const side of [-1,1]) for(const speed of [2.5,7,14]) for(const degrees of [10,35,65]) {
    const dt=1/hz, angle=degrees*Math.PI/180;
    const points=Array.from({length:31},(_,i)=>{const z=30-i*5,x=shape==='curved'?12*Math.sin(i/12):0;return{x,y:shape==='flat'?8:8+.11*x-.13*z,z};});
    const route={id:`${shape}-graze`,kind:'wood',width:8,walls:true,bank:shape==='curved'?.22:0,points};
    const edge=courseMath.getRibbonBoundarySegments(route).find(e=>e.index===5 && e.side===side);
    const start={x:(edge.a.x+edge.b.x)/2-edge.nx*(.62+.012),z:(edge.a.z+edge.b.z)/2-edge.nz*(.62+.012)};
    const floor=courseMath.nearestRouteSurface([route],start.x,start.z,Infinity);
    start.y=floor.y+.62;
    const h=makeHarness(testTrack([],{routes:[route],start}));
    h.b.grounded=true;h.b.supportRoute=route;h.b.surfaceKind='wood';
    h.b.vx=floor.tx*speed*Math.cos(angle)+edge.nx*speed*Math.sin(angle);
    h.b.vz=floor.tz*speed*Math.cos(angle)+edge.nz*speed*Math.sin(angle);
    h.b.vy=floor.slopeX*h.b.vx+floor.slopeZ*h.b.vz;
    let maxHeightError=0,maxExcessVy=0,reverseFrames=0,contacts=0;
    for(let frame=0;frame<hz*2;frame++) {
      const before={x:h.b.x,z:h.b.z};
      const support=h.context.sampleTrackSurface(h.b.x,h.b.y,h.b.z,h.b.r);
      assert(support,`${shape}/${hz}Hz: missing support before graze`);
      h.step(dt,(support.tx+support.normalX*side*.38)*18,(support.tz+support.normalZ*side*.38)*18,18);
      const after=h.context.sampleTrackSurface(h.b.x,h.b.y,h.b.z,h.b.r);
      assert(after && h.b.grounded && h.b.supportRoute===route,`${shape}/${hz}Hz/${speed}/${degrees}: graze became a fall or landing`);
      const error=Math.abs(h.b.y-h.b.r-after.y),excess=h.b.vy-(after.slopeX*h.b.vx+after.slopeZ*h.b.vz);
      maxHeightError=Math.max(maxHeightError,error);maxExcessVy=Math.max(maxExcessVy,excess);
      if((h.b.x-before.x)*support.tx+(h.b.z-before.z)*support.tz<-.0001)reverseFrames++;
      for(const e of courseMath.getRibbonBoundarySegments(route)) {
        const dx=e.b.x-e.a.x,dz=e.b.z-e.a.z,u=((h.b.x-e.a.x)*dx+(h.b.z-e.a.z)*dz)/(dx*dx+dz*dz);
        if(u<0 || u>1)continue;
        const distance=(h.b.x-e.a.x)*e.nx+(h.b.z-e.a.z)*e.nz;
        if(distance>-.8) {contacts++;assert(distance<=-h.b.r+1e-5,`${shape}/${hz}Hz/side${side}/${speed}mps/${degrees}deg/frame${frame}/edge${e.index}: guard containment error ${distance+h.b.r} at ${h.b.x},${h.b.z}, previous ${before.x},${before.z}`);}
      }
      assert(error<.08,`${shape}/${hz}Hz: rail changed floor height by ${error}`);
      assert(excess<=.08,`${shape}/${hz}Hz: rail injected ${excess}m/s above floor tangent`);
    }
    const progress=(h.b.x-start.x)*floor.tx+(h.b.z-start.z)*floor.tz;
    assert(progress>1.3,`${shape}/${hz}Hz: stuck while grazing, progress=${progress}`);
    assert(reverseFrames===0,`${shape}/${hz}Hz: longitudinal jitter (${reverseFrames} reversing frames)`);
    assert(contacts>0,`${shape}/${hz}Hz: fixture never grazed guardrail`);
    assert.equal(h.state.pops,0);assert.equal(h.events.length,0,'guardrail grazing triggered a pop/fall event');
    receipts.push({shape,hz,maxHeightError,maxExcessVy,progress});
  }
  return {cases:receipts.length,maxHeightError:Math.max(...receipts.map(r=>r.maxHeightError)),maxExcessVy:Math.max(...receipts.map(r=>r.maxExcessVy)),minProgress:Math.min(...receipts.map(r=>r.progress))};
});

check('solid wall rebound and connected side doorway', () => {
  const receipts = [];
  for (const side of [-1, 1]) {
    const p = { ...flat, w: 6, d: 14, walls: true };
    const solid = makeHarness(testTrack([p]));
    solid.b.grounded = true; solid.b.supportPlatform = p;
    let bounced = false;
    for (let i = 0; i < 120; i++) { solid.step(1 / 60, side * 80, 0); if (solid.b.vx * side < -0.5) bounced = true; }
    assert(bounced && Math.abs(solid.b.x) <= 2.381, `No wall rebound side${side}`);
    const q = { kind: 'grass', x: side * 5, y: 8, z: 0, w: 4, d: 6, h: 1 };
    const door = makeHarness(testTrack([p, q]));
    for (let i = 0; i < 180 && door.b.x * side < 4.5; i++) door.step(1 / 60, side * 18, 0);
    assert(door.b.x * side > 3.5, `Connected deck doorway blocked side${side} x=${door.b.x}`);
    assert(door.b.grounded && Math.abs(door.b.y - 8.62) < 0.02, `Doorway crossing lost support side${side}`);
    receipts.push({ side, bounced, doorwayX: +door.b.x.toFixed(4) });
  }
  return { receipts };
});

check('elevator riding full sine cycle', () => {
  const receipts = [];
  for (const dt of [1 / 120, 1 / 60, 0.04]) {
    const p = { kind: 'elevator', x: 0, y: 5, z: 0, w: 6, d: 6, h: 0.8, yMin: 5, yMax: 7, speed: 0.9, phase: -Math.PI / 2, walls: true };
    const h = makeHarness(testTrack([p], { start: { x: 0, y: 5.62, z: 0 } }));
    h.b.grounded = true; h.b.surfaceKind = 'elevator'; h.b.supportPlatform = p;
    let maxError = 0, airborneFrames = 0;
    const period = Math.PI * 2 / p.speed;
    for (let t = 0; t < period * 2; t += dt) {
      h.step(dt);
      const y = (p.yMin + p.yMax) / 2 + Math.sin(h.state.elapsed * p.speed + p.phase) * (p.yMax - p.yMin) / 2;
      maxError = Math.max(maxError, Math.abs(h.b.y - h.b.r - y));
      if (!h.b.grounded) airborneFrames++;
    }
    assert(maxError < 0.015 && airborneFrames === 0, `dt=${dt}: elevator contact drift ${maxError}, airborne${airborneFrames}`);
    receipts.push({ dt, cycles: 2, maxError: +maxError.toFixed(8), airborneFrames });
  }
  return { receipts };
});

const names = ['01 · 晨曦花谷学园','02 · 魔女客厅大冒险','03 · 鹅卵石面包老街','04 · 参天古树速降山谷','05 · 厨房一角三层微缩','06 · 钟楼运河与屋顶','07 · 浮空云海跳岛','08 · 冬日暖炉与冰川阁楼','09 · 星际宇宙传送城','10 · 魔女大庆典总决赛'];
const worlds = ['grounded_nature','indoor_home','town_street','grounded_nature','indoor_home','town_street','sky_floating','hybrid_winter','cosmic_warp','grand_medley'];
const distance3 = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function near(a,b,label,tol=1e-6) { assert(Math.abs(a-b)<=tol, `${label}: ${a} != ${b}`); }
const finiteBall = b => {for(const key of ['x','y','z','vx','vy','vz']) assert(Number.isFinite(b[key]),`non-finite ball.${key}`);};

check('v4.1 ten distinct approved courses meet all 600..1750m targets and preserve flagship tiers', () => {
  assert.equal(TRACKS.length,10); assert.equal(CATS.length,9);
  assert.ok(courseMath,'missing shared v3 course geometry functions');
  const signatures = new Set();
  for(const [i,track] of TRACKS.entries()) {
    assert.equal(track.name,names[i]); assert.equal(track.worldType,worlds[i]);
    assert.ok(track.blueprint && existsSync(new URL(`../${track.blueprint.startsWith('docs/')?track.blueprint:`docs/concept-art/v3-blueprints/${track.blueprint}`}`,import.meta.url)),`${track.id}: missing approved blueprint`);
    assert.ok(track.routes?.length,`${track.id}: missing continuous 3D routes`);
    const measured=track.routes.filter(r=>!r.secret).reduce((n,r)=>n+courseMath.polylineLength(r.points),0)+(track.chutes||[]).reduce((n,c)=>n+courseMath.polylineLength(c.points),0);
    near(track.length,measured,`${track.id}: declared versus measured route length`,0.02);
    assert(track.acts.length>=5&&track.acts.length<=6,`${track.id}: needs five or six acts`);
    assert(track.acts.every(act=>act.pathIds.length&&act.lengthMeters>5),`${track.id}: empty act`);
    assert(track.checkpoints.length>=4&&track.checkpoints.length<=6,`${track.id}: needs four to six beacons`);
    assert(track.checkpoints.every((cp,j)=>!j||cp.progress>track.checkpoints[j-1].progress),`${track.id}: unordered checkpoints`);
    assert(track.routes.some(r=>r.width>=6.2&&r.width<=7.6));
    assert(track.routes.some(r=>r.width>=4&&r.width<=4.8));
    assert(track.routes.some(r=>r.width>=2.79&&r.width<=3.4),`${track.id}: missing two-lane challenge corridor`);
    assert(track.routes.some(r=>!r.walls)&&track.routes.some(r=>r.walls));
    assert(track.bonusTime>=210&&track.bonusTime<=420,`${track.id}: expanded course timer outside 210..420 seconds`);
    assert(track.spikes.length&&track.bumpers.length&&track.boosts.length,`${track.id}: missing action setpieces`);
    if(i>=2)assert(track.hammers.length&&track.rollingPins.length,`${track.id}: missing pendulum or rolling pin`);
    near(track.length,courseConfig.COURSE_LENGTH_TARGETS[i],`${track.id}: measured v4.1 course target`,.03);
    signatures.add(JSON.stringify(track.routes.map(r=>r.points.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)]))));
    for(const route of track.routes) {
      assert(route.width>1.24 && route.points.length>=2,`${track.id}/${route.id}: unusable route dimensions`);
      for(const [j,p] of route.points.entries()) {assert(['x','y','z'].every(k=>Number.isFinite(p[k])),`${track.id}: invalid route point`);if(j)assert(distance3(p,route.points[j-1])>1e-5,`${track.id}: degenerate route segment`);}
    }
  }
  assert.equal(signatures.size,10,'courses reuse a layout');
  near(TRACKS[0].length,600,'opening course target',.03);
  near(TRACKS[9].length,1750,'finale course target',.03);
  return {lengths:TRACKS.map(t=>+t.length.toFixed(2))};
});

check('v3 save migration preserves progress and remaps legacy course records exactly once',()=>{
  assert.equal(typeof courseConfig.migrateV3Save,'function','v3 save migration is missing');
  const legacy={selectedCat:'aurora_queen',unlockedCats:['witch_black','aurora_queen'],totalStars:123,clearedTracks:[0,4,6,9],bestTrackTimes:{clockwork:17,gear_outpost:22,academy:9,aurora:31},sharedCount:4,mouseSens:1.4};
  const snapshot=JSON.stringify(legacy),migrated=courseConfig.migrateV3Save(legacy);
  assert.equal(migrated.schemaVersion,3);assert.equal(migrated.bestTrackTimes.foundry,17,'legacy stage7 record must follow its course index');assert.equal(migrated.bestTrackTimes.clockwork,22,'legacy stage5 record must follow its course index');
  assert.equal(migrated.bestTrackTimes.academy,9);assert.equal(migrated.bestTrackTimes.prism,31,'legacy stage9 record is reused by wrong winter course');
  assert.deepEqual(migrated.unlockedCats,legacy.unlockedCats);assert.deepEqual(migrated.clearedTracks,legacy.clearedTracks);assert.equal(migrated.totalStars,123);assert.equal(migrated.selectedCat,'aurora_queen');assert.equal(migrated.sharedCount,4);assert.equal(migrated.mouseSens,1.4);
  assert.equal(JSON.stringify(legacy),snapshot,'migration mutates the original save');
  assert.deepEqual(courseConfig.migrateV3Save(migrated),migrated,'v3 records are migrated again on reload');
  const fresh=courseConfig.migrateV3Save({schemaVersion:3,bestTrackTimes:{clockwork:8,foundry:12},totalStars:7});assert.deepEqual(fresh.bestTrackTimes,{clockwork:8,foundry:12});assert.equal(fresh.totalStars,7);assert.equal(fresh.selectedCat,courseConfig.DEFAULT_SAVE.selectedCat);
});

check('v3 authored precision zones cover narrow routes at the correct elevation', () => {
  for(const [i,track] of TRACKS.entries()) {
    const zones=track.cameraZones||[];
    for(const zone of zones) {assert.equal(zone.type,'orbit');assert(zone.r>0 && ['x','y','z','r'].every(k=>Number.isFinite(zone[k])));}
    if([3,4,5,6,8,9].includes(i)) assert(zones.length,`${track.id}: no manual orbit precision zone`);
    for(const route of (track.routes||[]).filter(r=>r.width<=2.6 && !r.secret)) {
      for(const p of route.points.filter((_,j)=>j%4===0)) assert(zones.some(z=>Math.hypot(p.x-z.x,p.z-z.z)<=z.r+1 && Math.abs(p.y-z.y)<4),`${track.id}/${route.id}: narrow segment misses authored orbit camera zone`);
    }
  }
});

check('v3 camera-relative steering rotates intuitively at arbitrary yaw', () => {
  assert.ok(directorApi,'missing Dynamic Camera Director');
  for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI,0.37,5.2]) {
    const up=directorApi.cameraRelativeInput(0,-1,yaw),right=directorApi.cameraRelativeInput(1,0,yaw);
    const ux=up.x??up.driveX,uz=up.z??up.driveZ,rx=right.x??right.driveX,rz=right.z??right.driveZ;
    near(Math.hypot(ux,uz),1,'up input preserves length');near(Math.hypot(rx,rz),1,'right input preserves length');near(ux*rx+uz*rz,0,'screen axes remain perpendicular');
    near(ux,-Math.sin(yaw),'up follows camera forward X');near(uz,-Math.cos(yaw),'up follows camera forward Z');
  }
});

check('v3 camera modes prioritize chute and setpiece, preserve manual orbit, and return control', () => {
  assert.ok(directorApi,'missing Dynamic Camera Director');
  const {createDirector,updateDirector,triggerSetpiece}=directorApi;
  const ball={x:0,y:4.62,z:0,vx:0,vy:0,vz:-5,r:0.62,grounded:true};
  const track={worldType:'grounded_nature',routes:[],cameraZones:[{type:'orbit',x:0,y:4,z:0,r:6}]};
  const d=createDirector(0);
  let pose=updateDirector(d,{ball,track,dt:1/60,elapsed:0,manualDelta:0.8,aspect:1.6});
  assert.equal(d.mode,'MANUAL_ORBIT');const manualYaw=d.yaw;
  for(let i=0;i<180;i++)pose=updateDirector(d,{ball,track,dt:1/60,elapsed:i/60,aspect:1.6});
  near(d.yaw,manualYaw,'manual orbit must not recenter',0.01);
  triggerSetpiece(d,1.2);pose=updateDirector(d,{ball,track,dt:1/60,elapsed:3.1,aspect:1.6});assert.equal(d.mode,'LOCKED_SETPIECE');
  for(let i=0;i<100;i++)pose=updateDirector(d,{ball,track,dt:1/60,elapsed:3.2+i/60,aspect:1.6});
  assert.equal(d.mode,'MANUAL_ORBIT','setpiece does not restore authored orbit zone');
  const chute=(TRACKS.flatMap(t=>t.chutes||[]))[0];assert(chute,'courses have no chute');
  ball.chuteRide={chute,distance:2,t:0.1};pose=updateDirector(d,{ball,track,dt:1/60,elapsed:5,aspect:1.6});assert.equal(d.mode,'LOCKED_CHUTE');
  for(const k of ['x','y','z','lookX','lookY','lookZ','fov'])assert(Number.isFinite(pose[k]),`invalid camera ${k}`);
  ball.chuteRide=null;ball.x=30;
  for(let frame=0;frame<25;frame++)pose=updateDirector(d,{ball,track,dt:1/60,elapsed:5.1+frame/60,aspect:1.6});
  assert.equal(d.mode,'DEFAULT_FOLLOW');
});

check('v3 every sampled route floor matches the actual runtime surface query', () => {
  assert.ok(courseMath,'missing v3 route math');let samples=0;
  for(const track of TRACKS) {
    const h=makeHarness(track);
    for(const route of track.routes||[]) {
      const len=courseMath.polylineLength(route.points);
      for(let d=0;d<=len;d+=0.75) {
        const p=courseMath.samplePath(route.points,d);Object.assign(h.b,{x:p.x,y:p.y+h.b.r,z:p.z,grounded:true,supportPlatform:null,previousBottom:p.y});
        const floor=h.context.sampleTrackSurface(p.x,p.y+h.b.r,p.z,h.b.r);
        assert(floor,`${track.id}/${route.id}: broken floor at ${d.toFixed(2)}m`);near(floor.y,p.y,`${track.id}/${route.id} floor`,0.18);samples++;
      }
    }
  }
  assert(samples>1500,'route support test has no meaningful course samples');return {samples};
});

check('v3 collider floor follows actual rendered triangle centroids through banked self-overlap',()=>{
  let samples=0;
  for(const track of TRACKS){const h=makeHarness(track);
    for(const route of track.routes){
      const geometry=createRouteRibbonGeometry(route),position=geometry.attributes.position,index=geometry.index;
      for(let triangle=0;triangle<index.count/3;triangle+=7){
        const ids=[index.getX(triangle*3),index.getX(triangle*3+1),index.getX(triangle*3+2)],center={x:0,y:0,z:0};
        for(const vertex of ids){center.x+=position.getX(vertex)/3;center.y+=position.getY(vertex)/3;center.z+=position.getZ(vertex)/3;}
        const contact={bottom:center.y,previousBottom:center.y,grounded:true,supportRoute:route};
        const floor=courseMath.nearestRouteSurface([route],center.x,center.z,center.y+0.55,contact);
        assert(floor,`${track.id}/${route.id} triangle${triangle}: rendered floor has no collider`);near(floor.y,center.y,`${track.id}/${route.id} triangle${triangle}: wrong overlapping floor`,0.0001);
        Object.assign(h.b,{...center,y:center.y+h.b.r,previousBottom:center.y,grounded:true,supportRoute:route,supportPlatform:null});
        const actual=h.context.sampleTrackSurface(center.x,h.b.y,center.z,h.b.r);assert(actual,`${track.id}/${route.id} triangle${triangle}: actual main loses rendered floor`);
        // A plaza deliberately overlays the ribbon at room furniture and arrival docks.
        // Its visible top is the real floor in that footprint.
        const visiblePlaza=track.platforms.some(p=>Math.abs(center.x-p.x)<=p.w/2+h.b.r*.35 && Math.abs(center.z-p.z)<=p.d/2+h.b.r*.35 && Math.abs(h.context.platformFloor(p,center.x,center.z).y-actual.y)<0.0001);
        assert(Math.abs(actual.y-center.y)<0.0001 || visiblePlaza,`${track.id}/${route.id} triangle${triangle}: main selects floor${actual.y} rather than rendered${center.y}`);samples++;
      }
      geometry.dispose();
    }
  }
  // Two overlapping floors exercise support-height selection without relying
  // on an obsolete coordinate snapshot from an earlier authored course scale.
  const fixture = [{ id:'lower',kind:'ice',width:4,bank:.6,points:[{x:-3,y:5,z:0},{x:3,y:5,z:0}] },
    { id:'upper',kind:'ice',width:4,bank:.6,points:[{x:0,y:8,z:-3},{x:0,y:8,z:3}] }];
  for(const route of fixture) for(const triangle of courseMath.getRouteFloorTriangles(route)) {
    const p={x:(triangle.a.x+triangle.b.x+triangle.c.x)/3,y:(triangle.a.y+triangle.b.y+triangle.c.y)/3,z:(triangle.a.z+triangle.b.z+triangle.c.z)/3};
    const floor=courseMath.nearestRouteSurface(fixture,p.x,p.z,p.y+.55,{bottom:p.y,previousBottom:p.y,grounded:true,supportRoute:route});
    assert(floor,'overlapping fixture loses the rendered floor');near(floor.y,p.y,'overlapping fixture chooses the supported height',.00001);
  }
  assert(samples>2000,'renderer triangle coverage is too sparse');return{samples};
});

check('v3 route lateral contact and airborne queries never select a lower crossing floor',()=>{
  let samples=0;
  for(const track of TRACKS){const h=makeHarness(track);
    for(const route of track.routes)for(let index=1;index<route.points.length-1;index++){
      const row=courseMath.getRouteRibbonRows(route).rows[index];
      for(const side of [-1,1]){
        const p=row[side<0?1:7],x=p.x,z=p.z;
        const authored=courseMath.nearestRouteSurface([route],x,z,Infinity);
        assert(authored,`${track.id}/${route.id}[${index}] side${side} x${x} z${z}: lateral authored floor missing`);const floor=authored.y;
        Object.assign(h.b,{x,y:floor+h.b.r,z,grounded:true,supportRoute:route,supportPlatform:null,previousBottom:floor});
        const surf=h.context.sampleTrackSurface(x,h.b.y,z,h.b.r);
        assert(surf,`${track.id}/${route.id}[${index}] side${side}: missing lateral floor`);
        assert(Math.abs(surf.y-floor)<0.3,`${track.id}/${route.id}[${index}] side${side}: snaps ${Math.abs(surf.y-floor).toFixed(3)}m onto another floor`);samples++;
      }
    }

  }
  return{samples};
});

check('v3 airborne surface queries do not teleport to distant floors',()=>{
  for(const track of TRACKS){const h=makeHarness(track),p=track.routes[0].points[0];
    Object.assign(h.b,{x:p.x,y:p.y+h.b.r+4,z:p.z,grounded:false,supportRoute:null,supportPlatform:null,previousBottom:p.y+4});
    assert(h.context.sampleTrackSurface(h.b.x,h.b.y,h.b.z,h.b.r)===null,`${track.id}: airborne ball teleports4m to route`);
  }
});

check('v4 fresh saves unlock three flagships and lobby shortcuts launch them in one click',()=>{
  const context=vm.createContext({TRACKS,save:{clearedTracks:[]}});
  vm.runInContext(`${sourceBetween('function isTrackUnlocked(', 'function updateGyroUI(')};this.unlocked=isTrackUnlocked;`,context);
  for(const index of [0,3,4,8])assert.equal(context.unlocked(index),true,`fresh save locks stage ${index+1}`);
  for(const index of [1,2,5,6,7,9])assert.equal(context.unlocked(index),false,`original progression stage ${index+1} is unexpectedly unlocked`);
  context.save.clearedTracks.push(0);assert.equal(context.unlocked(1),true,'original progression unlock no longer works');
  const shell=readFileSync(new URL('../src/shell.html',import.meta.url),'utf8');
  const indices=[...shell.matchAll(/data-flagship-track="(\d+)"/g)].map(match=>Number(match[1]));assert.deepEqual(indices,[4,3,8]);
  assert(shell.includes('🌟 v4.1 立体王牌直通'),'lobby flagship bar title missing');
  const buttons=indices.map(index=>({dataset:{flagshipTrack:String(index)}})),launches=[];
  const clicks=vm.createContext({selectedPracticeTrack:0,document:{querySelectorAll:()=>buttons},Number,loadTrack:(...args)=>launches.push(args)});
  vm.runInContext(sourceBetween("document.querySelectorAll('[data-flagship-track]')",'document.getElementById("btn-cat-go")'),clicks);
  for(const button of buttons){assert.equal(typeof button.onclick,'function');button.onclick();}
  assert.deepEqual(launches,indices.map(index=>[index,'practice',0]),'one-click flagship shortcuts do not launch their exact course');
  return{unlockedStages:[4,5,9],oneClickLaunches:launches.length};
});

check('v4 flagship blueprints have actual playable stacked tiers and paired connections',()=>{
  const expected=[{index:4,id:'A',heights:[24,12,1.5],start:24,goal:12,file:'flagship-a-kitchen-3tier.jpg'},
    {index:3,id:'B',heights:[36,18,2],start:36,goal:2,file:'flagship-b-giant-tree-descent.jpg'},
    {index:8,id:'C',heights:[8,28,16,22],start:8,goal:22,file:'flagship-c-cosmic-warp-city.jpg'}];
  const receipts=[];
  for(const spec of expected){
    const track=TRACKS[spec.index];assert.equal(track.flagship,spec.id);assert.equal(track.unlockedByDefault,true);
    assert.equal(track.blueprint,`docs/concept-art/v4-flagship/${spec.file}`);
    near(track.start.y-.62,spec.start,`${track.id}: start tier`,.05);near(track.finish.y,spec.goal,`${track.id}: goal tier`,.05);
    for(const height of spec.heights){
      const floorMeters=track.routes.reduce((n,r)=>n+r.points.slice(1).reduce((sum,p,i)=>sum+(Math.abs(p.y-height)<.2&&Math.abs(r.points[i].y-height)<.2?distance3(p,r.points[i]):0),0),0);
      assert(floorMeters>=5,`${track.id}: ${height}m tier has no substantial playable floor`);
    }
    if(spec.id==='A'){
      const levels=[1.5,12,24];assert(levels.every((height,i)=>!i||height-levels[i-1]>=9));
      assert(track.routes.some(r=>r.section.includes('under')&&r.points.some(p=>Math.abs(p.y-1.5)<.05)),'kitchen has no authored under-table route');
      assert(track.chutes.some(c=>c.material==='honey'&&Math.abs(c.points[0].y-12)<.05&&Math.abs(c.receiving.y-1.5)<.05),'honey slide does not connect counter to floor');
      assert(track.props.some(p=>p.type==='toaster'&&p.target),'missing sink-crossing toaster');
      assert(track.props.some(p=>p.type==='toy_mouse'),'missing clockwork mouse');
    }
    if(spec.id==='B'){
      assert(track.chutes.some(c=>c.material==='oak'&&Math.abs(c.turns-1.5)<1e-6),'hollow trunk slide is not 540 degrees');
      assert(track.landmarks.some(l=>l.type==='giant_oak'&&l.height===42),'missing 42m ancient oak');
      assert(track.props.some(p=>p.type==='wind_cloud'),'missing smiling cloud boost');
      assert(track.props.some(p=>p.type==='sheep'),'missing solid sheep pasture');
      assert(track.fallZones.some(z=>z.type==='water'),'waterfall has no splash fall zone');
    }
    if(spec.id==='C'){
      assert.equal(track.worldType,'cosmic_warp');assert.deepEqual(track.portals.map(p=>p.id),['A','B','C']);
      assert.deepEqual(track.portals.map(p=>p.exit.y),[28,16,22]);
      assert.equal(new Set(track.portals.map(p=>p.color)).size,3,'portal pair colors are ambiguous');
      assert.deepEqual(track.primaryPath.filter(s=>s.type==='portal').map(p=>p.id),['A','B','C']);
      assert(track.chutes.some(c=>c.material==='rainbow'),'cosmic skyway has no rainbow spiral');
    }
    receipts.push({stage:spec.index+1,tiers:spec.heights,length:+track.length.toFixed(2)});
  }
  return{receipts};
});

check('v4 stacked surfaces never capture upper floors through shared XZ footprints',()=>{
  let contacts=0;
  const routes=[1.5,12,24].map((y,i)=>({id:`layer-${i}`,kind:'wood',width:6,walls:false,points:[{x:0,y,z:10},{x:0,y,z:-10}]}));
  const platforms=[1.5,12,24].map(y=>({kind:'wood',x:0,y,z:0,w:9,d:9,h:.65}));
  for(const hz of [120,60,25])for(const y of [1.5,12,24]){
    const h=makeHarness(testTrack(platforms,{routes,start:{x:0,y:y+.62,z:0}}));
    Object.assign(h.b,{grounded:true,previousBottom:y,supportRoute:routes.find(r=>r.points[0].y===y)});
    for(let i=0;i<hz;i++){
      const floor=h.context.sampleTrackSurface(h.b.x,h.b.y,h.b.z,h.b.r);assert(floor,'stacked floor vanished');near(floor.y,y,'stacked support changed tier');
      h.step(1/hz);near(h.b.y,y+h.b.r,'stacked ball snapped to another tier',.005);contacts++;
    }
    Object.assign(h.b,{y:y+3.62,grounded:false,previousBottom:y+3,supportRoute:null,supportPlatform:null});
    assert.equal(h.context.sampleTrackSurface(h.b.x,h.b.y,h.b.z,h.b.r),null,'airborne query grabs distant stacked floor');
  }
  return{contacts,rates:[120,60,25]};
});

check('v4 native portal entry catches grazing crossings between input frames',()=>{
  const portal={id:'sweep',label:'Sweep',color:0x49cfff,entry:{x:0,y:8,z:0,r:1.5},exit:{x:20,y:16,z:0,yaw:0,speed:7}};
  for(const hz of [120,60,25]){
    const dt=1/hz,h=makeHarness(testTrack([flat,{...flat,x:20,y:16,w:10,d:10}],{
      portals:[portal],start:{x:1.4999,y:8.62,z:-15*dt/2}}));
    h.b.grounded=true;h.b.vz=15;
    assert.equal(portalApi.findPortalEntry(h.state.track,h.b),null,'grazing fixture starts inside entry');
    h.step(dt);
    assert.equal(h.b.warpCount,1,`${hz}Hz: actual main skips a portal crossed between frame endpoints`);
    near(h.b.y,16+h.b.r+.04,'swept portal exit tier');assert.equal(h.events.length,0);
  }
  return{rates:[120,60,25],crossings:3};
});

check('v4 paired portals teleport with exact exit yaw, bounded speed, cooldown and safe steering',()=>{
  assert(portalApi,'missing first-class portal runtime');
  const track=TRACKS[8];let warps=0;
  for(const portal of track.portals||[])for(const hz of [120,60,25]){
    const dt=1/hz,director=directorApi.createDirector(2.1),ball={...portal.entry,y:portal.entry.y+.62,r:.62,vx:19,vy:-3,vz:-17,grounded:true,previousBottom:portal.entry.y};
    assert.equal(portalApi.findPortalEntry(track,ball),portal,'entry trigger misses its own tier');
    assert.equal(portalApi.findPortalEntry(track,{...ball,y:ball.y-8}),null,'portal captures another vertical layer');
    assert.equal(portalApi.findPortalEntry(track,{...ball,x:portal.entry.x+3},{...ball,x:portal.entry.x-3}),portal,'fast portal crossing tunnels between input frames');
    portalApi.capturePortal(ball,portal,director);
    near(ball.x,portal.exit.x,'warp exit X');near(ball.z,portal.exit.z,'warp exit Z');near(ball.y,portal.exit.y+ball.r+.04,'warp exit Y');
    const speed=Math.hypot(ball.vx,ball.vz);assert(speed>=6&&speed<=8,`unsafe exit speed ${speed}`);
    near(ball.vx,-Math.sin(portal.exit.yaw)*speed,'warp exit velocity X');near(ball.vz,-Math.cos(portal.exit.yaw)*speed,'warp exit velocity Z');
    near(Math.atan2(Math.sin(director.yaw-portal.exit.yaw),Math.cos(director.yaw-portal.exit.yaw)),0,'warp camera yaw');
    assert(ball.portalFlash>=.44&&ball.portalSteering>=.44,'warp flash or steering protection omitted');
    assert(ball.portalCooldown>=1,'portal has no re-entry cooldown');assert.equal(portalApi.findPortalEntry(track,{...ball,...portal.entry,y:portal.entry.y+.62}),null);
    const damped=portalApi.dampPortalSteering(ball,Math.cos(portal.exit.yaw)*18,-Math.sin(portal.exit.yaw)*18,dt);
    const lateral=damped.x*Math.cos(portal.exit.yaw)-damped.z*Math.sin(portal.exit.yaw);
    assert(Math.abs(lateral)<5,'stale lateral input remains dangerous immediately after warp');
    portalApi.advancePortal(ball,.45);near(ball.portalFlash,0,'warp flash duration');near(ball.portalSteering,0,'post-warp steering duration');
    const restored=portalApi.dampPortalSteering(ball,7,-11);near(restored.x,7,'horizontal steering does not restore');near(restored.z,-11,'vertical steering does not restore');
    const h=makeHarness(track);Object.assign(h.b,{...portal.entry,y:portal.entry.y+.62,r:.62,grounded:true});h.step(dt);
    assert.equal(h.b.warpCount,1,'actual main physics does not natively traverse entry portal');
    near(h.state.director.yaw,portal.exit.yaw,'actual main warp camera alignment',.005);
    for(let i=0;i<Math.ceil(.45/dt);i++){
      h.step(dt,Math.cos(portal.exit.yaw)*18,-Math.sin(portal.exit.yaw)*18,18);
      if(h.b.portalSteering>0)near(h.state.director.yaw,portal.exit.yaw,'post-warp yaw drifts during protected steering',.005);
    }
    assert.equal(h.events.filter(e=>e.type==='fall').length,0,'post-warp runway causes a fall');assert.equal(h.state.pops,0,'post-warp ball pops');
    assert(h.b.y>portal.exit.y-.5,'post-warp ball drops off destination');warps++;
  }
  assert.equal(warps,9,'A/B/C not tested at every required rate');return{warps,rates:[120,60,25]};
});

check('v3 actual keyboard movement uses rendered camera yaw and launchers trigger cinematics',()=>{
  for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI]){
    const h=makeHarness(testTrack([flat]));h.state.viewYaw=yaw;h.state.director.yaw=yaw;h.state.input.keys.add('KeyW');
    // A single real-physics step isolates the current rendered input basis from subsequent follow-camera motion.
    h.b.grounded=true;h.b.supportPlatform=flat;h.step(1/60);const length=Math.hypot(h.b.vx,h.b.vz);assert(length>.04,'keyboard applies no acceleration');
    near(h.b.vx/length,-Math.sin(yaw),'actual keyboard camera-forward X',0.001);near(h.b.vz/length,-Math.cos(yaw),'actual keyboard camera-forward Z',0.001);
  }
  const track=TRACKS[4],prop=track.props.find(p=>p.type==='toaster'),h=makeHarness(track);Object.assign(h.b,{x:prop.x,y:prop.y+h.b.r,z:prop.z,grounded:true});
  h.step(1/60);assert(h.b.launchAssist,'toaster trigger does not launch through actual main');assert.equal(h.state.director.mode,'LOCKED_SETPIECE');assert(h.state.director.setpieceTime>=0.9,'toaster cinematic ends too soon');
});

check('v3 spiral rail capture, finite motion and exact tangent exit at three frame rates', () => {
  assert.ok(runtimeApi,'missing v3 chute rail runtime');assert.ok(courseMath);
  let rides=0;
  for(const track of TRACKS)for(const chute of track.chutes||[])for(const dt of [1/120,1/60,0.04]) {
    assert(chute.turns>=0.99,`${track.id}: chute is not a full 3D spiral`);
    const entry=courseMath.getChuteFrame(chute,0),exit=courseMath.getChuteFrame(chute,1);
    assert(Math.abs(entry.y-exit.y)>=2,`${track.id}: flat decorative chute`);
    const b={x:entry.x+0.25,y:entry.y+0.62,z:entry.z,vx:0,vy:0,vz:0,r:0.62,grounded:true};
    assert.equal(runtimeApi.findChuteEntry(track,b),chute,`${track.id}: entry trigger unreachable`);
    assert.equal(runtimeApi.findChuteEntry(track,{...b,y:b.y-5}),null,`${track.id}: trigger captures ball on another floor`);
    const initial={...b},ride=runtimeApi.captureChute(b,chute);assert(ride,`${track.id}: capture returned no rail state`);
    assert(distance3(initial,b)<0.5,`${track.id}: entry capture teleports ball`);
    let active=true,time=0;
    while(active && time<60) {const before={...b};active=runtimeApi.advanceChute(b,ride,dt,0.2);finiteBall(b);assert(distance3(before,b)<=chute.speed*dt+0.45,`${track.id}: discontinuous rail step`);time+=dt;}
    assert(!active,`${track.id}: chute never releases`);
    near(b.x,exit.x,`${track.id}: exit x`,0.005);near(b.y,exit.y+b.r,`${track.id}: exit y`,0.03);near(b.z,exit.z,`${track.id}: exit z`,0.005);
    const exitSpeed=chute.exitSpeed||chute.speed;near(b.vx,exit.tx*exitSpeed,`${track.id}: exact tangent vx`,0.01);near(b.vy,exit.ty*exitSpeed,`${track.id}: exact tangent vy`,0.01);near(b.vz,exit.tz*exitSpeed,`${track.id}: exact tangent vz`,0.01);
    const h=makeHarness(track);Object.assign(h.b,b,{previousBottom:exit.y});const floor=h.context.sampleTrackSurface(b.x,b.y,b.z,b.r);
    assert(floor,`${track.id}: chute exit misses receiving platform`);near(floor.y,exit.y,`${track.id}: exit landing floor`,0.05);rides++;
  }
  assert(rides>=21,'missing prescribed stage chutes');return {rides};
});

check('v3 all authored launchers have reachable supported landing targets', () => {
  assert.ok(courseMath);let launches=0;
  for(const track of TRACKS)for(const prop of [...(track.props||[]),...(track.mushrooms||[])].filter(p=>p.target)) {
    assert(prop.flightTime>0.35 && prop.flightTime<3,`${track.id}/${prop.id}: unsafe launch duration`);
    const start={x:prop.x,y:prop.y,z:prop.z},v=courseMath.computeLaunchVelocity(start,prop.target,prop.flightTime,26),t=prop.flightTime;
    near(prop.vx??0,v.vx,`${track.id}/${prop.id}: authored vx`,0.02);near(prop.vy,v.vy,`${track.id}/${prop.id}: authored vy`,0.02);near(prop.vz??0,v.vz,`${track.id}/${prop.id}: authored vz`,0.02);
    const end={x:start.x+v.vx*t,y:start.y+v.vy*t-13*t*t,z:start.z+v.vz*t};assert(distance3(end,prop.target)<0.03,`${track.id}/${prop.id}: launch parabola misses target`);
    const h=makeHarness(track);Object.assign(h.b,{...end,y:end.y+h.b.r,previousBottom:end.y+0.01});const floor=h.context.sampleTrackSurface(end.x,end.y+h.b.r,end.z,h.b.r);assert(floor,`${track.id}/${prop.id}: launch target has no runtime landing surface`);near(floor.y,end.y,'launch receiving floor',0.15);
    assert(v.vy*v.vy/52<35,`${track.id}/${prop.id}: unreasonable launch height`);launches++;
  }
  assert(launches>=4,'missing toaster, willow or mushroom launch definitions');return {launches};
});

check('v3 launcher runtime follows exact parabolas at 120, 60 and 25 Hz',()=>{
  let launches=0;
  for(const track of TRACKS)for(const prop of [...(track.props||[]),...(track.mushrooms||[])].filter(p=>p.target))for(const dt of [1/120,1/60,0.04]) {
    const b={x:prop.x,y:prop.y+0.62,z:prop.z,r:0.62,vx:0,vy:0,vz:0,grounded:true};
    runtimeApi.launchBall(b,prop);let t=0,apex=b.y;
    while(b.launchAssist && t<4){runtimeApi.advanceLaunch(b,dt);finiteBall(b);apex=Math.max(apex,b.y);t+=dt;}
    assert(!b.launchAssist,`${track.id}/${prop.id}: launch never returns control`);
    near(b.x,prop.target.x,'launch runtime target X',0.001);near(b.y,prop.target.y+b.r,'launch runtime target Y',0.001);near(b.z,prop.target.z,'launch runtime target Z',0.001);
    assert(apex>Math.max(prop.y,prop.target.y)+b.r,`${track.id}/${prop.id}: missing visible parabolic arc`);assert(b.launchLanding>0,'launcher has no safe landing grace');launches++;
  }
  return {launches};
});

check('v3 descending launch landings stay on receiving decks at all frame rates',()=>{
  let landings=0;
  for(const track of TRACKS)for(const prop of [...(track.props||[]),...(track.mushrooms||[])].filter(p=>p.target))for(const dt of [1/120,1/60,0.04]) {
    const h=makeHarness(track);Object.assign(h.b,{x:prop.x,y:prop.y+h.b.r,z:prop.z});runtimeApi.launchBall(h.b,prop);
    let frames=0;while(h.b.launchAssist && frames++<500)h.step(dt);
    assert(!h.b.launchAssist,`${track.id}: launch assist failed to finish`);
    h.step(dt);
    assert.equal(h.state.pops,0,`${track.id}/${prop.id}: launch landing popped`);
    const candidate=courseMath.nearestRouteSurface(track.routes,h.b.x,h.b.z,Infinity);
    assert(h.b.grounded || h.b.chuteRide,`${track.id}/${prop.id} dt=${dt}: misses receiving deck ball=${JSON.stringify(Object.fromEntries(['x','y','z','vx','vy','vz'].map(k=>[k,h.b[k]])))} candidate=${candidate?JSON.stringify({y:candidate.y,id:candidate.route.id}):null}`);
    assert(Math.hypot(h.b.x-prop.target.x,h.b.z-prop.target.z)<1.5,`${track.id}/${prop.id} dt=${dt}: descending top contact wrongly ejected through a side wall`);landings++;
  }
  return {landings};
});

check('moving animals are solid spheres with gentle relative rebounds even during event cooldown',()=>{
  const receipts=[];
  for(const type of ['ducklings','sheep','penguin','penguins','snow_bunny','snow_bunnies'])for(const dt of [1/120,1/60,.04]) {
    const prop={id:type,type,x:0,y:8,z:0,r:1.1,patrol:2,speed:1.2,phase:.3},elapsed=.6;
    const position=runtimeApi.fairytalePropPosition(prop,elapsed),events=[];
    const b={x:position.x+.9,y:8.62,z:0,r:.62,vx:-4,vy:0,vz:1,grounded:true,popTimer:0};
    runtimeApi.updateFairytalePhysics({props:[prop]},b,elapsed,dt,e=>events.push(e));
    assert(Math.hypot(b.x-position.x,b.z-position.z)>=1.72-1e-8,`${type}/${dt}: animal body remains penetrable`);
    const patrolVx=Math.cos(elapsed*1.2+.3)*2*1.2;
    assert(b.vx-patrolVx>=5.5-1e-8,`${type}/${dt}: incoming normal velocity does not gently rebound`);
    assert.equal(b.vy,0);assert.equal(b.vz,1,'sphere rebound erases tangential motion');
    assert.equal(events.length,1);assert.equal(events[0].type,'patrol');assert(events[0].position,'patrol event lacks contact position');
    b.x=position.x+.3;b.z=0;b.vx=-2;
    runtimeApi.updateFairytalePhysics({props:[prop]},b,elapsed,dt,e=>events.push(e));
    assert(Math.hypot(b.x-position.x,b.z-position.z)>=1.72-1e-8,`${type}/${dt}: cooldown disables solid depenetration`);
    assert(b.vx-patrolVx>=5.5-1e-8,`${type}/${dt}: cooldown disables normal collision response`);
    assert.equal(events.length,1,'cooldown repeats contact feedback');
    receipts.push({type,hz:Math.round(1/dt),outwardSpeed:b.vx-patrolVx});
  }
  return{cases:receipts.length,minOutwardSpeed:Math.min(...receipts.map(r=>r.outwardSpeed))};
});

check('rail-adjacent moving animals leave the final ball outside every body',()=>{
  const route={id:'critter-corridor',kind:'wood',walls:true,width:3,points:[{x:0,y:8,z:15},{x:0,y:8,z:-15}]};
  const props=[{id:'left',type:'sheep',x:-.8,y:8,z:-.5,r:1.1,patrol:.001},{id:'right',type:'penguin',x:.8,y:8,z:.5,r:1.1,patrol:.001}];
  let cases=0;
  for(const onRoute of [true,false])for(const dt of [1/120,1/60,.04])for(const x of [-.2,-1.3877787807814457e-16,.2,.6]) {
    const b={x,y:8.62,z:0,r:.62,vx:0,vy:0,vz:-4,popTimer:0,grounded:true,supportRoute:onRoute?route:null},events=[];
    runtimeApi.updateFairytalePhysics({props,routes:[route]},b,0,dt,e=>events.push(e));
    if(onRoute)runtimeApi.collideRouteGuardrails(b,route,b.x,b.z);
    runtimeApi.collideFairytaleCritters({props,routes:[route]},b,0,e=>events.push(e));
    for(const prop of props){const p=runtimeApi.fairytalePropPosition(prop,0);assert(Math.hypot(b.x-p.x,b.z-p.z)>=1.72-1e-6,`${dt}/${x}: final rail/animal ordering re-embeds ${prop.id}`);}
    if(onRoute)assert(Math.abs(b.x)<=.88+1e-6,'animal escape crosses a solid guardrail');
    assert.equal(b.y,8.62);assert.equal(b.vy,0);assert(events.length<=2,'constraint iterations repeat contact feedback');cases++;
  }
  return{cases};
});

check('driving into animated animals rebounds before crossing their solid bodies',()=>{
  let contacts=0;
  for(const type of ['ducklings','sheep','penguin','penguins','snow_bunny','snow_bunnies'])for(const hz of [120,60,25]) {
    const prop={id:`drive-${type}`,type,x:0,y:8,z:0,r:1.1,patrol:2,speed:1.2};
    const h=makeHarness(testTrack([flat],{props:[prop],start:{x:-4.5,y:8.62,z:0}}));h.b.vx=6;
    let bounced=false;
    for(let frame=0;frame<hz*2.5;frame++) {
      h.step(1/hz);
      const p=runtimeApi.fairytalePropPosition(prop,h.state.elapsed),distance=Math.hypot(h.b.x-p.x,h.b.z-p.z);
      assert(distance>=1.72-.02,`${type}/${hz}Hz: driven ball penetrates animated animal by ${1.72-distance}`);
      assert(h.b.x<p.x,`${type}/${hz}Hz: driven ball crossed the animal body`);
      if(h.b.propCooldowns?.has(prop.id)){assert(h.b.vx<0,`${type}/${hz}Hz: forward approach never rebounds`);bounced=true;break;}
    }
    assert(bounced,`${type}/${hz}Hz: fixture never reaches animal`);assert.equal(h.state.pops,0);contacts++;
  }
  return{contacts};
});

check('v3 fairytale helpers apply bounded, cooldown-protected safe impulses',()=>{
  let contacts=0;
  for(const track of TRACKS)for(const prop of (track.props||[]).filter(p=>!p.target && ['hedgehog','toy_mouse','turntable','wind_cloud'].includes(p.type)))for(const dt of [1/120,1/60,0.04]) {
    const elapsed=0.6,pos=runtimeApi.fairytalePropPosition(prop,elapsed);
    const b={...pos,y:pos.y+0.62,r:0.62,vx:0,vy:0,vz:-2,grounded:true,routeTangent:{x:0,z:-1},popTimer:0};
    const events=[],fixture={...track,props:[prop]};runtimeApi.updateFairytalePhysics(fixture,b,elapsed,dt,e=>events.push(e));finiteBall(b);
    assert.equal(b.vy,0,`${track.id}/${prop.type}: friendly contact creates unsafe vertical kick`);
    assert(Math.hypot(b.vx,b.vz)<=5,`${track.id}/${prop.type}: helper/patrol force exceeds gentle impulse`);
    if(['hedgehog','toy_mouse'].includes(prop.type)) {
      assert(b.vz<-2,'helper failed to nudge forward');const after=b.vz;
      runtimeApi.updateFairytalePhysics(fixture,b,elapsed+dt,dt,e=>events.push(e));near(b.vz,after,'helper cooldown prevents stacked impulse');assert.equal(events.filter(e=>e.type==='helper').length,1);
    }
    contacts++;
  }
  assert(contacts>=12,'missing fairytale contacts');return{contacts};
});

check('v3 cozy indoor camera scale, speed pullback and default deadzone',()=>{
  const {createDirector,updateDirector}=directorApi;
  const ball={x:0,y:4.62,z:0,vx:0,vy:0,vz:-4,r:0.62,grounded:true};
  const simulate=(worldType,speed)=>{const d=createDirector(0);for(let i=0;i<600;i++)updateDirector(d,{ball:{...ball,vz:-speed},track:{worldType,cameraZones:[]},dt:1/60,elapsed:i/60});return d;};
  const outside=simulate('grounded_nature',4),inside=simulate('indoor_home',4),fast=simulate('grounded_nature',14);
  near(inside.distance/outside.distance,0.85,'cozy indoor framing',0.001);assert(fast.distance>outside.distance+2,'speed does not pull camera back');
  const d=createDirector(0),track={worldType:'grounded_nature',cameraZones:[]};
  for(let i=0;i<30;i++)updateDirector(d,{ball,track,dt:1/60,manualDelta:0.02,elapsed:i/60});const rotated=d.yaw;assert(rotated>0.2,'default follow refuses manual rotation');
  for(let i=0;i<600;i++)updateDirector(d,{ball,track,dt:1/60,forwardInput:1,elapsed:1+i/60});
  assert(Math.abs(d.yaw)<=22*Math.PI/180+.01 && Math.abs(d.yaw)>.2,'default follow ignores its angular deadzone');
});

check('v3 camera stability across actual rendered heading and inputs',verifyCameraStability);
check('v3 rigid camera sightline preserves yaw and the visible ball',verifyCameraSightline);
check('mushroom flight arcs never pass through opaque receiving docks',()=>{
  let samples=0;
  const center=new THREE.Vector3(),closest=new THREE.Vector3(),box=new THREE.Box3();
  for(const track of TRACKS)for(const launch of track.mushrooms)for(const hz of [120,60,25]) {
    for(let frame=0;frame<=Math.ceil(launch.flightTime*hz);frame++) {
      const t=Math.min(launch.flightTime,frame/hz),r=.62;
      center.set(launch.x+launch.vx*t,launch.y+r+launch.vy*t-13*t*t,launch.z+launch.vz*t);
      for(const p of track.platforms) {
        box.min.set(p.x-p.w/2,p.y-(p.h||.6),p.z-p.d/2);
        box.max.set(p.x+p.w/2,p.y,p.z+p.d/2);
        box.clampPoint(center,closest);
        assert(center.distanceTo(closest)>=r-.02,
          `${launch.id}/${hz}Hz t=${t}: ball intersects receiving dock ${p.role}`);
      }
      samples++;
    }
  }
  return{samples};
});

check('fresh keyboard, stick and gyro lateral intent cancels chute exit settling on the exit frame',()=>{
  const track=TRACKS.find(t=>t.chutes.length),chute=track.chutes[0],receipts=[];
  for(const hz of [120,60,25]) for(const control of ['keyboard','stick','gyro']) {
    const dt=1/hz,h=makeHarness(track),p=chute.points[0];
    Object.assign(h.b,{x:p.x,y:p.y+h.b.r,z:p.z});
    const ride=runtimeApi.captureChute(h.b,chute);
    h.step(dt);assert.equal(h.state.director.mode,'LOCKED_CHUTE');
    ride.distance=ride.length-.001;
    const yaw=h.state.viewYaw;
    if(control==='keyboard')h.state.input.keys.add('KeyD');
    if(control==='stick')h.state.input.ix=1;
    if(control==='gyro'){h.context.gyroEnabled=true;h.context.gyroTiltX=18;}
    h.step(dt);
    assert.equal(h.b.chuteRide,null,`${control}/${hz}Hz: fixture did not exit chute this frame`);
    assert.equal(h.state.input.lateralInput,1,`${control}/${hz}Hz: fresh exit-frame lateral intent was skipped`);
    assert.notEqual(h.state.director.mode,'LOCKED_CHUTE',`${control}/${hz}Hz: exit settle fights fresh steering`);
    const change=Math.atan2(Math.sin(h.state.viewYaw-yaw),Math.cos(h.state.viewYaw-yaw));
    assert(Math.abs(change)<1e-10,`${control}/${hz}Hz: control basis rotated by ${change} on chute exit`);
    receipts.push({hz,control,mode:h.state.director.mode});
  }
  return{cases:receipts.length,receipts};
});

function makeLaneGuide(route,hazards) {
  if(!hazards.length)return()=>0;
  const audit=auditLaneThreat(route,hazards);
  assert(audit.ok,`${route.id}: cannot guide through unsafe lane authoring: ${audit.issues.join('; ')}`);
  let previousOffset=0;
  const stops=audit.hazardAudits.sort((a,b)=>a.distance-b.distance).map(entry=>{
    const {section,bodyLeft,bodyRight}=entry;
    const left=(section.left.x-section.center.x)*section.nx+(section.left.z-section.center.z)*section.nz,right=left+section.width;
    const choices=[[left,bodyLeft],[bodyRight,right]].filter(([a,b])=>b-a>=MIN_SAFE_PASSING_WIDTH-1e-6);
    // Center the whole ball in the actual remaining floor, reserving the full
    // pendulum/animal sweep, regardless of animation phase or telegraph state.
    choices.sort((a,b)=>Math.abs((a[0]+a[1])/2-previousOffset)-Math.abs((b[0]+b[1])/2-previousOffset));
    assert(choices.length,`${route.id}: no whole-ball safe passing guide`);
    const offset=(choices[0][0]+choices[0][1])/2;previousOffset=offset;
    return{start:entry.distance-entry.reach-.7,end:entry.distance+entry.reach+.7,offset};
  });
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const first=stops[0],last=stops.at(-1),length=courseMath.polylineLength(route.points);
  return distance=>{
    if(distance<first.start)return first.offset*smooth((distance-Math.max(0,first.start-4))/Math.max(.01,Math.min(4,first.start)));
    for(let i=0;i<stops.length;i++){
      const current=stops[i];if(distance<=current.end)return current.offset;
      const next=stops[i+1];
      if(next&&distance<next.start){
        // Sparse early stages leave long stretches without traps. Return to
        // the ordinary centerline there so a distant lane blocker cannot steer
        // the primary-route guide into an unrelated optional launch entrance.
        if(next.start-current.end>10){
          if(distance<current.end+4)return current.offset*(1-smooth((distance-current.end)/4));
          if(distance>next.start-4)return next.offset*smooth((distance-next.start+4)/4);
          return 0;
        }
        return current.offset+(next.offset-current.offset)*smooth((distance-current.end)/(next.start-current.end));
      }
    }
    return last.offset*(1-smooth((distance-last.end)/Math.max(.01,Math.min(4,length-last.end))));
  };
}

function driveCourse(track, { dt=1/120, speed=[2.9,2.75,3.3,3.6,4.1,5,5.4,6.2,6.4,6.7][track.index] }={}) {
  const h=makeHarness(track), points=[];
  for(const step of track.primaryPath||[]) {
    if(step.type==='route') {
      const r=track.routes.find(r=>r.id===step.id),len=courseMath.polylineLength(r.points),count=Math.ceil(len/.6);
      const laneHazards=(track.laneHazards||[]).filter(def=>def.routeId===r.id),dryPoints=r.slowZone?sampleDryCurvePoints(r,r.slowZone,count):null;
      // Calculate hazard envelopes once; the guide only changes mouse input.
      const laneGuide=laneHazards.length?makeLaneGuide(r,laneHazards):null;
      const offsets=laneGuide?Array.from({length:count+1},(_,i)=>laneGuide(len*i/count)):null;
      for(let i=0;i<=count;i++) {
        const d=len*i/count;
        const p=dryPoints?dryPoints[i]:offsets?routeLateralPoint(r,d,offsets[i]):courseMath.samplePath(r.points,d);
        points.push({...p,kind:'surface',routeId:r.id,width:r.width,surfaceKind:r.kind,along:d,laneOffset:offsets?.[i]??(r.slowZone?evaluateDryCurveOffset(r.slowZone,i/count):0)});
      }
    }else if(step.type==='chute') {
      const c=track.chutes.find(c=>c.id===step.id);points.push({...c.points[0],kind:'chute',chuteId:c.id},{...c.receiving,kind:'chute_exit',chuteId:c.id});
    }else if(step.type==='portal') {
      const portal=track.portals.find(p=>p.id===step.id);assert(portal,`${track.id}: missing portal ${step.id}`);
      points.push({...portal.entry,kind:'portal',portalId:portal.id},{...portal.exit,kind:'portal_exit',portalId:portal.id});
    }else if(!step.optional) {
      const prop=(step.type==='mushroom'?track.mushrooms:track.props).find(p=>p.id===step.id);
      points.push({...prop,kind:'launch'},{...prop.target,kind:'landing'});
    }
  }
  assert(points?.length>5,`${track.id}: no authored traversal waypoints`);
  let target=0, wasAssist=false, chuteRides=0, launches=0, portals=0, previousRide=null, lastLaunch=null;const cameraModes=new Set(),portalIds=[];
  const maxTime=Math.max(90,track.length/2.5+30);
  for(let frame=0;frame<maxTime/dt && h.state.phase==='playing';frame++) {
    const assisted=!!(h.b.chuteRide || h.b.launchAssist);
    if((h.b.warpCount||0)>portals){
      portals=h.b.warpCount;portalIds.push(h.b.lastPortal);
      const exit=points.findIndex((p,i)=>i>=target&&p.kind==='portal_exit');
      assert(exit>=0,`${track.id}: native warp has no matching authored itinerary exit`);target=exit;
    }
    if(h.b.chuteRide && h.b.chuteRide!==previousRide) {
      chuteRides++;previousRide=h.b.chuteRide;
      const exit=points.findIndex((p,i)=>i>=target && p.kind==='chute_exit' && p.chuteId===h.b.chuteRide.chute.id);
      if(exit>=0)target=exit;
    }
    if(h.b.launchAssist && h.b.launchAssist!==lastLaunch){
      launches++;lastLaunch=h.b.launchAssist;
      let closest=-1,best=2;
      for(let i=target;i<Math.min(points.length,target+45);i++)if(points[i].kind==='launch'){
        const d=Math.hypot(points[i].x-lastLaunch.start.x,points[i].z-lastLaunch.start.z);
        if(d<best){best=d;closest=i;}
      }
      if(closest>=0)target=closest+1;
    }
    if(wasAssist && !assisted) {
      let closest=target,best=Infinity;
      for(let i=target;i<Math.min(points.length,target+18);i++) {
        const p=points[i],d=Math.hypot(p.x-h.b.x,p.z-h.b.z)+Math.abs(p.y-h.b.y+h.b.r)*3;
        if(d<best){best=d;closest=i;}
      }
      if(best<3)target=closest;
    }
    wasAssist=assisted;
    if(points[target].kind==='surface') {
      let closest=target,best=Infinity;
      for(let i=target;i<Math.min(points.length,target+14);i++) {
        const q=points[i];if(q.kind!=='surface'||q.routeId!==points[target].routeId)break;
        const d=Math.hypot(q.x-h.b.x,q.z-h.b.z)+Math.abs(q.y-h.b.y+h.b.r)*2;
        if(d<best){best=d;closest=i;}
      }
      if(best<2)target=closest;
    }
    while(target<points.length-1 && Math.hypot(points[target].x-h.b.x,points[target].z-h.b.z)<(points[target].width<=3.4?.65:.85) && Math.abs(points[target].y-h.b.y+h.b.r)<1.8)target++;
    const p=points[target];
    let aim=p;
    // Aim ahead on the same floor instead of braking for every60cm sample.
    for(let i=target+1;i<Math.min(points.length,target+7);i++){
      const q=points[i];if(q.kind!=='surface'||q.routeId!==p.routeId)break;
      if(Math.hypot(q.x-h.b.x,q.z-h.b.z)>(p.width<=3.4?1.6:p.width<=4.6?2.4:2.5))break;
      aim=q;
    }
    const dx=aim.x-h.b.x,dz=aim.z-h.b.z,distance=Math.hypot(dx,dz);
    const narrowCruise=track.index>=3?4:2.6;
    let desiredSpeed=p.width<=3.4?narrowCruise:p.width<=4.6?Math.min(speed,6):p.surfaceKind==='ice'?4.8:speed;
    // Brake before narrow entries, launched gaps and sharp changes of direction.
    for(let i=target;i<Math.min(points.length,target+16);i++){
      const q=points[i],d=Math.hypot(q.x-h.b.x,q.z-h.b.z);
      if(q.kind==='chute_exit'||q.kind==='landing'||q.kind==='portal_exit')break;
      if(q.width<=3.4)desiredSpeed=Math.min(desiredSpeed,Math.sqrt(narrowCruise**2+2*3*d));
      if(q.kind==='launch')desiredSpeed=Math.min(desiredSpeed,Math.sqrt(2.2**2+2*3*d));
      const before=points[i-1],after=points[i+1];
      if(before?.kind==='surface'&&q.kind==='surface'&&after?.kind==='surface'){
        const ax=q.x-before.x,az=q.z-before.z,bx=after.x-q.x,bz=after.z-q.z,la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);
        if(la>.1&&lb>.1){
          const angle=Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(la*lb)))),curvature=angle/((la+lb)/2);
          // Brake from route speed before a lane change or a tight geometric
          // corner, using the same full-sweep safe line followed by input.
          const turnSpeed=Math.max(1.7,Math.sqrt(3/Math.max(.001,curvature)));
          desiredSpeed=Math.min(desiredSpeed,Math.sqrt(turnSpeed**2+2*3*d));
        }
      }
    }
    if(p.kind==='launch'||p.kind==='chute'||p.kind==='portal')desiredSpeed=Math.min(desiredSpeed,Math.max(1.6,distance*2));
    else desiredSpeed=Math.min(desiredSpeed,Math.max(.4,distance*3));
    const vx=dx/(distance||1)*desiredSpeed,vz=dz/(distance||1)*desiredSpeed;
    const gain=h.b.grounded?14:6;
    const surface=h.b.grounded?h.context.sampleTrackSurface(h.b.x,h.b.y,h.b.z,h.b.r):null;
    const gravity=surface?26*(5/7)/(1+surface.slopeX**2+surface.slopeZ**2):0;
    const ax=(vx-h.b.vx)*gain+(surface?.slopeX||0)*gravity*18/4.05;
    const az=(vz-h.b.vz)*gain+(surface?.slopeZ||0)*gravity*18/4.05;
    h.step(dt,assisted?0:ax,assisted?0:az,18);cameraModes.add(h.state.director.mode);
    if(h.state.pops)break;
    if(process.argv.includes(`--trace=${track.id}`) && frame%Math.round(1/dt)===0)console.log(JSON.stringify({trace:track.id,t:+h.state.elapsed.toFixed(2),target,p,aim,ax,az,supportRoute:h.b.supportRoute?.id,supportPlatform:h.b.supportPlatform?.role,ball:{x:h.b.x,y:h.b.y,z:h.b.z,grounded:h.b.grounded,vx:h.b.vx,vy:h.b.vy,vz:h.b.vz}}));
  }
  return {track:track.id,hz:Math.round(1/dt),cleared:!!h.state.cleared,pops:h.state.pops,seconds:+h.state.elapsed.toFixed(2),remaining:+h.state.timeLeft.toFixed(2),earnedTime:+(h.state.timeLeft+h.state.elapsed+(h.state.timePenaltyTotal||0)-track.bonusTime).toFixed(2),penalties:h.state.timePenaltyTotal||0,target,targets:points.length,chuteRides,launches,portals,portalIds,falls:h.events.filter(e=>e.type==='fall').length,cameraModes:[...cameraModes],end:{x:+h.b.x.toFixed(2),y:+h.b.y.toFixed(2),z:+h.b.z.toFixed(2)},events:h.events};
}
const rateArgument=process.argv.find(a=>a.startsWith('--route-hz='));
const routeRates=rateArgument?[Number(rateArgument.split('=')[1])]:[120,60,25];
for(const hz of routeRates)assert(hz>=25 && hz<=240,'route rate must be25..240Hz');
for(const routeHz of routeRates)for(const track of TRACKS.filter(t=>!process.argv.some(a=>a.startsWith('--course='))||process.argv.includes(`--course=${t.id}`)))check(`v4.1 input-only complete course at${routeHz}Hz: ${track.id}`,()=>{
  const receipt=driveCourse(track,{dt:1/routeHz});
  assert(receipt.cleared,`course cannot finish through real movement: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.pops,0,`route pops: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.falls,0,`route falls: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.portals,(track.portals||[]).length,'complete run skipped paired portal');
  assert.deepEqual(receipt.portalIds,(track.primaryPath||[]).filter(p=>p.type==='portal').map(p=>p.id),'complete run used wrong portal order');
  assert(receipt.remaining>=0,`course exhausted its authored timer and earned bonuses: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.chuteRides,(track.chutes||[]).length,'complete run skipped authored chute');
  if(track.chutes.length)assert(receipt.cameraModes.includes('LOCKED_CHUTE'),'complete run never enters chute camera');
  if(track.cameraZones.length)assert(receipt.cameraModes.includes('MANUAL_ORBIT'),'complete run never enters authored precision camera');
  if(track.flagship==='C')assert.equal(receipt.portals,3,'cosmic traversal must ride A, B and C natively');
  return receipt;
});

console.log(JSON.stringify({checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
