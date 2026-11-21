const MODES = [
  { id: "final", label: "Final (AgX)" },
  { id: "ssao", label: "SSAO" },
  { id: "bloom", label: "HDR Bloom" },
  { id: "no-post", label: "No Post" },
  { id: "depth", label: "Depth" },
  { id: "tracks", label: "Track Pages" },
  { id: "wireframe", label: "Wireframe" },
];

const TIERS = [
  { id: "high", label: "High" },
  { id: "balanced", label: "Balanced" },
  { id: "low", label: "Mobile Low" },
];

function injectStyles() {
  if (document.getElementById("lunar-debug-style")) return;
  const style = document.createElement("style");
  style.id = "lunar-debug-style";
  style.textContent = `
    #lunar-debug-panel {
      position: fixed;
      left: 14px;
      bottom: 14px;
      z-index: 120;
      width: 308px;
      max-width: calc(100vw - 28px);
      padding: 10px 12px;
      border: 1px solid #94edeb44;
      background: #070d14e0;
      backdrop-filter: blur(8px);
      color: #e9f2f4;
      font: 11px/1.35 "IBM Plex Mono", "SF Mono", Consolas, monospace;
      box-shadow: 0 12px 32px #0008;
      user-select: none;
    }
    #lunar-debug-panel[hidden] { display: none !important; }
    .dbg-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid #a8b4bd2b;
      letter-spacing: .08em;
      font-size: 10px;
      color: #94edeb;
      text-transform: uppercase;
    }
    .dbg-close {
      background: transparent;
      border: 1px solid #a8b4bd40;
      color: #cbd7de;
      cursor: pointer;
      padding: 1px 6px;
      font: inherit;
    }
    .dbg-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 10px;
      margin-bottom: 7px;
    }
    .dbg-kv { display: flex; justify-content: space-between; color: #9db0b8; }
    .dbg-kv strong { color: #f4f7f5; font-weight: 600; }
    .dbg-spark {
      width: 100%;
      height: 30px;
      display: block;
      margin-bottom: 7px;
      background: #0b141e;
      border: 1px solid #a8b4bd24;
    }
    .dbg-section {
      margin-top: 6px;
      font-size: 9px;
      letter-spacing: .1em;
      color: #889ea8;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .dbg-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .dbg-pill {
      padding: 3px 6px;
      border: 1px solid #a8b4bd38;
      background: #0e1925;
      color: #c7d5dc;
      font: 10px/1.1 inherit;
      cursor: pointer;
    }
    .dbg-pill[aria-pressed="true"] {
      border-color: #94edeb;
      background: #143640;
      color: #ffffff;
    }
    .dbg-wheels {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
      margin-top: 4px;
    }
    .dbg-wheel {
      display: grid;
      gap: 2px;
      text-align: center;
      font-size: 9px;
      color: #8ca0aa;
    }
    .dbg-wheel-bar {
      height: 18px;
      background: #0d1722;
      border: 1px solid #a8b4bd28;
      display: flex;
      align-items: flex-end;
    }
    .dbg-wheel-fill {
      width: 100%;
      background: #74ffd8;
      height: 50%;
    }
  `;
  document.head.append(style);
}

