import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const hubAnchor = { x: -8.12, z: -10.50, yaw: 0.34 };
const instrumentAnchor = { x: -10.47, z: -8.60, yaw: 0.12 };
const reflectorAnchor = { x: -6.92, z: -10.78, yaw: 0.48 };
const hubPort = [-0.385, 0.145, 0.322];
const instrumentPort = [0.14, 0.091, -0.08];

function createHardwareFinish() {
  const size = 96;
  const bytes = new Uint8Array(size ** 2 * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fold = 0.53 * Math.sin(x * 0.34 + y * 0.16 + 0.9 * Math.cos(y * 0.17));
      const crinkle = 0.27 * Math.cos(x * 0.72 - y * 0.62) + 0.13 * Math.sin(x * 1.45 + y * 1.32);
      const pixel = 4 * (y * size + x);
      bytes[pixel] = Math.round(127 + 101 * (fold + crinkle));
      bytes[pixel + 1] = Math.round(168 + 45 * crinkle - 31 * Math.abs(fold));
      bytes[pixel + 2] = 255;
      bytes[pixel + 3] = 255;
    }
  }
  const foilBump = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  foilBump.wrapS = foilBump.wrapT = THREE.RepeatWrapping;
  foilBump.magFilter = THREE.LinearFilter;
  foilBump.minFilter = THREE.LinearMipmapLinearFilter;
  foilBump.generateMipmaps = true;
  foilBump.needsUpdate = true;
  const material = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    aluminum: material(0x9a988b, 0.51, 0.47),
    oxide: material(0x3e3e3b, 0.65, 0.27),
    cream: material(0xb8b6aa, 0.70, 0.07),
    feet: material(0x68675d, 0.89, 0.10),
    rubber: material(0x36332e, 0.87, 0.03),
    copper: material(0x8f7756, 0.56, 0.42),
    goldFoil: new THREE.MeshStandardMaterial({
      color: 0x9a7546, roughness: 0.69, metalness: 0.65,
      roughnessMap: foilBump, bumpMap: foilBump, bumpScale: 0.011,
    }),
    silverFoil: new THREE.MeshStandardMaterial({
      color: 0xb5b3a8, roughness: 0.66, metalness: 0.59,
      roughnessMap: foilBump, bumpMap: foilBump, bumpScale: 0.010,
    }),
    silica: new THREE.MeshPhysicalMaterial({
      color: 0xb4b7af, ior: 1.46, roughness: 0.19, metalness: 0.21,
      clearcoat: 0.66, clearcoatRoughness: 0.23,
    }),
    indicator: new THREE.MeshStandardMaterial({
      color: 0x9baca5, emissive: 0x315041, emissiveIntensity: 0.15, roughness: 0.54,
    }),
  };
}

function createHardwareBatch(group, height) {
  const surfaces = new Map();
  const mount = new THREE.Object3D();
  const part = new THREE.Object3D();
  const transform = new THREE.Matrix4();

  function anchor(x, y, z, yaw) {
    mount.position.set(x, y, z);
    mount.rotation.set(0, yaw, 0);
    mount.updateMatrix();
  }

  function place(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    part.position.set(x, y, z);
    part.rotation.set(rx, ry, rz);
    part.updateMatrix();
    transform.multiplyMatrices(mount.matrix, part.matrix);
    geometry.applyMatrix4(transform);
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
    if (triangles !== geometry) geometry.dispose();
    const pending = surfaces.get(material) ?? [];
    pending.push(triangles);
    surfaces.set(material, pending);
  }

  function box(material, x, y, z, width, height, depth, radius = 0) {
    const geometry = radius
      ? new RoundedBoxGeometry(width, height, depth, 1, radius)
      : new THREE.BoxGeometry(width, height, depth);
    place(geometry, material, x, y, z);
  }

  function strut(material, from, to, radius, thickness = radius) {
    const start = new THREE.Vector3(...from), tip = new THREE.Vector3(...to);
    const length = start.distanceTo(tip);
    const bar = new THREE.CylinderGeometry(thickness, radius, length, 8);
    bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), tip.clone().sub(start).normalize(),
    ));
    const middle = start.lerp(tip, 0.5);
    place(bar, material, middle.x, middle.y, middle.z);
  }

  function ground(x, z) {
    const point = new THREE.Vector3(x, 0, z).applyMatrix4(mount.matrix);
    return height(point.x, point.z) - mount.position.y;
  }

  function foot(material, x, z, width, depth, thickness = 0.031) {
    const y = ground(x, z) + thickness * 0.25;
    box(material, x, y, z, width, thickness, depth, thickness * 0.24);
    return y + thickness * 0.5;
  }

  function finish() {
    for (const [material, geometries] of surfaces) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      for (const geometry of geometries) geometry.dispose();
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  return { anchor, box, place, strut, ground, foot, finish };
}

