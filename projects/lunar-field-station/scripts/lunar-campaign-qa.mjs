import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { CAMPAIGN_MISSION_SECONDS, POWER_SITE, RETURN_RADIUS } from "../src/simulation/lunar-rules.mjs";
import { oreClearance } from "../src/simulation/lunar-collision.mjs";
import { makeConstructionRoute } from "./lunar-construction-qa.mjs";
import { applyRouteKeys, routeCommand as surveyCommand, surveyRouteTargets } from "./lunar-survey-qa.mjs";

const expectedStages = [
  null, "fabricate", "deploy", "resupply", "fabricateObservatory",
  "deployObservatory", "calibrateObservatory", "fabricatePower", "deployPower", "return",
];

function distance(state, target) {
  return Math.hypot(state.x - target.x, state.z - target.z);
}

function steerTo(state, target) {
  const range = distance(state, target);
  if ((target.key || target.park) && range <= target.reach) {
    const keys = target.key ? ["Space", target.key] : ["Space"];
    return { keys, interval: target.key && !state.buildHold ? 0.09 : 0.16, target };
  }
  const heading = Math.atan2(state.x - target.x, state.z - target.z) - state.yaw;
  const error = Math.atan2(Math.sin(heading), Math.cos(heading));
  const stoppingDistance = Math.max(0.32, 0.12 + Math.max(0, state.speed) ** 2 / 15);
  const limit = target.speedLimit ?? (target.park && range < 3.2 ? 1.8 : Infinity);
  const brake = Math.abs(error) > 0.42 || state.speed > limit
    || ((target.key || target.park) && range < stoppingDistance);
  const keys = [brake ? "Space" : "w"];
  if (Math.abs(error) > 0.11) keys.push(error > 0 ? "a" : "d");
  return { keys, interval: 0.15, target };
}

export function makeCampaignRoute({ chargeAfterInstall = true } = {}) {
  const surveyTargets = surveyRouteTargets();
  const construction = makeConstructionRoute();
  const visited = new Map();
  const landing = { kind: "upload", x: 0, z: 0, park: true, reach: RETURN_RADIUS - 0.14 };
  const firstWorkshop = [{ x: -3.6, z: -1.6 }, { x: -6.02, z: -3.23, radius: 0.47, speedLimit: 1.9 }];
  const observatoryWorkshop = [{ x: 4.25, z: 2.38 }, { x: 0.82, z: 3.4 }, ...firstWorkshop];
  const powerWorkshop = [
    { x: -10.47, z: 8.36 }, { x: -9.0, z: 5.0 }, { x: -3.7, z: 2.7 },
    { x: -3.70, z: -0.92, radius: 0.65, speedLimit: 2.0 },
    { x: -5.27, z: -1.72, radius: 0.58, speedLimit: 2.0 },
    { x: -6.04, z: -3.17, radius: 0.52, speedLimit: 1.65 },
  ];
  const powerApproach = [
    { x: -6.02, z: -3.20, radius: 0.47, speedLimit: 2.3 },
    { x: -3.55, z: -1.6 }, { x: 0.82, z: 3.4 }, { x: 2.65, z: 8.65 },
    { x: 4.75, z: 9.44, speedLimit: 2.1 },
  ];
  const powerExit = [{ x: 3.10, z: 9.45 }, { x: 0.7, z: 7.9 }, { x: 0.65, z: 3.5 }];
  let chargingSince = null;
  function nextWaypoint(state, path, id) {
    let index = visited.get(id) ?? 0;
    while (index < path.length && distance(state, path[index]) < (path[index].radius ?? 0.89)) index++;
    visited.set(id, index);
    return index < path.length ? { kind: id + "-" + (index + 1), ...path[index] } : null;
  }
  function workshop(state, kind) {
    return { kind, ...state.workshopPoint, reach: state.workshopPoint.radius - 0.10, key: "r" };
  }
  return state => {
    if (state.stowingSample) return { keys: ["Space"], interval: 0.17 };
    if (state.campaignStage === "survey") {
      const plan = surveyCommand(state, surveyTargets);
      return plan.target?.kind === "base" ? steerTo(state, landing) : plan;
    }
    const powerSite = state.powerSite ?? POWER_SITE;
    switch (state.buildStage) {
      case "fabricate":
        return steerTo(state, nextWaypoint(state, firstWorkshop, "first-workshop")
          ?? workshop(state, "workshop"));
      case "fabricateObservatory":
        return steerTo(state, nextWaypoint(state, observatoryWorkshop, "observatory-workshop-route")
          ?? workshop(state, "observatory-workshop"));
      case "fabricatePower":
        return steerTo(state, nextWaypoint(state, powerWorkshop, "power-workshop-route")
          ?? workshop(state, "power-workshop"));
      case "deployPower": {
        const junction = nextWaypoint(state, powerApproach, "power-approach");
        if (junction) return steerTo(state, junction);
        const target = { kind: "power-deployment", ...powerSite, reach: powerSite.radius - 0.018,
          key: "r", speedLimit: 0.62 };
        const range = distance(state, target);
        const gap = oreClearance(state.x, state.z, state.yaw, { ...target, radius: 0.59 });
        if (range <= target.reach && gap < 0.036) {
          return { keys: [state.speed < -0.48 || state.speed > 0.32 ? "Space" : "s"], interval: 0.085, target };
        }
        return { ...steerTo(state, target), interval: 0.085 };
      }
      case "return":
        if (chargeAfterInstall && (chargingSince === null || state.motionTime < chargingSince + 2.2)) {
          const chargingBay = { kind: "power-recharge", ...powerSite, park: true,
            reach: (powerSite.chargeRadius ?? powerSite.radius) - 0.075, speedLimit: 0.78 };
          if (state.charging) chargingSince ??= state.motionTime;
          if (chargingSince !== null) return { keys: ["Space"], interval: 0.15, target: chargingBay };
          return steerTo(state, chargingBay);
        }
        return steerTo(state, nextWaypoint(state, powerExit, "power-exit") ?? { kind: "landing", x: 0, z: 0 });
      default:
        return construction(state);
    }
  };
}

