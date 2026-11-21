import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { COLLECT_RADIUS, CONSTRUCTION_MISSION_SECONDS, DEFAULT_OBSERVATORY_SITE, OBSERVATORY_RADIUS,
  RETURN_RADIUS, SURVEY_RADIUS } from "../src/simulation/lunar-rules.mjs";
import { samples } from "./lunar-qa-route.mjs";
import { applyRouteKeys, defaultSurveySites } from "./lunar-survey-qa.mjs";

export function makeConstructionRoute() {
  const waypointIndices = {};
  const relayApproach = [{ x: -7.35, z: -1.20 }, { x: 2.6, z: -1.35 }, { x: 8.8, z: -4.1 },
    { x: 9.12, z: -9.5 }, { x: 9.85, z: -12.15 }];
  const firstSurveyApproach = [{ x: 2.4, z: 0.65 }];
  const relayExit = [{ x: 10.20, z: -12.10 }, { x: 9.28, z: -9.35 }, { x: 9.8, z: -6.65 }];
  const secondSurveyApproach = [{ x: 9.05, z: 5.6 }, { x: 6.9, z: 8.55 }];
  const workshopReturn = [{ x: 5.1, z: 10.35 }, { x: 0.6, z: 8.85 }, { x: 0.6, z: 4.6 },
    { x: -4.50, z: -1.70 }, { x: -6.02, z: -3.23, radius: 0.46, speedLimit: 2.25 }];
  const observatoryApproach = [{ x: -8.2, z: -3.66 }, { x: -15.65, z: -4.65 }, { x: -15.65, z: 5.87 }];
  const observatoryExit = [{ x: -10.47, z: 8.36 }, { x: -9.0, z: 5.0 }, { x: -3.7, z: 2.7 }];
  function waypoint(state, path, name) {
    let index = waypointIndices[name] ?? 0;
    while (index < path.length && Math.hypot(state.x - path[index].x, state.z - path[index].z) < (path[index].radius ?? 0.95)) index++;
    waypointIndices[name] = index;
    return index < path.length ? { kind: name + "-" + (index + 1), ...path[index] } : null;
  }
  function survey(index) {
    return { kind: "survey" + index, ...defaultSurveySites[index], key: "e", reach: SURVEY_RADIUS - 0.13 };
  }
  function ore(index) {
    return { kind: "ore" + index, ...samples[index], key: "e", reach: COLLECT_RADIUS - 0.06 };
  }
  function select(s) {
    const observatory = s.observatorySite ?? DEFAULT_OBSERVATORY_SITE;
    switch (s.buildStage) {
      case "return": return waypoint(s, observatoryExit, "observatory-exit") ?? { kind: "landing", x: 0, z: 0 };
      case "calibrateObservatory": return { kind: "calibration", ...observatory, key: "e", reach: (observatory.radius ?? OBSERVATORY_RADIUS) - 0.08 };
      case "deployObservatory": return waypoint(s, observatoryApproach, "observatory-approach")
        ?? { kind: "observatory-deployment", ...observatory, key: "r", reach: (observatory.radius ?? OBSERVATORY_RADIUS) - 0.13 };
      case "fabricateObservatory": return waypoint(s, workshopReturn, "workshop-return")
        ?? { kind: "observatory-workshop", ...s.workshopPoint, key: "r", reach: s.workshopPoint.radius - 0.10, speedLimit: 1.48 };
      case "resupply":
        if (!(s.mask & 8)) return waypoint(s, relayExit, "relay-exit") ?? ore(3);
        return waypoint(s, secondSurveyApproach, "second-survey-approach") ?? survey(1);
      case "deploy": return waypoint(s, relayApproach, "relay-approach")
        ?? { kind: "deployment", ...s.relaySite, key: "r", reach: s.relaySite.radius - 0.13 };
      case "fabricate": return { kind: "workshop", ...s.workshopPoint, key: "r", reach: s.workshopPoint.radius - 0.10 };
      default:
        if (!(s.mask & 1)) return ore(0);
        if (!(s.mask & 4)) return ore(2);
        return waypoint(s, firstSurveyApproach, "survey-approach") ?? survey(0);
    }
  }
  return function routeCommand(state) {
    const target = select(state);
    if (state.stowingSample) return { keys: ["Space"], interval: 0.16, target };
    const distance = Math.hypot(state.x - target.x, state.z - target.z);
    if (target.key && distance <= target.reach) {
      const previewing = target.kind.endsWith("deployment") && !state.buildHold;
      return { keys: ["Space", target.key], interval: previewing ? 0.09 : 0.18, target };
    }
    const heading = Math.atan2(state.x - target.x, state.z - target.z) - state.yaw;
    const error = Math.atan2(Math.sin(heading), Math.cos(heading));
    const stop = target.key ? Math.max(0.32, 0.11 + Math.max(0, state.speed) ** 2 / 15) : 0;
    const brake = Math.abs(error) > 0.43 || distance <= stop || state.speed > (target.speedLimit ?? Infinity);
    const keys = [brake ? "Space" : "w"];
    if (Math.abs(error) >= 0.10) keys.push(error > 0 ? "a" : "d");
    if (!brake && Math.abs(error) < 0.13 && distance > 5.1 && target.kind.endsWith("deployment")) keys.push("Shift");
    return { keys, interval: 0.15, target };
  };
}

