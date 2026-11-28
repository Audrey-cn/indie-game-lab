// v3 blueprint scenery. All navigable surfaces use the exact authored floor points.
import * as THREE from 'three';
import { getRouteFrame, getRouteRibbonRows, getChuteShellRows, getCompanionChute, prepareRouteGeometry } from './course-math.mjs';
import { routeRibbonGeometry, chuteShellGeometry, routeBodyGeometry } from './course-geometry.mjs';
import { nearestSceneryClearance, resolveSceneryPosition } from './scenery-clearance.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const _toon = new Map();
let gradient;
function mat(color, glow = 0) {
  const key = `${color}/${glow}`;
  if (_toon.has(key)) return _toon.get(key);
  gradient ??= new THREE.DataTexture(new Uint8Array([110,110,110,255,195,195,195,255,255,255,255,255]),3,1);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const m = new THREE.MeshToonMaterial({color, gradientMap:gradient, emissive:color, emissiveIntensity:glow, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});
  _toon.set(key,m);
  return m;
}
function mesh(parent, geometry, material, x=0,y=0,z=0, sx=1,sy=1,sz=1, name='') {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.name=name;
  if (['grounded-green-hill','meadow-rock','winter-fireplace','kitchen-cabinet','festival-floating-lantern'].includes(name)) m.userData.decorativeProp=true;
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
const box = (p,c,x,y,z,w,h,d,name='') => mesh(p,boxGeo,mat(c),x,y,z,w,h,d,name);
const ball = (p,c,x,y,z,r=1,sx=1,sy=1,sz=1,name='') => mesh(p,sphereGeo,mat(c),x,y,z,r*sx,r*sy,r*sz,name);
function rod(parent,a,b,r,color) {
  const av=new THREE.Vector3(a.x,a.y,a.z), bv=new THREE.Vector3(b.x,b.y,b.z);
  const delta=bv.sub(av), length=delta.length();
  if(length<1e-5) return null;
  const m=mesh(parent,new THREE.CylinderGeometry(r,r,length,8),mat(color));
  m.position.copy(av).addScaledVector(delta,.5); m.quaternion.setFromUnitVectors(UP,delta.normalize()); return m;
}
function lineTube(parent,points,r,color,closed=false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,p.y,p.z)),closed,'centripetal');
  return mesh(parent,new THREE.TubeGeometry(curve,Math.max(12,points.length*2),r,6,closed),mat(color,.12));
}
function frame(points,i) { return getRouteFrame({points},i); }
export const createRouteRibbonGeometry = routeRibbonGeometry;
export const createChuteShellGeometry = chuteShellGeometry;
const EDGE_COLORS = {
  meadow_hedge:0x73a85d,rug_piping:0x9c6a70,canal_stone:0xc4bba6,
  oak_rail:0x987252,icing_rail:0xf4d4ae,roof_copper:0x9e6b51,
  cloud_rope:0xe6dacb,frost_rail:0x8dbecb,gilt_books:0xc7a15b,royal_gold:0xcda454,
};
const patternTextures = new Map();
function coursePattern(pattern) {
  if (patternTextures.has(pattern)) return patternTextures.get(pattern);
  const size=64,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let shade=1;
    if(pattern==='viscous_honey'||pattern==='viscous_mud')shade=Math.sin(x*.21+Math.sin(y*.13)*2)*Math.sin(y*.26)>.35?.65:1;
    else if(pattern==='woven_rug')shade=(x%8===0||y%8===0)?.74:((x+y)%4===0?.9:1);
    else if(pattern==='gingham')shade=(Math.floor(x/16)+Math.floor(y/16))%2?.78:1;
    else if(pattern==='cobblestone')shade=(y%16<2||(x+(Math.floor(y/16)%2)*16)%32<2)?.68:.94+Math.sin(x*.4+y*.7)*.035;
    else if(pattern==='terracotta_tiles')shade=(y%16<2||x%21<2)?.7:((x+y)%13===0?1:.93);
    else if(pattern==='frost_crystals'){const d=Math.abs((x%32)-16)+Math.abs((y%32)-16);shade=(d<2||Math.abs(d-11)<1)?.74:1;}
    else if(pattern==='constellation_pages')shade=(y%12===0&&x>8&&x<55)?.78:((x%31===8&&y%29===6)?.6:1);
    else if(pattern==='cloud_stars'||pattern==='royal_stars'){const dx=x%32-16,dy=y%32-16;shade=(Math.abs(dx)<2&&Math.abs(dy)<9||Math.abs(dy)<2&&Math.abs(dx)<9)?.64:1;if(pattern==='royal_stars'&&(x<3||x>60||y%32<2))shade=.8;}
    else if(pattern==='flower_petals'){const dx=x%32-16,dy=y%32-16;shade=(Math.hypot(dx,dy)<3||Math.abs(Math.hypot(dx,dy)-7)<1)?.72:1;}
    else {const dx=x%32-16,dy=y%32-16;shade=(Math.hypot(dx-3,dy-3)<3||Math.hypot(dx+3,dy-3)<3||Math.hypot(dx-3,dy+3)<3||Math.hypot(dx+3,dy+3)<3)?.76:1;}
    const i=(y*size+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=Math.round(shade*255);pixels[i+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;patternTextures.set(pattern,texture);return texture;
}
function courseMaterial(route, base) {
  if(!route.surfacePattern)return base;
  const material=base.clone();material.map=coursePattern(route.kind==='honey'?'viscous_honey':route.kind==='mud'?'viscous_mud':route.surfacePattern);
  material.color.setHex(route.kind==='honey'?0xb57228:route.kind==='mud'?0x805632:route.surfaceColor);material.userData.surfacePattern=route.surfacePattern;
  material.polygonOffset=true;material.polygonOffsetFactor=-2;material.polygonOffsetUnits=-2;
  return material;
}
function ribbon(group,route,material) {
  const m=mesh(group,createRouteRibbonGeometry(route),courseMaterial(route,material),0,0,0,1,1,1,`route-${route.id}`);
  m.material.side=THREE.DoubleSide;
  m.userData.route=route; m.userData.courseRibbon=true;
  const body=mesh(m,routeBodyGeometry(route),mat(EDGE_COLORS[route.edgeStyle]??(route.kind==='ice'?0x9ac9d1:route.kind==='neon'?0xc7a15b:0xb3916b)),0,0,0,1,1,1,route.walls?'swept-beveled-guard':'swept-open-edge-skirt');
  body.material.side=THREE.DoubleSide;body.userData.routeBody=true;
  m.userData.edgeStyle=route.edgeStyle||'stone';m.userData.guarded=!!route.walls;
  if(route.walls && ['oak_rail','rug_piping','cloud_rope','roof_copper'].includes(route.edgeStyle)){
    const sweep=getRouteRibbonRows(route);let last=-Infinity;
    for(let i=0;i<sweep.rows.length;i++){
      if(sweep.distances[i]-last<3.5)continue;last=sweep.distances[i];
      for(const side of [-1,1]){
        const p=sweep.rows[i][side<0?0:sweep.columns],f=sweep.frames[i];
        const post=mesh(m,new THREE.CylinderGeometry(.055,.08,.6,6),body.material,p.x+f.nx*.04*side,p.y+.12,p.z+f.nz*.04*side,1,1,1,'guard-support-post');
        post.userData.structuralGuard=true;
      }
    }
  }
  return m;
}

function eyes(group,y=.7,z=.52,space=.2,smile=true) {
  for(const side of [-1,1]) {
    ball(group,0x342942,side*space,y,z,.075,1,1.2,.5);
    ball(group,0xffffff,side*space-.018,y+.025,z+.035,.024);
    ball(group,0xffa7ad,side*(space+.12),y-.11,z-.015,.08,1,.44,.25);
  }
  if(smile) {
    const mouth=mesh(group,new THREE.TorusGeometry(.12,.022,5,12,Math.PI),mat(0x704e52),0,y-.13,z+.015);
    mouth.rotation.z=Math.PI;
  }
}
function flower(parent,x,y,z,color=0xffa5ce,scale=1) {
  const bunch=new THREE.Group();bunch.name='flower-bush';bunch.userData.decorativeProp=true;parent.add(bunch);parent=bunch;
  rod(parent,{x,y,z},{x,y:y+.34*scale,z},.025*scale,0x62a84c);
  for(let k=0;k<5;k++) {
    const a=k*Math.PI*.4;
    ball(parent,color,x+Math.cos(a)*.12*scale,y+.37*scale,z+Math.sin(a)*.12*scale,.10*scale,1,.5,1);
  }
  ball(parent,0xffd64a,x,y+.41*scale,z,.065*scale);
}
function tree(parent,x,y,z,scale=1,pine=false) {
  const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);g.name=pine?'snowy-pine':'storybook-tree';g.userData.decorativeProp=true;parent.add(g);
  mesh(g,new THREE.CylinderGeometry(.25,.48,2.8,7),mat(0x9a6741),0,1.4,0);
  if(pine) {
    for(let j=0;j<3;j++){
      mesh(g,new THREE.ConeGeometry(1.5-j*.26,2.4,7),mat(0x4ba19c),0,2+j*.85,0);
      mesh(g,new THREE.ConeGeometry(1.25-j*.25,1.8,7),mat(0xf1fbff),0,2.45+j*.85,0);
    }
  } else {
    for(const [dx,dy,dz,r] of [[0,3.3,0,1.6],[-1,2.8,.25,1.1],[.9,3,-.3,1.3]])ball(g,0x73c774,dx,dy,dz,r,1,.87,1);
    ball(g,0xabe78a,-.4,3.8,.7,.75);
  }
  return g;
}
function cloud(parent,x,y,z,scale=1,color=0xfff9fe,face=false) {
  const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);g.name='storybook-cloud';g.userData.decorativeProp=true;g.userData.motionRadius=1.4;parent.add(g);
  for(const [cx,cy,cz,r] of [[-1,0,0,.85],[0,.4,0,1.1],[1,0,0,.8],[.2,-.15,.15,.9]])ball(g,color,cx,cy,cz,r,1,.82,1);
  if(face) eyes(g,.25,.98,.28);
  return g;
}
function teacup(parent,x,y,z,s=1) {
  const g=new THREE.Group();g.name='porcelain-teacup';g.userData.decorativeProp=true;g.position.set(x,y,z);g.scale.setScalar(s);parent.add(g);
  mesh(g,new THREE.CylinderGeometry(.85,.55,1.1,16,1,true),mat(0xffe6bd),0,.6,0);
  mesh(g,new THREE.CylinderGeometry(.72,.72,.035,18),mat(0xa4653b),0,1.08,0);
  mesh(g,new THREE.CylinderGeometry(1.1,.98,.1,18),mat(0xfff1d6),0,.06,0);
  const handle=mesh(g,new THREE.TorusGeometry(.45,.13,7,16),mat(0xffdb98),1,.65,0);handle.rotation.y=Math.PI/2;
  for(let i=0;i<5;i++)flower(g,Math.cos(i*1.26)*.67,.25,Math.sin(i*1.26)*.67,0xe8ad66,.35);
  return g;
}
function book(parent,x,y,z,w=2,d=3,h=.5,color=0x7962b7) {
  const g=new THREE.Group();g.position.set(x,y,z);g.name='hardcover-book';parent.add(g);
  box(g,0xffefc7,0,h*.5,0,w*.92,h*.7,d*.95);
  for(const cy of [.06,h-.06])box(g,color,0,cy,0,w,.12,d);
  box(g,color,-w*.48,h*.5,0,.13,h,d);
  box(g,0xe4bc6a,0,h+.055,0,w*.56,.025,d*.72);
  return g;
}
function house(parent,x,y,z,scale=1,color=0xffc8a4,angle=0,roofY=0) {
  const g=new THREE.Group();g.name='half-timbered-house';g.userData.decorativeProp=true;g.position.set(x,y,z);g.rotation.y=angle;g.scale.setScalar(scale);parent.add(g);
  box(g,color,0,3,0,5,6,5);
  for(const sx of [-2.48,0,2.48])box(g,0x8d5d49,sx,3,2.53,.16,6,.12);
  for(const yy of [.3,3,5.7])box(g,0x8d5d49,0,yy,2.55,5.1,.16,.12);
  rod(g,{x:-2.4,y:3,z:2.57},{x:0,y:5.7,z:2.57},.07,0x8d5d49);
  rod(g,{x:2.4,y:3,z:2.57},{x:0,y:5.7,z:2.57},.07,0x8d5d49);
  const roof=mesh(g,new THREE.CylinderGeometry(3.9,3.9,5.7,3,1),mat(0xcb7354),0,6.45+roofY,0);roof.rotation.z=Math.PI/2;roof.rotation.y=Math.PI/2;
  box(g,0x7d9eaf,-1.25,4.4,2.61,1.05,1.2,.07);box(g,0x7d9eaf,1.25,4.4,2.61,1.05,1.2,.07);
  for(const sx of [-1.25,1.25]){
    box(g,0xffecc1,sx,4.4,2.68,.06,1.26,.05);box(g,0xffecc1,sx,4.4,2.68,1.1,.06,.05);
    box(g,0x9b6848,sx,3.65,2.8,1.35,.24,.5);
    for(let i=0;i<3;i++)flower(g,sx+(i-1)*.36,3.8,2.85,[0xffa0c3,0xffe987,0xa5d9ff][i],.5);
  }
  box(g,0x977253,0,1.1,2.62,1.2,2.2,.1);
  for(let i=0;i<7;i++){const awn=box(g,i%2?0xfff2d4:0xf49785,(i-3)*.65,2.8,3.1,.65,.12,1.5);awn.rotation.x=.22;}
  box(g,0xb67754,-1.65,7.4,-.7,.9,2,.85);
  return g;
}
function fountain(parent,x,y,z,s=1) {
  const g=new THREE.Group();g.name='town-fountain';g.userData.decorativeProp=true;g.position.set(x,y,z);g.scale.setScalar(s);parent.add(g);
  mesh(g,new THREE.CylinderGeometry(2,2.2,.45,24),mat(0xb8d6db),0,.2,0);
  mesh(g,new THREE.CylinderGeometry(1.8,1.8,.03,24),mat(0x6adddf,.16),0,.44,0);
  mesh(g,new THREE.CylinderGeometry(.4,.65,1.8,12),mat(0xe4e4ce),0,1.2,0);
  mesh(g,new THREE.CylinderGeometry(1,.45,.3,16),mat(0xd4e2d9),0,2.15,0);
  ball(g,0xa6f3ff,0,2.6,0,.35,1,1.8,1);
  return g;
}
function clocktower(parent,x,y,z,s=1) {
  const g=new THREE.Group();g.name='gilded-clocktower';g.userData.decorativeProp=true;g.position.set(x,y,z);g.scale.setScalar(s);parent.add(g);
  box(g,0xeccda1,0,5,0,4.8,10,4.8);
  for(const dx of [-2.3,2.3])box(g,0xd0ac79,dx,5,2.45,.3,10,.2);
  const dial=mesh(g,new THREE.CylinderGeometry(2.3,2.3,.24,32),mat(0xf5d57f),0,7.5,2.6);dial.rotation.x=Math.PI/2;
  const ring=mesh(g,new THREE.TorusGeometry(2.08,.10,8,32),mat(0xb78a35),0,7.5,2.77);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const tick=box(g,0x80623d,Math.sin(a)*1.8,7.5+Math.cos(a)*1.8,2.8,.09,.24,.04);tick.rotation.z=-a;}
  const hand=box(g,0x88612f,.35,7.95,2.85,.1,1.3,.06);hand.rotation.z=-.62;
  box(g,0x88612f,-.4,7.5,2.87,.9,.1,.06);
  mesh(g,new THREE.ConeGeometry(3.6,3.4,4),mat(0xca7754),0,12,0).rotation.y=Math.PI/4;
  for(const dx of [-1.5,1.5])rod(g,{x:dx,y:4.8,z:2.9},{x:dx+.3,y:2.3,z:2.9},.07,0xb88b39);
  return g;
}

