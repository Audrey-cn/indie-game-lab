// Roomba Raid — Main Simulation, First-Run Onboarding, Extraction Loop & Meta Shop
import {
  ARENA,
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
import { renderGame, renderReceiptPoster } from "./renderer.mjs";

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

// Persistent Meta State
let save = loadSave(DEFAULT_SAVE);
const urlCtx = parseUrlContext();
let selectedMode = urlCtx.seed ? "daily" : "free";
let currentShopTab = "skins";

// Live Run State
let state = null;
let lastTs = 0;

// UI refs
const hudEl = document.getElementById("hud");
const toastEl = document.getElementById("toast");
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
  }, 3400);
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
  document.getElementById("st-best").textContent = `¥${Math.round(save.bestRunValue).toLocaleString()}`;
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

function startRun() {
  sfx.unlock();
  const isDaily = selectedMode === "daily";
  const seedStr = isDaily ? (urlCtx.seed || getTodaySeedString()) : String(Date.now());
  const rng = createRng(hashSeed(seedStr));

  const skin = getEquippedSkin();
  const museumBonus = getMuseumBonuses();
  const highRisk = Boolean(save.boosters.highrisk);
  const startLvUp = Boolean(save.boosters.lv3);
  const extraRadar = Boolean(save.boosters.radar);
  // Consume queued boosters
  save.boosters = {};
  writeSave(save);

  const maxHp = Math.round(100 * skin.bonus.hp);

  state = {
    phase: "playing", // playing | levelup | ended
    mode: isDaily ? "daily" : "free",
    seedStr,
    rng,
    time: 0,
    wave: 1,
    waveTimer: 35, // 35s per wave cycle
    highRisk,
    lootMult: skin.bonus.loot * museumBonus.lootMult * (highRisk ? 1.8 : 1),
    fireRateMult: museumBonus.fireRate,
    kills: 0,
    shake: 0,
    hitstop: 0,
    revivedOnce: false,
    doubledOnce: false,
    rescuedGhost: null,
    onboarding: {
      moved: false,
      firstLootSpawned: false,
      firstDockShown: false,
    },
    player: {
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      r: 22,
      facing: 0,
      hp: maxHp,
      maxHp,
      speed: 225 * skin.bonus.speed,
      magnet: 92,
      lv: 1,
      xp: 0,
      xpNext: 14,
      hurtFlash: 0,
      invuln: 0,
      skin: skin.id,
      weapons: { swatter: 1, laser: 0, spatula: 0, hairdryer: 0, tesla: 0 },
      cooldowns: { swatter: 0.2, laser: 0.4, hairdryer: 0.6, tesla: 0.8 },
    },
    cam: { x: ARENA.width / 2, y: ARENA.height / 2 },
    bagLoot: [], // { lootId, name, short, value, rarity }
    looseCoins: 0,
    enemies: [],
    gems: [],
    lootDrops: [],
    catPaws: [],
    vfx: [],
    particles: [],
    texts: [],
    dock: {
      active: false,
      x: 220,
      y: 260,
      radius: 66,
      progress: 0,
      tickAcc: 0,
    },
    spawnAcc: 0,
    lootAcc: 8,
    pawAcc: 16,
    bossSpawnedWave: 0,
    keys: new Set(),
    joy: { active: false, id: null, ox: 0, oy: 0, cx: 0, cy: 0, dx: 0, dy: 0 },
  };

  // Spawn Friend Ghost Drop if came from a challenge link!
  if (urlCtx.ghostDrop) {
    state.lootDrops.push({
      x: ARENA.width / 2 + (rng() > 0.5 ? 240 : -240),
      y: ARENA.height / 2 - 220,
      isGhost: true,
      owner: urlCtx.ghostDrop.owner,
      lootId: urlCtx.ghostDrop.lootId,
      short: `@${urlCtx.ghostDrop.owner}遗产`,
      name: `@${urlCtx.ghostDrop.owner}的翻车遗产`,
      value: urlCtx.ghostDrop.value,
      rarity: "red",
    });
  }

  // First-Run Instant Hook: Spawn an immediate welcome ring of 7 dust-bunnies + 1 nearby glowing Big Gold so action starts at t=0.5s!
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const dist = 165 + (i % 2) * 55;
    state.enemies.push({
      type: "dust",
      x: state.player.x + Math.cos(a) * dist,
      y: state.player.y + Math.sin(a) * dist,
      r: 16,
      hp: 24,
      maxHp: 24,
      speed: 82,
      dmg: 8,
      xp: 4,
      vx: 0,
      vy: 0,
      flash: 0,
      seed: i * 1.3,
    });
  }
  spawnBigGold(205, 8800);
  state.onboarding.firstLootSpawned = true;

  // Extra Big Gold from Black Market Radar booster
  if (extraRadar) {
    spawnBigGold(260, 12000);
    spawnBigGold(360, 18800);
  }

  screenTitle.hidden = true;
  screenResult.hidden = true;
  screenShop.hidden = true;
  screenLevelUp.hidden = true;
  hudEl.hidden = false;

  showToast("👆 单指拖动 / WASD 移动，扫地机自动电击割草！");

  if (startLvUp) {
    setTimeout(() => {
      if (state && state.phase === "playing") openLevelUp();
    }, 350);
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

function spawnParticles(x, y, color, count = 8, speed = 130) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.4 + Math.random() * 0.8);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: 3 + Math.random() * 4.5,
      color,
      life: 0.35 + Math.random() * 0.25,
      maxLife: 0.6,
    });
  }
}

