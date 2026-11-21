export const MISSION_SECONDS = 150;
export const CONSTRUCTION_MISSION_SECONDS = 210;
export const CAMPAIGN_MISSION_SECONDS = 480;
export const RETURN_RADIUS = 1.65;
export const DATA_TRANSFER_SECONDS = 1.75;
export const COLLECT_RADIUS = 1.80;
export const ARENA_LIMIT = 32.0;
export const HIT_PENALTY = 4;
export const HIT_RADIUS = 1.12;
export const LUNAR_GRAVITY = 1.62;
export const SCAN_MAX_SPEED = 0.58;
export const SCAN_SECONDS = [3.4, 5.3, 4.1, 4.8, 5.6];
export const RAPID_SCAN_SECONDS = [2.25, 2.65, 2.35, 2.55, 2.75];
export const MIN_SAMPLES = 3;
export const SURVEY_RADIUS = 1.75;
export const SURVEY_REQUIRED = 2;
export const SURVEY_MIN_ORE = 2;
export const BUILD_SAMPLES = 2;
export const BUILD_SURVEYS = 1;
export const FABRICATION_SECONDS = 4.5;
export const DEPLOYMENT_SECONDS = 5.3;
export const WORKSHOP_RADIUS = 2;
export const RELAY_RADIUS = 1.95;
export const OBSERVATORY_SAMPLES = 3;
export const OBSERVATORY_SURVEYS = 2;
export const OBSERVATORY_RADIUS = 1.95;
export const OBSERVATORY_DEPLOYMENT_SECONDS = 5.8;
export const OBSERVATORY_CALIBRATION_SECONDS = 2.2;
export const OBSERVATORY_WARMUP_SECONDS = 0.85;
export const DEFAULT_OBSERVATORY_SITE = { x: -13.6, z: 12, radius: OBSERVATORY_RADIUS };
export const POWER_SITE = { x: 6.2, z: 7.7, radius: 2.75, chargeRadius: 1.85, name: "太阳能补给站" };

const HIT_COOLDOWN = 2;
const HIT_RECOVERY = 0.52;
const STATION_MAX_SPEED = 0.27;
const CHASSIS_PITCH_LIMIT = 0.92;
const CHASSIS_ROLL_LIMIT = 0.84;
const DEFAULT_WORKSHOP = { x: 0, z: 0, radius: WORKSHOP_RADIUS };
const WARNING_RADIUS = 2.65;
const FORWARD_SPEED = 5.6;
const REVERSE_SPEED = 2.9;
const BOOST_SPEED = 8.6;
const BOOST_DURATION = 1.25;
const BOOST_RECOVERY_DELAY = 0.85;
const BOOST_RECOVERY_RATE = 0.23;
const TRACK_HALF_WIDTH = 0.64;
const FRONT_AXLE = -0.59;
const MIDDLE_AXLE = 0.04;
const REAR_AXLE = 0.62;
const PITCH_INERTIA_PER_MASS = 0.29;
const ROLL_INERTIA_PER_MASS = 0.26;
const TRACTION_LEVER = 0.14;
const SUSPENSION_DROOP = 0.137;
const SUSPENSION_COMPRESSION = 0.131;
const SPRING_RATE = 95;
const COMPRESSION_DAMPING = 9.6;
const REBOUND_DAMPING = 13.4;
const MIN_WHEEL_FORCE = 0.015 * LUNAR_GRAVITY;
const PHYSICS_STEP = 1 / 120;
const WHEELS = [-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH].flatMap(x =>
  [FRONT_AXLE, MIDDLE_AXLE, REAR_AXLE].map(z => ({ x, z })));

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

function flatten() { return 0; }

