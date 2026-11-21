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

  // Zero-byte procedural deep-space lunar ambient synthesizer (used in lean playable bundle when no .m4a is embedded).
  let synthStarted = false;
  let synthChimeTimer = null;
  let synthChordTimer = null;
  function ensureProceduralSpaceSynth() {
    if (synthStarted) return;
    synthStarted = true;
    const synthBus = context.createGain();
    synthBus.gain.value = 2.35;
    const padFilter = context.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 1080;
    padFilter.Q.value = 0.65;
    synthBus.connect(padFilter).connect(gain);

    // Slow breathing LFO on the low-pass cutoff for tranquil, cinematic orbital atmosphere.
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.085;
    lfoDepth.gain.value = 420;
    lfo.connect(lfoDepth).connect(padFilter.frequency);
    lfo.start();

    // Evolving 4-chord sci-fi space progression (Dm9 -> Bbmaj7 -> Fmaj7 -> Csus4)
    const chords = [
      [73.42, 146.83, 220.00, 261.63, 329.63], // Dm9
      [58.27, 116.54, 174.61, 220.00, 293.66], // Bbmaj7
      [87.31, 174.61, 220.00, 261.63, 329.63], // Fmaj7
      [65.41, 130.81, 196.00, 261.63, 293.66], // Csus2/4
    ];
    const voiceSpec = [
      { type: "sine", vol: 0.34, detune: -3 },
      { type: "triangle", vol: 0.20, detune: 3.5 },
      { type: "triangle", vol: 0.17, detune: -4.5 },
      { type: "sine", vol: 0.16, detune: 5.0 },
      { type: "sine", vol: 0.13, detune: -2.5 },
    ];
    const padOscs = voiceSpec.map((v, idx) => {
      const osc = context.createOscillator();
      const vGain = context.createGain();
      osc.type = v.type;
      osc.frequency.value = chords[0][idx];
      osc.detune.value = v.detune;
      vGain.gain.value = v.vol;
      osc.connect(vGain).connect(synthBus);
      osc.start();
      return osc;
    });

    let chordIdx = 0;
    const advanceChord = () => {
      synthChordTimer = setTimeout(() => {
        if (playing && context.state === "running") {
          chordIdx = (chordIdx + 1) % chords.length;
          const now = context.currentTime;
          const freqs = chords[chordIdx];
          for (let i = 0; i < padOscs.length; i++) {
            padOscs[i].frequency.setTargetAtTime(freqs[i], now, 0.95);
          }
        }
        advanceChord();
      }, 6400);
    };
    advanceChord();

    // Warm audible crystalline lunar piano/bell motifs every 2.8–4.8 seconds while playing.
    const chimeNotes = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    let chimeIdx = 0;
    const scheduleChime = () => {
      synthChimeTimer = setTimeout(() => {
        if (playing && context.state === "running") {
          const now = context.currentTime;
          const noteFreq = chimeNotes[chimeIdx % chimeNotes.length];
          chimeIdx = (chimeIdx + 2) % chimeNotes.length;
          for (const [mult, amp, decay] of [[1, 0.22, 2.9], [2, 0.065, 1.4]]) {
            const osc = context.createOscillator();
            const env = context.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(noteFreq * mult, now);
            env.gain.setValueAtTime(0.0001, now);
            env.gain.linearRampToValueAtTime(amp, now + 0.045);
            env.gain.exponentialRampToValueAtTime(0.0001, now + decay);
            osc.connect(env).connect(padFilter);
            osc.start(now);
            osc.stop(now + decay + 0.08);
            osc.onended = () => { osc.disconnect(); env.disconnect(); };
          }
        }
        scheduleChime();
      }, 2800 + (chimeIdx * 571) % 2100);
    };
    scheduleChime();
  }

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
    if (!player) {
      if (playing && !offlineTrack) ensureProceduralSpaceSynth();
      return;
    }
    clearTimeout(pauseTimer);
    if (!playing) {
      if (connected) pauseTimer = setTimeout(() => player.pause(), 260);
      return;
    }
    if (!connected) {
      const url = musicUrl();
      if (!url) {
        ensureProceduralSpaceSynth();
        return;
      }
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
