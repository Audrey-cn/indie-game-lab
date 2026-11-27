// Meowball Rush v0.1.0 — Authentic Hamsterball 3D Physics + WitchSpring Cel-Shading!
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CATS, DEFAULT_SAVE, TRACKS } from "./config.mjs";
import { sfx } from "./audio.mjs";
import { buildTrackScene, createKittyBall, createRainbowRibbon } from "./cel-builder.mjs";
import { generateClearPoster } from "./poster.mjs";
import { GLB_MODELS } from "./models/manifest.mjs";
import coverUrl from "./assets/cover.webp";

const gltfLoader = new GLTFLoader();
const loadedGlbCache = {};
function loadGlbModel(key, onReady) {
  const url = GLB_MODELS[key];
  if (!url) return;
  if (loadedGlbCache[key]) {
    onReady(loadedGlbCache[key].scene.clone(true), loadedGlbCache[key].animations);
    return;
  }
  gltfLoader.load(url, (gltf) => {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(1 / maxDim);
    root.position.set(-center.x / maxDim, -center.y / maxDim, -center.z / maxDim);
    const wrapper = new THREE.Group();
    wrapper.add(root);
    loadedGlbCache[key] = { scene: wrapper, animations: gltf.animations || [] };
    onReady(wrapper.clone(true), gltf.animations || []);
  });
}

const SAVE_KEY = "meowball_rush_save_v1";
function loadSave() {
  try {
    return { ...DEFAULT_SAVE, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}
function writeSave(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {}
}

let save = loadSave();
let selectedPracticeTrack = 0;
let currentHubTab = "tracks";
let gyroEnabled = false;
let gyroZeroBeta = 38; // Comfortable phone holding pitch angle
let gyroZeroGamma = 0;
let gyroTiltX = 0;
let gyroTiltZ = 0;

// UI Refs
const canvas = document.getElementById("gl-canvas");
const lobbyScreen = document.getElementById("lobby-screen");
const pauseScreen = document.getElementById("pause-screen");
const resultScreen = document.getElementById("result-screen");
const posterModal = document.getElementById("poster-modal");
const hudEl = document.getElementById("hud");
const toastEl = document.getElementById("toast");
lobbyScreen.style.backgroundImage = `url("${coverUrl}")`;
let previewCatId = save.selectedCat;
let lastPoster = null;
let lastResultCtx = null;

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

// ===== THREE.JS CEL-SHADED + ACES FILMIC + PMREM + BLOOM RENDERER =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// Soft Luminous Studio Environment Reflections for Hunyuan 3D PBR Models!
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.65;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 220);

// Dreamy WitchSpring Bloom Post-Processing Pipeline!
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.26, 0.52, 0.84);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Warm WitchSpring Lighting + Soft Real-Time Sunlight Shadows!
const hemiLight = new THREE.HemisphereLight(0xfffaf2, 0x8b74bd, 1.0);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xfff5d6, 1.4);
sunLight.position.set(18, 36, 16);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 4;
sunLight.shadow.camera.far = 110;
sunLight.shadow.camera.left = -28;
sunLight.shadow.camera.right = 28;
sunLight.shadow.camera.top = 28;
sunLight.shadow.camera.bottom = -28;
sunLight.shadow.bias = -0.0012;
scene.add(sunLight);
scene.add(sunLight.target);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isPortrait = h > w * 1.05;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  camera.aspect = w / h;
  // Widen FOV cleanly on portrait phones so narrow bridges & swinging hammers stay crystal clear!
  camera.fov = isPortrait ? 54 : 42;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ===== GAME STATE =====
let state = null;
let trackRoot = null;
let dynamicMeshes = null;
let kittyRig = null;
const trailPoints = [];
let trailMesh = null;

function isCatUnlocked(cat) {
  if (cat.unlockedByDefault || save.unlockedCats.includes(cat.id)) return true;
  const req = cat.unlockReq;
  if (!req) return false;
  if (req.type === "clear" && save.clearedTracks.includes(req.track)) return true;
  if (req.type === "stars" && (save.totalStars || 0) >= req.count) return true;
  if (req.type === "share" && (save.sharedCount || 0) >= req.count) return true;
  if (req.type === "secret" && (save.secretsFound || 0) >= req.count) return true;
  if (req.type === "nopop" && (save.noPopClears || 0) >= req.count) return true;
  if (req.type === "fast" && Math.max(save.bestSingleRemain || 0, save.bestTourneyTime || 0) >= req.seconds) return true;
  if (req.type === "time" && (save.bestTourneyTime || 0) >= req.seconds) return true;
  return false;
}

function getCatProgressText(cat) {
  if (isCatUnlocked(cat)) return "✅ 已解锁 · 点击即可换装出战！";
  const req = cat.unlockReq;
  if (!req) return `🔒 ${cat.unlockText}`;
  if (req.type === "stars") return `🔒 ${cat.unlockText}（当前 ${save.totalStars || 0}/${req.count} ⭐）`;
  if (req.type === "fast") return `🔒 ${cat.unlockText}（当前最佳 ${Math.max(save.bestSingleRemain || 0, save.bestTourneyTime || 0).toFixed(1)}s）`;
  return `🔒 ${cat.unlockText}`;
}

function getSelectedCat() {
  return CATS.find((c) => c.id === save.selectedCat) || CATS[0];
}

function isTrackUnlocked(idx) {
  if (idx === 0) return true;
  return save.clearedTracks.includes(idx - 1);
}

function updateGyroUI() {
  const lBtn = document.getElementById("btn-lobby-gyro");
  const hBtn = document.getElementById("btn-hud-gyro");
  lBtn.textContent = gyroEnabled ? "📱 陀螺仪：开" : "📱 陀螺仪：关";
  lBtn.classList.toggle("on", gyroEnabled);
  hBtn.classList.toggle("active", gyroEnabled);
}

async function toggleGyro() {
  if (gyroEnabled) {
    gyroEnabled = false;
    gyroTiltX = 0;
    gyroTiltZ = 0;
    updateGyroUI();
    showToast("📱 已关闭手机陀螺仪（切换为触屏滑动）");
    return;
  }
  if (typeof DeviceOrientationEvent === "undefined") {
    showToast("⚠️ 当前设备不支持陀螺仪传感器，请使用鼠标或触屏滑动！");
    return;
  }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== "granted") {
        showToast("⚠️ 未授予陀螺仪权限，可在系统设置中开启！");
        return;
      }
    }
    gyroEnabled = true;
    gyroZeroBeta = null; // Auto-calibrate to user's current comfortable holding posture!
    gyroZeroGamma = null;
    updateGyroUI();
    showToast("📱 陀螺仪体感已开启！倾斜手机即可滚动猫球！");
  } catch {
    showToast("⚠️ 陀螺仪初始化失败，请使用触屏滑动或鼠标！");
  }
}

