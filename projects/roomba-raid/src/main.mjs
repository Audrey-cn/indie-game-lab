// Roomba Raid v0.3.0 — Irregular L-Room, Cover Furniture, Under-Table Hidden Zones,
// Cleanliness Milestones (35%/70%/100%), Native Search Spots, Boss 3-Skill Bullet/Charge/Stun AI,
// Cat Paw Sprite, Pet Poop Nightmare/Purify Bonus, Periodic Horde Swarms, Drift Feel & 128-Step BGM!

import {
  BOOSTERS,
  DEFAULT_SAVE,
  LOOT_ITEMS,
  MUSEUM_SETS,
  PASSIVES,
  SAFE_BOX_PRICES,
  SKINS,
  WEAPONS,
} from "./config.mjs";
import { sfx } from "./audio.mjs";
import {
  buildChallengeUrl,
  copyToClipboard,
  createRng,
  getTodaySeedString,
  hashSeed,
  loadSave,
  parseUrlContext,
  showRewardedAd,
  vibrate,
  writeSave,
} from "./platform.mjs";
import {
  clampToRoom,
  createCleanTracker,
  NATIVE_SPOT_DEFS,
  pointHitsObstacle,
  ROOM,
  SHOCK_STRIP_DEFS,
} from "./room-layout.mjs";
import { cleanDustAt, createDustLayer, renderGame, renderReceiptPoster, smearPoopAt } from "./renderer.mjs";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const appEl = document.getElementById("app");

let vw = 390;
let vh = 780;
function resize() {
  const rect = appEl.getBoundingClientRect();
  vw = Math.max(320, Math.round(rect.width));
  vh = Math.max(480, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

let save = loadSave(DEFAULT_SAVE);
const urlCtx = parseUrlContext();
let selectedMode = urlCtx.seed ? "daily" : "free";
let currentShopTab = "skins";
let state = null;
let lastTs = 0;

// UI refs
const hudEl = document.getElementById("hud");
const toastEl = document.getElementById("toast");
const briefingEl = document.getElementById("briefing-banner");
const jackpotEl = document.getElementById("jackpot-banner");
const btnOverdrive = document.getElementById("btn-overdrive");
const odTxt = document.getElementById("od-txt");
const screenTitle = document.getElementById("screen-title");
const screenLevelUp = document.getElementById("screen-levelup");
const screenResult = document.getElementById("screen-result");
const screenShop = document.getElementById("screen-shop");

let toastTimer = null;
function showToast(msg, style = "") {
  toastEl.textContent = msg;
  toastEl.className = style;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

let jackpotTimer = null;
function showJackpotBanner(name, value, sub = "✨ 沙发底爆出大金 ✨") {
  document.querySelector("#jackpot-banner .jt-sub").textContent = sub;
  document.getElementById("jt-name").textContent = name;
  document.getElementById("jt-val").textContent = typeof value === "string" ? value : `+¥${value.toLocaleString()}`;
  jackpotEl.hidden = false;
  clearTimeout(jackpotTimer);
  jackpotTimer = setTimeout(() => {
    jackpotEl.hidden = true;
  }, 2200);
}

function getMuseumBonuses() {
  let fireRate = 1;
  let lootMult = 1;
  if (MUSEUM_SETS[0].items.every((id) => (save.museum[id] || 0) > 0)) fireRate *= 1.12;
  if (MUSEUM_SETS[1].items.every((id) => (save.museum[id] || 0) > 0)) lootMult *= 1.15;
  return { fireRate, lootMult };
}

function getEquippedSkin() {
  return SKINS.find((s) => s.id === save.equippedSkin) || SKINS[0];
}

function updateTitleUI() {
  document.getElementById("st-coins").textContent = `¥${Math.round(save.coins).toLocaleString()}`;
  document.getElementById("st-cores").textContent = `💎${save.goldCores || 0}`;
  document.getElementById("st-streak").textContent = `${save.extractStreak}连`;
  document.getElementById("mode-free").classList.toggle("active", selectedMode === "free");
  document.getElementById("mode-daily").classList.toggle("active", selectedMode === "daily");

  const ghostBanner = document.getElementById("title-ghost-banner");
  if (urlCtx.ghostDrop) {
    ghostBanner.hidden = false;
    ghostBanner.textContent = `📦 检测到群友 @${urlCtx.ghostDrop.owner} 的翻车遗产（¥${urlCtx.ghostDrop.value.toLocaleString()}）！进场可去捡漏带走！`;
  } else {
    ghostBanner.hidden = true;
  }
}

function pickWeightedLoot(rng, minValue = 0) {
  const pool = LOOT_ITEMS.filter((i) => i.value >= minValue);
  const list = pool.length ? pool : LOOT_ITEMS;
  const total = list.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of list) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return list[0];
}

function findSafePoint(rng, pad = 110) {
  for (let tries = 0; tries < 40; tries++) {
    const x = pad + rng() * (ROOM.width - pad * 2);
    const y = pad + rng() * (ROOM.height - pad * 2);
    if (!pointHitsObstacle(x, y)) return { x, y };
  }
  return { x: 560, y: 480 };
}

function startRun() {
  sfx.unlock();
  sfx.setUrgent(false);
  sfx.setFever(false);
  sfx.startBgm("living");

  const isDaily = selectedMode === "daily";
  const seedStr = isDaily ? (urlCtx.seed || getTodaySeedString()) : String(Date.now());
  const rng = createRng(hashSeed(seedStr));
  const skin = getEquippedSkin();
  const museumBonus = getMuseumBonuses();
  const highRisk = Boolean(save.boosters.highrisk);
  const startLvUp = Boolean(save.boosters.lv3);
  const extraRadar = Boolean(save.boosters.radar);
  save.boosters = {};
  writeSave(save);

  const maxHp = Math.round(115 * skin.bonus.hp);

  state = {
    phase: "playing",
    mode: isDaily ? "daily" : "free",
    seedStr,
    rng,
    time: 0,
    slowMo: 0,
    wave: 1,
    hordeTimer: 26, // Periodic Horde Swarm every 26s!
    highRisk,
    lootMult: skin.bonus.loot * museumBonus.lootMult * (highRisk ? 1.8 : 1),
    fireRateMult: museumBonus.fireRate,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    fever: 0,
    shake: 0,
    hitstop: 0,
    revivedOnce: false,
    doubledOnce: false,
    rescuedGhost: null,
    coresEarned: 0,
    dustLayer: createDustLayer(),
    cleanTracker: createCleanTracker(),
    milestones: { m35: false, m70: false, m100: false },
    dustCleanAcc: 0,
    player: {
      x: 560,
      y: 440,
      vx: 0,
      vy: 0,
      r: 23,
      facing: 0,
      hp: maxHp,
      maxHp,
      speed: 255 * skin.bonus.speed,
      magnet: skin.id === "cat" ? 165 : 122,
      lv: 1,
      xp: 0,
      xpNext: 8,
      hurtFlash: 0,
      invuln: 0,
      poopSlow: 0,
      skin: skin.id,
      charge: 45,
      overdrive: 0,
      weapons: { swatter: 1, laser: 0, spatula: 0, hairdryer: 0, tesla: 0 },
      cooldowns: { swatter: 0.15, laser: 0.3, hairdryer: 0.5, tesla: 0.6 },
    },
    cam: { x: 560, y: 440 },
    bagLoot: [],
    looseCoins: 0,
    enemies: [],
    enemyBullets: [],
    ragdolls: [],
    props: [],
    poops: [],
    nativeSpots: NATIVE_SPOT_DEFS.map((d) => ({ ...d, progress: 0, tickAcc: 0, searched: false })),
    shockStrips: SHOCK_STRIP_DEFS.map((d) => ({ ...d, cd: 0 })),
    crates: [], // Reserved ONLY for Boss / Elite drops!
    gems: [],
    lootDrops: [],
    catPaws: [],
    vfx: [],
    particles: [],
    texts: [],
    dock: { active: false, x: 1180, y: 1120, radius: 70, progress: 0, tickAcc: 0 },
    spawnAcc: 0.4,
    pawAcc: 16,
    keys: new Set(),
    joy: { active: false, id: null, ox: 0, oy: 0, cx: 0, cy: 0, dx: 0, dy: 0 },
  };

  cleanDustAt(state.dustLayer, state.player.x, state.player.y, 48);
  state.cleanTracker.markClean(state.player.x, state.player.y, 50);

  // Instant Action Hook: 12 cute Dust-Bunnies right around the player
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng() * 0.25;
    const dist = 150 + (i % 3) * 45;
    const ex = state.player.x + Math.cos(a) * dist;
    const ey = state.player.y + Math.sin(a) * dist;
    if (!pointHitsObstacle(ex, ey)) {
      state.enemies.push({
        type: i % 5 === 0 ? "sock" : "dust",
        x: ex,
        y: ey,
        r: i % 5 === 0 ? 19 : 17,
        hp: i % 5 === 0 ? 34 : 20,
        maxHp: i % 5 === 0 ? 34 : 20,
        speed: i % 5 === 0 ? 96 : 86,
        dmg: 8,
        xp: 3,
        vx: 0,
        vy: 0,
        flash: 0,
        stun: 0,
        shootCd: 2.5 + rng() * 2,
        enraged: false,
        seed: i * 1.3,
      });
    }
  }

  // Destructible Living Room Props
  for (let i = 0; i < 12; i++) {
    const pt = findSafePoint(rng, 110);
    state.props.push({
      x: pt.x,
      y: pt.y,
      kind: i % 2 === 0 ? "box" : "snack",
      rot: (rng() - 0.5) * 0.5,
      flash: 0,
    });
  }

  // 4 Hilarious Pet Poop Hazards (including 1 sneaky poop under the coffee table!)
  const poopCoords = [
    { x: 520, y: 760 }, // Sneaky under coffee table!
    findSafePoint(rng, 160),
    findSafePoint(rng, 160),
    findSafePoint(rng, 160),
  ];
  for (const pt of poopCoords) {
    state.poops.push({ x: pt.x, y: pt.y, hp: 32, flash: 0 });
  }

  if (extraRadar) {
    state.crates.push({ x: 560, y: 310, minVal: 18800, progress: 0, tickAcc: 0 });
  }

  if (urlCtx.ghostDrop) {
    state.lootDrops.push({
      x: 780,
      y: 440,
      isGhost: true,
      owner: urlCtx.ghostDrop.owner,
      lootId: urlCtx.ghostDrop.lootId,
      short: `@${urlCtx.ghostDrop.owner}遗产`,
      name: `@${urlCtx.ghostDrop.owner}的翻车遗产`,
      value: urlCtx.ghostDrop.value,
      rarity: "red",
    });
  }

  screenTitle.hidden = true;
  screenResult.hidden = true;
  screenShop.hidden = true;
  screenLevelUp.hidden = true;
  hudEl.hidden = false;
  btnOverdrive.hidden = false;

  // Dramatic 1.6s Mission Briefing Banner!
  briefingEl.hidden = false;
  setTimeout(() => {
    briefingEl.hidden = true;
  }, 1800);

  if (startLvUp) {
    setTimeout(() => {
      if (state && state.phase === "playing") openLevelUp();
    }, 500);
  }
}

function getSafeBoxValueAndItems() {
  if (!state) return { safeItems: [], safeVal: 0 };
  const sorted = [...state.bagLoot].sort((a, b) => b.value - a.value);
  const safeItems = sorted.slice(0, save.safeBoxSlots);
  const safeVal = safeItems.reduce((s, i) => s + i.value, 0);
  return { safeItems, safeVal };
}

function getTotalRunValue() {
  if (!state) return 0;
  return state.looseCoins + state.bagLoot.reduce((s, i) => s + i.value, 0);
}

function spawnParticles(x, y, color, count = 10, speed = 160, star = false) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.35 + Math.random() * 0.9);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: 3.5 + Math.random() * 5,
      color,
      star: star || i % 3 === 0,
      life: 0.35 + Math.random() * 0.28,
      maxLife: 0.63,
    });
  }
}

