import * as THREE from "three";
import { makeMineralStyle } from "../world/lunar-mineral-styles.mjs";
import { hash } from "../world/lunar-world.mjs";

const SAVE_KEY = "selene-extraction-v2";
const BASE_RUN_SECONDS = 90;
const EXTRACT_RADIUS = 2.75;
const HABITAT_POS = { x: -9.17, z: -7.5, avoid: 5.0 };

const TIERS = {
  1: { name: "近区青晶", nameEn: "Inner Quartz", value: 45, color: 0x74ffd8, css: "#74ffd8", radius: 0.42 },
  2: { name: "中区琥珀", nameEn: "Mid Amber", value: 110, color: 0xffbb61, css: "#ffbb61", radius: 0.50 },
  3: { name: "危区紫核", nameEn: "Outer Core", value: 240, color: 0xd986ff, css: "#d986ff", radius: 0.58 },
};

const WAVE_MULT = [1.0, 1.35, 1.8, 2.3, 2.9];

const SVG = {
  coin: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="8,1.5 14,5 14,11 8,14.5 2,11 2,5"/><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/></svg>`,
  video: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><polygon points="6.5,5.5 11.2,8 6.5,10.5" fill="currentColor" stroke="none"/></svg>`,
  vip: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12L3.5 4.5L8 8L12.5 4.5L14 12Z"/><line x1="2.5" y1="14" x2="13.5" y2="14"/></svg>`,
  gem: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5,2 11,2 14.5,6 8,14 1.5,6"/><line x1="1.5" y1="6" x2="14.5" y2="6"/></svg>`,
  chart: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 13.5H14"/><rect x="3" y="8" width="2.2" height="5.5" fill="currentColor" stroke="none"/><rect x="6.9" y="5" width="2.2" height="8.5" fill="currentColor" stroke="none"/><rect x="10.8" y="2.5" width="2.2" height="11" fill="currentColor" stroke="none"/></svg>`,
  shield: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5L13.5 4V8.5C13.5 11.8 11 13.8 8 14.8C5 13.8 2.5 11.8 2.5 8.5V4Z"/></svg>`,
  magnet: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3V8.5A4 4 0 0 0 12 8.5V3"/><line x1="2.5" y1="5.5" x2="5.5" y2="5.5"/><line x1="10.5" y1="5.5" x2="13.5" y2="5.5"/></svg>`,
  bolt: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="9.2,1.5 3.5,9 7.8,9 6.8,14.5 12.5,7 8.2,7" fill="currentColor"/></svg>`,
  burst: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="8,1 9.8,5.8 15,6 11,9.4 12.4,14.5 8,11.5 3.6,14.5 5,9.4 1,6 6.2,5.8"/></svg>`,
  rocket: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5C10.5 3.5 11.5 6.5 11 10L8 12.5L5 10C4.5 6.5 5.5 3.5 8 1.5Z"/><circle cx="8" cy="6.5" r="1.2" fill="currentColor" stroke="none"/><path d="M5 9.5L2.5 11.5M11 9.5L13.5 11.5"/></svg>`,
  wing: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3C8.5 3.5 4.5 7 2 13C6.5 12.2 10.5 9.5 14 3Z"/><line x1="3" y1="12" x2="10.5" y2="6.5"/></svg>`,
  moon: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.8 10.4A5.5 5.5 0 0 1 5.6 4.2A5.5 5.5 0 1 0 11.8 10.4Z"/></svg>`,
  flame: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 1.8C11.2 4.5 12.8 7 12.8 9.8A4.8 4.8 0 0 1 3.2 9.8C3.2 7.5 4.6 5.6 6 4.5C6.2 6.2 7.2 6.8 8 6.8C7.6 4.9 7.8 3.2 8.5 1.8Z"/></svg>`,
  battery: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4.5" width="10.5" height="7" rx="1"/><line x1="14" y1="6.5" x2="14" y2="9.5" stroke-width="2"/><rect x="4" y="6.3" width="4.5" height="3.4" fill="currentColor" stroke="none"/></svg>`,
  crate: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="8,1.8 14,5 14,11 8,14.2 2,11 2,5"/><line x1="8" y1="8" x2="8" y2="14.2"/><line x1="2" y1="5" x2="8" y2="8"/><line x1="14" y1="5" x2="8" y2="8"/></svg>`,
  check: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,8.5 6.5,12 13,4.5"/></svg>`,
  sun: `<svg class="ext-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M12.6 3.4L11.5 4.5M4.5 11.5L3.4 12.6"/></svg>`,
};

const UPGRADES = [
  { id: "cargo", icon: SVG.crate, name: "货舱扩容", nameEn: "Cargo Bay", desc: "提升单波最大携带矿石数", descEn: "Carry more ore per wave",
    costs: [90, 220, 460, 880], values: [5, 7, 9, 12, 16], unit: "格" },
  { id: "engine", icon: SVG.rocket, name: "离子引擎", nameEn: "Ion Drive", desc: "推进充能提速 & 满载抗减速", descEn: "Faster boost & cargo torque",
    costs: [100, 240, 500, 940], values: ["1.0×", "1.15×", "1.30×", "1.48×", "1.68×"], unit: "" },
  { id: "drill", icon: SVG.bolt, name: "共振钻头", nameEn: "Resonance Drill", desc: "加速采矿 & 扩大暴击甜区", descEn: "Faster harvest & wider crit zone",
    costs: [85, 210, 440, 840], values: ["1.7s", "1.38s", "1.12s", "0.90s", "0.72s"], unit: "" },
  { id: "battery", icon: SVG.battery, name: "高能电池", nameEn: "Solar Cell", desc: "延长单局续航 & 降低危区耗电", descEn: "Longer run & lower outer drain",
    costs: [95, 230, 480, 900], values: ["90s", "108s", "126s", "144s", "165s"], unit: "" },
];

const CHASSIS_CLASSES = [
  {
    id: "explorer", theme: "cyan", cost: 0, swatch: "#74ffd8",
    code: "L-07", name: "先锋探索者", nameEn: "L-07 Explorer",
    tag: "均衡全能", tagEn: "BALANCED",
    passive: "标准 1.0× 机动与均衡采集", passiveEn: "Balanced 1.0× speed & harvest",
  },
  {
    id: "falcon", theme: "gold", cost: 320, swatch: "#ffc864",
    code: "V-12", name: "猎隼疾速艇", nameEn: "V-12 Falcon",
    tag: "高速流", tagEn: "SPEEDSTER",
    passive: "推进 +22% · 飞跃/加速门 +30% 币", passiveEn: "+22% Thruster · +30% Stunt/Gate CR",
  },
  {
    id: "titan", theme: "crimson", cost: 640, swatch: "#ff5a7a",
    code: "T-88", name: "泰坦重装矿机", nameEn: "T-88 Titan Rig",
    tag: "重装磁吸", tagEn: "HEAVY RIG",
    passive: "货舱 +3 · 磁吸 +35% · 每波护盾 ×1", passiveEn: "+3 Cargo · +35% Magnet · Free Shield",
  },
  {
    id: "ufo", theme: "ufo", cost: 880, swatch: "#6bffb8",
    code: "X-00", name: "星环迷你飞碟", nameEn: "X-00 Pocket UFO",
    tag: "★ 彩蛋悬浮", tagEn: "★ EASTER EGG",
    passive: "迷你零阻悬浮 · 磁吸 +50% · 竞速漂移回气 ×1.5", passiveEn: "Mini Anti-Grav Hover · +50% Magnet · 1.5× Drift Nitro",
  },
];

const BOUNTY_DEFS = [
  { id: "crits3", stat: "crits", goal: 3, reward: 120, name: "精准共振 · 累计 3 次暴击", nameEn: "Trigger 3 Resonance Crits" },
  { id: "combo4", stat: "maxCombo", goal: 4, reward: 150, name: "狂热连击 · 单局达成 ×4 连击", nameEn: "Reach ×4 FEVER Combo" },
  { id: "wave2", stat: "bestWave", goal: 2, reward: 200, name: "深潜先锋 · 冲刺抵达第 2 波", nameEn: "Push Deeper to Wave 2" },
];

const SYNERGY_LABEL = {
  crit: ["磁吸暴击流", "CRIT BUILD"],
  stunt: ["低重飞车流", "STUNT BUILD"],
  greed: ["深空赌徒流", "GREED BUILD"],
};

const PERK_POOL = [
  // Synergy 1: Magnet & Crit Build
  { id: "magnet", synergy: "crit", rarity: "rare", icon: SVG.magnet, name: "强磁脉冲", nameEn: "Magnet Pulse",
    stat: "+45% 采集半径", statEn: "+45% Magnet Radius",
    desc: "远距离锁定矿脉并提升 20% 钻切速度", descEn: "Lock veins farther away & +20% drill speed" },
  { id: "overclock", synergy: "crit", rarity: "epic", icon: SVG.bolt, name: "共振超频", nameEn: "Resonance Overclock",
    stat: "暴击甜区 ×1.6", statEn: "1.6× Crit Window",
    desc: "大幅拓宽金色甜区，轻松连续触发 ×2 碎裂", descEn: "Widens the gold sweet spot for easy 2× crits" },
  { id: "splinter", synergy: "crit", rarity: "epic", icon: SVG.burst, name: "晶核裂变", nameEn: "Core Splinter",
    stat: "暴击 +40% 币 & +2 连击", statEn: "Crit +40% CR & +2 Combo",
    desc: "每次共振暴击额外炸出 40% 矿币并飙升连击", descEn: "Crits burst +40% bonus credits & +2 combo" },
  { id: "midas", synergy: "crit", rarity: "legendary", icon: SVG.gem, name: "黄金矿脉", nameEn: "Midas Vein",
    stat: "后续矿值 +35%", statEn: "+35% Ore Value",
    desc: "后续所有采集矿石基础价值稳定提升 35%", descEn: "Boosts all subsequent ore harvests by +35%" },

  // Synergy 2: Low-G Speed & Stunt Build
  { id: "turbo", synergy: "stunt", rarity: "rare", icon: SVG.rocket, name: "离子增压", nameEn: "Ion Overdrive",
    stat: "推进瞬满 + 速充", statEn: "Full Boost + Recharge",
    desc: "立即充满推进槽并大幅提升本局回能速度", descEn: "Refills boost immediately & speeds recharge" },
  { id: "feather", synergy: "stunt", rarity: "rare", icon: SVG.wing, name: "反重力减载", nameEn: "Anti-Grav Hull",
    stat: "无视满载减速", statEn: "Zero Cargo Drag",
    desc: "抵消货舱满载带来的速度衰减，满舱照样飞驰", descEn: "Eliminates heavy cargo drag completely" },
  { id: "aeroboost", synergy: "stunt", rarity: "epic", icon: SVG.moon, name: "腾空涡轮", nameEn: "Lunar Thruster",
    stat: "飞跃 +65 币 & 满推进", statEn: "Air Jump +65 CR & Boost",
    desc: "每次低重力冲坡飞跃直接奖励 65 矿币并回满氮气", descEn: "Crater Air Jumps grant +65 CR & full boost" },
  { id: "combo_keep", synergy: "stunt", rarity: "legendary", icon: SVG.flame, name: "狂热永动", nameEn: "Fever Overdrive",
    stat: "连击减速半减 & +25% 倍率", statEn: "Slow Decay & +25% Mult",
    desc: "连击条衰减减半，且连击收益倍率额外加成 25%", descEn: "Halves combo decay & boosts combo payouts +25%" },

  // Synergy 3: High-Risk Greed & Shield Build
  { id: "battery_surge", synergy: "greed", rarity: "rare", icon: SVG.battery, name: "核能电池包", nameEn: "Cell Surge",
    stat: "+24 秒续航", statEn: "+24s Battery",
    desc: "立即补充 24 秒续航，放心冲刺外圈紫核区", descEn: "Instant +24s battery for outer-rim runs" },
  { id: "aegis", synergy: "greed", rarity: "epic", icon: SVG.shield, name: "等离子护盾", nameEn: "Aegis Shield",
    stat: "免伤反赚 +100 币", statEn: "Block Hit & +100 CR",
    desc: "每波充能 1 次护盾：抵消巡检机激光扣时并反赚赏金", descEn: "Blocks 1 patrol hit per wave & pays +100 CR" },
  { id: "cargo_pod", synergy: "greed", rarity: "legendary", icon: SVG.crate, name: "外挂折叠舱", nameEn: "Aux Cargo Pod",
    stat: "货舱 +4 格 & 危区省电", statEn: "+4 Cargo & Half Drain",
    desc: "临时扩展 4 格货舱并将外圈高危区耗电减半", descEn: "+4 cargo slots & halves outer danger drain" },
  { id: "deep_greed", synergy: "greed", rarity: "legendary", icon: SVG.vip, name: "深空赌徒", nameEn: "Deep Gambler",
    stat: "中/危区 +45% 矿值", statEn: "+45% Mid/Outer Value",
    desc: "中区琥珀与危区紫核价值提升 45%，深潜倍率 +0.2×", descEn: "+45% Mid/Outer ore value & +0.2× wave bonus" },
];

const RARITY_LABEL = {
  rare: ["精良 · RARE", "RARE"],
  epic: ["史诗 · EPIC", "EPIC"],
  legendary: ["传说 · LEGENDARY", "LEGENDARY"],
};

function defaultProfile() {
  return {
    coins: 0,
    runs: 0,
    bestWave: 1,
    totalBanked: 0,
    rvOffers: 0,
    rvConverts: 0,
    noAdsPass: false,
    chassis: "explorer",
    unlockedChassis: ["explorer"],
    thrusterSkin: "cyan",
    unlockedSkins: ["cyan"],
    levels: { cargo: 1, engine: 1, drill: 1, battery: 1 },
    bountyStats: { crits: 0, maxCombo: 1, bestWave: 1 },
    claimedBounties: [],
    lastTimestamp: Date.now(),
  };
}

function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!raw || typeof raw !== "object") return defaultProfile();
    const base = defaultProfile();
    const unlockedSkins = Array.isArray(raw.unlockedSkins) ? raw.unlockedSkins : ["cyan"];
    const unlockedChassis = Array.isArray(raw.unlockedChassis) ? raw.unlockedChassis : ["explorer"];
    if (unlockedSkins.includes("gold") && !unlockedChassis.includes("falcon")) unlockedChassis.push("falcon");
    if (unlockedSkins.includes("crimson") && !unlockedChassis.includes("titan")) unlockedChassis.push("titan");
    const chassis = CHASSIS_CLASSES.some(c => c.id === raw.chassis)
      ? raw.chassis
      : (raw.thrusterSkin === "gold" ? "falcon" : raw.thrusterSkin === "crimson" ? "titan" : "explorer");
    return {
      ...base,
      ...raw,
      chassis,
      unlockedChassis,
      unlockedSkins,
      levels: { ...base.levels, ...(raw.levels || {}) },
      bountyStats: { ...base.bountyStats, ...(raw.bountyStats || {}), bestWave: Math.max(raw.bestWave || 1, raw.bountyStats?.bestWave || 1) },
      claimedBounties: Array.isArray(raw.claimedBounties) ? raw.claimedBounties : [],
    };
  } catch {
    return defaultProfile();
  }
}