window.addEventListener("deviceorientation", (e) => {
  if (!gyroEnabled || e.beta == null || e.gamma == null) return;
  if (gyroZeroBeta === null) {
    gyroZeroBeta = Math.max(10, Math.min(65, e.beta));
    gyroZeroGamma = e.gamma;
  }
  const dGamma = e.gamma - gyroZeroGamma;
  const dBeta = e.beta - gyroZeroBeta;
  const dz = 3.5; // Smooth deadzone so hands don't jitter!
  const gx = Math.abs(dGamma) < dz ? 0 : Math.max(-24, Math.min(24, (dGamma - Math.sign(dGamma) * dz) * 0.95));
  const gz = Math.abs(dBeta) < dz ? 0 : Math.max(-24, Math.min(24, (dBeta - Math.sign(dBeta) * dz) * 0.95));
  gyroTiltX = gx * save.mouseSens;
  gyroTiltZ = gz * save.mouseSens;
});

function renderLobby() {
  document.getElementById("lobby-stars").textContent = `⭐ ${save.totalStars}`;
  document.getElementById("lobby-best").textContent = save.bestTourneyTime > 0 ? `🏆 ${save.bestTourneyTime.toFixed(1)}s` : "🏆 --";
  updateGyroUI();

  document.querySelectorAll(".htab").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentHubTab));
  document.getElementById("pane-tracks").hidden = currentHubTab !== "tracks";
  document.getElementById("pane-cats").hidden = currentHubTab !== "cats";

  // Progressive Difficulty Track Cards (★ -> ★★ -> ★★★)
  const cardsEl = document.getElementById("track-cards");
  cardsEl.innerHTML = "";
  if (!isTrackUnlocked(selectedPracticeTrack)) selectedPracticeTrack = 0;
  TRACKS.forEach((t, idx) => {
    const unlocked = isTrackUnlocked(idx);
    const cleared = save.clearedTracks.includes(idx);
    const diffStars = "★".repeat(idx + 1) + "☆".repeat(2 - idx);
    const bestT = save.bestTrackTimes?.[t.id];
    const card = document.createElement("button");
    card.className = `tcard ${selectedPracticeTrack === idx ? "active" : ""} ${unlocked ? "" : "locked"}`;
    card.innerHTML = `
      <div>
        <div class="tcard-title">${unlocked ? t.name : `🔒 ${t.name}`}</div>
        <div class="tcard-sub">${unlocked ? t.subtitle : `通关第 ${idx} 关后自动解锁！`}</div>
      </div>
      <div class="tcard-right">
        <div class="tcard-diff">${diffStars}</div>
        <div class="tcard-best">${cleared ? (bestT ? `最佳 ${bestT.toFixed(1)}s` : "✅ 已通关") : unlocked ? `+${t.bonusTime}s` : "未解锁"}</div>
      </div>
    `;
    card.onclick = () => {
      if (!unlocked) {
        showToast(`🔒 请先通关第 ${idx} 关解锁【${t.name}】！`);
        return;
      }
      selectedPracticeTrack = idx;
      renderLobby();
    };
    cardsEl.appendChild(card);
  });

  // Rich 9-Cat Wardrobe Grid + Rarity Badges + Live Unlock Progress + 4 Visual Stat Bars
  const catGrid = document.getElementById("cat-grid");
  catGrid.innerHTML = "";
  let ownedCount = 0;
  for (const cat of CATS) {
    const unlocked = isCatUnlocked(cat);
    if (unlocked) ownedCount++;
    const isSel = save.selectedCat === cat.id;
    const isPrev = previewCatId === cat.id;
    const btn = document.createElement("button");
    btn.className = `cat-btn ${isSel || isPrev ? "active" : ""} ${unlocked ? "" : "locked"}`;
    const hex = `#${cat.bubbleColor.toString(16).padStart(6, "0")}`;
    btn.innerHTML = `
      <span class="cat-rar ${cat.rarity || "R"}">${cat.rarity || "R"}</span>
      <div class="cat-dot" style="background:${hex}">${unlocked ? (cat.emoji || "🐱") : "🔒"}</div>
      <div class="cat-name">${cat.name}</div>
    `;
    btn.onclick = () => {
      previewCatId = cat.id;
      if (!unlocked) {
        showToast(getCatProgressText(cat));
        renderLobby();
        return;
      }
      save.selectedCat = cat.id;
      writeSave(save);
      renderLobby();
    };
    catGrid.appendChild(btn);
  }
  document.getElementById("cat-count").textContent = `${ownedCount}/${CATS.length}`;
  const shownCat = CATS.find((c) => c.id === previewCatId) || getSelectedCat();
  document.getElementById("cat-desc").textContent = `${shownCat.emoji || "🐱"} ${shownCat.name} [${shownCat.rarity || "R"}] · ${shownCat.desc}`;
  document.getElementById("cat-unlock-hint").textContent = getCatProgressText(shownCat);
  const barDefs = [
    ["加速", shownCat.stats.accel / 1.15],
    ["极速", shownCat.stats.topSpeed / 1.15],
    ["抓地", shownCat.stats.grip / 1.25],
    ["抗晕", shownCat.stats.dizzyResist / 1.5],
  ];
  document.getElementById("cat-bars").innerHTML = barDefs
    .map(([k, pct]) => `<div class="sbar-row"><span>${k}</span><div class="sbar-track"><div class="sbar-fill" style="width:${Math.min(100, Math.round(pct * 100))}%"></div></div></div>`)
    .join("");
  const catGoBtn = document.getElementById("btn-cat-go");
  if (catGoBtn) {
    const activeCat = getSelectedCat();
    catGoBtn.textContent = `🎯 带【${activeCat.name}】出战第 ${selectedPracticeTrack + 1} 关！`;
  }
}

