import * as THREE from "three";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const TRACK_SAMPLES = 640;
const TRACK_HALF_W = 7.8; // 15.6m wide 3-lane AAA arcade highway!
const TOTAL_LAPS = 3;
const DISPLAY_KMH_SCALE = 6.85;

// 3 Selectable Grand Prix Track Maps — each with its own Biome, Track Surface Material, & Roadside 3D Architecture!
export const RACE_MAPS = [
  {
    id: "starport",
    biomeIdx: 0, // Mare Basalt + Starport Cyber-Metropolis Streetscape
    code: "CIRCUIT 01 // STARPORT METROPOLIS",
    name: "星港霓虹都市",
    nameEn: "Lunar Starport Metropolis",
    diff: "★☆☆ 都市街景",
    diffEn: "★☆☆ CYBER STREET",
    desc: "穿梭于低空高楼基地群、全息广告塔与跨线立体隧道，柏油标线三车道高速追逐",
    descEn: "Low-altitude cyber-metropolis street lined with habitat towers, neon billboards & tunnels",
    swatch: "#74ffd8",
    openZones: [[0.82, 0.88]],
    antiGravRange: null,
  },
  {
    id: "gauntlet",
    biomeIdx: 1, // Rust-Red Volcanic Canyon + Jagged Rock Spires, Giant Crystals & Industrial Steel Grate
    code: "CIRCUIT 02 // RED CANYON QUARRY",
    name: "赤峡熔岩矿区",
    nameEn: "Crimson Canyon Quarry",
    diff: "★★☆ 峡谷越障",
    diffEn: "★★☆ CANYON GAUNTLET",
    desc: "锈红火山裂谷地貌，两侧耸立巨型赤岩尖峰与紫晶簇，密集部署分流矿架与激光路障",
    descEn: "Volcanic rust-red canyon flanked by jagged rock spires, giant crystal clusters & laser barriers",
    swatch: "#ffb35c",
    openZones: [[0.14, 0.20], [0.78, 0.84]],
    antiGravRange: [0.50, 0.72],
  },
  {
    id: "antigrav",
    biomeIdx: 2, // Cryo-Blue Eternal Night Basin + Colossal Rotating Orbital Gyro-Rings & Glass Skyway
    code: "CIRCUIT 03 // ORBITAL RINGWORLD",
    name: "天穹反重力星环",
    nameEn: "Orbital Gyro-Ring Skyway",
    diff: "★★★ 倒立星环",
    diffEn: "★★★ 180° RINGWORLD",
    desc: "永夜冰晶盆地上空，穿过 12 座巨型旋转星环与 260米 180° 反重力全息玻璃天穹",
    descEn: "Soar through 12 colossal rotating orbital gyro-rings & a 260m 180° inverted glass skyway",
    swatch: "#d97bff",
    openZones: [[0.12, 0.18], [0.83, 0.90]],
    antiGravRange: [0.44, 0.76],
  },
];

function smoothstep(x, a, b) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Parametric 3D spline generator per Map ID with rich elevation hills & valleys for uphill/downhill gravity physics!
function rawTrackPoint(u, mapId = "starport", out = new THREE.Vector3()) {
  const a = u * TAU;
  if (mapId === "starport") {
    // Low-altitude city street circuit (y in 10..28m) with undulating highway overpasses & underpasses
    const x = 94 * Math.sin(a) + 18 * Math.sin(2 * a);
    const z = 76 * Math.cos(a) - 14 * Math.cos(2 * a) + 8 * Math.sin(3 * a);
    const y = 18 + 8.5 * Math.sin(a - 0.4) + 5.5 * Math.cos(2 * a) + 3.2 * Math.sin(4 * a);
    return out.set(x, y, z);
  }
  if (mapId === "gauntlet") {
    // Steep canyon roller-coaster undulations (y in 16..46m) for strong uphill climbs & downhill rushes
    const x = 98 * Math.sin(a) + 22 * Math.sin(2 * a) - 14 * Math.cos(3 * a);
    const z = 78 * Math.cos(a) - 18 * Math.cos(2 * a) + 12 * Math.sin(3 * a);
    const y = 28 + 13.5 * Math.sin(a - 0.5) + 8.2 * Math.sin(3 * a + 0.3) + 4.0 * Math.cos(4 * a);
    return out.set(x, y, z);
  }
  // "antigrav": High-altitude orbital circuit (y in 24..64m)
  const x = 104 * Math.sin(a) + 24 * Math.sin(2 * a) - 12 * Math.cos(3 * a);
  const z = 82 * Math.cos(a) - 20 * Math.cos(2 * a) + 11 * Math.sin(3 * a);
  const y = 40 + 16 * Math.sin(a - 0.52) + 9.5 * Math.sin(2 * a + 0.35) + 5.2 * Math.cos(3 * a);
  return out.set(x, y, z);
}

function isOpenEdgeForMap(u, mapDef) {
  const m = ((u % 1) + 1) % 1;
  return (mapDef.openZones || []).some(([a, b]) => m >= a && m <= b);
}

function buildTrackTable(mapDef = RACE_MAPS[0]) {
  const worldUp = new THREE.Vector3(0, 1, 0);
  const pts = [];
  const cumLen = [0];
  let totalLen = 0;

  for (let i = 0; i < TRACK_SAMPLES; i++) {
    pts.push(rawTrackPoint(i / TRACK_SAMPLES, mapDef.id));
  }
  for (let i = 1; i <= TRACK_SAMPLES; i++) {
    const prev = pts[(i - 1) % TRACK_SAMPLES];
    const curr = pts[i % TRACK_SAMPLES];
    totalLen += prev.distanceTo(curr);
    cumLen.push(totalLen);
  }

  const frames = [];
  const pPrev = new THREE.Vector3();
  const pNext = new THREE.Vector3();
  const tPrev = new THREE.Vector3();
  const tNext = new THREE.Vector3();
  const ag = mapDef.antiGravRange;

  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const u = i / TRACK_SAMPLES;
    const p = pts[i];
    pPrev.copy(pts[(i - 1 + TRACK_SAMPLES) % TRACK_SAMPLES]);
    pNext.copy(pts[(i + 1) % TRACK_SAMPLES]);
    const segDs = Math.max(0.1, pNext.distanceTo(pPrev) * 0.5);
    const T = pNext.clone().sub(pPrev).normalize();

    tPrev.subVectors(p, pPrev).normalize();
    tNext.subVectors(pNext, p).normalize();
    const right0 = new THREE.Vector3().crossVectors(T, worldUp).normalize();
    const up0 = new THREE.Vector3().crossVectors(right0, T).normalize();
    const turnDelta = tNext.clone().sub(tPrev).dot(right0);
    const curv = turnDelta / segDs;
    const bank = THREE.MathUtils.clamp(turnDelta * 6.2, -0.45, 0.45);

    let antiGravRoll = 0;
    let invWeight = 0;
    let inverted = false;
    if (ag) {
      const [agStart, agEnd] = ag;
      const invIn = smoothstep(u, agStart, agStart + 0.08);
      const invOut = 1 - smoothstep(u, agEnd - 0.08, agEnd);
      invWeight = invIn * invOut;
      antiGravRoll = -Math.PI * invWeight;
      inverted = u >= agStart + 0.03 && u <= agEnd - 0.03;
    }
    const roll = bank * (1 - invWeight) + antiGravRoll;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const R = right0.clone().multiplyScalar(cr).addScaledVector(up0, sr).normalize();
    const U = up0.clone().multiplyScalar(cr).addScaledVector(right0, -sr).normalize();
    frames.push({ u, s: cumLen[i], p, T, R, U, curv, inverted });
  }

  function sampleAtDist(dist, out) {
    const wrapped = ((dist % totalLen) + totalLen) % totalLen;
    let lo = 0;
    let hi = TRACK_SAMPLES;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumLen[mid] <= wrapped) lo = mid;
      else hi = mid;
    }
    const segLen = Math.max(1e-5, cumLen[lo + 1] - cumLen[lo]);
    const f = (wrapped - cumLen[lo]) / segLen;
    const a = frames[lo];
    const b = frames[(lo + 1) % TRACK_SAMPLES];
    out.u = wrapped / totalLen;
    out.p.lerpVectors(a.p, b.p, f);
    out.T.lerpVectors(a.T, b.T, f).normalize();
    out.R.lerpVectors(a.R, b.R, f).normalize();
    out.U.crossVectors(out.R, out.T).normalize();
    out.R.crossVectors(out.T, out.U).normalize();
    out.curv = THREE.MathUtils.lerp(a.curv, b.curv, f);
    out.inverted = a.inverted || b.inverted;
    return out;
  }

  return { mapDef, frames, totalLen, sampleAtDist };
}

function buildRibbonGeometry(frames, halfW, offsetU = 0, edgeOnly = false, sideSign = 1, mapDef = RACE_MAPS[0]) {
  const N = frames.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  if (!edgeOnly) {
    for (let i = 0; i <= N; i++) {
      const fr = frames[i % N];
      const vCoord = (i / N) * 84;
      const left = fr.p.clone().addScaledVector(fr.R, -halfW).addScaledVector(fr.U, offsetU);
      const right = fr.p.clone().addScaledVector(fr.R, halfW).addScaledVector(fr.U, offsetU);
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      uvs.push(0, vCoord, 1, vCoord);
      if (i < N) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
  } else {
    let vIdx = 0;
    for (let i = 0; i < N; i++) {
      const fr0 = frames[i];
      const fr1 = frames[(i + 1) % N];
      if (isOpenEdgeForMap(fr0.u, mapDef)) continue;
      const b0 = fr0.p.clone().addScaledVector(fr0.R, sideSign * halfW).addScaledVector(fr0.U, 0.04);
      const t0 = b0.clone().addScaledVector(fr0.U, 1.15);
      const b1 = fr1.p.clone().addScaledVector(fr1.R, sideSign * halfW).addScaledVector(fr1.U, 0.04);
      const t1 = b1.clone().addScaledVector(fr1.U, 1.15);
      positions.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, b1.x, b1.y, b1.z, t1.x, t1.y, t1.z);
      uvs.push(0, 0, 0, 1, 1, 0, 1, 1);
      indices.push(vIdx, vIdx + 2, vIdx + 1, vIdx + 1, vIdx + 2, vIdx + 3);
      vIdx += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createStuntRampMesh(type = "flat") {
  const g = new THREE.Group();
  const isBarrel = type === "barrel";
  const w = isBarrel ? 4.4 : 5.2;
  const len = 9.0;
  const h = isBarrel ? 2.15 : 1.80;
  const geo = new THREE.BufferGeometry();
  const hl = len * 0.5, hw = w * 0.5;
  const hLeft = isBarrel ? 0.35 : h;
  const hRight = h;
  const verts = new Float32Array([
    -hw, 0.05,  hl,   hw, 0.05,  hl,
    -hw, hLeft, -hl,  hw, hRight, -hl,
    -hw, 0.05, -hl,   hw, 0.05, -hl,
  ]);
  const idx = [
    0, 1, 2, 1, 3, 2,
    2, 3, 4, 3, 5, 4,
    0, 2, 4, 1, 5, 3,
  ];
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const col = isBarrel ? 0xe066ff : 0xffbe44;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x162234, emissive: col, emissiveIntensity: 0.95, roughness: 0.25, metalness: 0.5, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(col).multiplyScalar(2.6), toneMapped: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.14, 0.35), edgeMat);
  lip.position.set(0, (hLeft + hRight) * 0.5, -hl);
  if (isBarrel) lip.rotation.z = Math.atan2(hRight - hLeft, w);
  g.add(mesh, lip);
  return { group: g, w, len, h };
}

// --- MAP 1 ("starport") BESPOKE ROADSIDE SCENERY: Cyber-Metropolis Buildings, Neon Billboards, Streetlights & Tunnel Portals! ---
function createStarportCityBlock(variant = 0) {
  const g = new THREE.Group();
  const bldgMat = new THREE.MeshStandardMaterial({ color: 0x1c2633, metalness: 0.55, roughness: 0.38 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x354354, metalness: 0.7, roughness: 0.28 });
  const winCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.6, 2.7, 2.5), toneMapped: false });
  const winGold = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.9, 1.9, 0.5), toneMapped: false });
  const winPink = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.8, 0.6, 2.2), toneMapped: false });

  for (const side of [-1, 1]) {
    const xBase = side * (TRACK_HALF_W + 2.4);
    const h1 = 6.5 + ((variant * 3 + (side > 0 ? 2 : 0)) % 5) * 2.2;
    const w1 = 3.2, d1 = 4.6;
    // Main modular high-rise habitat tower beside the street curb!
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w1, h1, d1), bldgMat);
    tower.position.set(xBase + side * (w1 * 0.5), h1 * 0.5 - 1.2, 0);
    g.add(tower);

    // Glowing vertical window strips & cyber neon billboard on building facade facing the street!
    const facadeX = xBase + side * 0.04;
    const winMat = (variant + (side > 0 ? 1 : 0)) % 3 === 0 ? winPink : variant % 2 === 0 ? winCyan : winGold;
    for (const wz of [-1.2, 0, 1.2]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, h1 * 0.72, 0.36), winMat);
      strip.position.set(facadeX, h1 * 0.44 - 0.8, wz);
      g.add(strip);
    }
    // Cantilevered Streetlight & Holographic Traffic Sign over the sidewalk
    const poleX = side * (TRACK_HALF_W - 0.2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 4.8, 8), steelMat);
    pole.position.set(poleX, 2.4, 2.0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.16), steelMat);
    arm.position.set(poleX - side * 0.85, 4.7, 2.0);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 0.24), winCyan);
    lamp.position.set(poleX - side * 0.95, 4.62, 2.0);
    g.add(pole, arm, lamp);
  }

  // Every 3rd city block forms an enclosed Spaceport Tunnel Portal / Overhead Highway Sign Bridge!
  if (variant % 3 === 1) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry((TRACK_HALF_W + 2.6) * 2, 1.1, 4.8), steelMat);
    roof.position.set(0, 5.8, 0);
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(TRACK_HALF_W * 1.5, 0.85, 0.18), bldgMat);
    signBoard.position.set(0, 4.85, 2.35);
    const neonTrim = new THREE.Mesh(new THREE.BoxGeometry(TRACK_HALF_W * 1.4, 0.16, 0.24), winGold);
    neonTrim.position.set(0, 4.55, 2.38);
    g.add(roof, signBoard, neonTrim);
  }
  return g;
}

// --- MAP 2 ("gauntlet") BESPOKE ROADSIDE SCENERY: Towering Red-Canyon Rock Cliffs, Giant Glowing Crystal Megaliths & Quarry Archways! ---
function createCanyonRockCluster(variant = 0) {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e3b28, roughness: 0.88, metalness: 0.08, flatShading: true });
  const darkRockMat = new THREE.MeshStandardMaterial({ color: 0x3d2218, roughness: 0.92, metalness: 0.05, flatShading: true });
  const crystalAmber = new THREE.MeshStandardMaterial({
    color: 0xffaa33, emissive: 0xff6611, emissiveIntensity: 2.2, roughness: 0.18, metalness: 0.1, flatShading: true,
  });
  const crystalViolet = new THREE.MeshStandardMaterial({
    color: 0xd966ff, emissive: 0x9922ff, emissiveIntensity: 2.2, roughness: 0.18, metalness: 0.1, flatShading: true,
  });

  for (const side of [-1, 1]) {
    const xBase = side * (TRACK_HALF_W + 1.8);
    const spireH = 7.5 + ((variant * 5 + (side > 0 ? 3 : 1)) % 6) * 2.4;
    // Jagged Volcanic Canyon Cliff Spire jutting up beside the track
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.6, spireH, 6), variant % 2 === 0 ? rockMat : darkRockMat);
    spire.position.set(xBase + side * 1.4, spireH * 0.42 - 1.6, 0);
    spire.rotation.z = -side * 0.18;
    spire.rotation.y = variant * 1.1;
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 0), rockMat);
    boulder.position.set(xBase + side * 0.6, 0.8, 1.8);
    g.add(spire, boulder);

    // Giant Glowing Crystal Megalith Cluster bursting out of the canyon wall toward the track!
    const cMat = (variant + (side > 0 ? 1 : 0)) % 2 === 0 ? crystalAmber : crystalViolet;
    for (let k = 0; k < 3; k++) {
      const ch = 2.8 + k * 1.15;
      const shard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.42, ch, 6), cMat);
      shard.position.set(xBase - side * 0.25, 0.9 + k * 0.4, -1.2 + k * 0.85);
      shard.rotation.z = -side * (0.38 + k * 0.12);
      shard.rotation.x = (k - 1) * 0.22;
      g.add(shard);
    }
  }

  // Heavy Volcanic Quarry Laser-Pipe Archway spanning the canyon every 4th cluster!
  if (variant % 4 === 0) {
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(TRACK_HALF_W + 1.5, 0.45, 7, 18, Math.PI), darkRockMat);
    pipe.position.set(0, 0.2, 0);
    const core = new THREE.Mesh(new THREE.TorusGeometry(TRACK_HALF_W + 1.0, 0.14, 6, 18, Math.PI), crystalAmber);
    core.position.set(0, 0.2, 0);
    g.add(pipe, core);
  }
  return g;
}

// --- MAP 3 ("antigrav") BESPOKE ROADSIDE SCENERY: Colossal 20m Rotating Orbital Gyro-Rings & Floating Star-Buoys! ---
function createAntigravGyroRing(variant = 0) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x1d263b, metalness: 0.78, roughness: 0.22 });
  const neonViolet = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.4, 0.65, 3.4), toneMapped: false });
  const neonCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.55, 2.9, 2.9), toneMapped: false });

  // Complete 360-degree Colossal Rotating Gyro-Ring encircling the entire ribbon (top AND bottom)!
  const spinner = new THREE.Group();
  const radius = TRACK_HALF_W + 3.2;
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.28, 10, 36), ringMat);
  const innerGlow = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.32, 0.11, 8, 36), variant % 2 === 0 ? neonViolet : neonCyan);
  spinner.add(outerRing, innerGlow);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.4, 0.65), k % 2 === 0 ? neonCyan : neonViolet);
    fin.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    fin.rotation.z = a;
    spinner.add(fin);
  }
  g.add(spinner);

  // Floating Diamond Energy Buoys flanking the track
  for (const side of [-1, 1]) {
    const buoy = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), side > 0 ? neonCyan : neonViolet);
    buoy.position.set(side * (TRACK_HALF_W + 1.4), 2.4, 2.5);
    g.add(buoy);
  }
  g.userData.spinner = spinner;
  g.userData.spinSpeed = (variant % 2 === 0 ? 1 : -1) * (0.65 + (variant % 3) * 0.25);
  return g;
}

// Track Obstacle Barrier: either a Central Split-Lane Bridge Pillar ("pillar") or Half-Lane Laser Chicane ("laser")
function createObstacleMesh(kind = "laser") {
  const g = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2b323c, metalness: 0.6, roughness: 0.35 });
  const laserMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(3.4, 0.45, 0.65), toneMapped: false, transparent: true, opacity: 0.88,
  });
  const warnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3.0, 1.9, 0.35), toneMapped: false });

  if (kind === "pillar") {
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.5, 3.2), metalMat);
    col.position.set(0, 2.25, 0);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.55, 3.36), warnMat);
    bumper.position.set(0, 0.45, 0);
    g.add(col, bumper);
    return { group: g, halfW: 1.05, kind };
  }
  const w = 3.8;
  for (const sx of [-w * 0.5, w * 0.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.45, 8), metalMat);
    post.position.set(sx, 0.72, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), warnMat);
    cap.position.set(sx, 1.5, 0);
    g.add(post, cap);
  }
  for (const py of [0.48, 0.88, 1.26]) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, w, 8), laserMat);
    beam.rotation.z = HALF_PI;
    beam.position.set(0, py, 0);
    g.add(beam);
  }
  return { group: g, halfW: w * 0.52, kind };
}