function spawnText(x, y, text, color = "#ffffff", size = 16) {
  state.texts.push({ x, y, text, color, size, vy: -52, life: 0.72, maxLife: 0.72 });
}

function spawnBigGold(dist = 240, minVal = 0, forcedPos = null) {
  const item = pickWeightedLoot(state.rng, minVal);
  const ang = state.rng() * Math.PI * 2;
  const x = forcedPos ? forcedPos.x : Math.max(90, Math.min(ARENA.width - 90, state.player.x + Math.cos(ang) * dist));
  const y = forcedPos ? forcedPos.y : Math.max(120, Math.min(ARENA.height - 90, state.player.y + Math.sin(ang) * dist));
  const waveScale = 1 + (state.wave - 1) * 0.55;
  const val = Math.round(item.value * waveScale * state.lootMult);
  state.lootDrops.push({
    x,
    y,
    lootId: item.id,
    name: item.name,
    short: item.short,
    value: val,
    rarity: item.rarity,
    isGhost: false,
  });
}

function spawnEnemy(forcedType = null) {
  const p = state.player;
  const ang = Math.random() * Math.PI * 2;
  const dist = Math.max(vw, vh) * 0.56 + 40;
  const x = Math.max(40, Math.min(ARENA.width - 40, p.x + Math.cos(ang) * dist));
  const y = Math.max(80, Math.min(ARENA.height - 40, p.y + Math.sin(ang) * dist));

  let type = forcedType;
  if (!type) {
    const r = Math.random();
    if (state.wave >= 2 && r < 0.22) type = "sock";
    else if (state.wave >= 2 && r < 0.34) type = "lego";
    else type = "dust";
  }

  const hpScale = (1 + (state.wave - 1) * 0.55) * (state.highRisk ? 1.35 : 1);
  const specs = {
    dust: { r: 16, hp: 28 * hpScale, speed: 78 + state.wave * 8, dmg: 9, xp: 4 },
    sock: { r: 18, hp: 52 * hpScale, speed: 102 + state.wave * 9, dmg: 13, xp: 7 },
    lego: { r: 19, hp: 90 * hpScale, speed: 58 + state.wave * 5, dmg: 18, xp: 10 },
    mop: { r: 34, hp: 360 * hpScale, speed: 92 + state.wave * 8, dmg: 22, xp: 28 },
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
    seed: Math.random() * 10,
  });
}