function spawnRing(x, y, r0, r1, color = "#38f3ff", width = 6, dur = 0.28) {
  state.vfx.push({ type: "ring", x, y, r0, r1, color, width, life: dur, maxLife: dur });
}

function spawnText(x, y, text, color = "#ffffff", size = 17) {
  state.texts.push({ x, y, text, color, size, vy: -64, life: 0.72, maxLife: 0.72 });
}

function grantLootReward(x, y, minVal, sourceLabel = "✨ 掏出沙发底大金 ✨") {
  const item = pickWeightedLoot(state.rng, minVal);
  const cleanBonus = state.milestones.m70 ? 1.3 : 1;
  const waveScale = 1 + (state.wave - 1) * 0.45;
  const val = Math.round(item.value * waveScale * cleanBonus * state.lootMult);
  const drop = {
    x,
    y,
    lootId: item.id,
    name: item.name,
    short: item.short,
    value: val,
    rarity: item.rarity,
    isGhost: false,
  };
  state.bagLoot.push(drop);
  state.slowMo = 0.28;
  state.shake = 0.7;
  sfx.playCratePop();
  vibrate(32);
  spawnRing(x, y, 16, 145, "#ffd54a", 8, 0.38);
  spawnParticles(x, y, "#ffd54a", 26, 230, true);
  spawnText(x, y - 24, `+¥${val.toLocaleString()}!`, "#ffd54a", 23);
  showJackpotBanner(item.name, val, sourceLabel);
}

function triggerOverdrive() {
  if (!state || state.phase !== "playing") return;
  const p = state.player;
  if (p.charge < 100 || p.overdrive > 0) return;

  p.charge = 0;
  p.overdrive = 1.9;
  p.invuln = 2.1;
  state.shake = 0.9;
  state.hitstop = 0.05;
  sfx.playOverdriveBlast();
  vibrate(45);

  // Skin-Specific Active Skills (20 Minutes Till Dawn style!)
  const blastR = p.skin === "classic" ? 340 : 280;
  spawnRing(p.x, p.y, 20, blastR, "#38f3ff", 12, 0.4);
  if (p.skin === "classic") {
    spawnRing(p.x, p.y, 10, blastR * 0.72, "#ffd54a", 10, 0.48);
    spawnText(p.x, p.y - 36, "⚡ 暴富双雷环清屏！", "#ffd54a", 23);
  } else if (p.skin === "gold") {
    // 24K Gold Crown bursts extra bonus coins around!
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      state.gems.push({ x: p.x + Math.cos(a) * 80, y: p.y + Math.sin(a) * 80, kind: "coin", val: 888, forcePull: true });
    }
    spawnText(p.x, p.y - 36, "👑 撒币震爆清屏！", "#ffd54a", 23);
  } else if (p.skin === "cyber") {
    // Cyber Neon Blink Dash forward!
    p.x += Math.cos(p.facing) * 140;
    p.y += Math.sin(p.facing) * 140;
    clampToRoom(p, p.r);
    spawnText(p.x, p.y - 36, "⚡ 赛博闪现清屏！", "#38f3ff", 23);
  } else {
    spawnText(p.x, p.y - 36, "🐱 招财吸宝暴走！", "#ff9ed0", 23);
  }

  spawnParticles(p.x, p.y, "#38f3ff", 32, 290, true);
  spawnParticles(p.x, p.y, "#ffd54a", 22, 240, true);

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < blastR) {
      if (damageEnemy(e, 95 + state.wave * 35, (dx / d) * 380, (dy / d) * 380, true)) {
        state.enemies.splice(i, 1);
      }
    }
  }
  // Clear enemy bullets on Overdrive!
  state.enemyBullets.length = 0;
  for (const g of state.gems) g.forcePull = true;
}

