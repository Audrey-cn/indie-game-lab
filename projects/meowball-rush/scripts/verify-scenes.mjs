// Node-only scene structure and geometry checks. This does not render WebGL or
// validate lighting, textures, frame rate, visual appearance, or runtime physics.
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHash } from "node:crypto";
import { getRouteRibbonRows, getChuteShellRows, getCompanionChute, prepareRouteGeometry, nearestRouteSurface, getRibbonBoundarySegments } from "../src/course-math.mjs";
import { evaluateDryCurveOffset, sampleDryCurvePoints } from "../src/mud-curve.mjs";
import { nearestSceneryClearance } from "../src/scenery-clearance.mjs";
import { collideRouteGuardrails, sampleRollingRouteSurface, isSurfaceInContactWindow, resolveSphereFloorContact, fairytalePropPosition } from "../src/course-runtime.mjs";
import { animateSpikeTraps } from '../src/spike-traps.mjs';
import { animateStageV42Landmarks } from '../src/world-landmarks-v42.mjs';
import { verifyRibbonMesh, verifyMeshCheckerFixtures, verifyMeshPairSeparation } from "./mesh-checks.mjs";
import "./verify-fall-feedback.mjs";
import { createRouteRibbonGeometry, createChuteShellGeometry, animateFairytaleScenery, activateCheckpoint, disposeCourseSceneResources } from "../src/v3-worlds.mjs";
import { boostRibbonGeometry } from "../src/course-geometry.mjs";
import { createDirector, updateDirector, triggerSetpiece } from "../src/director.mjs";
import { createCameraOcclusion, isCameraOccluder } from "../src/camera-occlusion.mjs";
import { capturePortal } from '../src/portal-runtime.mjs';
import { createCameraSightline } from "../src/camera-sightline.mjs";
import { verifyCameraOcclusion } from "./verify-camera-occlusion.mjs";
import { verifyMushroomContact } from "./verify-mushroom-contact.mjs";
import "./verify-assets.mjs";
const { buildTrackScene, getSideWallOpenings, getEndWallOpenings } = await import("../src/cel-builder.mjs");
import { TRACKS } from "../src/config.mjs";

// Procedural textures only need a canvas-shaped object to construct the scenes.
// Drawing calls are deliberately no-ops; pixel output is outside this check.
const gradient = { addColorStop() {} };
const context = new Proxy({}, {
  get: (_, key) => key === "createLinearGradient" || key === "createRadialGradient"
    ? () => gradient
    : () => {},
});
globalThis.document = { createElement: () => ({ getContext: () => context }) };

const close = (actual, expected, label, tolerance = 0.00001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
};

