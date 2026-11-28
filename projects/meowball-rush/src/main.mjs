// Meowball Rush v4.1.0 — four chute styles, curved dry lines and dense storybook borders.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CATS, TRACKS, migrateV3Save } from "./config.mjs";
import { sfx } from "./audio.mjs";
import { buildTrackScene, createKittyBall, createRainbowRibbon, getSideWallOpenings, getEndWallOpenings, animateFairytaleScenery, activateCheckpoint } from "./cel-builder.mjs";
import { createDirector, updateDirector, cameraRelativeInput, triggerSetpiece, CAMERA_MODES } from './director.mjs';
import { createCameraOcclusion } from './camera-occlusion.mjs';
import { createCameraSightline } from './camera-sightline.mjs';
import { findChuteEntry, captureChute, advanceChute, launchBall, advanceLaunch, updateFairytalePhysics, collideFairytaleCritters, integrateRollingMotion, resolveRollingLanding, resolveHorizontalGuardrail, collideRouteGuardrails, updateSpikePhysics, reconcileBouncyBodies, sampleRollingRouteSurface, isSurfaceInContactWindow, resolveSphereFloorContact } from './course-runtime.mjs';
import { advancePortal, updatePortalPhysics, dampPortalSteering } from './portal-runtime.mjs';
import { applyTimePenalty } from './time-runtime.mjs';
import { animateSpikeTraps } from './spike-traps.mjs';
import { disposeCourseSceneResources } from './v3-worlds.mjs';
import { generateClearPoster } from "./poster.mjs";
import { FALL_MESSAGES, findFallZone, beginFallRecovery, advanceFallRecovery } from './fall-feedback.mjs';
import { createFallEffect, updateFallEffects } from './fall-effects.mjs';
import { resetBallToCheckpoint } from './checkpoint-runtime.mjs';
import { createMagicBurst, updateMagicBursts } from './magic-effects.mjs';
import { GLB_MODELS } from "./models/manifest.mjs";
import coverUrl from "./assets/cover.webp";

const gltfLoader = new GLTFLoader();
const loadedGlbCache = {};
const pendingGlbLoads = new Map();
function loadGlbModel(key, onReady) {
  const url = GLB_MODELS[key];
  if (!url) return;
  if (loadedGlbCache[key]) {
    onReady(SkeletonUtils.clone(loadedGlbCache[key].scene), loadedGlbCache[key].animations);
    cameraOcclusion?.refresh();
    cameraSightline?.refresh();
    return;
  }
  if (pendingGlbLoads.has(key)) {
    pendingGlbLoads.get(key).push(onReady);
    return;
  }
  pendingGlbLoads.set(key, [onReady]);
  gltfLoader.load(url, (gltf) => {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    // Normalize a parent so authored model transforms remain intact.
    const normalized = new THREE.Group();
    normalized.add(root);
    normalized.scale.setScalar(1 / maxDim);
    normalized.position.copy(center).multiplyScalar(-1 / maxDim);
    const wrapper = new THREE.Group();
    wrapper.add(normalized);
    loadedGlbCache[key] = { scene: wrapper, animations: gltf.animations || [] };
    const callbacks = pendingGlbLoads.get(key);
    pendingGlbLoads.delete(key);
    for (const ready of callbacks) ready(SkeletonUtils.clone(wrapper), gltf.animations || []);
    cameraOcclusion?.refresh();
    cameraSightline?.refresh();
  }, undefined, (error) => {
    pendingGlbLoads.delete(key);
    console.warn(`Unable to load GLB model: ${key}`, error);
  });
}