function spawnEnemy(forcedType = null, forcedPos = null) {
  const p = state.player;
  let x = 0;
  let y = 0;
  if (forcedPos) {
    x = forcedPos.x;
    y = forcedPos.y;
  } else {
    let ok = false;
    for (let tries = 0; tries < 12; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.max(vw, vh) * 0.52 + 30;
      x = Math.max(40, Math.min(ROOM.width - 40, p.x + Math.cos(ang) * dist));
      y = Math.max(80, Math.min(ROOM.height - 40, p.y + Math.sin(ang) * dist));
      if (!pointHitsObstacle(x, y)) {
        ok = true;
        break;
      }
    }
    if (!ok) return;
  }

  let type = forcedType;
  if (!type) {
    const r = Math.random();
    if (state.wave >= 2 && r < 0.28) type = "sock";
    else if (state.wave >= 2 && r < 0.42) type = "lego";
    else type = "dust";
  }

  const hpScale = (1 + (state.wave - 1) * 0.48) * (state.highRisk ? 1.35 : 1);
  const specs = {
    dust: { r: 17, hp: 22 * hpScale, speed: 88 + state.wave * 8, dmg: 8, xp: 3 },
    sock: { r: 19, hp: 46 * hpScale, speed: 102 + state.wave * 9, dmg: 12, xp: 6 },
    lego: { r: 20, hp: 82 * hpScale, speed: 62 + state.wave * 5, dmg: 16, xp: 9 },
    mop: { r: 36, hp: 480 * hpScale, speed: 95 + state.wave * 8, dmg: 20, xp: 34 },
  };
  const sp = specs[type];
  state.enemies.push({
    type,
    x,
    y,
    r: sp.r,
    hp: sp.hp,
    maxHp: sp.hp,
    speed: sp.speed,
    dmg: sp.dmg,
    xp: sp.xp,
    vx: 0,
    vy: 0,
    flash: 0,
    stun: 0,
    aiState: "chase", // For Boss: chase | windup | charge
    aiTimer: 3.5,
    chargeAng: 0,
    shootCd: 2.2 + Math.random() * 2,
    summonedHalf: false,
    enraged: state.dock.active,
    seed: Math.random() * 10,
  });
}

function triggerHordeSwarm() {
  state.wave += 1;
  sfx.playHordeHorn();
  state.shake = 0.5;
  showToast(`🚨 第 ${state.wave} 波怪潮来袭！毛球与臭袜子军团从阳台涌入！`, "pink");
  const count = Math.min(18, 9 + state.wave * 3);
  for (let i = 0; i < count; i++) {
    spawnEnemy(i % 4 === 0 ? "sock" : "dust");
  }
}

function damageEnemy(e, dmg, kbX = 0, kbY = 0, isCrit = false) {
  const bonusDmg = e.stun > 0 ? dmg * 1.5 : dmg; // +50% damage on stunned Boss!
  e.hp -= bonusDmg;
  e.flash = 0.09;
  e.vx += kbX;
  e.vy += kbY;
  sfx.playHit(isCrit);
  if (isCrit) state.hitstop = Math.max(state.hitstop, 0.016);

  spawnText(
    e.x + (Math.random() - 0.5) * 18,
    e.y - e.r - 8,
    isCrit ? `CRIT ${Math.round(bonusDmg)}!` : `${Math.round(bonusDmg)}`,
    isCrit ? "#ffd54a" : "#ffffff",
    isCrit ? 21 : 15
  );

  if (e.hp <= 0) {
    state.kills++;
    state.combo++;
    state.comboTimer = 2.6;
    if (state.combo >= 18 && state.fever <= 0) {
      state.fever = 5.5;
      sfx.setFever(true);
      showToast("🔥 狂热连击 FEVER！5秒攻速吸力暴涨！", "gold");
    }
    state.player.charge = Math.min(100, state.player.charge + (e.type === "mop" ? 40 : 4.2));
    sfx.playKill();

    const ang = Math.atan2(kbY || (e.y - state.player.y), kbX || (e.x - state.player.x));
    state.ragdolls.push({
      type: e.type,
      x: e.x,
      y: e.y,
      r: e.r,
      vx: Math.cos(ang) * 280,
      vy: Math.sin(ang) * 280,
      rot: 0,
      vrot: (Math.random() > 0.5 ? 1 : -1) * 14,
      life: 0.28,
      maxLife: 0.28,
    });
    spawnRing(e.x, e.y, 8, e.r * 2.2, isCrit ? "#ffd54a" : "#38f3ff", 4, 0.2);
    spawnParticles(e.x, e.y, isCrit ? "#ffd54a" : "#38f3ff", e.type === "mop" ? 28 : 10, 190, true);

    state.gems.push({ x: e.x, y: e.y, kind: "xp", val: e.xp, forcePull: false });
    if (Math.random() < 0.5) {
      state.gems.push({
        x: e.x + (Math.random() - 0.5) * 22,
        y: e.y + (Math.random() - 0.5) * 22,
        kind: "coin",
        val: Math.round((300 + state.wave * 180) * state.lootMult),
        forcePull: false,
      });
    }
    if (e.type === "mop") {
      state.shake = 0.9;
      // Boss EXCLUSIVELY drops a Super Golden Crate + 65% chance for Scarce Gold Core 💎!
      state.crates.push({ x: e.x, y: e.y, minVal: 28000, progress: 0, tickAcc: 0 });
      if (state.rng() < 0.65) {
        state.gems.push({ x: e.x + 28, y: e.y, kind: "core", val: 1, forcePull: false });
      }
      showToast("👑 击败拖把王！爆出 Boss 专属超级金箱与稀缺金核 💎！", "gold");
    }
    return true;
  }
  return false;
}

function damagePoop(idx, dmg) {
  const poop = state.poops[idx];
  poop.hp -= dmg;
  poop.flash = 0.08;
  if (poop.hp <= 0) {
    // Purifying poop with weapons instead of stepping on it rewards hidden cash!
    spawnParticles(poop.x, poop.y, "#ffd54a", 16, 170, true);
    spawnRing(poop.x, poop.y, 8, 65, "#39ff88", 4, 0.24);
    sfx.playBigGold();
    spawnText(poop.x, poop.y - 20, "✨ 净化粑粑 +¥3,500!", "#39ff88", 18);
    state.looseCoins += Math.round(3500 * state.lootMult);
    state.poops.splice(idx, 1);
  }
}

function shatterProp(prop) {
  spawnParticles(prop.x, prop.y, prop.kind === "snack" ? "#ff9848" : "#d4a373", 14, 180, true);
  spawnRing(prop.x, prop.y, 8, 46, "#ffd54a", 3.5, 0.2);
  sfx.playKill();
  for (let k = 0; k < 3; k++) {
    state.gems.push({
      x: prop.x + (Math.random() - 0.5) * 28,
      y: prop.y + (Math.random() - 0.5) * 28,
      kind: k === 0 ? "xp" : "coin",
      val: k === 0 ? 4 : Math.round(450 * state.lootMult),
      forcePull: false,
    });
  }
}

