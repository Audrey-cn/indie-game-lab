// Roomba Raid v0.4.0 — Pure Visual Multi-Room Apartment Renderer (NO Text on Furniture!)
// Recognizable top-down TV console, sofa w/ pillows, bookshelf, kitchen island, fridge,
// duckable coffee table / dining table / desk / master king bed (fade translucent on entry!),
// sticky milk-tea debuff puddles, chasing Cat Paw, Pooper & Slime enemies, 11 Skin Variants.

import { LOOT_ITEMS, SKINS } from "./config.mjs";
import { HIDDEN_ZONES, OBSTACLES, ROOM, WET_ZONES, WIND_ZONES } from "./room-layout.mjs";
import { SPRITES } from "./sprites.mjs";

const LOOT_MAP = Object.fromEntries(LOOT_ITEMS.map((l) => [l.id, l]));
const SKIN_MAP = Object.fromEntries(SKINS.map((s) => [s.id, s]));

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
  const scale = 0.35;
  const c = document.createElement("canvas");
  c.width = Math.round(ROOM.width * scale);
  c.height = Math.round(ROOM.height * scale);
  const g = c.getContext("2d");

  g.fillStyle = "rgba(16, 14, 34, 0.38)";
  g.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = 0.9 + Math.random() * 2.1;
    g.fillStyle = i % 5 === 0 ? "rgba(245, 200, 125, 0.45)" : "rgba(175, 178, 225, 0.25)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, ctx: g, scale };
}

export function cleanDustAt(dustLayer, x, y, radius = 40) {
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

  // 1. Multi-Room Apartment Floorplan
  drawApartmentFloor(ctx, cam, vw, vh);

  // 2. Interactive Dust Layer
  if (state.dustLayer) {
    ctx.drawImage(state.dustLayer.canvas, 0, 0, ROOM.width, ROOM.height);
  }

  // 2b. Wet Slippery Zones & Wind Corridors
  drawWetAndWindZones(ctx, time);

  // 3. Sticky Milk-Tea Debuff Puddles
  for (const pd of state.puddles) {
    drawMilkTeaPuddle(ctx, pd);
  }

  // 4. Pure Visual Solid Cover Furniture (NO text!)
  drawSolidFurniture(ctx, time);

  // 4b. Boss Key Target Facility Glow (when carrying a Boss Key!)
  if (state.hasKey && state.keyTarget && !state.keyTarget.opened) {
    drawLockedFacilityBeacon(ctx, state.keyTarget, time);
  }

  // 5. Interactive Power-Strip Shock Traps
  for (const strip of state.shockStrips) {
    drawShockStrip(ctx, strip, time);
  }

  // 6. Charging Dock Extraction Pad
  if (state.dock.active) {
    drawChargingDock(ctx, state.dock, time);
  }

  // 7. Native Furniture Search Seams
  for (const spot of state.nativeSpots) {
    if (!spot.searched) drawNativeSpot(ctx, spot, time);
  }

  // 8. Destructible Living Room Props
  for (const prop of state.props) {
    drawProp(ctx, prop);
  }

  // 9. Pet Poop Hazards
  for (const poop of state.poops) {
    drawPoop(ctx, poop, time);
  }

  // 10. Boss/Elite Mystery Gold Crates
  for (const crate of state.crates) {
    drawMysteryCrate(ctx, crate, time);
  }

  // 11. XP Gems, Coins & Rare Gold Cores
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

  // 12. Loose Big Gold / Friend Ghost Drops
  for (const drop of state.lootDrops) {
    drawLootDrop(ctx, drop, time);
  }

  // 13. Flying Ragdolls
  for (const rag of state.ragdolls) {
    const a = Math.max(0, rag.life / rag.maxLife);
    const sp = SPRITES[rag.sprite || rag.type];
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(rag.x, rag.y);
    ctx.rotate(rag.rot);
    const sz = rag.r * 2.5 * (0.6 + 0.4 * a);
    if (sp && sp.ready) ctx.drawImage(sp.img, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }

  // 14. Enemies
  for (const e of state.enemies) {
    drawEnemy(ctx, e, time);
  }

  // 15. Enemy Projectiles
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
    ctx.restore();
  }

  // 16. Weapon VFX
  drawWeaponVfx(ctx, state, time);

  // 16b. Summoned Mini Helper Clones!
  for (const cl of state.clones) {
    drawHelperClone(ctx, cl, time);
  }

  // 17. Roomba Protagonist
  drawPlayer(ctx, player, state, time);

  // 18. Pure Visual Overhead Duckable Furniture (Tables, Desks, King Bed — NO text, fade on duck!)
  drawHiddenZoneTops(ctx, state);

  // 19. Chasing Cat Paw Telegraph & Overhead Tabby Paw Slam
  for (const paw of state.catPaws) {
    drawCatPaw(ctx, paw);
  }

  // 20. Particles
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

  // 21. Floating Stroked Damage & Loot Texts
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

  // 22. Screen-space Vignettes
  if (state.dock.active || state.player.overdrive > 0 || state.fever > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    const col = state.player.overdrive > 0
      ? `rgba(56, 243, 255, ${0.18 + pulse * 0.14})`
      : state.fever > 0
        ? `rgba(255, 213, 74, ${0.14 + pulse * 0.14})`
        : `rgba(255, 56, 108, ${0.12 + pulse * 0.15})`;
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.28, vw / 2, vh / 2, vh * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, col);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
  }

  drawOffscreenIndicators(ctx, state, vw, vh);

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

