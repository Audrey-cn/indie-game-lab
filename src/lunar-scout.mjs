import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RELAY_SITE } from "./lunar-expansion.mjs";

const HALF_PI = Math.PI / 2;
const UP = new THREE.Vector3(0, 1, 0);
const { clamp, damp, lerp, smootherstep } = THREE.MathUtils;
const SENSOR_AMBER = 0xc78f64;
const SENSOR_RELAY = 0xb6cba9;
const SENSOR_BLUE = 0x54a8ff;
const DRONE_FLOOR_TO_HUB = 0.38;
const INSPECTION_START = 10.32;
const FAN_RAYS = 17;

function finish(color, roughness, metalness, properties = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...properties });
}

function foilMaps() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 128;
  const brush = canvas.getContext("2d");
  const size = brush.createImageData(canvas.width, canvas.height);
  let state = 314099;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const groove = Math.sin((x * 0.17 + y * 0.39) + Math.cos(x * 0.097) * 0.85) * 13;
      const edge = Math.min(x, y, canvas.width - x - 1, canvas.height - y - 1);
      const tone = 158 + groove + 45 * (random() - .5) - 16 * Math.exp(-edge / 6);
      size.data.set([tone, tone, tone, 255], (y * canvas.width + x) * 4);
    }
  }
  brush.putImageData(size, 0, 0);
  const tooling = new THREE.CanvasTexture(canvas);
  tooling.anisotropy = 4;
  return { roughnessMap: tooling, bumpMap: tooling, bumpScale: 0.0068 };
}

function parts(parent) {
  const byMaterial = new Map();
  return {
    add(material, source, position = [0, 0, 0], rotation) {
      const geometry = source.index ? source.toNonIndexed() : source;
      if (geometry !== source) source.dispose();
      if (rotation) geometry.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]);
      geometry.translate(...position);
      if (!byMaterial.has(material)) byMaterial.set(material, []);
      byMaterial.get(material).push(geometry);
    },
    close() {
      for (const [material, items] of byMaterial) {
        const geometry = mergeGeometries(items);
        for (const item of items) item.dispose();
        if (!geometry) throw Error("Survey hull parts must have matching vertex attributes");
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = material.emissiveIntensity < 1.25;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    },
  };
}

function plate(batch, material, dims, pos, radius = 0.009, rotation) {
  const radiusClamped = Math.min(radius, ...dims.map(value => 0.47 * value));
  const geometry = radiusClamped > 0
    ? new RoundedBoxGeometry(...dims, 1, radiusClamped)
    : new THREE.BoxGeometry(...dims);
  batch.add(material, geometry, pos, rotation);
}

function sheathing(batch, material, polygon, y, thickness, bevel) {
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0][0], -polygon[0][1]);
  for (const [x, z] of polygon.slice(1)) shape.lineTo(x, -z);
  shape.closePath();
  const skin = new THREE.ExtrudeGeometry(shape, { depth: thickness, steps: 1,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  skin.rotateX(-HALF_PI);
  batch.add(material, skin, [0, y, 0]);
}

function pin(batch, material, radius, depth, position, alignment = "y", segments = 12) {
  const rotation = alignment === "z" ? [HALF_PI, 0, 0] : alignment === "x" ? [0, 0, HALF_PI] : undefined;
  batch.add(material, new THREE.CylinderGeometry(radius, radius, depth, segments), position, rotation);
}

function collar(batch, material, radius, thickness, position, alignment = "z") {
  batch.add(material, new THREE.TorusGeometry(radius, thickness, 7, 30), position,
    alignment === "y" ? [HALF_PI, 0, 0] : alignment === "x" ? [0, HALF_PI, 0] : undefined);
}

function member(batch, material, from, to, radius) {
  const start = new THREE.Vector3(...from);
  const direction = new THREE.Vector3(...to).sub(start);
  const member = new THREE.CylinderGeometry(radius * 0.84, radius, direction.length(), 9);
  member.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()));
  batch.add(material, member, start.addScaledVector(direction, 0.5).toArray());
}

