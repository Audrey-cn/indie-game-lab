import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { COLLECT_RADIUS, MISSION_SECONDS, RETURN_RADIUS, SURVEY_RADIUS, expeditionGrade } from "../src/lunar-rules.mjs";
import { samples } from "./lunar-qa-route.mjs";

export const defaultSurveySites = [{ x: -7.4, z: 1.4 }, { x: 4, z: 7.45 }];

export function surveyRouteTargets(surveySites = defaultSurveySites) {
  const sites = surveySites.map((site, index) => ({ ...site, index, kind: "survey" }));
  sites.sort((left, right) => right.z - left.z);
  return [
    { ...samples[0], index: 0, kind: "ore" },
    { ...samples[2], index: 2, kind: "ore" },
    ...sites,
    { x: 0, z: 0, kind: "base" },
  ];
}

export function routeCommand(state, targets) {
  if (state.stowingSample) return { keys: ["Space"], interval: 0.22 };
  const target = targets.find(({ index, kind }) => kind === "base"
    || !((kind === "ore" ? state.mask : state.surveyMask) & (1 << index)));
  const { x, z, kind } = target;
  const distance = Math.hypot(state.x - x, state.z - z);
  const reach = kind === "survey" ? (target.radius ?? SURVEY_RADIUS) - 0.18 : COLLECT_RADIUS - 0.06;
  if (kind !== "base" && distance <= reach) {
    return { keys: ["Space", "e"], interval: 0.24, target };
  }

  const heading = Math.atan2(state.x - x, state.z - z) - state.yaw;
  const error = Math.atan2(Math.sin(heading), Math.cos(heading));
  const stoppingDistance = 0.52 + Math.max(0, state.speed) ** 2 / 13;
  const brake = Math.abs(error) >= 0.44 || (kind !== "base" && distance <= stoppingDistance);
  const keys = [brake ? "Space" : "w"];
  if (Math.abs(error) >= 0.12) keys.push(error > 0 ? "a" : "d");
  return { keys, interval: 0.17, target };
}

export async function applyRouteKeys(page, held, { keys }) {
  for (const key of held) {
    if (keys.includes(key)) continue;
    await page.keyboard.up(key);
    held.delete(key);
  }
  for (const key of keys) {
    if (held.has(key)) continue;
    await page.keyboard.down(key);
    held.add(key);
  }
}

export async function driveSurveyRoute(page, { sites = defaultSurveySites, onProgress, onAction } = {}) {
  const targets = surveyRouteTargets(sites);
  const held = new Set();
  const oreVisits = [];
  const surveyVisits = [];
  const observations = { activeOre: false, activeSurvey: false, stoppedSurvey: false };
  const sampledModes = new Map();
  const surveyTrace = [];
  const snapshot = () => page.evaluate(() => window.__lunarQA);
  let current = await snapshot();
  let lastOre = current.mask, lastSurvey = current.surveyMask;
  let lastTarget, lastAction, lastProgressAt = current.motionTime;
  try {
    while (current.phase === "playing") {
      if (current.mask !== lastOre) {
        oreVisits.push(current.mask);
        lastOre = current.mask;
        lastProgressAt = current.motionTime;
        await onProgress?.({ kind: "ore", state: current });
      }
      if (current.surveyMask !== lastSurvey) {
        surveyVisits.push(current.surveyMask);
        lastSurvey = current.surveyMask;
        lastProgressAt = current.motionTime;
        await onProgress?.({ kind: "survey", state: current });
      }
      if (current.motionTime - lastProgressAt > 28 || current.motionTime > MISSION_SECONDS - 15) {
        throw new Error(`Expedition stalled at ${lastTarget?.kind} ${lastTarget?.index ?? ""}: ${JSON.stringify(current)}`);
      }

      const action = current.stowingSample ? "stowing" : current.scanHold ? "ore" : current.surveyHold ? "survey" : "drive";
      if (current.scanHold) {
        observations.activeOre = true;
        sampledModes.set(current.scanIndex, current.scanMode);
      }
      if (current.surveyHold) {
        observations.activeSurvey = true;
        observations.stoppedSurvey ||= Math.hypot(current.vx, current.vz) <= 0.28;
        if (surveyTrace.at(-1)?.index !== current.surveyIndex || surveyTrace.at(-1)?.stage !== current.surveyStage) {
          surveyTrace.push({ index: current.surveyIndex, stage: current.surveyStage, motionTime: current.motionTime });
        }
      }
      if (action !== lastAction) {
        lastAction = action;
        await onAction?.({ action, state: current });
      }

      const plan = routeCommand(current, targets);
      const { interval, target } = plan;
      lastTarget = target ?? lastTarget;
      await applyRouteKeys(page, held, plan);
      await page.waitForFunction(time => window.__lunarQA.phase !== "playing" || window.__lunarQA.motionTime >= time,
        current.motionTime + interval, { timeout: 12_000 });
      current = await snapshot();
    }
  } finally {
    await applyRouteKeys(page, held, { keys: [] });
  }
  return { state: current, oreVisits, surveyVisits, observations, surveyTrace, sampledModes: [...sampledModes] };
}