function updateWeapons(dt) {
  const p = state.player;
  const cdMult = (1 / state.fireRateMult) * (p.overdrive > 0 ? 0.45 : state.fever > 0 ? 0.65 : 1);

  // 1. Electric Fly Swatter
  if (p.weapons.swatter > 0) {
    p.cooldowns.swatter -= dt;
    if (p.cooldowns.swatter <= 0) {
      const lv = p.weapons.swatter;
      p.cooldowns.swatter = Math.max(0.3, (0.84 - lv * 0.1) * cdMult);
      const range = 106 + lv * 18;
      const dmg = 26 + lv * 14;
      let hitAny = false;
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= range + e.r) {
          hitAny = true;
          const crit = Math.random() < 0.28;
          if (damageEnemy(e, crit ? dmg * 1.85 : dmg, (dx / (d || 1)) * 200, (dy / (d || 1)) * 200, crit)) {
            state.enemies.splice(i, 1);
          }
        }
      }
      // Can purify pet poop safely at range!
      for (let i = state.poops.length - 1; i >= 0; i--) {
        if (Math.hypot(state.poops[i].x - p.x, state.poops[i].y - p.y) <= range + 16) {
          damagePoop(i, dmg);
        }
      }
      for (let i = state.props.length - 1; i >= 0; i--) {
        if (Math.hypot(state.props[i].x - p.x, state.props[i].y - p.y) <= range + 16) {
          shatterProp(state.props[i]);
          state.props.splice(i, 1);
        }
      }
      if (lv >= 3) spawnRing(p.x, p.y, 24, range, "#38f3ff", 7, 0.22);
      else state.vfx.push({ type: "swatter", x: p.x, y: p.y, r: range * 0.9, startA: p.facing - (1.2 + lv * 0.35), endA: p.facing + (1.2 + lv * 0.35), life: 0.2, maxLife: 0.2 });
      if (hitAny) {
        sfx.playZap();
        state.shake = Math.max(state.shake, 0.16);
      }
    }
  }

  // 2. Laser Pointer
  if (p.weapons.laser > 0) {
    p.cooldowns.laser -= dt;
    if (p.cooldowns.laser <= 0 && (state.enemies.length > 0 || state.poops.length > 0)) {
      const lv = p.weapons.laser;
      p.cooldowns.laser = Math.max(0.28, (0.82 - lv * 0.1) * cdMult);
      const sorted = [...state.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const shots = Math.min(sorted.length, lv);
      const dmg = 34 + lv * 18;
      for (let s = 0; s < shots; s++) {
        const target = sorted[s];
        if (!target || Math.hypot(target.x - p.x, target.y - p.y) > 400) continue;
        state.vfx.push({ type: "laser", x1: p.x, y1: p.y, x2: target.x, y2: target.y, life: 0.18, maxLife: 0.18 });
        const crit = Math.random() < 0.45;
        const idx = state.enemies.indexOf(target);
        if (idx >= 0 && damageEnemy(target, crit ? dmg * 1.9 : dmg, 0, 0, crit)) state.enemies.splice(idx, 1);
      }
      if (shots === 0 && state.poops.length > 0) {
        const pp = state.poops[0];
        if (Math.hypot(pp.x - p.x, pp.y - p.y) < 340) {
          state.vfx.push({ type: "laser", x1: p.x, y1: p.y, x2: pp.x, y2: pp.y, life: 0.18, maxLife: 0.18 });
          damagePoop(0, dmg);
        }
      }
      sfx.playLaser();
    }
  }

  // 3. Orbiting Spatulas
  if (p.weapons.spatula > 0) {
    const lv = p.weapons.spatula;
    const count = 1 + lv;
    const rad = 68 + lv * 7;
    const dmg = 28 + lv * 12;
    for (let i = 0; i < count; i++) {
      const a = state.time * 4.8 + (i / count) * Math.PI * 2;
      const sx = p.x + Math.cos(a) * rad;
      const sy = p.y + Math.sin(a) * rad;
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        if (Math.hypot(e.x - sx, e.y - sy) < e.r + 18 && e.flash <= 0) {
          if (damageEnemy(e, dmg, Math.cos(a) * 140, Math.sin(a) * 140, Math.random() < 0.2)) state.enemies.splice(j, 1);
        }
      }
    }
  }

  // 4. Hairdryer Turbo Cone
  if (p.weapons.hairdryer > 0) {
    p.cooldowns.hairdryer -= dt;
    if (p.cooldowns.hairdryer <= 0) {
      const lv = p.weapons.hairdryer;
      p.cooldowns.hairdryer = Math.max(0.55, (1.3 - lv * 0.13) * cdMult);
      const range = 165 + lv * 22;
      const dmg = 26 + lv * 15;
      state.vfx.push({ type: "hairdryer", x: p.x, y: p.y, r: range, angle: p.facing, life: 0.25, maxLife: 0.25 });
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > range + e.r) continue;
        let diff = Math.atan2(dy, dx) - p.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= 0.72) {
          if (damageEnemy(e, dmg, (dx / (d || 1)) * 320, (dy / (d || 1)) * 320, false)) state.enemies.splice(i, 1);
        }
      }
    }
  }

  // 5. Tesla Power Strip
  if (p.weapons.tesla > 0) {
    p.cooldowns.tesla -= dt;
    if (p.cooldowns.tesla <= 0 && state.enemies.length > 0) {
      const lv = p.weapons.tesla;
      p.cooldowns.tesla = Math.max(0.55, (1.25 - lv * 0.12) * cdMult);
      const jumps = 3 + lv * 2;
      const dmg = 34 + lv * 16;
      const pts = [{ x: p.x, y: p.y }];
      const hitSet = new Set();
      let cx = p.x;
      let cy = p.y;
      for (let k = 0; k < jumps; k++) {
        let best = null;
        let bestD = 260;
        for (const e of state.enemies) {
          if (hitSet.has(e)) continue;
          const d = Math.hypot(e.x - cx, e.y - cy);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (!best) break;
        hitSet.add(best);
        pts.push({ x: best.x, y: best.y });
        cx = best.x;
        cy = best.y;
        const idx = state.enemies.indexOf(best);
        if (idx >= 0 && damageEnemy(best, dmg, 0, 0, Math.random() < 0.3)) state.enemies.splice(idx, 1);
      }
      if (pts.length > 1) {
        state.vfx.push({ type: "tesla", pts, life: 0.22, maxLife: 0.22 });
        sfx.playZap();
      }
    }
  }
}