function drawApartmentFloor(ctx, cam, vw, vh) {
  // Base midnight wood floor
  ctx.fillStyle = "#24284a";
  ctx.fillRect(0, 0, ROOM.width, ROOM.height);

  // Dining/Kitchen cool ceramic tile floor on right wing (x >= 1380)
  ctx.fillStyle = "#1f2a42";
  ctx.fillRect(1380, 520, ROOM.width - 1380, ROOM.height - 520);
  ctx.strokeStyle = "rgba(100, 150, 210, 0.1)";
  ctx.lineWidth = 2;
  for (let x = 1400; x < ROOM.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 520);
    ctx.lineTo(x, ROOM.height);
    ctx.stroke();
  }
  for (let y = 520; y < ROOM.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(1380, y);
    ctx.lineTo(ROOM.width, y);
    ctx.stroke();
  }

  // Warm wood planks in Living Room & Master Bedroom (x < 1380)
  const plankH = 56;
  const startY = Math.max(0, Math.floor((cam.y - vh / 2) / plankH) * plankH);
  const endY = Math.min(ROOM.height, cam.y + vh / 2 + plankH);
  for (let y = startY; y < endY; y += plankH) {
    const idx = Math.floor(y / plankH);
    const inBedroom = y >= 1140;
    ctx.fillStyle = inBedroom
      ? (idx % 2 === 0 ? "#2e2646" : "#27203d")
      : (idx % 2 === 0 ? "#2a2f57" : "#24284c");
    ctx.fillRect(0, y, 1380, plankH - 2);
    ctx.fillStyle = "#161830";
    ctx.fillRect(0, y + plankH - 2, 1380, 2);
    const offset = (idx % 3) * 140 + 60;
    for (let x = offset; x < 1380; x += 260) ctx.fillRect(x, y, 2, plankH);
  }

  // Living Room Persian Rug
  ctx.save();
  ctx.fillStyle = "rgba(148, 42, 68, 0.55)";
  roundRect(ctx, 250, 350, 540, 440, 24);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 198, 78, 0.45)";
  ctx.lineWidth = 6;
  roundRect(ctx, 268, 368, 504, 404, 16);
  ctx.stroke();

  // Master Bedroom Cozy Round Rug
  ctx.fillStyle = "rgba(92, 64, 152, 0.45)";
  ctx.beginPath();
  ctx.ellipse(590, 1560, 330, 250, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(180, 145, 255, 0.32)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();

  // Top-right apartment L-cutout
  const c = ROOM.cutout;
  ctx.fillStyle = "#0b0d1b";
  ctx.fillRect(c.x, c.y, c.w, c.h);

  // Outer perimeter walls
  ctx.strokeStyle = "#485491";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(6, 6);
  ctx.lineTo(c.x, 6);
  ctx.lineTo(c.x, c.h);
  ctx.lineTo(ROOM.width - 6, c.h);
  ctx.lineTo(ROOM.width - 6, ROOM.height - 6);
  ctx.lineTo(6, ROOM.height - 6);
  ctx.closePath();
  ctx.stroke();
}