const SAVE_KEY = "meowball_rush_save_v1";
function loadSave() {
  try {
    return migrateV3Save(JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"));
  } catch {
    return migrateV3Save();
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
const starPopEl = document.getElementById("star-pop");
let previewCatId = save.selectedCat;
let lastPoster = null;
let lastResultCtx = null;
let lobbyShowcaseRig = null;
let lobbyShowcaseCatId = null;

// Start warm Lobby BGM on first user gesture anywhere in the lobby!
window.addEventListener("pointerdown", () => {
  if (!lobbyScreen.hidden && sfx.activeMode === "none") {
    sfx.playLobbyBgm();
  }
}, { passive: true });

let starPopTimer = null;
function showStarPop(msg) {
  if (!starPopEl) return;
  starPopEl.textContent = msg;
  starPopEl.classList.remove("show");
  void starPopEl.offsetWidth;
  starPopEl.classList.add("show");
  clearTimeout(starPopTimer);
  starPopTimer = setTimeout(() => starPopEl.classList.remove("show"), 950);
}

let toastTimer = null;
let penaltyFlashTimer = null;
function showTimePenalty(seconds) {
  const layer = document.getElementById('time-penalties');
  const timer = document.getElementById('timer-box');
  const popup = document.createElement('span');
  popup.className = 'time-penalty';
  popup.textContent = `−${seconds}s!`;
  layer.appendChild(popup);
  popup.addEventListener('animationend', () => popup.remove(), {once:true});
  timer.classList.remove('penalty-flash');
  void timer.offsetWidth;
  timer.classList.add('penalty-flash');
  clearTimeout(penaltyFlashTimer);
  penaltyFlashTimer = setTimeout(() => timer.classList.remove('penalty-flash'), 550);
}

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
let cameraOcclusion = null;
let cameraSightline = null;
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
  if (idx === 0 || TRACKS[idx]?.unlockedByDefault) return true;
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

function attachCatAnimations(targetRig, model, animations, initialClip = "Idle") {
  if (!animations || animations.length === 0) return;
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of animations) {
    actions[clip.name] = mixer.clipAction(clip);
  }
  const fallback = actions.Run || actions.Idle || mixer.clipAction(animations[0]);
  let active = actions[initialClip] || fallback;
  active.play();
  targetRig.mixer = mixer;
  targetRig.animActions = actions;
  targetRig.activeAnimName = active.getClip().name;
  targetRig.setAnim = (name, fadeSec = 0.22) => {
    const next = actions[name] || fallback;
    if (!next || next === active) return;
    next.reset().setEffectiveWeight(1).play();
    active.crossFadeTo(next, fadeSec, false);
    active = next;
    targetRig.activeAnimName = next.getClip().name;
  };
}

function syncLobbyShowcase(cat) {
  if (!cat) return;
  if (lobbyShowcaseRig && lobbyShowcaseCatId === cat.id) {
    lobbyShowcaseRig.root.visible = !lobbyScreen.hidden;
    return;
  }
  if (lobbyShowcaseRig) {
    scene.remove(lobbyShowcaseRig.root);
    lobbyShowcaseRig = null;
  }
  lobbyShowcaseCatId = cat.id;
  lobbyShowcaseRig = createKittyBall(cat);
  lobbyShowcaseRig.root.position.set(0, 9.8, 0);
  lobbyShowcaseRig.root.scale.setScalar(1.45);
  lobbyShowcaseRig.root.visible = !lobbyScreen.hidden;
  scene.add(lobbyShowcaseRig.root);
  const glbKey = cat.glbKey || "cat-witch";
  const targetRig = lobbyShowcaseRig;
  loadGlbModel(glbKey, (model, animations) => {
    if (lobbyShowcaseRig !== targetRig) return;
    targetRig.mountExternalModel(model, 0.74);
    attachCatAnimations(targetRig, model, animations, "Idle");
  });
}

function renderLobby() {
  document.getElementById("lobby-stars").textContent = `⭐ ${save.totalStars}`;
  document.getElementById("lobby-best").textContent = save.bestTourneyTime > 0 ? `🏆 ${save.bestTourneyTime.toFixed(1)}s` : "🏆 --";
  updateGyroUI();
  const shownCatFor3D = CATS.find((c) => c.id === previewCatId) || getSelectedCat();
  syncLobbyShowcase(shownCatFor3D);

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
    const d = t.diff || Math.min(5, Math.ceil((idx + 1) / 2));
    const diffStars = "★".repeat(d) + "☆".repeat(5 - d);
    const bestT = save.bestTrackTimes?.[t.id];
    const card = document.createElement("button");
    card.className = `tcard ${selectedPracticeTrack === idx ? "active" : ""} ${unlocked ? "" : "locked"}`;
    card.innerHTML = `
      <div>
        <div class="tcard-title">${unlocked ? t.name : `🔒 ${t.name}`}</div>
        <div class="tcard-sub">${unlocked ? `${t.subtitle} · ${Math.round(t.length)}m` : `通关第 ${idx} 关后自动解锁！`}</div>
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
function mountTrackModels(built) {
  const meshes = built.dynamicMeshes;
  const isCurrentTrack = () => trackRoot === built.group;

  if (meshes.treeSlots.length > 0) {
    loadGlbModel("tree", (treeProto) => {
      if (!isCurrentTrack()) return;
      for (const slot of meshes.treeSlots) {
        slot.anchor.clear();
        const tree = treeProto.clone(true);
        tree.scale.setScalar(slot.scale);
        tree.position.y = slot.scale * 0.48;
        tree.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        slot.anchor.add(tree);
      }
    });
  }
  if (meshes.portalAnchor && !built.group.userData.v3World) {
    loadGlbModel("portal", (portalModel) => {
      if (!isCurrentTrack()) return;
      meshes.portalAnchor.clear();
      portalModel.scale.setScalar(4.4);
      portalModel.position.y = 2.15;
      portalModel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      meshes.portalAnchor.add(portalModel);
    });
  }

  for (const key of ["banner-red", "fence", "fountain-center", "hazard-seesaw"]) {
    const slots = (meshes.propSlots || []).filter((slot) => slot.key === key);
    if (!slots.length) continue;
    loadGlbModel(key, (prototype) => {
      if (!isCurrentTrack()) return;
      for (const slot of slots) {
        const model = prototype.clone(true);
        model.scale.setScalar(slot.scale);
        model.rotation.y = slot.rotation || 0;
        // Measure before parenting: the anchor is already at slot.y. Ground the
        // fully transformed model at local y=0, including asymmetric GLB bounds.
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        if (slot.maxFootprint) {
          const size = box.getSize(new THREE.Vector3());
          const fit = Math.min(1, slot.maxFootprint.x / (size.x || 1), slot.maxFootprint.z / (size.z || 1));
          model.scale.multiplyScalar(fit);
          model.updateMatrixWorld(true);
          box.setFromObject(model);
        }
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        slot.anchor.clear();
        slot.anchor.add(model);
        if (slot.fallback) slot.fallback.visible = false;
      }
    });
  }

  // Anchors belong to the animated parts, so imported art and primitive
  // fallbacks share the same motion and collision volume.
  function mountHazards(key, slots, fit) {
    if (!slots.length) return;
    loadGlbModel(key, (prototype) => {
      if (!isCurrentTrack()) return;
      for (const slot of slots) {
        const model = prototype.clone(true);
        model.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        fit(model, size, slot.def);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const grounded = key === "hazard-bumper" || key === "hazard-vent";
        model.position.set(-center.x, grounded ? -box.min.y : -center.y, -center.z);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        slot.modelAnchor.clear();
        slot.modelAnchor.add(model);
        slot.fallback.visible = false;
      }
    });
  }
  mountHazards("hazard-rolling-pin", meshes.rollingPins || [], (model, size, def) => {
    // This authored asset includes long handles: width describes the barrel,
    // matching the primitive, not the full end-to-end decorative span.
    const barrel = model.getObjectByName("Cylinder");
    const barrelWidth = barrel ? new THREE.Box3().setFromObject(barrel).getSize(new THREE.Vector3()).x : size.x;
    model.scale.set(def.width / barrelWidth, 0.96 / size.y, 0.96 / size.z);
  });
  mountHazards("hazard-flail", meshes.hammers.filter(hm => hm.def.variant === "flail")
    .map(hm => ({ ...hm, fallback: hm.headFallback })), (model, size) => {
    model.scale.setScalar(1.84 / Math.max(size.x, size.y, size.z));
  });
  for (const [key, slots] of [["hazard-bumper", meshes.bumpers], ["hazard-vent", meshes.steamVents]]) {
    mountHazards(key, (slots || []).filter(slot => key !== 'hazard-bumper' || !slot.def.variant), (model, size, def) => {
      model.scale.setScalar(2 * def.r / Math.max(size.x, size.z));
    });
  }
}

function loadTrack(trackIndex, mode = "tourney", carryTime = 0) {
  const track = TRACKS[trackIndex];
  const cat = getSelectedCat();

  if (state?.fallEffects) updateFallEffects(state.fallEffects, 2);
  if (state?.magicBursts) updateMagicBursts(state.magicBursts, 2);
  cameraOcclusion?.dispose();
  cameraSightline?.reset();
  disposeCourseSceneResources(dynamicMeshes);
  if (trackRoot) scene.remove(trackRoot);
  if (lobbyShowcaseRig) lobbyShowcaseRig.root.visible = false;
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
  cameraOcclusion = createCameraOcclusion(trackRoot);
  cameraSightline = createCameraSightline(trackRoot);

  mountTrackModels(built);

  kittyRig = createKittyBall(cat);
  scene.add(kittyRig.root);
  scene.add(kittyRig.shadow);
  // Auto-mount external AI-generated 3D .glb kitten + automatic AnimationMixer for rigged GLBs!
  const glbKey = cat.glbKey || (cat.id === "ginger_scarf" ? "cat-ginger" : "cat-witch");
  const targetRig = kittyRig;
  loadGlbModel(glbKey, (model, animations) => {
    if (kittyRig !== targetRig) return;
    targetRig.mountExternalModel(model, 0.72);
    attachCatAnimations(targetRig, model, animations, "Idle");
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
    checkpoint: { x: track.start.x, y: track.start.y - 0.62, z: track.start.z },
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
      supportPlatform: null,
      surfaceKind: "grass",
      dizzyTimer: 0,
      popTimer: 0,
      hammerHitCd: 0,
      rollingPinHitCd: 0,
      bumperHitCd: 0,
      facing: 0,
      pawCycle: 0,
      boostFlash: 0,
    },
    input: { ix: 0, iz: 0, mouseAccX: 0, mouseAccZ: 0, keys: new Set(), touchActive: false, lx: 0, ly: 0 },
    director: createDirector(track.startYaw || 0),
    shownTips: new Set(),
    fallEffects: [],
    magicBursts: [],
    activeAct: 0,
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
  document.getElementById('time-penalties').replaceChildren();
  lobbyScreen.hidden = true;
  resultScreen.hidden = true;
  hudEl.hidden = false;
  sfx.startBgm(trackIndex);
  showToast(`🏁 ${track.name} · 第一幕：${track.acts?.[0]?.name || '出发！'}`);
}

// ===== DETERMINISTIC 3D SURFACE QUERY (Platforms, Ramps & Rotating Gears!) =====
function showFairytaleEvent(event) {
  const { prop, type } = event;
  const entry = (dynamicMeshes.fairytaleProps || []).find(p => p.def === prop);
  if (entry) entry.pulse = 1;
  if (type === 'spike_warning') {
    sfx.playSpikeWarning();
  } else if (type === 'spike') {
    createMagicBurst(trackRoot, state.magicBursts ||= [], event.position, 0xffc564);
    sfx.playSpikeHit();
    deductStageTime(5, 'spikes');
  } else if (type === 'launch') {
    if (state.director) triggerSetpiece(state.director, prop.type === 'toaster' ? 1.5 : 1.2);
    sfx.playBoing();
    showToast(prop.type === 'toaster' ? '🍞 吐司弹射！越过水槽！' : prop.type === 'steam_vent' ? '🌪️ 乘蒸汽龙卷风返回草莓蛋糕塔！' : prop.type === 'willow_branch' ? '🌿 柳枝轻轻托起你！' : '☁️ 云朵打喷嚏，乘风起飞！');
  } else if (type === 'helper') {
    sfx.playBoost();
    showStarPop(prop.type === 'hedgehog' ? '♡ 刺猬伙伴为你加油！' : '✦ 发条小鼠来帮忙！');
  } else if (type === 'book_hop') {
    sfx.playBoing();
    showStarPop('📖 魔法书振翅，轻轻跃向下一页！');
  } else if (type === 'patrol' || type === 'bounce') {
    sfx.playBoing();
    const at = event.position || entry?.mesh.position || prop;
    createMagicBurst(trackRoot, state.magicBursts ||= [], at, 0xc7eeff);
    showStarPop('✦ 小伙伴弹弹碰！');
  }
}

function platformHeight(p, time = state.elapsed) {
  if (p.kind !== "elevator") return p.y;
  return (p.yMin + p.yMax) * 0.5
    + Math.sin(time * p.speed + (p.phase || 0)) * (p.yMax - p.yMin) * 0.5;
}

function platformFloor(p, x, z, time = state.elapsed) {
  let y = platformHeight(p, time);
  let slopeX = 0;
  let slopeZ = 0;
  if (p.kind === "trough") {
    const hw = p.w * 0.5;
    const dx = Math.max(-hw, Math.min(hw, x - p.x));
    y += 0.6 * (dx / hw) ** 2;
    slopeX = 1.2 * dx / (hw * hw);
  } else if (p.kind === "ramp" || p.kind === "ice_ramp") {
    if (p.dir === "-z") {
      const t = Math.max(0, Math.min(1, (p.z + p.d * 0.5 - z) / p.d));
      y = p.yStart + (p.yEnd - p.yStart) * t;
      slopeZ = -(p.yEnd - p.yStart) / p.d;
    } else if (p.dir === "+x") {
      const t = Math.max(0, Math.min(1, (x - p.x + p.w * 0.5) / p.w));
      y = p.yStart + (p.yEnd - p.yStart) * t;
      slopeX = (p.yEnd - p.yStart) / p.w;
    }
  }
  return { y, slopeX, slopeZ };
}

function clampHorizontalSpeed(b, limit) {
  const speed = Math.hypot(b.vx, b.vz);
  if (speed > limit) {
    b.vx *= limit / speed;
    b.vz *= limit / speed;
  }
}

function collideSideRails(b, previousX, previousZ) {
  let contacted = collideRouteGuardrails(b, b.supportRoute, previousX, previousZ);
  for (const p of state.track.platforms) {
    if (!p.walls && p.kind !== "trough") continue;
    const floor = platformFloor(p, b.x, b.z).y;
    const wallTop = platformHeight(p) + (p.kind === "trough" ? 1.35 : 0.55);
    if (b.y + b.r < floor - (p.h || 0.6) || (b.y - b.r > wallTop && b.supportPlatform !== p)) continue;
    // Ends stay open; retain the previous position so a fast bank cannot tunnel through a rail.
    if (Math.abs(b.z - p.z) > p.d * 0.5 || Math.abs(previousZ - p.z) > p.d * 0.5 + b.r) continue;
    const limit = p.w * 0.5 - b.r;
    for (const side of [-1, 1]) {
      if (p.kind !== "trough" && getSideWallOpenings(p, state.track.platforms, side)
        .some(([lo, hi]) => b.z > lo + b.r && b.z < hi - b.r)) continue;
      const lateral = (b.x - p.x) * side;
      const previousLateral = (previousX - p.x) * side;
      if (lateral > limit && (previousLateral <= p.w * 0.5 || b.supportPlatform === p)) {
        contacted = resolveHorizontalGuardrail(b, side, 0, lateral - limit) || contacted;
      } else if (lateral < p.w * 0.5 + b.r && previousLateral >= p.w * 0.5 + b.r) {
        contacted = resolveHorizontalGuardrail(b, -side, 0, p.w * 0.5 + b.r - lateral) || contacted;
      }
    }
  }
  // Crystal plazas keep pinball ricochets inside their Z ends too. Narrow
  // doorways preserve the route to the next bridge, gear or elevator.
  for (const p of state.track.platforms) {
    if (!p.endWalls) continue;
    const floor = platformFloor(p, b.x, b.z).y;
    if (b.y + b.r < floor - (p.h || 0.6) || (b.y - b.r > platformHeight(p) + 0.55 && b.supportPlatform !== p)) continue;
    if (Math.abs(b.x - p.x) > p.w * 0.5 || Math.abs(previousX - p.x) > p.w * 0.5 + b.r) continue;
    const limit = p.d * 0.5 - b.r;
    for (const side of [-1, 1]) {
      if (getEndWallOpenings(p, state.track.platforms, side, state.track.gears)
        .some(([lo, hi]) => b.x > lo + b.r && b.x < hi - b.r)) continue;
      const lateral = (b.z - p.z) * side;
      const previousLateral = (previousZ - p.z) * side;
      if (lateral > limit && (previousLateral <= p.d * 0.5 || b.supportPlatform === p)) {
        contacted = resolveHorizontalGuardrail(b, 0, side, lateral - limit) || contacted;
      } else if (lateral < p.d * 0.5 + b.r && previousLateral >= p.d * 0.5 + b.r) {
        contacted = resolveHorizontalGuardrail(b, 0, -side, p.d * 0.5 + b.r - lateral) || contacted;
      }
    }
  }
  if (contacted && b.grounded) {
    const floor = sampleTrackSurface(b.x, b.y, b.z, b.r);
    if (floor && ((b.supportRoute && floor.route === b.supportRoute)
      || (b.supportPlatform && floor.platform === b.supportPlatform))) {
      // XZ projection changes bank height and tangent velocity. Follow the deck
      // as continued rolling contact, never as a new landing or a rail-top step.
      b.y = floor.y + b.r;
      b.vy = floor.slopeX * b.vx + floor.slopeZ * b.vz;
      b.rollSlopeX = floor.slopeX; b.rollSlopeZ = floor.slopeZ;
    }
  }
}

function sampleTrackSurface(x, y, z, r) {
  const tr = state.track;
  let bestY = -999;
  let bestSurf = null;

  const queryBall = { ...state.ball, x, y, z, r };
  const routeFloor = sampleRollingRouteSurface(tr.routes || [], queryBall);
  if (routeFloor) {
    bestY = routeFloor.y;
    bestSurf = { ...routeFloor, secret: routeFloor.route.secret, gearVx: 0, gearVz: 0 };
  }

  for (const p of tr.platforms) {
    const hw = p.w * 0.5 + r * 0.35;
    const hd = p.d * 0.5 + r * 0.35;
    if (Math.abs(x - p.x) > hw || Math.abs(z - p.z) > hd) continue;

    const { y: surfY, slopeX, slopeZ } = platformFloor(p, x, z);
    if (!isSurfaceInContactWindow(queryBall, surfY)) continue;
    // Only snap to surface if ball bottom is descending onto it or within tiny smooth bevel (<= 0.14m).
    // Taller 90-degree vertical steps are handled by true rigid-body momentum & radius climbing physics!
    const followingFloor = state.ball.grounded && state.ball.supportPlatform === p;
    const crossedFloor = state.ball.previousBottom >= surfY - 0.02 && y - r <= surfY;
    if (y - r <= surfY + 0.55 && (y - r >= surfY - 0.14 || followingFloor || crossedFloor) && surfY > bestY) {
      bestY = surfY;
      bestSurf = { y: surfY, kind: p.kind, platform: p, slopeX, slopeZ, secret: p.secret, gearVx: 0, gearVz: 0 };
    }
  }

  for (const g of tr.gears) {
    if (!isSurfaceInContactWindow(queryBall, g.y)) continue;
    const dx = x - g.x;
    const dz = z - g.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= g.r + r * 0.35 && y - r <= g.y + 0.55
      && (y - r >= g.y - 0.14 || state.ball.previousBottom >= g.y - 0.02) && g.y > bestY) {
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
  deductStageTime(8, 'fall');
  b.popTimer = 1.65;
  b.dizzyTimer = 0;
  b.vx *= 0.2;
  b.vz *= 0.2;
  b.vy = 4.2;
  sfx.playPop();
  kittyRig.bubbleMesh.visible = false;
  kittyRig.kitty.visible = false;
  kittyRig.accGroup.visible = false;
  kittyRig.dizzyHalo.visible = false;
  kittyRig.furball.visible = true;
  showToast(reason);
}

function triggerContextualFall(zone) {
  const b = state.ball;
  if (b.fallRecovery || b.popTimer > 0) return;
  state.pops += 1;
  deductStageTime(8, 'fall');
  state.fallEffects.push(createFallEffect(trackRoot, zone, b));
  beginFallRecovery(b, zone);
  if (zone.type === 'water') sfx.playSplash();
  else if (zone.type === 'indoor') { sfx.playWoodThud(); state.squashVel -= 5; }
  else if (zone.type === 'bush') sfx.playLeafRustle();
  else sfx.playCloudFall(zone.variant === 'starlight');
  const variantMessage = { snow:'❄️ 滚进松软雪堆啦，回到冰桥！',
    awning:'🪁 落到遮阳篷上啦，回到屋顶！', flowerbed:'🌿 滚进街角花坛啦，回到小路！' }[zone.variant];
  showToast(zone.message || variantMessage || FALL_MESSAGES[zone.type]);
}

function deductStageTime(seconds, reason) {
  const receipt = applyTimePenalty(state, seconds, reason);
  if (!receipt.seconds) return;
  showTimePenalty(receipt.seconds);
  sfx.playTimePenalty(receipt.seconds);
  if (receipt.timedOut) finishStage(false);
}

function finishStage(cleared) {
  state.phase = "ended";
  document.getElementById('touch-joystick').hidden = true;
  // Gently duck music instead of cutting off abruptly so transitioning to Next Stage stays seamless!
  sfx.duckForResult();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  hudEl.hidden = true;

  const unlockedBefore = new Set(CATS.filter((c) => isCatUnlocked(c)).map((c) => c.id));
  const isFinalTourney = state.mode === "tourney" && state.trackIndex === TRACKS.length - 1;
  const hasNextStage = state.trackIndex < TRACKS.length - 1;

  if (cleared) {
    sfx.playFinish();
    if (kittyRig?.setAnim) kittyRig.setAnim("Victory", 0.18);
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

    document.getElementById("res-tag").textContent = isFinalTourney ? "🏆 GRAND CHAMPION!" : "✨ STAGE CLEAR!";
    document.getElementById("res-title").textContent = isFinalTourney ? "🎉 10 关大冒险全通！" : `✅ 通过 ${state.track.name}`;
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
      nextBtn.textContent = "🏆 再冲一轮 10 关大冒险";
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
    // Live 3D Lobby & Cat Wardrobe Showcase Turntable!
    const tSec = ts * 0.001;
    if (lobbyShowcaseRig && !lobbyScreen.hidden) {
      lobbyShowcaseRig.root.visible = true;
      lobbyShowcaseRig.root.position.set(0, 9.75 + Math.sin(tSec * 2.4) * 0.14, 0);
      lobbyShowcaseRig.kitty.rotation.y = tSec * 0.9;
      lobbyShowcaseRig.bubbleMat.uniforms.uTime.value = tSec;
      lobbyShowcaseRig.updateAccessories(tSec);
      if (lobbyShowcaseRig.mixer) {
        lobbyShowcaseRig.mixer.update(dt * 0.75);
      } else if (lobbyShowcaseRig.animUniforms) {
        lobbyShowcaseRig.animUniforms.uTime.value = tSec;
        lobbyShowcaseRig.animUniforms.uPhase.value = tSec * 4.2;
        lobbyShowcaseRig.animUniforms.uSpeed.value = 0.25 + 0.15 * Math.sin(tSec * 1.8);
        lobbyShowcaseRig.animUniforms.uTurn.value = Math.sin(tSec * 1.4) * 0.35;
        lobbyShowcaseRig.animUniforms.uSquash.value = Math.sin(tSec * 3.0) * 0.08;
      }
      const inWardrobe = currentHubTab === "cats";
      const isPortrait = window.innerHeight > window.innerWidth * 1.05;
      const dist = inWardrobe ? (isPortrait ? 4.4 : 3.6) : (isPortrait ? 6.4 : 5.4);
      const camY = inWardrobe ? 10.3 : 11.2;
      const lookY = inWardrobe ? 8.85 : 9.1;
      camera.position.lerp(new THREE.Vector3(Math.sin(tSec * 0.22) * 1.2, camY, dist), Math.min(1, dt * 4.5));
      camera.lookAt(0, lookY, 0);
    } else {
      camera.position.set(Math.sin(ts * 0.0003) * 14, 14, Math.cos(ts * 0.0003) * 14 - 8);
      camera.lookAt(0, 5, -14);
    }
  }

  composer.render();
  requestAnimationFrame(tick);
}

function updatePhysics(dt) {
  const b = state.ball;
  const inp = state.input;
  // Gather Isometric Screen-Aligned Input (Mouse Push + WASD + Touch Drag!)
  let kx = 0;
  let kz = 0;
  if (inp.keys.has("KeyW") || inp.keys.has("ArrowUp") || inp.mouseDrive) kz -= 1;
  if (inp.keys.has("KeyS") || inp.keys.has("ArrowDown")) kz += 1;
  if (inp.keys.has("KeyA") || inp.keys.has("ArrowLeft")) kx -= 1;
  if (inp.keys.has("KeyD") || inp.keys.has("ArrowRight")) kx += 1;

  // Convert screen-space mouse/keyboard/gyroscope into isometric world axes!
  let rawX = (kx + (inp.ix || 0)) * 18 + inp.mouseAccX + (gyroEnabled ? gyroTiltX : 0);
  let rawZ = (kz + (inp.iz || 0)) * 18 + inp.mouseAccZ + (gyroEnabled ? gyroTiltZ : 0);
  // Preserve intent before dizzy effects or camera rotation. Keyboard, stick,
  // mouse push and gyro all pause auto-yaw through this same normalized signal.
  inp.lateralInput = Math.max(-1, Math.min(1, rawX / 18));
  inp.forwardInput = Math.max(-1, Math.min(1, -rawZ / 18));
  inp.mouseAccX *= Math.pow(0.02, dt);
  inp.mouseAccZ *= Math.pow(0.02, dt);
  if (b.fallRecovery) {
    advanceFallRecovery(b, dt, state.checkpoint);
    return;
  }
  b.chuteCooldown = Math.max(0, (b.chuteCooldown || 0) - dt);
  advancePortal(b, dt);
  b.launchLanding = Math.max(0, (b.launchLanding || 0) - dt);
  if (b.chuteRide && b.popTimer <= 0) {
    advanceChute(b, b.chuteRide, dt, (state.input.keys.has('KeyD') ? 1 : 0) - (state.input.keys.has('KeyA') ? 1 : 0));
    return;
  }
  if (b.launchAssist && b.popTimer <= 0) { advanceLaunch(b, dt); return; }
  const chute = findChuteEntry(state.track, b);
  if (chute) { captureChute(b, chute); advanceChute(b, b.chuteRide, dt); sfx.playBoost(); return; }
  const onWarp = portal => {
    state.viewYaw = portal.exit.yaw;
    inp.mouseAccX = 0; inp.mouseAccZ = 0;
    inp.orbitX = 0; inp.orbitY = 0;
    const pair = dynamicMeshes.warpPortals?.find(p => p.def.id === portal.id);
    if (pair) pair.pulse = 1;
    sfx.playWarp();
    showToast(`✦ ${portal.label} · 星光跃迁！`);
  };
  if (updatePortalPhysics(state.track, b, 0, { director: state.director, onWarp })) return;
  const catStats = state.cat.stats;
  const previousX = b.x;
  const previousZ = b.z;
  // Cruise is a motor torque target; external momentum decays through material forces.
  const burstMax = 15.2 * catStats.topSpeed;
  b.boostFlash = Math.max(0, b.boostFlash - dt);

  for (const lift of dynamicMeshes.elevators || []) {
    const curY = platformHeight(lift.def);
    lift.mesh.position.y = curY;
    if (b.grounded && b.supportPlatform === lift.def) {
      b.y += curY - platformHeight(lift.def, state.elapsed - dt);
    }
  }
  b.previousBottom = b.y - b.r;

  // Animate dynamic track hazards
  for (const g of dynamicMeshes.gears) {
    g.mesh.rotation.y += g.def.omega * dt;
  }
  for (const hm of dynamicMeshes.hammers) {
    const tArg = state.elapsed * (hm.def.speed || 1.5) + (hm.def.phase || 0);
    const amp = hm.def.amp ?? 0.55;
    const ang = Math.sin(tArg) * amp;
    const angVel = Math.cos(tArg) * amp * (hm.def.speed || 1.5);
    hm.pivot.rotation.z = ang;
    const sinA = Math.sin(ang);
    const cosA = Math.cos(ang);
    if (hm.def.swingMode === "tangent" && Number.isFinite(hm.def.tx) && Number.isFinite(hm.def.tz)) {
      hm.worldHead.set(
        hm.def.x + hm.def.tx * sinA * hm.def.len,
        hm.def.y - cosA * hm.def.len,
        hm.def.z + hm.def.tz * sinA * hm.def.len
      );
      hm.velX = hm.def.tx * cosA * angVel * hm.def.len;
      hm.velY = sinA * angVel * hm.def.len;
    } else {
      hm.worldHead.set(
        hm.def.x + sinA * hm.def.len,
        hm.def.y - cosA * hm.def.len,
        hm.def.z
      );
      hm.velX = cosA * angVel * hm.def.len;
      hm.velY = sinA * angVel * hm.def.len;
    }
  }
  for (const pin of dynamicMeshes.rollingPins || []) {
    const arg = state.elapsed * pin.def.speed + (pin.def.phase || 0);
    const offset = Math.sin(arg) * pin.def.ampZ;
    pin.mesh.position.z = pin.def.z + offset;
    pin.roller.rotation.x = offset / 0.48;
    pin.velZ = Math.cos(arg) * pin.def.ampZ * pin.def.speed;
  }
  for (const vent of dynamicMeshes.steamVents || []) {
    vent.active = (state.elapsed % vent.def.period) / vent.def.period < vent.def.duty;
  }

  // Handle Comical Popped Furball Respawn Timer (Clock keeps ticking — pure Hamsterball tension!)
  if (b.popTimer > 0) {
    b.popTimer -= dt;
    b.y += b.vy * dt;
    b.vy -= 18 * dt;
    kittyRig.furball.rotation.y += 10 * dt;
    if (b.popTimer <= 0) {
      b.x = state.checkpoint.x;
      b.y = state.checkpoint.y + b.r + 0.12;
      b.z = state.checkpoint.z;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.grounded = false;
      b.supportPlatform = null;
      kittyRig.bubbleMesh.visible = true;
      kittyRig.kitty.visible = true;
      kittyRig.accGroup.visible = true;
      kittyRig.furball.visible = false;
    }
    return;
  }

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
  const camYaw = state.viewYaw ?? state.director?.yaw ?? 0.58;
  const worldDrive = cameraRelativeInput(rawX, rawZ, camYaw);
  const drive = dampPortalSteering(b, worldDrive.x, worldDrive.z);
  const driveX = drive.x;
  const driveZ = drive.z;

  const wasGrounded = b.grounded;
  const startSurf = b.grounded ? sampleTrackSurface(b.x, b.y, b.z, b.r) : null;
  integrateRollingMotion(b, startSurf, driveX, driveZ, dt, catStats);
  clampHorizontalSpeed(b, burstMax);

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  collideSideRails(b, previousX, previousZ);

  // True Rigid-Body 90-Degree Step-Climbing & Solid Wall Collision!
  // Uses exact sphere radius (b.r = 0.62) & classical kinetic momentum threshold v_min(stepH, r, g):
  // - If stepH >= 0.78 * r: physically impossible vertical wall -> elastic bounce!
  // - If 0.08 < stepH < 0.78 * r: climbs ONLY if incoming velocity >= vMin (and deducts potential energy!), else bounces back!
  for (const p of state.track.platforms) {
    if (p.kind === "ramp" || p.kind === "ice_ramp" || p.kind === "cloud") continue;
    if (b.vy <= 0 && b.previousBottom >= platformFloor(p, b.x, b.z).y - 0.02) continue;
    // Authored v3 docks overlap continuous approach ribbons. Their side boxes
    // must not turn the rising ribbon underneath into an invisible curb.
    if (p.role && b.supportRoute && state.track.worldType) continue;
    if (b.grounded && b.supportPlatform === p) continue;
    const surfaceY = platformFloor(p, b.x, b.z).y;
    const stepH = surfaceY - (b.y - b.r);
    // Allow seamless exit from a ramp onto its adjoining flat platform without catching the seam lip!
    const onRampSeam = (b.surfaceKind === "ramp" || b.surfaceKind === "ice_ramp") && stepH < 0.30;
    if (!onRampSeam && stepH > 0.08 && b.y + b.r > surfaceY - p.h) {
      const hw = p.w * 0.5 + b.r;
      const hd = p.d * 0.5 + b.r;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        const penX = hw - Math.abs(dx);
        const penZ = hd - Math.abs(dz);
        const hitX = penX < penZ;
        const sgn = hitX ? Math.sign(dx || 1) : Math.sign(dz || 1);
        const vIn = hitX ? -sgn * b.vx : -sgn * b.vz;

        // Classical sphere-over-curb momentum criterion: requires higher speed as stepH approaches sphere radius r!
        const maxClimbH = b.r * 0.78;
        const canClimb = stepH < maxClimbH;
        const vMin = canClimb
          ? (b.r / Math.max(0.12, b.r - stepH)) * Math.sqrt(2.8 * 26.0 * stepH) * 0.48
          : Infinity;

        if (canClimb && vIn >= vMin) {
          // Sufficient momentum to vault up the 90° lip! Deduct real gravitational potential energy & give upward pop!
          b.y = surfaceY + b.r + 0.02;
          const vAfter = Math.sqrt(Math.max(0.5, vIn * vIn - 2.0 * 26.0 * stepH * 0.45));
          if (hitX) b.vx = -sgn * vAfter;
          else b.vz = -sgn * vAfter;
          b.vy = Math.max(b.vy, Math.min(4.2, Math.sqrt(2 * 26 * stepH) * 0.42));
        } else {
          // Step too tall or momentum too weak -> solid rigid-body rebound off the vertical face!
          if (hitX) {
            b.x = p.x + sgn * hw;
            if (vIn > 0) b.vx = sgn * Math.max(1.2, vIn * 0.48);
          } else {
            b.z = p.z + sgn * hd;
            if (vIn > 0) b.vz = sgn * Math.max(1.2, vIn * 0.48);
          }
        }
      }
    }
  }

  // Contact follows the exact floor gradient; air impacts retain a small material bounce.
  const surf = sampleTrackSurface(b.x, b.y, b.z, b.r);
  if (surf && (wasGrounded || b.vy <= 0)) {
    const impactVy = -b.vy;
    b.y = surf.y + b.r;
    if (!wasGrounded && impactVy > 15.0 && !b.launchLanding) {
      triggerBubblePop("💥 摔太狠啦！魔法泡泡碎了！");
      return;
    } else if (!wasGrounded && impactVy > 9.6 && !b.launchLanding) {
      b.dizzyTimer = 1.35 / catStats.dizzyResist;
      sfx.playDizzy();
      showToast("💫 摔晕啦！小猫头顶冒金星！");
    }
    const landing = wasGrounded ? null : resolveRollingLanding(b, surf, { bounce: !b.launchLanding });
    b.grounded = landing ? landing.grounded : true;
    if (wasGrounded) b.vy = surf.slopeX * b.vx + surf.slopeZ * b.vz;
    b.surfaceKind = surf.kind;
    b.supportPlatform = b.grounded ? surf.platform || null : null;
    b.supportRoute = b.grounded ? surf.route || null : null;
    if (surf.route) b.routeTangent = { x: surf.tx, z: surf.tz };
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
    b.supportPlatform = null;
    b.supportRoute = null;
  }

  // Include the travelled chord: a fast, grazing entry can cross the pool
  // between two non-overlapping endpoints, even at a high input rate.
  if (updatePortalPhysics(state.track, b, 0, { director: state.director, onWarp,
    previous: { x: previousX, y: b.previousBottom + b.r, z: previousZ } })) return;
  updateFairytalePhysics(state.track, b, state.elapsed, dt, showFairytaleEvent);
  updateSpikePhysics(state.track, b, state.elapsed, dt, showFairytaleEvent, {x:previousX,z:previousZ});
  if (b.launchAssist || state.phase !== 'playing') return;

  // Stage 01 Interactive Tutorial Zone Tips!
  if (state.track.tips && state.track.tips.length > 0) {
    state.track.tips.forEach((tip, i) => {
      if (!state.shownTips.has(i) && b.z <= tip.z) {
        state.shownTips.add(i);
        showToast(tip.msg);
      }
    });
  }

  const fallZone = findFallZone(state.track, b);
  if (fallZone) {
    triggerContextualFall(fallZone);
    return;
  }

  // Swinging Wooden Hammers — Pure Physical Momentum Knockback (No instant-kill!)
  b.hammerHitCd = Math.max(0, (b.hammerHitCd || 0) - dt);
    for (const hm of dynamicMeshes.hammers) {
      const dx = b.x - hm.worldHead.x;
      const dy = b.y - hm.worldHead.y;
      const dz = b.z - hm.worldHead.z;
      const d = Math.hypot(dx, dy, dz);
      const hitDist = b.r + 0.92;
      if (d < hitDist) {
        const relative={x:b.vx-(hm.velX||0),y:b.vy-(hm.velY||0),z:b.vz};
        const relativeSpeed=Math.hypot(relative.x,relative.y,relative.z);
        const nx = d>1e-8?dx/d:relativeSpeed>1e-8?-relative.x/relativeSpeed:0;
        const ny = d>1e-8?dy/d:relativeSpeed>1e-8?-relative.y/relativeSpeed:0;
        const nz = d>1e-8?dz/d:relativeSpeed>1e-8?-relative.z/relativeSpeed:1;
        // Separate ball out of hammer head
        b.x = hm.worldHead.x + nx * (hitDist + 0.08);
        b.y = hm.worldHead.y + ny * (hitDist + 0.08);
        b.z = hm.worldHead.z + nz * (hitDist + 0.08);
        b.grounded=false;b.supportPlatform=null;b.supportRoute=null;
        resolveSphereFloorContact(b, hm.worldHead, hitDist + .08,
          q => sampleTrackSurface(q.x, q.y, q.z, q.r));
        // A feedback cooldown never removes the pendulum's solid body.
        if(b.hammerHitCd>0) {
          const closing=relative.x*nx+relative.y*ny+relative.z*nz;
          if(closing<0){b.vx-=nx*closing;b.vy-=ny*closing;b.vz-=nz*closing;}
          continue;
        }

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
        createMagicBurst(trackRoot, state.magicBursts ||= [], b, 0xffd486);
        deductStageTime(5, 'pendulum');
        showToast(swingSpd > 5.5 ? "🔨 咚！被大木锤狠狠锤飞！" : "🔨 咚！擦到木锤弹开了！");
        break;
      }
    }

  if (state.phase !== 'playing') return;

  // Enchanted rolling cylinders: use finite, flat endcaps so the sphere can
  // pass the handles without an invisible full-radius capsule blocking it.
  b.rollingPinHitCd = Math.max(0, (b.rollingPinHitCd || 0) - dt);
  if (b.rollingPinHitCd <= 0) for (const pin of dynamicMeshes.rollingPins || []) {
    const halfWidth = pin.def.width / 2;
    const dx = b.x - pin.def.x, dy = b.y - pin.def.y, dz = b.z - pin.mesh.position.z;
    const radial = Math.hypot(dy, dz);
    const radialScale = radial > 0.48 ? 0.48 / radial : 1;
    let px = pin.def.x + Math.max(-halfWidth, Math.min(halfWidth, dx));
    let py = pin.def.y + dy * radialScale, pz = pin.mesh.position.z + dz * radialScale;
    const distance = Math.hypot(b.x - px, b.y - py, b.z - pz);
    if (distance >= b.r) continue;
    let nx, ny, nz;
    if (distance > 0.0001) {
      nx = (b.x - px) / distance; ny = (b.y - py) / distance; nz = (b.z - pz) / distance;
    } else if (halfWidth - Math.abs(dx) < 0.48 - radial) {
      nx = Math.sign(dx || 1); ny = 0; nz = 0;
      px = pin.def.x + nx * halfWidth;
    } else {
      nx = 0;
      ny = radial > 0.0001 ? dy / radial : 0;
      nz = radial > 0.0001 ? dz / radial : -Math.sign(b.vz - pin.velZ || 1);
      py = pin.def.y + ny * 0.48; pz = pin.mesh.position.z + nz * 0.48;
    }
    const closing = b.vx * nx + b.vy * ny + (b.vz - pin.velZ) * nz;
    const impulse = Math.max(4.8, -closing * 1.85);
    b.x = px + nx * (b.r + 0.03);
    b.y = py + ny * (b.r + 0.03);
    b.z = pz + nz * (b.r + 0.03);
    b.vx += nx * impulse;
    b.vz += nz * impulse;
    b.vy = Math.max(2.6, Math.min(4.2, b.vy + ny * impulse));
    b.grounded = false;
    b.supportPlatform = null;
    b.rollingPinHitCd = 0.45;
    b.boostFlash = Math.max(b.boostFlash, 0.35);
    state.squashVel -= 4;
    sfx.playHammerBonk(Math.min(1, impulse / 10));
    showToast("🥖 哎呀！被魔法擀面杖弹开啦！");
    break;
  }

  // Pinball crystals preserve tangential motion and add a bounded radial kick.
  b.bumperHitCd = Math.max(0, (b.bumperHitCd || 0) - dt);
  for (const bumper of dynamicMeshes.bumpers || []) {
    const def = bumper.def, dx = b.x - def.x, dz = b.z - def.z;
    const distance = Math.hypot(dx, dz), hitDist = def.r + b.r;
    if (distance >= hitDist || b.y + b.r < def.y || b.y - b.r > def.y + 1.5) continue;
    const speed = Math.hypot(b.vx, b.vz);
    const nx = distance > 0.0001 ? dx / distance : speed > 0.001 ? -b.vx / speed : 0;
    const nz = distance > 0.0001 ? dz / distance : speed > 0.001 ? -b.vz / speed : -1;
    const inward = b.vx * nx + b.vz * nz;
    const kick = Math.max(0, (def.bounce ?? 6) - inward);
    b.x = def.x + nx * (hitDist + 0.03);
    b.z = def.z + nz * (hitDist + 0.03);
    // Feedback cooldown never makes the physical body permeable.
    if (b.bumperHitCd > 0) {
      if(inward<0){b.vx-=nx*inward;b.vz-=nz*inward;}
      continue;
    }
    b.vx += nx * kick;
    b.vz += nz * kick;
    b.bumperHitCd = 0.3;
    b.boostFlash = Math.max(b.boostFlash, 0.45);
    bumper.pulse = 1;
    state.squashVel += 3.2;
    sfx.playBoing();
    createMagicBurst(trackRoot, state.magicBursts ||= [], {x:def.x,y:def.y+.5,z:def.z}, 0xffe59a);
    showToast("💎 弹珠水晶加速弹射！");
    break;
  }

  // Rune vents apply acceleration over time rather than an instant launch.
  // A contact latch keeps the sound/toast from repeating every physics tick.
  for (const vent of dynamicMeshes.steamVents || []) {
    const def = vent.def;
    if (def.target) continue; // Authored tier transfer uses the shared exact ballistic launch.
    const touching = vent.active && Math.hypot(b.x - def.x, b.z - def.z) < def.r + b.r * 0.35
      && b.y - b.r >= def.y - 0.15 && b.y - b.r < def.y + 2.5;
    if (touching) {
      b.vy += Math.min(Math.max(0, def.vy - b.vy), 44 * dt);
      b.vz -= Math.min(Math.max(0, b.vz - def.vz), 20 * dt);
      b.grounded = false;
      b.supportPlatform = null;
      b.boostFlash = Math.max(b.boostFlash, 0.35);
      if (!vent.touching) {
        sfx.playBoost();
        showToast("💨 蒸汽符文风柱起飞！");
      }
    }
    vent.touching = touching;
  }

  // Bouncy Red Mushrooms!
  for (const m of dynamicMeshes.mushrooms) {
    const d = Math.hypot(b.x - m.def.x, b.z - m.def.z);
    if (d < m.def.r + b.r * 0.5 && Math.abs(b.y - m.def.y) < 1.35 && b.vy <= 2) {
      if (m.def.target) {
        b.x = m.def.x; b.y = m.def.y + b.r; b.z = m.def.z;
        launchBall(b, m.def);
      } else {
        b.vy = m.def.vy;
        b.vx += m.def.vx || 0;
        b.vz += m.def.vz;
      }
      b.grounded = false;
      if (state.director) triggerSetpiece(state.director, 1.2);
      m.bounceAnim = 1.0;
      sfx.playBoing();
      showToast("🍄 弹跳蘑菇起飞！");
    }
  }

  // Rainbow Speed Boost Strips (Snappy & Controllable!)
  for (const bs of state.track.boosts) {
    if (Math.abs(b.x - bs.x) < bs.w * 0.5 + b.r && Math.abs(b.z - bs.z) < bs.d * 0.5 + b.r && Math.abs(b.y - bs.y) < 1.2) {
      b.vx += bs.fx * dt * 1.45;
      b.vz += bs.fz * dt * 1.45;
      if (b.boostFlash <= 0) {
        sfx.playBoost();
      }
      b.boostFlash = 0.6;
    }
  }

  // Checkpoints!
  state.track.checkpoints.forEach((cp, idx) => {
    if (idx > state.checkpointIdx && Math.hypot(b.x - cp.x, b.z - cp.z) < 2.8 && Math.abs(b.y - cp.y) < 1.8) {
      state.checkpointIdx = idx;
      state.checkpoint = { x: cp.x, y: cp.y, z: cp.z };
      activateCheckpoint(dynamicMeshes, idx);
      createMagicBurst(trackRoot, state.magicBursts ||= [], cp, 0xffd65c);
      sfx.playCheckpoint();
      showToast("🚩 已激活魔法检查点！");
    }
  });

  // High-Dopamine Magic Star Candy Pickups (+2.0s Time, Speed Burst, Rising Combo Pitch & All-Stars Bonus!)
  for (const st of dynamicMeshes.stars) {
    if (st.collected) continue;
    if (Math.hypot(b.x - st.def.x, b.y - st.def.y, b.z - st.def.z) < b.r + 0.9) {
      st.collected = true;
      st.mesh.visible = false;
      state.stars += 1;
      state.timeLeft += 2.0;
      // Instant rewarding speed kick + rainbow flash + elastic joy hop!
      const curS = Math.hypot(b.vx, b.vz);
      if (curS > 0.5) {
        b.vx *= 1.15;
        b.vz *= 1.15;
      }
      b.boostFlash = Math.max(b.boostFlash, 0.45);
      state.squashVel += 4.2;
      sfx.playStar(state.stars);
      const totalInTrack = dynamicMeshes.stars.length;
      if (state.stars >= totalInTrack && totalInTrack > 0) {
        state.timeLeft += 5.0;
        sfx.playFinish();
        showStarPop(`🌟 全星完美！+5.0s`);
        showToast(`🌟 本关星糖全收集！额外奖励 +5.0 秒！`);
      } else {
        showStarPop(`⭐ +2.0s  COMBO ×${state.stars}`);
      }
    }
  }

  // External impulses share the terminal safety cap; motor cruise is a torque target.
  clampHorizontalSpeed(b, burstMax);
  collideSideRails(b, previousX, previousZ);
  reconcileBouncyBodies(state.track, b);
  // Rail projection must not put the ball back inside a moving animal.
  collideFairytaleCritters(state.track, b, state.elapsed, showFairytaleEvent);

  // Finish Portal!
  const fin = state.track.finish;
  if (Math.hypot(b.x - fin.x, b.z - fin.z) < 2.2 && Math.abs(b.y - fin.y) < 2.2) {
    finishStage(true);
  }
}

function updateVisuals(dt) {
  animateSpikeTraps(dynamicMeshes, state.elapsed);
  updateMagicBursts(state.magicBursts ||= [], dt);
  const b = state.ball;
  updateFallEffects(state.fallEffects, dt);
  let actIndex = b.supportRoute?.actIndex;
  if (b.chuteRide) actIndex = state.track.primaryPath.find(step => step.id === b.chuteRide.chute.id)?.actIndex ?? 1;
  else if (b.launchAssist) {
    const start = b.launchAssist.start;
    const launcher = [...state.track.props, ...state.track.mushrooms].find(prop =>
      Math.hypot(prop.x - start.x, prop.z - start.z) < .5);
    if (launcher) actIndex = state.track.primaryPath.find(step => step.id === launcher.id)?.actIndex ?? actIndex;
  }
  if ((b.grounded || b.chuteRide || b.launchAssist) && actIndex > state.activeAct) {
    state.activeAct = actIndex;
    showToast(`🎬 第${['一','二','三','四','五','六'][actIndex]}幕：${state.track.acts[actIndex].name}`);
  }
  const spd = Math.hypot(b.vx, b.vz);

  kittyRig.root.position.set(b.x, b.y, b.z);
  const recall = b.fallRecovery;
  const cloudFade = recall?.zone.type === 'cloud' ? (recall.elapsed < .75
    ? Math.max(.01, 1 - recall.elapsed / .55) : Math.min(1, (recall.elapsed - .75) / .4)) : 1;
  kittyRig.root.scale.setScalar(Math.max(.01, cloudFade));
  kittyRig.bubbleMat.uniforms.uTime.value = state.elapsed;

  // Physical rolling rotation + expressive steering lean!
  kittyRig.kitty.rotation.order = 'YXZ';
  let turnDelta = 0;
  if (spd > 0.42) {
    const rollAxis = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
    kittyRig.bubbleMesh.rotateOnWorldAxis(rollAxis, (spd * dt) / b.r);
    const targetFace = Math.atan2(-b.vx, -b.vz);
    let diff = targetFace - b.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    turnDelta = Math.max(-1, Math.min(1, diff * 1.6));
    b.facing += diff * (1 - Math.exp(-dt * 12));
    kittyRig.kitty.rotation.y = b.facing;
  } else if (spd > 0.05) {
    const rollAxis = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
    kittyRig.bubbleMesh.rotateOnWorldAxis(rollAxis, (spd * dt) / b.r);
  }
  kittyRig.updateAccessories(state.elapsed);
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
    if (kittyRig.setAnim) {
      kittyRig.setAnim(spd > 0.55 ? "Run" : "Idle", 0.16);
    }
    kittyRig.mixer.update(dt * (spd > 0.55 ? 0.72 + spd * 0.2 : 0.85));
    const hop = Math.abs(Math.sin(b.pawCycle * 0.95));
    kittyRig.kitty.position.y = spd > 0.55 ? hop * Math.min(0.08, 0.015 + spd * 0.006) : 0;
    kittyRig.kitty.rotation.x = -Math.min(0.18, spd * 0.014);
    kittyRig.kitty.rotation.z = -state.turnSmooth * Math.min(0.24, spd * 0.022);
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
    // Forward lean into sprint (cat faces -Z, so negative X pitches forward!) + lateral banking into turns!
    kittyRig.kitty.rotation.x = -Math.min(0.22, spd * 0.018) - Math.sin(b.pawCycle * 1.7) * Math.min(0.06, spd * 0.006);
    kittyRig.kitty.scale.set(1, 1, 1);
  } else {
    kittyRig.paws.forEach((p, i) => {
      const phase = b.pawCycle + (i % 2 === 0 ? 0 : Math.PI);
      p.mesh.position.y = p.baseY + Math.max(0, Math.sin(phase)) * 0.075;
      p.mesh.position.z = p.baseZ + Math.cos(phase) * 0.08;
    });
    kittyRig.tail.rotation.z = Math.sin(state.elapsed * 9) * 0.35;
  }

  for (const bumper of dynamicMeshes.bumpers || []) {
    bumper.pulse = Math.max(0, bumper.pulse - dt * 3.5);
    const pulse = Math.sin(bumper.pulse * Math.PI) * 0.2;
    bumper.mesh.scale.set(1 + pulse, 1 - pulse * 0.45, 1 + pulse);
  }
  for (const vent of dynamicMeshes.steamVents || []) {
    const shimmer = 0.92 + Math.sin(state.elapsed * 9 + vent.def.z) * 0.08;
    vent.plume.visible = vent.active;
    vent.plume.scale.set(1, shimmer, 1);
    vent.plume.material.opacity = vent.active ? 0.22 + shimmer * 0.1 : 0;
    vent.plume.rotation.y += dt * 0.8;
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
  const surf = sampleTrackSurface(b.x, b.y, b.z, b.r)
    || (b.fallRecovery?.zone.type === 'indoor' ? { y: b.fallRecovery.floor } : null);
  if (surf && b.popTimer <= 0) {
    kittyRig.shadow.visible = true;
    kittyRig.shadow.position.set(b.x, surf.y + 0.055, b.z);
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

  // Director pose and the actual rendered yaw are also the movement basis.
  const inp = state.input;
  const keyOrbit = (inp.keys.has('KeyE') ? 1 : 0) - (inp.keys.has('KeyQ') ? 1 : 0);
  const desiredPose = updateDirector(state.director, { ball: b, track: state.track, dt,
    elapsed: state.elapsed, aspect: camera.aspect,
    manualDelta: (inp.orbitX || 0) + keyOrbit * dt * 1.5,
    pitchDelta: inp.orbitY || 0, zoomDelta: inp.zoomDelta || 0,
    lateralInput: inp.lateralInput || 0, forwardInput: inp.forwardInput || 0,
    orbitHeld: inp.orbitPointer != null || !!keyOrbit });
  inp.orbitX = 0; inp.orbitY = 0; inp.zoomDelta = 0;
  animateFairytaleScenery(dynamicMeshes, state.elapsed, dt);
  const sky = dynamicMeshes.sky;
  if (sky) sky.position.set(b.x, b.y, b.z);
  const pose = cameraSightline.resolve(b, desiredPose, dt);
  camera.position.set(pose.x, pose.y, pose.z);
  camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  state.viewYaw = Math.atan2(pose.x - pose.lookX, pose.z - pose.lookZ);
  state.camFov = pose.fov;
  if (Math.abs(camera.fov - pose.fov) > 0.05) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
  cameraOcclusion?.update(b, camera.position, dt);
  const flash = document.getElementById('warp-flash');
  const flashLife = Math.max(0, Math.min(1, (b.portalFlash || 0) / .45));
  flash.style.opacity = String(flashLife ** .65);
  flash.style.setProperty('--warp-color', `#${(b.portalColor ?? 0xa5dfff).toString(16).padStart(6, '0')}`);
  const orbitHint = document.getElementById('camera-hint');
  orbitHint.hidden = state.director.mode !== CAMERA_MODES.MANUAL_ORBIT;
  document.getElementById('hud').dataset.cameraMode = state.director.mode;
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
        : b.surfaceKind === "mud" ? "🪵 泥地减速，沿 S 形干燥线前进！"
          : b.surfaceKind === "honey" ? "🍯 蜂蜜减速，沿 S 形干燥线前进！"
          : b.surfaceKind === "ice" || b.surfaceKind === "ice_ramp" ? "❄️ 冰面极限漂移！"
            : b.boostFlash > 0 ? "🌈 彩虹加速狂飙！"
              : "🐾 全速滚动中";
}

// ===== AUTHENTIC HAMSTERBALL CONTROLS (Pointer Lock Mouse + RMB/Q·E Orbit + WASD + Mobile Dual-Hand) =====
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!state || state.phase !== 'playing') return;
  sfx.unlock();
  const inp = state.input;
  const touch = e.pointerType !== 'mouse';
  if (!touch) {
    // Left-click locks pointer & holds continuous forward rolling acceleration; Right-click drags camera orbit!
    if (e.button === 0) {
      inp.mouseDrive = true;
      inp.mouseLastX = e.clientX; inp.mouseLastY = e.clientY;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try { Promise.resolve(canvas.requestPointerLock()).catch(() => {}); } catch {}
      }
      return;
    }
    if (e.button === 2 && inp.orbitPointer == null) {
      inp.orbitPointer = e.pointerId;
      inp.orbitLastX = e.clientX; inp.orbitLastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    }
    return;
  }
  const isOrbit = e.clientX > window.innerWidth * 0.5;
  if (isOrbit && inp.orbitPointer == null) {
    inp.orbitPointer = e.pointerId;
    inp.orbitLastX = e.clientX; inp.orbitLastY = e.clientY;
  } else if (!isOrbit && inp.movePointer == null) {
    inp.movePointer = e.pointerId;
    inp.joyX = e.clientX; inp.joyY = e.clientY;
    inp.touchActive = true;
    const joy = document.getElementById('touch-joystick');
    joy.hidden = false; joy.style.left = `${e.clientX}px`; joy.style.top = `${e.clientY}px`;
  }
  canvas.setPointerCapture?.(e.pointerId);
});
window.addEventListener('mousemove', e => {
  if (!state || state.phase !== 'playing') return;
  const inp = state.input;
  const sens = save.mouseSens || 1;
  const locked = document.pointerLockElement === canvas;
  if (!locked && !inp.mouseDrive) return;
  const dx = locked ? e.movementX : (e.clientX - (inp.mouseLastX ?? e.clientX));
  const dy = locked ? e.movementY : (e.clientY - (inp.mouseLastY ?? e.clientY));
  inp.mouseLastX = e.clientX; inp.mouseLastY = e.clientY;
  if (locked && (e.buttons & 2) !== 0) {
    inp.orbitX = (inp.orbitX || 0) - dx * 0.006 * sens;
    inp.orbitY = (inp.orbitY || 0) + dy * 0.004 * sens;
  } else {
    inp.mouseAccX = Math.max(-28, Math.min(28, inp.mouseAccX + dx * 0.42 * sens));
    inp.mouseAccZ = Math.max(-28, Math.min(28, inp.mouseAccZ + dy * 0.42 * sens));
  }
});
window.addEventListener('pointermove', e => {
  if (!state || state.phase !== 'playing') return;
  const inp = state.input;
  if (inp.orbitPointer === e.pointerId) {
    inp.orbitX = (inp.orbitX || 0) - (e.clientX - inp.orbitLastX) * 0.006 * (save.mouseSens || 1);
    inp.orbitY = (inp.orbitY || 0) + (e.clientY - inp.orbitLastY) * 0.004 * (save.mouseSens || 1);
    inp.orbitLastX = e.clientX; inp.orbitLastY = e.clientY;
  }
  if (inp.movePointer === e.pointerId) {
    const dx = e.clientX - inp.joyX, dy = e.clientY - inp.joyY;
    const scale = Math.max(1, Math.hypot(dx, dy) / 52);
    inp.ix = dx / scale / 52; inp.iz = dy / scale / 52;
    const knob = document.getElementById('joystick-knob');
    knob.style.transform = `translate(${dx / scale}px, ${dy / scale}px)`;
  }
});
function releaseControlPointer(e) {
  if (!state) return;
  const inp = state.input;
  if (e.button === 0 || (e.pointerType === 'mouse' && ((e.buttons ?? 0) & 1) === 0)) inp.mouseDrive = false;
  if (inp.orbitPointer === e.pointerId) inp.orbitPointer = null;
  if (inp.movePointer === e.pointerId) {
    inp.movePointer = null; inp.touchActive = false; inp.ix = 0; inp.iz = 0;
    document.getElementById('touch-joystick').hidden = true;
  }
}
window.addEventListener('pointerup', releaseControlPointer);
window.addEventListener('mouseup', e => { if (state && e.button === 0) state.input.mouseDrive = false; });
window.addEventListener('pointercancel', releaseControlPointer);
canvas.addEventListener('lostpointercapture', releaseControlPointer);
document.addEventListener('pointerlockchange', () => {
  if (state && document.pointerLockElement !== canvas) state.input.mouseDrive = false;
});
canvas.addEventListener('wheel', e => {
  if (!state || state.phase !== 'playing') return;
  e.preventDefault();
  state.input.zoomDelta = (state.input.zoomDelta || 0) + Math.sign(e.deltaY) * 0.07;
}, { passive: false });
window.addEventListener('blur', () => {
  if (!state) return;
  state.input.keys.clear(); state.input.ix = 0; state.input.iz = 0; state.input.mouseDrive = false;
  state.input.movePointer = null; state.input.orbitPointer = null;
  document.getElementById('touch-joystick').hidden = true;
  if (state.phase === 'playing') openPause();
});
function respawnToCheckpoint() {
  if (!state || !['playing', 'paused'].includes(state.phase)) return false;
  resetBallToCheckpoint(state.ball, state.checkpoint);
  // Remove stale input, motion trails and camera springs from the old location.
  Object.assign(state.input, { ix: 0, iz: 0, mouseAccX: 0, mouseAccZ: 0, mouseDrive: false,
    orbitX: 0, orbitY: 0, zoomDelta: 0, lateralInput: 0, forwardInput: 0,
    orbitPointer: null, movePointer: null });
  state.input.keys.clear();
  state.director = createDirector(state.track.startYaw || 0);
  Object.assign(state, { squash: 0, squashVel: 0, turnSmooth: 0,
    camSpringY: 0, camSpringVy: 0, lastVy: 0, lastGrounded: false });
  trailPoints.length = 0;
  updateFallEffects(state.fallEffects, 2);
  updateMagicBursts(state.magicBursts ||= [], 2);
  cameraOcclusion?.reset();
  cameraSightline?.reset();
  kittyRig.bubbleMesh.visible = true;
  kittyRig.kitty.visible = true;
  kittyRig.accGroup.visible = true;
  kittyRig.furball.visible = false;
  kittyRig.root.scale.setScalar(1);
  pauseScreen.hidden = true;
  document.getElementById('touch-joystick').hidden = true;
  state.phase = 'playing';
  sfx.setPaused(false);
  // Render the new director immediately, including while leaving the pause UI.
  updateVisuals(0);
  syncHud();
  showToast('✨ 已回到检查点！');
  return true;
}

