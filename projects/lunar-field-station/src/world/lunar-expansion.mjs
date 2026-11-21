import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { makeEquipmentFinish } from "../rendering/lunar-equipment-finish.mjs";

export const RELAY_SITE = { x: 13.2, z: -14.0, radius: 1.95 };

const material = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const up = new THREE.Vector3(0, 1, 0);
const ease = THREE.MathUtils.smootherstep;
const mix = THREE.MathUtils.lerp;

function part(parent, geometry, finish, x, y, z) {
  const mesh = new THREE.Mesh(geometry, finish);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function casing(parent, finish, size, position, edge = 0.015) {
  return part(parent, new RoundedBoxGeometry(...size, 1, edge), finish, ...position);
}

function member(parent, finish, a, b, radius) {
  const start = new THREE.Vector3(...a);
  const direction = new THREE.Vector3(...b).sub(start);
  const middle = start.clone().addScaledVector(direction, 0.5);
  const beam = part(parent, new THREE.CylinderGeometry(radius * 0.86, radius, direction.length(), 8), finish, ...middle.toArray());
  beam.quaternion.setFromUnitVectors(up, direction.normalize());
  return beam;
}

function unfoldCore(core, progress, compactX, compactZ) {
  const raised = ease(progress, 0.13, 0.40);
  core.visible = progress > 0.13;
  core.position.y = mix(0.052, 0, raised);
  core.scale.set(mix(compactX, 1, raised), mix(0.29, 1, raised), mix(compactZ, 1, raised));
}

function unfoldTripod(legs, progress) {
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const delay = i * 0.025;
    const extended = ease(progress, 0.23 + delay, 0.53 + delay);
    leg.visible = progress > 0.23 + delay;
    leg.rotation.z = 1.43 * (1 - ease(progress, 0.26 + delay, 0.59 + delay));
    leg.scale.set(mix(0.22, 1, extended), mix(0.38, 1, extended), mix(0.74, 1, extended));
  }
}