function decorateCourseRoute(group,route) {
  if(route.section==='toy_train'){
    const trainGroup=new THREE.Group();trainGroup.name='wooden-toy-train-track';group.add(trainGroup);
    const sweep=getRouteRibbonRows(route);
    for(const side of [-1,1])lineTube(trainGroup,sweep.rows.map(row=>({...row[side<0?2:6],y:row[side<0?2:6].y+.12})),.035,0x867b73);
    const stride=Math.max(1,Math.floor(route.points.length/26));for(let i=0;i<route.points.length;i+=stride){const row=sweep.rows[i];rod(trainGroup,{...row[1],y:row[1].y+.11},{...row[7],y:row[7].y+.11},.04,0xb98b5b);}
    const p=route.points[Math.floor(route.points.length*.6)],f=frame(route.points,Math.floor(route.points.length*.6)),engine=new THREE.Group();engine.name='wooden-toy-locomotive';engine.position.set(p.x+f.nx*(route.width*.5+1),p.y,p.z+f.nz*(route.width*.5+1));engine.rotation.y=Math.atan2(f.tx,f.tz);group.add(engine);
    box(engine,0x89bdb1,0,.4,0,1.3,.65,2.6);box(engine,0xdf9b88,0,1,-.7,1.3,.7,.9);box(engine,0xe8c986,0,1.5,-.7,1.5,.2,1.1);mesh(engine,new THREE.CylinderGeometry(.2,.25,.55,10),mat(0xb47561),0,1.1,.6);
    for(const side of [-1,1])for(const z of [-.75,.75]){const wheel=mesh(engine,new THREE.CylinderGeometry(.3,.3,.17,10),mat(0xc79759),side*.7,.22,z);wheel.rotation.z=Math.PI/2;}
  }
  if(route.section==='terracotta_rooftops'){
    const stride=Math.max(1,Math.floor(route.points.length/35));
    const sweep=getRouteRibbonRows(route);
    for(let i=0;i<route.points.length;i+=stride)lineTube(group,sweep.rows[i].map(p=>({...p,y:p.y+.09})),.022,0xa65f49);
    for(const column of [1,4,7])lineTube(group,sweep.rows.map(row=>({...row[column],y:row[column].y+.09})),.022,0xe3a678);
  }
  if(route.section==='canal_bridges'){
    for(let k=0;k<2;k++){
      const lo=Math.floor(route.points.length*k/2),hi=Math.min(route.points.length-1,Math.floor(route.points.length*(k+1)/2)),ps=route.points.slice(lo,hi+1),base=Math.min(...ps.map(p=>p.y))-2;
      for(const side of [-1,1]){
        const positions=[],indices=[];
        ps.forEach((p,i)=>{const f=frame(ps,i),x=p.x+f.nx*(route.width*.48)*side,z=p.z+f.nz*(route.width*.48)*side;positions.push(x,p.y-.12,z,x,base+Math.sin(i/(ps.length-1)*Math.PI)*1.6,z);if(i<ps.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}});
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();const material=mat(0xc6bca1);material.side=THREE.DoubleSide;mesh(group,geo,material,0,0,0,1,1,1,'arched-canal-bridge');
      }
    }
  }
}