// ===== TRACK LOADER & 3D SCENE SETUP =====
function loadTrack(trackIndex, mode = "tourney", carryTime = 0) {
  const track = TRACKS[trackIndex];
  const cat = getSelectedCat();

  if (trackRoot) scene.remove(trackRoot);
  if (kittyRig) {
    scene.remove(kittyRig.root);
    scene.remove(kittyRig.shadow);
  }
  if (trailMesh) scene.remove(trailMesh);

  scene.background = new THREE.Color(track.skyTop);
  // Crisp sunlit visibility on Track 1 (pushed fog far back so the whole Sky Garden is crystal clear!)
  scene.fog = trackIndex === 0
    ? new THREE.Fog(track.fogColor, 64, 185)
    : new THREE.Fog(track.fogColor, 54, 165);
  sunLight.color.setHex(track.sunColor);

  const built = buildTrackScene(track);
  trackRoot = built.group;
  dynamicMeshes = built.dynamicMeshes;
  scene.add(trackRoot);

  // Mount Real Sculpted 3D Hunyuan GLB Trees & Golden Portal Archway!
  if (dynamicMeshes.treeSlots && dynamicMeshes.treeSlots.length > 0) {
    loadGlbModel("tree", (treeProto) => {
      for (const slot of dynamicMeshes.treeSlots) {
        slot.anchor.clear();
        const t = treeProto.clone(true);
        t.scale.setScalar(slot.scale);
        t.position.y = slot.scale * 0.48;
        t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        slot.anchor.add(t);
      }
    });
  }
  if (dynamicMeshes.portalAnchor) {
    loadGlbModel("portal", (portalModel) => {
      dynamicMeshes.portalAnchor.clear();
      portalModel.scale.setScalar(4.4);
      portalModel.position.y = 2.15;
      portalModel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      dynamicMeshes.portalAnchor.add(portalModel);
    });
  }

  kittyRig = createKittyBall(cat);
  scene.add(kittyRig.root);
  scene.add(kittyRig.shadow);
  // Auto-mount external AI-generated 3D .glb kitten + automatic AnimationMixer for rigged GLBs!
  const glbKey = cat.glbKey || (cat.id === "ginger_scarf" ? "cat-ginger" : "cat-witch");
  loadGlbModel(glbKey, (model, animations) => {
    if (!kittyRig) return;
    kittyRig.mountExternalModel(model, 0.72);
    if (animations && animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(animations[0]);
      action.play();
      kittyRig.mixer = mixer;
    }
  });

  // Lush Pastel Rainbow Speed Ribbon Trail!
  trailPoints.length = 0;
  const rib = createRainbowRibbon(24);
  trailMesh = rib.mesh;
  scene.add(trailMesh);

  const startTime = mode === "tourney" ? (trackIndex === 0 ? track.bonusTime : carryTime + track.bonusTime) : track.bonusTime + 10;

  state = {
    mode,
    trackIndex,
    track,
    cat,
    phase: "playing",
    timeLeft: startTime,
    elapsed: 0,
    stars: 0,
    pops: 0,
    secretFound: false,
    checkpoint: { ...track.start },
    checkpointIdx: -1,
    ball: {
      x: track.start.x,
      y: track.start.y,
      z: track.start.z,
      vx: 0,
      vy: 0,
      vz: 0,
      r: 0.62,
      grounded: false,
      surfaceKind: "grass",
      dizzyTimer: 0,
      popTimer: 0,
      hammerHitCd: 0,
      facing: 0,
      pawCycle: 0,
      boostFlash: 0,
    },
    input: { ix: 0, iz: 0, mouseAccX: 0, mouseAccZ: 0, keys: new Set(), touchActive: false, lx: 0, ly: 0 },
    urgentLastSec: 10,
    camPos: new THREE.Vector3(track.start.x + 8.5, track.start.y + 10.5, track.start.z + 11.5),
    camLook: new THREE.Vector3(track.start.x, track.start.y - 0.3, track.start.z - 2.0),
    camFov: window.innerHeight > window.innerWidth * 1.05 ? 54 : 42,
    camRoll: 0,
    camSpringY: 0,
    camSpringVy: 0,
    lastVy: 0,
    lastGrounded: true,
    turnSmooth: 0,
    squash: 0,
    squashVel: 0,
  };

  kittyRig.root.position.set(state.ball.x, state.ball.y, state.ball.z);
  document.getElementById("hud-track").textContent = `🌸 ${track.name}`;
  lobbyScreen.hidden = true;
  resultScreen.hidden = true;
  hudEl.hidden = false;
  sfx.startBgm(trackIndex);
  showToast(`🏁 ${track.name} · 冲向终点传送门！`);
}

// ===== DETERMINISTIC 3D SURFACE QUERY (Platforms, Ramps & Rotating Gears!) =====
function sampleTrackSurface(x, y, z, r) {
  const tr = state.track;
  let bestY = -999;
  let bestSurf = null;

  for (const p of tr.platforms) {
    const hw = p.w * 0.5 + r * 0.35;
    const hd = p.d * 0.5 + r * 0.35;
    if (Math.abs(x - p.x) > hw || Math.abs(z - p.z) > hd) continue;

    let surfY = p.y;
    let slopeX = 0;
    let slopeZ = 0;
    if (p.kind === "ramp" || p.kind === "ice_ramp") {
      if (p.dir === "-z") {
        const t = Math.max(0, Math.min(1, (p.z + p.d * 0.5 - z) / p.d));
        surfY = p.yStart + (p.yEnd - p.yStart) * t;
        slopeZ = (p.yEnd - p.yStart) / p.d;
      } else if (p.dir === "+x") {
        const t = Math.max(0, Math.min(1, (x - (p.x - p.w * 0.5)) / p.w));
        surfY = p.yStart + (p.yEnd - p.yStart) * t;
        slopeX = (p.yEnd - p.yStart) / p.w;
      }
    }
    // Only collide if ball bottom is near or above the surface top
    if (y - r <= surfY + 0.55 && y >= surfY - 0.85 && surfY > bestY) {
      bestY = surfY;
      bestSurf = { y: surfY, kind: p.kind, slopeX, slopeZ, secret: p.secret, gearVx: 0, gearVz: 0 };
    }
  }

  for (const g of tr.gears) {
    const dx = x - g.x;
    const dz = z - g.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= g.r + r * 0.35 && y - r <= g.y + 0.55 && y >= g.y - 0.85 && g.y > bestY) {
      bestY = g.y;
      // Tangential rotational carry velocity from the spinning brass gear!
      bestSurf = {
        y: g.y,
        kind: "gear",
        slopeX: 0,
        slopeZ: 0,
        gearVx: dz * g.omega * 0.62,
        gearVz: -dx * g.omega * 0.62,
      };
    }
  }

  return bestSurf;
}

function triggerBubblePop(reason = "💥 砰！猫球破啦！") {
  const b = state.ball;
  if (b.popTimer > 0) return;
  state.pops += 1;
  b.popTimer = 1.65;
  b.dizzyTimer = 0;
  b.vx *= 0.2;
  b.vz *= 0.2;
  b.vy = 4.2;
  sfx.playPop();
  kittyRig.bubbleMesh.visible = false;
  kittyRig.kitty.visible = false;
  kittyRig.dizzyHalo.visible = false;
  kittyRig.furball.visible = true;
  showToast(reason);
}