export async function installCampaignClock(page, step = 1000 / 24) {
  await page.addInitScript(({ step }) => {
    let time = 0;
    let id = 0;
    const pending = new Map();
    window.requestAnimationFrame = callback => {
      pending.set(++id, callback);
      return id;
    };
    window.cancelAnimationFrame = request => pending.delete(request);
    window.__lunarCampaignAdvance = frames => {
      for (let frame = 0; frame < frames; frame++) {
        time += step;
        for (const [key, callback] of [...pending]) {
          if (pending.delete(key)) callback(time);
        }
        if (window.__lunarQA?.phase === "won" || window.__lunarQA?.phase === "lost") break;
      }
      return window.__lunarQA;
    };
  }, { step });
}

export async function driveCampaignRoute(page, { fps = 24, onTarget, onStage } = {}) {
  const route = makeCampaignRoute();
  const held = new Set();
  const stageLog = [];
  const oreLog = [], surveyLog = [];
  const foundations = new Map();
  const work = new Set();
  let previous, current = await page.evaluate(() => window.__lunarQA);
  let targetKey = null, targetStarted = 0, upload = null, power = null;
  let minEnergy = 1, maxCharge = 0, chargeReadings = 0, excessiveReturn = false;
  try {
    while (current.phase === "playing") {
      const command = route(current);
      const target = command.target?.kind ?? "stow";
      if (target !== targetKey) {
        targetKey = target;
        targetStarted = current.motionTime;
        await onTarget?.(target, current);
      }
      if (!previous || current.buildStage !== previous.buildStage) {
        stageLog.push(current.buildStage);
        await onStage?.(current.buildStage, current);
      }
      if (previous && current.mask !== previous.mask) oreLog.push(current.mask);
      if (previous && current.surveyMask !== previous.surveyMask) surveyLog.push(current.surveyMask);
      if (!upload && current.campaignStage === "construction") upload = { ...current };
      if (!power && current.powerOnline) power = { ...current };
      if (current.buildHold) work.add(current.buildContext);
      if (current.foundation?.valid && target.endsWith("deployment")) {
        if (!foundations.has(target)) foundations.set(target, { site: current.foundation.selected });
        const entry = foundations.get(target);
        if (current.buildHold) entry.install ??= current.motionTime;
        else entry.preview ??= current.motionTime;
      }
      excessiveReturn ||= current.returnEligible && !current.powerOnline;
      minEnergy = Math.min(minEnergy, current.energy);
      if (power && distance(current, current.powerSite ?? POWER_SITE) <= POWER_SITE.radius && current.charging) {
        maxCharge = Math.max(maxCharge, current.energy - power.energy);
        chargeReadings++;
      }
      if (current.motionTime - targetStarted > 26 || current.motionTime > CAMPAIGN_MISSION_SECONDS - 8) {
        const { x, z, yaw, speed, motionTime, buildStage, buildContext, buildProgress, fixtureGap, foundation } = current;
        throw new Error(`Campaign stalled at ${target}: ${JSON.stringify({
          target: command.target, keys: command.keys, x, z, yaw, speed, motionTime, buildStage,
          buildContext, buildProgress, fixtureGap, foundation, power: current.powerOnline,
        })}`);
      }
      await applyRouteKeys(page, held, command);
      previous = current;
      current = await page.evaluate(frames => window.__lunarCampaignAdvance(frames),
        Math.max(1, Math.round(command.interval * fps)));
      assert.ok(current.motionTime > previous.motionTime, "Campaign clock stopped or reset");
      assert.ok(current.time < previous.time, "Mission timer resumed from a different run");
    }
  } finally {
    await applyRouteKeys(page, held, { keys: [] });
  }
  return { current, upload, power, stageLog, oreLog, surveyLog, work: [...work], foundations: [...foundations],
    minEnergy, maxCharge, chargeReadings, excessiveReturn };
}

