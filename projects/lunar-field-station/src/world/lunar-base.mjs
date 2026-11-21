import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeEquipmentFinish } from "../rendering/lunar-equipment-finish.mjs";
import { addBuildingWear, buildingWearTile } from "../rendering/lunar-building-wear.mjs";
import { getAerospaceTrimSheet } from "../rendering/lunar-trim-sheet.mjs";

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const LASER = 0x72d9d2;
const UP = new THREE.Vector3(0, 1, 0);
const CASING_RADIUS = 0.854;
const CASING_HEIGHT = 1.365;
const PAD_FEET = [[-1.35, -0.84], [1.35, -0.84], [-1.39, 0.82], [1.39, 0.82]];
const WORKSHOP_STOP = new THREE.Vector3(0.52, 0, 3.28);
const WORKSHOP_ACCESS_RADIUS = 3.8;

function canvasTexture(width, height, color, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const brush = canvas.getContext("2d");
  paint?.(brush, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, brush, width, height };
}

function finishMaterial(color, roughness, metalness, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
}

function materials() {
  let seed = 838271;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const foilColor = canvasTexture(256, 128, true, (brush, width, height) => {
    const base = brush.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, "#efede5");
    base.addColorStop(0.65, "#dfdcd3");
    base.addColorStop(1, "#aaa596");
    brush.fillStyle = base;
    brush.fillRect(0, 0, width, height);
    for (let i = 0; i < 1700; i++) {
      const opacity = (0.07 + rand() * 0.20).toFixed(2);
      brush.fillStyle = i % 3 ? `rgba(55,49,39,${opacity})` : `rgba(248,245,220,${opacity})`;
      brush.fillRect(rand() * width, rand() * height, 0.3 + rand() * 2.4, 0.35 + rand() * 1.3);
    }
    for (let pass = 0; pass < 46; pass++) {
      const y = rand() * height, start = rand() * width;
      brush.fillStyle = "rgba(91,85,70,.08)";
      brush.fillRect(start, y, 6 + 22 * rand(), 0.8);
    }
  }).texture;
  const trim = getAerospaceTrimSheet();
  const finish = {
    skin: finishMaterial(0xc8c7bd, 0.72, 0.24, { map: trim.map, normalMap: trim.normalMap, normalScale: new THREE.Vector2(0.85, 0.85), roughnessMap: trim.roughnessMap }),
    insulation: finishMaterial(0xedeae0, 0.80, 0.08, { map: trim.map, normalMap: trim.normalMap, normalScale: new THREE.Vector2(0.65, 0.65), roughnessMap: trim.roughnessMap }),
    plate: finishMaterial(0x808680, 0.64, 0.66, { normalMap: trim.normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: trim.roughnessMap }),
    bright: finishMaterial(0x9ca3a4, 0.49, 0.82),
    black: finishMaterial(0x272c2b, 0.77, 0.22),
    polymer: finishMaterial(0x262a27, 0.83, 0.18),
    ochre: finishMaterial(0xa47348, 0.72, 0.09),
    copper: finishMaterial(0xa56346, 0.54, 0.6),
    ground: finishMaterial(0x77736a, 0.92, 0.02, { map: foilColor }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x273939, metalness: 0.34, roughness: 0.25, clearcoat: 0.86 }),
    task: finishMaterial(0xffddb4, 0.38, 0.12, { emissive: 0xffc880, emissiveIntensity: 0.76 }),
    alarm: finishMaterial(0xd17348, 0.5, 0.22, { emissive: 0xdd6a3a, emissiveIntensity: 0.32 }),
  };
  const dustReach = 1.74;
  const profiles = {
    skin: [0.93, 0.68, 0.0031, 0.26],
    insulation: [0.91, 0.42, 0.0037, 0.18],
    plate: [0.68, 0.76, 0.0029, 0.58],
    bright: [0.32, 0.35, 0.0012, 0.73],
    black: [0.82, 0.41, 0.0026, 0.24],
    ochre: [0.64, 0.89, 0.0032, 0.26],
    ground: [0.90, 0.37, 0.0040, 0.12],
  };
  const tile = buildingWearTile();
  for (const [key, profile] of Object.entries(profiles)) {
    const material = finish[key];
    material.userData.buildingWear = true;
    addBuildingWear(material, tile, profile, dustReach);
  }
  return finish;
}

function staticParts(parent, gradeOffset = 0) {
  const materialParts = new Map();
  let sequence = 0;
  return {
    add(material, source, x = 0, y = 0, z = 0, contact = 0) {
      const geometry = source.index ? source.toNonIndexed() : source;
      if (geometry !== source) source.dispose();
      geometry.translate(x, y, z);
      if (material.userData.buildingWear) {
        const positions = geometry.attributes.position;
        const finish = new Float32Array(positions.count * 4);
        const seed = (++sequence * 0.61803398875) % 1;
        const tube = source.type === "CylinderGeometry" || source.type === "LatheGeometry" || source.type === "TorusGeometry";
        for (let i = 0; i < positions.count; i++) {
          finish[i * 4] = positions.getY(i) + gradeOffset;
          finish[i * 4 + 1] = seed;
          finish[i * 4 + 2] = Number(tube);
          finish[i * 4 + 3] = contact;
        }
        geometry.setAttribute("equipmentFinish", new THREE.BufferAttribute(finish, 4));
      }
      if (!materialParts.has(material)) materialParts.set(material, []);
      materialParts.get(material).push(geometry);
    },
    flush() {
      for (const [material, parts] of materialParts) {
        const all = mergeGeometries(parts);
        for (const part of parts) part.dispose();
        if (!all) throw new Error("Lunar base part geometry is incompatible");
        const mesh = new THREE.Mesh(all, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    },
  };
}

function block(parts, material, width, height, depth, x, y, z, radius = 0, tilt = 0, contact = 0) {
  const geometry = radius
    ? new RoundedBoxGeometry(width, height, depth, 1, Math.min(radius, Math.min(width, height, depth) * 0.48))
    : new THREE.BoxGeometry(width, height, depth);
  if (tilt) geometry.rotateX(tilt);
  parts.add(material, geometry, x, y, z, contact);
}

function fastener(parts, material, x, y, z, axis = "z", radius = 0.018) {
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.012, 6);
  if (axis === "z") geometry.rotateX(HALF_PI);
  else if (axis === "x") geometry.rotateZ(HALF_PI);
  parts.add(material, geometry, x, y, z, 0.33);
}

function pipe(parts, material, start, end, radius, endRadius = radius, contact = 0) {
  const point = new THREE.Vector3(...start);
  const delta = new THREE.Vector3(...end).sub(point);
  const geometry = new THREE.CylinderGeometry(endRadius, radius, delta.length(), 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, delta.clone().normalize()));
  parts.add(material, geometry, ...point.addScaledVector(delta, 0.5).toArray(), contact);
}