function damageEnemy(e, dmg, kbX = 0, kbY = 0, isCrit = false) {
  e.hp -= dmg;
  e.flash = 0.08;
  e.vx += kbX;
  e.vy += kbY;
  sfx.playHit(isCrit);
  spawnText(
    e.x + (Math.random() - 0.5) * 16,
    e.y - e.r - 6,
    isCrit ? `CRIT ${Math.round(dmg)}!` : `${Math.round(dmg)}`,
    isCrit ? "#ffd54a" : "#ffffff",
    isCrit ? 19 : 14
  );
  if (e.hp <= 0) {
    state.kills++;
    spawnParticles(e.x, e.y, e.type === "mop" ? "#38f3ff" : "#ffd54a", e.type === "mop" ? 22 : 9, 170);
    state.gems.push({ x: e.x, y: e.y, kind: "xp", val: e.xp });
    if (Math.random() < 0.45) {
      state.gems.push({
        x: e.x + (Math.random() - 0.5) * 20,
        y: e.y + (Math.random() - 0.5) * 20,
        kind: "coin",
        val: Math.round((250 + state.wave * 150) * state.lootMult),
      });
    }
    if (e.type === "mop") {
      state.shake = 0.7;
      spawnBigGold(0, 18800, { x: e.x, y: e.y });
      showToast("🧹 击败拖把 Boss！爆出高价值大金！", "gold");
    }
    return true;
  }
  return false;
}

