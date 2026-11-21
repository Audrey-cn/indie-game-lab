// Platform Adapter Layer — Web / WeChat Mini Game (wx) ready
// Keeping all DOM / Storage / Ad / Share / Haptic calls isolated here
// makes porting to WeChat Mini Games a single-file swap.

const STORAGE_KEY = "roomba_raid_save_v1";

export const isWeChat = typeof wx !== "undefined" && typeof wx.getSystemInfoSync === "function";

export function loadSave(defaultState) {
  try {
    const raw = isWeChat ? wx.getStorageSync(STORAGE_KEY) : localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      ...structuredClone(defaultState),
      ...parsed,
      skinsOwned: Array.from(new Set([...(defaultState.skinsOwned || []), ...(parsed.skinsOwned || [])])),
      museum: { ...(defaultState.museum || {}), ...(parsed.museum || {}) },
      boosters: { ...(defaultState.boosters || {}), ...(parsed.boosters || {}) },
    };
  } catch {
    return structuredClone(defaultState);
  }
}

export function writeSave(state) {
  try {
    const data = JSON.stringify(state);
    if (isWeChat) wx.setStorageSync(STORAGE_KEY, data);
    else localStorage.setItem(STORAGE_KEY, data);
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function getTodaySeedString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seedNum) {
  let a = seedNum >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseUrlContext() {
  if (isWeChat || typeof window === "undefined") {
    return { seed: null, ghostDrop: null };
  }
  const params = new URLSearchParams(window.location.search);
  const seed = params.get("seed");
  const dropRaw = params.get("drop"); // Format: Name:Value:LootId
  let ghostDrop = null;
  if (dropRaw) {
    const [name, valStr, lootId] = dropRaw.split(":");
    const value = Math.max(5000, Math.min(500000, Number(valStr) || 18800));
    ghostDrop = {
      owner: (name || "群友").slice(0, 12),
      value,
      lootId: lootId || "catcan",
    };
  }
  return { seed, ghostDrop };
}

export function buildChallengeUrl({ seed, owner, value, lootId }) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  if (seed) url.searchParams.set("seed", seed);
  if (value > 0) {
    const safeOwner = (owner || "摸金特工").replace(/[:&=?]/g, "").slice(0, 10);
    url.searchParams.set("drop", `${safeOwner}:${Math.round(value)}:${lootId || "catcan"}`);
  }
  return url.toString();
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

export function vibrate(ms = 14) {
  try {
    if (isWeChat && wx.vibrateShort) wx.vibrateShort({ type: "light" });
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // No haptic hardware
  }
}

// Simulated IAA Rewarded Video Ad Hook (swap with wx.createRewardedVideoAd in WeChat Mini Game)
export function showRewardedAd(label, onComplete) {
  const overlay = document.getElementById("ad-sim-overlay");
  const titleEl = document.getElementById("ad-sim-title");
  const timerEl = document.getElementById("ad-sim-timer");
  const skipBtn = document.getElementById("ad-sim-done");
  if (!overlay) {
    onComplete();
    return;
  }
  titleEl.textContent = `📺 模拟激励视频 · ${label}`;
  let left = 2;
  timerEl.textContent = `模拟广告播放中 (${left}s)... 接入微信小游戏时将自动替换为 wx.createRewardedVideoAd`;
  skipBtn.disabled = true;
  skipBtn.textContent = `等待 ${left}s`;
  overlay.hidden = false;

  const iv = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(iv);
      timerEl.textContent = "奖励已就绪！点击领取";
      skipBtn.disabled = false;
      skipBtn.textContent = "领取奖励";
    } else {
      timerEl.textContent = `模拟广告播放中 (${left}s)...`;
      skipBtn.textContent = `等待 ${left}s`;
    }
  }, 650);

  skipBtn.onclick = () => {
    clearInterval(iv);
    overlay.hidden = true;
    onComplete();
  };
}