export function createFairytaleProp(def) {
  const g=new THREE.Group();g.name=`fairytale-${def.type}`;g.position.set(def.x,def.y,def.z);
  const parts={},type=def.type;
  if(type==='hedgehog') {
    ball(g,0xb68a5c,0,.42,0,.57,1.3,.8,1); ball(g,0xffddb3,0,.42,.45,.4,1,.8,1);
    for(let i=0;i<12;i++){const a=i*2.4;const spine=mesh(g,new THREE.ConeGeometry(.13,.45,5),mat(i%2?0x8e6846:0xd5af7d),Math.cos(a)*.4,.72+(i%3)*.06,Math.sin(a)*.34-.12);spine.rotation.z=Math.cos(a)*-.8;}
    eyes(g,.51,.78,.13);ball(g,0x694b40,0,.4,.83,.09);
    parts.feet=[ball(g,0x9b7156,-.25,.09,.2,.12),ball(g,0x9b7156,.25,.09,.2,.12)];
  } else if(type==='toy_mouse') {
    ball(g,0xc99b58,0,.42,0,.54,1,.8,1.25);ball(g,0xd9b371,0,.52,.43,.31);
    for(const side of [-1,1]){ball(g,0xc69251,side*.3,.85,.3,.24,1,1,.3);ball(g,0xf0bdab,side*.3,.85,.36,.15,1,1,.2);ball(g,0x79573e,side*.38,.12,-.2,.17);}
    eyes(g,.58,.68,.12);const key=mesh(g,new THREE.TorusGeometry(.22,.06,6,14),mat(0xffcf60),.6,.6,-.15);key.rotation.y=Math.PI/2;parts.spinner=key;
    lineTube(g,[{x:0,y:.3,z:-.5},{x:.4,y:.5,z:-.9},{x:.5,y:.8,z:-1.05}],.035,0xc58c69);
  } else if(type==='willow_branch' && def.variant==='bakery_awning') {
    const awning=new THREE.Group();g.add(awning);parts.branch=awning;
    for(let i=0;i<7;i++)box(awning,i%2?0xfff1d0:0xe8897c,(i-3)*.48,.05,0,.48,.11,2.5,'striped-bakery-awning');
    for(const side of [-1,1])rod(g,{x:side*1.7,y:-1.4,z:-1.1},{x:side*1.7,y:0,z:1.1},.065,0x95694f);
  } else if(type==='willow_branch') {
    const trunk=mesh(g,new THREE.CylinderGeometry(.65,1.1,6,9),mat(0x976742),-2.6,2.5,0);trunk.rotation.z=-.10;
    const branch=new THREE.Group();g.add(branch);parts.branch=branch;
    lineTube(branch,[{x:-2.6,y:1,z:0},{x:-1.4,y:.35,z:0},{x:0,y:.2,z:0},{x:1.5,y:.9,z:0}],.28,0xaf8357);
    for(let i=0;i<5;i++){ball(g,0x88c875,-3+i*.5,5.1+Math.sin(i)*.4,0,1.4,1,.7,1);lineTube(g,[{x:-3+i*.6,y:5,z:.6},{x:-2.8+i*.6,y:3.5,z:.65},{x:-3+i*.6,y:2.4,z:.5}],.07,0x9ccf78);}
    const face=new THREE.Group();face.position.set(-2.5,1.8,.55);g.add(face);eyes(face,.6,.1,.2);
  } else if(type==='ducklings' || type==='sheep' || type==='snow_bunny' || type==='penguin') {
    parts.feet=[];
    const count=type==='ducklings'?4:type==='sheep'?2:1;
    for(let i=0;i<count;i++) {
      const c=new THREE.Group();c.position.x=(i-(count-1)/2)*.85;g.add(c);
      if(type==='ducklings') {
        ball(c,0xffdd58,0,.36,0,.36,1,.9,1.2);ball(c,0xffe781,0,.65,.2,.26);
        ball(c,0xf4a346,0,.57,.46,.14,1,.45,1.3);eyes(c,.71,.41,.09,false);
      } else if(type==='sheep') {
        for(let j=0;j<6;j++){const a=j*Math.PI/3;ball(c,0xfff8ed,Math.cos(a)*.28,.55+(j%2)*.13,Math.sin(a)*.28,.34);}
        ball(c,0xcda88f,0,.65,.48,.26,.8,1,1);eyes(c,.7,.69,.09);
      } else if(type==='snow_bunny') {
        ball(c,0xf8fbff,0,.4,0,.43,1,.8,1.3);ball(c,0xffffff,0,.7,.28,.29);
        for(const side of [-1,1]){ball(c,0xf6faff,side*.15,1.12,.28,.18,.7,2.4,.55);ball(c,0xf4c4d7,side*.15,1.12,.37,.11,.5,2,.2);}
        eyes(c,.76,.51,.1);
      } else {
        ball(c,0x4f7397,0,.52,0,.45,.9,1.25,1);ball(c,0xfff5de,0,.45,.35,.3,.8,1.2,.4);ball(c,0xffc36b,0,.69,.44,.13,1,.4,1.2);eyes(c,.85,.38,.13,false);
      }
      for(const side of [-1,1])parts.feet.push(ball(c,type==='sheep'?0xb1937b:0xf4b667,side*.18,.08,.04,.12,1,.55,1.7));
    }
  } else if(type==='wind_cloud') {
    if(def.variant==='chimney'){
      box(g,0xbf7b5b,0,-.7,0,2.1,1.4,2.1,'warm-brick-chimney');
      box(g,0xe3b990,0,.02,0,2.45,.22,2.45);
      box(g,0x74605a,0,.15,0,1.5,.035,1.5);
      for(let k=0;k<3;k++)for(const side of [-1,1])box(g,0xe2ac83,side*.6,-.3-k*.4,1.06,.9,.035,.025);
    }
    const puff=cloud(g,0,def.variant==='chimney'?2.4:1,0,def.variant==='chimney'?.55:.9,0xfff6fc,true);parts.cloud=puff;
    const gust=new THREE.Group();gust.name='sparkling-cloud-updraft';g.add(gust);parts.gust=gust;
    for(let i=0;i<3;i++){const points=[];for(let k=0;k<=16;k++){const t=k/16,a=t*Math.PI*2+i;points.push({x:Math.cos(a)*(.45+t*.4),y:.2+t*3.5,z:Math.sin(a)*(.45+t*.4)});}lineTube(gust,points,.045,[0xb7eaff,0xffe7ad,0xdeb6ff][i]);}
  } else if(type==='turntable') {
    const pancake=def.variant==='pancake';
    box(g,0xa87653,0,.13,0,2.9,.26,2.6);
    const spinner=new THREE.Group();g.add(spinner);parts.spinner=spinner;
    mesh(spinner,new THREE.CylinderGeometry(1.12,1.12,.12,32),mat(pancake?0xe8b765:0x3b3349),0,.35,0);
    for(let i=0;i<4;i++){const ring=mesh(spinner,new THREE.TorusGeometry(.43+i*.16,.012,5,32),mat(pancake?0xffd88a:0x73687c),0,.46,0);ring.rotation.x=Math.PI/2;}
    mesh(spinner,new THREE.CylinderGeometry(.27,.27,.025,20),mat(pancake?0xffdf6e:0xed889c),0,.51,0);
    if(pancake){box(spinner,0xfff0a0,0,.5,0,.35,.12,.32);}else{rod(g,{x:1.05,y:.55,z:-.8},{x:.55,y:.55,z:.3},.045,0xe3c58a);}
  } else if(type==='toaster') {
    const body=box(g,0xf1bd56,0,.42,0,1.9,.9,1.35);body.geometry=new THREE.BoxGeometry(1,1,1,2,2,2);
    for(const side of [-1,1]){box(g,0x725848,side*.45,.9,0,.56,.035,.93);box(g,0xffdf8b,side*.45,.91,.48,.6,.08,.08);}
    ball(g,0xb17c32,1,.42,0,.12);box(g,0x9a6941,1,.6,0,.1,.16,.15);
    parts.toast=[];for(const side of [-1,1]){const slice=new THREE.Group();slice.position.set(side*.45,.84,0);g.add(slice);box(slice,0xc88a4c,0,.18,0,.51,.48,.13);ball(slice,0xcc9254,0,.51,0,.26,1,.65,.27);box(slice,0xffe0a1,0,.2,.073,.39,.34,.025);slice.userData.baseY=.84;parts.toast.push(slice);}
    for(const dx of [-.65,.65])ball(g,0x815f49,dx,.03,.4,.1);
  } else if(type==='spellbook_bridge') {
    const cover=box(g,0x9a6dc6,0,-.12,0,2.2,.14,1.6);parts.leftPage=new THREE.Group();parts.rightPage=new THREE.Group();g.add(parts.leftPage,parts.rightPage);
    for(const side of [-1,1]){const hinge=side<0?parts.leftPage:parts.rightPage;box(hinge,0xfff2c9,side*.51,0,0,1.02,.09,1.42);for(let i=0;i<5;i++)box(hinge,0xcaa875,side*.52,.052,(i-2)*.2,.7,.008,.025);}
    const glow=mesh(g,new THREE.RingGeometry(.8,1.05,24),new THREE.MeshBasicMaterial({color:0xffd879,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}),0,-.28,0);glow.rotation.x=-Math.PI/2;
  }
  if(g.children.length===1 && g.children[0].isGroup) {const wrapper=g.children[0];g.add(...wrapper.children);g.remove(wrapper);}
  if(['hedgehog','toy_mouse','willow_branch','wind_cloud','toaster'].includes(type)){
    parts.burst=[];
    for(let i=0;i<7;i++){
      const spark=mesh(g,new THREE.OctahedronGeometry(.13,0),mat(i%2?0xffa4ca:0xffe69a,.65),0,.65,0);
      spark.name=i%2?'helper-heart-spark':'helper-star-spark';spark.visible=false;spark.userData.burstSeed=i;parts.burst.push(spark);
    }
  }
  return {def,mesh:g,animatedParts:parts,baseY:def.y,phase:def.phase||0,pulse:0};
}

