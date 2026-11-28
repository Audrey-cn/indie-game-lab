import { getRouteRibbonRows, getRouteFloorTriangles } from './course-math.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DECK_LIFT = .06;
const EDGE_MARGIN = .35;
function curveSpec(spec) {
  const { dryWidth, amplitude, cycles = 1.5, phase = 0 } = spec;
  const routeHalfWidth = spec.routeHalfWidth ?? spec.routeWidth / 2;
  if (![dryWidth, amplitude, cycles, phase, routeHalfWidth].every(Number.isFinite)
    || dryWidth <= 0 || cycles <= 0 || routeHalfWidth <= dryWidth / 2 + EDGE_MARGIN) {
    throw new RangeError('Dry curve needs finite amplitude, positive cycles/width and room inside routeHalfWidth');
  }
  return { dryWidth, amplitude, cycles, phase, limit: routeHalfWidth - dryWidth / 2 - EDGE_MARGIN };
}

/** u is normalized 3D route distance; lateral d is in horizontal metres. */
export function evaluateDryCurveOffset(mudSpec, u) {
  const { amplitude, cycles, phase, limit } = curveSpec(mudSpec);
  if (!Number.isFinite(u)) throw new TypeError('Dry curve u must be finite');
  return clamp(amplitude * Math.sin(clamp(u, 0, 1) * Math.PI * cycles + phase), -limit, limit);
}

export function isPointOnDryCurve(mudSpec, u, lateral) {
  return Math.abs(lateral - evaluateDryCurveOffset(mudSpec, u)) <= mudSpec.dryWidth * .5;
}

function sampleCount(value, minimum, name) {
  if (!Number.isInteger(value) || value < minimum || value > 16384) {
    throw new RangeError(`${name} must be an integer from ${minimum} to 16384`);
  }
  return value;
}

// Work from the exact mitered/tapered floor, rather than a second analytic
// bank parabola. Rendering and collision both use these Float32 triangles.
function routeSampler(route) {
  if (!route?.points || route.points.length < 2 || !(route.width > 0)) {
    throw new TypeError('Dry curve needs a route with points and positive width');
  }
  const { distances, frames, rows, columns, leftWidths, rightWidths } = getRouteRibbonRows(route), length = distances.at(-1);
  if (!(length > 0)) throw new RangeError('Dry curve route must have nonzero length');
  const triangles = getRouteFloorTriangles(route);
  return (u, lateral) => {
    const distance = clamp(u, 0, 1) * length;
    // A Float32 cap may sit micrometres inside its analytic frame. Interpolate
    // the rendered endpoint row itself so a painted ribbon cannot overshoot
    // the cap merely because world coordinates are large or oblique.
    if(distance<1e-8 || length-distance<1e-8) {
      const index=distance<1e-8?0:rows.length-1;
      const width=lateral<0?leftWidths[index]:rightWidths[index];
      if(Math.abs(lateral)>width+1e-6)throw new RangeError(`Dry curve exceeds route ${route.id ?? ''} endpoint width`);
      const column=clamp((lateral/width+1)*columns/2,0,columns),j=Math.min(columns-1,Math.floor(column)),t=column-j;
      const a=rows[index][j],b=rows[index][j+1];
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t+DECK_LIFT,z:a.z+(b.z-a.z)*t};
    }
    let lo = 1, hi = distances.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] < distance) lo = mid + 1; else hi = mid;
    }
    const i = lo - 1, span = distances[lo] - distances[i];
    const t = span > 1e-9 ? (distance - distances[i]) / span : 0;
    const a = route.points[i], b = route.points[lo], f = frames[i], g = frames[lo];
    // Preserve the miter scale: each end vector projects to one metre on this
    // segment's lateral normal. Normalizing it would shrink the physics offset
    // at a corner and could put a visually dry star into the slowdown zone.
    const nx = f.nx * f.miter * (1 - t) + g.nx * g.miter * t;
    const nz = f.nz * f.miter * (1 - t) + g.nz * g.miter * t;
    const x = a.x + (b.x - a.x) * t + nx * lateral;
    const z = a.z + (b.z - a.z) * t + nz * lateral;
    // Search the current span first to disambiguate elevated crossings.
    const heightAt = q => {
      if (x < q.minX - 1e-6 || x > q.maxX + 1e-6 || z < q.minZ - 1e-6 || z > q.maxZ + 1e-6) return null;
      const dx = x - q.a.x, dz = z - q.a.z;
      const v = (dx * (q.c.z - q.a.z) - (q.c.x - q.a.x) * dz) / q.den;
      const w = ((q.b.x - q.a.x) * dz - dx * (q.b.z - q.a.z)) / q.den;
      if (v < -1e-6 || w < -1e-6 || v + w > 1 + 1e-6) return null;
      return q.a.y + q.slopeX * dx + q.slopeZ * dz;
    };
    for (const currentSpan of [true, false]) for (const q of triangles) {
      if ((q.index === i) !== currentSpan || (!currentSpan && Math.abs(q.index - i) > 1)) continue;
      const y = heightAt(q);
      if (y !== null) return { x, y: y + DECK_LIFT, z };
    }
    throw new RangeError(`Dry curve leaves rendered route ${route.id ?? ''} at u=${u.toFixed(6)}, lateral=${lateral.toFixed(6)}; widen the deck or reduce amplitude/dryWidth`);
  };
}

