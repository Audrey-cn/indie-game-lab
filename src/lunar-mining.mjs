import * as THREE from "three";
import { LUNAR_GRAVITY } from "./lunar-rules.mjs";

export const CUT_START = 0.33;
export const CUT_END = 0.78;
const DEPTH = 0.12;
const SIDES = 18;
const PRECISION_RADIUS = 0.054;
const RAPID_RADIUS = 0.084;

const cutWall = new THREE.MeshStandardMaterial({
  color: 0x455952, roughness: 0.91, side: THREE.DoubleSide, vertexColors: true,
});
const coreMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x9fb9ac, roughness: 0.38, transmission: 0.32, thickness: 0.04,
  ior: 1.54, envMapIntensity: 1.1, flatShading: true,
});
const fragmentGeometry = new THREE.DodecahedronGeometry(1, 0);
const coreGeometry = new THREE.CylinderGeometry(1, 0.78, 1, 10);
const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

function buildWall(center, radius, topAt) {
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const rings = [];
  for (let side = 0; side < SIDES; side++) {
    const angle = side / SIDES * Math.PI * 2;
    const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
    const nick = Math.sin(side * 4.17) * radius * 0.06;
    const y = (topAt(center.x + x, center.z + z) ?? center.y - 0.07) - center.y;
    rings.push([x, y, z, nick]);
  }
  function add(x, y, z, gray) {
    positions.push(x, y, z);
    color.setRGB(gray * 0.82, gray, gray * 0.94);
    colors.push(color.r, color.g, color.b);
  }
  for (let side = 0; side < SIDES; side++) {
    const [ax, ay, az, aNick] = rings[side];
    const [bx, by, bz, bNick] = rings[(side + 1) % SIDES];
    const lip = 0.70 + Math.sin(side * 5.2) * 0.16;
    const topA = Math.max(-DEPTH + 0.014, ay + aNick);
    const topB = Math.max(-DEPTH + 0.014, by + bNick);
    add(ax * 1.055, topA, az * 1.055, lip);
    add(bx * 1.055, topB, bz * 1.055, lip);
    add(bx * 0.92, -DEPTH, bz * 0.92, 0.16);
    add(ax * 1.055, topA, az * 1.055, lip);
    add(bx * 0.92, -DEPTH, bz * 0.92, 0.16);
    add(ax * 0.92, -DEPTH, az * 0.92, 0.16);
    add(ax * 0.92, -DEPTH, az * 0.92, 0.19);
    add(bx * 0.92, -DEPTH, bz * 0.92, 0.19);
    add(0, -DEPTH * 1.06, 0, 0.13);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createBore(scene, material, edge, surface, topAt) {
  const radius = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.borePosition = { value: surface };
    shader.uniforms.boreRadius = radius;
    shader.vertexShader = "varying vec3 boreWorld;\n" + shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nboreWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = `uniform vec3 borePosition;
      uniform float boreRadius;
      varying vec3 boreWorld;
      ${shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        vec3 rockFromBore = boreWorld - borePosition;
        if (rockFromBore.y > -${DEPTH.toFixed(2)} && length(rockFromBore.xz) < boreRadius) discard;`)}`;
  };
  material.customProgramCacheKey = () => "lunar-bore";
  edge.uniforms.borePosition = { value: surface };
  edge.uniforms.boreRadius = radius;
  edge.vertexShader = "varying vec3 boreWorld;\n" + edge.vertexShader.replace("void main() {", `void main() {
    boreWorld = (modelMatrix * vec4(position, 1.0)).xyz;`);
  edge.fragmentShader = `uniform vec3 borePosition;
    uniform float boreRadius;
    varying vec3 boreWorld;
    ${edge.fragmentShader.replace("void main() {", `void main() {
      vec3 rockFromBore = boreWorld - borePosition;
      if (rockFromBore.y > -${DEPTH.toFixed(2)} && length(rockFromBore.xz) < boreRadius) discard;`)}`;
  const wall = new THREE.Mesh(buildWall(surface, RAPID_RADIUS, topAt), cutWall);
  wall.position.copy(surface);
  wall.visible = false;
  wall.receiveShadow = true;
  scene.add(wall);

  let targetRadius = 0;
  function record(progress, mode) {
    const fraction = clamp01((progress - CUT_START) / (CUT_END - CUT_START));
    const maximum = mode === "rapid" ? RAPID_RADIUS : PRECISION_RADIUS;
    targetRadius = Math.max(targetRadius, maximum * Math.pow(fraction, 0.55));
  }
  function update(dt) {
    radius.value = THREE.MathUtils.lerp(radius.value, targetRadius, 1 - Math.exp(-15 * dt));
    wall.visible = radius.value > 0.006;
    const ratio = radius.value / RAPID_RADIUS;
    wall.scale.set(ratio, Math.min(1, 0.4 + ratio), ratio);
  }
  function reset() {
    targetRadius = radius.value = 0;
    wall.visible = false;
  }
  function warm(visible) {
    wall.visible = visible;
    wall.frustumCulled = !visible;
  }
  return { record, update, reset, warm, get radius() { return radius.value; } };
}

export function createMiningEffects(scene, height) {
  const chunks = new THREE.InstancedMesh(fragmentGeometry, new THREE.MeshStandardMaterial({
    color: 0xb5b7a4, roughness: 0.82, flatShading: true,
  }), 108);
  chunks.count = 0;
  chunks.setColorAt(0, new THREE.Color(0xffffff));
  chunks.frustumCulled = false;
  chunks.receiveShadow = true;
  chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(chunks);
  // Hot carbide-bit cutting sparks in HDR space (triggers selective Bloom pass).
  const sparkGeometry = new THREE.BoxGeometry(0.006, 0.006, 0.042);
  const sparks = new THREE.InstancedMesh(sparkGeometry, new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(3.6, 2.45, 1.15), toneMapped: false,
  }), 48);
  sparks.count = 0;
  sparks.frustumCulled = false;
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(sparks);
  const core = new THREE.Group();
  core.visible = false;
  scene.add(core);
  const intact = new THREE.Mesh(coreGeometry, coreMaterial);
  intact.scale.set(0.038, 0.118, 0.038);
  const broken = new THREE.Group();
  for (const [x, y, z, size] of [[-0.020, -0.032, 0, 0.030], [0.017, -0.025, 0.008, 0.021], [0.007, 0.014, -0.012, 0.026]]) {
    const piece = new THREE.Mesh(fragmentGeometry, coreMaterial);
    piece.scale.set(size, size * 1.32, size * 0.86);
    piece.position.set(x, y, z);
    broken.add(piece);
  }
  core.add(intact, broken);
  const transform = new THREE.Object3D();
  const sparkDir = new THREE.Vector3();
  const sparkForward = new THREE.Vector3(0, 0, 1);
  const tint = new THREE.Color();
  const chipList = [];
  const sparkList = [];
  let emission = 0;
  let sparkEmission = 0;
  let sequence = 0;
  function emit(position, rapid, dt) {
    emission += dt * (rapid ? 34 : 21);
    while (emission >= 1) {
      emission--;
      const i = sequence++;
      const angle = i * 2.399963;
      const jitter = 0.5 + 0.5 * Math.sin(i * 81.713);
      const speed = (0.27 + jitter * 0.63) * (rapid ? 1.34 : 1);
      if (chipList.length === chunks.instanceMatrix.count) chipList.shift();
      chipList.push({
        x: position.x + Math.cos(angle) * 0.045, y: position.y + 0.019, z: position.z + Math.sin(angle) * 0.045,
        vx: Math.cos(angle) * speed, vy: 0.28 + jitter * 0.86, vz: Math.sin(angle) * speed,
        size: (0.0037 + jitter ** 2 * 0.013) * (rapid ? 1.26 : 1),
        turn: angle, tint: 0.42 + jitter * 0.52,
      });
    }
    sparkEmission += dt * (rapid ? 46 : 26);
    while (sparkEmission >= 1) {
      sparkEmission--;
      const i = sequence++;
      const angle = i * 2.399963 + 0.7;
      const jitter = 0.5 + 0.5 * Math.cos(i * 53.17);
      const speed = (0.68 + jitter * 1.18) * (rapid ? 1.25 : 1);
      if (sparkList.length === sparks.instanceMatrix.count) sparkList.shift();
      sparkList.push({
        x: position.x + Math.cos(angle) * 0.025, y: position.y + 0.028, z: position.z + Math.sin(angle) * 0.025,
        vx: Math.cos(angle) * speed, vy: 0.52 + jitter * 0.95, vz: Math.sin(angle) * speed,
        life: 0, maxLife: 0.18 + jitter * 0.24,
      });
    }
  }
  function update(dt) {
    for (const [i, chip] of chipList.entries()) {
      if (chip.vy || chip.vx || chip.vz) {
        chip.vy -= LUNAR_GRAVITY * dt;
        chip.x += chip.vx * dt;
        chip.y += chip.vy * dt;
        chip.z += chip.vz * dt;
        chip.turn += dt * (5 + chip.size * 70);
        const ground = height(chip.x, chip.z) + chip.size * 0.72;
        if (chip.y <= ground) {
          chip.y = ground;
          if (chip.vy < -0.66) {
            chip.vy *= -0.23;
            chip.vx *= 0.55;
            chip.vz *= 0.55;
          } else {
            chip.vx = chip.vy = chip.vz = 0;
          }
        }
      }
      transform.position.set(chip.x, chip.y, chip.z);
      transform.rotation.set(chip.turn, chip.turn * 0.62, 0.42);
      transform.scale.set(chip.size, chip.size * 0.62, chip.size * 0.85);
      transform.updateMatrix();
      chunks.setMatrixAt(i, transform.matrix);
      tint.setScalar(chip.tint);
      chunks.setColorAt(i, tint);
    }
    chunks.count = chipList.length;
    if (chunks.count) {
      chunks.instanceMatrix.needsUpdate = true;
      chunks.instanceColor.needsUpdate = true;
    }
    let alive = 0;
    for (let i = 0; i < sparkList.length; i++) {
      const s = sparkList[i];
      s.life += dt;
      if (s.life >= s.maxLife) continue;
      s.vy -= LUNAR_GRAVITY * 1.45 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const fade = 1 - s.life / s.maxLife;
      transform.position.set(s.x, s.y, s.z);
      sparkDir.set(s.vx, s.vy, s.vz);
      if (sparkDir.lengthSq() > 0.0001) {
        sparkDir.normalize();
        transform.quaternion.setFromUnitVectors(sparkForward, sparkDir);
      }
      transform.scale.set(fade, fade, 0.65 + fade * 1.25);
      transform.updateMatrix();
      sparks.setMatrixAt(alive, transform.matrix);
      sparkList[alive++] = s;
    }
    sparkList.length = alive;
    sparks.count = alive;
    if (alive) sparks.instanceMatrix.needsUpdate = true;
  }
  function showCore(position, rapid, fraction) {
    core.visible = true;
    intact.visible = !rapid;
    broken.visible = rapid;
    core.scale.setScalar(THREE.MathUtils.lerp(0.46, 1, clamp01(fraction)));
    core.position.copy(position);
    core.position.y -= 0.054 * core.scale.y;
  }
  function reset() {
    core.visible = false;
    chipList.length = chunks.count = sparkList.length = sparks.count = sequence = 0;
    emission = sparkEmission = 0;
  }
  function warm(visible) {
    chunks.count = visible ? 1 : 0;
    sparks.count = visible ? 1 : 0;
    core.visible = visible;
    intact.frustumCulled = !visible;
  }
  return { core, emit, update, showCore, reset, warm, get chipCount() { return chipList.length; } };
}
