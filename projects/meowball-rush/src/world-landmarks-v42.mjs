// Architectural scenery only: no colliders, lights, textures or DOM dependencies.
// Call after the authored floors exist, then refresh an active camera cutaway.
import { samplePath, polylineLength, getRouteRibbonRows, getChuteShellRows, getCompanionChute } from './course-math.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const geometryCaches = new WeakMap(), materialCaches = new WeakMap();
const STAGE_KINDS = {
  academy: ['storybook-watermill', 'flower-stone-arch', 'brook-windmill'],
  garden: ['towering-bookcase', 'glowing-floor-lamp', 'toy-castle', 'toy-train-viaduct'],
  honey: ['striped-market-stalls', 'bread-oven-chimney', 'tiered-town-fountain'],
  mushroom: ['gothic-waterfall-arch'],
  clockwork: ['copper-pot-hood'],
  pendulum: ['gilded-clocktower', 'smoking-rooftop-chimney', 'gothic-bell-gable'],
  foundry: ['emerald-sky-pagoda', 'pastel-cloud-ring', 'sky-windmill'],
  aurora: ['snowy-attic-gable', 'turquoise-ice-arch', 'pastel-aurora-ribbons'],
  prism: ['floating-planetary-rings'],
  sanctum: ['golden-sanctum-towers', 'festival-sky-lanterns', 'starlight-firework-rings'],
};

function geometries(THREE) {
  if (!geometryCaches.has(THREE)) geometryCaches.set(THREE, {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 6),
    roof: new THREE.ConeGeometry(1, 1, 4),
    puff: new THREE.IcosahedronGeometry(1, 1),
    crystal: new THREE.OctahedronGeometry(1, 0),
    ring: new THREE.TorusGeometry(1, .065, 6, 32),
    arch: new THREE.TorusGeometry(1, .12, 6, 24, Math.PI),
  });
  return geometryCaches.get(THREE);
}

function material(toonMat, color, glow = 0, opacity = 1) {
  if (!materialCaches.has(toonMat)) materialCaches.set(toonMat, new Map());
  const cache = materialCaches.get(toonMat), key = `${color}/${glow}/${opacity}`;
  if (!cache.has(key)) {
    const m = toonMat(color, glow ? color : 0x000000, glow);
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
    cache.set(key, m);
  }
  return cache.get(key);
}

function mark(node) {
  Object.assign(node.userData, { v42Landmark: true, decorativeProp: true,
    occludable: true, cameraOcclusionStructure: true });
  return node;
}

// Index actual triangles rather than nominal centerlines: banked bends, tapered
// mouths, receiving platforms and both helix strands all reserve their space.
function floorClearance(track) {
  const cells = new Map(), cellSize = 12;
  function visit(polygon, fn) {
    const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z);
    for (let x = Math.floor(Math.min(...xs) / cellSize); x <= Math.floor(Math.max(...xs) / cellSize); x++)
      for (let z = Math.floor(Math.min(...zs) / cellSize); z <= Math.floor(Math.max(...zs) / cellSize); z++) fn(`${x}/${z}`);
  }
  const register = polygon => visit(polygon, key => {
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(polygon);
  });
  const chutes = track.chutes || [];
  for (const [paths, shell] of [[track.routes || [], false],
    [[...chutes, ...chutes.filter(c => c.doubleHelix).map(getCompanionChute)], true]]) {
    for (const path of paths) {
      if (!path.points?.length) continue;
      const data = shell ? getChuteShellRows(path) : getRouteRibbonRows(path);
      for (let i = 1; i < data.rows.length; i++) for (let j = 1; j <= data.columns; j++) {
        const a = data.rows[i - 1][j - 1], b = data.rows[i - 1][j], c = data.rows[i][j - 1], d = data.rows[i][j];
        register([a, b, c]); register([b, d, c]);
      }
    }
  }
  for (const p of track.platforms || []) register([
    { x: p.x - p.w / 2, z: p.z - p.d / 2 }, { x: p.x + p.w / 2, z: p.z - p.d / 2 },
    { x: p.x + p.w / 2, z: p.z + p.d / 2 }, { x: p.x - p.w / 2, z: p.z + p.d / 2 },
  ]);
  function overlaps(a, b) {
    for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length], nx = q.z - p.z, nz = p.x - q.x;
      if (Math.hypot(nx, nz) < 1e-8) continue;
      const aa = a.map(v => v.x * nx + v.z * nz), bb = b.map(v => v.x * nx + v.z * nz);
      if (Math.max(...aa) <= Math.min(...bb) + 1e-7 || Math.max(...bb) <= Math.min(...aa) + 1e-7) return false;
    }
    return true;
  }
  return footprint => {
    let clear = true;
    const seen = new Set();
    visit(footprint, key => {
      if (!clear) return;
      for (const polygon of cells.get(key) || []) {
        if (seen.has(polygon)) continue;
        seen.add(polygon);
        if (overlaps(footprint, polygon)) { clear = false; break; }
      }
    });
    return clear;
  };
}