const results = [];
await verifyCameraOcclusion();
// An upper deck must fade even when a low under-table camera ray never hits
// its top. The lower supporting floor must retain its exact material.
function verifyStackedDeckCutaway(){
  let samples=0;
  for(const hz of [120,60,25]){
    const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0xa47a4e});
    const lower=new THREE.Mesh(new THREE.BoxGeometry(12,.6,12),material),upper=new THREE.Mesh(new THREE.BoxGeometry(12,.6,12),material);
    lower.position.y=1.2;upper.position.y=11.7;lower.userData.cameraOcclusionDeck=true;upper.userData.cameraOcclusionDeck=true;root.add(lower,upper);
    const ball={x:0,y:2.12,z:0,r:.62},pose={x:0,y:5,z:10},safety=createCameraOcclusion(root),dt=1/hz;
    assert(isCameraOccluder(upper,root),'stacked upper deck cannot participate in fade');
    safety.update(ball,pose,dt);assert(upper.material.opacity<1&&upper.material.opacity>.16,'upper deck does not ease on underpass');
    for(let frame=0;frame<hz;frame++){safety.update(ball,pose,dt);samples++;}
    close(upper.material.opacity,.16,'upper deck cutaway opacity',.001);assert(!upper.material.depthWrite&&upper.material.transparent);
    assert.equal(lower.material,material,'supporting floor faded with upper deck');
    safety.reset();ball.y=11.59;
    for(let frame=0;frame<hz;frame++)safety.update(ball,{x:0,y:13.38,z:10},dt);
    close(upper.material.opacity,.16,'shallow intersecting upper deck cutaway opacity',.001);
    assert.equal(lower.material,material,'lower supporting deck faded during shallow cutaway');
    ball.x=30;safety.update(ball,{x:30,y:5,z:10},dt);assert(upper.material.opacity>.16&&upper.material.opacity<1,'upper deck restores abruptly');
    for(let frame=0;frame<hz*3;frame++)safety.update(ball,{x:30,y:5,z:10},dt);
    assert.equal(upper.material,material,'upper deck did not restore original material');safety.dispose();lower.geometry.dispose();upper.geometry.dispose();material.dispose();
  }
  console.log(`Passed stacked-tier under-deck cutaway at 120/60/25Hz (${samples} settling frames).`);
}
verifyStackedDeckCutaway();
let cameraSamples = 0, cameraRays = 0, cameraPaths = 0, cameraContainmentChecks = 0, rigidSightIntersections = 0;
const cameraFailures = [];
const sightRay = new THREE.Raycaster(), eye = new THREE.Vector3(), focus = new THREE.Vector3();
const viewDirection = new THREE.Vector3(), viewRight = new THREE.Vector3(), viewUp = new THREE.Vector3(), sightTarget = new THREE.Vector3();
const sightCamera=new THREE.PerspectiveCamera(),sightFrustum=new THREE.Frustum(),sightProjection=new THREE.Matrix4(),sightBounds=new THREE.Box3();
const bubbleSphere=new THREE.Sphere(),bubbleEntry=new THREE.Vector3();
let sightMeshes=[];
const silhouette = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]];
const hierarchy = node => {
  const names = [];
  for (let p = node; p; p = p.parent) if (p.name) names.unshift(p.name);
  return names.join('/') || node.geometry.type;
};
function sightBlockers(group, pose, ball) {
  const hits = new Set();
  eye.set(pose.x,pose.y,pose.z);focus.set(ball.x,ball.y,ball.z);
  sightCamera.position.copy(eye);sightCamera.lookAt(focus);sightCamera.near=.001;sightCamera.far=eye.distanceTo(focus)+.62;
  sightCamera.fov=2*Math.asin(Math.min(.99,.63/eye.distanceTo(focus)))*180/Math.PI;sightCamera.aspect=1;sightCamera.updateProjectionMatrix();sightCamera.updateMatrixWorld(true);
  sightFrustum.setFromProjectionMatrix(sightProjection.multiplyMatrices(sightCamera.projectionMatrix,sightCamera.matrixWorldInverse));
  // Exact Raycaster triangles remain the assertion. This conservative cone
  // broad phase reduces repeated triangle work on remote world geometry.
  const candidates=sightMeshes.filter(mesh=>{
    if(!isVisible(mesh))return false;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(!materials.some(m=>m.visible&&(!m.transparent||m.opacity>=.85)))return false;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    sightBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    return sightBounds.containsPoint(eye)||sightFrustum.intersectsBox(sightBounds);
  });
  viewDirection.subVectors(focus,eye).normalize();viewRight.crossVectors(viewDirection,THREE.Object3D.DEFAULT_UP).normalize();viewUp.crossVectors(viewRight,viewDirection).normalize();
  bubbleSphere.center.copy(focus);bubbleSphere.radius=ball.r||.62;
  for (const [x,y] of silhouette) {
    // Stop at the bubble's front surface so its honest floor/contact surface is
    // retained. Diagonal vectors are normalized to sample the actual .62m rim.
    const offset=Math.hypot(x,y)||1,rx=x/offset*.62,ry=y/offset*.62;
    sightTarget.copy(focus).addScaledVector(viewRight,rx).addScaledVector(viewUp,ry);
    sightRay.set(eye,sightTarget.sub(eye).normalize());sightRay.near=.01;
    // At finite camera distance even an equator-plane rim ray enters the front
    // of the sphere before reaching its endpoint. A guard behind that entry is
    // concealed by the bubble, rather than an obstruction in front of it.
    assert.ok(sightRay.ray.intersectSphere(bubbleSphere,bubbleEntry),'silhouette ray misses bubble');
    sightRay.far=eye.distanceTo(bubbleEntry)-.015;
    for(const hit of sightRay.intersectObjects(candidates,false)) {
      if(!hit.object.isMesh || !isVisible(hit.object)) continue;
      const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
      // Transparent glass is intentionally visible through. Every opaque mesh,
      // including receiving decks, upper roads, outlines and walls, is tested.
      if(m.visible && (!m.transparent || m.opacity>=.85)) hits.add(hit.object);
    }
    cameraRays++;
  }
  return [...hits];
}
function recordSight(group, pose, ball, label) {
  cameraSamples++;
  const blockers=sightBlockers(group,pose,ball);
  rigidSightIntersections+=blockers.filter(mesh=>!isCameraOccluder(mesh,group)).length;
  const structural=blockers.filter(mesh=>isCameraOccluder(mesh,group));
  if(structural.length)cameraFailures.push({label,ball:[ball.x,ball.y,ball.z],eye:[pose.x,pose.y,pose.z],blockers:structural.map(hierarchy)});
  return blockers;
}
function verifyCameraScene(track,group,dynamicMeshes) {
  const safety=createCameraOcclusion(group),sightline=createCameraSightline(group),sky=group.getObjectByName('storybook-sky');
  sightMeshes=[];group.traverse(mesh=>{if(mesh.isMesh)sightMeshes.push(mesh);});
  const resetPickups=()=>{for(const star of dynamicMeshes.stars){star.collected=false;star.mesh.visible=true;}};
  const frame=(ball,elapsed)=>{
    animateSpikeTraps(dynamicMeshes,elapsed);
    animateStageV42Landmarks(dynamicMeshes,elapsed,1/60);
    animateFairytaleScenery(dynamicMeshes,elapsed,1/60);
    for(const gear of dynamicMeshes.gears)gear.mesh.rotation.y=gear.def.omega*elapsed;
    for(const hammer of dynamicMeshes.hammers){
      const angle=Math.sin(elapsed*hammer.def.speed+hammer.def.phase)*hammer.def.amp;
      hammer.pivot.rotation.z=angle;
      hammer.worldHead.set(hammer.def.x+Math.sin(angle)*hammer.def.len,hammer.def.y-Math.cos(angle)*hammer.def.len,hammer.def.z);
      // LOS observes the post-physics ball. Match the main collision boundary:
      // a resting path fixture cannot remain embedded inside an opaque hammer.
      if(!ball.chuteRide&&!ball.launchAssist){
        const dx=ball.x-hammer.worldHead.x,dy=ball.y-hammer.worldHead.y,dz=ball.z-hammer.worldHead.z,d=Math.hypot(dx,dy,dz),hit=.62+.92;
        if(d<hit){ball.previousBottom=ball.y-ball.r;const inverse=1/(d||.001);ball.x=hammer.worldHead.x+dx*inverse*(hit+.08);ball.y=hammer.worldHead.y+dy*inverse*(hit+.08);ball.z=hammer.worldHead.z+dz*inverse*(hit+.08);ball.grounded=false;ball.supportRoute=null;ball.supportPlatform=null;
          resolveSphereFloorContact(ball,hammer.worldHead,hit+.08,q=>{
            let floor=sampleRollingRouteSurface(track.routes,q);
            for(const platform of track.platforms){
              if(['ramp','ice_ramp','trough','elevator'].includes(platform.kind))continue;
              if(Math.abs(q.x-platform.x)>platform.w/2+q.r*.35||Math.abs(q.z-platform.z)>platform.d/2+q.r*.35||!isSurfaceInContactWindow(q,platform.y))continue;
              if(!floor||platform.y>floor.y)floor={y:platform.y};
            }
            return floor;
          });
        }
      }
    }
    for(const pin of dynamicMeshes.rollingPins||[]){const offset=Math.sin(elapsed*pin.def.speed+(pin.def.phase||0))*pin.def.ampZ;pin.mesh.position.z=pin.def.z+offset;pin.roller.rotation.x=offset/.48;}
    for(const vent of dynamicMeshes.steamVents||[])vent.plume.visible=(elapsed%vent.def.period)/vent.def.period<vent.def.duty;
    for(const cloud of dynamicMeshes.clouds)cloud.mesh.position.x=cloud.baseX+Math.sin(elapsed*.3+cloud.seed)*1.4;
    for(const floater of dynamicMeshes.floaters||[])floater.mesh.position.y=floater.baseY+Math.sin(elapsed*.8+floater.seed)*.45;
    if(dynamicMeshes.portal)dynamicMeshes.portal.rotation.z=elapsed*2;
    // Match updatePhysics pickup ordering, then updateVisuals bob/visibility.
    // A candy inside the bubble is already collected before a rendered frame.
    for(const star of dynamicMeshes.stars){
      if(Math.hypot(ball.x-star.def.x,ball.y-star.def.y,ball.z-star.def.z)<.62+.9)star.collected=true;
      star.mesh.visible=!star.collected;
      if(!star.collected){star.mesh.rotation.y=elapsed*2.6;star.mesh.position.y=star.def.y+Math.sin(elapsed*4+star.def.x)*.16;}
    }
    sky?.position.set(ball.x,ball.y,ball.z);group.updateMatrixWorld(true);
  };
  // Starts/reset poses must be authored clear before either safety mechanism.
  for(const aspect of [1.6,.62])for(const dt of [1/120,1/60,1/25]) {
    safety.reset();sightline.reset();resetPickups();const ball={...track.start,r:.62,vx:0,vz:0};frame(ball,0);
    const pose=updateDirector(createDirector(track.startYaw||0),{ball,track,dt,aspect});
    const untouched=sightline.resolve(ball,pose,dt);
    for(const key of Object.keys(pose))assert.deepEqual(untouched[key],pose[key],`${track.id}: start sightline changed director ${key}`);
    assert.equal(untouched.sightline.compressed,false,`${track.id}: sightline compressed start pose`);
    safety.update(ball,untouched,.5);recordSight(group,untouched,ball,`${track.id}: settled authored start ${aspect}/${dt}`);
    // A FrontSide box can enclose the eye without returning any front-face
    // hits. Check its exact local volume independently of renderer-side rays.
    for(const mesh of sightMeshes)if(isVisible(mesh)&&mesh.geometry.type==='BoxGeometry') {
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if(!materials.some(m=>m.visible&&(!m.transparent||m.opacity>=.85)))continue;
      mesh.geometry.computeBoundingBox();cameraContainmentChecks++;
      const localEye=mesh.worldToLocal(new THREE.Vector3(pose.x,pose.y,pose.z));
      if(mesh.geometry.boundingBox.containsPoint(localEye))cameraFailures.push({label:`${track.id}: start camera inside closed mesh`,blockers:[hierarchy(mesh)]});
    }
  }
  // Visit every authored path, including secret routes, chute entrances/exits
  // and both road edges. Integrate director state at every geometry point;
  // assertions at every geometry sample avoid the static-camera/teleport shortcut.
  const flights=[...track.props,...track.mushrooms].filter(def=>def.target&&def.flightTime).map(def=>({
    id:`flight-${def.id}`,sourceId:def.id,ballistic:true,points:Array.from({length:Math.ceil(def.flightTime*60)+1},(_,i)=>{
      const t=Math.min(def.flightTime,i/60);return{x:def.x+def.vx*t,y:def.y+def.vy*t-13*t*t,z:def.z+def.vz*t};
    }),
  }));
  const portalPaths=(track.portals||[]).map(portal=>({id:portal.id,portal,points:[portal.exit]}));
  const paths=[...track.routes,...track.chutes,...flights,...portalPaths],runs=paths.flatMap(path=>(track.chutes.includes(path)||path.ballistic||path.portal?[0]:[-.32,0,.32]).map(lane=>({paths:[path],lane})));
  // Preserve one director through the actual itinerary as well as testing
  // independent reset/edge approaches. Launch arcs trigger the same setpiece.
  runs.push({lane:0,paths:track.primaryPath.filter(step=>!step.optional).map(step=>paths.find(path=>path.id===step.id||path.sourceId===step.id)).filter(Boolean)});
  for(const run of runs) {
    const {lane}=run;cameraPaths+=run.paths.length;safety.reset();sightline.reset();resetPickups();const director=createDirector(track.startYaw||0);let elapsed=0;
    for(const path of run.paths){
    if(path.ballistic)triggerSetpiece(director,1.2);
    for(let i=0;i<path.points.length;i++) {
      const p=path.points[i],prev=path.points[Math.max(0,i-1)],f=path.points[Math.min(path.points.length-1,i+1)];
      const dx=f.x-prev.x,dz=f.z-prev.z,length=Math.hypot(dx,dz)||1,tx=dx/length,tz=dz/length;
      const dt=path.ballistic?1/60:Math.max(1/120,Math.hypot(p.x-prev.x,p.y-prev.y,p.z-prev.z)/8);elapsed+=dt;
      const data=track.chutes.includes(path)||path.ballistic||path.portal?null:getRouteRibbonRows(path),side=Math.sign(lane);
      // Center a full-radius ball just inside either legal edge. Fixed row
      // columns put a narrow-beam ball halfway over its banked guard/skirt.
      const offset=data?side*Math.max(0,(side<0?data.leftWidths[i]:data.rightWidths[i])-.62)*.9:0;
      const point={x:p.x+(data?.frames[i].nx??0)*offset,y:p.y,z:p.z+(data?.frames[i].nz??0)*offset};
      const ball={x:point.x,y:point.y+.62,z:point.z,r:.62,vx:tx*8,vz:tz*8,vy:(p.y-prev.y)/dt,routeTangent:{x:tx,z:tz}};
      if(data){
        // Ground stations are valid contact poses, not an invented full-course
        // physics rollout. At a dock edge the sphere follows its solid top or
        // corner envelope instead of teleporting through a descending-pad lip.
        const floor=nearestRouteSurface([path],ball.x,ball.z,Infinity)?.y??point.y;
        ball.y=floor+.62;ball.grounded=true;ball.supportRoute=path;
        for(const platform of track.platforms){
          if(ball.y<platform.y-(platform.h||.6)/2)continue;
          const dx=Math.max(0,Math.abs(ball.x-platform.x)-platform.w/2),dz=Math.max(0,Math.abs(ball.z-platform.z)-platform.d/2),distance=Math.hypot(dx,dz);
          if(distance>=.62)continue;
          const top=platform.y+Math.sqrt(.62**2-distance**2);
          if(top>ball.y){ball.y=top;ball.supportRoute=null;ball.supportPlatform=platform;}
        }
        if(collideRouteGuardrails(ball,ball.supportRoute)){
          const contact=nearestRouteSurface([path],ball.x,ball.z,Infinity);
          if(contact)ball.y=contact.y+.62;
        }
      }
      if(track.chutes.includes(path)){ball.chuteRide={};ball.chuteTangent={x:tx,z:tz};}
      if(path.ballistic)ball.launchAssist={};
      if(path.portal){capturePortal(ball,path.portal,director);close(director.yaw,path.portal.exit.yaw,`${track.id}/${path.id}: arrival camera yaw`,.00001);}
      frame(ball,elapsed);
      const desired=updateDirector(director,{ball,track,dt,elapsed,forwardInput:1});
      const pose=sightline.resolve(ball,desired,dt);
      for(const key of Object.keys(desired))assert.deepEqual(pose[key],desired[key],`${track.id}: sightline changed director ${key}`);
      assert.equal(pose.sightline.compressed,false,`${track.id}: sightline compressed camera`);
      // Fixed-pose scene geometry audit after .5s fade settling. Temporal easing
      // itself is covered at 120/60/25Hz in verify-camera-occlusion.
      safety.update(ball,pose,.5);
      const blockers=recordSight(group,pose,ball,`${track.id}/${path.id}[${i}] lane ${lane}`);
      for(const mesh of blockers)if(isCameraOccluder(mesh,group))assert.fail(`${track.id}/${path.id}[${i}] lane ${lane}: scenery safety missed ${hierarchy(mesh)} ball ${JSON.stringify({x:ball.x,y:ball.y,z:ball.z,support:ball.supportRoute?.id})} pose ${JSON.stringify({x:pose.x,y:pose.y,z:pose.z})}`);
    }
    }
  }
  safety.dispose();
  console.log(`${track.id}: completed authored-start and every-path camera LOS audit`);
}
const motifHashes=new Set(),edgeProfiles=new Set(),stageSignatures=new Set();
let verifiedTriangles=0,intersectionPairs=0,crossShellPairs=0,crossRoutePairs=0,crossSurfacePairs=0,seamCount=0,closedGuardEnds=0,checkedScenery=0;
let disposedCourseGeometries=0,disposedCourseMaterials=0,preservedForestMaterials=0;
let checkedV42Landmarks=0,checkedV42AnimatedParts=0,disposedV42Geometries=0,disposedV42Materials=0;
verifyMeshCheckerFixtures();
// The original reflected-strand defect requires an actual helix. Stage07 now
// uses a rollercoaster, so retain that regression against the ancient-oak coil.
{
  const source=TRACKS[3].chutes.find(chute=>chute.style==='helix');
  assert(source,'legacy reflected-strand fixture needs the preserved oak helix');
  const primary=createChuteShellGeometry(source),legacy=createChuteShellGeometry({...source,width:source.width*.82,points:source.points.map(p=>({x:source.center.x*2-p.x,y:p.y+.65,z:source.center.z*2-p.z}))});
  assert.throws(()=>verifyMeshPairSeparation(primary,legacy,'legacy mirrored helix'),/separate shells intersect/,'regression did not expose the original crossing strands');
  primary.dispose();legacy.dispose();
}
// Exercise every new mechanism even if a course accidentally loses its definition.
const hazardFixture = { ...TRACKS[0], id: 'hazard-fixture',
  rollingPins: [{ x: 0, y: 8.48, z: -1, width: 2, ampZ: 0.9, speed: 1.2, phase: 0 }],
  bumpers: [{ x: 2, y: 8, z: 0, r: 0.8 }],
  steamVents: [{ x: 0, y: 8, z: 1, r: 0.7, period: 4, duty: 0.4, vy: 4, vz: -6 }],
  hammers: [{ x: 0, y: 12, z: -2, len: 3, amp: 0.7, speed: 1, phase: 0, variant: 'flail' }],
};
const isVisible = (node) => !node || (node.visible && isVisible(node.parent));
function verifyFallback(fallback, anchor, parent, label) {
  assert.equal(fallback?.parent, parent, `${label}: fallback detached from moving hazard`);
  assert.equal(anchor?.parent, parent, `${label}: GLB anchor detached from moving hazard`);
  assert.notEqual(fallback, anchor, `${label}: fallback and GLB need independent visibility`);
  let visibleGeometry = 0;
  fallback.traverse((node) => { if (node.isMesh && isVisible(node)) visibleGeometry++; });
  assert.ok(visibleGeometry > 0, `${label}: missing visible primitive fallback before GLB load`);
}
function verifyHazardEntries(track, dynamicMeshes) {
  assert.equal(dynamicMeshes.spikes?.length,(track.spikes||[]).length,`${track.id}: missing spike meshes`);
  for(const entry of dynamicMeshes.spikes||[]) {
    assert.equal(entry.def,(track.spikes||[]).find(def=>def===entry.def));
    assert(entry.plate.geometry.attributes.position.count>0);assert.equal(entry.tips.children.length,5);
    for(const [time,phase,visible] of [[.2,'telegraph',false],[.8,'active',true],[2,'retracted',false]]) {
      animateSpikeTraps({spikes:[entry]},time-(entry.def.phase||0));
      assert.equal(entry.phase,phase);assert.equal(entry.tips.visible,visible);
      assert(entry.ring.material.opacity>0,'trap has no visible warning ring');
      if(visible)assert(entry.tips.children.every(tip=>tip.scale.y>0&&tip.position.y>entry.def.y));
    }
    animateSpikeTraps({spikes:[entry]},0);
  }
  for (const key of ['rollingPins', 'bumpers', 'steamVents']) {
    assert.ok(Array.isArray(dynamicMeshes[key]), `${track.id}: missing ${key} dynamic registration`);
    assert.equal(dynamicMeshes[key].length, (track[key] || []).length, `${track.id}: ${key} registration count`);
    for (const entry of dynamicMeshes[key]) {
      assert.ok(track[key].includes(entry.def), `${track.id}: ${key} registration lost its definition`);
      const parent = key === 'rollingPins' ? entry.roller : entry.mesh;
      verifyFallback(entry.fallback, entry.modelAnchor, parent, `${track.id}: ${key}`);
      close(entry.mesh.position.x, entry.def.x, `${track.id}: ${key} X`);
      close(entry.mesh.position.y, entry.def.y, `${track.id}: ${key} Y`);
      close(entry.mesh.position.z, entry.def.z, `${track.id}: ${key} Z`);
      if (key === 'rollingPins') {
        assert.equal(entry.roller.parent, entry.mesh, `${track.id}: pin spin detached from translating body`);
        const bounds = new THREE.Box3().setFromObject(entry.fallback, true);
        assert.ok(bounds.max.x - bounds.min.x >= entry.def.width, `${track.id}: pin barrel not aligned along X`);
        assert.ok(bounds.max.z - bounds.min.z < 1.1, `${track.id}: pin cylinder radius differs from physics`);
      }
      if (key === 'steamVents') {
        assert.equal(entry.plume?.parent, entry.mesh, `${track.id}: plume hidden with the replaced fallback/model`);
        assert.equal(entry.plume.visible, false, `${track.id}: inactive plume should start hidden`);
        entry.fallback.visible = false;
        entry.plume.visible = true;
        assert.ok(isVisible(entry.plume), `${track.id}: loaded GLB would hide the steam plume`);
        entry.fallback.visible = true;
        entry.plume.visible = false;
      }
    }
  }
  for (const entry of dynamicMeshes.hammers) {
    verifyFallback(entry.headFallback, entry.modelAnchor, entry.head, `${track.id}: ${entry.def.variant || 'hammer'}`);
    assert.equal(entry.head.parent, entry.pivot, `${track.id}: hammer/flail head must follow pendulum pivot`);
    close(entry.head.position.y, -entry.def.len, `${track.id}: hammer/flail contact center`);
  }
}

