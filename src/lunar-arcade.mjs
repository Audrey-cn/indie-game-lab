import * as THREE from "three";

export const ARCADE_SECONDS = 60;
const BEST_KEY = "selene-arcade-best-v1";
const CAPTURE_RADIUS = 2.65;
const COMBO_WINDOW = 9.5;
const AIRTIME_THRESHOLD = 0.42;

const SPRINT_SPOTS = [
  { x: -1.8, z: -4.8, label: "近环晶脉", labelEn: "Near Rim Vein" },
  { x: 6.2, z: -5.8, label: "东坡晶簇", labelEn: "East Ridge Cluster" },
  { x: 8.6, z: 3.9, label: "碎石台地", labelEn: "Breccia Terrace" },
  { x: 2.2, z: 9.2, label: "南坑边缘", labelEn: "South Crater Lip" },
  { x: -6.8, z: 6.6, label: "西盆地", labelEn: "West Basin" },
  { x: -10.5, z: -1.4, label: "远坡跃台", labelEn: "Outer Ramp" },
  { x: -4.8, z: -9.8, label: "北脊裂隙", labelEn: "North Ridge Fissure" },
  { x: 11.4, z: -10.2, label: "高位热脉", labelEn: "Highland Vein" },
  { x: -12.6, z: 10.6, label: "观测高地", labelEn: "Survey Highlands" },
  { x: 11.8, z: 10.8, label: "南极跃坡", labelEn: "Polar Jump" },
];

export function createCameraJuice() {
  let shake = 0;
  let shakeTime = 0;
  let fovKick = 0;
  const offset = new THREE.Vector3();

  function impulse(amount = 0.25, fovBoost = 0) {
    shake = Math.min(0.85, Math.max(shake, amount));
    if (fovBoost) fovKick = Math.min(6, Math.max(fovKick, fovBoost));
  }

  function update(dt, boosting, speed) {
    shakeTime += dt * 42;
    shake *= Math.exp(-8.5 * dt);
    if (shake < 0.002) shake = 0;
    const targetFov = boosting ? 4.4 : THREE.MathUtils.clamp((Math.abs(speed) - 4.2) * 0.55, 0, 2.2);
    fovKick = THREE.MathUtils.damp(fovKick, targetFov, 7.5, dt);
    const amp = shake * 0.085;
    offset.set(
      Math.sin(shakeTime * 1.17) * amp,
      Math.cos(shakeTime * 1.63) * amp * 0.72,
      Math.sin(shakeTime * 0.89 + 1.2) * amp * 0.5,
    );
    return { offset, fovOffset: fovKick };
  }

  function reset() {
    shake = fovKick = 0;
  }

  return { impulse, update, reset };
}

