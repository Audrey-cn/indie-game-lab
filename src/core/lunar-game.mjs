import * as THREE from "three";
import { earthDirection, LUNAR_SUN_OFFSET } from "../rendering/three-visuals.mjs";
import { createRoverContactPass } from "../rendering/lunar-contact.mjs";
import { createLunarLighting } from "../rendering/lunar-lighting.mjs";
import { oreClearance } from "../simulation/lunar-collision.mjs";
import { createMiningEffects, CUT_END, CUT_START } from "../world/lunar-mining.mjs";
import { createLunarDust } from "../rendering/lunar-dust.mjs";
import { createLunarTracks } from "../rendering/lunar-tracks.mjs";
import { createMissionNotices } from "../ui/lunar-mission-notices.mjs";
import { createExpeditionAudio, renderExpeditionAudio } from "../audio/lunar-audio.mjs";
import { addLunarFieldDetails } from "../world/lunar-field-details.mjs";
import { createLunarSurvey, SURVEY_SITES } from "../world/lunar-survey.mjs";
import { bindLunarEarthObservatory, canObserveEarth, EARTH_SITE, installEarthTelescope, isNearEarthObservatory } from "../ui/lunar-earth-observatory.mjs";
import { createLunarAmbientActivity, DUST_MONITOR_SITE } from "../world/lunar-ambient-activity.mjs";
import { createLunarBase } from "../world/lunar-base.mjs";
import { createRelay, createObservatory, RELAY_SITE, OBSERVATORY_SITE } from "../world/lunar-expansion.mjs";
import { createPowerStation } from "../world/lunar-power-station.mjs";
import { createScoutDrone } from "../simulation/lunar-scout.mjs";
import { createLunarCompanion } from "../simulation/lunar-companion.mjs";
import { createLunarUplink } from "../rendering/lunar-uplink.mjs";
import { createCompanionLines } from "../ui/lunar-companion-lines.mjs";
import { createLunarLocale } from "./lunar-ui-locale.mjs";
import { createOnboarding } from "../ui/lunar-onboarding.mjs";
import { createTitleCinematic } from "./lunar-title-cinematic.mjs";
import { createMissionGuidance } from "../ui/lunar-guidance.mjs";
import { createLunarActionCamera } from "../ui/lunar-action-camera.mjs";
import { createFoundationPreview } from "../world/lunar-foundation.mjs";
import { createConstructionTransfer } from "../world/lunar-construction-transfer.mjs";
import { bindLunarFullscreen, bindLunarJoystick, bindLunarLook } from "../ui/lunar-mobile.mjs";
import { createLunarRover, roverTireDeflection } from "../world/lunar-rover.mjs";
import { ARENA_LIMIT, BUILD_SAMPLES, BUILD_SURVEYS, DATA_TRANSFER_SECONDS, OBSERVATORY_SAMPLES, OBSERVATORY_SURVEYS, HIT_PENALTY, POWER_SITE, RETURN_RADIUS, SURVEY_MIN_ORE, SURVEY_REQUIRED, createState, expeditionGrade, readyToUpload, step } from "../simulation/lunar-rules.mjs";
import { buildCrystalField, buildLunarTerrain, buildStationFurniture, createGlowFactory, createReflectionEnvironment, createSharedMaterials, terrainHeight as height } from "../world/lunar-world.mjs";
import { createRadarRenderer } from "../ui/lunar-radar.mjs";
import { createArcadeSprint, createCameraJuice } from "../simulation/lunar-arcade.mjs";
import { createLunarDebugOverlay } from "../ui/lunar-debug-overlay.mjs";

const locale = createLunarLocale();
const { t } = locale;
const languageKey = "selene-language";
try { locale.set(localStorage.getItem(languageKey)); } catch { locale.set("zh-CN"); }
const boot = document.querySelector("#initializing");
const bootMeter = document.querySelector("#boot-meter");
const bootStatus = document.querySelector("#boot-status");
const bootRetry = document.querySelector("#boot-retry");
const titlePosterElement = document.querySelector("#title-poster");
const hasEmbeddedTitleMedia = Boolean(titlePosterElement?.getAttribute("src")?.startsWith("data:"));
const reducedMotionMedia = matchMedia("(prefers-reduced-motion: reduce)");
const setTitleActive = createTitleCinematic(
  document.querySelector("#title-cinematic"),
  document.querySelector("#title-media-data"),
);
bootRetry.addEventListener("click", () => location.reload());

function bootStep(value, label) {
  bootMeter.value = value;
  bootStatus.textContent = label;
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function enterLunarStation() {
  await bootStep(8, t("检查图形环境", "Checking graphics"));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080e17);

const camera = new THREE.PerspectiveCamera(43, 1, 0.06, 300);
const viewport = document.querySelector("#viewport");
const mobileGraphics = matchMedia("(pointer: coarse)").matches;
const renderer = new THREE.WebGLRenderer({ antialias: !mobileGraphics, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = !mobileGraphics;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.transmissionResolutionScale = mobileGraphics ? 0.57 : 0.80;
viewport.append(renderer.domElement);
const lighting = createLunarLighting(renderer, scene, camera, { mobile: mobileGraphics });
let mainRenderCalls = 0;
let redrawPausedScene = true;

const hemi = new THREE.HemisphereLight(0xbcb9bf, 0xc3b6a8, 0.54);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e4, 5.70);
sun.position.set(...LUNAR_SUN_OFFSET);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(mobileGraphics ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 42 });
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.023;
lighting.setSun(sun);
scene.add(sun, sun.target);
const solarKeyOffset = sun.position.clone();
const fill = new THREE.DirectionalLight(0xb5c2d7, 0.15);
fill.position.set(6, 4, 11);
scene.add(fill);

scene.environment = createReflectionEnvironment(renderer);
scene.environmentIntensity = 0.45;

await bootStep(28, t("烘制月壤、远坡与科研站", "Preparing terrain and the field station"));
const { ground, tallRockFixtures, sampleRockSupport, lowRockSupports, wheelSurface } = buildLunarTerrain(scene, renderer, camera, sun, { mobile: mobileGraphics });
const ambientActivity = createLunarAmbientActivity(scene, height, { sunlight: solarKeyOffset });
const sharedMats = createSharedMaterials();
const { silver, slateMetal, ice, amber, roadMarks } = sharedMats;
const { glow, glowTexture } = createGlowFactory();
const fieldHardware = addLunarFieldDetails(scene, height, { glow });

// Small patches of occlusion under the tires and chassis keep contact
// readable even where the sun's shadow lies outside the camera.
function makeContactPatch(width, length, opacity) {
  const geometry = new THREE.PlaneGeometry(width, length, 4, 4);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x0e0d0d, map: glowTexture, opacity, transparent: true,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, flat: geometry.attributes.position.array.slice() };
}

const tireContacts = Array.from({ length: 6 }, () => makeContactPatch(0.48, 0.56, 0.90));

function layContactPatch(patch, x, z, cosine, sine) {
  const positions = patch.mesh.geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const sx = patch.flat[index * 3], sz = patch.flat[index * 3 + 2];
    const px = x + sx * cosine + sz * sine;
    const pz = z - sx * sine + sz * cosine;
    positions.setXYZ(index, px, wheelSurface(px, pz) + 0.012, pz);
  }
  positions.needsUpdate = true;
}

await bootStep(54, t("检查工坊、车辆和巡检设备", "Preparing rover and field equipment"));
const base = createLunarBase({ height, glow, displayProgressStep: mobileGraphics ? 5 : 1 });
scene.add(base.station);
const workshopPoint = { x: base.workshopPoint.x, z: base.workshopPoint.z, radius: base.visitRadius, access: base.workshopAccess };
function buildSite(site, index, make, name, nameEn) {
  const structure = make(scene, height, site);
  return { site: { ...site, index, name, nameEn }, structure,
    preview: createFoundationPreview(scene, wheelSurface, site, structure.obstacle, t) };
}
const relayPads = [RELAY_SITE, { x: 20.5, z: -14.7, radius: 1.95 }]
  .map((site, i) => buildSite(site, i, createRelay, `中继地基 ${i ? "B" : "A"}`, `Relay site ${i ? "B" : "A"}`));
const observatoryPads = [OBSERVATORY_SITE, { x: -20.7, z: 11.4, radius: 1.95 }]
  .map((site, i) => buildSite(site, i, createObservatory, `观测站地基 ${i ? "B" : "A"}`, `Survey site ${i ? "B" : "A"}`));
const powerPad = buildSite(POWER_SITE, 0, createPowerStation, POWER_SITE.name, "Solar station");
let selectedRelay = relayPads[0], selectedObservatory = observatoryPads[0];
let fixedRelay = null, fixedObservatory = null;
let constructionCheck = null;
let constructionPreviewAt = -1;
let activeFooting = null;
let buildKeyWasDown = false;
const offlineFacility = { phase: "ready", buildStage: null, buildContext: null, buildProgress: 0 };
const scout = createScoutDrone(scene, height, { occluders: [base.station], scanTargets: [
  { x: 6.9, z: -9.1, aimHeight: 0.50, radius: 0.57 },
  ...SURVEY_SITES.map((site, i) => ({ ...site, aimHeight: i ? 0.38 : 0.25, radius: 0.39 })),
  { ...DUST_MONITOR_SITE, object: ambientActivity.monitor },
  { x: -8.12, z: -10.50, aimHeight: 0.20, radius: 0.45, object: fieldHardware },
] });
const hazard = scout.hazard;

const { solarBanks, padRings, dockLights, receiver, dataDestination } = buildStationFurniture(scene, sharedMats, glow);

const roverRig = createLunarRover({ glow });
const { rover, wheelHubs, updateSuspension, updateSampler, canReachSample, getSamplerTip, getSamplerStorage, resetSampler } = roverRig;
const wheelTravel = wheelHubs.map(() => null);
const wheelOmega = wheelHubs.map(() => 0);
rover.rotation.y = -0.53;
scene.add(rover);
const dataOrigin = new THREE.Vector3();
const uplink = createLunarUplink(scene, { groundHeight: height, mobileGraphics, duration: DATA_TRANSFER_SECONDS });
const construction = createConstructionTransfer(scene, height, base, roverRig);
lighting.setBounceSources({ height, rover, workshop: base.station });
const contactPass = createRoverContactPass(renderer, scene, rover, height);

const miningEffects = createMiningEffects(scene, height);
const drillTip = new THREE.Vector3(), storagePosition = new THREE.Vector3(), corePosition = new THREE.Vector3();
let cargo = null;
let activeCut = null;
let clearingCut = -1;
let storedSamples = 0;
let bitEngaged = false;
const { crystals, crystalMeshes } = buildCrystalField(scene, sharedMats);
const fieldSurvey = createLunarSurvey(scene, height);
const earthTelescope = installEarthTelescope(scene, height, earthDirection);
const fixtures = [...crystals, ...SURVEY_SITES.map(site => ({ x: site.x, z: site.z, radius: 0.29 })),
  base.obstacle, earthTelescope, { x: receiver.position.x, z: receiver.position.z, radius: 0.19 },
  ...relayPads.map(pad => pad.structure.obstacle),
  ...observatoryPads.map(pad => pad.structure.obstacle), ...tallRockFixtures];
const poweredFixtures = [...fixtures, powerPad.structure.obstacle];
const arcade = createArcadeSprint(scene, height);
const cameraJuice = createCameraJuice();

const tracks = createLunarTracks(ground.material, { extent: ARENA_LIMIT + 2 });

const lunarDust = createLunarDust(scene, height, { sunlight: solarKeyOffset });
let dustEmissions = 0;

