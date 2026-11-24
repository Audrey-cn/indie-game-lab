// Roomba Raid v0.4.0 — Full Mobile Game Lobby + 2400x2200 Multi-Room Apartment
// + Chasing Cat Paw (Duck Under Tables to Dodge!) + Pooper & Milk-Tea Slime Enemies
// + 3-Star Clickable Settlement Chests + Victory/Defeat Comedy Posters
// + 11-Skin Silhouette Garage + Graphical 3-Tier Talent Tree + 6-Enemy Codex!

import {
  ACCESSORIES,
  BOOSTERS,
  DEATH_QUIPS,
  DEFAULT_SAVE,
  ENEMY_CODEX,
  LOOT_ITEMS,
  MAPS,
  MAP_WAVE_SCRIPTS,
  MUSEUM_SETS,
  PASSIVES,
  SAFE_BOX_PRICES,
  SKINS,
  TALENT_COSTS,
  TALENT_STYLES,
  WEAPONS,
  WEAPON_EVOLUTIONS,
} from "./config.mjs";
import { LOOT_ART, MAP_BACKDROPS } from "./art-assets.mjs";
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
  generateRoomLayout,
  isUnderHiddenCover,
  pointHitsObstacle,
  ROOM,
} from "./room-layout.mjs";
import { cleanDustAt, createDustLayer, renderGame, renderReceiptPoster, smearPoopAt } from "./renderer.mjs";
import { POSTERS, SPRITE_URLS } from "./sprites.mjs";

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

// Set Full-Bleed Mobile Game Lobby Poster!
document.getElementById("page-home").style.backgroundImage = `url(${POSTERS.lobby})`;

let save = loadSave(DEFAULT_SAVE);
if (!save.accOwned) save.accOwned = ["none", "ahoge"];
if (!save.equippedAcc) save.equippedAcc = "ahoge";
if (!save.activeTalentStyle) save.activeTalentStyle = "thunder";
if (!save.talentLevels) save.talentLevels = {};
if (!save.talentActive) {
  save.talentActive = {
    thunder: { 1: null, 2: null, 3: null },
    greed: { 1: null, 2: null, 3: null },
    clean: { 1: null, 2: null, 3: null },
  };
}
if (!save.selectedMap) save.selectedMap = "living";

const urlCtx = parseUrlContext();
let selectedMode = urlCtx.seed ? "daily" : "free";
let currentNav = "home";
let currentGarageTab = "skins";
let currentCodexTab = "enemies";
let selectedSkinId = save.equippedSkin || "classic";
let selectedAccId = save.equippedAcc || "ahoge";
let selectedTalentId = "th_dmg";
let state = null;
let lastTs = 0;

// UI refs
const hudEl = document.getElementById("hud");
const toastEl = document.getElementById("toast");
const briefingEl = document.getElementById("briefing-banner");
const jackpotEl = document.getElementById("jackpot-banner");
const activeBar = document.getElementById("active-bar");
const btnOverdrive = document.getElementById("btn-overdrive");
const odTxt = document.getElementById("od-txt");
const btnClone = document.getElementById("btn-clone");
const cloneTxt = document.getElementById("clone-txt");
const btnGiant = document.getElementById("btn-giant");
const giantTxt = document.getElementById("giant-txt");
const lobbyShell = document.getElementById("lobby-shell");
const screenPause = document.getElementById("screen-pause");
const screenLevelUp = document.getElementById("screen-levelup");
const screenResult = document.getElementById("screen-result");
const rewardPopup = document.getElementById("reward-popup");
const shareModal = document.getElementById("share-modal");

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
function showJackpotBanner(name, value, sub = "✨ 发现大金 ✨") {
  document.querySelector("#jackpot-banner .jt-sub").textContent = sub;
  document.getElementById("jt-name").textContent = name;
  document.getElementById("jt-val").textContent = typeof value === "string" ? value : `+¥${value.toLocaleString()}`;
  jackpotEl.hidden = false;
  clearTimeout(jackpotTimer);
  jackpotTimer = setTimeout(() => {
    jackpotEl.hidden = true;
  }, 2200);
}

function getActiveTalentLv(nodeId) {
  const styleId = save.activeTalentStyle || "thunder";
  const activeMap = (save.talentActive && save.talentActive[styleId]) || {};
  const isActive = Object.values(activeMap).includes(nodeId);
  return isActive ? (save.talentLevels[nodeId] || 0) : 0;
}

function isMapUnlocked(map) {
  if (!map.unlockReq) return true;
  if (map.unlockReq.type === "stars") return (save.bestStars || 0) >= map.unlockReq.count;
  if (map.unlockReq.type === "kills") return (save.totalKills || 0) >= map.unlockReq.count;
  if (map.unlockReq.type === "cores") return (save.goldCores || 0) >= map.unlockReq.count || (save.bestStars || 0) >= 3;
  if (map.unlockReq.type === "cat_secret") {
    const wearingCat = save.equippedSkin === "cat" || save.equippedSkin === "hidden_catgod" || save.equippedAcc === "catears";
    return wearingCat || (save.museum.catcan || 0) >= 2;
  }
  return false;
}

function getCurrentWaveSpec() {
  const script = MAP_WAVE_SCRIPTS[state?.mapDef?.id] || MAP_WAVE_SCRIPTS.living;
  const w = Math.max(1, state?.wave || 1);
  if (w <= script.length) return script[w - 1];
  const last = script[script.length - 1];
  const extra = w - script.length;
  return {
    name: `无尽高压加班潮 Lv.${extra}`,
    pool: last.pool,
    rate: Math.max(0.24, last.rate - extra * 0.03),
    hp: last.hp * (1 + extra * 0.34),
    spd: last.spd * (1 + extra * 0.05),
    boss: extra % 2 === 0,
  };
}

function isAccUnlocked(acc) {
  if (acc.free || save.accOwned.includes(acc.id)) return true;
  if (acc.req?.type === "star" && (save.bestStars || 0) >= acc.req.stars) {
    save.accOwned.push(acc.id);
    writeSave(save);
    return true;
  }
  return false;
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

function refreshLobby() {
  document.getElementById("top-coins").textContent = `💰 ¥${Math.round(save.coins).toLocaleString()}`;
  document.getElementById("top-cores").textContent = `💎 ${save.goldCores || 0}`;
  document.getElementById("top-streak").textContent = `🔥 ${save.extractStreak}连撤`;

  const skin = getEquippedSkin();
  const acc = ACCESSORIES.find((a) => a.id === save.equippedAcc) || ACCESSORIES[0];
  document.getElementById("home-eq-name").textContent = `🤖 ${skin.name} · ${acc.icon}${acc.name}`;
  const dailyBtn = document.getElementById("mode-daily-toggle");
  dailyBtn.classList.toggle("active", selectedMode === "daily");
  document.getElementById("mode-ico").textContent = selectedMode === "daily" ? "📅" : "🎲";
  document.getElementById("mode-lbl").textContent = selectedMode === "daily" ? "今日同图" : "随机户型";

  // Dynamic Home Backdrop + 5-Map Horizontal Card Carousel!
  const mapSel = document.getElementById("map-carousel");
  mapSel.innerHTML = "";
  let activeMap = MAPS.find((m) => m.id === save.selectedMap) || MAPS[0];
  if (!isMapUnlocked(activeMap)) {
    activeMap = MAPS[0];
    save.selectedMap = "living";
  }
  document.getElementById("page-home").style.backgroundImage = `url("${MAP_BACKDROPS[activeMap.id] || POSTERS.lobby}")`;

  for (const m of MAPS) {
    const unlocked = isMapUnlocked(m);
    const card = document.createElement("button");
    card.className = `map-card ${save.selectedMap === m.id ? "active" : ""} ${unlocked ? "" : "locked"}`;
    card.innerHTML = `
      <div class="map-card-art" style='background-image:url("${MAP_BACKDROPS[m.id] || POSTERS.lobby}")'>
        <span class="map-card-mult">大金 ×${m.lootMult}</span>
        ${unlocked ? "" : '<div class="map-card-lock">🔒</div>'}
      </div>
      <div class="map-card-body">
        <div class="map-card-name">${m.name}</div>
        <div class="map-card-sub">${unlocked ? m.tag : m.unlockReq.label}</div>
      </div>
    `;
    card.onclick = () => {
      if (!unlocked) {
        const prog = m.unlockReq.type === "kills" ? `（当前 ${save.totalKills || 0}/${m.unlockReq.count}）` : "";
        showToast(`🔒 ${m.unlockReq.label}${prog}`, "pink");
        return;
      }
      save.selectedMap = m.id;
      writeSave(save);
      refreshLobby();
    };
    mapSel.appendChild(card);
  }
  document.getElementById("map-desc").textContent = `${activeMap.tag} · ${activeMap.desc}`;

  const ghostBanner = document.getElementById("title-ghost-banner");
  if (urlCtx.ghostDrop) {
    ghostBanner.hidden = false;
    ghostBanner.textContent = `📦 检测到群友 @${urlCtx.ghostDrop.owner} 的翻车遗产（¥${urlCtx.ghostDrop.value.toLocaleString()}）！`;
  } else {
    ghostBanner.hidden = true;
  }

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === currentNav));
  document.getElementById("page-home").hidden = currentNav !== "home";
  document.getElementById("page-garage").hidden = currentNav !== "garage";
  document.getElementById("page-talents").hidden = currentNav !== "talents";
  document.getElementById("page-codex").hidden = currentNav !== "codex";

  if (currentNav === "garage") renderGarage();
  else if (currentNav === "talents") renderTalentTree();
  else if (currentNav === "codex") renderCodex();
}

