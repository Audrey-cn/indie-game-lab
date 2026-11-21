const READ_SECONDS = { scout: 4.8, result: 6.0, caution: 5.0, strike: 5.5 };
const PRIORITY = { scout: 0, result: 1, caution: 2, strike: 3 };
const MAX_SCOUT_AGE = 12;

export function createMissionNotices(panel, { translate = ([zh]) => zh, onScout } = {}) {
  const notice = panel.querySelector("#mission-notice");
  const noticeCopy = panel.querySelector("#mission-notice-copy");
  const adviceHeading = panel.querySelector("#guide-heading");
  const adviceCopy = panel.querySelector("#guide-copy");
  const pending = [];
  let current = null;

  function show(message, now) {
    current = { ...message, until: now + message.remaining };
  }

  function prune(now) {
    for (let index = pending.length - 1; index >= 0; index--) {
      const message = pending[index];
      if (message.tone === "scout" && now - message.postedAt >= MAX_SCOUT_AGE) pending.splice(index, 1);
    }
  }

  function next(now) {
    if (current && now < current.until) return;
    current = null;
    prune(now);
    if (!pending.length) return;
    let rank = 0;
    for (let index = 1; index < pending.length; index++) {
      if (PRIORITY[pending[index].tone] > PRIORITY[pending[rank].tone]) rank = index;
    }
    show(pending.splice(rank, 1)[0], now);
  }

  function post(key, text, tone, now) {
    next(now);
    if (current?.key === key || pending.some(message => message.key === key)) return;
    const message = { key, text, tone, remaining: READ_SECONDS[tone], postedAt: now };
    if (!current) show(message, now);
    else if (PRIORITY[tone] > PRIORITY[current.tone]) {
      const remaining = current.until - now;
      if ((current.tone === "result" || current.tone === "scout") && remaining > 0.5) {
        pending.unshift({ ...current, remaining });
      }
      show(message, now);
    } else pending.push(message);
  }

  function update(now, { active, advice, scoutEnabled = true }) {
    if (!scoutEnabled) {
      if (current?.tone === "scout") current = null;
      for (let index = pending.length - 1; index >= 0; index--) {
        if (pending[index].tone === "scout") pending.splice(index, 1);
      }
    }
    next(now);
    panel.hidden = !active;
    if (!active) return;

    const mode = current ? "notice" : advice ? "guide" : "objective";
    if (panel.dataset.mode !== mode) panel.dataset.mode = mode;
    if (current) {
      if (panel.dataset.tone !== current.tone) panel.dataset.tone = current.tone;
      if (notice.dataset.tone !== current.tone) notice.dataset.tone = current.tone;
      const text = Array.isArray(current.text) ? translate(current.text) : current.text;
      if (noticeCopy.textContent !== text) noticeCopy.textContent = text;
      if (current.tone === "scout" && !current.acknowledged) {
        current.acknowledged = true;
        if (now - current.postedAt < READ_SECONDS.scout) onScout?.();
      }
    } else {
      delete panel.dataset.tone;
      delete notice.dataset.tone;
      if (noticeCopy.textContent) noticeCopy.textContent = "";
    }
    const visible = String(mode === "notice");
    if (notice.dataset.visible !== visible) notice.dataset.visible = visible;
    if (mode === "guide") {
      if (panel.dataset.cue !== advice.id) panel.dataset.cue = advice.id;
      if (adviceHeading.textContent !== advice.title) adviceHeading.textContent = advice.title;
      if (adviceCopy.textContent !== advice.text) adviceCopy.textContent = advice.text;
    } else delete panel.dataset.cue;
  }

  function reset() {
    current = null;
    pending.length = 0;
    panel.dataset.mode = "objective";
    delete panel.dataset.tone;
    delete panel.dataset.cue;
    delete notice.dataset.tone;
    notice.dataset.visible = "false";
    noticeCopy.textContent = "";
  }

  return { post, update, reset };
}