function foldedFoil(width, height, phase) {
  const foil = new THREE.PlaneGeometry(width, height, 18, 7);
  const points = foil.attributes.position;
  for (let vertex = 0; vertex < points.count; vertex++) {
    const x = points.getX(vertex), y = points.getY(vertex);
    const fold = 0.63 * Math.sin(x * 45 + y * 18 + phase) + 0.24 * Math.sin(x * 86 - y * 47);
    const bow = 1 - Math.min(1, Math.abs(y * 2 / height));
    points.setZ(vertex, bow * (0.007 + 0.011 * fold));
  }
  foil.computeVertexNormals();
  return foil;
}

function createHub(batch, material) {
  const { box, place, strut, foot } = batch;
  const { aluminum, oxide, cream, feet, rubber, copper, goldFoil, silverFoil, indicator } = material;
  box(oxide, 0, 0.111, 0, 0.92, 0.092, 0.62, 0.012);
  box(cream, 0, 0.230, 0, 0.84, 0.179, 0.56, 0.017);
  box(oxide, 0, 0.348, 0, 0.82, 0.045, 0.56, 0.009);

  place(foldedFoil(0.80, 0.171, 0.41), silverFoil, 0, 0.233, -0.281, 0, Math.PI);
  place(foldedFoil(0.54, 0.171, 1.52), goldFoil, -0.422, 0.234, 0, 0, -Math.PI / 2);
  place(foldedFoil(0.54, 0.171, 3.20), silverFoil, 0.422, 0.234, 0, 0, Math.PI / 2);
  box(oxide, 0.041, 0.221, 0.287, 0.66, 0.156, 0.023, 0.008);
  for (let index = 0; index < 12; index++) {
    box(aluminum, -0.246 + index * 0.049, 0.222, 0.308, 0.024, 0.136, 0.034, 0.002);
  }

  // The top sunshield sits away from the heat sink and foil jacket.
  for (const x of [-0.356, 0.356]) {
    for (const z of [-0.251, 0.251]) {
      const support = foot(feet, x * 1.21, z * 1.21, 0.158, 0.126);
      strut(aluminum, [x * 1.21, support, z * 1.21], [x, 0.118, z], 0.024, 0.028);
      strut(oxide, [x, 0.332, z], [x * 1.17, 0.472, z * 1.12], 0.009);
      place(new THREE.CylinderGeometry(0.016, 0.019, 0.014, 8), rubber, x, 0.500, z);
    }
  }
  box(cream, 0, 0.483, 0, 0.96, 0.030, 0.68, 0.007);
  box(aluminum, 0, 0.465, 0.331, 0.91, 0.023, 0.014, 0.004);
  box(copper, ...hubPort, 0.064, 0.061, 0.034, 0.007);
  box(rubber, hubPort[0], hubPort[1], hubPort[2] + 0.020, 0.042, 0.039, 0.014, 0.004);
  box(indicator, 0.318, 0.220, 0.331, 0.018, 0.018, 0.012);

  const mast = [-0.312, 0.491, -0.205];
  box(oxide, mast[0], mast[1] + 0.027, mast[2], 0.088, 0.072, 0.098, 0.009);
  strut(aluminum, [mast[0], 0.551, mast[2]], [mast[0] + 0.017, 0.970, mast[2] - 0.010], 0.021, 0.015);
  place(new THREE.CylinderGeometry(0.036, 0.043, 0.047, 10), copper, mast[0] + 0.017, 0.982, mast[2] - 0.010, 0, 0, Math.PI / 2);
  const antennaBase = [mast[0] + 0.017, 1.009, mast[2] - 0.018];
  const antennaTip = [mast[0] - 0.217, 1.161, mast[2] - 0.495];
  strut(cream, antennaBase, antennaTip, 0.019, 0.013);
  strut(aluminum, antennaBase, [mast[0] + 0.087, 1.032, mast[2] - 0.058], 0.008);
  place(new THREE.SphereGeometry(0.017, 8, 5), oxide, ...antennaTip);
}

