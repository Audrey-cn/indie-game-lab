// Small, route-local scenery: the caller supplies the same THREE and toonMat
// used by cel-builder. No textures, lights, physics bodies or DOM are required.
import { getRouteRibbonRows, getChuteShellRows, getCompanionChute, getRibbonBoundarySegments } from './course-math.mjs';

const geometryCaches = new WeakMap(), materialCaches = new WeakMap();
function geometries(THREE) {
  if (!geometryCaches.has(THREE)) geometryCaches.set(THREE, {
    box: new THREE.BoxGeometry(1, 1, 1),
    puff: new THREE.IcosahedronGeometry(1, 1),
    rock: new THREE.IcosahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 1, 7),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    crystal: new THREE.OctahedronGeometry(1, 0),
    ring: new THREE.TorusGeometry(1, .075, 5, 16),
  });
  return geometryCaches.get(THREE);
}
function material(toonMat, color, glow = 0) {
  if (!materialCaches.has(toonMat)) materialCaches.set(toonMat, new Map());
  const cache = materialCaches.get(toonMat), key = `${color}/${glow}`;
  if (!cache.has(key)) cache.set(key, toonMat(color, glow ? color : 0x000000, glow));
  return cache.get(key);
}
function randomFor(seed) {
  let n = 2166136261;
  for (const c of String(seed ?? 0)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => {
    n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standalone cluster. Local X follows the roadside; local +Z faces away
 * from the road. `side` records -1/1 without mirroring normals or materials.
 * Geometry and toon materials are shared across clusters; do not dispose them
 * individually while other clusters using the same factory are still alive. */
export function buildDenseTracksideCluster(THREE, worldType, side, seed, toonMat) {
  if (typeof toonMat !== 'function') throw new TypeError('toonMat must be a material factory');
  if (side !== -1 && side !== 1) throw new RangeError('Trackside side must be -1 or 1');
  const type = worldType === 'starlight_library' ? 'cosmic_warp' : worldType;
  const supported = ['grounded_nature', 'indoor_home', 'town_street', 'sky_floating', 'hybrid_winter', 'cosmic_warp', 'grand_medley'];
  if (!supported.includes(type)) throw new RangeError(`Unsupported roadside world: ${worldType}`);
  const g = new THREE.Group(), geo = geometries(THREE), random = randomFor(seed);
  g.name = `forest-density-${worldType}-${side}`;
  Object.assign(g.userData, { forestDensityBorder: true, decorativeProp: true,
    occludable: true, cameraOcclusionStructure: true, worldType, side, seed });
  const add = (shape, color, x, y, z, sx, sy = sx, sz = sx, name = shape, glow = 0) => {
    const m = new THREE.Mesh(geo[shape], material(toonMat, color, glow));
    m.name = name; m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = false; m.receiveShadow = true;
    Object.assign(m.userData, { occludable: true, cameraOcclusionStructure: true, decorativeProp: true });
    g.add(m); return m;
  };
  const flower = (x, z, color, height = .48) => {
    add('cylinder', 0x689763, x, height / 2, z, .018, height, .018, 'wildflower-stem');
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      add('puff', color, x + Math.cos(a) * .065, height, z + Math.sin(a) * .065,
        .077, .052, .077, 'wildflower-petal');
    }
    add('rock', 0xffdf83, x, height + .02, z, .04, .04, .04, 'wildflower-center');
  };
  const pine = (x, z, snow = false) => {
    add('cylinder', 0x967454, x, .4, z, .065, .8, .065, 'pine-sapling-trunk');
    for (let k = 0; k < 3; k++) {
      const radius = .36 - k * .075, y = .63 + k * .32;
      add('cone', snow ? 0x668e91 : [0x65916b, 0x74a17b, 0x85af83][k], x, y, z,
        radius, .72, radius, 'pine-sapling-needles');
      if (snow) add('cone', 0xeaf4f3, x, y + .13, z, radius * .84, .5, radius * .84, 'pine-snow-cap');
    }
  };
  const books = (x, z, count = 3) => {
    for (let k = 0; k < count; k++) {
      const y = .11 + k * .18, w = .48 - k * .025, color = [0xa98cc5, 0x8ab5b0, 0xddaa79][k % 3];
      add('box', color, x + k * .025, y, z, w, .17, .34, 'hardcover-book');
      add('box', 0xffedce, x + k * .025, y, z - .174, w * .8, .1, .015, 'book-page-edges');
      add('box', 0xf1d38a, x - w * .3 + k * .025, y, z - .187, .025, .12, .015, 'book-gilt-spine');
    }
  };
  const lantern = (x, z, y = 1.45, color = 0xffdf9e) => {
    add('cylinder', 0x9e7d72, x, y / 2, z, .035, y, .035, 'pastel-lamppost');
    add('box', 0xc9b0c6, x + .1, y, z, .28, .055, .07, 'lantern-hanger');
    add('crystal', color, x + .17, y - .2, z, .12, .21, .12, 'glowing-lantern', .42);
    for (const yy of [y - .39, y - .03]) add('cylinder', 0xc7a576, x + .17, yy, z, .13, .035, .13, 'lantern-brass-cap');
  };
  const mushroom = (x, z, color) => {
    add('cylinder', 0xffe9d4, x, .15, z, .05, .3, .05, 'mini-mushroom-stem');
    add('puff', color, x, .31, z, .16, .09, .16, 'mini-mushroom-cap');
    add('rock', 0xffffff, x + .04, .38, z - .03, .035, .018, .035, 'mushroom-dot');
  };
  const accent = random() < .5 ? 0xf4adc5 : 0xffd487;
  if (type === 'grounded_nature') {
    for (const [x, z, r] of [[-.72, 0, .36], [-.29, .1, .4], [.15, -.02, .29]])
      add('puff', x < -.5 ? 0x6e9b65 : 0x8ab878, x, r * .55, z, r, r * .72, .25, 'layered-roadside-bush');
    pine(.75, .09);
    add('rock', 0x969b89, .32, .16, .2, .3, .21, .23, 'mossy-rock');
    add('rock', 0x71996a, .29, .31, .16, .23, .06, .17, 'rock-moss');
    for (const x of [-1.06, -.46, .27]) flower(x, -.12, accent, .43 + random() * .13);
  } else if (type === 'indoor_home') {
    books(-.77, .02);
    for (let k = 0; k < 2; k++) add('box', [0xe8ba85, 0x9cbfd3][k], -.2 + k * .22, .13 + k * .11, .12, .25, .25, .25, 'colorful-toy-block');
    add('cylinder', 0xf4d9db, .4, .17, -.05, .14, .25, .14, 'teacup');
    add('cylinder', 0x96734e, .4, .3, -.05, .11, .015, .11, 'teacup-tea');
    add('ring', 0xf4d9db, .56, .2, -.05, .085, .1, .08, 'teacup-handle');
    add('cylinder', 0xb6c8ad, .88, .2, .07, .18, .4, .18, 'biscuit-tin');
    add('cylinder', 0xe3c28e, .88, .42, .07, .19, .045, .19, 'biscuit-tin-lid');
    add('cylinder', 0xd8ad88, .05, .55, .18, .09, .25, .09, 'spice-jar');
    add('box', 0xffefd5, .05, .55, .084, .11, .13, .015, 'spice-label');
    add('cylinder', 0x8d715e, .05, .69, .18, .095, .04, .095, 'spice-jar-cork');
  } else if (type === 'town_street') {
    add('box', 0xb68d75, -.52, .19, .03, .95, .38, .42, 'timber-flower-box');
    for (const x of [-.82, -.5, -.2]) { add('puff', 0x83ab78, x, .43, .03, .21, .14, .2, 'window-box-foliage'); flower(x, -.02, accent, .63); }
    add('cylinder', 0xc3986b, .35, .3, .06, .23, .6, .23, 'bakery-barrel');
    for (const y of [.12, .48]) add('cylinder', 0x927965, .35, y, .06, .24, .045, .24, 'barrel-hoop');
    add('box', 0xa9c6c1, .95, .43, .17, .4, .86, .1, 'pastel-timber-shutter');
    for (let k = 0; k < 4; k++) add('box', 0xd1e1d0, .95, .16 + k * .17, .104, .33, .045, .035, 'shutter-slat');
    lantern(.58, .15);
  } else if (type === 'sky_floating') {
    for (let k = 0; k < 5; k++) add('puff', [0xf3e6f1, 0xe6e9f6, 0xf7eee5][k % 3], -.85 + k * .38, .2 + (k % 2) * .08, .04, .34, .25, .25, 'pastel-cloud-puff');
    for (let k = 0; k < 4; k++) {
      const fern = add('crystal', [0xa1e0dc, 0xc9b7ed][k % 2], -.48 + k * .27, .61 + (k % 2) * .12, .12, .08, .3, .08, 'glowing-crystal-fern', .3);
      fern.rotation.z = (k - 1.5) * .22;
    }
    mushroom(-.98, -.06, 0xd2b7e6); mushroom(.95, -.02, 0xf1bdce);
  } else if (type === 'hybrid_winter') {
    pine(-.54, .07, true);
    for (let k = 0; k < 3; k++) add('puff', [0xe6f3f3, 0xd3e7ed][k % 2], -.95 + k * .77, .12, .03, .33, .18, .25, 'soft-snowdrift');
    add('cylinder', 0xc4d9df, .52, .15, .05, .22, .24, .22, 'snow-lantern-base');
    add('crystal', 0xffdc99, .52, .45, .05, .15, .25, .15, 'warm-snow-lantern', .55);
    add('cone', 0xf0f6f2, .52, .74, .05, .27, .22, .27, 'snow-lantern-roof');
    add('rock', 0xeaf4f2, 1.03, .22, .1, .18, .28, .2, 'snowball');
  } else if (type === 'cosmic_warp') {
    books(-.78, .04);
    for (let k = 0; k < 3; k++) add('crystal', [0xc9b9ed, 0xb3e0ec, 0xffdfac][k], -.25 + k * .36, .74 + (k % 2) * .28, .07, .1, .21, .1, 'floating-star-crystal', .4);
    for (let k = 0; k < 3; k++) {
      const ring = add('ring', 0xe6ca8e, .15, .63, .08, .28, .28, .28, 'glowing-astrolabe-ring', .22);
      ring.rotation.set(k * .65, k * .7, .3);
    }
    lantern(.87, .08, 1.45, 0xdcc6f5);
  } else if (type === 'grand_medley') {
    add('cylinder', 0xc6a583, -.72, .18, .04, .14, .3, .14, 'floral-urn-foot');
    add('puff', 0xe8c6a6, -.72, .43, .04, .25, .26, .23, 'floral-urn-bowl');
    for (const x of [-.89, -.69, -.5]) flower(x, .04, accent, .8);
    for (const x of [-.25, 1.02]) add('cylinder', 0xc39f7d, x, .65, .12, .025, 1.3, .025, 'garland-post');
    add('box', 0xd5c4ae, .38, 1.24, .12, 1.3, .025, .025, 'lantern-garland-cord');
    for (let k = 0; k < 3; k++) {
      add('crystal', [0xeab7d1, 0xb2dedc, 0xffdf9e][k], -.06 + k * .44, 1.08, .12, .11, .17, .11, 'festival-garland-lantern', .3);
      const pennant = add('cone', [0xc5baeb, 0xeab7d1, 0xb2dedc][k], -.06 + k * .44, .84, .12, .1, .2, .025, 'confetti-banner');
      pennant.rotation.z = Math.PI;
    }
    for (let k = 0; k < 5; k++) {
      const confetti = add('box', [0xf1bfce, 0xbad9c3, 0xf6d68c][k % 3], -.2 + k * .26, .19 + random() * .25, -.12, .06, .08, .025, 'festival-confetti');
      confetti.rotation.z = random() * 2;
    }
  }
  // Vary the silhouette without changing the guaranteed compact footprint.
  g.scale.y = .93 + random() * .14;
  g.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(g);
  g.userData.localBounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  g.userData.footprintRadius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)), Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
  g.userData.elementCount = g.children.length;
  return g;
}