function renderGarage() {
  document.querySelectorAll("[data-gtab]").forEach((b) => b.classList.toggle("active", b.dataset.gtab === currentGarageTab));
  const grid = document.getElementById("skin-grid");
  const detail = document.getElementById("skin-detail");
  grid.innerHTML = "";

  if (currentGarageTab === "acc") {
    const unlockedCount = ACCESSORIES.filter(isAccUnlocked).length;
    document.getElementById("garage-count").textContent = `${unlockedCount} / ${ACCESSORIES.length}`;
    for (const acc of ACCESSORIES) {
      const owned = isAccUnlocked(acc);
      const equipped = save.equippedAcc === acc.id;
      const card = document.createElement("div");
      card.className = `skin-card ${equipped ? "equipped" : ""} ${!owned ? "locked" : ""}`;
      card.innerHTML = `
        <div style="font-size:34px;margin:8px 0 4px;${owned ? "" : "filter:brightness(0) opacity(0.5)"}">${acc.icon}</div>
        <div class="skin-name">${acc.name}</div>
        <div class="skin-price">${equipped ? "✅ 佩戴中" : owned ? "已解锁" : "🔒 未解锁"}</div>
      `;
      card.onclick = () => {
        selectedAccId = acc.id;
        renderGarage();
      };
      grid.appendChild(card);
    }
    const acc = ACCESSORIES.find((a) => a.id === selectedAccId) || ACCESSORIES[0];
    const owned = isAccUnlocked(acc);
    const equipped = save.equippedAcc === acc.id;
    let canBuy = false;
    let btnText = equipped ? "✅ 当前正在佩戴" : "⚡ 立即佩戴";
    if (!owned) {
      if (acc.req?.type === "loot") {
        const have = save.museum[acc.req.lootId] || 0;
        canBuy = have >= acc.req.count;
        btnText = canBuy ? "🎁 珍品达标！免费兑换" : `🔒 ${acc.unlockText} (${have}/${acc.req.count})`;
      } else if (acc.price) {
        canBuy = save.coins >= acc.price && (save.goldCores || 0) >= (acc.core || 0);
        btnText = acc.core > 0 ? `兑换：¥${acc.price.toLocaleString()}+💎${acc.core}` : `购买：¥${acc.price.toLocaleString()}`;
      } else {
        btnText = `🔒 ${acc.unlockText}`;
      }
    }
    detail.innerHTML = `
      <div style="font-size:15px;font-weight:900;color:var(--gold)">${acc.icon} ${acc.name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">${acc.unlockText}</div>
      <button class="gbtn ${owned ? (equipped ? "gbtn-dark" : "gbtn-play") : (canBuy ? "gbtn-gold" : "gbtn-dark")}" id="btn-acc-act" style="margin-top:8px;padding:10px;font-size:13px" ${!owned && !canBuy ? "disabled" : ""}>${btnText}</button>
    `;
    document.getElementById("btn-acc-act").onclick = () => {
      if (owned) save.equippedAcc = acc.id;
      else if (canBuy) {
        if (acc.price) {
          save.coins -= acc.price;
          save.goldCores = (save.goldCores || 0) - (acc.core || 0);
        }
        save.accOwned.push(acc.id);
        save.equippedAcc = acc.id;
        sfx.playBigGold();
      }
      writeSave(save);
      refreshLobby();
    };
    return;
  }

  document.getElementById("garage-count").textContent = `${save.skinsOwned.length} / ${SKINS.length}`;
  for (const sk of SKINS) {
    const owned = save.skinsOwned.includes(sk.id);
    const equipped = save.equippedSkin === sk.id;
    const card = document.createElement("div");
    card.className = `skin-card ${equipped ? "equipped" : ""} ${!owned ? "locked" : ""} ${sk.hiddenLootReq ? "hidden-skin" : ""}`;
    const priceTxt = owned
      ? (equipped ? "✅ 出战中" : "已解锁")
      : sk.hiddenLootReq
        ? "🎁 珍品直兑"
        : sk.corePrice > 0
          ? `¥${(sk.price / 1000).toFixed(0)}k+💎${sk.corePrice}`
          : `¥${(sk.price / 1000).toFixed(0)}k`;
    card.innerHTML = `
      <span class="skin-size">${sk.sizeClass}</span>
      <img class="skin-img" src="${SPRITE_URLS.hero}" style="filter:${sk.filter}" alt="${sk.name}">
      <div class="skin-name">${owned ? sk.name : (sk.hiddenLootReq ? "？？？隐藏款" : sk.name)}</div>
      <div class="skin-price">${priceTxt}</div>
    `;
    card.onclick = () => {
      selectedSkinId = sk.id;
      renderGarage();
    };
    grid.appendChild(card);
  }

  const sk = SKINS.find((s) => s.id === selectedSkinId) || SKINS[0];
  const owned = save.skinsOwned.includes(sk.id);
  const equipped = save.equippedSkin === sk.id;

  let actionHtml = "";
  let canUnlock = false;
  if (owned) {
    actionHtml = `<button class="gbtn ${equipped ? "gbtn-dark" : "gbtn-play"}" id="btn-skin-act" style="margin-top:8px;padding:10px;font-size:14px">${equipped ? "✅ 当前正在使用" : "⚡ 立即装备出战"}</button>`;
  } else if (sk.hiddenLootReq) {
    const have = save.museum[sk.hiddenLootReq.lootId] || 0;
    canUnlock = have >= sk.hiddenLootReq.count;
    actionHtml = `<button class="gbtn ${canUnlock ? "gbtn-gold" : "gbtn-dark"}" id="btn-skin-act" style="margin-top:8px;padding:10px;font-size:13px" ${canUnlock ? "" : "disabled"}>${canUnlock ? "🎁 珍品数量达标！免费兑换隐藏款" : `🔒 ${sk.hiddenLootReq.label}（当前 ${have}/${sk.hiddenLootReq.count}）`}</button>`;
  } else {
    canUnlock = save.coins >= sk.price && (save.goldCores || 0) >= (sk.corePrice || 0);
    const label = sk.corePrice > 0 ? `解锁：¥${sk.price.toLocaleString()} + 💎${sk.corePrice}` : `解锁：¥${sk.price.toLocaleString()}`;
    actionHtml = `<button class="gbtn ${canUnlock ? "gbtn-gold" : "gbtn-dark"}" id="btn-skin-act" style="margin-top:8px;padding:10px;font-size:14px" ${canUnlock ? "" : "disabled"}>${label}</button>`;
  }

  detail.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong style="font-size:15px;color:var(--gold)">${sk.name}</strong>
      <span style="font-size:11px;color:var(--cyan);font-weight:900">专属技：${sk.skillName}</span>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-top:4px">${sk.desc}</div>
    ${actionHtml}
  `;

  const actBtn = document.getElementById("btn-skin-act");
  if (actBtn) {
    actBtn.onclick = () => {
      if (owned) save.equippedSkin = sk.id;
      else if (canUnlock) {
        if (!sk.hiddenLootReq) {
          save.coins -= sk.price;
          save.goldCores = (save.goldCores || 0) - (sk.corePrice || 0);
        }
        save.skinsOwned.push(sk.id);
        save.equippedSkin = sk.id;
        sfx.playBigGold();
      }
      writeSave(save);
      refreshLobby();
    };
  }
}

function renderTalentTree() {
  const styleTabs = document.getElementById("talent-style-tabs");
  styleTabs.innerHTML = "";
  for (const st of TALENT_STYLES) {
    const b = document.createElement("button");
    b.className = `stab ${save.activeTalentStyle === st.id ? "active" : ""}`;
    b.textContent = st.name;
    b.onclick = () => {
      save.activeTalentStyle = st.id;
      selectedTalentId = st.tiers[0].nodes[0].id;
      writeSave(save);
      renderTalentTree();
    };
    styleTabs.appendChild(b);
  }

  const style = TALENT_STYLES.find((s) => s.id === save.activeTalentStyle) || TALENT_STYLES[0];
  document.getElementById("talent-style-tag").textContent = `当前流派：${style.name}`;
  const activeMap = save.talentActive[style.id] || { 1: null, 2: null, 3: null };
  save.talentActive[style.id] = activeMap;

  const wrap = document.getElementById("talent-tree");
  wrap.innerHTML = "";
  let selectedNodeObj = null;
  let selectedTierNum = 1;

  for (const t of style.tiers) {
    const tierEl = document.createElement("div");
    tierEl.className = "tree-tier";
    tierEl.innerHTML = `<div class="tier-title">${t.title}</div><div class="tier-nodes"></div>`;
    const grid = tierEl.querySelector(".tier-nodes");

    for (const node of t.nodes) {
      const lv = save.talentLevels[node.id] || 0;
      const active = activeMap[t.tier] === node.id && lv > 0;
      if (node.id === selectedTalentId) {
        selectedNodeObj = node;
        selectedTierNum = t.tier;
      }
      const btn = document.createElement("button");
      btn.className = `tnode ${lv > 0 ? "unlocked" : ""} ${active ? "active" : ""}`;
      btn.style.outline = node.id === selectedTalentId ? "2px solid #ffd54a" : "none";
      btn.innerHTML = `
        <div class="tnode-orb">${node.icon}</div>
        <div class="tnode-name">${node.name}</div>
        <div class="tnode-stat">${node.stat(Math.max(1, lv))}</div>
        <div class="tnode-cost">${lv > 0 ? `LV.${lv}/5 ${active ? "✅" : ""}` : "未解锁"}</div>
      `;
      btn.onclick = () => {
        selectedTalentId = node.id;
        if (lv > 0) {
          activeMap[t.tier] = node.id;
          writeSave(save);
          sfx.playXp();
        }
        renderTalentTree();
      };
      grid.appendChild(btn);
    }
    wrap.appendChild(tierEl);
  }

  // Upgrade & Activate Detail Panel for Selected Talent Node (LV 0 -> 5!)
  const node = selectedNodeObj || style.tiers[0].nodes[0];
  const lv = save.talentLevels[node.id] || 0;
  const nextCost = TALENT_COSTS[lv];
  const canUp = Boolean(nextCost) && save.coins >= nextCost.coins && (save.goldCores || 0) >= nextCost.core;
  const costTxt = !nextCost
    ? "已满级 LV.5"
    : nextCost.core > 0
      ? `升级 LV.${lv + 1}：¥${(nextCost.coins / 1000).toFixed(0)}k + 💎${nextCost.core}`
      : `升级 LV.${lv + 1}：¥${(nextCost.coins / 1000).toFixed(0)}k`;

  const detail = document.getElementById("talent-detail");
  detail.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong style="font-size:14px;color:var(--gold)">${node.icon} ${node.name}（LV.${lv}/5）</strong>
      <span style="font-size:11px;color:var(--cyan);font-weight:900">${node.stat(Math.max(1, lv))}</span>
    </div>
    <button class="gbtn ${canUp ? "gbtn-gold" : "gbtn-dark"}" id="btn-talent-up" style="margin-top:8px;padding:10px;font-size:13px" ${canUp ? "" : "disabled"}>${costTxt}</button>
  `;
  document.getElementById("btn-talent-up").onclick = () => {
    if (!canUp) return;
    save.coins -= nextCost.coins;
    save.goldCores = (save.goldCores || 0) - nextCost.core;
    save.talentLevels[node.id] = lv + 1;
    activeMap[selectedTierNum] = node.id;
    writeSave(save);
    sfx.playLevelUp();
    refreshLobby();
  };
}

function renderCodex() {
  document.querySelectorAll(".stab").forEach((b) => b.classList.toggle("active", b.dataset.ctab === currentCodexTab));
  const list = document.getElementById("codex-list");
  list.innerHTML = "";

  if (currentCodexTab === "enemies") {
    for (const en of ENEMY_CODEX) {
      const row = document.createElement("div");
      row.className = "codex-row";
      row.innerHTML = `
        <img class="codex-ico" src="${SPRITE_URLS[en.sprite]}" style="${en.id === "slime" ? "filter:sepia(1) hue-rotate(-10deg) saturate(2.4)" : ""}" alt="${en.name}">
        <div class="codex-meta">
          <div class="codex-name">${en.name} <span style="font-size:10px;color:var(--cyan);margin-left:4px">${en.role}</span></div>
          <div class="codex-desc">${en.desc}</div>
        </div>
      `;
      list.appendChild(row);
    }
  } else if (currentCodexTab === "museum") {
    for (const set of MUSEUM_SETS) {
      const done = set.items.every((id) => (save.museum[id] || 0) > 0);
      const row = document.createElement("div");
      row.className = "codex-row";
      row.innerHTML = `
        <div class="codex-meta">
          <div class="codex-name">${done ? "✅" : "🔒"} ${set.name}</div>
          <div class="codex-desc">${set.buffText}</div>
        </div>
        <span style="font-size:11px;font-weight:900;color:${done ? "var(--green)" : "var(--muted)"}">${done ? "已激活" : "未集齐"}</span>
      `;
      list.appendChild(row);
    }
    for (const item of LOOT_ITEMS) {
      const count = save.museum[item.id] || 0;
      const icoKey = item.id === "catcan" || item.id === "duck" ? "catcan" : item.id === "cash" ? "cash" : item.id === "ring" ? "ring" : "crate";
      const row = document.createElement("div");
      row.className = "codex-row";
      row.innerHTML = `
        <img class="codex-ico" src="${SPRITE_URLS[icoKey]}" style="${count > 0 ? "" : "filter:brightness(0) opacity(0.45)"}" alt="${item.name}">
        <div class="codex-meta">
          <div class="codex-name" style="color:${count > 0 ? item.color : "var(--muted)"}">${count > 0 ? item.name : "？？？未发现大金"}</div>
          <div class="codex-desc">基础估值 ¥${item.value.toLocaleString()} · 累计带回 ${count} 件</div>
        </div>
      `;
      list.appendChild(row);
    }
  } else {
    // Safe Box & Black Market Boosters
    const nextSlot = save.safeBoxSlots + 1;
    const slotPrice = SAFE_BOX_PRICES[nextSlot];
    const sb = document.createElement("div");
    sb.className = "codex-row";
    sb.innerHTML = `
      <div class="codex-meta">
        <div class="codex-name">🔒 尘盒安全箱（${save.safeBoxSlots}/3 格）</div>
        <div class="codex-desc">最贵大金自动上锁，翻车也能保底带回！</div>
      </div>
      <button class="mini-buy ${!slotPrice ? "owned" : ""}">${slotPrice ? `¥${slotPrice.toLocaleString()}` : "已满级"}</button>
    `;
    const sbBtn = sb.querySelector("button");
    if (!slotPrice || save.coins < slotPrice) sbBtn.disabled = true;
    sbBtn.onclick = () => {
      if (slotPrice && save.coins >= slotPrice) {
        save.coins -= slotPrice;
        save.safeBoxSlots = nextSlot;
        writeSave(save);
        sfx.playBigGold();
        refreshLobby();
      }
    };
    list.appendChild(sb);

    for (const b of BOOSTERS) {
      const queued = Boolean(save.boosters[b.id]);
      const row = document.createElement("div");
      row.className = "codex-row";
      row.innerHTML = `
        <div class="codex-meta">
          <div class="codex-name">${b.icon} ${b.name}</div>
          <div class="codex-desc">${b.desc}</div>
        </div>
        <button class="mini-buy ${queued ? "owned" : ""}">${queued ? "下局生效" : `¥${b.price.toLocaleString()}`}</button>
      `;
      const btn = row.querySelector("button");
      if (queued || save.coins < b.price) btn.disabled = true;
      btn.onclick = () => {
        if (save.coins >= b.price) {
          save.coins -= b.price;
          save.boosters[b.id] = true;
          writeSave(save);
          sfx.playLevelUp();
          refreshLobby();
        }
      };
      list.appendChild(row);
    }
  }
}

// ===== CORE GAMEPLAY SIMULATION =====
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

