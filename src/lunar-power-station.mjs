import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { makeEquipmentFinish } from "./lunar-equipment-finish.mjs";

const ease = THREE.MathUtils.smootherstep;
const mix = THREE.MathUtils.lerp;

export function createPowerStation(scene, height, site) {
  const station = new THREE.Group();
  station.name = "solar-resupply-station";
  station.position.set(site.x, height(site.x, site.z), site.z);
  station.rotation.y = -0.45;
  scene.add(station);
  const aluminum = makeEquipmentFinish(0xb3aaa0, "aluminum", 58);
  const insulation = new THREE.MeshStandardMaterial({ color: 0x292b30, metalness: 0.36, roughness: 0.68 });
  const heatSink = makeEquipmentFinish(0x635c55, "anodized", 36);
  const accessPlate = makeEquipmentFinish(0x9d9b88, "paint", 62);
  const cell = new THREE.MeshPhysicalMaterial({ color: 0x20304e, metalness: 0.38, roughness: 0.28, clearcoat: 0.44 });
  const live = new THREE.MeshStandardMaterial({ color: 0x6aa39a, emissive: 0x74dcc9, emissiveIntensity: 0.25 });
  function part(parent, material, w, h, d, x, y, z, bevel = 0.012) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, bevel), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const footings = new THREE.Group();
  station.add(footings);
  const footingRails = [-1, 1].map(() => {
    const rail = new THREE.Group();
    footings.add(rail);
    part(rail, heatSink, 0.16, 0.06, 0.81, 0, 0.03, 0);
    part(rail, insulation, 0.06, 0.025, 0.72, 0, 0.07, 0);
    return rail;
  });
  const installed = new THREE.Group();
  installed.name = "power-deployment";
  station.add(installed);
  const core = new THREE.Group();
  installed.add(core);
  part(core, insulation, 0.91, 0.34, 0.61, 0, 0.23, 0);
  part(core, accessPlate, 0.86, 0.23, 0.049, 0, 0.24, 0.31);
  part(core, heatSink, 0.93, 0.058, 0.65, 0, 0.43, 0);
  for (let i = 0; i < 7; i++) part(core, heatSink, 0.22, 0.012, 0.020, -0.22, 0.16 + i * 0.022, 0.342, 0.003);
  part(core, live, 0.076, 0.024, 0.014, 0.28, 0.30, 0.345, 0.005);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.042, 16), insulation);
  socket.rotation.x = Math.PI / 2;
  socket.position.set(0.28, 0.21, 0.347);
  core.add(socket);
  for (const x of [-0.395, 0.395]) {
    for (const y of [0.151, 0.329]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.011, 6), aluminum);
      bolt.position.set(x, y, 0.337);
      bolt.rotation.x = Math.PI / 2;
      core.add(bolt);
    }
  }
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.28, 0.216, 0.366), new THREE.Vector3(0.282, 0.13, 0.47),
    new THREE.Vector3(0.19, 0.058, 0.52), new THREE.Vector3(0.062, 0.073, 0.45),
    new THREE.Vector3(-0.016, 0.151, 0.36),
  ]), 18, 0.014, 6), insulation);
  core.add(cable);
  const mast = part(installed, aluminum, 0.093, 0.47, 0.10, 0, 0.64, -0.12);
  const panel = new THREE.Group();
  panel.name = "power-solar-array";
  panel.position.z = -0.12;
  installed.add(panel);
  const hingeOffset = 0.115;
  part(panel, aluminum, hingeOffset * 2, 0.045, 0.65, 0, 0, 0);
  const wings = [-1, 1].map(sign => {
    const wing = new THREE.Group();
    wing.position.x = sign * hingeOffset;
    panel.add(wing);
    part(wing, aluminum, 0.42, 0.045, 0.65, sign * 0.21, 0, 0);
    return wing;
  });
  const tile = new THREE.InstancedMesh(new THREE.BoxGeometry(0.19, 0.016, 0.179), cell, 15);
  const matrix = new THREE.Matrix4();
  tile.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tile.castShadow = tile.receiveShadow = true;
  panel.add(tile);
  let previousLeft = NaN, previousRight = NaN;
  function setPanelFold(left, right) {
    if (left === previousLeft && right === previousRight) return;
    previousLeft = left;
    previousRight = right;
    wings[0].rotation.z = -left;
    wings[1].rotation.z = right;
    wings.forEach(wing => wing.updateMatrix());
    for (let i = 0; i < tile.count; i++) {
      const x = (i % 5 - 2) * 0.2;
      const wing = x < 0 ? wings[0] : x > 0 ? wings[1] : null;
      matrix.makeTranslation(x - (wing?.position.x ?? 0), 0.03, (Math.floor(i / 5) - 1) * 0.199);
      if (wing) matrix.premultiply(wing.matrix);
      tile.setMatrixAt(i, matrix);
    }
    tile.instanceMatrix.needsUpdate = true;
  }
  setPanelFold(0, 0);
  tile.computeBoundingSphere();
  tile.boundingSphere.radius *= 1.12;
  installed.visible = false;
  footings.visible = false;
  function update(state, time, deploymentProgress) {
    const deploying = state.buildStage === "deployPower";
    const progress = deploymentProgress === undefined
      ? state.powerOnline ? 1 : deploying ? state.buildProgress : 0
      : THREE.MathUtils.clamp(deploymentProgress, 0, 1);
    footings.visible = progress > 0.13;
    installed.visible = progress > 0.18;
    if (footings.visible) {
      for (let i = 0; i < footingRails.length; i++) {
        const extended = ease(progress, 0.13 + i * 0.035, 0.46 + i * 0.035);
        const rail = footingRails[i];
        rail.position.x = (i === 0 ? -1 : 1) * mix(0.12, 0.48, extended);
        rail.scale.z = mix(0.28, 1, ease(progress, 0.19 + i * 0.035, 0.52 + i * 0.035));
      }
    }
    if (!installed.visible) return;
    const raised = ease(progress, 0.18, 0.50);
    core.position.y = mix(0.041, 0, raised);
    core.scale.set(mix(0.42, 1, raised), mix(0.25, 1, raised), mix(0.39, 1, raised));
    const lift = ease(progress, 0.45, 0.77);
    mast.visible = progress > 0.45;
    mast.scale.y = mix(0.03, 1, lift);
    mast.position.y = 0.405 + 0.235 * mast.scale.y;
    panel.visible = progress > 0.49;
    panel.position.y = 0.405 + 0.465 * mast.scale.y;
    panel.scale.z = mix(0.32, 1, ease(progress, 0.49, 0.78));
    panel.rotation.x = mix(0.09, 0.62, ease(progress, 0.60, 1));
    setPanelFold(1.48 * (1 - ease(progress, 0.64, 0.93)), 1.48 * (1 - ease(progress, 0.71, 0.98)));
    live.emissiveIntensity = state.powerOnline
      ? (state.charging ? 0.82 + 0.30 * Math.sin(time * 2.4) : 0.58) * ease(progress, 0.92, 1) : 0;
  }
  return { obstacle: { x: site.x, z: site.z, radius: 0.59 }, update, deploymentYaw: station.rotation.y, deploymentHeight: 0.008 };
}