function injectRaceStyles() {
  if (document.getElementById("lunar-race-style")) return;
  const style = document.createElement("style");
  style.id = "lunar-race-style";
  style.textContent = `
    #race-hud {
      position: fixed; inset: 0; z-index: 68; pointer-events: none;
      font-family: "IBM Plex Mono", "PingFang SC", system-ui, monospace;
      color: #f3f8fa;
    }
    #race-hud[hidden] { display: none !important; }
    .race-top-left {
      position: absolute; top: max(18px, calc(env(safe-area-inset-top) + 10px)); left: clamp(16px, 3vw, 40px);
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    .race-pos-badge {
      padding: 8px 16px;
      border: 1px solid #ffd275aa;
      border-left: 3px solid #ffd275;
      clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
      background: linear-gradient(140deg, #1b172ae0, #0a101ee6);
      box-shadow: 0 10px 30px #000a;
      display: flex; align-items: baseline; gap: 4px;
    }
    .race-pos-num { font-size: 34px; font-weight: 800; line-height: 1; color: #ffe199; text-shadow: 0 0 18px #ffae33aa; }
    .race-pos-sub { font-size: 13px; color: #9db7c4; }
    .race-lap-pill {
      padding: 7px 13px;
      border: 1px solid #74ffd866;
      background: #08121ed8;
      clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
      display: grid; gap: 2px;
    }
    .race-lap-pill span:first-child { font-size: 10px; color: #74ffd8; letter-spacing: .16em; }
    .race-lap-pill strong { font-size: 16px; color: #ffffff; }
    .race-map-switch-btn {
      pointer-events: auto;
      padding: 6px 11px; min-height: 34px;
      border: 1px solid #c57cff77; background: #160e28d8; color: #ebd2ff;
      font: 600 11px/1 inherit; cursor: pointer;
    }
    .race-map-switch-btn:hover { border-color: #ebb5ff; color: #fff; }
    .race-top-right {
      position: absolute; top: max(18px, calc(env(safe-area-inset-top) + 10px)); right: clamp(16px, 3vw, 40px);
      display: grid; justify-items: end; gap: 8px;
    }
    .race-minimap {
      width: 124px; height: 124px;
      border: 1px solid #74ffd844;
      background: radial-gradient(circle, #101c2dcc, #060b14e8);
      border-radius: 50%;
      box-shadow: 0 8px 24px #000a;
    }
    .race-quit-btn {
      pointer-events: auto;
      padding: 5px 11px; min-height: 32px;
      border: 1px solid #96b8c444; background: #0b1422d8; color: #d6e6ec;
      font: 600 11px/1 inherit; cursor: pointer;
    }
    .race-quit-btn:hover { border-color: #74ffd8; color: #fff; }
    .race-center-banner {
      position: absolute; top: 21%; left: 50%; transform: translateX(-50%);
      text-align: center;
      font-size: clamp(32px, 5.2vw, 64px); font-weight: 900; letter-spacing: .12em;
      color: #fff6df;
      text-shadow: 0 0 32px #a46bffcc, 0 0 14px #74ffd8cc, 0 4px 18px #000e;
      transition: opacity .15s ease, transform .15s ease;
    }
    .race-status-toast {
      position: absolute; top: 13%; left: 50%; transform: translateX(-50%);
      padding: 6px 16px;
      border: 1px solid #c57cffaa; background: #190d2ceb; color: #f5d8ff;
      font-size: 13px; font-weight: 800; letter-spacing: .1em;
      box-shadow: 0 0 26px #a855f766;
      opacity: 0; transition: opacity .16s ease, transform .16s ease;
      transform: translateX(-50%) scale(0.94);
    }
    .race-status-toast[data-show="true"] { opacity: 1; transform: translateX(-50%) scale(1); }
    .race-live-badge {
      position: absolute; top: 32%; left: 50%; transform: translateX(-50%);
      padding: 4px 12px;
      border: 1px solid #ffd27599; background: #261809d8; color: #ffe08a;
      font-size: 13px; font-weight: 800; letter-spacing: .12em;
      text-shadow: 0 0 14px #ffae33aa;
      opacity: 0; transition: opacity .12s ease;
    }
    .race-live-badge[data-show="true"] { opacity: 1; }
    .race-rival-alert {
      position: absolute; bottom: max(122px, calc(env(safe-area-inset-bottom) + 114px)); left: 50%; transform: translateX(-50%);
      padding: 4px 13px;
      border: 1px solid #ff6b8b99; background: #2a0d16dc; color: #ffc2ce;
      font-size: 11.5px; font-weight: 700; letter-spacing: .1em;
      opacity: 0; transition: opacity .14s ease;
    }
    .race-rival-alert[data-show="true"] { opacity: 1; }
    #race-kd-cinematic {
      position: fixed; inset: 0; z-index: 67; pointer-events: none;
      opacity: 0; transition: opacity .14s ease;
    }
    #race-kd-cinematic[data-active="true"] { opacity: 1; }
    #race-kd-cinematic[data-active="true"] ~ #race-hud :is(#race-status-toast, #race-live-badge, #race-rival-alert) {
      opacity: 0 !important;
    }
    .race-kd-bar-top, .race-kd-bar-bot {
      position: absolute; left: 0; right: 0; height: 50px;
      background: linear-gradient(90deg, #05070ef5, #180826f2, #05070ef5);
    }
    .race-kd-bar-top { top: 0; border-bottom: 1.5px solid #e879f988; }
    .race-kd-bar-bot { bottom: 0; border-top: 1.5px solid #ffd27588; }
    .race-kd-stamp {
      position: absolute; top: 62px; left: 50%; transform: translateX(-50%) skewX(-8deg);
      padding: 7px 22px;
      border: 1.5px solid #ffd275;
      background: linear-gradient(125deg, #4c0d38f2, #1f0a3af2);
      box-shadow: 0 0 36px #e879f9aa, inset 0 0 16px #ffd27544;
      text-align: center;
      white-space: nowrap;
    }
    .race-kd-stamp strong {
      display: block; font-size: clamp(18px, 2.4vw, 26px); font-weight: 900; letter-spacing: .14em;
      color: #ffe48f; text-shadow: 0 0 16px #ff9900, 2px 2px 0 #b91c1c;
      white-space: nowrap;
    }
    .race-kd-stamp span { font-size: 11.5px; color: #f5d0fe; letter-spacing: .10em; white-space: nowrap; }
    .race-bottom-dash {
      position: absolute; bottom: max(18px, calc(env(safe-area-inset-bottom) + 12px)); right: clamp(16px, 3vw, 40px);
      width: min(392px, 90vw);
      padding: 10px 16px 12px;
      border: 1px solid #8adbd844;
      clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%, 0 12px);
      background: linear-gradient(180deg, #0b1424dc, #060b14eb);
      box-shadow: 0 14px 36px #000b;
      display: grid; gap: 6px;
    }
    .race-dash-head { display: flex; justify-content: space-between; align-items: baseline; }
    .race-speed-box { display: flex; align-items: baseline; gap: 6px; }
    .race-speed-val { font-size: 33px; font-weight: 800; line-height: 1; color: #ffffff; font-variant-numeric: tabular-nums; }
    .race-speed-unit { font-size: 11px; color: #8cb2bf; }
    .race-gear-pill {
      padding: 2px 6px; border: 1px solid #74ffd855; background: #0e2430;
      font-size: 10px; font-weight: 700; color: #74ffd8;
    }
    .race-slope-tag {
      font-size: 10px; font-weight: 700; color: #ffd275; letter-spacing: .04em; white-space: nowrap;
    }
    .race-nitro-state {
      font-size: 11px; font-weight: 700; letter-spacing: .06em; color: #74ffd8; white-space: nowrap;
    }
    .race-nitro-state[data-ready="shock"] {
      color: #f3b5ff;
      text-shadow: 0 0 14px #d946ef;
      animation: racePulse .42s infinite alternate;
    }
    .race-nitro-state[data-active="shock"] {
      color: #ffe28a;
      text-shadow: 0 0 18px #d946ef, 0 0 10px #ffd275;
    }
    .race-nitro-state[data-active="nitro"] {
      color: #74ffd8;
      text-shadow: 0 0 14px #38e8d8;
    }
    @keyframes racePulse { from { opacity: .68; transform: scale(1); } to { opacity: 1; transform: scale(1.04); } }
    @keyframes raceShockPromptPulse {
      0%, 100% {
        transform: translateX(-50%) scale(1);
        box-shadow: 0 0 18px #d946ef88, 0 0 32px #ffd77844, inset 0 0 12px #ffd77833;
        border-color: #f0abfc;
      }
      50% {
        transform: translateX(-50%) scale(1.07);
        box-shadow: 0 0 34px #e879f9ee, 0 0 54px #ffd778aa, inset 0 0 22px #ffe48f77;
        border-color: #ffe89e;
      }
    }
    @keyframes raceBarSweep {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }
    .race-shock-prompt {
      position: absolute;
      bottom: max(136px, calc(env(safe-area-inset-bottom) + 128px));
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 18px;
      border: 1.5px solid #f0abfc;
      clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
      background: linear-gradient(110deg, #4a0e5ce8, #7e22cee8, #a16207e8);
      color: #fff6d6;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: .12em;
      text-shadow: 0 0 12px #ffd778;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity .15s ease;
    }
    .race-shock-prompt[data-show="true"] {
      opacity: 1;
      animation: raceShockPromptPulse .55s ease-in-out infinite;
    }
    .race-finish-wreath {
      position: absolute;
      top: 22%;
      left: 50%;
      transform: translateX(-50%) scale(.86);
      padding: 16px 34px;
      border: 2px solid #ffd778;
      clip-path: polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px), 0 16px);
      background: radial-gradient(circle at 50% 0%, #ffd77838, transparent 62%), linear-gradient(155deg, #1b0f35ee, #091326f2);
      box-shadow: 0 0 48px #ffd77888, 0 0 28px #c06cffaa, inset 0 0 22px #ffd77833;
      text-align: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity .26s ease, transform .38s cubic-bezier(.22, 1, .36, 1);
    }
    .race-finish-wreath[data-show="true"] {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    .race-finish-wreath .wreath-row {
      display: flex; align-items: center; justify-content: center; gap: 12px;
    }
    .race-finish-wreath strong {
      font-size: clamp(26px, 3.8vw, 44px);
      font-weight: 900;
      letter-spacing: .14em;
      color: #ffe899;
      text-shadow: 0 0 24px #ffae33cc, 0 0 12px #d946efaa;
      white-space: nowrap;
    }
    .race-finish-wreath span {
      display: block;
      margin-top: 6px;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: .18em;
      color: #8bf7e8;
    }
    .race-nitro-track {
      position: relative; height: 14px;
      background: #101a28; border: 1px solid #7d9fb044; overflow: hidden;
    }
    .race-nitro-track[data-ready="shock"] {
      border-color: #f0abfc;
      box-shadow: 0 0 16px #d946efaa;
    }
    .race-nitro-fill {
      height: 100%; width: 0%;
      background: linear-gradient(90deg, #27d7c8, #63f5ff);
      box-shadow: 0 0 14px #52f2e088;
      transition: background .12s ease;
    }
    .race-nitro-fill[data-tier="shock-ready"] {
      background: linear-gradient(90deg, #38e8d8, #c06cff, #ffd778, #f0abfc, #38e8d8);
      background-size: 200% 100%;
      animation: raceBarSweep .95s linear infinite;
      box-shadow: 0 0 24px #e879f9ee;
    }
    .race-nitro-fill[data-tier="shock-on"] {
      background: linear-gradient(90deg, #ff54c8, #a855f7, #ffe07d);
      box-shadow: 0 0 26px #e879f9;
    }
    .race-nitro-thresh {
      position: absolute; top: 0; bottom: 0; left: 70%; width: 2px;
      background: #ffd778cc; box-shadow: 0 0 8px #ffd778;
    }
    .race-controls-hint {
      display: flex; justify-content: space-between; font-size: 9.8px; color: #95b2be; letter-spacing: .04em;
    }
    .race-mobile-btns {
      position: absolute; right: 20px; bottom: max(150px, calc(env(safe-area-inset-bottom) + 140px));
      display: none; gap: 9px; pointer-events: auto;
    }
    body[data-input="touch"] .race-mobile-btns { display: flex; }
    .race-touch-btn {
      width: 64px; height: 64px; border-radius: 50%;
      border: 2px solid #74ffd8aa; background: #0b2630e0; color: #e2fff9;
      font: 800 10.5px/1.1 inherit; letter-spacing: .04em;
      touch-action: none; user-select: none;
      box-shadow: 0 8px 20px #000a;
    }
    .race-touch-btn.drift { border-color: #ffd275aa; background: #33240ee0; color: #ffe4a8; }
    .race-touch-btn.shock {
      border-color: #d946efcc; background: linear-gradient(135deg, #3b1054e8, #6b1d70e8); color: #ffe8ff;
      box-shadow: 0 0 22px #c026d388;
    }
    .race-touch-btn.shock:disabled { opacity: .35; box-shadow: none; animation: none; }
    .race-touch-btn.shock:not(:disabled) { animation: racePulse .48s infinite alternate; }
    body[data-input="touch"] .race-controls-hint { display: none; }
    /* Mobile Portrait (<=600px): compact top header & free bottom-left joystick zone */
    @media (max-width: 600px) {
      .race-top-left {
        top: max(10px, calc(env(safe-area-inset-top) + 6px));
        left: 10px;
        right: 100px;
        gap: 5px;
      }
      .race-pos-badge { padding: 4px 9px; }
      .race-pos-num { font-size: 20px; }
      .race-lap-pill { padding: 4px 8px; }
      .race-lap-pill span { font-size: 9px; }
      .race-lap-pill strong { font-size: 13px; }
      .race-map-switch-btn { padding: 4px 8px; min-height: 26px; font-size: 10px; }
      .race-top-right {
        top: max(10px, calc(env(safe-area-inset-top) + 6px));
        right: 10px;
        gap: 5px;
      }
      .race-minimap { width: 72px; height: 72px; }
      .race-quit-btn { padding: 4px 7px; font-size: 9.5px; min-height: 26px; }
      .race-bottom-dash {
        left: auto;
        right: 10px;
        transform: none;
        bottom: max(82px, calc(env(safe-area-inset-bottom) + 76px));
        width: min(226px, calc(100vw - 154px));
        padding: 7px 10px;
        gap: 5px;
      }
      .race-speed-val { font-size: 21px; }
      .race-nitro-state { font-size: 9px; }
      .race-mobile-btns {
        right: 10px;
        bottom: max(14px, calc(env(safe-area-inset-bottom) + 10px));
        gap: 7px;
      }
      .race-touch-btn { width: 54px; height: 54px; font-size: 9.5px; }
      .race-shock-prompt {
        bottom: max(154px, calc(env(safe-area-inset-bottom) + 148px));
        font-size: 10px;
        padding: 5px 11px;
        max-width: calc(100vw - 20px);
      }
      .race-controls-hint { display: none; }
    }
    /* Mobile Landscape (short height): compact minimap & stack touch buttons cleanly between top-right & speedometer */
    @media (min-width: 601px) and (max-height: 500px) {
      .race-top-left { top: 10px; left: 14px; gap: 8px; }
      .race-pos-badge { padding: 5px 11px; }
      .race-pos-num { font-size: 22px; }
      .race-top-right { top: 10px; right: 14px; gap: 5px; }
      .race-minimap { width: 74px; height: 74px; }
      .race-quit-btn { padding: 4px 8px; font-size: 10px; min-height: 26px; }
      .race-bottom-dash {
        left: auto;
        right: 14px;
        transform: none;
        bottom: max(10px, calc(env(safe-area-inset-bottom) + 6px));
        width: 262px;
        padding: 7px 10px;
        gap: 5px;
      }
      .race-speed-val { font-size: 23px; }
      .race-mobile-btns {
        right: 14px;
        bottom: max(84px, calc(env(safe-area-inset-bottom) + 78px));
        gap: 8px;
      }
      .race-touch-btn { width: 52px; height: 52px; font-size: 9.5px; }
      .race-shock-prompt {
        bottom: max(146px, calc(env(safe-area-inset-bottom) + 140px));
        font-size: 11px;
        padding: 5px 14px;
      }
      .race-controls-hint { display: none; }
    }
    #race-podium-backdrop {
      position: fixed; inset: 0; z-index: 145;
      background: radial-gradient(circle at 50% 45%, #0c1226d6 0%, #040710ec 100%);
      backdrop-filter: blur(8px);
      display: grid; place-items: center; padding: 18px;
      font-family: Inter, "PingFang SC", system-ui, sans-serif;
    }
    #race-podium-backdrop[hidden] { display: none !important; }
    .race-podium-card {
      width: min(680px, 96vw); padding: 22px 24px;
      border: 1px solid #c57cff88;
      clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
      background: radial-gradient(circle at 80% 0%, #37165466, transparent 48%), linear-gradient(160deg, #0d1629f4, #070c17f8);
      color: #eef5f8; box-shadow: 0 28px 72px #000e;
      display: grid; gap: 14px; text-align: center;
    }
    .race-podium-rank {
      font: 900 40px/1 "IBM Plex Mono", monospace;
      color: #ffe08a; text-shadow: 0 0 28px #ffae3399, 0 0 14px #c06cffaa;
    }
    .race-podium-stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px;
    }
    .race-podium-stat {
      padding: 9px 6px; border: 1px solid #96b8c42e; background: #0a1422cc;
      display: grid; gap: 4px;
    }
    .race-podium-stat span { font-size: 9.5px; color: #8fb2be; letter-spacing: .08em; }
    .race-podium-stat strong { font-size: 700 14.5px/1 "IBM Plex Mono", monospace; color: #fffaf0; }
    .race-podium-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; margin-top: 4px; }
    .race-map-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; text-align: start; }
    @media (max-width: 640px) { .race-map-grid { grid-template-columns: 1fr; } }
    .race-map-card {
      padding: 13px 14px;
      border: 1.5px solid #96b8c43d;
      clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
      background: linear-gradient(165deg, #101e30e8, #080f1ae8);
      color: #edf5f8; cursor: pointer;
      display: grid; gap: 7px; align-content: space-between;
      transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
    }
    .race-map-card:hover, .race-map-card[data-kb-focus="true"] {
      transform: translateY(-4px);
      border-color: var(--m-col, #74ffd8);
      box-shadow: 0 14px 32px #000c, 0 0 22px color-mix(in srgb, var(--m-col, #74ffd8) 38%, transparent);
    }
  `;
  document.head.append(style);
}