function wheelGround(x, z, cosine, sine) {
  const worldX = state.x + cosine * x + sine * z;
  const worldZ = state.z - sine * x + cosine * z;
  return { x: worldX, z: worldZ, y: wheelSurface(worldX, worldZ),
    rockRise: sampleRockSupport(worldX, worldZ) };
}

const startCampaign = document.querySelector("#start-campaign");
const startArcade = document.querySelector("#start-arcade");
const debugToggle = document.querySelector("#debug-toggle");
const mainMenuButton = document.querySelector("#main-menu");
const settings = document.querySelector("#settings");
const settingsOpen = document.querySelector("#settings-open");
const buildButton = document.querySelector("#build-action");
const brakeButton = document.querySelector("#brake-touch");
const restart = document.querySelector("#restart");
const score = document.querySelector("#score");
const scoreMetricLabel = score.closest(".metric")?.querySelector("dt");
const qualityCount = document.querySelector("#quality-count");
const qualityLabel = qualityCount.previousElementSibling;
const surveyCount = document.querySelector("#survey-count");
const surveyLabel = surveyCount.previousElementSibling;
const musicToggle = document.querySelector("#music-toggle");
const timer = document.querySelector("#timer");
const speed = document.querySelector("#speed");
const objective = document.querySelector("#objective");
const status = document.querySelector("#status");
const brief = document.querySelector("#brief");
const debrief = document.querySelector("#mission-debrief");
const overlay = document.querySelector("#overlay");
const missionNotices = createMissionNotices(document.querySelector("#guide"), {
  translate: text => t(...text), onScout: () => playCue("companion"),
});
const scoutLines = createCompanionLines();
const audioToggle = document.querySelector("#audio-toggle");
const languageSelect = document.querySelector("#language-select");
const pauseButton = document.querySelector("#pause");
const resumeButton = document.querySelector("#resume");
const energyMeter = document.querySelector("#energy-meter");
const energyPercent = document.querySelector("#energy-percent");
const energyLabel = document.querySelector("#energy-label");
const scanButton = document.querySelector("#interact");
const boostButton = document.querySelector("#boost");
const radar = document.querySelector("#radar");
const radarRenderer = createRadarRenderer(radar);
const radarToggle = document.querySelector("#radar-toggle");
const navigation = radar.closest(".navigation");
const earthObservatory = bindLunarEarthObservatory({
  earth: earthDirection, sun: solarKeyOffset, isTouch: () => touchDevice,
  onOpen() {
    releaseInputs();
    setRadarLegend(false);
    audio.drive();
    if (document.pointerLockElement !== renderer.domElement) return;
    cameraWasLocked = false;
    document.exitPointerLock();
  },
  onClose: requestCameraLock,
  t,
  onArchived: () => missionNotices.post("earth-photo", ["地球观测图像已归档", "Earth image archived"], "result", motionTime),
});

function setRadarLegend(expanded) {
  radarToggle.setAttribute("aria-expanded", String(expanded));
}
radarToggle.addEventListener("click", () => setRadarLegend(radarToggle.getAttribute("aria-expanded") !== "true"));

let state = createState(height(0, 0), "campaign");
let motionTime = 0;
let recentInstallation = null;
let soundEnabled = true;
let musicEnabled = true;
let navigationGoal = null;
const guidance = createMissionGuidance({
  height, marker: document.querySelector("#mission-marker"), notice: document.querySelector("#guide"),
  blocked: (x, y, z, target) => target.id !== "workshop" && tallRockFixtures.some(rock =>
    rock.top > y && Math.hypot(rock.x - x, rock.z - z) < rock.radius * 0.80),
});
let touchTask = null;
let touchBrake = false;
let reverseBrakeAt = Infinity;
let lastRoughCue = -1;
const wheelAudio = wheelHubs.map(() => ({ speed: 0, slip: 0, load: 0, grounded: false }));
let paused = false;
let touchBoost = false;
let audioClock = -1;
const audio = createExpeditionAudio();
const pendingAudioCues = [];
let audioFrame = { active: false, cues: [] };
const inputs = new Set();
const moves = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyE", "KeyR", "ShiftLeft", "ShiftRight"]);
let touchDevice = matchMedia("(pointer: coarse)").matches;
document.body.dataset.input = touchDevice ? "touch" : "keyboard";
const fullscreen = bindLunarFullscreen({
  toggle: document.querySelector("#fullscreen-toggle"), isTouch: () => touchDevice,
  beforeEnter: () => settings.close(), onExit: releaseInputs, t,
});
const onboarding = createOnboarding(() => touchDevice, t, locale.updateStatic);
const companion = createLunarCompanion(scene, height, {
  mobileGraphics, clearance: companionClearance, onScanned: reportCompanionScan,
});
const joystick = bindLunarJoystick({
  element: document.querySelector("#joystick"), viewport, isPlaying: () => state.phase === "playing" && !paused,
});
const titleCameraPosition = new THREE.Vector3(2.82, 1.29, 3.62);
const titleCameraTarget = new THREE.Vector3(-3.4, 0.86, -0.73);
const cameraTarget = titleCameraTarget.clone();
const targetPosition = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const cameraOrbit = { yaw: 0, pitch: 0, idle: 0 };
const actionFocus = new THREE.Vector3();
const installationAxis = new THREE.Vector3();
const habitatRay = new THREE.Ray();
const habitatCameraEnd = new THREE.Vector3();
const habitatIntersection = new THREE.Vector3();
const habitatShell = new THREE.Box3(new THREE.Vector3(-1.58, 0.30, -1.02), new THREE.Vector3(1.58, 2.28, 1.07));
const habitatBench = new THREE.Box3(new THREE.Vector3(0.08, 0.35, 0.99), new THREE.Vector3(1.47, 1.81, 1.46));
const cameraPreference = matchMedia("(prefers-reduced-motion: reduce)");
const cameraSetting = document.querySelector("#action-camera-toggle");
let showActionDetails = true;
try { showActionDetails = localStorage.getItem("selene-action-camera") !== "off"; } catch { /* Use the session default. */ }
function reflectCameraPreference() {
  if (!cameraSetting) return;
  const enabled = showActionDetails && !cameraPreference.matches;
  cameraSetting.textContent = enabled ? t("操作特写开", "Action camera on") : t("操作特写关", "Action camera off");
  cameraSetting.setAttribute("aria-pressed", String(enabled));
  cameraSetting.disabled = cameraPreference.matches;
}
cameraPreference.addEventListener("change", reflectCameraPreference);
cameraSetting?.addEventListener("click", () => {
  showActionDetails = !showActionDetails;
  try { localStorage.setItem("selene-action-camera", showActionDetails ? "on" : "off"); } catch { /* Keep the session choice. */ }
  reflectCameraPreference();
});
reflectCameraPreference();
const actionCamera = createLunarActionCamera({
  height,
  reducedMotion: { get matches() { return cameraPreference.matches || !showActionDetails; } },
  blocked: (x, y, z) => tallRockFixtures.some(rock => rock.top + 0.12 > y
    && (rock.x - x) ** 2 + (rock.z - z) ** 2 < (rock.radius + 0.10) ** 2),
});
let manualLookSeconds = 0;
function moveCameraLook(dx, dy) {
  const { clamp, euclideanModulo } = THREE.MathUtils;
  cameraOrbit.yaw = euclideanModulo(cameraOrbit.yaw - dx * 0.007 + Math.PI, 2 * Math.PI) - Math.PI;
  cameraOrbit.pitch = clamp(cameraOrbit.pitch + dy * 0.005, -0.70, 0.82);
  if (Math.abs(dx) + Math.abs(dy) > 1) manualLookSeconds = 0.5;
}
const cameraLook = bindLunarLook({
  viewport, isPlaying: () => state.phase === "playing" && !paused,
  move: moveCameraLook,
});
const radarInset = 12;
camera.position.copy(titleCameraPosition);
camera.lookAt(cameraTarget);

function switchInput(touch) {
  if (touchDevice === touch) return;
  releaseInputs();
  setRadarLegend(false);
  touchDevice = touch;
  if (touchDevice && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  document.body.dataset.input = touch ? "touch" : "keyboard";
  fullscreen.sync();
  resize();
}
let cameraWasLocked = false;
let cameraUnlockedAt = -Infinity;
function requestCameraLock() {
  if (touchDevice || state.phase !== "playing" || paused || document.pointerLockElement === renderer.domElement) return;
  // Browsers either return a Promise or report refusal through pointerlockerror.
  try { renderer.domElement.requestPointerLock?.()?.catch(() => {}); } catch { /* Canvas remains available to click again. */ }
}
renderer.domElement.addEventListener("click", requestCameraLock);
document.addEventListener("mousemove", event => {
  if (document.pointerLockElement === renderer.domElement && !paused && state.phase === "playing") {
    moveCameraLook(event.movementX, event.movementY);
  }
});
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer.domElement;
  document.body.dataset.cameraLock = String(locked);
  if (locked) {
    cameraWasLocked = true;
    if (touchDevice || paused || state.phase !== "playing" || document.hidden) document.exitPointerLock();
  } else if (cameraWasLocked) {
    cameraWasLocked = false;
    cameraUnlockedAt = performance.now();
    if (!touchDevice && !paused && state.phase === "playing") setPaused(true);
  }
});
document.addEventListener("pointerdown", event => {
  if (radarToggle.getAttribute("aria-expanded") === "true" && !navigation.contains(event.target)) setRadarLegend(false);
  if (event.pointerType === "touch") switchInput(true);
  else if (event.pointerType === "mouse" && event.target === renderer.domElement) switchInput(false);
}, { capture: true });
function openEarthObservatory() {
  if (paused || state.phase !== "playing" || navigationGoal?.id !== EARTH_SITE.id || !canObserveEarth(state)) return false;
  earthObservatory.show();
  return true;
}
document.addEventListener("keydown", (event) => {
  if (onboarding.manualOpen || settings.open || earthObservatory.open) return;
  if (event.code === "KeyE" && !event.repeat && openEarthObservatory()) {
    event.preventDefault();
    return;
  }
  if (event.code === "KeyK" && state.phase === "playing" && !paused && !event.repeat) {
    event.preventDefault();
    state.y = Math.max(state.y, wheelSurface(state.x, state.z)) + 0.32;
    state.vy = 0.65;
    state.pitch = state.roll = state.pitchRate = state.rollRate = 0;
    state.vx *= 0.25;
    state.vz *= 0.25;
    playCue("boost");
    cameraJuice.impulse(0.22);
    missionNotices.post(`recover:${Math.floor(motionTime)}`, ["姿态已回正脱困", "Rover stabilized"], "result", motionTime);
    return;
  }
  if (["Escape", "KeyP"].includes(event.code) && state.phase === "playing" && !event.repeat) {
    event.preventDefault();
    if (event.code === "Escape" && paused && performance.now() - cameraUnlockedAt < 250) return;
    setPaused(!paused);
    if (!paused) requestCameraLock();
    return;
  }
  if (!moves.has(event.code) || state.phase !== "playing" || paused) return;
  event.preventDefault();
  switchInput(false);
  inputs.add(event.code);
});
document.addEventListener("keyup", (event) => inputs.delete(event.code));
function releaseInputs() {
  inputs.clear();
  joystick.reset();
  cameraLook.reset();
  for (const release of releaseTouchButtons) release();
  touchTask = null;
  touchBoost = touchBrake = false;
  reverseBrakeAt = Infinity;
}
function suspendInputs() {
  releaseInputs();
  if (document.hidden) audio.drive();
  if (document.pointerLockElement === renderer.domElement) setPaused(true);
}
window.addEventListener("blur", suspendInputs);
document.addEventListener("visibilitychange", suspendInputs);
matchMedia("(orientation: portrait)").addEventListener("change", () => {
  releaseInputs();
  setRadarLegend(false);
});

