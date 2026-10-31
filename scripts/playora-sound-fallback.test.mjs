import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const soundsScript = fileURLToPath(new URL("../public/playora/core/sounds.js", import.meta.url));

test("missing game audio files fall back to synthesized sound", async () => {
  const audioInstances = [];
  let oscillatorCount = 0;
  let resumeCount = 0;
  const gainPeaks = [];

  class MockAudio {
    constructor(src) {
      this.src = src;
      this.error = null;
      this.listeners = {};
      audioInstances.push(this);
    }

    addEventListener(type, callback) {
      this.listeners[type] = callback;
    }

    play() {
      this.error = new Error("Audio file not found");
      queueMicrotask(() => this.listeners.error?.());
      return Promise.reject(this.error);
    }
  }

  class MockAudioContext {
    state = "suspended";
    currentTime = 0;
    destination = {};

    resume() {
      resumeCount += 1;
      this.state = "running";
      return Promise.resolve();
    }

    createOscillator() {
      oscillatorCount += 1;
      return {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime(value) { gainPeaks.push(value); },
        },
        connect() {},
      };
    }
  }

  const window = {
    Audio: MockAudio,
    AudioContext: MockAudioContext,
    location: { pathname: "/" },
    setTimeout: (callback) => callback(),
  };
  const document = { readyState: "complete", getElementById: () => null };
  const context = {
    window,
    document,
    localStorage: { getItem: () => null, setItem() {} },
    console,
    setTimeout: (callback) => callback(),
  };

  vm.runInNewContext(readFileSync(soundsScript, "utf8"), context);
  window.playoraSound.playGame("chess", "move");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(audioInstances[0].src, "/playora/sounds/chess/move.ogg");
  assert.equal(audioInstances[0].volume, 0.6, "play sound files at the shared playback level");
  assert.equal(resumeCount, 1, "resume audio during the game sound request");
  assert.ok(oscillatorCount > 0, "play synthesized sound after the file fails");
  assert.ok(gainPeaks.some((gain) => Math.abs(gain - 0.06) < 0.0001), "Chess fallback should use the shared cue level");
});

test("generated cues across games use the same peak loudness", () => {
  const rampValues = [];

  class MockAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() {
      return {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime(value) { rampValues.push(value); },
        },
        connect() {},
      };
    }
  }

  const window = {
    AudioContext: MockAudioContext,
    location: { pathname: "/" },
    setTimeout: (callback) => callback(),
  };
  const document = { readyState: "complete", getElementById: () => null };
  const context = {
    window,
    document,
    localStorage: { getItem: () => null, setItem() {} },
    console,
    setTimeout: (callback) => callback(),
  };

  vm.runInNewContext(readFileSync(soundsScript, "utf8"), context);
  const cues = [
    ["chess", "move"],
    ["connect-four", "move"],
    ["ludo", "roll"],
    ["racer", "start"],
    ["ttt", "win"],
    ["watersort", "undo"],
  ];
  const peaks = cues.map(([game, event]) => {
    rampValues.length = 0;
    window.playoraSound.playGame(game, event);
    return Math.max(...rampValues);
  });

  assert.ok(peaks.every((peak) => Math.abs(peak - 0.06) < 0.0001), `cue peaks: ${peaks.join(", ")}`);
});

test("touch devices play generated Chess sound immediately while checking for an asset", () => {
  let oscillatorCount = 0;
  let audioPlayCount = 0;
  let fetchCount = 0;

  class MockAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() {
      oscillatorCount += 1;
      return {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }
  }

  class MockAudio {
    constructor() {
      this.volume = 1;
    }
    play() {
      audioPlayCount += 1;
      return Promise.resolve();
    }
  }

  const window = {
    Audio: MockAudio,
    AudioContext: MockAudioContext,
    location: { pathname: "/" },
    matchMedia: () => ({ matches: true }),
    fetch: () => {
      fetchCount += 1;
      return new Promise(() => {});
    },
    setTimeout: (callback) => callback(),
  };
  const document = { readyState: "complete", getElementById: () => null };
  const context = {
    window,
    document,
    localStorage: { getItem: () => null, setItem() {} },
    console,
    setTimeout: (callback) => callback(),
  };

  vm.runInNewContext(readFileSync(soundsScript, "utf8"), context);
  window.playoraSound.playGame("chess", "move");

  assert.equal(fetchCount, 1, "check whether the Chess audio file exists");
  assert.equal(audioPlayCount, 0, "do not wait on or attempt unconfirmed file playback");
  assert.equal(oscillatorCount, 2, "start the generated Chess cue immediately");
});

test("the in-game mute button disables sounds and stops active audio files", () => {
  const buttons = new Map();
  const storedValues = new Map();
  let audioPauseCount = 0;

  class MockAudio {
    constructor() {
      this.listeners = {};
    }
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    }
    play() {
      return Promise.resolve();
    }
    pause() {
      audioPauseCount += 1;
    }
  }

  const createButton = (id) => {
    const listeners = {};
    const attributes = {};
    const button = {
      id,
      dataset: {},
      textContent: "",
      addEventListener(type, callback) {
        listeners[type] = callback;
      },
      setAttribute(name, value) {
        attributes[name] = value;
      },
      click() {
        listeners.click();
      },
      attributes,
    };
    buttons.set(id, button);
    return button;
  };

  createButton("soundToggle");
  const roomButton = createButton("soundToggleRoom");
  const window = {
    Audio: MockAudio,
    location: { pathname: "/" },
  };
  const document = {
    readyState: "complete",
    getElementById: (id) => buttons.get(id) ?? null,
  };
  const context = {
    window,
    document,
    localStorage: {
      getItem: (key) => storedValues.get(key) ?? null,
      setItem: (key, value) => storedValues.set(key, value),
    },
    console,
    setTimeout: (callback) => callback(),
  };

  vm.runInNewContext(readFileSync(soundsScript, "utf8"), context);
  window.playoraSound.playGame("chess", "move");
  roomButton.click();

  assert.equal(window.playoraSound.enabled(), false, "turn the sound setting off");
  assert.equal(storedValues.get("playora.sound-enabled.v1"), "false", "persist the muted setting");
  assert.equal(roomButton.attributes["aria-pressed"], "false", "update the in-game button state");
  assert.equal(roomButton.attributes["aria-label"], "Turn game sounds on", "announce the available action");
  assert.equal(buttons.get("soundToggle").textContent, "🔇 Sound off", "synchronize the homepage button");
  assert.equal(audioPauseCount, 1, "stop any currently playing audio file");
});
