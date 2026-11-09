import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "core", "room.js"), "utf8");

function createHostMessageHandler() {
  const match = source.match(/function hostMsg\(m\)\s*\{[\s\S]*?\r?\n\}\r?\nasync function roomHostAvailable/);
  assert.ok(match, "host message handler should be present");
  const admitted = [];
  const sandbox = {
    room: { pend: {}, ws: {} },
    admit: (id) => admitted.push(id),
    sgn: () => assert.fail("ordinary joins should not need a rejection response"),
    window: { confirm: () => assert.fail("ordinary joins should not prompt the host") },
    console,
  };
  vm.runInNewContext(match[0].replace(/\r?\nasync function roomHostAvailable$/, ""), sandbox);
  return { handler: sandbox.hostMsg, admitted };
}

test("lobby automatically admits a player join offer without a blocking approval prompt", () => {
  const { handler, admitted } = createHostMessageHandler();

  handler({ type: "OFFER", src: "guest-peer", payload: { k: "join" } });

  assert.deepEqual(admitted, ["guest-peer"]);
});