function findSafePoint(layout, rng, pad = 120) {
  for (let tries = 0; tries < 40; tries++) {
    const x = pad + rng() * (layout.width - pad * 2);
    const y = pad + rng() * (layout.height - pad * 2);
    if (!pointHitsObstacle(layout, x, y)) return { x, y };
  }
  return { x: layout.startPos.x, y: layout.startPos.y };
}

function startRun() {
  const mapDef = MAPS.find((m) => m.id === save.selectedMap) || MAPS[0];
  sfx.unlock();
  sfx.setUrgent(false);
  sfx.setFever(false);
  sfx.startBgm(mapDef.bgm || "living");

  const isDaily = selectedMode === "daily";
  const seedStr = isDaily ? (urlCtx.seed || getTodaySeedString()) : String(Date.now());
  const rng = createRng(hashSeed(`${mapDef.id}_${seedStr}`));
  const layout = generateRoomLayout(mapDef.id, rng);
  const skin = getEquippedSkin();
  const museumBonus = getMuseumBonuses();
  const highRisk = Boolean(save.boosters.highrisk);
  const startLvUp = Boolean(save.boosters.lv3);
  const extraRadar = Boolean(save.boosters.radar);
  save.boosters = {};
  writeSave(save);

  // Pull active 5-level style talent bonuses!
  const tLv = getActiveTalentLv;
  const maxHp = Math.round((115 + tLv("th_armor") * 22) * skin.bonus.hp);

  state = {
    phase: "playing",
    mode: isDaily ? "daily" : "free",
    mapDef,
    layout,
    seedStr,
    rng,
    tLv,
    time: 0,
    slowMo: 0,
    wave: 1,
    wavePhase: "combat",
    hordeTimer: 26,
    breatherTimer: 0,
    highRisk,
    dmgMult: 1 + tLv("th_dmg") * 0.1,
    rangeMult: 1 + tLv("th_range") * 0.08,
    lootMult: mapDef.lootMult * skin.bonus.loot * museumBonus.lootMult * (highRisk ? 1.8 : 1) * (1 + tLv("gr_val") * 0.1),
    fireRateMult: museumBonus.fireRate * (1 + tLv("th_haste") * 0.07),
    critBonus: tLv("th_crit") * 0.07,
    chargeMult: (1 + tLv("th_od") * 0.18 + tLv("cl_charge") * 0.25) * (skin.id === "hidden_duck" ? 1.3 : 1),
    kills: 0,
    combo: 0,
    comboTimer: 0,
    fever: 0,
    shake: 0,
    hitstop: 0,
    lastHitSource: "default",
    revivedOnce: false,
    doubledOnce: false,
    rescuedGhost: null,
    coresEarned: 0,
    secretBedFound: false,
    dustLayer: createDustLayer(),
    cleanTracker: createCleanTracker(layout),
    milestones: { m35: false, m70: false, m100: false },
    player: {
      x: layout.startPos.x,
      y: layout.startPos.y,
      vx: 0,
      vy: 0,
      r: Math.round(23 * (skin.scale || 1)),
      facing: 0,
      hp: maxHp,
      maxHp,
      speed: 260 * skin.bonus.speed * (1 + tLv("gr_spd") * 0.05),
      magnet: (skin.id === "cat" ? 170 : 126) * (1 + tLv("gr_mag") * 0.16),
      cleanRadius: (skin.id === "sakura" ? 48 : 40) * (1 + tLv("cl_wide") * 0.12),
      lv: 1,
      xp: 0,
      xpNext: 48,
      hurtFlash: 0,
      invuln: 0,
      poopSlow: 0,
      slimeDebuff: 0,
      boostTimer: 0,
      skin: skin.id,
      acc: save.equippedAcc || "none",
      charge: 35,
      overdrive: 0,
      cloneCd: 0,
      giant: 0,
      giantCharges: 1 + (tLv("cl_giant2") >= 4 ? 2 : tLv("cl_giant2") >= 1 ? 1 : 0),
      giantAdUsed: false,
      weapons: { swatter: 1, laser: Math.min(5, tLv("th_start")), spatula: 0, hairdryer: 0, tesla: 0 },
      passives: { magnet: 0, turbo: 0, battery: 0 },
      evolutions: {},
      cooldowns: { swatter: 0.15, laser: 0.3, hairdryer: 0.5, tesla: 0.6, brushSpark: 0.65 },
    },
    cam: { x: layout.startPos.x, y: layout.startPos.y },
    bagLoot: [],
    looseCoins: 0,
    hasKey: false,
    keyTarget: null,
    clones: [],
    enemies: [],
    playerBullets: [],
    enemyBullets: [],
    puddles: [],
    ragdolls: [],
    props: [],
    poops: [],
    nativeSpots: layout.nativeSpots,
    shockStrips: layout.shockStrips,
    boostPads: layout.boostPads,
    barrels: layout.barrels,
    crates: [],
    gems: [],
    lootDrops: [],
    catPaws: [],
    vfx: [],
    particles: [],
    texts: [],
    dock: { active: false, x: layout.dockPos.x, y: layout.dockPos.y, radius: 72, progress: 0, tickAcc: 0 },
    spawnAcc: 0.4,
    pawAcc: mapDef.id === "cat_palace" ? 10 : 15,
    keys: new Set(),
    joy: { active: false, id: null, ox: 0, oy: 0, cx: 0, cy: 0, dx: 0, dy: 0 },
  };

  cleanDustAt(state.dustLayer, state.player.x, state.player.y, 54);
  state.cleanTracker.markClean(state.player.x, state.player.y, 56);

  // Update Mission Briefing text per Map & Wave 1 Theme!
  const wave1 = getCurrentWaveSpec();
  document.querySelector("#briefing-banner .bf-title").textContent = `${mapDef.name} · 第1波`;
  document.querySelector("#briefing-banner .bf-sub").textContent = `🌊 ${wave1.name}来袭！加油把全屋清扫到 100%！`;

  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.25;
    const dist = 210 + (i % 2) * 55;
    const ex = state.player.x + Math.cos(a) * dist;
    const ey = state.player.y + Math.sin(a) * dist;
    if (!pointHitsObstacle(layout, ex, ey)) {
      spawnEnemy(wave1.pool[i % wave1.pool.length], { x: ex, y: ey });
    }
  }

  for (let i = 0; i < 16; i++) {
    const pt = findSafePoint(layout, rng, 120);
    state.props.push({ x: pt.x, y: pt.y, kind: i % 2 === 0 ? "box" : "snack", rot: (rng() - 0.5) * 0.5, flash: 0 });
  }

  for (let i = 0; i < 4; i++) {
    const pt = findSafePoint(layout, rng, 180);
    state.poops.push({ x: pt.x, y: pt.y, life: 14, flash: 0 });
  }

  const extraCrates = (extraRadar ? 1 : 0) + Math.ceil(tLv("gr_crate") / 2);
  for (let c = 0; c < extraCrates; c++) {
    const pt = findSafePoint(layout, rng, 200);
    state.crates.push({ x: pt.x, y: pt.y, minVal: 18800, progress: 0, tickAcc: 0 });
  }

  if (urlCtx.ghostDrop) {
    state.lootDrops.push({
      x: 780,
      y: 420,
      isGhost: true,
      owner: urlCtx.ghostDrop.owner,
      lootId: urlCtx.ghostDrop.lootId,
      short: `@${urlCtx.ghostDrop.owner}遗产`,
      name: `@${urlCtx.ghostDrop.owner}的翻车遗产`,
      value: urlCtx.ghostDrop.value,
      rarity: "red",
    });
  }

  lobbyShell.hidden = true;
  screenResult.hidden = true;
  screenLevelUp.hidden = true;
  screenPause.hidden = true;
  rewardPopup.hidden = true;
  shareModal.hidden = true;
  hudEl.hidden = false;
  activeBar.hidden = false;

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

function grantLootReward(x, y, minVal, sourceLabel = "✨ 拆箱出大金 ✨") {
  const item = pickWeightedLoot(state.rng, minVal);
  const cleanBonus = state.milestones.m70 ? 1.3 : 1;
  const waveScale = 1 + (state.wave - 1) * 0.45;
  const val = Math.round(item.value * waveScale * cleanBonus * state.lootMult);
  const drop = { x, y, lootId: item.id, name: item.name, short: item.short, value: val, rarity: item.rarity, isGhost: false };
  state.bagLoot.push(drop);
  state.shake = 0.7;
  sfx.playUnboxingFanfare();
  vibrate(32);
  spawnRing(x, y, 16, 155, "#ffd54a", 8, 0.38);
  spawnParticles(x, y, "#ffd54a", 28, 230, true);
  spawnText(x, y - 24, `+¥${val.toLocaleString()}!`, "#ffd54a", 23);
  // Show Golden Rays Unboxing Reveal Modal with the actual Illustrated Object Artwork!
  openUnboxingReveal({
    artKey: item.id,
    sub: sourceLabel,
    title: item.name,
    valueText: `+¥${val.toLocaleString()}`,
    desc: item.rarity === "red" || item.rarity === "gold" ? "🔥 顶级珍品！撤离带回可解锁隐藏款机身！" : "已装入背包，冲回充电桩即可全额落袋！",
    pauseGame: true,
  });
}

function triggerClone() {
  if (!state || state.phase !== "playing") return;
  const p = state.player;
  if (p.cloneCd > 0) return;
  p.cloneCd = Math.max(10, 24 * (1 - state.tLv("cl_cd") * 0.1));
  sfx.playLevelUp();
  const clLv = state.tLv("cl_clone");
  const count = 1 + (clLv >= 3 ? 2 : clLv >= 1 ? 1 : 0);
  const dur = 12 + clLv * 2;
  for (let i = 0; i < count; i++) {
    const a = p.facing + (i - (count - 1) / 2) * 0.85;
    state.clones.push({
      x: p.x + Math.cos(a) * 44,
      y: p.y + Math.sin(a) * 44,
      vx: Math.cos(a) * 260,
      vy: Math.sin(a) * 260,
      life: dur,
      hitCd: 0,
    });
  }
  spawnRing(p.x, p.y, 16, 120, "#38f3ff", 6, 0.28);
  showToast(`🤖 召唤 ${count} 台迷你扫地分身！自动扫灰 + 撞击怪潮 ${dur} 秒！`, "green");
}

function triggerGiant() {
  if (!state || state.phase !== "playing") return;
  const p = state.player;
  if (p.giant > 0) return;
  const dur = 8.0 + state.tLv("cl_giant") * 1.5;
  const activate = () => {
    p.giant = dur;
    state.shake = 0.65;
    sfx.playOverdriveBlast();
    spawnRing(p.x, p.y, 20, 180, "#ff4c76", 9, 0.35);
    showToast(`🍄 巨无霸变身 ${dur.toFixed(0)} 秒！清扫翻倍+直接碾碎小怪（钻不进桌底！）`, "pink");
  };
  if (p.giantCharges > 0) {
    p.giantCharges -= 1;
    activate();
  } else if (!p.giantAdUsed) {
    state.phase = "paused";
    showRewardedAd("补充 1 次巨无霸变身", () => {
      p.giantAdUsed = true;
      state.phase = "playing";
      activate();
    });
  }
}

function openPause() {
  if (!state || state.phase !== "playing") return;
  state.phase = "paused";
  sfx.stopBgm();
  const wpBox = document.getElementById("pause-weapons");
  wpBox.innerHTML = "";
  for (const [id, lv] of Object.entries(state.player.weapons)) {
    if (lv > 0 && WEAPONS[id]) {
      const pill = document.createElement("span");
      pill.style.cssText = "padding:4px 10px;border-radius:999px;background:#121730;border:2px solid #141126;font-size:12px;font-weight:900;color:#ffd54a";
      pill.textContent = `${WEAPONS[id].icon} ${WEAPONS[id].name} LV.${lv}`;
      wpBox.appendChild(pill);
    }
  }
  screenPause.hidden = false;
}