async function run() {
  const html = process.argv[2] ? pathToFileURL(resolve(process.argv[2])) : new URL("lunar-qa.html", import.meta.url);
  const browser = await chromium.launch({
    executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    headless: true, args: ["--enable-webgl", "--use-angle=metal"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 }, offline: true });
    const errors = [], outbound = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", request => { if (/^https?:/.test(request.url())) outbound.push(request.url()); });
    await page.goto(html.href);
    await page.waitForFunction(() => window.__lunarQA?.renderCalls > 0);
    await page.evaluate(() => window.__lunarQAStart("construction"));
    const route = makeConstructionRoute();
    const keys = new Set(), stages = [], activities = new Set(), calibrationStages = new Set();
    const sampledModes = new Map(), foundations = new Map();
    let s = await page.evaluate(() => window.__lunarQA);
    let farthest = 0, minFixtureGap = Infinity, scoutVerified = false, lastProgressAt = 0;
    let previousStage = null, previousGoal = null, closestPose;
    let blockedBeforeCalibration = true;
    while (s.phase === "playing") {
      const plan = route(s);
      if (s.buildStage !== previousStage) {
        previousStage = s.buildStage;
        stages.push(s.buildStage);
      }
      if (plan.target.kind !== previousGoal) {
        previousGoal = plan.target.kind;
        lastProgressAt = s.motionTime;
        console.log(plan.target.kind, Number(s.motionTime.toFixed(2)), [s.x, s.z].map(x => Number(x.toFixed(2))));
      }
      if (s.buildHold) activities.add(s.buildContext);
      if (s.scanHold) sampledModes.set(s.scanIndex, s.scanMode);
      if (plan.target.kind.endsWith("deployment") && s.foundation?.visible && s.foundation.valid) {
        if (!foundations.has(plan.target.kind)) foundations.set(plan.target.kind, { site: s.foundation.selected });
        const status = foundations.get(plan.target.kind);
        if (!s.buildHold) status.previewAt ??= s.motionTime;
        else status.installingAt ??= s.motionTime;
      }
      if (s.calibrationStage) calibrationStages.add(s.calibrationStage);
      if (!s.observatoryCalibrated && s.returnEligible) blockedBeforeCalibration = false;
      scoutVerified ||= s.hazard.mode === "relay";
      farthest = Math.max(farthest, Math.hypot(s.x, s.z));
      if (s.fixtureGap < minFixtureGap) {
        minFixtureGap = s.fixtureGap;
        closestPose = { x: s.x, z: s.z, yaw: s.yaw, time: s.motionTime, goal: plan.target.kind };
      }
      if (s.motionTime > CONSTRUCTION_MISSION_SECONDS - 12 || s.motionTime - lastProgressAt > 32) {
        throw new Error(JSON.stringify({ target: plan.target, keys: plan.keys, x: s.x, z: s.z, yaw: s.yaw,
          time: s.motionTime, stage: s.buildStage, context: s.buildContext, progress: s.buildProgress,
          ready: s.buildReady, mask: s.mask, survey: s.surveyMask, gap: s.fixtureGap, errors }));
      }
      await applyRouteKeys(page, keys, plan);
      await page.waitForFunction(until => window.__lunarQA.phase !== "playing" || window.__lunarQA.motionTime >= until,
        s.motionTime + plan.interval, { timeout: 10_000 });
      s = await page.evaluate(() => window.__lunarQA);
    }
    await applyRouteKeys(page, keys, { keys: [] });
    assert.equal(s.phase, "won");
    assert.deepEqual(stages, ["supplies", "fabricate", "deploy", "resupply", "fabricateObservatory",
      "deployObservatory", "calibrateObservatory", "return"]);
    assert.deepEqual([...activities], ["fabricate", "deploy", "fabricateObservatory", "deployObservatory", "calibrateObservatory"]);
    assert.deepEqual([...calibrationStages], ["warmup", "align", "analyze"]);
    assert.deepEqual([...sampledModes], [[0, "precision"], [2, "precision"], [3, "precision"]]);
    assert.deepEqual([...foundations.keys()], ["deployment", "observatory-deployment"]);
    for (const [kind, { previewAt, installingAt }] of foundations) {
      assert.ok(Number.isFinite(previewAt) && installingAt - previewAt >= 0.16,
        `R preview must precede installation at ${kind}: ${JSON.stringify([...foundations])}`);
    }
    assert.ok(s.relayDeployed && s.observatoryDeployed && s.observatoryCalibrated && blockedBeforeCalibration);
    assert.equal(s.mission, "construction");
    assert.equal(s.collected, 3);
    assert.equal(s.qualityCount, 3);
    assert.equal(s.qualityMask, s.mask);
    assert.equal(s.surveyCount, 2);
    assert.equal(s.storedSamples, 3);
    assert.ok(Math.hypot(s.x, s.z) <= RETURN_RADIUS && farthest > 17 && scoutVerified);
    assert.ok(minFixtureGap > 0.018, `Fixture clearance ${minFixtureGap}: ${JSON.stringify(closestPose)}`);
    await page.locator("#main-menu").click();
    assert.deepEqual(await page.locator(".actions button:visible").evaluateAll(buttons => buttons.map(button => button.id)), ["start-campaign"]);
    assert.equal(await page.evaluate(() => window.__lunarQA.collected), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
    console.log(JSON.stringify({ stages, calibrationStages: [...calibrationStages], sampledModes: [...sampledModes],
      foundations: [...foundations], elapsed: s.motionTime,
      remaining: s.time, strikes: s.hits, farthest, minFixtureGap, scoutVerified,
      browserErrors: errors.length, outbound: outbound.length }));
  } finally {
    await browser.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
