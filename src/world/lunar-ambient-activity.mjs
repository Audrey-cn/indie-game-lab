import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const DUST_MONITOR_SITE = { x: -6.20, z: -8.60, radius: 0.28, aimHeight: 0.43 };

function makeBatch(group) {
  const batches = new Map();
  const pose = new THREE.Object3D();
  function place(geometry, material, [x, y, z], rotation = [0, 0, 0]) {
    pose.position.set(x, y, z);
    pose.rotation.set(...rotation);
    pose.updateMatrix();
    geometry.applyMatrix4(pose.matrix);
    const piece = geometry.index ? geometry.toNonIndexed() : geometry;
    if (piece !== geometry) geometry.dispose();
    const items = batches.get(material) ?? [];
    items.push(piece);
    batches.set(material, items);
  }
  function flush(castShadow) {
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = castShadow;
      group.add(mesh);
      for (const part of parts) part.dispose();
    }
  }
  return { place, flush };
}

function material(color, roughness, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function labelledPlate(text, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const brush = canvas.getContext("2d");
  brush.fillStyle = "#b9bbae";
  brush.fillRect(0, 0, 256, 64);
  brush.strokeStyle = "#2b3236";
  brush.lineWidth = 3;
  brush.strokeRect(4, 4, 248, 56);
  brush.font = "bold 22px monospace";
  brush.fillStyle = "#283137";
  brush.textAlign = "center";
  brush.textBaseline = "middle";
  brush.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.71, metalness: 0.04 }));
}

function createDustMonitor(height) {
  const { x, z } = DUST_MONITOR_SITE;
  const monitor = new THREE.Group();
  monitor.name = "Lunar dust and electrostatic monitor";
  monitor.position.set(x, height(x, z), z);
  monitor.rotation.y = 0.64;
  const housing = material(0xb1a58d, 0.59, 0.39);
  const eye = material(0x1f4750, 0.27, 0.48);
  const frame = material(0x44423b, 0.68, 0.52);
  const silver = material(0xaab8bb, 0.44, 0.75);
  const orange = material(0x9e642d, 0.67, 0.33);
  const fastening = makeBatch(monitor);
  const box = (batch, source, dimensions, position, radius = 0.011) =>
    batch.place(new RoundedBoxGeometry(...dimensions, 1, radius), source, position);
  const pin = (batch, source, sizes, position, rotation) =>
    batch.place(new THREE.CylinderGeometry(...sizes, 12), source, position, rotation);
  box(fastening, frame, [0.45, 0.08, 0.34], [0, 0.049, 0]);
  box(fastening, housing, [0.32, 0.21, 0.24], [0, 0.178, 0]);
  box(fastening, orange, [0.29, 0.04, 0.225], [0, 0.283, 0]);
  box(fastening, frame, [0.16, 0.047, 0.016], [0.039, 0.218, 0.126], 0.004);
  for (const sign of [-1, 1]) {
    box(fastening, silver, [0.035, 0.19, 0.24], [sign * 0.172, 0.159, 0]);
    box(fastening, frame, [0.09, 0.032, 0.38], [sign * 0.205, 0.02, 0], 0.009);
    for (let n = 0; n < 4; n++) {
      box(fastening, frame, [0.009, 0.051, 0.015],
        [sign * 0.192, 0.18, 0.072 - 0.047 * n], 0.003);
    }
  }
  pin(fastening, silver, [0.019, 0.023, 0.22], [-0.09, 0.417, -0.032]);
  pin(fastening, frame, [0.029, 0.039, 0.078], [-0.09, 0.51, -0.032]);
  pin(fastening, silver, [0.005, 0.008, 0.28], [0.103, 0.429, -0.071], [0, 0, -0.23]);
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.164, 0.197, -0.065), new THREE.Vector3(-0.234, 0.174, 0.012),
    new THREE.Vector3(-0.236, 0.082, 0.044), new THREE.Vector3(-0.177, 0.082, 0.057),
  ]);
  fastening.place(new THREE.TubeGeometry(cable, 12, 0.009, 7), frame, [0, 0, 0]);
  fastening.flush(true);

  const plate = labelledPlate("SELENE / DUST-04", 0.248, 0.061);
  plate.position.set(0, 0.142, 0.127);
  plate.receiveShadow = true;
  monitor.add(plate);

  const head = new THREE.Group();
  head.position.set(-0.09, 0.57, -0.032);
  monitor.add(head);
  const sampling = makeBatch(head);
  pin(sampling, housing, [0.080, 0.076, 0.096], [0, 0.044, 0]);
  box(sampling, silver, [0.175, 0.055, 0.095], [0, 0.095, 0.02]);
  pin(sampling, frame, [0.048, 0.056, 0.038], [-0.026, 0.113, 0.083], [Math.PI / 2, 0, 0]);
  pin(sampling, eye, [0.035, 0.035, 0.005], [-0.026, 0.113, 0.105], [Math.PI / 2, 0, 0]);
  box(sampling, orange, [0.046, 0.067, 0.027], [0.056, 0.107, 0.080], 0.005);
  for (const sign of [-1, 1]) {
    box(sampling, eye, [0.060, 0.102, 0.011], [sign * 0.121, 0.095, 0.024], 0.003);
    box(sampling, silver, [0.047, 0.016, 0.021], [sign * 0.083, 0.086, 0.024], 0.003);
  }
  sampling.flush(true);

  const led = [-1, 0, 1].map((offset, index) => {
    const color = index === 2 ? 0xdeb277 : 0x83b8b9;
    const status = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.13, roughness: 0.43 });
    const diode = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.006), status);
    diode.position.set(0.039 + offset * 0.040, 0.217, 0.137);
    monitor.add(diode);
    return status;
  });

  function update(time) {
    const cycle = (time + 2) % 11.5;
    const samplingWindow = THREE.MathUtils.smoothstep(cycle, 1.05, 2.0)
      * (1 - THREE.MathUtils.smoothstep(cycle, 6.0, 8.55));
    head.rotation.y = 0.25 - 0.84 * samplingWindow * Math.cos(cycle * 0.58);
    head.rotation.z = 0.08 + 0.15 * samplingWindow * Math.sin(cycle * 0.91);
    for (const [index, status] of led.entries()) {
      const flash = 0.5 + 0.5 * Math.cos(cycle * 2.3 - index * 1.37);
      status.emissiveIntensity = 0.14 + samplingWindow * flash ** 2 * 0.91;
    }
  }

  return { monitor, update };
}