export function createState(y = 0, mission = "survey") {
  const construction = mission === "construction";
  const campaign = mission === "campaign";
  return {
    x: 0, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0, yawRate: 0,
    y, vy: 0, pitch: 0, roll: 0, pitchRate: 0, rollRate: 0, grounded: true,
    physicsCarry: 0, wheelLoad: [1, 1, 1, 1, 1, 1], wheelGrounded: [true, true, true, true, true, true],
    time: campaign ? CAMPAIGN_MISSION_SECONDS : construction ? CONSTRUCTION_MISSION_SECONDS : MISSION_SECONDS,
    cooldown: 0, collected: 0, mask: 0, hits: 0, phase: "ready",
    scanIndex: -1, scanProgress: 0, scanReady: false, scanClear: false, scanHold: false, scanStage: 0, scanWork: [],
    scanMode: "precision", rapidWork: [], scanMethods: [], qualityMask: 0, qualityCount: 0, returnEligible: false,
    surveyIndex: -1, surveyProgress: 0, surveyReady: false, surveyHold: false, surveyStage: 0,
    surveyMask: 0, surveyCount: 0, surveyWork: [],
    useContext: null, useIndex: -1, useMode: "precision", useHeld: false, useLock: null,
    mission: campaign ? "campaign" : construction ? "construction" : "survey",
    campaignStage: campaign ? "survey" : null, buildStage: construction ? "supplies" : null,
    dataTransfer: null, transferProgress: 0,
    buildContext: null, buildReady: false, buildHold: false, buildProgress: 0,
    relayDeployed: false, observatoryDeployed: false, observatoryCalibrated: false,
    buildCooldown: 0, calibrationStage: null,
    energy: 1, charging: false, powerOnline: false,
    boostCharge: 1, boostRecovery: 0, boostLocked: false, boosting: false, warning: false,
    oreContact: -1, oreImpactSpeed: 0,
  };
}

function qualifiesForReturn(state) {
  if (state.mission !== "survey") return state.buildStage === "return";
  return state.collected >= MIN_SAMPLES || (state.collected >= SURVEY_MIN_ORE && state.surveyCount >= SURVEY_REQUIRED);
}

export function readyToUpload(state) {
  return state.campaignStage === "survey" && state.collected >= SURVEY_MIN_ORE && state.surveyCount >= SURVEY_REQUIRED;
}

export function expeditionGrade(state) {
  if (!qualifiesForReturn(state)) return null;
  if (state.collected === 5 && state.qualityCount === 5) return "S";
  const score = state.collected + state.qualityCount + (state.surveyCount ?? 0);
  if (score >= 7) return "A";
  if (score >= 5) return "B";
  return "C";
}

function wheelSupport(state, groundHeight, sine, cosine) {
  const heights = WHEELS.map(({ x, z }) => groundHeight(
    state.x + cosine * x + sine * z, state.z - sine * x + cosine * z,
  ));
  const [fl, ml, bl, fr, mr, br] = heights;
  return {
    heights,
    pitch: Math.atan2((fl + fr - bl - br) / 2, REAR_AXLE - FRONT_AXLE),
    roll: Math.atan2((fr + br + mr - fl - bl - ml) / 3, TRACK_HALF_WIDTH * 2),
  };
}

function solveWheelLoads(state, current, previous, dt) {
  let normalAcceleration = 0;
  let grounded = false;
  const pitch = Math.sin(state.pitch), roll = Math.sin(state.roll);
  const pitchSpeed = Math.cos(state.pitch) * state.pitchRate;
  const rollSpeed = Math.cos(state.roll) * state.rollRate;
  for (const [index, { x, z }] of WHEELS.entries()) {
    const attachmentHeight = state.y + x * roll - z * pitch;
    const compression = current.heights[index] - attachmentHeight;
    const supportSpeed = clamp((current.heights[index] - previous.heights[index]) / dt, 1.45);
    const attachmentSpeed = state.vy + x * rollSpeed - z * pitchSpeed;
    const compressionSpeed = supportSpeed - attachmentSpeed;
    const damping = compressionSpeed > 0 ? COMPRESSION_DAMPING : REBOUND_DAMPING;
    const spring = LUNAR_GRAVITY + SPRING_RATE * compression + damping * compressionSpeed;
    const force = compression >= -SUSPENSION_DROOP && spring >= MIN_WHEEL_FORCE ? spring : 0;
    state.wheelGrounded[index] = force > 0;
    state.wheelLoad[index] = force / LUNAR_GRAVITY;
    normalAcceleration += force;
    grounded ||= force > 0;
  }
  state.grounded = grounded;
  return normalAcceleration / WHEELS.length;
}