function allFloorPoints(track) { return [...track.platforms.map(p=>({x:p.x,y:p.y,z:p.z})),...(track.routes||[]).flatMap(r=>r.points),...(track.chutes||[]).flatMap(c=>c.points)]; }
function boundsOf(points,pad=0) { return {minX:Math.min(...points.map(p=>p.x))-pad,maxX:Math.max(...points.map(p=>p.x))+pad,minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y)),minZ:Math.min(...points.map(p=>p.z))-pad,maxZ:Math.max(...points.map(p=>p.z))+pad}; }
function addEnvironment(group,name) {const g=new THREE.Group();g.name=name;group.add(g);return g;}
function routeSamples(track,step=12) {
  const out=[],routes=(track.routes||[]).filter(r=>!r.secret);
  // Spread dressing across every act before taking additional samples on one road.
  for(let k=0;k<step;k++)for(const route of routes){
    const fraction=k===0?.5:k/step;
    const i=Math.min(route.points.length-1,Math.floor(fraction*(route.points.length-1)));
    out.push({p:route.points[i],f:frame(route.points,i),route});
  }
  return out;
}
function catchTerrain(track,group,b,base,color,name,zone=null) {
  const water=(track.fallZones||[]).filter(z=>z.type==='water');
  const xs=[b.minX,b.maxX],zs=[b.minZ,b.maxZ];
  for(const z of water){xs.push(Math.max(b.minX,Math.min(b.maxX,z.x-z.w/2)),Math.max(b.minX,Math.min(b.maxX,z.x+z.w/2)));zs.push(Math.max(b.minZ,Math.min(b.maxZ,z.z-z.d/2)),Math.max(b.minZ,Math.min(b.maxZ,z.z+z.d/2)));}
  const sorted=a=>[...new Set(a)].sort((a,b)=>a-b),xx=sorted(xs),zz=sorted(zs);
  for(let i=1;i<xx.length;i++)for(let j=1;j<zz.length;j++){
    const x=(xx[i-1]+xx[i])/2,z=(zz[j-1]+zz[j])/2;
    const zones=water.filter(q=>Math.abs(x-q.x)<=q.w/2&&Math.abs(z-q.z)<=q.d/2);
    const top=zones.length?Math.min(base,...zones.map(q=>q.y-.5)):base;
    const tile=box(group,color,x,top-3,z,xx[i]-xx[i-1],6,zz[j]-zz[j-1],name);
    if(zone&&!zones.length){tile.userData.fallZoneId=zone.id;tile.userData.contactY=top;}
  }
}
function groundedWorld(track,group,scope=null) {
  const g=addEnvironment(group,'environment-grounded-terrain');
  const routes=scope||track.routes,points=routes.flatMap(r=>r.points),b=boundsOf(points,15),floor=track.fallZones?.find(z=>z.fallback)?.y??b.minY-2.5;
  catchTerrain(track,g,b,floor,track.index===3?0x86b96b:0x98c878,'grounded-terrain',track.fallZones?.find(z=>z.fallback));
  const sample=routeSamples({...track,routes},4);
  for(let i=0;i<Math.min(sample.length,24);i++) {
    const {p,f,route}=sample[i],side=i%2?1:-1,x=p.x+f.nx*(route.width/2+5.5)*side,z=p.z+f.nz*(route.width/2+5.5)*side;
    ball(g,0x9dd477,x,p.y-1.2,z,4.3,1.4,.65,1.2,'grounded-green-hill');
    if(i%2===0)tree(g,x,p.y-.3,z,.8+i%3*.2);
    else {ball(g,0xadae94,x,p.y+.1,z,1.15,1.3,.65,1,'meadow-rock');flower(g,x-1.1,p.y+.1,z,0xffbbda);}
    for(let k=0;k<3;k++)flower(g,p.x+f.nx*(route.width/2+.45+k*.25)*side,p.y-.06,p.z+f.nz*(route.width/2+.5)*side+(k-1)*.4,[0xffa3c8,0xffe16c,0xe5c9ff][k],.85);
  }
  return g;
}
function indoorWorld(track,group,isKitchen=false,scope=null) {
  const g=addEnvironment(group,isKitchen?'environment-sunlit-kitchen':'environment-sunlit-living-room');
  const points=(scope||track.routes).flatMap(r=>r.points),b=boundsOf(points,13),floor=b.minY-2.8,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
  box(g,0xbc895e,(b.minX+b.maxX)/2,floor-.5,(b.minZ+b.maxZ)/2,w,.6,d,'room-floor');
  box(g,0xf3dcba,(b.minX+b.maxX)/2,floor+12,b.minZ-1,w+2,24,.8,'sunlit-room-wall');
  box(g,0xd3b591,b.minX-1,floor+12,(b.minZ+b.maxZ)/2,.8,24,d+2);
  for(const x of [b.minX+w*.22,b.minX+w*.72]){
    box(g,0xb7e2e8,x,floor+12,b.minZ-.54,9,12,.1,'sunlit-window');
    for(const side of [-1,1])box(g,0xfff1d1,x+side*4.7,floor+12,b.minZ-.3,.4,12.7,.4);
    for(const yy of [floor+5.8,floor+12,floor+18.2])box(g,0xfff1d1,x,yy,b.minZ-.3,9.8,.35,.4);
    box(g,0xfff1d1,x,floor+12,b.minZ-.3,.3,12,.4);
  }
  const start=track.start;
  if(!scope){
    box(g,isKitchen?0xffebdf:0xd3aa75,start.x,start.y-.64,start.z,10,.07,11,'woven-start-rug');
    if(isKitchen){for(let i=0;i<8;i++)for(let k=0;k<8;k++)if((i+k)%2===0)box(g,0xf19c9a,start.x+(i-3.5)*1.2,start.y-.51,start.z+(k-3.5)*1.2,1.2,.015,1.2);}
    else{for(let i=0;i<7;i++)box(g,0xf3dcb4,start.x+(i-3)*1.4,start.y-.51,start.z,.06,.02,10.7);}
  }
  for(const [i,route] of (scope||track.routes).entries()){
    const p=route.points[Math.floor(route.points.length*.5)];
    if(/stacked_books/.test(route.section||'')&&!isKitchen){
      const stride=Math.max(1,Math.floor(route.points.length/8));
      for(let q=0;q<route.points.length;q+=stride){const at=route.points[q];const base=Math.max(floor+.3,at.y-2.4),count=Math.max(1,Math.ceil((at.y-base)/.4));for(let j=0;j<count;j++){const bk=book(g,at.x,base+j*(at.y-base)/count,at.z,route.width+.5,2.8,(at.y-base)/count,[0x8071a9,0xe6a768,0x6c9b93][(q+j)%3]);bk.rotation.y=Math.sin(j*.7)*.07;}}
    }
    if(/coffee_table|upper_kitchen_counter|checkered_tablecloth/.test(route.section||'')){
      const rb=boundsOf(route.points),tw=rb.maxX-rb.minX+route.width+2,td=rb.maxZ-rb.minZ+route.width+2,tx=(rb.minX+rb.maxX)/2,tz=(rb.minZ+rb.maxZ)/2,top=rb.minY-.18;
      box(g,isKitchen?0xe5bd84:0x9e6946,tx,top-.5,tz,tw,1,td,'giant-furniture-table');
      for(const sx of [-1,1])for(const sz of [-1,1])box(g,0xa57a55,tx+sx*(tw/2-1),(top+floor)/2,tz+sz*(td/2-1),.6,top-floor,.6);
      teacup(g,tx+tw*.36,top+.05,tz-td*.32,1.8);
      if(/checkered_tablecloth/.test(route.section||'')){
        box(g,0xffeee1,tx,top+.035,tz,tw+.2,.04,td+.2,'checkered-dining-tablecloth');
        for(let ix=0;ix<10;ix++)for(let iz=0;iz<10;iz++)if((ix+iz)%2===0)box(g,0xefaaaa,tx+(ix-4.5)*tw/10,top+.105,tz+(iz-4.5)*td/10,tw/10,.015,td/10);
      }
    }
  }

  if(isKitchen){
    const cabinet=new THREE.Group();cabinet.name='kitchen-cabinet';cabinet.userData.decorativeProp=true;g.add(cabinet);
    box(cabinet,0xe4bd8b,b.minX+5,floor+4,b.minZ+6,8,8,7);
    for(let i=0;i<3;i++)box(cabinet,0xf5ddb7,b.minX+5,floor+1.3+i*2.3,b.minZ+9.6,7,.12,.08);
    teacup(g,b.maxX-5,floor+1,b.minZ+9,3);
  }else{
    const f=track.finish,chair=new THREE.Group();chair.name='giant-purple-armchair';chair.userData.decorativeProp=true;g.add(chair);
    box(chair,0x9b6baf,f.x+6,f.y-1.7,f.z,10,3,8);
    box(chair,0xbc87c4,f.x+9,f.y+1.2,f.z,2.5,6.5,8);teacup(g,b.maxX-5,floor,b.maxZ-5,3);
  }
  return g;
}
function townWorld(track,group,scope=null,rooftop=false) {
  const g=addEnvironment(group,rooftop?'environment-rooftop-clocktown':'environment-pastel-canal-town');
  const routes=scope||track.routes,points=routes.flatMap(r=>r.points),b=boundsOf(points,15),floor=b.minY-(rooftop?10:2);
  catchTerrain(track,g,b,rooftop?floor:(track.fallZones?.find(z=>z.fallback)?.y??floor),0xb2d4b1,'solid-town-foundation');
  const samples=routeSamples({...track,routes},3);
  for(let i=0;i<Math.min(16,samples.length);i++){
    const {p,f,route}=samples[i],side=i%2?1:-1;
    house(g,p.x+f.nx*(route.width/2+6.5)*side,p.y-(rooftop?7:1.2),p.z+f.nz*(route.width/2+6.5)*side,.95,[0xffc9b6,0xc4d7b9,0xd3c5e5,0xf7dda5][i%4],Math.atan2(-f.nx*side,-f.nz*side));
  }
  const canalRoutes=routes.filter(r=>!r.secret).slice(0,3);
  for(const route of (rooftop?canalRoutes:[])){const offset=route.points.map((p,i)=>{const f=frame(route.points,i);return {x:p.x+f.nx*(route.width/2+3.5),y:floor+.05,z:p.z+f.nz*(route.width/2+3.5)};});ribbon(g,{id:`canal-${route.id}`,points:offset,width:4,bank:0},mat(0x54ccce,.16)).name='town-canal';}
  const roundabout=routes.find(r=>/fountain|roundabout/.test(r.section||''));
  if(roundabout){const q=boundsOf(roundabout.points);fountain(g,(q.minX+q.maxX)/2,q.minY,(q.minZ+q.maxZ)/2,1.3);}
  if(rooftop){const p=track.finish;clocktower(g,p.x+6,p.y-8,p.z-2,1.8);}
  return g;
}
function cloudSea(track,group,dynamic) {
  const g=addEnvironment(group,'environment-layered-cloud-sea'),b=boundsOf(allFloorPoints(track),12);
  for(let i=0;i<28;i++){
    const t=i/27,x=b.minX+(Math.sin(i*2.399)*.5+.5)*(b.maxX-b.minX),z=b.minZ+t*(b.maxZ-b.minZ);
    const c=cloud(g,x,b.minY-7-(i%3)*2,z,2.8+(i%4)*.4,i%3?0xfffbec:0xe9d6ff);
    c.traverse(n=>{n.castShadow=false;});dynamic.clouds.push({mesh:c,baseX:x,seed:i});
  }
}
function winterWorld(track,group,dynamic) {
  const g=addEnvironment(group,'environment-hearth-frost-attic'),s=track.start;
  const hearth=track.fallZones?.find(z=>z.type==='indoor');
  box(g,0xaf7952,hearth?.x??s.x,(hearth?.y??s.y-3.42)-.6,hearth?.z??s.z+1,hearth?.w??16,.8,hearth?.d??15,'attic-oak-floor');
  for(const side of [-1,1]){box(g,0xbd9670,s.x+side*8,s.y+3.3,s.z,.45,9,15);rod(g,{x:s.x+side*8,y:s.y+6,z:s.z-7},{x:s.x,y:s.y+12,z:s.z-7},.23,0x956c4b);}
  const hearthProp=new THREE.Group();hearthProp.name='warm-attic-fireplace';hearthProp.userData.decorativeProp=true;g.add(hearthProp);
  box(hearthProp,0xc19b79,s.x-4,s.y+1.5,s.z+5,5,4,1.5);
  box(hearthProp,0x8b5d54,s.x-4,s.y+.7,s.z+5.8,3,2.5,.1);
  for(let i=0;i<5;i++)ball(hearthProp,[0xffbe6d,0xffdb8b,0xff945d][i%3],s.x-4+(i-2)*.4,s.y+.3+(i%2)*.3,s.z+5.9,.45,.65,1.6,.3);
  const snowBounds=boundsOf(allFloorPoints(track),12),snowLevel=track.fallZones?.find(z=>z.fallback)?.y??5;
  catchTerrain(track,g,snowBounds,snowLevel,0xe1f1f9,'glacier-snowfield',track.fallZones?.find(z=>z.fallback));
  // The open window is a physical frame, with a clear navigable center.
  const first=track.routes?.[0],exit=first?.points[Math.min(first.points.length-1,Math.floor(first.points.length*.7))]||s;
  for(const side of [-1,1])box(g,0xf1dfbc,exit.x+side*3,exit.y+2.6,exit.z,.35,5.8,.5,'open-attic-window-frame');
  box(g,0xf1dfbc,exit.x,exit.y+5.4,exit.z,6.4,.35,.5);
  for(const [i,{p,f,route}] of routeSamples(track,3).entries()){
    if(i>16)break;
    tree(g,p.x+f.nx*(route.width/2+5)*(i%2?1:-1),p.y-1,p.z+f.nz*(route.width/2+5)*(i%2?1:-1),1.3,true);
  }
  const f=track.finish;house(g,f.x+6,f.y-1,f.z-5,1.7,0xb8afad,0);cloudSea(track,g,dynamic);
  return g;
}
function libraryWorld(track,group,scope=null) {
  const g=addEnvironment(group,'environment-starlight-library'),routes=scope||track.routes,points=routes.flatMap(r=>r.points),b=boundsOf(points),landmark=track.landmarks?.find(l=>l.type==='telescope'||l.type==='library'),cx=landmark?.x??(b.minX+b.maxX)/2,cz=landmark?.z??(b.minZ+b.maxZ)/2;
  const terrace=routes.find(r=>r.section==='ascending_bookshelf_270'),radius=terrace?Math.max(...terrace.points.map(p=>Math.hypot(p.x-cx,p.z-cz)))+terrace.width*.5+3:Math.max(12,(b.maxX-b.minX)/2+5),base=b.minY-3,height=Math.max(14,b.maxY-base+7);
  const instrument=new THREE.Group();instrument.name='golden-telescope';instrument.userData.decorativeProp=true;g.add(instrument);
  mesh(instrument,new THREE.CylinderGeometry(.85,1.2,height,12),mat(0xe8bb58,.1),cx,base+height/2,cz,1,1,1,'golden-telescope-spire');
  for(let i=0;i<5;i++)mesh(instrument,new THREE.TorusGeometry(1.07,.13,8,20),mat(0xffdda0),cx,base+height*i/5,cz).rotation.x=Math.PI/2;
  const telescope=new THREE.Group();telescope.position.set(cx,base+height,cz);telescope.rotation.z=-.55;instrument.add(telescope);
  mesh(telescope,new THREE.CylinderGeometry(.65,.8,4.5,14),mat(0xe1b851),0,0,0);mesh(telescope,new THREE.CylinderGeometry(.54,.54,.08,16),mat(0x90d5f7,.3),0,2.28,0);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,x=cx+Math.cos(a)*radius,z=cz+Math.sin(a)*radius;
    const shelf=new THREE.Group();shelf.name='tall-magical-bookshelf';shelf.userData.decorativeProp=true;shelf.position.set(x,base,z);shelf.rotation.y=-a+Math.PI/2;g.add(shelf);
    box(shelf,0x8a6556,0,height/2,0,5.5,height,.5);
    for(let j=0;j<5;j++){
      const yy=1+j*(height-1)/5;
      box(shelf,0xc59a6a,0,yy,1,5.8,.18,2.4);
      for(let k=0;k<7;k++)box(shelf,[0x927ba9,0x70aaa8,0xe7ae72,0xbc7d94][(k+j+i)%4],(k-3)*.67,yy+.75,1,.48,1+(k%3)*.24,1.1);
    }
  }
  const dome=mesh(g,new THREE.SphereGeometry(radius+6,32,16,0,Math.PI*2,0,Math.PI/2),new THREE.MeshToonMaterial({color:0x283d72,emissive:0x172957,emissiveIntensity:.5,side:THREE.BackSide}),cx,base+height+3,cz,1,.7,1,'starry-observatory-dome');
  for(let i=0;i<40;i++){
    const a=i*2.399,h=.2+(i%7)/8,r=(radius+4)*Math.sqrt(1-h*h);
    const star=mesh(g,new THREE.OctahedronGeometry(.1+(i%3)*.04),mat(0xffe4a0,.8),cx+Math.cos(a)*r,base+height+3+h*(radius+4)*.7,cz+Math.sin(a)*r);star.castShadow=false;
  }
  return g;
}
function finishScenery(track,group) {
  const f=track.finish,g=addEnvironment(group,'blueprint-goal-landmark');g.position.set(f.x,f.y,f.z);
  if(track.worldType==='grounded_nature') {
    const points=[];for(let i=0;i<=24;i++){const a=Math.PI-i*Math.PI/24;points.push({x:Math.cos(a)*2.5,y:1.8+Math.sin(a)*2.5,z:0});}
    lineTube(g,points,.16,0x79ae60);for(let i=0;i<points.length;i+=2){const p=points[i];flower(g,p.x,p.y,p.z,0xffb3d1,1.5);}
  } else if(track.id.includes('living') || track.name.includes('客厅')) {
    ball(g,0xaa75bd,0,-.2,0,2.6,1.3,.18,1,'embroidered-purple-cushion');
    const rim=mesh(g,new THREE.TorusGeometry(2.3,.055,6,32),mat(0xf2d094),0,.04,0);rim.rotation.x=Math.PI/2;rim.scale.x=1.25;
  } else if(track.name.includes('甜点')) {
    for(let i=0;i<3;i++){
      const r=3.6-i*.8;mesh(g,new THREE.CylinderGeometry(r,r,1,24),mat(i%2?0xf9c1bc:0xfff0dd),0,-3+i,0,1,1,1,'strawberry-cake-tier');
      for(let k=0;k<9-i*2;k++){const a=k*Math.PI*2/(9-i*2);ball(g,0xf16b79,Math.cos(a)*(r-.25),-2.42+i,Math.sin(a)*(r-.25),.25,1,1.3,1);}
    }
  } else if(track.worldType==='town_street' && track.name.includes('老街')) {
    for(const side of [-1,1])box(g,0xa77c52,side*3,2.8,0,.16,5.6,.16);
    rod(g,{x:-3,y:5.2,z:0},{x:3,y:5.2,z:0},.035,0x937050);
    for(let i=0;i<8;i++){const pennant=mesh(g,new THREE.ConeGeometry(.33,.7,3),mat([0xef9aae,0xffdb79,0x93d2cf][i%3]),(i-3.5)*.7,4.8,0);pennant.rotation.z=Math.PI;}
  } else if(track.goalStyle==='belfry') {
    for(const side of [-1,1])box(g,0xf2d6a5,side*3.2,3.1,0,.55,6.2,.7);
    box(g,0xf7deb3,0,6.1,0,7,.5,2);
    mesh(g,new THREE.ConeGeometry(4.4,2.6,4),mat(0xcf865f),0,7.7,0).rotation.y=Math.PI/4;
    mesh(g,new THREE.CylinderGeometry(.6,1.05,1.5,20,1,true),mat(0xe3bb61),0,4.4,0,1,1,1,'clocktower-belfry-bell');
    mesh(g,new THREE.TorusGeometry(1.05,.09,6,24),mat(0xffd780),0,3.65,0).rotation.x=Math.PI/2;
    rod(g,{x:0,y:4.5,z:0},{x:0,y:3.65,z:0},.06,0xa77937);ball(g,0xbb8c3d,0,3.58,0,.16);
  } else if(track.goalStyle==='observatory_dome') {
    const dome=mesh(g,new THREE.SphereGeometry(4.6,24,12,0,Math.PI*2,0,Math.PI/2),mat(0x7384b6,.12),0,1.7,-5.7,1,.8,1,'observatory-goal-dome');
    const rim=mesh(g,new THREE.TorusGeometry(4.6,.12,8,32),mat(0xe9c67c),0,1.7,-5.7);rim.rotation.x=Math.PI/2;
    for(let i=0;i<4;i++){const a=i*Math.PI/4,pts=[];for(let k=0;k<=16;k++){const v=k*Math.PI/16;pts.push({x:Math.cos(v)*4.6*Math.cos(a),y:1.7+Math.sin(v)*3.68,z:-5.7+Math.cos(v)*4.6*Math.sin(a)});}lineTube(g,pts,.045,0xe3c37f);}
  } else if(track.worldType==='sky_floating') {
    for(const side of [-1,1]){box(g,0xffeac1,side*3,2,0,.5,4,.5);mesh(g,new THREE.ConeGeometry(.6,1.1,5),mat(0xf2c96c),side*3,4.5,0);}
  } else if(track.worldType==='grand_medley') {
    for(const side of [-1,1]){
      const arch=new THREE.Group();arch.position.set(side*2.1,0,-1.4);g.add(arch);
      for(const dx of [-1.9,1.9]){box(arch,0xf8e4c1,dx,2.7,0,.38,5.4,.55);mesh(arch,new THREE.ConeGeometry(.5,1.2,6),mat(0xe9bd62),dx,6.1,0);}
      mesh(arch,new THREE.TorusGeometry(1.9,.22,8,24,Math.PI),mat(0xf2ce73),0,4.65,0);
    }
  }
  return g;
}

