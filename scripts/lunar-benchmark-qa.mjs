import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { chromium } from "playwright-core";

const root = dirname(fileURLToPath(import.meta.url));
const mediaOut = resolve(root, "../media");

async function waitFrames(page, count = 4) {
  await page.evaluate(n => new Promise(resolve => {
    let i = 0;
    function tick() {
      if (++i >= n) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }), count);
}

async function run() {
  const htmlPath = resolve(root, "../index.html");
  const bundleStats = JSON.parse(await readFile(resolve(root, "../docs/bundle-stats.json"), "utf8"));
  await mkdir(mediaOut, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    headless: true,
    args: ["--enable-webgl", "--use-angle=metal"],
  });

  const errors = [];
  const report = { bundle: bundleStats, desktop: {}, mobile: {}, arcade: {} };

  try {
    // 1. Desktop benchmark + Render Channel Breakdown captures
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, offline: true });
    page.on("pageerror", e => errors.push(`desktop: ${e.message}`));
    page.on("console", m => { if (m.type() === "error") errors.push(`desktop-console: ${m.text()}`); });

    const t0 = performance.now();
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(() => document.body.dataset.boot === "ready", null, { timeout: 20000 });
    report.desktop.bootMs = Math.round(performance.now() - t0);
    await waitFrames(page, 6);

    // Capture upgraded title/hero shot
    await page.screenshot({ path: resolve(mediaOut, "lunar-field-station.jpg"), type: "jpeg", quality: 90 });

    // Start campaign and drive a short arc so rover leaves real virtual-paged tracks
    await page.locator("#start-campaign").click();
    await waitFrames(page, 4);
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(950);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(850);
    await page.keyboard.up("KeyW");
    await page.keyboard.down("Space");
    await page.waitForTimeout(450);
    await page.keyboard.up("Space");
    await waitFrames(page, 6);

    // Measure desktop stats across quality tiers
    for (const tier of ["high", "balanced", "low"]) {
      await page.evaluate(t => window.__lunarDebug.setTier(t), tier);
      await waitFrames(page, 8);
      report.desktop[tier] = await page.evaluate(() => window.__lunarDebug.stats());
    }
    await page.evaluate(() => window.__lunarDebug.setTier("high"));
    await waitFrames(page, 6);

    // Capture Debug Overlay + Render Breakdown channels
    await page.evaluate(() => { window.__lunarDebug.setVisible(true); window.__lunarDebug.setMode("final"); });
    await waitFrames(page, 10);
    await page.screenshot({ path: resolve(mediaOut, "render-debug-hud.jpg"), type: "jpeg", quality: 90 });

    const shots = {};
    for (const [mode, file] of [
      ["final", "render-final.jpg"],
      ["ssao", "render-ssao.jpg"],
      ["tracks", "render-tracks.jpg"],
      ["wireframe", "render-wireframe.jpg"],
    ]) {
      await page.evaluate(m => { window.__lunarDebug.setVisible(false); window.__lunarDebug.setMode(m); }, mode);
      await waitFrames(page, 5);
      const buf = await page.screenshot({ type: "jpeg", quality: 90 });
      await writeFile(resolve(mediaOut, file), buf);
      shots[mode] = `data:image/jpeg;base64,${buf.toString("base64")}`;
    }

    // Build crisp 2x2 Render Breakdown showcase composite
    const gridDataUrl = await page.evaluate(async (imgs) => {
      const load = src => new Promise((res, rej) => {
        const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
      });
      const entries = [
        ["FINAL · AgX + PCSS + SSAO + HDR Bloom", await load(imgs.final)],
        ["SSAO · Half-Res Depth Bilateral AO", await load(imgs.ssao)],
        ["VIRTUAL TRACKS · 16×16 Sparse Page Atlas", await load(imgs.tracks)],
        ["WIREFRAME · Merged Static Geometry", await load(imgs.wireframe)],
      ];
      const w = 1280, h = 720, cw = w / 2, ch = h / 2;
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#060a10";
      ctx.fillRect(0, 0, w, h);
      entries.forEach(([label, im], idx) => {
        const gx = (idx % 2) * cw, gy = Math.floor(idx / 2) * ch;
        ctx.drawImage(im, gx, gy, cw, ch);
        ctx.fillStyle = "rgba(6, 12, 18, 0.78)";
        ctx.fillRect(gx + 12, gy + ch - 34, 340, 24);
        ctx.strokeStyle = "rgba(148, 237, 235, 0.45)";
        ctx.strokeRect(gx + 12, gy + ch - 34, 340, 24);
        ctx.fillStyle = "#e8f6f5";
        ctx.font = "600 12px monospace";
        ctx.fillText(label, gx + 20, gy + ch - 18);
      });
      ctx.strokeStyle = "rgba(148, 237, 235, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cw, 0); ctx.lineTo(cw, h); ctx.moveTo(0, ch); ctx.lineTo(w, ch); ctx.stroke();
      return canvas.toDataURL("image/jpeg", 0.92);
    }, shots);
    await writeFile(resolve(mediaOut, "render-breakdown-grid.jpg"), Buffer.from(gridDataUrl.split(",")[1], "base64"));

    // 2. Verify 60s Arcade Sprint mode
    await page.evaluate(() => window.__lunarDebug.setMode("final"));
    await page.keyboard.press("Escape");
    await waitFrames(page, 3);
    await page.locator("#main-menu").click();
    await waitFrames(page, 4);
    await page.locator("#start-arcade").click();
    await waitFrames(page, 6);
    await page.screenshot({ path: resolve(mediaOut, "arcade-sprint.jpg"), type: "jpeg", quality: 90 });

    // Drive toward the first arcade beacon (-1.8, -4.8)
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(320);
    await page.keyboard.up("KeyA");
    await page.keyboard.down("ShiftLeft");
    await page.waitForTimeout(1400);
    await page.keyboard.up("ShiftLeft");
    await page.keyboard.up("KeyW");
    await waitFrames(page, 6);
    const arcadeScoreText = await page.locator("#score").innerText();
    const arcadeComboText = await page.locator("#quality-count").innerText();
    report.arcade = { score: Number(arcadeScoreText), comboText: arcadeComboText };
    assert.ok(Number(arcadeScoreText) >= 100, `Arcade capture did not register: score=${arcadeScoreText}`);

    await page.close();

    // 3. Mobile viewport benchmark
    const mobilePage = await browser.newPage({
      viewport: { width: 400, height: 869 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, offline: true,
    });
    mobilePage.on("pageerror", e => errors.push(`mobile: ${e.message}`));
    mobilePage.on("console", m => { if (m.type() === "error") errors.push(`mobile-console: ${m.text()}`); });
    const tm0 = performance.now();
    await mobilePage.goto(pathToFileURL(htmlPath).href);
    await mobilePage.waitForFunction(() => document.body.dataset.boot === "ready", null, { timeout: 20000 });
    report.mobile.bootMs = Math.round(performance.now() - tm0);
    await mobilePage.locator("#start-campaign").click();
    await waitFrames(mobilePage, 10);
    report.mobile.stats = await mobilePage.evaluate(() => window.__lunarDebug.stats());
    await mobilePage.close();

    assert.deepEqual(errors, [], `Browser errors: ${errors.join("; ")}`);
    await writeFile(resolve(root, "../docs/benchmark-report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

await run();
