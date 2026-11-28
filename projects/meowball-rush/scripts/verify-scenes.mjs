// Node-only scene structure and geometry checks. This does not render WebGL or
// validate lighting, textures, frame rate, visual appearance, or runtime physics.
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHash } from "node:crypto";
import { getRouteRibbonRows, getChuteShellRows, prepareRouteGeometry, nearestRouteSurface } from "../src/course-math.mjs";
import { nearestSceneryClearance } from "../src/scenery-clearance.mjs";
import { collideRouteGuardrails } from "../src/course-runtime.mjs";
import { verifyRibbonMesh, verifyMeshCheckerFixtures, verifyMeshPairSeparation } from "./mesh-checks.mjs";
import "./verify-fall-feedback.mjs";
import { createRouteRibbonGeometry, createChuteShellGeometry, animateFairytaleScenery } from "../src/v3-worlds.mjs";
import { createDirector, updateDirector, triggerSetpiece } from "../src/director.mjs";
import { createCameraOcclusion, isCameraOccluder } from "../src/camera-occlusion.mjs";
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
let cameraSamples = 0, cameraRays = 0, cameraPaths = 0, cameraContainmentChecks = 0;
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
  if(blockers.length)cameraFailures.push({label,ball:[ball.x,ball.y,ball.z],eye:[pose.x,pose.y,pose.z],blockers:blockers.map(hierarchy)});
  return blockers;
}
function verifyCameraScene(track,group,dynamicMeshes) {
  const safety=createCameraOcclusion(group),sightline=createCameraSightline(group),sky=group.getObjectByName('storybook-sky');
  sightMeshes=[];group.traverse(mesh=>{if(mesh.isMesh)sightMeshes.push(mesh);});
  const resetPickups=()=>{for(const star of dynamicMeshes.stars){star.collected=false;star.mesh.visible=true;}};
  const frame=(ball,elapsed)=>{
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
        if(d<hit){const inverse=1/(d||.001);ball.x=hammer.worldHead.x+dx*inverse*(hit+.08);ball.y=hammer.worldHead.y+dy*inverse*(hit+.08);ball.z=hammer.worldHead.z+dz*inverse*(hit+.08);ball.grounded=false;ball.supportRoute=null;ball.supportPlatform=null;}
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
    recordSight(group,pose,ball,`${track.id}: authored start ${aspect}/${dt}`);
    const untouched=sightline.resolve(ball,pose,dt);
    assert.ok(untouched.sightline.clear&&!untouched.sightline.compressed,`${track.id}: authored start needs a rigid safety correction ${JSON.stringify(untouched.sightline)}`);
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
  const paths=[...track.routes,...track.chutes,...flights],runs=paths.flatMap(path=>(track.chutes.includes(path)||path.ballistic?[0]:[-.32,0,.32]).map(lane=>({paths:[path],lane})));
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
      const data=track.chutes.includes(path)||path.ballistic?null:getRouteRibbonRows(path),side=Math.sign(lane);
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
      frame(ball,elapsed);
      const desired=updateDirector(director,{ball,track,dt,elapsed,forwardInput:1});
      const pose=sightline.resolve(ball,desired,dt);safety.update(ball,pose,dt);
      if(!pose.sightline.clear)cameraFailures.push({label:`${track.id}/${path.id}[${i}] lane ${lane}: rigid silhouette cone unresolved`,ball:[ball.x,ball.y,ball.z],eye:[pose.x,pose.y,pose.z],desired:{...desired},blockers:pose.sightline.blockers,reason:pose.sightline.reason,blockerNames:pose.sightline.blockerNames});
      const blockers=recordSight(group,pose,ball,`${track.id}/${path.id}[${i}] lane ${lane}`);
      for(const mesh of blockers)if(isCameraOccluder(mesh,group))assert.fail(`${track.id}: scenery safety missed ${hierarchy(mesh)}`);
    }
    }
  }
  safety.dispose();
  console.log(`${track.id}: completed authored-start and every-path camera LOS audit`);
}
const motifHashes=new Set(),edgeProfiles=new Set(),stageSignatures=new Set();
let verifiedTriangles=0,intersectionPairs=0,crossShellPairs=0,crossRoutePairs=0,crossSurfacePairs=0,seamCount=0,closedGuardEnds=0,checkedScenery=0;
verifyMeshCheckerFixtures();
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
verifyHazardEntries(hazardFixture, buildTrackScene(hazardFixture).dynamicMeshes);
function isAttached(node, root) {
  for (let p = node; p; p = p.parent) if (p === root) return true;
  return false;
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
const expectedWorlds = ['grounded_nature','indoor_home','town_street','grounded_nature','indoor_home','town_street','sky_floating','hybrid_winter','starlight_library','grand_medley'];
assert.equal(TRACKS.length, 10, 'v3 needs all ten approved stages');
for (const [stage, track] of TRACKS.entries()) {
  assert.equal(track.worldType, expectedWorlds[stage], `${track.id}: wrong blueprint environment`);
  const { group, dynamicMeshes } = buildTrackScene(track);
  verifyMushroomContact(dynamicMeshes);
  verifyHazardEntries(track, dynamicMeshes);
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
  assert.equal(signatureGroups,3,`${track.id}: missing act landmark sculptures`);
  assert.ok(Array.isArray(dynamicMeshes.fairytaleProps), `${track.id}: missing interactive prop registration`);
  assert.equal(dynamicMeshes.fairytaleProps.length, (track.props || []).length, `${track.id}: interactive prop count`);
  for (const entry of dynamicMeshes.fairytaleProps) {
    assert.ok(track.props.includes(entry.def), `${track.id}: orphan prop definition`);
    assert.ok(isAttached(entry.mesh, group), `${track.id}/${entry.def.type}: prop is detached`);
    let propMeshes=0;entry.mesh.traverse(node=>{if(node.isMesh)propMeshes++;});
    assert.ok(propMeshes >= 2, `${track.id}/${entry.def.type}: missing sculpted prop parts`);
    close(entry.mesh.position.x, entry.def.x, `${track.id}: prop X`);
    close(entry.mesh.position.y, entry.def.y, `${track.id}: prop Y`);
    close(entry.mesh.position.z, entry.def.z, `${track.id}: prop Z`);
  }
  assert.ok(Array.isArray(dynamicMeshes.chutes), `${track.id}: missing chute registration`);
  assert.equal(dynamicMeshes.chutes.length, (track.chutes || []).length, `${track.id}: chute count`);
  for (const entry of dynamicMeshes.chutes) {
    assert.ok(track.chutes.includes(entry.def), `${track.id}: orphan chute definition`);
    assert.ok(isAttached(entry.mesh, group), `${track.id}: detached chute`);
    let translucent = 0, surfaceMeshes = 0;
    entry.mesh.traverse(node => {if (node.isMesh) {
      surfaceMeshes++;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      translucent += mats.filter(m => m.transparent && m.opacity > 0.15 && m.opacity < 1).length;
    }});
    assert.ok(surfaceMeshes >= 3, `${track.id}: chute lacks halfpipe and guard structure`);
    const shell=entry.mesh.getObjectByName('chute-half-pipe-shell');
    const topology=verifyRibbonMesh(shell.geometry,`${track.id}/${entry.def.id}`);verifiedTriangles+=topology.triangles;intersectionPairs+=topology.intersectionPairs;
    if(entry.def.doubleHelix){
      const companion=entry.mesh.getObjectByName('rainbow-double-helix-companion');assert.ok(companion,`${track.id}: reflected companion shell missing`);
      const companionTopology=verifyRibbonMesh(companion.geometry,`${track.id}/${entry.def.id}: companion`);verifiedTriangles+=companionTopology.triangles;intersectionPairs+=companionTopology.intersectionPairs;
      crossShellPairs+=verifyMeshPairSeparation(shell.geometry,companion.geometry,`${track.id}: primary/companion`);
      const legacy=createChuteShellGeometry({...entry.def,width:entry.def.width*.82,points:entry.def.points.map(p=>({x:entry.def.center.x*2-p.x,y:p.y+.65,z:entry.def.center.z*2-p.z}))});
      assert.throws(()=>verifyMeshPairSeparation(shell.geometry,legacy,'legacy mirrored helix'),/separate shells intersect/,'regression did not expose the original crossing strands');legacy.dispose();
    }
    if(entry.def.material==='oak'){
      const trunk=entry.mesh.getObjectByName('hollow-giant-oak-trunk'),position=trunk.geometry.attributes.position;
      let minRadius=Infinity;for(let i=0;i<position.count;i++)minRadius=Math.min(minRadius,Math.hypot(position.getX(i),position.getZ(i)));
      assert.ok(minRadius>=entry.def.radius+entry.def.width/2+1,`${track.id}: tapered oak housing intersects the chute corridor`);
      const canopies=entry.mesh.children.filter(node=>node.name==='oak-canopy-leaf-cluster');assert.equal(canopies.length,5,`${track.id}: oak canopy coverage missing`);
      const top=Math.max(...entry.def.points.map(p=>p.y));
      for(const canopy of canopies)assert.ok(new THREE.Box3().setFromObject(canopy,true).min.y>=top+1.5-1e-5,`${track.id}: actual oak leaves intrude into upper chute clearance`);
    }
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
    for(const [name,rowIndex]of[['start',0],['end',data.rows.length-1]]){
      if(!route.walls)continue;
      const cap=body.geometry.userData.endCaps.find(cap=>cap.row===rowIndex);
      if(!cap){assert.ok(!data.seams[name]?.guardTransition,`${label}: guarded transition has no closure`);continue;}
      assert.ok(cap?.indexCount>=6,`${label}: raised guard ends in an open cross-section`);closedGuardEnds++;
      const vertices=body.geometry.attributes.position,index=body.geometry.index,row=data.rows[rowIndex],f=data.frames[rowIndex],origin=row[0];
      const coordinate=p=>(p.x-origin.x)*f.nx+(p.z-origin.z)*f.nz;
      const rowCoordinates=row.map(coordinate),edgeHeight=Math.max(...row.map(p=>p.y));let guardArea=0;
      for(let k=cap.firstIndex;k<cap.firstIndex+cap.indexCount;k+=3){
        const triangle=[0,1,2].map(j=>{const v=index.getX(k+j);return{x:vertices.getX(v),y:vertices.getY(v),z:vertices.getZ(v)};});
        const center={x:triangle.reduce((n,p)=>n+p.x,0)/3,y:triangle.reduce((n,p)=>n+p.y,0)/3,z:triangle.reduce((n,p)=>n+p.z,0)/3},cross=coordinate(center);
        if(center.y>edgeHeight+.02)guardArea++;
        if(cross>rowCoordinates[0]+1e-5&&cross<rowCoordinates.at(-1)-1e-5){
          let j=1;while(j<data.columns&&rowCoordinates[j]<cross)j++;
          const t=(cross-rowCoordinates[j-1])/(rowCoordinates[j]-rowCoordinates[j-1]),floor=row[j-1].y+(row[j].y-row[j-1].y)*t;
          assert.ok(center.y<=floor+2e-5,`${label}: curb cap puts a face above the playable road interior`);
        }
      }
      assert.ok(guardArea>0,`${label}: guard closure has no actual raised cap triangles`);
    }
    assert.equal(body.name,route.walls?'swept-beveled-guard':'swept-open-edge-skirt',`${label}: guardless edge identity differs from collision`);
    if(route.walls){
      const vertices=body.geometry.attributes.position,heights=[];
      for(let j=0;j<body.geometry.userData.sweepStride/2;j++){
        const height=vertices.getY(j)-vertices.getY(0);heights.push(Math.round(height*1000));if(height<-.2)break;
      }
      edgeProfiles.add(heights.join('/'));
    }
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
  const disposed = new Set();
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

assert.equal(stageSignatures.size,10,'all ten stages need distinct sculpted landmark signatures');
assert.equal(motifHashes.size,10,'all ten stages need distinct rendered motif pixels');
assert.equal(edgeProfiles.size,10,'all ten stages need distinct physical guard profiles');
assert.ok(closedGuardEnds>10,'guard transition cap coverage is too small');
assert.ok(seamCount>40,'seam coverage misses authored section transitions');
console.log(JSON.stringify({cameraSamples,cameraRays,cameraPaths,cameraContainmentChecks,cameraFailures:cameraFailures.length,firstFailures:cameraFailures.slice(0,20)}));
assert.equal(cameraFailures.length,0,`camera LOS: ${JSON.stringify(cameraFailures.slice(0,12))}`);
console.log(JSON.stringify({verifiedTriangles,intersectionPairs,crossShellPairs,crossRoutePairs,crossSurfacePairs,seamCount,closedGuardEnds,checkedScenery,motifs:motifHashes.size,edgeProfiles:edgeProfiles.size,landmarkSignatures:stageSignatures.size}));
console.table(results);
console.log(`Passed v3 Node structural and geometry checks for all ${TRACKS.length} scenes. WebGL visual appearance remains unverified.`);