function buildLevelUpChoices() {
  const p = state.player;
  const pool = [];
  for (const w of Object.values(WEAPONS)) {
    const cur = p.weapons[w.id] || 0;
    if (cur < w.maxLv) {
      pool.push({ kind: "weapon", id: w.id, icon: w.icon, name: w.name, tag: cur === 0 ? "新外挂" : `LV ${cur} → ${cur + 1}`, desc: w.desc });
    }
  }
  for (const pa of Object.values(PASSIVES)) {
    pool.push({ kind: "passive", id: pa.id, icon: pa.icon, name: pa.name, tag: pa.tag, desc: pa.desc });
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function applyChoice(c) {
  const p = state.player;
  if (c.kind === "weapon") p.weapons[c.id] = (p.weapons[c.id] || 0) + 1;
  else if (c.id === "magnet") p.magnet *= 1.35;
  else if (c.id === "turbo") p.speed *= 1.14;
  else if (c.id === "battery") {
    p.maxHp += 25;
    p.hp = Math.min(p.maxHp, p.hp + 40);
  }
}

function openLevelUp() {
  state.phase = "levelup";
  sfx.playLevelUp();
  const choices = buildLevelUpChoices();
  const listEl = document.getElementById("choice-list");
  listEl.innerHTML = "";
  for (const c of choices) {
    const btn = document.createElement("button");
    btn.className = "choice-card";
    btn.innerHTML = `
      <div class="choice-icon">${c.icon}</div>
      <div>
        <div class="choice-title">${c.name}<span class="choice-tag">${c.tag}</span></div>
        <div class="choice-desc">${c.desc}</div>
      </div>
    `;
    btn.onclick = () => {
      applyChoice(c);
      screenLevelUp.hidden = true;
      state.phase = "playing";
      spawnRing(state.player.x, state.player.y, 16, 130, "#ffd54a", 7, 0.3);
      showToast(`✨ 焊上新外挂：${c.name}！`, "gold");
    };
    listEl.appendChild(btn);
  }
  document.getElementById("btn-take-all").onclick = () => {
    showRewardedAd("三选一我全都要", () => {
      choices.forEach(applyChoice);
      screenLevelUp.hidden = true;
      state.phase = "playing";
      sfx.playBigGold();
      spawnRing(state.player.x, state.player.y, 16, 180, "#ffd54a", 10, 0.36);
      showToast("🔥 贪心满载！3 件战术外挂全部焊上机身！", "gold");
    });
  };
  screenLevelUp.hidden = false;
}

function checkCleanlinessMilestones() {
  const pct = state.cleanTracker.percent;
  if (!state.milestones.m35 && pct >= 35) {
    state.milestones.m35 = true;
    state.dock.active = true;
    state.dock.progress = 0;
    sfx.setUrgent(true);
    sfx.playExtractTick(0.8);
    showToast("⚡ 清扫达 35%！充电桩撤离点已激活！可去撤离，或冲 70% 唤醒拖把王！", "green");
  }
  if (!state.milestones.m70 && pct >= 70) {
    state.milestones.m70 = true;
    sfx.playHordeHorn();
    spawnEnemy("mop", { x: 740, y: 820 });
    showToast("👑 清扫达 70%！全图大金 +30%，旋转拖把王苏醒（利用家具掩体撞晕它）！", "pink");
  }
  if (!state.milestones.m100 && pct >= 100) {
    state.milestones.m100 = true;
    state.coresEarned += 1;
    sfx.playExtractSuccess();
    spawnRing(state.player.x, state.player.y, 20, 360, "#39ff88", 12, 0.55);
    showJackpotBanner("100% 完美洁癖成就！", "+1 稀缺金核 💎", "✨ 客厅一尘不染 ✨");
  }
}

function finishRun(extracted) {
  state.phase = "ended";
  sfx.setUrgent(false);
  sfx.setFever(false);
  sfx.stopBgm();
  btnOverdrive.hidden = true;

  const totalVal = getTotalRunValue();
  const { safeItems, safeVal } = getSafeBoxValueAndItems();

  let earned = 0;
  let keptItems = [];
  if (extracted) {
    sfx.playExtractSuccess();
    save.extractStreak += 1;
    const streakMult = save.extractStreak >= 3 ? 1.5 : save.extractStreak === 2 ? 1.25 : 1;
    earned = Math.round(totalVal * streakMult);
    keptItems = [...state.bagLoot];
  } else {
    sfx.playDefeat();
    save.extractStreak = 0;
    earned = safeVal;
    keptItems = safeItems;
  }

  for (const item of keptItems) {
    if (!item.isGhost) save.museum[item.lootId] = (save.museum[item.lootId] || 0) + 1;
  }
  save.coins += earned;
  save.goldCores = (save.goldCores || 0) + state.coresEarned;
  save.totalExtracted += earned;
  save.runsPlayed += 1;
  if (extracted && earned > save.bestRunValue) save.bestRunValue = earned;
  writeSave(save);

  document.getElementById("res-eyebrow").textContent = extracted ? "EXTRACTION SUCCESS · 安全撤离" : "GREEDY WIPEOUT · 贪心翻车";
  document.getElementById("res-title").textContent = extracted ? "✅ 满载冲回充电桩！" : "💥 电量炸穿 · 贪心翻车！";
  document.getElementById("res-sub").textContent = extracted
    ? `客厅清扫 ${state.cleanTracker.percent}% · 带出 ${keptItems.length} 件大金${state.coresEarned > 0 ? ` + 💎${state.coresEarned} 金核` : ""}！`
    : `客厅清扫 ${state.cleanTracker.percent}% · 安全箱保底 ¥${safeVal.toLocaleString()}${state.coresEarned > 0 ? ` + 💎${state.coresEarned} 金核` : ""}。`;
  document.getElementById("res-k1").textContent = extracted ? "实际落袋" : "痛失估值";
  document.getElementById("res-v1").textContent = `¥${(extracted ? earned : Math.max(0, totalVal - safeVal)).toLocaleString()}`;
  document.getElementById("res-v2").textContent = `${state.cleanTracker.percent}% / ${state.kills}杀`;
  document.getElementById("res-v3").textContent = `¥${safeVal.toLocaleString()}`;

  const receiptImg = document.getElementById("receipt-img");
  receiptImg.style.display = "none";

  const adBtn = document.getElementById("btn-res-ad");
  if (!extracted && !state.revivedOnce) {
    adBtn.hidden = false;
    adBtn.textContent = "📺 紧急充电复活 + 3秒无敌（保住大金！）";
    adBtn.onclick = () => {
      showRewardedAd("紧急充电复活", () => {
        state.revivedOnce = true;
        save.coins = Math.max(0, save.coins - earned);
        writeSave(save);
        state.player.hp = state.player.maxHp;
        state.player.invuln = 3.2;
        state.player.charge = 100;
        state.phase = "playing";
        screenResult.hidden = true;
        btnOverdrive.hidden = false;
        sfx.startBgm("living");
        showToast("⚡ 满血满能量复活！立刻开过载冲回充电桩！", "green");
      });
    };
  } else if (extracted && !state.doubledOnce && earned > 0) {
    adBtn.hidden = false;
    adBtn.textContent = `📺 看激励视频 · 收益 ×2 再赚 ¥${earned.toLocaleString()}`;
    adBtn.onclick = () => {
      showRewardedAd("撤离收益 ×2", () => {
        state.doubledOnce = true;
        save.coins += earned;
        save.totalExtracted += earned;
        if (earned * 2 > save.bestRunValue) save.bestRunValue = earned * 2;
        writeSave(save);
        adBtn.hidden = true;
        document.getElementById("res-v1").textContent = `¥${(earned * 2).toLocaleString()}`;
        sfx.playBigGold();
        showToast(`💰 收益翻倍成功！共入账 ¥${(earned * 2).toLocaleString()}`, "gold");
      });
    };
  } else {
    adBtn.hidden = true;
  }

  const topLoot = [...state.bagLoot].sort((a, b) => b.value - a.value)[0];
  document.getElementById("btn-res-share").onclick = async () => {
    const shareUrl = buildChallengeUrl({
      seed: state.mode === "daily" ? state.seedStr : getTodaySeedString(),
      owner: save.playerName,
      value: Math.max(8800, topLoot ? topLoot.value : totalVal),
      lootId: topLoot ? topLoot.lootId : "catcan",
    });
    const text = extracted
      ? `我在《半夜扫地机：客厅摸金》清扫 ${state.cleanTracker.percent}% 并带走 ¥${earned.toLocaleString()}！来挑战今日客厅： ${shareUrl}`
      : `我在《半夜扫地机》贪心翻车，痛失 ¥${totalVal.toLocaleString()}！快点链接去客厅捡我的遗产： ${shareUrl}`;
    await copyToClipboard(text);
    showToast("🔗 已复制带遗产坐标的挑战文案！快发微信群或 X！", "pink");
  };

  document.getElementById("btn-res-receipt").onclick = () => {
    const dataUrl = renderReceiptPoster({
      extracted,
      value: extracted ? (state.doubledOnce ? earned * 2 : earned) : totalVal,
      cleanPct: state.cleanTracker.percent,
      wave: state.wave,
      kills: state.kills,
      lootNames: state.bagLoot.map((l) => `${l.short} (¥${l.value.toLocaleString()})`),
      modeLabel: state.mode === "daily" ? `今日同图榜 #${state.seedStr}` : "L型客厅模式",
      streak: save.extractStreak,
      rescuedGhost: state.rescuedGhost,
    });
    receiptImg.src = dataUrl;
    receiptImg.style.display = "block";
    showToast("🧾 摸金小票已生成！长按或右键即可保存晒图", "gold");
  };

  screenResult.hidden = false;
}

function update(rawDt) {
  if (!state || state.phase !== "playing") return;
  if (state.hitstop > 0) {
    state.hitstop -= rawDt;
    return;
  }
  let dt = rawDt;
  if (state.slowMo > 0) {
    state.slowMo -= rawDt;
    dt *= 0.28;
  }

  state.time += dt;
  state.shake = Math.max(0, state.shake - rawDt * 2.6);

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }
  if (state.fever > 0) {
    state.fever -= dt;
    if (state.fever <= 0) sfx.setFever(false);
  }

  const p = state.player;
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.poopSlow = Math.max(0, p.poopSlow - dt);
  if (p.overdrive > 0) {
    p.overdrive = Math.max(0, p.overdrive - dt);
    if (Math.random() < 0.5) spawnParticles(p.x, p.y, "#38f3ff", 1, 90, true);
  }

  // Smooth Q-Bouncy Inertia + Drift Feel!
  let ix = 0;
  let iy = 0;
  if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) iy -= 1;
  if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) iy += 1;
  if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) ix -= 1;
  if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) ix += 1;
  if (state.joy.active) {
    ix += state.joy.dx;
    iy += state.joy.dy;
  }
  const mag = Math.hypot(ix, iy);
  const moveSpd = p.speed * (p.overdrive > 0 ? 1.55 : p.poopSlow > 0 ? 0.55 : state.fever > 0 ? 1.18 : 1);
  const tx = mag > 0.05 ? (ix / Math.max(1, mag)) * moveSpd : 0;
  const ty = mag > 0.05 ? (iy / Math.max(1, mag)) * moveSpd : 0;
  const accel = Math.min(1, dt * 11);
  // Emit cute white drift dust puffs when making sharp turns!
  const turnDelta = Math.hypot(tx - p.vx, ty - p.vy);
  if (turnDelta > 180 && mag > 0.2 && Math.random() < 0.45) {
    spawnParticles(p.x, p.y + 10, "#e2e8f0", 2, 55, false);
  }
  p.vx += (tx - p.vx) * accel;
  p.vy += (ty - p.vy) * accel;

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampToRoom(p, p.r);

  if (Math.hypot(p.vx, p.vy) > 18) {
    p.facing = Math.atan2(p.vy, p.vx);
    if (p.poopSlow > 0) {
      // Roomba Poop Nightmare: smears brown trails back onto the floor!
      smearPoopAt(state.dustLayer, p.x, p.y, 20);
      state.cleanTracker.dirtyAt(p.x, p.y, 26);
    } else {
      const cleanR = p.overdrive > 0 ? 54 : 38;
      cleanDustAt(state.dustLayer, p.x, p.y, cleanR);
      const newly = state.cleanTracker.markClean(p.x, p.y, cleanR);
      if (newly > 0) {
        p.charge = Math.min(100, p.charge + newly * 0.7);
        checkCleanlinessMilestones();
      }
    }
  }

  // Camera
  const targetCamX = Math.max(vw / 2, Math.min(ROOM.width - vw / 2, p.x));
  const targetCamY = Math.max(vh / 2, Math.min(ROOM.height - vh / 2, p.y));
  state.cam.x += (targetCamX - state.cam.x) * Math.min(1, dt * 8.5);
  state.cam.y += (targetCamY - state.cam.y) * Math.min(1, dt * 8.5);

  // Interactive Power-Strip Shock Traps!
  for (const strip of state.shockStrips) {
    strip.cd = Math.max(0, strip.cd - dt);
    if (strip.cd <= 0 && Math.hypot(p.x - strip.x, p.y - strip.y) < 38) {
      strip.cd = 16;
      sfx.playOverdriveBlast();
      state.shake = 0.65;
      spawnRing(strip.x, strip.y, 16, 260, "#38f3ff", 10, 0.35);
      spawnText(strip.x, strip.y - 24, "⚡ 漏电插线板全屏麻痹！", "#38f3ff", 20);
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (Math.hypot(e.x - strip.x, e.y - strip.y) < 260) {
          e.stun = Math.max(e.stun, 1.8);
          if (damageEnemy(e, 75, 0, 0, true)) state.enemies.splice(i, 1);
        }
      }
    }
  }

  // Pet Poop Step-On Nightmare Check!
  for (let i = state.poops.length - 1; i >= 0; i--) {
    const poop = state.poops[i];
    poop.flash = Math.max(0, poop.flash - dt);
    if (Math.hypot(p.x - poop.x, p.y - poop.y) < p.r + 14 && p.overdrive <= 0) {
      p.poopSlow = 2.4;
      sfx.playPoopSplat();
      vibrate(40);
      state.shake = 0.5;
      smearPoopAt(state.dustLayer, poop.x, poop.y, 38);
      state.cleanTracker.dirtyAt(poop.x, poop.y, 44);
      spawnText(poop.x, poop.y - 24, "💩 踩雷！涂脏地板了！", "#c08457", 19);
      showToast("💩 扫地机终极噩梦！踩到粑粑减速并弄脏地板！（用武器远程清掉可爆金币）", "pink");
      state.poops.splice(i, 1);
    }
  }

  // Native Furniture Search Spots (Sofa cracks, under tables, TV console)
  for (const spot of state.nativeSpots) {
    if (spot.searched) continue;
    if (Math.hypot(p.x - spot.x, p.y - spot.y) < 62) {
      spot.progress += dt / 0.8;
      spot.tickAcc += dt;
      if (spot.tickAcc >= 0.14) {
        spot.tickAcc = 0;
        sfx.playCrateTick(spot.progress);
      }
      if (spot.progress >= 1) {
        spot.searched = true;
        grantLootReward(spot.x, spot.y, spot.minVal, `🔍 ${spot.label}出大金！`);
      }
    } else {
      spot.progress = Math.max(0, spot.progress - dt * 0.8);
    }
  }

  // Boss/Elite Mystery Crates
  for (let i = state.crates.length - 1; i >= 0; i--) {
    const cr = state.crates[i];
    if (Math.hypot(p.x - cr.x, p.y - cr.y) < 76) {
      cr.progress += dt / 0.85;
      cr.tickAcc += dt;
      if (cr.tickAcc >= 0.14) {
        cr.tickAcc = 0;
        sfx.playCrateTick(cr.progress);
      }
      if (cr.progress >= 1) {
        grantLootReward(cr.x, cr.y, cr.minVal, "👑 Boss 超级金箱出货！");
        state.crates.splice(i, 1);
      }
    } else {
      cr.progress = Math.max(0, cr.progress - dt * 0.8);
    }
  }

  // Ramming destructible props
  for (let i = state.props.length - 1; i >= 0; i--) {
    const pr = state.props[i];
    if (Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + 22) {
      shatterProp(pr);
      state.props.splice(i, 1);
    }
  }

  // Periodic Horde Swarm Timer!
  state.hordeTimer -= dt;
  if (state.hordeTimer <= 0) {
    state.hordeTimer = 26;
    triggerHordeSwarm();
  }

  // Charging Dock Extraction Check (unlocked at 35% Cleanliness!)
  if (state.dock.active) {
    if (Math.hypot(p.x - state.dock.x, p.y - state.dock.y) <= state.dock.radius) {
      state.dock.progress += dt / 3.0;
      state.dock.tickAcc += dt;
      if (state.dock.tickAcc >= 0.45) {
        state.dock.tickAcc = 0;
        sfx.playExtractTick(state.dock.progress);
        spawnRing(state.dock.x, state.dock.y, 30, 120, "#39ff88", 4, 0.26);
      }
      if (state.dock.progress >= 1) {
        finishRun(true);
        return;
      }
    } else {
      state.dock.progress = Math.max(0, state.dock.progress - dt * 0.5);
    }
  }

  // Ambient enemy spawns
  const spawnRate = Math.max(0.24, 0.72 - state.wave * 0.08);
  state.spawnAcc -= dt;
  if (state.spawnAcc <= 0 && state.enemies.length < 90) {
    state.spawnAcc = spawnRate;
    spawnEnemy();
  }

  // Real Tabby Cat Paw Slams
  if (state.time > 16) {
    state.pawAcc -= dt;
    if (state.pawAcc <= 0) {
      state.pawAcc = Math.max(6.5, 11.5 - state.wave * 1.1);
      state.catPaws.push({
        x: p.x + (Math.random() - 0.5) * 110,
        y: p.y + (Math.random() - 0.5) * 110,
        radius: 68,
        phase: "warn",
        warnDur: 1.25,
        timer: 1.25,
      });
    }
  }
  for (let i = state.catPaws.length - 1; i >= 0; i--) {
    const paw = state.catPaws[i];
    paw.timer -= dt;
    if (paw.phase === "warn" && paw.timer <= 0) {
      paw.phase = "slam";
      paw.timer = 0.55;
      state.shake = Math.max(state.shake, 0.6);
      sfx.playCatSlam();
      spawnRing(paw.x, paw.y, 16, paw.radius * 1.35, "#ff4c76", 7, 0.32);
      if (Math.hypot(p.x - paw.x, p.y - paw.y) < paw.radius + p.r * 0.55 && p.invuln <= 0) {
        p.hp -= 20;
        p.hurtFlash = 0.2;
        p.invuln = 0.7;
        sfx.playHurt();
        vibrate(30);
        spawnText(p.x, p.y - 26, "-20 🐾", "#ff4c76", 19);
      }
    } else if (paw.phase === "slam" && paw.timer <= 0) {
      state.catPaws.splice(i, 1);
    }
  }

  updateWeapons(dt);

  // Enemies AI (including Boss 3-Skill Bullet/Charge/Wall-Stun & Sock Poison Projectiles!)
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.flash = Math.max(0, e.flash - dt);
    if (e.stun > 0) {
      e.stun -= dt;
      continue;
    }

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.type === "mop") {
      // Boss 3-Skill State Machine!
      e.aiTimer -= dt;
      if (!e.summonedHalf && e.hp < e.maxHp * 0.55) {
        e.summonedHalf = true;
        showToast("🧹 拖把王半血狂暴！甩出 6 只毛球小弟！", "pink");
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          spawnEnemy("dust", { x: e.x + Math.cos(a) * 65, y: e.y + Math.sin(a) * 65 });
        }
      }
      if (e.aiState === "chase") {
        e.x += ((dx / d) * e.speed + e.vx) * dt;
        e.y += ((dy / d) * e.speed + e.vy) * dt;
        if (e.aiTimer <= 0) {
          if (Math.random() < 0.52) {
            // Skill 1: Red-line Telegraph High-Speed Charge!
            e.aiState = "windup";
            e.aiTimer = 0.85;
            e.chargeAng = Math.atan2(dy, dx);
          } else {
            // Skill 2: 360° Water-Drop Bullet Ring (blockable by sofa/furniture!)
            e.aiTimer = 3.2;
            const n = 10;
            for (let k = 0; k < n; k++) {
              const a = (k / n) * Math.PI * 2 + state.time;
              state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 8, dmg: 12, color: "#38f3ff", life: 3.0 });
            }
            spawnRing(e.x, e.y, 20, 95, "#38f3ff", 5, 0.25);
          }
        }
      } else if (e.aiState === "windup") {
        if (e.aiTimer <= 0) {
          e.aiState = "charge";
          e.aiTimer = 0.95;
          sfx.playZap();
        }
      } else if (e.aiState === "charge") {
        e.x += Math.cos(e.chargeAng) * 430 * dt;
        e.y += Math.sin(e.chargeAng) * 430 * dt;
        const hitWall = clampToRoom(e, e.r);
        if (hitWall) {
          // Tactical Cover Stun!
          e.aiState = "chase";
          e.aiTimer = 3.2;
          e.stun = 2.2;
          state.shake = 0.7;
          sfx.playBossStun();
          spawnRing(e.x, e.y, 18, 110, "#ffe066", 7, 0.3);
          showToast("💫 拖把王一头撞晕在家具上！伤害 +50%，快集火！", "gold");
        } else if (e.aiTimer <= 0) {
          e.aiState = "chase";
          e.aiTimer = 2.6;
        }
      }
      clampToRoom(e, e.r);
    } else {
      // Standard monsters + Sock ranged poison bubble!
      e.x += ((dx / d) * e.speed + e.vx) * dt;
      e.y += ((dy / d) * e.speed + e.vy) * dt;
      clampToRoom(e, e.r);
      if (e.type === "sock" && d < 320) {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          e.shootCd = 3.6;
          state.enemyBullets.push({ x: e.x, y: e.y, vx: (dx / d) * 175, vy: (dy / d) * 175, r: 7, dmg: 10, color: "#84cc16", life: 2.4 });
        }
      }
    }

    e.vx *= Math.pow(0.05, dt);
    e.vy *= Math.pow(0.05, dt);

    if (d < e.r + p.r - 3) {
      if (p.overdrive > 0) {
        if (damageEnemy(e, 60, (-dx / d) * 320, (-dy / d) * 320, true)) {
          state.enemies.splice(i, 1);
          continue;
        }
      } else if (p.invuln <= 0) {
        p.hp -= e.dmg;
        p.hurtFlash = 0.18;
        p.invuln = 0.55;
        state.shake = Math.max(state.shake, 0.35);
        sfx.playHurt();
        vibrate(20);
        spawnText(p.x, p.y - 24, `-${e.dmg}`, "#ff4c76", 18);
      }
    }
  }

  // Enemy Projectiles (blocked cleanly by Solid Furniture Obstacles!)
  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || pointHitsObstacle(b.x, b.y)) {
      spawnParticles(b.x, b.y, b.color, 4, 80, false);
      state.enemyBullets.splice(i, 1);
      continue;
    }
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r - 3 && p.invuln <= 0) {
      p.hp -= b.dmg;
      p.hurtFlash = 0.18;
      p.invuln = 0.5;
      sfx.playHurt();
      spawnText(p.x, p.y - 24, `-${b.dmg}`, "#ff4c76", 17);
      state.enemyBullets.splice(i, 1);
    }
  }

  if (p.hp <= 0) {
    p.hp = 0;
    finishRun(false);
    return;
  }

  // Gems, Coins & Rare Gold Core suction
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const g = state.gems[i];
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    if (g.forcePull || d < p.magnet * (state.fever > 0 ? 1.5 : 1)) {
      g.x += (dx / (d || 1)) * 560 * dt;
      g.y += (dy / (d || 1)) * 560 * dt;
    }
    if (d < p.r + 12) {
      p.charge = Math.min(100, p.charge + 1.5);
      if (g.kind === "core") {
        state.coresEarned += g.val;
        sfx.playBigGold();
        spawnText(p.x, p.y - 28, "+1 稀缺金核 💎!", "#38f3ff", 22);
      } else if (g.kind === "coin") {
        state.looseCoins += g.val;
        sfx.playXp();
      } else {
        p.xp += g.val;
        sfx.playXp();
        if (p.xp >= p.xpNext) {
          p.xp -= p.xpNext;
          p.lv += 1;
          p.xpNext = Math.round(p.xpNext * 1.38 + 6);
          openLevelUp();
        }
      }
      state.gems.splice(i, 1);
    }
  }

  // Friend Ghost Drop Pickup
  for (let i = state.lootDrops.length - 1; i >= 0; i--) {
    const drop = state.lootDrops[i];
    if (Math.hypot(p.x - drop.x, p.y - drop.y) < p.r + 32) {
      state.bagLoot.push(drop);
      sfx.playBigGold();
      vibrate(28);
      state.shake = 0.45;
      spawnParticles(drop.x, drop.y, "#ffd54a", 24, 210, true);
      showJackpotBanner(drop.name, drop.value, "📦 成功捡漏群友遗产！");
      if (drop.isGhost) state.rescuedGhost = drop.owner;
      state.lootDrops.splice(i, 1);
    }
  }

  // Ragdolls, VFX, Particles, Texts decay
  for (let i = state.ragdolls.length - 1; i >= 0; i--) {
    const r = state.ragdolls[i];
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.rot += r.vrot * dt;
    r.life -= dt;
    if (r.life <= 0) state.ragdolls.splice(i, 1);
  }
  for (let i = state.vfx.length - 1; i >= 0; i--) {
    state.vfx[i].life -= dt;
    if (state.vfx[i].life <= 0) state.vfx.splice(i, 1);
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const tx = state.texts[i];
    tx.y += tx.vy * dt;
    tx.life -= dt;
    if (tx.life <= 0) state.texts.splice(i, 1);
  }

  // Sync HUD
  document.getElementById("hud-hp").style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  document.getElementById("hud-val").textContent = `¥${Math.round(getTotalRunValue()).toLocaleString()}`;
  const lockedCount = Math.min(save.safeBoxSlots, state.bagLoot.length);
  document.getElementById("hud-safe").textContent = `🔒${lockedCount}/${save.safeBoxSlots}`;
  const timerEl = document.getElementById("hud-timer");
  const sec = Math.max(0, Math.ceil(state.hordeTimer));
  timerEl.textContent = `潮:${sec}s`;
  timerEl.classList.toggle("urgent", sec <= 5);
  document.getElementById("hud-xp").style.width = `${Math.min(100, (p.xp / p.xpNext) * 100)}%`;

  const cleanEl = document.getElementById("hud-clean");
  const pct = state.cleanTracker.percent;
  cleanEl.textContent = pct >= 100 ? "🧹 100% 完美!" : pct >= 70 ? `🧹 ${pct}% (冲100%💎)` : pct >= 35 ? `🧹 ${pct}% (可撤离)` : `🧹 ${pct}% (35%开撤)`;
  cleanEl.classList.toggle("done", pct >= 35);

  document.getElementById("hud-wave").textContent = `第${state.wave}波 · LV${p.lv}`;
  document.getElementById("hud-combo").textContent = state.fever > 0 ? "🔥FEVER" : state.combo >= 5 ? `${state.combo}连击` : "";

  const ready = p.charge >= 100;
  btnOverdrive.classList.toggle("ready", ready);
  odTxt.textContent = p.overdrive > 0 ? "暴走中!" : ready ? "过载清屏!" : `${Math.floor(p.charge)}%`;
}