function finishStage(cleared) {
  state.phase = "ended";
  sfx.stopBgm();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  hudEl.hidden = true;

  const unlockedBefore = new Set(CATS.filter((c) => isCatUnlocked(c)).map((c) => c.id));
  const isFinalTourney = state.mode === "tourney" && state.trackIndex === TRACKS.length - 1;
  const hasNextStage = state.trackIndex < TRACKS.length - 1;

  if (cleared) {
    sfx.playFinish();
    if (!save.clearedTracks.includes(state.trackIndex)) save.clearedTracks.push(state.trackIndex);
    if (!save.bestTrackTimes) save.bestTrackTimes = {};
    const prevBest = save.bestTrackTimes[state.track.id] || 0;
    if (state.timeLeft > prevBest) save.bestTrackTimes[state.track.id] = state.timeLeft;
    if (state.timeLeft > (save.bestSingleRemain || 0)) save.bestSingleRemain = state.timeLeft;
    if (state.pops === 0) save.noPopClears = (save.noPopClears || 0) + 1;
    if (state.secretFound) save.secretsFound = (save.secretsFound || 0) + 1;
    save.totalStars += state.stars;
    if (isFinalTourney && state.timeLeft > save.bestTourneyTime) {
      save.bestTourneyTime = state.timeLeft;
    }
    writeSave(save);

    const newlyUnlocked = CATS.filter((c) => isCatUnlocked(c) && !unlockedBefore.has(c.id));
    const unlockBox = document.getElementById("res-unlock");
    if (newlyUnlocked.length > 0) {
      const firstNew = newlyUnlocked[0];
      unlockBox.hidden = false;
      document.getElementById("res-unlock-text").textContent = `🎁 解锁新猫球：${firstNew.emoji} ${firstNew.name}！`;
      document.getElementById("btn-res-equip").onclick = () => {
        save.selectedCat = firstNew.id;
        previewCatId = firstNew.id;
        writeSave(save);
        showToast(`✨ 已换上【${firstNew.name}】！下一关立刻生效！`);
        unlockBox.hidden = true;
      };
    } else {
      unlockBox.hidden = true;
    }

    document.getElementById("res-tag").textContent = isFinalTourney ? "🏆 TOURNAMENT CHAMPION!" : "✨ STAGE CLEAR!";
    document.getElementById("res-title").textContent = isFinalTourney ? "🎉 3 关锦标赛全通！" : `✅ 通过 ${state.track.name}`;
    document.getElementById("res-sub").textContent =
      state.mode === "tourney" && hasNextStage
        ? `剩余 ${state.timeLeft.toFixed(1)}s 已全额结转！下一关再奖 +${TRACKS[state.trackIndex + 1].bonusTime}s！`
        : hasNextStage
          ? `下一关【${TRACKS[state.trackIndex + 1].name}】已解锁！点击下方直接冲刺！`
          : isFinalTourney
            ? `最终结转总剩余 ${state.timeLeft.toFixed(1)} 秒！快生成战报海报炫耀一下！`
            : "全关卡通关！生成战报海报还能额外解锁【幻梦星铃猫】！";
    document.getElementById("res-time").textContent = `${state.timeLeft.toFixed(1)}s`;
    document.getElementById("res-stars").textContent = `⭐ ${state.stars} / 💥 ${state.pops}`;

    const nextBtn = document.getElementById("btn-res-next");
    if (hasNextStage) {
      const nextName = TRACKS[state.trackIndex + 1].name.split("·")[1].trim();
      nextBtn.textContent = `➡️ 直接进入下一关：${nextName}`;
      nextBtn.onclick = () => {
        selectedPracticeTrack = state.trackIndex + 1;
        loadTrack(state.trackIndex + 1, state.mode, state.mode === "tourney" ? state.timeLeft : 0);
      };
    } else {
      nextBtn.textContent = "🏆 再冲一轮 3 关锦标赛";
      nextBtn.onclick = () => loadTrack(0, "tourney", 0);
    }
  } else {
    sfx.playPop();
    document.getElementById("res-unlock").hidden = true;
    document.getElementById("res-tag").textContent = "⏰ TIME UP";
    document.getElementById("res-title").textContent = "😿 时间耗尽啦！";
    document.getElementById("res-sub").textContent = "小猫跑累了…试试发现隐藏云朵捷径省时间！";
    document.getElementById("res-time").textContent = "0.0s";
    document.getElementById("res-stars").textContent = `⭐ ${state.stars} / 💥 ${state.pops}`;
    const nextBtn = document.getElementById("btn-res-next");
    nextBtn.textContent = "🔄 重新挑战本关";
    nextBtn.onclick = () => loadTrack(state.trackIndex, state.mode, 0);
  }

  document.getElementById("btn-res-retry").onclick = () => loadTrack(state.trackIndex, state.mode, 0);
  lastResultCtx = {
    track: state.track,
    cat: state.cat,
    timeLeft: state.timeLeft,
    stars: state.stars,
    pops: state.pops,
    secretFound: state.secretFound,
    isFinalTourney,
    cleared,
  };
  resultScreen.hidden = false;
}

// ===== MAIN PHYSICS & ANIMATION LOOP =====
let lastTs = 0;
function tick(ts) {
  const dt = Math.min(0.04, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;

  if (state && state.phase === "playing") {
    state.elapsed += dt;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft <= 10 && Math.ceil(state.timeLeft) < state.urgentLastSec) {
      state.urgentLastSec = Math.ceil(state.timeLeft);
      sfx.playUrgentTick();
    }
    if (state.timeLeft <= 0) {
      finishStage(false);
    } else {
      updatePhysics(dt);
    }
    updateVisuals(dt);
    syncHud();
  } else if (trackRoot) {
    // Gentle idle turntable preview behind Lobby!
    camera.position.set(Math.sin(ts * 0.0003) * 14, 14, Math.cos(ts * 0.0003) * 14 - 8);
    camera.lookAt(0, 5, -14);
  }

  composer.render();
  requestAnimationFrame(tick);
}

