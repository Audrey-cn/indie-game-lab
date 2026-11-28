// Three.js adapter. The mathematical sweep is shared with floor/rail collision.
import * as THREE from 'three';
import { getRouteRibbonRows, getChuteShellRows, getRibbonBoundarySegments } from './course-math.mjs';

export function geometryFromRows(data) {
  const { rows, columns, distances } = data, positions = [], uv = [], indices = [];
  for (let i = 0; i < rows.length; i++) for (let j = 0; j <= columns; j++) {
    const p = rows[i][j]; positions.push(p.x, p.y, p.z); uv.push(j / columns, distances[i] / 3);
    if (i < rows.length - 1 && j < columns) {
      const a = i * (columns + 1) + j, b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.userData.ribbonRows = rows.length; geometry.userData.ribbonColumns = columns;
  return geometry;
}
export const routeRibbonGeometry = route => geometryFromRows(getRouteRibbonRows(route));
export const chuteShellGeometry = chute => geometryFromRows(getChuteShellRows(chute));

// A single indexed sweep closes each deck with beveled curbs, vertical fascia,
// and a bottom. Its floor boundary is the exact mathematical ribbon edge.
export function routeBodyGeometry(route) {
  const { rows, frames, columns, distances, leftWidths, rightWidths, leftLimits, rightLimits, seams } = getRouteRibbonRows(route);
  const profiles = {
    meadow_hedge:[[0,0],[0,.25],[.1,.43],[.29,.46],[.4,.29],[.4,-.27],[0,-.42]],
    rug_piping:[[0,0],[0,.18],[.07,.26],[.19,.29],[.3,.2],[.3,-.26],[0,-.42]],
    canal_stone:[[0,0],[0,.18],[.08,.28],[.34,.28],[.42,.18],[.42,-.3],[0,-.48]],
    oak_rail:[[0,0],[0,.35],[.09,.47],[.23,.47],[.32,.35],[.32,-.29],[0,-.5]],
    icing_rail:[[0,0],[0,.22],[.08,.32],[.18,.37],[.3,.3],[.37,.2],[.37,-.28],[0,-.42]],
    roof_copper:[[0,0],[0,.3],[.06,.43],[.17,.46],[.28,.38],[.33,.2],[.33,-.32],[0,-.48]],
    cloud_rope:[[0,0],[0,.24],[.05,.36],[.14,.42],[.24,.36],[.29,.24],[.23,-.28],[0,-.42]],
    frost_rail:[[0,0],[0,.26],[.1,.5],[.2,.44],[.33,.25],[.33,-.27],[0,-.42]],
    gilt_books:[[0,0],[0,.25],[.08,.25],[.08,.38],[.26,.38],[.26,.25],[.37,.25],[.37,-.3],[0,-.46]],
    royal_gold:[[0,0],[0,.27],[.08,.36],[.1,.49],[.22,.49],[.24,.36],[.34,.27],[.34,-.3],[0,-.48]],
  };
  const guardProfile=profiles[route.edgeStyle]||profiles.canal_stone;
  const profile=[[0,0],[.075,-.085],[.075,-.29],[0,-.42]];
  const thickness = -profile.at(-1)[1], maxOffset = Math.max(...profile.map(p=>p[0]));
  const rings = rows.map((row, i) => {
    const f = frames[i], ring = [];
    for (const side of [1, -1]) {
      const edge = row[side > 0 ? columns : 0];
      const width = side > 0 ? rightWidths[i] : leftWidths[i], limit = side > 0 ? rightLimits[i] : leftLimits[i];
      const bevelScale = Math.min(1, Math.max(.00001, (limit - width) * .5) / maxOffset);
      for (const [offset, y] of profile) ring.push({ x: edge.x + f.nx * offset * bevelScale * side * f.miter,
        y: edge.y + y, z: edge.z + f.nz * offset * bevelScale * side * f.miter });
      // Bottom follows the same banked floor profile, keeping uniform thickness.
      if (side > 0) for (let j = columns - 1; j >= 0; j--) ring.push({ ...row[j], y: row[j].y - thickness });
    }
    return ring;
  });
  // Ring runs from right top to right bottom, across bottom to left bottom,
  // then left bottom to left top. Reverse the second side to avoid a diagonal.
  const pCount = profile.length, ringLength = pCount * 2 + columns;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i], start = pCount + columns;
    ring.splice(start, pCount, ...ring.slice(start).reverse());
    // Bottom already contains its left endpoint; don't emit a zero-area segment.
    ring.splice(start, 1);
  }
  const stride = ringLength - 1, positions = [], uv = [], indices = [];
  for (let i = 0; i < rings.length; i++) for (let j = 0; j < stride; j++) {
    const p = rings[i][j]; positions.push(p.x, p.y, p.z); uv.push(j / stride, distances[i] / 3);
    if (i < rings.length - 1 && j < stride - 1) {
      const a = i * stride + j, b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Close isolated route ends. Connected mouths omit their cap so neighbouring
  // decks do not place two coplanar faces at the same butt seam.
  const endCaps=[];
  for (const i of [0, rows.length - 1]) {
    const seam=i===0?seams.start:seams.end;
    // At a guard/open transition, only the guarded deck closes its U-shaped
    // cross-section. The open neighbour emits no duplicate coplanar face.
    if (seam && !(route.walls && seam.guardTransition)) continue;
    const f = frames[i], origin = rows[i][0];
    // The body ring ends at the left top. Continue across the floor left to
    // right; reversing these samples makes a self-crossing cap above a bank.
    const ring = [...rings[i], ...rows[i].slice(1, columns).map(p => ({ ...p }))];
    const contour = ring.map(p => new THREE.Vector2((p.x - origin.x) * f.nx + (p.z - origin.z) * f.nz, p.y - origin.y));
    const cap = THREE.ShapeUtils.triangulateShape(contour, []), start = positions.length / 3;
    for (const p of ring) { positions.push(p.x, p.y, p.z); uv.push(0, 0); }
    const firstIndex=indices.length;
    for (const triangle of cap) indices.push(...triangle.map(v => start + v));
    endCaps.push({row:i,firstIndex,indexCount:indices.length-firstIndex});
  }
  // Raised curbs use exactly the finite exposed intervals used by collision.
  // The underfloor shell stays continuous even where a branch opens a guard.
  const guardSegments=route.walls?getRibbonBoundarySegments(route):[],guardCaps=[];
  const raised=guardProfile.filter(p=>p[1]>=0);
  if(raised.at(-1)[0]!==0)raised.push([raised.at(-1)[0],0]);
  const guardRing=(segment,fraction,point)=>{
    const i=segment.index,t=fraction,a=frames[i],b=frames[i+1],side=segment.side;
    const nx=(a.nx*a.miter*(1-t)+b.nx*b.miter*t)*side,nz=(a.nz*a.miter*(1-t)+b.nz*b.miter*t)*side;
    const widths=side>0?rightWidths:leftWidths,limits=side>0?rightLimits:leftLimits;
    const max=Math.max(...guardProfile.map(p=>p[0]));
    const available=k=>Number.isFinite(limits[k])?Math.max(.00001,(limits[k]-widths[k])*.5):max;
    const scale=Math.min(1,(available(i)*(1-t)+available(i+1)*t)/max);
    return raised.map(([offset,y])=>({x:point.x+nx*offset*scale,y:point.y+y,z:point.z+nz*offset*scale}));
  };
  const coincident=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-5;
  for(const segment of guardSegments){
    const a=guardRing(segment,segment.start,segment.a),b=guardRing(segment,segment.end,segment.b),base=positions.length/3,n=a.length;
    for(const ring of[a,b])for(const p of ring){positions.push(p.x,p.y,p.z);uv.push(0,0);}
    for(let j=0;j<n;j++){const k=(j+1)%n;indices.push(base+j,base+n+j,base+k,base+k,base+n+j,base+n+k);}
    for(const[ring,point,end]of[[a,segment.a,0],[b,segment.b,1]]){
      if(guardSegments.some(other=>other!==segment&&other.side===segment.side&&coincident(end?other.a:other.b,point)))continue;
      const contour=raised.map(([x,y])=>new THREE.Vector2(x,y)),triangles=THREE.ShapeUtils.triangulateShape(contour,[]),start=positions.length/3,firstIndex=indices.length;
      for(const p of ring){positions.push(p.x,p.y,p.z);uv.push(0,0);}
      for(const triangle of triangles)indices.push(...triangle.map(v=>start+v));
      guardCaps.push({firstIndex,indexCount:indices.length-firstIndex,side:segment.side,point:{...point},row:end&&segment.index===rows.length-2&&segment.end===1?rows.length-1:!end&&segment.index===0&&segment.start===0?0:null});
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.userData.bodyEndCaps=endCaps;geometry.userData.endCaps=guardCaps;geometry.userData.guardSegments=guardSegments;
  geometry.userData.edgeProfile = route.walls ? route.edgeStyle || 'canal_stone' : 'open_bevel';
  geometry.userData.profileSignature = (route.walls?guardProfile:profile).flat().join('/');
  geometry.userData.sweepStride = stride; geometry.userData.sweepRows = rows.length;
  return geometry;
}

// Clip each actual floor triangle so decals match slopes and banking.

export function surfaceOverlayGeometry(route, patch = {}) {
  const data = getRouteRibbonRows(route), { rows, columns, frames } = data;
  const offset = patch.offset ?? .05, margin = patch.margin ?? .35;
  const angle = patch.angle ?? 0, cosine = Math.cos(angle), sine = Math.sin(angle);
  const center = { x: patch.x ?? 0, z: patch.z ?? 0 };
  const local = p => ({ x: (p.x-center.x)*cosine+(p.z-center.z)*sine,
    z: -(p.x-center.x)*sine+(p.z-center.z)*cosine });
  const planes = [p=>p.left-margin,p=>p.right-margin];
  if (patch.shape === 'circle') {
    for(let k=0;k<48;k++) { const a=k*Math.PI*2/48;
      planes.push(p=>patch.radius-Math.cos(a)*local(p).x-Math.sin(a)*local(p).z); }
  } else if(patch.w && patch.d) {
    planes.push(p=>patch.w/2-local(p).x,p=>patch.w/2+local(p).x,
      p=>patch.d/2-local(p).z,p=>patch.d/2+local(p).z);
  }
  const positions=[],uv=[],indices=[],boundaries=getRibbonBoundarySegments(route);
  const vertex=(i,j,span)=>{const p=rows[i][j],f=frames[i],a=rows[i][0],b=rows[i][columns];
    const edgeDistance=side=>{let minimum=Infinity;
      for(let k=Math.max(0,span-1);k<=Math.min(rows.length-2,span+1);k++){
        const column=side<0?0:columns,start=rows[k][column],end=rows[k+1][column],dx=end.x-start.x,dz=end.z-start.z,length=Math.hypot(dx,dz)||1;
        const center=rows[k][columns/2],sign=Math.sign(dx*(center.z-start.z)-dz*(center.x-start.x))||1;
        minimum=Math.min(minimum,(dx*(p.z-start.z)-dz*(p.x-start.x))*sign/length);
      }return minimum;};
    return {...p,left:Math.min((p.x-a.x)*f.nx+(p.z-a.z)*f.nz,edgeDistance(-1)),right:Math.min((b.x-p.x)*f.nx+(b.z-p.z)*f.nz,edgeDistance(1))};};
  const clip=(polygon,plane)=>{const out=[];for(let k=0;k<polygon.length;k++){
    const a=polygon[k],b=polygon[(k+1)%polygon.length],da=plane(a),db=plane(b);
    if(da>=-1e-8)out.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db),p={};for(const key of ['x','y','z','left','right'])p[key]=a[key]+(b[key]-a[key])*t;out.push(p);}
  }return out;};
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<columns;j++)for(const triangle of [
    [vertex(i,j,i),vertex(i,j+1,i),vertex(i+1,j,i)],
    [vertex(i,j+1,i),vertex(i+1,j+1,i),vertex(i+1,j,i)],
  ]){
    const xMin=Math.min(...triangle.map(p=>p.x))-margin,xMax=Math.max(...triangle.map(p=>p.x))+margin;
    const zMin=Math.min(...triangle.map(p=>p.z))-margin,zMax=Math.max(...triangle.map(p=>p.z))+margin;
    const yMin=Math.min(...triangle.map(p=>p.y)),yMax=Math.max(...triangle.map(p=>p.y));
    const centerX=triangle.reduce((n,p)=>n+p.x,0)/3,centerZ=triangle.reduce((n,p)=>n+p.z,0)/3;
    const edgePlanes=[];
    for(const edge of boundaries){
      if(Math.max(edge.a.x,edge.b.x)<xMin||Math.min(edge.a.x,edge.b.x)>xMax||Math.max(edge.a.z,edge.b.z)<zMin||Math.min(edge.a.z,edge.b.z)>zMax||Math.max(edge.a.y,edge.b.y)<yMin-.5||Math.min(edge.a.y,edge.b.y)>yMax+.5)continue;
      const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,length=Math.hypot(dx,dz)||1;
      const sign=Math.sign(dx*(centerZ-edge.a.z)-dz*(centerX-edge.a.x))||1;
      edgePlanes.push(p=>(dx*(p.z-edge.a.z)-dz*(p.x-edge.a.x))*sign/length-margin);
    }
    let polygon=triangle;for(const plane of [...planes,...edgePlanes]){polygon=clip(polygon,plane);if(polygon.length<3)break;}
    if(polygon.length<3)continue;
    const start=positions.length/3;
    for(const p of polygon){positions.push(p.x,p.y+offset,p.z);const q=local(p);
      uv.push(.5+q.x/(patch.w||patch.radius*2||4),.5+q.z/(patch.d||patch.radius*2||4));}
    for(let k=1;k<polygon.length-1;k++)indices.push(start,start+k,start+k+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.userData.floorOffset=offset;geometry.userData.edgeInset=margin;
  geometry.userData.sourceRouteId=route.id;geometry.userData.surfaceOverlay=true;
  return geometry;
}

export function boostRibbonGeometry(route, boost) {
  const data=getRouteRibbonRows(route);let nearest=0;
  for(let i=1;i<data.points.length;i++)if(Math.hypot(data.points[i].x-boost.x,data.points[i].z-boost.z)<Math.hypot(data.points[nearest].x-boost.x,data.points[nearest].z-boost.z))nearest=i;
  const f=data.frames[nearest];
  return surfaceOverlayGeometry(route,{...boost,angle:Math.atan2(f.nz,f.nx),offset:.05});
}