function createSeismicHead(batch, material) {
  const { box, place, strut, foot } = batch;
  const { aluminum, oxide, feet, rubber, copper, goldFoil } = material;
  place(new THREE.CylinderGeometry(0.118, 0.142, 0.038, 16), oxide, 0, 0.071, 0);
  place(new THREE.CylinderGeometry(0.101, 0.115, 0.087, 16), goldFoil, 0, 0.128, 0);
  place(new THREE.CylinderGeometry(0.079, 0.112, 0.027, 16), aluminum, 0, 0.185, 0);
  place(new THREE.CylinderGeometry(0.034, 0.045, 0.014, 10), oxide, 0, 0.205, 0);
  for (let index = 0; index < 3; index++) {
    const angle = (index + 0.29) * Math.PI * 2 / 3;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const x = cosine * 0.147, z = sine * 0.147;
    const support = foot(feet, x, z, 0.077, 0.068, 0.030);
    strut(aluminum, [x, support, z], [cosine * 0.113, 0.088, sine * 0.113], 0.011);
  }
  box(copper, ...instrumentPort, 0.052, 0.041, 0.047, 0.005);
  box(rubber, instrumentPort[0] + 0.022, instrumentPort[1], instrumentPort[2], 0.027, 0.029, 0.032, 0.004);
}

function createReflector(batch, material) {
  const { box, place, strut, foot } = batch;
  const { aluminum, oxide, silica, feet } = material;
  const tilt = 0.34;
  const cosine = Math.cos(tilt), sine = Math.sin(tilt);
  const centerY = 0.264;
  const surface = (x, depth, normal) => [x, centerY - sine * depth + cosine * normal, cosine * depth + sine * normal];
  place(new RoundedBoxGeometry(1.05, 0.059, 0.65, 1, 0.011), aluminum, 0, centerY, 0, tilt);
  place(new RoundedBoxGeometry(0.993, 0.019, 0.589, 1, 0.005), oxide, ...surface(0, 0, 0.032), tilt);
  const bearing = -Math.PI / 2 + tilt;
  const rim = new THREE.RingGeometry(0.015, 0.019, 10);
  const optic = new THREE.CircleGeometry(0.015, 6);
  for (let column = 0; column < 20; column++) {
    for (let row = 0; row < 15; row++) {
      const x = (column - 9.5) * 0.0468;
      const depth = (row - 7) * 0.0379;
      place(rim.clone(), aluminum, ...surface(x, depth, 0.044), bearing);
      place(optic.clone(), silica, ...surface(x, depth, 0.043), bearing, 0, 0.087 * ((row + 3 * column) % 8));
    }
  }
  rim.dispose();
  optic.dispose();
  for (const x of [-0.437, 0.437]) {
    for (const z of [-0.228, 0.222]) {
      const onGround = foot(feet, x, z, 0.125, 0.089, 0.027);
      strut(aluminum, [x, onGround, z], surface(x, z * 0.94, -0.033), 0.013);
      strut(oxide, [x, onGround, z], surface(x, -z * 0.59, -0.039), 0.008);
    }
    box(oxide, x, centerY - 0.018, 0.015, 0.033, 0.054, 0.18, 0.007);
  }
}