export function createArcadeSprint(scene, height) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x74ffd8, emissive: 0x74ffd8, emissiveIntensity: 3.1, roughness: 0.2, metalness: 0.1,
  });
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(CAPTURE_RADIUS * 0.56, 0.055, 10, 36), ringMat);
  outerRing.rotation.x = Math.PI / 2;
  group.add(outerRing);

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a, emissive: 0xffb85c, emissiveIntensity: 3.4, roughness: 0.18, metalness: 0.15, flatShading: true,
  });
  const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), coreMat);
  coreCrystal.position.y = 0.88;
  group.add(coreCrystal);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x74ffd8, transparent: true, opacity: 0.16, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.32, 6.2, 20, 1, true), beamMat);
  beam.position.y = 3.1;
  group.add(beam);

  let active = false;
  let score = 0;
  let captures = 0;
  let combo = 1;
  let maxCombo = 1;
  let comboTimer = 0;
  let airTime = 0;
  let jumps = 0;
  let spotIndex = 0;
  let best = { score: 0, maxCombo: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(BEST_KEY) || "null");
    if (saved && Number.isFinite(saved.score)) best = saved;
  } catch { /* ignore storage errors */ }

  function placeSpot(index) {
    spotIndex = index % SPRINT_SPOTS.length;
    const spot = SPRINT_SPOTS[spotIndex];
    group.position.set(spot.x, height(spot.x, spot.z) + 0.08, spot.z);
  }

  function start(state) {
    active = true;
    score = captures = jumps = 0;
    combo = maxCombo = 1;
    comboTimer = airTime = 0;
    state.time = ARCADE_SECONDS;
    placeSpot(0);
    group.visible = true;
  }

  function stop() {
    active = false;
    group.visible = false;
  }

  function saveBest() {
    if (score > best.score || (score === best.score && maxCombo > best.maxCombo)) {
      best = { score, maxCombo };
      try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* ignore */ }
      return true;
    }
    return false;
  }

  function update(state, dt, visualTime, callbacks) {
    if (!active) return null;
    if (combo > 1) {
      comboTimer = Math.max(0, comboTimer - dt);
      if (comboTimer === 0) combo = 1;
    }

    // Animate beacon ring and floating core
    outerRing.rotation.z = visualTime * 1.4;
    const pulse = 1 + 0.07 * Math.sin(visualTime * 6.5);
    outerRing.scale.setScalar(pulse);
    coreCrystal.rotation.y = visualTime * 2.2;
    coreCrystal.position.y = 0.88 + 0.14 * Math.sin(visualTime * 3.8);
    beamMat.opacity = 0.13 + 0.05 * Math.sin(visualTime * 5.2);

    // Track low-gravity air jumps!
    if (!state.grounded && Math.abs(state.speed) > 1.8) {
      airTime += dt;
    } else if (state.grounded && airTime >= AIRTIME_THRESHOLD) {
      const airBonus = Math.round(150 * combo);
      score += airBonus;
      jumps += 1;
      combo = Math.min(5, combo + 1);
      maxCombo = Math.max(maxCombo, combo);
      comboTimer = COMBO_WINDOW;
      state.boostCharge = Math.min(1, state.boostCharge + 0.45);
      state.boostLocked = false;
      callbacks?.onAirBonus?.({ bonus: airBonus, combo, airTime });
      airTime = 0;
    } else if (state.grounded) {
      airTime = 0;
    }

    // Instant high-speed drive-through capture
    const spot = SPRINT_SPOTS[spotIndex];
    const dist = Math.hypot(state.x - spot.x, state.z - spot.z);
    if (dist <= CAPTURE_RADIUS) {
      const gained = 100 * combo;
      score += gained;
      captures += 1;
      combo = Math.min(5, combo + 1);
      maxCombo = Math.max(maxCombo, combo);
      comboTimer = COMBO_WINDOW;
      state.collected = captures;
      state.boostCharge = Math.min(1, state.boostCharge + 0.35);
      state.boostLocked = false;
      state.energy = Math.min(1, state.energy + 0.14);
      // Pick next spot at least 9m away for exhilarating cross-crater runs
      let next = (spotIndex + 1) % SPRINT_SPOTS.length;
      for (let step = 1; step < SPRINT_SPOTS.length; step++) {
        const candidate = (spotIndex + step) % SPRINT_SPOTS.length;
        const c = SPRINT_SPOTS[candidate];
        if (Math.hypot(c.x - state.x, c.z - state.z) >= 8.5) {
          next = candidate;
          break;
        }
      }
      placeSpot(next);
      callbacks?.onCapture?.({ gained, combo, captures, score });
    }

    if (state.time <= 0) {
      state.phase = "won";
      const isNewBest = saveBest();
      callbacks?.onFinish?.({ score, captures, maxCombo, jumps, isNewBest, best });
    }

    const current = SPRINT_SPOTS[spotIndex];
    return {
      id: `arcade-${spotIndex}`,
      x: current.x,
      z: current.z,
      name: current.label,
      nameEn: current.labelEn,
      height: 1.5,
      distance: Math.hypot(current.x - state.x, current.z - state.z),
      ready: true,
    };
  }

  return {
    start,
    stop,
    update,
    get active() { return active; },
    get score() { return score; },
    get captures() { return captures; },
    get combo() { return combo; },
    get maxCombo() { return maxCombo; },
    get jumps() { return jumps; },
    get best() { return best; },
    get target() { return active ? SPRINT_SPOTS[spotIndex] : null; },
  };
}