function updatePhysics(dt) {
  const b = state.ball;
  const catStats = state.cat.stats;
  const inp = state.input;

  // Animate dynamic track hazards
  for (const g of dynamicMeshes.gears) {
    g.mesh.rotation.y += g.def.omega * dt;
  }
  for (const hm of dynamicMeshes.hammers) {
    const tArg = state.elapsed * hm.def.speed + hm.def.phase;
    const ang = Math.sin(tArg) * hm.def.amp;
    const angVel = Math.cos(tArg) * hm.def.amp * hm.def.speed;
    hm.pivot.rotation.z = ang;
    hm.worldHead.set(
      hm.def.x + Math.sin(ang) * hm.def.len,
      hm.def.y - Math.cos(ang) * hm.def.len,
      hm.def.z
    );
    hm.velX = Math.cos(ang) * angVel * hm.def.len;
    hm.velY = Math.sin(ang) * angVel * hm.def.len;
  }

  // Handle Comical Popped Furball Respawn Timer (Clock keeps ticking — pure Hamsterball tension!)
  if (b.popTimer > 0) {
    b.popTimer -= dt;
    b.y += b.vy * dt;
    b.vy -= 18 * dt;
    kittyRig.furball.rotation.y += 10 * dt;
    if (b.popTimer <= 0) {
      b.x = state.checkpoint.x;
      b.y = state.checkpoint.y + 0.8;
      b.z = state.checkpoint.z;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      kittyRig.bubbleMesh.visible = true;
      kittyRig.kitty.visible = true;
      kittyRig.furball.visible = false;
    }
    return;
  }

  // Gather Isometric Screen-Aligned Input (Mouse Push + WASD + Touch Drag!)
  let kx = 0;
  let kz = 0;
  if (inp.keys.has("KeyW") || inp.keys.has("ArrowUp")) kz -= 1;
  if (inp.keys.has("KeyS") || inp.keys.has("ArrowDown")) kz += 1;
  if (inp.keys.has("KeyA") || inp.keys.has("ArrowLeft")) kx -= 1;
  if (inp.keys.has("KeyD") || inp.keys.has("ArrowRight")) kx += 1;

  // Convert screen-space mouse/keyboard/gyroscope into isometric world axes!
  let rawX = kx * 18 + inp.mouseAccX + (gyroEnabled ? gyroTiltX : 0);
  let rawZ = kz * 18 + inp.mouseAccZ + (gyroEnabled ? gyroTiltZ : 0);
  inp.mouseAccX *= Math.pow(0.02, dt);
  inp.mouseAccZ *= Math.pow(0.02, dt);

  // Dizzy wobble!
  if (b.dizzyTimer > 0) {
    b.dizzyTimer = Math.max(0, b.dizzyTimer - dt);
    const wob = Math.sin(state.elapsed * 11) * 0.55;
    const c = Math.cos(wob);
    const s = Math.sin(wob);
    const tx = rawX * c - rawZ * s;
    const tz = rawX * s + rawZ * c;
    rawX = tx * 0.65;
    rawZ = tz * 0.65;
  }

  // Rotate input by camera horizontal yaw (~34 deg) so pushing "Up" always rolls cleanly up-screen!
  const camYaw = 0.58;
  const cy = Math.cos(camYaw);
  const sy = Math.sin(camYaw);
  const driveX = rawX * cy + rawZ * sy;
  const driveZ = -rawX * sy + rawZ * cy;

  const isIce = b.surfaceKind === "ice" || b.surfaceKind === "ice_ramp";
  const accelMult = (b.grounded ? (isIce ? 0.52 : 1.0) : 0.35) * catStats.accel;
  b.vx += driveX * accelMult * dt;
  b.vz += driveZ * accelMult * dt;

  // Surface Friction & Gravity
  const friction = b.grounded ? (isIce ? 0.48 : 0.14 / catStats.grip) : 0.65;
  b.vx *= Math.pow(friction, dt);
  b.vz *= Math.pow(friction, dt);
  b.vy -= 26.0 * dt;

  // Cap max horizontal speed
  const maxSpd = 18.5 * catStats.topSpeed;
  const hSpd = Math.hypot(b.vx, b.vz);
  if (hSpd > maxSpd) {
    b.vx = (b.vx / hSpd) * maxSpd;
    b.vz = (b.vz / hSpd) * maxSpd;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Solid Side-Wall Pushout: prevents the ball from clipping horizontally into raised platforms!
  for (const p of state.track.platforms) {
    if (p.kind === "ramp" || p.kind === "ice_ramp" || p.kind === "cloud") continue;
    if (b.y < p.y - 0.12 && b.y + b.r > p.y - p.h) {
      const hw = p.w * 0.5 + b.r;
      const hd = p.d * 0.5 + b.r;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        const penX = hw - Math.abs(dx);
        const penZ = hd - Math.abs(dz);
        if (penX < penZ) {
          b.x = p.x + Math.sign(dx || 1) * hw;
          b.vx = -b.vx * 0.45;
        } else {
          b.z = p.z + Math.sign(dz || 1) * hd;
          b.vz = -b.vz * 0.45;
        }
      }
    }
  }

  // Surface Collision & Smooth, Controllable Slope Physics
  const surf = sampleTrackSurface(b.x, b.y, b.z, b.r);
  if (surf && b.vy <= 1.2) {
    const impactVy = -b.vy;
    const wasRamp = b.surfaceKind === "ramp" || b.surfaceKind === "ice_ramp";
    b.y = surf.y + b.r;
    if (!b.grounded && !wasRamp && impactVy > 15.0) {
      triggerBubblePop("💥 摔太狠啦！魔法泡泡碎了！");
      return;
    } else if (!b.grounded && !wasRamp && impactVy > 9.6) {
      b.dizzyTimer = 1.35 / catStats.dizzyResist;
      sfx.playDizzy();
      showToast("💫 摔晕啦！小猫头顶冒金星！");
      b.vy = impactVy * 0.22;
    } else {
      b.vy = 0;
    }
    b.grounded = true;
    b.surfaceKind = surf.kind;
    // Realistic, controllable slope gravity (g * sin(theta) scaled for crisp arcade counter-steering!)
    const isIceSlope = surf.kind === "ice_ramp";
    const slopeGain = isIceSlope ? 14.5 : 11.2;
    b.vx -= surf.slopeX * slopeGain * dt;
    b.vz += surf.slopeZ * slopeGain * dt;
    // Soft downhill speed cap so steep ramps feel fast without launching uncontrollably
    if (surf.slopeX !== 0 || surf.slopeZ !== 0) {
      const rampCap = (isIceSlope ? 13.8 : 11.8) * catStats.topSpeed;
      const curSpd = Math.hypot(b.vx, b.vz);
      if (curSpd > rampCap) {
        const blend = rampCap + (curSpd - rampCap) * Math.pow(0.15, dt);
        b.vx = (b.vx / curSpd) * blend;
        b.vz = (b.vz / curSpd) * blend;
      }
    }
    // Rotating Gear tangential carry!
    if (surf.gearVx || surf.gearVz) {
      b.x += surf.gearVx * dt;
      b.z += surf.gearVz * dt;
    }
    if (surf.secret && !state.secretFound) {
      state.secretFound = true;
      sfx.playBoost();
      showToast("☁️ 发现隐藏云朵捷径！狂省 8 秒！");
    }
  } else {
    b.grounded = false;
  }

  // Fall off floating sky island!
  if (b.y < state.track.deathY) {
    triggerBubblePop("☁️ 掉进云海啦！正在魔法召回…");
    return;
  }

  // Swinging Wooden Hammers — Pure Physical Momentum Knockback (No instant-kill!)
  b.hammerHitCd = Math.max(0, (b.hammerHitCd || 0) - dt);
  if (b.hammerHitCd <= 0) {
    for (const hm of dynamicMeshes.hammers) {
      const dx = b.x - hm.worldHead.x;
      const dy = b.y - hm.worldHead.y;
      const dz = b.z - hm.worldHead.z;
      const d = Math.hypot(dx, dy, dz);
      const hitDist = b.r + 0.92;
      if (d < hitDist) {
        const inv = 1 / (d || 0.001);
        const nx = dx * inv;
        const ny = dy * inv;
        const nz = dz * inv;
        // Separate ball out of hammer head
        b.x = hm.worldHead.x + nx * (hitDist + 0.08);
        b.y = hm.worldHead.y + ny * (hitDist + 0.08);
        b.z = hm.worldHead.z + nz * (hitDist + 0.08);

        // Real physical impulse from hammer's instantaneous tangential swing velocity!
        const swingSpd = Math.hypot(hm.velX || 0, hm.velY || 0);
        const heavyMult = state.cat.id === "ginger_scarf" ? 0.78 : 1.0; // Chubby ginger cat resists knockback better!
        const pushForce = (4.5 + swingSpd * 1.45) * heavyMult;
        b.vx = (hm.velX || 0) * 1.35 * heavyMult + nx * pushForce;
        b.vz = b.vz * 0.5 + nz * pushForce;
        b.vy = Math.max(3.2, Math.min(8.5, 3.6 + swingSpd * 0.42));
        b.grounded = false;
        b.hammerHitCd = 0.28;
        if (swingSpd > 4.5) {
          b.dizzyTimer = Math.max(b.dizzyTimer, 0.85 / state.cat.stats.dizzyResist);
        }
        sfx.playHammerBonk(swingSpd / 6);
        showToast(swingSpd > 5.5 ? "🔨 咚！被大木锤狠狠锤飞！" : "🔨 咚！擦到木锤弹开了！");
        break;
      }
    }
  }

  // Bouncy Red Mushrooms!
  for (const m of dynamicMeshes.mushrooms) {
    const d = Math.hypot(b.x - m.def.x, b.z - m.def.z);
    if (d < m.def.r + b.r * 0.5 && Math.abs(b.y - m.def.y) < 1.35 && b.vy <= 2) {
      b.vy = m.def.vy;
      b.vz += m.def.vz;
      b.grounded = false;
      m.bounceAnim = 1.0;
      sfx.playBoing();
      showToast("🍄 弹跳蘑菇起飞！");
    }
  }

  // Rainbow Speed Boost Strips (Snappy & Controllable!)
  b.boostFlash = Math.max(0, b.boostFlash - dt);
  for (const bs of state.track.boosts) {
    if (Math.abs(b.x - bs.x) < bs.w * 0.5 + b.r && Math.abs(b.z - bs.z) < bs.d * 0.5 + b.r && Math.abs(b.y - bs.y) < 1.2) {
      b.vx += bs.fx * dt * 1.45;
      b.vz += bs.fz * dt * 1.45;
      if (b.boostFlash <= 0) {
        b.boostFlash = 0.6;
        sfx.playBoost();
      }
    }
  }

  // Checkpoints!
  state.track.checkpoints.forEach((cp, idx) => {
    if (idx > state.checkpointIdx && Math.hypot(b.x - cp.x, b.z - cp.z) < 2.8 && Math.abs(b.y - cp.y) < 1.8) {
      state.checkpointIdx = idx;
      state.checkpoint = { x: cp.x, y: cp.y + 0.8, z: cp.z };
      sfx.playCheckpoint();
      showToast("🚩 已激活魔法检查点！");
    }
  });

  // Magic Star Candy Pickups!
  for (const st of dynamicMeshes.stars) {
    if (st.collected) continue;
    if (Math.hypot(b.x - st.def.x, b.y - st.def.y, b.z - st.def.z) < b.r + 0.85) {
      st.collected = true;
      st.mesh.visible = false;
      state.stars += 1;
      state.timeLeft += 1.5; // Each star candy adds +1.5s bonus time!
      sfx.playStar();
      showToast("⭐ 吃到魔法星糖！时间 +1.5s");
    }
  }

  // Finish Portal!
  const fin = state.track.finish;
  if (Math.hypot(b.x - fin.x, b.z - fin.z) < 2.2 && Math.abs(b.y - fin.y) < 2.2) {
    finishStage(true);
  }
}

