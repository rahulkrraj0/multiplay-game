import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "racer.js"), "utf8");

function createRacer({ localSeat = 0, host = true } = {}) {
  let now = 100_000;
  let scheduledFrame;
  let nextFrame = 0;
  let game;
  const documentEvents = new Map();
  const sent = [];
  const status = { textContent: "" };
  const context = new Proxy({}, { get: (_, key) => (..._args) => key });
  const canvas = {
    isConnected: true,
    width: 960,
    height: 600,
    getBoundingClientRect: () => ({ width: 960, height: 600 }),
    getContext: () => context,
  };
  const document = {
    querySelector: () => canvas,
    querySelectorAll: () => [],
    getElementById: () => status,
    addEventListener: (type, callback) => documentEvents.set(type, callback),
    removeEventListener: (type) => documentEvents.delete(type),
  };
  const fakeWindow = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  class FakeDate extends Date {
    static now() {
      return now;
    }
  }
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }
  const sandbox = {
    Date: FakeDate,
    document,
    window: fakeWindow,
    ResizeObserver: FakeResizeObserver,
    registerGame: (registered) => { game = registered; },
    requestAnimationFrame: (callback) => {
      scheduledFrame = callback;
      return ++nextFrame;
    },
    cancelAnimationFrame: () => { scheduledFrame = null; },
    seat: localSeat,
    ids: ["host-id", "guest-id"],
    amHost: () => host,
    hostSeat: () => 0,
    realtimeSend: (kind, data) => sent.push({ kind, data }),
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "racer.js" });

  function advanceFrame(step = 17) {
    now += step;
    const callback = scheduledFrame;
    scheduledFrame = null;
    assert.equal(typeof callback, "function", "game should schedule its next frame");
    callback(now);
  }

  function press(key) {
    documentEvents.get("keydown")?.({ key, preventDefault() {} });
  }

  return {
    game,
    sent,
    status,
    advanceFrame,
    press,
    setState(state) { sandbox.S = state; },
  };
}

test("realtime racer simulates locally and publishes authoritative snapshots", () => {
  const racer = createRacer();
  assert.equal(racer.game.id, "racer");
  assert.equal(racer.game.realtime, true);
  const state = racer.game.init();
  racer.setState(state);
  racer.game.onStart();
  racer.press("ArrowUp");
  for (let frame = 0; frame < 260; frame += 1) racer.advanceFrame();

  assert.ok(state.cars[0].speed > 0);
  assert.ok(racer.sent.some((packet) => packet.kind === "state"));

  racer.game.onRealtimeMessage(1, "input", {
    sequence: 1,
    controls: { throttle: 1, brake: 0, left: 0, right: 0 },
  });
  assert.equal(state.cars[1].controls.throttle, 1);
  racer.game.onRealtimeMessage(1, "input", {
    sequence: 1,
    controls: { throttle: 0, brake: 0, left: 0, right: 0 },
  });
  assert.equal(state.cars[1].controls.throttle, 1, "stale input must be ignored");
  racer.game.onStop();
});

test("realtime racer accepts fresh host snapshots and emits guest input", () => {
  const racer = createRacer({ localSeat: 1, host: false });
  const state = racer.game.init();
  racer.setState(state);
  racer.game.onStart();
  const hostState = racer.game.init();
  hostState.sequence = 4;
  hostState.raceAt = 101_000;
  hostState.startedAt = 100_000;
  racer.game.onRealtimeMessage(0, "state", {
    sequence: 4,
    raceAt: hostState.raceAt,
    startedAt: hostState.startedAt,
    over: 0,
    winner: -1,
    cars: hostState.cars,
  });
  assert.equal(state.sequence, 4);
  racer.press("ArrowUp");
  for (let frame = 0; frame < 8; frame += 1) racer.advanceFrame();
  assert.ok(racer.sent.some((packet) => packet.kind === "input"));

  const before = state.sequence;
  racer.game.onRealtimeMessage(0, "state", {
    sequence: 5,
    raceAt: 101_000,
    startedAt: 100_000,
    over: 0,
    winner: -1,
    cars: [{ ...hostState.cars[0], x: Number.MAX_VALUE }, hostState.cars[1]],
  });
  assert.equal(state.sequence, before, "invalid state must be ignored");
  racer.game.onStop();
});
