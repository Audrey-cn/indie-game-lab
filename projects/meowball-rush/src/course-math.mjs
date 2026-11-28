// Shared authored geometry: scene meshes, rail motion and collision use the same samples.
export function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return length;
}

const pathMetrics = new WeakMap();
function metrics(points) {
  let cached = pathMetrics.get(points);
  if (!cached) {
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    cached = { distances, length: distances.at(-1) || 0 };
    pathMetrics.set(points, cached);
  }
  return cached;
}

export function samplePath(points, distance) {
  if (!points?.length) throw new Error('A path needs at least one point');
  if (points.length === 1) return { ...points[0], tx: 0, ty: 0, tz: -1 };
  const { distances, length } = metrics(points);
  const d = Math.max(0, Math.min(length, distance));
  let lo = 1, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const a = points[lo - 1], b = points[lo];
  const span = distances[lo] - distances[lo - 1];
  const t = span > 1e-9 ? (d - distances[lo - 1]) / span : 0;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const norm = Math.hypot(dx, dy, dz) || 1;
  return { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t,
    tx: dx / norm, ty: dy / norm, tz: dz / norm };
}

export function getChuteFrame(chute, t) {
  return samplePath(chute.points, Math.max(0, Math.min(1, t)) * metrics(chute.points).length);
}

// All consumers use these cross-sections. A miter is the intersection of the
// incoming and outgoing offset lines, not the unscaled average normal that
// pinches an inner corner and leaves a gap on the outer corner.
const preparedRoutes = new WeakMap();
const floorMeshes = new WeakMap();
const preparedChutes = new WeakMap();
const routeNeighbours = new WeakMap();
const boundarySegments = new WeakMap();
export const GUARDED_CLEAR_WIDTH = 2 * .62 + 1.6;
const MITER_LIMIT = 1.8;
export const RIBBON_COLUMNS = 8;
const flatDirection = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  return { tx: dx / len, tz: dz / len, nx: -dz / len, nz: dx / len, length: len };
};
function jointFrame(incoming, outgoing) {
  let nx = incoming.nx + outgoing.nx, nz = incoming.nz + outgoing.nz;
  const len = Math.hypot(nx, nz);
  if (len < 1e-5) return { ...outgoing, miter: 1 };
  nx /= len; nz /= len;
  const denominator = nx * outgoing.nx + nz * outgoing.nz;
  return { nx, nz, tx: nz, tz: -nx,
    miter: Math.min(MITER_LIMIT, 1 / Math.max(1 / MITER_LIMIT, denominator)) };
}
export function getRouteFrame(route, i) {
  const points = route.points;
  const incoming = flatDirection(points[Math.max(0, i - 1)], points[i || 1]);
  const outgoing = flatDirection(points[Math.min(i, points.length - 2)], points[Math.min(points.length - 1, i + 1)]);
  return i === 0 ? { ...outgoing, miter: 1 } : i === points.length - 1
    ? { ...incoming, miter: 1 } : jointFrame(incoming, outgoing);
}
function endpointKey(p) { return `${p.x.toFixed(6)}/${p.y.toFixed(6)}/${p.z.toFixed(6)}`; }