function createSatellite(sunlight) {
  const satellite = new THREE.Group();
  satellite.name = "Low lunar orbit relay satellite";
  // The scene compresses orbital distance. Keep the relay as a near-point at driving FOV.
  satellite.scale.setScalar(0.11);
  const silver = material(0xbdbcb1, 0.51, 0.65);
  const frame = material(0x4a4d51, 0.61, 0.66);
  const solar = new THREE.MeshStandardMaterial({
    color: 0x233f60, roughness: 0.26, metalness: 0.51, emissive: 0x8fbad7, emissiveIntensity: 0.08,
  });
  const foil = material(0x927343, 0.56, 0.44);
  const hardware = makeBatch(satellite);
  const box = (finish, dimensions, position, rotation) =>
    hardware.place(new RoundedBoxGeometry(...dimensions, 1, 0.018), finish, position, rotation);
  box(silver, [0.85, 0.57, 0.62], [0, 0, 0]);
  box(foil, [0.73, 0.081, 0.52], [0, 0.30, 0]);
  box(frame, [0.68, 0.43, 0.10], [0, 0.0, 0.35]);
  for (const sign of [-1, 1]) {
    box(frame, [0.45, 0.076, 0.09], [sign * 0.52, 0.024, 0]);
    box(silver, [0.13, 0.16, 0.19], [sign * 0.74, 0.036, 0]);
    box(frame, [1.27, 0.06, 0.68], [sign * 1.396, 0.048, -0.01]);
    for (let n = 0; n < 4; n++) {
      box(solar, [0.29, 0.018, 0.622], [sign * (0.935 + n * 0.307), 0.086, -0.01]);
    }
  }
  const profile = [new THREE.Vector2(0.005, 0), new THREE.Vector2(0.13, 0.034), new THREE.Vector2(0.22, 0.079)];
  hardware.place(new THREE.LatheGeometry(profile, 20), silver, [0.11, 0.398, 0.127], [0, 0, 0.24]);
  hardware.place(new THREE.CylinderGeometry(0.016, 0.027, 0.20, 10), silver, [-0.175, 0.44, -0.108], [0, 0, -0.20]);
  hardware.flush(false);

  const sunVector = sunlight.clone().normalize();
  const normal = new THREE.Vector3();
  const incoming = sunVector.clone().negate();
  const reflected = new THREE.Vector3();
  const observer = new THREE.Vector3();
  function update(time) {
    const track = -2.14 + time * 0.0092;
    const radius = 152;
    satellite.position.set(Math.cos(track) * radius, 27 + 11 * Math.sin(track + 1.98), Math.sin(track) * radius);
    satellite.rotation.set(0.52 + 0.26 * Math.sin(time * 0.10), 0.34 + track, 0.24 + 0.13 * Math.sin(time * 0.076));
    normal.set(0, 1, 0).applyEuler(satellite.rotation);
    observer.copy(satellite.position).negate().normalize();
    reflected.copy(incoming).reflect(normal);
    const incidence = Math.max(0, normal.dot(sunVector));
    const glint = Math.max(0, reflected.dot(observer)) ** 24;
    solar.emissiveIntensity = 0.045 + incidence * 0.065 + glint * 0.95;
  }
  return { satellite, update };
}

export function createLunarAmbientActivity(scene, height, { sunlight } = {}) {
  const dust = createDustMonitor(height);
  const relay = createSatellite(sunlight ?? new THREE.Vector3(-15, 7, 11.8));
  const facility = scene.getObjectByName("Distant Eudoxus lunar research facility");
  scene.add(dust.monitor, relay.satellite);
  function update(time) {
    dust.update(time);
    relay.update(time);
    facility?.userData.updateDish?.(time);
  }
  update(0);
  return { update, monitor: dust.monitor, satellite: relay.satellite };
}
