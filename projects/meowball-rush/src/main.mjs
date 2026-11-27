// Meowball Rush v0.1.0 — Authentic Hamsterball 3D Physics + WitchSpring Cel-Shading!
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CATS, DEFAULT_SAVE, TRACKS } from "./config.mjs";
import { sfx } from "./audio.mjs";
import { buildTrackScene, createKittyBall, createRainbowRibbon } from "./cel-builder.mjs";
import { GLB_MODELS } from "./models/manifest.mjs";
import coverUrl from "./assets/cover.webp";

const gltfLoader = new GLTFLoader();
const loadedGlbCache = {};
function loadGlbModel(key, onReady) {
  const url = GLB_MODELS[key];
  if (!url) return;
  if (loadedGlbCache[key]) {
    onReady(loadedGlbCache[key].clone(true));
    return;
  }
  gltfLoader.load(url, (gltf) => {
    // Auto-normalize size & center pivot so any Tripo3D / Hunyuan3D .glb fits seamlessly!
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(1 / maxDim);
    root.position.set(-center.x / maxDim, -center.y / maxDim, -center.z / maxDim);
    const wrapper = new THREE.Group();
    wrapper.add(root);
    loadedGlbCache[key] = wrapper;
    onReady(wrapper.clone(true));
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

// UI Refs
const canvas = document.getElementById("gl-canvas");
const lobbyScreen = document.getElementById("lobby-screen");
const resultScreen = document.getElementById("result-screen");
const hudEl = document.getElementById("hud");
const toastEl = document.getElementById("toast");
lobbyScreen.style.backgroundImage = `url("${coverUrl}")`;

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

// ===== THREE.JS CEL-SHADED ISOMETRIC RENDERER =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 220);

// Warm WitchSpring Lighting + Soft Real-Time Sunlight Shadows!
const hemiLight = new THREE.HemisphereLight(0xfffaf2, 0x8b74bd, 1.05);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xfff5d6, 1.35);
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
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
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
  if (cat.unlockReq?.type === "clear" && save.clearedTracks.includes(cat.unlockReq.track)) return true;
  if (cat.unlockReq?.type === "stars" && save.totalStars >= cat.unlockReq.count) return true;
  if (cat.unlockReq?.type === "time" && save.bestTourneyTime >= cat.unlockReq.seconds) return true;
  return false;
}

function getSelectedCat() {
  return CATS.find((c) => c.id === save.selectedCat) || CATS[0];
}

function renderLobby() {
  document.getElementById("lobby-stars").textContent = `⭐ 累计星糖：${save.totalStars}`;
  document.getElementById("lobby-best").textContent = save.bestTourneyTime > 0 ? `最佳结转：${save.bestTourneyTime.toFixed(1)}s` : "最佳结转：--";

  const catGrid = document.getElementById("cat-grid");
  catGrid.innerHTML = "";
  const catIcons = { witch_hat: "🧙‍♀️", scarf: "🧣", ribbon: "🎀", bell: "🔔", goggles: "🥽", crown: "👑" };
  for (const cat of CATS) {
    const unlocked = isCatUnlocked(cat);
    const btn = document.createElement("button");
    btn.className = `cat-btn ${save.selectedCat === cat.id ? "active" : ""} ${unlocked ? "" : "locked"}`;
    const hex = `#${cat.bubbleColor.toString(16).padStart(6, "0")}`;
    btn.innerHTML = `
      <div class="cat-dot" style="background:${hex}">${unlocked ? (catIcons[cat.acc] || "🐱") : "🔒"}</div>
      <div class="cat-name">${cat.name}</div>
    `;
    btn.onclick = () => {
      if (!unlocked) {
        showToast(`🔒 ${cat.unlockText}`);
        return;
      }
      save.selectedCat = cat.id;
      writeSave(save);
      renderLobby();
    };
    catGrid.appendChild(btn);
  }
  const activeCat = getSelectedCat();
  document.getElementById("cat-desc").textContent = `${activeCat.name}（${activeCat.title}）· ${activeCat.desc}`;

  const trkRow = document.getElementById("track-row");
  trkRow.innerHTML = "";
  TRACKS.forEach((t, idx) => {
    const b = document.createElement("button");
    b.className = `trk-btn ${selectedPracticeTrack === idx ? "active" : ""}`;
    b.textContent = `${idx + 1} · ${t.name.split("·")[1].trim()}`;
    b.onclick = () => {
      selectedPracticeTrack = idx;
      renderLobby();
    };
    trkRow.appendChild(b);
  });
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
  scene.fog = new THREE.Fog(track.fogColor, 26, 92);
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
  // Auto-mount external AI-generated 3D .glb kitten bounded cleanly inside the bubble!
  const glbKey = cat.id === "ginger_scarf" ? "cat-ginger" : "cat-witch";
  loadGlbModel(glbKey, (model) => {
    if (kittyRig) kittyRig.mountExternalModel(model, 0.72);
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

  if (cleared) {
    sfx.playFinish();
    if (!save.clearedTracks.includes(state.trackIndex)) save.clearedTracks.push(state.trackIndex);
    save.totalStars += state.stars;
    const isFinalTourney = state.mode === "tourney" && state.trackIndex === TRACKS.length - 1;
    if (isFinalTourney && state.timeLeft > save.bestTourneyTime) {
      save.bestTourneyTime = state.timeLeft;
    }
    writeSave(save);

    document.getElementById("res-tag").textContent = isFinalTourney ? "🏆 TOURNAMENT CHAMPION!" : "✨ STAGE CLEAR!";
    document.getElementById("res-title").textContent = isFinalTourney ? "🎉 3 关锦标赛全通！" : `✅ 通过 ${state.track.name}`;
    document.getElementById("res-sub").textContent =
      state.mode === "tourney" && !isFinalTourney
        ? `剩余 ${state.timeLeft.toFixed(1)}s 已结转！下一关再奖 +${TRACKS[state.trackIndex + 1].bonusTime}s！`
        : isFinalTourney
          ? `最终结转总剩余 ${state.timeLeft.toFixed(1)} 秒！快去大厅解锁新萌猫！`
          : "单关冲刺完成！挑战 3 关锦标赛赢取更多时间结转！";
    document.getElementById("res-time").textContent = `${state.timeLeft.toFixed(1)}s`;
    document.getElementById("res-stars").textContent = `⭐ ${state.stars} / 💥 ${state.pops}`;

    const nextBtn = document.getElementById("btn-res-next");
    if (state.mode === "tourney" && !isFinalTourney) {
      nextBtn.textContent = `下一关：${TRACKS[state.trackIndex + 1].name.split("·")[1].trim()} →`;
      nextBtn.onclick = () => loadTrack(state.trackIndex + 1, "tourney", state.timeLeft);
    } else {
      nextBtn.textContent = "🔄 再跑一局";
      nextBtn.onclick = () => loadTrack(state.mode === "tourney" ? 0 : state.trackIndex, state.mode, 0);
    }
  } else {
    sfx.playPop();
    document.getElementById("res-tag").textContent = "⏰ TIME UP";
    document.getElementById("res-title").textContent = "😿 时间耗尽啦！";
    document.getElementById("res-sub").textContent = "小猫跑累了…试试发现隐藏云朵捷径省时间！";
    document.getElementById("res-time").textContent = "0.0s";
    document.getElementById("res-stars").textContent = `⭐ ${state.stars} / 💥 ${state.pops}`;
    const nextBtn = document.getElementById("btn-res-next");
    nextBtn.textContent = "🔄 重新挑战";
    nextBtn.onclick = () => loadTrack(state.mode === "tourney" ? 0 : state.trackIndex, state.mode, 0);
  }
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

  renderer.render(scene, camera);
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

  // Convert screen-space mouse/keyboard into isometric world axes (camera offset is +X, +Z looking toward -X, -Z)
  let rawX = kx * 18 + inp.mouseAccX;
  let rawZ = kz * 18 + inp.mouseAccZ;
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

  // Physical rolling rotation of the outer magic bubble!
  if (spd > 0.05) {
    const rollAxis = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
    kittyRig.bubbleMesh.rotateOnWorldAxis(rollAxis, (spd * dt) / b.r);
    const targetFace = Math.atan2(-b.vx, -b.vz);
    let diff = targetFace - b.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    b.facing += diff * Math.min(1, dt * 10);
    kittyRig.kitty.rotation.y = b.facing;
  }

  // Adorable frantic paw cycling (or bouncy trotting bob for external GLB figurine!)
  b.pawCycle += (2.5 + spd * 2.4) * dt;
  if (kittyRig.isExternal && kittyRig.isExternal()) {
    kittyRig.kitty.position.y = Math.abs(Math.sin(b.pawCycle * 0.65)) * Math.min(0.09, 0.02 + spd * 0.008);
    kittyRig.kitty.rotation.x = Math.sin(b.pawCycle * 0.65) * Math.min(0.16, spd * 0.015);
  } else {
    kittyRig.paws.forEach((p, i) => {
      const phase = b.pawCycle + (i % 2 === 0 ? 0 : Math.PI);
      p.mesh.position.y = p.baseY + Math.max(0, Math.sin(phase)) * 0.075;
      p.mesh.position.z = p.baseZ + Math.cos(phase) * 0.08;
    });
    kittyRig.tail.rotation.z = Math.sin(state.elapsed * 9) * 0.35;
  }

  // Dizzy Halo!
  kittyRig.dizzyHalo.visible = b.dizzyTimer > 0 && b.popTimer <= 0;
  if (kittyRig.dizzyHalo.visible) {
    kittyRig.dizzyHalo.rotation.y += 5.5 * dt;
    kittyRig.kitty.rotation.z = Math.sin(state.elapsed * 16) * 0.25;
  } else {
    kittyRig.kitty.rotation.z = 0;
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

  // Smooth Isometric Follow Camera (classic Hamsterball elevated 3/4 angle!)
  const desired = new THREE.Vector3(b.x + 7.2, Math.max(b.y + 9.2, 4), b.z + 10.6);
  state.camPos.lerp(desired, Math.min(1, dt * 6.5));
  camera.position.copy(state.camPos);
  camera.lookAt(b.x, b.y - 0.4, b.z - 1.5);
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
window.addEventListener("keydown", (e) => {
  if (state && state.phase === "playing") state.input.keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  if (state) state.input.keys.delete(e.code);
});

// Buttons
document.getElementById("btn-tourney").onclick = () => loadTrack(0, "tourney", 0);
document.getElementById("btn-practice").onclick = () => loadTrack(selectedPracticeTrack, "practice", 0);
document.getElementById("btn-back").onclick = () => {
  if (state) state.phase = "ended";
  sfx.stopBgm();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
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

// Boot with Track 0 preview rendered live behind Lobby!
const initBuilt = buildTrackScene(TRACKS[0]);
trackRoot = initBuilt.group;
scene.background = new THREE.Color(TRACKS[0].skyTop);
scene.fog = new THREE.Fog(TRACKS[0].fogColor, 26, 92);
scene.add(trackRoot);
renderLobby();
requestAnimationFrame(tick);
