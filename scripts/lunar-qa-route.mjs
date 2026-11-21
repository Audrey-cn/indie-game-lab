import { COLLECT_RADIUS, createState, MISSION_SECONDS, step } from "../src/simulation/lunar-rules.mjs";

export const samples = [
  { x: 0, z: -3 }, { x: -6, z: -5 }, { x: 5.8, z: -6 },
  { x: 6.5, z: 4.8 }, { x: -5.5, z: 5.9 },
];
const order = [0, 2, 3, 4, 1];

export function driveToNextSample(state, crystals = samples, allowBoost = false, { rapid = false, returnAfter = crystals.length } = {}) {
  const sample = state.collected >= returnAfter ? undefined : order.find(index => !(state.mask & (1 << index)));
  const { x, z } = sample === undefined ? { x: 0, z: 0 } : crystals[sample];
  const distance = Math.hypot(state.x - x, state.z - z);
  if (sample !== undefined && distance <= COLLECT_RADIUS - 0.06) {
    return { throttle: 0, steer: 0, brake: true, scan: !rapid, rapid, boost: false };
  }
  const heading = Math.atan2(state.x - x, state.z - z);
  const offset = heading - state.yaw;
  const error = Math.atan2(Math.sin(offset), Math.cos(offset));
  const aligned = Math.abs(error) < 0.46;
  const stoppingDistance = 0.52 + Math.max(0, state.speed) ** 2 / 13;
  const brake = !aligned || (sample !== undefined && distance <= stoppingDistance);
  return {
    throttle: Number(!brake),
    steer: Math.abs(error) < 0.12 ? 0 : -Math.sign(error),
    brake,
    scan: false,
    rapid: false,
    boost: allowBoost && !brake && sample === 2 && distance > 3.8 && Math.abs(error) < 0.17,
  };
}

export function simulateRoute(dt = 1 / 60, updateInterval = 0.2,
  { height, boost = false, rapid = false, returnAfter = samples.length, canReachSample } = {}) {
  const state = createState();
  state.phase = "playing";
  const visits = [];
  let time = 0;
  let nextUpdate = 0;
  let controls;
  for (; state.phase === "playing"; time += dt) {
    if (time >= nextUpdate) {
      controls = driveToNextSample(state, samples, boost, { rapid, returnAfter });
      nextUpdate = time + updateInterval;
    }
    const mask = state.mask;
    const hazard = { x: 5.7 * Math.cos(time * 0.55), z: 4.3 * Math.sin(time * 0.76) - 0.4 };
    step(state, controls, samples, hazard, dt, height, canReachSample);
    if (mask !== state.mask) visits.push({ time, mask: state.mask, x: state.x, z: state.z });
  }
  return { state, time, visits };
}

export async function driveBrowserRoute(page,
  { boost: allowBoost = false, returnAfter = samples.length, onProgress } = {}) {
  const pressed = new Set();
  const visits = [];
  let lastMask = 0;
  let state = await page.evaluate(() => window.__lunarQA);
  try {
    while (state.phase === "playing") {
      if (state.motionTime > MISSION_SECONDS - 15) throw new Error(`Keyboard route stalled: ${JSON.stringify(state)}`);
      if (state.mask !== lastMask) {
        visits.push(state.mask);
        lastMask = state.mask;
        await onProgress?.(state);
      }
      const { throttle, steer, brake, scan, rapid, boost } = driveToNextSample(state, samples, allowBoost,
        { returnAfter });
      const command = new Set();
      if (throttle > 0) command.add("w");
      if (steer < 0) command.add("a");
      if (steer > 0) command.add("d");
      if (brake) command.add("Space");
      if (scan || rapid) command.add("e");
      if (boost) command.add("Shift");
      for (const key of pressed) {
        if (!command.has(key)) {
          await page.keyboard.up(key);
          pressed.delete(key);
        }
      }
      for (const key of command) {
        if (!pressed.has(key)) {
          await page.keyboard.down(key);
          pressed.add(key);
        }
      }
      const until = state.motionTime + (scan || rapid ? 0.3 : 0.17);
      await page.waitForFunction(t => window.__lunarQA.phase !== "playing" || window.__lunarQA.motionTime >= t, until,
        { timeout: 7000 });
      state = await page.evaluate(() => window.__lunarQA);
    }
  } finally {
    for (const key of pressed) await page.keyboard.up(key);
  }
  return { state, visits };
}
