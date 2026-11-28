import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FALL_MESSAGES, findFallZone, beginFallRecovery, advanceFallRecovery } from '../src/fall-feedback.mjs';
import { createFallEffect, updateFallEffects } from '../src/fall-effects.mjs';
import { nearestSceneryClearance, resolveSceneryPosition } from '../src/scenery-clearance.mjs';

for (const hz of [120, 60, 25]) for (const type of ['water','indoor','bush','cloud']) {
  const zone = { id:type, type, x:0,y:1,z:0,w:8,d:8,triggerY:1,priority:30 };
  const track = { fallZones:[{...zone,type:'cloud',fallback:true,triggerY:-8,priority:0},zone] };
  const ball = {x:0,y:1.55,z:0,r:.62,vx:3,vy:-12,vz:1,grounded:false,previousBottom:1.3};
  assert.equal(findFallZone(track, ball),zone,`${type}: precise visible catch surface`);
  assert.ok(FALL_MESSAGES[type]?.length,`${type}: missing toast`);
  assert.equal(findFallZone(track,{...ball,grounded:true}),null,'grounded balls must not trigger recovery');
  assert.equal(findFallZone(track,{...ball,vy:5}),null,'upward jumps must not trigger recovery');
  const checkpoint={x:9,y:3,z:10};beginFallRecovery(ball,zone);
  assert.equal(ball.y,zone.y+ball.r,'contact height must equal rendered level');
  if(type==='indoor')assert.ok(ball.vy>0,'floor contact must have a physical bounce');
  let maxY=ball.y;
  for(let tick=0;tick<Math.ceil(2*hz);tick++){
    advanceFallRecovery(ball,1/hz,checkpoint);maxY=Math.max(maxY,ball.y);
    assert.ok(ball.y>=zone.y+ball.r-1e-8,'ball fell through a visible catch surface');
  }
  assert.equal(ball.fallRecovery,null,'recovery never finished');
  assert.ok(Math.hypot(ball.x-checkpoint.x,ball.z-checkpoint.z)<1e-8,'checkpoint reset drift');
  assert.ok(maxY>zone.y+ball.r,'bounce/recall must visibly lift ball');
  const parent=new THREE.Group(),effect=createFallEffect(parent,zone,{x:0,z:0});
  const effects=[effect],start=effect.group.children[1].position.clone();
  updateFallEffects(effects,.1);
  assert.ok(effect.group.children[1].position.distanceTo(start)>.01,`${type}: particles never animated`);
  assert.ok(effect.ring.scale.x>1,'splash/dust ring must expand');
  updateFallEffects(effects,2);assert.equal(effects.length,0);assert.equal(parent.children.length,0);
}

// Reproduces the giant-mug-on-spiral defect using its complete footprint.
const track={routes:[{id:'road',width:6,points:[{x:0,z:0},{x:0,z:-30}]}],chutes:[{
  id:'spiral',width:3.6,center:{x:12,z:-12},doubleHelix:true,
  points:Array.from({length:65},(_,i)=>({x:12+Math.cos(i*Math.PI/32)*6,z:-12+Math.sin(i*Math.PI/32)*6})),
}]};
const mug={x:6,z:-12,radius:4,name:'giant mug'};
assert.ok(nearestSceneryClearance(track,mug).margin<0,'clipped original mug must fail');
const safe=resolveSceneryPosition(track,mug);
assert.ok(nearestSceneryClearance(track,safe).margin>=0.025,'mug must clear every centerline by halfWidth+radius+1m');
console.log('Passed contextual fall contact, bounce, animation, recovery and scenery clearance regressions at 120/60/25Hz.');
