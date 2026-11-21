// High-Saturation Commercial 2D Canvas Renderer for Roomba Raid v0.2.0
// Uses 9 studio-grade transparent WebP sprites + Interactive Dust-Cleaning Floor Layer
// + Destructible Props + Vacuum Suction Cone + Ragdoll Knockbacks + Shockwaves + Extraction Vignette

import { ARENA, LOOT_ITEMS } from "./config.mjs";
import { SPRITES } from "./sprites.mjs";

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

// ===== INTERACTIVE DUST-CLEANING LAYER (Satisfaction / ASMR Vacuum Trail!) =====
// Offscreen canvas at 1/2 arena resolution covered with cozy translucent dust & cookie crumbs.
// Driving the Roomba erases dust using destination-out, revealing gleaming clean hardwood!
export function createDustLayer() {
  const scale = 0.5;
  const c = document.createElement("canvas");
  c.width = Math.round(ARENA.width * scale);
  c.height = Math.round(ARENA.height * scale);
  const g = c.getContext("2d");

  // Soft dusty film over the midnight hardwood
  g.fillStyle = "rgba(18, 16, 36, 0.34)";
  g.fillRect(0, 0, c.width, c.height);

  // Scatter cozy dust specks & cookie crumbs across the living room floor
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = 1 + Math.random() * 2.4;
    g.fillStyle = i % 5 === 0 ? "rgba(245, 200, 125, 0.42)" : "rgba(175, 178, 225, 0.24)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, ctx: g, scale };
}

