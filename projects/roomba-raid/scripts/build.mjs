import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = new URL("../", import.meta.url);
const srcRoot = new URL("../src/", import.meta.url);

const shell = await readFile(new URL("shell.html", srcRoot), "utf8");
const marker = "<!-- GAME_BUNDLE -->";
if (shell.split(marker).length !== 2) {
  throw new Error("Expected a single <!-- GAME_BUNDLE --> marker in src/shell.html");
}

const result = await esbuild.build({
  entryPoints: [fileURLToPath(new URL("main.mjs", srcRoot))],
  bundle: true,
  write: false,
  minify: true,
  legalComments: "none",
  format: "iife",
  platform: "browser",
  target: "es2020",
  loader: { ".webp": "dataurl" },
});

const [{ text: bundle }] = result.outputFiles;
const safeBundle = bundle.replace(/<\/script/gi, "<\\/script");
const standalone = shell.replace(marker, () => `<script>\n${safeBundle}\n</script>`);
const outPath = new URL("index.html", root);
await writeFile(outPath, standalone, "utf8");

const bytes = Buffer.byteLength(standalone);
const gz = gzipSync(standalone, { level: 9 }).byteLength;
console.log(`Built ${outPath.pathname}: ${(bytes / 1024).toFixed(1)} KB (gzip ${(gz / 1024).toFixed(1)} KB)`);
