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
  assert.equal(resumeCount, 1, "resume audio during the game sound request");
  assert.ok(oscillatorCount > 0, "play synthesized sound after the file fails");
  assert.ok(gainPeaks.some((gain) => gain >= 0.15), "Chess fallback should use an audible gain level");
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
    constructor() {}
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