export function createLunarDebugOverlay({ renderer, scene, lighting, tracks, onQualityChange, onRedraw }) {
  injectStyles();
  const panel = document.createElement("aside");
  panel.id = "lunar-debug-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="dbg-head">
      <span>WebGL2 Breakdown · F2</span>
      <button type="button" class="dbg-close" aria-label="Close">×</button>
    </div>
    <canvas class="dbg-spark" width="282" height="30"></canvas>
    <div class="dbg-grid">
      <div class="dbg-kv"><span>FPS</span><strong data-k="fps">--</strong></div>
      <div class="dbg-kv"><span>Frame</span><strong data-k="ms">--</strong></div>
      <div class="dbg-kv"><span>Draw Calls</span><strong data-k="calls">--</strong></div>
      <div class="dbg-kv"><span>Triangles</span><strong data-k="tris">--</strong></div>
      <div class="dbg-kv"><span>Track Pages</span><strong data-k="pages">--</strong></div>
      <div class="dbg-kv"><span>Track VRAM</span><strong data-k="vram">--</strong></div>
    </div>
    <div class="dbg-section">Render Channel</div>
    <div class="dbg-pills" data-group="mode"></div>
    <div class="dbg-section">Quality Preset</div>
    <div class="dbg-pills" data-group="tier"></div>
    <div class="dbg-section">6-Wheel Suspension Load (120Hz)</div>
    <div class="dbg-wheels">
      ${["FL", "ML", "RL", "FR", "MR", "RR"].map(id =>
        `<div class="dbg-wheel"><div class="dbg-wheel-bar"><div class="dbg-wheel-fill" data-w="${id}"></div></div><span>${id}</span></div>`).join("")}
    </div>
  `;
  document.body.append(panel);

  const fields = Object.fromEntries([...panel.querySelectorAll("[data-k]")].map(el => [el.dataset.k, el]));
  const wheelBars = [...panel.querySelectorAll(".dbg-wheel-fill")];
  const spark = panel.querySelector(".dbg-spark");
  const sparkCtx = spark.getContext("2d");
  const modeContainer = panel.querySelector('[data-group="mode"]');
  const tierContainer = panel.querySelector('[data-group="tier"]');
  const history = new Float32Array(60);
  let historyIdx = 0;
  let visible = false;
  let activeMode = "final";
  let activeTier = "high";
  let wireframeActive = false;
  let lastPaint = 0;
  const savedWireframe = new Map();

  function setWireframe(enabled) {
    if (enabled === wireframeActive) return;
    wireframeActive = enabled;
    scene.traverse(object => {
      if (!object.isMesh || !object.material) return;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of mats) {
        if (typeof mat.wireframe !== "boolean") continue;
        if (enabled) {
          if (!savedWireframe.has(mat)) savedWireframe.set(mat, mat.wireframe);
          mat.wireframe = true;
        } else if (savedWireframe.has(mat)) {
          mat.wireframe = savedWireframe.get(mat);
        }
      }
    });
    if (!enabled) savedWireframe.clear();
  }

  function setMode(mode) {
    activeMode = mode;
    tracks.setDebugView(mode === "tracks");
    setWireframe(mode === "wireframe");
    lighting.setDebugMode(["ssao", "bloom", "no-post", "depth"].includes(mode) ? mode : "final");
    for (const btn of modeContainer.children) {
      btn.setAttribute("aria-pressed", String(btn.dataset.id === mode));
    }
    onRedraw?.();
  }

  function setTier(tier) {
    activeTier = tier;
    for (const btn of tierContainer.children) {
      btn.setAttribute("aria-pressed", String(btn.dataset.id === tier));
    }
    onQualityChange?.(tier);
    onRedraw?.();
  }

  for (const item of MODES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dbg-pill";
    btn.dataset.id = item.id;
    btn.textContent = item.label;
    btn.setAttribute("aria-pressed", String(item.id === activeMode));
    btn.addEventListener("click", () => setMode(item.id));
    modeContainer.append(btn);
  }
  for (const item of TIERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dbg-pill";
    btn.dataset.id = item.id;
    btn.textContent = item.label;
    btn.setAttribute("aria-pressed", String(item.id === activeTier));
    btn.addEventListener("click", () => setTier(item.id));
    tierContainer.append(btn);
  }

  function setVisible(next) {
    visible = Boolean(next);
    panel.hidden = !visible;
    if (!visible && activeMode !== "final") setMode("final");
    onRedraw?.();
  }

  panel.querySelector(".dbg-close").addEventListener("click", () => setVisible(false));
  window.addEventListener("keydown", event => {
    if (event.code === "F2" && !event.repeat) {
      event.preventDefault();
      setVisible(!visible);
    }
  });

  if (new URLSearchParams(location.search).get("debug") === "1") {
    setVisible(true);
  }

  function update({ now, frameMs, drawCalls, state }) {
    if (Number.isFinite(frameMs) && frameMs > 0) {
      history[historyIdx % history.length] = frameMs;
      historyIdx++;
    }
    if (!visible || now - lastPaint < 140) return;
    lastPaint = now;

    const count = Math.min(historyIdx, history.length);
    let sum = 0;
    for (let i = 0; i < count; i++) sum += history[i];
    const avgMs = count ? sum / count : 0;
    const fps = avgMs > 0.1 ? Math.round(1000 / avgMs) : 0;
    fields.fps.textContent = `${fps}`;
    fields.ms.textContent = `${avgMs.toFixed(1)} ms`;
    fields.calls.textContent = `${drawCalls}`;
    const tris = lighting.lastSceneTriangles || renderer.info.render.triangles;
    fields.tris.textContent = `${(tris / 1000).toFixed(1)}k`;

    const tc = tracks.counts();
    const savedPct = Math.max(0, 100 - (tc.gpuBytes / tracks.fullMapBytes) * 100);
    fields.pages.textContent = `${tc.allocatedTiles}/${tracks.totalTiles}`;
    fields.vram.textContent = `${Math.round(tc.gpuBytes / 1024)}KB (-${savedPct.toFixed(0)}%)`;

    if (state?.wheelLoad) {
      for (let i = 0; i < 6; i++) {
        const pct = Math.min(100, Math.max(4, state.wheelLoad[i] * 38));
        wheelBars[i].style.height = `${pct.toFixed(0)}%`;
        wheelBars[i].style.background = state.wheelGrounded?.[i] ? "#74ffd8" : "#ffb18d";
      }
    }

    sparkCtx.clearRect(0, 0, spark.width, spark.height);
    // 16.6ms (60fps) reference line
    const y60 = spark.height - (16.67 / 40) * spark.height;
    sparkCtx.strokeStyle = "#94edeb38";
    sparkCtx.beginPath();
    sparkCtx.moveTo(0, y60);
    sparkCtx.lineTo(spark.width, y60);
    sparkCtx.stroke();

    sparkCtx.strokeStyle = "#74ffd8";
    sparkCtx.lineWidth = 1.4;
    sparkCtx.beginPath();
    for (let i = 0; i < count; i++) {
      const sample = history[(historyIdx - count + i) % history.length];
      const x = (i / (history.length - 1)) * spark.width;
      const y = spark.height - Math.min(1, sample / 40) * spark.height;
      if (i === 0) sparkCtx.moveTo(x, y);
      else sparkCtx.lineTo(x, y);
    }
    sparkCtx.stroke();
  }

  return {
    update,
    setVisible,
    setMode,
    setTier,
    get visible() { return visible; },
    get mode() { return activeMode; },
    get tier() { return activeTier; },
  };
}
