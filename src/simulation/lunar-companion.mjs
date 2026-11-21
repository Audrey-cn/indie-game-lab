import * as THREE from "three";
import { createCompanionModel } from "../world/lunar-companion-model.mjs";
import { createScanningFan } from "./lunar-scout.mjs";

const { clamp, damp, lerp, smootherstep } = THREE.MathUtils;
const ACQUIRE_RANGE = 7.8;
const MAX_ACQUIRE_RANGE = 15.6;
const RELEASE_RANGE = 16.8;
const SCAN_SECONDS = 0.94;
const FIRST_CHECK = 0.38;
const RECHECK_DELAY = 0.20;

export function createLunarCompanion(scene, height, { clearance, mobileGraphics, onScanned }) {
  const { group, aim, scanOrigin } = createCompanionModel();
  scene.add(group);
  const fan = createScanningFan(scene, height, [], {
    rayCount: mobileGraphics ? 7 : 11,
    color: [0.025, 0.78, 0.59],
    footprintColor: 0x68e7cf,
    name: "companion pre-scan",
  });
  const completed = new Map();
  const desired = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const offsetFromRover = new THREE.Vector3();
  const berth = new THREE.Vector3();
  const pastBerth = new THREE.Vector3();
  const station = new THREE.Vector3();
  const scanBearing = new THREE.Vector2();
  let phase = "idle";
  let flightTime = 0;
  let target = null;
  let scanTime = 0;
  let scanning = false;
  let nextScan = FIRST_CHECK;
  let berthStart = 0;
  let berthEnd = 0;
  let rng = 1;

  function random() {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 2 ** 32;
  }

  function reset() {
    completed.clear();
    phase = "idle";
    flightTime = 0;
    scanTime = 0;
    nextScan = FIRST_CHECK;
    target = null;
    group.visible = scanning = false;
    rng = 0x725c775a;
    berth.set(0.91, 1.77, -0.24);
    pastBerth.copy(berth);
    berthStart = 0;
    berthEnd = 2.5;
    offsetFromRover.set(0, 0, 0);
    fan.set(origin, focus, null, 0, 0);
  }

  function planEscort(state, working) {
    if (flightTime >= berthEnd) {
      pastBerth.copy(berth);
      const side = random() < 0.65 ? -Math.sign(berth.x) : Math.sign(berth.x);
      berth.set(side * (0.79 + random() * 0.49), 1.60 + random() * 0.35, lerp(-0.67, 0.88, random()));
      berthStart = flightTime;
      berthEnd = flightTime + 2.45 + random() * 1.9;
    }
    const swap = smootherstep(flightTime, berthStart, berthStart + 1.75);
    const lateral = lerp(pastBerth.x, berth.x, swap);
    const axial = working ? 0.76 : lerp(pastBerth.z, berth.z, swap);
    const altitude = lerp(pastBerth.y, berth.y, swap) + 0.20 * Math.sin(Math.PI * swap);
    const sine = Math.sin(state.yaw), cosine = Math.cos(state.yaw);
    const x = state.x + cosine * lateral + sine * axial + state.vx * 0.17;
    const z = state.z - sine * lateral + cosine * axial + state.vz * 0.17;
    const y = Math.max(state.y + altitude, height(x, z) + 1.12) + 0.04 * Math.sin(flightTime * 1.74);
    desired.set(x, working ? Math.max(y, state.y + 2.04) : y, z);
  }

  function releaseTarget() {
    target = null;
    scanTime = 0;
    phase = "return";
    nextScan = flightTime + RECHECK_DELAY;
  }

  function approach(candidate, state) {
    target = candidate;
    phase = "approach";
    scanTime = 0;
    scanBearing.set(state.x - target.x, state.z - target.z);
    if (scanBearing.lengthSq() < 0.02) scanBearing.set(Math.sin(state.yaw), Math.cos(state.yaw));
    scanBearing.normalize();
    const side = Math.sign(berth.x);
    const x = target.x + scanBearing.x * 0.71 + scanBearing.y * side * 1.02;
    const z = target.z + scanBearing.y * 0.71 - scanBearing.x * side * 1.02;
    station.set(x, Math.max(height(x, z) + 1.50, target.y + 0.98, clearance(x, z)), z);
  }

  function canReachAhead(candidate, state) {
    const distance = Math.max(candidate.distance, 0.25);
    const closingSpeed = ((candidate.x - state.x) * state.vx + (candidate.z - state.z) * state.vz) / distance;
    const leadRange = clamp(2.2 * closingSpeed + 2, ACQUIRE_RANGE, MAX_ACQUIRE_RANGE);
    return distance < leadRange;
  }

  function update(state, candidate, dt, working) {
    if (state.phase !== "playing") {
      group.visible = scanning = false;
      phase = "idle";
      target = null;
      fan.set(origin, focus, null, 0, flightTime);
      return;
    }
    flightTime += dt;
    const before = phase;
    if (target && (working || target.id !== candidate?.id || target.key !== candidate?.key
      || candidate.distance > RELEASE_RANGE)) releaseTarget();

    if (!target && !working && candidate && canReachAhead(candidate, state)
      && !completed.has(candidate.key) && flightTime >= nextScan) approach(candidate, state);

    if (target) {
      desired.copy(station);
      desired.y += 0.026 * Math.sin(flightTime * 2.7);
      const arrive = group.position.distanceTo(desired) < 0.48;
      if (phase === "approach" && arrive) phase = "scan";
      if (phase === "scan") {
        scanTime += dt;
        if (scanTime >= SCAN_SECONDS) {
          completed.set(target.key, target.id);
          onScanned(target);
          releaseTarget();
        }
      }
    }
    if (!target) {
      planEscort(state, working);
      if (working) phase = "working";
      else if (phase !== "return" || group.position.distanceTo(desired) < 0.42) phase = "escort";
    }
    desired.y = Math.max(desired.y, clearance(desired.x, desired.z));
    if (!group.visible || before === "idle") {
      group.position.copy(desired);
      group.rotation.y = state.yaw;
    } else {
      const distance = group.position.distanceTo(desired);
      const easing = 1 - Math.exp(-(target ? 6.8 : 6.2) * dt);
      group.position.lerp(desired, Math.min(easing, 13.8 * dt / Math.max(distance, 0.001)));
    }
    group.position.y = Math.max(group.position.y, clearance(group.position.x, group.position.z));
    group.visible = true;

    if (target) {
      const sweep = lerp(-0.32, 0.32, smootherstep(scanTime, 0, SCAN_SECONDS));
      focus.set(target.x + scanBearing.x * sweep, target.y, target.z + scanBearing.y * sweep);
    }
    const yaw = target
      ? Math.atan2(group.position.x - focus.x, group.position.z - focus.z)
      : state.yaw - 0.21 * Math.sin(flightTime * 1.15);
    const turn = Math.atan2(Math.sin(yaw - group.rotation.y), Math.cos(yaw - group.rotation.y));
    group.rotation.y += turn * (1 - Math.exp(-8.1 * dt));
    group.rotation.z = damp(group.rotation.z, clamp(turn * -0.12, -0.16, 0.16), 6, dt);
    group.rotation.x = damp(group.rotation.x, target ? 0 : clamp(state.speed * -0.014, -0.14, 0.08), 7, dt);
    aim(target ? focus : null, dt);

    // The transient line is the scanner's displayed footprint. Its aperture stays
    // on the gimbal, and every ray terminates at the actual instrument or ground.
    const intensity = phase === "scan" ? 0.52 * smootherstep(scanTime, 0.02, 0.20)
      * (1 - smootherstep(scanTime, 0.73, SCAN_SECONDS)) : 0;
    scanning = intensity > 0.025;
    if (scanning) scanOrigin.getWorldPosition(origin);
    fan.set(origin, focus, target, intensity, flightTime);
    offsetFromRover.set(group.position.x - state.x, group.position.y - state.y, group.position.z - state.z);
  }

  reset();
  return {
    reset, update,
    inspect: () => ({
      phase, target: target?.id ?? null, scanning, position: group.position.toArray(),
      roverOffset: offsetFromRover.toArray(), completed: [...new Set(completed.values())],
    }),
  };
}