function updateVisuals(dt) {
  const b = state.ball;
  const spd = Math.hypot(b.vx, b.vz);

  kittyRig.root.position.set(b.x, b.y, b.z);
  kittyRig.bubbleMat.uniforms.uTime.value = state.elapsed;

  // Physical rolling rotation + expressive steering lean!
  let turnDelta = 0;
  if (spd > 0.05) {
    const rollAxis = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
    kittyRig.bubbleMesh.rotateOnWorldAxis(rollAxis, (spd * dt) / b.r);
    const targetFace = Math.atan2(-b.vx, -b.vz);
    let diff = targetFace - b.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    turnDelta = Math.max(-1, Math.min(1, diff * 1.8));
    b.facing += diff * Math.min(1, dt * 10);
    kittyRig.kitty.rotation.y = b.facing;
  }
  state.turnSmooth += (turnDelta - state.turnSmooth) * Math.min(1, dt * 8);

  // Detect landing impact & jump impulse for elastic jelly squash-and-stretch + camera spring dip!
  if (!state.lastGrounded && b.grounded && state.lastVy < -2.2) {
    const impact = Math.min(1.0, Math.abs(state.lastVy) / 11);
    state.squashVel -= 7.5 * impact;
    state.camSpringVy -= 5.2 * impact;
  } else if (state.lastGrounded && !b.grounded && b.vy > 3.5) {
    state.squashVel += 5.5;
  }
  state.lastGrounded = b.grounded;
  state.lastVy = b.vy;
  // Damped harmonic spring for jelly squash & camera landing dip
  state.squashVel += (-95 * state.squash - 11 * state.squashVel) * dt;
  state.squash = Math.max(-0.85, Math.min(0.85, state.squash + state.squashVel * dt));
  state.camSpringVy += (-48 * state.camSpringY - 8.5 * state.camSpringVy) * dt;
  state.camSpringY = Math.max(-1.6, Math.min(1.4, state.camSpringY + state.camSpringVy * dt));

  // Adorable frantic paw cycling (AnimationMixer if rigged GLB, or Per-Limb Vertex Shader Running for static Hunyuan GLBs!)
  const spdNorm = Math.min(1.25, spd / 11.5);
  b.pawCycle += (3.0 + spd * 2.8) * dt;
  sfx.updateSpeed(Math.min(1, spd / 16));
  if (kittyRig.mixer) {
    kittyRig.mixer.update(dt * (0.4 + spd * 0.25));
  } else if (kittyRig.isExternal && kittyRig.isExternal()) {
    const u = kittyRig.animUniforms;
    if (u) {
      u.uPhase.value = b.pawCycle;
      u.uSpeed.value = Math.min(1.15, spd / 8.5);
      u.uTurn.value = state.turnSmooth;
      u.uSquash.value = state.squash + (b.boostFlash > 0 ? 0.18 : 0);
      u.uTime.value = state.elapsed;
    }
    const hop = Math.abs(Math.sin(b.pawCycle * 0.85));
    kittyRig.kitty.position.y = hop * Math.min(0.12, 0.015 + spd * 0.012);
    // Forward lean into sprint + lateral banking into turns!
    kittyRig.kitty.rotation.x = Math.min(0.28, spd * 0.022) + Math.sin(b.pawCycle * 1.7) * Math.min(0.08, spd * 0.008);
    kittyRig.kitty.scale.set(1, 1, 1);
  } else {
    kittyRig.paws.forEach((p, i) => {
      const phase = b.pawCycle + (i % 2 === 0 ? 0 : Math.PI);
      p.mesh.position.y = p.baseY + Math.max(0, Math.sin(phase)) * 0.075;
      p.mesh.position.z = p.baseZ + Math.cos(phase) * 0.08;
    });
    kittyRig.tail.rotation.z = Math.sin(state.elapsed * 9) * 0.35;
  }

  // Dizzy Halo or Dynamic Turn Banking!
  kittyRig.dizzyHalo.visible = b.dizzyTimer > 0 && b.popTimer <= 0;
  if (kittyRig.dizzyHalo.visible) {
    kittyRig.dizzyHalo.rotation.y += 5.5 * dt;
    kittyRig.kitty.rotation.z = Math.sin(state.elapsed * 16) * 0.25;
  } else {
    kittyRig.kitty.rotation.z = -state.turnSmooth * Math.min(0.32, 0.08 + spd * 0.02);
  }

  // Ground Contact Shadow
  const surf = sampleTrackSurface(b.x, b.y, b.z, b.r);
  if (surf && b.popTimer <= 0) {
    kittyRig.shadow.visible = true;
    kittyRig.shadow.position.set(b.x, surf.y + 0.03, b.z);
    const hDiff = Math.max(0, b.y - b.r - surf.y);
    const sc = Math.max(0.35, 1 - hDiff * 0.14);
    kittyRig.shadow.scale.setScalar(sc);
  } else {
    kittyRig.shadow.visible = false;
  }

  // Animate Stars, Mushrooms, Portal & Clouds
  for (const st of dynamicMeshes.stars) {
    if (!st.collected) {
      st.mesh.rotation.y += 2.6 * dt;
      st.mesh.position.y = st.def.y + Math.sin(state.elapsed * 4 + st.def.x) * 0.16;
    }
  }
  for (const m of dynamicMeshes.mushrooms) {
    if (m.bounceAnim > 0) {
      m.bounceAnim = Math.max(0, m.bounceAnim - dt * 4);
      const s = 1 + Math.sin(m.bounceAnim * Math.PI) * 0.35;
      m.mesh.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    }
  }
  if (dynamicMeshes.portal) dynamicMeshes.portal.rotation.z += 2.0 * dt;
  for (const bs of dynamicMeshes.boosts) {
    if (bs.tex) bs.tex.offset.y -= dt * 1.8;
  }
  for (const fl of dynamicMeshes.floaters || []) {
    fl.mesh.position.y = fl.baseY + Math.sin(state.elapsed * 0.8 + fl.seed) * 0.45;
  }
  for (const cl of dynamicMeshes.clouds) {
    cl.mesh.position.x = cl.baseX + Math.sin(state.elapsed * 0.3 + cl.seed) * 1.4;
  }
  if (dynamicMeshes.petals) {
    dynamicMeshes.petals.rotation.y = Math.sin(state.elapsed * 0.15) * 0.08;
    dynamicMeshes.petals.position.y = Math.sin(state.elapsed * 0.9) * 0.45;
  }
  // Keep sunlight shadow frustum centered around the rolling kitty ball!
  sunLight.position.set(b.x + 16, b.y + 26, b.z + 14);
  sunLight.target.position.set(b.x, b.y, b.z - 6);

  // Wide Tapered Pastel Rainbow Ribbon Trail — anchored strictly BEHIND the ball's outer edge (zero clipping!)
  const dirX = spd > 0.25 ? b.vx / spd : -Math.sin(b.facing);
  const dirZ = spd > 0.25 ? b.vz / spd : -Math.cos(b.facing);
  const tailOrigin = new THREE.Vector3(
    b.x - dirX * (b.r + 0.16),
    b.y - b.r * 0.48,
    b.z - dirZ * (b.r + 0.16)
  );
  trailPoints.unshift(tailOrigin);
  if (trailPoints.length > 24) trailPoints.pop();
  trailMesh.visible = spd > 1.2 && b.popTimer <= 0;
  const attr = trailMesh.geometry.attributes.position;
  for (let i = 0; i < 24; i++) {
    const pt = trailPoints[Math.min(i, trailPoints.length - 1)] || tailOrigin;
    const nextPt = trailPoints[Math.min(i + 1, trailPoints.length - 1)] || pt;
    const dx = pt.x - nextPt.x;
    const dz = pt.z - nextPt.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len;
    const pz = dx / len;
    const halfW = (1 - i / 23) * Math.min(0.38, 0.1 + spd * 0.025);
    attr.setXYZ(i * 2, pt.x - px * halfW, pt.y, pt.z - pz * halfW);
    attr.setXYZ(i * 2 + 1, pt.x + px * halfW, pt.y, pt.z + pz * halfW);
  }
  attr.needsUpdate = true;

  // Dynamic Hamsterball Camera — vertical undulation on slopes/jumps, velocity look-ahead, landing spring dip & corner banking!
  const isPortrait = window.innerHeight > window.innerWidth * 1.05;
  const distScale = isPortrait ? 1.22 : 1.0;
  const slopeZ = surf ? surf.slopeZ : 0;
  const airHeight = !b.grounded ? Math.max(0, b.y - (surf ? surf.y : b.y - 2.2)) : 0;
  const speedPull = Math.min(2.4, spdNorm * 2.1);
  // Downhill (slopeZ < 0) lifts camera to reveal drop ahead; uphill lowers slightly for dramatic climb; airborne lifts dynamically!
  const dynHeight = (8.8 - slopeZ * 4.2 + airHeight * 0.65 + speedPull * 0.55) * distScale + state.camSpringY;
  const dynBack = (10.2 + speedPull * 1.15 + airHeight * 0.45) * distScale;
  const dynSide = (6.4 + Math.max(-2.6, Math.min(2.6, -b.vx * 0.22))) * distScale;

  const desired = new THREE.Vector3(
    b.x + dynSide,
    Math.max(b.y + dynHeight, 3.6),
    b.z + dynBack
  );
  state.camPos.lerp(desired, Math.min(1, dt * 5.2));
  camera.position.copy(state.camPos);

  // Velocity Look-Ahead focus so the camera breathes & previews upcoming turns/drops!
  const lookTarget = new THREE.Vector3(
    b.x + Math.max(-3.2, Math.min(3.2, b.vx * 0.26)),
    b.y - 0.35 + Math.max(-1.6, Math.min(1.6, b.vy * 0.12)) + state.camSpringY * 0.35,
    b.z - 1.9 + Math.max(-3.6, Math.min(2.2, b.vz * 0.26))
  );
  state.camLook.lerp(lookTarget, Math.min(1, dt * 7.5));
  camera.lookAt(state.camLook);

  // Dynamic FOV widening on sprint & jumps + subtle playful roll on turns!
  const baseFov = isPortrait ? 53 : 42;
  const targetFov = baseFov + Math.min(8.5, spdNorm * 6.2 + airHeight * 1.2 + (b.boostFlash > 0 ? 3.5 : 0));
  state.camFov += (targetFov - state.camFov) * Math.min(1, dt * 5.0);
  if (Math.abs(camera.fov - state.camFov) > 0.05) {
    camera.fov = state.camFov;
    camera.updateProjectionMatrix();
  }
  const targetRoll = Math.max(-0.045, Math.min(0.045, -b.vx * 0.0032));
  state.camRoll += (targetRoll - state.camRoll) * Math.min(1, dt * 5.5);
  camera.rotation.z += state.camRoll;
}

