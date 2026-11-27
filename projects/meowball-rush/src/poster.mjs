// Meowball Rush v0.9.0 — Minimalist Full-Bleed 9:16 CG Victory Poster + Real Scannable QR Code
import qrcode from "qrcode-generator";
import posterCgUrl from "./assets/poster-cg.webp";

const GAME_SHARE_URL = "https://audrey-cn.github.io/indie-game-lab/projects/meowball-rush/";

let cachedCgImg = null;
function loadCgImage() {
  if (cachedCgImg) return Promise.resolve(cachedCgImg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cachedCgImg = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = posterCgUrl;
  });
}

function drawQrCode(ctx, text, x, y, size) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const pad = 10;
  const inner = size - pad * 2;
  const cell = inner / count;

  // Clean white rounded badge card
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size + 24, 18);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.shadowColor = "rgba(43, 30, 58, 0.32)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(43, 30, 58, 0.85)";
  ctx.stroke();

  ctx.fillStyle = "#2b1e3a";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(x + pad + c * cell, y + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
  ctx.fillStyle = "#5b4375";
  ctx.font = "900 15px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("扫码即玩", x + size / 2, y + size + 14);
  ctx.restore();
}

export async function generateClearPoster({
  track,
  cat,
  timeLeft,
  stars,
  pops,
  isFinalTourney,
  cleared,
}) {
  const W = 720;
  const H = 1280;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  // 1. Full-Bleed 9:16 Hand-Crafted Victory CG Key Art!
  const cgImg = await loadCgImage();
  if (cgImg) {
    ctx.drawImage(cgImg, 0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#60b8ff");
    bg.addColorStop(1, "#c084fc");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Subtle top & bottom atmospheric scrims purely for crisp typography legibility (keeps artwork 100% open!)
  const topScrim = ctx.createLinearGradient(0, 0, 0, 290);
  topScrim.addColorStop(0, "rgba(28, 18, 52, 0.48)");
  topScrim.addColorStop(1, "rgba(28, 18, 52, 0)");
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, 290);

  const botScrim = ctx.createLinearGradient(0, H - 290, 0, H);
  botScrim.addColorStop(0, "rgba(28, 18, 52, 0)");
  botScrim.addColorStop(1, "rgba(28, 18, 52, 0.62)");
  ctx.fillStyle = botScrim;
  ctx.fillRect(0, H - 290, W, 290);

  // 2. Minimalist Top Header: Track Name + Glowing Star Rating
  const starRating = !cleared ? 0 : (timeLeft >= 18 && pops === 0) ? 3 : (timeLeft >= 8 || pops <= 1) ? 2 : 1;
  const grade = !cleared ? "C" : starRating === 3 ? "S" : starRating === 2 ? "A" : "B";

  ctx.textAlign = "center";
  // Stage title
  ctx.save();
  ctx.font = "900 42px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(43, 30, 58, 0.9)";
  ctx.lineJoin = "round";
  const stageLabel = isFinalTourney ? "🏆 3关锦标赛全通" : track.name;
  ctx.strokeText(stageLabel, W / 2, 108);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(stageLabel, W / 2, 108);

  // Big Glowing 3-Star Row (★ ★ ★) + Collected Star Candies
  const starStr = "★".repeat(starRating) + "☆".repeat(3 - starRating);
  ctx.font = "900 58px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#2b1e3a";
  ctx.strokeText(starStr, W / 2, 184);
  const starGrad = ctx.createLinearGradient(W / 2 - 100, 130, W / 2 + 100, 195);
  starGrad.addColorStop(0, "#fff29c");
  starGrad.addColorStop(0.5, "#ffd038");
  starGrad.addColorStop(1, "#ff9900");
  ctx.fillStyle = starGrad;
  ctx.fillText(starStr, W / 2, 184);

  // Ultra-clean pill: collected stars + remaining time
  const pillText = `⭐ 收集 ${stars} 星   ·   ⏱ 剩余 ${timeLeft.toFixed(1)}s`;
  ctx.font = "900 22px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  const pw = ctx.measureText(pillText).width + 52;
  ctx.beginPath();
  ctx.roundRect(W / 2 - pw / 2, 206, pw, 44, 22);
  ctx.fillStyle = "rgba(43, 30, 58, 0.72)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.stroke();
  ctx.fillStyle = "#fff9ef";
  ctx.fillText(pillText, W / 2, 236);
  ctx.restore();

  // 3. Minimalist Bottom Left: Game Title + Cat Partner
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "900 54px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(43, 30, 58, 0.92)";
  ctx.lineJoin = "round";
  ctx.strokeText("魔女猫球", 48, H - 118);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("魔女猫球", 48, H - 118);

  ctx.font = "800 22px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.fillStyle = "#fef3c7";
  ctx.shadowColor = "rgba(43, 30, 58, 0.9)";
  ctx.shadowBlur = 8;
  ctx.fillText(`${cat.emoji || "🐱"} ${cat.name} · MEOWBALL RUSH`, 50, H - 72);
  ctx.restore();

  // 4. Bottom Right: Real Scannable QR Code!
  drawQrCode(ctx, GAME_SHARE_URL, W - 186, H - 208, 140);

  const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
  const dataUrl = c.toDataURL("image/png");
  const file = blob ? new File([blob], `meowball-${track.id}-${grade}.png`, { type: "image/png" }) : null;
  return { dataUrl, blob, file, grade };
}
