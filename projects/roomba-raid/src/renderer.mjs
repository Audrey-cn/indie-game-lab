// High-Saturation Commercial 2D Canvas Renderer for Roomba Raid v0.3.0
// L-Shaped Living Room + Solid Cover Furniture + Semi-Transparent Hidden Zones (Under Tables/Desk)
// + Native Furniture Search Spots + Real Cat Paw Slam & Cartoon Poop + Boss Telegraphs + Shock Traps

import { LOOT_ITEMS } from "./config.mjs";
import { HIDDEN_ZONES, OBSTACLES, ROOM } from "./room-layout.mjs";
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

export function createDustLayer() {
  const scale = 0.5;
  const c = document.createElement("canvas");
  c.width = Math.round(ROOM.width * scale);
  c.height = Math.round(ROOM.height * scale);
  const g = c.getContext("2d");

  g.fillStyle = "rgba(18, 16, 36, 0.36)";
  g.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 820; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = 1 + Math.random() * 2.5;
    g.fillStyle = i % 5 === 0 ? "rgba(245, 200, 125, 0.44)" : "rgba(175, 178, 225, 0.25)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, ctx: g, scale };
}

export function cleanDustAt(dustLayer, x, y, radius = 36) {
  if (!dustLayer) return;
  const g = dustLayer.ctx;
  const s = dustLayer.scale;
  g.save();
  g.globalCompositeOperation = "destination-out";
  const grad = g.createRadialGradient(x * s, y * s, radius * s * 0.28, x * s, y * s, radius * s);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x * s, y * s, radius * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function smearPoopAt(dustLayer, x, y, radius = 26) {
  if (!dustLayer) return;
  const g = dustLayer.ctx;
  const s = dustLayer.scale;
  g.save();
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(112, 68, 32, 0.65)";
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
  const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 16 : 0;
  const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 16 : 0;
  ctx.translate(vw / 2 - cam.x + sx, vh / 2 - cam.y + sy);

  // 1. L-Shaped Midnight Living Room Floor + Rug
  drawLivingRoomFloor(ctx, cam, vw, vh);

  // 2. Interactive Dust-Cleaning Layer
  if (state.dustLayer) {
    ctx.drawImage(state.dustLayer.canvas, 0, 0, ROOM.width, ROOM.height);
  }

  // 3. Solid Cover Furniture Obstacles
  drawSolidFurniture(ctx);

  // 4. Interactive Power-Strip Shock Traps
  for (const strip of state.shockStrips) {
    drawShockStrip(ctx, strip, time);
  }

  // 5. Charging Dock Extraction Pad
  if (state.dock.active) {
    drawChargingDock(ctx, state.dock, time);
  }

  // 6. Native Furniture Search Spots (Sofa cracks, under tables, TV console)
  for (const spot of state.nativeSpots) {
    if (!spot.searched) drawNativeSpot(ctx, spot, time);
  }

  // 7. Destructible Living Room Props
  for (const prop of state.props) {
    drawProp(ctx, prop);
  }

  // 8. Pet Poop Hazards (Roomba Nightmare!)
  for (const poop of state.poops) {
    drawPoop(ctx, poop, time);
  }

  // 9. Boss/Elite Mystery Gold Crates
  for (const crate of state.crates) {
    drawMysteryCrate(ctx, crate, time);
  }

  // 10. XP Gems & Coins & Rare Gold Cores
  for (const g of state.gems) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = g.kind === "core" ? "#38f3ff" : g.kind === "coin" ? "#ffd64f" : "#60f5ff";
    ctx.strokeStyle = "#121325";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (g.kind === "core") {
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "900 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💎", 0, 1);
    } else if (g.kind === "coin") {
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 11. Loose Big Gold / Friend Ghost Drops
  for (const drop of state.lootDrops) {
    drawLootDrop(ctx, drop, time);
  }

  // 12. Knocked-Back Flying Ragdolls
  for (const rag of state.ragdolls) {
    const a = Math.max(0, rag.life / rag.maxLife);
    const sp = SPRITES[rag.type];
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(rag.x, rag.y);
    ctx.rotate(rag.rot);
    const sz = rag.r * 2.5 * (0.6 + 0.4 * a);
    if (sp && sp.ready) ctx.drawImage(sp.img, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }

  // 13. Enemies (including Boss red charge telegraph line & stun stars!)
  for (const e of state.enemies) {
    drawEnemy(ctx, e, time);
  }

  // 14. Enemy Projectiles (Boss water drops & Sock poison bubbles — blocked by furniture!)
  for (const b of state.enemyBullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = b.color;
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(-b.r * 0.3, -b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 15. Weapon VFX & Shockwaves
  drawWeaponVfx(ctx, state, time);

  // 16. Roomba Protagonist
  drawPlayer(ctx, player, state, time);

  // 17. Semi-Transparent Overhead Hidden Zones (Tables/Desk — fade when Roomba ducks underneath!)
  drawHiddenZoneTops(ctx, state);

  // 18. Giant Tabby Cat Paw Slams (Rendered OVER furniture & player for true overhead impact!)
  for (const paw of state.catPaws) {
    drawCatPaw(ctx, paw);
  }

  // 19. Star & Spark Particles
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

  // 20. Floating Stroked Damage & Loot Texts
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

  // 21. Screen-space Vignettes (Urgent Extraction / Overdrive / Fever / Poop Slow)
  if (state.dock.active || state.player.overdrive > 0 || state.fever > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    const col = state.player.overdrive > 0
      ? `rgba(56, 243, 255, ${0.18 + pulse * 0.14})`
      : state.fever > 0
        ? `rgba(255, 213, 74, ${0.14 + pulse * 0.14})`
        : `rgba(255, 56, 108, ${0.14 + pulse * 0.18})`;
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.28, vw / 2, vh / 2, vh * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, col);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
  }

  // 22. Offscreen Directional Beacons
  drawOffscreenIndicators(ctx, state, vw, vh);

  // 23. Subtle Virtual Joystick
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
  // Base midnight hardwood
  ctx.fillStyle = "#24284a";
  ctx.fillRect(0, 0, ROOM.width, ROOM.height);

  const plankH = 56;
  const startY = Math.max(0, Math.floor((cam.y - vh / 2) / plankH) * plankH);
  const endY = Math.min(ROOM.height, cam.y + vh / 2 + plankH);
  for (let y = startY; y < endY; y += plankH) {
    const idx = Math.floor(y / plankH);
    ctx.fillStyle = idx % 2 === 0 ? "#2a2f57" : "#24284c";
    ctx.fillRect(0, y, ROOM.width, plankH - 2);
    ctx.fillStyle = "rgba(130, 175, 255, 0.04)";
    ctx.fillRect(0, y + 4, ROOM.width, 10);
    ctx.fillStyle = "#161830";
    ctx.fillRect(0, y + plankH - 2, ROOM.width, 2);
    const offset = (idx % 3) * 140 + 60;
    for (let x = offset; x < ROOM.width; x += 260) {
      ctx.fillRect(x, y, 2, plankH);
    }
  }

  // Cozy Persian Center Rug under Coffee Table
  ctx.save();
  ctx.fillStyle = "rgba(148, 42, 68, 0.54)";
  roundRect(ctx, 290, 520, 540, 500, 24);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 198, 78, 0.45)";
  ctx.lineWidth = 6;
  roundRect(ctx, 308, 538, 504, 464, 16);
  ctx.stroke();
  ctx.restore();

  // Hallway tiled mat in lower-right wing
  ctx.save();
  ctx.fillStyle = "rgba(56, 98, 128, 0.35)";
  roundRect(ctx, 1060, 620, 220, 480, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.25)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Irregular L-shaped top-right wall cutout (Blocked kitchen/bathroom partition)
  const c = ROOM.cutout;
  ctx.fillStyle = "#0e1022";
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = "#485491";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(5, 5);
  ctx.lineTo(c.x, 5);
  ctx.lineTo(c.x, c.h);
  ctx.lineTo(ROOM.width - 5, c.h);
  ctx.lineTo(ROOM.width - 5, ROOM.height - 5);
  ctx.lineTo(5, ROOM.height - 5);
  ctx.closePath();
  ctx.stroke();
}

function drawSolidFurniture(ctx) {
  for (const ob of OBSTACLES) {
    ctx.save();
    // Drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.44)";
    roundRect(ctx, ob.x + 8, ob.y + 12, ob.w, ob.h, 16);
    ctx.fill();

    // Main furniture body
    ctx.fillStyle = ob.color;
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 4;
    roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 16);
    ctx.fill();
    ctx.stroke();

    // Top bevel & cushions detail
    ctx.strokeStyle = ob.trim;
    ctx.lineWidth = 3;
    roundRect(ctx, ob.x + 8, ob.y + 8, ob.w - 16, ob.h - 16, 10);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = '800 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`🧱 ${ob.label}（掩体）`, ob.x + ob.w / 2, ob.y + ob.h / 2);
    ctx.restore();
  }
}

function drawHiddenZoneTops(ctx, state) {
  const p = state.player;
  for (const hz of HIDDEN_ZONES) {
    const inside =
      p.x + p.r > hz.x && p.x - p.r < hz.x + hz.w && p.y + p.r > hz.y && p.y - p.r < hz.y + hz.h;
    const targetAlpha = inside ? 0.24 : 0.92;
    hz.alpha = (hz.alpha ?? 0.92) + (targetAlpha - (hz.alpha ?? 0.92)) * 0.16;

    ctx.save();
    ctx.globalAlpha = hz.alpha;
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    roundRect(ctx, hz.x + 10, hz.y + 14, hz.w, hz.h, 16);
    ctx.fill();

    ctx.fillStyle = hz.color;
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 4;
    roundRect(ctx, hz.x, hz.y, hz.w, hz.h, 16);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = hz.trim;
    ctx.lineWidth = 3;
    roundRect(ctx, hz.x + 10, hz.y + 10, hz.w - 20, hz.h - 20, 10);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,235,190,0.85)";
    ctx.font = '900 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(inside ? `👁️ ${hz.label}（已钻入）` : `🕳️ ${hz.label}（可钻底探索）`, hz.x + hz.w / 2, hz.y + hz.h / 2);
    ctx.restore();
  }
}

