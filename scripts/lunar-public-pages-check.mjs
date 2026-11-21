import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const url = "https://audrey-cn.github.io/lunar-field-station/";
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
  assert.match(await page.locator(".music-credit").innerText(), /In This Moment/);
  await page.locator("#settings form button").click();
  await page.locator("#start-campaign").click();
  await page.waitForFunction(() => document.body.dataset.phase === "playing"
    && document.querySelector("#lunar-music").currentTime > 0.25);
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.dataset.paused === "true");
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter(request => !request.startsWith(url)), []);
  console.log("Live Pages verified: version loads, settings switch to English, expedition begins with embedded music, keyboard and pause respond, zero off-origin asset requests.");
} finally { await browser.close(); }
