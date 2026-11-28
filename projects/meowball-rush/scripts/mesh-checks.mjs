// Independent geometric validation, deliberately separate from sweep generation.
// Triangle intersections use 3D segments and coplanar 2D projections.
import assert from 'node:assert/strict';
import * as THREE from 'three';
const EPS=1e-6;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const length=a=>Math.hypot(a.x,a.y,a.z);
function segmentTriangle(a,b,t){
  const direction=sub(b,a),e1=sub(t[1],t[0]),e2=sub(t[2],t[0]),h=cross(direction,e2),den=dot(e1,h);
  if(Math.abs(den)<1e-10)return false;
  const s=sub(a,t[0]),u=dot(s,h)/den,q=cross(s,e1),v=dot(direction,q)/den,w=dot(e2,q)/den;
  return u>EPS&&v>EPS&&u+v<1-EPS&&w>EPS&&w<1-EPS;
}
const area2=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
function strictInside(p,t){const signs=t.map((a,i)=>area2(a,t[(i+1)%3],p));return signs.every(s=>s>EPS)||signs.every(s=>s<-EPS);}
export function trianglesIntersect(a,b){
  const n=cross(sub(a[1],a[0]),sub(a[2],a[0])),size=length(n);
  if(size<1e-10)return false;
  const coplanar=b.every(p=>Math.abs(dot(n,sub(p,a[0])))/size<EPS);
  if(coplanar){
    const axis=Math.abs(n.x)>Math.abs(n.y)?(Math.abs(n.x)>Math.abs(n.z)?'x':'z'):(Math.abs(n.y)>Math.abs(n.z)?'y':'z');
    const project=p=>axis==='x'?{x:p.y,y:p.z}:axis==='y'?{x:p.x,y:p.z}:{x:p.x,y:p.y};
    const aa=a.map(project),bb=b.map(project);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const p=aa[i],q=aa[(i+1)%3],r=bb[j],s=bb[(j+1)%3];
      if(area2(p,q,r)*area2(p,q,s)<-EPS*EPS&&area2(r,s,p)*area2(r,s,q)<-EPS*EPS)return true;
    }
    const center=t=>({x:(t[0].x+t[1].x+t[2].x)/3,y:(t[0].y+t[1].y+t[2].y)/3});
    return aa.some(p=>strictInside(p,bb))||bb.some(p=>strictInside(p,aa))||strictInside(center(aa),bb)||strictInside(center(bb),aa);
  }
  for(let i=0;i<3;i++)if(segmentTriangle(a[i],a[(i+1)%3],b)||segmentTriangle(b[i],b[(i+1)%3],a))return true;
  return false;
}
export function verifyRibbonMesh(geometry,label,{columns=geometry.userData.ribbonColumns,rows=geometry.userData.ribbonRows}={}){
  const p=geometry.attributes.position,index=geometry.index,triangles=[],bins=new Map(),pairs=new Set();
  assert.ok(index,'swept floor must be an indexed continuous mesh');
  assert.equal(p.count,rows*(columns+1),`${label}: disconnected slats or duplicated seam vertices`);
  let minimumArea=Infinity;
  for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],vertices=ids.map(j=>({x:p.getX(j),y:p.getY(j),z:p.getZ(j)}));
    const area=(vertices[1].x-vertices[0].x)*(vertices[2].z-vertices[0].z)-(vertices[2].x-vertices[0].x)*(vertices[1].z-vertices[0].z);
    assert.ok(area<-1e-9,`${label}: inverted/folded triangle ${i/3} (signed XZ area ${area})`);minimumArea=Math.min(minimumArea,-area);
    const box=new THREE.Box3().setFromPoints(vertices.map(v=>new THREE.Vector3(v.x,v.y,v.z)));
    const t={vertices,box,row:Math.floor(Math.min(...ids)/(columns+1)),ids};triangles.push(t);
    for(let x=Math.floor(box.min.x/2);x<=Math.floor(box.max.x/2);x++)for(let z=Math.floor(box.min.z/2);z<=Math.floor(box.max.z/2);z++){
      const key=`${x}/${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(triangles.length-1);
    }
  }
  let compared=0;
  for(const bucket of bins.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++){
    const aIndex=Math.min(bucket[i],bucket[j]),bIndex=Math.max(bucket[i],bucket[j]),key=aIndex*triangles.length+bIndex;
    if(pairs.has(key))continue;pairs.add(key);
    const a=triangles[aIndex],b=triangles[bIndex];
    if(Math.abs(a.row-b.row)<=1||!a.box.intersectsBox(b.box))continue;
    compared++;assert.ok(!trianglesIntersect(a.vertices,b.vertices),`${label}: nonadjacent triangles ${aIndex}/${bIndex} self-intersect`);
  }
  return{triangles:triangles.length,intersectionPairs:compared,minimumArea};
}

// These fixtures prove the validator rejects the old failure modes, rather
// than merely trusting a metadata flag supplied by the production generator.
export function verifyMeshCheckerFixtures(){
  const flat=z=>[{x:0,y:0,z},{x:2,y:0,z},{x:1,y:0,z:z+2}];
  assert(trianglesIntersect(flat(0),[{x:.5,y:0,z:.5},{x:2,y:0,z:.5},{x:1,y:0,z:2.5}]),'coplanar intersection fixture missed');
  assert(trianglesIntersect(flat(0),[{x:1,y:-1,z:.5},{x:1,y:1,z:.5},{x:1,y:0,z:2.5}]),'3D intersection fixture missed');
  assert(trianglesIntersect(flat(0),flat(0)),'identical coplanar duplicate fixture missed');
  assert(!trianglesIntersect(flat(0),flat(4)),'separate triangle fixture falsely intersects');
  const legacy=new THREE.BufferGeometry();legacy.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,0,0,0,0,2,2,0,2],3));legacy.setIndex([0,1,2,1,3,2]);
  assert.throws(()=>verifyRibbonMesh(legacy,'inverted legacy fixture',{rows:2,columns:1}),/inverted\/folded/);
  legacy.dispose();
}


// Separate independently valid shells can still intersect one another. This
// tests the rendered pair itself, without trusting radius or placement flags.
export function verifyMeshPairSeparation(first,second,label){
  function triangles(geometry){
    const p=geometry.attributes.position,index=geometry.index,result=[];
    for(let i=0;i<index.count;i+=3){
      const vertices=[0,1,2].map(j=>{const k=index.getX(i+j);return{x:p.getX(k),y:p.getY(k),z:p.getZ(k)};});
      result.push({vertices,box:new THREE.Box3().setFromPoints(vertices.map(v=>new THREE.Vector3(v.x,v.y,v.z)))});
    }
    return result;
  }
  const a=triangles(first),b=triangles(second),bins=new Map();
  for(let i=0;i<a.length;i++){
    const box=a[i].box;
    for(let x=Math.floor(box.min.x/3);x<=Math.floor(box.max.x/3);x++)for(let z=Math.floor(box.min.z/3);z<=Math.floor(box.max.z/3);z++){
      const key=`${x}/${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);
    }
  }
  let compared=0;
  for(let j=0;j<b.length;j++){
    const t=b[j],box=t.box,seen=new Set();
    for(let x=Math.floor(box.min.x/3);x<=Math.floor(box.max.x/3);x++)for(let z=Math.floor(box.min.z/3);z<=Math.floor(box.max.z/3);z++)for(const i of bins.get(`${x}/${z}`)||[]){
      if(seen.has(i))continue;seen.add(i);
      if(!a[i].box.intersectsBox(box))continue;compared++;
      assert.ok(!trianglesIntersect(a[i].vertices,t.vertices),`${label}: separate shells intersect at triangles ${i}/${j} near (${t.vertices.map(v=>v.x).reduce((a,b)=>a+b)/3}, ${t.vertices.map(v=>v.y).reduce((a,b)=>a+b)/3}, ${t.vertices.map(v=>v.z).reduce((a,b)=>a+b)/3})`);
    }
  }
  return compared;
}
