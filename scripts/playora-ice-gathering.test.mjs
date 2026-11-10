import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/playora/core/net.js", import.meta.url), "utf8");
const helper = source.match(
  /const gath = \(pc, timeout = 8000\) =>\s*new Promise\([\s\S]*?\n \}\);/,
);
assert.ok(helper, "ICE gathering helper should be present");

function createPeerConnection(state, sdp = "") {
  const listeners = new Map();
  return {
    iceGatheringState: state,
    localDescription: { sdp },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    update(state, sdp) {
      this.iceGatheringState = state;
      this.localDescription = { sdp };
      for (const listener of listeners.get("icegatheringstatechange") || []) listener();
    },
    candidate(candidate) {
      for (const listener of listeners.get("icecandidate") || []) listener({ candidate: { candidate } });
    },
    get listenerCount() {
      return [...listeners.values()].reduce((count, eventListeners) => count + eventListeners.size, 0);
    },
  };
}

function getGatherIce({ forceRelay = true } = {}) {
  const PLAYORA = { forceRelay };
  const context = {
    clearTimeout,
    setTimeout,
    PLAYORA,
    window: { PLAYORA },
    CFG: { iceServers: [{ urls: "turn:relay.example" }] },
  };
  vm.runInNewContext(`${helper[0]}; globalThis.gath = gath;`, context);
  return context.gath;
}

test("waits for completed ICE gathering in relay-only mode", async () => {
  const gath = getGatherIce();
  const pc = createPeerConnection(
    "gathering",
    "v=0\r\na=candidate:1 1 udp 1 192.0.2.1 5000 typ host\r\n",
  );
  const gathered = gath(pc, 1000);
  setTimeout(
    () =>
      pc.update(
        "complete",
        "v=0\r\na=candidate:2 1 udp 1 203.0.113.1 6000 typ relay\r\n",
      ),
    20,
  );

  await gathered;
  assert.equal(pc.listenerCount, 0);
});

test("relay-only mode rejects completed ICE gathering without a relay candidate", async () => {
  const gath = getGatherIce();
  const pc = createPeerConnection("complete", "v=0\r\na=candidate:1 1 udp 1 192.0.2.1 5000 typ host\r\n");

  await assert.rejects(gath(pc), /No TURN relay candidate was gathered/);
  assert.equal(pc.listenerCount, 0);
});

test("direct-first mode accepts completed ICE gathering without TURN", async () => {
  const gath = getGatherIce({ forceRelay: false });
  const pc = createPeerConnection("complete", "v=0\r\na=candidate:1 1 udp 1 203.0.113.1 5000 typ srflx\r\n");

  await gath(pc);
  assert.equal(pc.listenerCount, 0);
});

test("direct-first mode sends the offer after gathering a srflx candidate", async () => {
  const gath = getGatherIce({ forceRelay: false });
  const pc = createPeerConnection(
    "gathering",
    "v=0\r\na=candidate:1 1 udp 1 203.0.113.1 5000 typ srflx\r\n",
  );
  const started = Date.now();
  const gathered = gath(pc, 5000);
  pc.candidate("candidate:1 1 udp 1 203.0.113.1 5000 typ srflx");

  await gathered;
  assert.ok(Date.now() - started < 3000, "direct candidate should not wait for TURN timeout");
  assert.equal(pc.listenerCount, 0);
});

test("rejects when ICE gathering times out without any candidates", async () => {
  const gath = getGatherIce({ forceRelay: false });
  const pc = createPeerConnection("gathering");

  await assert.rejects(gath(pc, 10), /No network candidates were gathered/);
  assert.equal(pc.listenerCount, 0);
});