export function addV3Platform(track,p,parent,materials) {
  const g=new THREE.Group();g.name=`v3-dock-${p.kind}`;g.position.set(p.x,p.y,p.z);parent.add(g);
  const color=p.kind==='ice'?0xbceff4:p.kind==='crystal'?0xbdb3e1:p.kind==='cloud'?0xe9f2ff:p.kind==='wood'?0xd8aa78:p.kind==='brass'?0xe6c57c:track.worldType==='town_street'?0xe7d4b4:track.worldType==='indoor_home'?0xd5aa7c:0x9bd97f;
  const floor=box(g,color,0,-(p.h||.6)/2,0,p.w,p.h||.6,p.d,'receiving-platform-floor');
  floor.material=floor.material.clone();floor.material.polygonOffset=true;floor.material.polygonOffsetFactor=1;floor.material.polygonOffsetUnits=1;
  if(track.worldType==='sky_floating'){
    const r=Math.min(p.w,p.d)*.45;mesh(g,new THREE.ConeGeometry(r,4,7),mat(0xa17c69),0,-2.3,0).rotation.x=Math.PI;
    for(const side of [-1,1])ball(g,0x75bb73,side*p.w*.36,.07,p.d*.32,.55,1,.5,1);
  }
  if(p.kind==='wood')for(let i=0;i<Math.max(3,p.d/1.1);i++){const seam=box(g,0xb88b61,0,.055,-p.d/2+.3+i*1.05,p.w,.008,.025,'raised-deck-grain');seam.material=seam.material.clone();seam.material.polygonOffset=true;seam.material.polygonOffsetFactor=-1;seam.material.polygonOffsetUnits=-1;}
  return g;
}