function closePause() {
  if (!state || state.phase !== "paused") return;
  screenPause.hidden = true;
  state.phase = "playing";
  sfx.startBgm("living");
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

  const blastR = p.skin === "classic" ? 340 : 285;
  spawnRing(p.x, p.y, 20, blastR, "#38f3ff", 12, 0.4);
  if (p.skin === "gold" || p.skin === "hidden_diamond") {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      state.gems.push({ x: p.x + Math.cos(a) * 80, y: p.y + Math.sin(a) * 80, kind: "coin", val: 888, forcePull: true });
    }
    spawnText(p.x, p.y - 36, "👑 撒币星爆清屏！", "#ffd54a", 23);
  } else if (p.skin === "cyber") {
    p.x += Math.cos(p.facing) * 140;
    p.y += Math.sin(p.facing) * 140;
    clampToRoom(state.layout, p, p.r);
    spawnText(p.x, p.y - 36, "⚡ 赛博闪现清屏！", "#38f3ff", 23);
  } else {
    spawnRing(p.x, p.y, 10, blastR * 0.72, "#ffd54a", 10, 0.48);
    spawnText(p.x, p.y - 36, "⚡ 过载清屏暴走！", "#ffd54a", 23);
  }

  spawnParticles(p.x, p.y, "#38f3ff", 32, 290, true);
  spawnParticles(p.x, p.y, "#ffd54a", 22, 240, true);

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < blastR) {
      if (damageEnemy(e, 95 + state.wave * 35, (dx / d) * 380, (dy / d) * 380, true)) state.enemies.splice(i, 1);
    }
  }
  state.enemyBullets.length = 0;
  for (const g of state.gems) g.forcePull = true;
}

function spawnEnemy(forcedType = null, forcedPos = null, forceElite = false) {
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
      if (!pointHitsObstacle(state.layout, x, y)) {
        ok = true;
        break;
      }
    }
    if (!ok) return;
  }

  const waveSpec = getCurrentWaveSpec();
  let type = forcedType;
  if (!type) {
    type = waveSpec.pool[Math.floor(Math.random() * waveSpec.pool.length)];
  }

  const isElite = type !== "mop" && (forceElite || (state.wave >= 2 && Math.random() < 0.14));
  const mapHpMult = state.mapDef?.hpMult || 1;
  const hpScale = waveSpec.hp * mapHpMult * (state.highRisk ? 1.3 : 1);
  const spdScale = waveSpec.spd;
  const dmgScale = 1 + (state.wave - 1) * 0.14;
  const specs = {
    dust: { r: 17, hp: 22 * hpScale, speed: 88 * spdScale, dmg: Math.round(8 * dmgScale), xp: 3 },
    sock: { r: 19, hp: 46 * hpScale, speed: 100 * spdScale, dmg: Math.round(11 * dmgScale), xp: 6 },
    lego: { r: 20, hp: 82 * hpScale, speed: 62 * spdScale, dmg: Math.round(16 * dmgScale), xp: 9 },
    pooper: { r: 18, hp: 38 * hpScale, speed: 122 * spdScale, dmg: Math.round(6 * dmgScale), xp: 8 },
    slime: { r: 19, hp: 50 * hpScale, speed: 82 * spdScale, dmg: Math.round(9 * dmgScale), xp: 8 },
    mop: { r: 36, hp: 460 * hpScale, speed: 95 * spdScale, dmg: Math.round(20 * dmgScale), xp: 34 },
  };
  const sp = specs[type];
  const r = isElite ? Math.round(sp.r * 1.42) : sp.r;
  const hp = isElite ? sp.hp * 4.5 : sp.hp;
  state.enemies.push({
    type,
    elite: isElite,
    x,
    y,
    r,
    hp,
    maxHp: hp,
    speed: isElite ? sp.speed * 1.08 : sp.speed,
    dmg: isElite ? Math.round(sp.dmg * 1.3) : sp.dmg,
    xp: isElite ? sp.xp * 5 : sp.xp,
    vx: 0,
    vy: 0,
    flash: 0,
    squash: 0,
    stagger: 0,
    stun: 0,
    aiState: "chase",
    aiTimer: 3.5,
    chargeAng: 0,
    shootCd: 2.2 + Math.random() * 2,
    dropCd: 3.5 + Math.random() * 2,
    summonedHalf: false,
    enraged: state.dock.active,
    seed: Math.random() * 10,
  });
}

function triggerHordeSwarm() {
  state.wave += 1;
  state.wavePhase = "combat";
  state.hordeTimer = 26;
  sfx.setBreather(false);
  const waveSpec = getCurrentWaveSpec();
  sfx.playHordeHorn();
  state.shake = 0.5;
  const eliteCount = Math.min(4, 2 + Math.floor(state.wave / 2));
  showToast(`🌊 第 ${state.wave} 波：${waveSpec.name}（含 ${eliteCount} 只光环精英）！`, "pink");
  const count = Math.min(18, 8 + state.wave * 2);
  for (let i = 0; i < count; i++) {
    spawnEnemy(waveSpec.pool[i % waveSpec.pool.length], null, i < eliteCount);
  }
  if (waveSpec.boss) {
    spawnEnemy("mop");
  }
}

function detonateBarrel(b) {
  sfx.playOverdriveBlast();
  state.shake = Math.max(state.shake, 0.85);
  state.hitstop = Math.max(state.hitstop, 0.032);
  vibrate(45);
  spawnRing(b.x, b.y, 18, 210, "#ff6b22", 14, 0.36);
  state.vfx.push({ type: "burst", x: b.x, y: b.y, size: 220, rot: Math.random() * 6, life: 0.34, maxLife: 0.34 });
  spawnParticles(b.x, b.y, "#ff6b22", 32, 280, true);
  spawnText(b.x, b.y - 26, "💥 罐体爆破清场！", "#ffd54a", 22);
  const blastDmg = 155 + state.wave * 45;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 205 + e.r) {
      e.stun = Math.max(e.stun, 1.3);
      if (damageEnemy(e, blastDmg, (dx / d) * 380, (dy / d) * 380, true, 0.3)) {
        state.enemies.splice(i, 1);
      }
    }
  }
}