/** samples is the number of intervals; both endpoints are included. */
export function sampleDryCurvePoints(route, mudSpec, samples = 36) {
  sampleCount(samples, 1, 'samples');
  const sample = routeSampler(route);
  return Array.from({ length: samples + 1 }, (_, i) => sample(i / samples, evaluateDryCurveOffset(mudSpec, i / samples)));
}

export function buildDryCurveRibbonMesh(THREE, route, mudSpec, material) {
  const { dryWidth, cycles } = curveSpec(mudSpec), sample = routeSampler(route);
  const rows = Math.max(72, Math.ceil(cycles * 48), route.points.length * 8);
  const columns = 4, positions = [], uv = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows, d = evaluateDryCurveOffset(mudSpec, u);
    for (let j = 0; j <= columns; j++) {
      const p = sample(u, d + (j / columns - .5) * dryWidth);
      positions.push(p.x, p.y, p.z); uv.push(j / columns, u * rows / 8);
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j, b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.userData.ribbonRows = rows + 1; geometry.userData.ribbonColumns = columns;
  const ribbonMaterial = material ? material.clone() : new THREE.MeshStandardMaterial({ color: 0xbe965c });
  ribbonMaterial.polygonOffset = true; ribbonMaterial.polygonOffsetFactor = -1; ribbonMaterial.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geometry, ribbonMaterial);
  mesh.name = 'continuous-dry-skill-curve'; mesh.receiveShadow = true;
  return mesh;
}

/** Stars share the exact horizontal centerline evaluator used by the ribbon. */
export function sampleDryCurveStars(route, mudSpec, count = 4) {
  sampleCount(count, 0, 'count');
  const sample = routeSampler(route);
  return Array.from({ length: count }, (_, i) => {
    const u = (i + 1) / (count + 1), p = sample(u, evaluateDryCurveOffset(mudSpec, u));
    return { x: p.x, y: p.y + .8, z: p.z };
  });
}

/** Zero-based stages 0..9; later indices keep the final difficulty. */
export function mudSpecForStage(stageIndex, routeWidth) {
  if (!Number.isFinite(stageIndex)) throw new TypeError('stageIndex must be finite');
  if (!Number.isFinite(routeWidth) || routeWidth <= 2.55) throw new RangeError('Slow-zone route width must exceed 2.55 metres');
  const difficulty = clamp(stageIndex / 9, 0, 1), dryWidth = 1.85 - .47 * difficulty;
  const routeHalfWidth = routeWidth / 2;
  return { kind: 'mud', routeHalfWidth, dryWidth, cycles: 1.5 + difficulty, phase: 0,
    amplitude: (routeHalfWidth - dryWidth / 2 - EDGE_MARGIN) * .85 };
}