async function run() {
  const args = process.argv.slice(2);
  const html = args.find(arg => !arg.startsWith("--"));
  const url = html ? pathToFileURL(resolve(html)) : new URL("lunar-qa.html", import.meta.url);
  const fps = 24;
  const backend = args.includes("--software")
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal"];
  const browser = await chromium.launch({
    executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    headless: true, args: ["--enable-webgl", ...backend],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 402 }, deviceScaleFactor: 1, offline: true });
    const pageErrors = [];
    const outbound = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
    page.on("request", request => { if (/^https?:/.test(request.url())) outbound.push(request.url()); });
    await installCampaignClock(page, 1000 / fps);
    await page.goto(url.href);
    await page.waitForFunction(() => !!window.__lunarQA && Number(document.querySelector("#boot-meter")?.value) >= 94,
      null, { polling: 40 });
    await page.evaluate(() => window.__lunarCampaignAdvance(5));
    await page.locator("#start-campaign").click();
    const outcome = await driveCampaignRoute(page, {
      fps,
      onTarget: (target, state) => console.log(target, state.motionTime.toFixed(2), state.x.toFixed(2), state.z.toFixed(2)),
    });
    const { current, upload, power, stageLog, oreLog, surveyLog, work, foundations, minEnergy, maxCharge,
      chargeReadings, excessiveReturn } = outcome;
    assert.equal(current.phase, "won");
    assert.equal(current.mission, "campaign");
    assert.deepEqual(stageLog, expectedStages);
    assert.deepEqual(oreLog, [1, 5, 13]);
    assert.deepEqual(surveyLog, [2, 3]);
    assert.ok(upload && distance(upload, { x: 0, z: 0 }) <= RETURN_RADIUS && Math.abs(upload.speed) < 0.28);
    assert.equal(upload.mask, 5);
    assert.equal(upload.surveyMask, 3);
    assert.equal(upload.storedSamples, 2);
    assert.ok(!upload.returnEligible && upload.time < CAMPAIGN_MISSION_SECONDS - 15);
    assert.ok(power && current.relayDeployed && current.observatoryCalibrated && !excessiveReturn);
    assert.ok(current.returnEligible && distance(current, { x: 0, z: 0 }) <= RETURN_RADIUS);
    assert.equal(current.storedSamples, 3);
    assert.deepEqual(work, ["fabricate", "deploy", "fabricateObservatory", "deployObservatory",
      "calibrateObservatory", "fabricatePower", "deployPower"]);
    assert.deepEqual(foundations.map(([kind]) => kind), ["deployment", "observatory-deployment", "power-deployment"]);
    for (const [kind, entry] of foundations) {
      assert.ok(Number.isFinite(entry.preview) && entry.install - entry.preview >= 0.16, kind);
    }
    assert.ok(minEnergy < 0.94 && maxCharge > 0.02 && chargeReadings > 3,
      `Charge loop did not register: ${JSON.stringify({ minEnergy, maxCharge, chargeReadings })}`);
    const snapshot = () => page.evaluate(() => window.__lunarQA);
    await page.locator("#main-menu").click();
    assert.equal((await snapshot()).phase, "ready");
    assert.deepEqual(await page.locator(".actions button:visible").evaluateAll(buttons => buttons.map(button => button.id)), ["start-campaign"]);
    await page.locator("#start-campaign").click();
    const restarted = await snapshot();
    assert.equal(restarted.mission, "campaign");
    assert.equal(restarted.campaignStage, "survey");
    assert.equal(restarted.mask, 0);
    assert.equal(restarted.surveyMask, 0);
    assert.equal(restarted.powerOnline, false);
    assert.equal(restarted.storedSamples, 0);
    assert.equal(restarted.time, CAMPAIGN_MISSION_SECONDS);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(outbound, []);
    console.log(JSON.stringify({ elapsed: current.motionTime, remaining: current.time, stageLog, work, oreLog,
      surveyLog, foundations, chargeReadings, minEnergy, maxCharge, storedSamples: current.storedSamples,
      browserErrors: pageErrors.length, externalRequests: outbound.length }));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