function createCase(batch, material, scale) {
  const { box, place, foot, strut } = batch;
  const { aluminum, oxide, cream, feet, copper } = material;
  box(cream, 0, 0.149 * scale, 0, 0.65 * scale, 0.265 * scale, 0.43 * scale, 0.042 * scale);
  box(oxide, 0, 0.232 * scale, 0, 0.669 * scale, 0.018 * scale, 0.441 * scale, 0.009 * scale);
  box(aluminum, 0, 0.275 * scale, 0, 0.61 * scale, 0.062 * scale, 0.404 * scale, 0.023 * scale);
  for (const x of [-0.289, 0.289]) {
    box(oxide, x * scale, 0.115 * scale, 0, 0.021 * scale, 0.251 * scale, 0.45 * scale, 0.008 * scale);
    for (const z of [-0.151, 0.151]) {
      const support = foot(feet, x * scale, z * scale, 0.071 * scale, 0.093 * scale, 0.030 * scale);
      strut(aluminum, [x * scale, support, z * scale], [x * scale, 0.067 * scale, z * scale], 0.021 * scale);
    }
    box(copper, x * 0.72 * scale, 0.245 * scale, 0.232 * scale, 0.061 * scale, 0.077 * scale, 0.035 * scale, 0.011 * scale);
  }
  box(oxide, 0, 0.297 * scale, 0, 0.13 * scale, 0.037 * scale, 0.107 * scale, 0.011 * scale);
  box(aluminum, 0, 0.322 * scale, 0, 0.10 * scale, 0.021 * scale, 0.022 * scale, 0.006 * scale);
  for (const x of [-0.049, 0.049]) {
    place(new THREE.CylinderGeometry(0.008 * scale, 0.008 * scale, 0.055 * scale, 6), oxide, x * scale, 0.297 * scale, 0);
  }
}

function worldSocket(height, anchor, [localX, localY, localZ]) {
  const cosine = Math.cos(anchor.yaw), sine = Math.sin(anchor.yaw);
  return new THREE.Vector3(
    anchor.x + cosine * localX + sine * localZ,
    height(anchor.x, anchor.z) + localY,
    anchor.z - sine * localX + cosine * localZ,
  );
}