function integrate(state, controls, groundHeight, fixtures, dt) {
  const effort = clamp(controls.throttle ?? 0, 1);
  const steer = clamp(controls.steer ?? 0, 1);
  const normalLoad = state.wheelLoad.reduce((sum, load) => sum + load, 0) / WHEELS.length;
  const traction = state.grounded ? Math.min(1, normalLoad) : 0;
  const turnRate = (2.32 - 0.75 * Math.min(1, Math.abs(state.speed) / FORWARD_SPEED))
    * (state.boosting ? 0.76 : 1);
  // Steering follows the direction of travel. At rest, use reverse intent so
  // the first motion already backs toward the requested side.
  const reversing = state.speed < -0.06 || (state.speed <= 0.06 && effort < 0 && !controls.brake);
  const yawDemand = (reversing ? steer : -steer) * turnRate * Math.sqrt(traction);
  if (traction > 0) state.yawRate += (yawDemand - state.yawRate) * (1 - Math.exp(-11 * dt));
  state.yaw += state.yawRate * dt;

  const sine = Math.sin(state.yaw), cosine = Math.cos(state.yaw);
  const support = wheelSupport(state, groundHeight, sine, cosine);
  let longitudinal = -state.vx * sine - state.vz * cosine;
  let lateral = state.vx * cosine - state.vz * sine;
  const braking = controls.brake || (effort !== 0 && effort * longitudinal < -0.15);
  const forwardSpeed = state.boosting ? BOOST_SPEED : state.energy <= 0.12 ? FORWARD_SPEED * 0.77 : FORWARD_SPEED;
  const targetSpeed = controls.brake ? 0 : effort * (effort < 0 ? REVERSE_SPEED : forwardSpeed);
  const engineRate = braking ? 7.2 : state.boosting ? 9.3 : effort !== 0 ? 4.8 : 1.45;
  const driveForce = clamp((targetSpeed - longitudinal) * (braking ? 8.5 : 4.4), engineRate) * traction;
  const longitudinalUse = Math.abs(driveForce) / engineRate;
  const sideGrip = 8.9 * traction * Math.sqrt(1 - 0.42 * longitudinalUse ** 2);
  const lateralCorrection = clamp(-lateral * (braking ? 13 : 7.2) * traction, sideGrip);
  // Wheels share a finite grip budget, while lunar gravity pulls along the supported slope.
  const gravityOnSlope = state.grounded ? LUNAR_GRAVITY : 0;
  longitudinal += (driveForce - gravityOnSlope * Math.sin(support.pitch)) * dt;
  lateral += (lateralCorrection - gravityOnSlope * Math.sin(support.roll)) * dt;
  if (state.grounded && !effort && Math.abs(longitudinal) < 0.025) longitudinal = 0;

  state.vx = -sine * longitudinal + cosine * lateral;
  state.vz = -cosine * longitudinal - sine * lateral;
  const x = state.x + state.vx * dt, z = state.z + state.vz * dt;
  state.x = clamp(x, ARENA_LIMIT);
  state.z = clamp(z, ARENA_LIMIT);
  if (state.x !== x) state.vx *= -0.12;
  if (state.z !== z) state.vz *= -0.12;
  resolveOreContacts(state, fixtures, cosine, sine, ARENA_LIMIT);
  state.speed = -state.vx * sine - state.vz * cosine;

  const advancedSupport = wheelSupport(state, groundHeight, sine, cosine);
  const springForce = solveWheelLoads(state, advancedSupport, support, dt);
  const verticalAcceleration = springForce - LUNAR_GRAVITY;
  state.y += (state.vy + 0.5 * verticalAcceleration * dt) * dt;
  state.vy += verticalAcceleration * dt;
  // Each loaded wheel can rotate the chassis about its center of mass. A wheel
  // over the far side of a ridge cannot steer body pitch toward that terrain.
  const [fl, ml, bl, fr, mr, br] = state.wheelLoad;
  const forceScale = LUNAR_GRAVITY / WHEELS.length;
  const pitchMoment = -(FRONT_AXLE * (fl + fr) + MIDDLE_AXLE * (ml + mr) + REAR_AXLE * (bl + br)) * forceScale;
  const rollMoment = (fr + mr + br - fl - ml - bl) * TRACK_HALF_WIDTH * forceScale;
  state.pitchRate += (pitchMoment * Math.cos(state.pitch) + driveForce * TRACTION_LEVER) / PITCH_INERTIA_PER_MASS * dt;
  state.rollRate += (rollMoment * Math.cos(state.roll) + lateralCorrection * TRACTION_LEVER) / ROLL_INERTIA_PER_MASS * dt;
  // When a corner of the chassis reaches the surface, it arrests rotation
  // beyond the suspension's valid travel. The wheel solver assumes an upright chassis.
  const nextPitch = state.pitch + state.pitchRate * dt;
  const nextRoll = state.roll + state.rollRate * dt;
  state.pitch = clamp(nextPitch, CHASSIS_PITCH_LIMIT);
  state.roll = clamp(nextRoll, CHASSIS_ROLL_LIMIT);
  if (state.pitch !== nextPitch) state.pitchRate = 0;
  if (state.roll !== nextRoll) state.rollRate = 0;
  const pitch = Math.sin(state.pitch), roll = Math.sin(state.roll);
  const bumpStop = Math.max(...WHEELS.map(({ x, z }, index) => advancedSupport.heights[index] - x * roll + z * pitch))
    - SUSPENSION_COMPRESSION;
  if (state.y < bumpStop) {
    state.y = bumpStop;
    state.vy = Math.max(0, state.vy);
  }
  solveWheelLoads(state, advancedSupport, support, dt);
}