// Workshop & Museum Shop (Dual Currency ready!)
function renderShop() {
  document.getElementById("shop-coins").textContent = `¥${Math.round(save.coins).toLocaleString()} · 💎${save.goldCores || 0}`;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentShopTab));
  const box = document.getElementById("shop-content");
  box.innerHTML = "";

  if (currentShopTab === "skins") {
    for (const sk of SKINS) {
      const owned = save.skinsOwned.includes(sk.id);
      const equipped = save.equippedSkin === sk.id;
      const needCore = sk.corePrice || 0;
      const canAfford = save.coins >= sk.price && (save.goldCores || 0) >= needCore;
      const priceLabel = needCore > 0 ? `¥${sk.price.toLocaleString()}+💎${needCore}` : `¥${sk.price.toLocaleString()}`;
      const row = document.createElement("div");
      row.className = "shop-item";
      row.innerHTML = `
        <div class="meta">
          <div class="name">${sk.name}</div>
          <div class="desc">${sk.desc}</div>
        </div>
        <button class="shop-btn ${equipped ? "owned" : ""}">${equipped ? "使用中" : owned ? "装备" : priceLabel}</button>
      `;
      const btn = row.querySelector("button");
      if (!owned && !canAfford) btn.disabled = true;
      btn.onclick = () => {
        if (owned) save.equippedSkin = sk.id;
        else if (canAfford) {
          save.coins -= sk.price;
          save.goldCores = (save.goldCores || 0) - needCore;
          save.skinsOwned.push(sk.id);
          save.equippedSkin = sk.id;
          sfx.playBigGold();
        }
        writeSave(save);
        renderShop();
        updateTitleUI();
      };
      box.appendChild(row);
    }
  } else if (currentShopTab === "upgrades") {
    const nextSlot = save.safeBoxSlots + 1;
    const slotPrice = SAFE_BOX_PRICES[nextSlot];
    const sbRow = document.createElement("div");
    sbRow.className = "shop-item";
    sbRow.innerHTML = `
      <div class="meta">
        <div class="name">🔒 尘盒安全箱扩容（当前 ${save.safeBoxSlots}/3 格）</div>
        <div class="desc">最贵大金自动锁进安全箱，贪心翻车也能保底带走！</div>
      </div>
      <button class="shop-btn ${!slotPrice ? "owned" : ""}">${slotPrice ? `¥${slotPrice.toLocaleString()}` : "已满级"}</button>
    `;
    const sbBtn = sbRow.querySelector("button");
    if (!slotPrice || save.coins < slotPrice) sbBtn.disabled = true;
    sbBtn.onclick = () => {
      if (slotPrice && save.coins >= slotPrice) {
        save.coins -= slotPrice;
        save.safeBoxSlots = nextSlot;
        writeSave(save);
        sfx.playBigGold();
        renderShop();
        updateTitleUI();
      }
    };
    box.appendChild(sbRow);

    for (const b of BOOSTERS) {
      const queued = Boolean(save.boosters[b.id]);
      const row = document.createElement("div");
      row.className = "shop-item";
      row.innerHTML = `
        <div class="meta">
          <div class="name">${b.icon} ${b.name}（黑市加注券）</div>
          <div class="desc">${b.desc}</div>
        </div>
        <button class="shop-btn ${queued ? "owned" : ""}">${queued ? "下局生效" : `¥${b.price.toLocaleString()}`}</button>
      `;
      const btn = row.querySelector("button");
      if (queued || save.coins < b.price) btn.disabled = true;
      btn.onclick = () => {
        if (save.coins >= b.price) {
          save.coins -= b.price;
          save.boosters[b.id] = true;
          writeSave(save);
          sfx.playLevelUp();
          renderShop();
          updateTitleUI();
        }
      };
      box.appendChild(row);
    }
  } else {
    for (const set of MUSEUM_SETS) {
      const done = set.items.every((id) => (save.museum[id] || 0) > 0);
      const row = document.createElement("div");
      row.className = "shop-item";
      row.innerHTML = `
        <div class="meta">
          <div class="name">${done ? "✅" : "🔒"} ${set.name}</div>
          <div class="desc">${set.buffText}</div>
        </div>
        <span style="font-size:11px;font-weight:800;color:${done ? "var(--green)" : "var(--muted)"}">${done ? "已激活" : "未集齐"}</span>
      `;
      box.appendChild(row);
    }
    for (const item of LOOT_ITEMS) {
      const count = save.museum[item.id] || 0;
      const row = document.createElement("div");
      row.className = "shop-item";
      row.innerHTML = `
        <div class="meta">
          <div class="name" style="color:${count > 0 ? item.color : "var(--muted)"}">${count > 0 ? "💎" : "❓"} ${count > 0 ? item.name : "未发现的沙发底大金"}</div>
          <div class="desc">基础估值 ¥${item.value.toLocaleString()} · 已带回 ${count} 件</div>
        </div>
      `;
      box.appendChild(row);
    }
  }
}

