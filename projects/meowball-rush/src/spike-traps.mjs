import * as THREE from 'three';
import { spikeState } from './course-runtime.mjs';
import { surfaceOverlayGeometry } from './course-geometry.mjs';
import { nearestRouteSurface } from './course-math.mjs';

// A shared phase drives both the floor warning and the actual solid tips.
// Cones disappear below the brass holes while retracted; there is no invisible
// retracted collider or opaque full-height shell over the player.
export function addSpikeTraps(track, group, dynamic) {
  dynamic.spikes = [];
  for (const def of track.spikes || []) {
    const trap = new THREE.Group();trap.name='periodic-spike-trap';group.add(trap);
    const route = track.routes.find(r=>r.id===def.routeId)
      || nearestRouteSurface(track.routes,def.x,def.z,Infinity)?.route;
    const radius=def.r||.8;
    const plateMat=new THREE.MeshToonMaterial({color:0xa88349,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const plate=new THREE.Mesh(route?surfaceOverlayGeometry(route,{x:def.x,z:def.z,shape:'circle',radius,margin:.35,offset:.05}):new THREE.CircleGeometry(radius,24),plateMat);
    plate.name='spike-brass-ground-plate';trap.add(plate);
    if(!route){plate.rotation.x=-Math.PI/2;plate.position.set(def.x,def.y+.05,def.z);}
    const field=new THREE.Mesh(plate.geometry,new THREE.MeshBasicMaterial({color:0xffa34e,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
    field.name='active-spike-danger-field';field.position.copy(plate.position);field.rotation.copy(plate.rotation);trap.add(field);
    const ringMat=new THREE.MeshBasicMaterial({color:0xffd76a,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide});
    const ring=new THREE.Mesh(new THREE.RingGeometry(radius*.85,radius*.97,32),ringMat);
    ring.rotation.x=-Math.PI/2;ring.position.set(def.x,def.y+.065,def.z);ring.name='spike-warning-ring';trap.add(ring);
    const tips=new THREE.Group();tips.name='retractable-spike-tips';trap.add(tips);
    const tipMat=new THREE.MeshToonMaterial({color:0xf4d6a6,emissive:0xdd7651,emissiveIntensity:.08});
    const holeMat=new THREE.MeshBasicMaterial({color:0x493d44,side:THREE.DoubleSide});
    for(let i=0;i<5;i++) {
      const angle=i*Math.PI*2/5,offset=Math.max(0,radius-.105);
      const x=def.x+Math.cos(angle)*offset,z=def.z+Math.sin(angle)*offset;
      const floor=route?nearestRouteSurface([route],x,z,Infinity)?.y??def.y:def.y;
      const hole=new THREE.Mesh(new THREE.CircleGeometry(.115,10),holeMat);
      hole.rotation.x=-Math.PI/2;hole.position.set(x,floor+.055,z);hole.name='brass-spike-hole';trap.add(hole);
      const height=def.height??1.05;
      const tip=new THREE.Mesh(new THREE.ConeGeometry(.105,height,6),tipMat);
      tip.userData.height=height;
      tip.position.set(x,floor+.48,z);tip.userData.floor=floor;tips.add(tip);
    }
    dynamic.spikes.push({def,mesh:trap,plate,ring,tips,field});
  }
  animateSpikeTraps(dynamic,0);
}

export function animateSpikeTraps(dynamic, elapsed) {
  for(const entry of dynamic.spikes||[]) {
    const state=spikeState(entry.def,elapsed);
    entry.phase=state.phase;entry.tips.visible=state.active;
    entry.field.visible=state.active;
    for(const tip of entry.tips.children) {
      tip.scale.y=Math.max(.001,state.extension);
      tip.position.y=tip.userData.floor+tip.userData.height*.5*state.extension;
    }
    entry.ring.material.color.setHex(state.active?0xff654d:state.warning?0xffed92:0xaabfc5);
    entry.ring.material.opacity=state.warning?.65+Math.sin(elapsed*48)*.3:state.active?.9:.28;
  }
}