let checkedBorders=0,checkedForestClusters=0,checkedDryCurves=0,checkedBankedRows=0,checkedBackdrops=0,checkedSceneryVertices=0;
function verifyWorldLayers(track,group,dynamic) {
  assert(dynamic.diegeticBorders?.length>100,`${track.id}: sparse close-up diegetic border layer`);
  assert(dynamic.dioramaBackdrops?.length>=12,`${track.id}: missing surrounding diorama ring`);
  assert.deepEqual([...new Set(dynamic.dioramaBackdrops.map(entry=>entry.layer))].sort(),[0,1]);
  const batches=new Set([...dynamic.diegeticBorders,...dynamic.dioramaBackdrops].flatMap(entry=>entry.parts.map(part=>part.mesh)));
  const routeLength=track.routes.reduce((sum,route)=>sum+getRouteRibbonRows(route).distances.at(-1),0);
  // v4.1 extends the flagships with additional route-local batches and makes
  // later courses longer. Retain per-route/per-metre budgets as they expand.
  assert(batches.size<=Math.max(300,track.routes.length*20),`${track.id}: close/backdrop scenery lost material batching`);
  assert([...batches].reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0)<=Math.max(450000,routeLength*650),`${track.id}: storybook scenery exceeded geometry budget`);
  if(track.worldType==='grand_medley')assert(dynamic.diegeticBorders.some(entry=>entry.parts.some(part=>part.mesh.material.emissiveIntensity>.1)),`${track.id}: starlight crystal borders have no actual glow`);
  // Independent polygon separation test, using the rendered road's actual
  // cross-sections. Every retained scenery vertex must fit its checked envelope.
  const floors=track.routes.flatMap(route=>{
    const data=getRouteRibbonRows(route);
    return data.rows.slice(1).map((row,i)=>[data.rows[i][0],data.rows[i].at(-1),row.at(-1),row[0]]);
  });
  const bounds=polygon=>({minX:Math.min(...polygon.map(p=>p.x)),maxX:Math.max(...polygon.map(p=>p.x)),minZ:Math.min(...polygon.map(p=>p.z)),maxZ:Math.max(...polygon.map(p=>p.z))});
  const floorBounds=floors.map(bounds);
  function intersects(a,b) {
    for(const poly of [a,b])for(let i=0;i<poly.length;i++) {
      const p=poly[i],q=poly[(i+1)%poly.length],nx=-(q.z-p.z),nz=q.x-p.x;
      if(Math.hypot(nx,nz)<1e-8)continue;
      const pa=a.map(v=>v.x*nx+v.z*nz),pb=b.map(v=>v.x*nx+v.z*nz);
      if(Math.max(...pa)<=Math.min(...pb)+1e-6||Math.max(...pb)<=Math.min(...pa)+1e-6)return false;
    }
    return true;
  }
  const worldPoint=new THREE.Vector3();
  for(const entry of dynamic.diegeticBorders) {
    assert(track.routes.some(route=>route.id===entry.routeId&&route.walls),`${track.id}: border has no guarded source road`);
    assert(entry.parts.length,`${track.id}: empty border receipt`);
    const box=bounds(entry.footprint);
    for(let i=0;i<floors.length;i++) {
      const b=floorBounds[i];if(b.maxX<box.minX||b.minX>box.maxX||b.maxZ<box.minZ||b.minZ>box.maxZ)continue;
      assert(!intersects(entry.footprint,floors[i]),`${track.id}/${entry.routeId}: diegetic border intrudes into an actual road quad`);
    }
    for(const part of entry.parts) {
      assert(isAttached(part.mesh,group));assert(isCameraOccluder(part.mesh,group));
      const vertices=part.mesh.geometry.attributes.position;
      for(let i=part.firstVertex;i<part.firstVertex+part.vertexCount;i++) {
        worldPoint.fromBufferAttribute(vertices,i).applyMatrix4(part.mesh.matrixWorld);
        assert(worldPoint.x>=box.minX-1e-4&&worldPoint.x<=box.maxX+1e-4&&worldPoint.z>=box.minZ-1e-4&&worldPoint.z<=box.maxZ+1e-4,`${track.id}: border vertex leaves verified envelope`);
        for(let edge=0;edge<4;edge++) {
          const a=entry.footprint[edge],b=entry.footprint[(edge+1)%4],dx=b.x-a.x,dz=b.z-a.z;
          const centerCross=dx*(entry.center.z-a.z)-dz*(entry.center.x-a.x);
          const vertexCross=dx*(worldPoint.z-a.z)-dz*(worldPoint.x-a.x);
          assert(vertexCross*Math.sign(centerCross)>=-1e-4,`${track.id}: actual border vertex leaves rotated clearance footprint`);
        }
        checkedSceneryVertices++;
      }
    }
    if(entry.edge) {
      const distance=(entry.center.x-entry.edge.a.x)*entry.edge.nx+(entry.center.z-entry.edge.a.z)*entry.edge.nz;
      assert(distance>.3&&distance<1.2,`${track.id}: border does not hug exposed track edge`);
    }
    checkedBorders++;
  }
  for(const entry of dynamic.dioramaBackdrops) {
    let actualRadius=0;
    for(const part of entry.parts) {
      const vertices=part.mesh.geometry.attributes.position;
      for(let i=part.firstVertex;i<part.firstVertex+part.vertexCount;i++) {
        worldPoint.fromBufferAttribute(vertices,i).applyMatrix4(part.mesh.matrixWorld);
        actualRadius=Math.max(actualRadius,Math.hypot(worldPoint.x-entry.center.x,worldPoint.z-entry.center.z));checkedSceneryVertices++;
      }
    }
    assert(actualRadius>3&&actualRadius<=entry.radius+1e-4,`${track.id}: backdrop footprint omits actual silhouette`);
    const clearance=nearestSceneryClearance(track,{x:entry.center.x,z:entry.center.z,radius:actualRadius});
    assert(clearance.margin>=20-1e-4&&clearance.margin<=85+1e-4,`${track.id}: backdrop outside20..85m route clearance`);checkedBackdrops++;
  }
  const forest=dynamic.forestDensityBorders;
  assert(forest?.isGroup&&isAttached(forest,group),`${track.id}: dense roadside layer is missing or detached`);
  const clusters=forest.children;
  const boundaryLength=track.routes.reduce((sum,route)=>sum+getRibbonBoundarySegments(route).reduce((length,edge)=>length+Math.hypot(edge.b.x-edge.a.x,edge.b.z-edge.a.z),0),0);
  assert(clusters.length>=Math.max(40,boundaryLength/12),`${track.id}: roadside density is too low (${clusters.length} clusters / ${boundaryLength.toFixed(1)}m exposed edge)`);
  assert.equal(forest.userData.borderCount,clusters.length,`${track.id}: forest count receipt differs from rendered clusters`);
  assert.equal(forest.userData.placements.length,clusters.length,`${track.id}: forest placement receipt differs from rendered clusters`);
  assert.deepEqual([...new Set(clusters.map(cluster=>cluster.userData.side))].sort(),[-1,1],`${track.id}: dense borders cover only one roadside`);
  const forestBatches=forest.userData.batchMeshes;
  assert(Array.isArray(forestBatches)&&forestBatches.length>0,`${track.id}: dense roadside geometry has no material batches`);
  assert.equal(forest.userData.drawCallsAfter,forestBatches.length,`${track.id}: dense border draw-call receipt differs from actual batches`);
  assert(forest.userData.drawCallsAfter<forest.userData.drawCallsBefore*.35,`${track.id}: roadside density lost practical material batching`);
  // This uses the actual banked shell triangles, companion strand and landing
  // rectangles, independently of the forest factory's clearance receipt.
  const allFloors=[...floors];
  for(const chute of [...track.chutes,...track.chutes.filter(chute=>chute.doubleHelix).map(getCompanionChute)]) {
    const data=getChuteShellRows(chute);
    for(let i=1;i<data.rows.length;i++)for(let j=1;j<=data.columns;j++) {
      const a=data.rows[i-1][j-1],b=data.rows[i-1][j],c=data.rows[i][j-1],d=data.rows[i][j];
      allFloors.push([a,b,c],[b,d,c]);
    }
  }
  for(const p of track.platforms||[])allFloors.push([{x:p.x-p.w/2,z:p.z-p.d/2},{x:p.x+p.w/2,z:p.z-p.d/2},{x:p.x+p.w/2,z:p.z+p.d/2},{x:p.x-p.w/2,z:p.z+p.d/2}]);
  const allBounds=allFloors.map(bounds),clearanceCells=new Map(),cellSize=8;
  for(let i=0;i<allFloors.length;i++) {
    const box=allBounds[i];
    for(let x=Math.floor(box.minX/cellSize);x<=Math.floor(box.maxX/cellSize);x++)for(let z=Math.floor(box.minZ/cellSize);z<=Math.floor(box.maxZ/cellSize);z++) {
      const key=`${x}/${z}`;if(!clearanceCells.has(key))clearanceCells.set(key,[]);clearanceCells.get(key).push(i);
    }
  }
  for(const cluster of clusters) {
    const meta=cluster.userData,box=bounds(meta.footprint);
    assert(track.routes.some(route=>route.id===meta.routeId),`${track.id}: dense border has no source road`);
    assert(meta.elementCount>=12&&meta.parts?.length>0,`${track.id}: dense border lacks sculpted detail or mesh receipts`);
    assert.equal(meta.footprint.length,4,`${track.id}: forest footprint is not a closed clearance rectangle`);
    const candidates=new Set();
    for(let x=Math.floor(box.minX/cellSize);x<=Math.floor(box.maxX/cellSize);x++)for(let z=Math.floor(box.minZ/cellSize);z<=Math.floor(box.maxZ/cellSize);z++)for(const index of clearanceCells.get(`${x}/${z}`)||[])candidates.add(index);
    for(const index of candidates)assert(!intersects(meta.footprint,allFloors[index]),`${track.id}/${meta.routeId}: actual dense border footprint intrudes into a route, chute or receiving platform`);
    for(const part of meta.parts) {
      assert(isAttached(part.mesh,group)&&isVisible(part.mesh),`${track.id}: dense border batch is detached or hidden`);
      assert(forestBatches.includes(part.mesh),`${track.id}: dense border refers to an unregistered batch`);
      assert(isCameraOccluder(part.mesh,group),`${track.id}: dense border mesh cannot fade from the ball's sightline`);
      const vertices=part.mesh.geometry.attributes.position;
      assert(part.firstVertex>=0&&part.vertexCount>0&&part.firstVertex+part.vertexCount<=vertices.count,`${track.id}: dense border vertex receipt is outside its material batch`);
      for(let i=part.firstVertex;i<part.firstVertex+part.vertexCount;i++) {
        worldPoint.fromBufferAttribute(vertices,i).applyMatrix4(part.mesh.matrixWorld);
        for(let edge=0;edge<4;edge++) {
          const a=meta.footprint[edge],b=meta.footprint[(edge+1)%4],dx=b.x-a.x,dz=b.z-a.z;
          const centerCross=dx*(cluster.position.z-a.z)-dz*(cluster.position.x-a.x);
          const vertexCross=dx*(worldPoint.z-a.z)-dz*(worldPoint.x-a.x);
          assert(vertexCross*Math.sign(centerCross)>=-1e-4,`${track.id}: rendered forest leaf/prop leaves its checked footprint`);
        }
        checkedSceneryVertices++;
      }
    }
    const offset=(cluster.position.x-meta.edge.x)*meta.edge.nx+(cluster.position.z-meta.edge.z)*meta.edge.nz;
    close(offset,.55,`${track.id}: dense border does not hug its actual road edge`,.0001);
    checkedForestClusters++;
  }
  assert.equal(dynamic.slowZones?.length,track.routes.filter(route=>route.slowZone).length);
  assert(dynamic.slowZones.length>0,`${track.id}: stage has no visible S-curve slowdown challenge`);
  for(const entry of dynamic.slowZones) {
      assert(Number.isFinite(entry.def.amplitude),`${track.id}/${entry.route.id}: authored slowdown retains an obsolete drySide strip`);
      const {dry,pool,route,def}=entry,geometry=dry.geometry,positions=geometry.attributes.position;
      assert.equal(dry.name,'continuous-dry-skill-curve',`${track.id}/${route.id}: dry line is still a disconnected edge strip`);
      assert.equal(dry.userData.supportRoute,route);assert.equal(pool.userData.supportRoute,route);
      assert(isAttached(dry,group)&&isAttached(pool,group),`${track.id}: slow-zone surfaces are detached`);
      const rows=geometry.userData.ribbonRows,columns=geometry.userData.ribbonColumns;
      assert(rows>=73&&columns===4,`${track.id}: continuous dry curve has insufficient cross-sections`);
      assert.equal(positions.count,rows*(columns+1));assert.equal(geometry.index.count,(rows-1)*columns*6);
      const topology=verifyRibbonMesh(geometry,`${track.id}/${route.id}: continuous dry ribbon`);
      verifiedTriangles+=topology.triangles;intersectionPairs+=topology.intersectionPairs;
      const centerline=sampleDryCurvePoints(route,def,rows-1),offsets=[];
      for(let i=0;i<rows;i++) {
        offsets.push(evaluateDryCurveOffset(def,i/(rows-1)));
        for(let j=0;j<=columns;j++) {
          const vertex=i*(columns+1)+j,x=positions.getX(vertex),z=positions.getZ(vertex);
          let floor=nearestRouteSurface([route],x,z,Infinity);
          // Float32 overlay vertices can land one ulp beyond a finite mouth.
          // Bound the retry by coordinate precision rather than widening roads.
          if(!floor) {
            const epsilon=Math.max(.00003,Math.max(Math.abs(x),Math.abs(z))*2**-23);
            for(const [dx,dz] of [[epsilon,0],[-epsilon,0],[0,epsilon],[0,-epsilon]]) {
              floor=nearestRouteSurface([route],x+dx,z+dz,Infinity);if(floor)break;
            }
          }
          assert(floor,`${track.id}/${route.id}: continuous dry ribbon leaves rendered support`);
          close(positions.getY(vertex)-floor.y,.06,`${track.id}: dry curve does not track its rendered floor`,.0002);
          assert(floor.dryLine||Math.abs(floor.slowZoneDistance-def.dryWidth/2)<.0002,`${track.id}/${route.id}: visible dry ribbon differs from slowdown physics at row${i}/${rows-1} col${j}, distance ${floor.slowZoneDistance}, halfWidth ${def.dryWidth/2}, u ${floor.curveU}, lateral ${floor.curveLateral}`);
          if(j===columns/2) {
            close(x,centerline[i].x,`${track.id}: dry ribbon X deviates from shared S curve`,.0001);
            close(z,centerline[i].z,`${track.id}: dry ribbon Z deviates from shared S curve`,.0001);
          }
        }
      }
      assert(Math.max(...offsets)>.5&&Math.min(...offsets)<-.5,`${track.id}: dry curve does not visibly cross both sides of the road`);
      // Pool covers the complete sticky patch; the raised opaque ribbon masks
      // its dry portion. It need not clip pool vertices to the S boundary.
      assert(pool.geometry.userData.surfaceOverlay&&pool.geometry.index.count>0,`${track.id}: sticky slowdown pool is missing`);
      checkedDryCurves++;
  }
}
verifyHazardEntries(hazardFixture, buildTrackScene(hazardFixture).dynamicMeshes);
function isAttached(node, root) {
  for (let p = node; p; p = p.parent) if (p === root) return true;
  return false;
}
function verifyStageV42Landmarks(track,group,dynamic) {
  const landmarks=dynamic.v42Landmarks,placements=landmarks?.userData.placements;
  assert(landmarks?.isGroup&&isAttached(landmarks,group),`${track.id}: missing live v4.2 landmark group`);
  assert.equal(landmarks.userData.stageId,track.id,`${track.id}: landmark stage identity`);
  assert(Array.isArray(placements)&&placements.length>0,`${track.id}: live v4.2 landmark layer is empty`);
  assert.equal(landmarks.userData.landmarkCount,placements.length,`${track.id}: landmark count receipt differs from actual placements`);
  assert.equal(placements.length,landmarks.children.length,`${track.id}: landmark count differs from attached groups`);
  assert.deepEqual(new Set(placements.map(p=>p.mesh)),new Set(landmarks.children),`${track.id}: landmark receipts differ from attached groups`);
  const resources=dynamic.v42LandmarkResources,liveGeometries=new Set(),liveMaterials=new Set();
  assert(resources?.geometries instanceof Set&&resources.materials instanceof Set,`${track.id}: landmark ownership registry missing`);
  for(const placement of placements) {
    assert(isAttached(placement.mesh,landmarks)&&isVisible(placement.mesh),`${track.id}: landmark placement is detached or hidden`);
    let meshes=0;
    placement.mesh.traverse(node=>{if(node.isMesh){meshes++;liveGeometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])liveMaterials.add(material);}});
    assert(meshes>0,`${track.id}/${placement.kind}: landmark has no rendered geometry`);
  }
  assert.deepEqual(resources.geometries,liveGeometries,`${track.id}: landmark allocated geometry registry differs from live meshes`);
  for(const material of liveMaterials)assert(resources.materials.has(material),`${track.id}: live landmark material is not owned by its course`);
  assert(liveGeometries.size>0&&liveMaterials.size>0,`${track.id}: landmark layer has no real geometry or materials`);
  const animations=dynamic.v42LandmarkAnimations;
  assert(Array.isArray(animations),`${track.id}: landmark animation registry missing`);
  const snapshot=entry=>[...entry.mesh.position.toArray(),...entry.mesh.quaternion.toArray(),...entry.mesh.scale.toArray(),...(entry.ribbon?.geometry.attributes.position.array||[])];
  for(const entry of animations)assert(isAttached(entry.mesh,landmarks)&&isVisible(entry.mesh),`${track.id}: landmark animation targets a detached or hidden node`);
  animateStageV42Landmarks(dynamic,0,0);
  const initial=animations.map(snapshot),moved=animations.map(()=>false);
  for(const elapsed of [1.3,2.7]) {
    animateStageV42Landmarks(dynamic,elapsed,1/60);
    animations.forEach((entry,index)=>{
      const current=snapshot(entry);assert(current.every(Number.isFinite),`${track.id}: landmark animation has non-finite transforms or vertices`);
      if(current.some((value,i)=>Math.abs(value-initial[index][i])>1e-7))moved[index]=true;
    });
  }
  assert(moved.every(Boolean),`${track.id}: registered landmark animation remains static`);
  // Garden furniture and the copper-pot hood deliberately have no moving parts.
  if(!['garden','clockwork'].includes(track.id))assert(animations.length>0,`${track.id}: moving landmark stage has no live animation`);
  animateStageV42Landmarks(dynamic,0,0);
  checkedV42Landmarks+=placements.length;checkedV42AnimatedParts+=animations.length;
}
function verifyCourseResourceDisposal(track,dynamic) {
  const geometries=new Set(),materials=new Set(),cachedMaterials=new Set();
  const landmarkResources=dynamic.v42LandmarkResources;
  assert(landmarkResources?.geometries.size>0&&landmarkResources.materials.size>0,`${track.id}: disposal proof has no allocated landmark resources`);
  for(const geometry of landmarkResources.geometries)geometries.add(geometry);
  for(const material of landmarkResources.materials)materials.add(material);
  for(const mesh of dynamic.forestDensityBorders.userData.batchMeshes) {
    geometries.add(mesh.geometry);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])cachedMaterials.add(material);
  }
  for(const entry of dynamic.slowZones)for(const mesh of [entry.pool,entry.dry]) {
    geometries.add(mesh.geometry);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);
  }
  assert(geometries.size>0&&materials.size>0&&cachedMaterials.size>0,`${track.id}: disposal proof has no actual allocated course resources`);
  for(const material of materials)assert(!cachedMaterials.has(material),`${track.id}: owned course material aliases a cached forest material`);
  const counts=new Map([...geometries,...materials,...cachedMaterials].map(resource=>[resource,0])),listeners=new Map();
  for(const resource of counts.keys()) {
    const listener=()=>counts.set(resource,counts.get(resource)+1);
    listeners.set(resource,listener);resource.addEventListener('dispose',listener);
  }
  try {
    for(let call=0;call<2;call++) {
      disposeCourseSceneResources(dynamic);
      for(const resource of [...geometries,...materials])assert.equal(counts.get(resource),1,`${track.id}: per-course ${resource.isMaterial?'material':'geometry'} was not disposed exactly once after cleanup call${call+1}`);
      for(const material of cachedMaterials)assert.equal(counts.get(material),0,`${track.id}: course cleanup disposed a cached forest toon material`);
      assert.equal(dynamic.v42Landmarks,null,`${track.id}: disposed landmark group remains registered`);
      assert.equal(dynamic.v42LandmarkResources,null,`${track.id}: disposed landmark resources remain registered`);
      assert.deepEqual(dynamic.v42LandmarkAnimations,[],`${track.id}: disposed landmark animations remain registered`);
    }
  } finally {
    for(const [resource,listener] of listeners)resource.removeEventListener('dispose',listener);
  }
  disposedCourseGeometries+=geometries.size;disposedCourseMaterials+=materials.size;preservedForestMaterials+=cachedMaterials.size;
  disposedV42Geometries+=landmarkResources.geometries.size;disposedV42Materials+=landmarkResources.materials.size;
  return geometries;
}
function checkGeometry(geometry, label, strict = false) {
  const positions = geometry?.attributes?.position;
  assert.ok(positions && positions.count > 0, `${label}: empty geometry`);
  assert.ok(positions.array.every(Number.isFinite), `${label}: non-finite vertices`);
  if (geometry.attributes.normal) assert.ok(geometry.attributes.normal.array.every(Number.isFinite), `${label}: invalid normals`);
  if (geometry.attributes.uv) assert.ok(geometry.attributes.uv.array.every(Number.isFinite), `${label}: invalid UV coordinates`);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  for (const v of [...geometry.boundingBox.min.toArray(), ...geometry.boundingBox.max.toArray(), geometry.boundingSphere.radius]) assert.ok(Number.isFinite(v), `${label}: invalid bounds`);
  assert.ok(geometry.boundingSphere.radius > 0, `${label}: collapsed geometry`);
  const index = geometry.index;
  if (index) for (const value of index.array) assert.ok(Number.isInteger(value) && value >= 0 && value < positions.count, `${label}: invalid triangle index ${value}`);
  const count = index?.count ?? positions.count;
  assert.equal(count % 3, 0, `${label}: incomplete triangle`);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0, collapsed = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(i) : i);
    b.fromBufferAttribute(positions, index ? index.getX(i+1) : i+1);
    c.fromBufferAttribute(positions, index ? index.getX(i+2) : i+2);
    const triangleArea = b.sub(a).cross(c.sub(a)).lengthSq();
    if (triangleArea <= 1e-14) collapsed++; else area += triangleArea;
  }
  assert.ok(area > 0, `${label}: no nondegenerate triangles`);
  if (strict) assert.equal(collapsed, 0, `${label}: collapsed authored ribbon triangles`);
  return positions.count;
}
function chuteMeshOptions(chute,data=getChuteShellRows(chute)) {
  if(!chute.bankProfile?.some(bank=>Math.abs(bank)>1e-7))return {};
  return {normalAt:vertex=>{
    const row=Math.floor(vertex/(data.columns+1)),column=vertex%(data.columns+1),f=data.frames[row];
    const angle=(column/data.columns*2-1)*Math.PI/2;
    const mouth=Math.min(1,data.distances[row]/2.5,(data.distances.at(-1)-data.distances[row])/3);
    const lateral=-Math.sin(angle)*mouth,up=Math.cos(angle)*f.miter;
    return {x:f.lateralX*lateral+f.upX*up,y:f.lateralY*lateral+f.upY*up,z:f.lateralZ*lateral+f.upZ*up};
  }};
}
// Numeric fixtures would fail the original average-normal miter and mismatched
// width mouths even when their meshes remained finite and nondegenerate.
{
  const incoming={id:'fixture-wide',kind:'stone',width:6,bank:.4,points:[{x:0,y:0,z:0},{x:8,y:0,z:0},{x:16,y:0,z:0}]};
  const outgoing={id:'fixture-narrow',kind:'stone',width:4,bank:0,points:[{x:16,y:0,z:0},{x:16,y:0,z:8},{x:16,y:0,z:16}]};
  prepareRouteGeometry([incoming,outgoing]);
  const a=getRouteRibbonRows(incoming),b=getRouteRibbonRows(outgoing);
  assert.deepEqual(a.rows.at(-1),b.rows[0],'width/bank transition leaves a split seam');
  close(a.rows.at(-1).at(-1).x,14,'90 degree outer miter X');
  close(a.rows.at(-1).at(-1).z,2,'90 degree outer miter Z');
  close(a.rows.at(-1)[0].x,18,'90 degree inner miter X');
  close(a.rows.at(-1)[0].z,-2,'90 degree inner miter Z');
  close(a.halfWidths[0],3,'width taper erased the broad approach');close(a.halfWidths.at(-1),2,'width taper misses narrow mouth');
  const legacy={x:16-Math.SQRT1_2*2,z:Math.SQRT1_2*2};
  assert.ok(Math.hypot(legacy.x-14,legacy.z-2)>.8,'miter regression fixture does not detect the original pinched offset');
  const acute={...outgoing,id:'fixture-acute',width:4,points:[{x:16,y:0,z:0},{x:8,y:0,z:2},{x:0,y:0,z:4}]};
  prepareRouteGeometry([incoming,acute]);
  const capped=getRouteRibbonRows(incoming),p=capped.rows.at(-1).at(-1);
  assert.ok(Math.hypot(p.x-16,p.z)<=2*1.8+1e-5,'acute outer miter grows an unbounded spike');
  for(const route of [incoming,acute]){const geometry=createRouteRibbonGeometry(route);verifyRibbonMesh(geometry,route.id);geometry.dispose();}
}
let checkedBeacons=0,checkedOverlayVertices=0;
function verifyCheckpointAndOverlays(track,group,dynamic) {
  assert.equal(dynamic.checkpoints?.length,track.checkpoints.length,`${track.id}: missing checkpoint beacons`);
  for(const[index,entry]of dynamic.checkpoints.entries()){
    assert.equal(entry.def,track.checkpoints[index]);assert.ok(isAttached(entry.mesh,group));
    assert.ok(entry.lantern.geometry.type==='OctahedronGeometry');assert.ok(entry.guardian.children.length>=7);
    assert.equal(entry.particles.children.length,10);assert.equal(entry.active,false);
    assert.equal(isCameraOccluder(entry.lantern,group),false);assert.equal(isCameraOccluder(entry.rune,group),false);
    assert.ok(entry.rune.material.map.image.data.some((v,i)=>i%4===3&&v>0),'ground rune has no visible pixels');
    assert.equal(activateCheckpoint(dynamic,index),true);assert.equal(activateCheckpoint(dynamic,index),false);
    animateFairytaleScenery({checkpoints:dynamic.checkpoints},1,.016);assert.equal(entry.crystalMaterial.color.getHex(),0xffd36f);assert.equal(entry.rune.material.color.getHex(),0xffd984);
    assert.ok(entry.rune.material.map.rotation>0);assert.ok(entry.particles.children.some(p=>p.position.y>1));checkedBeacons++;
    entry.active=false;entry.pulse=0;entry.crystalMaterial.color.setHex(0xb6c0f5);entry.rune.material.color.setHex(0xc4c6ff);
  }
  group.updateMatrixWorld(true);
  verifyWorldLayers(track,group,dynamic);
  group.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry.userData.surfaceOverlay)return;
    const meta=mesh.geometry.userData,route=mesh.userData.supportRoute||track.routes.find(r=>r.id===meta.sourceRouteId);
    assert.ok(route,`${track.id}/${mesh.name}: overlay has no support`);assert.ok(meta.edgeInset>=.35);
    assert.equal(meta.floorOffset,mesh.name==='checkpoint-ground-rune'?.06:.05);
    assert.ok(mesh.material.polygonOffset);assert.ok(mesh.geometry.index.count>=3,`${track.id}/${mesh.name}: empty overlay`);
    const pos=mesh.geometry.attributes.position,worldPoint=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      worldPoint.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      let hit=nearestRouteSurface([route],worldPoint.x,worldPoint.z,Infinity);
      if(!hit) {
        const epsilon=Math.max(.00003,Math.max(Math.abs(worldPoint.x),Math.abs(worldPoint.z))*2**-23);
        for(const[dx,dz]of[[epsilon,0],[-epsilon,0],[0,epsilon],[0,-epsilon]]){hit=nearestRouteSurface([route],worldPoint.x+dx,worldPoint.z+dz,Infinity);if(hit)break;}
      }
      assert.ok(hit,`${track.id}/${mesh.name}/${route.id}: overlay vertex leaves supporting deck at ${worldPoint.toArray()}`);
      close(worldPoint.y-hit.y,meta.floorOffset,`${track.id}/${mesh.name}: decal slope/height`,.0001);
      for(const edge of getRibbonBoundarySegments(route)){
        const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,length2=dx*dx+dz*dz;
        const t=Math.max(0,Math.min(1,((worldPoint.x-edge.a.x)*dx+(worldPoint.z-edge.a.z)*dz)/(length2||1)));
        if(Math.abs(worldPoint.y-meta.floorOffset-(edge.a.y+(edge.b.y-edge.a.y)*t))>.5)continue;
        assert.ok(Math.hypot(worldPoint.x-edge.a.x-dx*t,worldPoint.z-edge.a.z-dz*t)>=.3498,`${track.id}/${mesh.name}: overlay intersects a supporting rail at ${worldPoint.toArray()} edge ${edge.index}/${edge.side}, distance ${Math.hypot(worldPoint.x-edge.a.x-dx*t,worldPoint.z-edge.a.z-dz*t)}`);
      }
      checkedOverlayVertices++;
    }
  });
  for(const entry of dynamic.fairytaleProps.filter(p=>p.def.type==='turntable')){
    assert.ok(entry.animatedParts.surfaceTexture,`${track.id}: turntable rotates thick geometry instead of projected surface`);
    assert.equal(entry.animatedParts.spinner.rotation.y,0);
  }
  if(track.index===1){
    const rug=group.getObjectByName('woven-start-rug');assert.ok(rug.geometry.userData.surfaceOverlay,'living-room rug is still a giant box');
    const ramp=track.routes.find(r=>r.id==='book-ramp');
    group.traverse(node=>{if(node.name!=='furniture-table-leg')return;const b=new THREE.Box3().setFromObject(node,true);
      for(const p of ramp.points)if(p.y>=b.min.y-.5&&p.y<=b.max.y+.5)assert.ok(p.x<b.min.x-ramp.width/2||p.x>b.max.x+ramp.width/2||p.z<b.min.z-ramp.width/2||p.z>b.max.z+ramp.width/2,'living-room table leg intersects book approach');});
  }
}
// The strip's width is across the road and depth follows travel direction.
{
  const route={id:'boost-orientation-fixture',width:6,points:[{x:0,y:1,z:5},{x:0,y:3,z:-5}]};
  const geometry=boostRibbonGeometry(route,{x:0,z:0,w:2,d:6});geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());close(size.x,2,'boost cross-lane width');close(size.z,6,'boost along-route length');
  for(let i=0;i<geometry.attributes.position.count;i++){const p=geometry.attributes.position;close(p.getY(i),2-p.getZ(i)*.2+.05,'boost slope support',.00001);}
  geometry.dispose();
}
function verifyFlagshipStructures(track,group,dynamic){
  if(!track.flagship)return;
  assert.deepEqual(dynamic.flagshipStructures?.tiers,track.tiers,`${track.id}: rendered tier metadata differs from playable tiers`);
  if(track.flagship==='A'){
    const tabletop=group.getObjectByName('giant-dining-tabletop');assert(tabletop,'missing continuous giant dining table');
    const bounds=new THREE.Box3().setFromObject(tabletop,true);close(bounds.max.y,12,'tabletop upper tier');
    assert(bounds.min.y-1.5>=9,'table underside clearance is less than nine metres');
    const under=track.routes.find(r=>r.section.includes('under'));
    const station=under.points.find(p=>p.x>bounds.min.x+1&&p.x<bounds.max.x-1&&p.z>bounds.min.z+1&&p.z<bounds.max.z-1);
    assert(station,'lower route never actually enters dining table footprint');
    const road=group.getObjectByName(`route-${under.id}`),originalRoad=road.material;
    for(const hz of [120,60,25])for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      const safety=createCameraOcclusion(group),ball={...station,y:station.y+.62,r:.62,supportRoute:under};
      const pose={x:ball.x+Math.sin(yaw)*9,y:ball.y+4,z:ball.z+Math.cos(yaw)*9};
      for(let i=0;i<hz;i++)safety.update(ball,pose,1/hz);
      close(tabletop.material.opacity,.16,'actual tabletop underpass cutaway',.001);assert.equal(road.material,originalRoad,'under-table supporting road faded');safety.dispose();
    }
    assert(group.getObjectByName('chair-crossbar'),'under-table vignette lacks chair crossbars');
    assert(group.getObjectByName('floor-cookie-tin'),'under-table vignette lacks cookie-tin maze');
  }
  if(track.flagship==='B'){
    const trunks=[];group.traverse(node=>{if(node.name==='hollow-giant-oak-trunk')trunks.push(node);});
    assert.equal(trunks.length,1,'flagship tree scene must share one ancient trunk');
    const leaves=[];group.traverse(node=>{if(node.name==='oak-canopy-leaf-cluster')leaves.push(node);});
    assert.equal(leaves.length,5);const top=Math.max(...leaves.map(node=>new THREE.Box3().setFromObject(node,true).max.y));
    close(top,42,'actual oak canopy reaches 42 metres',.05);
    assert(group.getObjectByName('canopy-treehouse'),'ancient oak lacks treetop house');
    assert(group.getObjectByName('rushing-valley-waterfall'),'valley lacks waterfall curtain');
  }
  if(track.flagship==='C'){
    assert.equal(dynamic.warpPortals?.length,track.portals.length,'missing visual paired portals');
    for(const id of ['A','B','C'])assert.equal(dynamic.warpPortals.filter(pair=>pair.def.id===id).length,1,`missing preserved flagship portal ${id}`);
    let portalAnimationTime=1;
    for(const pair of dynamic.warpPortals){
      assert(track.portals.includes(pair.def));assert.equal(pair.ends.length,2,'portal pair lacks entry or exit');
      for(const [index,end] of pair.ends.entries()){
        assert(isAttached(end.mesh,group));const at=index?pair.def.exit:pair.def.entry;
        close(end.mesh.position.x,at.x,'portal visual X');close(end.mesh.position.y,at.y+.08,'portal visual Y');close(end.mesh.position.z,at.z,'portal visual Z');
        assert(end.core.material.transparent&&end.core.material.opacity>.15&&end.core.material.opacity<.8,'portal pool is not translucent');
        assert.equal(end.core.material.color.getHex(),pair.def.color,'paired portal loses its distinct color');
        assert(end.halo.material.emissiveIntensity>.2,'portal halo lacks glow');
        assert(end.runes.children.length>=8&&end.sparks.children.length>=12&&end.spirals.length>=2,'portal lacks runes, rising sparkles or swirl');
        close(end.plane.rotation.x,index?0:-Math.PI/2,'entry pool / exit ring orientation');
        const before=end.runes.rotation.z;portalAnimationTime+=.7;animateFairytaleScenery(dynamic,portalAnimationTime,1/60);assert.notEqual(end.runes.rotation.z,before,'portal rune halo does not rotate');
      }
    }
    const train=dynamic.toyTrains?.[0];assert(train&&train.wheels.length>=8,'toy skyway lacks sculpted animated pastel train');
    animateFairytaleScenery(dynamic,1,1/60);const before=train.mesh.position.clone();animateFairytaleScenery(dynamic,2,1/60);assert(train.mesh.position.distanceTo(before)>1,'toy train remains static');
  }
}