const releaseTouchButtons = [];
function holdTouchButton(button, set) {
  let id = null;
  function release() {
    if (id === null) return;
    const held = id;
    id = null;
    button.removeAttribute("data-held");
    set(false);
    if (button.hasPointerCapture(held)) button.releasePointerCapture(held);
  }
  button.addEventListener("pointerdown", event => {
    if (id !== null || paused || state.phase !== "playing" || button.hidden) return;
    event.preventDefault();
    id = event.pointerId;
    button.setPointerCapture(id);
    button.dataset.held = "true";
    set(true);
  });
  const end = event => {
    if (event.pointerId === id) release();
  };
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("lostpointercapture", end);
  releaseTouchButtons.push(release);
}
function tapTouchAction(key, button) {
  if (!touchDevice || paused || state.phase !== "playing" || button.hidden) return;
  if (touchTask?.key === key) {
    touchTask = null;
    return;
  }
  const goal = navigationGoal;
  if (!goal?.touchAction || goal.control.key !== key || cargo) return;
  const installing = key === "R" && state.buildStage?.startsWith("deploy");
  const pad = installing ? activeFooting : null;
  if (installing && !pad) return;
  if (pad && !constructionCheck?.visible) {
    constructionPreviewAt = motionTime;
    return;
  }
  if (pad && !constructionCheck?.valid) return;
  touchTask = { key, id: goal.id, pad };
}
scanButton.addEventListener("click", () => { if (!openEarthObservatory()) tapTouchAction("E", scanButton); });
buildButton.addEventListener("click", () => tapTouchAction("R", buildButton));
holdTouchButton(boostButton, value => { touchBoost = value; });
holdTouchButton(brakeButton, value => {
  touchBrake = value;
  const still = state.grounded && Math.hypot(state.vx, state.vz) <= 0.18 && Math.abs(state.yawRate) <= 0.22;
  const busy = touchTask || touchBoost || state.scanHold || state.surveyHold || state.buildHold || cargo;
  reverseBrakeAt = value && still && !busy && !joystick.read().active ? motionTime + 0.48 : Infinity;
});
function applyAudioSettings() {
  audioToggle.setAttribute("aria-pressed", String(soundEnabled));
  audioToggle.querySelector(".toggle-copy").textContent = soundEnabled ? t("音效开", "Effects on") : t("音效关", "Effects off");
  audio.setEnabled(soundEnabled);
  musicToggle.setAttribute("aria-pressed", String(musicEnabled));
  musicToggle.querySelector(".toggle-copy").textContent = musicEnabled ? t("音乐开", "Music on") : t("音乐关", "Music off");
  audio.setMusicEnabled(musicEnabled);
}
const audioPreferencesKey = "selene-audio-settings";
try {
  const preferences = JSON.parse(localStorage.getItem(audioPreferencesKey));
  soundEnabled = preferences?.sound !== false;
  musicEnabled = preferences?.music !== false;
} catch { /* File origins and storage-restricted contexts still support session settings. */ }
applyAudioSettings();
function saveAudioSettings() {
  applyAudioSettings();
  try { localStorage.setItem(audioPreferencesKey, JSON.stringify({ sound: soundEnabled, music: musicEnabled })); } catch { /* Keep session settings. */ }
}
audioToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  saveAudioSettings();
});
musicToggle.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  saveAudioSettings();
});
languageSelect.addEventListener("change", () => {
  locale.set(languageSelect.value);
  try { localStorage.setItem(languageKey, locale.language); } catch { /* Use the session choice. */ }
  applyAudioSettings();
  reflectCameraPreference();
  fullscreen.sync();
  onboarding.refreshLanguage();
  earthObservatory.refreshLanguage?.();
  navigationGoal = currentGoal();
  showPhase();
  updateHud();
});
settingsOpen.addEventListener("click", () => settings.showModal());

function playCue(name, strength = 1) {
  if (LUNAR_QA && soundEnabled) pendingAudioCues.push(strength === 1 ? name : { name, strength });
  audio.cue(name, strength);
}

function showPhase() {
  if (paused || state.phase !== "playing") setRadarLegend(false);
  if ((paused || state.phase !== "playing") && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  document.body.dataset.phase = state.phase;
  document.body.dataset.mission = state.mission;
  document.body.dataset.paused = String(paused);
  setTitleActive(state.phase === "ready" && document.body.dataset.boot === "ready");
  overlay.hidden = state.phase === "playing" && !paused;
  startCampaign.hidden = state.phase !== "ready";
  if (startArcade) startArcade.hidden = state.phase !== "ready";
  debrief.hidden = state.phase !== "won";
  mainMenuButton.hidden = state.phase === "ready" || (state.phase === "playing" && !paused);
  restart.hidden = state.phase === "ready" || (state.phase === "playing" && !paused);
  resumeButton.hidden = !paused;
  if (state.phase === "ready") {
    status.textContent = t("月面采集站", "Lunar Field Station");
    brief.textContent = t("驾驶月球车勘测南极，建立通信、测绘与供电。", "Drive the rover across the lunar south pole and set up communications, mapping, and power.");
  } else if (paused) {
    status.textContent = t("任务暂停", "Mission paused");
    brief.textContent = state.mission === "arcade"
      ? t(`极速采集 · 当前得分 ${arcade.score}（最高连击 ×${arcade.maxCombo}）。`, `Arcade Sprint · Score ${arcade.score} (Max Combo ×${arcade.maxCombo}).`)
      : t(`已封存 ${state.collected} / ${crystals.length} 份。继续后从当前位置出发。`, `${state.collected} / ${crystals.length} samples stored. Resume at your current position.`);
  } else if (state.phase === "won") {
    if (state.mission === "arcade") {
      status.textContent = t("极速采集完成", "Sprint Complete");
      brief.textContent = t(`60 秒极速挑战结束！得分 ${arcade.score} · 采集 ${arcade.captures} 个信标 · 最高连击 ×${arcade.maxCombo} · 低重力飞跃 ${arcade.jumps} 次。`,
        `60s Sprint finished! Score ${arcade.score} · ${arcade.captures} beacons · Max Combo ×${arcade.maxCombo} · ${arcade.jumps} Air Jumps.`);
      debrief.textContent = t(`历史最高分 ${arcade.best.score}（×${arcade.best.maxCombo}）`, `Personal Best ${arcade.best.score} (×${arcade.best.maxCombo})`);
      playCue("won");
      restart.focus();
      return;
    }
    status.textContent = state.mission === "campaign" ? t("月面有了下一站", "The Moon Has a Waystation")
      : state.mission === "construction" ? t("长夜里，有了回音", "A Signal in the Dark")
        : t("这里有了第一张地图", "The First Map");
    const elapsed = Math.round(motionTime);
    brief.textContent = state.mission === "campaign"
      ? t("你在月球南极接通了通信、测绘与供电。下一支车队会循着你留下的信号穿过长夜，在这里补给，再驶向地图之外。",
        "You brought communications, mapping, and power to the lunar south pole. The next crew will follow your signal through the dark, resupply here, and drive beyond the map.")
      : state.mission === "construction"
      ? t("这片坡地有了自己的信号。下一支队伍在出发前，就能看见你走过的地形，知道该往哪里去。",
        "These slopes have a signal of their own. The next crew can see the ground you crossed and plot a route before they set out.")
      : t("你把一段无人走过的路带回了基地。下一次出发，车队会从你的最后一个坐标继续向前。",
        "You brought back a route where the map was blank. The next crew will pick up at your last coordinate.");
    const grade = state.mission === "survey" ? t(` · 评级 ${expeditionGrade(state)}`, ` · Grade ${expeditionGrade(state)}`) : "";
    debrief.textContent = t(`勘测记录 ${state.surveyCount} · 晶样 ${state.collected} · 用时 ${elapsed} 秒`,
      `Readings ${state.surveyCount} · Samples ${state.collected} · ${elapsed}s`) + grade;
    playCue("won");
    restart.focus();
  } else if (state.phase === "lost") {
    status.textContent = t("时间耗尽", "Time expired");
    brief.textContent = t(`已采集 ${state.collected} 份晶样，其中 ${state.qualityCount} 份完整。`, `Collected ${state.collected} samples, ${state.qualityCount} intact.`);
    playCue("lost");
    restart.focus();
  }
}
function setPaused(value) {
  if (state.phase !== "playing") return;
  paused = value;
  if (paused) redrawPausedScene = true;
  releaseInputs();
  if (!paused) void audio.unlock();
  audio.drive({ active: !paused });
  showPhase();
  if (paused) resumeButton.focus();
  else resumeButton.blur();
}
function begin(mission, playing = true) {
  if (document.pointerLockElement === renderer.domElement) {
    cameraWasLocked = false;
    document.exitPointerLock();
  }
  paused = false;
  audioClock = -1;
  if (playing) {
    if (LUNAR_QA && soundEnabled) pendingAudioCues.push("launch");
    void audio.unlock().then(unlocked => { if (unlocked && state.phase === "playing") audio.cue("launch"); });
  } else {
    audio.drive();
  }
  const isArcade = mission === "arcade";
  state = createState(height(0, 0), isArcade ? "survey" : mission);
  if (isArcade) state.mission = "arcade";
  state.phase = playing ? "playing" : "ready";
  if (isArcade && playing) arcade.start(state);
  else arcade.stop();
  cameraJuice.reset();
  if (playing) audio.drive({ active: true });
  scout.reset();
  companion.reset();
  uplink.reset();
  roverRig.aimDataDish(null, 1);
  rover.rotation.set(0, state.yaw, 0, "YXZ");
  motionTime = 0;
  cameraOrbit.yaw = cameraOrbit.pitch = cameraOrbit.idle = 0;
  recentInstallation = null;
  navigationGoal = null;
  guidance.reset();
  fixedRelay = fixedObservatory = null;
  selectedRelay = relayPads[0];
  selectedObservatory = observatoryPads[0];
  constructionCheck = activeFooting = null;
  construction.reset();
  constructionPreviewAt = -1;
  buildKeyWasDown = false;
  lastRoughCue = -1;
  missionNotices.reset();
  scoutLines.reset();
  earthObservatory.reset();
  tracks.reset();
  lunarDust.reset();
  resetSampler?.();
  miningEffects.reset();
  for (const { bore } of crystalMeshes) bore.reset();
  cargo = activeCut = null;
  clearingCut = -1;
  storedSamples = 0;
  bitEngaged = false;
  dustEmissions = 0;
  wheelHubs.forEach(({ hub }) => { hub.rotation.x = 0; });
  wheelTravel.fill(null);
  wheelOmega.fill(0);
  releaseInputs();
  showPhase();
  updateHud();
  document.activeElement?.blur();
}
function enterPlayView() {
  if (touchDevice) fullscreen.enterByDefault();
  else requestCameraLock();
}
startCampaign.addEventListener("click", () => {
  begin("campaign");
  enterPlayView();
});
startArcade?.addEventListener("click", () => {
  begin("arcade");
  enterPlayView();
});
restart.addEventListener("click", () => {
  begin(state.mission);
  enterPlayView();
});
mainMenuButton.addEventListener("click", () => begin("campaign", false));
pauseButton.addEventListener("click", () => setPaused(true));
resumeButton.addEventListener("click", () => {
  setPaused(false);
  enterPlayView();
});

function drawRadar() {
  radarRenderer.draw({ state, crystals, hazard, navigationGoal, motionTime, arcadeTarget: arcade.target });
}
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}
function nextBuildLocation(stage) {
  if (stage?.startsWith("fabricate")) return workshopPoint;
  if (stage === "deploy") return selectedRelay.site;
  if (stage === "deployPower") return powerPad.site;
  if (stage === "deployObservatory" || stage === "calibrateObservatory") return selectedObservatory.site;
  return null;
}
function distanceTo(site) { return Math.hypot(site.x - state.x, site.z - state.z); }