function saveProfile(profile) {
  profile.lastTimestamp = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

function makeRng(seed) {
  let s = (seed >>> 0) || 1337;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function injectExtractionStyles() {
  if (document.getElementById("lunar-extract-style")) return;
  const style = document.createElement("style");
  style.id = "lunar-extract-style";
  style.textContent = `
    #extract-hud {
      position: fixed;
      top: max(72px, calc(env(safe-area-inset-top) + 58px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 65;
      pointer-events: none;
      display: grid;
      justify-items: center;
      gap: 6px;
      font-family: "IBM Plex Mono", "PingFang SC", system-ui, monospace;
    }
    #extract-hud[hidden] { display: none !important; }
    @media (max-width: 600px) {
      #extract-hud {
        top: max(86px, calc(env(safe-area-inset-top) + 76px));
        left: 10px;
        right: 104px;
        transform: none;
        justify-items: start;
      }
      .ext-top-row { justify-content: flex-start; gap: 4px; }
      .ext-zone-pill { font-size: 9.5px; padding: 3px 7px; }
      body:has(#extract-hud:not([hidden])) #guide { display: none !important; }
    }
    @media (min-width: 601px) and (max-height: 500px), (min-width: 601px) and (pointer: coarse) {
      #extract-hud { top: max(76px, calc(env(safe-area-inset-top) + 70px)); }
      body:has(#extract-hud:not([hidden])) #guide { display: none !important; }
    }
    .ext-top-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; align-items: center; }
    .ext-zone-pill {
      padding: 3px 10px;
      border: 1px solid #94edeb44;
      background: #070e16d6;
      font-size: 11px;
      letter-spacing: .06em;
      color: #d8eceb;
    }
    .ext-zone-pill[data-tier="2"] { border-color: #ffbb6188; color: #ffd79e; }
    .ext-zone-pill[data-tier="3"] { border-color: #d986ff99; color: #ebc0ff; }
    .ext-zone-pill[data-full="true"] { border-color: #74ffd8; background: #10362ee8; color: #9effe6; }
    .ext-combo-pill {
      padding: 3px 9px;
      border: 1px solid #ffd28a88;
      background: #24190bd8;
      color: #ffe0a3;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .ext-combo-bar { width: 42px; height: 4px; background: #ffffff22; overflow: hidden; }
    .ext-combo-bar > i { display: block; height: 100%; background: #ffd28a; width: 100%; }
    .ext-build-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; max-width: 460px; }
    .ext-chip {
      padding: 2px 7px;
      border: 1px solid #74ffd855;
      background: #081520d4;
      font-size: 10px;
      color: #b7ece8;
    }
    .ext-chip[data-rarity="epic"] { border-color: #c57cff88; color: #e2b8ff; }
    .ext-chip[data-rarity="legendary"] { border-color: #ffd275aa; color: #ffe09a; }
    #ext-resonance {
      pointer-events: auto;
      width: 248px;
      padding: 8px 10px;
      border: 1px solid #74ffd877;
      background: #060d14e6;
      box-shadow: 0 10px 28px #000a;
      display: grid;
      gap: 5px;
      text-align: center;
    }
    #ext-resonance[hidden] { display: none !important; }
    .ext-res-title { font-size: 11px; color: #e8f7f5; display: flex; justify-content: space-between; }
    .ext-res-bar {
      position: relative;
      height: 12px;
      background: #0f1b27;
      border: 1px solid #a8b4bd44;
      overflow: hidden;
    }
    .ext-res-sweet {
      position: absolute;
      top: 0; bottom: 0;
      background: linear-gradient(90deg, #ffbb6166, #ffd788cc, #ffbb6166);
      border-inline: 1px solid #ffe4a8;
    }
    .ext-res-needle {
      position: absolute;
      top: 0; bottom: 0;
      width: 5px;
      background: #ffffff;
      box-shadow: 0 0 10px #74ffd8;
      transition: background .08s ease, box-shadow .08s ease;
    }
    #ext-resonance[data-in-sweet="true"] {
      border-color: #ffd788dd;
      box-shadow: 0 0 24px #ffcf6d55, 0 10px 28px #000a;
    }
    #ext-resonance[data-in-sweet="true"] .ext-res-needle {
      background: #fff3b8;
      box-shadow: 0 0 16px #ffd266, 0 0 6px #ffffff;
    }
    #ext-resonance[data-in-sweet="true"] #ext-crit-btn {
      background: linear-gradient(90deg, #f3c460, #ffe39e);
      color: #0b1117;
      border-color: #fff3c8;
      font-weight: 800;
      box-shadow: 0 0 16px #ffd26688;
    }
    .ext-res-fill { height: 4px; background: #0d1924; overflow: hidden; }
    .ext-res-fill > div { height: 100%; background: #74ffd8; width: 0%; }
    #ext-crit-btn {
      padding: 5px 8px;
      border: 1px solid #ffd28a88;
      background: #2d2312;
      color: #ffe3b0;
      font: 600 11px/1.1 inherit;
      cursor: pointer;
    }
    #ext-popup {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: .06em;
      color: #fff6df;
      text-shadow: 0 0 14px #74ffd8aa, 0 2px 10px #000c;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity .16s ease, transform .16s ease;
    }
    #ext-popup[data-show="true"] { opacity: 1; transform: translateY(0); }
    #ext-popup[data-tone="crit"] { color: #ffd28a; text-shadow: 0 0 18px #ffaa44cc, 0 2px 10px #000c; }
    #ext-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 140;
      background: radial-gradient(circle at 50% 45%, #07101bc4 0%, #03070ee0 100%);
      backdrop-filter: blur(8px);
      display: grid;
      place-items: center;
      padding: 18px;
      font-family: Inter, "PingFang SC", system-ui, sans-serif;
    }
    #ext-modal-backdrop[data-layout="garage"] {
      justify-items: end;
      align-items: center;
      padding-right: clamp(16px, 3.6vw, 48px);
      backdrop-filter: none;
      background: linear-gradient(90deg, transparent 0%, #04081022 36%, #050a14ba 56%, #060b14eb 100%);
    }
    /* Mobile Landscape (601px..960px): keep left 3D Showroom completely clear + compact right-docked Hangar panel */
    @media (min-width: 601px) and (max-width: 960px) {
      #ext-modal-backdrop[data-layout="garage"] {
        padding: 10px 12px 10px 10px;
        background: linear-gradient(90deg, transparent 0%, transparent 42%, #050a14c8 56%, #060b14ee 100%);
      }
      #ext-modal-backdrop[data-layout="garage"] .ext-card {
        width: min(410px, 52vw);
        max-height: 92vh;
        padding: 12px 14px;
        gap: 9px;
      }
      #ext-modal-backdrop[data-layout="garage"] .ext-head h2 { font-size: 15px; }
    }
    /* Mobile Portrait (<=600px): Top 42% live 3D Showroom window + Bottom 58% docked drawer sheet! */
    @media (max-width: 600px) {
      #ext-modal-backdrop[data-layout="garage"] {
        align-items: end;
        justify-items: stretch;
        padding: 0;
        backdrop-filter: none;
        background: linear-gradient(180deg, transparent 0%, transparent 34%, #050a14d8 46%, #050a14f6 100%);
      }
      #ext-modal-backdrop[data-layout="garage"] .ext-card {
        width: 100%;
        max-height: 58vh;
        padding: 13px 14px max(16px, env(safe-area-inset-bottom));
        clip-path: none;
        border-radius: 16px 16px 0 0;
        border-left: none;
        border-right: none;
        border-bottom: none;
        gap: 9px;
      }
      #ext-modal-backdrop[data-layout="garage"] .ext-head h2 { font-size: 15.5px; }
    }
    #ext-modal-backdrop[hidden] { display: none !important; }
    /* Hide gameplay HUD overlays while 3D Hangar Showroom is open so the rotating 3D Rover has a pure, unobstructed stage! */
    body:has(#ext-modal-backdrop[data-layout="garage"]:not([hidden])) :is(.telemetry, #guide, .navigation, #joystick, .touch-controls, #pause-toggle) {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .ext-ico { width: 15px; height: 15px; display: inline-block; vertical-align: -2.5px; flex: none; }
    .ext-perk-icon .ext-ico { width: 34px; height: 34px; vertical-align: middle; }
    .ext-chip .ext-ico { width: 11px; height: 11px; vertical-align: -1.5px; margin-right: 3px; }
    .ext-card {
      position: relative;
      width: min(560px, 100%);
      max-height: min(90vh, 760px);
      overflow-y: auto;
      padding: 20px 22px;
      border: 1px solid #82d8d544;
      clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
      background:
        radial-gradient(circle at 85% 0%, #16364466 0%, transparent 45%),
        linear-gradient(160deg, #0c1724f0 0%, #070e18f5 100%);
      color: #edf4f6;
      box-shadow: 0 28px 70px #000d, inset 0 1px 0 #ffffff1e;
      display: grid;
      gap: 12px;
    }
    .ext-card::before {
      content: "";
      position: absolute;
      top: 0; left: 0;
      width: 96px; height: 2px;
      background: linear-gradient(90deg, #74ffd8, transparent);
      box-shadow: 0 0 14px #74ffd899;
    }
    .ext-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #96b8c426; padding-bottom: 11px; }
    .ext-head-title { display: grid; gap: 3px; }
    .ext-eyebrow { font: 600 9.5px/1 "IBM Plex Mono", monospace; letter-spacing: .2em; color: #74ffd8b8; text-transform: uppercase; }
    .ext-head h2 { margin: 0; font-size: 18px; letter-spacing: .04em; color: #fffaf0; }
    .ext-coins {
      display: inline-flex; align-items: center; gap: 6px;
      flex-shrink: 0; white-space: nowrap;
      padding: 5px 11px;
      border: 1px solid #ffd28a55;
      background: #221a0dc4;
      clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px));
      font: 700 14px/1 "IBM Plex Mono", monospace;
      color: #ffd68d;
    }
    .ext-banner {
      padding: 11px 13px;
      border: 1px solid #74ffd855;
      border-left: 3px solid #74ffd8;
      background: linear-gradient(115deg, #0f2630cc 0%, #0a1622cc 100%);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }
    .ext-banner[data-tone="danger"] { border-color: #ff765b88; border-left-color: #ff694e; background: linear-gradient(115deg, #2b1316dd, #170b0fdd); }
    .ext-banner[data-tone="risk"] { border-color: #ffbe5599; border-left-color: #ffd275; background: linear-gradient(115deg, #2b1d0de0, #161020e0); }
    .ext-grade-stamp {
      display: inline-grid; place-items: center;
      width: 38px; height: 38px;
      border: 1.5px solid #ffd275;
      background: radial-gradient(circle, #ffd27533, transparent);
      font: 800 20px/1 "IBM Plex Mono", monospace;
      color: #ffe29e;
      text-shadow: 0 0 14px #ffae33aa;
      flex: none;
    }
    .ext-btn-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .ext-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 13px;
      border: 1px solid #96b8c43d;
      clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
      background: #11202ee0;
      color: #ebf4f6;
      font: 600 12px/1.2 inherit;
      letter-spacing: .04em;
      cursor: pointer;
      transition: transform .14s ease, background .14s ease, border-color .14s ease, box-shadow .14s ease;
    }
    .ext-btn:hover:not(:disabled), .ext-btn[data-kb-focus="true"] {
      background: #1b3449;
      border-color: #94edebcc;
      box-shadow: 0 0 18px #74ffd833;
      transform: translateY(-1px);
    }
    .ext-btn[data-kb-focus="true"] { outline: 2px solid #74ffd8; outline-offset: 2px; }
    .ext-btn:disabled { opacity: .42; cursor: not-allowed; }
    .ext-btn.primary {
      background: linear-gradient(108deg, #f3d7a4, #fbf0da);
      color: #0b1117;
      border-color: #fff3da;
      font-weight: 760;
    }
    .ext-btn.primary:hover:not(:disabled), .ext-btn.primary[data-kb-focus="true"] {
      background: #fff4df;
      box-shadow: 0 0 22px #f3d7a455;
    }
    .ext-btn.rv {
      background: linear-gradient(120deg, #12443e, #1f685c);
      border-color: #74ffd8aa;
      color: #effffc;
    }
    .ext-btn.rv:hover:not(:disabled) { background: linear-gradient(120deg, #195951, #298273); box-shadow: 0 0 20px #74ffd844; }
    .ext-btn.risk {
      background: linear-gradient(120deg, #6e3810, #a64d14);
      border-color: #ffd275cc;
      color: #fff8eb;
    }
    .ext-btn.risk:hover:not(:disabled), .ext-btn.risk[data-kb-focus="true"] {
      background: linear-gradient(120deg, #8a4614, #c45c19);
      box-shadow: 0 0 24px #ffae3355;
    }
    .ext-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
    @media (max-width: 560px) { .ext-grid { grid-template-columns: 1fr; } }
    .ext-item {
      padding: 10px 12px;
      border: 1px solid #94b8c429;
      clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
      background: linear-gradient(160deg, #101e2cd8, #0a131ed8);
      display: grid;
      gap: 6px;
    }
    .ext-item-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 13px; font-weight: 650; color: #f1f7f8; }
    .ext-item-label { display: inline-flex; align-items: center; gap: 6px; color: #8ff5e2; }
    .ext-item-label > span { color: #f1f7f8; }
    .ext-item-desc { font-size: 11px; color: #9ab0bc; line-height: 1.4; }
    .ext-item-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 2px; }
    .ext-cost-tag { display: inline-flex; align-items: center; gap: 4px; font: 700 11.5px/1 "IBM Plex Mono", monospace; color: #ffd28a; }
    .ext-skins { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
    .ext-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; transform: rotate(45deg); margin-right: 3px; box-shadow: 0 0 8px currentColor; }
    .ext-showroom-tag {
      position: fixed;
      left: clamp(20px, 4vw, 56px);
      bottom: clamp(24px, 5vh, 48px);
      padding: 8px 14px;
      border: 1px solid #74ffd844;
      border-left: 3px solid #74ffd8;
      background: #07111bcc;
      font: 600 11px/1.4 "IBM Plex Mono", monospace;
      color: #c8f3ee;
      letter-spacing: .12em;
      pointer-events: none;
    }
    @media (max-width: 860px) { .ext-showroom-tag { display: none; } }
    .ext-kb-hint {
      font: 500 10.5px/1.2 "IBM Plex Mono", monospace;
      letter-spacing: .08em;
      color: #8fb2be;
      opacity: .9;
    }
    .ext-log {
      max-height: 110px;
      overflow-y: auto;
      padding: 8px;
      background: #050a10;
      border: 1px solid #a8b4bd24;
      font: 10px/1.4 "IBM Plex Mono", monospace;
      color: #8fb4bd;
    }
    #ext-ad-sim {
      position: fixed;
      inset: 0;
      z-index: 160;
      background: #020509eb;
      display: grid;
      place-items: center;
      color: #e9f5f5;
      font-family: "IBM Plex Mono", system-ui, monospace;
    }
    #ext-ad-sim[hidden] { display: none !important; }
    .ext-ad-box {
      width: min(380px, 90vw);
      padding: 22px;
      border: 1px solid #74ffd888;
      clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
      background: #0a1520;
      text-align: center;
      display: grid;
      gap: 10px;
    }
    .ext-pips { display: inline-flex; gap: 3px; align-items: center; }
    .ext-pip { width: 10px; height: 5px; background: #1d2d3a; border: 1px solid #486375; }
    .ext-pip.on { background: #74ffd8; border-color: #b4ffea; box-shadow: 0 0 6px #74ffd888; }
    .ext-draft-shell {
      width: min(800px, 96vw);
      display: grid;
      gap: 14px;
      text-align: center;
    }
    .ext-draft-head h2 {
      margin: 0;
      font-size: 22px;
      letter-spacing: .08em;
      color: #fff6e0;
      text-shadow: 0 0 24px #74ffd877;
    }
    .ext-draft-head p { margin: 5px 0 0; font-size: 12px; color: #9eb7c2; }
    .ext-perk-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    @media (max-width: 660px) { .ext-perk-grid { grid-template-columns: 1fr; } }
    .ext-perk-card {
      position: relative;
      overflow: hidden;
      padding: 18px 15px 16px;
      border: 1.5px solid #74ffd877;
      clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
      background: linear-gradient(165deg, #0e1e2e 0%, #070e17 75%);
      color: #eef6f8;
      display: grid;
      justify-items: center;
      gap: 8px;
      cursor: pointer;
      text-align: center;
      transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease, border-color .18s ease, filter .18s ease;
    }
    .ext-perk-card::before {
      content: "";
      position: absolute;
      inset: -40% -60%;
      background: linear-gradient(115deg, transparent 42%, #ffffff2e 50%, transparent 58%);
      transform: translateX(-65%);
      transition: transform .48s ease;
      pointer-events: none;
    }
    .ext-perk-card:hover, .ext-perk-card[data-kb-focus="true"] {
      transform: translateY(-9px) scale(1.035);
      box-shadow: 0 22px 48px #000d, 0 0 32px var(--card-glow, #74ffd877), inset 0 0 18px var(--card-glow, #74ffd833);
      filter: brightness(1.08);
    }
    .ext-perk-card:hover::before, .ext-perk-card[data-kb-focus="true"]::before { transform: translateX(65%); }
    .ext-perk-card[data-rarity="rare"] { --card-glow: #74ffd877; border-color: #74ffd8aa; }
    .ext-perk-card[data-rarity="epic"] {
      --card-glow: #c57cff99;
      border-color: #c57cffcc;
      background: linear-gradient(165deg, #1d1230 0%, #090814 75%);
    }
    .ext-perk-card[data-rarity="legendary"] {
      --card-glow: #ffbe55aa;
      border-color: #ffd275ee;
      background: linear-gradient(165deg, #2d200d 0%, #0d0a06 75%);
    }
    .ext-perk-tags { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; justify-content: center; }
    .ext-perk-tag {
      font: 700 9.5px/1 "IBM Plex Mono", monospace;
      letter-spacing: .10em;
      padding: 3px 7px;
      border: 1px solid currentColor;
    }
    .ext-perk-syn {
      font: 600 9.5px/1 inherit;
      padding: 3px 7px;
      background: #ffffff14;
      color: #c8dce6;
    }
    .ext-perk-card[data-rarity="rare"] .ext-perk-tag { color: #74ffd8; }
    .ext-perk-card[data-rarity="epic"] .ext-perk-tag { color: #d89eff; }
    .ext-perk-card[data-rarity="legendary"] .ext-perk-tag { color: #ffd479; }
    .ext-perk-icon {
      display: grid;
      place-items: center;
      width: 58px;
      height: 58px;
      margin: 4px 0;
      border: 1px solid var(--card-glow, #74ffd866);
      background: radial-gradient(circle, var(--card-glow, #74ffd833) 0%, transparent 72%);
      color: #ffffff;
      clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
      filter: drop-shadow(0 0 12px var(--card-glow, #74ffd866));
    }
    .ext-perk-name { font-size: 16px; font-weight: 750; color: #fffaf0; letter-spacing: .04em; }
    .ext-perk-stat {
      padding: 4px 10px;
      background: #ffffff14;
      border: 1px solid #ffffff28;
      font: 700 11.5px/1.1 "IBM Plex Mono", monospace;
      color: #ffd788;
    }
    .ext-perk-desc { font-size: 11.5px; color: #a8bcc6; line-height: 1.45; }
    .ext-perk-key {
      margin-top: 3px;
      padding: 3px 9px;
      border: 1px solid #ffffff22;
      background: #00000044;
      font: 600 10px/1 "IBM Plex Mono", monospace;
      color: #9ec0cb;
      letter-spacing: .08em;
    }
    .ext-perk-card[data-kb-focus="true"] .ext-perk-key {
      border-color: #74ffd8aa;
      background: #74ffd822;
      color: #e6fff9;
    }
    .ext-draft-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; }
    .ext-chassis-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    @media (max-width: 560px) { .ext-chassis-grid { grid-template-columns: 1fr; } }
    .ext-chassis-card {
      padding: 10px;
      border: 1px solid #96b8c433;
      clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
      background: linear-gradient(165deg, #0f1e2de0, #08101ae0);
      display: grid;
      gap: 5px;
      align-content: space-between;
      transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
    }
    .ext-chassis-card[data-active="true"] {
      border-color: var(--ch-color, #74ffd8);
      box-shadow: 0 0 18px color-mix(in srgb, var(--ch-color, #74ffd8) 32%, transparent), inset 0 0 12px color-mix(in srgb, var(--ch-color, #74ffd8) 14%, transparent);
    }
    .ext-chassis-head { display: flex; justify-content: space-between; align-items: center; gap: 4px; }
    .ext-chassis-code { font: 700 10px/1 "IBM Plex Mono", monospace; letter-spacing: .12em; color: var(--ch-color, #74ffd8); }
    .ext-chassis-tag { font: 600 9px/1 "IBM Plex Mono", monospace; padding: 2px 5px; background: #ffffff14; color: #c7dce4; }
    .ext-chassis-name { font-size: 13px; font-weight: 740; color: #fffaf0; }
    .ext-chassis-passive { font-size: 10.5px; color: #9db6c2; line-height: 1.38; min-height: 29px; }
    .ext-chassis-btns { display: grid; gap: 5px; margin-top: 2px; }
    .ext-chassis-btns .ext-btn { width: 100%; padding: 6px 8px; font-size: 11px; }
    .ext-bounty-list { display: grid; gap: 6px; }
    .ext-bounty-row {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      padding: 7px 10px;
      border: 1px solid #96b8c426;
      background: #0a1522cc;
      font-size: 11.5px;
    }
    .ext-bounty-info { display: grid; gap: 3px; flex: 1; }
    .ext-bounty-bar { height: 4px; background: #182734; overflow: hidden; }
    .ext-bounty-bar > i { display: block; height: 100%; background: linear-gradient(90deg, #74ffd8, #ffd275); }
    #ext-float-layer {
      position: fixed; inset: 0; z-index: 70; pointer-events: none; overflow: hidden;
      font-family: "IBM Plex Mono", "PingFang SC", system-ui, monospace;
    }
    .ext-float-num {
      position: absolute; left: 0; top: 0;
      font-weight: 800; letter-spacing: .04em; white-space: nowrap;
      transform: translate(-50%, -50%);
      text-shadow: 0 2px 14px #000e, 0 0 18px currentColor;
      will-change: transform, opacity;
    }
    .ext-storm-pill {
      padding: 4px 11px;
      border: 1px solid #c06cff77;
      background: #1a0b2be0;
      color: #f0abfc;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .06em;
      white-space: nowrap;
    }
    .ext-storm-pill[data-danger="true"] {
      border-color: #ff5a7a;
      background: #3d0c1ee8;
      color: #ffd0da;
      box-shadow: 0 0 18px #ff5a7a88;
    }
    .ext-storm-vignette {
      position: fixed; inset: 0; z-index: 57; pointer-events: none;
      background: radial-gradient(circle at 50% 45%, transparent 48%, #c026d366 100%);
      opacity: 0; transition: opacity .2s ease;
    }
  `;
  document.head.append(style);
}

export function createExtractionMode({ scene, camera, height, t, onThrusterTheme, onChassisChange, onHitStop, onPauseChange, onRestartRun, onExitMenu, onJuice, onSectorTerrain }) {
  injectExtractionStyles();
  const profile = loadProfile();
  const analytics = [];

  function track(event, payload = {}) {
    analytics.unshift({ ts: new Date().toISOString().slice(11, 19), event, ...payload });
    if (analytics.length > 50) analytics.length = 50;
  }

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Glowing Extraction Landing Pad Ring
  const extractRingMat = new THREE.MeshStandardMaterial({
    color: 0x74ffd8, emissive: 0x74ffd8, emissiveIntensity: 2.6, roughness: 0.25, metalness: 0.1,
  });
  const extractRing = new THREE.Mesh(new THREE.TorusGeometry(EXTRACT_RADIUS * 0.88, 0.048, 8, 42), extractRingMat);
  extractRing.rotation.x = Math.PI / 2;
  extractRing.position.set(0, height(0, 0) + 0.08, 0);
  extractRing.visible = false;
  group.add(extractRing);

  // Flying magnetized shards absorbed into rover on harvest / crate open / fever gate
  const shardGeo = new THREE.OctahedronGeometry(0.08, 0);
  const shardMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const flyingShards = new THREE.InstancedMesh(shardGeo, shardMat, 48);
  flyingShards.count = 0;
  flyingShards.frustumCulled = false;
  group.add(flyingShards);
  const shardPool = [];
  const shardPose = new THREE.Object3D();
  const shardColor = new THREE.Color();

  // 3D Expanding Ground Shockwave Rings on Crit Shatter / Jackpot / Fever Gate!
  const shockRingGeo = new THREE.RingGeometry(0.55, 0.88, 36);
  const shockRings = Array.from({ length: 4 }, () => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(2.8, 1.95, 0.55), toneMapped: false, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(shockRingGeo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, mat: m, t: 1, dur: 0.55, maxScale: 4.8 };
  });
  let nextShockIdx = 0;
  function spawnShockwave(pos, colorHex = 0xffd275, maxScale = 4.6) {
    const r = shockRings[nextShockIdx++ % shockRings.length];
    r.mesh.position.set(pos.x, pos.y + 0.14, pos.z);
    r.mat.color.setHex(colorHex).multiplyScalar(2.6);
    r.t = 0;
    r.dur = 0.52;
    r.maxScale = maxScale;
    r.mesh.visible = true;
  }

  // 3D-Projected Floating Crit / Stunt Numbers Overlay
  const floatLayer = document.createElement("div");
  floatLayer.id = "ext-float-layer";
  document.body.append(floatLayer);
  const floatingNums = [];
  const floatProj = new THREE.Vector3();
  function spawnFloatingNumber(worldPos, text, color = "#ffd788", big = false) {
    const el = document.createElement("div");
    el.className = "ext-float-num";
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = big ? "22px" : "15px";
    floatLayer.append(el);
    floatingNums.push({
      el,
      pos: worldPos.clone().add(new THREE.Vector3(0, 1.15, 0)),
      t: 0,
      dur: big ? 1.15 : 0.85,
      big,
    });
    if (floatingNums.length > 14) {
      const old = floatingNums.shift();
      old.el.remove();
    }
  }
  function clearFloatingNumbers() {
    while (floatingNums.length) floatingNums.pop().el.remove();
  }

  // Reusable 3D procedural pool: 10 Multi-Spire Faceted Hexagonal Crystal Clusters (reusing lunar-mineral-styles!)
  const mineralArchetypes = [0, 2, 1].map(idx => makeMineralStyle(idx, hash));
  const collarRockGeo = new THREE.DodecahedronGeometry(0.11, 0);
  const collarRockMat = new THREE.MeshStandardMaterial({ color: 0x5c5852, roughness: 0.93, metalness: 0.03, flatShading: true });
  const haloGeo = new THREE.TorusGeometry(1.12, 0.038, 8, 28);
  const beamGeo = new THREE.CylinderGeometry(0.09, 0.16, 7.5, 10, 1, true);
  const jackpotBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.6, 1.9, 0.5), toneMapped: false, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const TIER_TEMPLATE = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
  const nodes = TIER_TEMPLATE.map((tier, index) => {
    const tierInfo = TIERS[tier];
    const archetype = mineralArchetypes[tier - 1];
    const nodeGroup = new THREE.Group();
    const core = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({
      color: tierInfo.color, emissive: tierInfo.color, emissiveIntensity: tier === 3 ? 0.55 : tier === 2 ? 0.42 : 0.32,
      roughness: 0.22, metalness: 0.12, clearcoat: 0.85, clearcoatRoughness: 0.12,
      vertexColors: true, flatShading: true,
    });
    for (const shard of archetype.shards) {
      const m = new THREE.Mesh(shard.geometry, mat);
      m.position.set(shard.x, 0.34 * shard.size, shard.z);
      m.rotation.set(shard.rake, shard.yaw, shard.bank);
      m.scale.setScalar(shard.size * (tier === 3 ? 1.48 : tier === 2 ? 1.24 : 1.05));
      m.castShadow = true;
      m.receiveShadow = true;
      core.add(m);
    }
    // Natural semi-buried fractured rock collar around crystal base
    for (let r = 0; r < 5; r++) {
      const a = (r / 5) * Math.PI * 2 + index * 0.7;
      const chunk = new THREE.Mesh(collarRockGeo, collarRockMat);
      chunk.position.set(Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26);
      chunk.scale.set(1.1 + (r % 2) * 0.4, 0.55, 0.9);
      chunk.rotation.set(0.3 * r, a, 0.2);
      core.add(chunk);
    }
    nodeGroup.add(core);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshStandardMaterial({
      color: tierInfo.color, emissive: tierInfo.color, emissiveIntensity: 2.1, roughness: 0.2,
    }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.08;
    nodeGroup.add(halo);
    const jackpotBeam = new THREE.Mesh(beamGeo, jackpotBeamMat);
    jackpotBeam.position.y = 3.8;
    jackpotBeam.visible = false;
    nodeGroup.add(jackpotBeam);
    group.add(nodeGroup);

    return {
      index, x: 0, z: 0, tier, ...tierInfo, baseValue: tierInfo.value, jackpot: false,
      group: nodeGroup, core, mat, halo, jackpotBeam, harvested: false, progress: 0,
    };
  });

  // Reusable 3D procedural pool: 2 Orbital Supply Drop Crates (free Roguelite 3-choose-1 Draft + Battery!)
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3b444d, metalness: 0.55, roughness: 0.42 });
  const crateGoldMat = new THREE.MeshStandardMaterial({ color: 0xffc864, emissive: 0xffa634, emissiveIntensity: 2.2, toneMapped: false });
  const crateBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.4, 1.75, 0.45), toneMapped: false, transparent: true, opacity: 0.24,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const supplyCrates = Array.from({ length: 2 }, (_, index) => {
    const cg = new THREE.Group();
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.46, 0.52), crateMat);
    boxMesh.position.y = 0.25;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.09, 0.56), crateGoldMat);
    band.position.y = 0.32;
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), crateGoldMat);
    beacon.position.y = 0.64;
    const beam = new THREE.Mesh(beamGeo, crateBeamMat);
    beam.scale.set(0.7, 1, 0.7);
    beam.position.y = 3.7;
    cg.add(boxMesh, band, beacon, beam);
    group.add(cg);
    return { index, x: 0, z: 0, group: cg, beacon, opened: false };
  });

  // Reusable 3D procedural pool: 3 Fever Speed Boost Gates (absorbed from 60s Arcade Sprint!)
  const gatePylonMat = new THREE.MeshStandardMaterial({ color: 0x2a3540, metalness: 0.62, roughness: 0.36 });
  const gateGlowMat = new THREE.MeshStandardMaterial({
    color: 0x74ffd8, emissive: 0x52f2d2, emissiveIntensity: 2.5, toneMapped: false,
  });
  const feverGates = Array.from({ length: 3 }, (_, index) => {
    const gg = new THREE.Group();
    for (const sx of [-1.25, 1.25]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.55, 8), gatePylonMat);
      pylon.position.set(sx, 0.78, 0);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.09), gateGlowMat);
      strip.position.set(sx, 0.85, 0);
      gg.add(pylon, strip);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.08, 0.08), gateGlowMat);
    bar.position.y = 1.52;
    gg.add(bar);
    group.add(gg);
    return { index, x: 0, z: 0, yaw: 0, group: gg, cooldownUntil: 0 };
  });

  // 1. Refined Low-Profile EMP Storm Perimeter (2.2m height — never blocks lunar sky/Earth! Combines 4.8s gentle scan pulse + proximity fade-in!)
  const stormUniforms = { uTime: { value: 0 }, uProximity: { value: 0 } };
  const stormCurtainMat = new THREE.ShaderMaterial({
    uniforms: stormUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uProximity;
      varying vec2 vUv;
      void main() {
        // Gentle periodic scan pulse every 4.8s (1.3s soft upward sweep, then fades to a whisper)
        float cycle = mod(uTime, 4.8);
        float scanActive = 1.0 - smoothstep(1.0, 1.55, cycle);
        float scanPos = clamp(cycle / 1.35, 0.0, 1.0);
        float scanBand = exp(-pow((vUv.y - scanPos) * 7.5, 2.0)) * scanActive;

        // Delicate holographic micro-grid (never harsh thick ribbons!)
        float vGrid = smoothstep(0.92, 0.99, abs(sin(vUv.x * 160.0)));
        float hGrid = smoothstep(0.93, 0.99, abs(sin(vUv.y * 18.0 - uTime * 1.4)));
        float vertFade = (1.0 - smoothstep(0.15, 1.0, vUv.y));
        float baseRim = smoothstep(0.28, 0.0, vUv.y) * 0.24;

        // Restrained at distance, ramps smoothly when player approaches within 9m of the storm edge!
        float intensity = 0.045 + scanBand * 0.24 + uProximity * (0.28 + max(vGrid, hGrid) * 0.22);
        vec3 col = mix(vec3(0.55, 0.22, 0.88), vec3(0.92, 0.36, 0.72), uProximity * 0.65 + scanBand * 0.35);
        float alpha = clamp((baseRim + intensity) * vertFade, 0.0, 0.46);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const stormCurtain = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 64, 1, true), stormCurtainMat);
  stormCurtain.position.y = 0.95;
  const stormGroundRingMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(1.4, 0.55, 2.1), toneMapped: false,
    transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const stormGroundRing = new THREE.Mesh(
    new THREE.RingGeometry(0.988, 1.0, 72),
    stormGroundRingMat,
  );
  stormGroundRing.rotation.x = -Math.PI / 2;
  stormGroundRing.position.y = 0.18;
  group.add(stormCurtain, stormGroundRing);

  // 2. 2 Field Emergency Repair Relays (repair to push EMP Storm Ring outward +9m, heal +14s battery & +1 Shield!)
  const relayMetalMat = new THREE.MeshStandardMaterial({ color: 0x2c3948, metalness: 0.82, roughness: 0.30 });
  const fieldRelays = Array.from({ length: 2 }, (_, idx) => {
    const rg = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.26, 10), relayMetalMat);
    base.position.y = 0.13;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 2.7, 10), relayMetalMat);
    mast.position.y = 1.48;
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3.0, 1.7, 0.45), toneMapped: false });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), coreMat);
    core.position.y = 3.0;
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(3.0, 1.8, 0.45), toneMapped: false,
      transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.35, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    const skyBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.18, 26, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setRGB(0.45, 3.0, 2.8), toneMapped: false,
        transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    skyBeam.position.y = 16;
    skyBeam.visible = false;
    rg.add(base, mast, core, ring, skyBeam);
    group.add(rg);
    return { idx, x: 0, z: 0, group: rg, core, coreMat, ring, ringMat, skyBeam, progress: 0, repaired: false };
  });

  // 3. 2 Compact Low-Profile Low-G Crater Jump Ramps (never obstruct view!)
  const rampMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.55, 2.8, 2.7), toneMapped: false,
    transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const rampGeo = new THREE.PlaneGeometry(3.2, 4.6);
  rampGeo.rotateX(-Math.PI / 2 + 0.24);
  const basinRamps = Array.from({ length: 2 }, (_, idx) => {
    const m = new THREE.Mesh(rampGeo, rampMat);
    group.add(m);
    return { idx, x: 0, z: 0, yaw: 0, mesh: m, cd: 0 };
  });

  // 4. Periodic Micro-Meteorite Strike + Glowing Helium-3 Core
  const extMeteorGroup = new THREE.Group();
  extMeteorGroup.visible = false;
  const extMeteorRock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.46, 0),
    new THREE.MeshStandardMaterial({ color: 0x3b261e, emissive: 0xff621a, emissiveIntensity: 2.2, roughness: 0.45 }),
  );
  const extMeteorTail = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 4.2, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(3.6, 1.4, 0.45), toneMapped: false,
      transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  extMeteorTail.position.y = 2.1;
  extMeteorGroup.add(extMeteorRock, extMeteorTail);
  group.add(extMeteorGroup);

  const extMeteorWarn = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.0, 32),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(3.4, 0.55, 0.35), toneMapped: false,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  extMeteorWarn.rotation.x = -Math.PI / 2;
  extMeteorWarn.visible = false;
  group.add(extMeteorWarn);

  const extHe3Group = new THREE.Group();
  extHe3Group.visible = false;
  const extHe3Crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.50, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.75, 3.2, 2.8), toneMapped: false }),
  );
  extHe3Crystal.position.y = 0.72;
  const extHe3Ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.35, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(0.65, 3.0, 2.8), toneMapped: false,
      transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  extHe3Ring.rotation.x = -Math.PI / 2;
  extHe3Ring.position.y = 0.12;
  extHe3Group.add(extHe3Crystal, extHe3Ring);
  group.add(extHe3Group);

  // HUD & Modals
  const hud = document.createElement("div");
  hud.id = "extract-hud";
  hud.hidden = true;
  hud.innerHTML = `
    <div class="ext-top-row">
      <div id="ext-zone-badge" class="ext-zone-pill" data-tier="1" data-full="false"></div>
      <div id="ext-storm-pill" class="ext-storm-pill" data-danger="false">⚡ 风暴圈 34m</div>
      <div id="ext-combo-badge" class="ext-combo-pill" hidden>
        <span id="ext-combo-text">×1</span>
        <span class="ext-combo-bar"><i id="ext-combo-fill"></i></span>
      </div>
    </div>
    <div id="ext-build-chips" class="ext-build-chips"></div>
    <div id="ext-resonance" hidden>
      <div class="ext-res-title"><span id="ext-res-name"></span><span id="ext-res-val"></span></div>
      <div class="ext-res-bar"><div class="ext-res-sweet"></div><div class="ext-res-needle"></div></div>
      <div class="ext-res-fill"><div></div></div>
      <button type="button" id="ext-crit-btn"></button>
    </div>
    <div id="ext-popup" data-show="false"></div>
  `;
  document.body.append(hud);
  const zoneBadge = hud.querySelector("#ext-zone-badge");
  const stormPill = hud.querySelector("#ext-storm-pill");
  const comboBadge = hud.querySelector("#ext-combo-badge");
  const comboText = hud.querySelector("#ext-combo-text");
  const comboFill = hud.querySelector("#ext-combo-fill");
  const buildChips = hud.querySelector("#ext-build-chips");
  const stormVignette = document.createElement("div");
  stormVignette.className = "ext-storm-vignette";
  document.body.append(stormVignette);
  const resBox = hud.querySelector("#ext-resonance");
  const resName = hud.querySelector("#ext-res-name");
  const resVal = hud.querySelector("#ext-res-val");
  const resSweet = hud.querySelector(".ext-res-sweet");
  const resNeedle = hud.querySelector(".ext-res-needle");
  const resFill = hud.querySelector(".ext-res-fill > div");
  const critBtn = hud.querySelector("#ext-crit-btn");
  const popup = hud.querySelector("#ext-popup");

  const modalBackdrop = document.createElement("div");
  modalBackdrop.id = "ext-modal-backdrop";
  modalBackdrop.hidden = true;
  document.body.append(modalBackdrop);

  const adSim = document.createElement("div");
  adSim.id = "ext-ad-sim";
  adSim.hidden = true;
  document.body.append(adSim);

  let active = false;
  let modalOpen = false;
  let garageOpen = false;
  let activeModalKeyHandler = null;
  let trialChassis = null;
  function activeChassisId() { return trialChassis || profile.chassis || "explorer"; }
  function activeChassisDef() { return CHASSIS_CLASSES.find(c => c.id === activeChassisId()) ?? CHASSIS_CLASSES[0]; }
  function applyActiveChassis() {
    const def = activeChassisDef();
    onChassisChange?.(def.id);
    onThrusterTheme?.(def.theme);
  }
  function updateBountyProgress({ critsDelta = 0, comboVal = 0, waveVal = 0 } = {}) {
    if (!profile.bountyStats) profile.bountyStats = { crits: 0, maxCombo: 1, bestWave: 1 };
    let changed = false;
    if (critsDelta > 0) { profile.bountyStats.crits += critsDelta; changed = true; }
    if (comboVal > (profile.bountyStats.maxCombo || 1)) { profile.bountyStats.maxCombo = comboVal; changed = true; }
    if (waveVal > (profile.bountyStats.bestWave || 1)) { profile.bountyStats.bestWave = waveVal; changed = true; }
    if (changed) saveProfile(profile);
  }
  let wave = 1;
  let sectorSeed = 1;
  let biomeIndex = 0;
  let activeBiome = { name: "南极玄武灰", nameEn: "Mare Basalt" };
  let cargoCount = 0;
  let unbankedCoins = 0;
  let critsThisRun = 0;
  let cratesOpened = 0;
  let revivedThisRun = false;
  let activeNode = null;
  let needlePhase = 0;
  let popupTimer = 0;
  let runElapsed = 0;
  let currentState = null;
  let combo = 1;
  let maxCombo = 1;
  let comboTimer = 0;
  let airTime = 0;
  let nearMissCooldown = 0;
  let prevHits = 0;
  let aegisCharges = 0;
  let stormRadius = 34.0;
  let stormGraceTimer = 10.0;
  let extMeteorState = "idle"; // "idle" | "falling" | "core"
  let extMeteorTimer = 16.0;
  const extMeteorPos = new THREE.Vector3();
  let equippedPerks = [];
  let runPerks = {
    magnet: 0, overclock: 0, splinter: 0, midas: 0,
    turbo: 0, feather: 0, aeroboost: 0, comboKeep: 0,
    aegis: 0, cargoPod: 0, deepGreed: 0,
  };
  let harvestsThisWave = 0;
  let padArmed = false;

  function clearModalKeyHandler() {
    if (activeModalKeyHandler) {
      window.removeEventListener("keydown", activeModalKeyHandler);
      activeModalKeyHandler = null;
    }
  }
  function bindModalKeyHandler(fn) {
    clearModalKeyHandler();
    activeModalKeyHandler = fn;
    window.addEventListener("keydown", fn);
  }

  function waveMult() {
    const base = WAVE_MULT[Math.min(wave - 1, WAVE_MULT.length - 1)];
    return base + (wave > 1 ? runPerks.deepGreed * 0.2 : 0);
  }
  function comboMult() {
    const step = 0.15 + runPerks.comboKeep * 0.06;
    return 1 + (combo - 1) * step;
  }
  function maxCargo() {
    return UPGRADES[0].values[profile.levels.cargo - 1] + runPerks.cargoPod * 4 + (activeChassisId() === "titan" ? 3 : 0);
  }
  function engineScale() {
    const chBonus = activeChassisId() === "falcon" ? 0.22 : activeChassisId() === "ufo" ? 0.28 : 0;
    return [1, 1.15, 1.30, 1.48, 1.68][profile.levels.engine - 1] + runPerks.turbo * 0.25 + chBonus;
  }
  function harvestSeconds() { return [2.85, 2.50, 2.20, 1.95, 1.75][profile.levels.drill - 1] * (runPerks.magnet ? 0.85 : 1); }
  function sweetHalfWidth() { return Math.min(0.42, (0.13 + (profile.levels.drill - 1) * 0.032) * (runPerks.overclock ? 1.6 : 1)); }
  function harvestRadius() {
    const chMag = activeChassisId() === "titan" ? 0.35 : activeChassisId() === "ufo" ? 0.50 : 0;
    return (3.15 + (profile.levels.drill - 1) * 0.35) * (1 + runPerks.magnet * 0.45 + chMag);
  }
  function runSeconds() { return BASE_RUN_SECONDS + (profile.levels.battery - 1) * 18; }
  function outerDrainScale() {
    const base = Math.max(1.05, 1.55 - (profile.levels.battery - 1) * 0.12);
    return runPerks.cargoPod ? 1 + (base - 1) * 0.5 : base;
  }

  function renderBuildChips() {
    if (!equippedPerks.length) {
      buildChips.innerHTML = "";
      return;
    }
    buildChips.innerHTML = equippedPerks.map(p =>
      `<span class="ext-chip" data-rarity="${p.rarity}">${p.icon} ${t(p.name, p.nameEn)}</span>`,
    ).join("");
  }

  function bumpCombo(delta = 1) {
    combo = Math.min(5, combo + delta);
    maxCombo = Math.max(maxCombo, combo);
    comboTimer = runPerks.comboKeep ? 16 : 9.5;
    updateBountyProgress({ comboVal: maxCombo });
  }

  function flash(text, tone = "normal") {
    popup.textContent = text;
    popup.dataset.tone = tone;
    popup.dataset.show = "true";
    popupTimer = 1.65;
  }

  function spawnShards(origin, colorHex, count = 10) {
    for (let i = 0; i < count; i++) {
      if (shardPool.length >= 48) shardPool.shift();
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      shardPool.push({
        x: origin.x + Math.cos(angle) * 0.35,
        y: origin.y + 0.4 + Math.random() * 0.45,
        z: origin.z + Math.sin(angle) * 0.35,
        t: 0,
        duration: 0.42 + Math.random() * 0.25,
        colorHex,
      });
    }
  }

  // Procedural Sector Generator: regenerates 3D terrain + biome style + 10 multi-spire crystal clusters + 2 crates + 3 gates!
  function generateSector(seed) {
    const rng = makeRng(seed);
    biomeIndex = (biomeIndex + 1 + Math.floor(rng() * 3)) % 4;
    const terrainResult = onSectorTerrain?.(seed, biomeIndex);
    if (terrainResult?.biome) {
      activeBiome = terrainResult.biome;
      collarRockMat.color.setHex(activeBiome.rock ?? 0x5c5852);
    }
    extractRing.position.set(0, height(0, 0) + 0.08, 0);

    const placed = [{ x: 0, z: 0, r: 4.8 }, { x: HABITAT_POS.x, z: HABITAT_POS.z, r: HABITAT_POS.avoid }];

    function pickPoint(minR, maxR, minGap = 3.8, preferredAngle = null, spread = 0.75) {
      for (let attempt = 0; attempt < 48; attempt++) {
        const a = preferredAngle !== null && attempt < 16
          ? preferredAngle + (rng() - 0.5) * spread
          : rng() * Math.PI * 2;
        const r = minR + rng() * (maxR - minR);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (placed.every(p => Math.hypot(x - p.x, z - p.z) >= Math.max(minGap, p.r))) {
          placed.push({ x, z, r: minGap * 0.85 });
          return { x, z };
        }
      }
      return { x: Math.cos(rng() * 6.28) * minR, z: Math.sin(rng() * 6.28) * minR };
    }

    const haloUp = new THREE.Vector3(0, 1, 0);
    const slopeNorm = new THREE.Vector3();
    const slopeQuat = new THREE.Quaternion();
    function alignHaloToSlope(haloMesh, px, pz) {
      const e = 0.35;
      const hx = (height(px + e, pz) - height(px - e, pz)) / (2 * e);
      const hz = (height(px, pz + e) - height(px, pz - e)) / (2 * e);
      slopeNorm.set(-hx, 1, -hz).normalize();
      slopeQuat.setFromUnitVectors(haloUp, slopeNorm);
      haloMesh.quaternion.copy(slopeQuat);
      haloMesh.rotateX(Math.PI / 2);
      haloMesh.position.y = 0.09;
    }

    const jackpotIdx = 7 + Math.floor(rng() * 3);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const [minR, maxR] = node.tier === 1 ? [6.2, 11.8] : node.tier === 2 ? [13.2, 20.5] : [21.5, 29.5];
      const pos = i === 0 ? pickPoint(5.8, 6.8, 3.2, -Math.PI * 0.5, 0.14) : pickPoint(minR, maxR, 4.8);
      node.x = pos.x;
      node.z = pos.z;
      node.jackpot = i === jackpotIdx;
      node.value = Math.round(node.baseValue * waveMult() * (node.jackpot ? 1.6 : 1));
      node.harvested = false;
      node.progress = 0;
      node.group.position.set(pos.x, height(pos.x, pos.z), pos.z);
      node.group.visible = true;
      node.jackpotBeam.visible = node.jackpot;
      node.core.rotation.y = rng() * Math.PI * 2;
      const scale = (node.jackpot ? 1.28 : 0.92 + rng() * 0.24);
      node.core.scale.setScalar(scale);
      alignHaloToSlope(node.halo, pos.x, pos.z);
    }

    for (let i = 0; i < supplyCrates.length; i++) {
      const crate = supplyCrates[i];
      const pos = pickPoint(i === 0 ? 11.0 : 19.0, i === 0 ? 17.0 : 27.5, 5.0);
      crate.x = pos.x;
      crate.z = pos.z;
      crate.opened = false;
      crate.group.position.set(pos.x, height(pos.x, pos.z), pos.z);
      crate.group.rotation.y = rng() * Math.PI * 2;
      crate.group.visible = true;
    }

    for (let i = 0; i < feverGates.length; i++) {
      const gate = feverGates[i];
      const angle = (i / feverGates.length) * Math.PI * 2 + rng() * 0.9;
      const pos = pickPoint(9.0, 21.0, 5.0, angle);
      gate.x = pos.x;
      gate.z = pos.z;
      gate.yaw = Math.atan2(pos.x, pos.z) + Math.PI * 0.5;
      gate.passed = false;
      gate.group.position.set(pos.x, height(pos.x, pos.z), pos.z);
      gate.group.rotation.y = gate.yaw;
      gate.group.visible = true;
    }

    // Reset Shrinking EMP Storm Ring (starts wide at 34m with 10s calm grace!)
    stormRadius = 34.0;
    stormGraceTimer = 10.0;
    stormCurtain.scale.set(stormRadius, 1, stormRadius);
    stormGroundRing.scale.setScalar(stormRadius);
    stormVignette.style.opacity = "0";

    // Place 2 Field Emergency Repair Relays in outer-mid basin (r = 16~24m)
    for (let i = 0; i < fieldRelays.length; i++) {
      const rl = fieldRelays[i];
      const ang = i * Math.PI + rng() * 1.1;
      const pos = pickPoint(16.0, 24.5, 5.5, ang);
      rl.x = pos.x;
      rl.z = pos.z;
      rl.progress = 0;
      rl.repaired = false;
      rl.coreMat.color.setRGB(3.0, 1.7, 0.45);
      rl.ringMat.color.setRGB(3.0, 1.8, 0.45);
      rl.skyBeam.visible = false;
      rl.group.position.set(pos.x, height(pos.x, pos.z), pos.z);
      rl.group.visible = true;
    }

    // Place 2 Compact Low-G Crater Jump Ramps in open lanes (r = 11~18m)
    for (let i = 0; i < basinRamps.length; i++) {
      const rm = basinRamps[i];
      const ang = i * Math.PI + 0.8 + rng() * 0.8;
      const pos = pickPoint(11.0, 18.0, 5.2, ang);
      rm.x = pos.x;
      rm.z = pos.z;
      rm.yaw = Math.atan2(pos.x, pos.z) + Math.PI * 0.5;
      rm.cd = 0;
      rm.mesh.position.set(pos.x, height(pos.x, pos.z) + 0.32, pos.z);
      rm.mesh.rotation.y = rm.yaw;
      rm.mesh.visible = true;
    }

    // Reset Micro-Meteorite Event
    extMeteorState = "idle";
    extMeteorTimer = 14.0;
    extMeteorGroup.visible = false;
    extMeteorWarn.visible = false;
    extHe3Group.visible = false;

    track("sector_generated", { wave, seed, biome: activeBiome.id, jackpot: jackpotIdx, waveMult: Number(waveMult().toFixed(2)) });
  }

  function completeHarvest(node, isCrit) {
    node.harvested = true;
    node.progress = 0;
    node.group.visible = false;
    bumpCombo(isCrit ? (1 + runPerks.splinter * 2) : 1);
    const additiveBonus = 1
      + runPerks.midas * 0.35
      + (node.tier >= 2 ? runPerks.deepGreed * 0.45 : 0)
      + (isCrit ? runPerks.splinter * 0.40 : 0);
    const critMult = isCrit ? 2.0 : 1.0;
    const value = Math.round(node.value * critMult * additiveBonus * comboMult());
    cargoCount += 1;
    harvestsThisWave += 1;
    unbankedCoins += value;
    if (isCrit) {
      critsThisRun += 1;
      updateBountyProgress({ critsDelta: 1 });
    }
    if (currentState) {
      currentState.collected = cargoCount;
      currentState.boostCharge = Math.min(1, currentState.boostCharge + (isCrit ? 0.55 : 0.25));
      currentState.boostLocked = false;
    }
    spawnShards(node.group.position, node.jackpot ? 0xffd275 : node.color, isCrit ? 18 : 10);
    if (isCrit || node.jackpot) {
      spawnShockwave(node.group.position, node.jackpot ? 0xffd275 : 0x74ffd8, isCrit ? 5.2 : 4.2);
      onHitStop?.(isCrit ? 0.038 : 0.026);
    }
    spawnFloatingNumber(
      node.group.position,
      isCrit ? `+${value} CRIT ×${combo}!` : `+${value}`,
      isCrit ? "#ffd788" : node.jackpot ? "#ffe29a" : "#74ffd8",
      isCrit || node.jackpot,
    );
    track(isCrit ? "ore_crit" : "ore_harvest", { wave, tier: node.tier, jackpot: node.jackpot, combo, value });
    flash(
      isCrit
        ? t(`共振暴击 ×${combo}！+${value} 矿币`, `CRIT ×${combo}! +${value}`)
        : node.jackpot
          ? t(`高压富矿拿下！+${value} 矿币`, `JACKPOT VEIN! +${value}`)
          : t(`采集成功（×${combo}）+${value}`, `HARVESTED (×${combo}) +${value}`),
      isCrit || node.jackpot ? "crit" : "normal",
    );
    onJuice?.({ crit: isCrit || node.jackpot, value, tier: node.tier });
    activeNode = null;
    resBox.hidden = true;
    // Trigger 3-Choose-1 Roguelite Perk Card Draft on 1st & 4th harvest of Wave 1!
    if (wave === 1 && (harvestsThisWave === 1 || harvestsThisWave === 4)) {
      openPerkDraftModal(t("战术模块三选一 · 构筑强化", "TACTICAL PERK DRAFT · CHOOSE ONE"));
    }
  }

  function applyPerk(perk) {
    equippedPerks.push(perk);
    if (perk.id === "magnet") runPerks.magnet += 1;
    else if (perk.id === "overclock") runPerks.overclock += 1;
    else if (perk.id === "splinter") runPerks.splinter += 1;
    else if (perk.id === "midas") runPerks.midas += 1;
    else if (perk.id === "turbo") {
      runPerks.turbo += 1;
      if (currentState) { currentState.boostCharge = 1; currentState.boostLocked = false; }
    } else if (perk.id === "feather") runPerks.feather += 1;
    else if (perk.id === "aeroboost") runPerks.aeroboost += 1;
    else if (perk.id === "combo_keep") runPerks.comboKeep += 1;
    else if (perk.id === "battery_surge") {
      if (currentState) currentState.time += 24;
    } else if (perk.id === "aegis") {
      runPerks.aegis += 1;
      aegisCharges += 1;
    } else if (perk.id === "cargo_pod") runPerks.cargoPod += 1;
    else if (perk.id === "deep_greed") runPerks.deepGreed += 1;
    renderBuildChips();
  }

  function drawThreePerks() {
    const synergies = ["crit", "stunt", "greed"];
    const picked = [];
    for (const syn of synergies) {
      const candidates = PERK_POOL.filter(p => p.synergy === syn);
      picked.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    return picked;
  }

  function openPerkDraftModal(titleText) {
    modalOpen = true;
    garageOpen = false;
    modalBackdrop.dataset.layout = "center";
    onPauseChange?.(true);
    let cards = drawThreePerks();
    let selectedIdx = 0;

    function closeDraft() {
      clearModalKeyHandler();
      modalBackdrop.hidden = true;
      modalOpen = false;
      onPauseChange?.(false);
    }

    function pickCard(perk) {
      applyPerk(perk);
      track("roguelite_pick", { wave, perk: perk.id, synergy: perk.synergy, rarity: perk.rarity });
      flash(t(`模块激活：${perk.name}（${perk.stat}）`, `PERK: ${perk.nameEn} (${perk.statEn})`), "crit");
      onJuice?.({ crit: true, value: 0, tier: 3 });
      closeDraft();
    }

    function updateFocus() {
      const nodesList = modalBackdrop.querySelectorAll("[data-perk-idx]");
      nodesList.forEach((el, idx) => { el.dataset.kbFocus = String(idx === selectedIdx); });
    }

    function renderDraft() {
      const rvIco = profile.noAdsPass ? SVG.vip : SVG.video;
      modalBackdrop.innerHTML = `
        <div class="ext-draft-shell">
          <div class="ext-draft-head">
            <div class="ext-eyebrow">SELENE-07 // TACTICAL AUGMENTATION MODULE</div>
            <h2>${titleText}</h2>
            <p>${t(`第 ${wave} 波远征 · 已装 ${equippedPerks.length} 枚模块`, `Wave ${wave} · ${equippedPerks.length} active perks`)}</p>
          </div>
          <div class="ext-perk-grid">
            ${cards.map((p, idx) => `
              <button type="button" class="ext-perk-card" data-rarity="${p.rarity}" data-perk-idx="${idx}" data-kb-focus="${idx === selectedIdx}">
                <div class="ext-perk-tags">
                  <span class="ext-perk-tag">${t(...RARITY_LABEL[p.rarity])}</span>
                  <span class="ext-perk-syn">${t(...SYNERGY_LABEL[p.synergy])}</span>
                </div>
                <div class="ext-perk-icon">${p.icon}</div>
                <div class="ext-perk-name">${t(p.name, p.nameEn)}</div>
                <div class="ext-perk-stat">${t(p.stat, p.statEn)}</div>
                <div class="ext-perk-desc">${t(p.desc, p.descEn)}</div>
                <div class="ext-perk-key">[ ${idx + 1} ] ${idx === selectedIdx ? t("ENTER 确认装备", "ENTER TO EQUIP") : t("点击或方向键选择", "SELECT")}</div>
              </button>
            `).join("")}
          </div>
          <div class="ext-draft-actions">
            <button type="button" class="ext-btn rv" id="ext-draft-reroll">
              ${rvIco}<span>${profile.noAdsPass ? "VIP " : ""}${t("刷新卡池 [R]", "Reroll [R]")}</span>
            </button>
            <button type="button" class="ext-btn rv" id="ext-draft-all">
              ${rvIco}<span>${profile.noAdsPass ? "VIP " : ""}${t("全都要！激活 3 张 [F]", "Take All 3 [F]")}</span>
            </button>
          </div>
          <div class="ext-kb-hint">${t("[← / → / A / D] 切换卡片  ·  [Enter / 空格] 确认装备  ·  [1 / 2 / 3] 快捷选择", "[← / → / A / D] Focus Card  ·  [Enter / Space] Equip  ·  [1 / 2 / 3] Quick Pick")}</div>
        </div>
      `;
      for (const btn of modalBackdrop.querySelectorAll("[data-perk-idx]")) {
        btn.addEventListener("mouseenter", () => { selectedIdx = Number(btn.dataset.perkIdx); updateFocus(); });
        btn.addEventListener("click", () => pickCard(cards[Number(btn.dataset.perkIdx)]));
      }
      modalBackdrop.querySelector("#ext-draft-reroll").addEventListener("click", () => {
        runSimulatedRV("roguelite_reroll", () => {
          cards = drawThreePerks();
          renderDraft();
        });
      });
      modalBackdrop.querySelector("#ext-draft-all").addEventListener("click", () => {
        runSimulatedRV("roguelite_take_all", () => {
          for (const p of cards) applyPerk(p);
          track("roguelite_take_all", { wave, perks: cards.map(p => p.id) });
          flash(t("3 张战术模块全部激活！", "ALL 3 TACTICAL PERKS ACTIVATED!"), "crit");
          onJuice?.({ crit: true, value: 0, tier: 3 });
          closeDraft();
        });
      });
    }

    bindModalKeyHandler(event => {
      if (!modalOpen || !adSim.hidden) return;
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        selectedIdx = (selectedIdx + cards.length - 1) % cards.length;
        renderDraft();
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        selectedIdx = (selectedIdx + 1) % cards.length;
        renderDraft();
      } else if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (cards[selectedIdx]) pickCard(cards[selectedIdx]);
      } else if (["Digit1", "Digit2", "Digit3"].includes(event.code)) {
        const idx = Number(event.code.slice(-1)) - 1;
        if (cards[idx]) {
          event.preventDefault();
          pickCard(cards[idx]);
        }
      } else if (event.code === "KeyR") {
        event.preventDefault();
        modalBackdrop.querySelector("#ext-draft-reroll")?.click();
      } else if (event.code === "KeyF") {
        event.preventDefault();
        modalBackdrop.querySelector("#ext-draft-all")?.click();
      }
    });
    modalBackdrop.hidden = false;
    renderDraft();
  }

  // Push-Your-Luck Decision Modal at Landing Pad: Safe Extract vs Push Deeper to Wave N+1!
  function openWaveDecisionModal() {
    modalOpen = true;
    garageOpen = false;
    modalBackdrop.dataset.layout = "center";
    onPauseChange?.(true);
    const nextWave = wave + 1;
    const nextMult = (WAVE_MULT[Math.min(nextWave - 1, WAVE_MULT.length - 1)] + runPerks.deepGreed * 0.2).toFixed(2);
    const riskBonus = Math.min(450, Math.round(unbankedCoins * 0.22));
    let focusIdx = 1; // Default highlight Push Deeper for arcade thrill (Left/Right switches to Safe Extract!)

    function renderDecision() {
      modalBackdrop.innerHTML = `
        <div class="ext-card">
          <div class="ext-head">
            <div class="ext-head-title">
              <span class="ext-eyebrow">EXTRACTION PAD // WAVE ${wave} CHECKPOINT</span>
              <h2>${t(`抵达撤离点 · 第 ${wave} 波抉择`, `Extraction Pad · Wave ${wave} Decision`)}</h2>
            </div>
            <span class="ext-coins">${SVG.coin} ${unbankedCoins}</span>
          </div>
          <div class="ext-banner" data-tone="risk">
            <div>
              <strong>${t(`携带战利品：${unbankedCoins} 矿币 · 已构筑 ${equippedPerks.length} 枚肉鸽模块`, `Haul: ${unbankedCoins} CR · ${equippedPerks.length} Active Perks`)}</strong>
              <div style="font-size:12px;color:#e5d2b3;margin-top:4px;line-height:1.5;">
                ${t(`见好就收立即安全入库？还是保留全套肉鸽模块、重塑全新地貌扇区，加注冲刺第 ${nextWave} 波（矿值 ×${nextMult} + 额外立奖 +${riskBonus} 矿币）？`,
                  `Bank safely in the Hangar, or keep your entire build and push into a fresh procedural Wave ${nextWave} (${nextMult}× ore value + ${riskBonus} bonus + free Perk Draft)?`)}
              </div>
            </div>
          </div>
          <div class="ext-btn-row" style="justify-content:space-between;">
            <button type="button" class="ext-btn primary" id="ext-safe-extract" data-kb-focus="${focusIdx === 0}">
              ${SVG.check}<span>${t(`安全撤离入库（+${unbankedCoins}）`, `Safe Extract (+${unbankedCoins})`)}</span>
            </button>
            <button type="button" class="ext-btn risk" id="ext-push-deeper" data-kb-focus="${focusIdx === 1}">
              ${SVG.flame}<span>${t(`加注深潜 · 第 ${nextWave} 波（×${nextMult} & 免费三选一）`, `Push Deeper · Wave ${nextWave} (${nextMult}× & Draft)`)}</span>
            </button>
          </div>
          <div class="ext-kb-hint" style="text-align:center;">${t("[← / → / A / D] 切换选项  ·  [Enter / 空格] 确认执行", "[← / → / A / D] Switch  ·  [Enter / Space] Confirm")}</div>
        </div>
      `;
      modalBackdrop.querySelector("#ext-safe-extract").addEventListener("click", doSafeExtract);
      modalBackdrop.querySelector("#ext-push-deeper").addEventListener("click", doPushDeeper);
    }

    function doSafeExtract() {
      clearModalKeyHandler();
      const banked = unbankedCoins;
      cargoCount = 0;
      unbankedCoins = 0;
      openGarageModal({ extractedCoins: banked });
    }

    function doPushDeeper() {
      clearModalKeyHandler();
      wave = nextWave;
      profile.bestWave = Math.max(profile.bestWave || 1, wave);
      updateBountyProgress({ waveVal: wave });
      saveProfile(profile);
      unbankedCoins += riskBonus;
      cargoCount = 0;
      harvestsThisWave = 0;
      aegisCharges = runPerks.aegis + (activeChassisId() === "titan" ? 1 : 0);
      padArmed = false;
      if (currentState) {
        currentState.collected = 0;
        currentState.time = Math.min(runSeconds(), currentState.time + 48);
        currentState.boostCharge = 1;
      }
      sectorSeed = (sectorSeed * 1664525 + Date.now()) >>> 0;
      generateSector(sectorSeed);
      track("push_deeper", { wave, riskBonus, unbankedCoins, perks: equippedPerks.length });
      openPerkDraftModal(t(`第 ${wave} 波深潜开启 · 免费三选一强化`, `WAVE ${wave} ENGAGED · BONUS PERK DRAFT`));
    }

    bindModalKeyHandler(event => {
      if (!modalOpen || !adSim.hidden) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD"].includes(event.code)) {
        event.preventDefault();
        focusIdx = 1 - focusIdx;
        renderDecision();
      } else if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (focusIdx === 0) doSafeExtract();
        else doPushDeeper();
      }
    });
    modalBackdrop.hidden = false;
    renderDecision();
  }

  function triggerCritAttempt() {
    if (!active || modalOpen || !activeNode) return false;
    const pos = 0.5 + 0.5 * Math.sin(needlePhase);
    const inSweet = Math.abs(pos - 0.5) <= sweetHalfWidth();
    if (inSweet) {
      completeHarvest(activeNode, true);
    } else {
      activeNode.progress = Math.min(0.95, activeNode.progress + 0.22);
      flash(t("偏离甜区 · 加速钻切", "Missed sweet spot · +22%"), "normal");
    }
    return true;
  }

  critBtn.addEventListener("click", () => triggerCritAttempt());

  function runSimulatedRV(placement, onReward) {
    profile.rvOffers += 1;
    track("rv_offer", { placement, noAdsPass: profile.noAdsPass });
    if (profile.noAdsPass) {
      profile.rvConverts += 1;
      saveProfile(profile);
      track("rv_complete", { placement, skippedByVip: true });
      onReward();
      return;
    }
    let left = 2;
    adSim.hidden = false;
    const renderAd = () => {
      adSim.innerHTML = `
        <div class="ext-ad-box">
          <div style="font-size:11px;color:#74ffd8;letter-spacing:.12em;">REWARDED VIDEO · DEMO SIMULATION</div>
          <div style="font-size:15px;">${t("模拟激励视频播放中（展示变现转化卡点）", "Simulated Rewarded Ad (Monetization Prototype)")}</div>
          <div style="font-size:24px;color:#ffd28a;">${left}s</div>
          <div style="font-size:11px;color:#9ab1bc;">Placement: <code>${placement}</code></div>
        </div>
      `;
    };
    renderAd();
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        adSim.hidden = true;
        profile.rvConverts += 1;
        saveProfile(profile);
        track("rv_complete", { placement, skippedByVip: false });
        onReward();
      } else {
        renderAd();
      }
    }, 800);
  }

  function computeOfflineYield() {
    const minutes = Math.min(180, Math.floor((Date.now() - profile.lastTimestamp) / 60000));
    if (minutes < 1) return 0;
    return Math.min(260, minutes * (12 + profile.levels.battery * 4));
  }

  function openRescueModal() {
    modalOpen = true;
    garageOpen = false;
    modalBackdrop.dataset.layout = "center";
    onPauseChange?.(true);
    profile.rvOffers += 1;
    track("rv_offer", { placement: "emergency_rescue", wave, atRiskCoins: unbankedCoins });
    let focusIdx = 0;

    function doRescue() {
      clearModalKeyHandler();
      runSimulatedRV("emergency_rescue", () => {
        revivedThisRun = true;
        if (currentState) {
          currentState.time = 28;
          currentState.energy = 0.65;
          currentState.boostCharge = 1;
        }
        modalBackdrop.hidden = true;
        modalOpen = false;
        onPauseChange?.(false);
        flash(t("空投电池接入！+28 秒速返基地！", "BATTERY DROP! +28s SPRINT TO PAD!"), "crit");
      });
    }
    function doGiveup() {
      clearModalKeyHandler();
      track("extract_forfeit", { wave, lostCoins: unbankedCoins, cargoCount });
      cargoCount = 0;
      unbankedCoins = 0;
      openGarageModal({ extractedCoins: 0, forfeited: true });
    }
    function renderRescue() {
      const rvIco = profile.noAdsPass ? SVG.vip : SVG.video;
      modalBackdrop.innerHTML = `
        <div class="ext-card">
          <div class="ext-head">
            <div class="ext-head-title">
              <span class="ext-eyebrow">CRITICAL ALERT // POWER DEPLETED</span>
              <h2>${t("电量耗尽 · 危急撤离", "Battery Depleted · Emergency")}</h2>
            </div>
            <span class="ext-coins">${SVG.coin} ${profile.coins}</span>
          </div>
          <div class="ext-banner" data-tone="danger">
            <div>
              <strong>${t(`第 ${wave} 波货舱内有 ${unbankedCoins} 矿币尚未撤回！`, `Wave ${wave}: ${unbankedCoins} credits at risk!`)}</strong>
              <div style="font-size:12px;color:#e0b7b2;margin-top:4px;">${t("未撤回着陆区将损失本局所有未入库战利品。", "Failing to reach the landing pad forfeits unbanked cargo.")}</div>
            </div>
          </div>
          <div class="ext-btn-row" style="justify-content:space-between;">
            <button type="button" class="ext-btn rv" id="ext-rescue-rv" data-kb-focus="${focusIdx === 0}">
              ${rvIco}<span>${profile.noAdsPass ? "VIP " : ""}${t("轨道空投电池（+28 秒继续撤离）", "Orbital Battery Drop (+28s Rescue)")}</span>
            </button>
            <button type="button" class="ext-btn" id="ext-rescue-giveup" data-kb-focus="${focusIdx === 1}">
              <span>${t("放弃货舱，进入机库", "Forfeit Cargo → Hangar")}</span>
            </button>
          </div>
          <div class="ext-kb-hint" style="text-align:center;">${t("[← / → / A / D] 切换选项  ·  [Enter / 空格] 确认", "[← / → / A / D] Switch  ·  [Enter / Space] Confirm")}</div>
        </div>
      `;
      modalBackdrop.querySelector("#ext-rescue-rv").addEventListener("click", doRescue);
      modalBackdrop.querySelector("#ext-rescue-giveup").addEventListener("click", doGiveup);
    }
    bindModalKeyHandler(event => {
      if (!modalOpen || !adSim.hidden) return;
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) {
        event.preventDefault();
        focusIdx = 1 - focusIdx;
        renderRescue();
      } else if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (focusIdx === 0) doRescue();
        else doGiveup();
      }
    });
    modalBackdrop.hidden = false;
    renderRescue();
  }

  function openGarageModal({ extractedCoins = 0, forfeited = false } = {}) {
    // If the finished run used a 1-run free trial chassis, clear the trial so the player can unlock it permanently or try again!
    const finishedTrial = trialChassis;
    if (finishedTrial && active) {
      trialChassis = null;
      applyActiveChassis();
    }
    modalOpen = true;
    garageOpen = true;
    stormVignette.style.opacity = "0";
    hud.hidden = true;
    modalBackdrop.dataset.layout = "garage";
    onPauseChange?.(true);
    let pendingClaim = extractedCoins;
    let offlineYield = computeOfflineYield();
    let showLog = false;
    const grade = wave >= 3 || extractedCoins >= 700 ? "S" : wave >= 2 || extractedCoins >= 260 ? "A" : "B";

    function closeAndLaunch() {
      clearModalKeyHandler();
      if (pendingClaim > 0) {
        profile.coins += pendingClaim;
        profile.totalBanked += pendingClaim;
        pendingClaim = 0;
        saveProfile(profile);
      }
      modalBackdrop.hidden = true;
      modalOpen = false;
      garageOpen = false;
      onRestartRun?.();
    }

    function closeAndMenu() {
      clearModalKeyHandler();
      if (pendingClaim > 0) {
        profile.coins += pendingClaim;
        profile.totalBanked += pendingClaim;
        pendingClaim = 0;
        saveProfile(profile);
      }
      modalBackdrop.hidden = true;
      modalOpen = false;
      garageOpen = false;
      onExitMenu?.();
    }

    function render() {
      const rvRate = profile.rvOffers ? `${Math.round((profile.rvConverts / profile.rvOffers) * 100)}%` : "—";
      const rvIco = profile.noAdsPass ? SVG.vip : SVG.video;
      const curCh = activeChassisDef();
      const trialBanner = trialChassis
        ? `<div class="ext-banner" data-tone="risk"><span>${SVG.bolt} <strong>${t(`已激活「${curCh.name}」下局免费试驾！点击「再次出击」立即体验全套 3D 改装与被动`, `FREE 1-RUN TRIAL ACTIVE: ${curCh.nameEn}! Launch now to drive it.`)}</strong></span></div>`
        : "";
      const bountyRows = BOUNTY_DEFS.map(b => {
        const cur = Math.min(b.goal, profile.bountyStats?.[b.stat] || 0);
        const claimed = (profile.claimedBounties || []).includes(b.id);
        const ready = cur >= b.goal && !claimed;
        const pct = Math.round((cur / b.goal) * 100);
        return `
          <div class="ext-bounty-row">
            <div class="ext-bounty-info">
              <div style="display:flex;justify-content:space-between;gap:6px;">
                <span style="color:${claimed ? "#79939e" : "#eaf5f7"};">${t(b.name, b.nameEn)}</span>
                <span style="font-family:var(--mono,monospace);color:${ready ? "#ffd788" : "#8fb0bc"};">${cur}/${b.goal}</span>
              </div>
              <div class="ext-bounty-bar"><i style="width:${pct}%;"></i></div>
            </div>
            ${claimed
              ? `<span style="font:700 10.5px/1 var(--mono,monospace);color:#74ffd899;">${t("已领", "DONE")}</span>`
              : `<button type="button" class="ext-btn ${ready ? "primary" : ""}" data-claim-bounty="${b.id}" ${ready ? "" : "disabled"} style="padding:5px 9px;font-size:11px;">${SVG.coin} +${b.reward}</button>`}
          </div>
        `;
      }).join("");

      modalBackdrop.innerHTML = `
        <div class="ext-showroom-tag" style="border-left-color:${curCh.swatch};">
          ${curCh.code} ${t(curCh.name, curCh.nameEn).toUpperCase()} // LIVE 3D SHOWROOM${trialChassis ? " [TRIAL]" : ""}<br>
          <span style="color:${curCh.swatch};">${t(curCh.passive, curCh.passiveEn)}</span>
        </div>
        <div class="ext-card">
          <div class="ext-head">
            <div class="ext-head-title">
              <span class="ext-eyebrow">SELENE-07 // ORBITAL HANGAR &amp; CHASSIS BAY</span>
              <h2>${t("月面机库 · 结算与 3D 载具改装", "Lunar Hangar · Debrief & 3D Chassis Refit")}</h2>
            </div>
            <span class="ext-coins">${SVG.coin} ${profile.coins} ${t("矿币", "CR")}</span>
          </div>
          ${pendingClaim > 0 ? `
            <div class="ext-banner">
              <div style="display:flex;align-items:center;gap:11px;">
                <span class="ext-grade-stamp">${grade}</span>
                <div>
                  <strong>${t(`第 ${wave} 波成功撤离 · 战利品 +${pendingClaim}`, `Wave ${wave} Extracted · +${pendingClaim} CR`)}</strong>
                  <div style="font-size:11px;color:#9eb5be;margin-top:3px;">${t(`最高连击 ×${maxCombo} · 暴击 ${critsThisRun} 次 · 破译空投 ${cratesOpened} 个`, `Max Combo ×${maxCombo} · Crits: ${critsThisRun} · Crates: ${cratesOpened}`)}</div>
                </div>
              </div>
              <div class="ext-btn-row">
                <button type="button" class="ext-btn" id="ext-claim-1x">${SVG.check}<span>${t(`入库 +${pendingClaim}`, `Claim +${pendingClaim}`)}</span></button>
                <button type="button" class="ext-btn rv" id="ext-claim-2x">${rvIco}<span>${profile.noAdsPass ? "VIP " : ""}${t(`×2 翻倍 +${pendingClaim * 2}`, `2× Claim +${pendingClaim * 2}`)}</span></button>
              </div>
            </div>
          ` : forfeited ? `
            <div class="ext-banner" data-tone="danger">
              <span>${t("未能及时撤离，本局未入库矿石已遗失。强化载具后再战全新随机地貌扇区！", "Cargo lost on the surface. Refit your rover and launch into a fresh sector!")}</span>
            </div>
          ` : ""}
          ${trialBanner}
          ${offlineYield > 0 ? `
            <div class="ext-banner">
              <span style="display:inline-flex;align-items:center;gap:6px;">${SVG.sun} ${t(`太阳能基站离线产出 +${offlineYield}`, `Offline Solar Yield: +${offlineYield} CR`)}</span>
              <div class="ext-btn-row">
                <button type="button" class="ext-btn" id="ext-off-1x">${t("领取", "Claim")}</button>
                <button type="button" class="ext-btn rv" id="ext-off-2x">${rvIco}<span>×2</span></button>
              </div>
            </div>
          ` : ""}
          <div class="ext-item">
            <div class="ext-item-top">
              <span class="ext-item-label">${SVG.rocket}<span>${t("3D 载具构型库（左侧展车实时变形 · 附带专属被动 & 竞速通用）", "3D Rover Chassis Bay (Live 3D Morph · Passives · Shared in Racing)")}</span></span>
            </div>
            <div class="ext-chassis-grid">
              ${CHASSIS_CLASSES.map(c => {
                const owned = profile.unlockedChassis.includes(c.id);
                const isTrial = trialChassis === c.id;
                const equipped = activeChassisId() === c.id;
                return `
                  <div class="ext-chassis-card" data-active="${equipped}" style="--ch-color:${c.swatch};">
                    <div>
                      <div class="ext-chassis-head">
                        <span class="ext-chassis-code">${c.code}</span>
                        <span class="ext-chassis-tag">${t(c.tag, c.tagEn)}</span>
                      </div>
                      <div class="ext-chassis-name">${t(c.name, c.nameEn)}</div>
                      <div class="ext-chassis-passive">${t(c.passive, c.passiveEn)}</div>
                    </div>
                    <div class="ext-chassis-btns">
                      ${owned
                        ? `<button type="button" class="ext-btn ${equipped ? "primary" : ""}" data-chassis="${c.id}">
                            ${equipped ? `${SVG.check} ${t("已出战", "ACTIVE")}` : t("切换变形", "EQUIP 3D")}
                          </button>`
                        : `<button type="button" class="ext-btn ${profile.coins >= c.cost ? "primary" : ""}" data-chassis="${c.id}" ${profile.coins < c.cost ? "disabled" : ""}>
                            ${SVG.coin} ${t(`解锁 ${c.cost}`, `UNLOCK ${c.cost}`)}
                          </button>
                          <button type="button" class="ext-btn rv" data-trial-chassis="${c.id}">
                            ${rvIco} ${isTrial ? t("试驾中", "TRIAL ON") : t("免费试驾1局", "FREE TRIAL")}
                          </button>`}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
          <div class="ext-grid">
            ${UPGRADES.map(u => {
              const lv = profile.levels[u.id];
              const max = lv >= 5;
              const cost = max ? 0 : u.costs[lv - 1];
              const val = u.values[lv - 1];
              const nextVal = max ? null : u.values[lv];
              return `
                <div class="ext-item">
                  <div class="ext-item-top">
                    <span class="ext-item-label">${u.icon}<span>${t(u.name, u.nameEn)}</span></span>
                    <span class="ext-pips">${[1, 2, 3, 4, 5].map(i => `<i class="ext-pip ${i <= lv ? "on" : ""}"></i>`).join("")}</span>
                  </div>
                  <div class="ext-item-desc">${t(u.desc, u.descEn)} · <strong style="color:#e6f6f4;">${val}${u.unit}${nextVal ? ` → ${nextVal}${u.unit}` : " (MAX)"}</strong></div>
                  <div class="ext-item-foot">
                    <span class="ext-cost-tag">${max ? "MAXED" : `${SVG.coin} ${cost}`}</span>
                    <button type="button" class="ext-btn" data-upgrade="${u.id}" ${max || profile.coins < cost ? "disabled" : ""}>
                      ${max ? t("已满级", "Maxed") : t("强化升级", "Upgrade")}
                    </button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div class="ext-item">
            <div class="ext-item-top">
              <span class="ext-item-label">${SVG.burst}<span>${t("阶段悬赏里程碑（攒币解锁猎隼 / 泰坦）", "Run Bounties (Earn Credits for Falcon & Titan)")}</span></span>
              <button type="button" class="ext-btn" id="ext-iap-vip" style="padding:4px 9px;font-size:10.5px;${profile.noAdsPass ? "border-color:#ffd275;color:#ffe4a6;" : ""}">
                ${profile.noAdsPass ? SVG.vip : SVG.gem}<span>${profile.noAdsPass ? t("免广告 VIP", "VIP Active") : t("免广告 ($3.99)", "No-Ads $3.99")}</span>
              </button>
            </div>
            <div class="ext-bounty-list">${bountyRows}</div>
          </div>
          <div class="ext-btn-row" style="justify-content:space-between;align-items:center;">
            <div class="ext-btn-row">
              <button type="button" class="ext-btn primary" id="ext-next-run">${SVG.rocket}<span>${t("再次出击 [Enter]", "Launch Sector [Enter]")}</span></button>
              <button type="button" class="ext-btn" id="ext-back-menu">${t("返回首页", "Main Menu")}</button>
            </div>
            <button type="button" class="ext-btn" id="ext-toggle-log">${SVG.chart}<span>${t("埋点流", "Telemetry")} (${analytics.length})</span></button>
          </div>
          ${showLog ? `
            <div class="ext-log">
              <div>Summary: runs=${profile.runs} · bestWave=${profile.bestWave} · chassis=${activeChassisId()} · totalBanked=${profile.totalBanked} · rvOffers=${profile.rvOffers} · rvConverts=${profile.rvConverts} (${rvRate})</div>
              ${analytics.map(e => `<div>[${e.ts}] <strong>${e.event}</strong> ${JSON.stringify({ ...e, ts: undefined, event: undefined })}</div>`).join("")}
            </div>
          ` : ""}
        </div>
      `;

      modalBackdrop.querySelector("#ext-claim-1x")?.addEventListener("click", () => {
        profile.coins += pendingClaim;
        profile.totalBanked += pendingClaim;
        track("extract_bank", { wave, amount: pendingClaim, multiplier: 1 });
        pendingClaim = 0;
        saveProfile(profile);
        render();
      });
      modalBackdrop.querySelector("#ext-claim-2x")?.addEventListener("click", () => {
        runSimulatedRV("extraction_2x_claim", () => {
          const total = pendingClaim * 2;
          profile.coins += total;
          profile.totalBanked += total;
          track("extract_bank", { wave, amount: total, multiplier: 2 });
          pendingClaim = 0;
          saveProfile(profile);
          render();
        });
      });
      modalBackdrop.querySelector("#ext-off-1x")?.addEventListener("click", () => {
        profile.coins += offlineYield;
        track("offline_claim", { amount: offlineYield, multiplier: 1 });
        offlineYield = 0;
        saveProfile(profile);
        render();
      });
      modalBackdrop.querySelector("#ext-off-2x")?.addEventListener("click", () => {
        runSimulatedRV("offline_solar_2x", () => {
          profile.coins += offlineYield * 2;
          track("offline_claim", { amount: offlineYield * 2, multiplier: 2 });
          offlineYield = 0;
          saveProfile(profile);
          render();
        });
      });
      for (const btn of modalBackdrop.querySelectorAll("[data-upgrade]")) {
        btn.addEventListener("click", () => {
          const id = btn.dataset.upgrade;
          const u = UPGRADES.find(item => item.id === id);
          const lv = profile.levels[id];
          if (!u || lv >= 5) return;
          const cost = u.costs[lv - 1];
          if (profile.coins < cost) return;
          profile.coins -= cost;
          profile.levels[id] = lv + 1;
          saveProfile(profile);
          track("upgrade_buy", { id, newLevel: lv + 1, cost });
          onJuice?.({ crit: false, value: 0, tier: 2 });
          render();
        });
      }
      for (const btn of modalBackdrop.querySelectorAll("[data-chassis]")) {
        btn.addEventListener("click", () => {
          const id = btn.dataset.chassis;
          const c = CHASSIS_CLASSES.find(item => item.id === id);
          if (!c) return;
          if (!profile.unlockedChassis.includes(id)) {
            if (profile.coins < c.cost) return;
            profile.coins -= c.cost;
            profile.unlockedChassis.push(id);
          }
          trialChassis = null;
          profile.chassis = id;
          profile.thrusterSkin = c.theme;
          applyActiveChassis();
          saveProfile(profile);
          track("chassis_equip", { chassis: id, cost: c.cost });
          onJuice?.({ crit: true, value: 0, tier: 3 });
          render();
        });
      }
      for (const btn of modalBackdrop.querySelectorAll("[data-trial-chassis]")) {
        btn.addEventListener("click", () => {
          const id = btn.dataset.trialChassis;
          const c = CHASSIS_CLASSES.find(item => item.id === id);
          if (!c) return;
          runSimulatedRV(`chassis_trial_${id}`, () => {
            trialChassis = id;
            applyActiveChassis();
            track("chassis_trial_start", { chassis: id });
            onJuice?.({ crit: true, value: 0, tier: 3 });
            render();
          });
        });
      }
      for (const btn of modalBackdrop.querySelectorAll("[data-claim-bounty]")) {
        btn.addEventListener("click", () => {
          const id = btn.dataset.claimBounty;
          const b = BOUNTY_DEFS.find(item => item.id === id);
          if (!b || (profile.claimedBounties || []).includes(id)) return;
          if ((profile.bountyStats?.[b.stat] || 0) < b.goal) return;
          profile.claimedBounties = [...(profile.claimedBounties || []), id];
          profile.coins += b.reward;
          profile.totalBanked += b.reward;
          saveProfile(profile);
          track("bounty_claim", { id, reward: b.reward });
          onJuice?.({ crit: true, value: b.reward, tier: 3 });
          render();
        });
      }
      modalBackdrop.querySelector("#ext-iap-vip").addEventListener("click", () => {
        profile.noAdsPass = !profile.noAdsPass;
        saveProfile(profile);
        track("iap_preview_toggle", { sku: "no_ads_pass_399", active: profile.noAdsPass });
        render();
      });
      modalBackdrop.querySelector("#ext-toggle-log").addEventListener("click", () => {
        showLog = !showLog;
        render();
      });
      modalBackdrop.querySelector("#ext-next-run").addEventListener("click", closeAndLaunch);
      modalBackdrop.querySelector("#ext-back-menu").addEventListener("click", closeAndMenu);
    }

    bindModalKeyHandler(event => {
      if (!modalOpen || !adSim.hidden) return;
      if (event.code === "Enter" && document.activeElement?.tagName !== "BUTTON") {
        event.preventDefault();
        closeAndLaunch();
      }
    });
    modalBackdrop.hidden = false;
    render();
  }

  function start(state) {
    active = true;
    modalOpen = false;
    currentState = state;
    wave = 1;
    cargoCount = 0;
    unbankedCoins = 0;
    critsThisRun = 0;
    cratesOpened = 0;
    revivedThisRun = false;
    activeNode = null;
    runElapsed = 0;
    combo = 1;
    maxCombo = 1;
    comboTimer = 0;
    airTime = 0;
    nearMissCooldown = 0;
    prevHits = state.hits || 0;
    aegisCharges = activeChassisId() === "titan" ? 1 : 0;
    harvestsThisWave = 0;
    padArmed = false;
    equippedPerks = [];
    runPerks = {
      magnet: 0, overclock: 0, splinter: 0, midas: 0,
      turbo: 0, feather: 0, aeroboost: 0, comboKeep: 0,
      aegis: 0, cargoPod: 0, deepGreed: 0,
    };
    renderBuildChips();
    shardPool.length = 0;
    flyingShards.count = 0;
    clearFloatingNumbers();
    for (const r of shockRings) { r.t = 1; r.mesh.visible = false; }
    state.time = runSeconds();
    state.energy = 1;
    profile.runs += 1;
    saveProfile(profile);
    applyActiveChassis();
    sectorSeed = (Date.now() ^ (profile.runs * 2654435761)) >>> 0;
    generateSector(sectorSeed);
    group.visible = true;
    hud.hidden = false;
    resBox.hidden = true;
    comboBadge.hidden = true;
    modalBackdrop.hidden = true;
    track("run_start", { run: profile.runs, chassis: activeChassisId(), seed: sectorSeed, levels: { ...profile.levels } });
  }

  function stop() {
    clearModalKeyHandler();
    if (active) onSectorTerrain?.(null);
    active = false;
    modalOpen = false;
    garageOpen = false;
    stormVignette.style.opacity = "0";
    currentState = null;
    activeNode = null;
    clearFloatingNumbers();
    for (const r of shockRings) { r.t = 1; r.mesh.visible = false; }
    group.visible = false;
    hud.hidden = true;
    modalBackdrop.hidden = true;
    adSim.hidden = true;
  }

  function update(state, dt, visualTime, roverPos, hazard) {
    if (!active) return null;
    currentState = state;
    if (modalOpen) return null;
    runElapsed += dt;

    if (popupTimer > 0) {
      popupTimer = Math.max(0, popupTimer - dt);
      if (popupTimer === 0) popup.dataset.show = "false";
    }

    // Combo decay meter
    if (comboTimer > 0) {
      comboTimer = Math.max(0, comboTimer - dt);
      const maxTime = runPerks.comboKeep ? 16 : 9.5;
      comboBadge.hidden = false;
      comboText.textContent = `×${combo} (${comboMult().toFixed(2)}×)`;
      comboFill.style.width = `${Math.round((comboTimer / maxTime) * 100)}%`;
      if (comboTimer === 0) {
        combo = 1;
        comboBadge.hidden = true;
      }
    } else {
      comboBadge.hidden = true;
    }

    // Integrated Stunt #1: Low-G Air Jump off craters
    if (!state.grounded) {
      airTime += dt;
    } else if (airTime >= 0.50) {
      bumpCombo(1);
      const rawBonus = runPerks.aeroboost ? 80 * runPerks.aeroboost : 25;
      const bonus = Math.round(rawBonus * (activeChassisId() === "falcon" ? 1.3 : 1));
      unbankedCoins += bonus;
      state.boostCharge = Math.min(1, state.boostCharge + (runPerks.aeroboost ? 1.0 : 0.38));
      state.boostLocked = false;
      spawnShockwave(roverPos, 0x74ffd8, 3.6);
      spawnFloatingNumber(roverPos, `AIR JUMP +${bonus}!`, "#74ffd8", true);
      flash(t(`低重力飞跃！+${bonus} 矿币 · 连击 ×${combo}`, `AIR JUMP! +${bonus} CR · ×${combo}`), "crit");
      onJuice?.({ crit: true, value: bonus, tier: 2 });
      track("stunt_air_jump", { wave, combo, bonus });
      airTime = 0;
    } else {
      airTime = 0;
    }

    // Integrated Stunt #2: Patrol Drone Near Miss & Aegis Shield Counter
    if (nearMissCooldown > 0) nearMissCooldown -= dt;
    if (state.hits > prevHits) {
      prevHits = state.hits;
      if (aegisCharges > 0) {
        aegisCharges -= 1;
        state.time += 12; // Refund patrol strike penalty
        unbankedCoins += 120;
        bumpCombo(1);
        flash(t("🛡️ 等离子护盾格挡！反赚 +120 矿币", "🛡️ AEGIS BLOCK! +120 CR BOUNTY"), "crit");
        onJuice?.({ crit: true, value: 120, tier: 3 });
        track("aegis_block", { wave, remaining: aegisCharges });
      }
    } else if (hazard && nearMissCooldown <= 0) {
      const hd = Math.hypot(state.x - hazard.x, state.z - hazard.z);
      if (hd < 4.1 && Math.abs(state.speed) > 2.4) {
        nearMissCooldown = 4.5;
        bumpCombo(1);
        const bonus = 35 + runPerks.deepGreed * 45;
        unbankedCoins += bonus;
        state.boostCharge = Math.min(1, state.boostCharge + 0.30);
        flash(t(`⚡ 极限擦身！+${bonus} 矿币 · 连击 ×${combo}`, `⚡ NEAR MISS! +${bonus} CR · ×${combo}`), "crit");
        onJuice?.({ crit: false, value: bonus, tier: 2 });
        track("stunt_near_miss", { wave, combo, bonus });
      }
    }

    // Apply meta upgrades & cargo weight physics
    const fillRatio = cargoCount / maxCargo();
    const zeroDrag = runPerks.feather || activeChassisId() === "ufo";
    const speedBonus = engineScale() * (zeroDrag ? 1 : (1 - 0.14 * fillRatio));
    if (state.boosting && speedBonus > 1) {
      state.boostCharge = Math.min(1, state.boostCharge + dt * 0.14 * (engineScale() - 1));
    }
    if (!zeroDrag && fillRatio > 0.01 && Math.abs(state.speed) > 0.4) {
      const drag = Math.exp(-0.26 * fillRatio * dt);
      state.vx *= drag;
      state.vz *= drag;
    }

    // Distance-based risk zone & battery drain
    const distFromBase = Math.hypot(state.x, state.z);
    if (distFromBase > EXTRACT_RADIUS + 1.8) padArmed = true;
    const zoneTier = distFromBase >= 20.5 ? 3 : distFromBase >= 12.5 ? 2 : 1;
    if (zoneTier === 3) {
      state.time = Math.max(0, state.time - dt * (outerDrainScale() - 1));
    }
    state.energy = THREE.MathUtils.clamp(state.time / runSeconds(), 0, 1);

    const cargoFull = cargoCount >= maxCargo();
    zoneBadge.dataset.tier = String(zoneTier);
    zoneBadge.dataset.full = String(cargoFull);
    const shieldStr = aegisCharges > 0 ? ` · 🛡️×${aegisCharges}` : "";
    const biomeStr = t(activeBiome.name, activeBiome.nameEn);
    zoneBadge.textContent = cargoFull
      ? t(`第${wave}波 ${biomeStr} · 货舱已满 (${cargoCount}/${maxCargo()}) · 返航撤离或深潜！`, `W${wave} ${biomeStr} · FULL (${cargoCount}/${maxCargo()}) · RETURN TO PAD!`)
      : zoneTier === 3
        ? t(`⚠ 第${wave}波 ${biomeStr} · 危区 (×${waveMult().toFixed(1)}) · 舱 ${cargoCount}/${maxCargo()} · 携 ${unbankedCoins}${shieldStr}`, `⚠ W${wave} ${biomeStr} · DANGER (${waveMult().toFixed(1)}×) · ${cargoCount}/${maxCargo()} · ${unbankedCoins} CR${shieldStr}`)
        : zoneTier === 2
          ? t(`第${wave}波 ${biomeStr} · 中区 (×${waveMult().toFixed(1)}) · 舱 ${cargoCount}/${maxCargo()} · 携 ${unbankedCoins}${shieldStr}`, `W${wave} ${biomeStr} · MID (${waveMult().toFixed(1)}×) · ${cargoCount}/${maxCargo()} · ${unbankedCoins} CR${shieldStr}`)
          : t(`第${wave}波 ${biomeStr} · 近区 (×${waveMult().toFixed(1)}) · 舱 ${cargoCount}/${maxCargo()} · 携 ${unbankedCoins}${shieldStr}`, `W${wave} ${biomeStr} · INNER (${waveMult().toFixed(1)}×) · ${cargoCount}/${maxCargo()} · ${unbankedCoins} CR${shieldStr}`);

    extractRing.visible = unbankedCoins > 0;
    if (extractRing.visible) {
      extractRing.rotation.z = visualTime * 1.2;
      extractRing.scale.setScalar(1 + 0.05 * Math.sin(visualTime * 6));
      if (padArmed && distFromBase <= EXTRACT_RADIUS) {
        stormVignette.style.opacity = "0";
        openWaveDecisionModal();
        return null;
      }
    }

    // 1. Update Shrinking Circular EMP Storm Ring (gentle contraction + proximity fade-in + 4.8s scan pulse!)
    stormUniforms.uTime.value = visualTime;
    if (stormGraceTimer > 0) {
      stormGraceTimer = Math.max(0, stormGraceTimer - dt);
    } else {
      const shrinkSpeed = 0.38 + (wave - 1) * 0.12;
      stormRadius = Math.max(7.5, stormRadius - shrinkSpeed * dt);
    }
    const distToEdge = stormRadius - distFromBase;
    const targetProx = distToEdge <= 0 ? 1.0 : THREE.MathUtils.clamp(1 - (distToEdge - 1.5) / 8.5, 0, 1);
    stormUniforms.uProximity.value = THREE.MathUtils.damp(stormUniforms.uProximity.value, targetProx, 6, dt);
    const scanCycle = visualTime % 4.8;
    const scanGlow = scanCycle < 1.35 ? Math.sin((scanCycle / 1.35) * Math.PI) * 0.25 : 0;
    stormGroundRingMat.opacity = 0.24 + scanGlow + stormUniforms.uProximity.value * 0.42;
    stormCurtain.scale.set(stormRadius, 1, stormRadius);
    stormGroundRing.scale.setScalar(stormRadius);
    const outsideStorm = distFromBase > stormRadius;
    stormPill.dataset.danger = String(outsideStorm);
    if (outsideStorm) {
      const stormDrain = aegisCharges > 0 ? 1.1 : 2.4;
      state.time = Math.max(0, state.time - dt * stormDrain);
      if (aegisCharges > 0) state.boostCharge = Math.min(1, state.boostCharge + dt * 0.25);
      stormVignette.style.opacity = String((0.48 + 0.22 * Math.sin(visualTime * 12)).toFixed(2));
      stormPill.textContent = t(`⚠ 身处电磁风暴外圈！速回安全区 (${Math.round(stormRadius)}m)`, `⚠ OUTSIDE EMP STORM! RETURN (<${Math.round(stormRadius)}m)`);
    } else {
      stormVignette.style.opacity = "0";
      stormPill.textContent = stormGraceTimer > 0
        ? t(`⚡ 风暴倒计时 ${Math.ceil(stormGraceTimer)}s · 安全半径 ${Math.round(stormRadius)}m`, `⚡ STORM IN ${Math.ceil(stormGraceTimer)}s · SAFE ${Math.round(stormRadius)}m`)
        : t(`⚡ 电磁风暴收缩中 · 安全半径 ${Math.round(stormRadius)}m`, `⚡ EMP STORM CLOSING · SAFE ${Math.round(stormRadius)}m`);
    }

    // 2. Update 2 Field Emergency Repair Relays (repair to push Storm outward +9m, +14s battery & +1 Shield!)
    for (const rl of fieldRelays) {
      rl.core.rotation.y = visualTime * (rl.repaired ? 3.2 : 1.1);
      if (rl.repaired) continue;
      if (Math.hypot(state.x - rl.x, state.z - rl.z) <= 3.5) {
        rl.progress = Math.min(1, rl.progress + dt / 1.8);
        if (rl.progress >= 1) {
          rl.repaired = true;
          rl.coreMat.color.setRGB(0.45, 3.2, 2.8);
          rl.ringMat.color.setRGB(0.45, 3.0, 2.8);
          rl.skyBeam.visible = true;
          stormRadius = Math.min(34.5, stormRadius + 9.0);
          state.time = Math.min(runSeconds() + 20, state.time + 14);
          state.boostCharge = 1;
          state.boostLocked = false;
          if (aegisCharges < 1) aegisCharges = 1;
          const bonus = Math.round(85 * waveMult());
          unbankedCoins += bonus;
          bumpCombo(1);
          spawnShockwave(rl.group.position, 0x74ffd8, 5.8);
          spawnFloatingNumber(rl.group.position, `STORM +9m · +${bonus}!`, "#74ffd8", true);
          flash(t(`📡 应急维修塔上线！风暴撑开 +9m · 续航 +14s · 护盾充能 · +${bonus} 币`, `📡 RELAY REPAIRED! STORM +9m · +14s · +${bonus} CR`), "crit");
          onJuice?.({ crit: true, value: bonus, tier: 3 });
        }
      }
    }

    // 3. Update 2 Compact Low-G Crater Jump Ramps
    for (const rm of basinRamps) {
      if (rm.cd > 0) rm.cd = Math.max(0, rm.cd - dt);
      if (rm.cd <= 0 && Math.hypot(state.x - rm.x, state.z - rm.z) <= 2.4 && Math.abs(state.speed) > 2.2) {
        rm.cd = 3.2;
        state.vy = Math.max(state.vy, 4.6);
        state.grounded = false;
        state.boostCharge = 1;
        state.boostLocked = false;
        bumpCombo(1);
        const bonus = Math.round((55 + runPerks.aeroboost * 45) * waveMult());
        unbankedCoins += bonus;
        spawnShockwave(rm.mesh.position, 0x74ffd8, 4.2);
        spawnFloatingNumber(rm.mesh.position, `AIR JUMP +${bonus}!`, "#74ffd8", true);
        flash(t(`🚀 低重力跳台飞跃！氮气瞬满 · +${bonus} 矿币 · ×${combo}`, `🚀 LOW-G RAMP JUMP! FULL BOOST · +${bonus} CR`), "crit");
        onJuice?.({ crit: true, value: bonus, tier: 2 });
      }
    }

    // 4. Periodic Micro-Meteorite Strike + Glowing Helium-3 Core
    if (extMeteorState === "idle") {
      extMeteorTimer -= dt;
      if (extMeteorTimer <= 0) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.min(stormRadius - 3, 12 + Math.random() * 11);
        const mx = Math.cos(ang) * Math.max(8, r);
        const mz = Math.sin(ang) * Math.max(8, r);
        const my = height(mx, mz);
        extMeteorPos.set(mx, my, mz);
        extMeteorWarn.position.set(mx, my + 0.14, mz);
        extMeteorWarn.visible = true;
        extMeteorGroup.position.set(mx + 5, my + 40, mz - 5);
        extMeteorGroup.visible = true;
        extMeteorState = "falling";
        extMeteorTimer = 2.4;
        flash(t("☄ 微陨石坠落预警！避开红圈后可拾取高值【氦-3 陨石核】", "☄ METEOR INBOUND! DODGE IMPACT FOR HELIUM-3 CORE!"), "normal");
      }
    } else if (extMeteorState === "falling") {
      extMeteorTimer = Math.max(0, extMeteorTimer - dt);
      const p = 1 - extMeteorTimer / 2.4;
      extMeteorGroup.position.set(
        THREE.MathUtils.lerp(extMeteorPos.x + 5, extMeteorPos.x, p),
        THREE.MathUtils.lerp(extMeteorPos.y + 40, extMeteorPos.y + 0.35, p * p),
        THREE.MathUtils.lerp(extMeteorPos.z - 5, extMeteorPos.z, p),
      );
      extMeteorRock.rotation.x += dt * 7;
      extMeteorWarn.scale.setScalar(0.8 + 0.3 * Math.sin(visualTime * 15));
      if (extMeteorTimer === 0) {
        extMeteorGroup.visible = false;
        extMeteorWarn.visible = false;
        extHe3Group.position.copy(extMeteorPos);
        extHe3Group.visible = true;
        extMeteorState = "core";
        extMeteorTimer = 22.0;
        spawnShockwave(extMeteorPos, 0xff9438, 4.8);
        onJuice?.({ crit: true, value: 0, tier: 2 });
      }
    } else if (extMeteorState === "core") {
      extMeteorTimer = Math.max(0, extMeteorTimer - dt);
      extHe3Crystal.rotation.y = visualTime * 2.8;
      extHe3Ring.rotation.z = -visualTime * 1.8;
      if (Math.hypot(state.x - extMeteorPos.x, state.z - extMeteorPos.z) <= 2.9) {
        extHe3Group.visible = false;
        extMeteorState = "idle";
        extMeteorTimer = 20.0;
        bumpCombo(1);
        const bonus = Math.round(110 * waveMult());
        unbankedCoins += bonus;
        state.time = Math.min(runSeconds() + 20, state.time + 10);
        state.boostCharge = 1;
        state.boostLocked = false;
        spawnShockwave(extMeteorPos, 0x74ffd8, 4.5);
        spawnFloatingNumber(extMeteorPos, `HELIUM-3 +${bonus}!`, "#ffd788", true);
        flash(t(`★ 氦-3 陨石核采集！+10秒续航 · 氮气瞬满 · +${bonus} 矿币`, `★ HELIUM-3 CORE! +10s · FULL BOOST · +${bonus} CR`), "crit");
        onJuice?.({ crit: true, value: bonus, tier: 3 });
      } else if (extMeteorTimer === 0) {
        extHe3Group.visible = false;
        extMeteorState = "idle";
        extMeteorTimer = 18.0;
      }
    }

    // Update Orbital Supply Drop Crates (drive within 3.2m -> FREE 3-Choose-1 Perk Draft + 12s battery!)
    for (const crate of supplyCrates) {
      if (crate.opened) continue;
      crate.beacon.rotation.y = visualTime * 2.4;
      crate.beacon.position.y = 0.64 + Math.sin(visualTime * 4 + crate.index) * 0.08;
      if (Math.hypot(state.x - crate.x, state.z - crate.z) <= 3.2) {
        crate.opened = true;
        crate.group.visible = false;
        cratesOpened += 1;
        state.time = Math.min(runSeconds(), state.time + 12);
        spawnShards(crate.group.position, 0xffd275, 16);
        track("supply_crate_open", { wave, crate: crate.index });
        onJuice?.({ crit: true, value: 0, tier: 3 });
        openPerkDraftModal(t("📦 轨道空投破译！免费战术三选一 (+12秒续航)", "📦 ORBITAL DROP CRACKED! FREE PERK DRAFT (+12s)"));
        return null;
      }
    }

    // Update Fever Speed Boost Gates (disappear cleanly once crossed in the current wave!)
    for (const gate of feverGates) {
      if (gate.passed) continue;
      if (Math.hypot(state.x - gate.x, state.z - gate.z) <= 2.35) {
        gate.passed = true;
        gate.group.visible = false;
        bumpCombo(1);
        const bonus = Math.round(25 * combo * waveMult() * (activeChassisId() === "falcon" ? 1.3 : 1));
        unbankedCoins += bonus;
        state.boostCharge = Math.min(1, state.boostCharge + 0.55);
        state.boostLocked = false;
        state.time = Math.min(runSeconds(), state.time + 6);
        spawnShards(gate.group.position, 0x74ffd8, 12);
        spawnShockwave(gate.group.position, 0x74ffd8, 4.4);
        spawnFloatingNumber(gate.group.position, `FEVER GATE +${bonus}!`, "#74ffd8", true);
        flash(t(`狂热加速门！+6秒 · +${bonus} 矿币 · ×${combo}`, `FEVER GATE! +6s · +${bonus} CR · ×${combo}`), "crit");
        onJuice?.({ crit: true, value: bonus, tier: 2 });
        track("fever_gate_pass", { wave, combo, bonus });
      }
    }

    // Update procedural ore nodes + active sweet-spot harvesting (harvested nodes stay cleared for the wave!)
    let nearest = null;
    let nearestDist = Infinity;
    const hRad = harvestRadius();
    for (const node of nodes) {
      if (node.harvested) continue;
      node.mat.emissiveIntensity = (node.tier === 3 ? 0.58 : node.tier === 2 ? 0.44 : 0.34)
        + 0.16 * Math.sin(visualTime * 3.4 + node.index);
      node.halo.scale.setScalar(0.96 + 0.05 * Math.sin(visualTime * 4.2 + node.index));
      const d = Math.hypot(state.x - node.x, state.z - node.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = node;
      }
    }

    if (!cargoFull && nearest && nearestDist <= hRad) {
      if (activeNode !== nearest) {
        // Always start cursor smoothly from the left edge when locking onto a new crystal so the player can track it easily!
        needlePhase = -Math.PI * 0.46;
      }
      activeNode = nearest;
      activeNode.progress = Math.min(1, activeNode.progress + dt / harvestSeconds());
      needlePhase += dt * (1.85 + activeNode.tier * 0.24);
      const pos = 0.5 + 0.5 * Math.sin(needlePhase);
      const hw = sweetHalfWidth();
      const inSweetNow = Math.abs(pos - 0.5) <= hw;
      resBox.hidden = false;
      resBox.dataset.inSweet = String(inSweetNow);
      resName.textContent = activeNode.jackpot
        ? t(`★ 高压富矿 · ${activeNode.name}`, `★ JACKPOT · ${activeNode.nameEn}`)
        : t(activeNode.name, activeNode.nameEn);
      resVal.textContent = `+${activeNode.value} (×2)`;
      resSweet.style.left = `${((0.5 - hw) * 100).toFixed(1)}%`;
      resSweet.style.width = `${(hw * 2 * 100).toFixed(1)}%`;
      resNeedle.style.left = `calc(${(pos * 100).toFixed(1)}% - 2.5px)`;
      resFill.style.width = `${(activeNode.progress * 100).toFixed(0)}%`;
      critBtn.textContent = inSweetNow
        ? t("★ 就是现在！按 E 暴击 ×2 ★", "★ NOW! PRESS E · CRIT ×2 ★")
        : t("光标进入金区时按 E 暴击 ×2", "Press E in Gold Zone · CRIT ×2");
      if (activeNode.progress >= 1) {
        completeHarvest(activeNode, false);
      }
    } else {
      if (activeNode) activeNode.progress = Math.max(0, activeNode.progress - dt * 0.8);
      activeNode = null;
      resBox.hidden = true;
    }

    // Animate magnetized flying shards toward rover
    let alive = 0;
    for (let i = 0; i < shardPool.length; i++) {
      const s = shardPool[i];
      s.t += dt;
      const p = s.t / s.duration;
      if (p >= 1) continue;
      const ease = p * p;
      const sx = THREE.MathUtils.lerp(s.x, roverPos.x, ease);
      const sy = THREE.MathUtils.lerp(s.y, roverPos.y + 0.72, ease) + Math.sin(p * Math.PI) * 0.45;
      const sz = THREE.MathUtils.lerp(s.z, roverPos.z, ease);
      shardPose.position.set(sx, sy, sz);
      shardPose.rotation.set(s.t * 9, s.t * 7, 0);
      shardPose.scale.setScalar(1 - p * 0.55);
      shardPose.updateMatrix();
      flyingShards.setMatrixAt(alive, shardPose.matrix);
      flyingShards.setColorAt(alive, shardColor.setHex(s.colorHex));
      shardPool[alive++] = s;
    }
    shardPool.length = alive;
    flyingShards.count = alive;
    if (alive) {
      flyingShards.instanceMatrix.needsUpdate = true;
      flyingShards.instanceColor.needsUpdate = true;
    }

    // Animate 3D expanding ground shockwave rings
    for (const r of shockRings) {
      if (!r.mesh.visible) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) {
        r.mesh.visible = false;
      } else {
        const ease = 1 - Math.pow(1 - r.t, 3);
        r.mesh.scale.setScalar(0.55 + ease * r.maxScale);
        r.mat.opacity = (1 - r.t) * 0.85;
      }
    }

    // Animate 3D-projected floating crit numbers
    if (camera && floatingNums.length) {
      const vw = window.innerWidth, vh = window.innerHeight;
      for (let i = floatingNums.length - 1; i >= 0; i--) {
        const f = floatingNums[i];
        f.t += dt;
        if (f.t >= f.dur) {
          f.el.remove();
          floatingNums.splice(i, 1);
          continue;
        }
        const p = f.t / f.dur;
        floatProj.copy(f.pos);
        floatProj.y += p * 1.45;
        floatProj.project(camera);
        if (floatProj.z > 1) {
          f.el.style.opacity = "0";
          continue;
        }
        const sx = (floatProj.x * 0.5 + 0.5) * vw;
        const sy = (-floatProj.y * 0.5 + 0.5) * vh;
        const punch = f.big ? (p < 0.16 ? 0.8 + (p / 0.16) * 0.45 : 1.25 - (p - 0.16) * 0.25) : 1;
        f.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${punch.toFixed(2)})`;
        f.el.style.opacity = String(p > 0.65 ? Math.max(0, 1 - (p - 0.65) / 0.35) : 1);
      }
    }

    // Check timer/battery expiration -> Emergency Rescue RV or Garage
    if (state.time <= 0) {
      if (unbankedCoins > 0 && !revivedThisRun) {
        openRescueModal();
      } else {
        openGarageModal({ extractedCoins: 0, forfeited: unbankedCoins > 0 });
      }
      return null;
    }

    // Navigation goal: return to pad if full/low-battery, else nearest supply crate if very close, else nearest ore
    if (cargoFull || (unbankedCoins > 0 && state.time < 22)) {
      return {
        id: "extract-pad", x: 0, z: 0,
        name: t("撤离 / 加注深潜", "Extract / Push Deeper"),
        height: 1.4, distance: distFromBase, ready: true,
      };
    }
    const openCrate = supplyCrates.find(c => !c.opened && Math.hypot(state.x - c.x, state.z - c.z) < 9.5);
    if (openCrate) {
      return {
        id: `ext-crate-${openCrate.index}`, x: openCrate.x, z: openCrate.z,
        name: t("📦 轨道空投（免费三选一）", "📦 Orbital Drop (Free Draft)"),
        height: 1.5, distance: Math.hypot(state.x - openCrate.x, state.z - openCrate.z), ready: true,
      };
    }
    return nearest ? {
      id: `ext-node-${nearest.index}`, x: nearest.x, z: nearest.z,
      name: nearest.jackpot
        ? t(`★ 高压富矿 (+${nearest.value})`, `★ Jackpot Vein (+${nearest.value})`)
        : t(`${nearest.name} (+${nearest.value})`, `${nearest.nameEn} (+${nearest.value})`),
      height: 1.4, distance: nearestDist, ready: true,
    } : null;
  }

  function awardExternalCoins(amount, source = "orbital_race") {
    const val = Math.max(0, Math.round(amount));
    if (val > 0) {
      profile.coins += val;
      profile.totalBanked += val;
      saveProfile(profile);
      track("external_reward", { source, amount: val, balance: profile.coins });
    }
    return profile.coins;
  }

  return {
    start,
    stop,
    update,
    triggerCritAttempt,
    applyActiveChassis,
    awardExternalCoins,
    openGarage: (opts = {}) => openGarageModal({ extractedCoins: 0, ...opts }),
    get active() { return active; },
    get stormRadius() { return stormRadius; },
    get modalOpen() { return modalOpen; },
    get garageOpen() { return garageOpen; },
    get activeChassis() { return activeChassisId(); },
    get visualState() {
      return {
        shield: active ? aegisCharges : 0,
        magnetTarget: active && activeNode ? activeNode.group.position : null,
        stuntGlow: active ? Math.min(1, Math.max(0, (combo - 2) * 0.45)) : 0,
        fever: active && combo >= 4,
      };
    },
    get wave() { return wave; },
    get combo() { return combo; },
    get cargoCount() { return cargoCount; },
    get maxCargo() { return maxCargo(); },
    get unbankedCoins() { return unbankedCoins; },
    get bankCoins() { return profile.coins; },
    get nodes() { return active ? nodes : null; },
    get crates() { return active ? supplyCrates : null; },
    get gates() { return active ? feverGates : null; },
    get profile() { return profile; },
    get analytics() { return analytics; },
  };
}
