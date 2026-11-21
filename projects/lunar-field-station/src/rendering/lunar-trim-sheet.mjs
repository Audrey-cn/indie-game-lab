import * as THREE from "three";

let cachedTrim = null;

function buildNormalFromHeight(heightData, size, strength = 2.6) {
  const normal = new Uint8Array(size * size * 4);
  const sample = (x, y) => heightData[((y & (size - 1)) * size + (x & (size - 1)))] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1), t = sample(x, y - 1), tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y), r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1), b = sample(x, y + 1), br = sample(x + 1, y + 1);
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * size + x) * 4;
      normal[i] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(normal, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a 512x512 procedural aerospace PBR Trim Sheet (Albedo, Tangent Normal, Roughness)
 * with hull panel seams, hex rivets, thermal louvers, quilted MLI seams, and stencil markings.
 */
export function getAerospaceTrimSheet() {
  if (cachedTrim) return cachedTrim;
  const size = 512;

  // 1. Albedo Canvas
  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext("2d");

  // 2. Height Canvas (for crisp Sobel tangent-space Normal Map)
  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = heightCanvas.height = size;
  const hctx = heightCanvas.getContext("2d");

  // 3. Roughness Canvas
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d");

  // Base hull ceramic coat
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, "#ece9e0");
  bg.addColorStop(0.55, "#dfdace");
  bg.addColorStop(1, "#bdb6a8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  hctx.fillStyle = "#888888";
  hctx.fillRect(0, 0, size, size);

  rctx.fillStyle = "#a8a8a8";
  rctx.fillRect(0, 0, size, size);

  // Deterministic micro-grain & brushed metal streaking
  let seed = 918273;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2400; i++) {
    const x = rand() * size, y = rand() * size, w = 2 + rand() * 18, h = 1 + rand() * 1.6;
    const dark = i % 3 !== 0;
    ctx.fillStyle = dark ? "rgba(62,57,49,0.045)" : "rgba(255,252,240,0.05)";
    ctx.fillRect(x, y, w, h);
    rctx.fillStyle = dark ? "rgba(195,195,195,0.08)" : "rgba(120,120,120,0.08)";
    rctx.fillRect(x, y, w, h);
  }

  // Horizontal structural seam bands + recessed bevel grooves
  const seamRows = [0, 128, 256, 384];
  for (const y of seamRows) {
    // Albedo seam shadow + highlight lip
    ctx.fillStyle = "rgba(42,38,34,0.34)";
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = "rgba(255,253,245,0.22)";
    ctx.fillRect(0, y + 3, size, 2);
    // Height recessed groove
    hctx.fillStyle = "#222222";
    hctx.fillRect(0, y, size, 3);
    hctx.fillStyle = "#b8b8b8";
    hctx.fillRect(0, y + 3, size, 2);
    // Rougher grime inside seam
    rctx.fillStyle = "#dcdcdc";
    rctx.fillRect(0, y, size, 4);
  }

  // Vertical hull panel joints (staggered per row for aerospace bricking)
  for (let r = 0; r < seamRows.length; r++) {
    const y0 = seamRows[r];
    const offset = (r % 2) * 64;
    for (let x = offset; x < size; x += 128) {
      ctx.fillStyle = "rgba(42,38,34,0.28)";
      ctx.fillRect(x, y0, 2, 128);
      hctx.fillStyle = "#2c2c2c";
      hctx.fillRect(x, y0, 2, 128);
      hctx.fillStyle = "#aaaaaa";
      hctx.fillRect(x + 2, y0, 1, 128);
    }
    // Rivet / hex-fastener rows along panel flanges
    for (let x = 10; x < size; x += 16) {
      for (const ry of [y0 + 10, y0 + 118]) {
        ctx.fillStyle = "rgba(58,54,48,0.42)";
        ctx.beginPath(); ctx.arc(x, ry, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(250,248,242,0.35)";
        ctx.beginPath(); ctx.arc(x - 0.6, ry - 0.6, 0.9, 0, Math.PI * 2); ctx.fill();

        hctx.fillStyle = "#d8d8d8";
        hctx.beginPath(); hctx.arc(x, ry, 2.0, 0, Math.PI * 2); hctx.fill();
        rctx.fillStyle = "#6a6a6a";
        rctx.beginPath(); rctx.arc(x, ry, 2.0, 0, Math.PI * 2); rctx.fill();
      }
    }
  }

  // Band 2 (y=142..242): Thermal radiator louver vents + recessed access hatches
  for (let x = 22; x < size; x += 128) {
    // Recessed hatch frame
    ctx.strokeStyle = "rgba(48,45,41,0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 152, 84, 80);
    hctx.strokeStyle = "#303030";
    hctx.lineWidth = 3;
    hctx.strokeRect(x, 152, 84, 80);
    // Louver slats
    for (let sy = 162; sy <= 220; sy += 9) {
      ctx.fillStyle = "rgba(38,36,33,0.46)";
      ctx.fillRect(x + 10, sy, 64, 3);
      ctx.fillStyle = "rgba(248,245,236,0.28)";
      ctx.fillRect(x + 10, sy + 3, 64, 2);
      hctx.fillStyle = "#202020";
      hctx.fillRect(x + 10, sy, 64, 3);
      hctx.fillStyle = "#c8c8c8";
      hctx.fillRect(x + 10, sy + 3, 64, 3);
    }
  }

  // Band 3 (y=268..374): Quilted thermal blanket diamond pattern + subtle aerospace stencils
  hctx.strokeStyle = "rgba(72,72,72,0.55)";
  hctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(75,70,60,0.10)";
  ctx.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 24) {
    ctx.beginPath(); ctx.moveTo(i, 260); ctx.lineTo(i + 120, 380); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 380); ctx.lineTo(i + 120, 260); ctx.stroke();
    hctx.beginPath(); hctx.moveTo(i, 260); hctx.lineTo(i + 120, 380); hctx.stroke();
    hctx.beginPath(); hctx.moveTo(i, 380); hctx.lineTo(i + 120, 260); hctx.stroke();
  }

  // Subtle industrial aerospace markings & caution accent stripe
  ctx.fillStyle = "rgba(182,116,52,0.72)";
  ctx.fillRect(0, 366, size, 8);
  ctx.fillStyle = "rgba(52,48,42,0.55)";
  ctx.font = "bold 11px monospace";
  ctx.fillText("HAB-04 // PRESSURIZED", 24, 108);
  ctx.fillText("THERMAL MLI · NO STEP", 278, 108);
  ctx.fillText("SEC-02 // EVA ACCESS", 24, 492);
  ctx.fillText("LFS-7 · SOUTH POLE", 282, 492);

  // Extract grayscale height array for normal map generation
  const hPixels = hctx.getImageData(0, 0, size, size).data;
  const heights = new Uint8Array(size * size);
  for (let i = 0; i < heights.length; i++) heights[i] = hPixels[i * 4];

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 4;

  const normalMap = buildNormalFromHeight(heights, size, 2.4);

  cachedTrim = { map, normalMap, roughnessMap };
  return cachedTrim;
}