// Called once after authoring/scaling. Endpoint cross-sections are shared by
// position, orientation, bank and width; a bounded taper absorbs width changes.
export function prepareRouteGeometry(routes, chutes = []) {
  const definitions = [...(routes || []), ...chutes];
  const chuteSet = new Set(chutes);
  const endpoints = new Map();
  for (const route of definitions) {
    preparedRoutes.delete(route); preparedChutes.delete(route); floorMeshes.delete(route);
    boundarySegments.delete(route);
    routeNeighbours.set(route, (routes || []).filter(other => other !== route &&
      [route.points[0],route.points.at(-1)].some(a => [other.points[0],other.points.at(-1)].some(b => endpointKey(a) === endpointKey(b)))));
    for (const end of [0, 1]) {
      const key = endpointKey(end ? route.points.at(-1) : route.points[0]);
      if (!endpoints.has(key)) endpoints.set(key, []);
      endpoints.get(key).push({ route, end });
    }
  }
  const constraints = new Map();
  for (const entries of endpoints.values()) {
    // Branches have independent mouths; only a single incoming/outgoing pair is
    // a butt seam. Secret branches must not steal the primary route's width.
    const primary = entries.filter(e => !e.route.secret);
    const pair = primary.length === 2 ? primary : entries.length === 2 ? entries : [];
    const before = pair.find(e => e.end === 1), after = pair.find(e => e.end === 0);
    if (!before || !after || before.route === after.route) continue;
    const a = before.route, b = after.route;
    const frame = jointFrame(flatDirection(a.points.at(-2), a.points.at(-1)), flatDirection(b.points[0], b.points[1]));
    const seam = { frame, guardTransition: !!a.walls !== !!b.walls, halfWidth: Math.min(a.width, b.width) / 2, leftWidth: Math.min(a.width, b.width) / 2, rightWidth: Math.min(a.width, b.width) / 2, bank: Math.min(a.bank || 0, b.bank || 0) };
    if (!constraints.has(a)) constraints.set(a, {});
    if (!constraints.has(b)) constraints.set(b, {});
    constraints.get(a).end = seam; constraints.get(b).start = seam;
  }
  // A tight inner corner is clipped before its offset folds back through the
  // floor. Shared seam limits converge monotonically across neighbouring runs.
  for (let pass = 0; pass < 3; pass++) {
    for (const route of definitions) {
      const target = chuteSet.has(route) ? preparedChutes : preparedRoutes;
      target.set(route, buildRibbonRows(route, constraints.get(route), chuteSet.has(route)));
    }
  }
  for (const route of definitions) {
    const target = chuteSet.has(route) ? preparedChutes : preparedRoutes;
    target.set(route, buildRibbonRows(route, constraints.get(route), chuteSet.has(route)));
  }
}
function buildRibbonRows(route, constraints = {}, chute = false) {
  const points = route.points, columns = chute ? 16 : RIBBON_COLUMNS;
  const distances = metrics(points).distances, length = distances.at(-1);
  const frames = points.map((_, i) => getRouteFrame(route, i));
  if (constraints.start) frames[0] = constraints.start.frame;
  if (constraints.end) frames[frames.length - 1] = constraints.end.frame;
  const halfWidths = [], banks = [], rows = [];
  for (let i = 0; i < points.length; i++) {
    let halfWidth = route.width / 2, bank = route.bank || 0;
    for (const [name, distance] of [['start', distances[i]], ['end', length - distances[i]]]) {
      const seam = constraints[name];
      if (!seam) continue;
      const transition = Math.max(2, Math.abs(route.width / 2 - seam.halfWidth) * 2.5, Math.abs(bank - seam.bank) * 5);
      const t = Math.min(1, distance / transition), blend = t * t * (3 - 2 * t);
      halfWidth = Math.min(halfWidth, seam.halfWidth + (route.width / 2 - seam.halfWidth) * blend);
      bank = Math.min(bank, seam.bank + ((route.bank || 0) - seam.bank) * blend);
    }
    halfWidths.push(halfWidth); banks.push(bank);
  }
  const leftWidths = halfWidths.slice(), rightWidths = halfWidths.slice();
  const leftLimits = points.map(() => Infinity), rightLimits = points.map(() => Infinity);
  for (const [name, i] of [['start', 0], ['end', points.length - 1]]) if (constraints[name]) {
    leftWidths[i] = Math.min(leftWidths[i], constraints[name].leftWidth);
    rightWidths[i] = Math.min(rightWidths[i], constraints[name].rightWidth);
  }
  const makeRow = (i) => {
    const p = points[i], f = frames[i], row = [];
    for (let j = 0; j <= columns; j++) {
      const u = j / columns * 2 - 1, width = u < 0 ? leftWidths[i] : rightWidths[i];
      const cross = chute ? Math.sin(u * Math.PI / 2) * width : u * width;
      const mouth = chute ? Math.min(1, distances[i] / 2.5, (length - distances[i]) / 3) : 1;
      const height = chute ? width * (1 - Math.cos(u * Math.PI / 2)) * mouth : banks[i] * u ** 2;
      row.push({ x: Math.fround(p.x + f.nx * cross * f.miter), y: Math.fround(p.y + height), z: Math.fround(p.z + f.nz * cross * f.miter) });
    }
    return row;
  };
  // For a strip between rows A/B, each triangle's signed area is linear
  // in the opposite row's offset. Solve that bound directly. Only the inside
  // of a bend is clipped; the full outside width remains usable.
  const cross2 = (a, b) => a.x * b.z - a.z * b.x;
  for (let i = 0; i < points.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    const ua = { x: a.nx * a.miter, z: a.nz * a.miter };
    const ub = { x: b.nx * b.miter, z: b.nz * b.miter };
    const delta = { x: points[i + 1].x - points[i].x, z: points[i + 1].z - points[i].z };
    const turn = cross2(ua, ub);
    for (const [side, widths, limits] of [[-1, leftWidths, leftLimits], [1, rightWidths, rightLimits]]) {
      const coefficient = side * turn;
      if (coefficient <= 1e-9) continue;
      limits[i + 1] = Math.min(limits[i + 1], Math.max(.001, -cross2(ua, delta) / coefficient));
      limits[i] = Math.min(limits[i], Math.max(.001, cross2(delta, ub) / coefficient));
      widths[i + 1] = Math.min(widths[i + 1], limits[i + 1] * .94);
      widths[i] = Math.min(widths[i], limits[i] * .94);
    }
  }
  for (const widths of [leftWidths, rightWidths]) {
    for (let i = 1; i < widths.length; i++) widths[i] = Math.min(widths[i], widths[i - 1] + (distances[i] - distances[i - 1]) * .65);
    for (let i = widths.length - 2; i >= 0; i--) widths[i] = Math.min(widths[i], widths[i + 1] + (distances[i + 1] - distances[i]) * .65);
  }
  for (const [name, i] of [['start', 0], ['end', points.length - 1]]) if (constraints[name]) {
    constraints[name].leftWidth = Math.min(constraints[name].leftWidth, leftWidths[i]);
    constraints[name].rightWidth = Math.min(constraints[name].rightWidth, rightWidths[i]);
  }
  rows.splice(0, rows.length, ...points.map((_, i) => makeRow(i)));
  return { rows, frames, points, distances, halfWidths, leftWidths, rightWidths, leftLimits, rightLimits, banks, columns, seams: constraints };
}
export function getRouteRibbonRows(route) {
  let data = preparedRoutes.get(route);
  if (!data) { data = buildRibbonRows(route); preparedRoutes.set(route, data); }
  return data;
}
export function getChuteShellRows(chute) {
  let data = preparedChutes.get(chute);
  if (!data) { data = buildRibbonRows(chute, {}, true); preparedChutes.set(chute, data); }
  return data;
}
// Decorative second strand shares one definition between the renderer and
// scenery clearance. A pure reflection plus height offset crosses the eased
// primary helix near its runway; expanding the radius separates the full bowls.
export function getCompanionChute(chute) {
  const width=chute.width*.82,center=chute.center;
  const radius=chute.radius||Math.max(.1,Math.min(...chute.points.map(p=>Math.hypot(p.x-center.x,p.z-center.z))));
  const radialScale=1+(chute.width/2+width/2+1.2)/radius;
  return {...chute,id:`${chute.id}-companion`,doubleHelix:false,width,radius:radius*radialScale,
    points:chute.points.map(p=>({x:center.x+(center.x-p.x)*radialScale,y:(p.y??center.y??0)+.65,z:center.z+(center.z-p.z)*radialScale}))};
}
export function getRibbonBoundarySegments(route) {
  let cached=boundarySegments.get(route);if(cached)return cached;
  const { rows, columns, leftWidths, rightWidths } = getRouteRibbonRows(route), segments = [];
  // A guarded deck opens into a deliberate unguarded precision bridge before
  // the shared floor taper becomes narrow. The full guarded span stays intact.
  // Both collision and the renderer consume these exact finite exposed strips.
  const clipLower=(range,a,b,min)=>{
    if(a<min && b<min)return null;
    if(a<min)range[0]=Math.max(range[0],(min-a)/(b-a));
    if(b<min)range[1]=Math.min(range[1],(min-a)/(b-a));
    return range[0]<range[1]-1e-8?range:null;
  };
  const subtract=(ranges,cut)=>ranges.flatMap(([lo,hi])=>cut[1]<=lo+1e-8||cut[0]>=hi-1e-8?[[lo,hi]]:
    [[lo,Math.min(hi,cut[0])],[Math.max(lo,cut[1]),hi]].filter(([a,b])=>b-a>1e-7));
  for (let i = 0; i < rows.length - 1; i++) for (const side of [-1, 1]) {
    const column = side < 0 ? 0 : columns, a = rows[i][column], b = rows[i + 1][column];
    const f = flatDirection(a, b);
    let range=[0,1];
    if(route.walls) {
      range=clipLower(range,leftWidths[i]+rightWidths[i],leftWidths[i+1]+rightWidths[i+1],GUARDED_CLEAR_WIDTH);
      if(range)range=clipLower(range,leftWidths[i],leftWidths[i+1],1.22);
      if(range)range=clipLower(range,rightWidths[i],rightWidths[i+1],1.22);
      if(!range)continue;
    }
    const nx=f.nx*side,nz=f.nz*side;
    let ranges=[range];
    for(const other of routeNeighbours.get(route)||[])for(const q of getRouteFloorTriangles(other)) {
      // Clip the rail wherever its outer face lies in a connected floor. This
      // removes interior rails at acute mouths instead of creating a V trap.
      const at=(p)=>{const x=p.x+nx*.025-q.a.x,z=p.z+nz*.025-q.a.z;
        const u=(x*(q.c.z-q.a.z)-(q.c.x-q.a.x)*z)/q.den;
        const v=((q.b.x-q.a.x)*z-x*(q.b.z-q.a.z))/q.den;
        return[u,v,1-u-v,p.y-(q.a.y+q.slopeX*x+q.slopeZ*z)];};
      const va=at(a),vb=at(b);let cut=[0,1];
      for(let j=0;j<3&&cut;j++)cut=clipLower(cut,va[j],vb[j],1e-7);
      if(cut)cut=clipLower(cut,va[3],vb[3],-.15);
      if(cut)cut=clipLower(cut,-va[3],-vb[3],-.15);
      if(cut)ranges=subtract(ranges,cut);
      if(!ranges.length)break;
    }
    // Outward normals follow each real mitered/tapered edge, including seams.
    const mix=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
    for(const [start,end]of ranges)segments.push({a:mix(start),b:mix(end),side,index:i,start,end,nx,nz});
  }
  boundarySegments.set(route,segments);
  return segments;
}
// Match the visible ribbon triangles exactly, including bank and shared seams.
export function getRouteFloorTriangles(route) {
  let cached = floorMeshes.get(route);
  if (cached) return cached;
  const { rows, columns } = getRouteRibbonRows(route), triangles = [];
  function add(a, b, c, index) {
    const den = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(den) < 1e-10) return;
    triangles.push({ a, b, c, den, index,
      minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
      minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z),
      slopeX: ((b.y - a.y) * (c.z - a.z) - (c.y - a.y) * (b.z - a.z)) / den,
      slopeZ: ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / den });
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < columns; j++) {
    add(rows[i][j], rows[i][j + 1], rows[i + 1][j], i);
    add(rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j], i);
  }
  floorMeshes.set(route, triangles);
  return triangles;
}
export function nearestRouteSurface(routes, x, z, y = Infinity, contact = null) {
  let best = null;
  const priority = c => contact ? c.following ? 2 : c.crossed ? 1 : 0 : 0;
  function isBetter(candidate) {
    if (!best) return true;
    const rank = priority(candidate) - priority(best);
    if (rank) return rank > 0;
    if (contact) {
      if (candidate.crossed && best.crossed && !candidate.following) {
        if (Math.abs(candidate.y - best.y) > 1e-6) return candidate.y > best.y;
      } else {
        const difference = Math.abs(candidate.y - contact.bottom) - Math.abs(best.y - contact.bottom);
        if (Math.abs(difference) > 1e-6) return difference < 0;
      }
    }
    return candidate.distance < best.distance - 1e-6
      || (Math.abs(candidate.distance - best.distance) < 1e-6 && candidate.y > best.y);
  }
  for (const route of routes || []) for (const triangle of getRouteFloorTriangles(route)) {
    const q = triangle;
    if (x < q.minX - 1e-6 || x > q.maxX + 1e-6 || z < q.minZ - 1e-6 || z > q.maxZ + 1e-6) continue;
    const dx = x - q.a.x, dz = z - q.a.z;
    const u = (dx * (q.c.z - q.a.z) - (q.c.x - q.a.x) * dz) / q.den;
    const v = ((q.b.x - q.a.x) * dz - dx * (q.b.z - q.a.z)) / q.den;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    const floor = q.a.y + q.slopeX * dx + q.slopeZ * dz;
    const bottom = contact?.bottom ?? y - 0.55;
    const crossed = !!contact && contact.previousBottom >= floor - 0.02 && bottom <= floor;
    const following = !!contact?.grounded && contact.supportRoute === route && Math.abs(floor - bottom) < 0.8;
    const near = floor - bottom <= 0.55 && bottom - floor <= 0.18;
    if (contact ? !near && !crossed && !following : floor > y + 1e-6) continue;
    const a = route.points[q.index], b = route.points[q.index + 1];
    const sx = b.x - a.x, sz = b.z - a.z, flat = Math.hypot(sx, sz) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / (flat * flat)));
    const tx = sx / flat, tz = sz / flat;
    const px = a.x + sx * t, pz = a.z + sz * t;
    const candidate = { y: floor, slopeX: q.slopeX, slopeZ: q.slopeZ, kind: route.kind,
      route, distance: Math.hypot(x - px, z - pz), tx, tz,
      lateral: (x - px) * -tz + (z - pz) * tx,
      normalX: -tz, normalZ: tx, halfWidth: getRouteRibbonRows(route).halfWidths[q.index] * (1 - t) + getRouteRibbonRows(route).halfWidths[q.index + 1] * t, along: t, segmentIndex: q.index,
      crossed, following };
    if (isBetter(candidate)) best = candidate;
  }
  return best;
}

export function computeLaunchVelocity(start, target, flightTime, gravity = 26) {
  if (!(flightTime > 0)) throw new Error('Launch flightTime must be positive');
  return { vx: (target.x - start.x) / flightTime,
    vy: (target.y - start.y) / flightTime + gravity * flightTime / 2,
    vz: (target.z - start.z) / flightTime };
}