function chooseFooting(pads, previous) {
  const other = pads.find(pad => pad !== previous);
  return distanceTo(other.site) + 0.55 < distanceTo(previous.site) ? other : previous;
}

function prepareConstruction(controls) {
  const previousDown = buildKeyWasDown;
  buildKeyWasDown = controls.build;
  if (state.buildStage === "deploy" && !fixedRelay) selectedRelay = chooseFooting(relayPads, selectedRelay);
  if (state.buildStage === "deployObservatory" && !fixedObservatory) {
    selectedObservatory = chooseFooting(observatoryPads, selectedObservatory);
  }
  const pad = state.buildStage === "deploy" ? selectedRelay
    : state.buildStage === "deployObservatory" ? selectedObservatory : state.buildStage === "deployPower" ? powerPad : null;
  const accessible = state.phase === "playing" && !paused && pad && distanceTo(pad.site) <= pad.site.radius;
  if (activeFooting && (activeFooting !== pad || !accessible)) activeFooting.preview.update(false, state);
  constructionCheck = null;
  if (!accessible) {
    if (pad) controls.build = false;
    activeFooting = null;
    return;
  }
  if (activeFooting !== pad) {
    constructionPreviewAt = -1;
    activeFooting = pad;
  }
  if (controls.build && !previousDown && (constructionPreviewAt < 0 || motionTime - constructionPreviewAt > 4.5)) {
    constructionPreviewAt = motionTime;
  }
  const visible = constructionPreviewAt >= 0 && (controls.build || motionTime - constructionPreviewAt < 4.5);
  const check = pad.preview.update(visible && !state.buildHold, state);
  constructionCheck = { ...check, visible, selected: pad.site.name, index: pad.site.index };
  controls.build &&= visible && check.valid && motionTime - constructionPreviewAt >= 0.28;
}

const siteNumber = index => String(index + 1).padStart(2, "0");
function goalForOre(index) {
  return { ...crystals[index], id: `ore-${index}`, name: t(`晶样 ${siteNumber(index)}`, `Sample ${siteNumber(index)}`), height: 1.10 };
}
function goalForSurvey(index) {
  const site = SURVEY_SITES[index];
  return { ...site, name: t(site.name, site.nameEn), id: `survey-${index}`, height: 0.91 };
}
const constructionPhaseEn = {
  "工坊出箱": "Releasing the kit", "机械臂装载": "Loading the kit", "套件固定": "Securing the kit",
  "夹取套件": "Picking up the kit", "机械臂落箱": "Lowering the kit", "套件解锁": "Unlocking the case", "设施展开": "Unfolding the station",
};
function closestGoal(choices) {
  return choices.find(choice => choice.id === navigationGoal?.id) ??
    choices.reduce((closest, choice) => !closest || distanceTo(choice) < distanceTo(closest) ? choice : closest, null);
}

function currentGoal() {
  if (paused || state.phase !== "playing") return null;
  if (arcade.active && arcadeTargetGoal) {
    return { ...arcadeTargetGoal, name: t(arcadeTargetGoal.name, arcadeTargetGoal.nameEn) };
  }
  if (state.dataTransfer) {
    const x = receiver.position.x, z = receiver.position.z;
    return { id: "data-uplink", name: t("着陆区接收端", "Landing receiver"), x, z,
      marker: dataDestination, distance: distanceTo(receiver.position), ready: true,
      work: { label: t("数据传输", "Sending data"), progress: state.transferProgress } };
  }
  let goal = null;
  const build = nextBuildLocation(state.buildStage);
  const nearBuild = build && state.buildContext && state.buildContext !== "calibrateObservatory";
  if (cargo) {
    goal = { ...goalForOre(cargo.index), ready: true, prompt: t("岩芯入舱", "Stowing the core") };
  } else if (state.useContext === "scan" && !nearBuild) {
    const stages = [t("取样中", "Sampling"), t("展开并对准", "Aligning the sampler"), t("钻切中", "Cutting the core"), t("提取样本", "Retrieving the core")];
    goal = { ...goalForOre(state.useIndex), ready: state.scanReady,
      control: state.scanReady ? { key: "E", label: t("长按取样", "Hold to sample") } : null,
      work: state.scanHold ? { label: stages[state.scanStage], progress: state.scanProgress } : null,
      prompt: !state.scanReady ? (Math.abs(state.speed) > 0.53 ? t("停车", "Stop") : t("挪车给机械臂留净空", "Reposition to clear the arm")) : null };
  } else if (state.useContext === "survey" && !nearBuild) {
    goal = { ...goalForSurvey(state.useIndex), ready: state.surveyReady,
      control: state.surveyReady ? { key: "E", label: t("长按勘测", "Hold to survey") } : null,
      work: state.surveyHold ? { label: t("读取仪器", "Reading the instrument"), progress: state.surveyProgress } : null,
      prompt: !state.surveyReady ? t("停车，等车身稳定", "Stop and let the rover settle") : null };
  } else if (state.useContext === "calibrateObservatory") {
    const stages = { align: t("扫描镜头对准中", "Aligning the optics"), analyze: t("记录地形读数", "Recording terrain") };
    goal = { ...build, id: "calibration", name: t("观测站", "Survey station"), height: 1.60, ready: state.buildReady,
      control: state.buildReady ? { key: "E", label: t("长按校准", "Hold to calibrate") } : null,
      work: state.buildHold ? { label: stages[state.calibrationStage] ?? t("校准中", "Calibrating"), progress: state.buildProgress } : null,
      prompt: state.calibrationStage === "warmup" ? t("通电自检", "Power-on check") : !state.buildReady ? t("停车，等车身稳定", "Stop and let the rover settle") : null };
  } else if (!nearBuild && isNearEarthObservatory(state)) {
    const ready = canObserveEarth(state);
    return { ...EARTH_SITE, name: t(EARTH_SITE.name, "Earth observatory"), ready, distance: distanceTo(EARTH_SITE), touchAction: touchDevice && ready,
      control: ready ? { key: "E", label: t("打开望远镜", "Open telescope") } : null, prompt: ready ? null : t("停车后观测地球", "Stop to observe Earth") };
  } else if (build) {
    const workshop = build === workshopPoint;
    const blocked = constructionCheck?.visible && !constructionCheck.valid;
    const prompt = !state.buildContext ? null : blocked ? constructionCheck.reason : !state.buildReady ? t("停车，等车身稳定", "Stop and let the rover settle") : null;
    goal = { ...build, id: workshop ? "workshop" : state.buildStage + "-" + build.index,
      name: workshop ? t("工坊制造台", "Workshop bench") : t(build.name, build.nameEn), height: workshop ? 1.46 : 1.13, ready: state.buildReady && !blocked, prompt,
      marker: workshop && state.buildContext ? base.workshopMarker : null,
      control: state.buildReady && !blocked && !construction.active
        ? { key: "R", label: workshop ? t("制造套件", "Fabricate kit") : constructionCheck?.visible ? t("启动安装", "Start installation") : t("预览地基", "Preview site") } : null,
      work: construction.active ? { label: t(construction.phase, constructionPhaseEn[construction.phase]), progress: state.buildProgress } : null };
  } else if (state.returnEligible || readyToUpload(state)) {
    goal = { id: "landing", name: t("着陆区", "Landing zone"), x: 0, z: 0, height: 1.02 };
  } else {
    const needsSurvey = state.campaignStage === "survey" ? state.collected >= SURVEY_MIN_ORE
      : state.buildStage && state.collected >= (state.buildStage === "resupply" ? OBSERVATORY_SAMPLES : BUILD_SAMPLES);
    const remainingOre = crystals.flatMap((_, i) => state.mask & (1 << i) ? [] : [goalForOre(i)]);
    const remainingSurvey = SURVEY_SITES.flatMap((_, i) => state.surveyMask & (1 << i) ? [] : [goalForSurvey(i)]);
    goal = closestGoal(needsSurvey ? remainingSurvey : remainingOre);
  }
  const actionable = goal && (touchTask?.id === goal.id || (goal.ready && Boolean(goal.control)));
  return goal && { ...goal, distance: distanceTo(goal),
    touchAction: touchDevice && actionable && !cargo && (nearBuild || Boolean(state.useContext)) };
}

function companionClearance(x, z) {
  const baseDistance = Math.hypot(x - base.station.position.x, z - base.station.position.z);
  let floor = base.station.position.y + 2.42 - THREE.MathUtils.smoothstep(baseDistance, 1.3, 2.65) * 3.5;
  for (const rock of tallRockFixtures) {
    if (rock.top + 0.23 > floor && Math.abs(x - rock.x) < rock.radius + 0.19
      && Math.abs(z - rock.z) < rock.radius + 0.19) floor = rock.top + 0.23;
  }
  return Math.max(floor, height(x, z) + 0.90);
}

function nextCompanionTarget(goal) {
  const earthRange = distanceTo(EARTH_SITE);
  const { yaw, x, z } = state;
  const towardEarth = -(EARTH_SITE.x - x) * Math.sin(yaw) - (EARTH_SITE.z - z) * Math.cos(yaw);
  // The optional telescope can be spotted on approach, before its E prompt appears.
  if (earthRange < 5.8 && towardEarth > 0.52 * earthRange && !goal?.control && (goal?.distance ?? Infinity) > earthRange) {
    goal = { ...EARTH_SITE, distance: earthRange };
  }
  if (!goal) return null;
  const { id, distance } = goal;
  if (id === "workshop") {
    return { id, distance, key: id + state.buildStage, mode: "workshop", radius: 0.36,
      x: base.workshopMarker.x, y: base.workshopMarker.y - 0.19, z: base.workshopMarker.z, object: base.station };
  }
  const mode = id.startsWith("ore-") ? "ore" : id.startsWith("survey-") ? "survey" : id.startsWith("deploy") ? "foundation"
    : id === EARTH_SITE.id ? "earth" : id;
  const lift = { ore: 0.28, survey: 0.28, foundation: 0.05, earth: 0.95, calibration: 0.63, landing: 0.04 }[mode] ?? 0.14;
  return { id, key: id === "landing" ? id + state.campaignStage : id, mode, distance, x: goal.x, z: goal.z,
    y: height(goal.x, goal.z) + lift, radius: mode === "foundation" ? 0.54 : 0.35 };
}

function reportCompanionScan(target) {
  if (!onboarding.enabled) return;
  const line = scoutLines.next(target, touchDevice);
  if (line) missionNotices.post(target.key, line, "scout", motionTime);
}

