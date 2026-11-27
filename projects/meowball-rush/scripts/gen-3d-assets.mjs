#!/usr/bin/env node
// Meowball Rush — Automated Image-to-3D (.glb) Pipeline via Tripo3D Official API (HTTP/1.1 via curl for rock-solid Cloudflare compatibility)
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const refsDir = path.resolve(__dirname, "../src/models/refs");
const outDir = path.resolve(__dirname, "../src/models");
const API_BASE = "https://api.tripo3d.ai/v2/openapi";

const ASSETS = [
  { id: "cat-witch", ref: "cat-witch.png", faceLimit: 8000 },
  { id: "cat-ginger", ref: "cat-ginger.png", faceLimit: 8000 },
  { id: "tree", ref: "tree.png", faceLimit: 4000 },
  { id: "portal", ref: "portal.png", faceLimit: 5000 },
];

const apiKey = process.env.TRIPO_API_KEY;
if (!apiKey) {
  console.error("❌ 缺少环境变量 TRIPO_API_KEY！");
  process.exit(1);
}

const requested = process.argv.slice(2);
const queue = requested.length > 0 ? ASSETS.filter((a) => requested.includes(a.id)) : ASSETS;

function curlJson(args) {
  const out = execFileSync("curl", ["--http1.1", "-sS", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(out);
}

function uploadImage(filePath) {
  const json = curlJson([
    "-X", "POST",
    "-H", `Authorization: Bearer ${apiKey}`,
    "-F", `file=@${filePath};type=image/png`,
    `${API_BASE}/upload`,
  ]);
  if (json.code !== 0) throw new Error(`Upload failed: ${JSON.stringify(json)}`);
  return json.data.image_token;
}

function createTask(imageToken, faceLimit) {
  const payload = JSON.stringify({
    type: "image_to_model",
    model_version: "v2.5-20250123",
    file: { type: "png", file_token: imageToken },
    texture: true,
    pbr: false,
    face_limit: faceLimit,
  });
  const json = curlJson([
    "-X", "POST",
    "-H", `Authorization: Bearer ${apiKey}`,
    "-H", "Content-Type: application/json",
    "-d", payload,
    `${API_BASE}/task`,
  ]);
  if (json.code !== 0) throw new Error(`Task create failed: ${JSON.stringify(json)}`);
  return json.data.task_id;
}

async function pollTask(taskId, label) {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const json = curlJson([
      "-H", `Authorization: Bearer ${apiKey}`,
      `${API_BASE}/task/${taskId}`,
    ]);
    const data = json.data || {};
    console.log(`⏳ [${label}] 状态: ${data.status || "running"} (${data.progress || 0}%)`);
    if (data.status === "success") {
      const glbUrl = data.output?.pbr_model || data.output?.model || data.result?.pbr_model?.url || data.result?.model?.url;
      if (!glbUrl) throw new Error(`No GLB URL in task output: ${JSON.stringify(data)}`);
      return glbUrl;
    }
    if (data.status === "failed" || data.status === "cancelled") {
      throw new Error(`Task failed: ${JSON.stringify(data)}`);
    }
  }
  throw new Error(`Timeout polling task ${taskId}`);
}

await mkdir(outDir, { recursive: true });
for (const item of queue) {
  const refPath = path.join(refsDir, item.ref);
  if (!existsSync(refPath)) {
    console.warn(`⚠️ 跳过 ${item.id}：未找到参考图 ${refPath}`);
    continue;
  }
  console.log(`\n🚀 开始生成 3D 精模: ${item.id} (参考图: ${item.ref})`);
  const token = uploadImage(refPath);
  const taskId = createTask(token, item.faceLimit);
  const glbUrl = await pollTask(taskId, item.id);
  const outPath = path.join(outDir, `${item.id}.glb`);
  execFileSync("curl", ["--http1.1", "-sSL", "-o", outPath, glbUrl]);
  const stat = (await import("node:fs")).statSync(outPath);
  console.log(`✅ 已保存: ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
}
console.log("\n🎉 全部 3D 模型生成完成！运行 npm run build 即可自动打包进游戏！");
