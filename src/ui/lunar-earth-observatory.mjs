import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeEquipmentFinish } from "../rendering/lunar-equipment-finish.mjs";
import { loadEarthOptics } from "../rendering/lunar-earth-optics.mjs";
import apollo16 from "../assets/lunar-earth-apollo16-fuv.jpg";
import markup from "./lunar-earth-observatory.html";
import stylesheet from "./lunar-earth-observatory.css";

export const EARTH_SITE = { id: "earth-observatory", name: "地球观测台", x: 2.75, z: -8.35, height: 1.32 };
const interactionRange = 2.95;
const up = new THREE.Vector3(0, 1, 0);
const { clamp } = THREE.MathUtils;

export function isNearEarthObservatory(state) {
  return Math.hypot(state.x - EARTH_SITE.x, state.z - EARTH_SITE.z) < interactionRange;
}

export function canObserveEarth(state) {
  return isNearEarthObservatory(state) && state.grounded && Math.hypot(state.vx, state.vz) < 0.23
    && Math.abs(state.yawRate) < 0.23;
}

export function installEarthTelescope(scene, height, direction) {
  const assembly = new THREE.Group();
  const { x, z } = EARTH_SITE;
  const ground = height(x, z);
  assembly.position.set(x, ground, z);
  assembly.name = "Selene lunar optical instrument";
  const body = new THREE.Group();
  body.position.y = 0.88;
  body.quaternion.setFromUnitVectors(up, direction);
  assembly.add(body);
  const foil = makeEquipmentFinish(0xbca168, "aluminum", 61);
  const frame = makeEquipmentFinish(0x8b9294, "anodized", 64);
  const insulation = new THREE.MeshStandardMaterial({ color: 0x222725, metalness: 0.29, roughness: 0.84 });
  const lens = new THREE.MeshPhysicalMaterial({
    color: 0x213b4b, metalness: 0.61, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.10,
    iridescence: 0.46, iridescenceThicknessRange: [160, 310],
  });
  const mark = new THREE.MeshStandardMaterial({ color: 0xee955d, metalness: 0.12, roughness: 0.69 });
  const indicator = new THREE.MeshBasicMaterial({ color: 0x95d2ad });
  const parts = new Map();
  const orient = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const unitScale = new THREE.Vector3(1, 1, 1);
  function add(parent, material, geo, position, quaternion = new THREE.Quaternion()) {
    orient.compose(position, quaternion, unitScale);
    geo.applyMatrix4(orient);
    const meshData = geo.index ? geo.toNonIndexed() : geo;
    if (geo !== meshData) geo.dispose();
    if (!parts.has(parent)) parts.set(parent, new Map());
    const byMaterial = parts.get(parent);
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(meshData);
  }
  function cylinder(parent, material, radius, length, x, y, z, angle = 0, sides = 24) {
    rotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    add(parent, material, new THREE.CylinderGeometry(radius, radius, length, sides), new THREE.Vector3(x, y, z), rotation);
  }
  function box(parent, material, w, h, d, x, y, z, bevel = 0.005) {
    add(parent, material, new RoundedBoxGeometry(w, h, d, 1, bevel), new THREE.Vector3(x, y, z));
  }
  function leg(material, a, b, radius) {
    const axis = b.clone().sub(a);
    const tilt = new THREE.Quaternion().setFromUnitVectors(up, axis.clone().normalize());
    add(assembly, material, new THREE.CylinderGeometry(radius, radius, axis.length(), 12),
      a.clone().lerp(b, 0.5), tilt);
  }
  cylinder(body, foil, 0.187, 0.52, 0, 0.015, 0);
  cylinder(body, frame, 0.175, 0.075, 0, -0.275, 0);
  cylinder(body, foil, 0.202, 0.048, 0, -0.203, 0);
  cylinder(body, foil, 0.205, 0.063, 0, 0.28, 0);
  cylinder(body, insulation, 0.173, 0.020, 0, 0.32, 0);
  cylinder(body, lens, 0.145, 0.009, 0, 0.333, 0, 0, 40);
  for (let index = 0; index < 8; index++) {
    const theta = index * Math.PI * 0.25;
    cylinder(body, frame, 0.009, 0.008, 0.185 * Math.cos(theta), 0.316, 0.185 * Math.sin(theta), 0, 6);
  }
  box(body, frame, 0.12, 0.25, 0.16, 0.175, -0.09, 0);
  box(body, mark, 0.026, 0.07, 0.045, 0.247, -0.09, 0.023);
  box(body, frame, 0.106, 0.13, 0.038, -0.14, -0.12, 0.141);
  box(body, insulation, 0.103, 0.082, 0.012, -0.14, -0.106, 0.168);
  box(body, indicator, 0.077, 0.011, 0.006, -0.14, -0.081, 0.176, 0.002);

  cylinder(assembly, frame, 0.079, 0.16, 0, 0.73, 0);
  cylinder(assembly, insulation, 0.10, 0.077, 0, 0.82, 0);
  for (const angle of [0.25, 2.34, 4.44]) {
    const dx = Math.sin(angle), dz = Math.cos(angle);
    const foot = new THREE.Vector3(0.56 * dx, height(x + 0.56 * dx, z + 0.56 * dz) - ground + 0.024, 0.56 * dz);
    const head = new THREE.Vector3(0.07 * dx, 0.72, 0.07 * dz);
    const mid = foot.clone().lerp(head, 0.51);
    leg(frame, foot, mid, 0.027);
    leg(foil, mid, head, 0.034);
    leg(insulation, foot.clone().lerp(mid, 0.77), mid.clone().lerp(head, 0.14), 0.039);
    cylinder(assembly, frame, 0.102, 0.042, foot.x, foot.y, foot.z, 0, 18);
    box(assembly, mark, 0.062, 0.019, 0.043, foot.x, foot.y + 0.032, foot.z, 0.004);
  }
  const harness = new THREE.CatmullRomCurve3([new THREE.Vector3(0.16, 0.80, 0.13), new THREE.Vector3(0.25, 0.62, 0.17),
    new THREE.Vector3(0.22, 0.46, 0.04), new THREE.Vector3(0.10, 0.54, -0.02), new THREE.Vector3(0.07, 0.69, -0.03)]);
  add(assembly, insulation, new THREE.TubeGeometry(harness, 15, 0.013, 6, false), new THREE.Vector3());

  for (const [parent, materials] of parts) for (const [material, geometries] of materials) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (geometries.length > 1) for (const part of geometries) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !material.isMeshBasicMaterial;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  // Subtle Easter-Egg guidance beacon: soft glowing ground aperture ring + floating optical prism above telescope.
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x74ffd8, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beaconRing = new THREE.Mesh(new THREE.RingGeometry(0.74, 0.86, 36), ringMat);
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.05;
  assembly.add(beaconRing);

  const prismMat = new THREE.MeshBasicMaterial({
    color: 0xffd778, transparent: true, opacity: 0.78,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), prismMat);
  prism.position.y = 1.72;
  assembly.add(prism);

  const rayMat = new THREE.MeshBasicMaterial({
    color: 0x8cf4ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rayTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.13, 2.2, 12, 1, true), rayMat);
  rayTube.position.y = 1.45;
  body.add(rayTube);

  scene.add(assembly);
  return {
    x, z, radius: 0.58,
    update(time, photographed = false) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.8);
      beaconRing.scale.setScalar(0.94 + pulse * 0.14);
      ringMat.opacity = photographed ? 0.16 : (0.28 + pulse * 0.24);
      prism.visible = !photographed;
      if (!photographed) {
        prism.position.y = 1.70 + Math.sin(time * 2.4) * 0.12;
        prism.rotation.y = time * 1.4;
        prismMat.opacity = 0.62 + pulse * 0.30;
      }
      rayMat.opacity = photographed ? 0.06 : (0.09 + pulse * 0.08);
    },
  };
}