function damageEnemy(e, dmg, kbX = 0, kbY = 0, isCrit = false, staggerDur = 0) {
  const bonusDmg = e.stun > 0 ? dmg * 1.5 : dmg;
  e.hp -= bonusDmg;
  e.flash = 0.09;
  e.squash = isCrit ? 0.38 : 0.22;
  if (staggerDur > 0 && e.type !== "mop") {
    e.stagger = Math.max(e.stagger || 0, e.elite ? staggerDur * 0.55 : staggerDur);
  }
  const kbMult = e.type === "mop" ? 0.22 : e.elite ? 0.52 : 1.0;
  e.vx += kbX * kbMult;
  e.vy += kbY * kbMult;
  sfx.playHit(isCrit);
  if (isCrit) {
    state.hitstop = Math.max(state.hitstop, e.elite || e.type === "mop" ? 0.028 : 0.014);
    state.vfx.push({ type: "burst", x: e.x, y: e.y, size: e.elite || e.type === "mop" ? 96 : 64, rot: Math.random() * 6, life: 0.22, maxLife: 0.22 });
  }

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
    state.player.charge = Math.min(100, state.player.charge + (e.type === "mop" ? 40 : e.elite ? 16 : 4.2) * state.chargeMult);
    sfx.playKill();

    const ang = Math.atan2(kbY || (e.y - state.player.y), kbX || (e.x - state.player.x));
    state.ragdolls.push({
      type: e.type,
      sprite: e.type === "pooper" ? "poop" : e.type === "slime" ? "dust" : e.type,
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
    spawnRing(e.x, e.y, 8, e.r * 2.4, e.elite ? "#e879f9" : isCrit ? "#ffd54a" : "#38f3ff", e.elite ? 6 : 4, 0.24);
    spawnParticles(e.x, e.y, e.elite ? "#ffd54a" : isCrit ? "#ffd54a" : "#38f3ff", e.type === "mop" ? 28 : e.elite ? 20 : 10, 200, true);

    state.gems.push({ x: e.x, y: e.y, kind: "xp", val: e.xp, forcePull: false });
    if (e.elite) {
      // High-value Aura Elite Reward: Coin Shower + 45% Full-Map XP Magnet or Gold Crate!
      for (let k = 0; k < 5; k++) {
        state.gems.push({
          x: e.x + (Math.random() - 0.5) * 46,
          y: e.y + (Math.random() - 0.5) * 46,
          kind: "coin",
          val: Math.round((780 + state.wave * 240) * state.lootMult),
          forcePull: false,
        });
      }
      if (Math.random() < 0.45) {
        for (const gm of state.gems) gm.forcePull = true;
        spawnText(e.x, e.y - 30, "🧲 精英掉落：全图磁吸吸尘！", "#38f3ff", 19);
      } else {
        state.crates.push({ x: e.x, y: e.y, tier: "gold", openTime: 2.2, minVal: 18800, progress: 0, tickAcc: 0 });
        spawnText(e.x, e.y - 30, "👑 精英掉落超级金箱！", "#ffd54a", 19);
      }
    } else if (Math.random() < 0.5) {
      state.gems.push({
        x: e.x + (Math.random() - 0.5) * 22,
        y: e.y + (Math.random() - 0.5) * 22,
        kind: "coin",
        val: Math.round((320 + state.wave * 180) * state.lootMult),
        forcePull: false,
      });
    }
    if (e.type === "mop") {
      state.shake = 0.9;
      state.crates.push({ x: e.x, y: e.y, tier: "red", openTime: 3.4, minVal: 28000, progress: 0, tickAcc: 0 });
      if (state.rng() < 0.7) state.gems.push({ x: e.x + 28, y: e.y, kind: "core", val: 1, forcePull: false });
      // Boss drops Mysterious Key to unlock Fridge / TV Secret Vault!
      if (!state.hasKey) {
        state.lootDrops.push({
          x: e.x - 28,
          y: e.y + 10,
          isKey: true,
          lootId: "ring",
          short: "神秘钥匙",
          name: "神秘家具钥匙",
          value: 0,
          rarity: "gold",
        });
      }
      showToast("👑 击败拖把王！掉落 🗝️ 神秘钥匙与超级金箱！", "gold");
    }
    return true;
  }
  return false;
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
  const debuffMult = p.slimeDebuff > 0 ? 1.45 : 1; // Milk-tea slime slows attack speed!
  const cdMult = (1 / state.fireRateMult) * debuffMult * (p.overdrive > 0 ? 0.45 : state.fever > 0 ? 0.65 : 1);

  if (p.weapons.swatter > 0) {
    p.cooldowns.swatter -= dt;
    if (p.cooldowns.swatter <= 0) {
      const lv = p.weapons.swatter;
      p.cooldowns.swatter = Math.max(0.3, (0.84 - lv * 0.1) * cdMult);
      const giantMult = p.giant > 0 ? 1.65 : 1;
      const range = (106 + lv * 18) * (p.giant > 0 ? 1.45 : 1);
      const dmg = (26 + lv * 14) * giantMult;
      let hitAny = false;
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= range + e.r) {
          hitAny = true;
          const crit = Math.random() < 0.28 + state.critBonus;
          if (damageEnemy(e, crit ? dmg * 1.85 : dmg, (dx / (d || 1)) * 240, (dy / (d || 1)) * 240, crit, 0.28)) state.enemies.splice(i, 1);
        }
      }
      for (let i = state.barrels.length - 1; i >= 0; i--) {
        if (Math.hypot(state.barrels[i].x - p.x, state.barrels[i].y - p.y) <= range + 22) {
          const b = state.barrels.splice(i, 1)[0];
          detonateBarrel(b);
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

  if (p.weapons.laser > 0) {
    p.cooldowns.laser -= dt;
    if (p.cooldowns.laser <= 0 && state.enemies.length > 0) {
      const lv = p.weapons.laser;
      const isPrism = !!(p.evolutions && p.evolutions.prism_railgun);
      p.cooldowns.laser = Math.max(0.24, (0.82 - lv * 0.1) * cdMult * (isPrism ? 0.78 : 1));
      const sorted = [...state.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const shots = Math.min(sorted.length, isPrism ? Math.max(3, lv) : lv);
      const dmg = (34 + lv * 18) * (p.giant > 0 ? 1.5 : 1) * (isPrism ? 1.45 : 1);
      const prismCols = ["#38f3ff", "#ff4d94", "#ffd54a", "#c084fc"];
      for (let s = 0; s < shots; s++) {
        const target = sorted[s];
        if (!target || Math.hypot(target.x - p.x, target.y - p.y) > 440) continue;
        const col = isPrism ? prismCols[s % prismCols.length] : "#ff2e6d";
        // Piercing LiDAR Beam: extends 440px along ray & pierces all enemies in line!
        const ang = Math.atan2(target.y - p.y, target.x - p.x);
        const beamLen = isPrism ? 480 : 380;
        const bx2 = p.x + Math.cos(ang) * beamLen;
        const by2 = p.y + Math.sin(ang) * beamLen;
        state.vfx.push({ type: isPrism ? "prism_beam" : "laser", color: col, x1: p.x, y1: p.y, x2: bx2, y2: by2, life: 0.22, maxLife: 0.22 });
        const crit = Math.random() < (isPrism ? 0.72 : 0.45) + state.critBonus;
        let pierced = 0;
        const maxPierce = isPrism ? 8 : 2 + Math.floor(lv / 2);
        for (let ei = state.enemies.length - 1; ei >= 0 && pierced < maxPierce; ei--) {
          const en = state.enemies[ei];
          const ex = en.x - p.x;
          const ey = en.y - p.y;
          const proj = ex * Math.cos(ang) + ey * Math.sin(ang);
          if (proj < 0 || proj > beamLen) continue;
          const perp = Math.abs(ex * Math.sin(ang) - ey * Math.cos(ang));
          if (perp <= en.r + (isPrism ? 16 : 11)) {
            pierced++;
            if (damageEnemy(en, crit ? dmg * 1.9 : dmg, Math.cos(ang) * 90, Math.sin(ang) * 90, crit, 0.14)) state.enemies.splice(ei, 1);
          }
        }
        // Ricochet at Lv.3+ or Prism Railgun Evolution!
        const bounces = isPrism ? 3 : lv >= 3 ? 1 : 0;
        if (bounces > 0) {
          let prevX = target.x;
          let prevY = target.y;
          const used = new Set([target]);
          for (let b = 0; b < bounces; b++) {
            const next = state.enemies.find((e) => !used.has(e) && Math.hypot(e.x - prevX, e.y - prevY) < 250);
            if (!next) break;
            used.add(next);
            state.vfx.push({ type: isPrism ? "prism_beam" : "laser", color: isPrism ? prismCols[(s + b + 1) % prismCols.length] : "#ff7eb6", x1: prevX, y1: prevY, x2: next.x, y2: next.y, life: 0.22, maxLife: 0.22 });
            const ni = state.enemies.indexOf(next);
            if (ni >= 0 && damageEnemy(next, dmg * 1.15, 0, 0, true, 0.16)) state.enemies.splice(ni, 1);
            prevX = next.x;
            prevY = next.y;
          }
        }
      }
      sfx.playLaser();
    }
  }

  if (p.weapons.spatula > 0) {
    const lv = p.weapons.spatula;
    const isFlame = !!(p.evolutions && p.evolutions.flame_tornado);
    const isGold = !!(p.evolutions && p.evolutions.golden_vortex);
    const count = 1 + lv + (isFlame ? 2 : 0);
    const rad = (68 + lv * 7) * (isFlame ? 1.18 : 1);
    const rotSpd = isFlame ? 6.8 : 4.8;
    const dmg = (28 + lv * 12) * (isFlame ? 1.65 : 1.15);

    // Golden Gravity Vortex Evolution: Pulls nearby enemies inward toward the spinning blades!
    if (isGold) {
      for (const e of state.enemies) {
        if (e.type === "mop") continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 48 && d < 235) {
          e.x += (dx / d) * 85 * dt;
          e.y += (dy / d) * 85 * dt;
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const a = state.time * rotSpd + (i / count) * Math.PI * 2;
      const sx = p.x + Math.cos(a) * rad;
      const sy = p.y + Math.sin(a) * rad;
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        if (Math.hypot(e.x - sx, e.y - sy) < e.r + (isFlame ? 24 : 18) && e.flash <= 0) {
          const killed = damageEnemy(e, dmg, Math.cos(a) * 140, Math.sin(a) * 140, Math.random() < 0.25 + state.critBonus);
          if (killed) {
            if (isGold) state.gems.push({ x: e.x, y: e.y, kind: "coin", val: 260, forcePull: true });
            state.enemies.splice(j, 1);
          }
        }
      }
    }
    // Overclocked Side-Brush Spark Scatter (Lv.3+ or Flame Tornado flings piercing sparks!)
    if (lv >= 3 || isFlame) {
      p.cooldowns.brushSpark = (p.cooldowns.brushSpark ?? 0.65) - dt;
      if (p.cooldowns.brushSpark <= 0) {
        p.cooldowns.brushSpark = isFlame ? 0.48 : 0.85;
        const shots = isFlame ? 6 : 3;
        for (let s = 0; s < shots; s++) {
          const sa = state.time * rotSpd + (s / shots) * Math.PI * 2;
          state.playerBullets.push({
            x: p.x + Math.cos(sa) * rad,
            y: p.y + Math.sin(sa) * rad,
            vx: Math.cos(sa + 0.35) * 430,
            vy: Math.sin(sa + 0.35) * 430,
            r: isFlame ? 9 : 7,
            dmg: dmg * 0.9,
            kb: 190,
            pierce: isFlame ? 3 : 2,
            bounces: 1,
            color: isFlame ? "#ff7a33" : "#ffd54a",
            life: 0.95,
            hitSet: new Set(),
          });
        }
      }
    }
  }

  if (p.weapons.hairdryer > 0) {
    p.cooldowns.hairdryer -= dt;
    if (p.cooldowns.hairdryer <= 0) {
      const lv = p.weapons.hairdryer;
      const isFlame = !!(p.evolutions && p.evolutions.flame_tornado);
      p.cooldowns.hairdryer = Math.max(0.45, (1.3 - lv * 0.13) * cdMult * (isFlame ? 0.78 : 1));
      const range = (165 + lv * 22) * (isFlame ? 1.25 : 1);
      const dmg = (26 + lv * 15) * (isFlame ? 1.6 : 1);
      const dirs = isFlame ? [p.facing, p.facing + Math.PI] : [p.facing];
      for (const ang of dirs) {
        state.vfx.push({ type: isFlame ? "flame_wave" : "hairdryer", x: p.x, y: p.y, r: range, angle: ang, life: 0.28, maxLife: 0.28 });
        // Fan Spread Pressurized Air / Flame Blades (Pierce + Wall Ricochet + Heavy Knockback!)
        const pellets = Math.min(7, 2 + lv + (isFlame ? 2 : 0));
        const arc = 0.78;
        for (let k = 0; k < pellets; k++) {
          const pa = ang + (pellets === 1 ? 0 : -arc / 2 + (k / (pellets - 1)) * arc);
          state.playerBullets.push({
            x: p.x + Math.cos(pa) * 24,
            y: p.y + Math.sin(pa) * 24,
            vx: Math.cos(pa) * 460,
            vy: Math.sin(pa) * 460,
            r: isFlame ? 10 : 8,
            dmg: dmg * 0.85,
            kb: 380,
            pierce: isFlame ? 3 : 2,
            bounces: 1,
            color: isFlame ? "#ff5c28" : "#ffbe76",
            life: 0.75,
            hitSet: new Set(),
          });
        }
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i];
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > range + e.r) continue;
          let diff = Math.atan2(dy, dx) - ang;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) <= 0.74) {
            if (damageEnemy(e, dmg, (dx / (d || 1)) * 390, (dy / (d || 1)) * 390, isFlame, 0.2)) state.enemies.splice(i, 1);
          }
        }
      }
      sfx.playHairdryer();
    }
  }

  if (p.weapons.tesla > 0) {
    p.cooldowns.tesla -= dt;
    if (p.cooldowns.tesla <= 0 && state.enemies.length > 0) {
      const lv = p.weapons.tesla;
      const isStorm = !!(p.evolutions && p.evolutions.thunder_storm);
      p.cooldowns.tesla = Math.max(0.48, (1.25 - lv * 0.12) * cdMult * (isStorm ? 0.8 : 1));
      const jumps = (3 + lv * 2) + (isStorm ? 5 : 0);
      const dmg = (34 + lv * 16) * (isStorm ? 1.55 : 1);
      const pts = [{ x: p.x, y: p.y }];
      const hitSet = new Set();
      let cx = p.x;
      let cy = p.y;
      for (let k = 0; k < jumps; k++) {
        let best = null;
        let bestD = isStorm ? 320 : 260;
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
        if (isStorm) best.stun = Math.max(best.stun, 0.9);
        const idx = state.enemies.indexOf(best);
        if (idx >= 0 && damageEnemy(best, dmg, 0, 0, isStorm || Math.random() < 0.3 + state.critBonus)) state.enemies.splice(idx, 1);
      }
      if (pts.length > 1) {
        state.vfx.push({ type: isStorm ? "thunder_storm" : "tesla", pts, life: 0.28, maxLife: 0.28 });
        if (isStorm) spawnRing(p.x, p.y, 24, 210, "#e879f9", 9, 0.32);
        sfx.playZap();
      }
    }
  }
}