function updateWeapons(dt) {
  const p = state.player;
  const cdMult = 1 / state.fireRateMult;

  // 1. Electric Fly Swatter (360 / wide arc zap + knockback)
  if (p.weapons.swatter > 0) {
    p.cooldowns.swatter -= dt;
    if (p.cooldowns.swatter <= 0) {
      const lv = p.weapons.swatter;
      p.cooldowns.swatter = Math.max(0.45, (1.05 - lv * 0.1) * cdMult);
      const range = 92 + lv * 14;
      const dmg = 26 + lv * 12;
      let hitAny = false;
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= range + e.r) {
          hitAny = true;
          const crit = Math.random() < 0.22;
          const kb = 160;
          if (damageEnemy(e, crit ? dmg * 1.8 : dmg, (dx / (d || 1)) * kb, (dy / (d || 1)) * kb, crit)) {
            state.enemies.splice(i, 1);
          }
        }
      }
      state.vfx.push({ type: "swatter", x: p.x, y: p.y, r: range * 0.88, angle: p.facing, life: 0.18, maxLife: 0.18 });
      if (hitAny) {
        sfx.playZap();
        state.shake = Math.max(state.shake, 0.16);
      }
    }
  }

  // 2. Laser Pointer (auto-lock piercing high-crit beam)
  if (p.weapons.laser > 0) {
    p.cooldowns.laser -= dt;
    if (p.cooldowns.laser <= 0 && state.enemies.length > 0) {
      const lv = p.weapons.laser;
      p.cooldowns.laser = Math.max(0.35, (0.95 - lv * 0.11) * cdMult);
      // Lock closest enemies
      const sorted = [...state.enemies].sort(
        (a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)
      );
      const shots = Math.min(sorted.length, 1 + Math.floor((lv + 1) / 2));
      const dmg = 34 + lv * 16;
      for (let s = 0; s < shots; s++) {
        const target = sorted[s];
        if (!target || Math.hypot(target.x - p.x, target.y - p.y) > 360) continue;
        state.vfx.push({ type: "laser", x1: p.x, y1: p.y, x2: target.x, y2: target.y, life: 0.16, maxLife: 0.16 });
        const crit = Math.random() < 0.4;
        const idx = state.enemies.indexOf(target);
        if (idx >= 0 && damageEnemy(target, crit ? dmg * 1.9 : dmg, 0, 0, crit)) {
          state.enemies.splice(idx, 1);
        }
      }
      sfx.playLaser();
    }
  }

  // 3. Orbiting Duct-Tape Spatulas
  if (p.weapons.spatula > 0) {
    const lv = p.weapons.spatula;
    const count = 1 + lv;
    const rad = 64 + lv * 6;
    const dmg = (18 + lv * 8) * dt * 5.2;
    for (let i = 0; i < count; i++) {
      const a = state.time * 4.4 + (i / count) * Math.PI * 2;
      const sx = p.x + Math.cos(a) * rad;
      const sy = p.y + Math.sin(a) * rad;
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        if (Math.hypot(e.x - sx, e.y - sy) < e.r + 16 && e.flash <= 0) {
          if (damageEnemy(e, dmg * 2.5, Math.cos(a) * 110, Math.sin(a) * 110, Math.random() < 0.15)) {
            state.enemies.splice(j, 1);
          }
        }
      }
    }
  }

  // 4. Hairdryer Turbo Cone (directional knockback blast)
  if (p.weapons.hairdryer > 0) {
    p.cooldowns.hairdryer -= dt;
    if (p.cooldowns.hairdryer <= 0) {
      const lv = p.weapons.hairdryer;
      p.cooldowns.hairdryer = Math.max(0.7, (1.5 - lv * 0.14) * cdMult);
      const range = 145 + lv * 18;
      const dmg = 24 + lv * 13;
      state.vfx.push({ type: "hairdryer", x: p.x, y: p.y, r: range, angle: p.facing, life: 0.24, maxLife: 0.24 });
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > range + e.r) continue;
        let diff = Math.atan2(dy, dx) - p.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= 0.65) {
          if (damageEnemy(e, dmg, (dx / (d || 1)) * 280, (dy / (d || 1)) * 280, false)) {
            state.enemies.splice(i, 1);
          }
        }
      }
    }
  }

  // 5. Tesla Power Strip (chain lightning!)
  if (p.weapons.tesla > 0) {
    p.cooldowns.tesla -= dt;
    if (p.cooldowns.tesla <= 0 && state.enemies.length > 0) {
      const lv = p.weapons.tesla;
      p.cooldowns.tesla = Math.max(0.65, (1.45 - lv * 0.14) * cdMult);
      const jumps = 2 + lv;
      const dmg = 30 + lv * 14;
      const pts = [{ x: p.x, y: p.y }];
      const hitSet = new Set();
      let cx = p.x;
      let cy = p.y;
      for (let k = 0; k < jumps; k++) {
        let best = null;
        let bestD = 240;
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
        if (idx >= 0 && damageEnemy(best, dmg, 0, 0, Math.random() < 0.25)) {
          state.enemies.splice(idx, 1);
        }
      }
      if (pts.length > 1) {
        state.vfx.push({ type: "tesla", pts, life: 0.2, maxLife: 0.2 });
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
      pool.push({
        kind: "weapon",
        id: w.id,
        icon: w.icon,
        name: w.name,
        tag: cur === 0 ? "新武器" : `LV ${cur} → ${cur + 1}`,
        desc: w.desc,
      });
    }
  }
  for (const pa of Object.values(PASSIVES)) {
    pool.push({
      kind: "passive",
      id: pa.id,
      icon: pa.icon,
      name: pa.name,
      tag: pa.tag,
      desc: pa.desc,
    });
  }
  // Shuffle deterministically with run rng
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function applyChoice(c) {
  const p = state.player;
  if (c.kind === "weapon") {
    p.weapons[c.id] = (p.weapons[c.id] || 0) + 1;
  } else if (c.id === "magnet") {
    p.magnet *= 1.35;
  } else if (c.id === "turbo") {
    p.speed *= 1.14;
  } else if (c.id === "battery") {
    p.maxHp += 25;
    p.hp = Math.min(p.maxHp, p.hp + 35);
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
      showToast(`✨ 装备升级：${c.name}`, "gold");
    };
    listEl.appendChild(btn);
  }

  document.getElementById("btn-take-all").onclick = () => {
    showRewardedAd("三选一我全都要", () => {
      choices.forEach(applyChoice);
      screenLevelUp.hidden = true;
      state.phase = "playing";
      sfx.playBigGold();
      showToast("🔥 贪心满载！3 件战术外挂全部焊上机身！", "gold");
    });
  };

  screenLevelUp.hidden = false;
}

