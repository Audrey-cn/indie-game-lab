function musicUrl() {
  const embedded = document.getElementById("lunar-music-data");
  if (embedded?.dataset.url) return embedded.dataset.url;
  const base64 = embedded?.textContent;
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mp4" }));
  embedded.dataset.url = url;
  embedded.textContent = "";
  return url;
}

export async function decodeLunarMusic(context) {
  const url = musicUrl();
  if (!url) return null;
  const response = await fetch(url);
  return context.decodeAudioData(await response.arrayBuffer());
}

export function createLunarMusic(context, bus, buffer) {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(bus);

  const offlineTrack = buffer && context.createBufferSource();
  if (offlineTrack) {
    offlineTrack.buffer = buffer;
    offlineTrack.loop = true;
    offlineTrack.playbackRate.value = 0;
    offlineTrack.connect(gain);
    offlineTrack.start();
  }
  const player = typeof context.createMediaElementSource === "function"
    ? document.getElementById("lunar-music") : null;
  let pauseTimer;
  let connected = false;
  let enabled = true;
  let active = false;
  let playing = false;
  let drilling = false;
  let sampling = false;
  let duckUntil = 0;
  let targetLevel = 0;

  function update(at) {
    const shouldPlay = active && enabled;
    const missionLevel = drilling ? 0.033 : sampling ? 0.075 : 0.23;
    const cueLimit = at < duckUntil ? 0.085 : 0.23;
    const level = shouldPlay ? Math.min(missionLevel, cueLimit) : 0;
    if (level !== targetLevel) {
      gain.gain.setTargetAtTime(level, at, level < targetLevel ? 0.055 : 0.33);
      targetLevel = level;
    }
    if (shouldPlay === playing) return;
    playing = shouldPlay;
    if (offlineTrack) offlineTrack.playbackRate.setValueAtTime(playing ? 1 : 0, at);
    if (!player) return;
    clearTimeout(pauseTimer);
    if (!playing) {
      pauseTimer = setTimeout(() => player.pause(), 260);
      return;
    }
    if (!connected) {
      const url = musicUrl();
      if (!url) return;
      player.src = url;
      context.createMediaElementSource(player).connect(gain);
      connected = true;
    }
    void player.play().catch(() => {
      // The next explicit resume can try again if browser policy blocked playback.
    });
  }

  function drive(isActive, isDrilling, at, isSampling = false) {
    active = isActive;
    drilling = isDrilling;
    sampling = isSampling;
    update(at);
  }

  function duck(at, seconds) {
    duckUntil = Math.max(duckUntil, at + seconds);
    update(at);
  }

  function setEnabled(value, at = context.currentTime) {
    enabled = Boolean(value);
    update(at);
  }

  return { drive, duck, setEnabled };
}