function addStencil(drone) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 112;
  const brush = canvas.getContext("2d");
  brush.fillStyle = "#373b38";
  brush.fillRect(0, 0, 256, 112);
  brush.lineWidth = 3;
  brush.strokeStyle = "#9f9886";
  brush.strokeRect(5, 5, 246, 102);
  brush.fillStyle = "#ccc8af";
  brush.font = "bold 46px monospace";
  brush.fillText("SD–04", 16, 56);
  brush.fillStyle = "#b2a28a";
  brush.font = "bold 21px monospace";
  brush.fillText("SPECTRAL SURVEY", 17, 86);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.195, 0.088),
    finish(0xffffff, .81, .12, { map: texture, polygonOffset: true, polygonOffsetFactor: -1 }));
  badge.rotation.x = -HALF_PI;
  badge.position.set(0.006, 0.135, -0.053);
  drone.add(badge);
}

function addHull(drone, metal) {
  const shapes = parts(drone);
  const outline = [
    [-0.20, -0.281], [0.196, -0.281], [0.299, -0.170], [0.278, 0.154],
    [0.193, 0.263], [-0.170, 0.272], [-0.277, 0.176], [-0.300, -0.146],
  ];
  sheathing(shapes, metal.dark, outline, -0.074, 0.094, 0.024);
  sheathing(shapes, metal.edge, outline.map(([x, z]) => [.975 * x, .94 * z]), 0.028, 0.015, 0.012);
  sheathing(shapes, metal.foil, outline.map(([x, z]) => [.91 * x, .90 * z]), 0.050, 0.060, 0.015);
  plate(shapes, metal.dark, [.229, .037, .173], [0, -.079, 0.086], .013);
  plate(shapes, metal.edge, [.101, .032, .163], [.123, .115, .066], .006);
  plate(shapes, metal.graphite, [.098, .012, .116], [.123, .13, .065], .005);
  plate(shapes, metal.foil, [.155, .028, .119], [-.135, .119, -.066], .008);
  for (const x of [-.19, .17]) {
    for (const z of [-.155, .125]) {
      pin(shapes, metal.edge, .010, .011, [x, .127, z], "y", 8);
      pin(shapes, metal.dark, .004, .004, [x, .133, z], "y", 6);
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * .048;
    plate(shapes, metal.edge, [.018, .067, .032], [x, -.009, .259], .002);
  }
  plate(shapes, metal.dark, [.325, .079, .041], [0, -.010, -.306], .012);
  plate(shapes, metal.graphite, [.222, .060, .013], [.013, -.007, -.330], .005);
  pin(shapes, metal.edge, .026, .014, [.071, -.008, -.341], "z");
  pin(shapes, metal.lens, .018, .008, [.071, -.008, -.350], "z");
  pin(shapes, metal.edge, .017, .013, [-.050, -.008, -.340], "z");
  pin(shapes, metal.lens, .012, .007, [-.050, -.008, -.348], "z");
  for (const side of [-1, 1]) {
    plate(shapes, metal.edge, [.038, .068, .034], [side * .153, -.010, -.314], .006);
    pin(shapes, metal.clay, .009, .007, [side * .151, -.012, -.334], "z", 8);
  }
  plate(shapes, metal.plate, [.148, .018, .095], [.084, -.099, .095], .004);
  for (const x of [.028, .139]) {
    pin(shapes, metal.edge, .013, .010, [x, -.107, .111], "y", 10);
  }

  for (const side of [-1, 1]) {
    member(shapes, metal.edge, [side * .211, -.006, -.092], [side * .375, -.002, -.103], .024);
    member(shapes, metal.dark, [side * .209, -.027, .123], [side * .366, -.025, .104], .022);
    plate(shapes, metal.dark, [.156, .128, .323], [side * .366, -.018, .004], .026);
    plate(shapes, metal.foil, [.141, .048, .302], [side * .367, .057, .004], .016);
    plate(shapes, metal.clay, [.101, .012, .140], [side * .367, .085, .055], .008);
    plate(shapes, metal.signal, [.045, .013, .012], [side * .372, .027, .164], .004);
    for (const z of [-.082, .081]) {
      const x = side * .370;
      const bell = new THREE.CylinderGeometry(.044, .058, .061, 20, 1, true);
      shapes.add(metal.edge, bell, [x, -.086, z]);
      collar(shapes, metal.clay, .050, .004, [x, -.118, z], "y");
      pin(shapes, metal.graphite, .040, .013, [x, -.11, z]);
      pin(shapes, metal.nozzle, .026, .007, [x, -.118, z]);
    }
    plate(shapes, metal.dark, [.014, .048, .195], [side * .447, -.014, -.002], .003);
    for (let notch = 0; notch < 4; notch++) {
      plate(shapes, metal.edge, [.016, .024, .012], [side * .453, -.016, (notch - 1.5) * .040], .002);
    }
  }
  member(shapes, metal.edge, [-.127, .125, .183], [-.106, .232, .213], .005);
  member(shapes, metal.graphite, [.128, .128, .155], [.200, .155, .171], .005);
  shapes.close();
  addStencil(drone);
}

function makeGimbal(drone, metal) {
  const yaw = new THREE.Group();
  yaw.name = "survey-azimuth";
  yaw.position.set(0, -.091, -.148);
  drone.add(yaw);
  const frame = parts(yaw);
  pin(frame, metal.edge, .102, .026, [0, -.005, 0], "y", 28);
  pin(frame, metal.dark, .088, .045, [0, -.036, 0], "y", 26);
  plate(frame, metal.edge, [.172, .030, .092], [0, -.056, -.008], .008);
  for (const side of [-1, 1]) {
    plate(frame, metal.dark, [.029, .119, .078], [side * .073, -.083, -.008], .009);
    pin(frame, metal.edge, .025, .012, [side * .090, -.116, -.012], "x");
    pin(frame, metal.clay, .010, .006, [side * .100, -.116, -.012], "x", 8);
  }
  frame.close();

  const tilt = new THREE.Group();
  tilt.name = "survey-elevation";
  tilt.position.set(0, -.113, -.011);
  yaw.add(tilt);
  const scanner = parts(tilt);
  plate(scanner, metal.dark, [.124, .099, .111], [0, 0, -.017], .020);
  pin(scanner, metal.edge, .055, .051, [0, -.003, -.069], "z", 26);
  collar(scanner, metal.graphite, .047, .007, [0, -.003, -.097]);
  const face = new THREE.SphereGeometry(.042, 24, 14);
  face.scale(1, 1, .40);
  scanner.add(metal.lens, face, [0, -.003, -.102]);
  collar(scanner, metal.clay, .052, .003, [0, -.003, -.088]);
  pin(scanner, metal.signal, .006, .004, [.042, .033, -.086], "z", 10);
  scanner.close();
  return { yaw, tilt };
}

export function createScanningFan(scene, height, occluders, {
  rayCount = FAN_RAYS, color = [0.012, 0.19, 1.0], footprintColor = 0x297eff, name = "scout blue scan",
} = {}) {
  const rays = Array.from({ length: rayCount }, () => ({
    point: new THREE.Vector3(), normal: new THREE.Vector3(), object: null, distance: 0, surface: false,
  }));
  const positions = new Float32Array((rayCount - 1) * 9);
  const coordinates = new Float32Array((rayCount - 1) * 6);
  const footprint = new Float32Array((rayCount - 1) * 18);
  const fade = { value: 0 };
  const vertex = /* glsl */ `
    varying vec2 profile;
    void main() {
      profile = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const face = /* glsl */ `
    uniform float fade;
    uniform vec3 sensorColor;
    varying vec2 profile;
    void main() {
      float spread = 1.0 - smoothstep(0.18, 0.5, abs(profile.x - 0.5));
      float traces = pow(0.5 + 0.5 * cos(47.1 * (profile.x - 0.5)), 5.0);
      float edge = smoothstep(0.0, 0.09, min(profile.x, 1.0 - profile.x));
      float light = (0.12 + 0.15 * traces) * (0.38 + 0.62 * spread) * edge;
      float beam = light * mix(1.40, 0.75, profile.y) * fade;
      gl_FragColor = vec4(sensorColor, beam);
      #include <colorspace_fragment>
    }
  `;
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: { fade, sensorColor: { value: new THREE.Vector3(...color) } }, vertexShader: vertex, fragmentShader: face, side: THREE.DoubleSide,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const lineMaterial = new THREE.MeshBasicMaterial({
    color: footprintColor, opacity: 0, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const beamGeometry = new THREE.BufferGeometry();
  beamGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  beamGeometry.setAttribute("uv", new THREE.BufferAttribute(coordinates, 2).setUsage(THREE.DynamicDrawUsage));
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(footprint, 3).setUsage(THREE.DynamicDrawUsage));
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  const line = new THREE.Mesh(lineGeometry, lineMaterial);
  beam.name = name + " fan";
  line.name = name + " footprint";
  beam.frustumCulled = line.frustumCulled = false;
  beam.visible = line.visible = false;
  scene.add(beam, line);

  const raycaster = new THREE.Raycaster();
  const hitBuffer = [];
  const colliders = [];
  const bearing = new THREE.Vector3();
  const across = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const instanceMatrix = new THREE.Matrix4();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const outside = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const cached = new WeakMap();

  // A small terrain marcher caps every independent ray at the first visible surface.
  function sampleTerrain(origin, direction, distance, result) {
    let lower = 0, upper = 0;
    for (let step = 1; step <= 14; step++) {
      upper = distance * step / 14;
      const x = origin.x + direction.x * upper, z = origin.z + direction.z * upper;
      if (origin.y + direction.y * upper > height(x, z)) {
        lower = upper;
        continue;
      }
      for (let refine = 0; refine < 7; refine++) {
        const mid = (lower + upper) * .5;
        if (origin.y + direction.y * mid > height(origin.x + direction.x * mid, origin.z + direction.z * mid)) lower = mid;
        else upper = mid;
      }
      const xHit = origin.x + direction.x * upper, zHit = origin.z + direction.z * upper;
      const epsilon = .016;
      result.point.set(xHit, height(xHit, zHit), zHit);
      result.normal.set(height(xHit - epsilon, zHit) - height(xHit + epsilon, zHit), 2 * epsilon,
        height(xHit, zHit - epsilon) - height(xHit, zHit + epsilon)).normalize();
      return upper;
    }
    result.point.copy(origin).addScaledVector(direction, distance);
    return -1;
  }

  function gather(target) {
    colliders.length = 0;
    let roots = cached.get(target);
    if (!roots) {
      roots = target.object ? [target.object] : scene.children.filter(node => node.isGroup
        && Math.hypot(node.position.x - target.x, node.position.z - target.z) < .42);
      cached.set(target, roots);
    }
    for (const root of [...roots, ...occluders]) {
      if (!root) continue;
      root.updateWorldMatrix(true, true);
      root.traverseVisible(node => {
        if (node.isMesh && node !== beam && node !== line) colliders.push(node);
      });
    }
  }

  function set(origin, center, target, intensity, time) {
    beam.visible = line.visible = intensity > .025;
    if (!beam.visible) return;
    gather(target);
    bearing.subVectors(center, origin).setY(0).normalize();
    across.set(-bearing.z, 0, bearing.x);
    const fanWidth = clamp((target.radius ?? .46) * 1.42, .36, .82);
    const maxRange = Math.min(6.1, origin.distanceTo(center) + 1.70);
    raycaster.near = .02;
    for (const [index, result] of rays.entries()) {
      const weight = (index / (rayCount - 1) - .5) * 2;
      aim.copy(center).addScaledVector(across, weight * fanWidth);
      direction.subVectors(aim, origin).normalize();
      const terrain = sampleTerrain(origin, direction, maxRange, result);
      result.surface = terrain > 0;
      result.distance = terrain > 0 ? terrain : maxRange;
      result.object = null;
      if (!colliders.length) continue;
      raycaster.far = result.distance;
      raycaster.set(origin, direction);
      hitBuffer.length = 0;
      raycaster.intersectObjects(colliders, false, hitBuffer);
      const hit = hitBuffer[0];
      if (!hit) continue;
      result.distance = hit.distance;
      result.object = hit.object;
      result.surface = true;
      result.point.copy(hit.point);
      if (hit.instanceId != null) {
        hit.object.getMatrixAt(hit.instanceId, instanceMatrix);
        instanceMatrix.premultiply(hit.object.matrixWorld);
        normalMatrix.getNormalMatrix(instanceMatrix);
      } else normalMatrix.getNormalMatrix(hit.object.matrixWorld);
      result.normal.copy(hit.face?.normal ?? UP).applyNormalMatrix(normalMatrix);
    }
    let beamCount = 0, lineCount = 0;
    for (let index = 1; index < rays.length; index++) {
      const left = rays[index - 1], right = rays[index];
      // Leave a slit at a depth discontinuity. Joining past a leading edge would light behind it.
      if (left.object !== right.object && Math.abs(left.distance - right.distance) > .30) continue;
      origin.toArray(positions, beamCount * 3);
      left.point.toArray(positions, (beamCount + 1) * 3);
      right.point.toArray(positions, (beamCount + 2) * 3);
      coordinates.set([.5, 0, (index - 1) / (rayCount - 1), 1, index / (rayCount - 1), 1], beamCount * 2);
      beamCount += 3;
      if (!left.surface || !right.surface || left.object !== right.object || left.point.distanceTo(right.point) > .48) continue;
      normal.copy(left.normal).add(right.normal).normalize();
      tangent.subVectors(right.point, left.point);
      outside.crossVectors(normal, tangent).normalize().multiplyScalar(.019);
      a.copy(left.point).addScaledVector(left.normal, .012);
      b.copy(right.point).addScaledVector(right.normal, .012);
      tangent.copy(a).add(outside).toArray(footprint, lineCount * 3);
      tangent.copy(a).sub(outside).toArray(footprint, (lineCount + 1) * 3);
      tangent.copy(b).add(outside).toArray(footprint, (lineCount + 2) * 3);
      tangent.copy(b).add(outside).toArray(footprint, (lineCount + 3) * 3);
      tangent.copy(a).sub(outside).toArray(footprint, (lineCount + 4) * 3);
      tangent.copy(b).sub(outside).toArray(footprint, (lineCount + 5) * 3);
      lineCount += 6;
    }
    beamGeometry.setDrawRange(0, beamCount);
    lineGeometry.setDrawRange(0, lineCount);
    beamGeometry.attributes.position.needsUpdate = beamGeometry.attributes.uv.needsUpdate = true;
    lineGeometry.attributes.position.needsUpdate = true;
    fade.value = intensity * (.94 + .06 * Math.sin(time * 22));
    lineMaterial.opacity = .83 * intensity;
  }

  return { set };
}

export function createScoutDrone(scene, height, { scanTargets = [], occluders = [] } = {}) {
  const drone = new THREE.Group();
  drone.name = "Selene compact survey craft";
  drone.rotation.order = "YXZ";
  scene.add(drone);
  const metal = {
    foil: finish(0xc1baaa, .75, .62, foilMaps()),
    edge: finish(0x96988d, .47, .72),
    plate: finish(0x666a64, .58, .59),
    dark: finish(0x444b47, .65, .47),
    graphite: finish(0x262b2d, .74, .37),
    clay: finish(0x9e6b43, .54, .58),
    nozzle: finish(0x4b4237, .49, .49, { emissive: 0xc97353, emissiveIntensity: .09 }),
    signal: finish(SENSOR_AMBER, .54, .19, { emissive: SENSOR_AMBER, emissiveIntensity: .7 }),
    lens: new THREE.MeshPhysicalMaterial({
      color: 0x314756, roughness: .14, metalness: .35, clearcoat: .86, clearcoatRoughness: .13,
    }),
  };
  addHull(drone, metal);
  const { yaw, tilt } = makeGimbal(drone, metal);
  const scannerTarget = new THREE.Object3D();
  scannerTarget.name = "survey aim point";
  const cameraLamp = new THREE.SpotLight(0xedc59a, 0, 4.9, .26, .68, 2);
  cameraLamp.target = scannerTarget;
  scene.add(cameraLamp, scannerTarget);

  const targets = scanTargets.filter(target => Number.isFinite(target.x) && Number.isFinite(target.z));
  const fan = createScanningFan(scene, height, occluders);
  const hazard = { x: 5.7, z: -0.4, scanning: false, mode: "transit", inspectionIndex: -1, laser: false };
  const localTarget = new THREE.Vector3();
  const opticalPoint = new THREE.Vector3(0, -.003, -.108);
  const aimDirection = new THREE.Vector3();
  const sightAxis = new THREE.Vector3();
  const obstruction = new THREE.Box3();
  let locationReady = false;
  let relayAt = -1;
  let vx = 0, vz = 0;
  let focusX = hazard.x, focusY = 0, focusZ = hazard.z;
  let beam = 0, scanPower = 0;

  function structureClearance(altitude) {
    let floor = altitude;
    for (const structure of occluders) {
      if (!structure?.visible) continue;
      obstruction.setFromObject(structure);
      const dx = Math.max(obstruction.min.x - hazard.x, 0, hazard.x - obstruction.max.x);
      const dz = Math.max(obstruction.min.z - hazard.z, 0, hazard.z - obstruction.max.z);
      const distance = Math.hypot(dx, dz);
      if (distance > 1.55) continue;
      const roofClearance = obstruction.max.y + DRONE_FLOOR_TO_HUB + .28;
      floor = Math.max(floor, lerp(altitude, roofClearance, 1 - smootherstep(distance, .53, 1.55)));
    }
    return floor;
  }

  function update(time, dt, state) {
    const cycle = time % 15;
    const deployedRelay = state.relayDeployed || state.buildStage === "return";
    if (state.mission === "construction" && deployedRelay && relayAt < 0) relayAt = time;
    const checkingRelay = relayAt >= 0;
    const relay = Number.isFinite(state.relayLocation?.x) && Number.isFinite(state.relayLocation?.z)
      ? state.relayLocation : RELAY_SITE;
    const patrolX = checkingRelay ? relay.x + 1.6 * Math.cos((time - relayAt) * 0.63) : 6.0 * Math.cos(time * 0.48);
    const patrolZ = checkingRelay ? relay.z + 1.3 * Math.sin((time - relayAt) * 0.63) : 4.5 * Math.sin(time * 0.64) - 0.4;
    const scanning = !checkingRelay && cycle >= 2.8 && cycle <= 10.2;
    const visit = Math.floor((time - INSPECTION_START) / 15);
    const visitTime = time - (INSPECTION_START + 15 * visit);
    const canInspect = !checkingRelay && !scanning && visit >= 0 && targets.length > 0;
    const visitMix = canInspect ? smootherstep(visitTime, 0, 2.62) * (1 - smootherstep(visitTime, 5.07, 7.24)) : 0;
    const inspectionIndex = visitMix > .035 ? visit % targets.length : -1;
    const inspecting = inspectionIndex >= 0;
    const inspection = inspecting ? targets[inspectionIndex] : null;
    const towardCenter = inspecting ? Math.hypot(inspection.x, inspection.z) : 0;
    const offsetX = inspecting ? inspection.approach?.x ?? (towardCenter > .01 ? -inspection.x / towardCenter * 1.32 : 1.32) : 0;
    const offsetZ = inspecting ? inspection.approach?.z ?? (towardCenter > .01 ? -inspection.z / towardCenter * 1.32 : 0) : 0;
    const standX = inspecting ? inspection.x + offsetX : patrolX;
    const standZ = inspecting ? inspection.z + offsetZ : patrolZ;
    const targetX = lerp(patrolX, standX, visitMix);
    const targetZ = lerp(patrolZ, standZ, visitMix);
    hazard.mode = checkingRelay ? "relay" : scanning ? "scan" : inspecting ? "inspect" : "transit";
    hazard.scanning = scanning;
    hazard.inspectionIndex = inspectionIndex;
    const fresh = !locationReady;
    const rate = 1 - Math.exp(-(checkingRelay ? 1.35 : scanning ? 3.1 : 3.9) * dt);
    const dx = targetX - hazard.x, dz = targetZ - hazard.z;
    if (fresh) {
      locationReady = true;
      hazard.x = targetX;
      hazard.z = targetZ;
    } else {
      hazard.x += dx * rate;
      hazard.z += dz * rate;
    }
    if (dt > 0 && !fresh) {
      vx = damp(vx, dx * rate / dt, 4, dt);
      vz = damp(vz, dz * rate / dt, 4, dt);
    }
    const ground = height(hazard.x, hazard.z);
    const roverDistance = Math.hypot((state.x ?? 0) - hazard.x, (state.z ?? 0) - hazard.z);
    const closingDistance = Math.hypot((state.x ?? 0) + (state.vx ?? 0) * .32 - hazard.x - vx * .32,
      (state.z ?? 0) + (state.vz ?? 0) * .32 - hazard.z - vz * .32);
    const baseAltitude = (checkingRelay ? 1.46 : scanning ? 1.21 : 1.58 + visitMix * .24) + Math.sin(time * 1.34) * .034;
    const vehicleTop = (state.y ?? ground) + 1.90 + .27 * Math.hypot(state.pitch ?? 0, state.roll ?? 0);
    const roverSafeHeight = vehicleTop + DRONE_FLOOR_TO_HUB + .29;
    const relayDistance = Math.hypot(hazard.x - relay.x, hazard.z - relay.z);
    const relayHeight = checkingRelay ? .64 * (1 - smootherstep(relayDistance, .62, 1.02)) : 0;
    const altitude = structureClearance(ground + baseAltitude + relayHeight);
    const raise = Math.max(0, roverSafeHeight - altitude);
    const anticipation = 1 - smootherstep(Math.min(roverDistance, closingDistance), 1.94, 3.56);
    const safeFloor = altitude + raise * (1 - smootherstep(roverDistance, 1.90, 2.78));
    const hover = fresh ? safeFloor : Math.max(safeFloor, damp(drone.position.y, altitude + raise * anticipation, 4.8, dt));
    drone.position.set(hazard.x, hover, hazard.z);

    const speed = Math.hypot(vx, vz);
    const heading = speed > .055 ? Math.atan2(-vx, -vz) : drone.rotation.y;
    const inspectRover = scanning && roverDistance < 3.1 && Math.hypot(state.x ?? 0, state.z ?? 0) > 1.65;
    const scoutHeading = checkingRelay
      ? Math.atan2(hazard.x - relay.x, hazard.z - relay.z)
      : inspecting && visitMix > .55 ? Math.atan2(hazard.x - inspection.x, hazard.z - inspection.z)
      : inspectRover ? Math.atan2(hazard.x - state.x, hazard.z - state.z) : heading;
    const turn = Math.atan2(Math.sin(scoutHeading - drone.rotation.y), Math.cos(scoutHeading - drone.rotation.y));
    drone.rotation.y += turn * (1 - Math.exp(-4.6 * dt));
    drone.rotation.x = damp(drone.rotation.x, -Math.min(.087, speed * (scanning ? .018 : .027)), 5.2, dt);
    drone.rotation.z = damp(drone.rotation.z, clamp(turn * speed * .042, -.12, .12), 4.8, dt);

    // Slow overlapping lateral and forward sweeps resemble a sensor mapping a ground swath.
    const side = scanning ? .81 * Math.sin(time * 1.52) : .18 * Math.sin(time * 2);
    const lead = scanning ? .80 + .29 * Math.cos(time * 2.35) : .87;
    const groundX = hazard.x - Math.sin(drone.rotation.y) * lead + Math.cos(drone.rotation.y) * side;
    const groundZ = hazard.z - Math.cos(drone.rotation.y) * lead - Math.sin(drone.rotation.y) * side;
    const travelPhase = inspecting ? Math.sin((visitTime - 2.55) * 2.62) * .255 : 0;
    const targetFocusX = checkingRelay ? relay.x : inspecting ? inspection.x + offsetX * travelPhase
      : inspectRover ? state.x : groundX;
    const targetFocusZ = checkingRelay ? relay.z : inspecting ? inspection.z + offsetZ * travelPhase
      : inspectRover ? state.z : groundZ;
    const targetFocusY = checkingRelay ? height(relay.x, relay.z) + .56
      : inspecting ? height(targetFocusX, targetFocusZ) + (inspection.aimHeight ?? .27)
      : inspectRover ? (state.y ?? ground) + .66 : height(targetFocusX, targetFocusZ) + .025;
    focusX = fresh ? targetFocusX : damp(focusX, targetFocusX, 6.8, dt);
    focusY = fresh ? targetFocusY : damp(focusY, targetFocusY, 6.6, dt);
    focusZ = fresh ? targetFocusZ : damp(focusZ, targetFocusZ, 6.8, dt);
    scannerTarget.position.set(focusX, focusY, focusZ);
    localTarget.copy(scannerTarget.position);
    drone.worldToLocal(localTarget).sub(yaw.position);
    const pan = clamp(Math.atan2(-localTarget.x, -localTarget.z), -1.36, 1.36);
    yaw.rotation.y = fresh ? pan : damp(yaw.rotation.y, pan, 9.2, dt);
    yaw.worldToLocal(localTarget.copy(scannerTarget.position)).sub(tilt.position);
    const pitch = clamp(Math.atan2(localTarget.y, Math.hypot(localTarget.x, localTarget.z)), -1.34, .12);
    tilt.rotation.x = fresh ? pitch : damp(tilt.rotation.x, pitch, 10.5, dt);
    cameraLamp.position.copy(tilt.localToWorld(localTarget.copy(opticalPoint)));
    const aimStrength = tilt.getWorldDirection(sightAxis).multiplyScalar(-1)
      .dot(aimDirection.subVectors(scannerTarget.position, cameraLamp.position).normalize());
    const closeEnough = 1 - smootherstep(Math.hypot(hazard.x - standX, hazard.z - standZ), .32, 1.48);
    const beamWindow = smootherstep(visitTime, 2.55, 2.99) * (1 - smootherstep(visitTime, 4.92, 5.35));
    const scanEnergy = inspecting ? closeEnough * beamWindow * smootherstep(aimStrength, .71, .95) : 0;
    scanPower = inspecting ? damp(scanPower, scanEnergy, 10.8, dt) : 0;
    hazard.laser = scanPower > .07;
    fan.set(cameraLamp.position, scannerTarget.position, inspection, scanPower, time);
    cameraLamp.color.setHex(inspecting ? SENSOR_BLUE : 0xedc59a);
    const patrolLight = inspecting ? 2.20 * scanPower : scanning ? (state.warning ? 2.15 : inspectRover ? 1.5 : .90) : 0;
    const beamTarget = checkingRelay && relayDistance < 2 ? 1.55 : patrolLight;
    beam = damp(beam, beamTarget, 10, dt);
    cameraLamp.intensity = beam;
    metal.signal.emissive.setHex(checkingRelay ? SENSOR_RELAY : inspecting ? SENSOR_BLUE : SENSOR_AMBER);
    metal.signal.emissiveIntensity = scanning ? .67 + .18 * Math.sin(time * 4.5) : .43;
    metal.nozzle.emissiveIntensity = .08 + Math.min(.27, speed * .054) * (.83 + .17 * Math.sin(time * 26));
  }

  function reset() {
    locationReady = false;
    relayAt = -1;
    hazard.mode = "transit";
    hazard.scanning = false;
    hazard.inspectionIndex = -1;
    hazard.laser = false;
    vx = 0;
    vz = 0;
    beam = 0;
    scanPower = 0;
    fan.set(null, null, null, 0, 0);
    drone.rotation.set(0, 0, 0, "YXZ");
    cameraLamp.intensity = 0;
  }
  return { hazard, update, reset };
}
