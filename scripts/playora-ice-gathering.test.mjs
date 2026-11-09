import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/playora/core/net.js", import.meta.url), "utf8");
const helper = source.match(
  /const gath = \(pc, timeout = 20000\) =>\s*new Promise\([\s\S]*?\n \}\);/,
);
assert.ok(helper, "ICE gathering helper should be present");

function createPeerConnection(state, sdp = "") {
  const listeners = new Map();
  return {
    iceGatheringState: state,
    localDescription: { sdp },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    update(state, sdp) {
      this.iceGatheringState = state;
      this.localDescription = { sdp };
      listeners.get("icegatheringstatechange")?.();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function getGatherIce() {
  const context = { clearTimeout, setTimeout };
  vm.runInNewContext(`${helper[0]}; globalThis.gath = gath;`, context);
  return context.gath;
}

test("waits for completed ICE gathering and requires a relay candidate", async () => {
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

test("rejects completed ICE gathering without a relay candidate", async () => {
  const gath = getGatherIce();
  const pc = createPeerConnection("complete", "v=0\r\na=candidate:1 1 udp 1 192.0.2.1 5000 typ host\r\n");

  await assert.rejects(gath(pc), /No TURN relay candidate was gathered/);
  assert.equal(pc.listenerCount, 0);
});

test("rejects when ICE gathering does not complete before timeout", async () => {
  const gath = getGatherIce();
  const pc = createPeerConnection("gathering");

  await assert.rejects(gath(pc, 10), /Timed out waiting for TURN relay candidates/);
  assert.equal(pc.listenerCount, 0);
});