function hose(parts, material, route, radius) {
  const curve = new THREE.CatmullRomCurve3(route.map(point => new THREE.Vector3(...point)));
  parts.add(material, new THREE.TubeGeometry(curve, 24, radius, 7, false));
}

function ring(parts, material, radius, thickness, x, y, z, axis = "z", arc = PI * 2) {
  const geometry = new THREE.TorusGeometry(radius, thickness, 7, 52, arc);
  if (axis === "x") geometry.rotateY(HALF_PI);
  if (axis === "y") geometry.rotateX(HALF_PI);
  parts.add(material, geometry, x, y, z);
}

function shellPatch(radius, start, end, left, right) {
  const segments = 14;
  const position = [];
  const uv = [];
  const indices = [];
  for (let step = 0; step <= segments; step++) {
    const t = step / segments;
    const angle = THREE.MathUtils.lerp(start, end, t);
    for (const [column, x] of [left, right].entries()) {
      position.push(x, CASING_HEIGHT + Math.cos(angle) * radius, Math.sin(angle) * radius);
      uv.push(column, t);
    }
    if (step < segments) {
      const i = step * 2;
      indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function addGrounding(parts, finish, localGround) {
  for (const [x, z] of PAD_FEET) {
    const y = localGround(x, z);
    parts.add(finish.ground, new THREE.CylinderGeometry(0.198, 0.228, 0.073, 20), x, y + 0.022, z);
    parts.add(finish.black, new THREE.CylinderGeometry(0.153, 0.182, 0.047, 18), x, y + 0.069, z);
    parts.add(finish.plate, new THREE.CylinderGeometry(0.082, 0.109, 0.055, 14), x, y + 0.114, z);
    pipe(parts, finish.plate, [x, y + 0.14, z], [x * 0.91, 0.37, z * 0.91], 0.047, 0.071);
    pipe(parts, finish.black, [x, y + 0.102, z], [x * 0.72, 0.344, z], 0.028);
    pipe(parts, finish.ochre, [x, y + 0.14, z], [x, 0.292, z * 0.64], 0.025);
    fastener(parts, finish.bright, x, y + 0.104, z + 0.124, "y", 0.014);
    fastener(parts, finish.bright, x, y + 0.104, z - 0.124, "y", 0.014);
  }
  block(parts, finish.black, 3.02, 0.24, 1.75, 0, 0.385, 0, 0.038);
  for (const z of [-0.724, 0.724]) {
    block(parts, finish.plate, 3.14, 0.086, 0.241, 0, 0.311, z, 0.012);
    for (const x of [-1.28, -0.46, 0.46, 1.28]) {
      block(parts, finish.bright, 0.094, 0.13, 0.12, x, 0.348, z * 1.21, 0.009);
    }
  }
}

function addPressureHull(parts, f) {
  const profile = [
    [0.001, -1.54], [0.38, -1.51], [0.586, -1.44], [0.735, -1.35], [0.82, -1.22], [0.836, -1.12],
    [0.836, 1.12], [0.82, 1.22], [0.735, 1.35], [0.586, 1.44], [0.38, 1.51], [0.001, 1.54],
  ].map(([radius, longitudinal]) => new THREE.Vector2(radius, longitudinal));
  const casing = new THREE.LatheGeometry(profile, 48);
  casing.rotateZ(HALF_PI);
  parts.add(f.skin, casing, 0, CASING_HEIGHT, 0);
  const seams = [-1.125, -0.61, -0.073, 0.53, 1.125];
  for (let i = 0; i < seams.length - 1; i++) {
    const from = seams[i] + 0.012, to = seams[i + 1] - 0.012;
    const cover = i % 2 ? f.skin : f.insulation;
    parts.add(cover, shellPatch(CASING_RADIUS, -1.60, 0.37, from, to), 0, 0, 0, 0.07);
    parts.add(f.insulation, shellPatch(CASING_RADIUS, 0.401, 1.26, from, to), 0, 0, 0, 0.11);
    parts.add(cover, shellPatch(CASING_RADIUS, 1.285, 2.09, from, to), 0, 0, 0, i === 1 ? 0.55 : 0.29);
  }
  for (const x of [-1.16, -0.615, 0.535, 1.16]) {
    ring(parts, f.black, 0.849, 0.035, x, CASING_HEIGHT, 0, "x");
    ring(parts, f.plate, 0.869, 0.017, x + 0.029, CASING_HEIGHT, 0, "x");
    // Heavy external structural gusset lugs around each stiffening ring break the smooth cylinder silhouette.
    for (let k = 0; k < 6; k++) {
      const a = -0.75 + k * 0.52;
      block(parts, f.bright, 0.068, 0.052, 0.065, x + 0.014, CASING_HEIGHT + Math.cos(a) * 0.885, Math.sin(a) * 0.885, 0.008);
    }
  }
  // Cantilevered micrometeoroid Whipple armor shields stand off the upper flanks.
  for (const [startA, endA] of [[-0.95, -0.22], [0.22, 0.92]]) {
    parts.add(f.plate, shellPatch(CASING_RADIUS + 0.075, startA, endA, -1.04, 1.02), 0, 0, 0, 0.14);
    for (const sx of [-0.88, 0.0, 0.88]) {
      const midA = (startA + endA) * 0.5;
      pipe(parts, f.black,
        [sx, CASING_HEIGHT + Math.cos(midA) * CASING_RADIUS, Math.sin(midA) * CASING_RADIUS],
        [sx, CASING_HEIGHT + Math.cos(midA) * (CASING_RADIUS + 0.078), Math.sin(midA) * (CASING_RADIUS + 0.078)],
        0.022);
    }
  }
  // External dorsal spherical cryogenic O2/H2 storage tanks & curved copper/steel umbilical pipes.
  for (const tx of [-0.34, 0.24]) {
    parts.add(f.bright, new THREE.SphereGeometry(0.195, 16, 12), tx, CASING_HEIGHT + 0.94, -0.26);
    ring(parts, f.black, 0.202, 0.016, tx, CASING_HEIGHT + 0.94, -0.26, "y");
    pipe(parts, f.plate, [tx, CASING_HEIGHT + 0.74, -0.26], [tx, CASING_HEIGHT + 0.82, -0.26], 0.042);
  }
  hose(parts, f.copper, [[-0.34, CASING_HEIGHT + 0.94, -0.06], [-0.05, CASING_HEIGHT + 1.02, -0.02], [0.24, CASING_HEIGHT + 0.94, -0.06]], 0.024);
  hose(parts, f.plate, [[0.24, CASING_HEIGHT + 0.94, -0.46], [0.68, CASING_HEIGHT + 0.86, -0.58], [0.96, CASING_HEIGHT + 0.45, -0.78]], 0.028);
  // Astronaut EVA yellow/ochre handrail loops bolted along the front flank.
  for (const hx of [-0.88, 0.22]) {
    hose(parts, f.ochre, [
      [hx - 0.18, CASING_HEIGHT - 0.16, 0.85],
      [hx - 0.18, CASING_HEIGHT - 0.16, 0.935],
      [hx + 0.18, CASING_HEIGHT - 0.16, 0.935],
      [hx + 0.18, CASING_HEIGHT - 0.16, 0.85],
    ], 0.014);
  }
  for (const x of [-1.44, 1.44]) {
    const side = Math.sign(x);
    ring(parts, f.bright, 0.54, 0.018, x, CASING_HEIGHT, 0, "x");
    ring(parts, f.black, 0.355, 0.026, x + side * 0.06, CASING_HEIGHT, 0, "x");
    for (let bolt = 0; bolt < 10; bolt++) {
      const angle = bolt * PI / 5;
      fastener(parts, f.bright, x + side * 0.071, CASING_HEIGHT + 0.397 * Math.cos(angle), 0.397 * Math.sin(angle), "x", 0.017);
    }
  }

  // The dark rear radiator is mechanically separate from the insulated pressure vessel.
  block(parts, f.black, 1.41, 0.62, 0.105, 0.13, 1.19, -0.821, 0.026);
  for (let fin = 0; fin < 15; fin++) {
    block(parts, fin % 5 === 0 ? f.plate : f.black, 0.036, 0.55, 0.118,
      -0.49 + fin * 0.088, 1.191, -0.906, 0.005);
  }
  for (const x of [-0.633, 0.897]) {
    hose(parts, f.copper, [[x, 1.54, -0.84], [x, 1.36, -0.966], [x, 0.97, -0.944], [x * 0.87, 0.77, -0.84]], 0.023);
  }
}

function addNameplate(station, text, subline, width, height, x, y, z) {
  const { texture } = canvasTexture(512, 128, true, (brush, w, h) => {
    brush.fillStyle = "#303536";
    brush.fillRect(0, 0, w, h);
    brush.strokeStyle = "#a49d89";
    brush.lineWidth = 3;
    brush.strokeRect(9, 9, w - 18, h - 18);
    brush.fillStyle = "#f0ece0";
    brush.font = "700 41px monospace";
    brush.fillText(text, 26, 58);
    brush.fillStyle = "#d9b68b";
    brush.font = "700 20px monospace";
    brush.fillText(subline, 28, 92);
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    finishMaterial(0xffffff, 0.78, 0.18, { map: texture, polygonOffset: true, polygonOffsetFactor: -1 }));
  mesh.position.set(x, y, z);
  station.add(mesh);
}

function addAirlock(station, parts, f) {
  const x = -0.686, y = 1.228;
  block(parts, f.plate, 1.122, 1.049, 0.151, x, y, 0.765, 0.133);
  block(parts, f.black, 0.964, 0.925, 0.111, x, y, 0.855, 0.105);
  const door = new THREE.CylinderGeometry(0.411, 0.435, 0.069, 48);
  door.rotateX(HALF_PI);
  parts.add(f.plate, door, x, y, 0.923, 0.15);
  ring(parts, f.polymer, 0.421, 0.021, x, y, 0.965);
  ring(parts, f.bright, 0.443, 0.027, x, y, 0.937);
  ring(parts, f.glass, 0.096, 0.014, x, y + 0.167, 0.993);
  const viewPort = new THREE.CircleGeometry(0.083, 36);
  parts.add(f.glass, viewPort, x, y + 0.167, 0.993);
  for (let bolt = 0; bolt < 14; bolt++) {
    const angle = bolt * PI / 7;
    fastener(parts, f.bright, x + 0.468 * Math.cos(angle), y + 0.468 * Math.sin(angle), 0.944);
  }
  for (const dy of [-0.236, 0.022, 0.229]) {
    block(parts, f.black, 0.132, 0.056, 0.071, x - 0.394, y + dy, 0.985, 0.012);
    pipe(parts, f.bright, [x - 0.356, y + dy - 0.063, 1.001], [x - 0.356, y + dy + 0.063, 1.001], 0.015);
  }
  block(parts, f.black, 0.126, 0.155, 0.036, x + 0.291, y - 0.044, 0.978, 0.009);
  pipe(parts, f.ochre, [x + 0.235, y - 0.077, 1.012], [x + 0.342, y + 0.023, 1.012], 0.024, 0.024, 1.05);
  block(parts, f.alarm, 0.041, 0.018, 0.011, x + 0.304, y - 0.104, 1.002);
  addNameplate(station, "AIRLOCK", "SEALED / LOCAL ONLY", 0.365, 0.091, x, y - 0.246, 0.971);
  for (const side of [-1, 1]) {
    const rail = x + side * 0.538;
    hose(parts, f.bright, [[rail, 0.711, 0.962], [rail, 0.902, 1.032], [rail, 1.471, 1.043], [rail, 1.625, 0.963]], 0.024);
    for (const h of [0.74, 1.59]) fastener(parts, f.plate, rail, h, 0.989);
  }
  for (let step = 0; step < 3; step++) {
    const stepY = 0.485 + step * 0.087;
    block(parts, f.black, 0.69, 0.071, 0.120, x, stepY, 1.188 - step * 0.086, 0.014);
    block(parts, f.bright, 0.63, 0.011, 0.109, x, stepY + 0.039, 1.188 - step * 0.086, 0, 0, 0.95);
  }
  for (const dx of [-0.288, 0.288]) {
    pipe(parts, f.plate, [x + dx, 0.42, 1.185], [x + dx, 0.719, 0.994], 0.028);
  }
}

function addBench(station, parts, f, glow, displayProgressStep, localGround) {
  block(parts, f.black, 1.318, 0.742, 0.086, 0.759, 1.164, 0.827, 0.018);
  for (const x of [0.148, 1.416]) {
    block(parts, f.plate, 0.072, 1.148, 0.077, x, 1.141, 0.937, 0.01);
    pipe(parts, f.black, [x, 0.599, 1.056], [x, 0.37, 0.715], 0.03);
  }

  // Expanded Cantilevered Robotic Gantry Assembly Bay (transforms the flat desk into an industrial fabrication dock).
  const gantryX = [0.02, 1.54];
  const gantryZ = 1.66;
  const gantryTopY = 2.14;
  for (const gx of gantryX) {
    const gy = localGround ? localGround(gx, gantryZ) : 0;
    // Grounded heavy leveling footpad + hydraulic jack base
    parts.add(f.ground, new THREE.CylinderGeometry(0.145, 0.175, 0.055, 16), gx, gy + 0.018, gantryZ);
    parts.add(f.black, new THREE.CylinderGeometry(0.11, 0.135, 0.042, 14), gx, gy + 0.055, gantryZ);
    // Twin vertical truss columns + diagonal shear bracing
    pipe(parts, f.plate, [gx, gy + 0.08, gantryZ], [gx, gantryTopY, gantryZ], 0.044, 0.038);
    pipe(parts, f.black, [gx, gy + 0.08, gantryZ - 0.16], [gx, gantryTopY - 0.06, gantryZ - 0.16], 0.024, 0.022);
    for (let b = 0; b < 4; b++) {
      const y0 = gy + 0.25 + b * 0.44;
      const y1 = Math.min(gantryTopY - 0.12, y0 + 0.42);
      pipe(parts, f.bright, [gx, y0, gantryZ], [gx, y1, gantryZ - 0.16], 0.013);
      pipe(parts, f.ochre, [gx, y0, gantryZ - 0.16], [gx, y0, gantryZ], 0.012);
    }
    // Overhead cantilevered longitudinal gantry rails tying back to the main habitat hull
    block(parts, f.plate, 0.088, 0.095, 1.08, gx, gantryTopY, 1.24, 0.012);
    block(parts, f.bright, 0.034, 0.032, 1.04, gx + (gx < 0.7 ? 0.042 : -0.042), gantryTopY - 0.035, 1.24, 0.004);
    // Diagonal back-brace into habitat stiffening frame
    pipe(parts, f.plate, [gx, gantryTopY - 0.04, 0.88], [gx, 1.56, 0.72], 0.032);
    pipe(parts, f.ochre, [gx, gantryTopY - 0.32, gantryZ - 0.04], [gx, gantryTopY - 0.04, gantryZ - 0.48], 0.018);
  }
  // Overhead transverse header truss, armored dust canopy ribs & twin angled work floodlights
  block(parts, f.black, 1.66, 0.085, 0.11, 0.78, gantryTopY + 0.065, gantryZ - 0.02, 0.014);
  block(parts, f.ochre, 1.48, 0.038, 0.028, 0.78, gantryTopY + 0.065, gantryZ + 0.044, 0.005);
  for (let rib = 0; rib < 5; rib++) {
    const rx = 0.16 + rib * 0.31;
    block(parts, f.plate, 0.042, 0.048, 0.86, rx, gantryTopY + 0.075, 1.22, 0.006);
  }
  block(parts, f.insulation, 1.54, 0.038, 0.56, 0.78, gantryTopY + 0.115, 1.04, 0.012, 0.04);
  // Outboard inert-gas purge tanks + armored power conduit mounted on the starboard gantry tower
  for (const tz of [1.44, 1.58]) {
    parts.add(f.ochre, new THREE.CylinderGeometry(0.056, 0.056, 0.48, 12), 1.635, 1.08, tz);
    parts.add(f.bright, new THREE.SphereGeometry(0.056, 12, 8), 1.635, 1.32, tz);
    ring(parts, f.black, 0.060, 0.009, 1.635, 1.18, tz, "y");
  }
  hose(parts, f.copper, [[1.635, 1.38, 1.51], [1.58, 1.66, 1.52], [1.48, 1.98, 1.36], [1.24, 2.06, 1.16]], 0.016);
  // Lower illuminated work canopy under the upper gantry
  block(parts, f.black, 0.96, 0.032, 0.088, 0.78, 1.96, 1.22, 0.008);
  block(parts, f.task, 0.84, 0.014, 0.046, 0.78, 1.938, 1.24, 0.003);
  const lamp = new THREE.SpotLight(0xffd5a0, 3.4, 3.2, 0.84, 0.68, 2);
  lamp.position.set(0.78, 1.90, 1.28);
  lamp.target.position.set(0.765, 0.78, 1.28);
  station.add(lamp, lamp.target);

  // Extended recessed sintering work deck & floor alignment apron
  block(parts, f.black, 1.38, 0.078, 0.46, 0.770, 0.925, 0.989, 0.016);
  block(parts, f.plate, 1.35, 0.036, 0.428, 0.770, 0.981, 0.973, 0.011, 0, 0.76);
  block(parts, f.polymer, 0.465, 0.008, 0.247, 0.440, 1.003, 1.003, 0.006);
  for (const x of [0.192, 0.544, 0.763, 1.365]) {
    fastener(parts, f.bright, x, 0.999, 1.159, "y", 0.013);
  }
  for (const x of [0.205, 1.334]) {
    block(parts, f.plate, 0.071, 0.532, 0.071, x, 0.646, 1.076, 0.008);
    block(parts, f.black, 0.159, 0.053, 0.146, x, 0.385, 1.089, 0.012);
    pipe(parts, f.plate, [x, 0.544, 1.073], [x, 0.876, 0.803], 0.022);
  }

  // Steel drawers and tethered spare packs under the counter leave the work surface usable.
  block(parts, f.black, 0.610, 0.315, 0.273, 0.461, 0.672, 0.963, 0.018);
  for (let drawer = 0; drawer < 3; drawer++) {
    const y = 0.568 + drawer * 0.100;
    block(parts, drawer === 2 ? f.plate : f.insulation, 0.572, 0.085, 0.029, 0.461, y, 1.110, 0.007, 0, 0.32);
    block(parts, f.black, 0.158, 0.025, 0.035, 0.461, y, 1.135, 0.007);
    pipe(parts, f.ochre, [0.417, y + 0.004, 1.160], [0.503, y + 0.004, 1.160], 0.009, 0.009, 0.87);
  }
  block(parts, f.black, 0.526, 0.050, 0.369, 1.091, 0.465, 0.959, 0.012);
  for (const [i, x] of [0.907, 1.083, 1.254].entries()) {
    const height = i === 1 ? 0.318 : 0.263;
    block(parts, i === 1 ? f.ochre : f.insulation, 0.132, height, 0.228, x, 0.499 + height / 2, 0.986, 0.016);
    block(parts, f.black, 0.138, 0.049, 0.237, x, 0.542, 0.986, 0.007);
    block(parts, f.plate, 0.104, 0.029, 0.142, x, 0.515 + height, 0.986, 0.004);
    fastener(parts, f.bright, x, 0.534 + height, 1.009, "y", 0.015);
  }
  pipe(parts, f.plate, [0.844, 0.603, 1.168], [1.341, 0.603, 1.168], 0.019);

  // The bay feeds sealed kit cases onto two short guide rails.
  const kitBay = new THREE.Group();
  kitBay.position.set(0.765, 0.677, 1.192);
  station.add(kitBay);
  const guides = staticParts(kitBay);
  block(guides, f.black, 0.54, 0.032, 0.56, 0, -0.018, 0.11, 0.006);
  for (const x of [-0.244, 0.244]) {
    block(guides, f.plate, 0.038, 0.277, 0.231, x, 0.143, -0.115, 0.006);
    block(guides, f.bright, 0.026, 0.03, 0.52, x, 0.011, 0.13, 0.004);
  }
  block(guides, f.plate, 0.523, 0.027, 0.222, 0, 0.284, -0.103, 0.006);
  block(guides, f.black, 0.490, 0.271, 0.027, 0, 0.142, -0.226, 0.004);
  guides.flush();
  const kitHatch = new THREE.Group();
  kitHatch.position.set(0, 0.276, 0);
  kitBay.add(kitHatch);
  const hatchParts = staticParts(kitHatch);
  block(hatchParts, f.plate, 0.463, 0.266, 0.022, 0, -0.137, 0, 0.008);
  block(hatchParts, f.ochre, 0.219, 0.019, 0.012, 0, -0.193, 0.013, 0.004);
  hatchParts.flush();

  // Animated 2-axis Traveling Laser-Sintering Gantry Bridge + Printhead Trolley + Hologram + Warning Beacon
  const gantryBridge = new THREE.Group();
  gantryBridge.position.set(0.78, gantryTopY - 0.055, 1.05);
  station.add(gantryBridge);
  const bridgeParts = staticParts(gantryBridge);
  block(bridgeParts, f.black, 1.48, 0.056, 0.088, 0, 0, 0, 0.008);
  block(bridgeParts, f.ochre, 1.40, 0.016, 0.096, 0, 0.024, 0, 0.004);
  for (const bx of [-0.71, 0.71]) {
    block(bridgeParts, f.plate, 0.072, 0.088, 0.18, bx, 0.012, 0, 0.008);
  }
  bridgeParts.flush();

  const printTrolley = new THREE.Group();
  printTrolley.position.set(0, -0.068, 0);
  gantryBridge.add(printTrolley);
  const trolleyParts = staticParts(printTrolley);
  block(trolleyParts, f.plate, 0.165, 0.092, 0.135, 0, 0, 0, 0.012);
  block(trolleyParts, f.black, 0.11, 0.085, 0.095, 0, -0.075, 0, 0.010);
  trolleyParts.add(f.bright, new THREE.CylinderGeometry(0.026, 0.014, 0.075, 12), 0, -0.145, 0);
  trolleyParts.flush();

  const laserEmitterMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.65, 3.2, 2.95), toneMapped: false, transparent: true, opacity: 0.92,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.014, 1, 8, 1, true), laserEmitterMat);
  laserBeam.visible = false;
  printTrolley.add(laserBeam);

  const weldLight = new THREE.PointLight(0x70f8eb, 0, 3.4, 2);
  weldLight.position.set(0.765, 0.92, 1.32);
  station.add(weldLight);

  // HDR sintering sparks bursting from the active laser focus point
  const weldSparkGeo = new THREE.BoxGeometry(0.006, 0.006, 0.036);
  const weldSparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3.8, 2.5, 1.0), toneMapped: false });
  const weldSparks = new THREE.InstancedMesh(weldSparkGeo, weldSparkMat, 24);
  weldSparks.count = 0;
  weldSparks.frustumCulled = false;
  station.add(weldSparks);
  const weldSparkData = Array.from({ length: 24 }, (_, i) => ({
    phase: (i / 24), angle: i * 2.39996, speed: 0.45 + (i % 5) * 0.16, lift: 0.55 + (i % 4) * 0.22,
  }));
  const sparkDummy = new THREE.Object3D();

  // Layer-by-layer Holographic Wireframe Blueprint floating over the kit sintering bed
  const holoGroup = new THREE.Group();
  holoGroup.position.set(0.765, 0.72, 1.34);
  holoGroup.visible = false;
  station.add(holoGroup);
  const holoMat = new THREE.LineBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 2.5, 2.35), toneMapped: false, transparent: true, opacity: 0.72,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const holoOuter = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.42, 0.24, 0.34)), holoMat);
  holoOuter.position.y = 0.13;
  const holoCore = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.095, 0)), holoMat);
  holoCore.position.y = 0.14;
  const holoScanPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.38),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(0.35, 2.2, 2.0), toneMapped: false, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  holoScanPlane.rotation.x = -HALF_PI;
  const holoRing = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.275, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(0.4, 2.1, 1.95), toneMapped: false, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  holoRing.rotation.x = -HALF_PI;
  holoRing.position.y = 0.008;
  holoGroup.add(holoOuter, holoCore, holoScanPlane, holoRing);

  // Rotating Industrial Amber Warning Beacon atop the starboard gantry tower
  const beaconGroup = new THREE.Group();
  beaconGroup.position.set(1.54, gantryTopY + 0.14, gantryZ - 0.02);
  station.add(beaconGroup);
  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.058, 0.045, 14), f.black);
  const beaconBulbMat = new THREE.MeshStandardMaterial({
    color: 0xffa63d, emissive: 0xff8c24, emissiveIntensity: 0.45, roughness: 0.22, metalness: 0.1,
    toneMapped: false,
  });
  const beaconDome = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.068, 14), beaconBulbMat);
  beaconDome.position.y = 0.052;
  const beaconRotor = new THREE.Group();
  beaconRotor.position.y = 0.056;
  const beaconSweepMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.6, 1.35, 0.25), toneMapped: false, transparent: true, opacity: 0,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beaconCone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 12, 1, true), beaconSweepMat);
  beaconCone.rotation.z = HALF_PI;
  beaconCone.position.x = 0.32;
  beaconRotor.add(beaconCone);
  beaconGroup.add(beaconBase, beaconDome, beaconRotor);

  // Clamps hold loose tools in vacuum. Each hand tool has a distinct working end.
  block(parts, f.plate, 0.059, 0.081, 0.172, 0.322, 1.044, 0.974, 0.005);
  block(parts, f.plate, 0.045, 0.065, 0.172, 0.403, 1.038, 0.974, 0.005);
  pipe(parts, f.bright, [0.276, 1.074, 1.014], [0.448, 1.074, 1.014], 0.016);
  pipe(parts, f.ochre, [0.202, 1.079, 1.014], [0.283, 1.077, 1.014], 0.025);
  pipe(parts, f.bright, [0.527, 1.019, 1.047], [0.594, 1.020, 0.950], 0.010);
  ring(parts, f.bright, 0.019, 0.006, 0.528, 1.021, 1.058, "y");
  block(parts, f.black, 0.103, 0.063, 0.120, 0.653, 1.029, 0.951, 0.011);
  fastener(parts, f.ochre, 0.652, 1.066, 0.959, "y", 0.018);

  block(parts, f.plate, 0.263, 0.084, 0.196, 1.011, 1.036, 0.992, 0.015);
  pipe(parts, f.black, [1.013, 1.078, 1.013], [1.043, 1.211, 1.101], 0.041);
  hose(parts, f.copper, [[1.124, 1.116, 1.097], [1.211, 1.057, 1.060], [1.240, 1.019, 0.922], [1.287, 1.020, 0.854]], 0.012);
  hose(parts, f.polymer, [[0.865, 1.152, 1.092], [0.814, 1.109, 1.053], [0.823, 1.044, 0.948], [0.848, 1.033, 0.849]], 0.009);
  addNameplate(station, "SELENE 07", "ROBOTIC GANTRY ASSEMBLY BAY", 1.12, 0.115, 0.78, 1.84, 0.88);

  const caseFinish = makeEquipmentFinish(0x848679, "paint", 83);
  block(parts, f.black, 0.315, 0.042, 0.205, 0.417, 1.030, 0.921, 0.013);
  block(parts, caseFinish, 0.309, 0.150, 0.184, 0.417, 1.118, 0.920, 0.014);
  block(parts, f.plate, 0.278, 0.115, 0.021, 0.417, 1.127, 1.022, 0.007);
  block(parts, f.glass, 0.122, 0.054, 0.017, 0.382, 1.152, 1.034, 0.007);
  for (const x of [0.303, 0.532]) {
    fastener(parts, f.bright, x, 1.169, 1.034, "z", 0.007);
    fastener(parts, f.bright, x, 1.083, 1.034, "z", 0.007);
  }
  ring(parts, f.black, 0.023, 0.007, 0.496, 1.132, 1.037);
  fastener(parts, f.ochre, 0.496, 1.132, 1.045, "z", 0.014);
  hose(parts, f.polymer, [
    [0.549, 1.090, 0.986], [0.588, 1.074, 1.045], [0.601, 1.019, 1.081],
    [0.675, 1.017, 1.121], [0.718, 0.998, 1.115],
  ], 0.008);
  addNameplate(station, "BUS TEST", "DC / 36–72 V", 0.134, 0.033, 0.386, 1.100, 1.034);

  const console = new THREE.Group();
  console.position.set(1.046, 1.225, 1.168);
  console.rotation.x = -0.32;
  station.add(console);
  const controls = staticParts(console, console.position.y);
  block(controls, f.black, 0.473, 0.273, 0.099, 0, 0, -0.024, 0.025);
  block(controls, f.plate, 0.446, 0.248, 0.021, 0, 0, 0.023, 0.012);
  block(controls, f.polymer, 0.033, 0.251, 0.085, -0.225, 0, 0, 0.007);
  block(controls, f.polymer, 0.033, 0.251, 0.085, 0.225, 0, 0, 0.007);
  for (const x of [-0.169, 0.169]) {
    for (const y of [-0.094, 0.095]) fastener(controls, f.bright, x, y, 0.041, "z", 0.010);
  }
  for (let i = 0; i < 3; i++) {
    block(controls, i === 1 ? f.ochre : f.black, 0.035, 0.021, 0.013, (i - 1) * 0.065, -0.096, 0.043, 0.003);
  }
  controls.flush();

  const face = canvasTexture(384, 176, true);
  const screenMaterial = finishMaterial(0xc2e8dc, 0.64, 0.08, { map: face.texture, emissive: LASER,
    emissiveMap: face.texture, emissiveIntensity: 0.48, roughness: 0.63 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.289, 0.141), screenMaterial);
  screen.position.set(0, 0.019, 0.039);
  console.add(screen);
  const pilot = glow?.(console, LASER, 0.095, 0.48, 0.165, -0.061, 0.076);

  let previous = "";
  let bridgeZ = 1.05;
  let trolleyX = 0;
  const { brush, width, height } = face;
  function setWorkshopState({ near = false, active = false, progress = 0, item = "RELAY KIT", dt = 0.016, time = 0 } = {}) {
    // 1. Live mechanical & VFX animation every frame (gantry sintering, hologram, sparks, warning beacon)
    const printing = active && progress < 0.40;
    const printFrac = THREE.MathUtils.clamp(progress / 0.36, 0, 1);
    const targetBridgeZ = printing ? 1.32 + Math.sin(time * 3.4) * 0.15 : near ? 1.16 + Math.sin(time * 0.9) * 0.05 : 1.04;
    const targetTrolleyX = printing ? Math.sin(time * 8.2) * 0.22 : near ? Math.sin(time * 0.6) * 0.14 : 0;
    const smoothK = 1 - Math.exp(-9 * Math.max(0.001, dt));
    bridgeZ = THREE.MathUtils.lerp(bridgeZ, targetBridgeZ, smoothK);
    trolleyX = THREE.MathUtils.lerp(trolleyX, targetTrolleyX, smoothK);
    gantryBridge.position.z = bridgeZ;
    printTrolley.position.x = trolleyX;

    // Sintering laser & dynamic sparks during the additive manufacturing phase
    if (printing) {
      const targetY = 0.72 + printFrac * 0.24;
      const nozzleWorldY = gantryBridge.position.y + printTrolley.position.y - 0.18;
      const beamLen = Math.max(0.2, nozzleWorldY - targetY);
      laserBeam.visible = true;
      laserBeam.scale.set(1, beamLen, 1);
      laserBeam.position.set(0, -0.18 - beamLen * 0.5, 0);
      laserEmitterMat.opacity = 0.78 + 0.22 * Math.sin(time * 47);
      const hitX = gantryBridge.position.x + trolleyX;
      const hitZ = bridgeZ;
      weldLight.position.set(hitX, targetY + 0.06, hitZ);
      weldLight.intensity = 3.2 + Math.sin(time * 53) * 1.4;
      for (let i = 0; i < weldSparkData.length; i++) {
        const sp = weldSparkData[i];
        const age = (time * 2.8 + sp.phase) % 1;
        const r = age * sp.speed * 0.32;
        const sy = targetY + age * sp.lift * 0.38 - age * age * 0.42;
        sparkDummy.position.set(hitX + Math.cos(sp.angle + time * 2) * r, Math.max(0.68, sy), hitZ + Math.sin(sp.angle + time * 2) * r);
        sparkDummy.rotation.set(age * 6, sp.angle, 0);
        const s = (1 - age) * 1.1;
        sparkDummy.scale.set(s, s, s * 1.6);
        sparkDummy.updateMatrix();
        weldSparks.setMatrixAt(i, sparkDummy.matrix);
      }
      weldSparks.count = weldSparkData.length;
      weldSparks.instanceMatrix.needsUpdate = true;
    } else {
      laserBeam.visible = false;
      weldLight.intensity = THREE.MathUtils.lerp(weldLight.intensity, 0, smoothK);
      weldSparks.count = 0;
    }

    // Layer-by-layer Holographic Blueprint preview when near or fabricating
    const showHolo = active ? progress < 0.44 : near;
    holoGroup.visible = showHolo;
    if (showHolo) {
      const reveal = active ? THREE.MathUtils.clamp(printFrac, 0.08, 1) : 0.72 + 0.08 * Math.sin(time * 2.2);
      holoOuter.scale.set(1, reveal, 1);
      holoOuter.position.y = 0.13 * reveal;
      holoCore.rotation.y = time * (active ? 2.8 : 0.9);
      holoCore.rotation.x = time * 0.7;
      holoCore.scale.setScalar(reveal);
      holoScanPlane.position.y = 0.015 + reveal * 0.24;
      holoRing.rotation.z = time * (active ? 1.8 : 0.45);
      const fadeOut = active && progress > 0.36 ? 1 - THREE.MathUtils.smoothstep(progress, 0.36, 0.44) : 1;
      holoMat.opacity = (active ? 0.85 : 0.42) * fadeOut;
    }

    // Rotating Industrial Amber Warning Beacon
    if (active) {
      beaconRotor.rotation.y = time * 6.5;
      beaconBulbMat.emissiveIntensity = 2.6 + 0.9 * Math.sin(time * 12);
      beaconSweepMat.opacity = 0.34;
    } else if (near) {
      beaconRotor.rotation.y = time * 1.6;
      beaconBulbMat.emissiveIntensity = 1.05 + 0.35 * Math.sin(time * 3.5);
      beaconSweepMat.opacity = 0.12;
    } else {
      beaconBulbMat.emissiveIntensity = 0.28;
      beaconSweepMat.opacity = 0;
    }

    // 2. Canvas Telemetry Screen update (throttled by discrete key)
    const percent = displayProgressStep * Math.round(THREE.MathUtils.clamp(progress, 0, 1) * 100 / displayProgressStep);
    const display = active ? "SINTERING" : near ? "BAY READY" : "STANDBY";
    const key = `${display}:${active ? percent : "-"}:${item}`;
    if (key === previous) return;
    previous = key;
    screenMaterial.emissiveIntensity = active ? 1.25 : near ? 0.86 : 0.42;
    if (pilot) pilot.material.opacity = active ? 0.85 : near ? 0.70 : 0.36;
    lamp.intensity = active ? 5.2 : near ? 4.0 : 2.3;

    brush.fillStyle = "#0b1717";
    brush.fillRect(0, 0, width, height);
    brush.strokeStyle = "#52847d";
    brush.lineWidth = 3;
    brush.strokeRect(10, 10, width - 20, height - 20);
    brush.fillStyle = "#93d6cc";
    brush.font = "700 44px monospace";
    brush.fillText(display, 26, 63, width - 52);
    brush.font = "25px monospace";
    brush.fillStyle = "#70a69f";
    brush.fillText(active ? `${item} ${percent}%` : near ? item : "SELENE / GANTRY BAY", 26, 108, width - 52);
    brush.fillStyle = "#234944";
    brush.fillRect(26, 134, width - 52, 12);
    brush.fillStyle = active ? "#faad66" : "#79caba";
    brush.fillRect(26, 134, (width - 52) * (active ? percent / 100 : near ? 0.81 : 0.17), 12);
    face.texture.needsUpdate = true;
  }
  setWorkshopState();
  return { setWorkshopState, console, kitBay, kitHatch };
}