function buildLandmark(THREE, kind, toonMat, seed) {
  const root = mark(new THREE.Group()), geo = geometries(THREE), animations = [], owned = [];
  root.name = kind;
  const add = (parent, shape, color, x, y, z, sx, sy = sx, sz = sx, name = shape, glow = 0, opacity = 1) => {
    const m = mark(new THREE.Mesh(geo[shape], material(toonMat, color, glow, opacity)));
    m.name = name; m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = opacity === 1; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (p, c, x, y, z, w, h, d, name = 'carved-beam') => add(p, 'box', c, x, y, z, w, h, d, name);
  const cyl = (p, c, x, y, z, r, h, name = 'turned-column', glow = 0) => add(p, 'cylinder', c, x, y, z, r, h, r, name, glow);
  const puff = (p, c, x, y, z, r, sy = r, sz = r, name = 'soft-cloud', glow = 0, opacity = 1) =>
    add(p, 'puff', c, x, y, z, r, sy, sz, name, glow, opacity);
  const ring = (p, c, x, y, z, r, name = 'gilded-ring', glow = 0, opacity = 1) =>
    add(p, 'ring', c, x, y, z, r, r, r, name, glow, opacity);
  const pivot = (name, x, y, z, options = {}) => {
    const p = mark(new THREE.Group()); p.name = name; p.position.set(x, y, z); root.add(p);
    p.userData.v42Animated = true;
    if (options.ribbon) p.userData.v42Deforming = true;
    animations.push({ mesh: p, kind: name, phase: seed * .73 + animations.length * 1.37,
      axis: 'y', speed: 0, bob: 0, breath: 0, frequency: .8, ...options });
    return p;
  };
  const roof = (p, x, y, z, w, h, d, color, snow = false) => {
    for (const side of [-1, 1]) {
      const beam = box(p, color, x + side * w / 4, y, z, Math.hypot(w / 2, h), .24, d, 'pitched-gable-roof');
      beam.rotation.z = -side * Math.atan2(h, w / 2);
      if (snow) {
        const cap = box(p, 0xf5fbff, x + side * w / 4, y + .18, z, Math.hypot(w / 2, h), .2, d + .15, 'soft-snow-roof');
        cap.rotation.z = beam.rotation.z;
      }
    }
  };
  const arch = (p, c, x, y, z, r = 2, h = 3, glow = 0, opacity = 1) => {
    for (const side of [-1, 1]) add(p, 'cylinder', c, x + side * r, y + h / 2, z, .24, h, .24, 'arch-pier', glow, opacity);
    return add(p, 'arch', c, x, y + h, z, r, r * 1.12, 1, 'sculpted-arch-crown', glow, opacity);
  };
  const flower = (x, y, z, color) => {
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5;
      puff(root, color, x + Math.cos(a) * .19, y + Math.sin(a) * .19, z, .17, .17, .09, 'flower-drapery-petal');
    }
    puff(root, 0xffd777, x, y, z + .08, .11, .11, .08, 'flower-heart');
  };
  const sails = (x, y, z, color, radius = 3.2, water = false) => {
    const p = pivot(water ? 'rotating-watermill-wheel' : 'rotating-windmill-sails', x, y, z,
      { axis: 'z', speed: water ? .23 : .32 });
    if (water) {
      for (const zz of [-.32, .32]) ring(p, 0x9a6948, 0, 0, zz, radius, 'wooden-wheel-rim');
      for (let k = 0; k < 12; k++) {
        const a = k * TAU / 12;
        const spoke = box(p, 0xd6ae71, -Math.sin(a) * radius * .5, Math.cos(a) * radius * .5, 0,
          .13, radius, .15, 'waterwheel-spoke'); spoke.rotation.z = a;
        const paddle = box(p, color, -Math.sin(a) * radius, Math.cos(a) * radius, 0, .55, .2, .95, 'waterwheel-paddle');
        paddle.rotation.z = a;
      }
    } else for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const arm = box(p, 0xa7774c, -Math.sin(a) * radius / 2, Math.cos(a) * radius / 2, 0, .16, radius, .14, 'sail-wood-spar');
      arm.rotation.z = a;
      const cloth = box(p, color, -Math.sin(a) * radius * .68 + Math.cos(a) * .22,
        Math.cos(a) * radius * .68 + Math.sin(a) * .22, .1, .72, radius * .65, .1, 'canvas-windmill-sail');
      cloth.rotation.z = a;
    }
    cyl(p, 0xe6bd76, 0, 0, .25, .34, .48, 'brass-axle').rotation.x = Math.PI / 2;
    return p;
  };
  const smoke = (x, y, z) => {
    for (let k = 0; k < 3; k++) {
      const p = pivot('drifting-chimney-steam', x + k * .22, y + k * .72, z,
        { speed: .06, bob: .22, breath: .08, frequency: .7 });
      puff(p, 0xf8e7dd, 0, 0, 0, .48 + k * .13, .43 + k * .12, .45 + k * .11, 'translucent-steam-puff', .04, .42);
    }
  };

  if (kind === 'storybook-watermill') {
    box(root, 0xe9d6b3, 0, 2.5, -.7, 4.8, 5, 3.6, 'watermill-stone-house');
    roof(root, 0, 5.4, -.7, 5.7, 1.9, 4.2, 0xb7785b);
    for (const x of [-2.25, 0, 2.25]) box(root, 0x966543, x, 2.6, 1.14, .17, 4.9, .12, 'half-timbered-frame');
    for (const x of [-1.2, 1.2]) box(root, 0x9dd9da, x, 3.5, 1.22, .8, 1.1, .08, 'brook-window');
    sails(0, 2.7, 1.95, 0xc69c61, 2.65, true);
    box(root, 0x7edbd9, 0, .06, 2, 6.4, .12, 2, 'cel-brook-millrace');
    for (const x of [-2.7, 2.7]) puff(root, 0xaac791, x, .15, 1.1, .8, .32, .7, 'mossy-brook-bank');
  } else if (kind === 'flower-stone-arch') {
    arch(root, 0xdbcdb5, 0, 0, 0, 2.5, 3.6);
    for (const x of [-2.5, 2.5]) for (let k = 0; k < 4; k++) {
      box(root, 0xa2be86, x, .9 + k * .7, .12, .44, .7, .25, 'climbing-ivy');
      flower(x + Math.sin(k) * .22, 1 + k * .82, .36, k % 2 ? 0xffb8d1 : 0xf7d99e);
    }
    for (let k = 0; k < 7; k++) {
      const a = k * Math.PI / 6;
      flower(Math.cos(a) * 2.5, 3.6 + Math.sin(a) * 2.8, .3, k % 2 ? 0xd9b7e9 : 0xffa8bf);
    }
  } else if (kind === 'brook-windmill' || kind === 'sky-windmill') {
    const sky = kind === 'sky-windmill';
    if (sky) {
      add(root, 'cone', 0x9eb8c6, 0, -1.5, 0, 3.5, 3.2, 3.5, 'floating-windmill-island').rotation.x = Math.PI;
      puff(root, 0xe8dcf6, 0, -.1, 0, 3.3, .55, 2.9);
    }
    cyl(root, sky ? 0xd4eedc : 0xc99d6c, 0, 3.5, 0, 1.45, 7, 'wooden-windmill-tower');
    add(root, 'roof', sky ? 0x99b5e0 : 0xa66c50, 0, 7.4, 0, 2.2, 2.2, 2.2, 'pointed-windmill-cap').rotation.y = Math.PI / 4;
    sails(0, 5.7, 1.65, sky ? 0xe9dafd : 0xffe8b4, sky ? 4 : 3.5);
    box(root, 0x79b3b5, 0, 2.3, 1.45, .62, .95, .1, 'windmill-window');
    for (const y of [1, 3.5, 6]) ring(root, 0xa97e52, 0, y, 0, 1.47, 'windmill-hoop').rotation.x = Math.PI / 2;
  } else if (kind === 'towering-bookcase') {
    box(root, 0x986442, 0, 6, -.6, 7.8, 12, .5, 'giant-bookcase-back');
    for (const x of [-3.9, 3.9]) box(root, 0xbb8b59, x, 6, 0, .4, 12.4, 2.1, 'bookcase-carved-upright');
    for (let row = 0; row < 5; row++) {
      const y = row * 2.35;
      box(root, 0xd1a16d, 0, y + .15, .1, 8.2, .3, 2.3, 'wooden-bookshelf');
      for (let k = 0; k < 8; k++) {
        const x = (k - 3.5) * .88, h = 1.3 + ((k + row) % 3) * .22;
        const b = box(root, [0x9baed2, 0xc796b7, 0x8fbaa6, 0xe3bb78][(k + row) % 4], x, y + .3 + h / 2, .2,
          .65, h, 1.35, 'colorful-giant-book'); b.rotation.z = k % 4 === 0 ? .1 : 0;
        box(root, 0xffdf98, x, y + .65, .91, .5, .065, .06, 'gilt-book-spine');
      }
    }
    box(root, 0xe3bd82, 0, 12.1, 0, 8.6, .45, 2.5, 'bookcase-crown-molding');
  } else if (kind === 'glowing-floor-lamp') {
    cyl(root, 0xac8659, 0, .15, 0, 1.7, .3, 'lamp-weighted-foot');
    cyl(root, 0xa17b51, 0, 4.5, 0, .16, 9, 'tall-lamp-stem');
    // Nested translucent faceted shades retain the warm cel-lit silhouette.
    add(root, 'cone', 0xffdca7, 0, 8.6, 0, 2.55, 3.5, 2.55, 'glowing-linen-lampshade', .48);
    for (const y of [7.05, 8.3]) ring(root, 0xe7bb7b, 0, y, 0, y < 8 ? 2.35 : 1.45, 'shade-brass-trim').rotation.x = Math.PI / 2;
    puff(root, 0xffecc8, 0, 7.5, 0, .85, .95, .85, 'warm-lamp-bulb', .8);
    for (const side of [-1, 1]) box(root, 0xba95bc, side * 1.2, .45, 1.25, 1.35, .6, 1, 'toy-block-at-lamp-foot');
  } else if (kind === 'toy-castle') {
    box(root, 0xc7a7d7, 0, 1.8, 0, 5.5, 3.6, 2.8, 'pastel-toy-castle-wall');
    for (const x of [-2.8, 2.8]) {
      cyl(root, 0xa8cdd1, x, 2.4, 0, .85, 4.8, 'toy-castle-turret');
      add(root, 'cone', x < 0 ? 0xeea8b9 : 0xc5a4e4, x, 5.5, 0, 1.2, 2.5, 1.2, 'colorful-turret-roof');
      box(root, 0xecc16b, x, 7, 0, .065, 1.5, .065, 'toy-banner-pole');
      box(root, x < 0 ? 0xffd27f : 0xa1e0ca, x + .4, 7.3, 0, .85, .5, .08, 'toy-castle-pennant');
    }
    arch(root, 0xfbe7b4, 0, 0, 1.55, 1, 1.5);
    for (let k = 0; k < 6; k++) box(root, 0xe5d0e8, (k - 2.5), 3.9, 0, .55, .65, 3.1, 'toy-castle-crenellation');
  } else if (kind === 'toy-train-viaduct') {
    for (let k = -1; k <= 1; k++) arch(root, 0xc99868, k * 3.25, 0, 0, 1.5, 2.3);
    box(root, 0xe3bd82, 0, 4.4, 0, 10.3, .4, 2.2, 'elevated-viaduct-deck');
    for (const z of [-.7, .7]) box(root, 0x978783, 0, 4.72, z, 10.4, .1, .1, 'miniature-train-rail');
    for (let k = 0; k < 13; k++) box(root, 0xa87950, (k - 6) * .77, 4.62, 0, .12, .12, 1.8, 'toy-rail-sleeper');
    box(root, 0x99cdb8, -.9, 5.05, 0, 2.1, .6, 1.1, 'miniature-locomotive');
    box(root, 0xdf9dab, -1.45, 5.65, 0, .8, .85, 1.1, 'locomotive-cab');
    cyl(root, 0xe8bd7b, -.25, 5.7, 0, .18, .65, 'toy-engine-chimney');
    for (const x of [-1.55, -.3]) for (const z of [-.6, .6]) cyl(root, 0xaa7f5b, x, 4.88, z, .27, .16, 'toy-train-wheel').rotation.x = Math.PI / 2;
  } else if (kind === 'striped-market-stalls') {
    for (const side of [-1, 1]) {
      const x = side * 2.1;
      box(root, 0xb8885d, x, 1, 0, 3.7, 1.4, 2.3, 'cobblestone-market-counter');
      for (const dx of [-1.7, 1.7]) box(root, 0x97704f, x + dx, 2, -.7, .13, 4, .13, 'market-awning-post');
      for (let k = 0; k < 7; k++) {
        const awning = box(root, k % 2 ? 0xffefd1 : side < 0 ? 0xdd998e : 0x9cbca8,
          x + (k - 3) * .55, 3.8, .15, .55, .15, 3.2, 'striped-cloth-awning'); awning.rotation.x = .17;
        puff(root, 0xe8ba76, x + (k - 3) * .42, 1.85, .3, .29, .16, .23, 'fresh-market-loaf');
      }
    }
    for (let x = -4; x <= 4; x++) for (let z = -1; z <= 1; z++)
      box(root, (x + z) % 2 ? 0xc9c3b0 : 0xd7d0bb, x, .05, z, .92, .1, .9, 'market-cobblestone-plaza');
  } else if (kind === 'bread-oven-chimney' || kind === 'smoking-rooftop-chimney') {
    const oven = kind === 'bread-oven-chimney';
    box(root, 0xbe856b, 0, oven ? 1.4 : 2.8, 0, oven ? 4 : 2.3, oven ? 2.8 : 5.6, 2.5, 'masonry-chimney-body');
    if (oven) {
      puff(root, 0xe4c39b, 0, 2.35, 0, 2, 1.7, 1.4, 'domed-bread-oven');
      box(root, 0x694735, 0, 1.25, 1.43, 1.5, 1.3, .12, 'bread-oven-mouth');
      add(root, 'crystal', 0xffc374, 0, 1.1, 1.55, .44, .65, .15, 'glowing-oven-fire', .8);
      cyl(root, 0xb57d64, -.9, 4.6, -.45, .58, 4.4, 'oven-chimney');
    }
    const topY = oven ? 6.85 : 5.7, chimneyX = oven ? -.9 : 0;
    for (let k = 0; k < (oven ? 5 : 8); k++) box(root, 0xd7a78b, chimneyX, topY - k * .48, 1.29,
      oven ? .9 : 2.35, .08, .05, 'brick-mortar-course');
    box(root, 0xe0b99c, chimneyX, topY, 0, oven ? 1.5 : 2.8, .32, oven ? 1.8 : 2.9, 'chimney-cornice');
    smoke(chimneyX, topY + .5, 0);
  } else if (kind === 'tiered-town-fountain') {
    cyl(root, 0xc5c7b9, 0, .15, 0, 3.4, .3, 'circular-fountain-plaza');
    for (let tier = 0; tier < 3; tier++) {
      const y = .5 + tier * 1.65, r = 2.8 - tier * .85;
      cyl(root, 0xd5dacb, 0, y, 0, r, .32, 'tiered-stone-fountain-basin');
      cyl(root, 0x92e2df, 0, y + .18, 0, r * .9, .04, 'shimmering-fountain-water', .22);
      cyl(root, 0xadbdb8, 0, y + .7, 0, .3, 1.4, 'fountain-carved-stem');
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6;
        add(root, 'cylinder', 0xb4efed, Math.cos(a) * r * .8, y - .35, Math.sin(a) * r * .8,
          .045, .85, .045, 'fountain-water-stream', .17, .6);
      }
    }
    const drop = pivot('fountain-sparkling-crest', 0, 5, 0, { bob: .12, speed: .24 });
    add(drop, 'crystal', 0xc2fbf5, 0, 0, 0, .38, .68, .38, 'fountain-water-jewel', .35);
  } else if (kind === 'gilded-clocktower') {
    box(root, 0xc89d7c, 0, 5.7, 0, 4.5, 11.4, 3.8, 'clocktower-brick-shaft');
    for (const x of [-2.15, 2.15]) box(root, 0xf0d5a0, x, 5.6, 2, .3, 11.2, .3, 'gilded-clocktower-pilaster');
    add(root, 'roof', 0x9fbbad, 0, 12, 0, 3.4, 3.1, 3.4, 'copper-clocktower-spire').rotation.y = Math.PI / 4;
    const dial = pivot('rotating-gilded-clock-dial', 0, 8.6, 2.2, { axis: 'z', speed: .025 });
    cyl(dial, 0xf8e2ae, 0, 0, 0, 2.5, .25, 'giant-clock-face').rotation.x = Math.PI / 2;
    ring(dial, 0xd7ac53, 0, 0, .18, 2.5, 'clock-gilded-bezel', .12);
    for (let k = 0; k < 12; k++) {
      const a = k * TAU / 12, tick = box(dial, 0x9b713b, Math.sin(a) * 2.1, Math.cos(a) * 2.1, .23, .12, .3, .08, 'clock-hour-mark');
      tick.rotation.z = -a;
    }
    for (const [name, length, speed] of [['minute', 1.9, -.3], ['hour', 1.25, -.025]]) {
      const hand = pivot(`moving-clock-${name}-hand`, 0, 8.6, 2.58, { axis: 'z', speed });
      hand.rotation.z = name === 'hour' ? -Math.PI / 3 : 0;
      box(hand, 0x775333, 0, length * .43, 0, name === 'hour' ? .17 : .11, length, .09, `${name}-hand`);
    }
    puff(root, 0xe5ba5e, 0, 8.6, 2.7, .22, .22, .12, 'clock-hand-hub', .12);
  } else if (kind === 'gothic-bell-gable') {
    for (const x of [-2.5, 2.5]) box(root, 0xc7ad95, x, 3.5, 0, .65, 7, 1.4, 'gothic-bell-pier');
    arch(root, 0xd8c7ad, 0, 2.3, 0, 2.4, 2);
    roof(root, 0, 7.2, 0, 6.5, 2.9, 2.3, 0x9f7568);
    for (const x of [-2.5, 0, 2.5]) add(root, 'cone', 0xb49c7c, x, x ? 7.5 : 9.2, 0, .36, 1.7, .36, 'gothic-rooftop-finial');
    cyl(root, 0xd9b575, 0, 4.8, 0, .82, 1.25, 'gilded-rooftop-bell');
    ring(root, 0xeac785, 0, 4.2, 0, 1.05, 'bell-flared-lip').rotation.x = Math.PI / 2;
    puff(root, 0x966b42, 0, 4, 0, .18, .27, .18, 'bell-clapper');
  } else if (kind === 'emerald-sky-pagoda') {
    add(root, 'cone', 0x8baec1, 0, -1.8, 0, 3.6, 3.6, 3.6, 'floating-shrine-crag').rotation.x = Math.PI;
    cyl(root, 0x98c7a3, 0, .1, 0, 3.6, .4, 'emerald-island-garden');
    for (let tier = 0; tier < 3; tier++) {
      const y = tier * 2.5, size = 3.5 - tier * .65;
      for (const x of [-1, 1]) for (const z of [-1, 1]) cyl(root, 0xc7d9a9, x * size * .62, y + 1.2, z * size * .62,
        .14, 2.4, 'sky-shrine-column');
      const r = add(root, 'roof', [0x87bf9e, 0x98cbb3, 0xaddbc5][tier], 0, y + 2.5, 0,
        size * 1.35, 1.6, size * 1.35, 'tiered-emerald-pagoda-eave'); r.rotation.y = Math.PI / 4;
      for (const x of [-1, 1]) for (const z of [-1, 1]) puff(root, 0xe8d28d, x * size * .94, y + 2.65, z * size * .94,
        .15, .36, .15, 'upturned-golden-eave-tip', .13);
    }
    add(root, 'crystal', 0xd7f8c7, 0, 9, 0, .42, .9, .42, 'shrine-sky-jewel', .45);
  } else if (kind === 'pastel-cloud-ring') {
    const p = pivot('shimmering-cloud-jump-ring', 0, 5.5, 0, { axis: 'z', speed: .07, bob: .18 });
    ring(p, 0xc5e8ed, 0, 0, 0, 3.6, 'glowing-pastel-cloud-arch', .38);
    for (let k = 0; k < 10; k++) {
      const a = k * TAU / 10;
      puff(p, k % 2 ? 0xe6d5f5 : 0xfce9df, Math.cos(a) * 3.6, Math.sin(a) * 3.6, 0,
        .65, .48, .42, 'cloud-ring-scallop', .16);
    }
    for (const x of [-2.7, 2.7]) puff(root, 0xf4e6f5, x, .6, 0, 1.65, .65, 1, 'floating-cloud-ring-foot');
  } else if (kind === 'snowy-attic-gable') {
    box(root, 0x9a776b, 0, 2.8, 0, 5.2, 5.6, 3.2, 'cozy-timber-attic');
    roof(root, 0, 5.9, 0, 6.7, 2.6, 4.1, 0xa697b5, true);
    for (const x of [-2.4, 0, 2.4]) box(root, 0x745e56, x, 2.8, 1.65, .18, 5.6, .12, 'attic-timber-frame');
    add(root, 'box', 0xffd798, 0, 3.9, 1.75, 1.65, 1.8, .1, 'warm-glowing-attic-window', .55);
    for (const w of [true, false]) box(root, 0xe7c9a2, 0, 3.9, 1.83, w ? 1.8 : .12, w ? .12 : 1.9, .08, 'attic-window-mullion');
    box(root, 0xb29183, -1.55, 7.2, -.5, .8, 2.3, .85, 'snowy-attic-chimney');
    puff(root, 0xf0fbff, -1.55, 8.4, -.5, .6, .16, .65, 'chimney-snow-cap');
    for (let k = 0; k < 7; k++) add(root, 'cone', 0xc6edf4, (k - 3) * .8, 4.5, 2.05,
      .08, .3 + k % 3 * .15, .08, 'attic-eave-icicle', .09, .65).rotation.x = Math.PI;
  } else if (kind === 'turquoise-ice-arch') {
    arch(root, 0xa0ede5, 0, 0, 0, 2.7, 3.5, .32, .58);
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const ice = add(root, 'crystal', k % 2 ? 0xc6fcf2 : 0x7ed7e2, side * (2.8 + k * .38), 1.1 + k * .15, .1,
        .42, 1.6 + (2 - k) * .45, .45, 'translucent-turquoise-ice-shard', .25, .6);
      ice.rotation.z = -side * (.13 + k * .13);
    }
    for (let k = 0; k < 7; k++) {
      const a = k * Math.PI / 6;
      add(root, 'crystal', 0xd5fff5, Math.cos(a) * 2.7, 3.5 + Math.sin(a) * 3, 0,
        .24, .5, .28, 'ice-arch-faceted-crown', .32, .65).rotation.z = a - Math.PI / 2;
    }
  } else if (kind === 'pastel-aurora-ribbons') {
    for (let k = 0; k < 3; k++) {
      const positions = [], indices = [], columns = 32, width = 11;
      for (let j = 0; j <= columns; j++) for (const side of [-1, 1]) {
        const x = (j / columns - .5) * width;
        positions.push(x, Math.sin(j / columns * TAU + k) * .65 + side * .38, Math.sin(j / columns * Math.PI) * .5);
      }
      for (let j = 0; j < columns; j++) { const a = j * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geometry = new THREE.BufferGeometry(); owned.push(geometry);
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const p = pivot('undulating-aurora-ribbon', 0, 7.5 + k * .9, k * .6, { axis: 'z', wobble: .035,
        bob: .25, frequency: .7, ribbon: { geometry, positions: Float32Array.from(positions), amplitude: .25 } });
      const m = mark(new THREE.Mesh(geometry, material(toonMat, [0xa3ece0, 0xb9c7f4, 0xe1bbed][k], .42, .62)));
      // Each ribbon is a real two-sided strip, visible from either side of the course.
      m.material.side = THREE.DoubleSide; m.name = 'translucent-pastel-aurora-strip'; p.add(m);
    }
  } else if (kind === 'golden-sanctum-towers') {
    for (const side of [-1, 1]) {
      cyl(root, 0xe1bd78, side * 4.3, 5, 0, 1, 10, 'royal-golden-sanctum-tower');
      add(root, 'cone', 0xf5da95, side * 4.3, 11, 0, 1.5, 3, 1.5, 'golden-sanctum-spire', .15);
      add(root, 'crystal', 0xf7d7e8, side * 4.3, 13, 0, .4, .75, .4, 'sanctum-star-finial', .45);
    }
    for (const z of [-.65, .65]) arch(root, 0xf0d58a, 0, 0, z, 3.2, 5.1, .12);
    for (const side of [-1, 1]) box(root, 0xbb8bc6, side * 3.5, 6, .9, .65, 3.2, .1, 'royal-festival-banner');
    box(root, 0xd7ba84, 0, .15, 0, 10.8, .3, 3.4, 'sanctum-ceremonial-steps');
  } else if (kind === 'festival-sky-lanterns') {
    const p = pivot('floating-festival-lantern-cluster', 0, 7.5, 0, { speed: .09, bob: .35, frequency: .6 });
    for (let k = 0; k < 7; k++) {
      const a = k * 2.399, r = 1.3 + (k % 3) * .55, x = Math.cos(a) * r, z = Math.sin(a) * r, y = (k % 3) * 1.3;
      puff(p, [0xffd3a6, 0xf5bccc, 0xe6c9ee][k % 3], x, y, z, .5, .78, .5, 'glowing-festival-sky-lantern', .65);
      for (const yy of [y - .65, y + .65]) cyl(p, 0xd4b278, x, yy, z, .4, .09, 'lantern-bamboo-rim');
      box(p, 0xf1c77f, x, y - 1, z, .07, .6, .07, 'lantern-dangling-tassel');
    }
  } else if (kind === 'starlight-firework-rings') {
    for (let k = 0; k < 3; k++) {
      const p = pivot('celebratory-starlight-firework-ring', (k - 1) * 3.3, 7.2 + (k % 2) * 3.3, k * -.45,
        { axis: 'z', speed: (k % 2 ? -1 : 1) * .14, breath: .12, frequency: .9 });
      ring(p, [0xffd18f, 0xd4c1f4, 0xa5e6d5][k], 0, 0, 0, 1.8, 'glowing-firework-halo', .45);
      for (let j = 0; j < 12; j++) {
        const a = j * TAU / 12;
        const star = add(p, 'crystal', j % 2 ? 0xffedb8 : 0xf5c6eb, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0,
          .11, .33, .11, 'celebration-starlight-ray', .7); star.rotation.z = a - Math.PI / 2;
      }
    }
  } else if (kind === 'gothic-waterfall-arch') {
    arch(root, 0x9eb8a0, 0, 0, 0, 2.5, 3.3);
    for (const side of [-1, 1]) {
      cyl(root, 0x9a7956, side * 3, 2.8, -.3, .5, 5.6, 'ancient-oak-waterfall-branch');
      puff(root, 0x91bf80, side * 2.5, 6, 0, 1.6, .7, 1.1, 'waterfall-arch-moss-crown');
      add(root, 'box', 0xafe9e6, side * 2.4, 2.7, .5, .8, 5.3, .12, 'translucent-waterfall-curtain', .2, .5);
      const spray = pivot('waterfall-silver-spray', side * 2.4, .3, .5, { bob: .12, breath: .08 });
      puff(spray, 0xd8f7e9, 0, 0, 0, .9, .25, .6, 'soft-waterfall-mist', .16, .5);
    }
  } else if (kind === 'copper-pot-hood') {
    for (const x of [-2.8, 2.8]) box(root, 0x9a795e, x, 3.9, 0, .12, 7.8, .12, 'hanging-pot-rack-upright');
    box(root, 0xbe996b, 0, 7.8, 0, 6, .18, .22, 'copper-pot-hanging-rail');
    add(root, 'cone', 0xc9916e, 0, 8, -.8, 2.7, 2, 2.7, 'copper-kitchen-hood');
    cyl(root, 0xa9846b, 0, 9.5, -.8, .55, 2.4, 'kitchen-hood-flue');
    for (let k = -1; k <= 1; k++) {
      ring(root, 0xb69a6c, k * 1.7, 7.2, .25, .25, 'hanging-copper-pot-hook');
      cyl(root, 0xd8a47b, k * 1.7, 6.1, .25, .67, 1.25, 'hanging-copper-pot');
      ring(root, 0xf0bd8d, k * 1.7, 6.75, .25, .68, 'pot-rolled-copper-rim').rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) ring(root, 0xbb865f, k * 1.7 + side * .73, 6.4, .25, .22, 'copper-pot-handle');
    }
  } else if (kind === 'floating-planetary-rings') {
    const p = pivot('spinning-planetary-orrery', 0, 5.5, 0, { speed: .13, bob: .22 });
    puff(p, 0xc5b6ea, 0, 0, 0, 1.1, 1.1, 1.1, 'floating-pastel-planet', .24);
    for (let k = 0; k < 3; k++) {
      const r = ring(p, [0xffdc9b, 0xa9e1e3, 0xe7bddd][k], 0, 0, 0, 2.3 + k * .45, 'cosmic-planetary-ring', .28);
      r.rotation.set(Math.PI / 3 + k * .42, k * .6, k * .3);
    }
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5;
      add(p, 'crystal', 0xffecb8, Math.cos(a) * 3.2, Math.sin(a) * 1.1, Math.sin(a) * 3.2,
        .12, .25, .12, 'planetary-orbit-star', .4);
    }
  }

  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root), v = new THREE.Vector3(), inverse = new THREE.Matrix4();
  let radius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
    Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
  // A sphere around each pivot covers its entire rotation, breathing and ribbon
  // wave, including poses that are much wider than the initial silhouette.
  for (const entry of animations) {
    inverse.copy(entry.mesh.matrixWorld).invert();
    let sweep = 0;
    entry.mesh.traverse(node => {
      if (!node.isMesh) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld), positions = node.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) sweep = Math.max(sweep, v.fromBufferAttribute(positions, i).applyMatrix4(matrix).length());
    });
    sweep = (sweep + (entry.ribbon?.amplitude || 0)) * (1 + entry.breath);
    radius = Math.max(radius, Math.hypot(entry.mesh.position.x, entry.mesh.position.z) + sweep);
    entry.baseY = entry.mesh.position.y; entry.baseRotation = entry.mesh.rotation.toArray().slice(0, 3);
    entry.sweepRadius = sweep;
  }
  return { root, animations, radius: radius + .75, owned };
}