// A spatial index of actual rendered floor triangles, including banked chutes
// and their companion strand. Checking a complete cluster rectangle prevents a
// tall prop's leaf, book corner or lantern from projecting into a nearby lane.
function floorClearance(track) {
  const cells = new Map(), size = 8;
  const register = polygon => {
    const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z);
    for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++)
      for (let z = Math.floor(Math.min(...zs) / size); z <= Math.floor(Math.max(...zs) / size); z++) {
        const key = `${x}/${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(polygon);
      }
  };
  const chutes = track.chutes || [];
  for (const [paths, shell] of [[track.routes || [], false], [[...chutes, ...chutes.filter(c => c.doubleHelix).map(getCompanionChute)], true]])
    for (const path of paths) {
      const data = shell ? getChuteShellRows(path) : getRouteRibbonRows(path);
      for (let i = 1; i < data.rows.length; i++) for (let j = 1; j <= data.columns; j++) {
        const a = data.rows[i - 1][j - 1], b = data.rows[i - 1][j], c = data.rows[i][j - 1], d = data.rows[i][j];
        register([a, b, c]); register([b, d, c]);
      }
    }
  for (const p of track.platforms || []) register([
    { x: p.x - p.w / 2, z: p.z - p.d / 2 }, { x: p.x + p.w / 2, z: p.z - p.d / 2 },
    { x: p.x + p.w / 2, z: p.z + p.d / 2 }, { x: p.x - p.w / 2, z: p.z + p.d / 2 },
  ]);
  const overlaps = (a, b) => {
    for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length], nx = q.z - p.z, nz = p.x - q.x;
      if (Math.hypot(nx, nz) < 1e-8) continue;
      const aa = a.map(v => v.x * nx + v.z * nz), bb = b.map(v => v.x * nx + v.z * nz);
      if (Math.max(...aa) <= Math.min(...bb) + 1e-7 || Math.max(...bb) <= Math.min(...aa) + 1e-7) return false;
    }
    return true;
  };
  return footprint => {
    const xs = footprint.map(p => p.x), zs = footprint.map(p => p.z), seen = new Set();
    for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++)
      for (let z = Math.floor(Math.min(...zs) / size); z <= Math.floor(Math.max(...zs) / size); z++)
        for (const polygon of cells.get(`${x}/${z}`) || []) {
          if (seen.has(polygon)) continue;
          seen.add(polygon);
          if (overlaps(footprint, polygon)) return false;
        }
    return true;
  };
}

/** Attach and return a THREE.Group of dense borders. Optional isClear uses the
 * v3 footprint convention: isClear([{x,z}, ...], {route, side, cluster}) -> bool.
 * Both internal floor clearance and the callback must pass. Occlusion flags
 * enroll meshes in the existing camera cutaway controller; the caller must
 * refresh that controller after adding borders to an already active scene. */
export function populateForestDensityBorders(THREE, track, parent, toonMat, { isClear } = {}) {
  const group = new THREE.Group(); group.name = 'forest-density-borders';
  Object.assign(group.userData, { forestDensityBorders: true, occludable: true, cameraOcclusionStructure: true,
    placements: [], borderCount: 0, rejectedCount: 0, spacingRange: [3.2, 4.2] });
  const clear = floorClearance(track), random = randomFor(`${track.id ?? track.index ?? 0}/borders`);
  for (const route of track.routes || []) for (const side of [-1, 1]) {
    let walked = 0, next = 1.6, serial = 0;
    for (const edge of getRibbonBoundarySegments(route).filter(e => e.side === side)) {
      const dx = edge.b.x - edge.a.x, dz = edge.b.z - edge.a.z, length = Math.hypot(dx, dz);
      if (length < 1e-7) continue;
      while (next <= walked + length) {
        const alongEdge = next, t = (next - walked) / length;
        next += 3.2 + random();
        const seed = `${track.id ?? track.index ?? 0}/${route.id ?? 'route'}/${side}/${serial++}`;
        const cluster = buildDenseTracksideCluster(THREE, track.worldType, side, seed, toonMat);
        cluster.position.set(edge.a.x + dx * t + edge.nx * .55,
          edge.a.y + (edge.b.y - edge.a.y) * t, edge.a.z + dz * t + edge.nz * .55);
        cluster.rotation.y = Math.atan2(edge.nx, edge.nz);
        const { min, max } = cluster.userData.localBounds;
        const footprint = [[min[0], min[2]], [max[0], min[2]], [max[0], max[2]], [min[0], max[2]]].map(([x, z]) => ({
          x: cluster.position.x + edge.nz * x + edge.nx * z,
          z: cluster.position.z - edge.nx * x + edge.nz * z,
        }));
        const metadata = { route, side, cluster };
        if (!clear(footprint) || isClear && !isClear(footprint, metadata)) {
          group.userData.rejectedCount++; continue;
        }
        Object.assign(cluster.userData, { routeId: route.id, alongEdge, anchorOffset: .55, footprint,
          edge: { x: edge.a.x + dx * t, y: edge.a.y + (edge.b.y - edge.a.y) * t,
            z: edge.a.z + dz * t, nx: edge.nx, nz: edge.nz } });
        group.add(cluster);
        group.userData.placements.push({ routeId: route.id, side, alongEdge, anchorOffset: .55, footprint });
      }
      walked += length;
    }
  }
  group.userData.borderCount = group.children.length;
  parent.add(group);
  return group;
}
