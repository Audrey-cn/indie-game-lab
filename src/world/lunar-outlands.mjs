import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

import { addBuildingWear, buildingWearTile } from "../rendering/lunar-building-wear.mjs";

const materials = {
  insulation: { color: 0xd2cdc1, roughness: 0.79, metalness: 0.12 },
  structure: { color: 0x62656a, roughness: 0.74, metalness: 0.49 },
  dark: { color: 0x272c2e, roughness: 0.76, metalness: 0.27 },
  visor: { color: 0x1e303c, roughness: 0.28, metalness: 0.51 },
  solar: { color: 0x26394f, roughness: 0.40, metalness: 0.38 },
  foil: { color: 0xa5814f, roughness: 0.53, metalness: 0.56 },
  orange: { color: 0xb2703d, roughness: 0.74, metalness: 0.10 },
  status: { color: 0xb8d9d7, emissive: 0x6fa9a1, emissiveIntensity: 0.75, roughness: 0.32 },
  dish: { color: 0xd7d3cb, roughness: 0.57, metalness: 0.25, side: THREE.DoubleSide },
};

const surfaceWear = {
  insulation: [0.95, 0.83, 0.010, 0.39],
  structure: [0.89, 0.93, 0.008, 0.43],
  dark: [0.73, 0.47, 0.009, 0.18],
  foil: [0.78, 0.42, 0.020, 1.00],
  orange: [0.79, 0.87, 0.010, 0.31],
  dish: [0.10, 0.29, 0.005, 0.16],
};