async function main() {
  const args = process.argv.slice(2);
  const html = args.find(arg => !arg.startsWith("--"));
  const url = html ? pathToFileURL(resolve(html)) : new URL("lunar-qa.html", import.meta.url);
  const backend = args.includes("--software")
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal"];
  const browser = await chromium.launch({
    executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    headless: true,
    args: ["--enable-webgl", ...backend],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 620, height: 402 }, deviceScaleFactor: 1, offline: true });
    const pageErrors = [];
    const outbound = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
    page.on("request", request => { if (/^https?:/.test(request.url())) outbound.push(request.url()); });
    await page.goto(url.href);
    await page.waitForFunction(() => window.__lunarQA?.renderCalls > 0);
    assert.equal(await page.locator("#survey-hud").isVisible(), false);
    await page.evaluate(() => window.__lunarQAStart("survey"));
    const run = await driveSurveyRoute(page, {
      onProgress: ({ kind, state }) => console.log(kind, state.collected, state.surveyCount, state.motionTime.toFixed(2)),
    });
    const { state, oreVisits, surveyVisits, observations, surveyTrace, sampledModes } = run;
    assert.equal(state.phase, "won");
    assert.deepEqual(oreVisits, [1, 5]);
    assert.deepEqual(surveyVisits, [2, 3]);
    assert.equal(state.collected, 2);
    assert.equal(state.qualityCount, 2);
    assert.equal(state.qualityMask, state.mask);
    assert.equal(state.storedSamples, 2);
    assert.equal(state.surveyCount, 2);
    assert.equal(state.returnEligible, true);
    assert.equal(expeditionGrade(state), "B");
    assert.ok(Math.hypot(state.x, state.z) <= RETURN_RADIUS);
    assert.ok(observations.activeOre && observations.activeSurvey && observations.stoppedSurvey);
    assert.deepEqual(sampledModes, [[0, "precision"], [2, "precision"]]);
    assert.deepEqual([...new Set(surveyTrace.map(({ stage }) => stage))].sort(), [1, 2]);
    assert.equal(await page.locator("#status").textContent(), "成功返航");
    await page.locator("#restart").click();
    const restarted = await page.evaluate(() => window.__lunarQA);
    assert.equal(restarted.phase, "playing");
    assert.equal(restarted.mask, 0);
    assert.equal(restarted.surveyMask, 0);
    assert.equal(restarted.returnEligible, false);
    assert.equal(await page.locator("#survey-hud").isVisible(), false);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(outbound, []);
    console.log(JSON.stringify({ oreVisits, surveyVisits, surveyTrace, sampledModes, grade: expeditionGrade(state),
      strikes: state.hits, motionTime: state.motionTime, remaining: state.time,
      browserErrors: pageErrors.length, externalRequests: outbound.length }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
