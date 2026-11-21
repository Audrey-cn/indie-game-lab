// High-Saturation Stylized 2D Canvas Renderer for Roomba Raid
// Visual target: Concept Sheets 01 / 02 / 03 (midnight hardwood floor, bold outlines, juicy VFX)

import { ARENA, LOOT_ITEMS, SKINS } from "./config.mjs";

const SKIN_MAP = Object.fromEntries(SKINS.map((s) => [s.id, s]));
const LOOT_MAP = Object.fromEntries(LOOT_ITEMS.map((l) => [l.id, l]));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawLootIcon(ctx, id, x, y, r = 18) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = "#161426";

  if (id === "earbud") {
    ctx.fillStyle = "#f2f8ff";
    ctx.beginPath();
    ctx.arc(-2, -4, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, -3, 1, r * 0.36, r * 0.72, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#33425c";
    ctx.beginPath();
    ctx.ellipse(-6, -4, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "remote") {
    ctx.rotate(-0.35);
    ctx.fillStyle = "#3f4b6e";
    roundRect(ctx, -r * 0.42, -r * 0.78, r * 0.84, r * 1.56, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff5370";
    ctx.beginPath();
    ctx.arc(-r * 0.16, -r * 0.48, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9fb7e8";
    ctx.beginPath();
    ctx.arc(0, -r * 0.08, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5eead4";
    ctx.fillRect(-r * 0.22, r * 0.32, r * 0.18, r * 0.14);
    ctx.fillStyle = "#ffd54a";
    ctx.fillRect(r * 0.04, r * 0.32, r * 0.18, r * 0.14);
  } else if (id === "cash") {
    ctx.rotate(-0.22);
    ctx.fillStyle = "#48d66b";
    roundRect(ctx, -r * 0.78, -r * 0.46, r * 1.56, r * 0.92, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe066";
    ctx.fillRect(-r * 0.22, -r * 0.46, r * 0.44, r * 0.92);
    ctx.strokeRect(-r * 0.22, -r * 0.46, r * 0.44, r * 0.92);
    ctx.fillStyle = "#165c2a";
    ctx.font = `900 ${Math.round(r * 0.7)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("¥", 0, 1);
  } else if (id === "catcan") {
    ctx.fillStyle = "#ffcf3f";
    roundRect(ctx, -r * 0.74, -r * 0.32, r * 1.48, r * 0.88, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff5c7c";
    ctx.fillRect(-r * 0.68, -r * 0.04, r * 1.36, r * 0.44);
    ctx.fillStyle = "#ffe985";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.32, r * 0.74, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Cute cat face emblem
    ctx.fillStyle = "#ffd64f";
    ctx.beginPath();
    ctx.arc(0, r * 0.18, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "duck") {
    ctx.fillStyle = "#ffb81c";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.24, r * 0.66, r * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd64f";
    ctx.beginPath();
    ctx.arc(-r * 0.15, -r * 0.26, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff6b2b";
    ctx.beginPath();
    ctx.ellipse(-r * 0.56, -r * 0.2, r * 0.26, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#161426";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.34, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Diamond ring
    ctx.strokeStyle = "#ffd64f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, r * 0.2, r * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#161426";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.78);
    ctx.lineTo(r * 0.48, -r * 0.34);
    ctx.lineTo(0, r * 0.04);
    ctx.lineTo(-r * 0.48, -r * 0.34);
    ctx.closePath();
    ctx.fillStyle = "#7ef9ff";
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function renderGame(ctx, state, vw, vh) {
  const { player, cam, time } = state;

  ctx.save();
  // Camera shake
  const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
  const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
  ctx.translate(vw / 2 - cam.x + sx, vh / 2 - cam.y + sy);

  // 1. Midnight Living Room Hardwood Floor
  drawLivingRoomFloor(ctx, cam, vw, vh, time);

  // 2. Charging Dock Extraction Pad
  if (state.dock.active) {
    drawChargingDock(ctx, state.dock, time);
  }

  // 3. Cat Paw Warnings (telegraph circles on floor)
  for (const paw of state.catPaws) {
    drawCatPaw(ctx, paw, time);
  }

  // 4. XP Gems & Coins
  for (const g of state.gems) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = g.kind === "coin" ? "#ffd64f" : "#3cf2ff";
    ctx.strokeStyle = "#121325";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (g.kind === "coin") {
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    } else {
      ctx.moveTo(0, -6.5);
      ctx.lineTo(5.5, 0);
      ctx.lineTo(0, 6.5);
      ctx.lineTo(-5.5, 0);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 5. Big Gold Loot Drops & Friend Ghost Drop
  for (const drop of state.lootDrops) {
    drawLootDrop(ctx, drop, time);
  }

  // 6. Enemies
  for (const e of state.enemies) {
    drawEnemy(ctx, e, time);
  }

  // 7. Weapon VFX (under/over player)
  drawWeaponVfx(ctx, state, time);

  // 8. Roomba Protagonist
  drawPlayer(ctx, player, state, time);

  // 9. Particles
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 10. Floating Damage & Loot Texts
  for (const t of state.texts) {
    const a = Math.min(1, (t.life / t.maxLife) * 1.6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `900 ${t.size}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = "#141122";
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }

  ctx.restore();

  // 11. Screen-space offscreen directional indicators (Charging Dock & Big Gold & Ghost Drop)
  drawOffscreenIndicators(ctx, state, vw, vh, time);

  // 12. Subtle Virtual Joystick (mobile / touch / mouse drag)
  if (state.joy.active) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.fillStyle = "rgba(20, 26, 48, 0.25)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(state.joy.ox, state.joy.oy, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(64, 242, 255, 0.58)";
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.joy.cx, state.joy.cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawLivingRoomFloor(ctx, cam, vw, vh) {
  // Base midnight indigo wood floor
  ctx.fillStyle = "#1b1d36";
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);

  // Wood plank stripes
  const plankH = 56;
  const startY = Math.max(0, Math.floor((cam.y - vh / 2) / plankH) * plankH);
  const endY = Math.min(ARENA.height, cam.y + vh / 2 + plankH);
  for (let y = startY; y < endY; y += plankH) {
    const idx = Math.floor(y / plankH);
    ctx.fillStyle = idx % 2 === 0 ? "#202342" : "#1c1f3b";
    ctx.fillRect(0, y, ARENA.width, plankH - 2);
    // Plank joint lines
    ctx.fillStyle = "#14162c";
    ctx.fillRect(0, y + plankH - 2, ARENA.width, 2);
    const offset = (idx % 3) * 140 + 60;
    for (let x = offset; x < ARENA.width; x += 260) {
      ctx.fillRect(x, y, 2, plankH);
    }
  }

  // Cozy Living Room Center Rug (warm burgundy/gold patterned accent like Concept Sheet 03)
  const rx = 250, ry = 420, rw = 680, rh = 720;
  ctx.save();
  ctx.fillStyle = "rgba(118, 36, 58, 0.42)";
  roundRect(ctx, rx, ry, rw, rh, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(245, 179, 66, 0.32)";
  ctx.lineWidth = 6;
  roundRect(ctx, rx + 18, ry + 18, rw - 36, rh - 36, 14);
  ctx.stroke();
  ctx.restore();

  // Sofa silhouette along top & bottom edges (for living room context)
  ctx.fillStyle = "#111328";
  roundRect(ctx, 180, -28, 820, 96, 26);
  ctx.fill();
  ctx.strokeStyle = "#2d335c";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Wall border & soft inner glow
  ctx.strokeStyle = "#3f4a80";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, ARENA.width - 10, ARENA.height - 10);
}

function drawChargingDock(ctx, dock, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  ctx.save();
  ctx.translate(dock.x, dock.y);

  // Soft green vertical beacon aura
  const grad = ctx.createRadialGradient(0, 0, 12, 0, 0, dock.radius * 1.45);
  grad.addColorStop(0, "rgba(57, 255, 136, 0.55)");
  grad.addColorStop(0.65, "rgba(57, 255, 136, 0.16)");
  grad.addColorStop(1, "rgba(57, 255, 136, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, dock.radius * 1.45, 0, Math.PI * 2);
  ctx.fill();

  // Dock physical base ring
  ctx.fillStyle = "#16292e";
  ctx.strokeStyle = "#39ff88";
  ctx.lineWidth = 4 + pulse * 2;
  ctx.beginPath();
  ctx.arc(0, 0, dock.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner charging ring
  ctx.strokeStyle = "rgba(130, 255, 185, 0.7)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, dock.radius * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  // Progress arc when standing inside!
  if (dock.progress > 0) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, dock.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dock.progress);
    ctx.stroke();
  }

  // Label pill
  const label = dock.progress > 0
    ? `⚡ 撤离充能 ${(Math.max(0, 3 - dock.progress * 3)).toFixed(1)}s`
    : "⚡ 充电桩撤离 (站3秒)";
  ctx.font = `800 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  const tw = ctx.measureText(label).width + 20;
  ctx.fillStyle = "rgba(10, 24, 22, 0.88)";
  ctx.strokeStyle = "#39ff88";
  ctx.lineWidth = 2;
  roundRect(ctx, -tw / 2, dock.radius + 10, tw, 24, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#8bffbe";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, dock.radius + 22);

  ctx.restore();
}

function drawLootDrop(ctx, drop, time) {
  const bob = Math.sin(time * 5 + drop.x) * 4;
  const col = drop.isGhost ? "#ff5ce1" : (LOOT_MAP[drop.lootId]?.color || "#ffd54a");

  ctx.save();
  ctx.translate(drop.x, drop.y);

  // Tall radiant vertical light pillar (classic Extraction dopamine!)
  const beamH = drop.rarity === "red" || drop.isGhost ? 175 : drop.rarity === "gold" ? 140 : 100;
  const beamW = drop.rarity === "red" || drop.isGhost ? 38 : 28;
  const g = ctx.createLinearGradient(0, 0, 0, -beamH);
  g.addColorStop(0, col + "cc");
  g.addColorStop(0.5, col + "44");
  g.addColorStop(1, col + "00");
  ctx.fillStyle = g;
  ctx.fillRect(-beamW / 2, -beamH, beamW, beamH);

  // Ground glow ring
  ctx.fillStyle = col + "40";
  ctx.beginPath();
  ctx.ellipse(0, 8, 24, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  if (drop.isGhost) {
    // Glowing friend parcel box
    ctx.fillStyle = "#ff9ce8";
    ctx.strokeStyle = "#191229";
    ctx.lineWidth = 3;
    roundRect(ctx, -18, -18 + bob, 36, 32, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "900 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📦", 0, -2 + bob);
  } else {
    drawLootIcon(ctx, drop.lootId, 0, -4 + bob, 19);
  }

  // Value pill under item
  const text = drop.isGhost
    ? `@${drop.owner}遗产 ¥${drop.value.toLocaleString()}`
    : `${drop.short} ¥${drop.value.toLocaleString()}`;
  ctx.font = `800 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = "rgba(18, 15, 32, 0.9)";
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;
  roundRect(ctx, -w / 2, 16, w, 20, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 26);

  ctx.restore();
}

function drawEnemy(ctx, e, time) {
  const wobble = Math.sin(time * 10 + e.seed) * 0.08;
  ctx.save();
  ctx.translate(e.x, e.y);

  // Soft shadow
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.78, e.r * 0.85, e.r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(1 + wobble, 1 - wobble);
  const flash = e.flash > 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#151226";

  if (e.type === "dust") {
    // Cute fluffy dust-bunny with tiny ears
    ctx.fillStyle = flash ? "#ffffff" : "#968ab8";
    ctx.beginPath();
    ctx.ellipse(-e.r * 0.45, -e.r * 0.85, e.r * 0.26, e.r * 0.52, -0.25, 0, Math.PI * 2);
    ctx.ellipse(e.r * 0.45, -e.r * 0.85, e.r * 0.26, e.r * 0.52, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!flash) {
      // Mischievous glowing yellow eyes
      ctx.fillStyle = "#ffe55c";
      ctx.beginPath();
      ctx.arc(-e.r * 0.32, -2, 3.8, 0, Math.PI * 2);
      ctx.arc(e.r * 0.32, -2, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#151226";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.55, -8);
      ctx.lineTo(-e.r * 0.12, -5);
      ctx.moveTo(e.r * 0.55, -8);
      ctx.lineTo(e.r * 0.12, -5);
      ctx.stroke();
    }
  } else if (e.type === "sock") {
    // Grumpy striped smelly sock monster
    ctx.fillStyle = flash ? "#ffffff" : "#cbe0c3";
    roundRect(ctx, -e.r * 0.68, -e.r * 0.95, e.r * 1.36, e.r * 1.7, 10);
    ctx.fill();
    ctx.stroke();
    if (!flash) {
      ctx.fillStyle = "#7a85b8";
      ctx.fillRect(-e.r * 0.62, -e.r * 0.58, e.r * 1.24, 5);
      ctx.fillRect(-e.r * 0.62, -e.r * 0.28, e.r * 1.24, 5);
      // Grumpy eyes & mouth
      ctx.fillStyle = "#151226";
      ctx.fillRect(-7, 2, 4, 4);
      ctx.fillRect(3, 2, 4, 4);
      ctx.beginPath();
      ctx.arc(0, 13, 5, Math.PI, 0);
      ctx.stroke();
    }
  } else if (e.type === "lego") {
    // Spiky red toy brick mine
    ctx.fillStyle = flash ? "#ffffff" : "#ff4255";
    roundRect(ctx, -e.r * 0.85, -e.r * 0.85, e.r * 1.7, e.r * 1.7, 5);
    ctx.fill();
    ctx.stroke();
    if (!flash) {
      ctx.fillStyle = "#ffd64f";
      ctx.beginPath();
      ctx.arc(-e.r * 0.32, -2, 4.5, 0, Math.PI * 2);
      ctx.arc(e.r * 0.32, -2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (e.type === "mop") {
    // Spinning Mop Boss
    ctx.rotate(Math.sin(time * 7) * 0.18);
    ctx.fillStyle = flash ? "#ffffff" : "#dce6f5";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * e.r * 0.55, Math.sin(a) * e.r * 0.55, e.r * 0.48, e.r * 0.24, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = flash ? "#ffffff" : "#8099ba";
    ctx.beginPath();
    ctx.arc(0, -4, e.r * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!flash) {
      ctx.fillStyle = "#48f7ff";
      ctx.beginPath();
      ctx.arc(-8, -2, 5.5, 0, Math.PI * 2);
      ctx.arc(8, -2, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Boss or damaged mini HP bar
  if (e.type === "mop" || e.hp < e.maxHp) {
    const bw = e.type === "mop" ? 56 : 26;
    const bh = e.type === "mop" ? 7 : 4;
    ctx.fillStyle = "#141122";
    ctx.fillRect(-bw / 2, -e.r - 14, bw, bh);
    ctx.fillStyle = e.type === "mop" ? "#ff477e" : "#ff6b6b";
    ctx.fillRect(-bw / 2 + 1, -e.r - 13, Math.max(0, (bw - 2) * (e.hp / e.maxHp)), bh - 2);
  }

  ctx.restore();
}

function drawCatPaw(ctx, paw) {
  ctx.save();
  ctx.translate(paw.x, paw.y);
  if (paw.phase === "warn") {
    const t = 1 - paw.timer / paw.warnDur;
    ctx.fillStyle = `rgba(255, 76, 118, ${0.14 + t * 0.24})`;
    ctx.strokeStyle = "#ff4c76";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 224, 102, 0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius * t, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffccd7";
    ctx.font = "900 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐾 猫爪预警!", 0, 4);
  } else {
    // Giant cute orange tabby cat paw slam!
    const a = Math.min(1, paw.timer / 0.25);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffaa5c";
    ctx.strokeStyle = "#191224";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Pink toe beans
    ctx.fillStyle = "#ff85b3";
    ctx.beginPath();
    ctx.ellipse(0, 12, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [bx, by] of [[-26, -14], [-9, -24], [10, -24], [26, -14]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawWeaponVfx(ctx, state, time) {
  const { player } = state;

  // Orbiting duct-tape spatulas
  if (player.weapons.spatula > 0) {
    const count = 1 + player.weapons.spatula;
    const rad = 64 + player.weapons.spatula * 6;
    for (let i = 0; i < count; i++) {
      const a = time * 4.4 + (i / count) * Math.PI * 2;
      const sx = player.x + Math.cos(a) * rad;
      const sy = player.y + Math.sin(a) * rad;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = "#dce7f7";
      ctx.strokeStyle = "#161426";
      ctx.lineWidth = 2.5;
      roundRect(ctx, -6, -18, 12, 22, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd64f";
      ctx.fillRect(-3, 4, 6, 12);
      ctx.strokeRect(-3, 4, 6, 12);
      ctx.restore();
    }
  }

  // Active flash VFX (swatter arcs, laser beams, hairdryer cones, tesla chains)
  for (const fx of state.vfx) {
    const a = Math.max(0, fx.life / fx.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    if (fx.type === "swatter") {
      ctx.strokeStyle = "#52f7ff";
      ctx.lineWidth = 9 * a;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r, fx.angle - 1.35, fx.angle + 1.35);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 * a;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * 0.92, fx.angle - 1.15, fx.angle + 1.15);
      ctx.stroke();
    } else if (fx.type === "laser") {
      ctx.strokeStyle = "#ff3b77";
      ctx.lineWidth = 8 * a;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.strokeStyle = "#fff2f7";
      ctx.lineWidth = 3 * a;
      ctx.stroke();
    } else if (fx.type === "hairdryer") {
      ctx.fillStyle = "rgba(255, 168, 76, 0.34)";
      ctx.beginPath();
      ctx.moveTo(fx.x, fx.y);
      ctx.arc(fx.x, fx.y, fx.r, fx.angle - 0.55, fx.angle + 0.55);
      ctx.closePath();
      ctx.fill();
    } else if (fx.type === "tesla") {
      ctx.strokeStyle = "#b399ff";
      ctx.lineWidth = 4.5 * a;
      ctx.beginPath();
      ctx.moveTo(fx.pts[0].x, fx.pts[0].y);
      for (let i = 1; i < fx.pts.length; i++) {
        const prev = fx.pts[i - 1];
        const cur = fx.pts[i];
        const mx = (prev.x + cur.x) / 2 + (Math.random() - 0.5) * 18;
        const my = (prev.y + cur.y) / 2 + (Math.random() - 0.5) * 18;
        ctx.lineTo(mx, my);
        ctx.lineTo(cur.x, cur.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlayer(ctx, p, state, time) {
  const skin = SKIN_MAP[p.skin] || SKIN_MAP.classic;
  ctx.save();
  ctx.translate(p.x, p.y);

  // Cyan suction aura under Roomba
  const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 38);
  aura.addColorStop(0, "rgba(56, 243, 255, 0.32)");
  aura.addColorStop(1, "rgba(56, 243, 255, 0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.fill();

  // Spinning side whisk brushes
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 19, 12);
    ctx.rotate(time * 12 * side);
    ctx.strokeStyle = "#8aa4c8";
    ctx.lineWidth = 2;
    for (let b = 0; b < 3; b++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Main glossy Roomba chassis
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "#141126";
  ctx.fillStyle = p.hurtFlash > 0 ? "#ff6680" : skin.body;
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner bumper rim
  ctx.strokeStyle = skin.rim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, p.r - 5, 0, Math.PI * 2);
  ctx.stroke();

  // Cyber translucent inner circuit detail
  if (p.skin === "cyber") {
    ctx.strokeStyle = "rgba(54, 246, 255, 0.45)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(10, -10);
    ctx.lineTo(10, 8);
    ctx.stroke();
  }

  // Expressive dark visor screen with big glowing eyes that track movement!
  const lookX = Math.cos(p.facing) * 3.2;
  const lookY = Math.sin(p.facing) * 2.5;
  ctx.fillStyle = "#13172b";
  roundRect(ctx, -14, -7, 28, 16, 7);
  ctx.fill();

  ctx.fillStyle = skin.eye;
  ctx.beginPath();
  ctx.arc(-6 + lookX, 1 + lookY, 3.6, 0, Math.PI * 2);
  ctx.arc(6 + lookX, 1 + lookY, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // Cute tiny smile
  ctx.strokeStyle = skin.eye;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(lookX, 3.5 + lookY, 3, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Skin toppers!
  if (p.skin === "classic") {
    // Red & gold lucky charm sticker on top
    ctx.save();
    ctx.translate(0, -14);
    ctx.rotate(-0.18);
    ctx.fillStyle = "#e63946";
    ctx.strokeStyle = "#ffd64f";
    ctx.lineWidth = 1.5;
    roundRect(ctx, -7, -6, 14, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (p.skin === "cat") {
    // Cute cat ears
    ctx.fillStyle = "#ff85c0";
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 8, -19);
      ctx.lineTo(s * 17, -30);
      ctx.lineTo(s * 20, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (p.skin === "gold") {
    // Tiny 24K gold crown
    ctx.fillStyle = "#ffe066";
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-9, -18);
    ctx.lineTo(-10, -28);
    ctx.lineTo(-3, -23);
    ctx.lineTo(0, -30);
    ctx.lineTo(3, -23);
    ctx.lineTo(10, -28);
    ctx.lineTo(9, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Visible mounted Electric Swatter antenna on top when equipped
  if (p.weapons.swatter > 0) {
    ctx.save();
    ctx.rotate(p.facing - 0.5);
    ctx.strokeStyle = "#38f3ff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(25, 0);
    ctx.stroke();
    ctx.fillStyle = "rgba(56, 243, 255, 0.35)";
    ctx.beginPath();
    ctx.ellipse(30, 0, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawOffscreenIndicators(ctx, state, vw, vh) {
  const targets = [];
  if (state.dock.active) {
    targets.push({ x: state.dock.x, y: state.dock.y, color: "#39ff88", label: "⚡撤离" });
  }
  for (const d of state.lootDrops) {
    if (d.isGhost || d.rarity === "gold" || d.rarity === "red" || d.value >= 8800) {
      targets.push({
        x: d.x,
        y: d.y,
        color: d.isGhost ? "#ff5ce1" : "#ffd54a",
        label: d.isGhost ? "📦遗产" : "💎大金",
      });
    }
  }

  const pad = 34;
  for (const t of targets) {
    const sx = t.x - state.cam.x + vw / 2;
    const sy = t.y - state.cam.y + vh / 2;
    if (sx > 24 && sx < vw - 24 && sy > 76 && sy < vh - 24) continue;
    const ang = Math.atan2(sy - vh / 2, sx - vw / 2);
    const rx = vw / 2 - pad;
    const ry = vh / 2 - pad - 24;
    const ix = vw / 2 + Math.cos(ang) * Math.min(rx, Math.abs(rx / (Math.cos(ang) || 0.0001)));
    const iy = Math.max(82, Math.min(vh - 34, vh / 2 + Math.sin(ang) * Math.min(ry, Math.abs(ry / (Math.sin(ang) || 0.0001)))));

    ctx.save();
    ctx.translate(ix, iy);
    ctx.fillStyle = "rgba(16, 18, 34, 0.9)";
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2.2;
    roundRect(ctx, -28, -13, 56, 26, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = t.color;
    ctx.font = "900 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.label, 0, 1);
    ctx.restore();
  }
}

// Generate shareable Supermarket Receipt / Raid Report PNG on an offscreen canvas!
export function renderReceiptPoster({ extracted, value, wave, kills, lootNames, modeLabel, streak, rescuedGhost }) {
  const c = document.createElement("canvas");
  c.width = 540;
  c.height = 720;
  const ctx = c.getContext("2d");

  // Midnight neon backdrop
  ctx.fillStyle = "#121327";
  ctx.fillRect(0, 0, c.width, c.height);

  // Paper receipt card
  ctx.fillStyle = "#faf6ee";
  roundRect(ctx, 36, 36, 468, 648, 18);
  ctx.fill();

  // Top header ribbon
  ctx.fillStyle = extracted ? "#16a34a" : "#e11d48";
  roundRect(ctx, 36, 36, 468, 108, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(extracted ? "✅ 客厅安全撤离 · 摸金小票" : "💥 贪心翻车 · 遗产讣告", 270, 88);
  ctx.font = '700 15px sans-serif';
  ctx.fillText(`半夜扫地机 ROOMBA RAID · ${modeLabel}`, 270, 122);

  // Big Money Value
  ctx.fillStyle = "#181826";
  ctx.font = '700 18px sans-serif';
  ctx.fillText(extracted ? "本局安全带出总估值" : "本局爆光痛失估值（已保底安全箱）", 270, 188);
  ctx.fillStyle = extracted ? "#d97706" : "#e11d48";
  ctx.font = '900 58px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`¥${Math.round(value).toLocaleString()}`, 270, 248);

  // Dashed divider
  ctx.strokeStyle = "#cbd5e1";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 286);
  ctx.lineTo(476, 286);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stats rows
  ctx.textAlign = "left";
  ctx.fillStyle = "#334155";
  ctx.font = '700 19px sans-serif';
  const rows = [
    ["坚持波次", `第 ${wave} 波`],
    ["清理客厅怪潮", `${kills} 只`],
    ["连续撤离连胜", `${streak} 连胜`],
  ];
  rows.forEach(([k, v], i) => {
    const y = 330 + i * 38;
    ctx.fillStyle = "#64748b";
    ctx.fillText(k, 72, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(v, 468, y);
    ctx.textAlign = "left";
  });

  // Loot list
  ctx.fillStyle = "#0f172a";
  ctx.font = '800 18px sans-serif';
  ctx.fillText("摸出大金清单：", 72, 462);
  ctx.font = '700 16px sans-serif';
  ctx.fillStyle = "#b45309";
  const showLoot = lootNames.length ? lootNames.slice(0, 4) : ["（仅吸到散装硬币）"];
  showLoot.forEach((name, i) => {
    ctx.fillText(`• ${name}`, 80, 496 + i * 28);
  });

  if (rescuedGhost) {
    ctx.fillStyle = "#9333ea";
    ctx.font = '800 16px sans-serif';
    ctx.fillText(`📦 顺手舔走群友 @${rescuedGhost} 的遗产！`, 72, 622);
  }

  // Footer CTA
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = '700 14px sans-serif';
  ctx.fillText("点开我的挑战链接，来客厅捡我爆掉的大金！", 270, 662);

  return c.toDataURL("image/png");
}