const expectedWorlds = ['grounded_nature','indoor_home','town_street','grounded_nature','indoor_home','town_street','sky_floating','hybrid_winter','cosmic_warp','grand_medley'];
const expectedChuteStyles=['rollercoaster','banked_slalom','rollercoaster','helix','helix','corkscrew_drop','rollercoaster','banked_slalom','corkscrew_drop','corkscrew_drop'];
const renderedChuteStyles=new Set();
assert.equal(TRACKS.length, 10, 'v3 needs all ten approved stages');
const stageArguments=process.argv.filter(arg=>arg.startsWith('--stage=')).map(arg=>Number(arg.slice(8)));
assert(stageArguments.every(stage=>Number.isInteger(stage)&&stage>=1&&stage<=10),'scene stage must be1..10');
const selectedStages=new Set(stageArguments.length?stageArguments:TRACKS.map((_,index)=>index+1));
for (const [stage, track] of TRACKS.entries()) {
  if(!selectedStages.has(stage+1))continue;
  assert.equal(track.worldType, expectedWorlds[stage], `${track.id}: wrong blueprint environment`);
  const { group, dynamicMeshes } = buildTrackScene(track);
  verifyStageV42Landmarks(track,group,dynamicMeshes);
  assert.equal(dynamicMeshes.checkpoints?.length, track.checkpoints.length, `${track.id}: checkpoint beacon registration missing`);
  verifyMushroomContact(dynamicMeshes);
  verifyHazardEntries(track, dynamicMeshes);
  verifyCheckpointAndOverlays(track,group,dynamicMeshes);
  group.updateMatrixWorld(true);
  let meshes = 0, vertices = 0;
  group.traverse((node) => {
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), `${track.id}: invalid transform`);
    if (!node.isMesh) return;
    meshes++;
    vertices += checkGeometry(node.geometry, `${track.id}/${node.name || node.type}`, node.userData?.courseRibbon === true);
  });
  const world = group.getObjectByName(`v3-world-${track.worldType}`);
  assert.ok(world, `${track.id}: missing authentic world environment`);
  assert.ok(world.children.length >= 3, `${track.id}: empty environment dressing`);
  let signatureGroups=0;
  world.traverse(node=>{if(node.userData.stageSignature){
    stageSignatures.add(node.userData.stageSignature);signatureGroups++;
    let sculptedParts=0;node.traverse(part=>{if(part.isMesh)sculptedParts++;});
    assert.ok(sculptedParts>=4,`${track.id}: stage signature is only an empty identity tag`);
    const size=new THREE.Box3().setFromObject(node,true).getSize(new THREE.Vector3());
    assert.ok(size.x>1&&size.y>1&&size.z>.15,`${track.id}: stage signature lacks a visible sculpted silhouette`);
  }});
  assert.equal(signatureGroups,track.acts.length-1,`${track.id}: missing act landmark sculptures`);
  assert.ok(Array.isArray(dynamicMeshes.fairytaleProps), `${track.id}: missing interactive prop registration`);
  assert.equal(dynamicMeshes.fairytaleProps.length, (track.props || []).length, `${track.id}: interactive prop count`);
  for (const entry of dynamicMeshes.fairytaleProps) {
    assert.ok(track.props.includes(entry.def), `${track.id}: orphan prop definition`);
    assert.ok(isAttached(entry.mesh, group), `${track.id}/${entry.def.type}: prop is detached`);
    let propMeshes=0;entry.mesh.traverse(node=>{if(node.isMesh)propMeshes++;});
    assert.ok(propMeshes >= (entry.def.type==='turntable'?1:2), `${track.id}/${entry.def.type}: missing sculpted prop parts`);
    close(entry.mesh.position.x, entry.def.x, `${track.id}: prop X`);
    close(entry.mesh.position.y, entry.def.y, `${track.id}: prop Y`);
    close(entry.mesh.position.z, entry.def.z, `${track.id}: prop Z`);
  }
  // Check authored anchors before flagship portal/train tests advance time.
  // Then verify patrol animation against the collider's exact position API.
  for(const elapsed of [0,1,2]) {
    animateFairytaleScenery({fairytaleProps:dynamicMeshes.fairytaleProps},elapsed,1/60);
    for(const entry of dynamicMeshes.fairytaleProps.filter(entry=>['ducklings','sheep','snow_bunny','snow_bunnies','penguin','penguins'].includes(entry.def.type))) {
      const expected=fairytalePropPosition(entry.def,elapsed);
      for(const axis of ['x','z'])close(entry.mesh.position[axis],expected[axis],`${track.id}/${entry.def.id}: patrol visual/collider ${axis}`);
      assert(entry.mesh.position.y>=expected.y-1e-5&&entry.mesh.position.y<=expected.y+.05001,`${track.id}/${entry.def.id}: patrol idle hop leaves its floor-height envelope`);
    }
  }
  verifyFlagshipStructures(track,group,dynamicMeshes);
  assert.ok(Array.isArray(dynamicMeshes.chutes), `${track.id}: missing chute registration`);
  assert(dynamicMeshes.chutes.length>0,`${track.id}: stage has no visible styled chute`);
  assert.equal(dynamicMeshes.chutes.length, (track.chutes || []).length, `${track.id}: chute count`);
  for (const entry of dynamicMeshes.chutes) {
    assert.ok(track.chutes.includes(entry.def), `${track.id}: orphan chute definition`);
    assert.ok(isAttached(entry.mesh, group), `${track.id}: detached chute`);
    const expectedStyle=entry.def.verticalFinale?track.verticalFinale?.segments.find(segment=>segment.id==='B')?.style:expectedChuteStyles[stage];
    assert.equal(entry.def.style,expectedStyle,`${track.id}: wrong authored ${entry.def.verticalFinale?'finale':'core'} chute style`);
    renderedChuteStyles.add(entry.def.style);
    assert.equal(entry.def.bankProfile.length,entry.def.points.length,`${track.id}: signed bank profile does not align with chute rows`);
    let translucent = 0, surfaceMeshes = 0;
    entry.mesh.traverse(node => {if (node.isMesh) {
      surfaceMeshes++;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      translucent += mats.filter(m => m.transparent && m.opacity > 0.15 && m.opacity < 1).length;
    }});
    assert.ok(surfaceMeshes >= 3, `${track.id}: chute lacks halfpipe and guard structure`);
    const shell=entry.mesh.getObjectByName('chute-half-pipe-shell');
    const shellData=getChuteShellRows(entry.def),shellPositions=shell.geometry.attributes.position;
    for(let i=0;i<shellData.rows.length;i++)for(let j=0;j<=shellData.columns;j++) {
      const vertex=i*(shellData.columns+1)+j,p=shellData.rows[i][j];
      close(shellPositions.getX(vertex),p.x,`${track.id}: banked collider/render X`,0);
      close(shellPositions.getY(vertex),p.y,`${track.id}: banked collider/render Y`,0);
      close(shellPositions.getZ(vertex),p.z,`${track.id}: banked collider/render Z`,0);
    }
    if(entry.def.style!=='helix') {
      const banks=entry.def.bankProfile;
      assert(Math.max(...banks.map(Math.abs))>=.2,`${track.id}: styled chute has no visible authored bank`);
      if(entry.def.style==='banked_slalom')assert(Math.min(...banks)<-.2&&Math.max(...banks)>.2,`${track.id}: slalom does not bank in both directions`);
      let visibleTilt=0;
      for(let i=1;i<banks.length-1;i++) {
        if(Math.abs(banks[i])<.05)continue;
        const p=entry.def.points[i],f=shellData.frames[i];
        close(f.roll,banks[i],`${track.id}: frame ignores signed bank`);
        const left=shellData.rows[i][shellData.columns/4],right=shellData.rows[i][shellData.columns*3/4];
        const measured=((right.y-p.y)/shellData.rightWidths[i]-(left.y-p.y)/shellData.leftWidths[i])/(2*Math.sin(Math.PI/4)*f.miter);
        const expected=-Math.sin(banks[i]);
        close(measured,expected,`${track.id}: rendered cross-section does not visibly tilt with signed roll`,.0001);
        assert(measured*banks[i]<0,`${track.id}: rendered bank tilts against its signed profile`);
        visibleTilt=Math.max(visibleTilt,Math.abs(measured));checkedBankedRows++;
      }
      assert(visibleTilt>.08,`${track.id}: authored bank has no visible rendered elevation difference`);
    }
    const topology=verifyRibbonMesh(shell.geometry,`${track.id}/${entry.def.id}`,chuteMeshOptions(entry.def,shellData));verifiedTriangles+=topology.triangles;intersectionPairs+=topology.intersectionPairs;
    if(entry.def.doubleHelix){
      const companion=entry.mesh.getObjectByName('rainbow-double-helix-companion');assert.ok(companion,`${track.id}: reflected companion shell missing`);
      const companionTopology=verifyRibbonMesh(companion.geometry,`${track.id}/${entry.def.id}: companion`,chuteMeshOptions(getCompanionChute(entry.def)));verifiedTriangles+=companionTopology.triangles;intersectionPairs+=companionTopology.intersectionPairs;
      crossShellPairs+=verifyMeshPairSeparation(shell.geometry,companion.geometry,`${track.id}: primary/companion`);
    }
    if(entry.def.material==='oak'&&!entry.def.verticalFinale){
      const trunk=entry.mesh.getObjectByName('hollow-giant-oak-trunk'),position=trunk.geometry.attributes.position;
      let minRadius=Infinity;for(let i=0;i<position.count;i++)minRadius=Math.min(minRadius,Math.hypot(position.getX(i),position.getZ(i)));
      assert.ok(minRadius>=entry.def.radius+entry.def.width/2+1,`${track.id}: tapered oak housing intersects the chute corridor`);
      const canopies=entry.mesh.children.filter(node=>node.name==='oak-canopy-leaf-cluster');assert.equal(canopies.length,5,`${track.id}: oak canopy coverage missing`);
      const top=Math.max(...entry.def.points.map(p=>p.y));
      for(const canopy of canopies)assert.ok(new THREE.Box3().setFromObject(canopy,true).min.y>=top+1.5-1e-5,`${track.id}: actual oak leaves intrude into upper chute clearance`);
    }
    if(entry.def.verticalFinale)assert(!entry.mesh.getObjectByName('hollow-giant-oak-trunk'),`${track.id}: finale rail duplicates the flagship tree`);
    if (entry.def.material !== 'oak') assert.ok(translucent, `${track.id}: missing translucent chute material`);
    assert.ok(entry.rings?.length >= 3, `${track.id}: missing animated chute sparkle rings`);
    const bounds = new THREE.Box3().setFromObject(entry.mesh, true);
    for (const point of [entry.def.points[0], entry.def.points.at(-1)]) assert.ok(bounds.clone().expandByScalar(0.1).containsPoint(new THREE.Vector3(point.x, point.y, point.z)), `${track.id}: rendered chute misses its physics endpoint`);
  }
  for (const route of track.routes || []) {
    const mesh = group.getObjectByName(`route-${route.id}`),label=`${track.id}/${route.id}`;
    assert.ok(mesh, `${label}: missing continuous route ribbon`);assert.ok(isAttached(mesh, group));
    const topology=verifyRibbonMesh(mesh.geometry,label);verifiedTriangles+=topology.triangles;intersectionPairs+=topology.intersectionPairs;
    const data=getRouteRibbonRows(route),position=mesh.geometry.attributes.position;
    for(let i=0;i<data.rows.length;i++)for(let j=0;j<=data.columns;j++){
      const vertex=i*(data.columns+1)+j,p=data.rows[i][j];
      close(position.getX(vertex),p.x,`${label}: collider/render X`,0);close(position.getY(vertex),p.y,`${label}: collider/render Y`,0);close(position.getZ(vertex),p.z,`${label}: collider/render Z`,0);
    }
    for(let i=0;i<data.rows.length;i++)assert.ok(data.leftWidths[i]+data.rightWidths[i]>=1.3,`${label}[${i}]: clipped floor is narrower than the ball`);
    const body=mesh.children.find(node=>node.userData.routeBody);assert.ok(body,`${label}: missing continuous beveled extrusion`);
    checkGeometry(body.geometry,`${label}: skirt/guard`,true);
    const expectedGuards=route.walls?getRibbonBoundarySegments(route):[];
    assert.deepEqual(body.geometry.userData.guardSegments,expectedGuards,`${label}: rendered guard intervals differ from collision`);
    for(const cap of body.geometry.userData.endCaps){
      assert.ok(cap.indexCount>=3,`${label}: open guard cross-section`);closedGuardEnds++;
      const vertices=body.geometry.attributes.position,index=body.geometry.index;let raised=false;
      for(let k=cap.firstIndex;k<cap.firstIndex+cap.indexCount;k++)if(vertices.getY(index.getX(k))>cap.point.y+.02)raised=true;
      assert.ok(raised,`${label}: guard closure has no actual raised triangles`);
    }
    for(const post of mesh.children.filter(node=>node.userData.structuralGuard)){
      const i=post.userData.guardRow,side=post.userData.guardSide;
      assert.ok(expectedGuards.some(s=>s.side===side&&((s.index===i&&s.start<1e-6)||(s.index===i-1&&s.end>1-1e-6))),`${label}: post blocks an omitted guard opening`);
    }
    assert.equal(body.name,route.walls?'swept-beveled-guard':'swept-open-edge-skirt',`${label}: guardless edge identity differs from collision`);
    if(route.walls)edgeProfiles.add(body.geometry.userData.profileSignature);
    assert.equal(mesh.material.userData.surfacePattern,route.surfacePattern,`${label}: rendered motif loses authored identity`);
    assert.equal(mesh.material.color.getHex(),route.kind==='honey'?0xb57228:route.kind==='mud'?0x805632:route.surfaceColor,`${label}: surface palette missing`);
    const pixels=mesh.material.map?.image?.data;assert.ok(pixels?.length>1000,`${label}: no actual motif texture pixels`);
    if(!['honey','mud'].includes(route.kind))motifHashes.add(createHash('sha256').update(pixels).digest('hex'));
  }
  const renderedRoutes=track.routes.map(route=>({route,mesh:group.getObjectByName(`route-${route.id}`)}));
  for(let i=0;i<renderedRoutes.length;i++)for(let j=i+1;j<renderedRoutes.length;j++){
    const a=renderedRoutes[i],b=renderedRoutes[j];
    crossRoutePairs+=verifyMeshPairSeparation(a.mesh.geometry,b.mesh.geometry,`${track.id}: ${a.route.id}/${b.route.id}`);
  }
  const renderedShells=dynamicMeshes.chutes.flatMap(entry=>[
    {id:entry.def.id,mesh:entry.mesh.getObjectByName('chute-half-pipe-shell')},
    ...(entry.def.doubleHelix?[{id:`${entry.def.id}-companion`,mesh:entry.mesh.getObjectByName('rainbow-double-helix-companion')}]:[]),
  ]);
  for(const road of renderedRoutes)for(const shell of renderedShells)
    crossSurfacePairs+=verifyMeshPairSeparation(road.mesh.geometry,shell.mesh.geometry,`${track.id}: ${road.route.id}/${shell.id}`);
  // Assert actual endpoint geometry, including different widths/banks and flat
  // chute mouths. Every physical cross-section shares the same boundary line.
  const definitions=[...track.routes.filter(r=>!r.secret),...track.chutes];
  for(const before of definitions)for(const after of definitions){
    if(before===after||Math.hypot(before.points.at(-1).x-after.points[0].x,before.points.at(-1).y-after.points[0].y,before.points.at(-1).z-after.points[0].z)>1e-6)continue;
    const data=def=>track.chutes.includes(def)?getChuteShellRows(def):getRouteRibbonRows(def);
    const a=data(before),b=data(after),last=a.rows.at(-1),first=b.rows[0];
    for(const fraction of [0,.5,1]){
      const p=last[Math.round(a.columns*fraction)],q=first[Math.round(b.columns*fraction)];
      close(p.x,q.x,`${track.id}: seam ${before.id}/${after.id} X`,0);close(p.y,q.y,`${track.id}: seam Y`,0);close(p.z,q.z,`${track.id}: seam Z`,0);
    }
    if(a.columns===b.columns)for(let j=0;j<=a.columns;j++)assert.deepEqual(last[j],first[j],`${track.id}: split cross-section at ${before.id}/${after.id}`);
    seamCount++;
  }
  // Recompute rendered bounds; trusting stored radius alone would let a large
  // rotated mug or locomotive pass a nominal anchor-only clearance check.
  assert.ok(dynamicMeshes.decorativeProps?.length,`${track.id}: no registered authentic scenery`);
  for(const entry of dynamicMeshes.decorativeProps){
    const bounds=new THREE.Box3().setFromObject(entry.mesh,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const radius=Math.hypot(size.x,size.z)/2+(entry.mesh.userData.motionRadius||0);
    assert.ok(radius<=entry.radius+.0001,`${track.id}/${entry.mesh.name}: stored clearance omits rendered footprint`);
    const hit=nearestSceneryClearance(track,{x:center.x,z:center.z,radius});
    assert.ok(hit.margin>=track.cameraSceneryReach-.0001,`${track.id}/${entry.mesh.name}: rendered scenery crosses camera corridor ${hit.pathId} by ${track.cameraSceneryReach-hit.margin}m`);checkedScenery++;
  }
  for(const zone of track.fallZones||[]){
    assert.equal(zone.triggerY,zone.y,`${track.id}: visible fall contact differs from runtime threshold`);
    let visible=false;group.traverse(node=>{if(node.isMesh&&node.userData.fallZoneId===zone.id){close(node.userData.contactY,zone.y,`${track.id}: fall mesh contact height`);close(new THREE.Box3().setFromObject(node,true).max.y,zone.y,`${track.id}: actual rendered catch surface differs from physics`);visible=true;}});
    if(['water','indoor'].includes(zone.type))assert.ok(visible,`${track.id}/${zone.id}: contextual fall has no matching environment surface`);
    else assert.ok(['bush','cloud'].includes(zone.type)&&Number.isFinite(zone.y),`${track.id}: invalid contextual fall type`);
  }
  if (track.worldType === 'grounded_nature') {
    assert.ok(world.getObjectByName('grounded-terrain'), `${track.id}: grounded valley has no surrounding terrain`);
    assert.ok(world.getObjectByName('valley-stream'), `${track.id}: grounded valley lacks its stream`);
  }
  if (track.worldType === 'indoor_home') {
    assert.ok(world.getObjectByName('room-floor'), `${track.id}: miniature room floor missing`);
    assert.ok(world.getObjectByName('sunlit-window'), `${track.id}: sunlit room window missing`);
    for(const name of ['sunlit-room-wall','sunlit-room-side-wall','sunlit-window']) {
      const panel=world.getObjectByName(name);
      assert.equal(panel.geometry.type,'PlaneGeometry',`${track.id}/${name}: closed room shell hides outside cameras`);
      assert.equal(panel.material.side,THREE.FrontSide,`${track.id}/${name}: room cutaway renders its outside face`);
    }
  }
  if (track.worldType === 'town_street') {
    assert.ok(world.getObjectByName('town-canal'), `${track.id}: town canal missing`);
    assert.ok(world.getObjectByName('half-timbered-house'), `${track.id}: pastel half-timbered houses missing`);
  }
  verifyCameraScene(track,group,dynamicMeshes);
  results.push({stage:stage+1, track:track.id, world:track.worldType, routes:track.routes.length,
    chutes:dynamicMeshes.chutes.length, props:dynamicMeshes.fairytaleProps.length, meshes, vertices});
  const disposed = verifyCourseResourceDisposal(track,dynamicMeshes);
  group.traverse(node=>{if(node.geometry && !disposed.has(node.geometry)){disposed.add(node.geometry);node.geometry.dispose();}});
}