// Inputs
window.addEventListener("keydown", (e) => {
  if (state && state.phase === "playing") {
    state.keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      triggerOverdrive();
    }
  }
});
window.addEventListener("keyup", (e) => {
  if (state) state.keys.delete(e.code);
});
btnOverdrive.addEventListener("click", (e) => {
  e.stopPropagation();
  triggerOverdrive();
});

function startPointer(id, x, y) {
  if (!state || state.phase !== "playing") return;
  sfx.unlock();
  const rect = canvas.getBoundingClientRect();
  state.joy.active = true;
  state.joy.id = id;
  state.joy.ox = x - rect.left;
  state.joy.oy = y - rect.top;
  state.joy.cx = state.joy.ox;
  state.joy.cy = state.joy.oy;
  state.joy.dx = 0;
  state.joy.dy = 0;
}
function movePointer(id, x, y) {
  if (!state || !state.joy.active || state.joy.id !== id) return;
  const rect = canvas.getBoundingClientRect();
  const dx = x - rect.left - state.joy.ox;
  const dy = y - rect.top - state.joy.oy;
  const dist = Math.hypot(dx, dy);
  const maxR = 46;
  const clamp = Math.min(dist, maxR);
  const ang = Math.atan2(dy, dx);
  state.joy.cx = state.joy.ox + Math.cos(ang) * clamp;
  state.joy.cy = state.joy.oy + Math.sin(ang) * clamp;
  state.joy.dx = dist > 6 ? (Math.cos(ang) * clamp) / maxR : 0;
  state.joy.dy = dist > 6 ? (Math.sin(ang) * clamp) / maxR : 0;
}
function endPointer(id) {
  if (!state || state.joy.id !== id) return;
  state.joy.active = false;
  state.joy.dx = 0;
  state.joy.dy = 0;
}

