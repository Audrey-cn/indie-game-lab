import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const repoRoot = new URL("../", import.meta.url);
const srcRoot = new URL("../src/", import.meta.url);
const qa = process.argv.includes("--qa");
const shell = await readFile(new URL("lunar-shell.html", srcRoot), "utf8");
const posterToken = "__LUNAR_POSTER_DATA__";
const videoToken = "__LUNAR_TITLE_VIDEO_DATA__";
const musicToken = "__LUNAR_MUSIC_DATA__";
if (shell.split(posterToken).length !== 2) throw new Error("Expected a single embedded poster slot.");
if (shell.split(videoToken).length !== 2) throw new Error("Expected a single embedded title video slot.");
if (shell.split(musicToken).length !== 2) throw new Error("Expected a single embedded music slot.");

const musicRaw = await readFile(new URL("lunar-in-this-moment-loop.m4a", srcRoot));
const music = musicRaw.toString("base64");
const html = shell.replace(posterToken, "").replace(videoToken, "").replace(musicToken, music);
const marker = "<!-- GAME_MODULE -->";
if (html.split(marker).length !== 2) throw new Error("Expected a single inline bundle marker.");

const result = await esbuild.build({
  entryPoints: [fileURLToPath(new URL("lunar-game.mjs", srcRoot))],
  bundle: true,
  write: false,
  minify: true,
  metafile: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  loader: { ".css": "text", ".html": "text", ".jpg": "dataurl", ".webp": "dataurl" },
  define: { LUNAR_QA: String(qa), LUNAR_TITLE_CAPTURE: "false" },
});
const [{ text: bundle }] = result.outputFiles;
const license = await readFile(new URL("licenses/Three.js-MIT.txt", repoRoot), "utf8");
const safeBundle = bundle.replace(/<\/script/gi, "<\\/script");
const standalone = html.replace(marker, () => `<script type="module">\n${safeBundle}</script>\n<!--\n${license}-->\n`);
const destination = new URL(qa ? "lunar-qa.html" : "index.html", repoRoot);
await writeFile(destination, standalone);

const totalBytes = Buffer.byteLength(standalone);
const gzipBytes = gzipSync(standalone, { level: 9 }).byteLength;
console.log(`${destination.pathname} ${totalBytes} (${(totalBytes / 1048576).toFixed(3)} MB | gzip ${(gzipBytes / 1024).toFixed(1)} KB)`);