function updateHud() {
  if (arcade.active) {
    if (scoreMetricLabel) setText(scoreMetricLabel, t("得分", "Score"));
    if (qualityLabel) setText(qualityLabel, t("连击", "Combo"));
    if (surveyLabel) setText(surveyLabel, t("信标", "Beacons"));
    setText(score, `${arcade.score}`);
    setText(qualityCount, `×${arcade.combo}`);
    setText(surveyCount, `${arcade.captures}`);
  } else {
    if (scoreMetricLabel) setText(scoreMetricLabel, t("晶样", "Samples"));
    if (qualityLabel) setText(qualityLabel, t("完整", "Intact"));
    if (surveyLabel) setText(surveyLabel, t("勘测", "Surveys"));
    setText(score, `${state.collected} / ${crystals.length}`);
    setText(qualityCount, String(state.qualityCount));
    setText(surveyCount, `${state.surveyCount} / ${SURVEY_REQUIRED}`);
  }
  setText(timer, String(Math.ceil(state.time)).padStart(2, "0"));
  setText(speed, String(Math.round(Math.abs(state.speed) * 3.6)).padStart(2, "0"));
  const full = state.collected === crystals.length;
  const approaching = !full && crystals.some(({ x, z }, index) => {
    const dx = x - state.x, dz = z - state.z;
    return !(state.mask & (1 << index)) && dx * dx + dz * dz < 8.4 && dx * state.vx + dz * state.vz > 2.4;
  });
  const destination = full ? t("样本舱已满 · 返回琥珀色基站", "Sample bay full · Return to the amber marker")
    : approaching ? (touchDevice ? t("前方取样点 · 松手刹车", "Sample ahead · Release to brake") : t("前方取样点 · 空格刹车", "Sample ahead · Space to brake"))
      : state.returnEligible ? t("可以返航 · 或继续取样与勘测", "Return now or continue surveying")
        : t("返航条件 · 3 晶样，或 2 晶样和 2 勘测", "Return with 3 samples, or 2 samples and 2 readings");
  const buildObjective = {
    supplies: t(`中继套件 · 晶样 ${Math.min(state.collected, BUILD_SAMPLES)}/${BUILD_SAMPLES} · 勘测 ${Math.min(state.surveyCount, BUILD_SURVEYS)}/${BUILD_SURVEYS}`, `Relay kit · Samples ${Math.min(state.collected, BUILD_SAMPLES)}/${BUILD_SAMPLES} · Readings ${Math.min(state.surveyCount, BUILD_SURVEYS)}/${BUILD_SURVEYS}`),
    fabricate: t("去工坊制造中继套件 · 雷达琥珀圈", "Fabricate a relay kit at the workshop"),
    deploy: t("架设中继站 · 两处地基可选", "Deploy the relay at either site"),
    resupply: t(`观测站补给 · 新晶样 ${Math.min(1, state.collected - OBSERVATORY_SAMPLES + 1)}/1 · 新勘测 ${Math.min(1, state.surveyCount - OBSERVATORY_SURVEYS + 1)}/1`, `Survey kit · New samples ${Math.min(1, state.collected - OBSERVATORY_SAMPLES + 1)}/1 · New readings ${Math.min(1, state.surveyCount - OBSERVATORY_SURVEYS + 1)}/1`),
    fabricateObservatory: t("回工坊制造观测站 · 雷达琥珀圈", "Fabricate a survey station kit"),
    deployObservatory: t("架设观测站 · 两处地基可选", "Deploy the survey station at either site"),
    calibrateObservatory: t("观测站待校准 · 停车后启动读数", "Stop and calibrate the survey station"),
    fabricatePower: t("回工坊制造太阳能补给站", "Fabricate a solar station kit"),
    deployPower: t("安装太阳能补给站 · 接通后可停车补电", "Deploy the solar station to recharge"),
    return: state.powerOnline ? t("供电与测绘已完成 · 返回着陆区", "Power and mapping online · Return to landing") : t("地形扫描已归档 · 返回着陆区", "Terrain scan archived · Return to landing"),
  };
  const surveyGoal = readyToUpload(state) ? t("回着陆区停稳，上传勘测记录", "Park at the landing zone and upload the survey")
    : t(`勘测 · 晶样 ${Math.min(state.collected, SURVEY_MIN_ORE)}/${SURVEY_MIN_ORE} · 读数 ${state.surveyCount}/${SURVEY_REQUIRED}`, `Survey · Samples ${Math.min(state.collected, SURVEY_MIN_ORE)}/${SURVEY_MIN_ORE} · Readings ${state.surveyCount}/${SURVEY_REQUIRED}`);
  const transferStatus = state.dataTransfer === "survey" ? t("正在上传初勘记录", "Uploading the preliminary survey")
    : state.dataTransfer === "return" ? t("正在回传任务数据", "Sending the expedition log") : null;
  const arcadeStatus = arcade.active
    ? t(`极速采集 · 连击 ×${arcade.combo} · 穿越高亮信标或低重力飞跃`, `Arcade Sprint · Combo ×${arcade.combo} · Hit glowing beacons or launch off craters`)
    : null;
  setText(objective, arcadeStatus ?? transferStatus ?? buildObjective[state.buildStage] ?? (state.campaignStage === "survey" ? surveyGoal : destination));
  timer.dataset.urgent = String(state.time <= 10);
  energyMeter.value = state.energy;
  energyMeter.dataset.low = String(state.energy <= 0.20);
  setText(energyPercent, `${Math.round(state.energy * 100)}%`);
  setText(energyLabel, state.charging ? t("补电中", "Charging") : state.energy <= 0.12 ? t("节电模式", "Low power") : t("车载电量", "Battery"));
  const active = state.phase === "playing" && !paused;
  const useContext = state.useContext;
  const nearBuild = state.buildContext && state.buildContext !== "calibrateObservatory";
  const useReady = useContext === "scan" ? state.scanReady
    : useContext === "survey" ? state.surveyReady : state.buildReady;
  const earthTarget = navigationGoal?.id === EARTH_SITE.id;
  scanButton.hidden = earthTarget ? !navigationGoal.touchAction : !touchDevice || !active || !useContext || (!useReady && touchTask?.key !== "E")
    || Boolean(nearBuild) || Boolean(cargo);
  if (!scanButton.hidden) {
    const action = earthTarget ? t("观测地球", "Observe Earth") : touchTask?.key === "E" ? t("取消", "Cancel")
      : { scan: t("取样", "Sample"), survey: t("勘测", "Survey"), calibrateObservatory: t("校准", "Calibrate") }[useContext];
    setText(scanButton, action);
    if (scanButton.getAttribute("aria-label") !== action) scanButton.setAttribute("aria-label", action);
  }
  const canBuild = active && Boolean(state.buildContext) && !cargo && !state.scanHold && !construction.active;
  buildButton.hidden = !touchDevice || !canBuild || (!state.buildReady && touchTask?.key !== "R")
    || state.buildContext === "calibrateObservatory"
    || (constructionCheck?.visible && !constructionCheck.valid);
  if (!buildButton.hidden) {
    const buttonCopy = touchTask?.key === "R" ? t("取消", "Cancel")
      : state.buildContext.startsWith("deploy") ? (constructionCheck?.visible ? t("安装", "Install") : t("预览地基", "Preview site")) : t("制造", "Fabricate");
    setText(buildButton, buttonCopy);
    if (buildButton.getAttribute("aria-label") !== buttonCopy) buildButton.setAttribute("aria-label", buttonCopy);
  }
  const advice = onboarding.update(state, motionTime, paused, Boolean(cargo));
  missionNotices.update(motionTime, { active, advice, scoutEnabled: onboarding.enabled });
}

function drivingFov() {
  return camera.aspect < 0.72 ? 58 : camera.aspect < 1 ? 52 : touchDevice ? 46 : 43;
}
let qualityTier = mobileGraphics ? "low" : "high";
let shadowThrottleMs = mobileGraphics ? 48 : 0;
let arcadeTargetGoal = null;
const viewportSize = new THREE.Vector2();
function resize() {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.fov = drivingFov();
  camera.updateProjectionMatrix();
  const mobileRatio = Math.min(1.10, Math.sqrt(420000 / (width * height)));
  const tierMax = qualityTier === "low" ? 1.0 : qualityTier === "balanced" ? 1.35 : 1.6;
  const ratio = Math.min(window.devicePixelRatio, mobileGraphics ? Math.min(mobileRatio, tierMax) : touchDevice ? Math.min(1.35, tierMax) : tierMax);
  renderer.getSize(viewportSize);
  if (viewportSize.x !== width || viewportSize.y !== height || renderer.getPixelRatio() !== ratio) {
    renderer.setDrawingBufferSize(width, height, ratio);
  }
  redrawPausedScene = true;
}
function applyQualityTier(tier) {
  qualityTier = tier;
  lighting.setBloomEnabled(tier !== "low");
  lighting.setOcclusionScale?.(tier === "high" ? 0.50 : tier === "balanced" ? 0.40 : 0.32);
  shadowThrottleMs = tier === "low" ? 48 : tier === "balanced" ? 24 : 0;
  resize();
}
const debugOverlay = createLunarDebugOverlay({
  renderer, scene, lighting, tracks,
  onQualityChange: applyQualityTier,
  onRedraw: () => { redrawPausedScene = true; },
});
debugOverlay.setTier(qualityTier);
debugToggle?.addEventListener("click", () => {
  const next = !debugOverlay.visible;
  debugOverlay.setVisible(next);
  debugToggle.setAttribute("aria-pressed", String(next));
  if (next && settings.open) settings.close();
});
window.__lunarDebug = {
  setVisible: v => debugOverlay.setVisible(v),
  setMode: m => debugOverlay.setMode(m),
  setTier: tier => debugOverlay.setTier(tier),
  stats: () => ({
    drawCalls: mainRenderCalls || renderer.info.render.calls,
    triangles: lighting.lastSceneTriangles || renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    tracks: tracks.counts(),
    trackFullMapBytes: tracks.fullMapBytes,
    bloomEnabled: lighting.bloomEnabled,
    softShadows: lighting.softShadows,
    qualityTier,
  }),
};
new ResizeObserver(resize).observe(viewport);
resize();
showPhase();
updateHud();

function held(a, b) { return Number(inputs.has(a) || inputs.has(b)); }
function drivingInput() {
  const stick = joystick.read();
  const keyboardBrake = inputs.has("Space");
  // Terrain can briefly unload a wheel after a tap. Keep the same action armed
  // until the rover settles, and cancel only if its target or driver intent changes.
  if (touchTask && (navigationGoal?.id !== touchTask.id || touchBoost
    || Math.abs(stick.throttle) > 0.08 || Math.abs(stick.steer) > 0.08)) touchTask = null;
  const interact = inputs.has("KeyE") || touchTask?.key === "E";
  const build = inputs.has("KeyR") || touchTask?.key === "R";
  const busy = interact || build || state.scanHold || state.surveyHold || state.buildHold || cargo;
  if (touchBrake && (stick.active || touchBoost || keyboardBrake || busy)) reverseBrakeAt = Infinity;
  const reversing = touchBrake && motionTime >= reverseBrakeAt;
  const brake = keyboardBrake || (touchBrake && !reversing);
  const accelerator = touchBoost && !stick.active && !busy;
  const throttle = held("ArrowUp", "KeyW") - held("ArrowDown", "KeyS") || stick.throttle || Number(accelerator);
  setText(brakeButton, reversing ? t("倒车", "Reverse") : t("刹车", "Brake"));
  return {
    throttle: brake ? 0 : reversing ? -0.75 : throttle,
    steer: held("ArrowRight", "KeyD") - held("ArrowLeft", "KeyA") || stick.steer,
    brake: brake || (touchDevice && !stick.active && !accelerator && !reversing),
    interact,
    build,
    scanMode: "precision",
    boost: inputs.has("ShiftLeft") || inputs.has("ShiftRight") || touchBoost,
  };
}

