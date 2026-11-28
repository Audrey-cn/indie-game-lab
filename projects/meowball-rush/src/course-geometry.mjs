// Three.js adapter. The mathematical sweep is shared with floor/rail collision.
import * as THREE from 'three';
import { getRouteRibbonRows, getChuteShellRows } from './course-math.mjs';

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
  const profile = route.walls ? profiles[route.edgeStyle] || profiles.canal_stone
    : [[0, 0], [.075, -.085], [.075, -.29], [0, -.42]];
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
    const ring = [...rings[i], ...rows[i].slice(1, columns).map(p => ({ ...p })).reverse()];
    const contour = ring.map(p => new THREE.Vector2((p.x - origin.x) * f.nx + (p.z - origin.z) * f.nz, p.y - origin.y));
    const cap = THREE.ShapeUtils.triangulateShape(contour, []), start = positions.length / 3;
    for (const p of ring) { positions.push(p.x, p.y, p.z); uv.push(0, 0); }
    const firstIndex=indices.length;
    for (const triangle of cap) indices.push(...triangle.map(v => start + v));
    endCaps.push({row:i,firstIndex,indexCount:indices.length-firstIndex});
  }
  // Open mouths share only an edge with their neighbouring ribbon; no duplicate
  // coplanar cap faces are inserted at a route seam.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.userData.endCaps=endCaps;
  geometry.userData.edgeProfile = route.walls ? route.edgeStyle || 'canal_stone' : 'open_bevel';
  geometry.userData.profileSignature = profile.flat().join('/');
  geometry.userData.sweepStride = stride; geometry.userData.sweepRows = rows.length;
  return geometry;
}

export function boostRibbonGeometry(route, boost) {
  const data = getRouteRibbonRows(route), columns = data.columns;
  let nearest = 0;
  for (let i = 1; i < data.points.length; i++) if (Math.hypot(data.points[i].x - boost.x, data.points[i].z - boost.z)
    < Math.hypot(data.points[nearest].x - boost.x, data.points[nearest].z - boost.z)) nearest = i;
  const center = data.distances[nearest], start = Math.max(0, center - boost.d / 2), end = Math.min(data.distances.at(-1), center + boost.d / 2);
  const distances = [start, ...data.distances.filter(d => d > start + 1e-5 && d < end - 1e-5), end];
  const rows = distances.map(distance => {
    let i = 1; while (i < data.distances.length - 1 && data.distances[i] < distance) i++;
    const blend = (distance - data.distances[i - 1]) / (data.distances[i] - data.distances[i - 1]);
    const widthRatio = Math.min(.88, boost.w / route.width);
    return Array.from({ length: columns + 1 }, (_, j) => {
      const column = (columns / 2 + (j - columns / 2) * widthRatio), lo = Math.floor(column), hi = Math.min(columns, lo + 1), t = column - lo;
      const p = {};
      for (const axis of ['x', 'y', 'z']) {
        const a = data.rows[i - 1][lo][axis] * (1 - t) + data.rows[i - 1][hi][axis] * t;
        const b = data.rows[i][lo][axis] * (1 - t) + data.rows[i][hi][axis] * t;
        p[axis] = a + (b - a) * blend;
      }
      p.y += .065; return p;
    });
  });
  const geometry = geometryFromRows({ rows, columns, distances });
  geometry.userData.floorOffset = .065; geometry.userData.sourceRouteId = route.id;
  return geometry;
}