// Rigid parts become a handful of per-material meshes per building or moving
// pivot. Deforming aurora strips retain their own geometry. Primitive caches
// are never mutated or disposed.
function batchStaticParts(THREE, root) {
  const scopes = [], names = new Set();
  root.updateMatrixWorld(true);
  let before = 0, after = 0;
  root.traverse(node => {
    if (node.userData.v42Animated && !node.userData.v42Deforming) scopes.push(node);
    if (node.isMesh) { names.add(node.name); before++; }
  });
  for (const scope of [...scopes, root]) {
    const inverse = new THREE.Matrix4().copy(scope.matrixWorld).invert(), buckets = new Map(), originals = [];
    scope.traverse(node => {
      if (!node.isMesh) return;
      for (let p = node.parent; p && p !== scope; p = p.parent) if (p.userData.v42Animated) return;
      const part = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld));
      if (!buckets.has(node.material)) buckets.set(node.material, []);
      buckets.get(node.material).push(part); originals.push(node);
    });
    for (const node of originals) node.removeFromParent();
    for (const [mat, parts] of buckets) {
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const batch = mark(new THREE.Mesh(geometry, mat));
      batch.name = `${scope.name}-cel-batch`; batch.castShadow = !mat.transparent; batch.receiveShadow = true;
      scope.add(batch);
    }
  }
  root.traverse(node => { if (node.isMesh) after++; });
  Object.assign(root.userData, { partNames: [...names], drawCallsBefore: before, drawCallsAfter: after });
}

