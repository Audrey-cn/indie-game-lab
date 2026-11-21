import * as THREE from "three";

const between = (value, low, high) => Math.min(high, Math.max(low, value));

export function createMissionGuidance({ height, blocked, marker, notice }) {
  const label = marker.querySelector("#marker-text");
  const prompt = marker.querySelector("#context-prompt");
  const keycap = prompt.querySelector("kbd");
  const actionText = prompt.querySelector("span");
  const ring = marker.querySelector("#context-progress");
  const percentage = ring.querySelector("span");
  const targetWorld = new THREE.Vector3();
  const cameraSpace = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let previousKey = "";
  let testedAt = -1;
  let occluded = false;
  let markerSize, noticeBounds;
  if (notice) {
    const panel = notice.parentElement;
    const measureHud = new ResizeObserver(() => {
      markerSize = marker.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      const noticeRect = notice.getBoundingClientRect();
      // Use the panel's horizontal bounds so a fading slide cannot move the target button.
      noticeBounds = { left: panelBounds.left - 1, right: panelBounds.right + 1,
        top: noticeRect.top, bottom: noticeRect.bottom };
    });
    for (const element of [marker, notice, panel, document.documentElement]) measureHud.observe(element);
  }

  function linesOfSight(camera, target, time) {
    if (target.id !== previousKey || time - testedAt > 0.18 || time < testedAt) {
      testedAt = time;
      previousKey = target.id;
      occluded = false;
      for (let i = 1; i <= 12; i++) {
        const fraction = i / 13;
        const x = THREE.MathUtils.lerp(camera.position.x, targetWorld.x, fraction);
        const y = THREE.MathUtils.lerp(camera.position.y, targetWorld.y, fraction);
        const z = THREE.MathUtils.lerp(camera.position.z, targetWorld.z, fraction);
        if (height(x, z) > y + 0.07 || blocked(x, y, z, target)) {
          occluded = true;
          break;
        }
      }
    }
    return !occluded;
  }

  function update(target, camera, width, viewportHeight, time, touch) {
    marker.hidden = !target || width <= 0 || viewportHeight <= 0;
    if (marker.hidden) return;

    const { control, work } = target;
    prompt.hidden = touch || !control || Boolean(work);
    if (!prompt.hidden) {
      if (keycap.textContent !== control.key) keycap.textContent = control.key;
      if (actionText.textContent !== control.label) actionText.textContent = control.label;
    }
    ring.hidden = !work;
    if (work) {
      const value = Math.round(between(work.progress, 0, 1) * 100);
      if (ring.getAttribute("aria-label") !== work.label) ring.setAttribute("aria-label", work.label);
      if (ring.getAttribute("aria-valuenow") !== String(value)) {
        ring.setAttribute("aria-valuenow", String(value));
        ring.style.setProperty("--completion", `${value}%`);
        percentage.textContent = `${value}%`;
      }
    }
    if (target.marker) targetWorld.copy(target.marker);
    else targetWorld.set(target.x, height(target.x, target.z) + (target.height ?? 1), target.z);
    cameraSpace.copy(targetWorld).applyMatrix4(camera.matrixWorldInverse);
    projected.copy(targetWorld).project(camera);
    const inFrame = cameraSpace.z < 0 && Math.abs(projected.x) < 0.74 && Math.abs(projected.y) < 0.77
      && linesOfSight(camera, target, time);
    let px, py;
    if (inFrame) {
      px = (0.5 + projected.x / 2) * width;
      py = (0.5 - projected.y / 2) * viewportHeight;
    } else {
      const side = cameraSpace.x;
      const vertical = -cameraSpace.y;
      const behind = cameraSpace.z >= 0;
      // An objective behind the vehicle should point to the side used to turn towards it.
      const x = behind ? (side >= 0 ? 1 : -1) : side / Math.max(0.01, -cameraSpace.z);
      const y = behind ? 0.09 : vertical / Math.max(0.01, -cameraSpace.z);
      const angle = Math.atan2(y, x);
      px = between(width * (0.5 + Math.cos(angle) * 0.43), Math.min(104, width * 0.22), Math.max(width - 104, width * 0.78));
      py = between(viewportHeight * (0.53 + Math.sin(angle) * 0.29), touch ? viewportHeight * 0.26 : 99,
        viewportHeight * (touch ? 0.68 : 0.88));
      marker.style.setProperty("--bearing", `${angle - Math.PI / 2}rad`);
    }
    if (target.touchAction || (touch && work)) {
      // Usable controls stay near the object, inside the middle of the touch viewport.
      px = between(px, width * 0.23, width * 0.77);
      py = between(py, viewportHeight * 0.45, viewportHeight * 0.70);
    }
    if (notice?.textContent && markerSize?.width && noticeBounds) {
      const margin = 7;
      const half = markerSize.width / 2;
      if (px + half > noticeBounds.left - margin && px - half < noticeBounds.right + margin
          && py > noticeBounds.top - margin && py - markerSize.height < noticeBounds.bottom + margin) {
        const below = noticeBounds.bottom + markerSize.height + margin;
        const towardCenter = noticeBounds.left + noticeBounds.right < width
          ? noticeBounds.right + half + margin : noticeBounds.left - half - margin;
        if (touch && width < viewportHeight && below < viewportHeight * 0.72) py = below;
        else if (towardCenter > half + margin && towardCenter < width - half - margin) px = towardCenter;
        else if (below < viewportHeight - margin) py = below;
      }
    }
    marker.style.left = `${px.toFixed(1)}px`;
    marker.style.top = `${py.toFixed(1)}px`;
    marker.dataset.kind = control || target.prompt || work ? "near" : inFrame ? "world" : "edge";
    marker.dataset.ready = String(Boolean(target.ready));
    marker.dataset.target = target.id;
    const text = work ? `${target.name} · ${work.label}`
      : control ? target.name : target.prompt ? `${target.name} · ${target.prompt}`
      : `${target.name} · ${Math.max(1, Math.round(target.distance))} m`;
    if (label.textContent !== text) label.textContent = text;
  }

  function reset() { previousKey = ""; testedAt = -1; }
  return { update, reset };
}