// A connected side route must have a doorway; a deck at another elevation must not.
const deck = { kind: "grass", x: 0, y: 2, z: 0, w: 6, d: 8 };
const route = { kind: "wood", x: 5, y: 2, z: 1, w: 4, d: 2 };
assert.deepEqual(getSideWallOpenings(deck, [deck, route], 1), [[-0.2, 2.2]]);
assert.deepEqual(getSideWallOpenings(deck, [deck, route], -1), []);
assert.deepEqual(getSideWallOpenings(deck, [deck, { ...route, y: 4 }], 1), []);

// A Z connector opens its real X footprint; a remote/higher deck leaves the end solid.
const endDeck = { kind: 'grass', x: 0, y: 2, z: 0, w: 8, d: 6 };
const endRoute = { kind: 'wood', x: 1, y: 2, z: -5, w: 2, d: 4 };
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck, endRoute], -1), [[-0.2, 2.2]]);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck, endRoute], 1), []);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck, { ...endRoute, y: 4 }], -1), []);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck], -1, [{ x: -1, y: 2, z: -5, r: 3 }]), [[-2.25, 0.25]]);
assert.deepEqual(getEndWallOpenings(endDeck, [endDeck], -1, [{ x: -1, y: 4, z: -5, r: 3 }]), []);