function updateBoost(state, controls, dt) {
  const requested = Boolean(controls.boost);
  if (!requested && state.boostCharge >= 0.32) state.boostLocked = false;
  state.boosting = requested && (controls.throttle ?? 0) > 0.08 && !controls.brake
    && state.grounded && state.speed >= -0.12 && !state.boostLocked && state.boostCharge > 0 && state.energy > 0.12
    && state.cooldown <= HIT_COOLDOWN - HIT_RECOVERY;

  if (state.boosting) {
    state.boostRecovery = BOOST_RECOVERY_DELAY;
    state.boostCharge = Math.max(0, state.boostCharge - dt / BOOST_DURATION);
    if (state.boostCharge <= 0.0001) {
      state.boostCharge = 0;
      state.boostLocked = true;
    }
    return;
  }

  state.boostRecovery = Math.max(0, state.boostRecovery - dt);
  if (state.boostRecovery === 0) state.boostCharge = Math.min(1, state.boostCharge + dt * BOOST_RECOVERY_RATE);
}

function scanRange() { return COLLECT_RADIUS; }

function surveyRange(site) { return site.radius ?? SURVEY_RADIUS; }

function nearbySite(state, sites, mask, range, pinnedIndex = null) {
  let nearest = null;
  const start = pinnedIndex ?? 0;
  const end = pinnedIndex === null ? sites.length : Math.min(sites.length, pinnedIndex + 1);
  for (let index = start; index < end; index++) {
    if (mask & (1 << index)) continue;
    const site = sites[index];
    const distance = Math.hypot(state.x - site.x, state.z - site.z);
    if (distance > range(site) || (nearest && distance >= nearest.distance)) continue;
    nearest = { index, distance };
  }
  return nearest;
}

function nearCalibration(state, site) {
  return state.buildStage === "calibrateObservatory" && site
    && Math.hypot(state.x - site.x, state.z - site.z) <= (site.radius ?? OBSERVATORY_RADIUS);
}

function selectUseTarget(state, crystals, surveySites, observatorySite, mode) {
  if (nearCalibration(state, observatorySite)) return { kind: "calibrateObservatory", index: -1 };
  const sample = nearbySite(state, crystals, state.mask, scanRange);
  const survey = nearbySite(state, surveySites, state.surveyMask, surveyRange);
  if (survey && (!sample || survey.distance < sample.distance)) return { kind: "survey", index: survey.index };
  if (!sample) return null;
  return { kind: "scan", index: sample.index, mode: state.scanMethods[sample.index] ?? mode };
}

function updateUseContext(state, crystals, surveySites, observatorySite, mode) {
  let target = state.useLock;
  if (!state.useHeld) target = selectUseTarget(state, crystals, surveySites, observatorySite, mode);
  else if (target?.kind === "scan" && !nearbySite(state, crystals, state.mask, scanRange, target.index)) target = null;
  else if (target?.kind === "survey" && !nearbySite(state, surveySites, state.surveyMask, surveyRange, target.index)) target = null;
  else if (target?.kind === "calibrateObservatory" && !nearCalibration(state, observatorySite)) target = null;
  state.useContext = target?.kind ?? null;
  state.useIndex = target?.index ?? -1;
  state.useMode = target?.mode ?? mode;
}