function syncHud() {
  const b = state.ball;
  const tEl = document.getElementById("hud-time");
  const tBox = document.getElementById("timer-box");
  tEl.textContent = state.timeLeft.toFixed(1);
  tBox.classList.toggle("urgent", state.timeLeft <= 10);
  document.getElementById("hud-stars").textContent = `⭐ ${state.stars}`;
  const kmh = Math.round(Math.hypot(b.vx, b.vz) * 5.2);
  document.getElementById("hud-speed").textContent = `${kmh} km/h`;
  document.getElementById("hud-status").textContent =
    b.popTimer > 0 ? "💥 破球复活中…"
      : b.dizzyTimer > 0 ? "💫 摔晕冒金星！"
        : b.surfaceKind === "ice" || b.surfaceKind === "ice_ramp" ? "❄️ 冰面极限漂移！"
          : b.boostFlash > 0 ? "🌈 彩虹加速狂飙！"
            : "🐾 全速滚动中";
}

// ===== AUTHENTIC HAMSTERBALL CONTROLS (Pointer Lock Mouse + WASD + Mobile Touch Swipe!) =====
canvas.addEventListener("click", () => {
  if (state && state.phase === "playing" && canvas.requestPointerLock) {
    canvas.requestPointerLock();
  }
});
window.addEventListener("mousemove", (e) => {
  if (!state || state.phase !== "playing") return;
  if (document.pointerLockElement === canvas) {
    state.input.mouseAccX = Math.max(-28, Math.min(28, state.input.mouseAccX + e.movementX * 0.42 * save.mouseSens));
    state.input.mouseAccZ = Math.max(-28, Math.min(28, state.input.mouseAccZ + e.movementY * 0.42 * save.mouseSens));
  }
});
canvas.addEventListener("pointerdown", (e) => {
  if (!state || state.phase !== "playing") return;
  sfx.unlock();
  if (e.pointerType !== "mouse") {
    state.input.touchActive = true;
    state.input.lx = e.clientX;
    state.input.ly = e.clientY;
  }
});
window.addEventListener("pointermove", (e) => {
  if (!state || state.phase !== "playing" || !state.input.touchActive) return;
  const dx = e.clientX - state.input.lx;
  const dy = e.clientY - state.input.ly;
  state.input.lx = e.clientX;
  state.input.ly = e.clientY;
  state.input.mouseAccX = Math.max(-26, Math.min(26, state.input.mouseAccX + dx * 0.65));
  state.input.mouseAccZ = Math.max(-26, Math.min(26, state.input.mouseAccZ + dy * 0.65));
});
window.addEventListener("pointerup", () => {
  if (state) state.input.touchActive = false;
});
function openPause() {
  if (!state || state.phase !== "playing") return;
  state.phase = "paused";
  sfx.setPaused(true);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  document.getElementById("sens-slider").value = String(save.mouseSens || 1.0);
  document.getElementById("sens-val").textContent = `${(save.mouseSens || 1.0).toFixed(1)}×`;
  pauseScreen.hidden = false;
}
function closePause() {
  if (!state || state.phase !== "paused") return;
  pauseScreen.hidden = true;
  state.phase = "playing";
  sfx.setPaused(false);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (state?.phase === "playing") openPause();
    else if (state?.phase === "paused") closePause();
    return;
  }
  if (state && state.phase === "playing") state.input.keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  if (state) state.input.keys.delete(e.code);
});