export function cleanDustAt(dustLayer, x, y, radius = 32) {
  if (!dustLayer) return;
  const g = dustLayer.ctx;
  const s = dustLayer.scale;
  g.save();
  g.globalCompositeOperation = "destination-out";
  const grad = g.createRadialGradient(x * s, y * s, radius * s * 0.25, x * s, y * s, radius * s);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x * s, y * s, radius * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function drawLootSprite(ctx, id, x, y, size = 44) {
  const spriteKey = id === "catcan" || id === "duck" ? "catcan" : id === "cash" ? "cash" : id === "ring" ? "ring" : null;
  const sp = spriteKey ? SPRITES[spriteKey] : null;
  if (sp && sp.ready) {
    ctx.drawImage(sp.img, x - size / 2, y - size / 2, size, size);
    return;
  }
  // Fallback crisp vector for earbud / remote
  ctx.save();
  ctx.translate(x, y);
  const r = size * 0.42;
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = "#161426";
  if (id === "earbud") {
    ctx.fillStyle = "#f2f8ff";
    ctx.beginPath();
    ctx.arc(-2, -4, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, -3, 1, r * 0.36, r * 0.72, 4);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.rotate(-0.3);
    ctx.fillStyle = "#3f4b6e";
    roundRect(ctx, -r * 0.44, -r * 0.78, r * 0.88, r * 1.56, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff5370";
    ctx.beginPath();
    ctx.arc(-r * 0.16, -r * 0.48, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5eead4";
    ctx.fillRect(-r * 0.22, r * 0.25, r * 0.44, r * 0.16);
  }
  ctx.restore();
}

export function renderGame(ctx, state, vw, vh) {
  const { player, cam, time } = state;

  ctx.save();
  // Camera shake
  const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 16 : 0;
  const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 16 : 0;
  ctx.translate(vw / 2 - cam.x + sx, vh / 2 - cam.y + sy);

  // 1. Gleaming Midnight Living Room Hardwood Floor + Rug + Furniture
  drawLivingRoomFloor(ctx, cam, vw, vh);

  // 2. Interactive Dust Layer (erased wherever Roomba vacuums!)
  if (state.dustLayer) {
    ctx.drawImage(state.dustLayer.canvas, 0, 0, ARENA.width, ARENA.height);
  }

  // 3. Charging Dock Extraction Pad
  if (state.dock.active) {
    drawChargingDock(ctx, state.dock, time);
  }

  // 4. Cat Paw Telegraph & Slam
  for (const paw of state.catPaws) {
    drawCatPaw(ctx, paw);
  }

  // 5. Destructible Living Room Props (Cardboard boxes / snack bags)
  for (const prop of state.props) {
    drawProp(ctx, prop);
  }

  // 6. Shaking Mystery Loot Crates (Unopened Big Gold!)
  for (const crate of state.crates) {
    drawMysteryCrate(ctx, crate, time);
  }

  // 7. XP Gems & Coins
  for (const g of state.gems) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = g.kind === "coin" ? "#ffd64f" : "#3cf2ff";
    ctx.strokeStyle = "#121325";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (g.kind === "coin") {
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
    } else {
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6, 0);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 8. Big Gold Loot Drops & Friend Ghost Drop
  for (const drop of state.lootDrops) {
    drawLootDrop(ctx, drop, time);
  }

  // 9. Knocked-back Flying Enemy Ragdolls (Juicy death send-off!)
  for (const rag of state.ragdolls) {
    const a = Math.max(0, rag.life / rag.maxLife);
    const sp = SPRITES[rag.type];
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(rag.x, rag.y);
    ctx.rotate(rag.rot);
    const sz = rag.r * 2.5 * (0.6 + 0.4 * a);
    if (sp && sp.ready) {
      ctx.drawImage(sp.img, -sz / 2, -sz / 2, sz, sz);
    }
    ctx.restore();
  }

  // 10. Living Enemies (Real Studio Sprites + Solid White Hit Flash!)
  for (const e of state.enemies) {
    drawEnemy(ctx, e, time);
  }

  // 11. Shockwave Rings & Weapon VFX
  drawWeaponVfx(ctx, state, time);

  // 12. Roomba Protagonist (Real Studio Sprite + Suction Cone + Skin Mods)
  drawPlayer(ctx, player, state, time);

  // 13. Star & Spark Particles
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    if (p.star) {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 8);
      const r = p.size * (0.5 + 0.6 * a);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.moveTo(0, -r * 1.4);
        ctx.lineTo(r * 0.4, -r * 0.4);
        ctx.lineTo(r * 1.4, 0);
      }
      ctx.fill();
    } else {
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 14. Bold Stroked Floating Damage & Loot Texts
  for (const t of state.texts) {
    const a = Math.min(1, (t.life / t.maxLife) * 1.7);
    const pop = t.life > t.maxLife * 0.8 ? 1.22 : 1.0;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(t.x, t.y);
    ctx.scale(pop, pop);
    ctx.font = `900 ${t.size}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#141122";
    ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();

  // 15. Screen-space Urgent Extraction Red/Cyan Vignette Pulse!
  if (state.dock.active || state.player.overdrive > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    const col = state.player.overdrive > 0
      ? `rgba(56, 243, 255, ${0.18 + pulse * 0.14})`
      : `rgba(255, 56, 108, ${0.14 + pulse * 0.18})`;
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.28, vw / 2, vh / 2, vh * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, col);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
  }

  // 16. Offscreen Directional Beacons (Charging Dock / Mystery Crates / Big Gold / Ghost Drop)
  drawOffscreenIndicators(ctx, state, vw, vh);

  // 17. Subtle Virtual Joystick
  if (state.joy.active) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.fillStyle = "rgba(20, 26, 48, 0.28)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(state.joy.ox, state.joy.oy, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(64, 242, 255, 0.65)";
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.joy.cx, state.joy.cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawLivingRoomFloor(ctx, cam, vw, vh) {
  // Polished warm-indigo midnight hardwood underneath dust layer
  ctx.fillStyle = "#24284a";
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);

  const plankH = 56;
  const startY = Math.max(0, Math.floor((cam.y - vh / 2) / plankH) * plankH);
  const endY = Math.min(ARENA.height, cam.y + vh / 2 + plankH);
  for (let y = startY; y < endY; y += plankH) {
    const idx = Math.floor(y / plankH);
    ctx.fillStyle = idx % 2 === 0 ? "#2a2f57" : "#24284c";
    ctx.fillRect(0, y, ARENA.width, plankH - 2);
    // Subtle wood sheen highlight
    ctx.fillStyle = "rgba(130, 175, 255, 0.04)";
    ctx.fillRect(0, y + 4, ARENA.width, 10);
    ctx.fillStyle = "#161830";
    ctx.fillRect(0, y + plankH - 2, ARENA.width, 2);
    const offset = (idx % 3) * 140 + 60;
    for (let x = offset; x < ARENA.width; x += 260) {
      ctx.fillRect(x, y, 2, plankH);
    }
  }

  // Cozy Living Room Center Rug (Burgundy & Gold Persian border like Sheet 03)
  const rx = 240, ry = 410, rw = 700, rh = 740;
  ctx.save();
  ctx.fillStyle = "rgba(148, 42, 68, 0.56)";
  roundRect(ctx, rx, ry, rw, rh, 24);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 198, 78, 0.48)";
  ctx.lineWidth = 6;
  roundRect(ctx, rx + 18, ry + 18, rw - 36, rh - 36, 16);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 198, 78, 0.22)";
  ctx.lineWidth = 2;
  roundRect(ctx, rx + 34, ry + 34, rw - 68, rh - 68, 10);
  ctx.stroke();
  ctx.restore();

  // Top Sofa & Coffee Table edge silhouettes for strong living-room storytelling
  ctx.fillStyle = "#151833";
  roundRect(ctx, 180, -24, 820, 94, 28);
  ctx.fill();
  ctx.strokeStyle = "#3b4375";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Wall border
  ctx.strokeStyle = "#485491";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, ARENA.width - 10, ARENA.height - 10);
}

function drawProp(ctx, prop) {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.rot);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  roundRect(ctx, -17, -11, 36, 30, 6);
  ctx.fill();
  ctx.fillStyle = prop.flash > 0 ? "#ffffff" : prop.kind === "snack" ? "#ff7b54" : "#c58f55";
  ctx.strokeStyle = "#151226";
  ctx.lineWidth = 3;
  roundRect(ctx, -18, -15, 36, 30, 6);
  ctx.fill();
  ctx.stroke();
  if (prop.flash <= 0) {
    ctx.strokeStyle = prop.kind === "snack" ? "#ffe066" : "#8c5c2d";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMysteryCrate(ctx, crate, time) {
  const opening = crate.progress > 0;
  const shake = opening ? (Math.random() - 0.5) * (3 + crate.progress * 10) : 0;
  const pulse = 0.5 + 0.5 * Math.sin(time * 6 + crate.x);

  ctx.save();
  ctx.translate(crate.x + shake, crate.y + shake);

  // Radiant golden mystery pillar
  const g = ctx.createLinearGradient(0, 0, 0, -115);
  g.addColorStop(0, "rgba(255, 213, 74, 0.72)");
  g.addColorStop(1, "rgba(255, 213, 74, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(-20, -115, 40, 115);

  // Ground glow ring
  ctx.strokeStyle = `rgba(255, 213, 74, ${0.45 + pulse * 0.45})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 4, 34 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();

  const sp = SPRITES.crate;
  const sz = 54 * (opening ? 1 + crate.progress * 0.18 : 1);
  if (sp && sp.ready) {
    ctx.drawImage(sp.img, -sz / 2, -sz / 2, sz, sz);
  }

  // Opening radial charge ring!
  if (opening) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * crate.progress);
    ctx.stroke();
  }

  ctx.font = '900 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const label = opening ? "✨ 正在吸开金箱..." : "📦 沙发缝金箱 (靠近开启)";
  const w = ctx.measureText(label).width + 14;
  ctx.fillStyle = "rgba(24, 18, 10, 0.9)";
  ctx.strokeStyle = "#ffd54a";
  ctx.lineWidth = 1.8;
  roundRect(ctx, -w / 2, 24, w, 20, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffe58f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 34);

  ctx.restore();
}

function drawChargingDock(ctx, dock, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 8);
  ctx.save();
  ctx.translate(dock.x, dock.y);

  const grad = ctx.createRadialGradient(0, 0, 12, 0, 0, dock.radius * 1.6);
  grad.addColorStop(0, "rgba(57, 255, 136, 0.65)");
  grad.addColorStop(0.65, "rgba(57, 255, 136, 0.2)");
  grad.addColorStop(1, "rgba(57, 255, 136, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, dock.radius * 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#112b28";
  ctx.strokeStyle = "#39ff88";
  ctx.lineWidth = 4.5 + pulse * 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, dock.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (dock.progress > 0) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, dock.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dock.progress);
    ctx.stroke();
  }

  const label = dock.progress > 0
    ? `⚡ 死守撤离 ${(Math.max(0, 3 - dock.progress * 3)).toFixed(1)}s`
    : "⚡ 充电桩撤离 (站3秒)";
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const tw = ctx.measureText(label).width + 20;
  ctx.fillStyle = "rgba(8, 24, 20, 0.92)";
  ctx.strokeStyle = "#39ff88";
  ctx.lineWidth = 2.2;
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
  const bob = Math.sin(time * 6 + drop.x) * 5;
  const col = drop.isGhost ? "#ff5ce1" : (LOOT_MAP[drop.lootId]?.color || "#ffd54a");

  ctx.save();
  ctx.translate(drop.x, drop.y);

  // Tall radiant vertical light pillar
  const beamH = drop.rarity === "red" || drop.isGhost ? 190 : drop.rarity === "gold" ? 155 : 110;
  const beamW = drop.rarity === "red" || drop.isGhost ? 44 : 32;
  const g = ctx.createLinearGradient(0, 0, 0, -beamH);
  g.addColorStop(0, col + "dd");
  g.addColorStop(0.5, col + "48");
  g.addColorStop(1, col + "00");
  ctx.fillStyle = g;
  ctx.fillRect(-beamW / 2, -beamH, beamW, beamH);

  ctx.fillStyle = col + "44";
  ctx.beginPath();
  ctx.ellipse(0, 10, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (drop.isGhost) {
    const sp = SPRITES.crate;
    if (sp && sp.ready) ctx.drawImage(sp.img, -24, -26 + bob, 48, 48);
  } else {
    drawLootSprite(ctx, drop.lootId, 0, -4 + bob, 46);
  }

  const text = drop.isGhost
    ? `📦@${drop.owner}遗产 ¥${drop.value.toLocaleString()}`
    : `${drop.short} ¥${drop.value.toLocaleString()}`;
  ctx.font = '900 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = "rgba(18, 15, 32, 0.92)";
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, 18, w, 21, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 29);

  ctx.restore();
}