/** Return an attached landmark group. `isClear` follows v3's world-space
 * polygon API: isClear([{x,z}, ...], {route, side, cluster, kind, ...}). Both
 * internal floor clearance and the optional callback must accept a placement.
 * The returned group's receipts include full animation envelopes. Unknown IDs
 * and empty courses yield an empty group; rejected props never animate.
 * `dynamic.v42Landmarks` is the group; `dynamic.v42LandmarkAnimations` is owned
 * by this module, separate from v3's existing landmarkSpinners. */
export function populateStageV42Landmarks(THREE, track, parent, dynamic, toonMat, { isClear } = {}) {
  if (typeof toonMat !== 'function') throw new TypeError('toonMat must be a material factory');
  const group = mark(new THREE.Group()); group.name = 'stage-v42-landmarks';
  Object.assign(group.userData, { stageId: track.id, placements: [], rejectedCount: 0, spacing: track.flagship ? 64 : 38 });
  parent.add(group); dynamic.v42Landmarks = group; dynamic.v42LandmarkAnimations = [];
  const kinds = STAGE_KINDS[track.id];
  if (!kinds) return group;
  const clear = floorClearance(track), placements = group.userData.placements;
  let serial = 0;
  for (const route of [...(track.routes || []), ...(track.chutes || [])]) {
    if (!route.points?.length) continue;
    const length = polylineLength(route.points), count = Math.max(1, Math.ceil(length / group.userData.spacing));
    const act = (track.acts || []).find(a => a.routeIds?.includes(route.id) || a.pathIds?.includes(route.id));
    // Cell centers cover the opening and the last sprint as well as every long
    // middle section. No hard-coded coordinates can strand the extended finale.
    for (let i = 0; i < count; i++) {
      const alongRoute = length * (i + .5) / count, p = samplePath(route.points, alongRoute);
      const flat = Math.hypot(p.tx, p.tz) || 1, nx = -p.tz / flat, nz = p.tx / flat;
      const seed = serial++, kind = kinds[seed % kinds.length], built = buildLandmark(THREE, kind, toonMat, seed);
      let placed = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        const side = (seed % 2 ? -1 : 1) * (attempt % 2 ? -1 : 1);
        const offset = (route.width || 4) / 2 + built.radius + 2 + Math.floor(attempt / 2) * 3.5;
        const x = p.x + nx * offset * side, z = p.z + nz * offset * side, r = built.radius;
        const footprint = [{ x: x - r, z: z - r }, { x: x + r, z: z - r }, { x: x + r, z: z + r }, { x: x - r, z: z + r }];
        const meta = { stageId: track.id, kind, route, routeId: route.id, actId: act?.id ?? null,
          role: act?.role ?? null, side, alongRoute, radius: r, footprint, mesh: built.root, cluster: built.root };
        built.root.position.set(x, p.y - .3, z);
        built.root.rotation.y = Math.atan2(-nx * side, -nz * side);
        const nearby = placements.some(other => Math.hypot(x - other.mesh.position.x, z - other.mesh.position.z) < (r + other.radius) * .85);
        if (nearby || !clear(footprint) || isClear && !isClear(footprint, meta)) { group.userData.rejectedCount++; continue; }
        Object.assign(built.root.userData, { kind, stageId: track.id, routeId: route.id, actId: meta.actId,
          side, alongRoute, radius: r, footprint, animationCount: built.animations.length });
        batchStaticParts(THREE, built.root); group.add(built.root); placements.push(meta);
        dynamic.v42LandmarkAnimations.push(...built.animations); placed = true; break;
      }
      if (!placed) for (const geometry of built.owned) geometry.dispose();
    }
  }
  group.userData.landmarkCount = placements.length;
  return group;
}

/** Absolute elapsed time keeps motion deterministic at 25/60/120Hz and avoids
 * drift after pausing. dt is accepted to match animateFairytaleScenery. */
export function animateStageV42Landmarks(dynamic, elapsed, dt) {
  const time = Number.isFinite(elapsed) ? elapsed : 0;
  for (const entry of dynamic?.v42LandmarkAnimations || []) {
    const { mesh, baseRotation, phase, frequency, axis } = entry;
    mesh.rotation.set(...baseRotation);
    mesh.rotation[axis] += ((time * entry.speed) % TAU) + Math.sin(time * frequency + phase) * (entry.wobble || 0);
    mesh.position.y = entry.baseY + Math.sin(time * frequency + phase) * entry.bob;
    mesh.scale.setScalar(1 + Math.sin(time * frequency + phase) * entry.breath);
    if (entry.ribbon) {
      const { geometry, positions, amplitude } = entry.ribbon, attr = geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) attr.setY(i, positions[i * 3 + 1] + Math.sin(time * 1.1 + positions[i * 3] * .65 + phase) * amplitude);
      attr.needsUpdate = true; geometry.computeVertexNormals();
      // Camera broad-phase bounds must follow the visible, deformed strip.
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
  }
}