function createRibbonCable(height, from, to, material) {
  const points = [
    new THREE.Vector3(from.x, 0, from.z),
    new THREE.Vector3(from.x + 0.03, 0, from.z + 0.26),
    new THREE.Vector3(from.x - 0.37, 0, from.z + 0.53),
    new THREE.Vector3(from.x - 0.90, 0, from.z + 0.57),
    new THREE.Vector3(from.x - 1.12, 0, from.z + 0.98),
    new THREE.Vector3(to.x + 0.31, 0, to.z - 0.11),
    new THREE.Vector3(to.x, 0, to.z),
  ];
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
  const positions = [], indices = [];
  const segments = 86;
  for (let index = 0; index <= segments; index++) {
    const along = index / segments;
    const point = curve.getPointAt(along), tangent = curve.getTangentAt(along);
    // The deployed ribbon is laid along the soil. Two coils retain storage set.
    const coilA = Math.max(0, 1 - Math.abs(along - 0.38) / 0.087);
    const coilB = Math.max(0, 1 - Math.abs(along - 0.72) / 0.065);
    const slack = 0.083 * coilA * coilA + 0.041 * coilB * coilB;
    const startBlend = 1 - THREE.MathUtils.smoothstep(along, 0, 0.16);
    const endBlend = THREE.MathUtils.smoothstep(along, 0.89, 1);
    const halfWidth = 0.019;
    for (const side of [-1, 1]) {
      const x = point.x + tangent.z * halfWidth * side;
      const z = point.z - tangent.x * halfWidth * side;
      const twist = Math.sin(along * 20.9) * halfWidth * side * 11 * slack;
      const support = height(x, z) + 0.007 + slack + twist;
      const y = support * (1 - startBlend - endBlend) + from.y * startBlend + to.y * endBlend;
      positions.push(x, y, z);
    }
    if (index < segments) {
      const vertex = index * 2;
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cable = new THREE.Mesh(geometry, material);
  cable.name = "surface equipment ribbon cable";
  cable.castShadow = cable.receiveShadow = true;
  return cable;
}

function createBootStamp() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(64, 64, 44, 50, 0, 0, Math.PI * 2);
  ctx.ellipse(62, 181, 36, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-atop";
  for (let bar = 0; bar < 10; bar++) {
    const y = 30 + bar * 20;
    ctx.fillStyle = "rgba(55,55,55,0.82)";
    ctx.beginPath();
    ctx.moveTo(12, y);
    ctx.quadraticCurveTo(54, y + 15, 116, y - 6);
    ctx.lineTo(118, y + 3);
    ctx.quadraticCurveTo(41, y + 24, 12, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = "destination-out";
  let seed = 73652;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 450; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.13 + next() * 0.49})`;
    ctx.fillRect(next() * 128, next() * 256, 1 + next() * 4, 1 + next() * 5);
  }
  return new THREE.CanvasTexture(canvas);
}

function createBootImpressions(height) {
  const paths = [
    [[-7.68, -6.48], [-7.72, -7.26], [-7.52, -8.08], [-7.74, -8.86], [-8.08, -9.74], [-8.43, -10.43]],
    [[-2.86, 3.37], [-2.64, 2.62], [-2.31, 1.98], [-2.24, 1.32], [-2.13, 0.59], [-1.92, -0.09]],
  ];
  const treads = [];
  for (const path of paths) {
    for (let index = 0; index < path.length; index++) {
      const [centerX, centerZ] = path[index];
      const [facingX, facingZ] = path[Math.min(index + 1, path.length - 1)];
      const [pastX, pastZ] = path[Math.max(index - 1, 0)];
      const angle = Math.atan2(pastX - facingX, pastZ - facingZ) + Math.sin(2.1 * index) * 0.14;
      const side = index % 2 ? -1 : 1;
      const geometry = new THREE.PlaneGeometry(0.22, 0.42, 3, 4);
      geometry.rotateX(-Math.PI / 2);
      geometry.rotateY(angle);
      geometry.translate(centerX + Math.cos(angle) * side * 0.12, 0, centerZ - Math.sin(angle) * side * 0.12);
      const p = geometry.attributes.position;
      for (let vertex = 0; vertex < p.count; vertex++) {
        p.setY(vertex, height(p.getX(vertex), p.getZ(vertex)) + 0.012);
      }
      geometry.computeVertexNormals();
      treads.push(geometry);
    }
  }
  const combined = mergeGeometries(treads);
  for (const tread of treads) tread.dispose();
  const material = new THREE.MeshStandardMaterial({
    color: 0x4b4237, map: createBootStamp(), transparent: true, opacity: 0.47,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, roughness: 1,
  });
  const tracks = new THREE.Mesh(combined, material);
  tracks.name = "preserved EVA overshoe impressions";
  tracks.receiveShadow = true;
  return tracks;
}

export function addLunarFieldDetails(scene, height, { glow } = {}) {
  const field = new THREE.Group();
  field.name = "lunar instruments and EVA remnants";
  const material = createHardwareFinish();
  const batch = createHardwareBatch(field, height);

  function setGroundAnchor({ x, z, yaw }) {
    batch.anchor(x, height(x, z), z, yaw);
  }
  setGroundAnchor(hubAnchor);
  createHub(batch, material);
  setGroundAnchor(instrumentAnchor);
  createSeismicHead(batch, material);
  setGroundAnchor(reflectorAnchor);
  createReflector(batch, material);
  setGroundAnchor({ x: -9.39, z: -10.53, yaw: 0.18 });
  createCase(batch, material, 0.95);
  setGroundAnchor({ x: -7.48, z: -11.11, yaw: -0.58 });
  createCase(batch, material, 0.82);

  batch.finish();
  field.add(
    createRibbonCable(height,
      worldSocket(height, hubAnchor, [hubPort[0], hubPort[1], hubPort[2] + 0.022]),
      worldSocket(height, instrumentAnchor, [instrumentPort[0] + 0.025, instrumentPort[1], instrumentPort[2]]),
      new THREE.MeshStandardMaterial({ color: 0x65503c, roughness: 0.76, side: THREE.DoubleSide })),
    createBootImpressions(height),
  );
  if (glow) {
    const lamp = worldSocket(height, hubAnchor, [0.318, 0.220, 0.338]);
    glow(field, 0x81bfae, 0.022, 0.25, lamp.x, lamp.y, lamp.z);
  }
  scene.add(field);
  return field;
}