const channels = {
  visible: {
    label: ["可见光", "Visible light"], title: ["云系与晨昏线", "Clouds and the day–night boundary"], exposure: 750, field: 4.8,
    detail: ["NASA 地表与云图重建，晨昏线与场景光向一致。",
      "Reconstructed from NASA surface and cloud imagery. The day–night boundary follows the lighting in the scene."],
    filename: "lunar-earth-visible.png", download: ["下载可见光照片", "Download visible-light image"], stamp: "VISIBLE  /  NASA BLUE MARBLE",
  },
  ultraviolet: {
    label: ["远紫外模拟", "Simulated far UV"], title: ["105–126 / 120–150 nm"], exposure: 1450, field: 4.8, maxZoom: 3.8,
    detail: ["两段历史成像波段。121.6 nm 氢谱线可用于辨认地球氢冕。图像为假彩模拟。",
      "Two historical imaging bands. The 121.6 nm hydrogen line reveals Earth's geocorona. This is a false-color simulation."],
    filename: "lunar-earth-far-uv.png", download: ["下载远紫外照片", "Download far-UV image"], stamp: "FAR UV  /  QUALITATIVE SIMULATION",
  },
  overview: {
    label: ["地球全景", "Full Earth"], title: ["薄大气与完整地球盘面", "Earth's full disk and thin atmosphere"], exposure: 780, field: 2.97,
    detail: ["云带与薄大气沿盘面边缘展开，云层运动为模拟。",
      "Cloud bands and a thin atmosphere line the edge of the disk. Cloud motion is simulated."],
    filename: "lunar-earth-overview.png", download: ["下载地球全景照片", "Download full-Earth image"], stamp: "OVERVIEW  /  NASA BLUE MARBLE",
  },
};
const modes = Object.keys(channels);
const initialFrame = { x: -0.119, y: 0.075, zoom: 1 };
const exposureSize = { width: 640, height: 480 };
const zoomMin = 0.68;
const opticalZoomMax = 8;
const sources = {
  blueMarble: [["NASA 地表与云图", "NASA surface and cloud imagery"],
    "https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/"],
  ultraviolet: [["阿波罗 16 波段记录", "Apollo 16 mission report"],
    "https://www.nasa.gov/wp-content/uploads/static/history/alsj/a16/A16_MissionReport.pdf"],
  history: [["NASA 原始观测档案", "NASA observation archive"],
    "https://www.nasa.gov/image-article/earth-in-far-ultraviolet/"],
};

