import * as THREE from "three";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;

// Spaced cleanly across the expanded 64m×64m (ARENA_LIMIT = 32m) lunar basin with zero bottlenecks!
const RELIC_DEFS = [
  {
    id: "blackbox",
    x: -16.5,
    z: -17.5,
    code: "RELIC-01 // APOLLO-X BLACK BOX",
    name: "静海前哨黑匣子",
    nameEn: "Tranquility Outpost Black Box",
    reward: 85,
    speaker: "林指挥官 // 轨道空间站 SELENE-HQ",
    speakerEn: "CMDR. LIN // ORBITAL STATION SELENE-HQ",
    log: "「7 号车，我们终于捕获到黑匣子残波！三年前的 X 级耀斑切断了静海电网……你的中继站正在重新点亮这片环形山。」",
    logEn: "\"Rover-07, we locked the black-box telemetry! The X-class flare killed the grid 3 years ago... your relay is bringing the crater back online.\"",
  },
  {
    id: "satellite",
    x: 22.5,
    z: 9.8,
    code: "RELIC-02 // ORBITAL SAT-04",
    name: "坠毁轨道卫星残骸",
    nameEn: "Crashed Orbital Satellite Core",
    reward: 110,
    speaker: "林指挥官 // 轨道空间站 SELENE-HQ",
    speakerEn: "CMDR. LIN // ORBITAL STATION SELENE-HQ",
    log: "「惊人的发现！卫星陀螺仪记录了深层氦-3 矿脉坐标，已将 110 矿币研究奖金同步汇入你的月面机库账户。」",
    logEn: "\"Remarkable! The gyro logs pinpoint deep Helium-3 pockets. Syncing +110 CR research bounty to your Hangar account.\"",
  },
  {
    id: "cryopod",
    x: -21.5,
    z: 19.5,
    code: "RELIC-03 // HELIUM-3 CRYO POD",
    name: "远古氦-3 低温结晶舱",
    nameEn: "Helium-3 Cryogenic Core Pod",
    reward: 150,
    speaker: "林指挥官 // 轨道空间站 SELENE-HQ",
    speakerEn: "CMDR. LIN // ORBITAL STATION SELENE-HQ",
    log: "「全部 3 处前代科考遗迹已破译完毕！这批超高纯度氦-3 样本足以支撑基地一整年运转，返航火箭已就绪！」",
    logEn: "\"All 3 predecessor relics decoded! This ultra-pure Helium-3 core can power the outpost for a full year. Ascent rocket standing by!\"",
  },
];

function injectCampaignPlusStyles() {
  if (document.getElementById("lunar-camp-plus-styles")) return;
  const style = document.createElement("style");
  style.id = "lunar-camp-plus-styles";
  style.textContent = `
    #camp-plus-hud {
      position: fixed;
      inset: 0;
      z-index: 62;
      pointer-events: none;
      font-family: "IBM Plex Mono", Inter, "PingFang SC", system-ui, sans-serif;
    }
    #camp-plus-hud[hidden] { display: none !important; }
    .camp-sonar-bar {
      position: absolute;
      left: 50%;
      bottom: max(16px, calc(env(safe-area-inset-bottom) + 10px));
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 9px;
      pointer-events: auto;
    }
    .camp-sonar-btn {
      padding: 7px 13px;
      border: 1px solid #74ffd888;
      clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
      background: linear-gradient(110deg, #091d28e8, #103242e8);
      color: #c8fff4;
      font: 700 11px/1.1 inherit;
      letter-spacing: .07em;
      cursor: pointer;
      box-shadow: 0 6px 20px #000a, 0 0 16px #74ffd822;
      transition: transform .12s ease, border-color .14s ease, box-shadow .14s ease;
      white-space: nowrap;
    }
    .camp-sonar-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: #a8fff0;
      box-shadow: 0 8px 24px #000c, 0 0 22px #74ffd855;
    }
    .camp-sonar-btn:disabled { opacity: .55; cursor: default; }
    .camp-shield-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 11px;
      border: 1px solid #5eead466;
      background: #071724e4;
      box-shadow: 0 6px 18px #000a;
      transition: border-color .18s ease, box-shadow .18s ease;
    }
    .camp-shield-box[data-state="recharging"] {
      border-color: #74ffd8;
      box-shadow: 0 0 20px #74ffd866, inset 0 0 12px #74ffd822;
    }
    .camp-shield-box[data-state="low"] {
      border-color: #ff6b4a;
      box-shadow: 0 0 18px #ff552277;
    }
    .camp-shield-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .07em;
      color: #9bf7ec;
      white-space: nowrap;
    }
    .camp-shield-box[data-state="recharging"] .camp-shield-label { color: #74ffd8; }
    .camp-shield-box[data-state="low"] .camp-shield-label { color: #ff9c85; }
    .camp-shield-track {
      position: relative;
      width: 96px;
      height: 8px;
      background: #0f2233;
      border: 1px solid #74ffd833;
      overflow: hidden;
    }
    .camp-shield-fill {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, #22d3ee, #74ffd8);
      box-shadow: 0 0 10px #5eead488;
      transition: width .12s linear, background .18s ease;
    }
    .camp-shield-box[data-state="recharging"] .camp-shield-fill {
      background: linear-gradient(90deg, #38bdf8, #74ffd8, #fff6c2, #74ffd8);
      background-size: 200% 100%;
      animation: campShieldFlow .9s linear infinite;
    }
    .camp-shield-box[data-state="low"] .camp-shield-fill {
      background: linear-gradient(90deg, #ef4444, #fb923c);
      box-shadow: 0 0 12px #ef4444aa;
    }
    @keyframes campShieldFlow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
    .camp-shield-val {
      font-size: 10.5px;
      font-weight: 800;
      color: #e6fffb;
      min-width: 34px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .camp-relic-pill {
      padding: 6px 10px;
      border: 1px solid #ffd77855;
      background: #14120ae0;
      color: #ffe49c;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .07em;
      white-space: nowrap;
    }
    .camp-earth-pill {
      padding: 6px 10px;
      border: 1px solid #68d8ff77;
      background: linear-gradient(110deg, #071928e6, #0d2b44e6);
      color: #b7ecff;
      font: 700 10.5px/1.1 inherit;
      letter-spacing: .06em;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: 0 4px 16px #000a, 0 0 14px #38bdf822;
      transition: transform .12s ease, border-color .16s ease, box-shadow .16s ease;
    }
    .camp-earth-pill:hover {
      transform: translateY(-1px);
      border-color: #9ce6ff;
      box-shadow: 0 6px 20px #000c, 0 0 18px #38bdf844;
    }
    .camp-earth-pill[data-done="true"] {
      border-color: #74ffd888;
      background: #08221ee0;
      color: #9bf7ec;
    }
    .camp-crisis-banner {
      position: absolute;
      top: max(72px, calc(env(safe-area-inset-top) + 66px));
      left: 50%;
      transform: translateX(-50%);
      padding: 9px 20px;
      border: 1.5px solid #ff6b4a;
      clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%, 0 12px);
      background: linear-gradient(120deg, #3c0d0ae8, #58180de8);
      color: #ffe3d6;
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: .10em;
      text-align: center;
      box-shadow: 0 0 32px #ff4d2288, 0 10px 28px #000c;
      opacity: 0;
      transition: opacity .22s ease;
      white-space: nowrap;
    }
    .camp-crisis-banner[data-show="true"] { opacity: 1; }
    .camp-crisis-banner[data-tone="safe"] {
      border-color: #74ffd8;
      background: linear-gradient(120deg, #07292ee8, #0c3d3de8);
      color: #d6fff6;
      box-shadow: 0 0 28px #74ffd877, 0 10px 28px #000c;
    }
    .camp-crisis-banner[data-tone="meteor"] {
      border-color: #ffd275;
      background: linear-gradient(120deg, #321f08e8, #4d2c0ae8);
      color: #fff0c2;
      box-shadow: 0 0 28px #ffae3388, 0 10px 28px #000c;
    }
    /* 方案 A: 统一中下方电影字幕通讯条（轨道站无线电 + 伴飞小机器人对话 + 操作指引单一通道） */
    body[data-camp-plus="true"] #guide {
      position: fixed !important;
      left: 50% !important;
      right: auto !important;
      top: auto !important;
      bottom: max(62px, calc(env(safe-area-inset-bottom) + 54px)) !important;
      transform: translateX(-50%) !important;
      width: min(560px, 88vw) !important;
      max-width: min(560px, 88vw) !important;
      margin: 0 !important;
      padding: 9px 16px !important;
      border: 1px solid #74ffd844 !important;
      border-bottom: 2px solid #74ffd888 !important;
      border-radius: 2px !important;
      background: linear-gradient(90deg, #06101bd4, #0a1b2ce8 22%, #0a1b2ce8 78%, #06101bd4) !important;
      box-shadow: 0 12px 32px #000b, 0 0 18px #74ffd81a !important;
      backdrop-filter: blur(8px);
      z-index: 61;
      transition: opacity .22s ease, transform .22s ease !important;
    }
    body[data-camp-plus="true"][data-camp-radio="true"] #guide,
    body[data-camp-plus="true"][data-camp-cine="true"] #guide {
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translate(-50%, 6px) !important;
    }
    body[data-camp-plus="true"] #guide #guide-heading {
      font-size: 11px !important;
      letter-spacing: .08em;
    }
    body[data-camp-plus="true"] #guide :is(#guide-copy, #mission-notice-copy, #objective) {
      font-size: 12.5px !important;
      line-height: 1.42 !important;
      color: #e4f5f7 !important;
    }
    .camp-radio-card {
      position: absolute;
      bottom: max(62px, calc(env(safe-area-inset-bottom) + 54px));
      left: 50%;
      width: min(560px, 88vw);
      padding: 10px 16px;
      border: 1px solid #74ffd877;
      border-bottom: 2px solid #ffd778cc;
      border-radius: 2px;
      background: linear-gradient(90deg, #071622dc, #0b2234ee 24%, #0b2234ee 76%, #071622dc);
      box-shadow: 0 14px 36px #000c, 0 0 24px #74ffd82a;
      backdrop-filter: blur(8px);
      color: #e6f6f7;
      opacity: 0;
      transform: translate(-50%, 10px);
      transition: opacity .22s ease, transform .24s ease;
    }
    /* Mobile Portrait (<=600px): move sonar/shield bar under top telemetry and lift radio/guide above thumb controls */
    @media (max-width: 600px) {
      .camp-sonar-bar {
        top: max(86px, calc(env(safe-area-inset-top) + 76px));
        bottom: auto;
        left: 10px;
        right: 106px;
        transform: none;
        flex-wrap: wrap;
        gap: 5px;
      }
      .camp-sonar-btn, .camp-relic-pill, .camp-earth-pill {
        font-size: 9.5px;
        padding: 4px 7px;
      }
      .camp-shield-box { padding: 4px 7px; gap: 5px; }
      .camp-shield-label, .camp-shield-val { font-size: 9.5px; }
      .camp-shield-track { width: 48px; height: 6px; }
      .camp-radio-card,
      body[data-camp-plus="true"] #guide {
        bottom: max(154px, calc(env(safe-area-inset-bottom) + 146px)) !important;
        width: calc(100vw - 20px) !important;
        max-width: calc(100vw - 20px) !important;
        padding: 7px 11px !important;
      }
      .camp-crisis-banner {
        top: max(150px, calc(env(safe-area-inset-top) + 140px));
        max-width: calc(100vw - 20px);
        white-space: normal;
        font-size: 11px;
        padding: 6px 12px;
      }
    }
    /* Mobile Landscape (touch / short height): keep center sonar bar & radio cleanly between left joystick & right action buttons */
    @media (min-width: 601px) and (max-height: 500px), (min-width: 601px) and (pointer: coarse) {
      .camp-sonar-bar {
        bottom: max(10px, calc(env(safe-area-inset-bottom) + 6px));
        gap: 5px;
        max-width: calc(100vw - 328px);
      }
      .camp-sonar-btn, .camp-relic-pill, .camp-earth-pill {
        font-size: 9.5px;
        padding: 5px 7px;
      }
      .camp-shield-box { padding: 4px 7px; gap: 5px; }
      .camp-shield-label, .camp-shield-val { font-size: 9.5px; }
      .camp-shield-track { width: 42px; height: 6px; }
      .camp-radio-card,
      body[data-camp-plus="true"] #guide {
        bottom: max(60px, calc(env(safe-area-inset-bottom) + 56px)) !important;
        width: min(440px, calc(100vw - 332px)) !important;
        max-width: min(440px, calc(100vw - 332px)) !important;
        padding: 6px 11px !important;
      }
    }
    .camp-radio-card[data-show="true"] { opacity: 1; transform: translate(-50%, 0); }
    body[data-camp-cine="true"] .camp-radio-card { opacity: 0 !important; }
    .camp-radio-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-bottom: 5px; font-size: 9.5px; font-weight: 700; letter-spacing: .12em; color: #74ffd8;
    }
    .camp-radio-wave { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
    .camp-radio-wave i {
      display: block; width: 2px; background: #74ffd8;
      animation: campWave .55s ease-in-out infinite alternate;
    }
    .camp-radio-wave i:nth-child(2) { animation-delay: .12s; }
    .camp-radio-wave i:nth-child(3) { animation-delay: .26s; }
    .camp-radio-wave i:nth-child(4) { animation-delay: .38s; }
    @keyframes campWave { from { height: 3px; } to { height: 12px; } }
    .camp-radio-body { font: 500 12.2px/1.5 Inter, "PingFang SC", system-ui, sans-serif; color: #e2f5f7; }
    .camp-cine-bars {
      position: fixed;
      inset: 0;
      z-index: 66;
      pointer-events: none;
      opacity: 0;
      transition: opacity .24s ease;
    }
    .camp-cine-bars[data-active="true"] { opacity: 1; }
    .camp-cine-top, .camp-cine-bot {
      position: absolute; left: 0; right: 0; height: 48px;
      background: linear-gradient(90deg, #03060cf5, #0a1728f2, #03060cf5);
    }
    .camp-cine-top { top: 0; border-bottom: 1.5px solid #74ffd877; }
    .camp-cine-bot { bottom: 0; border-top: 1.5px solid #ffd77877; }
    .camp-cine-stamp {
      position: absolute;
      bottom: 62px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 22px;
      border: 1.5px solid #ffd778aa;
      background: linear-gradient(125deg, #0b1a2df0, #161030f0);
      box-shadow: 0 0 32px #74ffd844, 0 12px 30px #000c;
      text-align: center;
      white-space: nowrap;
    }
    .camp-cine-stamp strong {
      display: block;
      font-size: clamp(16px, 2.2vw, 24px);
      font-weight: 900;
      letter-spacing: .14em;
      color: #ffe89e;
      text-shadow: 0 0 16px #ffae33aa;
    }
    .camp-cine-stamp span {
      display: block;
      margin-top: 3px;
      font-size: 11px;
      letter-spacing: .12em;
      color: #8bf7e8;
    }
    .camp-flare-vignette {
      position: fixed;
      inset: 0;
      z-index: 58;
      pointer-events: none;
      background: radial-gradient(circle at 50% 45%, transparent 48%, #ff552266 100%);
      opacity: 0;
      transition: opacity .25s ease;
    }
  `;
  document.head.append(style);
}