function addCommunications(parts, f) {
  block(parts, f.black, 0.502, 0.103, 0.372, -0.751, 2.171, -0.330, 0.022);
  pipe(parts, f.plate, [-0.74, 2.21, -0.313], [-0.73, 2.418, -0.273], 0.049, 0.027);
  const profiles = Array.from({ length: 16 }, (_, index) => {
    const r = 0.296 * (index + 0.01) / 15;
    return new THREE.Vector2(r, r * r * 1.5);
  });
  const dish = new THREE.LatheGeometry(profiles, 42);
  dish.rotateX(0.51).rotateZ(-0.25);
  const dishMetal = f.plate.clone();
  dishMetal.side = THREE.DoubleSide;
  parts.add(dishMetal, dish, -0.724, 2.418, -0.268);
  for (const [x, z] of [[-0.94, -0.194], [-0.581, -0.090], [-0.562, -0.452]]) {
    pipe(parts, f.bright, [x, 2.511, z], [-0.649, 2.563, -0.153], 0.008);
  }
  pipe(parts, f.ochre, [-0.678, 2.543, -0.163], [-0.618, 2.581, -0.143], 0.021);
  block(parts, f.black, 0.205, 0.117, 0.176, 0.982, 2.147, -0.195, 0.017);
  pipe(parts, f.bright, [0.979, 2.210, -0.196], [0.984, 2.72, -0.218], 0.017, 0.009);
  pipe(parts, f.ochre, [0.984, 2.720, -0.218], [0.985, 2.770, -0.220], 0.010, 0.006);
  for (const y of [2.253, 2.329, 2.39]) {
    ring(parts, f.black, 0.021, 0.007, 0.980, y, -0.202, "y");
  }
  hose(parts, f.polymer, [[-0.49, 2.222, -0.365], [-0.146, 2.254, -0.220], [0.363, 2.225, -0.183], [0.882, 2.168, -0.181]], 0.013);
  for (const x of [-0.097, 0.420, 0.742]) {
    block(parts, f.bright, 0.060, 0.031, 0.059, x, 2.225, -0.195, 0.006);
  }
}

