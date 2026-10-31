(function () {
  "use strict";

  const STORAGE_KEY = "playora.sound-enabled.v1";
  const CUE_PEAK_VOLUME = 0.06;
  const SOUND_FILE_VOLUME = 0.6;
  const state = { enabled: true, context: null };
  const activeAudio = new Set();

  function readSoundSetting() {
    try {
      const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
      if (stored === null) return true;
      return stored !== "false";
    } catch (error) {
      console.warn("[playora] Could not read sound preference.", error);
      return true;
    }
  }

  function persistSoundSetting(value) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
      console.warn("[playora] Could not persist sound preference.", error);
    }
  }

  function ensureAudioContext() {
    if (!state.enabled) return null;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!state.context) {
      state.context = new AudioCtor();
    }
    if (state.context.state === "suspended") {
      void state.context.resume();
    }
    return state.context;
  }

  function setEnabled(value) {
    state.enabled = Boolean(value);
    persistSoundSetting(state.enabled);
    [document.getElementById("soundToggle"), document.getElementById("soundToggleRoom")].forEach((button) => {
      if (!button) return;
      const compact = button.id === "soundToggleRoom";
      const label = state.enabled
        ? compact ? "🔊" : "🔊 Sound on"
        : compact ? "🔇" : "🔇 Sound off";
      button.textContent = label;
      button.setAttribute("aria-pressed", String(state.enabled));
      button.setAttribute("title", state.enabled ? "Mute game sounds" : "Enable game sounds");
      if (compact) button.setAttribute("aria-label", state.enabled ? "Turn game sounds off" : "Turn game sounds on");
    });
    if (!state.enabled && state.context && state.context.state !== "closed") {
      void state.context.suspend();
    }
    if (!state.enabled) {
      activeAudio.forEach((audio) => audio.pause());
      activeAudio.clear();
    }
    return state.enabled;
  }

  function playTone({ frequency = 440, duration = 0.12, type = "sine", volume = 0.05, slide = 0, attack = 0.01, release = 0.18 } = {}) {
    if (!state.enabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const start = ctx.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slide) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), start + duration);
    }

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(volume, start + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + release);
  }

  function playPattern(kind) {
    if (!state.enabled) return;

    const patterns = {
      move: [
        { frequency: 440, duration: 0.06, type: "triangle", volume: 0.04, slide: 50 },
        { frequency: 660, duration: 0.06, type: "triangle", volume: 0.025, slide: 30 },
      ],
      roll: [
        { frequency: 180, duration: 0.11, type: "sawtooth", volume: 0.045, slide: 140 },
        { frequency: 340, duration: 0.12, type: "sawtooth", volume: 0.04, slide: 180 },
      ],
      win: [
        { frequency: 440, duration: 0.12, type: "triangle", volume: 0.05, slide: 80 },
        { frequency: 660, duration: 0.14, type: "triangle", volume: 0.05, slide: 80 },
        { frequency: 880, duration: 0.18, type: "triangle", volume: 0.05, slide: 100 },
      ],
      menu: [
        { frequency: 260, duration: 0.06, type: "square", volume: 0.025, slide: 25 },
      ],
      error: [
        { frequency: 140, duration: 0.08, type: "square", volume: 0.03, slide: -30 },
      ],
    };

    const sequence = normalizeCue(patterns[kind] || patterns.move);
    sequence.forEach((note, index) => {
      const delay = index * 0.06;
      setTimeout(() => {
        playTone(note);
      }, delay * 1000);
    });
  }

  function normalizeCue(notes) {
    const peak = notes.reduce((maximum, note) => Math.max(maximum, note.volume || 0), 0);
    if (!peak) return notes;
    const scale = CUE_PEAK_VOLUME / peak;
    return notes.map((note) => ({ ...note, volume: (note.volume || 0) * scale }));
  }

  const gameProfiles = {
    chess: {
      move: [
        { frequency: 260, duration: 0.075, type: "triangle", volume: 0.16, slide: -55 },
        { frequency: 195, duration: 0.055, type: "sine", volume: 0.1, slide: -20 },
      ],
      roll: [{ frequency: 190, duration: 0.045, type: "triangle", volume: 0.12, slide: -25 }],
      win: [392, 523, 659].map((frequency) => ({ frequency, duration: 0.13, type: "triangle", volume: 0.045 })),
    },
    "connect-four": {
      move: [{ frequency: 620, duration: 0.11, type: "sine", volume: 0.045, slide: -240 }],
      roll: [{ frequency: 620, duration: 0.11, type: "sine", volume: 0.045, slide: -240 }],
      win: [523, 659, 784].map((frequency) => ({ frequency, duration: 0.12, type: "sine", volume: 0.045 })),
    },
    ludo: {
      move: [{ frequency: 390, duration: 0.07, type: "triangle", volume: 0.045, slide: 90 }],
      roll: [
        { frequency: 130, duration: 0.09, type: "square", volume: 0.025, slide: 170 },
        { frequency: 205, duration: 0.08, type: "triangle", volume: 0.035, slide: 110 },
      ],
      win: [392, 523, 784].map((frequency) => ({ frequency, duration: 0.12, type: "triangle", volume: 0.045 })),
    },
    snl: {
      move: [{ frequency: 350, duration: 0.075, type: "triangle", volume: 0.04, slide: 100 }],
      roll: [
        { frequency: 155, duration: 0.08, type: "sawtooth", volume: 0.025, slide: 95 },
        { frequency: 245, duration: 0.09, type: "triangle", volume: 0.035, slide: 120 },
      ],
      win: [330, 494, 659].map((frequency) => ({ frequency, duration: 0.13, type: "triangle", volume: 0.045 })),
    },
    carrom: {
      move: [
        { frequency: 175, duration: 0.055, type: "sawtooth", volume: 0.035, slide: 110 },
        { frequency: 440, duration: 0.045, type: "triangle", volume: 0.025, slide: -80 },
      ],
      roll: [{ frequency: 175, duration: 0.055, type: "sawtooth", volume: 0.035, slide: 110 }],
      win: [330, 440, 587].map((frequency) => ({ frequency, duration: 0.12, type: "triangle", volume: 0.04 })),
    },
    racer: {
      move: [{ frequency: 100, duration: 0.12, type: "sawtooth", volume: 0.035, slide: 140 }],
      start: [
        { frequency: 160, duration: 0.12, type: "sawtooth", volume: 0.035, slide: 80 },
        { frequency: 250, duration: 0.11, type: "sawtooth", volume: 0.035, slide: 140 },
      ],
      win: [392, 523, 659].map((frequency) => ({ frequency, duration: 0.14, type: "triangle", volume: 0.045 })),
    },
    ttt: {
      move: [{ frequency: 290, duration: 0.04, type: "square", volume: 0.025, slide: -30 }],
      roll: [{ frequency: 290, duration: 0.04, type: "square", volume: 0.025, slide: -30 }],
      win: [440, 554, 659].map((frequency) => ({ frequency, duration: 0.12, type: "triangle", volume: 0.04 })),
    },
    watersort: {
      move: [
        { frequency: 520, duration: 0.13, type: "sine", volume: 0.035, slide: -140 },
        { frequency: 380, duration: 0.12, type: "sine", volume: 0.03, slide: -100 },
      ],
      pour: [
        { frequency: 520, duration: 0.13, type: "sine", volume: 0.035, slide: -140 },
        { frequency: 380, duration: 0.12, type: "sine", volume: 0.03, slide: -100 },
      ],
      undo: [{ frequency: 420, duration: 0.09, type: "sine", volume: 0.03, slide: 100 }],
      next: [440, 554, 659].map((frequency) => ({ frequency, duration: 0.12, type: "sine", volume: 0.04 })),
      win: [440, 554, 659, 880].map((frequency) => ({ frequency, duration: 0.13, type: "sine", volume: 0.04 })),
    },
  };

  const genericProfile = {
    move: [
      { frequency: 440, duration: 0.06, type: "triangle", volume: 0.04, slide: 50 },
      { frequency: 660, duration: 0.06, type: "triangle", volume: 0.025, slide: 30 },
    ],
    roll: [
      { frequency: 180, duration: 0.11, type: "sawtooth", volume: 0.045, slide: 140 },
      { frequency: 340, duration: 0.12, type: "sawtooth", volume: 0.04, slide: 180 },
    ],
    win: [440, 660, 880].map((frequency) => ({ frequency, duration: 0.13, type: "triangle", volume: 0.05 })),
    error: [{ frequency: 140, duration: 0.08, type: "square", volume: 0.03, slide: -30 }],
    menu: [{ frequency: 260, duration: 0.06, type: "square", volume: 0.025, slide: 25 }],
  };

  const soundFiles = {
    shared: {
      win: "shared/win.ogg",
      draw: "shared/draw.ogg",
      loss: "shared/loss.ogg",
      menu: "shared/menu.ogg",
    },
    carrom: { move: "carrom/flick.ogg" },
    chess: { move: "chess/move.ogg" },
    "connect-four": { move: "connect-four/drop.ogg" },
    ludo: { move: "ludo/token-move.ogg", roll: "ludo/roll.ogg" },
    racer: { start: "racer/countdown.ogg" },
    snl: { move: "snl/step.ogg", roll: "snl/roll.ogg" },
    ttt: { move: "ttt/mark.ogg" },
    watersort: { move: "watersort/pour.ogg", pour: "watersort/pour.ogg", undo: "watersort/undo.ogg" },
  };
  const fileAvailability = new Map();

  function playSoundFile(file, fallback) {
    if (typeof window.Audio !== "function" || fileAvailability.get(file) === false) {
      fallback();
      return;
    }

    const audio = new window.Audio(soundFileUrl(file));
    const mimeType = file.toLowerCase().endsWith(".ogg") ? 'audio/ogg; codecs="vorbis"' : "";
    if (mimeType && typeof audio.canPlayType === "function" && !audio.canPlayType(mimeType)) {
      fileAvailability.set(file, false);
      fallback();
      return;
    }
    audio.preload = "auto";
    audio.volume = SOUND_FILE_VOLUME;
    activeAudio.add(audio);
    const releaseAudio = () => activeAudio.delete(audio);
    let fallbackPlayed = false;
    const playFallback = () => {
      if (fallbackPlayed) return;
      fallbackPlayed = true;
      fallback();
    };

    audio.addEventListener("playing", () => fileAvailability.set(file, true), { once: true });
    audio.addEventListener("ended", releaseAudio, { once: true });
    audio.addEventListener("error", () => {
      releaseAudio();
      fileAvailability.set(file, false);
      playFallback();
    }, { once: true });

    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        releaseAudio();
        if (audio.error) fileAvailability.set(file, false);
        playFallback();
      });
    }
  }

  function isCoarsePointer() {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  }

  function probeSoundFile(file) {
    if (fileAvailability.has(file) || typeof window.fetch !== "function") return;
    fileAvailability.set(file, "checking");
    window.fetch(soundFileUrl(file), { method: "HEAD", cache: "force-cache" })
      .then((response) => fileAvailability.set(file, response.ok))
      .catch(() => fileAvailability.set(file, false));
  }

  function soundFileUrl(file) {
    const prefix = window.location.pathname.match(/^\/hds-[a-z0-9]+-\d+-[a-z0-9]+/i);
    return (prefix ? prefix[0] : "") + "/playora/sounds/" + file;
  }

  function playGeneratedGameSound(gameId, event, kind) {
    const profile = gameProfiles[gameId] || genericProfile;
    const notes = event === "win"
      ? genericProfile.win
      : profile[event] || profile[kind] || genericProfile[event] || genericProfile[kind] || genericProfile.move;
    normalizeCue(notes).forEach((note, index) => {
      window.setTimeout(() => playTone(note), index * 60);
    });
  }

  function playGame(gameId, kind, action) {
    if (!state.enabled) return;
    ensureAudioContext();
    const actionSounds = {
      add: "menu",
      goto: "menu",
      next: "next",
      pour: "pour",
      restart: "menu",
      undo: "undo",
    };
    const event = kind === "win" ? kind : action && typeof action.k === "string" ? actionSounds[action.k] || kind : kind;
    const file = event === "win"
      ? soundFiles.shared.win
      : soundFiles[gameId]?.[event] || soundFiles.shared[event];
    const fallback = () => playGeneratedGameSound(gameId, event, kind);
    if (file && isCoarsePointer() && fileAvailability.get(file) !== true) {
      probeSoundFile(file);
      fallback();
      return;
    }
    if (file) playSoundFile(file, fallback);
    else fallback();
  }

  function bindToggle(button) {
    if (!button) return;
    const update = () => {
      const compact = button.id === "soundToggleRoom";
      button.textContent = compact
        ? state.enabled ? "🔊" : "🔇"
        : state.enabled ? "🔊 Sound on" : "🔇 Sound off";
      button.setAttribute("aria-pressed", String(state.enabled));
      button.setAttribute("title", state.enabled ? "Mute game sounds" : "Enable game sounds");
      if (compact) button.setAttribute("aria-label", state.enabled ? "Turn game sounds off" : "Turn game sounds on");
    };

    button.addEventListener("click", () => {
      setEnabled(!state.enabled);
      if (state.enabled) {
        playPattern("menu");
      }
    });

    update();
  }

  state.enabled = readSoundSetting();
  window.playoraSound = {
    enabled: () => state.enabled,
    setEnabled,
    playTone,
    playPattern,
    playGame,
    bindToggle,
  };

  function attachToggleButton() {
    [document.getElementById("soundToggle"), document.getElementById("soundToggleRoom")].forEach((button) => {
      if (!button || button.dataset.playoraBound === "true") return;
      bindToggle(button);
      button.dataset.playoraBound = "true";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachToggleButton);
  } else {
    attachToggleButton();
  }
})();