export function createCampaignPlus({
  scene,
  height,
  sun,
  roverRig,
  dataDestination,
  t,
  qaMode = false,
  onAwardCoins,
  onJuice,
  onRocketFinished,
}) {
  injectCampaignPlusStyles();

  const group = new THREE.Group();
  group.name = "campaign-plus-world";
  scene.add(group);

  // --- Procedural Web Audio SFX ---
  let audioCtx = null;
  function ensureAudio() {
    if (qaMode) return null;
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playSonarSfx() {
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    for (const [freq, delay, gainPeak] of [[680, 0, 0.14], [1020, 0.12, 0.09], [1360, 0.24, 0.05]]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + delay + 0.45);
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.exponentialRampToValueAtTime(gainPeak, now + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.52);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.54);
    }
  }

  function playFlareAlarmSfx() {
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(420, now + i * 0.28);
      osc.frequency.linearRampToValueAtTime(640, now + i * 0.28 + 0.18);
      g.gain.setValueAtTime(0.0001, now + i * 0.28);
      g.gain.linearRampToValueAtTime(0.075, now + i * 0.28 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.28 + 0.24);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + i * 0.28);
      osc.stop(now + i * 0.28 + 0.26);
    }
  }

  function playImpactBoomSfx(vol = 0.24) {
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.60);
  }

  function playRocketLiftoffSfx() {
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3.8, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.setValueAtTime(160, now);
    flt.frequency.exponentialRampToValueAtTime(1050, now + 1.5);
    flt.frequency.exponentialRampToValueAtTime(280, now + 3.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, now + 3.75);
    src.connect(flt).connect(g).connect(ctx.destination);
    src.start(now);
    src.stop(now + 3.8);
  }

  // =========================================================================
  // 1. LIVING BASE 3D STRUCTURES (Physically Hardware-Anchored!)
  // =========================================================================

  // 1A. Relay Laser Power Tether — Anchored EXACTLY from Relay Dish (ry + 1.48) to Base Receiver Mast (dataDestination)!
  const tetherGroup = new THREE.Group();
  tetherGroup.visible = false;
  const tetherMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 2.8, 2.6),
    toneMapped: false, transparent: true, opacity: 0.78,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tetherBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 1, 8, 1, true), tetherMat);
  const relaySkyBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 42, 10, 1, true), tetherMat);
  const nodeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.2, 3.2, 3.0), toneMapped: false });
  const startCouplerNode = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), nodeMat);
  const endCouplerNode = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), nodeMat);
  const pulseOrbs = Array.from({ length: 4 }, () => new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.8, 2.2, 0.65), toneMapped: false }),
  ));
  tetherGroup.add(tetherBeam, relaySkyBeam, startCouplerNode, endCouplerNode, ...pulseOrbs);
  group.add(tetherGroup);

  // 1B. Observatory Hexagonal Sanctuary Dome (11.2m radius Solar Flare & Shield Recharge Safe Zone!)
  const domeUniforms = { uTime: { value: 0 }, uFlare: { value: 0 } };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: domeUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlare;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec2 vUv;
      void main() {
        vec3 V = normalize(cameraPosition - vPosW);
        float fres = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.2);
        float gridX = smoothstep(0.90, 0.99, abs(sin(vUv.x * 62.83 + uTime * 0.4)));
        float gridY = smoothstep(0.90, 0.99, abs(sin(vUv.y * 31.41 - uTime * 0.8)));
        float pulse = 0.55 + 0.45 * sin(uTime * 3.0 - vUv.y * 10.0);
        vec3 baseCol = mix(vec3(0.28, 0.95, 0.92), vec3(1.0, 0.82, 0.35), uFlare * 0.65);
        float alpha = (fres * 0.58 + max(gridX, gridY) * 0.24) * (0.65 + 0.35 * pulse);
        gl_FragColor = vec4(baseCol * (1.2 + uFlare * 0.8), clamp(alpha, 0.0, 0.82));
      }
    `,
  });
  const obsDomeGroup = new THREE.Group();
  obsDomeGroup.visible = false;
  const obsDomeMesh = new THREE.Mesh(new THREE.SphereGeometry(11.2, 28, 18, 0, TAU, 0, HALF_PI), domeMat);
  const obsGroundRing = new THREE.Mesh(
    new THREE.RingGeometry(10.85, 11.35, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(0.55, 2.6, 2.4), toneMapped: false,
      transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  obsGroundRing.rotation.x = -HALF_PI;
  obsGroundRing.position.y = 0.08;
  obsDomeGroup.add(obsDomeMesh, obsGroundRing);
  group.add(obsDomeGroup);

  // 1C. Solar Charging Speedway
  const solarConduitGroup = new THREE.Group();
  solarConduitGroup.visible = false;
  const chevronMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.65, 2.9, 2.2), toneMapped: false,
    transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const solarChevrons = Array.from({ length: 7 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.78, 3), chevronMat);
    m.rotation.x = -HALF_PI;
    solarConduitGroup.add(m);
    return m;
  });
  group.add(solarConduitGroup);

  // =========================================================================
  // 2. [Q] GEOLOGICAL SONAR RING + 3 HIDDEN EXPEDITION RELICS
  // =========================================================================
  const sonarRingMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 3.0, 2.8), toneMapped: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const sonarRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 64), sonarRingMat);
  sonarRing.rotation.x = -HALF_PI;
  sonarRing.visible = false;
  group.add(sonarRing);

  const metalBodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3948, metalness: 0.85, roughness: 0.25 });
  const darkTitaniumMat = new THREE.MeshStandardMaterial({ color: 0x18212b, metalness: 0.88, roughness: 0.34 });
  const goldFoilMat = new THREE.MeshStandardMaterial({ color: 0xd9a13b, emissive: 0x6b4408, emissiveIntensity: 0.45, metalness: 0.92, roughness: 0.20 });
  const aeroOrangeMat = new THREE.MeshStandardMaterial({ color: 0xd95b2b, metalness: 0.35, roughness: 0.38 });
  const bodyWhiteMat = new THREE.MeshStandardMaterial({ color: 0xe8eef3, metalness: 0.32, roughness: 0.26 });
  const relicBeaconMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.8, 2.0, 0.55), toneMapped: false,
    transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const relics = RELIC_DEFS.map(def => {
    const g = new THREE.Group();
    const gy = height(def.x, def.z);
    g.position.set(def.x, gy - 0.55, def.z);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.72), goldFoilMat);
    hull.position.y = 0.28;
    hull.rotation.z = 0.14;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.10, 0.22, 12), metalBodyMat);
    dish.position.set(0.15, 0.68, 0);
    dish.rotation.z = -0.35;
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 14, 10, 1, true), relicBeaconMat);
    beacon.position.y = 7.2;
    beacon.visible = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 28), relicBeaconMat);
    ring.rotation.x = -HALF_PI;
    ring.position.y = 0.12;
    ring.visible = false;
    g.add(hull, dish, beacon, ring);
    group.add(g);
    return { ...def, group: g, beacon, ring, groundY: gy, revealed: false, collected: false };
  });

  // =========================================================================
  // 3. MICRO-METEORITE + HELIUM-3 IMPACT CORE
  // =========================================================================
  const meteorGroup = new THREE.Group();
  meteorGroup.visible = false;
  const meteorRock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.52, 0),
    new THREE.MeshStandardMaterial({ color: 0x3b2820, emissive: 0xff621a, emissiveIntensity: 2.2, roughness: 0.45, metalness: 0.5 }),
  );
  const meteorTail = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 4.8, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(3.6, 1.5, 0.45), toneMapped: false,
      transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  meteorTail.position.y = 2.4;
  meteorGroup.add(meteorRock, meteorTail);
  group.add(meteorGroup);

  const meteorWarnRing = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.1, 32),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(3.4, 0.75, 0.35), toneMapped: false,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  meteorWarnRing.rotation.x = -HALF_PI;
  meteorWarnRing.visible = false;
  group.add(meteorWarnRing);

  const heliumCoreGroup = new THREE.Group();
  heliumCoreGroup.visible = false;
  const heliumCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.75, 3.2, 2.8), toneMapped: false }),
  );
  heliumCrystal.position.y = 0.75;
  const heliumRing = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.45, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(0.65, 3.0, 2.8), toneMapped: false,
      transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  heliumRing.rotation.x = -HALF_PI;
  heliumRing.position.y = 0.12;
  heliumCoreGroup.add(heliumCrystal, heliumRing);
  group.add(heliumCoreGroup);

  // =========================================================================
  // 4. HIGH-DETAIL AEROSPACE 3D ORBITAL CARGO ROCKET COMPLEX (Zero Clipping!)
  //    Placed at (13.8, -2.2): 8.8m+ away from every crystal & facility!
  // =========================================================================
  const rocketSite = { x: 13.8, z: -2.2 };
  const rocketBaseY = height(rocketSite.x, rocketSite.z);
  const rocketPadGroup = new THREE.Group();
  rocketPadGroup.position.set(rocketSite.x, rocketBaseY, rocketSite.z);

  // Octagonal Launch Concrete/Titanium Blast Deflector Deck + 4 Corner Beacons
  const padBase = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 3.05, 0.28, 8), darkTitaniumMat);
  padBase.position.y = 0.14;
  const blastRing = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.55, 0.34, 16), metalBodyMat);
  blastRing.position.y = 0.18;
  const blastPit = new THREE.Mesh(
    new THREE.CircleGeometry(1.18, 16),
    new THREE.MeshBasicMaterial({ color: 0x0b0f16 }),
  );
  blastPit.rotation.x = -HALF_PI;
  blastPit.position.y = 0.36;
  rocketPadGroup.add(padBase, blastRing, blastPit);

  const padBeaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3.2, 1.6, 0.45), toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI * 0.25;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.52, 8), metalBodyMat);
    post.position.set(Math.cos(a) * 2.45, 0.42, Math.sin(a) * 2.45);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), padBeaconMat);
    bulb.position.y = 0.30;
    post.add(bulb);
    rocketPadGroup.add(post);
  }

  // Detailed Red/White Aerospace Lattice Umbilical Gantry Tower
  const towerGroup = new THREE.Group();
  towerGroup.position.set(-2.05, 0.24, 0);
  const legPositions = [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.4, 0.08), aeroOrangeMat);
    leg.position.set(lx, 2.7, lz);
    towerGroup.add(leg);
  }
  for (let lv = 0; lv < 5; lv++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.07, 0.66), metalBodyMat);
    brace.position.y = 0.7 + lv * 1.1;
    towerGroup.add(brace);
  }
  const towerBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), padBeaconMat);
  towerBeacon.position.y = 5.55;
  towerGroup.add(towerBeacon);

  // Two Retractable Cryogenic Fuel Umbilical Arms (pivot smoothly away on ignition!)
  const upperArmPivot = new THREE.Group();
  upperArmPivot.position.set(0.28, 4.15, 0);
  const upperArmBeam = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.14, 0.16), bodyWhiteMat);
  upperArmBeam.position.x = 0.68;
  const upperArmPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.32, 8), goldFoilMat);
  upperArmPipe.rotation.z = HALF_PI;
  upperArmPipe.position.set(0.66, -0.10, 0);
  upperArmPivot.add(upperArmBeam, upperArmPipe);

  const lowerArmPivot = new THREE.Group();
  lowerArmPivot.position.set(0.28, 2.25, 0);
  const lowerArmBeam = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.14, 0.18), aeroOrangeMat);
  lowerArmBeam.position.x = 0.62;
  lowerArmPivot.add(lowerArmBeam);
  towerGroup.add(upperArmPivot, lowerArmPivot);
  rocketPadGroup.add(towerGroup);

  // Multi-Stage Sculpted Orbital Ascent Vehicle (SLN-07)
  const rocketVessel = new THREE.Group();
  rocketVessel.position.y = 0.42;

  // Lower Propellant Stage + Structural Tank Ribs
  const stage1 = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 2.55, 22), bodyWhiteMat);
  stage1.position.y = 1.65;
  rocketVessel.add(stage1);
  for (const ry of [0.55, 1.25, 2.15, 2.88]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.032, 8, 24), darkTitaniumMat);
    rib.rotation.x = HALF_PI;
    rib.position.y = ry;
    rocketVessel.add(rib);
  }
  // Gold MLI Thermal Interstage Collar + Aero Accent Stripe
  const interstage = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.62, 22), goldFoilMat);
  interstage.position.y = 3.22;
  const upperCabin = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.58, 1.12, 22), bodyWhiteMat);
  upperCabin.position.y = 4.08;
  const cockpitViewport = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.16, 0.12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.45, 2.2, 2.8), toneMapped: false }),
  );
  cockpitViewport.position.set(0, 4.18, 0.53);
  const noseFairing = new THREE.Mesh(new THREE.ConeGeometry(0.54, 1.38, 22), bodyWhiteMat);
  noseFairing.position.y = 5.33;
  const noseTip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 12), darkTitaniumMat);
  noseTip.position.y = 6.18;
  rocketVessel.add(interstage, upperCabin, cockpitViewport, noseFairing, noseTip);

  // 4 Sculpted Swept Delta Fins + Attitude Thruster Pods + 4 Landing Struts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const finGroup = new THREE.Group();
    finGroup.rotation.y = a;
    const finBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.25, 0.68), darkTitaniumMat);
    finBlade.position.set(0, 0.92, 0.82);
    finBlade.rotation.x = 0.24;
    const finAccent = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.72, 0.12), aeroOrangeMat);
    finAccent.position.set(0, 0.96, 1.12);
    finAccent.rotation.x = 0.24;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.95, 8), metalBodyMat);
    strut.position.set(0, 0.36, 0.85);
    strut.rotation.x = -0.52;
    finGroup.add(finBlade, finAccent, strut);
    rocketVessel.add(finGroup);
  }

  // 3-Bell Clustered Main Engine Skirt
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.25, 0.44, 14), darkTitaniumMat);
    bell.position.set(Math.cos(a) * 0.26, 0.18, Math.sin(a) * 0.26);
    rocketVessel.add(bell);
  }

  // Multi-Layer Volumetric Exhaust Plume (White-Hot Core + Cyan Mach Diamond + Golden Outer Cone)
  const rocketPlumeGroup = new THREE.Group();
  rocketPlumeGroup.visible = false;
  const outerPlumeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(3.6, 1.85, 0.55), toneMapped: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const outerPlume = new THREE.Mesh(new THREE.ConeGeometry(0.82, 6.4, 16), outerPlumeMat);
  outerPlume.rotation.x = Math.PI;
  outerPlume.position.y = -3.1;
  const innerCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.4, 3.4, 3.8), toneMapped: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const innerCore = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.8, 14), innerCoreMat);
  innerCore.rotation.x = Math.PI;
  innerCore.position.y = -1.85;
  rocketPlumeGroup.add(outerPlume, innerCore);
  rocketVessel.add(rocketPlumeGroup);
  rocketPadGroup.add(rocketVessel);

  // Expanding Lunar Blast Dust Ring + Cryogenic Vent Steam Puffs (14 billowing puffs!)
  const blastDustMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.6, 2.0, 1.25), toneMapped: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const blastDustRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 2.2, 36), blastDustMat);
  blastDustRing.rotation.x = -HALF_PI;
  blastDustRing.position.y = 0.22;
  blastDustRing.visible = false;
  rocketPadGroup.add(blastDustRing);

  const steamGeo = new THREE.DodecahedronGeometry(0.32, 0);
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xdceeff, transparent: true, opacity: 0.52, depthWrite: false });
  const steamMesh = new THREE.InstancedMesh(steamGeo, steamMat, 14);
  steamMesh.count = 0;
  steamMesh.frustumCulled = false;
  group.add(steamMesh);
  const steamPuffs = [];
  const steamDummy = new THREE.Object3D();

  group.add(rocketPadGroup);

  // =========================================================================
  // 5. ORBITAL DROP-IN INTRO VFX (Downward Retro-Plumes + Touchdown Dust Ring)
  // =========================================================================
  const dropDustMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(1.4, 2.4, 2.4), toneMapped: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const dropDustRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.35, 36), dropDustMat);
  dropDustRing.rotation.x = -HALF_PI;
  dropDustRing.visible = false;
  group.add(dropDustRing);

  const retroMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(1.1, 3.0, 3.4), toneMapped: false,
    transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const retroPlumes = new THREE.Group();
  retroPlumes.visible = false;
  for (const [rx, rz] of [[-0.62, -0.75], [0.62, -0.75], [-0.62, 0.75], [0.62, 0.75]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.35, 10), retroMat);
    cone.rotation.x = Math.PI;
    cone.position.set(rx, -0.62, rz);
    retroPlumes.add(cone);
  }
  group.add(retroPlumes);

  // =========================================================================
  // 6. HUD DOM OVERLAYS (Sonar + Shield Bar + Relic Pill + Unified Subtitle)
  // =========================================================================
  const hud = document.createElement("div");
  hud.id = "camp-plus-hud";
  hud.hidden = true;
  hud.innerHTML = `
    <div id="camp-crisis-banner" class="camp-crisis-banner" data-show="false"></div>
    <div id="camp-radio-card" class="camp-radio-card" data-show="false">
      <div class="camp-radio-head">
        <span id="camp-radio-speaker">SELENE-HQ // ORBITAL COMMS</span>
        <span class="camp-radio-wave"><i></i><i></i><i></i><i></i></span>
      </div>
      <div id="camp-radio-body" class="camp-radio-body"></div>
    </div>
    <div class="camp-sonar-bar">
      <button type="button" id="camp-sonar-btn" class="camp-sonar-btn">${t("📡 [Q] 地质声呐脉冲", "📡 [Q] GEOLOGICAL SONAR")}</button>
      <div id="camp-shield-box" class="camp-shield-box" data-state="ok">
        <span id="camp-shield-label" class="camp-shield-label">${t("🛡️ 车载护盾", "🛡️ SHIELD")}</span>
        <div class="camp-shield-track"><div id="camp-shield-fill" class="camp-shield-fill"></div></div>
        <span id="camp-shield-val" class="camp-shield-val">100%</span>
      </div>
      <span id="camp-relic-pill" class="camp-relic-pill">${t("遗迹 0 / 3", "RELICS 0 / 3")}</span>
      <button type="button" id="camp-earth-pill" class="camp-earth-pill" data-done="false">${t("🌍 彩蛋：拍摄地球", "🌍 EASTER EGG: EARTH")}</button>
    </div>
  `;
  document.body.append(hud);

  const cineBars = document.createElement("div");
  cineBars.className = "camp-cine-bars";
  cineBars.dataset.active = "false";
  cineBars.innerHTML = `
    <div class="camp-cine-top"></div>
    <div class="camp-cine-stamp">
      <strong id="camp-cine-title"></strong>
      <span id="camp-cine-sub"></span>
    </div>
    <div class="camp-cine-bot"></div>
  `;
  document.body.append(cineBars);

  const flareVignette = document.createElement("div");
  flareVignette.className = "camp-flare-vignette";
  document.body.append(flareVignette);

  const crisisEl = hud.querySelector("#camp-crisis-banner");
  const radioCard = hud.querySelector("#camp-radio-card");
  const radioSpeakerEl = hud.querySelector("#camp-radio-speaker");
  const radioBodyEl = hud.querySelector("#camp-radio-body");
  const sonarBtn = hud.querySelector("#camp-sonar-btn");
  const shieldBoxEl = hud.querySelector("#camp-shield-box");
  const shieldLabelEl = hud.querySelector("#camp-shield-label");
  const shieldFillEl = hud.querySelector("#camp-shield-fill");
  const shieldValEl = hud.querySelector("#camp-shield-val");
  const relicPillEl = hud.querySelector("#camp-relic-pill");
  const earthPillEl = hud.querySelector("#camp-earth-pill");
  const cineTitleEl = cineBars.querySelector("#camp-cine-title");
  const cineSubEl = cineBars.querySelector("#camp-cine-sub");

  // =========================================================================
  // 7. STATE & CINEMATIC DIRECTOR
  // =========================================================================
  let active = false;
  let sonarTimer = 0;
  let sonarCooldown = 0;
  let radioTimer = 0;
  let shieldEnergy = 100;
  let shieldRecharging = false;
  let prevHits = 0;
  let prevRelay = false;
  let prevObs = false;
  let prevPower = false;
  let obsSitePos = null;
  let solarSitePos = null;
  let relaySitePos = null;
  let earthHintShown = false;
  let earthObserved = false;
  let earthArchived = false;
  let earthPlayElapsed = 0;

  earthPillEl?.addEventListener("click", () => {
    if (!active || qaMode) return;
    showRadio(
      t("林指挥官 // 地球光学观测彩蛋", "CMDR. LIN // EARTH TELESCOPE EASTER EGG"),
      earthArchived
        ? t("「地球观测档案已永久保存在你的任务日志中，随时可以再回望远镜欣赏实时云层流转！」", "\"Your Earth photo archive is saved! Visit the telescope north of the pad anytime to watch the live cloud bands.\"")
        : t("「着陆坪北侧约 9 米处（发光金青色棱镜标记）架设着地球光学望远镜——驶近停稳按 [E] 即可进入取景器拍摄地出彩蛋照！」", "\"An optical telescope stands ~9m north of the Landing Pad (marked by the glowing prism) — pull up and press [E] to photograph Earth!\""),
      6.2,
    );
  });

  // Orbital Drop-In Intro State (2.4s smooth descent from orbit onto Landing Pad!)
  let dropIntroActive = false;
  let dropIntroElapsed = 0;
  let dropTouchdownFired = false;
  let dropLiftOffset = 0;

  // Dynamic Micro-Crises State
  let flareState = "idle";
  let flareTimer = 0;
  let flareNextCooldown = 36;
  const origSunColor = sun ? sun.color.clone() : new THREE.Color(0xffffff);
  const flareSunColor = new THREE.Color(0xff7744);

  let meteorState = "idle";
  let meteorTimer = 0;
  let meteorNextCooldown = 26;
  const meteorPos = new THREE.Vector3();

  // Cinematic Close-Up Director
  let cine = null;
  let rocketLaunching = false;
  let rocketElapsed = 0;
  let rocketDoneCalled = false;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmpStart = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();

  function showRadio(speaker, body, dur = 5.6) {
    if (qaMode) return;
    radioSpeakerEl.textContent = speaker;
    radioBodyEl.textContent = body;
    radioCard.dataset.show = "true";
    document.body.dataset.campRadio = "true";
    radioTimer = dur;
  }

  function startCloseUp({ kind, title, sub, target, dur = 2.3, radius = 6.2, lift = 2.6, angleStart = 0.4, angleSpan = 1.2, onDone = null }) {
    if (qaMode) {
      onDone?.();
      return;
    }
    cine = { kind, elapsed: 0, dur, target: target.clone(), radius, lift, angleStart, angleSpan, onDone };
    cineTitleEl.textContent = title;
    cineSubEl.textContent = sub;
    cineBars.dataset.active = "true";
    document.body.dataset.campCine = "true";
  }

  function emitSteamPuff(origin) {
    if (steamPuffs.length >= 14) steamPuffs.shift();
    const a = Math.random() * TAU;
    const spd = 2.2 + Math.random() * 2.8;
    steamPuffs.push({
      x: origin.x + (Math.random() - 0.5) * 0.6,
      y: origin.y + 0.35,
      z: origin.z + (Math.random() - 0.5) * 0.6,
      vx: Math.cos(a) * spd,
      vy: 0.9 + Math.random() * 1.4,
      vz: Math.sin(a) * spd,
      t: 0, dur: 1.05 + Math.random() * 0.35,
    });
  }

  function triggerSonar(roverPos) {
    if (!active || sonarCooldown > 0 || rocketLaunching || dropIntroActive) return false;
    sonarTimer = 1.85;
    sonarCooldown = 5.0;
    sonarRing.position.set(roverPos.x, height(roverPos.x, roverPos.z) + 0.18, roverPos.z);
    sonarRing.scale.setScalar(1);
    sonarRing.visible = true;
    sonarRingMat.opacity = 0.92;
    playSonarSfx();
    onJuice?.({ crit: false, tier: 1 });
    return true;
  }

  sonarBtn.addEventListener("click", () => {
    if (lastRoverPos) triggerSonar(lastRoverPos);
  });

  let lastRoverPos = null;
  window.addEventListener("keydown", e => {
    if (!active || qaMode) return;
    if (e.code === "KeyQ" && !e.repeat && lastRoverPos) {
      triggerSonar(lastRoverPos);
    }
  });

  function triggerSolarFlare() {
    if (qaMode || flareState !== "idle" || rocketLaunching) return;
    flareState = "warn";
    flareTimer = 7.5;
    playFlareAlarmSfx();
    showRadio(
      t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
      t("「警报！监测到 X 级太阳耀斑正扑向静海区！7 秒内驶入着陆坪或观测站全息护盾罩避险！」", "\"ALERT! X-class solar flare inbound! Shelter at the Landing Pad or Observatory Dome within 7 seconds!\""),
      5.2,
    );
  }

  function triggerMeteorEvent(roverPos) {
    if (qaMode || meteorState !== "idle" || rocketLaunching) return;
    const ang = Math.random() * TAU;
    const dist = 13 + Math.random() * 7;
    const mx = THREE.MathUtils.clamp(roverPos.x + Math.cos(ang) * dist, -26, 26);
    const mz = THREE.MathUtils.clamp(roverPos.z + Math.sin(ang) * dist, -26, 26);
    const my = height(mx, mz);
    meteorPos.set(mx, my, mz);
    meteorWarnRing.position.set(mx, my + 0.14, mz);
    meteorWarnRing.visible = true;
    meteorGroup.position.set(mx + 6, my + 48, mz - 6);
    meteorGroup.visible = true;
    meteorState = "falling";
    meteorTimer = 2.6;
    crisisEl.dataset.tone = "meteor";
    crisisEl.textContent = t("☄ 微陨石坠落预警！即将撞击附近地表并暴露高纯度氦-3 陨石核！", "☄ MICRO-METEORITE INBOUND! HELIUM-3 CORE IMPACT DETECTED!");
    crisisEl.dataset.show = "true";
  }

  function triggerRocketFinale() {
    if (rocketLaunching) return;
    rocketLaunching = true;
    rocketElapsed = 0;
    rocketDoneCalled = false;
    flareState = "idle";
    flareVignette.style.opacity = "0";
    crisisEl.dataset.show = "false";
    if (sun) sun.color.copy(origSunColor);
    if (qaMode) {
      onRocketFinished?.();
      return;
    }
    playRocketLiftoffSfx();
    onAwardCoins?.(350, "campaign_complete");
    showRadio(
      t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
      t("「所有设施在线，月面电网已全线贯通！SLN-07 轨道货舱主引擎点火，+350 机库通用矿币已入账！」", "\"All facilities online! SLN-07 Orbital Ascent Engine ignited — +350 Hangar Credits awarded!\""),
      4.5,
    );
    startCloseUp({
      kind: "rocket",
      title: t("🚀 MISSION COMPLETE // 轨道物资舱点火升空！", "🚀 MISSION COMPLETE // ORBITAL ASCENT LIFTOFF!"),
      sub: t("月面采集站全面竣工 · 奖励 +350 机库通用矿币", "LUNAR FIELD STATION ONLINE · +350 HANGAR CREDITS"),
      target: new THREE.Vector3(rocketSite.x, rocketBaseY + 2.8, rocketSite.z),
      dur: 4.5,
      radius: 10.6,
      lift: 2.4,
      angleStart: -0.75,
      angleSpan: 1.05,
      onDone: () => {
        if (!rocketDoneCalled) {
          rocketDoneCalled = true;
          onRocketFinished?.();
        }
      },
    });
  }

  function reset(enableCampaign = false) {
    active = enableCampaign;
    group.visible = enableCampaign;
    hud.hidden = !enableCampaign || qaMode;
    document.body.dataset.campPlus = String(enableCampaign && !qaMode);
    document.body.dataset.campRadio = "false";
    document.body.dataset.campCine = "false";
    sonarTimer = 0;
    sonarCooldown = 0;
    sonarRing.visible = false;
    earthHintShown = false;
    earthObserved = false;
    earthArchived = false;
    earthPlayElapsed = 0;
    if (earthPillEl) {
      earthPillEl.dataset.done = "false";
      earthPillEl.textContent = t("🌍 彩蛋：拍摄地球", "🌍 EASTER EGG: EARTH");
    }
    radioTimer = 0;
    radioCard.dataset.show = "false";
    crisisEl.dataset.show = "false";
    flareVignette.style.opacity = "0";
    cine = null;
    cineBars.dataset.active = "false";
    shieldEnergy = 100;
    shieldRecharging = false;
    prevHits = 0;
    prevRelay = false;
    prevObs = false;
    prevPower = false;
    tetherGroup.visible = false;
    obsDomeGroup.visible = false;
    solarConduitGroup.visible = false;
    flareState = "idle";
    flareTimer = 0;
    flareNextCooldown = 36;
    meteorState = "idle";
    meteorTimer = 0;
    meteorNextCooldown = 26;
    meteorGroup.visible = false;
    meteorWarnRing.visible = false;
    heliumCoreGroup.visible = false;
    rocketLaunching = false;
    rocketElapsed = 0;
    rocketDoneCalled = false;
    rocketVessel.position.y = 0.42;
    rocketPlumeGroup.visible = false;
    blastDustRing.visible = false;
    upperArmPivot.rotation.z = 0;
    lowerArmPivot.rotation.z = 0;
    steamPuffs.length = 0;
    steamMesh.count = 0;
    dropDustRing.visible = false;
    retroPlumes.visible = false;
    dropIntroActive = enableCampaign && !qaMode;
    dropIntroElapsed = 0;
    dropTouchdownFired = false;
    dropLiftOffset = dropIntroActive ? 10.5 : 0;
    if (sun) sun.color.copy(origSunColor);
    for (const r of relics) {
      r.revealed = false;
      r.collected = false;
      r.group.position.y = r.groundY - 0.55;
      r.beacon.visible = false;
      r.ring.visible = false;
    }
    relicPillEl.textContent = t("遗迹 0 / 3", "RELICS 0 / 3");
    if (dropIntroActive) {
      // Dramatic 2.4s Orbital Sky-Crane Drop-In Intro Cutscene!
      startCloseUp({
        kind: "drop",
        title: t("🛰️ SELENE-07 // 月面采样车轨道空降着陆", "🛰️ SELENE-07 // ORBITAL DROP-IN TOUCHDOWN"),
        sub: t("静海盆地 64m 扩建勘探区 · 反推引擎减速着陆中", "TRANQUILITY BASIN · RETRO-THRUSTER DESCENT"),
        target: new THREE.Vector3(0, height(0, 0) + 2.4, 0),
        dur: 2.35,
        radius: 6.8,
        lift: 1.85,
        angleStart: -0.95,
        angleSpan: 0.95,
        onDone: () => {
          dropIntroActive = false;
          dropLiftOffset = 0;
          retroPlumes.visible = false;
          dropDustRing.visible = false;
          showRadio(
            t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
            t("「着陆平稳！7 号车，按 [Q] 可发射地质声呐搜寻 3 处前代科考遗迹，进安全护盾可恢复车载护盾能量。」", "\"Clean touchdown! Rover-07, press [Q] for Geological Sonar to find 3 lost relics, and shelter inside domes to recharge your Shield.\""),
            6.0,
          );
        },
      });
    }
  }

  function update({ state, dt, rawDt, visualTime, roverPos, relaySite, observatorySite, powerSite }) {
    if (!active) return;
    lastRoverPos = roverPos;
    relaySitePos = relaySite;
    obsSitePos = observatorySite;
    solarSitePos = powerSite;

    // 0. Orbital Drop-In Intro Animation (Rover descends from 10.5m skyward onto Landing Pad!)
    if (dropIntroActive) {
      dropIntroElapsed += rawDt;
      const descentP = THREE.MathUtils.clamp(dropIntroElapsed / 1.65, 0, 1);
      // Smooth ease-out braking curve with slight touchdown suspension bounce
      const easeOut = 1 - Math.pow(1 - descentP, 3);
      const bounce = descentP >= 1
        ? Math.sin((dropIntroElapsed - 1.65) * 14) * Math.exp(-(dropIntroElapsed - 1.65) * 6.5) * 0.14
        : 0;
      dropLiftOffset = (1 - easeOut) * 10.5 + Math.max(0, bounce);
      roverRig.rover.position.y += dropLiftOffset;
      if (descentP < 1) {
        retroPlumes.visible = true;
        retroPlumes.position.copy(roverRig.rover.position);
        retroPlumes.quaternion.copy(roverRig.rover.quaternion);
        retroPlumes.scale.set(1, 0.85 + 0.25 * Math.sin(visualTime * 48), 1);
        dropDustRing.visible = descentP > 0.35;
        if (dropDustRing.visible) {
          const dp = (descentP - 0.35) / 0.65;
          dropDustRing.position.set(roverPos.x, height(roverPos.x, roverPos.z) + 0.12, roverPos.z);
          dropDustRing.scale.setScalar(0.8 + dp * 2.6);
          dropDustMat.opacity = (1 - dp * 0.4) * 0.65;
        }
      } else {
        retroPlumes.visible = false;
        if (!dropTouchdownFired) {
          dropTouchdownFired = true;
          playImpactBoomSfx(0.18);
          onJuice?.({ crit: false, tier: 2 });
        }
        const fade = Math.max(0, 1 - (dropIntroElapsed - 1.65) / 0.65);
        dropDustRing.scale.setScalar(3.4 + (1 - fade) * 1.8);
        dropDustMat.opacity = fade * 0.55;
        if (fade <= 0) dropDustRing.visible = false;
      }
      if (cine && cine.kind === "drop") {
        cine.target.set(roverPos.x, roverRig.rover.position.y + 0.65, roverPos.z);
      }
    }

    // 1. Living Base Facility Activations — Physically Anchored Laser Tether!
    if (state.relayDeployed && !prevRelay && relaySite) {
      prevRelay = true;
      tetherGroup.visible = true;
      const ry = height(relaySite.x, relaySite.z);
      // Exact physical dish height = ry + 1.48; exact Landing Pad Receiver tip = dataDestination!
      tmpStart.set(relaySite.x, ry + 1.48, relaySite.z);
      tmpEnd.copy(dataDestination || new THREE.Vector3(2.86, height(2.86, 0.85) + 1.0, 0.85));
      const dist = tmpStart.distanceTo(tmpEnd);
      tetherBeam.position.copy(tmpStart).lerp(tmpEnd, 0.5);
      tetherBeam.scale.set(1, dist, 1);
      tetherBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmpEnd.clone().sub(tmpStart).normalize());
      // Skyward beam base starts flush on the Relay Dish (ry + 1.48), ZERO floating gap!
      relaySkyBeam.position.set(relaySite.x, ry + 1.48 + 21, relaySite.z);
      startCouplerNode.position.copy(tmpStart);
      endCouplerNode.position.copy(tmpEnd);
      showRadio(
        t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
        t("「中继站激光链路已精准对接基地接收塔！全图信号恢复，但太阳活动正在加剧，请留意耀斑警报。」", "\"Relay laser tether locked directly to the Base Receiver! Watch for rising solar flare activity.\""),
        5.5,
      );
      startCloseUp({
        kind: "facility",
        title: t("📡 RELAY ONLINE // 月面激光信号网已接通", "📡 RELAY ONLINE // LASER TETHER ACTIVATED"),
        sub: t("中继天线 ⇄ 基地接收塔物理链路建立 · 电网 1/3", "ANTENNA-TO-RECEIVER LOCKED · GRID PHASE 1/3"),
        target: new THREE.Vector3(relaySite.x, ry + 1.5, relaySite.z),
        dur: 2.3,
        radius: 6.4,
        lift: 2.5,
      });
    }

    if (state.observatoryDeployed && !prevObs && observatorySite) {
      prevObs = true;
      const oy = height(observatorySite.x, observatorySite.z);
      obsDomeGroup.position.set(observatorySite.x, oy, observatorySite.z);
      obsDomeGroup.visible = true;
      showRadio(
        t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
        t("「观测站全息星穹护盾已展开！驶入这片 11 米护盾罩即可抵御太阳耀斑，并快速恢复车载护盾能量。」", "\"Observatory Sanctuary Dome deployed! Drive inside to block solar flares and rapidly recharge your Rover Shield.\""),
        5.6,
      );
      startCloseUp({
        kind: "facility",
        title: t("🛡️ SANCTUARY DOME // 观测站全息护盾展开", "🛡️ SANCTUARY DOME // SOLAR SHIELD ONLINE"),
        sub: t("太阳耀斑安全庇护所 & 护盾充能区启用 · 电网 2/3", "SAFE ZONE & SHIELD RECHARGE ACTIVE · GRID 2/3"),
        target: new THREE.Vector3(observatorySite.x, oy + 2.0, observatorySite.z),
        dur: 2.4,
        radius: 13.5,
        lift: 4.8,
      });
    }

    if (state.powerOnline && !prevPower && powerSite) {
      prevPower = true;
      solarConduitGroup.visible = true;
      const start = new THREE.Vector3(powerSite.x, 0, powerSite.z);
      const end = new THREE.Vector3(0, 0, 0);
      const dir = end.clone().sub(start).normalize();
      const yaw = Math.atan2(dir.x, dir.z);
      for (let i = 0; i < solarChevrons.length; i++) {
        const f = (i + 0.5) / solarChevrons.length;
        const cx = THREE.MathUtils.lerp(powerSite.x, 0, f);
        const cz = THREE.MathUtils.lerp(powerSite.z, 0, f);
        solarChevrons[i].position.set(cx, height(cx, cz) + 0.14, cz);
        solarChevrons[i].rotation.z = -yaw;
      }
      startCloseUp({
        kind: "facility",
        title: t("⚡ SOLAR GRID // 太阳能磁力补给大道贯通", "⚡ SOLAR GRID // MAG-LEV CHARGING CONDUIT"),
        sub: t("驶过光带即瞬满推进与护盾 · 东方 SLN-07 火箭待命！", "INSTANT BOOST & SHIELD RECHARGE · ROCKET ARMED!"),
        target: new THREE.Vector3(powerSite.x * 0.5, height(powerSite.x * 0.5, powerSite.z * 0.5) + 1.2, powerSite.z * 0.5),
        dur: 2.3,
        radius: 8.5,
        lift: 3.4,
      });
    }

    // Animate Living Base VFX
    if (tetherGroup.visible && relaySitePos) {
      const ry = height(relaySitePos.x, relaySitePos.z);
      tmpStart.set(relaySitePos.x, ry + 1.48, relaySitePos.z);
      tmpEnd.copy(dataDestination || new THREE.Vector3(2.86, height(2.86, 0.85) + 1.0, 0.85));
      for (let i = 0; i < pulseOrbs.length; i++) {
        const f = (visualTime * 0.45 + i / pulseOrbs.length) % 1;
        pulseOrbs[i].position.lerpVectors(tmpStart, tmpEnd, f);
      }
    }
    if (obsDomeGroup.visible) {
      domeUniforms.uTime.value = visualTime;
      domeUniforms.uFlare.value = THREE.MathUtils.damp(domeUniforms.uFlare.value, flareState === "active" ? 1 : 0, 4, rawDt);
    }
    if (solarConduitGroup.visible && solarSitePos) {
      for (let i = 0; i < solarChevrons.length; i++) {
        const pulse = 0.78 + 0.28 * Math.sin(visualTime * 6 - i * 0.9);
        solarChevrons[i].scale.setScalar(pulse);
      }
    }

    // 2. Rover Shield Energy Bar (HP/Shield Gauge + Recharge VFX inside Sanctuary Dome / Landing Pad / Solar Speedway!)
    if (!qaMode && state.phase === "playing" && !rocketLaunching) {
      if (state.hits > prevHits) {
        prevHits = state.hits;
        shieldEnergy = Math.max(0, shieldEnergy - 28);
      }
      const inPad = Math.hypot(roverPos.x, roverPos.z) < 5.5;
      const inDome = obsDomeGroup.visible && obsSitePos && Math.hypot(roverPos.x - obsSitePos.x, roverPos.z - obsSitePos.z) < 11.4;
      const onSolar = solarConduitGroup.visible && solarSitePos && Math.hypot(roverPos.x - solarSitePos.x * 0.5, roverPos.z - solarSitePos.z * 0.5) < 5.8;
      const sheltered = inPad || inDome || onSolar;

      shieldRecharging = false;
      if (sheltered && shieldEnergy < 100) {
        shieldEnergy = Math.min(100, shieldEnergy + 18.0 * dt);
        shieldRecharging = true;
      }
      if (onSolar) {
        state.boostCharge = Math.min(1, state.boostCharge + dt * 0.45);
      }

      // Show shimmering 3D Hexagonal Shield Dome on the Rover whenever recharging or absorbing solar flare!
      const show3DShield = shieldRecharging || (flareState === "active" && shieldEnergy > 0);
      roverRig.setVisualEvolution?.({
        shield: show3DShield ? 1 : 0,
        stuntGlow: shieldRecharging ? 0.65 : 0,
        dt,
        time: visualTime,
      });

      const pct = Math.round(shieldEnergy);
      shieldFillEl.style.width = `${pct}%`;
      shieldValEl.textContent = `${pct}%`;
      if (shieldRecharging) {
        shieldBoxEl.dataset.state = "recharging";
        shieldLabelEl.textContent = t("⚡ 护盾充能中", "⚡ RECHARGING");
      } else if (pct <= 35) {
        shieldBoxEl.dataset.state = "low";
        shieldLabelEl.textContent = t("⚠ 护盾告急", "⚠ SHIELD LOW");
      } else {
        shieldBoxEl.dataset.state = "ok";
        shieldLabelEl.textContent = t("🛡️ 车载护盾", "🛡️ SHIELD");
      }
    }

    // 3. [Q] Geological Sonar Ring & 3 Hidden Expedition Relics
    if (sonarCooldown > 0) {
      sonarCooldown = Math.max(0, sonarCooldown - rawDt);
      sonarBtn.disabled = sonarCooldown > 0;
      sonarBtn.textContent = sonarCooldown > 0
        ? t(`📡 声呐充能 (${sonarCooldown.toFixed(1)}s)`, `📡 SONAR (${sonarCooldown.toFixed(1)}s)`)
        : t("📡 [Q] 地质声呐脉冲", "📡 [Q] GEOLOGICAL SONAR");
    }
    if (sonarTimer > 0) {
      sonarTimer = Math.max(0, sonarTimer - rawDt);
      const p = 1 - sonarTimer / 1.85;
      const curRadius = 1.0 + p * 56.0;
      sonarRing.scale.setScalar(curRadius);
      sonarRingMat.opacity = (1 - p) * 0.88;
      for (const r of relics) {
        if (!r.revealed && !r.collected) {
          const d = Math.hypot(r.x - sonarRing.position.x, r.z - sonarRing.position.z);
          if (d <= curRadius + 1.5) {
            r.revealed = true;
            r.beacon.visible = true;
            r.ring.visible = true;
          }
        }
      }
      if (sonarTimer === 0) sonarRing.visible = false;
    }

    let collectedCount = 0;
    for (const r of relics) {
      if (r.collected) {
        collectedCount++;
        continue;
      }
      if (r.revealed) {
        r.group.position.y = THREE.MathUtils.damp(r.group.position.y, r.groundY + 0.04, 5, rawDt);
        r.ring.rotation.z = visualTime * 1.4;
        if (!qaMode && Math.hypot(roverPos.x - r.x, roverPos.z - r.z) < 2.95) {
          r.collected = true;
          r.beacon.visible = false;
          r.ring.visible = false;
          collectedCount++;
          onAwardCoins?.(r.reward, `relic_${r.id}`);
          onJuice?.({ crit: true, tier: 3 });
          showRadio(t(r.speaker, r.speakerEn), t(r.log, r.logEn), 6.5);
          startCloseUp({
            kind: "relic",
            title: `📦 ${t(r.name, r.nameEn)}`,
            sub: t(`遗迹破译成功 (${collectedCount}/3) · 赏金 +${r.reward} 机库矿币`, `RELIC DECODED (${collectedCount}/3) · +${r.reward} CR`),
            target: new THREE.Vector3(r.x, r.groundY + 0.65, r.z),
            dur: 1.9,
            radius: 4.5,
            lift: 1.8,
          });
        }
      }
    }
    relicPillEl.textContent = t(`遗迹 ${collectedCount} / 3`, `RELICS ${collectedCount} / 3`);

    // 3B. Earth Telescope Easter-Egg Guidance (live distance badge + gentle 16s Orbital Radio tip!)
    if (!qaMode && state.phase === "playing" && !rocketLaunching && !dropIntroActive) {
      earthPlayElapsed += dt;
      const distToEarthTelescope = Math.round(Math.hypot(roverPos.x - 2.75, roverPos.z + 8.35));
      if (earthPillEl) {
        if (earthArchived) {
          earthPillEl.dataset.done = "true";
          earthPillEl.textContent = t("🌍 地球已留影 ✓", "🌍 EARTH ARCHIVED ✓");
        } else {
          earthPillEl.dataset.done = "false";
          earthPillEl.textContent = distToEarthTelescope <= 4
            ? t("🌍 停稳按 [E] 拍地球", "🌍 STOP & PRESS [E]")
            : t(`🌍 拍摄地球 · ${distToEarthTelescope}m`, `🌍 EARTH PHOTO · ${distToEarthTelescope}m`);
        }
      }
      if (!earthHintShown && !earthObserved && radioTimer <= 0 && !cine && (earthPlayElapsed >= 16 || state.collected >= 1)) {
        earthHintShown = true;
        showRadio(
          t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
          t("「7 号车，着陆坪北侧发光标记处有一架对准地球的望远镜——路过停稳按 [E]，就能透过取景器拍一张地球彩蛋照哦！」", "\"Rover-07, spotted the glowing optical telescope north of the pad? Pull up and press [E] to photograph Earth through the viewfinder!\""),
          6.4,
        );
      }
    }

    // 4. Dynamic Micro-Crises (Solar Flare + Micro-Meteorite Helium-3 Core)
    if (!qaMode && state.phase === "playing" && !rocketLaunching && !dropIntroActive) {
      if (flareState === "idle" && state.relayDeployed) {
        flareNextCooldown -= dt;
        if (flareNextCooldown <= 0) {
          triggerSolarFlare();
          flareNextCooldown = 52;
        }
      } else if (flareState === "warn") {
        flareTimer = Math.max(0, flareTimer - dt);
        if (sun) sun.color.lerp(flareSunColor, Math.min(1, dt * 1.8));
        flareVignette.style.opacity = String((0.35 + 0.25 * Math.sin(visualTime * 10)).toFixed(2));
        crisisEl.dataset.tone = "";
        crisisEl.textContent = t(
          `☀ 太阳耀斑辐射预警 ${flareTimer.toFixed(1)}s！速驶入 [着陆坪 / 观测站护盾罩] 避险！`,
          `☀ SOLAR FLARE IN ${flareTimer.toFixed(1)}s! SHELTER AT LANDING PAD OR OBSERVATORY DOME!`,
        );
        crisisEl.dataset.show = "true";
        if (flareTimer === 0) {
          flareState = "active";
          flareTimer = 6.2;
        }
      } else if (flareState === "active") {
        flareTimer = Math.max(0, flareTimer - dt);
        const inPad = Math.hypot(roverPos.x, roverPos.z) < 5.5;
        const inDome = obsDomeGroup.visible && obsSitePos && Math.hypot(roverPos.x - obsSitePos.x, roverPos.z - obsSitePos.z) < 11.4;
        const sheltered = inPad || inDome;
        if (sheltered) {
          flareVignette.style.opacity = "0.10";
          crisisEl.dataset.tone = "safe";
          crisisEl.textContent = t(
            `🛡️ 护盾庇护中 (${flareTimer.toFixed(1)}s) · 正在快速恢复车载护盾与推进！`,
            `🛡️ SHELTERED (${flareTimer.toFixed(1)}s) · RECHARGING ROVER SHIELD & BOOST!`,
          );
          state.boostCharge = Math.min(1, state.boostCharge + dt * 0.4);
        } else {
          flareVignette.style.opacity = String((0.68 + 0.24 * Math.sin(visualTime * 14)).toFixed(2));
          crisisEl.dataset.tone = "";
          if (shieldEnergy > 0) {
            shieldEnergy = Math.max(0, shieldEnergy - 15.0 * dt);
            crisisEl.textContent = t(
              `⚠ 太阳耀斑爆发中 (${flareTimer.toFixed(1)}s) · 车载护盾正在吸收辐射 (${Math.round(shieldEnergy)}%)！`,
              `⚠ SOLAR FLARE PEAK (${flareTimer.toFixed(1)}s) · SHIELD ABSORBING (${Math.round(shieldEnergy)}%)!`,
            );
          } else {
            state.time = Math.max(8, state.time - dt * 1.4);
            crisisEl.textContent = t(
              `⚠ 护盾已耗尽！(${flareTimer.toFixed(1)}s) 速进安全区恢复护盾能量！`,
              `⚠ SHIELD DEPLETED! (${flareTimer.toFixed(1)}s) SEEK SHELTER TO RECHARGE!`,
            );
          }
        }
        crisisEl.dataset.show = "true";
        if (flareTimer === 0) {
          flareState = "idle";
          flareVignette.style.opacity = "0";
          crisisEl.dataset.show = "false";
        }
      } else if (sun) {
        sun.color.lerp(origSunColor, Math.min(1, dt * 2.5));
      }

      if (meteorState === "idle") {
        meteorNextCooldown -= dt;
        if (meteorNextCooldown <= 0) {
          triggerMeteorEvent(roverPos);
          meteorNextCooldown = 48;
        }
      } else if (meteorState === "falling") {
        meteorTimer = Math.max(0, meteorTimer - dt);
        const p = 1 - meteorTimer / 2.6;
        meteorGroup.position.set(
          THREE.MathUtils.lerp(meteorPos.x + 6, meteorPos.x, p),
          THREE.MathUtils.lerp(meteorPos.y + 48, meteorPos.y + 0.4, p * p),
          THREE.MathUtils.lerp(meteorPos.z - 6, meteorPos.z, p),
        );
        meteorRock.rotation.x += dt * 7;
        meteorRock.rotation.y += dt * 5;
        meteorWarnRing.scale.setScalar(0.75 + 0.35 * Math.sin(visualTime * 14));
        if (meteorTimer === 0) {
          meteorGroup.visible = false;
          meteorWarnRing.visible = false;
          heliumCoreGroup.position.copy(meteorPos);
          heliumCoreGroup.visible = true;
          meteorState = "core";
          meteorTimer = 28;
          playImpactBoomSfx();
          onJuice?.({ crit: true, tier: 3 });
          if (flareState === "idle") {
            crisisEl.dataset.tone = "meteor";
            crisisEl.textContent = t("★ 微陨石撞击完成！前往发光青色落点采集【稀有氦-3 陨石核】(+120 矿币)", "★ METEOR IMPACT! COLLECT GLOWING HELIUM-3 CORE (+120 CR)");
            crisisEl.dataset.show = "true";
          }
        }
      } else if (meteorState === "core") {
        meteorTimer = Math.max(0, meteorTimer - dt);
        heliumCrystal.rotation.y = visualTime * 2.8;
        heliumCrystal.position.y = 0.75 + Math.sin(visualTime * 4) * 0.14;
        heliumRing.rotation.z = -visualTime * 1.8;
        if (Math.hypot(roverPos.x - meteorPos.x, roverPos.z - meteorPos.z) < 2.85) {
          heliumCoreGroup.visible = false;
          meteorState = "idle";
          if (flareState === "idle") crisisEl.dataset.show = "false";
          state.time += 15;
          state.boostCharge = 1;
          shieldEnergy = Math.min(100, shieldEnergy + 35);
          onAwardCoins?.(120, "meteor_helium3");
          onJuice?.({ crit: true, tier: 3 });
          showRadio(
            t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
            t("「漂亮！高纯度氦-3 陨石核已装车：护盾 +35%、续航 +15 秒，额外奖励 +120 机库矿币！」", "\"Nice grab! Pure Helium-3 Core secured: +35% Shield, +15s battery & +120 Hangar Credits!\""),
            4.8,
          );
        } else if (meteorTimer === 0) {
          heliumCoreGroup.visible = false;
          meteorState = "idle";
          if (flareState === "idle") crisisEl.dataset.show = "false";
        }
      }
    }

    // 5. Radio Comms Auto-Hide
    if (radioTimer > 0) {
      radioTimer = Math.max(0, radioTimer - rawDt);
      if (radioTimer === 0) {
        radioCard.dataset.show = "false";
        document.body.dataset.campRadio = "false";
      }
    }

    // 6. High-Detail Multi-Stage Rocket Launch Animation + Cryogenic Steam Puffs
    towerBeacon.scale.setScalar(0.85 + 0.35 * Math.sin(visualTime * 5.2));
    if (rocketLaunching) {
      rocketElapsed += rawDt;
      const armP = THREE.MathUtils.clamp(rocketElapsed / 0.9, 0, 1);
      upperArmPivot.rotation.z = armP * 1.15;
      lowerArmPivot.rotation.z = armP * 1.05;
      rocketPlumeGroup.visible = true;
      const ignRamp = THREE.MathUtils.clamp(rocketElapsed / 0.65, 0, 1);
      outerPlumeMat.opacity = ignRamp * 0.92;
      innerCoreMat.opacity = ignRamp * 0.98;
      rocketPlumeGroup.scale.set(
        0.92 + 0.16 * Math.sin(visualTime * 46),
        0.75 + Math.min(1.85, rocketElapsed * 0.72),
        0.92 + 0.16 * Math.cos(visualTime * 41),
      );
      if (rocketElapsed < 2.2 && Math.random() < 0.65) {
        emitSteamPuff(rocketPadGroup.position);
      }
      blastDustRing.visible = rocketElapsed < 3.0;
      if (blastDustRing.visible) {
        const dp = rocketElapsed / 3.0;
        blastDustRing.scale.setScalar(1.0 + dp * 7.5);
        blastDustMat.opacity = (1 - dp) * 0.72;
      }
      if (rocketElapsed > 0.95) {
        const liftT = rocketElapsed - 0.95;
        rocketVessel.position.y = 0.42 + liftT * liftT * 6.2;
        rocketVessel.rotation.z = -Math.min(0.18, liftT * 0.045); // Subtle aerospace gravity turn!
        if (cine && cine.kind === "rocket") {
          cine.target.set(rocketSite.x, rocketBaseY + 2.8 + Math.min(38, liftT * liftT * 4.0), rocketSite.z);
        }
      } else {
        // Subtle hold-down ignition vibration on the pad
        rocketVessel.position.x = Math.sin(visualTime * 75) * 0.025 * ignRamp;
      }
    }

    let aliveSteam = 0;
    for (let i = 0; i < steamPuffs.length; i++) {
      const sm = steamPuffs[i];
      sm.t += rawDt;
      if (sm.t >= sm.dur) continue;
      sm.x += sm.vx * rawDt;
      sm.y += sm.vy * rawDt;
      sm.z += sm.vz * rawDt;
      const sp = sm.t / sm.dur;
      steamDummy.position.set(sm.x, sm.y, sm.z);
      steamDummy.rotation.set(sp * 3, sp * 2.4, sp * 1.8);
      steamDummy.scale.setScalar((0.75 + sp * 2.6) * (1 - sp * 0.55));
      steamDummy.updateMatrix();
      steamMesh.setMatrixAt(aliveSteam++, steamDummy.matrix);
      steamPuffs[aliveSteam - 1] = sm;
    }
    steamPuffs.length = aliveSteam;
    steamMesh.count = aliveSteam;
    if (aliveSteam > 0) steamMesh.instanceMatrix.needsUpdate = true;

    // 7. Advance Cinematic Close-Up Timer
    if (cine) {
      cine.elapsed += rawDt;
      if (cine.elapsed >= cine.dur) {
        const cb = cine.onDone;
        cine = null;
        cineBars.dataset.active = "false";
        document.body.dataset.campCine = "false";
        cb?.();
      }
    }
  }

  function applyCamera(camera, rawDt) {
    if (!cine) return false;
    const p = THREE.MathUtils.clamp(cine.elapsed / cine.dur, 0, 1);
    const angle = cine.angleStart + p * cine.angleSpan;
    const targetPos = new THREE.Vector3(
      cine.target.x + Math.sin(angle) * cine.radius,
      cine.target.y + cine.lift + (cine.kind === "rocket" ? p * 2.6 : 0),
      cine.target.z + Math.cos(angle) * cine.radius,
    );
    if (cine.elapsed <= rawDt * 1.5) {
      camPos.copy(targetPos);
      camLook.copy(cine.target);
    } else {
      camPos.lerp(targetPos, 1 - Math.exp(-7 * rawDt));
      camLook.lerp(cine.target, 1 - Math.exp(-10 * rawDt));
    }
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    return true;
  }

  return {
    reset,
    update,
    applyCamera,
    triggerSonar,
    triggerSolarFlare,
    triggerMeteorEvent,
    triggerRocketFinale,
    markEarthObserved: () => { earthObserved = true; earthHintShown = true; },
    markEarthArchived: () => {
      if (earthArchived) return;
      earthObserved = true;
      earthHintShown = true;
      earthArchived = true;
      onAwardCoins?.(60, "earth_photo_easter_egg");
      showRadio(
        t("林指挥官 // 轨道空间站 SELENE-HQ", "CMDR. LIN // SELENE-HQ"),
        t("「太美了！地出科研影像已归档保存，特批 +60 机库矿币作为彩蛋探索奖励！」", "\"Breathtaking Earthrise capture! Archived to mission logs with +60 Hangar Credits Easter-egg bonus!\""),
        5.4,
      );
    },
    setShieldForTest: val => { shieldEnergy = THREE.MathUtils.clamp(val, 0, 100); },
    get active() { return active; },
    get isCameraActive() { return Boolean(cine); },
    get rocketLaunching() { return rocketLaunching; },
    get state() {
      return {
        active,
        dropIntroActive,
        shieldEnergy: Math.round(shieldEnergy),
        shieldRecharging,
        sonarActive: sonarTimer > 0,
        relicsRevealed: relics.filter(r => r.revealed).length,
        relicsCollected: relics.filter(r => r.collected).length,
        flareState,
        meteorState,
        rocketLaunching,
        cineKind: cine ? cine.kind : null,
      };
    },
  };
}