function updateScan(state, index, holding, mode, dt, canReachSample, canAdvanceCut) {
  state.scanIndex = index;
  state.scanProgress = 0;
  state.scanReady = false;
  state.scanClear = false;
  state.scanHold = false;
  state.scanStage = 0;
  state.scanMode = mode;
  if (index === -1) return;
  const parked = state.grounded && Math.hypot(state.vx, state.vz) <= SCAN_MAX_SPEED && Math.abs(state.yawRate) < 0.28;
  state.scanClear = parked && (canReachSample?.(index, state) ?? true);
  state.scanReady = state.scanClear
    && state.cooldown <= HIT_COOLDOWN - HIT_RECOVERY;
  const lockedMode = state.scanMethods[index];
  state.scanHold = Boolean(holding && state.scanReady && (!lockedMode || lockedMode === mode));
  state.scanMode = lockedMode ?? mode;
  const precision = state.scanMode === "precision";
  const work = precision ? state.scanWork : state.rapidWork;
  const durations = precision ? SCAN_SECONDS : RAPID_SCAN_SECONDS;
  const progress = work[index] ?? 0;
  const duration = durations[index % durations.length];
  const advance = state.scanHold && (canAdvanceCut?.(index, progress) ?? true);
  state.scanProgress = Math.min(1, progress + (advance ? dt / duration : 0));
  work[index] = state.scanProgress;
  if (state.scanProgress > 0.33 && !lockedMode) state.scanMethods[index] = state.scanMode;
  state.scanStage = state.scanProgress < 0.33 ? 1 : state.scanProgress < 0.78 ? 2 : 3;
  if (state.scanProgress >= 1 - 1e-9) {
    state.scanProgress = 1;
    work[index] = 1;
    state.mask |= 1 << index;
    state.collected++;
    if (precision) {
      state.qualityMask |= 1 << index;
      state.qualityCount++;
    }
  }
}

function parkedForStation(state) {
  return state.grounded && Math.hypot(state.vx, state.vz) <= STATION_MAX_SPEED
    && Math.abs(state.yawRate) <= 0.16 && state.boostRecovery === 0
    && state.cooldown <= HIT_COOLDOWN - HIT_RECOVERY;
}

function canReachStation(state, station, radius, access) {
  const inApproach = Math.hypot(state.x - station.x, state.z - station.z) <= radius;
  if (!access) return inApproach;
  const dx = state.x - access.x;
  const dz = state.z - access.z;
  const ahead = dx * access.frontX + dz * access.frontZ >= -1e-6;
  return ahead && (inApproach || Math.hypot(dx, dz) <= access.radius);
}

function updateSurvey(state, sites, index, holding, dt) {
  state.surveyIndex = index;
  state.surveyProgress = 0;
  state.surveyReady = false;
  state.surveyHold = false;
  state.surveyStage = 0;
  if (index === -1) return;
  state.surveyReady = parkedForStation(state);
  state.surveyHold = Boolean(holding && state.surveyReady);
  const progress = state.surveyWork[index] ?? 0;
  const duration = sites[index].seconds ?? (index % 2 === 0 ? 2.7 : 3.4);
  state.surveyProgress = Math.min(1, progress + (state.surveyHold ? dt / duration : 0));
  state.surveyWork[index] = state.surveyProgress;
  state.surveyStage = state.surveyProgress < 0.29 ? 1 : 2;
  if (state.surveyProgress >= 1 - 1e-9) {
    state.surveyProgress = 1;
    state.surveyWork[index] = 1;
    state.surveyMask |= 1 << index;
    state.surveyCount++;
  }
}