export function buildV3World(track,group,dynamic,materials) {
  group.userData.v3World=true; group.userData.worldType=track.worldType;
  const world=new THREE.Group(); world.name='v3-world-'+track.worldType; world.userData.worldType=track.worldType; group.add(world); group=world;
  prepareRouteGeometry(track.routes||[],track.chutes||[]);
  dynamic.routes=[];dynamic.chutes=[];dynamic.fairytaleProps=[];
  for(const route of track.routes||[]){
    const kind=route.kind,material=kind==='book'?mat(0xffedbc,.12):route.section==='terracotta_rooftops'?mat(0xcf805a):kind==='ice'||kind==='ice_bowl'?mat(0xb8eaf1,.13):kind==='wood'?materials.wood:kind==='cloud'?mat(0xd4e7ff,.2):kind==='crystal'||kind==='neon'?mat(0xc4b8e5,.2):kind==='brass'?materials.brass:kind==='mud'?materials.mud:track.worldType==='town_street'?materials.stoneCurb:mat(0xf2dca4);
    dynamic.routes.push({def:route,mesh:ribbon(group,route,material)});
    if(kind==='book') {
      const a=route.points[0],b=route.points.at(-1),p=route.points[Math.floor(route.points.length/2)];
      const pad=book(group,p.x,p.y-.46,p.z,route.width+.12,Math.hypot(b.x-a.x,b.z-a.z),.32,0x9c78bd);
      pad.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);pad.name='floating-spellbook-landing-pages';
    }
    decorateCourseRoute(group,route);
  }
  const colors={glass:0x7ce7eb,oak:0xd3a66e,honey:0xffc456,rainbow:0xf1b4ec,ice:0xa4efff,starlight:0xffdc8a};
  for(const def of track.chutes||[]){
    const chuteGroup=new THREE.Group();chuteGroup.name=`chute-${def.id}`;group.add(chuteGroup);
    const geo=createChuteShellGeometry(def),color=colors[def.material]||colors.glass;
    const material=new THREE.MeshToonMaterial({color,gradientMap:gradient,transparent:true,opacity:def.material==='oak'?.88:.48,side:THREE.DoubleSide,emissive:color,emissiveIntensity:def.material==='starlight'?.32:.14,depthWrite:def.material==='oak',vertexColors:def.material==='rainbow'});
    if(def.material==='rainbow'){
      const attr=geo.attributes.position,cols=[];
      for(let i=0;i<attr.count;i++){const c=new THREE.Color().setHSL((i%17)/17*.8+Math.floor(i/17)/def.points.length*.35,.76,.73);cols.push(c.r,c.g,c.b);}
      geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
    }
    const shell=mesh(chuteGroup,geo,material,0,0,0,1,1,1,'chute-half-pipe-shell');shell.castShadow=false;
    if(def.doubleHelix){
      const companion=getCompanionChute(def),companionGeometry=createChuteShellGeometry(companion);
      const cp=companionGeometry.attributes.position,colors=[];
      for(let i=0;i<cp.count;i++){const c=new THREE.Color().setHSL((i%17)/17*.82+.2,.76,.74);colors.push(c.r,c.g,c.b);}companionGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      mesh(chuteGroup,companionGeometry,new THREE.MeshToonMaterial({color:0xffffff,gradientMap:gradient,transparent:true,opacity:.42,vertexColors:true,side:THREE.DoubleSide,depthWrite:false,emissive:0x803d6f,emissiveIntensity:.16}),0,0,0,1,1,1,'rainbow-double-helix-companion');
      const companionRows=getChuteShellRows(companion);
      for(const column of [0,companionRows.columns])lineTube(chuteGroup,companionRows.rows.map(row=>row[column]),.06,0xe9b5ff);
    }
    const chuteRows=getChuteShellRows(def);
    for(const column of [0,chuteRows.columns])lineTube(chuteGroup,chuteRows.rows.map(row=>row[column]),.065,def.material==='oak'?0xffd28e:color);
    const rings=[],chevrons=[];
    for(let i=3;i<def.points.length-3;i+=Math.max(3,Math.floor(def.points.length/14))){
      const p=def.points[i],f=frame(def.points,i),tangent=new THREE.Vector3(f.tx,(def.points[i+1].y-def.points[i-1].y)/Math.max(.1,Math.hypot(def.points[i+1].x-def.points[i-1].x,def.points[i+1].z-def.points[i-1].z)),f.tz).normalize();
      const ring=mesh(chuteGroup,new THREE.TorusGeometry(def.width*.42,.035,6,24,Math.PI*1.65),new THREE.MeshBasicMaterial({color:0xffefbc,transparent:true,opacity:.62,depthWrite:false}),p.x,p.y+def.width*.35,p.z);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent);ring.userData.phase=i/def.points.length*Math.PI*2;ring.userData.baseOpacity=.62;rings.push(ring);
      const star=mesh(chuteGroup,new THREE.OctahedronGeometry(.11,0),mat(0xffe8ad,.8),p.x,p.y+.12,p.z);chevrons.push(star);
    }
    // Grounded oak chute has a hollow bark trunk, its front cut away to reveal the helix.
    if(def.material==='oak'){
      const b=boundsOf(def.points),cx=def.center?.x??(b.minX+b.maxX)/2,cz=def.center?.z??(b.minZ+b.maxZ)/2,r=((def.radius||Math.max((b.maxX-b.minX)/2,(b.maxZ-b.minZ)/2))+def.width*.5+1.15)/.92;
      mesh(chuteGroup,new THREE.CylinderGeometry(r*.92,r,b.maxY-b.minY+5,18,1,true,.1,Math.PI*1.45),mat(0x956440),cx,(b.maxY+b.minY)/2,cz,1,1,1,'hollow-giant-oak-trunk');
      for(let i=0;i<5;i++){const a=i*Math.PI*.4;const canopy=ball(chuteGroup,0x83bb6c,cx+Math.cos(a)*r*.5,b.maxY+r*.35+1.5,cz+Math.sin(a)*r*.5,r*.7,1,.5,1);canopy.name='oak-canopy-leaf-cluster';}
    }
    if(def.material==='rainbow'&&def.turns>=2){
      const accents=def.points.map((p,i)=>{const f=frame(def.points,i);return{x:p.x-f.nx*(def.width*.75),y:p.y+def.width*.75,z:p.z-f.nz*def.width*.75};});lineTube(chuteGroup,accents,.13,0xffe499);
    }
    dynamic.chutes.push({def,mesh:chuteGroup,rings,chevrons});
  }
  for(const def of track.props||[]){const prop=createFairytaleProp(def);group.add(prop.mesh);dynamic.fairytaleProps.push(prop);}
  if(track.worldType==='grounded_nature')groundedWorld(track,group);
  else if(track.worldType==='indoor_home')indoorWorld(track,group,track.name.includes('厨房'));
  else if(track.worldType==='town_street')townWorld(track,group,null,track.name.includes('钟楼'));
  else if(track.worldType==='sky_floating')cloudSea(track,group,dynamic);
  else if(track.worldType==='hybrid_winter')winterWorld(track,group,dynamic);
  else if(track.worldType==='starlight_library')libraryWorld(track,group);
  else if(track.worldType==='grand_medley'){
    const rs=track.routes,nature=rs.filter(r=>r.section==='grounded_flower_valley'),town=rs.filter(r=>r.section==='lantern_cobblestone_street'),library=rs.filter(r=>['indoor_library_jump','library_sky_dock'].includes(r.section));
    groundedWorld(track,group,nature);townWorld(track,group,town);indoorWorld(track,group,false,library);libraryWorld(track,group,library);cloudSea(track,group,dynamic);
    for(const [i,{p,f,route}] of routeSamples(track,3).entries()){if(i>20)break;const lantern=ball(group,0xffd089,p.x+f.nx*(route.width/2+1.7),p.y+3,p.z+f.nz*(route.width/2+1.7),.36,1,1.3,1);lantern.name='festival-floating-lantern';}
  }
  finishScenery(track,group);
  addFallEnvironment(track,group);
  addActLandmarks(track,group,dynamic);
  enforceSceneryClearance(track,group,dynamic);
  const b=boundsOf(allFloorPoints(track),6),n=90,pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){pos[i*3]=b.minX+(Math.sin(i*14.34)*.5+.5)*(b.maxX-b.minX);pos[i*3+1]=b.minY+2+(i%11);pos[i*3+2]=b.minZ+(Math.cos(i*3.72)*.5+.5)*(b.maxZ-b.minZ);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));dynamic.petals=new THREE.Points(geo,new THREE.PointsMaterial({color:track.worldType==='starlight_library'?0xffe4a5:0xffc6dc,size:.16,transparent:true,opacity:.72}));group.add(dynamic.petals);
}



