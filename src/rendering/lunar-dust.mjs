import * as THREE from "three";
import { LUNAR_GRAVITY } from "../simulation/lunar-rules.mjs";

const CHIP_COUNT = 38;
const GRAIN_COUNT = 736;
const clampUnit = value => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);

function makeParticles(count) {
  return {
    positions: new Float32Array(count * 3),
    velocities: new Float32Array(count * 3),
    lives: new Float32Array(count),
    radii: new Float32Array(count),
    shades: new Float32Array(count),
  };
}

function createFineGrains(particles) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(particles.positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("radius", new THREE.BufferAttribute(particles.radii, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("lightness", new THREE.BufferAttribute(particles.shades, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float radius;
      attribute float lightness;
      varying float grainLight;
      varying float grainRadius;
      varying float grainDepth;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        grainLight = lightness;
        grainRadius = radius;
        grainDepth = -view.z;
        gl_PointSize = clamp(radius * 1375.0 / max(0.55, grainDepth), 0.68, 4.8);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float grainLight;
      varying float grainRadius;
      varying float grainDepth;
      void main() {
        if (grainRadius <= 0.0) discard;
        vec2 point = abs(gl_PointCoord - vec2(0.5));
        float edge = max(point.x * 0.92 + point.y * 0.45, point.y + point.x * 0.18);
        float coverage = 1.0 - smoothstep(0.26, 0.50, edge);
        float inRange = 1.0 - smoothstep(12.0, 22.0, grainDepth);
        if (coverage * inRange <= 0.01) discard;
        gl_FragColor = vec4(vec3(0.53, 0.49, 0.41) * grainLight, coverage * 0.83 * inRange);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const grains = new THREE.Points(geometry, material);
  grains.name = "ballistic regolith grains";
  grains.frustumCulled = false;
  return grains;
}

function createChips() {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const shape = 0.86 + 0.18 * Math.sin(x * 8.1 - y * 5.2 + z * 3.4);
    vertices.setXYZ(i, x * shape + 0.16 * y, y * shape, z * shape);
  }
  geometry.computeVertexNormals();
  const chips = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x837665, roughness: 0.93,
  }), CHIP_COUNT);
  chips.name = "tumbling basalt chips";
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chips.count = 0;
  chips.frustumCulled = false;
  chips.receiveShadow = true;
  return chips;
}

export function createLunarDust(scene, height, { sunlight } = {}) {
  const grains = makeParticles(GRAIN_COUNT);
  const chips = makeParticles(CHIP_COUNT);
  const fineMesh = createFineGrains(grains);
  const chipMesh = createChips();
  scene.add(fineMesh, chipMesh);

  const pose = new THREE.Object3D();
  const chipAngles = new Float32Array(CHIP_COUNT * 3);
  const chipBounces = new Uint8Array(CHIP_COUNT);
  let seed = 17357;
  let grainHead = 0, chipHead = 0, simulatedTime = 0;
  let hadGrains = false;
  let counts = { grains: 0, chips: 0, height: 0 };
  const sun = (sunlight ?? new THREE.Vector3(-15, 7, 11.8)).clone().normalize();
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function placeParticle(particles, index, x, y, z, vx, vy, vz, size, shade) {
    const point = index * 3;
    particles.positions[point] = x;
    particles.positions[point + 1] = y;
    particles.positions[point + 2] = z;
    particles.velocities[point] = vx;
    particles.velocities[point + 1] = vy;
    particles.velocities[point + 2] = vz;
    particles.lives[index] = 3.6;
    particles.radii[index] = size;
    particles.shades[index] = shade;
  }

  function emit({
    x, y, z, vx, vz, intensity, brake = 0, slip = 0, spin = 0, boost = 0,
    side = 0, heading = 0, load = 1, rockRise = 0, dustiness = 1,
  }, dt) {
    const speed = Math.hypot(vx, vz);
    const sliding = clampUnit(slip);
    const drivenSlip = clampUnit(spin);
    const braking = clampUnit(brake);
    const extra = clampUnit(boost);
    const pressing = clampUnit(load);
    if (dt <= 0 || pressing < 0.02 || speed < 0.28 && drivenSlip < 0.13) return 0;
    const looseSurface = (1 - 0.96 * THREE.MathUtils.smoothstep(rockRise, 0.012, 0.060)) * clampUnit(dustiness);
    const rolling = clampUnit(intensity ?? speed / 5.6);
    const disruption = 0.53 * sliding + 0.58 * drivenSlip + 0.24 * braking + 0.20 * extra;
    const activity = clampUnit(rolling * 0.87 + disruption) * (0.54 + 0.46 * pressing) * looseSurface;
    const expected = Math.min(dt, 0.075) * activity * (56 + disruption * 101);
    const whole = Math.floor(expected);
    const count = whole + Number(random() < expected - whole);
    if (!count) return 0;

    const forwardX = speed > 0.15 ? vx / speed : -Math.sin(heading);
    const forwardZ = speed > 0.15 ? vz / speed : -Math.cos(heading);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const shadowed = height(x + sun.x * 0.62, z + sun.z * 0.62) > y + sun.y * 0.62 + 0.04
      || height(x + sun.x * 1.1, z + sun.z * 1.1) > y + sun.y * 1.1 + 0.04;
    const grade = shadowed ? 0.32 : 1.06;
    for (let i = 0; i < count; i++) {
      const size = 0.0038 + 0.0108 * random() ** 2.1;
      const coarse = random() ** 1.65;
      const offset = (side || 1) * (0.046 + random() * 0.043) + (random() - 0.5) * 0.096;
      const back = 0.055 + random() * 0.11;
      // Wheel fenders confine the ejection to low rearward/sideways fans rather than a cloud.
      const sideways = (side || 1) * (0.19 + 0.67 * random()) * (0.53 + 0.53 * activity)
        + (random() - 0.5) * (0.39 + disruption * 0.51);
      const foreAft = speed * (0.18 + 0.35 * random())
        - (0.50 + 0.13 * speed + disruption * 0.68) * (0.52 + random() * 0.60);
      const launchX = forwardX * foreAft + rightX * sideways;
      const launchZ = forwardZ * foreAft + rightZ * sideways;
      const lift = 0.17 + rolling * 0.43 + coarse * (0.55 + 0.49 * disruption);
      const launchY = Math.min(1.40, lift);
      const sourceX = x - forwardX * back + rightX * offset;
      const sourceZ = z - forwardZ * back + rightZ * offset;
      placeParticle(
        grains, grainHead++ % GRAIN_COUNT, sourceX, y + 0.018 + coarse * 0.039, sourceZ,
        launchX, launchY, launchZ, size, grade * (0.55 + random() * 0.66),
      );

      if (activity > 0.28 && random() < 0.037 + disruption * 0.061) {
        const chipIndex = chipHead++ % CHIP_COUNT;
        chipBounces[chipIndex] = 0;
        const k = chipIndex * 3;
        chipAngles[k] = 3.1 + random() * 12;
        chipAngles[k + 1] = 1.2 + random() * 9;
        chipAngles[k + 2] = 4.8 + random() * 8;
        placeParticle(
          chips, chipIndex, sourceX, y + 0.042, sourceZ, launchX * 0.81,
          launchY * 0.74, launchZ * 0.81, 0.011 + 0.020 * random() ** 2, grade,
        );
      }
    }
    return count;
  }

  function advance(particles, index, dt, tumble) {
    const k = index * 3;
    particles.lives[index] -= dt;
    particles.positions[k] += particles.velocities[k] * dt;
    particles.positions[k + 1] += particles.velocities[k + 1] * dt - 0.5 * LUNAR_GRAVITY * dt * dt;
    particles.positions[k + 2] += particles.velocities[k + 2] * dt;
    particles.velocities[k + 1] -= LUNAR_GRAVITY * dt;

    const { positions, velocities, radii, lives } = particles;
    const floor = height(positions[k], positions[k + 2]) + (tumble ? radii[index] * 0.5 : 0.004);
    if (positions[k + 1] > floor && lives[index] > 0) return true;
    if (tumble && !chipBounces[index] && velocities[k + 1] < -0.24 && lives[index] > 0) {
      chipBounces[index] = 1;
      positions[k + 1] = floor + 0.001;
      velocities[k] *= 0.43;
      velocities[k + 1] *= -0.38;
      velocities[k + 2] *= 0.43;
      return true;
    }
    lives[index] = radii[index] = 0;
    return false;
  }

  function update(dt) {
    if (dt <= 0) return;
    simulatedTime += dt;

    let visibleGrains = 0;
    let grainTop = 0;
    for (let i = 0; i < GRAIN_COUNT; i++) {
      if (grains.lives[i] <= 0 || !advance(grains, i, dt, false)) continue;
      visibleGrains++;
      grainTop = Math.max(grainTop, grains.positions[i * 3 + 1]);
    }
    const visible = visibleGrains > 0;
    fineMesh.visible = visible;
    if (visible || hadGrains) {
      fineMesh.geometry.attributes.position.needsUpdate = true;
      fineMesh.geometry.attributes.radius.needsUpdate = true;
      fineMesh.geometry.attributes.lightness.needsUpdate = true;
    }
    hadGrains = visible;

    let chipDraws = 0;
    for (let i = 0; i < CHIP_COUNT; i++) {
      if (chips.lives[i] <= 0 || !advance(chips, i, dt, true)) continue;
      const k = i * 3;
      pose.position.fromArray(chips.positions, k);
      pose.rotation.set(
        chipAngles[k] * simulatedTime, chipAngles[k + 1] * simulatedTime, chipAngles[k + 2] * simulatedTime,
      );
      const scale = chips.radii[i];
      pose.scale.set(scale, scale * 0.61, scale * 0.91);
      pose.updateMatrix();
      chipMesh.setMatrixAt(chipDraws++, pose.matrix);
    }
    chipMesh.count = chipDraws;
    if (chipDraws) chipMesh.instanceMatrix.needsUpdate = true;
    counts = { grains: visibleGrains, chips: chipDraws, height: grainTop };
  }

  function reset() {
    grains.lives.fill(0);
    grains.radii.fill(0);
    chips.lives.fill(0);
    fineMesh.visible = false;
    chipMesh.count = 0;
    hadGrains = false;
    grainHead = chipHead = simulatedTime = 0;
    seed = 17357;
    counts = { grains: 0, chips: 0, height: 0 };
  }

  reset();
  return { emit, update, reset, counts: () => ({ ...counts }) };
}