function updateConstruction(state, holding, dt, relaySite, workshopPoint, observatorySite, committedStage) {
  state.buildContext = null;
  state.buildReady = false;
  state.buildHold = false;
  if (!state.buildStage) return;

  if (state.buildStage === "supplies" && state.collected >= BUILD_SAMPLES && state.surveyCount >= BUILD_SURVEYS) state.buildStage = "fabricate";
  if (state.buildStage === "resupply" && state.collected >= OBSERVATORY_SAMPLES && state.surveyCount >= OBSERVATORY_SURVEYS) state.buildStage = "fabricateObservatory";
  const stage = state.buildStage;
  const fabricating = stage === "fabricate" || stage === "fabricateObservatory" || stage === "fabricatePower";
  const deployingRelay = stage === "deploy";
  const deployingObservatory = stage === "deployObservatory";
  const calibrating = stage === "calibrateObservatory";
  const deployingPower = stage === "deployPower";
  if (!fabricating && !deployingRelay && !deployingObservatory && !calibrating && !deployingPower) return;

  state.buildCooldown = Math.max(0, state.buildCooldown - dt);
  if (calibrating) {
    state.calibrationStage = state.buildCooldown > 0 ? "warmup" : state.buildProgress < 0.47 ? "align" : "analyze";
  }
  const station = fabricating ? workshopPoint : deployingRelay ? relaySite : deployingPower ? POWER_SITE : observatorySite;
  const radius = station?.radius ?? (fabricating ? WORKSHOP_RADIUS : deployingRelay ? RELAY_RADIUS : OBSERVATORY_RADIUS);
  // The admission check belongs to the start of the move. A few millimeters
  // of drift under braking must not trap the arm at the edge of the site.
  const committed = committedStage === stage && state.buildProgress > 0;
  if (!station || (!committed && !canReachStation(state, station, radius, fabricating && station.access))) return;

  state.buildContext = stage;
  state.buildReady = parkedForStation(state) && state.buildCooldown === 0;
  state.buildHold = holding && state.buildReady;
  if (!state.buildHold) return;

  const duration = fabricating ? FABRICATION_SECONDS : deployingRelay || deployingPower ? DEPLOYMENT_SECONDS
    : deployingObservatory ? OBSERVATORY_DEPLOYMENT_SECONDS : OBSERVATORY_CALIBRATION_SECONDS;
  state.buildProgress = Math.min(1, state.buildProgress + dt / duration);
  if (state.buildProgress < 1 - 1e-9) return;

  switch (stage) {
    case "fabricate": state.buildStage = "deploy"; break;
    case "deploy":
      state.relayDeployed = true;
      state.buildStage = "resupply";
      break;
    case "fabricateObservatory": state.buildStage = "deployObservatory"; break;
    case "deployObservatory":
      state.observatoryDeployed = true;
      state.buildStage = "calibrateObservatory";
      state.buildCooldown = OBSERVATORY_WARMUP_SECONDS;
      state.calibrationStage = "warmup";
      break;
    case "calibrateObservatory":
      state.observatoryCalibrated = true;
      state.buildStage = state.mission === "campaign" ? "fabricatePower" : "return";
      state.calibrationStage = null;
      break;
    case "fabricatePower": state.buildStage = "deployPower"; break;
    case "deployPower":
      state.powerOnline = true;
      state.buildStage = "return";
      break;
  }
  state.buildContext = null;
  state.buildReady = false;
  state.buildHold = false;
  state.buildProgress = 0;
}