export function createOrbitalRaceMode({ scene, camera, roverRig, createRivalRover, t, onPauseChange, onJuice, onHitStop, onFinishCoins, onOpenHangar, onExitMenu, onMapBiomeChange }) {
  injectRaceStyles();
  let currentMapIdx = 0;
  let track = buildTrackTable(RACE_MAPS[currentMapIdx]);

  // --- Built-in Web Audio 136 BPM Cyber-Synthwave Racing BGM + Ridge Racer Countdown, Crash & Turbine SFX ---
  let audioCtx = null;
  let sfxEnabled = true;
  let bgmEnabled = true;
  let bgmTimer = null;
  let bgmStep = 0;
  let noiseBuf = null;
  let engineOsc = null;
  let engineGain = null;
  let driftGain = null;

  function ensureAudio() {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      try {
        audioCtx = new AC();
        const rate = audioCtx.sampleRate;
        noiseBuf = audioCtx.createBuffer(1, Math.round(rate * 0.45), rate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        return null;
      }
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playTakedownCrashSfx() {
    if (!sfxEnabled) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // 1. Deep physical sub-bass chassis impact thump (pure sine punch, zero electronic sawtooth buzz)
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(78, now);
    thump.frequency.exponentialRampToValueAtTime(24, now + 0.24);
    thumpGain.gain.setValueAtTime(0.42, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.30);

    if (noiseBuf) {
      // 2. Heavy sheet-metal crunch & structural buckling transient
      const crunch = ctx.createBufferSource();
      crunch.buffer = noiseBuf;
      const cf = ctx.createBiquadFilter();
      cf.type = "bandpass";
      cf.Q.value = 1.6;
      cf.frequency.setValueAtTime(920, now);
      cf.frequency.exponentialRampToValueAtTime(260, now + 0.36);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.40, now);
      cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      crunch.connect(cf).connect(cg).connect(ctx.destination);
      crunch.start(now);
      crunch.stop(now + 0.40);

      // 3. Low muffled air-pressure / debris rumble
      const rumble = ctx.createBufferSource();
      rumble.buffer = noiseBuf;
      const rf = ctx.createBiquadFilter();
      rf.type = "lowpass";
      rf.frequency.setValueAtTime(240, now);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.32, now);
      rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.56);
      rumble.connect(rf).connect(rg).connect(ctx.destination);
      rumble.start(now);
      rumble.stop(now + 0.58);

      // 4. Staggered physical shrapnel & tire-bounce metallic clatter on asphalt
      for (const [delay, freq, vol] of [[0.035, 2200, 0.14], [0.11, 1650, 0.11], [0.21, 2600, 0.08], [0.31, 1400, 0.065]]) {
        const cl = ctx.createBufferSource();
        cl.buffer = noiseBuf;
        const clf = ctx.createBiquadFilter();
        clf.type = "bandpass";
        clf.Q.value = 3.8;
        clf.frequency.setValueAtTime(freq, now + delay);
        const clg = ctx.createGain();
        clg.gain.setValueAtTime(vol, now + delay);
        clg.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.09);
        cl.connect(clf).connect(clg).connect(ctx.destination);
        cl.start(now + delay);
        cl.stop(now + delay + 0.10);
      }
    }
  }

  function playCountdownCue(stage) {
    if (!sfxEnabled) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (stage >= 1 && stage <= 3) {
      const freqs = { 3: 440.0, 2: 554.37, 1: 659.25 };
      const f = freqs[stage] || 440;
      for (const [mult, type, peak] of [[1, "triangle", 0.22], [2, "sine", 0.11]]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f * mult, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc.connect(g).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.30);
      }
      const rev = ctx.createOscillator();
      const revFilter = ctx.createBiquadFilter();
      const revG = ctx.createGain();
      rev.type = "sawtooth";
      const baseRpm = stage === 3 ? 95 : stage === 2 ? 125 : 165;
      rev.frequency.setValueAtTime(baseRpm, now + 0.04);
      rev.frequency.exponentialRampToValueAtTime(baseRpm * 2.1, now + 0.24);
      rev.frequency.exponentialRampToValueAtTime(baseRpm * 1.1, now + 0.52);
      revFilter.type = "lowpass";
      revFilter.frequency.value = 680;
      revG.gain.setValueAtTime(0.0001, now + 0.04);
      revG.gain.linearRampToValueAtTime(0.14, now + 0.18);
      revG.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      rev.connect(revFilter).connect(revG).connect(ctx.destination);
      rev.start(now + 0.04);
      rev.stop(now + 0.56);
    } else if (stage === 0) {
      for (const [f, peak] of [[880.0, 0.24], [1108.73, 0.15], [1318.5, 0.15], [440.0, 0.18]]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        const flt = ctx.createBiquadFilter();
        flt.type = "lowpass";
        flt.frequency.setValueAtTime(3200, now);
        flt.frequency.exponentialRampToValueAtTime(800, now + 0.55);
        osc.frequency.setValueAtTime(f, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(peak, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
        osc.connect(flt).connect(g).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.60);
      }
    }
  }

  const BASS_ROOTS = [73.42, 58.27, 49.00, 55.00];
  const LEAD_NOTES = [
    587.33, 0, 698.46, 659.25, 587.33, 0, 523.25, 587.33,
    466.16, 0, 587.33, 659.25, 698.46, 0, 880.00, 698.46,
    392.00, 0, 523.25, 587.33, 698.46, 0, 659.25, 587.33,
    440.00, 523.25, 554.37, 659.25, 783.99, 659.25, 554.37, 440.00,
  ];

  function scheduleSynthStep() {
    if (!active || finished || !bgmEnabled) return;
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const step = bgmStep++;
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const boostExcite = shockwaveActive ? 1.0 : nitroActive ? 0.55 : 0;

    if (s16 % 4 === 0 || s16 === 14) {
      const k = ctx.createOscillator();
      const kg = ctx.createGain();
      k.type = "sine";
      k.frequency.setValueAtTime(148, now);
      k.frequency.exponentialRampToValueAtTime(38, now + 0.095);
      kg.gain.setValueAtTime(s16 === 14 ? 0.18 : 0.28, now);
      kg.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      k.connect(kg).connect(ctx.destination);
      k.start(now);
      k.stop(now + 0.15);
    }

    if (noiseBuf) {
      if (s16 === 4 || s16 === 12) {
        const sn = ctx.createBufferSource();
        sn.buffer = noiseBuf;
        const sf = ctx.createBiquadFilter();
        sf.type = "bandpass";
        sf.frequency.value = 1650;
        sf.Q.value = 0.7;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.16, now);
        sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
        sn.connect(sf).connect(sg).connect(ctx.destination);
        sn.start(now);
        sn.stop(now + 0.14);
      }
      const hh = ctx.createBufferSource();
      hh.buffer = noiseBuf;
      const hf = ctx.createBiquadFilter();
      hf.type = "highpass";
      hf.frequency.value = 6800;
      const hg = ctx.createGain();
      const hhPeak = (s16 % 4 === 2) ? 0.065 : 0.028;
      hg.gain.setValueAtTime(hhPeak, now);
      hg.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      hh.connect(hf).connect(hg).connect(ctx.destination);
      hh.start(now);
      hh.stop(now + 0.05);
    }

    const root = BASS_ROOTS[bar];
    const bassFreq = (s16 % 2 === 1) ? root * 2 : root;
    const bs = ctx.createOscillator();
    const bf = ctx.createBiquadFilter();
    const bg = ctx.createGain();
    bs.type = "sawtooth";
    bs.frequency.setValueAtTime(bassFreq, now);
    bf.type = "lowpass";
    bf.Q.value = 3.2;
    const cutoff = 520 + boostExcite * 1400 + (s16 % 4 === 2 ? 320 : 0);
    bf.frequency.setValueAtTime(cutoff, now);
    bf.frequency.exponentialRampToValueAtTime(160, now + 0.095);
    bg.gain.setValueAtTime(0.13, now);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
    bs.connect(bf).connect(bg).connect(ctx.destination);
    bs.start(now);
    bs.stop(now + 0.105);

    if (countdown <= 0) {
      const note = LEAD_NOTES[step % LEAD_NOTES.length];
      if (note > 0) {
        const ld = ctx.createOscillator();
        const lf = ctx.createBiquadFilter();
        const lg = ctx.createGain();
        ld.type = shockwaveActive ? "sawtooth" : "square";
        ld.frequency.setValueAtTime(note, now);
        lf.type = "lowpass";
        lf.frequency.setValueAtTime(1850 + boostExcite * 2400, now);
        lg.gain.setValueAtTime(0.0001, now);
        lg.gain.linearRampToValueAtTime(0.068 + boostExcite * 0.025, now + 0.01);
        lg.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        ld.connect(lf).connect(lg).connect(ctx.destination);
        ld.start(now);
        ld.stop(now + 0.19);
      }
    }
  }

  function startRaceAudio() {
    stopRaceAudio();
    bgmStep = 0;
    const ctx = ensureAudio();
    bgmTimer = setInterval(scheduleSynthStep, 110);
    if (ctx && sfxEnabled) {
      try {
        engineOsc = ctx.createOscillator();
        const flt = ctx.createBiquadFilter();
        engineGain = ctx.createGain();
        engineOsc.type = "sawtooth";
        engineOsc.frequency.value = 85;
        flt.type = "lowpass";
        flt.frequency.value = 540;
        engineGain.gain.value = 0.0001;
        engineOsc.connect(flt).connect(engineGain).connect(ctx.destination);
        engineOsc.start();

        if (noiseBuf) {
          const dSrc = ctx.createBufferSource();
          dSrc.buffer = noiseBuf;
          dSrc.loop = true;
          const df = ctx.createBiquadFilter();
          df.type = "bandpass";
          df.frequency.value = 1180;
          df.Q.value = 4.5;
          driftGain = ctx.createGain();
          driftGain.gain.value = 0.0001;
          dSrc.connect(df).connect(driftGain).connect(ctx.destination);
          dSrc.start();
          engineOsc._driftSrc = dSrc;
        }
      } catch { /* ignore */ }
    }
  }

  function playVictoryFanfare() {
    if (!sfxEnabled) return;
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const notes = [
      [523.25, 0.00, 0.28], [659.25, 0.09, 0.28], [783.99, 0.18, 0.30],
      [1046.5, 0.28, 0.85], [1318.5, 0.34, 0.85], [1567.98, 0.40, 0.90],
    ];
    for (const [f, delay, dur] of notes) {
      const osc = ctx.createOscillator();
      const flt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, now + delay);
      flt.type = "lowpass";
      flt.frequency.setValueAtTime(3400, now + delay);
      flt.frequency.exponentialRampToValueAtTime(1100, now + delay + dur);
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.linearRampToValueAtTime(0.11, now + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      osc.connect(flt).connect(g).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.03);
    }
  }

  function updateRaceEngineAudio() {
    if (!audioCtx || !engineOsc || !engineGain) return;
    const now = audioCtx.currentTime;
    if (!sfxEnabled || !active || finished) {
      engineGain.gain.setTargetAtTime(0.0001, now, 0.06);
      if (driftGain) driftGain.gain.setTargetAtTime(0.0001, now, 0.05);
      return;
    }
    // Engine RPM sawtooth climbs within each gear and drops at gear shift for realistic acoustic feel!
    const gearMin = [0, 11, 16, 20.5, 24.5][currentGear - 1] || 0;
    const gearSpan = [11, 5, 4.5, 4.5, 8][currentGear - 1] || 6;
    const inGearRpm = THREE.MathUtils.clamp((playerSpeed - gearMin) / gearSpan, 0, 1.2);
    const basePitch = countdown > 0
      ? 85 + Math.sin(now * 14) * 18
      : 86 + currentGear * 22 + inGearRpm * 95 + (shockwaveActive ? 65 : nitroActive ? 34 : 0);
    engineOsc.frequency.setTargetAtTime(basePitch, now, 0.045);
    const vol = countdown > 0 ? 0.045 : 0.055 + (playerSpeed / 38) * 0.055 + (nitroActive ? 0.025 : 0);
    engineGain.gain.setTargetAtTime(vol, now, 0.06);
    if (driftGain) {
      const wantDrift = (drifting && airHeight <= 0.1 && countdown <= 0) ? 0.095 : 0.0001;
      driftGain.gain.setTargetAtTime(wantDrift, now, 0.04);
    }
  }

  function stopRaceAudio() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
    if (engineOsc) {
      try { engineOsc._driftSrc?.stop(); } catch { /* ignore */ }
      try { engineOsc.stop(); } catch { /* ignore */ }
      try { engineOsc.disconnect(); } catch { /* ignore */ }
      engineOsc = null;
      engineGain = null;
      driftGain = null;
    }
  }

  function setAudioSettings({ sound = true, music = true } = {}) {
    sfxEnabled = Boolean(sound);
    bgmEnabled = Boolean(music);
    updateRaceEngineAudio();
  }

  const group = new THREE.Group();
  group.name = "orbital-race-track";
  group.visible = false;
  scene.add(group);

  // 1. Multi-Style Track Surface Shader:
  //    - Map 0 (Starport Metropolis): Asphalt Tarmac with Double Yellow Center Line, White Dashed Lanes & Runway Crosswalks!
  //    - Map 1 (Crimson Canyon Quarry): Rust-Red Ribbed Steel Quarry Grating with Black-Yellow Hazard Stripes!
  //    - Map 2 (Orbital Ringworld): Cyber-Violet Holographic Glass Energy Grid with Plasma Veins!
  const trackUniforms = {
    uTime: { value: 0 },
    uShock: { value: 0 },
    uMapTheme: { value: 0 },
  };
  const trackMat = new THREE.ShaderMaterial({
    uniforms: trackUniforms,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uShock;
      uniform float uMapTheme;
      varying vec2 vUv;
      void main() {
        float edge = abs(vUv.x - 0.5) * 2.0;
        vec3 col = vec3(0.0);

        if (uMapTheme < 0.5) {
          // MAP 0: STARPORT METROPOLIS — Dark Asphalt Tarmac + Double Yellow Center Line + Dashed White Lanes + Cyan Sidewalk Curbs
          vec3 asphalt = vec3(0.08, 0.10, 0.13) + 0.025 * sin(vUv.y * 80.0) * cos(vUv.x * 40.0);
          float doubleYellow = smoothstep(0.014, 0.004, abs(edge - 0.025));
          float whiteDash = smoothstep(0.016, 0.005, abs(edge - 0.35)) * step(0.45, fract(vUv.y * 3.0));
          float crosswalk = step(0.88, fract(vUv.y * 0.5)) * step(0.4, fract(vUv.x * 12.0)) * step(edge, 0.82) * 0.25;
          float curb = step(0.86, edge) * step(edge, 0.94) * step(0.5, fract(vUv.y * 12.0));
          float border = smoothstep(0.92, 0.99, edge);
          col = asphalt
            + vec3(1.5, 1.15, 0.2) * doubleYellow
            + vec3(1.1, 1.2, 1.3) * (whiteDash + crosswalk)
            + vec3(0.25, 1.4, 1.35) * (curb * 0.55 + border * 1.25);
        } else if (uMapTheme < 1.5) {
          // MAP 1: CRIMSON CANYON QUARRY — Rust-Red Ribbed Steel Deck + Black/Yellow Hazard Shoulders + Amber Chevrons
          vec3 rustDeck = vec3(0.18, 0.08, 0.05) + vec3(0.06, 0.03, 0.02) * step(0.5, fract(vUv.y * 28.0));
          float grate = smoothstep(0.85, 0.96, fract(vUv.y * 7.0)) * 0.18;
          float hazard = step(0.80, edge) * step(edge, 0.93) * step(0.5, fract(vUv.y * 10.0 + edge * 2.5));
          float chevPhase = fract(vUv.y * 2.0 - uTime * 3.0 + abs(vUv.x - 0.5) * 1.4);
          float chev = smoothstep(0.78, 0.92, chevPhase) * smoothstep(0.75, 0.15, edge);
          float border = smoothstep(0.91, 0.99, edge);
          col = rustDeck + vec3(0.3, 0.15, 0.08) * grate
            + vec3(1.65, 1.05, 0.15) * (hazard * 0.85 + chev * 0.65)
            + vec3(2.2, 0.55, 0.25) * border;
        } else {
          // MAP 2: ORBITAL RINGWORLD — Deep-Space Cyber-Violet Holographic Glass Grid + Plasma Energy Veins
          vec3 holoBase = vec3(0.07, 0.04, 0.18);
          float hexGrid = (smoothstep(0.92, 0.98, fract(vUv.x * 16.0)) + smoothstep(0.92, 0.98, fract(vUv.y * 12.0))) * 0.32;
          float chevPhase = fract(vUv.y * 1.8 - uTime * (3.6 + uShock * 4.5) + abs(vUv.x - 0.5) * 1.5);
          float chev = smoothstep(0.74, 0.90, chevPhase) * smoothstep(0.82, 0.15, edge);
          float lane = (smoothstep(0.018, 0.005, abs(edge - 0.33)) + smoothstep(0.018, 0.005, abs(edge - 0.66))) * 0.55;
          float border = smoothstep(0.88, 0.98, edge);
          col = holoBase + vec3(0.45, 1.4, 2.2) * (hexGrid + lane)
            + vec3(1.85, 0.45, 2.5) * (chev * 0.85 + border * 1.45);
        }

        // Start/Finish checkered line
        float startBand = 1.0 - smoothstep(0.0, 0.32, min(vUv.y, 84.0 - vUv.y));
        float checker = step(0.5, fract(vUv.x * 10.0)) * step(0.5, fract(vUv.y * 10.0));
        col += vec3(1.4, 1.3, 1.1) * startBand * (0.45 + 0.55 * checker);
        col += vec3(1.2, 0.35, 1.8) * uShock * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const trackMesh = new THREE.Mesh(buildRibbonGeometry(track.frames, TRACK_HALF_W, 0, false), trackMat);
  group.add(trackMesh);

  const keelMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 1.6, 2.1), toneMapped: false, transparent: true, opacity: 0.30,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const keelMesh = new THREE.Mesh(buildRibbonGeometry(track.frames, TRACK_HALF_W * 0.48, -0.35, false), keelMat);
  group.add(keelMesh);

  const railMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.55, 2.1, 2.2), toneMapped: false, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const railLeftMesh = new THREE.Mesh(buildRibbonGeometry(track.frames, TRACK_HALF_W, 0, true, -1, track.mapDef), railMat);
  const railRightMesh = new THREE.Mesh(buildRibbonGeometry(track.frames, TRACK_HALF_W, 0, true, 1, track.mapDef), railMat);
  group.add(railLeftMesh, railRightMesh);

  const tmpFrame = { u: 0, p: new THREE.Vector3(), T: new THREE.Vector3(), R: new THREE.Vector3(), U: new THREE.Vector3(), curv: 0, inverted: false };
  const tmpMat = new THREE.Matrix4();
  const tmpNegT = new THREE.Vector3();
  function placeOnTrack(obj, dist, lat = 0, lift = 0) {
    track.sampleAtDist(dist, tmpFrame);
    obj.position.copy(tmpFrame.p).addScaledVector(tmpFrame.R, lat).addScaledVector(tmpFrame.U, lift);
    tmpNegT.copy(tmpFrame.T).negate();
    tmpMat.makeBasis(tmpFrame.R, tmpFrame.U, tmpNegT);
    obj.quaternion.setFromRotationMatrix(tmpMat);
  }

  // 2. Start/Finish Grand Arch
  const startArch = new THREE.Mesh(
    new THREE.TorusGeometry(TRACK_HALF_W + 0.4, 0.24, 8, 28, Math.PI),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd778).multiplyScalar(2.8), toneMapped: false }),
  );
  startArch.scale.set(1.05, 1.3, 1.8);
  group.add(startArch);

  // 3. 3 Completely Distinct Roadside 3D Scenery Kits (one per Map)!
  const starportSceneryGroup = new THREE.Group();
  const starportBlocks = Array.from({ length: 24 }, (_, i) => {
    const mesh = createStarportCityBlock(i);
    starportSceneryGroup.add(mesh);
    return { i, mesh };
  });
  group.add(starportSceneryGroup);

  const canyonSceneryGroup = new THREE.Group();
  const canyonClusters = Array.from({ length: 24 }, (_, i) => {
    const mesh = createCanyonRockCluster(i);
    canyonSceneryGroup.add(mesh);
    return { i, mesh };
  });
  group.add(canyonSceneryGroup);

  const antigravSceneryGroup = new THREE.Group();
  const antigravRings = Array.from({ length: 14 }, (_, i) => {
    const mesh = createAntigravGyroRing(i);
    antigravSceneryGroup.add(mesh);
    return { i, mesh };
  });
  group.add(antigravSceneryGroup);

  // 4. 8 Track Obstacles (4 Central Split-Lane Bridge Pillars + 4 Alternating Laser Chicane Barriers!)
  const obstacleConfigs = [
    { u: 0.11, lat: -3.4, kind: "laser" },
    { u: 0.19, lat: 0.0, kind: "pillar" },
    { u: 0.27, lat: 3.1, kind: "laser" },
    { u: 0.36, lat: 0.0, kind: "pillar" },
    { u: 0.54, lat: -3.0, kind: "laser" },
    { u: 0.68, lat: 0.0, kind: "pillar" },
    { u: 0.76, lat: 3.2, kind: "laser" },
    { u: 0.91, lat: 0.0, kind: "pillar" },
  ];
  const obstacles = obstacleConfigs.map(cfg => {
    const ob = createObstacleMesh(cfg.kind);
    group.add(ob.group);
    return { ...cfg, dist: 0, ...ob, cd: 0 };
  });

  // 5. 4 Holographic Stunt Jump Ramps
  const stuntRampConfigs = [
    { u: 0.135, lat: 2.6, type: "flat" },
    { u: 0.39, lat: -2.5, type: "barrel" },
    { u: 0.615, lat: 2.2, type: "flat" },
    { u: 0.845, lat: 2.8, type: "barrel" },
  ];
  const stuntRamps = stuntRampConfigs.map(cfg => {
    const ramp = createStuntRampMesh(cfg.type);
    group.add(ramp.group);
    return { ...cfg, dist: 0, ...ramp, cd: 0 };
  });

  // 6. 16 Glowing Neon Boost Pads
  const boostPadGeo = new THREE.PlaneGeometry(3.2, 6.4);
  boostPadGeo.rotateX(-HALF_PI);
  const boostPadMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.6, 2.8, 2.6), toneMapped: false, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const boostPads = Array.from({ length: 16 }, (_, idx) => {
    const u = (idx + 0.35) / 16;
    const lat = ((idx % 3) - 1) * 3.1;
    const mesh = new THREE.Mesh(boostPadGeo, boostPadMat);
    group.add(mesh);
    return { u, dist: 0, lat, mesh, cd: 0 };
  });

  // 7. 36 Collectible Pressurized Helium-3 / Cryo-Nitro Energy Canisters (replacing gold coins!)
  const cellCoreGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.72, 12);
  const cellCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 2.35, 2.65), toneMapped: false,
  });
  const cellCapGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.13, 12);
  const cellCapMat = new THREE.MeshStandardMaterial({
    color: 0x26313d, metalness: 0.85, roughness: 0.26,
  });
  const cellRingGeo = new THREE.TorusGeometry(0.34, 0.032, 8, 20);
  const cellRingMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.4, 1.85, 0.55), toneMapped: false,
  });
  const orbs = Array.from({ length: 36 }, (_, i) => {
    const u = (i + 0.5) / 36;
    const lat = Math.sin(i * 1.35) * 4.2;
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(cellCoreGeo, cellCoreMat);
    const topCap = new THREE.Mesh(cellCapGeo, cellCapMat);
    topCap.position.y = 0.40;
    const botCap = new THREE.Mesh(cellCapGeo, cellCapMat);
    botCap.position.y = -0.40;
    const ring = new THREE.Mesh(cellRingGeo, cellRingMat);
    ring.rotation.x = Math.PI * 0.32;
    mesh.add(core, topCap, botCap, ring);
    mesh.rotation.z = 0.26;
    group.add(mesh);
    return { u, dist: 0, lat, mesh, active: true, respawn: 0 };
  });

  // Rebuild & swap entire 3D Roadside Architecture + Biome Terrain + Track Shader per Map!
  function applyTrackMap(mapIdx) {
    currentMapIdx = ((mapIdx % RACE_MAPS.length) + RACE_MAPS.length) % RACE_MAPS.length;
    const mapDef = RACE_MAPS[currentMapIdx];
    track = buildTrackTable(mapDef);
    const { frames, totalLen } = track;
    trackUniforms.uMapTheme.value = currentMapIdx;

    // Switch underlying Lunar Terrain & Sun Lighting Biome to match the Map ONLY when Race mode is active!
    if (active) onMapBiomeChange?.(700 + currentMapIdx * 137, mapDef.biomeIdx);

    trackMesh.geometry.dispose();
    trackMesh.geometry = buildRibbonGeometry(frames, TRACK_HALF_W, 0, false, 1, mapDef);
    keelMesh.geometry.dispose();
    keelMesh.geometry = buildRibbonGeometry(frames, TRACK_HALF_W * 0.48, -0.35, false, 1, mapDef);
    railLeftMesh.geometry.dispose();
    railLeftMesh.geometry = buildRibbonGeometry(frames, TRACK_HALF_W, 0, true, -1, mapDef);
    railRightMesh.geometry.dispose();
    railRightMesh.geometry = buildRibbonGeometry(frames, TRACK_HALF_W, 0, true, 1, mapDef);

    if (currentMapIdx === 0) railMat.color.setRGB(0.45, 2.2, 2.1);
    else if (currentMapIdx === 1) railMat.color.setRGB(2.6, 1.1, 0.35);
    else railMat.color.setRGB(1.8, 0.65, 2.8);

    placeOnTrack(startArch, 0, 0, 0.12);

    // Toggle & position the Map's bespoke 3D Roadside Streetscape / Canyon Spires / Gyro-Rings!
    starportSceneryGroup.visible = currentMapIdx === 0;
    canyonSceneryGroup.visible = currentMapIdx === 1;
    antigravSceneryGroup.visible = currentMapIdx === 2;

    if (currentMapIdx === 0) {
      for (const b of starportBlocks) {
        const u = (b.i + 0.3) / starportBlocks.length;
        placeOnTrack(b.mesh, u * totalLen, 0, 0.02);
      }
    } else if (currentMapIdx === 1) {
      for (const c of canyonClusters) {
        const u = (c.i + 0.3) / canyonClusters.length;
        placeOnTrack(c.mesh, u * totalLen, 0, 0.02);
      }
    } else {
      for (const r of antigravRings) {
        const u = (r.i + 0.4) / antigravRings.length;
        placeOnTrack(r.mesh, u * totalLen, 0, 0.02);
      }
    }

    for (const ob of obstacles) {
      ob.dist = ob.u * totalLen;
      ob.cd = 0;
      ob.active = currentMapIdx === 1 || (ob.kind === "pillar") || (ob.u < 0.35);
      ob.group.visible = ob.active;
      placeOnTrack(ob.group, ob.dist, ob.lat, 0.02);
    }
    for (const ramp of stuntRamps) {
      ramp.dist = ramp.u * totalLen;
      ramp.cd = 0;
      placeOnTrack(ramp.group, ramp.dist, ramp.lat, 0.02);
    }
    for (const pad of boostPads) {
      pad.dist = pad.u * totalLen;
      pad.cd = 0;
      placeOnTrack(pad.mesh, pad.dist, pad.lat, 0.09);
    }
    for (const orb of orbs) {
      orb.dist = orb.u * totalLen;
      orb.active = true;
      orb.respawn = 0;
      orb.mesh.visible = true;
      placeOnTrack(orb.mesh, orb.dist, orb.lat, 0.95);
    }
  }

  // 8. Tire Friction Sparks (36) + Asphalt Takedown Shatter Armor Debris Pool (24 sharp triangular shards!)
  const sparkGeo = new THREE.BoxGeometry(0.026, 0.026, 0.32);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(3.4, 2.2, 0.65), toneMapped: false, transparent: true, opacity: 0.92,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, 36);
  sparkMesh.count = 0;
  sparkMesh.frustumCulled = false;
  group.add(sparkMesh);
  const sparks = [];
  const sparkDummy = new THREE.Object3D();

  const debrisGeo = new THREE.TetrahedronGeometry(0.095, 0);
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x1e2834, emissive: 0xff9438, emissiveIntensity: 0.92, metalness: 0.88, roughness: 0.18, flatShading: true,
  });
  const debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, 32);
  debrisMesh.count = 0;
  debrisMesh.frustumCulled = false;
  group.add(debrisMesh);
  const debrisList = [];

  // Detailed Wreck Parts: 2 Detached Spinning Tires + 4 Scorched Carbon-Titanium Hull/Spoiler Plates that bounce physically off the track!
  const wreckTireGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.17, 12);
  wreckTireGeo.rotateZ(HALF_PI);
  const wreckTireMat = new THREE.MeshStandardMaterial({ color: 0x15181e, emissive: 0x3b1808, emissiveIntensity: 0.18, roughness: 0.78, metalness: 0.22 });
  const wreckPanelGeo = new THREE.BoxGeometry(0.55, 0.06, 0.34);
  const wreckPanelMat = new THREE.MeshStandardMaterial({ color: 0x202731, emissive: 0xd9681c, emissiveIntensity: 0.38, roughness: 0.36, metalness: 0.88 });
  const wreckParts = Array.from({ length: 6 }, (_, idx) => {
    const mesh = new THREE.Mesh(idx < 2 ? wreckTireGeo : wreckPanelGeo, idx < 2 ? wreckTireMat : wreckPanelMat);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, t: 0, dur: 0, groundY: 0 };
  });

  // Realistic Hot Spark Flash + Subtle Low-Profile Dust/Pressure Shockwave Ring (removed neon purple arcade ring!)
  const kdFlashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(3.2, 1.85, 0.68), toneMapped: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const kdFlashCore = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), kdFlashMat);
  kdFlashCore.visible = false;
  group.add(kdFlashCore);

  const kdRingMat = new THREE.MeshBasicMaterial({
    color: 0xd8b896, transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const kdRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.56, 28), kdRingMat);
  kdRing.visible = false;
  group.add(kdRing);

  const kdInnerRingMat = new THREE.MeshBasicMaterial({
    color: 0xffb86c, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const kdInnerRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 24), kdInnerRingMat);
  kdInnerRing.visible = false;
  group.add(kdInnerRing);
  let kdRingTimer = 0;

  // Realistic Charcoal-Slate Wreck Smoke Plume (18 instanced puffs billowing from the damaged rival!)
  const smokeGeo = new THREE.DodecahedronGeometry(0.32, 0);
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0x262930, transparent: true, opacity: 0.68, depthWrite: false,
  });
  const smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, 18);
  smokeMesh.count = 0;
  smokeMesh.frustumCulled = false;
  group.add(smokeMesh);
  const smokePuffs = [];

  // Grand Finish Line Celebration: 64-piece 3D Multi-Color Confetti Fountain + Golden Victory Halo Ring!
  const confettiGeo = new THREE.PlaneGeometry(0.28, 0.52);
  const confettiMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, toneMapped: false, side: THREE.DoubleSide,
  });
  const confettiMesh = new THREE.InstancedMesh(confettiGeo, confettiMat, 64);
  confettiMesh.count = 0;
  confettiMesh.frustumCulled = false;
  const confettiPalette = [0xffd778, 0x74ffd8, 0xf0abfc, 0x38bdf8, 0xff6b8b, 0xffffff];
  const cTmp = new THREE.Color();
  for (let i = 0; i < 64; i++) {
    cTmp.setHex(confettiPalette[i % confettiPalette.length]).multiplyScalar(1.65);
    confettiMesh.setColorAt(i, cTmp);
  }
  if (confettiMesh.instanceColor) confettiMesh.instanceColor.needsUpdate = true;
  group.add(confettiMesh);
  const confettiList = [];

  const finishHaloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(3.2, 2.5, 0.85), toneMapped: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const finishHaloRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.55, 40), finishHaloMat);
  finishHaloRing.visible = false;
  group.add(finishHaloRing);

  function emitSmokePuff(origin, upDir) {
    if (smokePuffs.length >= 18) smokePuffs.shift();
    smokePuffs.push({
      x: origin.x + (Math.random() - 0.5) * 0.7,
      y: origin.y + 0.35 + Math.random() * 0.25,
      z: origin.z + (Math.random() - 0.5) * 0.7,
      vx: upDir.x * (1.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.2,
      vy: upDir.y * (1.5 + Math.random() * 1.8) + 0.8,
      vz: upDir.z * (1.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.2,
      t: 0, dur: 0.85 + Math.random() * 0.35,
    });
  }

  function emitFinishConfetti(frame) {
    confettiList.length = 0;
    for (let i = 0; i < 64; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const lat = playerLat + side * (1.8 + Math.random() * 2.6);
      const origin = frame.p.clone()
        .addScaledVector(frame.R, lat)
        .addScaledVector(frame.T, -0.5 + Math.random() * 5.2)
        .addScaledVector(frame.U, 0.6 + Math.random() * 1.4);
      const inward = -side * (1.4 + Math.random() * 3.0);
      const upSpeed = 5.4 + Math.random() * 5.8;
      const fwdSpeed = 2.5 + Math.random() * 6.0;
      confettiList.push({
        x: origin.x, y: origin.y, z: origin.z,
        vx: frame.R.x * inward + frame.U.x * upSpeed + frame.T.x * fwdSpeed,
        vy: frame.R.y * inward + frame.U.y * upSpeed + frame.T.y * fwdSpeed,
        vz: frame.R.z * inward + frame.U.z * upSpeed + frame.T.z * fwdSpeed,
        rx: 5 + Math.random() * 9, ry: 5 + Math.random() * 9, rz: 4 + Math.random() * 8,
        t: 0, dur: 3.4 + Math.random() * 1.4,
      });
    }
    placeOnTrack(finishHaloRing, playerDist + 3.0, 0, 2.2);
    finishHaloRing.visible = true;
    finishHaloMat.opacity = 0.92;
  }

  function emitSparks(origin, forwardDir, upDir, count = 4) {
    for (let i = 0; i < count; i++) {
      if (sparks.length >= 36) sparks.shift();
      const spread = (Math.random() - 0.5) * 1.4;
      const vx = -forwardDir.x * (7 + Math.random() * 6) + upDir.x * (2.5 + Math.random() * 4) + spread;
      const vy = -forwardDir.y * (7 + Math.random() * 6) + upDir.y * (2.5 + Math.random() * 4) + spread;
      const vz = -forwardDir.z * (7 + Math.random() * 6) + upDir.z * (2.5 + Math.random() * 4) + spread;
      sparks.push({
        x: origin.x + (Math.random() - 0.5) * 0.9,
        y: origin.y + (Math.random() - 0.5) * 0.3,
        z: origin.z + (Math.random() - 0.5) * 0.9,
        vx, vy, vz, t: 0, dur: 0.26 + Math.random() * 0.20,
      });
    }
  }

  function emitShatterDebris(origin, upDir, dist = playerDist, lat = playerLat) {
    debrisList.length = 0;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU + Math.random() * 0.3;
      const outSpeed = 3.0 + Math.random() * 5.2;
      const upSpeed = 2.8 + Math.random() * 4.5;
      debrisList.push({
        x: origin.x + (Math.random() - 0.5) * 0.7,
        y: origin.y + 0.45 + Math.random() * 0.35,
        z: origin.z + (Math.random() - 0.5) * 0.7,
        vx: Math.cos(a) * outSpeed + upDir.x * upSpeed,
        vy: upDir.y * upSpeed + (Math.random() - 0.1) * 3.0,
        vz: Math.sin(a) * outSpeed + upDir.z * upSpeed,
        rx: 7 + Math.random() * 11, ry: 7 + Math.random() * 11,
        t: 0, dur: 1.25 + Math.random() * 0.40,
      });
    }
    // Launch 6 sculpted detached tires & glowing armor plates that bounce physically off the road!
    for (let i = 0; i < wreckParts.length; i++) {
      const wp = wreckParts[i];
      const a = (i / wreckParts.length) * TAU + 0.4;
      const outV = 3.2 + Math.random() * 3.8;
      wp.mesh.position.set(origin.x + (Math.random() - 0.5) * 0.5, origin.y + 0.55, origin.z + (Math.random() - 0.5) * 0.5);
      wp.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      wp.mesh.visible = true;
      wp.vx = Math.cos(a) * outV;
      wp.vy = 4.6 + Math.random() * 3.6;
      wp.vz = Math.sin(a) * outV;
      wp.rx = 6 + Math.random() * 8;
      wp.ry = 5 + Math.random() * 8;
      wp.rz = 6 + Math.random() * 8;
      wp.groundY = origin.y + 0.14;
      wp.t = 0;
      wp.dur = 1.65;
    }
    for (let i = 0; i < 6; i++) emitSmokePuff(origin, upDir);
    kdFlashCore.position.copy(origin).addScaledVector(upDir, 0.55);
    kdFlashCore.scale.setScalar(0.5);
    kdFlashCore.visible = true;
    kdFlashMat.opacity = 0.95;

    placeOnTrack(kdRing, dist, lat, 0.12);
    kdRing.rotateX(HALF_PI);
    kdRing.visible = true;
    placeOnTrack(kdInnerRing, dist, lat, 0.16);
    kdInnerRing.rotateX(HALF_PI);
    kdInnerRing.visible = true;
    kdRingTimer = 0.85;
  }

  // 9. Orbital Tractor-Beam Rescue Cone
  const rescueBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.55, 2.8, 3.0), toneMapped: false, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const rescueBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 2.3, 7.5, 16, 1, true), rescueBeamMat);
  rescueBeam.visible = false;
  group.add(rescueBeam);

  // 10. 3 High-Detail Sculpted 3D Hero AI Rivals
  const rivalConfigs = [
    { name: "FALCON-12", chassis: "falcon", color: 0xffc857, baseSpeed: 24.4, laneBias: -3.1, startOffset: 7 },
    { name: "TITAN-88", chassis: "titan", color: 0xff5a7a, baseSpeed: 25.0, laneBias: 3.1, startOffset: 13 },
    { name: "UFO-X00", chassis: "ufo", color: 0x6bffb8, baseSpeed: 25.6, laneBias: 0.2, startOffset: 19 },
  ];
  const wakeGeo = new THREE.PlaneGeometry(0.16, 11.0);
  wakeGeo.rotateX(-HALF_PI);
  wakeGeo.translate(0, 0.45, 6.2);
  const wakeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.55, 2.4, 2.6), toneMapped: false, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const rivals = rivalConfigs.map((cfg, idx) => {
    const rig = createRivalRover();
    rig.setChassis(cfg.chassis);
    const wakeLeft = new THREE.Mesh(wakeGeo, wakeMat);
    wakeLeft.position.x = -0.46;
    const wakeRight = new THREE.Mesh(wakeGeo, wakeMat);
    wakeRight.position.x = 0.46;
    rig.rover.add(wakeLeft, wakeRight);
    group.add(rig.rover);
    return {
      ...cfg, idx, rig, group: rig.rover,
      dist: cfg.startOffset, lat: cfg.laneBias, speed: 0, headingYaw: 0,
      hitCooldown: 0, kdTimer: 0, kdHeight: 0, kdSpin: 0,
      kdSide: 1, kdStartLat: 0, kdTargetLat: 0,
      aiBoosting: false, aiNitroTimer: 0, aiNitroCooldown: 3.2 + idx * 2.3, respawnGrace: 0,
    };
  });

  // HUD DOM
  const hud = document.createElement("div");
  hud.id = "race-hud";
  hud.hidden = true;
  hud.innerHTML = `
    <div class="race-top-left">
      <div class="race-pos-badge">
        <span id="race-pos-num" class="race-pos-num">1st</span>
        <span class="race-pos-sub">/ 4</span>
      </div>
      <div class="race-lap-pill">
        <span id="race-sector-label">STARPORT STREET // S1</span>
        <strong id="race-lap-text">LAP 1 / ${TOTAL_LAPS}</strong>
      </div>
      <button type="button" id="race-map-btn" class="race-map-switch-btn">${t("切换赛道 [M]", "Switch Track [M]")}</button>
    </div>
    <div class="race-top-right">
      <canvas id="race-minimap" class="race-minimap" width="124" height="124"></canvas>
      <button type="button" id="race-quit" class="race-quit-btn">${t("退出赛事 [Esc]", "Exit Race [Esc]")}</button>
    </div>
    <div id="race-status-toast" class="race-status-toast"></div>
    <div id="race-live-badge" class="race-live-badge"></div>
    <div id="race-rival-alert" class="race-rival-alert"></div>
    <div id="race-shock-prompt" class="race-shock-prompt" data-show="false">${t("⚡ 能量满格！立即按 [ SPACE ] 紫金脉冲完美爆发 ⚡", "⚡ MAX SHOCKWAVE READY! PRESS [ SPACE ] NOW ⚡")}</div>
    <div id="race-finish-wreath" class="race-finish-wreath" data-show="false">
      <div class="wreath-row">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffd778" stroke-width="1.8"><path d="M5 19c-2-4-2-9 1-13M8 16c-1.5-2.5-1.5-5.5 0-8M19 19c2-4 2-9-1-13M16 16c1.5-2.5 1.5-5.5 0-8M8 21h8M12 18v3"/></svg>
        <strong id="race-finish-title">🏁 FINISH! // 第 1 名</strong>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffd778" stroke-width="1.8"><path d="M5 19c-2-4-2-9 1-13M8 16c-1.5-2.5-1.5-5.5 0-8M19 19c2-4 2-9-1-13M16 16c1.5-2.5 1.5-5.5 0-8M8 21h8M12 18v3"/></svg>
      </div>
      <span id="race-finish-sub">CHECKERED FLAG · VICTORY LAP CELEBRATION</span>
    </div>
    <div id="race-center-banner" class="race-center-banner"></div>
    <div class="race-mobile-btns">
      <button type="button" id="race-touch-drift" class="race-touch-btn drift">DRIFT<br>STUNT</button>
      <button type="button" id="race-touch-nitro" class="race-touch-btn">NITRO</button>
      <button type="button" id="race-touch-shock" class="race-touch-btn shock" disabled>SHOCK<br>WAVE</button>
    </div>
    <div class="race-bottom-dash">
      <div class="race-dash-head">
        <div class="race-speed-box">
          <span id="race-speed-val" class="race-speed-val">000</span>
          <span class="race-speed-unit">KM/H</span>
          <span id="race-gear-pill" class="race-gear-pill">G1</span>
          <span id="race-slope-tag" class="race-slope-tag"></span>
        </div>
        <span id="race-nitro-state" class="race-nitro-state">NITRO 45%</span>
      </div>
      <div class="race-nitro-track">
        <div id="race-nitro-fill" class="race-nitro-fill"></div>
        <div class="race-nitro-thresh" title="Shockwave 70%"></div>
      </div>
      <div class="race-controls-hint">
        <span>${t("[W/↑]油门 [A/D]转向 [Shift]甩尾漂移/斜坡滚筒", "[W]Gas [A/D]Steer [Shift]Drift / Ramp Barrel-Roll")}</span>
        <span>${t("[Space]消耗氮气加速 (≥70%紫金脉冲!)", "[Space]Burn Nitro / Super Shockwave!")}</span>
      </div>
    </div>
  `;
  document.body.append(hud);

  const kdCinematic = document.createElement("div");
  kdCinematic.id = "race-kd-cinematic";
  kdCinematic.innerHTML = `
    <div class="race-kd-bar-top"></div>
    <div class="race-kd-stamp">
      <strong id="race-kd-title">💥 KNOCKDOWN! // 狂野击毁</strong>
      <span id="race-kd-sub">FALCON-12 SHATTERED · +40 CR &amp; +35% NITRO</span>
    </div>
    <div class="race-kd-bar-bot"></div>
  `;
  document.body.append(kdCinematic);
  const kdTitleEl = kdCinematic.querySelector("#race-kd-title");
  const kdSubEl = kdCinematic.querySelector("#race-kd-sub");

  const posNumEl = hud.querySelector("#race-pos-num");
  const sectorLabelEl = hud.querySelector("#race-sector-label");
  const lapTextEl = hud.querySelector("#race-lap-text");
  const speedValEl = hud.querySelector("#race-speed-val");
  const gearPillEl = hud.querySelector("#race-gear-pill");
  const slopeTagEl = hud.querySelector("#race-slope-tag");
  const nitroStateEl = hud.querySelector("#race-nitro-state");
  const nitroTrackEl = hud.querySelector(".race-nitro-track");
  const nitroFillEl = hud.querySelector("#race-nitro-fill");
  const shockPromptEl = hud.querySelector("#race-shock-prompt");
  const finishWreathEl = hud.querySelector("#race-finish-wreath");
  const finishTitleEl = hud.querySelector("#race-finish-title");
  const finishSubEl = hud.querySelector("#race-finish-sub");
  const centerBannerEl = hud.querySelector("#race-center-banner");
  const toastEl = hud.querySelector("#race-status-toast");
  const liveBadgeEl = hud.querySelector("#race-live-badge");
  const rivalAlertEl = hud.querySelector("#race-rival-alert");
  const minimapCanvas = hud.querySelector("#race-minimap");
  const minimapCtx = minimapCanvas.getContext("2d");
  const touchDriftBtn = hud.querySelector("#race-touch-drift");
  const touchNitroBtn = hud.querySelector("#race-touch-nitro");
  const touchShockBtn = hud.querySelector("#race-touch-shock");

  const podiumBackdrop = document.createElement("div");
  podiumBackdrop.id = "race-podium-backdrop";
  podiumBackdrop.hidden = true;
  document.body.append(podiumBackdrop);

  let active = false;
  let finishing = false;
  let finishCelebrationTimer = 0;
  let finishRankLocked = 1;
  let finished = false;
  let mapSelectOpen = false;
  let countdown = 3.2;
  let raceTime = 0;
  let playerDist = 0;
  let playerLat = 0;
  let playerSpeed = 0;
  let lateralVel = 0;
  let steerSm = 0;
  let prevLap = 1;
  let headingYaw = 0;
  let yawRate = 0;
  let slipAngle = 0;
  let frontSteer = 0;
  let drifting = false;
  let driftMeters = 0;
  let chassisPitch = 0;
  let chassisRoll = 0;
  let currentGear = 1;
  let gearShiftTimer = 0;
  let airHeight = 0;
  let airVelY = 0;
  let stuntSpinYaw = 0;
  let stuntSpinRate = 0;
  let stuntBarrelRoll = 0;
  let stuntBarrelRate = 0;
  let slipstreaming = false;
  let takedowns = 0;
  let stuntsDone = 0;
  let nitro = 45;
  let nitroActive = false;
  let boostTailTimer = 0;
  let shockwaveActive = false;
  let rescueTimer = 0;
  let rescueFromLat = 0;
  let orbsCollected = 0;
  let topSpeedKmh = 0;
  let toastTimer = 0;
  let touchDriftHeld = false;
  let touchNitroHeld = false;
  let touchShockTapped = false;
  let queuedSpaceTap = false;
  let queuedShiftTap = false;
  let lastShiftTap = -1;
  let prevShiftDown = false;
  let prevSpaceDown = false;
  window.addEventListener("keydown", e => {
    if (!active || finished || mapSelectOpen || countdown > 0) return;
    if (e.code === "Space" && !e.repeat) queuedSpaceTap = true;
    if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) queuedShiftTap = true;
  });
  let podiumKeyHandler = null;
  let currentChassis = "explorer";
  let camBackSm = 5.8;
  let camLatSm = 0;
  let camYawSm = 0;
  let kdCamTimer = 0;
  let kdCamRival = null;
  const wheelLoads = [1, 1, 1, 1, 1, 1];
  const dishSweepTarget = new THREE.Vector3();

  const camPos = new THREE.Vector3();
  const camUp = new THREE.Vector3(0, 1, 0);
  const camTarget = new THREE.Vector3();
  const desiredCamPos = new THREE.Vector3();
  const desiredCamTarget = new THREE.Vector3();
  const pFrame = { u: 0, p: new THREE.Vector3(), T: new THREE.Vector3(), R: new THREE.Vector3(), U: new THREE.Vector3(), curv: 0, inverted: false };
  const rFrame = { u: 0, p: new THREE.Vector3(), T: new THREE.Vector3(), R: new THREE.Vector3(), U: new THREE.Vector3(), curv: 0, inverted: false };
  const roverBasis = new THREE.Matrix4();
  const negT = new THREE.Vector3();
  const localRot = new THREE.Euler();
  const localQuat = new THREE.Quaternion();

  applyTrackMap(0);

  function showToast(msg) {
    if (kdCamTimer > 0) return;
    toastEl.textContent = msg;
    toastEl.dataset.show = "true";
    toastTimer = 1.65;
  }

  function clearPodiumKeys() {
    if (podiumKeyHandler) {
      window.removeEventListener("keydown", podiumKeyHandler);
      podiumKeyHandler = null;
    }
  }

  function triggerTakedownCutaway(rv, methodLabel) {
    const sideSign = rv.lat >= playerLat ? 1 : -1;
    rv.kdTimer = 1.75;
    rv.kdSpin = 0;
    rv.kdHeight = 0;
    rv.kdSide = sideSign;
    rv.kdStartLat = rv.lat;
    rv.kdTargetLat = THREE.MathUtils.clamp(rv.lat + sideSign * 3.5, -TRACK_HALF_W + 0.9, TRACK_HALF_W - 0.9);
    rv.aiNitroTimer = 0;
    rv.aiBoosting = false;
    rv.speed = Math.max(16, playerSpeed * 0.68);
    rv.dist = Math.max(rv.dist, playerDist + 2.8);
    placeOnTrack(rv.group, rv.dist, rv.lat, 0.05);
    takedowns += 1;
    nitro = Math.min(100, nitro + (nitroActive || shockwaveActive ? 30 : 35));
    playerSpeed = Math.min(38.5, playerSpeed + 3.0);
    emitSparks(rv.group.position, pFrame.T, pFrame.U, 26);
    emitShatterDebris(rv.group.position, pFrame.U, rv.dist, rv.lat);
    playTakedownCrashSfx();
    kdCamTimer = 1.42;
    kdCamRival = rv;
    kdTitleEl.textContent = t(`💥 KNOCKDOWN! // ${methodLabel}`, `💥 KNOCKDOWN! // ${methodLabel}`);
    kdSubEl.textContent = t(`击碎弹飞 ${rv.name} · 赏金 +40 矿币 & +35% 氮气`, `${rv.name} SHATTERED · +40 CR & +35% NITRO`);
    kdCinematic.dataset.active = "true";
    toastEl.dataset.show = "false";
    liveBadgeEl.dataset.show = "false";
    rivalAlertEl.dataset.show = "false";
    onHitStop?.(0.055);
    onJuice?.({ crit: true, tier: 3 });
  }

  touchDriftBtn.addEventListener("pointerdown", e => { e.preventDefault(); touchDriftHeld = true; });
  const endTouchDrift = () => { touchDriftHeld = false; };
  touchDriftBtn.addEventListener("pointerup", endTouchDrift);
  touchDriftBtn.addEventListener("pointercancel", endTouchDrift);

  touchNitroBtn.addEventListener("pointerdown", e => { e.preventDefault(); touchNitroHeld = true; });
  const endTouchNitro = () => { touchNitroHeld = false; };
  touchNitroBtn.addEventListener("pointerup", endTouchNitro);
  touchNitroBtn.addEventListener("pointercancel", endTouchNitro);
  touchShockBtn.addEventListener("pointerdown", e => { e.preventDefault(); touchShockTapped = true; });

  hud.querySelector("#race-map-btn").addEventListener("click", () => {
    openMapSelectModal();
  });
  hud.querySelector("#race-quit").addEventListener("click", () => {
    stop();
    onExitMenu?.();
  });

  function drawMinimap() {
    const ctx = minimapCtx;
    ctx.clearRect(0, 0, 124, 124);
    ctx.save();
    ctx.translate(62, 62);
    const scale = 0.44;
    ctx.beginPath();
    for (let i = 0; i <= TRACK_SAMPLES; i += 6) {
      const fr = track.frames[i % TRACK_SAMPLES];
      const mx = fr.p.x * scale;
      const my = fr.p.z * scale;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.strokeStyle = `${track.mapDef.swatch}88`;
    ctx.lineWidth = 4;
    ctx.stroke();

    for (const rv of rivals) {
      track.sampleAtDist(rv.dist, rFrame);
      ctx.fillStyle = `#${rv.color.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      ctx.arc(rFrame.p.x * scale, rFrame.p.z * scale, 3.3, 0, TAU);
      ctx.fill();
    }
    track.sampleAtDist(playerDist, rFrame);
    ctx.fillStyle = shockwaveActive ? "#ff79f9" : "#ffffff";
    ctx.beginPath();
    ctx.arc(rFrame.p.x * scale, rFrame.p.z * scale, 4.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function currentRank() {
    let rank = 1;
    for (const rv of rivals) {
      if (rv.dist > playerDist) rank++;
    }
    return rank;
  }

  function rankSuffix(r) {
    return r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : "4th";
  }

  function openMapSelectModal() {
    clearPodiumKeys();
    mapSelectOpen = true;
    kdCinematic.dataset.active = "false";
    onPauseChange?.(true);
    let focusIdx = currentMapIdx;

    function selectMapAndStart(idx) {
      clearPodiumKeys();
      mapSelectOpen = false;
      podiumBackdrop.hidden = true;
      onPauseChange?.(false);
      launchRaceOnMap(idx);
    }

    function renderMapSelect() {
      podiumBackdrop.innerHTML = `
        <div class="race-podium-card">
          <div style="font:600 10px/1 'IBM Plex Mono',monospace;letter-spacing:.22em;color:#74ffd8;">ORBITAL MAG-LEV GRAND PRIX // CIRCUIT SELECT</div>
          <h2 style="margin:0;font-size:22px;color:#fffaf0;letter-spacing:.06em;">${t("选择星际竞速赛道（3 张专属地貌街景 · 3 圈制）", "Select Grand Prix Circuit (3 Distinct Worlds · 3 Laps)")}</h2>
          <div class="race-map-grid">
            ${RACE_MAPS.map((m, idx) => `
              <button type="button" class="race-map-card" data-map-idx="${idx}" data-kb-focus="${idx === focusIdx}" style="--m-col:${m.swatch};">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                    <span style="font:700 9.5px/1 'IBM Plex Mono',monospace;color:${m.swatch};">${m.code.split("//")[0]}</span>
                    <span style="font:600 9.5px/1 'IBM Plex Mono',monospace;padding:2px 6px;background:#ffffff14;color:#e0eef4;">${t(m.diff, m.diffEn)}</span>
                  </div>
                  <div style="font-size:16px;font-weight:780;color:#fffaf0;margin:6px 0 4px;">${t(m.name, m.nameEn)}</div>
                  <div style="font-size:11.5px;color:#9eb6c2;line-height:1.45;">${t(m.desc, m.descEn)}</div>
                </div>
                <div style="margin-top:6px;padding:5px 8px;border:1px solid ${m.swatch}66;background:${idx === focusIdx ? `${m.swatch}22` : "#00000033"};font:700 10.5px/1 'IBM Plex Mono',monospace;color:${m.swatch};text-align:center;">
                  [${idx + 1}] ${idx === focusIdx ? t("按 ENTER 立即发车", "PRESS ENTER TO RACE") : t("点击或方向键选择", "SELECT CIRCUIT")}
                </div>
              </button>
            `).join("")}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <span style="font:500 10.5px/1 'IBM Plex Mono',monospace;color:#8fb2be;">${t("[← / → / A / D] 切换赛道 · [Enter / 空格] 确认发车 · [1 / 2 / 3] 快捷键", "[← / → / A / D] Switch · [Enter / Space] Start Race")}</span>
            <button type="button" class="ext-btn" id="race-map-cancel">${t("返回首页", "Main Menu")}</button>
          </div>
        </div>
      `;
      for (const btn of podiumBackdrop.querySelectorAll("[data-map-idx]")) {
        btn.addEventListener("mouseenter", () => {
          focusIdx = Number(btn.dataset.mapIdx);
          podiumBackdrop.querySelectorAll("[data-map-idx]").forEach((el, i) => { el.dataset.kbFocus = String(i === focusIdx); });
        });
        btn.addEventListener("click", () => selectMapAndStart(Number(btn.dataset.mapIdx)));
      }
      podiumBackdrop.querySelector("#race-map-cancel").addEventListener("click", () => {
        clearPodiumKeys();
        mapSelectOpen = false;
        podiumBackdrop.hidden = true;
        stop();
        onExitMenu?.();
      });
    }

    podiumKeyHandler = event => {
      if (!mapSelectOpen) return;
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        focusIdx = (focusIdx + RACE_MAPS.length - 1) % RACE_MAPS.length;
        renderMapSelect();
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        focusIdx = (focusIdx + 1) % RACE_MAPS.length;
        renderMapSelect();
      } else if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        selectMapAndStart(focusIdx);
      } else if (["Digit1", "Digit2", "Digit3"].includes(event.code)) {
        event.preventDefault();
        selectMapAndStart(Number(event.code.slice(-1)) - 1);
      }
    };
    window.addEventListener("keydown", podiumKeyHandler);
    podiumBackdrop.hidden = false;
    renderMapSelect();
  }

  function openPodiumModal() {
    finished = true;
    nitroActive = false;
    shockwaveActive = false;
    drifting = false;
    kdCamTimer = 0;
    kdCinematic.dataset.active = "false";
    updateRaceEngineAudio();
    onPauseChange?.(true);
    const rank = currentRank();
    const baseReward = [300, 210, 145, 95][rank - 1];
    const bonusCredits = orbsCollected * 8 + takedowns * 40 + stuntsDone * 25;
    const totalCredits = baseReward + bonusCredits;
    let claimed = false;
    let focusIdx = 0;
    const nextMap = RACE_MAPS[(currentMapIdx + 1) % RACE_MAPS.length];

    function bankIfNeeded(mult = 1) {
      if (claimed) return;
      claimed = true;
      onFinishCoins?.(totalCredits * mult, "orbital_race");
    }

    function doNextMap() {
      clearPodiumKeys();
      bankIfNeeded(1);
      podiumBackdrop.hidden = true;
      onPauseChange?.(false);
      launchRaceOnMap((currentMapIdx + 1) % RACE_MAPS.length);
    }
    function doPickMap() {
      clearPodiumKeys();
      bankIfNeeded(1);
      openMapSelectModal();
    }
    function doHangar() {
      clearPodiumKeys();
      bankIfNeeded(1);
      podiumBackdrop.hidden = true;
      stop();
      onOpenHangar?.();
    }
    function doMenu() {
      clearPodiumKeys();
      bankIfNeeded(1);
      podiumBackdrop.hidden = true;
      stop();
      onExitMenu?.();
    }

    function renderPodium() {
      podiumBackdrop.innerHTML = `
        <div class="race-podium-card">
          <div style="font:600 10px/1 'IBM Plex Mono',monospace;letter-spacing:.22em;color:#d69eff;">${track.mapDef.code} // 3 LAPS COMPLETE</div>
          <div class="race-podium-rank">${rank === 1 ? t("第 1 名 · 狂野轨道冠军!", "1ST PLACE · CHAMPION!") : t(`第 ${rank} 名完赛`, `${rankSuffix(rank).toUpperCase()} PLACE`)}</div>
          <div style="font-size:12.5px;color:#b8ced8;">${t(`已获得机库通用矿币 +${totalCredits} CR（狂野击毁 ${takedowns} 次 · 特技 ${stuntsDone} 次 · 氦-3 能量瓶 ${orbsCollected} 支）`, `Earned +${totalCredits} Hangar Credits (${takedowns} Takedowns · ${stuntsDone} Stunts · ${orbsCollected} He-3 Cells)!`)}</div>
          <div class="race-podium-stats">
            <div class="race-podium-stat"><span>${t("3圈总用时", "3-LAP TIME")}</span><strong>${raceTime.toFixed(1)}s</strong></div>
            <div class="race-podium-stat"><span>${t("最高表显极速", "TOP SPEED")}</span><strong>${topSpeedKmh} KM/H</strong></div>
            <div class="race-podium-stat"><span>${t("狂野击毁", "KNOCKDOWNS")}</span><strong style="color:#ff85c0;">${takedowns} KD</strong></div>
            <div class="race-podium-stat"><span>${t("总奖金", "CREDITS")}</span><strong style="color:#ffd778;">+${totalCredits} CR</strong></div>
          </div>
          <div class="race-podium-actions">
            <button type="button" class="ext-btn primary" id="race-next-map" data-kb-focus="${focusIdx === 0}">${t(`下一张图：${nextMap.name} [Enter]`, `Next: ${nextMap.nameEn} [Enter]`)}</button>
            <button type="button" class="ext-btn" id="race-pick-map" data-kb-focus="${focusIdx === 1}">${t("自选赛道 (3张)", "Select Circuit (3)")}</button>
            <button type="button" class="ext-btn rv" id="race-hangar" data-kb-focus="${focusIdx === 2}">${t("进入机库改装", "Open 3D Hangar")}</button>
            <button type="button" class="ext-btn" id="race-menu" data-kb-focus="${focusIdx === 3}">${t("返回首页", "Main Menu")}</button>
          </div>
          <div style="font:500 10.5px/1 'IBM Plex Mono',monospace;color:#8fb2be;">${t("[← / → / A / D] 切换选项 · [Enter / 空格] 确认", "[← / → / A / D] Switch · [Enter / Space] Confirm")}</div>
        </div>
      `;
      podiumBackdrop.querySelector("#race-next-map").addEventListener("click", doNextMap);
      podiumBackdrop.querySelector("#race-pick-map").addEventListener("click", doPickMap);
      podiumBackdrop.querySelector("#race-hangar").addEventListener("click", doHangar);
      podiumBackdrop.querySelector("#race-menu").addEventListener("click", doMenu);
    }

    podiumKeyHandler = event => {
      if (!finished || mapSelectOpen) return;
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        focusIdx = (focusIdx + 3) % 4;
        renderPodium();
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        focusIdx = (focusIdx + 1) % 4;
        renderPodium();
      } else if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (focusIdx === 0) doNextMap();
        else if (focusIdx === 1) doPickMap();
        else if (focusIdx === 2) doHangar();
        else doMenu();
      }
    };
    window.addEventListener("keydown", podiumKeyHandler);
    podiumBackdrop.hidden = false;
    renderPodium();
  }

  function launchRaceOnMap(mapIdx = currentMapIdx) {
    clearPodiumKeys();
    active = true;
    applyTrackMap(mapIdx);
    finishing = false;
    finishCelebrationTimer = 0;
    finishRankLocked = 1;
    finished = false;
    mapSelectOpen = false;
    countdown = 3.2;
    raceTime = 0;
    playerDist = 0;
    playerLat = 0;
    playerSpeed = 0;
    lateralVel = 0;
    steerSm = 0;
    prevLap = 1;
    headingYaw = 0;
    yawRate = 0;
    slipAngle = 0;
    frontSteer = 0;
    drifting = false;
    driftMeters = 0;
    chassisPitch = 0;
    chassisRoll = 0;
    currentGear = 1;
    gearShiftTimer = 0;
    airHeight = 0;
    airVelY = 0;
    stuntSpinYaw = 0;
    stuntSpinRate = 0;
    stuntBarrelRoll = 0;
    stuntBarrelRate = 0;
    slipstreaming = false;
    takedowns = 0;
    stuntsDone = 0;
    nitro = 45;
    nitroActive = false;
    shockwaveActive = false;
    boostTailTimer = 0;
    rescueTimer = 0;
    orbsCollected = 0;
    topSpeedKmh = 0;
    toastTimer = 0;
    touchDriftHeld = false;
    touchNitroHeld = false;
    touchShockTapped = false;
    queuedSpaceTap = false;
    queuedShiftTap = false;
    prevShiftDown = false;
    prevSpaceDown = false;
    camBackSm = 5.6;
    camLatSm = 0;
    camYawSm = 0;
    kdCamTimer = 0;
    kdCamRival = null;
    kdCinematic.dataset.active = "false";
    kdRing.visible = false;
    kdInnerRing.visible = false;
    kdFlashCore.visible = false;
    finishHaloRing.visible = false;
    for (const wp of wreckParts) wp.mesh.visible = false;
    sparks.length = 0;
    sparkMesh.count = 0;
    debrisList.length = 0;
    debrisMesh.count = 0;
    smokePuffs.length = 0;
    smokeMesh.count = 0;
    confettiList.length = 0;
    confettiMesh.count = 0;
    shockPromptEl.dataset.show = "false";
    finishWreathEl.dataset.show = "false";

    startRaceAudio();
    playCountdownCue(3);

    for (const rv of rivals) {
      rv.dist = rv.startOffset;
      rv.lat = rv.laneBias;
      rv.speed = 0;
      rv.headingYaw = 0;
      rv.hitCooldown = 0;
      rv.kdTimer = 0;
      rv.kdHeight = 0;
      rv.kdSpin = 0;
      rv.kdSide = 1;
      rv.kdStartLat = rv.laneBias;
      rv.kdTargetLat = rv.laneBias;
      rv.aiBoosting = false;
      rv.aiNitroTimer = 0;
      rv.aiNitroCooldown = 3.2 + rv.idx * 2.3;
      rv.respawnGrace = 0;
      placeOnTrack(rv.group, rv.dist, rv.lat, 0.02);
    }
    rescueBeam.visible = false;
    group.visible = true;
    hud.hidden = false;
    podiumBackdrop.hidden = true;
    toastEl.dataset.show = "false";
    liveBadgeEl.dataset.show = "false";
    rivalAlertEl.dataset.show = "false";

    track.sampleAtDist(0, pFrame);
    roverRig.rover.position.copy(pFrame.p).addScaledVector(pFrame.U, 0.02);
    negT.copy(pFrame.T).negate();
    roverBasis.makeBasis(pFrame.R, pFrame.U, negT);
    roverRig.rover.quaternion.setFromRotationMatrix(roverBasis);
    camPos.copy(pFrame.p).addScaledVector(pFrame.T, -6.2).addScaledVector(pFrame.U, 2.5);
    camUp.copy(pFrame.U);
    camTarget.copy(pFrame.p).addScaledVector(pFrame.T, 5.0).addScaledVector(pFrame.U, 0.9);
    camera.position.copy(camPos);
    camera.up.copy(camUp);
    camera.lookAt(camTarget);
    drawMinimap();
  }

  function start(chassisId = "explorer", mapIdx = currentMapIdx) {
    currentChassis = chassisId;
    launchRaceOnMap(mapIdx);
  }

  function stop() {
    clearPodiumKeys();
    stopRaceAudio();
    if (active) onMapBiomeChange?.(null);
    active = false;
    finishing = false;
    finishCelebrationTimer = 0;
    finished = false;
    mapSelectOpen = false;
    nitroActive = false;
    shockwaveActive = false;
    drifting = false;
    kdCamTimer = 0;
    kdCinematic.dataset.active = "false";
    shockPromptEl.dataset.show = "false";
    finishWreathEl.dataset.show = "false";
    finishHaloRing.visible = false;
    rescueBeam.visible = false;
    group.visible = false;
    hud.hidden = true;
    podiumBackdrop.hidden = true;
    camera.up.set(0, 1, 0);
  }

  function update(rawDt, visualTime, inputs) {
    if (!active) return null;
    const { totalLen, sampleAtDist } = track;

    // Spin the colossal 22m Orbital Gyro-Rings on Map 3!
    if (currentMapIdx === 2) {
      for (const r of antigravRings) {
        const sp = r.mesh.userData.spinner;
        if (sp) sp.rotation.z = visualTime * r.mesh.userData.spinSpeed;
      }
    }

    if (inputs.mapSelect && !mapSelectOpen && !finished) {
      openMapSelectModal();
    }
    if (mapSelectOpen) {
      return { speedFx: 0, shockwave: false, nitro: false, speedKmh: 0 };
    }

    let dt = rawDt;
    if (kdCamTimer > 0) {
      kdCamTimer = Math.max(0, kdCamTimer - rawDt);
      const slowScale = kdCamTimer > 0.55 ? 0.34 : THREE.MathUtils.lerp(1.0, 0.34, kdCamTimer / 0.55);
      dt = rawDt * slowScale;
      if (kdCamTimer === 0) {
        kdCinematic.dataset.active = "false";
        kdCamRival = null;
      }
    }

    trackUniforms.uTime.value = visualTime;
    trackUniforms.uShock.value = THREE.MathUtils.damp(trackUniforms.uShock.value, shockwaveActive ? 1 : 0, 10, dt);

    if (toastTimer > 0) {
      toastTimer = Math.max(0, toastTimer - rawDt);
      if (toastTimer === 0) toastEl.dataset.show = "false";
    }

    for (const orb of orbs) {
      if (orb.active) {
        orb.mesh.rotation.y = visualTime * 3.1;
        orb.mesh.rotation.x = visualTime * 1.9;
      } else if (orb.respawn > 0) {
        orb.respawn -= dt;
        if (orb.respawn <= 0) {
          orb.active = true;
          orb.mesh.visible = true;
        }
      }
    }
    for (const pad of boostPads) {
      if (pad.cd > 0) pad.cd = Math.max(0, pad.cd - dt);
    }
    for (const ramp of stuntRamps) {
      if (ramp.cd > 0) ramp.cd = Math.max(0, ramp.cd - dt);
    }
    for (const ob of obstacles) {
      if (ob.cd > 0) ob.cd = Math.max(0, ob.cd - dt);
    }

    if (finished) {
      sampleAtDist(playerDist, pFrame);
      const a = visualTime * 0.45;
      desiredCamPos.copy(roverRig.rover.position)
        .addScaledVector(pFrame.R, Math.sin(a) * 5.8)
        .addScaledVector(pFrame.T, Math.cos(a) * 5.8)
        .addScaledVector(pFrame.U, 2.3);
      camera.position.lerp(desiredCamPos, 1 - Math.exp(-3 * rawDt));
      camera.up.lerp(pFrame.U, 1 - Math.exp(-4 * rawDt)).normalize();
      camera.lookAt(roverRig.rover.position);
      return { speedFx: 0, shockwave: false, nitro: false, speedKmh: 0 };
    }

    // Countdown 3-2-1-GO! Articulated mechanical pre-launch sequence (steering check, radar scan, rear suspension torque squat — NO rigid toy shake!)
    if (countdown > 0) {
      const prevSec = Math.ceil(countdown);
      countdown = Math.max(0, countdown - rawDt);
      const curSec = Math.ceil(countdown);

      sampleAtDist(0, pFrame);
      roverRig.rover.position.copy(pFrame.p).addScaledVector(pFrame.U, 0.02);
      negT.copy(pFrame.T).negate();
      roverBasis.makeBasis(pFrame.R, pFrame.U, negT);
      roverRig.rover.quaternion.setFromRotationMatrix(roverBasis);

      // Phase-driven mechanical subsystem animation:
      // 3 // READY: hydraulic steering knuckle sweep + radar dish pan across starting arch
      // 2 // IGNITION & 1 // LAUNCH: smooth engine torque pulses compressing rear coilover suspension & lifting nose
      const isReadyPhase = countdown >= 2.15;
      const revPulse = isReadyPhase
        ? 0
        : countdown < 1.08
          ? 0.72 + 0.28 * smoothstep(1.08 - countdown, 0, 0.95)
          : Math.pow(Math.max(0, Math.sin((2.15 - countdown) * 5.2)), 2);
      const revPitch = 0.042 * revPulse;
      const revRoll = isReadyPhase ? 0 : Math.sin(visualTime * 2.8) * 0.011 * revPulse;
      localRot.set(revPitch, 0, revRoll, "YXZ");
      localQuat.setFromEuler(localRot);
      roverRig.rover.quaternion.multiply(localQuat);

      const steerCheckAngle = isReadyPhase
        ? Math.sin(((3.2 - countdown) / 1.05) * TAU) * 0.38
        : 0;
      for (let i = 0; i < 6; i++) {
        const w = roverRig.wheelHubs[i];
        const axleZ = w.z;
        const load = axleZ < -0.2
          ? 1.0 - 0.26 * revPulse
          : axleZ > 0.2
            ? 1.0 + 0.65 * revPulse
            : 1.0 + 0.14 * revPulse;
        wheelLoads[i] = load;
        const { hub, mount = hub, steering, tireRadius = 0.275 } = w;
        const ext = THREE.MathUtils.clamp((1.0 - load) * 0.046, -0.075, 0.065);
        mount.position.y = tireRadius + ext;
        if (!isReadyPhase && axleZ > 0.15) {
          hub.rotation.x -= (1.8 * revPulse) * rawDt; // Subtle rear tire clutch tension against launch brakes
        }
        if (steering) {
          steering.rotation.y = THREE.MathUtils.damp(steering.rotation.y, -Math.sign(axleZ) * steerCheckAngle, 10, rawDt);
        }
      }
      roverRig.updateSuspension?.(wheelLoads);

      // Pan dorsal optical/radar mast smoothly across the starting gate during 3 // READY, then lock forward
      const panSweep = isReadyPhase ? Math.sin(((3.2 - countdown) / 1.05) * TAU) * 4.5 : 0;
      dishSweepTarget.copy(pFrame.p)
        .addScaledVector(pFrame.T, 9.5)
        .addScaledVector(pFrame.R, panSweep)
        .addScaledVector(pFrame.U, 2.2);
      roverRig.aimDataDish?.(dishSweepTarget, rawDt);

      const revFlame = !isReadyPhase && (countdown < 1.08 || revPulse > 0.28);
      roverRig.setBoostVisual?.(revFlame, rawDt, visualTime, countdown < 0.85);
      roverRig.setVisualEvolution?.({
        shield: 0, magnetTarget: null, stuntGlow: 0.55 + 0.35 * revPulse, fever: revFlame, shockwave: countdown < 0.8, dt: rawDt, time: visualTime,
      });
      for (const rv of rivals) {
        rv.rig.setBoostVisual?.(countdown < 1.85, rawDt, visualTime, false);
      }

      if (countdown >= 2.15) {
        const p = 1 - (countdown - 2.15) / 1.05;
        desiredCamPos.copy(pFrame.p)
          .addScaledVector(pFrame.R, 1.85 - p * 0.45)
          .addScaledVector(pFrame.T, 2.35 - p * 0.65)
          .addScaledVector(pFrame.U, 0.68 + p * 0.18);
        desiredCamTarget.copy(pFrame.p)
          .addScaledVector(pFrame.T, 0.25)
          .addScaledVector(pFrame.U, 0.56);
        camera.fov = 38;
      } else if (countdown >= 1.08) {
        const p = 1 - (countdown - 1.08) / 1.07;
        desiredCamPos.copy(pFrame.p)
          .addScaledVector(pFrame.R, -1.55 - p * 0.25)
          .addScaledVector(pFrame.T, -1.85 - p * 0.55)
          .addScaledVector(pFrame.U, 0.64 + p * 0.22);
        desiredCamTarget.copy(pFrame.p)
          .addScaledVector(pFrame.T, 1.4)
          .addScaledVector(pFrame.U, 0.62);
        camera.fov = 42;
      } else {
        const p = smoothstep(1.08 - countdown, 0, 1.08);
        const orbitA = (1 - p) * 1.15;
        const dist = THREE.MathUtils.lerp(4.4, 5.6, p);
        const h = THREE.MathUtils.lerp(1.45, 2.48, p);
        desiredCamPos.copy(pFrame.p)
          .addScaledVector(pFrame.R, Math.sin(orbitA) * dist * 0.75)
          .addScaledVector(pFrame.T, -Math.cos(orbitA) * dist)
          .addScaledVector(pFrame.U, h);
        desiredCamTarget.copy(pFrame.p)
          .addScaledVector(pFrame.T, THREE.MathUtils.lerp(1.5, 4.5, p))
          .addScaledVector(pFrame.U, 0.75);
        camera.fov = THREE.MathUtils.lerp(42, 46, p);
      }
      camera.updateProjectionMatrix();
      camPos.copy(desiredCamPos);
      camUp.copy(pFrame.U);
      camTarget.copy(desiredCamTarget);
      camera.position.copy(camPos);
      camera.up.copy(camUp);
      camera.lookAt(camTarget);
      updateRaceEngineAudio();

      if (countdown > 0) {
        const label = curSec === 3 ? "3 // READY" : curSec === 2 ? "2 // IGNITION" : "1 // LAUNCH";
        centerBannerEl.textContent = label;
        centerBannerEl.style.opacity = "1";
        if (curSec !== prevSec) {
          playCountdownCue(curSec);
          onJuice?.({ crit: false, tier: 2 });
        }
      } else {
        centerBannerEl.textContent = "GO!!";
        playCountdownCue(0);
        playerSpeed = 10.5; // Starts from a realistic launch speed and climbs progressively through 5 gears!
        chassisPitch = 0.065;
        onJuice?.({ crit: true, tier: 3 });
        setTimeout(() => { if (active) centerBannerEl.style.opacity = "0"; }, 750);
      }
      return { speedFx: countdown < 0.25 ? 0.45 : 0, shockwave: false, nitro: false, speedKmh: 0 };
    }

    updateRaceEngineAudio();
    raceTime += rawDt;
    const gasHeld = inputs.throttle > 0.05;
    const brakeHeld = inputs.throttle < -0.05 || Boolean(inputs.brake);
    const rawSteer = kdCamTimer > 0 ? THREE.MathUtils.clamp(-playerLat * 0.18, -0.4, 0.4) : inputs.steer;
    // Shift = Drift (on ground) & 360° Barrel Roll Stunt (on ramps / mid-air)
    const shiftDown = Boolean(inputs.nitro || touchDriftHeld);
    // Space = Burn Nitro / Super Shockwave Boost (visibly drains bar to 0%)
    const spaceDown = Boolean(inputs.shockwave || touchNitroHeld || touchShockTapped);
    const spaceTapped = queuedSpaceTap || (spaceDown && !prevSpaceDown);
    const shiftTapped = queuedShiftTap || (shiftDown && !prevShiftDown);
    queuedSpaceTap = false;
    queuedShiftTap = false;
    touchShockTapped = false;
    prevShiftDown = shiftDown;
    prevSpaceDown = spaceDown;

    if (spaceTapped && rescueTimer <= 0 && !nitroActive && !shockwaveActive) {
      if (nitro >= 70) {
        shockwaveActive = true;
        nitroActive = true;
        if (drifting) {
          drifting = false;
          playerSpeed = Math.min(39.5, playerSpeed + 3.2);
        }
        camBackSm = Math.min(7.2, camBackSm + 1.25);
        chassisPitch = 0.085;
        onHitStop?.(0.036);
        onJuice?.({ crit: true, tier: 3 });
        showToast(t("💥 紫金脉冲爆发！能量全速倾泻 · 撞击对手触发击毁特写!", "💥 SHOCKWAVE! BURNING NITRO — RAM RIVALS TO KNOCKDOWN!"));
      } else if (nitro >= 15) {
        nitroActive = true;
        shockwaveActive = false;
        if (drifting) {
          drifting = false;
          playerSpeed = Math.min(36.5, playerSpeed + 2.0);
        }
        camBackSm = Math.min(6.8, camBackSm + 0.72);
        chassisPitch = Math.max(chassisPitch, 0.06);
        onJuice?.({ crit: false, tier: 2 });
        showToast(t("🔥 氮气推进点火！消耗氮气能量全力提速!", "🔥 NITRO BOOST IGNITED! BURNING ENERGY!"));
      } else {
        showToast(t("⚡ 氮气不足（需 ≥15%）！按 [Shift] 甩尾漂移或吃金币充能", "⚡ LOW NITRO (<15%)! DRIFT WITH [SHIFT] OR COLLECT ORBS!"));
      }
    }

    const isUfo = currentChassis === "ufo";
    const falconBonus = currentChassis === "falcon" ? 1.06 : isUfo ? 1.04 : 1.0;
    const titanBonus = currentChassis === "titan" ? 1.30 : isUfo ? 1.45 : 1.0;
    const steerAgility = isUfo ? 1.22 : currentChassis === "falcon" ? 1.10 : 1.0;
    const driftNitroMult = isUfo ? 1.55 : 1.0;

    sampleAtDist(playerDist, pFrame);

    if (rescueTimer > 0) {
      rescueTimer = Math.max(0, rescueTimer - dt);
      const p = 1 - rescueTimer;
      playerLat = THREE.MathUtils.lerp(rescueFromLat, 0, smoothstep(p, 0, 1));
      headingYaw = THREE.MathUtils.damp(headingYaw, 0, 8, dt);
      slipAngle = THREE.MathUtils.damp(slipAngle, 0, 8, dt);
      lateralVel = 0;
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 16, dt * 4);
      playerDist += playerSpeed * dt * 0.5;
      nitroActive = false;
      shockwaveActive = false;
      drifting = false;
      airHeight = 0;
      rescueBeam.visible = true;
      placeOnTrack(rescueBeam, playerDist, playerLat, 3.2);
      if (rescueTimer === 0) {
        rescueBeam.visible = false;
        playerSpeed = 22;
        // Give the player a fair 4s breather after tractor-beam respawn so AI rivals don't blast past with Nitro immediately
        for (const rv of rivals) {
          rv.aiNitroTimer = 0;
          rv.aiNitroCooldown = Math.max(rv.aiNitroCooldown, 4.5);
          rv.respawnGrace = Math.max(rv.respawnGrace || 0, 3.5);
        }
        showToast(t("轨道牵引复位完成 · 全速冲刺！", "TRACTOR BEAM RESCUE COMPLETE!"));
      }
    } else {
      rescueBeam.visible = false;

      // 1. Check Slipstream (drafting behind an AI rival within 18m!)
      slipstreaming = false;
      for (const rv of rivals) {
        if (rv.kdTimer > 0) continue;
        const ahead = rv.dist - playerDist;
        if (ahead > 2.2 && ahead < 18.5 && Math.abs(rv.lat - playerLat) < 2.0) {
          slipstreaming = true;
          break;
        }
      }

      // 2. Shift / Brake Power-Drift Initiation (Shift + Steer, OR S/Down + Steer on Ground!)
      const driftKeyHeld = shiftDown || brakeHeld;
      const sharpTurnDrift = driftKeyHeld && (Math.abs(rawSteer) > 0.10 || Math.abs(pFrame.curv) > 0.012) && playerSpeed > 10.5 && airHeight <= 0.08;
      if (sharpTurnDrift) {
        if (!drifting) {
          drifting = true;
          driftMeters = 0;
          onJuice?.({ crit: false, tier: 1 });
        }
      }
      if (drifting) {
        if (shockwaveActive || airHeight > 0.12 || playerSpeed < 9.5 || (!driftKeyHeld && Math.abs(rawSteer) < 0.08 && Math.abs(slipAngle) < 0.10)) {
          drifting = false;
          if (driftMeters > 8) {
            playerSpeed = Math.min(38.0, playerSpeed + 2.2);
          }
        } else {
          driftMeters += playerSpeed * dt;
        }
      }

      // 3. Nitro & Shockwave Energy Decay + High-Inertia Post-Boost Coast-Down Tail
      if (boostTailTimer > 0) boostTailTimer = Math.max(0, boostTailTimer - dt);
      if (shockwaveActive) {
        nitro = Math.max(0, nitro - 38 * dt);
        if (nitro <= 0.5) {
          nitro = 0;
          shockwaveActive = false;
          nitroActive = false;
          boostTailTimer = 2.6;
        }
      } else if (nitroActive) {
        nitro = Math.max(0, nitro - 34 * dt);
        if (nitro <= 0.5) {
          nitro = 0;
          nitroActive = false;
          boostTailTimer = 2.2;
        }
      } else {
        // Only charges actively via Drift, Slipstream, He-3 Cells, Boost Pads, or Ramp Jumps!
        let chargeRate = 0;
        if (drifting) chargeRate += 36.0 * driftNitroMult;
        if (slipstreaming) chargeRate += 15.0;
        if (chargeRate > 0) nitro = Math.min(100, nitro + chargeRate * dt);
      }

      // 4. REALISTIC PROGRESSIVE 5-GEAR ACCELERATION + TERRAIN SLOPE GRAVITY + AERO DRAG + CORNERING SCRUB!
      //    - Uphill (pFrame.T.y > 0) pulls speed down naturally; Downhill (pFrame.T.y < 0) surges speed up!
      //    - Quadratic aerodynamic drag creates a gradual asymptotic climb instead of an instant flatline!
      const slopeGrade = pFrame.T.y; // +0.35 on steep climb, -0.35 on steep dive
      const slopeAccel = -slopeGrade * 14.5; // Real gravity pull along the track slope!
      if (slopeGrade < -0.09) {
        slopeTagEl.textContent = t("▼下坡俯冲", "▼DOWNHILL");
        slopeTagEl.style.color = "#74ffd8";
      } else if (slopeGrade > 0.09) {
        slopeTagEl.textContent = t("▲上坡负载", "▲UPHILL");
        slopeTagEl.style.color = "#ffb366";
      } else {
        slopeTagEl.textContent = "";
      }

      // 5-Gear transmission with brief 0.12s clutch torque kick on upshifts!
      const newGear = playerSpeed < 12.5 ? 1 : playerSpeed < 17.5 ? 2 : playerSpeed < 21.8 ? 3 : playerSpeed < 25.2 ? 4 : 5;
      if (newGear > currentGear && (gasHeld || nitroActive || shockwaveActive)) {
        gearShiftTimer = 0.13;
        chassisPitch = Math.max(chassisPitch, 0.045);
      }
      currentGear = newGear;
      if (gearShiftTimer > 0) gearShiftTimer = Math.max(0, gearShiftTimer - dt);

      const throttleActive = nitroActive || shockwaveActive || gasHeld || kdCamTimer > 0;
      // Engine drive force diminishes in higher gears while quadratic aero drag (k * v^2) grows -> organic asymptotic curve!
      const gearDriveForce = [14.5, 11.2, 8.6, 6.8, 5.4][currentGear - 1] * falconBonus;
      const boostForce = shockwaveActive ? 22.0 : nitroActive ? 12.5 : slipstreaming ? 3.8 : 0;
      const clutchFactor = gearShiftTimer > 0.06 ? 0.25 : gearShiftTimer > 0 ? 1.45 : 1.0; // Brief clutch dip then surge!
      // Smooth post-boost high-inertia coast-down so speed tapers naturally instead of slamming invisible brakes!
      const tailEase = boostTailTimer > 0 && !nitroActive && !shockwaveActive
        ? 1.0 - 0.58 * Math.min(1, boostTailTimer / 2.2)
        : 1.0;
      const aeroDrag = 0.0088 * playerSpeed * playerSpeed * tailEase;
      const cornerDrag = (drifting ? Math.abs(slipAngle) * 3.8 : Math.abs(headingYaw) * 4.2)
        + Math.abs(pFrame.curv) * playerSpeed * 3.6;

      if (brakeHeld && !drifting) {
        playerSpeed = Math.max(8.5, playerSpeed + (-18.5 + slopeAccel - aeroDrag) * dt);
      } else if (throttleActive) {
        const netAccel = (gearDriveForce * clutchFactor) + boostForce + slopeAccel - aeroDrag - cornerDrag;
        playerSpeed = THREE.MathUtils.clamp(playerSpeed + netAccel * dt, 8.5, shockwaveActive ? 41.0 : 38.5);
      } else {
        // Off-throttle engine braking + slope gravity
        const coastAccel = -3.2 + slopeAccel - aeroDrag * 0.72;
        playerSpeed = THREE.MathUtils.clamp(playerSpeed + coastAccel * dt, 10.5, 36.5);
      }

      // 5. CAR-NOSE-FIRST STEERING DYNAMICS (No lateral strafing! Turn the nose first, let heading pull the car along an arc!)
      //    - Responsive turn-in (k = 11.5) builds an expressive ±23° nose heading (headingYaw) with visible body roll.
      //    - Lateral travel is driven directly by -sin(headingYaw) * speed (true car trajectory, never side-strafing!),
      //      while releasing the key smoothly self-aligns the nose (k = 5.8) and grips laterally (k = 13.5) with zero ice-skating!
      steerSm = THREE.MathUtils.damp(steerSm, rawSteer, Math.abs(rawSteer) > 0.05 ? 11.0 : 8.0, dt);
      frontSteer = THREE.MathUtils.damp(frontSteer, -steerSm * 0.56, 12, dt);

      if (!drifting) {
        const wantHeading = -steerSm * 0.40 * steerAgility - pFrame.curv * 1.4;
        // Crisp turn-in when steering, smooth organic self-centering when released (~0.38s S-curve)
        headingYaw = THREE.MathUtils.damp(headingYaw, wantHeading, Math.abs(rawSteer) > 0.05 ? 10.5 : 5.8, dt);
        yawRate = (wantHeading - headingYaw) * 6.5;
        slipAngle = THREE.MathUtils.damp(slipAngle, 0, 9.5, dt);
        // True Ackermann-style lateral motion driven by the car's actual nose heading (not raw strafing!)
        const headingLatVel = -playerSpeed * Math.sin(headingYaw) * 1.08;
        const targetLatVel = Math.abs(rawSteer) > 0.05 ? headingLatVel : headingLatVel * 0.35;
        lateralVel = THREE.MathUtils.damp(lateralVel, targetLatVel, Math.abs(rawSteer) > 0.05 ? 10.5 : 13.5, dt);
      } else {
        // DRIFT MODE: Deep controllable tail kick-out!
        const targetYawRate = -steerSm * 1.95 * steerAgility;
        yawRate = THREE.MathUtils.damp(yawRate, targetYawRate, 8.5, dt);
        const selfAlign = Math.abs(rawSteer) < 0.1 ? -headingYaw * 5.2 : -headingYaw * 1.6;
        headingYaw = THREE.MathUtils.clamp(headingYaw + (yawRate + selfAlign) * dt, -0.58, 0.58);
        const targetSlip = THREE.MathUtils.clamp(-steerSm * 0.56 + Math.sign(headingYaw) * 0.16, -0.64, 0.64);
        slipAngle = THREE.MathUtils.damp(slipAngle, targetSlip, 8.5, dt);
        const travelAngle = headingYaw + slipAngle * 0.68;
        lateralVel = THREE.MathUtils.damp(lateralVel, -playerSpeed * Math.sin(travelAngle) * 0.82, 9.5, dt);
      }

      const forwardV = playerSpeed * Math.cos(Math.min(0.55, Math.abs(headingYaw + slipAngle * 0.5)));
      playerDist += forwardV * dt;
      playerLat += lateralVel * dt;

      if (drifting && airHeight <= 0.08 && Math.abs(slipAngle) > 0.15) {
        emitSparks(roverRig.rover.position, pFrame.T, pFrame.U, 2);
      }

      // 6. Check Track Obstacles
      const modDistNow = ((playerDist % totalLen) + totalLen) % totalLen;
      for (const ob of obstacles) {
        if (!ob.active || ob.cd > 0 || airHeight > 1.2) continue;
        const dd = Math.min(Math.abs(modDistNow - ob.dist), totalLen - Math.abs(modDistNow - ob.dist));
        if (dd < 2.2 && Math.abs(playerLat - ob.lat) < ob.halfW + 0.75) {
          ob.cd = 1.8;
          if (shockwaveActive || currentChassis === "titan") {
            emitSparks(ob.group.position, pFrame.T, pFrame.U, 14);
            onJuice?.({ crit: true, tier: 2 });
            showToast(t("💥 重装冲破路障！无损通过!", "💥 BARRIER SMASHED!"));
          } else {
            playerSpeed *= 0.76;
            playerLat += (playerLat >= ob.lat ? 1.35 : -1.35);
            chassisPitch = -0.07;
            emitSparks(roverRig.rover.position, pFrame.T, pFrame.U, 10);
            onJuice?.({ crit: false, tier: 2 });
            showToast(t("⚠ 擦碰越障激光栏！切线走两侧安全车道!", "⚠ LASER BARRIER HIT! WEAVE AROUND!"));
          }
        }
      }

      // 7. Check Stunt Jump Ramps:
      //    - No Shift pressed: clean straight ballistic jump (直飞跃坡)!
      //    - Holding Shift on ramp (or tapping Shift mid-air): 360° Barrel Roll Stunt (滚筒特技)!
      for (const ramp of stuntRamps) {
        if (ramp.cd > 0 || airHeight > 0.25) continue;
        const dd = Math.min(Math.abs(modDistNow - ramp.dist), totalLen - Math.abs(modDistNow - ramp.dist));
        if (dd < 4.5 && Math.abs(playerLat - ramp.lat) < ramp.w * 0.56) {
          ramp.cd = 3.0;
          airVelY = Math.max(9.0, playerSpeed * 0.31);
          airHeight = 0.24;
          playerSpeed = Math.min(38.5, playerSpeed + 3.2);
          drifting = false;
          stuntsDone += 1;
          if (shiftDown) {
            stuntBarrelRoll = 0.01;
            stuntBarrelRate = (rawSteer < -0.05 ? -1 : 1) * (TAU / 0.85);
            stuntSpinYaw = 0;
            stuntSpinRate = 0;
            if (!nitroActive && !shockwaveActive) nitro = Math.min(100, nitro + 42);
            showToast(t("🌪️ Shift 斜坡滚筒特技！360° BARREL ROLL +42% 氮气!", "🌪️ SHIFT BARREL ROLL! +42% NITRO!"));
            onJuice?.({ crit: true, tier: 3 });
          } else {
            stuntBarrelRoll = 0;
            stuntBarrelRate = 0;
            stuntSpinYaw = 0;
            stuntSpinRate = 0;
            if (!nitroActive && !shockwaveActive) nitro = Math.min(100, nitro + 18);
            showToast(t("🦅 斜坡直飞跃升 +18% 氮气！（斜坡/空中按 [Shift] 触发 360° 滚筒）", "🦅 CLEAN RAMP JUMP +18% NITRO! (HOLD [SHIFT] FOR BARREL ROLL)"));
            onJuice?.({ crit: false, tier: 2 });
          }
        }
      }

      if (airHeight > 0 || airVelY > 0) {
        airHeight += airVelY * dt;
        airVelY -= 19.5 * dt;
        // Late mid-air Shift press also triggers 360° Barrel Roll while still airborne!
        if (shiftTapped && airHeight > 0.55 && airVelY > -3.5 && stuntBarrelRate === 0 && stuntSpinRate === 0) {
          stuntBarrelRoll = 0.01;
          stuntBarrelRate = (rawSteer < -0.05 ? -1 : 1) * (TAU / 0.80);
          if (!nitroActive && !shockwaveActive) nitro = Math.min(100, nitro + 24);
          showToast(t("🌪️ 空中 Shift 补触发 360° 滚筒特技！+24% 氮气!", "🌪️ MID-AIR BARREL ROLL! +24% NITRO!"));
          onJuice?.({ crit: true, tier: 3 });
        }
        if (stuntBarrelRate !== 0) {
          stuntBarrelRoll += stuntBarrelRate * dt;
          if (Math.abs(stuntBarrelRoll) >= TAU) {
            stuntBarrelRoll = 0;
            stuntBarrelRate = 0;
          }
        }
        if (stuntSpinRate !== 0) {
          stuntSpinYaw += stuntSpinRate * dt;
          if (Math.abs(stuntSpinYaw) >= TAU) {
            stuntSpinYaw = 0;
            stuntSpinRate = 0;
          }
        }
        if (airHeight <= 0) {
          airHeight = 0;
          airVelY = 0;
          stuntBarrelRoll = 0;
          stuntBarrelRate = 0;
          stuntSpinYaw = 0;
          stuntSpinRate = 0;
          chassisPitch = -0.08;
          emitSparks(roverRig.rover.position, pFrame.T, pFrame.U, 10);
          onJuice?.({ crit: true, tier: 2 });
        }
      }

      // 8. 3-Layer Forgiveness Boundary
      const curU = modDistNow / totalLen;
      const openEdge = isOpenEdgeForMap(curU, track.mapDef);
      const railLimit = TRACK_HALF_W - 0.95;
      if (!openEdge && Math.abs(playerLat) > railLimit) {
        const side = Math.sign(playerLat);
        playerLat = side * railLimit;
        lateralVel = -side * 1.2;
        headingYaw = THREE.MathUtils.lerp(headingYaw, side * 0.08, 0.5);
        playerSpeed *= 0.95;
        emitSparks(roverRig.rover.position, pFrame.T, pFrame.U, 5);
        onJuice?.({ crit: false, tier: 1 });
      } else if (openEdge && Math.abs(playerLat) > TRACK_HALF_W + 0.75 && airHeight <= 0.2) {
        rescueTimer = 1.0;
        rescueFromLat = playerLat;
        showToast(t("偏离开放星跃段 · 轨道牵引光束救援中...", "OPEN EDGE! ORBITAL TRACTOR BEAM RESCUE..."));
        onJuice?.({ crit: false, tier: 2 });
      }
    }

    // Check Boost Pads & Helium-3 Energy Canisters (refills Nitro EVEN mid-boost to extend your high-speed run!)
    const modDist = ((playerDist % totalLen) + totalLen) % totalLen;
    for (const pad of boostPads) {
      if (pad.cd > 0) continue;
      const dd = Math.min(Math.abs(modDist - pad.dist), totalLen - Math.abs(modDist - pad.dist));
      if (dd < 3.8 && Math.abs(playerLat - pad.lat) < 2.2) {
        pad.cd = 2.0;
        playerSpeed = Math.min(40.5, playerSpeed + 5.5);
        const padRefill = (nitroActive || shockwaveActive) ? 20 : 24;
        nitro = Math.min(100, nitro + padRefill);
        boostTailTimer = Math.max(boostTailTimer, 2.0);
        chassisPitch = Math.max(chassisPitch, 0.055);
        onJuice?.({ crit: true, tier: 2 });
        showToast(t(`⚡ 磁轨加速带！极速冲刺 +${padRefill}% 氦氮续航`, `⚡ MAG-LEV BOOST PAD! +${padRefill}% NITRO`));
      }
    }
    for (const orb of orbs) {
      if (!orb.active) continue;
      const dd = Math.min(Math.abs(modDist - orb.dist), totalLen - Math.abs(modDist - orb.dist));
      if (dd < 2.8 && Math.abs(playerLat - orb.lat) < 2.1 * titanBonus) {
        orb.active = false;
        orb.respawn = 10.0;
        orb.mesh.visible = false;
        orbsCollected += 1;
        const boostingNow = nitroActive || shockwaveActive;
        const cellRefill = boostingNow ? 16 : 18;
        nitro = Math.min(100, nitro + cellRefill);
        onJuice?.({ crit: false, tier: 1 });
        if (boostingNow) {
          showToast(t(`🧪 吸收氦-3 能量瓶 · 加速续航 +${cellRefill}%！`, `🧪 HE-3 CELL ABSORBED · +${cellRefill}% BOOST!`));
        }
      }
    }

    // 9. Update 3 Sculpted 3D AI Rivals with Active AI Nitro Overtakes + Readable 2-Phase Barrel Roll Knockdowns:
    let closestThreat = null;
    let closestThreatGap = Infinity;
    let activeNitroRival = null;

    for (const rv of rivals) {
      if (rv.hitCooldown > 0) rv.hitCooldown -= rawDt;
      if (rv.kdTimer > 0) {
        rv.kdTimer = Math.max(0, rv.kdTimer - dt);
        const p = 1 - rv.kdTimer / 1.75;
        // Phase 1 (0 -> 0.28): Fishtail skid sideways toward the guardrail in a shower of sparks
        // Phase 2 (0.18 -> 0.90): Moderate 1.65m arc with one clean 360° longitudinal Barrel Roll (never flips 90° belly-up!)
        rv.lat = THREE.MathUtils.lerp(rv.kdStartLat, rv.kdTargetLat, smoothstep(p, 0, 0.48));
        rv.dist += Math.max(11.0, rv.speed * (0.76 - 0.48 * p)) * dt;
        rv.kdHeight = Math.sin(smoothstep(p, 0.16, 0.92) * Math.PI) * 1.65;
        const kdYaw = rv.kdSide * smoothstep(p, 0, 0.30) * 0.78 * (1 - 0.30 * smoothstep(p, 0.62, 1.0));
        const kdRoll = rv.kdSide * smoothstep(p, 0.20, 0.88) * TAU;
        const kdPitch = -0.14 * Math.sin(p * Math.PI);
        placeOnTrack(rv.group, rv.dist, rv.lat, 0.04 + rv.kdHeight);
        localRot.set(kdPitch, kdYaw, kdRoll, "YXZ");
        localQuat.setFromEuler(localRot);
        rv.group.quaternion.multiply(localQuat);
        if (Math.random() < 0.65) {
          emitSparks(rv.group.position, pFrame.T, pFrame.U, 3);
        }
        if (Math.random() < 0.42) {
          emitSmokePuff(rv.group.position, pFrame.U);
        }
        rv.rig.setBoostVisual?.(p < 0.45, dt, visualTime, true);
        if (rv.kdTimer === 0) {
          // Fair post-knockdown respawn: drop rival 28~36m behind at 68% recovery speed with 9.5s Nitro cooldown & 6s grace!
          rv.dist = Math.min(rv.dist, playerDist - 28);
          rv.dist = Math.max(rv.dist, playerDist - 36);
          rv.speed = Math.max(11, playerSpeed * 0.68);
          rv.aiNitroTimer = 0;
          rv.aiNitroCooldown = 9.5;
          rv.respawnGrace = 6.0;
        }
        continue;
      }

      if (rv.respawnGrace > 0) rv.respawnGrace = Math.max(0, rv.respawnGrace - dt);
      const gap = playerDist - rv.dist;
      let targetV = rv.baseSpeed + Math.sin(visualTime * 1.2 + rv.idx * 2.1) * 1.5;
      if (gap > 68) {
        // Only gently prevent rivals from falling half a lap behind — never teleport onto the player's bumper!
        rv.dist = playerDist - 38 - rv.idx * 5;
      }

      // Active AI Nitro Overtake Cycle (balanced cadence so knockdowns & overtakes feel genuinely rewarding!)
      if (rv.aiNitroTimer > 0) {
        rv.aiNitroTimer = Math.max(0, rv.aiNitroTimer - dt);
      } else {
        rv.aiNitroCooldown -= dt;
        if (rv.aiNitroCooldown <= 0 && rv.respawnGrace <= 0 && gap > -18 && gap < 26) {
          rv.aiNitroTimer = 2.1;
          rv.aiNitroCooldown = 8.5 + Math.random() * 4.0;
          if (gap > -10 && gap < 16 && kdCamTimer <= 0) {
            showToast(t(`⚡ ${rv.name} 开启氮气加速强行超车！按 [Space] 加速或 [Shift] 甩尾反击!`, `⚡ ${rv.name} FIRED NITRO TO OVERTAKE! COUNTER WITH [SPACE] OR [SHIFT]!`));
          }
        }
      }

      if (rv.aiNitroTimer > 0) {
        targetV = Math.max(targetV, playerSpeed + 2.8);
        rv.aiBoosting = true;
        if (gap > -6 && gap < 14) activeNitroRival = rv;
      } else if (rv.respawnGrace > 0) {
        // During post-respawn grace, rival accelerates organically without aggressive rubber-band sling-shotting
        targetV = Math.min(targetV, Math.max(19.5, playerSpeed * 1.02));
        rv.aiBoosting = false;
      } else if (gap > 12) {
        targetV = Math.max(targetV, playerSpeed * 1.06 + Math.min(3.4, (gap - 12) * 0.14));
        rv.aiBoosting = gap > 22;
      } else if (gap < -16) {
        targetV = Math.min(targetV, playerSpeed * 0.92);
        rv.aiBoosting = false;
      } else {
        targetV = THREE.MathUtils.lerp(targetV, Math.max(22.0, playerSpeed * 0.985), 0.60);
        rv.aiBoosting = false;
      }

      rv.speed = THREE.MathUtils.damp(rv.speed, targetV, 3.8, dt);
      rv.dist += rv.speed * dt;
      const targetLat = rv.laneBias + Math.sin(visualTime * 0.85 + rv.idx * 1.7) * 2.6;
      const prevLat = rv.lat;
      rv.lat = THREE.MathUtils.damp(rv.lat, THREE.MathUtils.clamp(targetLat, -6.4, 6.4), 2.2, dt);
      const latVel = (rv.lat - prevLat) / Math.max(0.001, dt);
      rv.headingYaw = THREE.MathUtils.damp(rv.headingYaw, THREE.MathUtils.clamp(-latVel / Math.max(12, rv.speed), -0.32, 0.32), 10, dt);

      if (gap > 1.5 && gap < 8.5 && gap < closestThreatGap) {
        closestThreatGap = gap;
        closestThreat = rv;
      }

      // Check Player <-> Rival Collision
      const relD = Math.abs(playerDist - rv.dist);
      const relL = Math.abs(playerLat - rv.lat);
      if (relD < 2.75 && relL < 1.80 && rv.hitCooldown <= 0) {
        const pushDir = rv.lat >= playerLat ? 1 : -1;
        // Normal collision pushes rival outward toward the track wall!
        rv.lat += pushDir * 1.65;
        const isBoostRam = shockwaveActive || nitroActive;
        const isDriftTailWhip = drifting && Math.abs(slipAngle) > 0.16;
        const isWallCrush = Math.abs(rv.lat) >= TRACK_HALF_W - 1.55;

        if (isBoostRam || isDriftTailWhip || isWallCrush) {
          rv.hitCooldown = 2.6;
          const method = shockwaveActive
            ? t("紫金脉冲粉碎", "SHOCKWAVE CRUSH")
            : isWallCrush
              ? t("护栏边缘挤压击毁", "WALL CRUSH KD")
              : isDriftTailWhip
                ? t("Shift 漂移甩尾击飞", "SHIFT DRIFT TAIL-WHIP KD")
                : t("氮气加速冲撞", "NITRO SLAM KD");
          triggerTakedownCutaway(rv, method);
        } else {
          // Ordinary door-to-door bump: sparks + lateral jostle, pushing rival closer to the wall so a 2nd squeeze crushes them!
          rv.hitCooldown = 0.42;
          playerLat -= pushDir * 0.48;
          lateralVel *= 0.4;
          emitSparks(roverRig.rover.position, pFrame.T, pFrame.U, 8);
          onJuice?.({ crit: false, tier: 1 });
          showToast(t(`⚡ 擦碰挤压 ${rv.name}！继续挤向护栏或按 [Shift甩尾 / Space加速] 即可击毁!`, `⚡ RUBBING ${rv.name}! SQUEEZE TO WALL, [SHIFT] DRIFT OR [SPACE] NITRO TO KD!`));
        }
      }

      placeOnTrack(rv.group, rv.dist, rv.lat, 0.02);
      rv.group.rotateY(rv.headingYaw);
      for (const { hub, steering } of rv.rig.wheelHubs) {
        hub.rotation.x -= (rv.speed / 0.275) * dt;
        if (steering) steering.rotation.y = rv.headingYaw * 0.8;
      }
      rv.rig.setBoostVisual?.(rv.aiBoosting, dt, visualTime, rv.aiNitroTimer > 0);
    }

    if (activeNitroRival && kdCamTimer <= 0) {
      rivalAlertEl.textContent = t(
        `🔥 ${activeNitroRival.name} 正在喷射氮气加速超车！按 [Space] 反击或 [Shift] 甩尾拦截!`,
        `🔥 ${activeNitroRival.name} NITRO SURGE OVERTAKING! COUNTER WITH [SPACE] OR [SHIFT]!`,
      );
      rivalAlertEl.dataset.show = "true";
    } else if (closestThreat && kdCamTimer <= 0) {
      rivalAlertEl.textContent = t(
        `⚠ ${closestThreat.name} 尾流逼近 (${closestThreatGap.toFixed(1)}m)！按 [Shift甩尾 / Space加速 / 挤压护栏] 击毁!`,
        `⚠ ${closestThreat.name} CLOSING IN (${closestThreatGap.toFixed(1)}m)! [SHIFT] DRIFT, [SPACE] NITRO OR WALL-CRUSH!`,
      );
      rivalAlertEl.dataset.show = "true";
    } else {
      rivalAlertEl.dataset.show = "false";
    }

    // 10. Update 3D Chassis Pitch (including terrain slope pitch response!), Expressive Cornering Body Roll & 6-Wheel Suspension!
    const targetPitch = (shockwaveActive ? 0.068 : nitroActive ? 0.045 : gearShiftTimer > 0 ? 0.038 : brakeHeld && !drifting ? -0.055 : 0)
      + (airHeight > 0.1 ? THREE.MathUtils.clamp(airVelY * 0.02, -0.22, 0.24) : 0);
    const targetRoll = THREE.MathUtils.clamp((-headingYaw * 0.44) + (drifting ? -slipAngle * 0.24 : 0), -0.20, 0.20);
    chassisPitch = THREE.MathUtils.damp(chassisPitch, targetPitch, 8.5, dt);
    chassisRoll = THREE.MathUtils.damp(chassisRoll, targetRoll, 9.5, dt);

    for (let i = 0; i < 6; i++) {
      const w = roverRig.wheelHubs[i];
      const side = Math.sign(w.x);
      const axleZ = w.z;
      const seamBump = airHeight > 0.05 ? -0.45 : 0.16 * Math.sin((playerDist - axleZ) * 2.4);
      const rollLoad = -side * chassisRoll * 9.0;
      const pitchLoad = axleZ * chassisPitch * 8.0;
      const load = airHeight > 0.08 ? 0.05 : THREE.MathUtils.clamp(1.05 + seamBump + rollLoad + pitchLoad, 0.15, 3.2);
      wheelLoads[i] = load;
      const { hub, mount = hub, steering, tireRadius = 0.275 } = w;
      const ext = airHeight > 0.08 ? -0.09 : THREE.MathUtils.clamp((1.0 - load) * 0.042, -0.075, 0.065);
      mount.position.y = tireRadius + ext;
      hub.rotation.x -= (playerSpeed / tireRadius) * dt * (drifting ? 1.35 : 1.0);
      if (steering) {
        const counterSteer = drifting ? -slipAngle * 0.55 : frontSteer;
        steering.rotation.y = THREE.MathUtils.damp(steering.rotation.y, -Math.sign(axleZ) * counterSteer, 12, dt);
      }
    }
    roverRig.updateSuspension?.(wheelLoads);

    sampleAtDist(playerDist, pFrame);
    const rescueLift = rescueTimer > 0 ? Math.sin((1 - rescueTimer) * Math.PI) * 2.6 : 0;
    roverRig.rover.position
      .copy(pFrame.p)
      .addScaledVector(pFrame.R, playerLat)
      .addScaledVector(pFrame.U, 0.02 + airHeight + rescueLift);
    negT.copy(pFrame.T).negate();
    roverBasis.makeBasis(pFrame.R, pFrame.U, negT);
    roverRig.rover.quaternion.setFromRotationMatrix(roverBasis);

    const totalYaw = headingYaw + slipAngle + stuntSpinYaw;
    localRot.set(chassisPitch, totalYaw, chassisRoll + stuntBarrelRoll, "YXZ");
    localQuat.setFromEuler(localRot);
    roverRig.rover.quaternion.multiply(localQuat);

    roverRig.setBoostVisual?.(nitroActive || shockwaveActive, dt, visualTime, shockwaveActive);
    roverRig.setVisualEvolution?.({
      shield: 0,
      magnetTarget: null,
      stuntGlow: shockwaveActive ? 1.0 : (nitroActive || drifting || airHeight > 0.2) ? 0.85 : pFrame.inverted ? 0.65 : 0.25,
      fever: nitroActive || drifting,
      shockwave: shockwaveActive,
      dt,
      time: visualTime,
    });

    // Update 3D Tire Sparks & Knockdown Shatter Debris + Shockwave Ring!
    let aliveSparks = 0;
    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      sp.t += dt;
      if (sp.t >= sp.dur) continue;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      sparkDummy.position.set(sp.x, sp.y, sp.z);
      sparkDummy.lookAt(sp.x + sp.vx, sp.y + sp.vy, sp.z + sp.vz);
      sparkDummy.scale.setScalar(1 - sp.t / sp.dur);
      sparkDummy.updateMatrix();
      sparkMesh.setMatrixAt(aliveSparks++, sparkDummy.matrix);
      sparks[aliveSparks - 1] = sp;
    }
    sparks.length = aliveSparks;
    sparkMesh.count = aliveSparks;
    if (aliveSparks > 0) sparkMesh.instanceMatrix.needsUpdate = true;

    let aliveDebris = 0;
    for (let i = 0; i < debrisList.length; i++) {
      const d = debrisList[i];
      d.t += dt;
      if (d.t >= d.dur) continue;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.vy -= 14 * dt;
      sparkDummy.position.set(d.x, d.y, d.z);
      sparkDummy.rotation.set(d.t * d.rx, d.t * d.ry, d.t * 9);
      sparkDummy.scale.set(1.2, 0.45, 0.85).multiplyScalar(0.45 + 0.55 * (1 - d.t / d.dur));
      sparkDummy.updateMatrix();
      debrisMesh.setMatrixAt(aliveDebris++, sparkDummy.matrix);
      debrisList[aliveDebris - 1] = d;
    }
    debrisList.length = aliveDebris;
    debrisMesh.count = aliveDebris;
    if (aliveDebris > 0) debrisMesh.instanceMatrix.needsUpdate = true;

    if (kdRingTimer > 0) {
      kdRingTimer = Math.max(0, kdRingTimer - rawDt);
      const p = 1 - kdRingTimer / 0.85;
      kdRing.scale.setScalar(0.9 + p * 3.4);
      kdRingMat.opacity = (1 - p) * 0.34;
      kdInnerRing.scale.setScalar(0.5 + p * 2.1);
      kdInnerRingMat.opacity = (1 - p) * 0.28;
      if (kdFlashCore.visible) {
        const fp = Math.min(1, p * 3.2);
        kdFlashCore.scale.setScalar(0.45 + fp * 1.65);
        kdFlashMat.opacity = (1 - fp) * 0.72;
        if (fp >= 1) kdFlashCore.visible = false;
      }
      if (kdRingTimer === 0) {
        kdRing.visible = false;
        kdInnerRing.visible = false;
        kdFlashCore.visible = false;
      }
    }

    // Update bouncing sculpted detached wreck parts (tires & glowing armor plates)
    for (const wp of wreckParts) {
      if (!wp.mesh.visible) continue;
      wp.t += dt;
      if (wp.t >= wp.dur) {
        wp.mesh.visible = false;
        continue;
      }
      wp.vy -= 14.5 * dt;
      wp.mesh.position.x += wp.vx * dt;
      wp.mesh.position.y += wp.vy * dt;
      wp.mesh.position.z += wp.vz * dt;
      if (wp.mesh.position.y < wp.groundY) {
        wp.mesh.position.y = wp.groundY;
        wp.vy = Math.abs(wp.vy) * 0.52;
        wp.vx *= 0.84;
        wp.vz *= 0.84;
      }
      wp.mesh.rotation.x += wp.rx * dt;
      wp.mesh.rotation.y += wp.ry * dt;
      wp.mesh.rotation.z += wp.rz * dt;
      const fade = 1 - smoothstep(wp.t, wp.dur * 0.65, wp.dur);
      wp.mesh.scale.setScalar(Math.max(0.01, fade));
    }

    // Update billowing wreck smoke / ember plume
    let aliveSmoke = 0;
    for (let i = 0; i < smokePuffs.length; i++) {
      const sm = smokePuffs[i];
      sm.t += dt;
      if (sm.t >= sm.dur) continue;
      sm.x += sm.vx * dt;
      sm.y += sm.vy * dt;
      sm.z += sm.vz * dt;
      const sp = sm.t / sm.dur;
      sparkDummy.position.set(sm.x, sm.y, sm.z);
      sparkDummy.rotation.set(sp * 3.5, sp * 2.8, sp * 1.9);
      sparkDummy.scale.setScalar((0.6 + sp * 2.2) * (1 - sp * 0.55));
      sparkDummy.updateMatrix();
      smokeMesh.setMatrixAt(aliveSmoke++, sparkDummy.matrix);
      smokePuffs[aliveSmoke - 1] = sm;
    }
    smokePuffs.length = aliveSmoke;
    smokeMesh.count = aliveSmoke;
    if (aliveSmoke > 0) smokeMesh.instanceMatrix.needsUpdate = true;

    // Update 64-piece 3D Finish Line Confetti Fountain & Victory Halo Ring!
    let aliveConfetti = 0;
    for (let i = 0; i < confettiList.length; i++) {
      const cf = confettiList[i];
      cf.t += rawDt;
      if (cf.t >= cf.dur) continue;
      cf.vy -= 4.2 * rawDt;
      cf.vx *= Math.exp(-0.55 * rawDt);
      cf.vz *= Math.exp(-0.55 * rawDt);
      cf.x += cf.vx * rawDt;
      cf.y += cf.vy * rawDt;
      cf.z += cf.vz * rawDt;
      sparkDummy.position.set(cf.x, cf.y, cf.z);
      sparkDummy.rotation.set(cf.t * cf.rx, cf.t * cf.ry, cf.t * cf.rz);
      const fade = 1 - smoothstep(cf.t, cf.dur * 0.72, cf.dur);
      sparkDummy.scale.setScalar(Math.max(0.01, fade));
      sparkDummy.updateMatrix();
      confettiMesh.setMatrixAt(aliveConfetti++, sparkDummy.matrix);
      confettiList[aliveConfetti - 1] = cf;
    }
    confettiList.length = aliveConfetti;
    confettiMesh.count = aliveConfetti;
    if (aliveConfetti > 0) confettiMesh.instanceMatrix.needsUpdate = true;
    if (finishHaloRing.visible) {
      finishHaloRing.scale.setScalar(1.0 + (2.45 - Math.max(0, finishCelebrationTimer)) * 1.45);
      finishHaloRing.rotation.z = visualTime * 1.6;
      finishHaloMat.opacity = Math.max(0, finishCelebrationTimer / 2.45) * 0.85;
      if (finishCelebrationTimer <= 0) finishHaloRing.visible = false;
    }

    // 11. Camera System
    if (finishing) {
      // Heroic 3/4 Victory Orbit during the 2.45s Finish Line Celebration!
      finishCelebrationTimer = Math.max(0, finishCelebrationTimer - rawDt);
      const fp = 1 - finishCelebrationTimer / 2.45;
      const orbitAngle = -0.55 + fp * 2.15;
      const orbitDist = THREE.MathUtils.lerp(5.2, 6.4, fp);
      desiredCamPos
        .copy(roverRig.rover.position)
        .addScaledVector(pFrame.R, Math.sin(orbitAngle) * orbitDist)
        .addScaledVector(pFrame.T, -Math.cos(orbitAngle) * orbitDist)
        .addScaledVector(pFrame.U, 1.85 + fp * 0.65);
      desiredCamTarget
        .copy(roverRig.rover.position)
        .addScaledVector(pFrame.U, 0.65);
      camPos.lerp(desiredCamPos, 1 - Math.exp(-8 * rawDt));
      camUp.lerp(pFrame.U, 1 - Math.exp(-8 * rawDt)).normalize();
      camTarget.lerp(desiredCamTarget, 1 - Math.exp(-12 * rawDt));
      camera.position.copy(camPos);
      camera.up.copy(camUp);
      camera.lookAt(camTarget);
      camera.fov = THREE.MathUtils.damp(camera.fov, 44, 6, rawDt);
      camera.updateProjectionMatrix();
      if (finishCelebrationTimer === 0 && !finished) {
        finishWreathEl.dataset.show = "false";
        openPodiumModal();
      }
    } else if (kdCamTimer > 0.16 && kdCamRival) {
      // Crystal-clear Two-Car Action Chase Framing: shows BOTH the player's rover and the barrel-rolling rival on the road!
      track.sampleAtDist(playerDist, rFrame);
      const sideSign = -(kdCamRival.kdSide || 1);
      desiredCamPos
        .copy(pFrame.p)
        .addScaledVector(pFrame.R, THREE.MathUtils.clamp(playerLat * 0.55 + sideSign * 2.15, -TRACK_HALF_W + 1.2, TRACK_HALF_W - 1.2))
        .addScaledVector(pFrame.T, -4.55)
        .addScaledVector(pFrame.U, 2.05);
      desiredCamTarget
        .copy(roverRig.rover.position)
        .lerp(kdCamRival.group.position, 0.66)
        .addScaledVector(rFrame.U, 0.52);
      camPos.lerp(desiredCamPos, 1 - Math.exp(-14 * rawDt));
      camUp.copy(rFrame.U).addScaledVector(rFrame.R, sideSign * 0.05).normalize();
      camTarget.lerp(desiredCamTarget, 1 - Math.exp(-18 * rawDt));
      camera.position.copy(camPos);
      camera.up.copy(camUp);
      camera.lookAt(camTarget);
      camera.fov = THREE.MathUtils.damp(camera.fov, 45, 10, rawDt);
      camera.updateProjectionMatrix();
    } else {
      const targetBack = shockwaveActive ? 5.05 : nitroActive ? 5.35 : brakeHeld ? 5.0 : 5.65;
      camBackSm = THREE.MathUtils.damp(camBackSm, targetBack, 4.8, dt);
      // Slight lateral camera lag + dynamic rear-bumper swing makes car turning arcs feel unmistakable!
      camLatSm = THREE.MathUtils.damp(camLatSm, playerLat, 4.6, dt);
      camYawSm = THREE.MathUtils.damp(camYawSm, headingYaw * 0.56 + slipAngle * 0.28, 5.2, dt);
      const camHigh = (shockwaveActive ? 2.22 : 2.52) + airHeight * 1.18;

      desiredCamPos
        .copy(pFrame.p)
        .addScaledVector(pFrame.R, camLatSm * 0.84 + Math.sin(camYawSm) * camBackSm * 0.68)
        .addScaledVector(pFrame.T, -Math.cos(camYawSm) * camBackSm)
        .addScaledVector(pFrame.U, camHigh);
      desiredCamTarget
        .copy(roverRig.rover.position)
        .addScaledVector(pFrame.R, -Math.sin(headingYaw) * 2.4)
        .addScaledVector(pFrame.T, 4.6)
        .addScaledVector(pFrame.U, 0.75 - airHeight * 0.22);

      camPos.copy(desiredCamPos);
      camUp.copy(pFrame.U).addScaledVector(pFrame.R, -headingYaw * 0.14).normalize();
      camTarget.copy(desiredCamTarget);
      camera.position.copy(camPos);
      camera.up.copy(camUp);
      camera.lookAt(camTarget);

      const wantFov = shockwaveActive ? 68 : nitroActive ? 56 : slipstreaming ? 51 : 43 + (playerSpeed / 30) * 6;
      const nextFov = THREE.MathUtils.damp(camera.fov, wantFov, 7, dt);
      if (Math.abs(nextFov - camera.fov) > 0.01) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
    }

    // 12. Check 3-Lap Counter & Big Lap Announcements!
    const lap = Math.min(TOTAL_LAPS, Math.floor(playerDist / totalLen) + 1);
    if (lap > prevLap && !finishing && playerDist < totalLen * TOTAL_LAPS) {
      prevLap = lap;
      const lapBanner = lap === TOTAL_LAPS
        ? t("🔥 FINAL LAP 3 / 3 · 终极冲刺!", "🔥 FINAL LAP 3 / 3!")
        : t(`LAP ${lap} / ${TOTAL_LAPS}`, `LAP ${lap} / ${TOTAL_LAPS}`);
      centerBannerEl.textContent = lapBanner;
      centerBannerEl.style.opacity = "1";
      playCountdownCue(0);
      setTimeout(() => { if (active) centerBannerEl.style.opacity = "0"; }, 1350);
    }
    const speedKmh = Math.round(playerSpeed * DISPLAY_KMH_SCALE);
    if (speedKmh > topSpeedKmh) topSpeedKmh = speedKmh;
    if (playerDist >= totalLen * TOTAL_LAPS && !finishing && !finished) {
      // Trigger 2.45s Grand Finish Celebration (confetti fountain, golden halo ring, laurel wreath banner & victory fanfare!)
      finishing = true;
      finishCelebrationTimer = 2.45;
      finishRankLocked = currentRank();
      drifting = false;
      nitroActive = false;
      shockwaveActive = false;
      kdCamTimer = 0;
      kdCinematic.dataset.active = "false";
      shockPromptEl.dataset.show = "false";
      centerBannerEl.style.opacity = "0";
      finishTitleEl.textContent = finishRankLocked === 1
        ? t("🏁 FINISH! // 第 1 名冠军冲线!", "🏁 FINISH! // 1ST PLACE CHAMPION!")
        : t(`🏁 FINISH! // 第 ${finishRankLocked} 名完赛!`, `🏁 FINISH! // ${rankSuffix(finishRankLocked).toUpperCase()} PLACE!`);
      finishSubEl.textContent = t("花环礼炮盛放 · 正在进入领奖台结算", "CHECKERED FLAG · VICTORY CELEBRATION");
      finishWreathEl.dataset.show = "true";
      emitFinishConfetti(pFrame);
      playVictoryFanfare();
      onJuice?.({ crit: true, tier: 3 });
    }

    if (kdCamTimer > 0) {
      liveBadgeEl.dataset.show = "false";
    } else if (airHeight > 0.35) {
      liveBadgeEl.textContent = stuntBarrelRate !== 0
        ? t("🌪️ Shift 空中 360° 滚筒特技 · +42% NITRO!", "🌪️ SHIFT 360° BARREL ROLL · +42% NITRO!")
        : t("🦅 斜坡直飞跃升 · 按 [Shift] 可触发 360° 滚筒!", "🦅 CLEAN AIR JUMP · TAP [SHIFT] FOR BARREL ROLL!");
      liveBadgeEl.dataset.show = "true";
    } else if (drifting) {
      liveBadgeEl.textContent = t(`🔥 Shift 甩尾漂移 ${Math.round(driftMeters)}m · 急速蓄气中 (+NITRO)!`, `🔥 SHIFT DRIFT ${Math.round(driftMeters)}m · CHARGING NITRO!`);
      liveBadgeEl.dataset.show = "true";
    } else if (slipstreaming) {
      liveBadgeEl.textContent = t("🌪️ 尾流吸附 SLIPSTREAM · 极速 +25 KM/H & 蓄气中", "🌪️ SLIPSTREAM DRAFT · +25 KM/H & +NITRO");
      liveBadgeEl.dataset.show = "true";
    } else {
      liveBadgeEl.dataset.show = "false";
    }

    const rank = currentRank();
    const curU = modDist / totalLen;
    const secName = curU < 0.24 ? "S1 起始大道" : curU < 0.48 ? "S2 连续弯道" : curU < 0.75 ? (pFrame.inverted ? "S3 反重力天穹" : "S3 高架螺旋") : "S4 终极冲刺";
    posNumEl.textContent = rankSuffix(rank);
    sectorLabelEl.textContent = `${t(track.mapDef.name, track.mapDef.nameEn)} // ${secName}`;
    lapTextEl.textContent = pFrame.inverted
      ? t(`LAP ${lap}/${TOTAL_LAPS} · 反重力倒立`, `LAP ${lap}/${TOTAL_LAPS} · ANTI-GRAV`)
      : `LAP ${lap} / ${TOTAL_LAPS}`;
    speedValEl.textContent = String(speedKmh).padStart(3, "0");
    gearPillEl.textContent = shockwaveActive ? "MAX" : nitroActive ? "N2O" : `G${currentGear}`;
    nitroFillEl.style.width = `${Math.round(nitro)}%`;
    touchShockBtn.disabled = nitro < 70 || shockwaveActive;
    const showShockPrompt = nitro >= 70 && !shockwaveActive && !nitroActive && !finishing && kdCamTimer <= 0;
    shockPromptEl.dataset.show = String(showShockPrompt);
    if (showShockPrompt) {
      shockPromptEl.textContent = nitro >= 98
        ? t("⚡ 能量 100% 满格！立即按 [ SPACE ] 完美紫金爆发 ⚡", "⚡ 100% MAX ENERGY! PRESS [ SPACE ] FOR PERFECT SHOCKWAVE ⚡")
        : t("⚡ 紫金脉冲已就绪！按 [ SPACE ] 完美爆发 ⚡", "⚡ SHOCKWAVE READY! PRESS [ SPACE ] NOW ⚡");
    }
    nitroTrackEl.dataset.ready = showShockPrompt ? "shock" : "";
    if (shockwaveActive) {
      nitroFillEl.dataset.tier = "shock-on";
      nitroStateEl.dataset.active = "shock";
      nitroStateEl.dataset.ready = "";
      nitroStateEl.textContent = t(`紫金脉冲燃烧中 ${Math.round(nitro)}%`, `SHOCKWAVE BURNING ${Math.round(nitro)}%`);
    } else if (nitroActive) {
      nitroFillEl.dataset.tier = "";
      nitroStateEl.dataset.active = "nitro";
      nitroStateEl.dataset.ready = "";
      nitroStateEl.textContent = t(`氮气加速消耗中 ${Math.round(nitro)}%`, `NITRO BURNING ${Math.round(nitro)}%`);
    } else if (nitro >= 70) {
      nitroFillEl.dataset.tier = "shock-ready";
      nitroStateEl.dataset.active = "";
      nitroStateEl.dataset.ready = "shock";
      nitroStateEl.textContent = t("紫金脉冲就绪 · 按 [SPACE] 爆发!", "SHOCKWAVE READY [SPACE]!");
    } else if (nitro >= 15) {
      nitroFillEl.dataset.tier = "";
      nitroStateEl.dataset.active = "";
      nitroStateEl.dataset.ready = "";
      nitroStateEl.textContent = t(`NITRO ${Math.round(nitro)}% · 按 [SPACE] 加速`, `NITRO ${Math.round(nitro)}% · [SPACE] BOOST`);
    } else {
      nitroFillEl.dataset.tier = "";
      nitroStateEl.dataset.active = "";
      nitroStateEl.dataset.ready = "";
      nitroStateEl.textContent = t(`NITRO ${Math.round(nitro)}% · [SHIFT]漂移蓄气`, `NITRO ${Math.round(nitro)}% · [SHIFT] DRIFT`);
    }
    drawMinimap();

    const speedFx = kdCamTimer > 0 ? 0.75 : shockwaveActive ? 1.0 : nitroActive ? 0.55 : slipstreaming ? 0.32 : THREE.MathUtils.clamp((playerSpeed - 22) / 18, 0, 0.22);
    return { speedFx, shockwave: shockwaveActive || kdCamTimer > 0, nitro: nitroActive, speedKmh, rank, lap, inverted: pFrame.inverted };
  }

  return {
    start,
    stop,
    update,
    openMapSelectModal,
    triggerTakedownForTest: (idx = 0) => {
      if (rivals[idx]) triggerTakedownCutaway(rivals[idx], t("Shift 漂移甩尾击飞", "SHIFT DRIFT TAIL-WHIP KD"));
    },
    triggerFinishForTest: () => {
      playerDist = track.totalLen * TOTAL_LAPS + 0.5;
    },
    triggerRampJumpForTest: (withShift = false) => {
      airVelY = Math.max(9.0, playerSpeed * 0.31);
      airHeight = 0.24;
      stuntsDone += 1;
      if (withShift) {
        stuntBarrelRoll = 0.01;
        stuntBarrelRate = TAU / 0.85;
        stuntSpinYaw = 0;
        stuntSpinRate = 0;
      } else {
        stuntBarrelRoll = 0;
        stuntBarrelRate = 0;
        stuntSpinYaw = 0;
        stuntSpinRate = 0;
      }
    },
    setAudioSettings,
    get active() { return active; },
    get finished() { return finished; },
    get state() {
      return {
        active, finished, mapSelectOpen, countdown, raceTime, playerDist,
        totalLen: track.totalLen,
        mapId: track.mapDef.id,
        trackWidth: TRACK_HALF_W * 2,
        totalLaps: TOTAL_LAPS,
        lap: Math.min(TOTAL_LAPS, Math.floor(playerDist / track.totalLen) + 1),
        rank: currentRank(),
        gear: currentGear,
        slopeGrade: Number(pFrame.T.y.toFixed(3)),
        headingYaw: Number(headingYaw.toFixed(3)),
        nitro: Math.round(nitro),
        nitroActive,
        shockwaveActive,
        drifting,
        slipstreaming,
        airHeight: Number(airHeight.toFixed(2)),
        stuntBarrelActive: stuntBarrelRate !== 0,
        aiBoostingCount: rivals.filter(r => r.aiBoosting).length,
        aiNitroActiveCount: rivals.filter(r => r.aiNitroTimer > 0).length,
        takedowns,
        kdCamActive: kdCamTimer > 0,
        stuntsDone,
        speedKmh: Math.round(playerSpeed * DISPLAY_KMH_SCALE),
        orbsCollected,
      };
    },
  };
}