function openLevelUp() {
  state.phase = "levelup";
  sfx.playLevelUp();
  const p = state.player;
  const evoPool = [];
  for (const evo of WEAPON_EVOLUTIONS) {
    if (p.evolutions[evo.id]) continue;
    const ready = Object.entries(evo.req).every(([k, need]) => ((p.weapons[k] || 0) + (p.passives[k] || 0)) >= need);
    if (ready) {
      evoPool.push({
        kind: "evolution",
        id: evo.id,
        icon: evo.icon,
        name: evo.name,
        lv: 5,
        rarity: "r-evo",
        badge: "🔥 超武进化",
        kw: evo.kw,
        hint: evo.formula,
      });
    }
  }

  const pool = [];
  for (const w of Object.values(WEAPONS)) {
    const cur = p.weapons[w.id] || 0;
    if (cur < w.maxLv) {
      pool.push({
        kind: "weapon",
        id: w.id,
        icon: w.icon,
        name: w.name,
        lv: cur + 1,
        rarity: cur >= 3 ? "r-gold" : cur === 0 ? "r-purple" : "r-cyan",
        badge: cur === 0 ? "新外挂" : `LV.${cur + 1}`,
        kw: w.tag,
        hint: w.evoHint || "",
      });
    }
  }
  for (const pa of Object.values(PASSIVES)) {
    pool.push({
      kind: "passive",
      id: pa.id,
      icon: pa.icon,
      name: pa.name,
      lv: (p.passives[pa.id] || 0) + 1,
      rarity: "r-cyan",
      badge: "强化",
      kw: pa.tag,
      hint: pa.evoHint || "",
    });
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const choices = [...evoPool.slice(0, 1), ...pool].slice(0, 3);
  const applyChoice = (c) => {
    if (c.kind === "evolution") {
      p.evolutions[c.id] = true;
      sfx.playEvolution();
      spawnRing(p.x, p.y, 20, 280, "#ffd54a", 12, 0.45);
      showJackpotBanner(c.name, "🔥 武器进化质变！", "✨ 超武觉醒 ✨");
    } else if (c.kind === "weapon") {
      p.weapons[c.id] = (p.weapons[c.id] || 0) + 1;
    } else if (c.id === "magnet") {
      p.passives.magnet = (p.passives.magnet || 0) + 1;
      p.magnet *= 1.35;
    } else if (c.id === "turbo") {
      p.passives.turbo = (p.passives.turbo || 0) + 1;
      p.speed *= 1.14;
    } else if (c.id === "battery") {
      p.passives.battery = (p.passives.battery || 0) + 1;
      p.maxHp += 25;
      p.hp = Math.min(p.maxHp, p.hp + 40);
    }
  };

  const listEl = document.getElementById("choice-list");
  listEl.innerHTML = "";
  for (const c of choices) {
    const btn = document.createElement("button");
    btn.className = `vcard ${c.rarity}`;
    const stars = c.kind === "evolution" ? "★★★★★" : c.kind === "weapon" ? "★".repeat(c.lv) + "☆".repeat(Math.max(0, 5 - c.lv)) : "✦✦✦";
    btn.innerHTML = `
      <div class="vcard-head">${c.badge}</div>
      <div class="vcard-orb">${c.icon}</div>
      <div class="vcard-name">${c.name}</div>
      <div class="vcard-stars">${stars}</div>
      <div class="vcard-kw">${c.kw}</div>
      ${c.hint ? `<div class="vcard-evo-hint">${c.hint}</div>` : ""}
    `;
    btn.onclick = () => {
      applyChoice(c);
      screenLevelUp.hidden = true;
      state.phase = "playing";
      if (c.kind !== "evolution") {
        spawnRing(p.x, p.y, 16, 130, "#ffd54a", 7, 0.3);
        showToast(`✨ 焊上新外挂：${c.name}！`, "gold");
      }
    };
    listEl.appendChild(btn);
  }
  document.getElementById("btn-take-all").onclick = () => {
    showRewardedAd("三选一我全都要", () => {
      choices.forEach(applyChoice);
      screenLevelUp.hidden = true;
      state.phase = "playing";
      sfx.playBigGold();
      spawnRing(p.x, p.y, 16, 180, "#ffd54a", 10, 0.36);
      showToast("🔥 3 张战术卡牌全部焊上机身！", "gold");
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
    showToast("★ 探索清扫 35%！充电桩已解锁 + 结算获 1 星宝箱！", "green");
  }
  if (!state.milestones.m70 && pct >= 70) {
    state.milestones.m70 = true;
    sfx.playHordeHorn();
    spawnEnemy("mop", { x: 1050, y: 920 });
    showToast("★★ 清扫 70%！结算 2 星宝箱 + 拖把王苏醒（引撞沙发击晕它）！", "pink");
  }
  if (!state.milestones.m100 && pct >= 100) {
    state.milestones.m100 = true;
    state.coresEarned += 1;
    sfx.playExtractSuccess();
    spawnRing(state.player.x, state.player.y, 20, 360, "#39ff88", 12, 0.55);
    showJackpotBanner("★★★ 100% 全屋完美探索！", "+1 稀缺金核 💎 · 结算3星满箱", "✨ 洁癖天花板 ✨");
  }
}

function openUnboxingReveal({ artKey = "duck", sub = "✨ GOLDEN UNBOXING · 拆箱出货 ✨", title, valueText = "", desc = "", pauseGame = false }) {
  if (pauseGame && state && state.phase === "playing") state.phase = "unboxing";
  document.getElementById("rw-sub").textContent = sub;
  const img = document.getElementById("rw-img");
  img.src = LOOT_ART[artKey] || LOOT_ART.crate;
  // Re-trigger pop-in animation cleanly
  img.style.animation = "none";
  void img.offsetWidth;
  img.style.animation = "";
  document.getElementById("rw-title").textContent = title;
  const valEl = document.getElementById("rw-val");
  valEl.textContent = valueText;
  valEl.hidden = !valueText;
  document.getElementById("rw-desc").textContent = desc;
  rewardPopup.hidden = false;
}

function finishRun(extracted) {
  state.phase = "ended";
  sfx.setUrgent(false);
  sfx.setFever(false);
  sfx.setBreather(false);
  sfx.stopBgm();
  activeBar.hidden = true;
  hudEl.hidden = true;

  const pct = state.cleanTracker.percent;
  const stars = pct >= 100 ? 3 : pct >= 70 ? 2 : pct >= 35 ? 1 : 0;
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
    if (!item.isGhost && !item.isKey) save.museum[item.lootId] = (save.museum[item.lootId] || 0) + 1;
  }
  save.coins += earned;
  save.goldCores = (save.goldCores || 0) + state.coresEarned;
  save.totalExtracted += earned;
  save.totalKills = (save.totalKills || 0) + state.kills;
  save.runsPlayed += 1;
  if (stars > (save.bestStars || 0)) save.bestStars = stars;
  if (extracted && earned > save.bestRunValue) save.bestRunValue = earned;
  writeSave(save);

  // Multi-Poster Settlement Pool (3★ Perfect Clean / Clutch Low-HP Escape / Standard Victory / Defeat!)
  const posterUrl = extracted
    ? (stars === 3 ? POSTERS.win3star : state.player.hp < state.player.maxHp * 0.35 ? POSTERS.lobby : POSTERS.victory)
    : POSTERS.defeat;
  screenResult.style.backgroundImage = `url(${posterUrl})`;
  const quipEl = document.getElementById("res-quip");
  quipEl.className = `death-quip ${extracted ? "win" : ""}`;
  quipEl.textContent = extracted
    ? (stars === 3 ? "🏆 三星完美扫光！猫主子当场气晕！" : "😎 戴上墨镜安全跑路，主人明天找耳机找疯！")
    : (DEATH_QUIPS[state.lastHitSource] || DEATH_QUIPS.default);

  document.getElementById("res-title").textContent = extracted ? "✅ 安全撤离！" : "💥 贪心翻车！";
  document.getElementById("res-k1").textContent = extracted ? "实际落袋" : "痛失估值";
  document.getElementById("res-v1").textContent = `¥${(extracted ? earned : Math.max(0, totalVal - safeVal)).toLocaleString()}`;
  document.getElementById("res-v2").textContent = `${pct}% / ${state.kills}杀`;
  document.getElementById("res-v3").textContent = `¥${safeVal.toLocaleString()}`;

  // 3-Star Achievement Chests -> Award Special Items / Gold Cores / Random Skin Unlocks in a Clean Popup!
  document.getElementById("res-stars").innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? "" : "off"}">★</span>`).join("");
  const chestsEl = document.getElementById("res-chests");
  chestsEl.innerHTML = "";
  if (stars > 0) {
    for (let i = 1; i <= stars; i++) {
      const btn = document.createElement("button");
      btn.className = "reward-chest";
      btn.textContent = i === 3 ? "👑 3星珍稀箱" : i === 2 ? "💎 2星金核箱" : "🎁 1星道具箱";
      btn.onclick = () => {
        if (btn.classList.contains("opened")) return;
        btn.classList.add("opened");
        btn.textContent = "✅ 已领取";
        sfx.playUnboxingFanfare();
        if (i === 1) {
          save.boosters.radar = true;
          writeSave(save);
          openUnboxingReveal({ artKey: "crate", sub: "★ 1星宝箱开启", title: "大金探测器 ×1", valueText: "下局自动生效", desc: "下局开场自动在客厅额外刷出 1 个超级金箱！" });
        } else if (i === 2) {
          save.goldCores = (save.goldCores || 0) + 1;
          writeSave(save);
          openUnboxingReveal({ artKey: "core", sub: "★★ 2星金核箱开启", title: "稀缺金核 ×1", valueText: "+💎 1", desc: "可用于车库解锁高阶机身与 T3 传奇天赋！" });
        } else {
          const lockedSkins = SKINS.filter((s) => !save.skinsOwned.includes(s.id) && !s.hiddenLootReq);
          if (lockedSkins.length > 0) {
            const pick = lockedSkins[Math.floor(Math.random() * lockedSkins.length)];
            save.skinsOwned.push(pick.id);
            writeSave(save);
            openUnboxingReveal({ artKey: "skin", sub: "★★★ 3星珍稀箱开启", title: `限定机身【${pick.name}】`, valueText: "NEW 解锁！", desc: `专属技：${pick.skillName} · 已存入剪影车库！` });
          } else {
            save.goldCores = (save.goldCores || 0) + 2;
            writeSave(save);
            openUnboxingReveal({ artKey: "core", sub: "★★★ 3星珍稀箱开启", title: "双倍稀缺金核 ×2", valueText: "+💎 2", desc: "全常规机身已集齐，折算双倍稀缺金核！" });
          }
        }
      };
      chestsEl.appendChild(btn);
    }
  }

  // Concise Bottom Action Bar: Only [▶ 收益 ×2 / ▶ 复活] + [返回大厅]
  const adBtn = document.getElementById("btn-res-ad");
  const actRow = document.getElementById("res-actions-row");
  if (!extracted && !state.revivedOnce) {
    adBtn.hidden = false;
    adBtn.textContent = "▶ 紧急复活";
    actRow.classList.remove("single");
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
        hudEl.hidden = false;
        activeBar.hidden = false;
        sfx.startBgm("living");
        showToast("⚡ 满血复活！快钻桌底或冲充电桩！", "green");
      });
    };
  } else if (extracted && !state.doubledOnce && earned > 0) {
    adBtn.hidden = false;
    adBtn.textContent = "▶ 收益 ×2";
    actRow.classList.remove("single");
    adBtn.onclick = () => {
      showRewardedAd("收益 ×2", () => {
        state.doubledOnce = true;
        save.coins += earned;
        save.totalExtracted += earned;
        if (earned * 2 > save.bestRunValue) save.bestRunValue = earned * 2;
        writeSave(save);
        adBtn.hidden = true;
        actRow.classList.add("single");
        document.getElementById("res-v1").textContent = `¥${(earned * 2).toLocaleString()}`;
        sfx.playBigGold();
      });
    };
  } else {
    adBtn.hidden = true;
    actRow.classList.add("single");
  }

  // Unified Top-Right ↗ Share Button: Auto-copies Challenge URL + Opens QR Share Poster Modal!
  const topLoot = [...state.bagLoot].sort((a, b) => b.value - a.value)[0];
  document.getElementById("btn-res-share-poster").onclick = async () => {
    const shareUrl = buildChallengeUrl({
      seed: state.mode === "daily" ? state.seedStr : getTodaySeedString(),
      owner: save.playerName,
      value: Math.max(8800, topLoot ? topLoot.value : totalVal),
      lootId: topLoot ? topLoot.lootId : "catcan",
    });
    const text = extracted
      ? `我在《半夜扫地机》探索 ${pct}%（${stars}星）带走 ¥${earned.toLocaleString()}！敢来挑战吗？ ${shareUrl}`
      : `我在《半夜扫地机》翻车了（${DEATH_QUIPS[state.lastHitSource] || ""}）痛失 ¥${totalVal.toLocaleString()}！快来捡遗产： ${shareUrl}`;
    await copyToClipboard(text);
    const dataUrl = renderReceiptPoster({
      extracted,
      value: extracted ? (state.doubledOnce ? earned * 2 : earned) : totalVal,
      cleanPct: pct,
      stars,
      wave: state.wave,
      kills: state.kills,
      lootNames: state.bagLoot.map((l) => `${l.short} (¥${l.value.toLocaleString()})`),
      modeLabel: state.mode === "daily" ? `今日同图榜 #${state.seedStr}` : "豪宅摸金",
      streak: save.extractStreak,
      rescuedGhost: state.rescuedGhost,
    });
    document.getElementById("receipt-img").src = dataUrl;
    shareModal.hidden = false;
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
  p.slimeDebuff = Math.max(0, p.slimeDebuff - dt);
  p.cloneCd = Math.max(0, p.cloneCd - dt);
  p.giant = Math.max(0, p.giant - dt);
  if (p.overdrive > 0) {
    p.overdrive = Math.max(0, p.overdrive - dt);
    if (Math.random() < 0.5) spawnParticles(p.x, p.y, "#38f3ff", 1, 90, true);
  }

  // Wet Slippery Floor Check (Low-friction ice drift!)
  let onWet = false;
  for (const wz of state.layout.wetZones) {
    if (p.x >= wz.x && p.x <= wz.x + wz.w && p.y >= wz.y && p.y <= wz.y + wz.h) {
      onWet = true;
      break;
    }
  }
  // Floor Fan / Hairdryer Wind Corridor Force!
  const bootRes = Math.max(0.1, 1 - state.tLv("cl_boot") * 0.18);
  let windX = 0;
  let windY = 0;
  for (const wn of state.layout.windZones) {
    if (p.x >= wn.x && p.x <= wn.x + wn.w && p.y >= wn.y && p.y <= wn.y + wn.h) {
      windX += wn.vx * bootRes;
      windY += wn.vy * bootRes;
    }
  }

  // Update Summoned Helper Clones (auto-vacuum dust + ram enemies!)
  for (let i = state.clones.length - 1; i >= 0; i--) {
    const cl = state.clones[i];
    cl.life -= dt;
    cl.hitCd = Math.max(0, cl.hitCd - dt);
    if (cl.life <= 0) {
      spawnParticles(cl.x, cl.y, "#38f3ff", 10, 120, true);
      state.clones.splice(i, 1);
      continue;
    }
    // Seek nearest enemy or roam cleaning dust
    let target = state.enemies[0];
    let bestD = 9999;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - cl.x, e.y - cl.y);
      if (d < bestD) {
        bestD = d;
        target = e;
      }
    }
    if (target) {
      const ang = Math.atan2(target.y - cl.y, target.x - cl.x);
      cl.vx += (Math.cos(ang) * 280 - cl.vx) * Math.min(1, dt * 6);
      cl.vy += (Math.sin(ang) * 280 - cl.vy) * Math.min(1, dt * 6);
    }
    cl.x += cl.vx * dt;
    cl.y += cl.vy * dt;
    clampToRoom(state.layout, cl, 18);
    cleanDustAt(state.dustLayer, cl.x, cl.y, 32);
    if (state.cleanTracker.markClean(cl.x, cl.y, 34) > 0) checkCleanlinessMilestones();
    if (cl.hitCd <= 0) {
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        if (Math.hypot(e.x - cl.x, e.y - cl.y) < e.r + 20) {
          cl.hitCd = 0.25;
          if (damageEnemy(e, 32, cl.vx * 0.5, cl.vy * 0.5, false)) state.enemies.splice(j, 1);
          break;
        }
      }
    }
  }

  // Check sticky Milk-Tea Puddles (movement + fire-rate debuff!)
  for (let i = state.puddles.length - 1; i >= 0; i--) {
    const pd = state.puddles[i];
    pd.life -= dt;
    if (pd.life <= 0) {
      state.puddles.splice(i, 1);
      continue;
    }
    if (Math.hypot(p.x - pd.x, p.y - pd.y) < pd.r && p.overdrive <= 0) {
      p.slimeDebuff = 0.45;
      state.lastHitSource = "slime";
    }
  }

  // Movement w/ Inertia & Drift
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
  const slowMult = p.overdrive > 0 ? 1.55 : p.poopSlow > 0 ? 0.55 : p.slimeDebuff > 0 ? 0.58 : state.fever > 0 ? 1.18 : 1;
  const moveSpd = p.speed * slowMult;
  const tx = (mag > 0.05 ? (ix / Math.max(1, mag)) * moveSpd : 0) + windX;
  const ty = (mag > 0.05 ? (iy / Math.max(1, mag)) * moveSpd : 0) + windY;
  const accel = Math.min(1, dt * (onWet ? 2.4 : 11)); // Ice-like slippery drift on wet floor!
  if (Math.hypot(tx - p.vx, ty - p.vy) > 180 && mag > 0.2 && Math.random() < 0.45) {
    spawnParticles(p.x, p.y + 10, onWet ? "#7dd3fc" : "#e2e8f0", 2, 55, false);
  }
  p.vx += (tx - p.vx) * accel;
  p.vy += (ty - p.vy) * accel;
  const prevX = p.x;
  const prevY = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const activeR = p.giant > 0 ? Math.round(p.r * 1.65) : p.r;
  clampToRoom(state.layout, p, activeR);
  // Giant Roomba cannot duck under low tables/desks!
  if (p.giant > 0 && isUnderHiddenCover(state.layout, p.x, p.y)) {
    p.x = prevX;
    p.y = prevY;
  }

  // Secret Under-Bed / Under-Table Easter Egg Discovery!
  const underCover = isUnderHiddenCover(state.layout, p.x, p.y);
  if (underCover && underCover.secretEasterEgg && !state.secretBedFound) {
    state.secretBedFound = true;
    state.coresEarned += 1;
    sfx.playBigGold();
    showJackpotBanner(`🐾 发现隐藏彩蛋：${state.mapDef.secretName}！`, "+1 稀缺金核 💎 · 快掏隐藏宝藏！", "✨ 隐藏暗格发现 ✨");
  }

  if (Math.hypot(p.vx, p.vy) > 18) {
    p.facing = Math.atan2(p.vy, p.vx);
    if (p.poopSlow > 0) {
      smearPoopAt(state.dustLayer, p.x, p.y, 20);
      state.cleanTracker.dirtyAt(p.x, p.y, 26);
    } else {
      const cleanR = (p.giant > 0 ? p.cleanRadius * 1.85 : p.overdrive > 0 ? p.cleanRadius * 1.4 : p.cleanRadius);
      cleanDustAt(state.dustLayer, p.x, p.y, cleanR);
      const newly = state.cleanTracker.markClean(p.x, p.y, cleanR + 8);
      if (newly > 0) {
        p.charge = Math.min(100, p.charge + newly * 0.75 * state.chargeMult);
        checkCleanlinessMilestones();
      }
    }
  }

  // Smooth Camera
  const targetCamX = Math.max(vw / 2, Math.min(ROOM.width - vw / 2, p.x));
  const targetCamY = Math.max(vh / 2, Math.min(ROOM.height - vh / 2, p.y));
  state.cam.x += (targetCamX - state.cam.x) * Math.min(1, dt * 8.5);
  state.cam.y += (targetCamY - state.cam.y) * Math.min(1, dt * 8.5);

  // Shock Strips
  for (const strip of state.shockStrips) {
    strip.cd = Math.max(0, strip.cd - dt);
    if (strip.cd <= 0 && Math.hypot(p.x - strip.x, p.y - strip.y) < 38) {
      strip.cd = 16;
      sfx.playOverdriveBlast();
      state.shake = 0.65;
      spawnRing(strip.x, strip.y, 16, 260, "#38f3ff", 10, 0.35);
      spawnText(strip.x, strip.y - 24, "⚡ 漏电全屏麻痹！", "#38f3ff", 20);
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (Math.hypot(e.x - strip.x, e.y - strip.y) < 260) {
          e.stun = Math.max(e.stun, 1.8);
          if (damageEnemy(e, 75, 0, 0, true)) state.enemies.splice(i, 1);
        }
      }
    }
  }

  // Interactive Carpet Boost Pads (1.75x Speed Burst!)
  p.boostTimer = Math.max(0, (p.boostTimer || 0) - dt);
  if (p.boostTimer > 0) {
    p.x += Math.cos(p.facing) * 185 * dt;
    p.y += Math.sin(p.facing) * 185 * dt;
    clampToRoom(state.layout, p, p.r);
  }
  for (const bp of state.boostPads) {
    bp.cd = Math.max(0, bp.cd - dt);
    if (bp.cd <= 0 && Math.hypot(p.x - bp.x, p.y - bp.y) < 42) {
      bp.cd = 5.5;
      p.boostTimer = 1.45;
      sfx.playLaser();
      spawnRing(bp.x, bp.y, 12, 95, "#38f3ff", 6, 0.25);
      spawnText(bp.x, bp.y - 22, "🚀 弹射加速！", "#38f3ff", 18);
    }
  }

  // Player Piercing / Bouncing / Spreading Projectiles!
  for (let i = state.playerBullets.length - 1; i >= 0; i--) {
    const b = state.playerBullets[i];
    b.life -= dt;
    if (b.life <= 0) {
      state.playerBullets.splice(i, 1);
      continue;
    }
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    if (pointHitsObstacle(state.layout, nx, ny)) {
      if (b.bounces > 0) {
        b.bounces--;
        if (pointHitsObstacle(state.layout, nx, b.y)) b.vx = -b.vx;
        else b.vy = -b.vy;
        spawnParticles(b.x, b.y, b.color, 4, 90, false);
      } else {
        state.playerBullets.splice(i, 1);
        continue;
      }
    } else {
      b.x = nx;
      b.y = ny;
    }
    // Check Explosive Soda/Spray Canisters!
    let popped = false;
    for (let bi = state.barrels.length - 1; bi >= 0; bi--) {
      if (Math.hypot(state.barrels[bi].x - b.x, state.barrels[bi].y - b.y) < 28 + b.r) {
        const bar = state.barrels.splice(bi, 1)[0];
        detonateBarrel(bar);
        popped = true;
        break;
      }
    }
    if (popped) {
      state.playerBullets.splice(i, 1);
      continue;
    }
    // Pierce Enemies!
    for (let ei = state.enemies.length - 1; ei >= 0; ei--) {
      const e = state.enemies[ei];
      if (b.hitSet.has(e)) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
        b.hitSet.add(e);
        const spd = Math.hypot(b.vx, b.vy) || 1;
        if (damageEnemy(e, b.dmg, (b.vx / spd) * b.kb, (b.vy / spd) * b.kb, false, 0.16)) {
          state.enemies.splice(ei, 1);
        }
        b.pierce--;
        if (b.pierce <= 0) {
          state.playerBullets.splice(i, 1);
          break;
        }
      }
    }
  }

  // Pet Poop = Pure Indestructible Timed Trap (auto-dries after 14s!)
  for (let i = state.poops.length - 1; i >= 0; i--) {
    const poop = state.poops[i];
    poop.life = (poop.life ?? 14) - dt;
    if (poop.life <= 0) {
      state.poops.splice(i, 1);
      continue;
    }
    if (Math.hypot(p.x - poop.x, p.y - poop.y) < p.r + 14 && p.overdrive <= 0 && p.giant <= 0) {
      const poopLv = state.tLv("cl_poop");
      if (poopLv < 5) {
        p.poopSlow = 2.4 * (1 - poopLv * 0.2);
        state.lastHitSource = "poop";
        sfx.playPoopSplat();
        vibrate(40);
        state.shake = 0.5;
        smearPoopAt(state.dustLayer, poop.x, poop.y, 38);
        state.cleanTracker.dirtyAt(poop.x, poop.y, 44);
        spawnText(poop.x, poop.y - 24, "💩 踩雷！涂脏地板！", "#c08457", 19);
      }
      state.poops.splice(i, 1);
    }
  }

  // Boss Key -> Locked Fridge / TV Secret Vault Unlock!
  if (state.hasKey && state.keyTarget && !state.keyTarget.opened) {
    if (Math.hypot(p.x - state.keyTarget.x, p.y - state.keyTarget.y) < state.keyTarget.radius) {
      state.keyTarget.opened = true;
      state.hasKey = false;
      state.coresEarned += 1;
      grantLootReward(state.keyTarget.x, state.keyTarget.y, 42000, `🗝️ 成功撬开${state.keyTarget.label}！+💎1`);
    }
  }

  // 3-Tier Risk-Reward Search Spots (Blue 1.0s / Gold 2.2s / Red 3.6s + Slow Decay + Red Alarm!)
  for (const spot of state.nativeSpots) {
    if (spot.searched) continue;
    const dur = spot.openTime || 1.2;
    if (Math.hypot(p.x - spot.x, p.y - spot.y) < 66) {
      if (spot.tier === "red" && !spot.alarmed) {
        spot.alarmed = true;
        sfx.playHordeHorn();
        spawnRing(spot.x, spot.y, 20, 220, "#ff4268", 8, 0.4);
        showToast("🚨 正在硬开【顶级红箱】！警报已吸引怪潮，死守 3.6 秒！", "pink");
        for (let k = 0; k < 4; k++) spawnEnemy();
      }
      spot.progress += dt / dur;
      spot.tickAcc += dt;
      if (spot.tickAcc >= 0.16) {
        spot.tickAcc = 0;
        sfx.playCrateTick(spot.progress);
      }
      if (spot.progress >= 1) {
        spot.searched = true;
        grantLootReward(spot.x, spot.y, spot.minVal, `🔍 ${spot.label}出货！`);
      }
    } else {
      spot.progress = Math.max(0, spot.progress - dt * 0.22); // Gentle decay so dodging doesn't wipe progress!
    }
  }

  // Boss & Elite Tiered Crates (Gold 2.2s / Red 3.4s + Slow Decay!)
  for (let i = state.crates.length - 1; i >= 0; i--) {
    const cr = state.crates[i];
    const dur = cr.openTime || 2.2;
    if (Math.hypot(p.x - cr.x, p.y - cr.y) < 76) {
      if (cr.tier === "red" && !cr.alarmed) {
        cr.alarmed = true;
        spawnRing(cr.x, cr.y, 20, 190, "#ff4268", 7, 0.35);
        showToast("🚨 正在强拆红金宝箱！顶住怪潮别出圈！", "pink");
      }
      cr.progress += dt / dur;
      cr.tickAcc += dt;
      if (cr.tickAcc >= 0.16) {
        cr.tickAcc = 0;
        sfx.playCrateTick(cr.progress);
      }
      if (cr.progress >= 1) {
        grantLootReward(cr.x, cr.y, cr.minVal, cr.tier === "red" ? "🔴 顶级红金箱爆出重宝！" : "👑 超级金箱出货！");
        state.crates.splice(i, 1);
      }
    } else {
      cr.progress = Math.max(0, cr.progress - dt * 0.22);
    }
  }

  for (let i = state.props.length - 1; i >= 0; i--) {
    if (Math.hypot(p.x - state.props[i].x, p.y - state.props[i].y) < p.r + 22) {
      shatterProp(state.props[i]);
      state.props.splice(i, 1);
    }
  }

  // Wave Rhythm: 26s Combat Wave -> 5s Golden Breathing Window -> Next Themed Wave + Elites!
  if (state.wavePhase === "combat") {
    state.hordeTimer -= dt;
    if (state.hordeTimer <= 0) {
      state.wavePhase = "breather";
      state.breatherTimer = 5.0;
      sfx.setBreather(true);
      sfx.playLevelUp();
      showToast(`✨ 第 ${state.wave} 波击退！5 秒黄金喘息：快开红箱 / 冲充电桩！`, "green");
    }
  } else {
    state.breatherTimer -= dt;
    if (state.breatherTimer <= 0) {
      triggerHordeSwarm();
    }
  }

  // Charging Dock
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

  // Ambient spawns pause during the 5s Golden Breathing Window!
  if (state.wavePhase === "combat") {
    const spawnRate = getCurrentWaveSpec().rate;
    state.spawnAcc -= dt;
    if (state.spawnAcc <= 0 && state.enemies.length < 95) {
      state.spawnAcc = spawnRate;
      spawnEnemy();
    }
  }

  // CHASING CAT PAW (Tracks player with varying speed -> locks -> slams! Duck under tables/bed to block!)
  if (state.time > 14) {
    state.pawAcc -= dt;
    if (state.pawAcc <= 0) {
      state.pawAcc = Math.max(7.5, 13 - state.wave * 1.1);
      state.catPaws.push({
        x: p.x + 80,
        y: p.y - 60,
        radius: 76,
        phase: "chase",
        timer: 1.75,
        lockDur: 0.65,
      });
      showToast("🐾 猫主子盯上你了！快钻进茶几/餐桌/大床底下躲猫掌！", "pink");
    }
  }
  for (let i = state.catPaws.length - 1; i >= 0; i--) {
    const paw = state.catPaws[i];
    paw.timer -= dt;
    if (paw.phase === "chase") {
      // Tracks player with smooth accelerating pursuit!
      const chaseSpd = paw.timer < 0.7 ? 245 : 155;
      const dx = p.x - paw.x;
      const dy = p.y - paw.y;
      const d = Math.hypot(dx, dy) || 1;
      paw.x += (dx / d) * Math.min(d, chaseSpd * dt);
      paw.y += (dy / d) * Math.min(d, chaseSpd * dt);
      if (paw.timer <= 0) {
        paw.phase = "lock";
        paw.timer = paw.lockDur;
      }
    } else if (paw.phase === "lock" && paw.timer <= 0) {
      paw.phase = "slam";
      paw.timer = 0.58;
      state.shake = Math.max(state.shake, 0.65);
      sfx.playCatSlam();
      spawnRing(paw.x, paw.y, 16, paw.radius * 1.4, "#ff4c76", 7, 0.34);

      if (Math.hypot(p.x - paw.x, p.y - paw.y) < paw.radius + p.r * 0.55) {
        if (isUnderHiddenCover(state.layout, p.x, p.y)) {
          // Safe under table/desk/bed!
          spawnText(p.x, p.y - 30, "🛡️ 钻桌底完美躲过猫掌！", "#39ff88", 18);
          sfx.playBigGold();
        } else if (p.invuln <= 0) {
          const catDmg = p.skin === "hidden_catgod" ? 12 : 24;
          p.hp -= catDmg;
          p.hurtFlash = 0.22;
          p.invuln = 0.7;
          state.lastHitSource = "catpaw";
          sfx.playHurt();
          vibrate(35);
          spawnText(p.x, p.y - 26, `-${catDmg} 🐾`, "#ff4c76", 20);
        }
      }
    } else if (paw.phase === "slam" && paw.timer <= 0) {
      state.catPaws.splice(i, 1);
    }
  }

  updateWeapons(dt);

  // Enemies AI (including Pooper trap-dropper, Milk-Tea Slime puddle-spitter, Boss 3-skill!)
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.flash = Math.max(0, e.flash - dt);
    e.squash = Math.max(0, (e.squash || 0) - dt * 2.8);
    if (e.stun > 0) {
      e.stun -= dt;
      continue;
    }
    if (e.stagger > 0) {
      e.stagger -= dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const slam = clampToRoom(state.layout, e, e.r);
      if (slam && Math.hypot(e.vx, e.vy) > 135) {
        e.stun = 1.1;
        e.vx = 0;
        e.vy = 0;
        spawnText(e.x, e.y - e.r - 12, "💥 撞墙晕眩!", "#ffd54a", 16);
        if (damageEnemy(e, 38 + state.wave * 10, 0, 0, true)) {
          state.enemies.splice(i, 1);
          continue;
        }
      }
      e.vx *= Math.pow(0.05, dt);
      e.vy *= Math.pow(0.05, dt);
      continue;
    }

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.type === "mop") {
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
            e.aiState = "windup";
            e.aiTimer = 0.85;
            e.chargeAng = Math.atan2(dy, dx);
          } else {
            e.aiTimer = 3.2;
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * Math.PI * 2 + state.time;
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
        e.x += Math.cos(e.chargeAng) * 440 * dt;
        e.y += Math.sin(e.chargeAng) * 440 * dt;
        const hitWall = clampToRoom(state.layout, e, e.r);
        if (hitWall) {
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
      clampToRoom(state.layout, e, e.r);
    } else if (e.type === "pooper") {
      const orbitAng = Math.atan2(dy, dx) + (d < 160 ? Math.PI * 0.72 : 0.4);
      e.x += (Math.cos(orbitAng) * e.speed + e.vx) * dt;
      e.y += (Math.sin(orbitAng) * e.speed + e.vy) * dt;
      clampToRoom(state.layout, e, e.r);
      e.dropCd -= dt;
      if (e.dropCd <= 0 && state.poops.length < 10) {
        e.dropCd = 4.8;
        state.poops.push({ x: e.x, y: e.y, life: 14, flash: 0 });
        spawnText(e.x, e.y - 20, "💩 偷偷拉了一坨!", "#c08457", 13);
      }
    } else {
      e.x += ((dx / d) * e.speed + e.vx) * dt;
      e.y += ((dy / d) * e.speed + e.vy) * dt;
      clampToRoom(state.layout, e, e.r);
      if (e.type === "sock" && d < 320) {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          e.shootCd = 3.6;
          state.enemyBullets.push({ x: e.x, y: e.y, vx: (dx / d) * 175, vy: (dy / d) * 175, r: 7, dmg: 10, color: "#84cc16", life: 2.4 });
        }
      } else if (e.type === "slime" && d < 280) {
        e.shootCd -= dt;
        if (e.shootCd <= 0 && state.puddles.length < 8) {
          e.shootCd = 4.4;
          state.puddles.push({ x: p.x + (Math.random() - 0.5) * 60, y: p.y + (Math.random() - 0.5) * 60, r: 54, life: 7.5 });
          spawnText(e.x, e.y - 20, "🧋 泼珍珠奶茶!", "#f5b971", 13);
        }
      }
    }

    e.vx *= Math.pow(0.05, dt);
    e.vy *= Math.pow(0.05, dt);

    if (d < e.r + (p.giant > 0 ? p.r * 1.65 : p.r) - 3) {
      if (p.overdrive > 0 || p.giant > 0) {
        if (damageEnemy(e, p.giant > 0 ? 85 : 60, (-dx / d) * 340, (-dy / d) * 340, true)) {
          state.enemies.splice(i, 1);
          continue;
        }
      } else if (p.invuln <= 0) {
        p.hp -= e.dmg;
        p.hurtFlash = 0.18;
        p.invuln = 0.55;
        state.lastHitSource = e.type === "mop" ? "mop" : "default";
        state.shake = Math.max(state.shake, 0.35);
        sfx.playHurt();
        vibrate(20);
        spawnText(p.x, p.y - 24, `-${e.dmg}`, "#ff4c76", 18);
      }
    }
  }

  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || pointHitsObstacle(state.layout, b.x, b.y)) {
      spawnParticles(b.x, b.y, b.color, 4, 80, false);
      state.enemyBullets.splice(i, 1);
      continue;
    }
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r - 3 && p.invuln <= 0) {
      p.hp -= b.dmg;
      p.hurtFlash = 0.18;
      p.invuln = 0.5;
      state.lastHitSource = "bullet";
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

  // Gems, Coins & Rare Gold Cores
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
      p.charge = Math.min(100, p.charge + 1.5 * state.chargeMult);
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
          p.xpNext = Math.round(p.xpNext * 1.45 + 16);
          openLevelUp();
        }
      }
      state.gems.splice(i, 1);
    }
  }

  for (let i = state.lootDrops.length - 1; i >= 0; i--) {
    const drop = state.lootDrops[i];
    if (Math.hypot(p.x - drop.x, p.y - drop.y) < p.r + 32) {
      if (drop.isKey) {
        state.hasKey = true;
        const facs = state.layout.lockedFacilities;
        const fac = facs[Math.floor(state.rng() * facs.length)];
        state.keyTarget = { ...fac, opened: false };
        sfx.playBigGold();
        showToast(`🗝️ 获得神秘钥匙！跟着金色箭头去撬开【${fac.label}】！`, "gold");
      } else {
        state.bagLoot.push(drop);
        sfx.playBigGold();
        vibrate(28);
        state.shake = 0.45;
        spawnParticles(drop.x, drop.y, "#ffd54a", 24, 210, true);
        showJackpotBanner(drop.name, drop.value, "📦 成功捡漏群友遗产！");
        if (drop.isGhost) state.rescuedGhost = drop.owner;
      }
      state.lootDrops.splice(i, 1);
    }
  }

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
  if (state.wavePhase === "breather") {
    timerEl.textContent = `✨喘息:${Math.max(1, Math.ceil(state.breatherTimer))}s`;
    timerEl.classList.remove("urgent");
    timerEl.style.color = "#39ff88";
  } else {
    const sec = Math.max(0, Math.ceil(state.hordeTimer));
    timerEl.textContent = `潮:${sec}s`;
    timerEl.classList.toggle("urgent", sec <= 5);
    timerEl.style.color = "";
  }
  document.getElementById("hud-xp").style.width = `${Math.min(100, (p.xp / p.xpNext) * 100)}%`;

  const cleanEl = document.getElementById("hud-clean");
  const pct = state.cleanTracker.percent;
  cleanEl.textContent = pct >= 100 ? "★★★ 100%!" : pct >= 70 ? `★★ ${pct}%` : pct >= 35 ? `★ ${pct}%` : `🧹 ${pct}% (35%★)`;
  cleanEl.classList.toggle("done", pct >= 35);

  document.getElementById("hud-wave").textContent = `第${state.wave}波 · LV${p.lv}`;
  document.getElementById("hud-combo").textContent = p.slimeDebuff > 0 ? "🧋减速中" : state.fever > 0 ? "🔥FEVER" : state.combo >= 5 ? `${state.combo}连击` : "";

  const ready = p.charge >= 100;
  btnOverdrive.classList.toggle("ready", ready);
  odTxt.textContent = p.overdrive > 0 ? "暴走中!" : ready ? "过载清屏!" : `${Math.floor(p.charge)}%`;

  const cloneReady = p.cloneCd <= 0;
  btnClone.classList.toggle("ready", cloneReady);
  cloneTxt.textContent = cloneReady ? "分身" : `${Math.ceil(p.cloneCd)}s`;

  const giantReady = p.giant <= 0 && p.giantCharges > 0;
  const giantAd = p.giant <= 0 && p.giantCharges <= 0 && !p.giantAdUsed;
  btnGiant.classList.toggle("ready", giantReady);
  btnGiant.classList.toggle("ad-refill", giantAd);
  giantTxt.textContent = p.giant > 0 ? `${Math.ceil(p.giant)}s` : giantReady ? `变大×${p.giantCharges}` : giantAd ? "▶补1次" : "已用完";
}