function drawWetAndWindZones(ctx, time) {
  // Shimmering Wet Slippery Floor Puddles
  for (const wz of WET_ZONES) {
    ctx.save();
    ctx.fillStyle = "rgba(56, 189, 248, 0.24)";
    ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
    ctx.lineWidth = 2.5;
    roundRect(ctx, wz.x, wz.y, wz.w, wz.h, 36);
    ctx.fill();
    ctx.stroke();
    // Specular water shimmer streaks
    const sh = Math.sin(time * 3 + wz.x) * 14;
    ctx.strokeStyle = "rgba(224, 242, 254, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wz.x + 42 + sh, wz.y + 38);
    ctx.lineTo(wz.x + 110 + sh, wz.y + 38);
    ctx.moveTo(wz.x + wz.w - 120 - sh, wz.y + wz.h - 36);
    ctx.lineTo(wz.x + wz.w - 50 - sh, wz.y + wz.h - 36);
    ctx.stroke();
    ctx.restore();
  }

  // Animated Hairdryer / Floor Fan Wind Corridors
  for (const wn of WIND_ZONES) {
    ctx.save();
    ctx.fillStyle = "rgba(186, 230, 253, 0.1)";
    roundRect(ctx, wn.x, wn.y, wn.w, wn.h, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(125, 249, 255, 0.42)";
    ctx.lineWidth = 3;
    const horiz = Math.abs(wn.vx) > Math.abs(wn.vy);
    const dir = horiz ? Math.sign(wn.vx) : Math.sign(wn.vy);
    for (let i = 0; i < 6; i++) {
      const p = ((time * 1.4 + i * 0.17) % 1);
      ctx.beginPath();
      if (horiz) {
        const lx = dir < 0 ? wn.x + wn.w * (1 - p) : wn.x + wn.w * p;
        const ly = wn.y + 24 + (i % 5) * ((wn.h - 48) / 4);
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dir * 42, ly);
      } else {
        const lx = wn.x + 28 + (i % 5) * ((wn.w - 56) / 4);
        const ly = dir < 0 ? wn.y + wn.h * (1 - p) : wn.y + wn.h * p;
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx, ly + dir * 42);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawLockedFacilityBeacon(ctx, fac, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 9);
  ctx.save();
  ctx.translate(fac.x, fac.y);
  ctx.strokeStyle = `rgba(255, 213, 74, ${0.55 + pulse * 0.45})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, fac.radius * 0.72 + pulse * 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillStyle = "#ffe58f";
  ctx.textAlign = "center";
  ctx.fillText(`🗝️ 解锁 ${fac.label}`, 0, -fac.radius * 0.78);
  ctx.restore();
}

function drawHelperClone(ctx, cl, time) {
  const sp = SPRITES.hero;
  ctx.save();
  ctx.translate(cl.x, cl.y);
  ctx.strokeStyle = "rgba(56, 243, 255, 0.7)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 22 + Math.sin(time * 16) * 2, 0, Math.PI * 2);
  ctx.stroke();
  if (sp && sp.ready) {
    ctx.filter = "hue-rotate(140deg) saturate(1.8) brightness(1.1)";
    ctx.drawImage(sp.img, -22, -22, 44, 44);
    ctx.filter = "none";
  }
  ctx.restore();
}

function drawMilkTeaPuddle(ctx, pd) {
  const a = Math.min(1, pd.life / 1.0);
  ctx.save();
  ctx.globalAlpha = a * 0.82;
  ctx.translate(pd.x, pd.y);
  ctx.fillStyle = "#c98b55";
  ctx.strokeStyle = "#5c3618";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, pd.r, pd.r * 0.78, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Cute dark boba pearls inside milk tea!
  ctx.fillStyle = "#24130a";
  for (const [bx, by] of [[-18, -8], [14, -12], [6, 12], [-14, 14], [22, 4]]) {
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// PURE VISUAL SOLID FURNITURE — ZERO TEXT LABELS!
function drawSolidFurniture(ctx, time) {
  for (const ob of OBSTACLES) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.44)";
    roundRect(ctx, ob.x + 8, ob.y + 12, ob.w, ob.h, 12);
    ctx.fill();

    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 4;

    if (ob.kind === "sofa") {
      // Plush Purple 3-Seater Sofa with Armrests & Throw Pillows
      ctx.fillStyle = "#583d82";
      roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 20);
      ctx.fill();
      ctx.stroke();
      // Backrest
      ctx.fillStyle = "#412a66";
      roundRect(ctx, ob.x + 8, ob.y + 6, ob.w - 16, 36, 12);
      ctx.fill();
      ctx.stroke();
      // 3 Seat cushions
      ctx.fillStyle = "#6e4ea1";
      const cw = (ob.w - 64) / 3;
      for (let i = 0; i < 3; i++) {
        roundRect(ctx, ob.x + 28 + i * (cw + 4), ob.y + 46, cw, ob.h - 56, 10);
        ctx.fill();
        ctx.stroke();
      }
      // Colorful throw pillows
      ctx.fillStyle = "#ff85a2";
      roundRect(ctx, ob.x + 36, ob.y + 34, 48, 38, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd54a";
      roundRect(ctx, ob.x + ob.w - 86, ob.y + 34, 48, 38, 10);
      ctx.fill();
      ctx.stroke();
    } else if (ob.kind === "tv") {
      // Walnut TV Console + Glowing Flatscreen TV + Stereo Speakers!
      ctx.fillStyle = "#4d352a";
      roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 12);
      ctx.fill();
      ctx.stroke();
      // Speakers on left & right
      ctx.fillStyle = "#222638";
      roundRect(ctx, ob.x + 22, ob.y + 18, 52, 66, 8);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, ob.x + ob.w - 74, ob.y + 18, 52, 66, 8);
      ctx.fill();
      ctx.stroke();
      // Wide Flatscreen TV Panel
      ctx.fillStyle = "#16192b";
      roundRect(ctx, ob.x + 96, ob.y + 20, ob.w - 192, 46, 8);
      ctx.fill();
      ctx.stroke();
      // Glowing TV Screen glow strip!
      const glow = 0.55 + 0.25 * Math.sin(time * 4);
      ctx.fillStyle = `rgba(56, 243, 255, ${glow})`;
      ctx.fillRect(ob.x + 108, ob.y + 52, ob.w - 216, 8);
    } else if (ob.kind === "bookshelf") {
      ctx.fillStyle = "#5c3f2e";
      roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 10);
      ctx.fill();
      ctx.stroke();
      // Colorful book spines!
      const colors = ["#ff5c7c", "#38f3ff", "#ffd54a", "#57f287", "#c084fc"];
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = colors[i % colors.length];
        roundRect(ctx, ob.x + 14, ob.y + 16 + i * 27, ob.w - 28, 20, 4);
        ctx.fill();
        ctx.stroke();
      }
    } else if (ob.kind === "island") {
      // Sleek Marble Kitchen Island with Fruit Bowl & Cutting Board
      ctx.fillStyle = "#dce6f2";
      roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#b88450";
      roundRect(ctx, ob.x + 30, ob.y + 24, 110, 80, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(ob.x + ob.w - 75, ob.y + 64, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (ob.kind === "fridge") {
      ctx.fillStyle = "#b8cbe0";
      roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#dce9f7";
      roundRect(ctx, ob.x + 10, ob.y + 10, ob.w - 20, ob.h - 20, 8);
      ctx.fill();
    } else if (ob.kind === "wall") {
      ctx.fillStyle = "#2b3259";
      roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#485491";
      ctx.fillRect(ob.x + 6, ob.y + 6, ob.w - 12, 8);
    } else {
      // Wardrobe / Shoe Cabinet
      ctx.fillStyle = "#4f3a36";
      roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#7a5b54";
      ctx.lineWidth = 3;
      roundRect(ctx, ob.x + 10, ob.y + 10, ob.w - 20, ob.h - 20, 8);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// PURE VISUAL OVERHEAD DUCKABLE FURNITURE — ZERO TEXT! Fades smoothly when Roomba enters!
function drawHiddenZoneTops(ctx, state) {
  const p = state.player;
  for (const hz of HIDDEN_ZONES) {
    const inside =
      p.x + p.r > hz.x && p.x - p.r < hz.x + hz.w && p.y + p.r > hz.y && p.y - p.r < hz.y + hz.h;
    const targetAlpha = inside ? 0.22 : 0.96;
    hz.alpha = (hz.alpha ?? 0.96) + (targetAlpha - (hz.alpha ?? 0.96)) * 0.18;

    ctx.save();
    ctx.globalAlpha = hz.alpha;
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 4;

    // Soft elevated drop shadow showing there is space underneath!
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    roundRect(ctx, hz.x + 14, hz.y + 18, hz.w, hz.h, 16);
    ctx.fill();

    if (hz.kind === "bed") {
      // Giant Cozy Master Bedroom King Bed (Quilt + 2 Fluffy Pillows!)
      ctx.fillStyle = "#3f2e2b";
      roundRect(ctx, hz.x, hz.y, hz.w, hz.h, 18);
      ctx.fill();
      ctx.stroke();
      // White sheet + cozy coral-pink duvet blanket
      ctx.fillStyle = "#eef2ff";
      roundRect(ctx, hz.x + 12, hz.y + 12, hz.w - 24, hz.h - 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d95b7a";
      roundRect(ctx, hz.x + 12, hz.y + 108, hz.w - 24, hz.h - 120, 12);
      ctx.fill();
      ctx.stroke();
      // 2 Fluffy Pillows
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, hz.x + 36, hz.y + 28, 170, 68, 18);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, hz.x + hz.w - 206, hz.y + 28, 170, 68, 18);
      ctx.fill();
      ctx.stroke();
    } else if (hz.kind === "coffee_table") {
      // Warm Oak Coffee Table + 2 Coffee Mugs + Magazine
      ctx.fillStyle = "#7a5238";
      roundRect(ctx, hz.x, hz.y, hz.w, hz.h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#966748";
      roundRect(ctx, hz.x + 10, hz.y + 10, hz.w - 20, hz.h - 20, 10);
      ctx.fill();
      // Magazine
      ctx.fillStyle = "#38bdf8";
      roundRect(ctx, hz.x + 34, hz.y + 42, 74, 92, 6);
      ctx.fill();
      ctx.stroke();
      // 2 Cute Mugs
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(hz.x + hz.w - 66, hz.y + 62, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6b3e26";
      ctx.beginPath();
      ctx.arc(hz.x + hz.w - 66, hz.y + 62, 11, 0, Math.PI * 2);
      ctx.fill();
    } else if (hz.kind === "dining_table") {
      // Dining Table with Runner & 4 Plates
      ctx.fillStyle = "#6e4b3a";
      roundRect(ctx, hz.x, hz.y, hz.w, hz.h, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c94c68";
      ctx.fillRect(hz.x + 12, hz.y + hz.h / 2 - 22, hz.w - 24, 44);
      ctx.fillStyle = "#f1f5f9";
      for (const [px, py] of [
        [hz.x + 75, hz.y + 52],
        [hz.x + hz.w - 75, hz.y + 52],
        [hz.x + 75, hz.y + hz.h - 52],
        [hz.x + hz.w - 75, hz.y + hz.h - 52],
      ]) {
        ctx.beginPath();
        ctx.arc(px, py, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Study Desk with Open Laptop & Warm Lamp
      ctx.fillStyle = "#52587a";
      roundRect(ctx, hz.x, hz.y, hz.w, hz.h, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#cbd5e1";
      roundRect(ctx, hz.x + hz.w / 2 - 42, hz.y + hz.h / 2 - 30, 84, 58, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#38f3ff";
      ctx.fillRect(hz.x + hz.w / 2 - 34, hz.y + hz.h / 2 - 22, 68, 22);
      ctx.fillStyle = "#ffd54a";
      ctx.beginPath();
      ctx.arc(hz.x + 36, hz.y + 38, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
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
  for (const sx of [-14, 0, 14]) ctx.fillRect(sx - 3, -4, 6, 8);
  ctx.restore();
}

function drawNativeSpot(ctx, spot, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6 + spot.x);
  ctx.save();
  ctx.translate(spot.x, spot.y);
  ctx.strokeStyle = spot.isSecret ? `rgba(255, 92, 225, ${0.5 + pulse * 0.5})` : `rgba(255, 213, 74, ${0.42 + pulse * 0.45})`;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(0, 0, 26 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = "900 18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spot.isSecret ? "👑" : "✨", 0, 0);

  if (spot.progress > 0) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * spot.progress);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPoop(ctx, poop, time) {
  const wobble = Math.sin(time * 5 + poop.x) * 0.06;
  ctx.save();
  ctx.translate(poop.x, poop.y);
  ctx.strokeStyle = "rgba(180, 120, 50, 0.55)";
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 2, 25, 0, Math.PI * 2);
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
  if (e.type === "mop" && e.aiState === "windup") {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 56, 108, 0.85)";
    ctx.setLineDash([12, 8]);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.chargeAng) * 440, e.y + Math.sin(e.chargeAng) * 440);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const wobble = e.stun > 0 ? 0 : Math.sin(time * 12 + e.seed) * 0.09;
  const spKey = e.type === "pooper" ? "poop" : e.type === "slime" ? "dust" : e.type;
  const sp = SPRITES[spKey];

  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.8, e.r * 0.9, e.r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale((e.vx < -8 ? -1 : 1) * (1 + wobble), 1 - wobble);
  if (e.type === "slime") ctx.filter = "sepia(1) hue-rotate(-10deg) saturate(2.4) brightness(1.08)";
  const drawSize = e.type === "mop" ? e.r * 2.8 : e.r * 2.55;
  if (sp && sp.ready) {
    const img = e.flash > 0 && sp.white ? sp.white : sp.img;
    ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  }
  ctx.filter = "none";
  ctx.restore();

  if (e.stun > 0) {
    ctx.save();
    ctx.fillStyle = "#ffe066";
    ctx.font = "900 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💫 撞晕了！", e.x, e.y - e.r - 28);
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
  if (paw.phase === "chase" || paw.phase === "lock") {
    const locked = paw.phase === "lock";
    const t = locked ? 1 - paw.timer / paw.lockDur : 0.35;
    ctx.fillStyle = locked ? `rgba(255, 42, 92, ${0.28 + t * 0.32})` : "rgba(255, 196, 60, 0.16)";
    ctx.strokeStyle = locked ? "#ff2a5c" : "#ffd54a";
    ctx.lineWidth = locked ? 4.5 : 3;
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, paw.radius * (locked ? t : 0.5), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = locked ? "#ffe2e8" : "#fff2bd";
    ctx.font = "900 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(locked ? "🐾 即将拍下！快钻桌底！" : "🐾 猫掌锁定中…快找桌子躲！", 0, 4);
  } else {
    const sp = SPRITES.catpaw;
    const slamProg = Math.min(1, (0.58 - paw.timer) / 0.11);
    const fade = Math.min(1, paw.timer / 0.18);
    const dropOff = (1 - slamProg) * 200;
    ctx.globalAlpha = fade;

    ctx.fillStyle = "rgba(0,0,0,0.44)";
    ctx.beginPath();
    ctx.ellipse(0, 14, paw.radius * 0.98, paw.radius * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sp && sp.ready) {
      const sz = paw.radius * 2.85;
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
  const skin = SKIN_MAP[p.skin] || SKIN_MAP.classic;
  const sc = (skin.scale || 1.0) * (p.giant > 0 ? 1.72 : 1.0);

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
  ctx.arc(10, 0, 96 * sc, -0.52, 0.52);
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
  ctx.ellipse(0, 18 * sc, 28 * sc, 12 * sc, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = Math.sin(time * 14) * 1.5;
  const sp = SPRITES.hero;
  const sz = 66 * sc;
  ctx.save();
  ctx.translate(0, bob);
  if (p.poopSlow > 0) ctx.filter = "sepia(0.8) hue-rotate(-15deg) brightness(0.85)";
  else if (skin.filter && skin.filter !== "none") ctx.filter = skin.filter;

  if (sp && sp.ready) {
    const img = p.hurtFlash > 0 && sp.white ? sp.white : sp.img;
    ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
  }
  ctx.filter = "none";

  // Topper Badges for Distinct Visual Silhouettes!
  const tp = skin.topper;
  if (tp === "gold" || tp === "cat_crown" || tp === "diamond") {
    ctx.fillStyle = tp === "diamond" ? "#7ef9ff" : "#ffe066";
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-10, -24 * sc);
    ctx.lineTo(-12, -35 * sc);
    ctx.lineTo(-4, -29 * sc);
    ctx.lineTo(0, -38 * sc);
    ctx.lineTo(4, -29 * sc);
    ctx.lineTo(12, -35 * sc);
    ctx.lineTo(10, -24 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (tp === "cat" || tp === "cat_crown") {
    ctx.fillStyle = tp === "cat_crown" ? "#ffd54a" : "#ff85c0";
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 9, -22 * sc);
      ctx.lineTo(s * 19, -35 * sc);
      ctx.lineTo(s * 22, -16 * sc);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (tp === "horns") {
    ctx.fillStyle = "#ff4255";
    ctx.strokeStyle = "#141126";
    ctx.lineWidth = 2.4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 8, -22 * sc);
      ctx.lineTo(s * 22, -36 * sc);
      ctx.lineTo(s * 18, -16 * sc);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (tp === "duck") {
    ctx.font = "900 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🦆", 0, -24 * sc);
  }
  ctx.restore();
  ctx.restore();
}

function drawOffscreenIndicators(ctx, state, vw, vh) {
  const targets = [];
  if (state.hasKey && state.keyTarget && !state.keyTarget.opened) {
    targets.push({ x: state.keyTarget.x, y: state.keyTarget.y, color: "#ffd54a", label: "🗝️开锁" });
  }
  if (state.dock.active) targets.push({ x: state.dock.x, y: state.dock.y, color: "#39ff88", label: "⚡撤离" });
  for (const c of state.crates) targets.push({ x: c.x, y: c.y, color: "#ffd54a", label: "👑金箱" });
  for (const d of state.lootDrops) {
    targets.push({ x: d.x, y: d.y, color: d.isKey ? "#ffd54a" : d.isGhost ? "#ff5ce1" : "#ffd54a", label: d.isKey ? "🗝️钥匙" : d.isGhost ? "📦遗产" : "💎大金" });
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

export function renderReceiptPoster({ extracted, value, cleanPct, stars, wave, kills, lootNames, modeLabel, streak, rescuedGhost }) {
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
  ctx.fillText(`半夜扫地机 ROOMBA RAID · ${"★".repeat(stars)}${"☆".repeat(3 - stars)} · ${modeLabel}`, 270, 122);

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
    ["全屋探索清扫度", `${cleanPct}% (${stars}星)`],
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

  // Draw a crisp deterministic QR-code block in bottom-right of the share poster!
  const qx = 368, qy = 548, qs = 104;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qx - 6, qy - 6, qs + 12, qs + 12);
  ctx.strokeStyle = "#141126";
  ctx.lineWidth = 2;
  ctx.strokeRect(qx - 6, qy - 6, qs + 12, qs + 12);
  const cells = 13;
  const cw = qs / cells;
  let hash = (Math.round(value) ^ (kills * 31) ^ (cleanPct * 97)) >>> 0;
  ctx.fillStyle = "#141126";
  for (let r = 0; r < cells; r++) {
    for (let col = 0; col < cells; col++) {
      const corner = (r < 3 && col < 3) || (r < 3 && col >= cells - 3) || (r >= cells - 3 && col < 3);
      hash = (Math.imul(hash ^ (r * 17 + col * 31), 2654435761) >>> 0);
      if (corner || (hash & 1)) {
        ctx.fillRect(qx + col * cw, qy + r * cw, cw - 0.4, cw - 0.4);
      }
    }
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#475569";
  ctx.font = '800 14px sans-serif';
  ctx.fillText("扫码 / 点链接挑战同图客厅", 72, 600);
  ctx.fillStyle = "#0f172a";
  ctx.font = '700 12px sans-serif';
  ctx.fillText("已自动复制带遗产坐标的挑战链接", 72, 624);

  return c.toDataURL("image/png");
}