function openPause() {
  if (!state || state.phase !== "playing") return;
  state.phase = "paused";
  state.input.keys.clear(); state.input.ix = 0; state.input.iz = 0;
  state.input.orbitPointer = null; state.input.movePointer = null;
  document.getElementById("touch-joystick").hidden = true;
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
  if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey
    && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)
    && !e.target?.isContentEditable) {
    if (!e.repeat && respawnToCheckpoint()) e.preventDefault();
    return;
  }
  if (e.code === "Escape" || e.code === "KeyP") {
    if (state?.phase === "playing") openPause();
    else if (state?.phase === "paused") closePause();
    return;
  }
  if (state && state.phase === "playing") {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    state.input.keys.add(e.code);
  }
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
document.querySelectorAll('[data-flagship-track]').forEach(button => {
  button.onclick = () => {
    selectedPracticeTrack = Number(button.dataset.flagshipTrack);
    loadTrack(selectedPracticeTrack, 'practice', 0);
  };
});
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
document.getElementById('btn-respawn-checkpoint').onclick = respawnToCheckpoint;
document.getElementById('btn-hud-reset').onclick = respawnToCheckpoint;
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
  cameraOcclusion?.reset();
  cameraSightline?.reset();
  if (state) state.phase = "ended";
  sfx.playLobbyBgm();
  pauseScreen.hidden = true;
  hudEl.hidden = true;
  resultScreen.hidden = true;
  lobbyScreen.hidden = false;
  renderLobby();
};
document.getElementById("btn-res-lobby").onclick = () => {
  cameraOcclusion?.reset();
  cameraSightline?.reset();
  sfx.playLobbyBgm();
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
mountTrackModels(initBuilt);
renderLobby();
requestAnimationFrame(tick);
