import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const url = "https://audrey-cn.github.io/indie-game-lab/";
const browser = await chromium.launch({
  executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  args: ["--enable-webgl", "--use-angle=metal"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 780 } });
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().startsWith("http")) requests.push(request.url()); });
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => document.body.dataset.boot === "ready", null, { timeout: 16000 });
  assert.match(await page.title(), /月面采集站/);
  assert.equal(await page.locator("#start-campaign").count(), 1);
  await page.locator("#settings-open").click();
  await page.locator("#language-select").selectOption("en");
  assert.match(await page.title(), /Lunar Field Station/);
  assert.ok((await page.locator(".music-credit").innerText()).trim().length > 0);
  await page.locator("#settings form button").click();
  await page.locator("#start-campaign").click();
  // v0.3.0 lean bundle plays a zero-byte procedural synth (no embedded .m4a),
  // so assert gameplay + audio-enabled rather than media-element currentTime.
  await page.waitForFunction(() => document.body.dataset.phase === "playing");
  assert.equal(await page.locator("#music-toggle").getAttribute("aria-pressed"), "true");
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.dataset.paused === "true");
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter(request => !request.startsWith(url)), []);
  console.log("Live Pages verified: version loads, settings switch to English, expedition begins with audio enabled, keyboard and pause respond, zero off-origin asset requests.");
} finally { await browser.close(); }
