// Meowball Rush v0.8.0 — 9:16 Storybook Clear Poster Generator (Canvas -> Blob/PNG + Native Mobile Share)

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function generateClearPoster({
  glCanvas,
  track,
  cat,
  timeLeft,
  stars,
  pops,
  secretFound,
  isFinalTourney,
  cleared,
}) {
  const W = 720;
  const H = 1280;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  // 1. Dreamy WitchSpring Storybook Backdrop Gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (track.id === "aurora") {
    bg.addColorStop(0, "#121036");
    bg.addColorStop(0.5, "#3d1e70");
    bg.addColorStop(1, "#7c2d8a");
  } else if (track.id === "clockwork") {
    bg.addColorStop(0, "#3b1742");
    bg.addColorStop(0.5, "#9a3412");
    bg.addColorStop(1, "#f59e0b");
  } else {
    bg.addColorStop(0, "#241645");
    bg.addColorStop(0.45, "#5b3cc4");
    bg.addColorStop(1, "#ff7eb6");
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Twinkling magic bokeh dots
  for (let i = 0; i < 36; i++) {
    const px = ((i * 197 + 43) % W);
    const py = ((i * 313 + 71) % H);
    const pr = 2 + (i % 5) * 2.2;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,224,102,0.26)";
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Top Ribbon Header
  roundRect(ctx, 130, 52, W - 260, 48, 24);
  const pillGrad = ctx.createLinearGradient(130, 52, W - 130, 52);
  pillGrad.addColorStop(0, "#ff6fb5");
  pillGrad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#2b1e3a";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 22px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MEOWBALL RUSH · 魔女猫球战报", W / 2, 84);

  // 3. Framed Live 3D Gameplay Snapshot!
  const snapX = 48;
  const snapY = 124;
  const snapW = W - 96;
  const snapH = 440;
  ctx.save();
  roundRect(ctx, snapX, snapY, snapW, snapH, 32);
  ctx.fillStyle = "#1b122b";
  ctx.fill();
  ctx.clip();
  try {
    if (glCanvas && glCanvas.width > 0 && glCanvas.height > 0) {
      const srcAspect = glCanvas.width / glCanvas.height;
      const dstAspect = snapW / snapH;
      let sx = 0, sy = 0, sw = glCanvas.width, sh = glCanvas.height;
      if (srcAspect > dstAspect) {
        sw = glCanvas.height * dstAspect;
        sx = (glCanvas.width - sw) / 2;
      } else {
        sh = glCanvas.width / dstAspect;
        sy = (glCanvas.height - sh) / 2;
      }
      ctx.drawImage(glCanvas, sx, sy, sw, sh, snapX, snapY, snapW, snapH);
    }
  } catch {}
  // Vignette overlay at bottom of snapshot
  const vig = ctx.createLinearGradient(0, snapY + snapH - 130, 0, snapY + snapH);
  vig.addColorStop(0, "rgba(27,18,43,0)");
  vig.addColorStop(1, "rgba(27,18,43,0.78)");
  ctx.fillStyle = vig;
  ctx.fillRect(snapX, snapY + snapH - 130, snapW, 130);
  ctx.restore();

  roundRect(ctx, snapX, snapY, snapW, snapH, 32);
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#fff9ef";
  ctx.stroke();

  // Grade Stamp Badge (S+ / S / A / B) on top-right corner of snapshot
  const grade = !cleared
    ? "C"
    : timeLeft >= 28 && pops === 0
      ? "S+"
      : timeLeft >= 18 || pops === 0
        ? "S"
        : timeLeft >= 8
          ? "A"
          : "B";
  ctx.save();
  ctx.translate(snapX + snapW - 74, snapY + 74);
  ctx.rotate(0.14);
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  const gGrad = ctx.createLinearGradient(-50, -50, 50, 50);
  gGrad.addColorStop(0, "#ffe46b");
  gGrad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = gGrad;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#2b1e3a";
  ctx.stroke();
  ctx.fillStyle = "#2b1e3a";
  ctx.font = "900 50px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(grade, 0, 4);
  ctx.restore();

  // Track Title inside bottom of snapshot
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff9ef";
  ctx.font = "900 34px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(isFinalTourney ? "🏆 3关锦标赛全通冠军！" : track.name, snapX + 26, snapY + snapH - 26);

  // 4. Main Cream Storybook Card
  const cardX = 48;
  const cardY = 594;
  const cardW = W - 96;
  const cardH = 510;
  roundRect(ctx, cardX, cardY, cardW, cardH, 34);
  ctx.fillStyle = "#fff9ef";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#2b1e3a";
  ctx.stroke();

  // Cat Avatar Bubble & Name
  const catHex = `#${cat.bubbleColor.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.arc(cardX + 86, cardY + 86, 48, 0, Math.PI * 2);
  ctx.fillStyle = catHex;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#2b1e3a";
  ctx.stroke();

  ctx.font = "46px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cat.emoji || "🐱", cardX + 86, cardY + 90);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#2b1e3a";
  ctx.font = "900 32px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.fillText(`${cat.name} [${cat.rarity || "R"}]`, cardX + 154, cardY + 78);
  ctx.fillStyle = "#7c3aed";
  ctx.font = "800 22px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.fillText(`${cat.title} · ${cleared ? "冲过魔法传送门！" : "差一点点就到终点！"}`, cardX + 154, cardY + 114);

  // 3 Stat Tiles
  const stats = [
    { k: "剩余时间", v: `${timeLeft.toFixed(1)}s`, col: "#10b981" },
    { k: "星糖收集", v: `⭐ ${stars}`, col: "#f59e0b" },
    { k: "破球次数", v: pops === 0 ? "✨ 0 无伤" : `💥 ${pops}`, col: pops === 0 ? "#8b5cf6" : "#ef4444" },
  ];
  const tileW = (cardW - 80) / 3;
  stats.forEach((st, i) => {
    const tx = cardX + 26 + i * (tileW + 14);
    const ty = cardY + 162;
    roundRect(ctx, tx, ty, tileW, 134, 22);
    ctx.fillStyle = "#f4ecff";
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#d9cbe8";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#6b5582";
    ctx.font = "800 20px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
    ctx.fillText(st.k, tx + tileW / 2, ty + 42);

    ctx.fillStyle = st.col;
    ctx.font = "900 34px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
    ctx.fillText(st.v, tx + tileW / 2, ty + 98);
  });

  // Playful Achievement Quote Box
  const quote = !cleared
    ? "😿 这次被大摆锤拦住了，下次一定稳稳冲过传送门！"
    : secretFound
      ? "☁️ 发现隐藏云朵捷径！这波空中飞猫操作谁能顶得住？"
      : pops === 0
        ? "✨ 全程 0 破球丝滑无伤飘逸通关，手感炸裂！"
        : isFinalTourney
          ? "👑 三关锦标赛全通制霸！敢来挑战我的结转纪录吗？"
          : "🐾 滚球过弯一气呵成！你也来试试这只魔法猫球吧！";

  roundRect(ctx, cardX + 26, cardY + 324, cardW - 52, 152, 22);
  ctx.fillStyle = "#fff1f7";
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "#f9a8d4";
  ctx.stroke();

  ctx.fillStyle = "#2b1e3a";
  ctx.font = "800 24px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  // Wrap quote cleanly onto 2 lines
  const mid = Math.ceil(quote.length / 2);
  ctx.fillText(quote.slice(0, mid), W / 2, cardY + 388);
  ctx.fillText(quote.slice(mid), W / 2, cardY + 428);

  // 5. Footer CTA
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🎮 微信 / 手机浏览器免下载直玩 · 支持陀螺仪体感", W / 2, 1166);
  ctx.fillStyle = "#fde68a";
  ctx.font = "800 21px -apple-system, BlinkMacSystemFont, monospace";
  ctx.fillText("audrey-cn.github.io/indie-game-lab/projects/meowball-rush/", W / 2, 1212);

  const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
  const dataUrl = c.toDataURL("image/png");
  const file = blob ? new File([blob], `meowball-${track.id}-${grade}.png`, { type: "image/png" }) : null;
  return { dataUrl, blob, file, grade };
}