canvas.addEventListener("pointerdown", (e) => startPointer(e.pointerId, e.clientX, e.clientY));
window.addEventListener("pointermove", (e) => movePointer(e.pointerId, e.clientX, e.clientY));
window.addEventListener("pointerup", (e) => endPointer(e.pointerId));
window.addEventListener("pointercancel", (e) => endPointer(e.pointerId));

document.getElementById("mode-free").onclick = () => {
  selectedMode = "free";
  updateTitleUI();
};
document.getElementById("mode-daily").onclick = () => {
  selectedMode = "daily";
  updateTitleUI();
};
document.getElementById("btn-play").onclick = startRun;
document.getElementById("btn-res-again").onclick = startRun;
document.getElementById("btn-shop").onclick = () => {
  renderShop();
  screenShop.hidden = false;
};
document.getElementById("btn-res-shop").onclick = () => {
  screenResult.hidden = true;
  renderShop();
  screenShop.hidden = false;
};
document.getElementById("btn-shop-close").onclick = () => {
  screenShop.hidden = true;
  if (!state || state.phase === "ended") {
    hudEl.hidden = true;
    btnOverdrive.hidden = true;
    updateTitleUI();
    screenTitle.hidden = false;
  }
};
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.onclick = () => {
    currentShopTab = btn.dataset.tab;
    renderShop();
  };
});
document.getElementById("btn-mute").onclick = (e) => {
  sfx.setMuted(!sfx.muted);
  e.target.textContent = sfx.muted ? "🔇" : "🔊";
};

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state) {
    update(dt);
    renderGame(ctx, state, vw, vh);
  } else {
    ctx.fillStyle = "#1b1d36";
    ctx.fillRect(0, 0, vw, vh);
  }
  requestAnimationFrame(loop);
}

updateTitleUI();
requestAnimationFrame(loop);