function addActLandmarks(track,parent,dynamic) {
  const signatures=['flower-windmill','cushion-spool','bakery-sign','pasture-acorn','sugar-cake','copper-clock','cloud-shrine','aurora-veil','stellar-astrolabe','festival-crown'];
  dynamic.landmarkSpinners=[];
  for(const act of (track.acts||[]).slice(1)){
    const route=track.routes.find(r=>act.routeIds.includes(r.id));if(!route)continue;
    const p=route.points[0],f=frame(route.points,0),side=act.role==='microcontrol'?-1:1;
    const g=new THREE.Group();g.name=`signature-${signatures[track.index]}-${act.id}`;g.userData.stageSignature=signatures[track.index];g.userData.decorativeProp=true;g.userData.motionRadius=.3;
    g.position.set(p.x+f.nx*(route.width/2+6)*side,p.y-1,p.z+f.nz*(route.width/2+6)*side);parent.add(g);
    const accent=track.visualIdentity.palette[1],glow=track.visualIdentity.palette[2];
    if(track.index===0){
      box(g,0xe8d6a7,0,2.1,0,1.4,4.2,1.4);mesh(g,new THREE.ConeGeometry(1.3,1.3,5),mat(0xd9a96c),0,4.8,0);
      const sails=new THREE.Group();sails.position.set(0,3.5,1);g.add(sails);
      for(let k=0;k<4;k++){const blade=box(sails,0xffe4af,0,.95,0,.3,2,.1);blade.rotation.z=k*Math.PI/2;blade.position.set(-Math.sin(k*Math.PI/2)*.95,Math.cos(k*Math.PI/2)*.95,0);}
      dynamic.landmarkSpinners.push({mesh:sails,axis:'z',speed:.4});flower(g,0,.1,1.1,glow,1.6);
    }else if(track.index===1){
      for(let k=0;k<3;k++)ball(g,[0x9d78b0,accent,glow][k],0,.5+k*.6,0,1.7,1,.23,1);
      mesh(g,new THREE.CylinderGeometry(.7,.7,2.7,18),mat(0xcf9b67),0,2.3,0);
      for(const y of [1,3.65])mesh(g,new THREE.CylinderGeometry(1.35,1.35,.2,18),mat(0xf2d4a5),0,y,0);
      for(let k=0;k<8;k++)mesh(g,new THREE.TorusGeometry(.78,.04,5,20),mat(glow),0,1.4+k*.25,0).rotation.x=Math.PI/2;
    }else if(track.index===2){
      for(const x of [-1.5,1.5])box(g,0x99704c,x,2,0,.18,4,.18);
      box(g,0xffedc5,0,3.5,0,3.5,1.6,.25);
      for(const x of [-.75,0,.75]){const loaf=ball(g,0xd99a54,x,3.5,.22,.65,.45,1,.28);loaf.rotation.z=-.4;}
      for(let k=0;k<6;k++)box(g,k%2?0xf3c69d:0xb3d4c6,(k-2.5)*.6,4.5,.4,.6,.16,1.3);
    }else if(track.index===3){
      mesh(g,new THREE.CylinderGeometry(.65,1.15,1.4,8),mat(0xaa8050),0,.7,0);
      ball(g,0xd4ab60,0,2.35,0,1.2,.9,1.35,.9);ball(g,0x876447,0,3,0,1.25,1,.5,1);
      rod(g,{x:0,y:3.4,z:0},{x:.4,y:4,z:0},.14,0x765538);flower(g,1.3,.1,.7,0xf5dc79,1.5);
    }else if(track.index===4){
      for(let k=0;k<3;k++)mesh(g,new THREE.CylinderGeometry(1.7-k*.35,1.7-k*.35,.8,20),mat(k%2?0xf5c3ae:0xffe0b4),0,.4+k*.8,0);
      for(let k=0;k<7;k++){const a=k*Math.PI*2/7;ball(g,0xe8738b,Math.cos(a)*1.15,1.75,Math.sin(a)*1.15,.23,1,1.3,1);}
      mesh(g,new THREE.ConeGeometry(.5,1,8),mat(glow),0,2.9,0);
    }else if(track.index===5){
      box(g,0xad7656,0,1.3,0,1.5,2.6,1.4);
      const dial=mesh(g,new THREE.CylinderGeometry(1.6,1.6,.25,24),mat(0xf6d58e),0,3,0);dial.rotation.x=Math.PI/2;
      for(let k=0;k<12;k++){const a=k*Math.PI/6;ball(g,0x946c3e,Math.sin(a)*1.3,3+Math.cos(a)*1.3,.17,.09);}
      const hand=box(g,0x84613d,0,3,.22,.1,1.1,.08);dynamic.landmarkSpinners.push({mesh:hand,axis:'z',speed:.3});
    }else if(track.index===6){
      mesh(g,new THREE.ConeGeometry(2.2,3.5,7),mat(0x947996),0,-1.75,0).rotation.x=Math.PI;
      mesh(g,new THREE.CylinderGeometry(2.2,2.2,.3,18),mat(0xa6d6b3),0,0,0);
      for(const x of [-1.25,1.25])box(g,0xffebc3,x,1.5,0,.25,3,.3);
      mesh(g,new THREE.TorusGeometry(1.25,.15,7,20,Math.PI),mat(0xffdfa2),0,2.8,0);
      const gem=mesh(g,new THREE.OctahedronGeometry(.65),mat(glow,.5),0,1.8,0);dynamic.landmarkSpinners.push({mesh:gem,axis:'y',speed:.55});
    }else if(track.index===7){
      mesh(g,new THREE.ConeGeometry(1.1,2.5,5),mat(0xbce7f1),0,1.25,0);
      for(let k=0;k<3;k++){const wave=[];for(let j=0;j<=24;j++){const t=j/24;wave.push({x:(t-.5)*5,y:3+k*.5+Math.sin(t*6+k)*.45,z:k*.4});}lineTube(g,wave,.16,[0x91e6de,0xafb4f1,0xddace2][k]);}
    }else if(track.index===8){
      box(g,0x99765b,0,.8,0,.45,1.6,.45);
      const orrery=new THREE.Group();orrery.position.y=2.7;g.add(orrery);
      for(let k=0;k<3;k++){const ring=mesh(orrery,new THREE.TorusGeometry(1.55,.06,6,32),mat(0xe7c778));ring.rotation.set(k*.75,k*.6,.4);}
      ball(orrery,glow,0,0,0,.5);dynamic.landmarkSpinners.push({mesh:orrery,axis:'y',speed:.22});
    }else{
      mesh(g,new THREE.CylinderGeometry(1.8,1.8,.4,24),mat(0xe5be62),0,.4,0);
      for(let k=0;k<7;k++){const a=k*Math.PI*2/7,x=Math.cos(a)*1.4,z=Math.sin(a)*1.4;mesh(g,new THREE.ConeGeometry(.37,1.8,6),mat(0xf8dc87),x,1.35,z);ball(g,k%2?accent:glow,x,2.25,z,.23);}
      ball(g,0xd49bd6,0,1.3,0,1.1,1,.75,1);
    }
  }
}