function drawEnemy(ctx, e, time) {
  const wobble = Math.sin(time * 12 + e.seed) * 0.09;
  const sp = SPRITES[e.type];

  ctx.save();
  ctx.translate(e.x, e.y);

  // Ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.8, e.r * 0.9, e.r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  // Red rage aura when extraction dock is active!
  if (e.enraged) {
    ctx.strokeStyle = "rgba(255, 66, 104, 0.65)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.12, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.scale((e.vx < -8 ? -1 : 1) * (1 + wobble), 1 - wobble);

  const drawSize = e.type === "mop" ? e.r * 2.75 : e.r * 2.55;
  if (sp && sp.ready) {
    const img = e.flash > 0 && sp.white ? sp.white : sp.img;
    ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  } else {
    ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#968ab8";
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // HP bar for Boss or damaged enemies
  if (e.type === "mop" || e.hp < e.maxHp) {
    const bw = e.type === "mop" ? 64 : 28;
    const bh = e.type === "mop" ? 8 : 4;
    ctx.fillStyle = "#141122";
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 18, bw, bh);
    ctx.fillStyle = e.type === "mop" ? "#ff477e" : "#ff6b6b";
    ctx.fillRect(e.x - bw / 2 + 1, e.y - e.r - 17, Math.max(0, (bw - 2) * (e.hp / e.maxHp)), bh - 2);
  }
}

function drawCatPaw(ctx, paw) {
  ctx.save();
  ctx.translate(paw.x, paw.y);
  if (paw.phase === "warn") {
    const t = 1 - paw.timer / paw.warnDur;
    ctx.fillStyle = `rgba(255, 76, 118, ${0.15 + t * 0.28})`;
    ctx.strokeStyle = "#ff4c76";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 224, 102, 0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius * t, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffccd7";
    ctx.font = "900 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐾 猫主子拍击!", 0, 4);
  } else {
    const a = Math.min(1, paw.timer / 0.25);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffaa5c";
    ctx.strokeStyle = "#191224";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
    const rad = 68 + player.weapons.spatula * 7;
    for (let i = 0; i < count; i++) {
      const a = time * 4.8 + (i / count) * Math.PI * 2;
      const sx = player.x + Math.cos(a) * rad;
      const sy = player.y + Math.sin(a) * rad;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = "#e2ecfc";
      ctx.strokeStyle = "#161426";
      ctx.lineWidth = 2.6;
      roundRect(ctx, -7, -20, 14, 24, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd64f";
      ctx.fillRect(-3.5, 4, 7, 13);
      ctx.strokeRect(-3.5, 4, 7, 13);
      ctx.restore();
    }
  }

  for (const fx of state.vfx) {
    const a = Math.max(0, fx.life / fx.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    if (fx.type === "ring") {
      const r = fx.r0 + (fx.r1 - fx.r0) * (1 - a);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = (fx.width || 6) * a;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.type === "swatter") {
      ctx.strokeStyle = "#38f3ff";
      ctx.lineWidth = 12 * a;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r, fx.startA, fx.endA);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4 * a;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * 0.92, fx.startA, fx.endA);
      ctx.stroke();
    } else if (fx.type === "laser") {
      ctx.strokeStyle = "#ff2e6d";
      ctx.lineWidth = 10 * a;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3.5 * a;
      ctx.stroke();
    } else if (fx.type === "hairdryer") {
      ctx.fillStyle = "rgba(255, 168, 76, 0.38)";
      ctx.beginPath();
      ctx.moveTo(fx.x, fx.y);
      ctx.arc(fx.x, fx.y, fx.r, fx.angle - 0.6, fx.angle + 0.6);
      ctx.closePath();
      ctx.fill();
    } else if (fx.type === "tesla") {
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 6 * a;
      ctx.beginPath();
      ctx.moveTo(fx.pts[0].x, fx.pts[0].y);
      for (let i = 1; i < fx.pts.length; i++) {
        const prev = fx.pts[i - 1];
        const cur = fx.pts[i];
        const mx = (prev.x + cur.x) / 2 + (Math.random() - 0.5) * 20;
        const my = (prev.y + cur.y) / 2 + (Math.random() - 0.5) * 20;
        ctx.lineTo(mx, my);
        ctx.lineTo(cur.x, cur.y);
      }
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * a;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlayer(ctx, p, state, time) {
  ctx.save();
  ctx.translate(p.x, p.y);

  // 1. Live Vacuum Suction Cone Vortex in front of Roomba!
  ctx.save();
  ctx.rotate(p.facing);
  const vg = ctx.createRadialGradient(18, 0, 4, 58, 0, 82);
  vg.addColorStop(0, p.overdrive > 0 ? "rgba(255, 213, 74, 0.42)" : "rgba(56, 243, 255, 0.28)");
  vg.addColorStop(1, "rgba(56, 243, 255, 0)");
  ctx.fillStyle = vg;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.arc(10, 0, 96, -0.52, 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Overdrive Turbo Aura
  if (p.overdrive > 0) {
    ctx.strokeStyle = "#ffd54a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 12 + Math.sin(time * 24) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. Soft drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 28, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4. Studio-Grade Hero Roomba Sprite!
  const bob = Math.sin(time * 14) * 1.5;
  const sp = SPRITES.hero;
  const sz = 66;
  ctx.save();
  ctx.translate(0, bob);
  if (p.skin === "cyber") ctx.filter = "hue-rotate(155deg) saturate(1.8) brightness(1.05)";
  else if (p.skin === "cat") ctx.filter = "hue-rotate(285deg) saturate(1.45)";
  else if (p.skin === "gold") ctx.filter = "sepia(0.95) saturate(3.2) hue-rotate(-8deg) brightness(1.08)";

  if (sp && sp.ready) {
    const img = p.hurtFlash > 0 && sp.white ? sp.white : sp.img;
    ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
  }
  ctx.filter = "none";

  // Skin Toppers (Crown for Gold, Cat Ears for Cat)
  if (p.skin === "gold") {
    ctx.fillStyle = "#ffe066";
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-10, -24);
    ctx.lineTo(-12, -35);
    ctx.lineTo(-4, -29);
    ctx.lineTo(0, -37);
    ctx.lineTo(4, -29);
    ctx.lineTo(12, -35);
    ctx.lineTo(10, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (p.skin === "cat") {
    ctx.fillStyle = "#ff85c0";
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 9, -22);
      ctx.lineTo(s * 19, -35);
      ctx.lineTo(s * 22, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();
}

function drawOffscreenIndicators(ctx, state, vw, vh) {
  const targets = [];
  if (state.dock.active) {
    targets.push({ x: state.dock.x, y: state.dock.y, color: "#39ff88", label: "⚡撤离" });
  }
  for (const c of state.crates) {
    targets.push({ x: c.x, y: c.y, color: "#ffd54a", label: "📦金箱" });
  }
  for (const d of state.lootDrops) {
    targets.push({
      x: d.x,
      y: d.y,
      color: d.isGhost ? "#ff5ce1" : "#ffd54a",
      label: d.isGhost ? "📦遗产" : "💎大金",
    });
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
    ctx.fillStyle = "rgba(16, 18, 34, 0.92)";
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

export function renderReceiptPoster({ extracted, value, wave, kills, lootNames, modeLabel, streak, rescuedGhost }) {
  const c = document.createElement("canvas");
  c.width = 540;
  c.height = 720;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#121327";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#faf6ee";
  roundRect(ctx, 36, 36, 468, 648, 18);
  ctx.fill();

  ctx.fillStyle = extracted ? "#16a34a" : "#e11d48";
  roundRect(ctx, 36, 36, 468, 108, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(extracted ? "✅ 客厅安全撤离 · 摸金小票" : "💥 贪心翻车 · 遗产讣告", 270, 88);
  ctx.font = '700 15px sans-serif';
  ctx.fillText(`半夜扫地机 ROOMBA RAID · ${modeLabel}`, 270, 122);

  ctx.fillStyle = "#181826";
  ctx.font = '700 18px sans-serif';
  ctx.fillText(extracted ? "本局安全带出总估值" : "本局爆光痛失估值（已保底安全箱）", 270, 188);
  ctx.fillStyle = extracted ? "#d97706" : "#e11d48";
  ctx.font = '900 58px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`¥${Math.round(value).toLocaleString()}`, 270, 248);

  ctx.strokeStyle = "#cbd5e1";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 286);
  ctx.lineTo(476, 286);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = "left";
  ctx.font = '700 19px sans-serif';
  [
    ["坚持波次", `第 ${wave} 波`],
    ["清理客厅怪潮", `${kills} 只`],
    ["连续撤离连胜", `${streak} 连胜`],
  ].forEach(([k, v], i) => {
    const y = 330 + i * 38;
    ctx.fillStyle = "#64748b";
    ctx.fillText(k, 72, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(v, 468, y);
    ctx.textAlign = "left";
  });

  ctx.fillStyle = "#0f172a";
  ctx.font = '800 18px sans-serif';
  ctx.fillText("摸出大金清单：", 72, 462);
  ctx.font = '700 16px sans-serif';
  ctx.fillStyle = "#b45309";
  (lootNames.length ? lootNames.slice(0, 4) : ["（仅吸到散装硬币）"]).forEach((name, i) => {
    ctx.fillText(`• ${name}`, 80, 496 + i * 28);
  });

  if (rescuedGhost) {
    ctx.fillStyle = "#9333ea";
    ctx.font = '800 16px sans-serif';
    ctx.fillText(`📦 顺手舔走群友 @${rescuedGhost} 的遗产！`, 72, 622);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = '700 14px sans-serif';
  ctx.fillText("点开我的挑战链接，来客厅捡我爆掉的大金！", 270, 662);

  return c.toDataURL("image/png");
}