export function step(state, controls, crystals, hazard, dt, groundHeight = flatten,
  canReachSample, canAdvanceCut, surveySites = [], fixtures = crystals,
  relaySite, workshopPoint = DEFAULT_WORKSHOP, observatorySite = DEFAULT_OBSERVATORY_SITE) {
  if (state.phase !== "playing" || dt <= 0) return state;
  if (state.dataTransfer) controls = { brake: true };

  state.physicsCarry += dt;
  state.oreContact = -1;
  state.oreImpactSpeed = 0;
  const requestedMode = controls.scanMode === "rapid" || controls.scanMode === "precision" ? controls.scanMode : state.scanMode;
  if (!controls.interact) state.useLock = null;
  else if (!state.useHeld) state.useLock = selectUseTarget(state, crystals, surveySites, observatorySite, requestedMode);
  state.useHeld = Boolean(controls.interact);
  const use = controls.blockInteract ? null : state.useLock;

  const commandedMotion = Math.abs(controls.throttle ?? 0) > 0.08 || Math.abs(controls.steer ?? 0) > 0.08;
  const explicitScan = controls.scan || controls.rapid;
  const holding = Boolean((explicitScan || use?.kind === "scan") && !commandedMotion);
  const calibrating = state.buildStage === "calibrateObservatory";
  const surveying = Boolean((controls.survey || use?.kind === "survey") && !calibrating && !commandedMotion && !holding);
  const buildKey = calibrating ? controls.survey || use?.kind === "calibrateObservatory" : controls.build;
  const building = Boolean(buildKey && !commandedMotion && !holding && !surveying);
  const mode = controls.scan ? "precision" : controls.rapid ? "rapid" : use?.mode ?? requestedMode;
  const parking = (state.scanHold && holding) || (state.surveyHold && surveying) || (state.buildHold && building);
  const tractionControls = parking ? { ...controls, brake: true } : controls;
  while (state.physicsCarry + 1e-10 >= PHYSICS_STEP) {
    updateBoost(state, tractionControls, PHYSICS_STEP);
    integrate(state, tractionControls, groundHeight, fixtures, PHYSICS_STEP);
    state.physicsCarry = Math.max(0, state.physicsCarry - PHYSICS_STEP);
  }
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.time = Math.max(0, state.time - dt);
  if (state.dataTransfer) {
    state.transferProgress = Math.min(1, state.transferProgress + dt / DATA_TRANSFER_SECONDS);
    if (state.transferProgress >= 1 - 1e-9) {
      state.transferProgress = 1;
      if (state.dataTransfer === "survey") {
        state.campaignStage = "construction";
        state.buildStage = "fabricate";
      } else state.phase = "won";
      state.dataTransfer = null;
    }
    return state;
  }

  const distanceToBase = Math.hypot(state.x, state.z);
  const pluggedIn = distanceToBase <= RETURN_RADIUS
    || (state.powerOnline && Math.hypot(state.x - POWER_SITE.x, state.z - POWER_SITE.z) <= POWER_SITE.chargeRadius);
  state.charging = pluggedIn && parkedForStation(state) && !commandedMotion && state.energy < 0.999;
  const driveDraw = 0.0006 * Math.min(1, Math.abs(state.speed) / 2) + (state.boosting ? 0.010 : 0);
  const toolsDraw = state.scanHold || state.buildHold ? 0.002 : 0;
  state.energy = Math.max(0, Math.min(1, state.energy + dt * (state.charging ? 0.031 : -(driveDraw + toolsDraw))));
  const hazardDistance = hazard && hazard.scanning !== false ? Math.hypot(state.x - hazard.x, state.z - hazard.z) : Infinity;
  const exposed = distanceToBase > RETURN_RADIUS;
  state.warning = exposed && hazardDistance <= WARNING_RADIUS + 0.16 * Math.hypot(state.vx, state.vz);
  if (exposed && !state.cooldown && hazardDistance <= HIT_RADIUS) {
    state.hits++;
    state.cooldown = HIT_COOLDOWN;
    state.time = Math.max(0, state.time - HIT_PENALTY);
    state.boosting = false;
    state.speed *= 0.58;
    state.vx *= 0.58;
    state.vz *= 0.58;
  }

  if (state.time === 0) {
    state.phase = "lost";
    state.scanHold = state.surveyHold = state.buildHold = state.boosting = state.warning = false;
    state.useContext = null;
    state.useIndex = -1;
    return state;
  }

  const lockedSample = !explicitScan && state.useLock?.kind === "scan" ? state.useLock.index : null;
  const lockedSurvey = !controls.survey && state.useLock?.kind === "survey" ? state.useLock.index : null;
  const sample = nearbySite(state, crystals, state.mask, scanRange, lockedSample);
  const survey = nearbySite(state, surveySites, state.surveyMask, surveyRange, lockedSurvey);
  updateScan(state, sample?.index ?? -1, holding, mode, dt, canReachSample, canAdvanceCut);
  updateSurvey(state, surveySites, survey?.index ?? -1, surveying, dt);
  updateConstruction(state, building, dt, relaySite, workshopPoint, observatorySite, controls.committedConstruction);
  updateUseContext(state, crystals, surveySites, observatorySite, requestedMode);
  state.returnEligible = qualifiesForReturn(state);
  const canUpload = readyToUpload(state) && parkedForStation(state);
  if (distanceToBase <= RETURN_RADIUS && (canUpload || state.returnEligible)) {
    state.dataTransfer = canUpload ? "survey" : "return";
    state.transferProgress = 0;
    state.scanHold = state.surveyHold = state.buildHold = state.boosting = state.warning = false;
    state.useContext = null;
    state.useIndex = -1;
  }
  return state;
}
import { resolveOreContacts } from "./lunar-collision.mjs";