function enforceSceneryClearance(track,world,dynamic) {
  const props=[];
  world.traverse(node=>{
    if(!node.userData.decorativeProp && node.name!=='wooden-toy-locomotive')return;
    for(let parent=node.parent;parent&&parent!==world;parent=parent.parent){
      if(parent.userData.decorativeProp||parent.name.startsWith('fairytale-')||parent.name==='blueprint-goal-landmark')return;
    }
    props.push(node);
  });
  dynamic.decorativeProps=[];
  for(const node of props){
    world.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(node,true),center=bounds.getCenter(new THREE.Vector3());
    const size=bounds.getSize(new THREE.Vector3()),radius=Math.hypot(size.x,size.z)/2+(node.userData.motionRadius||0);
    const initial={x:center.x,z:center.z,radius,name:node.name};
    const safe=resolveSceneryPosition(track,initial);
    // World groups are unscaled, but use parent-local displacements explicitly.
    const before=node.parent.worldToLocal(center.clone());
    const after=node.parent.worldToLocal(new THREE.Vector3(safe.x,center.y,safe.z));
    node.position.add(after.sub(before));node.updateMatrixWorld(true);
    const cloudEntry=dynamic.clouds?.find(entry=>entry.mesh===node);if(cloudEntry)cloudEntry.baseX=node.position.x;
    const margin=nearestSceneryClearance(track,safe).margin;
    node.userData.clearanceRadius=radius;node.userData.decorativeProp=true;
    dynamic.decorativeProps.push({mesh:node,radius,center:{x:safe.x,z:safe.z},margin});
  }
}
function addFallEnvironment(track,group) {
  const zones=new THREE.Group();zones.name='contextual-fall-environment';group.add(zones);
  for(const zone of track.fallZones||[]){
    if(zone.type==='bush'&&!zone.fallback){
      catchTerrain(track,zones,{minX:zone.x-zone.w/2,maxX:zone.x+zone.w/2,minZ:zone.z-zone.d/2,maxZ:zone.z+zone.d/2},zone.y,track.index===3?0x86b96b:0x98c878,'flower-meadow-catch',zone);
    }
    if(zone.fallback && zone.type!=='indoor')continue;
    if(!['water','indoor'].includes(zone.type))continue;
    const level=zone.triggerY??zone.y;
    const water=zone.type==='water';
    // These same plane levels are used by findFallZone and floor bounce physics.
    const surfaceGroup=new THREE.Group();surfaceGroup.name=water?(track.worldType==='grounded_nature'?'valley-stream':track.worldType==='town_street'?'town-canal':'icy-river'):'room-catch-surface';zones.add(surfaceGroup);
    const floor=box(surfaceGroup,water?(track.index===7?0x8ce5ef:0x50cbd4):(track.index===4?0xeee0ce:0xb58359),zone.x,level-(water?.06:.2),zone.z,zone.w,water?.12:.4,zone.d,water?'fall-water-surface':'fall-room-floor');
    floor.userData.fallZoneId=zone.id;floor.userData.contactY=level;
    if(water){
      floor.material=mat(track.index===7?0x8ce5ef:0x50cbd4,.16).clone();
      floor.material.transparent=true;floor.material.opacity=.82;
      for(let i=0;i<5;i++){
        const ripple=mesh(zones,new THREE.RingGeometry(.5+i*.14,.54+i*.14,28),new THREE.MeshBasicMaterial({color:0xd9ffff,transparent:true,opacity:.28,depthWrite:false}),zone.x+(i-2)*zone.w/7,level+.065,zone.z+Math.sin(i)*zone.d*.2);
        ripple.rotation.x=-Math.PI/2;
      }
    }else{
      for(let i=1;i<12;i++)box(zones,track.index===4?0xc4b9ac:0x936940,zone.x-zone.w/2+zone.w*i/12,level+.045,zone.z,.035,.015,zone.d);
    }
  }
}

export function animateFairytaleScenery(dynamic,elapsed,dt) {
  for(const spinner of dynamic.landmarkSpinners||[])spinner.mesh.rotation[spinner.axis]+=dt*spinner.speed;
  for(const entry of dynamic.fairytaleProps||[]){
    const {def,mesh:m,animatedParts:p}=entry,t=elapsed+entry.phase;
    entry.pulse=Math.max(0,(entry.pulse||0)-dt*2.5);
    const pulse=entry.pulse;
    if(['ducklings','sheep','snow_bunny','penguin'].includes(def.type)){
      m.position.x=def.x+Math.sin(elapsed*(def.speed||.8)+(def.phase||0))*(def.patrol||1.5);
      m.rotation.z=Math.sin(t*6)*.055;m.position.y=def.y+Math.abs(Math.sin(t*5))*.05;
    }
    if(p.burst)for(const spark of p.burst){const i=spark.userData.burstSeed,progress=1-pulse,a=i*Math.PI*2/p.burst.length;spark.visible=pulse>0;spark.position.set(Math.cos(a)*progress*2,.7+Math.sin(progress*Math.PI)*1.6,Math.sin(a)*progress*2);spark.scale.setScalar(Math.max(.05,pulse));spark.rotation.y=elapsed*2+i;}
    if(p.feet)p.feet.forEach((f,i)=>f.position.z=.04+Math.sin(t*6+i*Math.PI)*.07);
    if(p.spinner)p.spinner.rotation.y+=dt*(def.type==='toy_mouse'?2.8:(def.omega||1.4));
    if(p.branch)p.branch.rotation.z=Math.sin(t*1.3)*.055-pulse*.24;
    if(p.toast)p.toast.forEach((slice,i)=>slice.position.y=slice.userData.baseY+Math.max(0,Math.sin(t*2+i*.2))*.28+pulse*1.9);
    if(p.gust){p.gust.rotation.y=elapsed*1.4;p.gust.scale.setScalar(1+pulse*.4);p.gust.position.y=Math.sin(t*1.8)*.1;}
    if(p.leftPage){p.leftPage.rotation.z=-.12-Math.sin(t*2)*.07;p.rightPage.rotation.z=.12+Math.sin(t*2)*.07;}
    if(['hedgehog','toy_mouse'].includes(def.type))m.position.y=def.y+Math.sin(t*3)*.035;
  }
  for(const {rings,chevrons} of dynamic.chutes||[]){
    for(const r of rings)r.material.opacity=.35+.35*(.5+.5*Math.sin(elapsed*3-r.userData.phase));
    for(const c of chevrons)c.rotation.y+=dt*1.6;
  }
}