export function bindLunarEarthObservatory({ earth, sun, isTouch, onOpen, onClose, onArchived, t = zh => zh }) {
  const style = document.createElement("style");
  style.textContent = stylesheet;
  document.head.append(style);
  document.body.insertAdjacentHTML("beforeend", markup);
  const earthLegend = document.createElement("span");
  earthLegend.className = "earth-radar-legend";
  document.querySelector("#radar-legend").append(earthLegend);
  const dialog = document.querySelector("#earth-observatory");
  const find = selector => dialog.querySelector(selector);
  const staticLabels = [];
  for (const [data, attribute] of [["data-en", null], ["data-en-aria", "aria-label"], ["data-en-title", "title"], ["data-en-alt", "alt"]]) {
    for (const element of dialog.querySelectorAll(`[${data}]`)) {
      staticLabels.push({ element, attribute, zh: attribute ? element.getAttribute(attribute) : element.textContent,
        en: element.getAttribute(data) });
    }
  }
  const copy = ([zh, en = zh]) => t(zh, en);
  const view = find("#earth-viewfinder");
  const context = view.getContext("2d", { alpha: false });
  const aim = find("#earth-aim");
  const viewLabel = find("#earth-view-label");
  const capture = find("#earth-capture");
  const align = find("#earth-align");
  const progress = find("#earth-exposure");
  const previousMode = find("#earth-mode-prev");
  const nextMode = find("#earth-mode-next");
  const zoomOut = find("#earth-zoom-out");
  const zoomIn = find("#earth-zoom-in");
  const zoomValue = find("#earth-zoom-value");
  const fieldValue = find("#earth-view-scale");
  const reviewButton = find("#earth-review-open");
  const review = find("#earth-review");
  const reviewClose = find("#earth-review-close");
  const preview = find("#earth-photo-preview");
  const reference = find("#earth-history-image");
  const historyToggle = find("#earth-history-toggle");
  const downloads = find("#earth-downloads");
  const report = find("#earth-log-status");
  const photoSource = find("#earth-photo-source");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const illuminated = Math.round(clamp((1 - earth.dot(sun) / sun.length()) * 50, 0, 100));
  const recorded = new Map();
  const pointers = new Map();
  const wanted = { ...initialFrame };
  const shown = { ...initialFrame };
  let viewport = { width: 0, height: 0, left: 0, top: 0, span: 1 };
  let channel = "visible";
  let optics, loadRequest, failed, latestShot, reviewedMode;
  let raf = 0, previousTick = null, lastPaint = -Infinity, animationTime = 0;
  let idleSince = null, exposure = null, dirty = true;

  function schedule() {
    if (!raf && dialog.open && !document.hidden && review.hidden) raf = requestAnimationFrame(tick);
  }

  function markActivity() {
    idleSince = null;
    dialog.dataset.quiet = "false";
    schedule();
  }

  function aligned() {
    return channel === "overview" || Math.hypot(wanted.x, wanted.y) <= (wanted.zoom > 1.35 ? 0.22 : 0.032);
  }

  function maxZoom() { return channels[channel].maxZoom ?? opticalZoomMax; }

  function refreshControls() {
    const shooting = exposure !== null;
    const locked = aligned();
    dialog.dataset.aligned = String(locked);
    dialog.dataset.exposing = String(shooting);
    const hint = shooting ? t("曝光中", "Exposure in progress")
      : failed ? t("底图读取失败，请返回后重试", "Imagery could not load. Close the viewfinder and try again.")
        : !optics ? t("正在准备镜头", "Preparing the telescope")
          : channel === "overview" ? ""
          : locked ? (isTouch() ? t("已对准", "Aligned") : t("已对准 · E 拍摄", "Aligned · E to capture"))
            : (isTouch() ? t("拖动取景或校准", "Drag to frame, or tap Align")
              : t("拖动取景或用方向键对准", "Drag to frame, or align with the arrow keys"));
    if (aim.textContent !== hint) aim.textContent = hint;
    aim.hidden = !hint;
    capture.disabled = !optics || shooting || !locked;
    align.hidden = channel === "overview" || (locked && Math.hypot(wanted.x, wanted.y) <= 0.032);
    align.disabled = !optics || shooting;
    previousMode.disabled = nextMode.disabled = shooting;
    zoomOut.disabled = shooting || wanted.zoom <= zoomMin + 0.001;
    zoomIn.disabled = shooting || wanted.zoom >= maxZoom() - 0.001;
    zoomValue.disabled = shooting;
    reviewButton.disabled = shooting;
    reviewButton.hidden = !latestShot;
  }

  function reflectZoom() {
    const factor = wanted.zoom.toFixed(2);
    if (zoomValue.textContent !== factor + "×") zoomValue.textContent = factor + "×";
    dialog.dataset.zoom = factor;
    fieldValue.textContent = (channels[channel].field / wanted.zoom).toFixed(1) + "°";
  }

  function redraw() {
    dirty = true;
    schedule();
  }

  function resize() {
    if (!dialog.open) return;
    const { width, height, left, top } = view.getBoundingClientRect();
    if (!width || !height) return;
    viewport = { width, height, left, top, span: Math.min(width, height) };
    const budget = isTouch() ? 850000 : 1550000;
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(budget / (width * height)));
    const pixelWidth = Math.max(1, Math.floor(width * ratio));
    const pixelHeight = Math.max(1, Math.floor(height * ratio));
    if (view.width !== pixelWidth || view.height !== pixelHeight) {
      view.width = pixelWidth;
      view.height = pixelHeight;
    }
    redraw();
  }
  new ResizeObserver(resize).observe(view);

  function drawFrame(target, width, height, stamp = "") {
    const span = Math.min(width, height);
    if (!optics) {
      target.fillStyle = "#03060b";
      target.fillRect(0, 0, width, height);
      return;
    }
    optics.draw(target, { width, height, mode: channel, zoom: shown.zoom,
      offsetX: shown.x * span, offsetY: shown.y * span, time: animationTime / 1000,
      reducedMotion: reducedMotion.matches, stamp });
  }

  function select(mode) {
    if (exposure !== null || !review.hidden) return;
    const overviewChange = mode !== channel && (mode === "overview" || channel === "overview");
    channel = mode;
    if (overviewChange) Object.assign(wanted, { x: 0, y: 0, zoom: 1 });
    else if (wanted.zoom > maxZoom()) {
      const factor = maxZoom() / wanted.zoom;
      Object.assign(wanted, { x: wanted.x * factor, y: wanted.y * factor, zoom: maxZoom() });
    }
    dialog.dataset.channel = mode;
    viewLabel.textContent = copy(channels[mode].label);
    reflectZoom();
    refreshControls();
    markActivity();
    redraw();
  }

  function cycleMode(step) {
    select(modes[(modes.indexOf(channel) + step + modes.length) % modes.length]);
  }

  function frameTo(x, y, zoom = wanted.zoom) {
    if (exposure !== null || !review.hidden) return;
    // Keep the limb reachable all the way into the close-up without losing the planet beyond the frame.
    const earthRadius = (channel === "overview" ? 0.32 : 1.9 / 9.6) * zoom;
    const margin = Math.min(earthRadius * 0.8, 0.27);
    const panX = viewport.width / viewport.span / 2 + earthRadius - margin;
    const panY = viewport.height / viewport.span / 2 + earthRadius - margin;
    Object.assign(wanted, { x: clamp(x, -panX, panX), y: clamp(y, -panY, panY), zoom });
    reflectZoom();
    refreshControls();
    markActivity();
    redraw();
  }

  function zoomAt(next, beforeX = 0, beforeY = 0, afterX = beforeX, afterY = beforeY) {
    const zoom = clamp(next, zoomMin, maxZoom());
    const factor = zoom / wanted.zoom;
    frameTo(afterX + (wanted.x - beforeX) * factor, afterY + (wanted.y - beforeY) * factor, zoom);
  }

  function structuredArchive() {
    const links = [...recorded].map(([mode, photo]) => {
      const link = document.createElement("a");
      link.href = photo.image;
      link.download = channels[mode].filename;
      link.textContent = copy(channels[mode].download);
      return link;
    });
    downloads.replaceChildren(...links);
  }

  function showHistory(visible) {
    if (visible && !reference.src) reference.src = apollo16;
    reference.hidden = !visible;
    preview.hidden = visible;
    historyToggle.setAttribute("aria-pressed", String(visible));
    historyToggle.textContent = visible ? t("返回本次影像", "Back to this image") : t("阿波罗 16 实拍", "Compare with Apollo 16");
    const { title, field, detail } = channels[reviewedMode];
    const observedField = field / recorded.get(reviewedMode).zoom;
    find("#earth-reading").textContent = visible ? t("1972 · 阿波罗 16", "1972 · Apollo 16") : copy(title);
    find("#earth-explanation").textContent = visible
      ? t("约翰·扬从月面拍摄地球。NASA 增强色版显示远紫外辐射分布。",
        "John Young photographed Earth from the Moon. NASA enhanced the colors to show the far-UV emission.")
      : reviewedMode === "ultraviolet" ? copy(detail)
        : t(`盘面受光约 ${illuminated}% · 视场 ${observedField.toFixed(1)}°。 ${detail[0]}`,
          `About ${illuminated}% of the disk is lit · ${observedField.toFixed(1)}° field of view. ${detail[1]}`);
    const [label, url] = sources[visible ? "history" : reviewedMode === "ultraviolet" ? "ultraviolet" : "blueMarble"];
    photoSource.textContent = copy(label);
    photoSource.href = url;
  }

  function refreshReviewStatus(mode) {
    const count = Number(recorded.has("visible")) + Number(recorded.has("ultraviolet"));
    report.textContent = mode === "overview" ? t("全景照片已归档", "Full-Earth image archived")
      : count === 2 ? t("两份观测影像已归档", "Both observation images archived")
        : t("已归档 · 科研影像 1 / 2", "Archived · Research images 1 / 2");
  }

  function refreshLanguage() {
    for (const { element, attribute, zh, en } of staticLabels) {
      if (attribute) element.setAttribute(attribute, t(zh, en));
      else element.textContent = t(zh, en);
    }
    earthLegend.textContent = t("观测台", "Observatory");
    viewLabel.textContent = copy(channels[channel].label);
    refreshControls();
    structuredArchive();
    if (!review.hidden && recorded.has(reviewedMode)) {
      refreshReviewStatus(reviewedMode);
      showHistory(!reference.hidden);
    }
  }

  function openReview(mode) {
    if (!recorded.has(mode)) return;
    reviewedMode = mode;
    refreshReviewStatus(mode);
    preview.src = recorded.get(mode).image;
    historyToggle.hidden = mode !== "ultraviolet";
    showHistory(false);
    review.hidden = false;
    dialog.dataset.reviewing = "true";
    dialog.dataset.quiet = "false";
    cancelAnimationFrame(raf);
    raf = 0;
    previousTick = null;
    reviewClose.focus({ preventScroll: true });
  }

  function closeReview(restoreFocus = true) {
    review.hidden = true;
    reference.hidden = true;
    preview.hidden = true;
    dialog.dataset.reviewing = "false";
    if (restoreFocus && dialog.open) {
      (capture.disabled ? reviewButton : capture).focus({ preventScroll: true });
      markActivity();
      redraw();
    }
  }

  function endExposure() {
    exposure = null;
    progress.hidden = true;
    const photo = document.createElement("canvas");
    photo.width = exposureSize.width;
    photo.height = exposureSize.height;
    drawFrame(photo.getContext("2d", { alpha: false }), photo.width, photo.height, channels[channel].stamp);
    const wasComplete = recorded.has("visible") && recorded.has("ultraviolet");
    recorded.set(channel, { image: photo.toDataURL("image/png"), zoom: shown.zoom });
    latestShot = channel;
    structuredArchive();
    refreshControls();
    openReview(channel);
    if (!wasComplete && recorded.has("visible") && recorded.has("ultraviolet")) onArchived?.();
  }

  function tick(now) {
    raf = 0;
    if (!dialog.open || !review.hidden || document.hidden) return;
    const delta = previousTick === null ? 0 : clamp(now - previousTick, 0, 64);
    previousTick = now;
    idleSince ??= now;
    const quiet = channel === "overview" && now - idleSince >= 4000;
    if (dialog.dataset.quiet !== String(quiet)) dialog.dataset.quiet = String(quiet);
    if (optics && !reducedMotion.matches && exposure === null) animationTime += delta;
    const pull = reducedMotion.matches ? 1 : 1 - Math.exp(-delta / 83);
    let moving = false;
    for (const key of ["x", "y", "zoom"]) {
      const difference = wanted[key] - shown[key];
      if (Math.abs(difference) <= 0.0006) shown[key] = wanted[key];
      else {
        shown[key] += difference * pull;
        moving = true;
      }
    }

    const animated = Boolean(optics) && channel !== "ultraviolet" && !reducedMotion.matches && exposure === null;
    if (viewport.width && (dirty || moving || (animated && now - lastPaint >= 24))) {
      context.setTransform(view.width / viewport.width, 0, 0, view.height / viewport.height, 0, 0);
      drawFrame(context, viewport.width, viewport.height);
      lastPaint = now;
      dirty = false;
    }

    if (exposure !== null) {
      exposure += delta;
      progress.value = Math.min(1, exposure / channels[channel].exposure);
      if (progress.value >= 1) {
        endExposure();
        return;
      }
    }
    if (animated || moving || exposure !== null || (channel === "overview" && !quiet)) schedule();
  }

  function photograph() {
    if (!dialog.open || !review.hidden || capture.disabled) return;
    Object.assign(shown, wanted);
    exposure = 0;
    progress.value = 0;
    progress.hidden = false;
    markActivity();
    redraw();
    refreshControls();
  }

  previousMode.addEventListener("click", () => cycleMode(-1));
  nextMode.addEventListener("click", () => cycleMode(1));
  zoomOut.addEventListener("click", () => zoomAt(wanted.zoom / 1.22));
  zoomIn.addEventListener("click", () => zoomAt(wanted.zoom * 1.22));
  zoomValue.addEventListener("click", () => frameTo(0, 0, 1));
  align.addEventListener("click", () => {
    frameTo(0, 0);
    capture.focus({ preventScroll: true });
  });
  capture.addEventListener("click", photograph);
  reviewButton.addEventListener("click", () => openReview(recorded.has(channel) ? channel : latestShot));
  reviewClose.addEventListener("click", () => closeReview());
  historyToggle.addEventListener("click", () => showHistory(reference.hidden));
  find("#earth-close").addEventListener("click", () => {
    dialog.close();
    onClose?.();
  });
  dialog.addEventListener("cancel", event => {
    if (review.hidden) return;
    event.preventDefault();
    closeReview();
  });
  function releaseView() {
    cancelAnimationFrame(raf);
    raf = 0;
    exposure = previousTick = null;
    pointers.clear();
    progress.hidden = true;
    closeReview(false);
    preview.removeAttribute("src");
    reference.removeAttribute("src");
    loadRequest?.abort();
    loadRequest = null;
    optics?.dispose();
    optics = null;
    view.width = view.height = 1;
  }
  dialog.addEventListener("close", () => { if (!dialog.open) releaseView(); });
  document.addEventListener("visibilitychange", () => {
    previousTick = null;
    if (document.hidden) {
      pointers.clear();
    } else if (dialog.open) {
      redraw();
    }
  });
  reducedMotion.addEventListener("change", redraw);
  dialog.addEventListener("pointerdown", markActivity, { capture: true });
  dialog.addEventListener("pointermove", event => { if (event.pointerType === "mouse") markActivity(); });
  document.addEventListener("keydown", event => {
    if (!dialog.open) return;
    markActivity();
    if (!review.hidden || event.altKey || event.metaKey || event.ctrlKey) return;
    const { code, key } = event;
    if (code === "KeyE" && !event.repeat) photograph();
    else if (code === "BracketLeft" || code === "BracketRight") cycleMode(code === "BracketLeft" ? -1 : 1);
    else if (key === "+" || key === "=" || key === "-") zoomAt(wanted.zoom * (key === "-" ? 1 / 1.22 : 1.22));
    else if (code === "Home") frameTo(0, 0, 1);
    else if (code.startsWith("Arrow")) {
      const dx = Number(code === "ArrowRight") - Number(code === "ArrowLeft");
      const dy = Number(code === "ArrowDown") - Number(code === "ArrowUp");
      frameTo(wanted.x + dx * 0.018, wanted.y + dy * 0.018);
    } else return;
    event.preventDefault();
  });

  function point(x, y) {
    return { x: (x - viewport.left - viewport.width / 2) / viewport.span,
      y: (y - viewport.top - viewport.height / 2) / viewport.span };
  }

  function gesture() {
    const [first, second] = pointers.values();
    if (!second) return { ...first, distance: 0 };
    return { x: (first.x + second.x) * 0.5, y: (first.y + second.y) * 0.5,
      distance: Math.hypot(first.x - second.x, first.y - second.y) };
  }

  view.addEventListener("wheel", event => {
    if (!review.hidden) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
    const { x, y } = point(event.clientX, event.clientY);
    zoomAt(wanted.zoom * Math.exp(clamp(-event.deltaY * unit * 0.0018, -0.7, 0.7)), x, y);
  }, { passive: false });
  view.addEventListener("dblclick", event => {
    const { x, y } = point(event.clientX, event.clientY);
    zoomAt(wanted.zoom * 1.55, x, y);
  });
  view.addEventListener("pointerdown", event => {
    if (event.button !== 0 || exposure !== null || !review.hidden || pointers.size >= 2) return;
    pointers.set(event.pointerId, point(event.clientX, event.clientY));
    view.setPointerCapture(event.pointerId);
  });
  view.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const before = gesture();
    pointers.set(event.pointerId, point(event.clientX, event.clientY));
    const after = gesture();
    const factor = before.distance > 0.02 ? after.distance / before.distance : 1;
    zoomAt(wanted.zoom * factor, before.x, before.y, after.x, after.y);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    view.addEventListener(type, event => pointers.delete(event.pointerId));
  }

  refreshLanguage();
  return {
    refreshLanguage,
    get open() { return dialog.open; },
    show() {
      if (dialog.open) return;
      closeReview(false);
      Object.assign(wanted, initialFrame);
      Object.assign(shown, wanted);
      channel = "visible";
      failed = false;
      animationTime = 0;
      onOpen?.();
      dialog.showModal();
      select(channel);
      resize();
      if (!optics && !loadRequest) {
        const request = new AbortController();
        loadRequest = request;
        void loadEarthOptics({ earth, sun: sun.clone().normalize(), signal: request.signal }).then(model => {
          if (request.signal.aborted || !dialog.open) {
            model.dispose();
            return;
          }
          optics = model;
          refreshControls();
          redraw();
        }).catch(() => {
          if (request.signal.aborted || !dialog.open) return;
          failed = true;
          refreshControls();
        }).finally(() => { if (loadRequest === request) loadRequest = null; });
      }
    },
    reset() {
      if (dialog.open) dialog.close();
      recorded.clear();
      latestShot = undefined;
      preview.removeAttribute("src");
      structuredArchive();
    },
  };
}