export function createLunarOutlands({ x, z, yaw, sampleGround, sunlight, relaySites, applyDistantShadow }) {
  const facility = new THREE.Group();
  facility.name = "Distant Eudoxus lunar research facility";
  facility.position.set(x, sampleGround(x, z), z);
  facility.rotation.y = yaw;
  const { y: datum } = facility.position;
  const cosine = Math.cos(yaw), sine = Math.sin(yaw);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const chamferTemplate = new RoundedBoxGeometry(1, 1, 1, 1, 0.06);
  const chamferGeometry = mergeVertices(chamferTemplate);
  chamferTemplate.dispose();
  const roundGeometry = new THREE.CylinderGeometry(1, 1, 1, 24, 3);
  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const lowPadGeometry = new THREE.CylinderGeometry(1, 1.06, 1, 7);
  const meshesByMaterial = new Map();
  const solarCasters = [];
  const localSun = new THREE.Vector3(
    sunlight.x * cosine - sunlight.z * sine, sunlight.y, sunlight.x * sine + sunlight.z * cosine,
  );
  const probe = new THREE.Vector3();
  const wearTexture = buildingWearTile();
  let finishSeed = 1;

  function worldPoint(localX, localZ) {
    return [x + localX * cosine + localZ * sine, z - localX * sine + localZ * cosine];
  }

  function floor(localX, localZ) {
    return sampleGround(...worldPoint(localX, localZ)) - datum;
  }

  function stamp(source, material, position, dimensions, rotation = new THREE.Quaternion(), batch = meshesByMaterial) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position), rotation, new THREE.Vector3(...dimensions),
    );
    if (!batch.has(material)) batch.set(material, []);
    const piece = source.clone().applyMatrix4(matrix);
    const positions = piece.attributes.position;
    const finish = new Float32Array(positions.count * 4);
    const seed = (++finishSeed * 0.61803398875) % 1;
    const floorLevel = floor(position[0], position[2]);
    const isRound = source !== boxGeometry && source !== chamferGeometry;
    for (let i = 0; i < positions.count; i++) {
      finish[i * 4] = positions.getY(i) - floorLevel;
      finish[i * 4 + 1] = seed;
      finish[i * 4 + 2] = Number(isRound);
      finish[i * 4 + 3] = material === "structure" ? 0.29 : 0.15;
    }
    piece.setAttribute("equipmentFinish", new THREE.BufferAttribute(finish, 4));
    batch.get(material).push(piece);
  }

  function box(material, x, y, z, width, height, depth, orientation = [0, 0, 0], chamfer = false) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...orientation));
    stamp(chamfer ? chamferGeometry : boxGeometry, material, [x, y, z], [width, height, depth], rotation);
  }

  function cylinder(material, x, y, z, radius, height, axis = [0, 1, 0], stretch = 1) {
    const rotation = new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, new THREE.Vector3(...axis));
    stamp(roundGeometry, material, [x, y, z], [radius, height, radius * stretch], rotation);
  }

  function beam(material, from, to, radius = 0.046, batch = meshesByMaterial) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    if (direction.lengthSq() < 0.0000001) return;
    const rotation = new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, direction.clone().normalize());
    stamp(beamGeometry, material, start.lerp(end, 0.5).toArray(), [radius, direction.length(), radius], rotation, batch);
  }

  function footing(x, z, y, spread = 0.38) {
    const bottom = floor(x, z) - 0.08;
    stamp(lowPadGeometry, "structure", [x, bottom + 0.15, z], [spread * 1.7, 0.30, spread * 1.3]);
    beam("structure", [x, bottom + 0.17, z], [x, y, z], 0.12);
  }

  function occluder(position, dimensions, rotation = new THREE.Quaternion(), curved = false) {
    const center = new THREE.Vector3(...position);
    const half = new THREE.Vector3(...dimensions).multiplyScalar(0.5);
    const inverse = rotation.clone().invert();
    const direction = localSun.clone().applyQuaternion(inverse).divide(half);
    const reach = 2.4 + dimensions[0] + dimensions[1] / Math.max(0.11, localSun.y) + dimensions[2];
    solarCasters.push({ center, half, inverse, direction, curved, reach });
  }

  function isInCastShadow(x, y, z) {
    for (const { center, half, inverse, direction, curved, reach } of solarCasters) {
      if (Math.abs(x - center.x) > reach || Math.abs(z - center.z) > reach) continue;
      const point = probe.set(x, y, z).sub(center).applyQuaternion(inverse).divide(half);
      const dy = Math.abs(direction.y) > 0.00001 ? direction.y : 0.00001;
      const y0 = (-1 - point.y) / dy, y1 = (1 - point.y) / dy;
      let first = Math.min(y0, y1), last = Math.max(y0, y1);
      if (curved) {
        const a = direction.x * direction.x + direction.z * direction.z;
        const b = point.x * direction.x + point.z * direction.z;
        const c = point.x * point.x + point.z * point.z - 1;
        const discriminant = b * b - a * c;
        if (discriminant < 0) continue;
        const root = Math.sqrt(discriminant);
        first = Math.max(first, (-b - root) / a);
        last = Math.min(last, (-b + root) / a);
      } else {
        const dx = Math.abs(direction.x) > 0.00001 ? direction.x : 0.00001;
        const dz = Math.abs(direction.z) > 0.00001 ? direction.z : 0.00001;
        const x0 = (-1 - point.x) / dx, x1 = (1 - point.x) / dx;
        const z0 = (-1 - point.z) / dz, z1 = (1 - point.z) / dz;
        first = Math.max(first, Math.min(x0, x1), Math.min(z0, z1));
        last = Math.min(last, Math.max(x0, x1), Math.max(z0, z1));
      }
      if (first > 0.043 && last >= first && first < reach) return true;
    }
    return false;
  }

  function habitat(x, z, radius, span, axis, lamp) {
    const y = floor(x, z) + radius + 0.72;
    const alongX = axis[0] === 1;
    const pose = new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, new THREE.Vector3(...axis));
    const along = (distance, side = 0) => alongX ? [x + distance, z + side] : [x + side, z + distance];
    cylinder("insulation", x, y, z, radius, span, axis);
    for (const [distance, thickness, trim] of [
      [-span * 0.48, 0.16, "structure"], [-span * 0.39, 0.055, "orange"], [-span * 0.20, 0.085, "insulation"],
      [span * 0.19, 0.085, "insulation"], [span * 0.38, 0.055, "orange"], [span * 0.48, 0.17, "structure"],
    ]) {
      const [cx, cz] = along(distance);
      cylinder(trim, cx, y, cz, radius + 0.045, thickness, axis);
    }

    for (const offset of [-span * 0.31, span * 0.31]) {
      for (const side of [-0.78, 0.78]) {
        const [footX, footZ] = along(offset, radius * side);
        footing(footX, footZ, y - radius * 0.79);
        const [jointX, jointZ] = along(offset * 0.75, radius * side * 0.60);
        beam("structure", [footX, floor(footX, footZ) + 0.21, footZ], [jointX, y - radius * 0.59, jointZ], 0.075);
      }
    }
    if (alongX) {
      const jacket = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true, -1.28, 0.72);
      for (const [offset, width, thickness] of [[-2.20, 1.24, 0.018], [-0.82, 1.42, 0.043], [0.75, 1.59, 0.024], [2.12, 0.91, 0.039]]) {
        stamp(jacket, "insulation", [x + offset, y, z], [radius + thickness, width, radius + thickness], pose);
      }
      jacket.dispose();
      for (const offset of [-1.44, 0.0, 1.44]) {
        box("structure", x + offset, y + 0.19, z + radius * 0.96, 0.86, 0.46, 0.17);
        box("visor", x + offset, y + 0.21, z + radius * 1.022, 0.66, 0.29, 0.075);
        box("insulation", x + offset, y + 0.44, z + radius * 1.03, 0.94, 0.11, 0.32);
      }
      box("foil", x, y - radius * 0.72, z + radius * 0.72, span * 0.52, 0.26, 0.22);
      for (const height of [-0.53, 0.76]) {
        const tangent = Math.sqrt(radius * radius - height * height);
        box("structure", x, y + height, z + tangent, span * 0.94, 0.036, 0.057);
        for (const panel of [-2.46, -0.83, 0.83, 2.46]) {
          box("structure", x + panel, y + height + 0.09, z + tangent + 0.012, 0.18, 0.073, 0.081);
        }
      }
    } else {
      cylinder("dark", x, y, z + span * 0.516, radius * 0.82, 0.09, axis);
      cylinder("structure", x, y, z + span * 0.552, radius * 0.56, 0.24, axis);
      cylinder("visor", x, y + 0.29, z + span * 0.632, radius * 0.18, 0.06, axis);
      box("orange", x, y - radius * 0.37, z + span * 0.62, 0.64, 0.10, 0.045);
    }
    if (lamp) box("status", x + 0.84, y + 0.62, z + (alongX ? radius : span * 0.52), 0.13, 0.14, 0.06);
    occluder([x, y, z], [radius * 1.90, span * 0.98, radius * 1.90], pose, true);
    return y;
  }

  function connector(from, to) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const center = a.clone().lerp(b, 0.5);
    const axis = direction.clone().normalize().toArray();
    cylinder("structure", ...center.toArray(), 0.69, direction.length(), axis);
    for (const fraction of [0.14, 0.33, 0.49, 0.65, 0.84]) {
      const joint = a.clone().lerp(b, fraction);
      cylinder("insulation", ...joint.toArray(), 0.717, 0.11, axis);
    }
  }

  function solarArray(x, z, tilt, depth = 2.31, count = 4) {
    const y = floor(x, z) + 1.28;
    const width = 1.41 * count;
    const rotation = [tilt, 0, 0];
    box("structure", x, y, z, width + 0.20, 0.12, depth + 0.15, rotation);
    for (let index = 0; index < count; index++) {
      const panelX = x - width * 0.5 + 1.41 * (index + 0.5);
      box("dark", panelX, y + 0.078, z, 1.37, 0.05, depth - 0.04, rotation);
      box("solar", panelX, y + 0.108, z, 1.27, 0.04, depth - 0.19, rotation);
      for (const offset of [-0.31, 0, 0.31]) {
        box("structure", panelX + offset, y + 0.132, z, 0.027, 0.018, depth - 0.23, rotation);
      }
      for (const row of [-0.28, 0, 0.28]) {
        const offset = row * depth;
        box("structure", panelX, y + 0.132 - offset * Math.sin(tilt), z + offset * Math.cos(tilt), 1.24, 0.017, 0.027, rotation);
      }
    }
    for (const postX of [x - width * 0.35, x + width * 0.35]) {
      footing(postX, z, y - 0.09, 0.30);
      beam("structure", [postX, floor(postX, z) + 0.28, z], [postX, y + 0.03, z - depth * 0.38], 0.045);
    }
    occluder([x, y, z], [width + 0.20, 0.18, depth + 0.15],
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)));
  }

  function mast(x, z, height, highGain = false) {
    const y = floor(x, z);
    for (const [dx, dz] of [[0.42, 0.37], [-0.42, 0.37], [-0.46, -0.34], [0.46, -0.34]]) {
      const ground = floor(x + dx, z + dz);
      const from = [x + dx, ground + 0.11, z + dz];
      const top = [x + dx * 0.27, y + height, z + dz * 0.27];
      beam("structure", from, top, 0.041);
      for (const portion of [0.26, 0.47, 0.68]) {
        beam("structure", [x + dx * (1 - 0.66 * portion), y + height * portion, z + dz * (1 - 0.66 * portion)],
          [x - dx * (1 - 0.66 * (portion + 0.15)), y + height * (portion + 0.15), z + dz * (1 - 0.66 * (portion + 0.15))], 0.025);
      }
    }
    cylinder("structure", x, y + height * 0.97, z, highGain ? 0.27 : 0.12, 0.31);
    beam("structure", [x, y + height, z], [x, y + height + 0.90, z], 0.034);
    box("status", x, y + height + 0.92, z, 0.15, 0.16, 0.15);
    if (!highGain) return;
    const radius = 1.52;
    const profile = [
      new THREE.Vector2(0, 0), new THREE.Vector2(0.24, 0.025), new THREE.Vector2(0.59, 0.10),
      new THREE.Vector2(0.96, 0.24), new THREE.Vector2(1.29, 0.43), new THREE.Vector2(radius, 0.60),
    ];
    const plate = new THREE.LatheGeometry(profile, 30);
    const pivot = new THREE.Group();
    pivot.position.set(x, y + height + 0.18, z + 0.10);
    pivot.name = "Research station antenna gimbal";
    const tilt = new THREE.Group();
    pivot.add(tilt);
    facility.add(pivot);
    const rotor = new Map();
    const identity = new THREE.Quaternion();
    const axis = new THREE.Vector3(-0.41, 0.57, 0.71).normalize();
    const defaultHeading = Math.atan2(axis.x, axis.z);
    const defaultTilt = Math.acos(axis.y);
    stamp(plate, "dish", [0, 0, 0], [1, 1, 1], identity, rotor);
    plate.dispose();
    for (let segment = 0; segment < 3; segment++) {
      const angle = segment * Math.PI * 2 / 3;
      beam("structure", [radius * 0.95 * Math.cos(angle), 0.555, radius * 0.95 * Math.sin(angle)],
        [0, 1.10, 0], 0.027, rotor);
    }
    stamp(roundGeometry, "foil", [0, 1.10, 0], [0.104, 0.25, 0.104], identity, rotor);
    for (const [finish, pieces] of rotor) {
      const geometry = mergeGeometries(pieces);
      const material = new THREE.MeshStandardMaterial(materials[finish]);
      if (surfaceWear[finish]) addBuildingWear(material, wearTexture, surfaceWear[finish], 1.75);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      tilt.add(mesh);
      for (const piece of pieces) piece.dispose();
    }

    const shadowSegments = 20;
    const projection = new THREE.BufferGeometry();
    const projectedPositions = new THREE.Float32BufferAttribute((shadowSegments + 1) * 3, 3);
    projectedPositions.setUsage(THREE.DynamicDrawUsage);
    const indices = [];
    for (let i = 1; i <= shadowSegments; i++) indices.push(0, i, 1 + i % shadowSegments);
    projection.setAttribute("position", projectedPositions);
    projection.setIndex(indices);
    const movingShadow = new THREE.Mesh(projection, new THREE.MeshBasicMaterial({
      color: 0x1a1a19, opacity: 0.48, transparent: true, side: THREE.DoubleSide,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    }));
    movingShadow.name = "Projected shadow of research antenna";
    movingShadow.frustumCulled = false;
    facility.add(movingShadow);

    const localPoint = new THREE.Vector3();
    const surfaceOffset = 0.041;
    let shadowFrame = -1;
    function projectShadow() {
      pivot.updateMatrix();
      tilt.updateMatrix();
      const slope = 1 / Math.max(0.10, localSun.y);
      for (let i = 0; i <= shadowSegments; i++) {
        const angle = i / shadowSegments * Math.PI * 2;
        if (i === 0) localPoint.set(0, 0.42, 0);
        else localPoint.set(radius * Math.cos(angle), 0.60, radius * Math.sin(angle));
        localPoint.applyMatrix4(tilt.matrix).applyMatrix4(pivot.matrix);
        let offset = Math.max(0, localPoint.y - floor(localPoint.x, localPoint.z)) * slope;
        let surfaceX = localPoint.x - localSun.x * offset;
        let surfaceZ = localPoint.z - localSun.z * offset;
        offset = Math.max(0, localPoint.y - floor(surfaceX, surfaceZ)) * slope;
        surfaceX = localPoint.x - localSun.x * offset;
        surfaceZ = localPoint.z - localSun.z * offset;
        projectedPositions.setXYZ(i, surfaceX, floor(surfaceX, surfaceZ) + surfaceOffset, surfaceZ);
      }
      projectedPositions.needsUpdate = true;
    }
    facility.userData.updateDish = function updateDish(time) {
      pivot.rotation.y = defaultHeading + 0.55 * Math.sin(time * 0.085);
      tilt.rotation.x = defaultTilt + 0.11 * Math.sin(time * 0.066);
      const nextFrame = Math.floor(time * 7);
      if (nextFrame !== shadowFrame) {
        shadowFrame = nextFrame;
        projectShadow();
      }
    };
    facility.userData.updateDish(0);
  }

  function utilityCrate(x, z, width, depth, height, material) {
    const y = floor(x, z);
    box("structure", x, y + 0.095, z, width + 0.23, 0.18, depth + 0.20);
    box(material, x, y + 0.18 + height * 0.5, z, width, height, depth, [0, 0, 0], true);
    occluder([x, y + 0.18 + height * 0.5, z], [width * 0.97, height * 0.94, depth * 0.97]);
    for (const delta of [-0.32, 0.31]) box("structure", x + width * delta, y + height * 0.58, z, 0.10, height + 0.12, depth + 0.04);
  }

  const labY = habitat(-3.31, 0.0, 1.51, 6.92, [1, 0, 0], true);
  const habY = habitat(4.18, -0.11, 1.25, 4.88, [0, 0, 1], false);
  const hubFloor = floor(0.57, -1.90);
  const hubY = hubFloor + 2.39;
  cylinder("structure", 0.57, hubY, -1.90, 1.65, 3.15);
  cylinder("insulation", 0.57, hubY + 0.40, -1.90, 1.72, 2.70);
  cylinder("orange", 0.57, hubY - 0.69, -1.90, 1.76, 0.20);
  cylinder("insulation", 0.57, hubY + 1.78, -1.90, 1.35, 0.20);
  cylinder("dark", 0.57, hubY + 1.92, -1.90, 1.04, 0.09);
  for (const [dx, dz] of [[1.0, 0.77], [-1.0, 0.77], [-1.0, -0.76], [1.0, -0.76]]) {
    footing(0.57 + dx, -1.90 + dz, hubY - 1.40, 0.45);
  }
  occluder([0.57, hubY + 0.30, -1.90], [3.34, 2.65, 3.34], new THREE.Quaternion(), true);
  connector([-1.17, labY, -0.81], [0.43, hubY - 0.39, -1.13]);
  connector([1.25, hubY - 0.44, -1.88], [3.59, habY, -1.84]);
  const airlockZ = 2.50;
  const airlockY = habY - 0.15;
  box("structure", 4.18, airlockY - 0.69, airlockZ + 0.74, 1.75, 0.12, 1.23);
  for (let step = 0; step < 8; step++) {
    box("structure", 4.18, airlockY - 0.74 - step * 0.166, airlockZ + 1.31 + step * 0.20, 1.33, 0.047, 0.23);
  }
  for (const rail of [-0.66, 0.66]) {
    beam("structure", [4.18 + rail, airlockY - 0.35, airlockZ + 1.11], [4.18 + rail, airlockY - 1.47, airlockZ + 2.77], 0.039);
  }

  mast(-6.45, -3.79, 4.53, true);
  mast(7.95, -4.12, 3.46);
  solarArray(10.10, 1.41, 0.47);
  solarArray(10.56, -2.30, 0.47);
  solarArray(-10.43, -3.55, 0.52, 2.16, 3);
  for (const localX of [-8.18, -9.44]) {
    const radiatorY = floor(localX, 1.0) + 1.25;
    box("structure", localX, radiatorY, 1, 1.28, 1.31, 0.12, [0.04, 0.10, 0]);
    box("insulation", localX, radiatorY, 1.08, 1.15, 1.18, 0.08, [0.04, 0.10, 0]);
    footing(localX, 1, radiatorY - 0.60, 0.22);
    for (const y of [-0.42, -0.21, 0, 0.21, 0.42]) {
      box("structure", localX, radiatorY + y, 1.135, 1.11, 0.020, 0.025, [0.04, 0.10, 0]);
    }
  }

  for (const [px, pz, width, height, color] of [
    [-2.20, 3.56, 1.93, 0.72, "foil"], [-3.52, 3.78, 0.63, 0.36, "insulation"],
    [0.66, 4.78, 1.74, 0.78, "structure"], [-1.21, 5.14, 1.21, 0.55, "orange"],
    [3.39, -4.94, 1.44, 0.77, "insulation"], [4.98, -4.86, 1.31, 0.85, "foil"],
  ]) utilityCrate(px, pz, width, width * 0.62, height, color);

  for (const [worldX, worldZ, bearing] of relaySites) {
    const dx = worldX - x, dz = worldZ - z;
    const lx = dx * cosine - dz * sine, lz = dx * sine + dz * cosine;
    utilityCrate(lx, lz, 1.10, 0.73, 0.62, "orange");
    mast(lx + Math.cos(bearing) * 1.21, lz + Math.sin(bearing) * 1.21, 2.48);
    solarArray(lx - 1.62, lz + 0.80, 0.52, 1.13, 1);

  }

  for (const [key, pieces] of meshesByMaterial) {
    const material = new THREE.MeshStandardMaterial(materials[key]);
    if (surfaceWear[key]) addBuildingWear(material, wearTexture, surfaceWear[key], 2.45);
    const geometry = mergeGeometries(pieces);
    const positions = geometry.attributes.position;
    const visibility = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      visibility[i] = isInCastShadow(x, y, z) ? 0.10 : 1;
    }
    geometry.setAttribute("solarVisibility", new THREE.BufferAttribute(visibility, 1));
    const mesh = new THREE.Mesh(geometry, applyDistantShadow(material));
    mesh.name = "Outlands · " + key;
    facility.add(mesh);
    for (const piece of pieces) piece.dispose();
  }
  for (const geometry of [boxGeometry, chamferGeometry, roundGeometry, beamGeometry, lowPadGeometry]) geometry.dispose();

  const groundMarks = new THREE.BufferGeometry();
  const vertices = [], colors = [], triangles = [];
  const patches = [[-16, -9.5, 16.3, 8.1, 112, 62]];
  for (const [worldX, worldZ] of relaySites) {
    const dx = worldX - x, dz = worldZ - z;
    const localX = dx * cosine - dz * sine, localZ = dx * sine + dz * cosine;
    patches.push([localX - 3.8, localZ - 3.0, localX + 5.4, localZ + 2.0, 34, 22]);
  }
  for (const [left, back, right, front, columns, rows] of patches) {
    const first = vertices.length / 3;
    for (let row = 0; row <= rows; row++) {
      const z = THREE.MathUtils.lerp(back, front, row / rows);
      for (let column = 0; column <= columns; column++) {
        const x = THREE.MathUtils.lerp(left, right, column / columns);
        const y = floor(x, z) + 0.045;
        const hit = Number(isInCastShadow(x, y, z)) + Number(isInCastShadow(x - 0.116, y, z + 0.073))
          + Number(isInCastShadow(x + 0.101, y, z - 0.083));
        vertices.push(x, y, z);
        colors.push(0.014, 0.013, 0.012, hit * 0.255);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = first + row * (columns + 1) + column;
        const b = a + 1, c = a + columns + 1, d = c + 1;
        if (colors[a * 4 + 3] + colors[b * 4 + 3] + colors[c * 4 + 3] + colors[d * 4 + 3] > 0) {
          triangles.push(a, c, b, b, c, d);
        }
      }
    }
  }
  groundMarks.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  groundMarks.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  groundMarks.setIndex(triangles);
  const footprints = new THREE.Mesh(groundMarks, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }));
  footprints.name = "Outlands · ground-conforming station shadows";
  facility.add(footprints);
  return facility;
}