export function createRelay(scene, height, site = RELAY_SITE) {
  const { x, z } = site;
  const ground = height(x, z);
  const station = new THREE.Group();
  station.position.set(x, ground, z);
  station.rotation.y = -0.36;
  scene.add(station);
  const shell = makeEquipmentFinish(0xa3a093, "paint", 23);
  const frame = makeEquipmentFinish(0x453f37, "anodized", 43);
  const panel = material(0x22324a, 0.31, 0.59);
  const locks = material(0xa87b3c, 0.51, 0.42);
  const signal = new THREE.MeshStandardMaterial({
    color: 0xc0d5b5, emissive: 0xc0d5b5, emissiveIntensity: 0, roughness: 0.43,
  });
  part(station, new THREE.CylinderGeometry(0.37, 0.42, 0.045, 9), frame, 0, 0.02, 0);
  for (const sign of [-1, 1]) casing(station, locks, [0.12, 0.032, 0.33], [sign * 0.24, 0.052, 0]);
  const assembly = new THREE.Group();
  assembly.name = "relay-deployment";
  assembly.visible = false;
  station.add(assembly);
  const core = new THREE.Group();
  assembly.add(core);
  casing(core, shell, [0.39, 0.20, 0.33], [0, 0.155, 0]);
  casing(core, frame, [0.33, 0.06, 0.275], [0, 0.274, 0]);
  casing(core, signal, [0.07, 0.024, 0.011], [-0.08, 0.19, 0.170], 0.004);
  for (const sign of [-1, 1]) {
    for (let n = 0; n < 4; n++) casing(core, frame, [0.022, 0.11, 0.016],
      [sign * 0.20, 0.151, (n - 1.5) * 0.050], 0.003);
  }
  const legs = Array.from({ length: 3 }, (_, i) => {
    const hinge = new THREE.Group();
    hinge.position.y = 0.224;
    hinge.rotation.y = i * Math.PI * 2 / 3;
    assembly.add(hinge);
    const leg = new THREE.Group();
    hinge.add(leg);
    member(leg, shell, [0, 0, 0], [0.34, -0.15, 0], 0.028);
    casing(leg, frame, [0.14, 0.032, 0.13], [0.34, -0.15, 0], 0.008);
    return leg;
  });
  const mast = new THREE.Group();
  mast.position.y = 0.30;
  assembly.add(mast);
  const sleeve = member(mast, frame, [0, 0, 0], [0, 1.18, 0], 0.038);
  const tube = member(mast, shell, [0, 0.34, 0], [0, 1.10, 0], 0.021);
  const antenna = new THREE.Group();
  assembly.add(antenna);
  const reflectorFinish = shell.clone();
  reflectorFinish.side = THREE.DoubleSide;
  const dish = part(antenna, new THREE.SphereGeometry(0.265, 23, 10, 0, Math.PI * 2, 0, 0.91), reflectorFinish, 0, 0, 0);
  dish.rotation.x = Math.PI / 2;
  member(antenna, frame, [0, 0, 0], [0, 0, 0.28], 0.009);
  part(antenna, new THREE.SphereGeometry(0.023, 8, 6), locks, 0, 0, 0.285);
  const wings = [-1, 1].map(sign => {
    const hinge = new THREE.Group();
    hinge.position.set(sign * 0.16, 0.28, 0);
    assembly.add(hinge);
    casing(hinge, frame, [0.41, 0.031, 0.30], [sign * 0.205, 0, 0], 0.009);
    for (let i = 0; i < 5; i++) casing(hinge, panel, [0.072, 0.005, 0.264],
      [sign * (0.045 + i * 0.08), 0.018, 0], 0.002);
    return hinge;
  });
  let displayed = 0;

  function update(state, dt, time, deploymentProgress) {
    const deployed = state.relayDeployed === true;
    const placing = state.buildStage === "deploy" && state.buildContext === "deploy" && state.buildProgress > 0;
    const target = deployed ? 1 : placing ? state.buildProgress : 0;
    displayed = deploymentProgress === undefined
      ? state.phase === "ready" || target === 0 ? 0 : mix(displayed, target, 1 - Math.exp(-12 * dt))
      : THREE.MathUtils.clamp(deploymentProgress, 0, 1);
    assembly.visible = displayed > 0.13;
    if (!assembly.visible) return;
    unfoldCore(core, displayed, 0.83, 0.66);
    unfoldTripod(legs, displayed);
    for (let index = 0; index < wings.length; index++) {
      const wing = wings[index];
      const delay = index * 0.045;
      const fold = ease(displayed, 0.41 + delay, 0.76 + delay);
      wing.visible = displayed > 0.37 + delay;
      wing.rotation.z = (index ? 1 : -1) * (1 - fold) * 1.51;
      wing.scale.set(mix(0.24, 1, fold), 1, mix(0.72, 1, fold));
    }
    mast.visible = displayed > 0.40;
    const sleeveTravel = mix(0.03, 1, ease(displayed, 0.40, 0.85));
    sleeve.scale.y = sleeveTravel;
    sleeve.position.y = 0.59 * sleeveTravel;
    const tubeTravel = mix(0.04, 1, ease(displayed, 0.49, 0.95));
    tube.scale.y = tubeTravel;
    tube.position.y = 0.34 * sleeveTravel + 0.38 * tubeTravel;
    const pointing = ease(displayed, 0.60, 1);
    antenna.visible = displayed > 0.51;
    antenna.position.y = mast.position.y + Math.max(1.18 * sleeveTravel, 0.34 * sleeveTravel + 0.84 * tubeTravel);
    antenna.scale.setScalar(mix(0.24, 1, ease(displayed, 0.51, 0.79)));
    antenna.rotation.set(mix(-1.29, -0.18, pointing), Math.PI * 1.13 + 0.38 * (1 - pointing), -0.04);
    signal.emissiveIntensity = deployed ? (0.48 + 0.23 * Math.sin(time * 2.2)) * ease(displayed, 0.92, 1) : 0;
  }
  return { update, deploymentYaw: station.rotation.y, deploymentHeight: 0.05, obstacle: { x, z, radius: 0.37 } };
}

export const OBSERVATORY_SITE = { x: -13.6, z: 12.0, radius: 1.95 };