assert.equal(stageSignatures.size,selectedStages.size,'selected stages need distinct sculpted landmark signatures');
assert.equal(motifHashes.size,selectedStages.size,'selected stages need distinct rendered motif pixels');
assert.equal(edgeProfiles.size,selectedStages.size,'selected stages need distinct physical guard profiles');
if(selectedStages.size===10){assert.ok(closedGuardEnds>10,'guard transition cap coverage is too small');assert.ok(seamCount>40,'seam coverage misses authored section transitions');}
if(selectedStages.size===10)assert.deepEqual([...renderedChuteStyles].sort(),['banked_slalom','corkscrew_drop','helix','rollercoaster'],'all ten stages must visibly use all four chute styles');
console.log(JSON.stringify({cameraSamples,cameraRays,cameraPaths,cameraContainmentChecks,rigidSightIntersections,cameraFailures:cameraFailures.length,firstFailures:cameraFailures.slice(0,20)}));
assert.equal(cameraFailures.length,0,`camera LOS: ${JSON.stringify(cameraFailures.slice(0,12))}`);
console.log(JSON.stringify({checkedBorders,checkedForestClusters,checkedDryCurves,checkedBankedRows,checkedBackdrops,checkedSceneryVertices,checkedBeacons,checkedOverlayVertices,verifiedTriangles,intersectionPairs,crossShellPairs,crossRoutePairs,crossSurfacePairs,seamCount,closedGuardEnds,checkedScenery,disposedCourseGeometries,disposedCourseMaterials,preservedForestMaterials,checkedV42Landmarks,checkedV42AnimatedParts,disposedV42Geometries,disposedV42Materials,motifs:motifHashes.size,edgeProfiles:edgeProfiles.size,landmarkSignatures:stageSignatures.size}));
console.table(results);
console.log(`Passed v4.2 Node structural and geometry checks for ${selectedStages.size} scenes. WebGL visual appearance remains unverified.`);
