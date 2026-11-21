const DEAD_ZONE = 0.13;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const rightHalf = (event, viewport) =>
  event.clientX >= viewport.getBoundingClientRect().left + viewport.clientWidth / 2;

export function bindLunarJoystick({ element, viewport, isPlaying }) {
  let pointer = null;
  let throttle = 0;
  let steer = 0;

  function showPuck(x, y) {
    element.style.setProperty("--stick-x", `${x.toFixed(2)}px`);
    element.style.setProperty("--stick-y", `${y.toFixed(2)}px`);
  }

  function reset() {
    const held = pointer;
    pointer = null;
    throttle = 0;
    steer = 0;
    element.dataset.active = "false";
    showPuck(0, 0);
    if (held?.owner.hasPointerCapture(held.id)) held.owner.releasePointerCapture(held.id);
  }

  function pointAt(event) {
    const offsetX = event.clientX - pointer.centerX;
    const offsetY = event.clientY - pointer.centerY;
    const distance = Math.hypot(offsetX, offsetY);
    if (!pointer.fixed) {
      steer = distance > 8 ? clamp(offsetX / 49, -1, 1) : 0;
      throttle = distance > 8 ? clamp(-offsetY / 76, -1, 1) : 0;
      showPuck(steer * pointer.radius, -throttle * pointer.radius);
      return;
    }
    const travel = Math.min(distance, pointer.radius);
    const axisX = distance > 0 ? offsetX / distance : 0;
    const axisY = distance > 0 ? offsetY / distance : 0;
    const response = Math.max(0, (travel / pointer.radius - DEAD_ZONE) / (1 - DEAD_ZONE));
    steer = axisX * response;
    throttle = -axisY * response;
    showPuck(axisX * travel, axisY * travel);
  }

  function bind(owner, fixed) {
    owner.addEventListener("pointerdown", event => {
      if (pointer || !isPlaying()) return;
      if (event.pointerType !== "touch" && !(fixed && event.button === 0)) return;
      if (!fixed && rightHalf(event, viewport)) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      pointer = {
        id: event.pointerId, owner, fixed, radius: Math.max(18, Math.min(box.width, box.height) * 0.29),
        centerX: event.clientX,
        centerY: event.clientY,
      };
      owner.setPointerCapture(event.pointerId);
      element.dataset.active = "true";
      pointAt(event);
    });
    owner.addEventListener("pointermove", event => {
      if (pointer?.id !== event.pointerId || pointer.owner !== owner) return;
      if (isPlaying()) pointAt(event);
      else reset();
    });
    const end = event => {
      if (pointer?.id === event.pointerId && pointer.owner === owner) reset();
    };
    owner.addEventListener("pointerup", end);
    owner.addEventListener("pointercancel", end);
    owner.addEventListener("lostpointercapture", end);
  }

  viewport.style.touchAction = "none";
  bind(element, true);
  bind(viewport, false);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", reset);
  return {
    read: () => ({ throttle, steer, active: pointer !== null }),
    reset,
  };
}

export function bindLunarLook({ viewport, isPlaying, move }) {
  let pointer = null;

  function reset() {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  }

  viewport.addEventListener("pointerdown", event => {
    if (pointer || !isPlaying() || event.pointerType !== "touch" || !rightHalf(event, viewport)) return;
    event.preventDefault();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", event => {
    if (pointer?.id !== event.pointerId) return;
    if (!isPlaying()) {
      reset();
      return;
    }
    move(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  const end = event => {
    if (pointer?.id === event.pointerId) reset();
  };
  viewport.addEventListener("pointerup", end);
  viewport.addEventListener("pointercancel", end);
  viewport.addEventListener("lostpointercapture", end);
  return { isDragging: () => pointer !== null, reset };
}

export function bindLunarFullscreen({ toggle, isTouch, beforeEnter, onExit, t = zh => zh }) {
  const root = document.documentElement;
  const fullscreenElement = () => document.fullscreenElement ?? document.webkitFullscreenElement;
  const canEnter = () => typeof root.requestFullscreen === "function" && document.fullscreenEnabled !== false;
  const canEnterWebkit = () => typeof root.webkitRequestFullscreen === "function" && document.webkitFullscreenEnabled !== false;
  let automatic = true;
  let active = fullscreenElement() === root;

  function sync() {
    if (!toggle) return;
    toggle.hidden = !active && (!isTouch() || !(canEnter() || canEnterWebkit()));
    toggle.textContent = active ? t("退出全屏", "Exit fullscreen") : t("进入全屏", "Enter fullscreen");
  }

  function changed() {
    const wasActive = active;
    active = fullscreenElement() === root;
    if (wasActive && !active) {
      automatic = false;
      onExit();
    }
    sync();
  }

  function enter() {
    if (!isTouch() || fullscreenElement() || navigator.userActivation?.isActive === false) return;
    try {
      if (canEnter()) root.requestFullscreen({ navigationUI: "hide" })?.catch(sync);
      else if (canEnterWebkit()) root.webkitRequestFullscreen()?.catch(sync);
    } catch {
      sync();
    }
  }

  toggle?.addEventListener("click", () => {
    if (fullscreenElement() === root) {
      try {
        if (document.exitFullscreen) document.exitFullscreen()?.catch(sync);
        else document.webkitExitFullscreen?.();
      } catch {
        sync();
      }
    } else {
      automatic = true;
      beforeEnter();
      enter();
    }
  });
  document.addEventListener("fullscreenchange", changed);
  document.addEventListener("webkitfullscreenchange", changed);
  sync();
  return { enterByDefault: () => { if (automatic) enter(); }, sync };
}