export function createObservatory(scene, height, site = OBSERVATORY_SITE) {
  const { x, z } = site;
  const group = new THREE.Group();
  group.position.set(x, height(x, z), z);
  group.rotation.y = 0.61;
  scene.add(group);

  const dustedWhite = makeEquipmentFinish(0xb7afa0, "paint", 71);
  const equipment = makeEquipmentFinish(0x444e53, "anodized", 46);
  const darkGlass = new THREE.MeshPhysicalMaterial({
    color: 0x1f3244, roughness: 0.33, metalness: 0.46, clearcoat: 0.55,
  });
  const rail = material(0xa98d5e, 0.54, 0.58);
  const bezel = makeEquipmentFinish(0x777779, "aluminum", 94);
  const baffle = material(0x151921, 0.77, 0.14);
  const opticalCoating = new THREE.MeshPhysicalMaterial({
    color: 0x223445, roughness: 0.18, metalness: 0.20,
    clearcoat: 0.9, clearcoatRoughness: 0.10, iridescence: 0.31, iridescenceThicknessRange: [120, 250],
  });
  const status = new THREE.MeshStandardMaterial({
    color: 0xb0c8bd, emissive: 0x99d7c4, emissiveIntensity: 0, roughness: 0.48,
  });
  part(group, new THREE.CylinderGeometry(0.409, 0.455, 0.051, 12), equipment, 0, 0.023, 0);
  for (const sign of [-1, 1]) {
    casing(group, rail, [0.105, 0.027, 0.29], [sign * 0.237, 0.056, 0], 0.005);
  }
  const payload = new THREE.Group();
  payload.name = "observatory-deployment";
  payload.visible = false;
  group.add(payload);
  const core = new THREE.Group();
  payload.add(core);
  casing(core, dustedWhite, [0.54, 0.27, 0.44], [0, 0.178, 0], 0.036);
  casing(core, equipment, [0.49, 0.055, 0.407], [0, 0.326, 0], 0.028);
  casing(core, status, [0.135, 0.024, 0.018], [0, 0.237, 0.224], 0.004);
  for (let index = 0; index < 5; index++) {
    casing(core, rail, [0.305, 0.015, 0.017], [0, 0.115 + index * 0.021, -0.229], 0.004);
  }
  const tripod = Array.from({ length: 3 }, (_, index) => {
    const outrigger = new THREE.Group();
    outrigger.rotation.y = index * Math.PI * 2 / 3;
    outrigger.position.y = 0.196;
    payload.add(outrigger);
    const leg = new THREE.Group();
    outrigger.add(leg);
    member(leg, dustedWhite, [0.14, 0, 0], [0.44, -0.14, 0], 0.025);
    part(leg, new THREE.CylinderGeometry(0.068, 0.09, 0.034, 10), equipment, 0.44, -0.14, 0);
    return leg;
  });
  const column = new THREE.Group();
  column.position.y = 0.30;
  payload.add(column);
  const sleeve = part(column, new THREE.CylinderGeometry(0.078, 0.097, 0.31, 14), equipment, 0, 0.155, 0);
  const tube = part(column, new THREE.CylinderGeometry(0.040, 0.048, 0.55, 12), dustedWhite, 0, 0.408, 0);
  const lidar = new THREE.Group();
  payload.add(lidar);
  casing(lidar, rail, [0.31, 0.22, 0.26], [0, 0.112, 0], 0.034);
  casing(lidar, dustedWhite, [0.34, 0.084, 0.286], [0, 0.245, -0.014], 0.027);
  for (const [lensX, diameter] of [[-0.070, 0.098], [0.062, 0.081]]) {
    const r = diameter / 2;
    const sleeve = part(lidar, new THREE.CylinderGeometry(r + 0.010, r + 0.015, 0.052, 24),
      baffle, lensX, 0.125, 0.150);
    sleeve.rotation.x = Math.PI / 2;
    for (const [rimR, rimZ, finish] of [[r + 0.006, 0.175, bezel], [r - 0.007, 0.182, baffle]]) {
      part(lidar, new THREE.TorusGeometry(rimR, 0.004, 6, 24), finish, lensX, 0.125, rimZ);
    }
    const glass = part(lidar, new THREE.SphereGeometry(r - 0.010, 24, 12), opticalCoating, lensX, 0.125, 0.174);
    glass.scale.z = 0.19;
  }
  const cover = new THREE.Group();
  cover.position.y = 0.119;
  lidar.add(cover);
  casing(cover, equipment, [0.255, 0.138, 0.027], [0, 0, 0.202], 0.012);
  casing(cover, bezel, [0.182, 0.015, 0.023], [0, 0.049, 0.221], 0.004);
  for (const sign of [-1, 1]) {
    casing(lidar, bezel, [0.011, 0.184, 0.034], [sign * 0.142, 0.157, 0.160], 0.003);
  }
  const panelPivot = new THREE.Group();
  panelPivot.position.set(-0.195, 0.29, -0.13);
  payload.add(panelPivot);
  casing(panelPivot, equipment, [0.34, 0.026, 0.46], [-0.17, 0, 0], 0.014);
  for (let i = 0; i < 4; i++) {
    casing(panelPivot, darkGlass, [0.318, 0.008, 0.102], [-0.17, 0.017, (i - 1.5) * 0.107], 0.003);
  }

  let extension = 0;
  let shutter = 0;
  function update(state, dt, time, deploymentProgress) {
    const duringAssembly = state.buildContext === "deployObservatory";
    const target = state.observatoryDeployed ? 1 : duringAssembly ? state.buildProgress : 0;
    extension = deploymentProgress === undefined
      ? target > 0 ? mix(extension, target, 1 - Math.exp(-10 * dt)) : 0
      : THREE.MathUtils.clamp(deploymentProgress, 0, 1);
    payload.visible = extension > 0.13;
    if (!payload.visible) {
      shutter = 0;
      return;
    }
    unfoldCore(core, extension, 0.59, 0.51);
    unfoldTripod(tripod, extension);
    const foldedPanel = ease(extension, 0.52, 0.89);
    panelPivot.visible = extension > 0.47;
    panelPivot.rotation.z = 1.50 * (1 - foldedPanel);
    panelPivot.scale.set(mix(0.23, 1, foldedPanel), 1, mix(0.52, 1, foldedPanel));
    column.visible = extension > 0.34;
    const sleeveTravel = mix(0.06, 1, ease(extension, 0.34, 0.69));
    sleeve.scale.y = sleeveTravel;
    sleeve.position.y = 0.155 * sleeveTravel;
    const tubeTravel = mix(0.04, 1, ease(extension, 0.48, 0.94));
    tube.scale.y = tubeTravel;
    tube.position.y = 0.133 * sleeveTravel + 0.275 * tubeTravel;
    lidar.visible = extension > 0.43;
    lidar.position.y = column.position.y + Math.max(0.31 * sleeveTravel, 0.133 * sleeveTravel + 0.568 * tubeTravel);
    lidar.scale.setScalar(mix(0.36, 1, ease(extension, 0.43, 0.72)));
    lidar.rotation.x = mix(0.72, 0, ease(extension, 0.52, 0.91));
    const reading = state.buildContext === "calibrateObservatory" && state.buildHold === true;
    const aimed = reading || state.observatoryCalibrated === true;
    shutter = mix(shutter, Number(aimed), 1 - Math.exp(-7 * dt));
    cover.position.y = 0.119 + shutter * 0.150;
    const sweep = reading ? (state.buildProgress - 0.50) * 3.6 : Math.sin(time * 0.36) * 0.42;
    lidar.rotation.y = THREE.MathUtils.lerp(lidar.rotation.y, aimed ? sweep : 0, 1 - Math.exp(-5 * dt));
    status.emissiveIntensity = (state.observatoryCalibrated ? 0.82 : reading ? 0.53 + 0.33 * Math.sin(time * 9) : 0)
      * ease(extension, 0.92, 1);
  }
  return { update, deploymentYaw: group.rotation.y, deploymentHeight: 0.05, obstacle: { x, z, radius: 0.44 } };
}