if (LUNAR_QA) {
  window.__lunarQAStart = mission => begin(mission);
  Object.defineProperty(window, "__lunarQA", {
    get: () => ({
      ...state, motionTime, inputMode: document.body.dataset.input, guideTarget: navigationGoal?.id,
      foundation: constructionCheck, rockInspection: { tall: tallRockFixtures.length, low: lowRockSupports.length }, workshopPoint: { ...workshopPoint }, relaySite: { ...RELAY_SITE }, observatorySite: { ...OBSERVATORY_SITE }, powerSite: { ...POWER_SITE }, hazard: { ...hazard }, renderCalls: mainRenderCalls || renderer.info.render.calls,
      construction: construction.inspect(),
      companion: companion.inspect(),
      uplink: uplink.inspect(),
      ambientOcclusion: lighting.enabled, softShadows: lighting.softShadows,
      steelTextureSize: silver.map.image.width,
      wheelSpin: wheelHubs.map(({ hub }) => hub.rotation.x),
      wheelSteering: wheelHubs.map(({ steering }) => steering?.rotation.y ?? 0),
      wheelHeight: wheelHubs.map(({ mount, hub }) => (mount ?? hub).position.y),
      rockUnderWheels: wheelTravel.map(contact => contact?.rockRise ?? 0),
      contactLayer: contactPass.ready, contactCasters: contactPass.casterCount,
      paused, audioRunning: audio.running, audioFrame, dustEmissions, trackCoverage: tracks.counts(),
      oreBores: crystalMeshes.map(({ bore }) => bore.radius),
      miningChips: miningEffects.chipCount,
      sampleInTransit: miningEffects.core.visible, storedSamples,
      drillTip: getSamplerTip?.(drillTip).toArray(),
      stowingSample: Boolean(cargo),
      oreGap: Math.min(...crystals.map(sample => oreClearance(state.x, state.z, state.yaw, sample))),
      fixtureGap: Math.min(...fixtures.map(sample => oreClearance(state.x, state.z, state.yaw, sample))),
      cameraPosition: camera.position.toArray(),
      cameraDetail: actionCamera.detail, cameraFov: camera.fov,
      cameraOrbit: { yaw: cameraOrbit.yaw, pitch: cameraOrbit.pitch, dragging: cameraLook.isDragging(),
        locked: document.pointerLockElement === renderer.domElement },
      touchTask: touchTask && { key: touchTask.key, id: touchTask.id },
    }),
  });
  window.__lunarQARenderAudio = renderExpeditionAudio;
}

let lastFrame;
let lastRadarUpdate = -1;
let visualTime = 0;
function setRoverPose(pose, yaw = pose.yaw) {
  rover.position.set(pose.x, pose.y, pose.z);
  rover.rotation.set(pose.pitch, yaw, pose.roll, "YXZ");
}
function checkSamplerAccess(index, pose) {
  setRoverPose(pose);
  return canReachSample?.(crystalMeshes[index].boreSurface) ?? true;
}
function canAdvanceCut(index, progress) {
  if (progress < CUT_START || progress >= CUT_END || !getSamplerTip) return true;
  const surface = crystalMeshes[index].boreSurface;
  getSamplerTip(drillTip);
  return Math.hypot(drillTip.x - surface.x, drillTip.z - surface.z) < 0.06
    && drillTip.y < surface.y + 0.12;
}
function updateMining(dt, target) {
  if (!getSamplerTip || dt <= 0) return;
  getSamplerTip(drillTip);
  bitEngaged = false;
  if (target) {
    const { scanIndex, scanProgress, scanMode } = state;
    activeCut = { index: scanIndex, mode: scanMode };
    clearingCut = -1;
    const close = Math.hypot(drillTip.x - target.x, drillTip.z - target.z) < 0.075;
    bitEngaged = scanProgress >= CUT_START && scanProgress < CUT_END && close && drillTip.y < target.y + 0.016;
    if (bitEngaged) {
      crystalMeshes[scanIndex].bore.record(scanProgress, scanMode);
      corePosition.copy(drillTip);
      corePosition.y = Math.max(drillTip.y, target.y);
      miningEffects.emit(corePosition, scanMode === "rapid", dt);
    }
    if (scanProgress >= CUT_END) {
      crystalMeshes[scanIndex].bore.record(CUT_END, scanMode);
      miningEffects.showCore(drillTip, scanMode === "rapid", (scanProgress - CUT_END) / (1 - CUT_END));
    } else miningEffects.core.visible = false;
  } else if (cargo) {
    activeCut = null;
    cargo.elapsed += dt;
    getSamplerStorage(storagePosition);
    if (!cargo.transfer && Math.hypot(drillTip.x - storagePosition.x, drillTip.z - storagePosition.z) < 0.055
        && Math.abs(drillTip.y - storagePosition.y) < 0.18) {
      cargo.transfer = dt;
      cargo.dropStart = drillTip.clone();
      playCue("sample");
    }
    if (cargo.transfer) {
      cargo.transfer += dt;
      const landing = THREE.MathUtils.smoothstep(cargo.transfer, 0, 0.29);
      corePosition.copy(cargo.dropStart).lerp(storagePosition, landing);
      miningEffects.showCore(corePosition, cargo.mode === "rapid", 1 - landing);
      if (landing >= 1) {
        miningEffects.core.visible = false;
        storedSamples++;
        cargo = null;
      }
    } else if (cargo.elapsed > 2.3) {
      miningEffects.core.visible = false;
      cargo = null;
      playCue("sample");
    } else {
      miningEffects.showCore(drillTip, cargo.mode === "rapid", 1);
    }
  } else {
    if (activeCut) clearingCut = activeCut.index;
    if (clearingCut >= 0) {
      const surface = crystalMeshes[clearingCut].boreSurface;
      if (drillTip.y > surface.y + 0.10 || Math.hypot(drillTip.x - surface.x, drillTip.z - surface.z) > 0.21) {
        clearingCut = -1;
      }
    }
    activeCut = null;
    miningEffects.core.visible = false;
  }
  miningEffects.update(dt);
}
function updateRover(dt, controls) {
  const targetYaw = state.phase === "ready" ? -0.53 : state.yaw;
  setRoverPose(state, targetYaw);
  const cosine = Math.cos(rover.rotation.y), sine = Math.sin(rover.rotation.y);
  for (const [index, { hub, mount = hub, steering, tireRadius = 0.275, x, z }] of wheelHubs.entries()) {
    const contact = wheelGround(x, z, cosine, sine);
    const predicted = state.y + x * Math.sin(state.roll) - z * Math.sin(state.pitch);
    const extension = THREE.MathUtils.clamp(contact.y - predicted, -0.137, 0.131);
    const contactLoad = state.wheelLoad[index];
    const contacting = state.wheelGrounded[index] && contactLoad > 0.02;
    const tireDeflection = roverTireDeflection(contactLoad);
    mount.position.y = tireRadius + extension - tireDeflection;
    const reverse = state.speed < -0.06 ? -1 : 1;
    const steerAngle = THREE.MathUtils.clamp(-z * state.yawRate * reverse * 0.53, -0.51, 0.51);
    if (steering) steering.rotation.y += (steerAngle - steering.rotation.y) * (1 - Math.exp(-14 * dt));
    const angle = rover.rotation.y + (steering?.rotation.y ?? 0);
    const lastContact = wheelTravel[index];
    const acousticWheel = wheelAudio[index];
    acousticWheel.load = THREE.MathUtils.clamp(contactLoad * 0.56, 0, 1);
    acousticWheel.grounded = contacting;
    if (lastContact && state.phase === "playing" && dt > 0) {
      const dx = contact.x - lastContact.x, dz = contact.z - lastContact.z;
      const wheelDistance = -dx * Math.sin(angle) - dz * Math.cos(angle);
      const lateralDistance = dx * Math.cos(angle) - dz * Math.sin(angle);
      // An unloaded wheel keeps some angular momentum until weight returns to the tread.
      const surfaceOmega = -wheelDistance / (dt * Math.max(0.19, tireRadius - tireDeflection));
      const demand = contacting ? surfaceOmega : wheelOmega[index] * Math.exp(-0.85 * dt);
      wheelOmega[index] = THREE.MathUtils.lerp(wheelOmega[index], demand, 1 - Math.exp(-29 * dt));
      hub.rotation.x += wheelOmega[index] * dt;
      acousticWheel.speed = wheelDistance / dt;
      acousticWheel.slip = Math.min(1, Math.abs(lateralDistance / dt) / 2.8);
      if (contacting) {
        const emitted = lunarDust.emit({
          ...contact, vx: dx / dt, vz: dz / dt,
          intensity: THREE.MathUtils.clamp(Math.abs(acousticWheel.speed) / 6.3, 0, 1)
            * (Math.abs(z) < 0.13 ? 0.42 : 0.64) * (0.55 + acousticWheel.load * 0.60),
          heading: angle, load: acousticWheel.load, spin: Math.abs(wheelOmega[index] * tireRadius + acousticWheel.speed) / 2.5,
          slip: acousticWheel.slip, brake: controls.brake ? 0.85 : 0, boost: state.boosting ? 1 : 0, side: Math.sign(x),
        }, dt);
        if (LUNAR_QA) dustEmissions += emitted;
      }
    }
    const trailingWheel = reverse > 0 ? z > 0.40 : z < -0.40;
    if (dt > 0 && state.phase === "playing") {
      tracks.record(index, contact, { heading: angle, load: acousticWheel.load, slip: acousticWheel.slip,
        touching: contacting && trailingWheel && Math.abs(state.speed) > 0.12 });
    }
    wheelTravel[index] = contact;
    tireContacts[index].mesh.material.opacity = contacting ? 0.4 + acousticWheel.load * 0.52 : 0;
    layContactPatch(tireContacts[index], contact.x, contact.z, cosine, sine);
  }
  updateSuspension?.(state.wheelLoad);
  const target = state.scanHold && !cargo ? crystalMeshes[state.scanIndex]?.boreSurface : null;
  if (!construction.update(state.buildStage, state.buildProgress)) {
    updateSampler?.(dt, { active: Boolean(target), progress: state.scanProgress, target,
      mode: state.scanMode, delivering: Boolean(cargo) });
  }
  updateMining(dt, target);
  if (dt > 0) tracks.flush(dt);
  if (dt > 0) lunarDust.update(dt);
}
function activeCameraAction() {
  if (state.dataTransfer) {
    actionFocus.copy(dataOrigin).lerp(dataDestination, 0.50);
    return { key: `uplink:${state.dataTransfer}`, kind: "uplink", subject: actionFocus, axisTarget: dataDestination };
  }
  const sampleIndex = cargo?.index ?? (state.scanHold ? state.scanIndex : -1);
  if (sampleIndex >= 0) {
    const ore = crystalMeshes[sampleIndex].boreSurface;
    if (cargo) actionFocus.copy(drillTip).lerp(storagePosition, 0.36);
    else actionFocus.copy(ore).lerp(drillTip, state.scanStage === 1 ? 0.36 : 0.56);
    actionFocus.y += cargo ? 0.08 : 0.17;
    return { key: `sample:${sampleIndex}`, kind: "sample", subject: actionFocus, axisTarget: ore };
  }
  if (state.surveyHold && state.surveyIndex >= 0) {
    const { x, z } = SURVEY_SITES[state.surveyIndex];
    actionFocus.set(x, height(x, z) + (state.surveyIndex === 0 ? 0.32 : 0.49), z);
    return { key: `survey:${state.surveyIndex}`, kind: "survey", subject: actionFocus };
  }
  if (state.buildHold && state.buildContext?.startsWith("fabricate")) {
    if (construction.active) construction.aim(actionFocus);
    else actionFocus.copy(base.workshopMarker);
    return { key: state.buildContext, kind: "workshop", subject: actionFocus, axisOrigin: base.station.position,
      axisTarget: base.workshopMarker };
  }
  const station = state.buildHold ? nextBuildLocation(state.buildContext)
    : recentInstallation && motionTime - recentInstallation.time < 1.55 ? recentInstallation.site : null;
  if (!station) return null;
  const calibrating = state.buildContext === "calibrateObservatory";
  const equipmentHeight = calibrating ? 1.22 : station === powerPad.site ? 0.65 : 0.96;
  installationAxis.set(station.x, height(station.x, station.z) + equipmentHeight, station.z);
  if (construction.active) construction.aim(actionFocus);
  else actionFocus.copy(installationAxis);
  return { key: `${calibrating ? "calibration" : "installation"}:${station.x}:${station.z}`,
    kind: "installation", subject: actionFocus, axisTarget: installationAxis };
}