function drawShockStrip(ctx, strip, time) {
  const ready = strip.cd <= 0;
  const pulse = 0.5 + 0.5 * Math.sin(time * 9);
  ctx.save();
  ctx.translate(strip.x, strip.y);
  ctx.fillStyle = ready ? "#e2ecff" : "#565d78";
  ctx.strokeStyle = ready ? "#38f3ff" : "#1f2338";
  ctx.lineWidth = ready ? 3 + pulse * 1.5 : 2;
  roundRect(ctx, -28, -11, 56, 22, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = ready ? "#0f172a" : "#2e344d";
  for (const sx of [-14, 0, 14]) {
    ctx.fillRect(sx - 3, -4, 6, 8);
  }
  if (ready) {
    ctx.font = "900 10px sans-serif";
    ctx.fillStyle = "#7ef9ff";
    ctx.textAlign = "center";
    ctx.fillText("⚡漏电陷阱", 0, -18);
  }
  ctx.restore();
}

function drawNativeSpot(ctx, spot, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6 + spot.x);
  ctx.save();
  ctx.translate(spot.x, spot.y);

  // Subtle glowing seam ring
  ctx.strokeStyle = `rgba(255, 213, 74, ${0.42 + pulse * 0.45})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 26 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();

  // Twinkling star glint
  ctx.fillStyle = "#ffe58f";
  ctx.font = "900 18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✨", 0, 0);

  if (spot.progress > 0) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * spot.progress);
    ctx.stroke();
  }

  const label = spot.progress > 0 ? "🔍 正在掏宝..." : `🔍 ${spot.label}`;
  ctx.font = '900 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const w = ctx.measureText(label).width + 12;
  ctx.fillStyle = "rgba(22, 16, 10, 0.88)";
  ctx.strokeStyle = "#ffd54a";
  ctx.lineWidth = 1.6;
  roundRect(ctx, -w / 2, 18, w, 19, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffe58f";
  ctx.fillText(label, 0, 28);
  ctx.restore();
}

function drawPoop(ctx, poop, time) {
  const wobble = Math.sin(time * 5 + poop.x) * 0.06;
  ctx.save();
  ctx.translate(poop.x, poop.y);

  // Danger caution aura
  ctx.strokeStyle = "rgba(180, 120, 50, 0.55)";
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 2, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.scale(1 + wobble, 1 - wobble);
  const sp = SPRITES.poop;
  if (sp && sp.ready) {
    const img = poop.flash > 0 && sp.white ? sp.white : sp.img;
    ctx.drawImage(img, -23, -25, 46, 46);
  }
  ctx.restore();
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
  ctx.restore();
}

function drawMysteryCrate(ctx, crate, time) {
  const opening = crate.progress > 0;
  const shake = opening ? (Math.random() - 0.5) * (3 + crate.progress * 10) : 0;
  ctx.save();
  ctx.translate(crate.x + shake, crate.y + shake);

  const g = ctx.createLinearGradient(0, 0, 0, -130);
  g.addColorStop(0, "rgba(255, 213, 74, 0.8)");
  g.addColorStop(1, "rgba(255, 213, 74, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(-22, -130, 44, 130);

  const sp = SPRITES.crate;
  const sz = 58 * (opening ? 1 + crate.progress * 0.2 : 1);
  if (sp && sp.ready) ctx.drawImage(sp.img, -sz / 2, -sz / 2, sz, sz);

  if (opening) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * crate.progress);
    ctx.stroke();
  }
  ctx.font = '900 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const label = "👑 Boss 超级金箱！";
  const w = ctx.measureText(label).width + 14;
  ctx.fillStyle = "rgba(28, 16, 8, 0.92)";
  ctx.strokeStyle = "#ffd54a";
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, 26, w, 20, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffe58f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 36);
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
    : "⚡ 充电桩已解锁 (站3秒撤离)";
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
  const beamH = drop.rarity === "red" || drop.isGhost ? 190 : 140;
  const g = ctx.createLinearGradient(0, 0, 0, -beamH);
  g.addColorStop(0, col + "dd");
  g.addColorStop(1, col + "00");
  ctx.fillStyle = g;
  ctx.fillRect(-20, -beamH, 40, beamH);

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
  // Boss Red-Line Charge Telegraph!
  if (e.type === "mop" && e.aiState === "windup") {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 56, 108, 0.85)";
    ctx.setLineDash([12, 8]);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.chargeAng) * 420, e.y + Math.sin(e.chargeAng) * 420);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const wobble = e.stun > 0 ? 0 : Math.sin(time * 12 + e.seed) * 0.09;
  const sp = SPRITES[e.type];

  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.8, e.r * 0.9, e.r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  if (e.enraged) {
    ctx.strokeStyle = "rgba(255, 66, 104, 0.65)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.12, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.scale((e.vx < -8 ? -1 : 1) * (1 + wobble), 1 - wobble);
  const drawSize = e.type === "mop" ? e.r * 2.8 : e.r * 2.55;
  if (sp && sp.ready) {
    const img = e.flash > 0 && sp.white ? sp.white : sp.img;
    ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  }
  ctx.restore();

  // Boss Stunned Stars!
  if (e.stun > 0) {
    ctx.save();
    ctx.fillStyle = "#ffe066";
    ctx.font = "900 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💫 撞晕了！快集火！", e.x, e.y - e.r - 28);
    ctx.restore();
  }

  if (e.type === "mop" || e.hp < e.maxHp) {
    const bw = e.type === "mop" ? 68 : 28;
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
    ctx.fillStyle = `rgba(255, 76, 118, ${0.14 + t * 0.26})`;
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
    ctx.fillText("🐾 猫主子落掌！", 0, 4);
  } else {
    // Real Studio-Grade Chubby Orange Tabby Cat Paw slamming down from upper-right!
    const sp = SPRITES.catpaw;
    const slamProg = Math.min(1, (0.55 - paw.timer) / 0.12);
    const fade = Math.min(1, paw.timer / 0.18);
    const dropOff = (1 - slamProg) * 180;
    ctx.globalAlpha = fade;

    // Impact shadow
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(0, 12, paw.radius * 0.95, paw.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sp && sp.ready) {
      const sz = paw.radius * 2.7;
      ctx.drawImage(sp.img, -sz * 0.36 + dropOff * 0.5, -sz * 0.68 - dropOff, sz, sz);
    }
  }
  ctx.restore();
}

function drawWeaponVfx(ctx, state, time) {
  const { player } = state;
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
        ctx.lineTo((prev.x + cur.x) / 2 + (Math.random() - 0.5) * 20, (prev.y + cur.y) / 2 + (Math.random() - 0.5) * 20);
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

  // Vacuum Suction Cone
  ctx.save();
  ctx.rotate(p.facing);
  const vg = ctx.createRadialGradient(18, 0, 4, 58, 0, 82);
  vg.addColorStop(0, p.overdrive > 0 ? "rgba(255, 213, 74, 0.44)" : "rgba(56, 243, 255, 0.28)");
  vg.addColorStop(1, "rgba(56, 243, 255, 0)");
  ctx.fillStyle = vg;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.arc(10, 0, 96, -0.52, 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (p.overdrive > 0) {
    ctx.strokeStyle = "#ffd54a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 12 + Math.sin(time * 24) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 28, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = Math.sin(time * 14) * 1.5;
  const sp = SPRITES.hero;
  const sz = 66;
  ctx.save();
  ctx.translate(0, bob);
  if (p.poopSlow > 0) ctx.filter = "sepia(0.8) hue-rotate(-15deg) brightness(0.85)";
  else if (p.skin === "cyber") ctx.filter = "hue-rotate(155deg) saturate(1.8) brightness(1.05)";
  else if (p.skin === "cat") ctx.filter = "hue-rotate(285deg) saturate(1.45)";
  else if (p.skin === "gold") ctx.filter = "sepia(0.95) saturate(3.2) hue-rotate(-8deg) brightness(1.08)";

  if (sp && sp.ready) {
    const img = p.hurtFlash > 0 && sp.white ? sp.white : sp.img;
    ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
  }
  ctx.filter = "none";

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
  if (state.dock.active) targets.push({ x: state.dock.x, y: state.dock.y, color: "#39ff88", label: "⚡撤离" });
  for (const c of state.crates) targets.push({ x: c.x, y: c.y, color: "#ffd54a", label: "👑金箱" });
  for (const d of state.lootDrops) {
    targets.push({ x: d.x, y: d.y, color: d.isGhost ? "#ff5ce1" : "#ffd54a", label: d.isGhost ? "📦遗产" : "💎大金" });
  }
  for (const e of state.enemies) {
    if (e.type === "mop") targets.push({ x: e.x, y: e.y, color: "#ff4c76", label: "🧹Boss" });
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

export function renderReceiptPoster({ extracted, value, cleanPct, wave, kills, lootNames, modeLabel, streak, rescuedGhost }) {
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
    ["客厅清扫完成度", `${cleanPct}%`],
    ["坚持波次 / 击杀", `第 ${wave} 波 · ${kills} 只`],
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