// Inputs & Navigation
window.addEventListener("keydown", (e) => {
  if (!state) return;
  if (e.code === "Escape") {
    if (state.phase === "playing") openPause();
    else if (state.phase === "paused") closePause();
    return;
  }
  if (state.phase === "playing") {
    state.keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      triggerOverdrive();
    } else if (e.code === "KeyQ") {
      triggerClone();
    } else if (e.code === "KeyE") {
      triggerGiant();
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
btnClone.addEventListener("click", (e) => {
  e.stopPropagation();
  triggerClone();
});
btnGiant.addEventListener("click", (e) => {
  e.stopPropagation();
  triggerGiant();
});
document.getElementById("btn-pause").onclick = openPause;
document.getElementById("btn-resume").onclick = closePause;
document.getElementById("btn-quit-run").onclick = () => {
  screenPause.hidden = true;
  if (state) finishRun(false);
};
const closeUnboxing = () => {
  rewardPopup.hidden = true;
  if (state && state.phase === "unboxing") {
    state.phase = "playing";
    state.player.invuln = Math.max(state.player.invuln, 1.0);
  }
};
document.getElementById("btn-rw-ok").onclick = closeUnboxing;
rewardPopup.onclick = (e) => {
  if (e.target === rewardPopup) closeUnboxing();
};
document.getElementById("btn-share-close").onclick = () => {
  shareModal.hidden = true;
};

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

document.getElementById("mode-daily-toggle").onclick = () => {
  selectedMode = selectedMode === "daily" ? "free" : "daily";
  refreshLobby();
};
document.getElementById("btn-play").onclick = startRun;
document.getElementById("btn-quick-garage").onclick = () => {
  currentNav = "garage";
  refreshLobby();
};
document.getElementById("btn-res-lobby").onclick = () => {
  screenResult.hidden = true;
  hudEl.hidden = true;
  activeBar.hidden = true;
  lobbyShell.hidden = false;
  refreshLobby();
};
document.querySelectorAll(".nav-btn").forEach((b) => {
  b.onclick = () => {
    currentNav = b.dataset.nav;
    refreshLobby();
  };
});
document.querySelectorAll("[data-gtab]").forEach((b) => {
  b.onclick = () => {
    currentGarageTab = b.dataset.gtab;
    renderGarage();
  };
});
document.querySelectorAll(".stab[data-ctab]").forEach((b) => {
  b.onclick = () => {
    currentCodexTab = b.dataset.ctab;
    renderCodex();
  };
});
document.getElementById("btn-mute").onclick = (e) => {
  sfx.setMuted(!sfx.muted);
  e.target.textContent = sfx.muted ? "🔇" : "🔊";
};

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state && state.phase !== "ended") {
    update(dt);
    renderGame(ctx, state, vw, vh);
  }
  requestAnimationFrame(loop);
}

refreshLobby();
requestAnimationFrame(loop);