// Buttons & Hub Tabs
document.querySelectorAll(".htab").forEach((b) => {
  b.onclick = () => {
    currentHubTab = b.dataset.tab;
    renderLobby();
  };
});
document.getElementById("btn-tourney").onclick = () => loadTrack(0, "tourney", 0);
document.getElementById("btn-practice").onclick = () => loadTrack(selectedPracticeTrack, "practice", 0);
document.getElementById("btn-cat-go").onclick = () => loadTrack(selectedPracticeTrack, "practice", 0);
document.getElementById("btn-res-share").onclick = async () => {
  if (!lastResultCtx) return;
  showToast("📸 正在生成高清通关战报海报…");
  const hadShareCat = isCatUnlocked(CATS.find((c) => c.id === "starbell_dream"));
  lastPoster = await generateClearPoster({ glCanvas: canvas, ...lastResultCtx });
  document.getElementById("poster-img").src = lastPoster.dataUrl;
  posterModal.hidden = false;
  save.sharedCount = (save.sharedCount || 0) + 1;
  writeSave(save);
  if (!hadShareCat) {
    showToast("🦋 首次生成海报！已解锁限定 SR【幻梦星铃猫】！");
  }
};
document.getElementById("btn-poster-share").onclick = async () => {
  if (!lastPoster) return;
  const shareText = `我在《魔女猫球》冲过了${lastResultCtx?.track?.name || "魔法赛道"}，评级 ${lastPoster.grade}！来试试手机陀螺仪推球！`;
  try {
    if (navigator.share && lastPoster.file && navigator.canShare && navigator.canShare({ files: [lastPoster.file] })) {
      await navigator.share({ title: "魔女猫球 · 通关战报", text: shareText, files: [lastPoster.file] });
      showToast("✅ 已调起系统分享！");
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: "魔女猫球 · 通关战报", text: shareText, url: location.href });
      showToast("✅ 已调起系统分享！");
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  // Fallback: trigger PNG download
  document.getElementById("btn-poster-save").click();
};
document.getElementById("btn-poster-save").onclick = () => {
  if (!lastPoster) return;
  const a = document.createElement("a");
  a.href = lastPoster.dataUrl;
  a.download = `meowball-${lastResultCtx?.track?.id || "clear"}-${lastPoster.grade}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast("💾 高清战报海报已保存！");
};
document.getElementById("btn-poster-close").onclick = () => {
  posterModal.hidden = true;
};
document.getElementById("btn-pause").onclick = openPause;
document.getElementById("btn-resume").onclick = closePause;
document.getElementById("btn-restart-stage").onclick = () => {
  pauseScreen.hidden = true;
  if (state) loadTrack(state.trackIndex, state.mode, 0);
};
document.getElementById("btn-pause-gyro").onclick = toggleGyro;
document.getElementById("btn-lobby-gyro").onclick = toggleGyro;
document.getElementById("btn-hud-gyro").onclick = toggleGyro;
document.getElementById("sens-slider").oninput = (e) => {
  save.mouseSens = parseFloat(e.target.value) || 1.0;
  document.getElementById("sens-val").textContent = `${save.mouseSens.toFixed(1)}×`;
  writeSave(save);
};
document.getElementById("btn-pause-lobby").onclick = () => {
  if (state) state.phase = "ended";
  sfx.stopBgm();
  pauseScreen.hidden = true;
  hudEl.hidden = true;
  resultScreen.hidden = true;
  lobbyScreen.hidden = false;
  renderLobby();
};
document.getElementById("btn-res-lobby").onclick = () => {
  resultScreen.hidden = true;
  lobbyScreen.hidden = false;
  renderLobby();
};
document.getElementById("btn-mute").onclick = (e) => {
  sfx.setMuted(!sfx.muted);
  e.target.textContent = sfx.muted ? "🔇" : "🔊";
};

// Boot with Track 0 preview rendered live behind Lobby (clear low-fog sky)!
const initBuilt = buildTrackScene(TRACKS[0]);
trackRoot = initBuilt.group;
scene.background = new THREE.Color(TRACKS[0].skyTop);
scene.fog = new THREE.Fog(TRACKS[0].fogColor, 64, 185);
scene.add(trackRoot);
renderLobby();
requestAnimationFrame(tick);