export function createLunarBase({ height, glow, displayProgressStep = 1, x = -9.17, z = -7.5, yaw = 0.38 }) {
  const station = new THREE.Group();
  station.name = "Selene 07 habitat and workshop";
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const sampleGround = (u, v) => height(x + c * u + s * v, z - s * u + c * v);
  const datum = Math.max(height(x, z), ...PAD_FEET.map(([u, v]) => sampleGround(u, v)));
  station.position.set(x, datum, z);
  station.rotation.y = yaw;
  const localGround = (u, v) => sampleGround(u, v) - datum;
  const finish = materials();
  const parts = staticParts(station);
  addGrounding(parts, finish, localGround);
  addPressureHull(parts, finish);
  addAirlock(station, parts, finish);
  const { setWorkshopState, console, kitBay, kitHatch } = addBench(station, parts, finish, glow, displayProgressStep, localGround);
  addCommunications(parts, finish);
  parts.flush();

  const workshopPoint = station.localToWorld(WORKSHOP_STOP.clone());
  workshopPoint.y = height(workshopPoint.x, workshopPoint.z);
  const workshopMarker = console.getWorldPosition(new THREE.Vector3());
  workshopMarker.y += 0.22;
  const workshopAccess = { x, z, frontX: s, frontZ: c, radius: WORKSHOP_ACCESS_RADIUS };
  return {
    station, workshopPoint, workshopAccess, workshopMarker, kitBay, kitHatch,
    visitRadius: 1.05, setWorkshopState, obstacle: { x, z, radius: 2.13 },
  };
}