function keepCameraClearOfHabitat(position) {
  if (Math.hypot(state.x - base.station.position.x, state.z - base.station.position.z) > 9) return;
  habitatRay.origin.copy(rover.position);
  habitatRay.origin.y += 0.93;
  base.station.worldToLocal(habitatRay.origin);
  base.station.worldToLocal(habitatCameraEnd.copy(position));
  habitatRay.direction.subVectors(habitatCameraEnd, habitatRay.origin);
  const length = habitatRay.direction.length();
  if (length <= 0.01) return;
  habitatRay.direction.multiplyScalar(1 / length);
  let clearLength = length;
  for (const box of [habitatShell, habitatBench]) {
    if (!habitatRay.intersectBox(box, habitatIntersection)) continue;
    const hit = habitatRay.origin.distanceTo(habitatIntersection);
    if (hit <= clearLength) clearLength = Math.max(0.32, hit - 0.19);
  }
  if (clearLength < length) base.station.localToWorld(habitatRay.at(clearLength, position));
}

function updateCamera(dt, driving) {
  const portrait = camera.aspect < 1;
  let frame;
  if (state.phase === "ready") {
    actionCamera.reset();
    manualLookSeconds = 0;
    if (!hasEmbeddedTitleMedia && !reducedMotionMedia.matches) {
      const phase = visualTime * 0.24;
      const lean = Math.sin(phase);
      const sweep = 0.5 - 0.5 * Math.cos(phase);
      targetPosition.set(2.82 - 0.79 * sweep, 1.24 + 0.29 * sweep, 3.62 + 0.54 * sweep + 0.10 * lean);
      targetPosition.y = Math.max(targetPosition.y, height(targetPosition.x, targetPosition.z) + 0.54);
      lookAt.set(-3.4 + 0.45 * sweep, 0.87 + 0.10 * sweep, -0.73 - 0.19 * sweep);
    } else {
      targetPosition.copy(titleCameraPosition);
      lookAt.copy(titleCameraTarget);
    }
  } else {
    const cosine = Math.cos(rover.rotation.y), sine = Math.sin(rover.rotation.y);
    const cameraDistance = portrait ? 5.9 : 4.85;
    const shoulder = portrait ? 0.38 : 1.82;
    const cx = state.x + sine * cameraDistance + cosine * shoulder;
    const cz = state.z + cosine * cameraDistance - sine * shoulder;
    targetPosition.set(cx, Math.max(rover.position.y, height(cx, cz)) + (portrait ? 2.18 : 1.33), cz);
    lookAt.set(state.x - sine * 2.05 + cosine * shoulder * 0.23,
      rover.position.y + (portrait ? 1.04 : 0.82), state.z - cosine * 2.05 - sine * shoulder * 0.23);
  }
  if (state.phase === "playing") {
    const dragging = cameraLook.isDragging();
    manualLookSeconds = Math.max(0, manualLookSeconds - dt);
    const manualLook = dragging || document.pointerLockElement === renderer.domElement;
    cameraOrbit.idle = manualLook ? 0 : cameraOrbit.idle + dt;
    if (cameraOrbit.idle > 3.5) {
      const follow = Math.exp(-1.8 * dt);
      cameraOrbit.yaw *= follow;
      cameraOrbit.pitch *= follow;
      if (Math.abs(cameraOrbit.yaw) < 0.001) cameraOrbit.yaw = 0;
      if (Math.abs(cameraOrbit.pitch) < 0.001) cameraOrbit.pitch = 0;
    }
    if (cameraOrbit.yaw || cameraOrbit.pitch) {
      const x = targetPosition.x - lookAt.x;
      const y = targetPosition.y - lookAt.y;
      const z = targetPosition.z - lookAt.z;
      const horizontal = Math.hypot(x, z);
      const distance = Math.hypot(horizontal, y);
      const azimuth = Math.atan2(x, z) + cameraOrbit.yaw;
      const elevation = THREE.MathUtils.clamp(Math.atan2(y, horizontal) + cameraOrbit.pitch, -0.12, 1.20);
      const level = Math.cos(elevation) * distance;
      targetPosition.set(lookAt.x + Math.sin(azimuth) * level,
        lookAt.y + Math.sin(elevation) * distance, lookAt.z + Math.cos(azimuth) * level);
    }
    frame = actionCamera.apply({ action: activeCameraAction(), rover, driving, looking: dragging || manualLookSeconds > 0,
      targetPosition, targetFocus: lookAt, aspect: camera.aspect, speed: state.speed, boost: state.boosting,
      dt, time: motionTime, baseFov: drivingFov() });
  }
  const blend = 1 - Math.exp(-(frame?.blend ?? 4.6) * dt);
  const protectHabitatView = state.phase === "playing" && (frame?.mix ?? 0) < 0.35;
  if (protectHabitatView) keepCameraClearOfHabitat(targetPosition);
  camera.position.lerp(targetPosition, blend);
  if (protectHabitatView) keepCameraClearOfHabitat(camera.position);
  const groundMargin = 0.92 - 0.28 * (frame?.mix ?? 0);
  camera.position.y = Math.max(camera.position.y, height(camera.position.x, camera.position.z) + groundMargin);
  cameraTarget.lerp(lookAt, blend);
  const juice = state.phase === "playing" && !cameraPreference.matches
    ? cameraJuice.update(dt, state.boosting, state.speed)
    : { offset: null, fovOffset: 0 };
  if (juice.offset) {
    camera.position.add(juice.offset);
  }
  camera.lookAt(cameraTarget);
  const targetFov = (frame?.fov ?? drivingFov()) + (frame?.mix > 0.3 ? 0 : juice.fovOffset);
  const fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
  if (Math.abs(fov - camera.fov) > 0.008) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
await bootStep(94, t("正在绘制首帧", "Rendering the first frame"));
let firstGameplayShadersWarmed = false;
let titleStaticRendered = false;
let lastShadowFrame = -Infinity;
renderer.domElement.addEventListener("webglcontextrestored", () => {
  tracks.restore();
  lastShadowFrame = -Infinity;
  redrawPausedScene = true;
  titleStaticRendered = false;
});
renderer.setAnimationLoop((now) => {
  const frameStart = performance.now();
  const hidden = document.hidden;
  const dt = lastFrame === undefined || hidden || paused ? 0 : Math.min((now - lastFrame) / 1000, 0.065);
  lastFrame = now;
  if (earthObservatory.open) return;
  if (document.body.dataset.boot === "ready") {
    const idleTitle = state.phase === "ready" && !LUNAR_QA && !debugOverlay.visible && (hasEmbeddedTitleMedia || (reducedMotionMedia.matches && titleStaticRendered));
    if (hidden || (paused && !redrawPausedScene) || idleTitle) return;
  }
  if (state.phase === "ready") titleStaticRendered = true;
  redrawPausedScene = false;
  visualTime += dt;
  const previousPhase = state.phase;
  const prevHits = state.hits, prevCollected = state.collected;
  const prevCampaignStage = state.campaignStage, prevPower = state.powerOnline;
  const prevTransfer = state.dataTransfer;
  const prevScan = state.scanHold, prevStage = state.scanStage, prevApproach = state.warning;
  const prevGround = state.grounded, fallSpeed = state.vy, prevBoost = state.boosting;
  const prevOre = state.oreContact;
  const prevBuild = state.buildHold, prevBuildStage = state.buildStage;
  const prevRelay = state.relayDeployed, prevObservatory = state.observatoryDeployed;
  const prevSurvey = state.surveyHold, prevSurveyCount = state.surveyCount, prevEligible = state.returnEligible;
  if (state.phase === "playing") motionTime += dt;
  const patrolTime = state.phase === "ready" ? 7.1 + visualTime * 0.12 : motionTime;
  scout.update(patrolTime, dt, state);
  const controls = drivingInput();
  const cameraDriveIntent = !construction.active && !state.dataTransfer
    && (Math.abs(controls.throttle) > 0.08 || Math.abs(controls.steer) > 0.08 || controls.boost);
  prepareConstruction(controls);
  if (touchTask?.pad && (activeFooting !== touchTask.pad || !constructionCheck?.valid)) {
    touchTask = null;
    controls.build = false;
  }
  if (cargo || (activeCut && state.scanProgress >= CUT_END)) {
    Object.assign(controls, { throttle: 0, steer: 0, brake: true, boost: false, blockInteract: true, build: false,
      scan: !cargo && activeCut.mode === "precision", rapid: !cargo && activeCut.mode === "rapid" });
  }
  const drivingAway = Math.abs(controls.throttle) > 0.08 || Math.abs(controls.steer) > 0.08;
  if (clearingCut >= 0 || (activeCut && drivingAway)) {
    Object.assign(controls, { throttle: 0, steer: 0, brake: true, boost: false, blockInteract: true, build: false, scan: false, rapid: false });
  }
  // Once the gripper starts moving, finish the operation with the parking brake on.
  if (construction.active) Object.assign(controls, {
    throttle: 0, steer: 0, brake: true, boost: false, interact: false, blockInteract: true, build: true,
    committedConstruction: construction.stage,
  });
  if (state.dataTransfer) Object.assign(controls, { throttle: 0, steer: 0, brake: true, boost: false, interact: false, build: false });
  step(state, controls, crystals, hazard, dt, wheelSurface, checkSamplerAccess, canAdvanceCut, SURVEY_SITES, state.powerOnline ? poweredFixtures : fixtures,
    selectedRelay.site, workshopPoint, selectedObservatory.site);
  if (arcade.active && state.phase === "playing") {
    arcadeTargetGoal = arcade.update(state, dt, visualTime, {
      hazard,
      onCapture: ({ gained, combo }) => {
        playCue("combo", combo / 5);
        cameraJuice.impulse(0.32, 2.8);
        missionNotices.post(`arcade-cap:${arcade.captures}`,
          [`信标采集 +${gained}（连击 ×${combo}）`, `Beacon +${gained} (Combo ×${combo})`], "result", motionTime);
      },
      onAirBonus: ({ bonus, combo }) => {
        playCue("combo", combo / 5);
        cameraJuice.impulse(0.42, 3.2);
        missionNotices.post(`arcade-air:${arcade.jumps}`,
          [`低重力飞跃 +${bonus} · 推进已充能！`, `Low-G Air Jump +${bonus} · Boost Recharged!`], "result", motionTime);
      },
      onNearMiss: ({ bonus, combo }) => {
        playCue("combo", combo / 5);
        cameraJuice.impulse(0.26, 2.4);
        missionNotices.post(`arcade-miss:${Math.floor(motionTime)}`,
          [`险过巡检机 +${bonus}！`, `Patrol Near Miss +${bonus}!`], "result", motionTime);
      },
    });
  } else {
    arcadeTargetGoal = null;
  }
  if (state.buildHold && state.buildProgress > 0) {
    if (state.buildContext === "deploy") fixedRelay = selectedRelay;
    if (state.buildContext === "deployObservatory") fixedObservatory = selectedObservatory;
    if (!construction.active && (state.buildContext?.startsWith("fabricate") || state.buildContext?.startsWith("deploy"))) {
      construction.begin(state.buildContext, activeFooting);
      touchTask = null;
    }
  }
  if (state.warning && !prevApproach) {
    missionNotices.post("patrol", ["留意巡检机的扫查。避开它的光束。", "Watch for the patrol's scan. Stay clear of the beam."], "caution", motionTime);
    playCue("warning");
  }
  if (state.boosting && !prevBoost) {
    playCue("boost");
    cameraJuice.impulse(0.18, 2.2);
  }
  if (state.scanHold && !prevScan) playCue("scan");
  else if (state.scanHold && state.scanStage > prevStage) playCue("checkpoint");
  if (state.grounded && !prevGround && fallSpeed < -0.36) {
    playCue("land");
    cameraJuice.impulse(THREE.MathUtils.clamp(-fallSpeed * 0.22, 0.12, 0.55));
  }
  if (state.hits !== prevHits) {
    missionNotices.post("strike", [`避开巡检机的光束 · 扣除 ${HIT_PENALTY} 秒`, `Steer clear of the patrol beam · ${HIT_PENALTY}s penalty`], "strike", motionTime);
    playCue("strike");
    cameraJuice.impulse(0.55);
  }
  if (state.oreContact !== prevOre && state.oreImpactSpeed > 0.8) {
    const contactCue = state.oreContact >= crystals.length ? "roughContact" : "oreTap";
    playCue(contactCue, THREE.MathUtils.clamp(state.oreImpactSpeed / 3.2, 0.36, 1));
  }
  if (state.surveyHold && !prevSurvey) playCue("surveyStart");
  if (state.surveyCount > prevSurveyCount) {
    const instrument = SURVEY_SITES[state.surveyIndex];
    missionNotices.post(`reading:${state.surveyIndex}`, [instrument.finding, instrument.findingEn], "result", motionTime);
    playCue("surveyComplete");
  }
  if (state.buildHold && !prevBuild) playCue("surveyStart");
  if (state.buildStage !== prevBuildStage) {
    if (["deploy", "resupply", "deployObservatory", "calibrateObservatory", "return"].includes(state.buildStage)) playCue("surveyComplete");
    let result = {
      deploy: ["中继套件已装车", "Relay kit loaded"],
      deployObservatory: ["观测站套件已装车", "Survey station kit loaded"],
      fabricatePower: ["观测站已校准", "Survey station calibrated"],
      deployPower: ["补给站套件已装车", "Solar station kit loaded"],
      return: ["地形校准完成", "Terrain calibration complete"],
    }[state.buildStage];
    if (state.relayDeployed && !prevRelay) {
      state.relayLocation = { ...selectedRelay.site };
      recentInstallation = { site: selectedRelay.site, time: motionTime };
      result = ["中继站已接通", "Relay online"];
    }
    if (state.observatoryDeployed && !prevObservatory) {
      recentInstallation = { site: selectedObservatory.site, time: motionTime };
      result = ["观测站已安装，等待自检", "Survey station installed · Running checks"];
    }
    if (state.campaignStage !== prevCampaignStage) result = ["勘测已上传 · 开始建设", "Survey uploaded · Construction unlocked"];
    if (state.powerOnline && !prevPower) {
      recentInstallation = { site: powerPad.site, time: motionTime };
      result = ["补给站已上线", "Solar station online"];
    }
    if (result) missionNotices.post(`build:${state.buildStage}`, result, "result", motionTime);
    touchTask = null;
  }
  if (state.surveyCount > prevSurveyCount || state.collected > prevCollected) touchTask = null;
  if (state.returnEligible && !prevEligible) playCue("return");
  if (state.collected !== prevCollected && !arcade.active) {
    cargo = { index: state.scanIndex, mode: state.scanMode, elapsed: 0, transfer: 0 };
    cameraJuice.impulse(0.24);
    missionNotices.post(`sample:${state.collected}`, [`晶样已采集 · ${state.collected} 份`, `Samples collected · ${state.collected}`], "result", motionTime);
  }
  updateRover(dt, controls);
  roverRig.setBoostVisual?.(state.boosting && state.phase === "playing" && !paused, dt, visualTime);
  if (state.dataTransfer || prevTransfer) {
    roverRig.aimDataDish(dataDestination, dt);
    roverRig.getDataFeed(dataOrigin);
    if (state.dataTransfer && !prevTransfer) {
      uplink.start({ origin: dataOrigin, destination: dataDestination });
      playCue("uplink");
    } else uplink.update(dt, dataOrigin);
  } else roverRig.aimDataDish(null, dt);
  fieldSurvey.update(state, visualTime, dt);
  ambientActivity.update(visualTime, dt);
  const peakWheelLoad = Math.max(...state.wheelLoad);
  const roughness = THREE.MathUtils.clamp((peakWheelLoad - 1.25) * 0.30, 0, 1);
  if (state.phase === "playing" && Math.abs(state.speed) > 1.55 && peakWheelLoad > 3.2
      && motionTime - lastRoughCue > 0.3) {
    playCue("roughContact", Math.min(0.8, roughness));
    lastRoughCue = motionTime;
  }
  const slip = Math.min(1, Math.abs(state.vx * Math.cos(state.yaw) - state.vz * Math.sin(state.yaw)) / 2.2);
  const acousticState = {
    active: !paused && state.phase === "playing", speed: state.speed, throttle: controls.throttle,
    slip, grounded: state.grounded, boost: state.boosting, scan: state.scanHold, scanProgress: state.scanProgress,
    rapid: state.scanMode === "rapid", engaged: bitEngaged, stowing: Boolean(cargo),
    wheels: wheelAudio, roughness,
  };
  if (dt > 0 && visualTime - audioClock > 0.059) {
    audio.drive(acousticState);
    audioClock = visualTime;
  }
  for (const pad of relayPads) pad.structure.update(pad === selectedRelay ? state : offlineFacility, dt, visualTime, construction.facilityProgress(pad));
  for (const pad of observatoryPads) pad.structure.update(pad === selectedObservatory ? state : offlineFacility, dt, visualTime, construction.facilityProgress(pad));
  powerPad.structure.update(state, visualTime, construction.facilityProgress(powerPad));
  const panelAlignment = THREE.MathUtils.smoothstep(visualTime, 2.8, 15.9);
  for (const bank of solarBanks) bank.rotation.x = 0.26 + 0.49 * panelAlignment;
  const nearWorkshop = state.buildContext?.startsWith("fabricate");
  lighting.setWorkshopBounce({ near: nearWorkshop, active: state.buildHold && nearWorkshop });
  base.setWorkshopState({
    near: nearWorkshop,
    active: state.buildHold && nearWorkshop,
    progress: nearWorkshop ? state.buildProgress : 0,
    item: state.buildContext === "fabricateObservatory" ? "TERRAIN SCANNER" : state.buildContext === "fabricatePower" ? "SOLAR SUPPLY" : "RELAY KIT",
  });
  for (const [i, { bore, patchMaterial, gleam, indicator }] of crystalMeshes.entries()) {
    const recovered = Boolean(state.mask & (1 << i));
    const scanning = !recovered && state.scanHold && state.scanIndex === i;
    bore.update(dt);
    indicator.material = recovered ? amber : scanning ? ice : slateMetal;
    gleam.intensity = scanning ? 0.90 + Math.sin(visualTime * 6.0) * 0.10 : 0;
    patchMaterial.opacity = recovered ? 0.095 : scanning ? 0.20 : 0.135;
  }
  const returning = state.returnEligible || readyToUpload(state);
  for (const mark of padRings) mark.material = returning ? amber : roadMarks;
  for (const light of dockLights) {
    light.material.color.setHex(returning ? 0xffb572 : 0x8cf8eb);
    light.material.emissive.setHex(returning ? 0xffb572 : 0x8cf8eb);
    light.material.emissiveIntensity = returning ? 2.8 + 1.1 * Math.sin(visualTime * 5) : 2.1;
  }
  updateCamera(dt, cameraDriveIntent && !state.dataTransfer);
  camera.updateMatrixWorld();
  navigationGoal = currentGoal();
  if (!paused) companion.update(state, nextCompanionTarget(navigationGoal), dt,
    Boolean(cargo || state.scanHold || state.surveyHold || state.buildHold || construction.active || state.dataTransfer));
  guidance.update(navigationGoal, camera, viewport.clientWidth, viewport.clientHeight, motionTime, touchDevice);
  if (state.phase !== previousPhase) showPhase();
  if (LUNAR_QA) audioFrame = { ...acousticState, soundEnabled, musicEnabled, cues: pendingAudioCues.splice(0) };
  updateHud();
  if (state.phase === "playing" && visualTime - lastRadarUpdate >= 0.055) {
    drawRadar();
    lastRadarUpdate = visualTime;
  }
  sun.target.position.set(Math.round(state.x * 2) / 2, 0, Math.round(state.z * 2) / 2);
  sun.position.copy(solarKeyOffset).add(sun.target.position);
  if (!shadowThrottleMs || now - lastShadowFrame >= shadowThrottleMs) {
    renderer.shadowMap.needsUpdate = true;
    contactPass.render(state.x, state.z);
    lastShadowFrame = now;
  }
  if (!firstGameplayShadersWarmed) {
    // Prepare the hidden cutting wall and fragment materials in the actual HDR pass.
    crystalMeshes[0].bore.warm(true);
    miningEffects.warm(true);
    mainRenderCalls = lighting.render();
    crystalMeshes[0].bore.warm(false);
    miningEffects.warm(false);
    firstGameplayShadersWarmed = true;
    return;
  }
  mainRenderCalls = lighting.render();
  debugOverlay.update({ now, frameMs: performance.now() - frameStart, drawCalls: mainRenderCalls, state });
  if (document.body.dataset.boot !== "ready") {
    bootMeter.value = bootMeter.max;
    boot.setAttribute("aria-busy", "false");
    boot.hidden = true;
    document.body.dataset.boot = "ready";
    setTitleActive(state.phase === "ready");
  }
});
if (LUNAR_TITLE_CAPTURE) {
  window.__lunarTitleFrame = phase => {
    // Short orbit in place. Position and tangent match at the loop boundary.
    const lean = Math.sin(phase);
    const sweep = 0.5 - 0.5 * Math.cos(phase);
    camera.position.set(2.82 - 0.79 * sweep, 1.24 + 0.29 * sweep, 3.62 + 0.54 * sweep + 0.10 * lean);
    camera.position.y = Math.max(camera.position.y, height(camera.position.x, camera.position.z) + 0.54);
    lookAt.set(-3.4 + 0.45 * sweep, 0.87 + 0.10 * sweep, -0.73 - 0.19 * sweep);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
    lighting.render();
  };
}
}

enterLunarStation().catch(error => {
  document.body.dataset.boot = "error";
  boot.setAttribute("aria-busy", "false");
  bootStatus.textContent = t("无法初始化月面。请确认浏览器支持 WebGL 2，并开启硬件加速。", "The lunar scene could not start. Enable hardware acceleration in a browser that supports WebGL 2.");
  bootRetry.hidden = false;
  console.error(error);
});