function activateDockForWave() {
  // Place Charging Dock on the opposite quadrant of the living room for exciting extraction sprint!
  const p = state.player;
  state.dock.x = p.x > ARENA.width / 2 ? 190 : ARENA.width - 190;
  state.dock.y = p.y > ARENA.height / 2 ? 220 : ARENA.height - 220;
  state.dock.active = true;
  state.dock.progress = 0;
  if (!state.onboarding.firstDockShown) {
    state.onboarding.firstDockShown = true;
    showToast("⚡ 充电桩已亮！踩绿圈 3 秒安全撤离，或留下来贪下一波(价值×1.55)！", "green");
  } else {
    showToast(`⚡ 第 ${state.wave} 波充电桩已开启！见好就收还是继续贪？`, "green");
  }
}

function finishRun(extracted) {
  state.phase = "ended";
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

  // Record museum collection & update save
  for (const item of keptItems) {
    if (!item.isGhost) {
      save.museum[item.lootId] = (save.museum[item.lootId] || 0) + 1;
    }
  }
  save.coins += earned;
  save.totalExtracted += earned;
  save.runsPlayed += 1;
  if (extracted && earned > save.bestRunValue) save.bestRunValue = earned;
  writeSave(save);

  // Populate Result Modal
  document.getElementById("res-eyebrow").textContent = extracted ? "EXTRACTION SUCCESS · 安全撤离" : "GREEDY WIPEOUT · 贪心翻车";
  document.getElementById("res-title").textContent = extracted ? "✅ 满载冲回充电桩！" : "💥 电量炸穿 · 贪心翻车！";
  document.getElementById("res-sub").textContent = extracted
    ? `成功带出 ${keptItems.length} 件大金！${save.extractStreak >= 2 ? `（触发 ${save.extractStreak} 连撤收益加成！）` : ""}`
    : `未撤离的 ¥${Math.max(0, totalVal - safeVal).toLocaleString()} 已散落客厅！好在安全箱保住了 ¥${safeVal.toLocaleString()}。`;
  document.getElementById("res-k1").textContent = extracted ? "实际落袋" : "痛失估值";
  document.getElementById("res-v1").textContent = `¥${(extracted ? earned : Math.max(0, totalVal - safeVal)).toLocaleString()}`;
  document.getElementById("res-v2").textContent = `${state.wave}波 / ${state.kills}杀`;
  document.getElementById("res-v3").textContent = `¥${safeVal.toLocaleString()}`;

  const receiptImg = document.getElementById("receipt-img");
  receiptImg.style.display = "none";

  // IAA Button: Revive on defeat, or x2 on extraction!
  const adBtn = document.getElementById("btn-res-ad");
  if (!extracted && !state.revivedOnce) {
    adBtn.hidden = false;
    adBtn.textContent = "📺 紧急充电复活 + 3秒无敌（保住大金！）";
    adBtn.onclick = () => {
      showRewardedAd("紧急充电复活", () => {
        state.revivedOnce = true;
        // Revert saved safe-box payout since run continues
        save.coins = Math.max(0, save.coins - earned);
        writeSave(save);
        state.player.hp = state.player.maxHp;
        state.player.invuln = 3.2;
        state.phase = "playing";
        screenResult.hidden = true;
        showToast("⚡ 紧急充电成功！快冲回绿圈充电桩！", "green");
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

  // Share Challenge Link (with Ghost Loot Drop!)
  const topLoot = [...state.bagLoot].sort((a, b) => b.value - a.value)[0];
  document.getElementById("btn-res-share").onclick = async () => {
    const shareUrl = buildChallengeUrl({
      seed: state.mode === "daily" ? state.seedStr : getTodaySeedString(),
      owner: save.playerName,
      value: Math.max(8800, topLoot ? topLoot.value : totalVal),
      lootId: topLoot ? topLoot.lootId : "catcan",
    });
    const text = extracted
      ? `我在《半夜扫地机：客厅摸金》带走了 ¥${earned.toLocaleString()}！敢来挑战今日客厅吗？ ${shareUrl}`
      : `我在《半夜扫地机》第${state.wave}波贪心翻车，痛失 ¥${totalVal.toLocaleString()}！快点链接去客厅捡我的遗产： ${shareUrl}`;
    await copyToClipboard(text);
    showToast("🔗 已复制带遗产坐标的挑战文案！快发微信群或 X！", "pink");
  };

  // Generate Canvas Receipt Poster
  document.getElementById("btn-res-receipt").onclick = () => {
    const dataUrl = renderReceiptPoster({
      extracted,
      value: extracted ? (state.doubledOnce ? earned * 2 : earned) : totalVal,
      wave: state.wave,
      kills: state.kills,
      lootNames: state.bagLoot.map((l) => `${l.short} (¥${l.value.toLocaleString()})`),
      modeLabel: state.mode === "daily" ? `今日同图榜 #${state.seedStr}` : "自由客厅模式",
      streak: save.extractStreak,
      rescuedGhost: state.rescuedGhost,
    });
    receiptImg.src = dataUrl;
    receiptImg.style.display = "block";
    showToast("🧾 摸金小票已生成！长按或右键即可保存晒图", "gold");
  };

  screenResult.hidden = false;
}

function update(dt) {
  if (!state || state.phase !== "playing") return;
  if (state.hitstop > 0) {
    state.hitstop -= dt;
    return;
  }

  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 2.4);

  const p = state.player;
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  // Input vector (Keyboard + Touch/Mouse Joystick)
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
  if (mag > 0.05) {
    if (!state.onboarding.moved) state.onboarding.moved = true;
    const nx = ix / Math.max(1, mag);
    const ny = iy / Math.max(1, mag);
    p.x = Math.max(p.r + 10, Math.min(ARENA.width - p.r - 10, p.x + nx * p.speed * dt));
    p.y = Math.max(p.r + 68, Math.min(ARENA.height - p.r - 10, p.y + ny * p.speed * dt));
    p.facing = Math.atan2(ny, nx);
  }

  // Smooth camera follow clamped to arena
  const targetCamX = Math.max(vw / 2, Math.min(ARENA.width - vw / 2, p.x));
  const targetCamY = Math.max(vh / 2, Math.min(ARENA.height - vh / 2, p.y));
  state.cam.x += (targetCamX - state.cam.x) * Math.min(1, dt * 8);
  state.cam.y += (targetCamY - state.cam.y) * Math.min(1, dt * 8);

  // First-Run Onboarding: Guarantee a juicy Big Gold spawn at t=14s nearby!
  if (!state.onboarding.firstLootSpawned && state.time >= 14) {
    state.onboarding.firstLootSpawned = true;
    spawnBigGold(210, 8800);
    sfx.playBigGold();
    showToast("💎 沙发缝刷新发光大金！快冲过去吸进肚子里！", "gold");
  }

  // Wave & Charging Dock Director
  state.waveTimer -= dt;
  if (state.waveTimer <= 0) {
    if (!state.dock.active) {
      activateDockForWave();
      state.waveTimer = 18; // Dock stays open 18s before wave escalates!
    } else {
      // Player stayed greedy! Escalate wave & multiply risk/rewards!
      state.dock.active = false;
      state.wave += 1;
      state.waveTimer = 32;
      spawnBigGold(280, 18800);
      showToast(`🔥 贪心进入第 ${state.wave} 波！大金估值暴涨，怪潮暴走！`, "pink");
      if (state.wave >= 2 && state.bossSpawnedWave < state.wave) {
        state.bossSpawnedWave = state.wave;
        spawnEnemy("mop");
      }
    }
  }

  // Charging Dock extraction check
  if (state.dock.active) {
    const distDock = Math.hypot(p.x - state.dock.x, p.y - state.dock.y);
    if (distDock <= state.dock.radius) {
      state.dock.progress += dt / 3.0;
      state.dock.tickAcc += dt;
      if (state.dock.tickAcc >= 0.45) {
        state.dock.tickAcc = 0;
        sfx.playExtractTick(state.dock.progress);
      }
      if (state.dock.progress >= 1) {
        finishRun(true);
        return;
      }
    } else {
      state.dock.progress = Math.max(0, state.dock.progress - dt * 0.6);
    }
  }

  // Periodic enemy spawns
  const spawnRate = Math.max(0.22, 0.85 - state.wave * 0.14);
  state.spawnAcc -= dt;
  if (state.spawnAcc <= 0 && state.enemies.length < 75) {
    state.spawnAcc = spawnRate;
    spawnEnemy();
  }

  // Periodic Big Gold drops
  state.lootAcc -= dt;
  if (state.lootAcc <= 0 && state.lootDrops.length < 4) {
    state.lootAcc = Math.max(12, 20 - state.wave * 2);
    spawnBigGold(310, state.wave >= 2 ? 12000 : 8800);
  }

  // Cat Paw slam hazard (starts at t=22s)
  if (state.time > 22) {
    state.pawAcc -= dt;
    if (state.pawAcc <= 0) {
      state.pawAcc = Math.max(6.5, 12 - state.wave * 1.4);
      state.catPaws.push({
        x: p.x + (Math.random() - 0.5) * 110,
        y: p.y + (Math.random() - 0.5) * 110,
        radius: 66,
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
      paw.timer = 0.4;
      state.shake = Math.max(state.shake, 0.45);
      sfx.playCatSlam();
      if (Math.hypot(p.x - paw.x, p.y - paw.y) < paw.radius + p.r * 0.6 && p.invuln <= 0) {
        p.hp -= 22;
        p.hurtFlash = 0.2;
        p.invuln = 0.7;
        sfx.playHurt();
        vibrate(30);
        spawnText(p.x, p.y - 26, "-22 🐾", "#ff4c76", 18);
      }
    } else if (paw.phase === "slam" && paw.timer <= 0) {
      state.catPaws.splice(i, 1);
    }
  }

  // Weapons auto-fire
  updateWeapons(dt);

  // Move enemies & contact damage
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.flash = Math.max(0, e.flash - dt);
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += ((dx / d) * e.speed + e.vx) * dt;
    e.y += ((dy / d) * e.speed + e.vy) * dt;
    e.vx *= Math.pow(0.06, dt);
    e.vy *= Math.pow(0.06, dt);

    if (d < e.r + p.r - 4 && p.invuln <= 0) {
      p.hp -= e.dmg;
      p.hurtFlash = 0.18;
      p.invuln = 0.55;
      state.shake = Math.max(state.shake, 0.32);
      sfx.playHurt();
      vibrate(20);
      spawnText(p.x, p.y - 24, `-${e.dmg}`, "#ff4c76", 17);
    }
  }

  if (p.hp <= 0) {
    p.hp = 0;
    finishRun(false);
    return;
  }

  // Gems & Coins magnet pickup
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const g = state.gems[i];
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d < p.magnet) {
      g.x += (dx / (d || 1)) * 460 * dt;
      g.y += (dy / (d || 1)) * 460 * dt;
    }
    if (d < p.r + 10) {
      if (g.kind === "coin") {
        state.looseCoins += g.val;
        sfx.playXp();
      } else {
        p.xp += g.val;
        sfx.playXp();
        if (p.xp >= p.xpNext) {
          p.xp -= p.xpNext;
          p.lv += 1;
          p.xpNext = Math.round(p.xpNext * 1.42 + 8);
          openLevelUp();
        }
      }
      state.gems.splice(i, 1);
    }
  }

  // Big Gold Loot & Friend Ghost Drop pickup
  for (let i = state.lootDrops.length - 1; i >= 0; i--) {
    const drop = state.lootDrops[i];
    const d = Math.hypot(p.x - drop.x, p.y - drop.y);
    if (d < p.r + 28) {
      state.bagLoot.push(drop);
      sfx.playBigGold();
      vibrate(25);
      state.shake = Math.max(state.shake, 0.35);
      spawnParticles(drop.x, drop.y, "#ffd54a", 20, 190);
      spawnText(drop.x, drop.y - 24, `+¥${drop.value.toLocaleString()}!`, "#ffd54a", 22);
      if (drop.isGhost) {
        state.rescuedGhost = drop.owner;
        showToast(`📦 成功捡走群友 @${drop.owner} 的 ¥${drop.value.toLocaleString()} 遗产！快撤离！`, "pink");
      } else {
        showToast(`💎 吸到大金【${drop.short}】+¥${drop.value.toLocaleString()}！`, "gold");
      }
      state.lootDrops.splice(i, 1);
    }
  }

  // VFX, particles, texts decay
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
  const sec = Math.max(0, Math.ceil(state.waveTimer));
  timerEl.textContent = state.dock.active ? `⚡${sec}s` : `00:${String(sec).padStart(2, "0")}`;
  timerEl.classList.toggle("urgent", state.dock.active && sec <= 8);
  document.getElementById("hud-xp").style.width = `${Math.min(100, (p.xp / p.xpNext) * 100)}%`;
  document.getElementById("hud-wave").textContent = `第 ${state.wave} 波 · 估值 ×${(1 + (state.wave - 1) * 0.55).toFixed(1)}`;
  document.getElementById("hud-lv").textContent = `LV ${p.lv}`;
}

// Workshop & Museum Shop UI
function renderShop() {
  document.getElementById("shop-coins").textContent = `¥${Math.round(save.coins).toLocaleString()}`;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentShopTab));
  const box = document.getElementById("shop-content");
  box.innerHTML = "";

  if (currentShopTab === "skins") {
    for (const sk of SKINS) {
      const owned = save.skinsOwned.includes(sk.id);
      const equipped = save.equippedSkin === sk.id;
      const row = document.createElement("div");
      row.className = "shop-item";
      row.innerHTML = `
        <div class="meta">
          <div class="name">${sk.name}</div>
          <div class="desc">${sk.desc}</div>
        </div>
        <button class="shop-btn ${equipped ? "owned" : ""}">${equipped ? "使用中" : owned ? "装备" : `¥${sk.price.toLocaleString()}`}</button>
      `;
      const btn = row.querySelector("button");
      if (!owned && save.coins < sk.price) btn.disabled = true;
      btn.onclick = () => {
        if (owned) {
          save.equippedSkin = sk.id;
        } else if (save.coins >= sk.price) {
          save.coins -= sk.price;
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
    // Safe Box Slot Upgrade (1 -> 2 -> 3)
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
    if (!slotPrice || save.coins < slotPrice) sbBtn.disabled = !slotPrice || save.coins < slotPrice;
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

    // Black Market One-Run Boosters (Money Sink!)
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
    // Museum Showcase & Set Buffs
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

// Input Listeners (Touch / Mouse virtual joystick + Keyboard)
window.addEventListener("keydown", (e) => {
  if (state && state.phase === "playing") state.keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  if (state) state.keys.delete(e.code);
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
  const px = x - rect.left;
  const py = y - rect.top;
  const dx = px - state.joy.ox;
  const dy = py - state.joy.oy;
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

// Button bindings
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
  sfx.muted = !sfx.muted;
  e.target.textContent = sfx.muted ? "🔇" : "🔊";
};

// Main 60fps loop
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state) {
    update(dt);
    renderGame(ctx, state, vw, vh);
  } else {
    // Subtle animated midnight floor behind title screen
    ctx.fillStyle = "#1b1d36";
    ctx.fillRect(0, 0, vw, vh);
  }
  requestAnimationFrame(loop);
}

updateTitleUI();
requestAnimationFrame(loop);
