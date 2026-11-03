import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const engine = readFileSync(join(process.cwd(), "public", "playora", "core", "engine.js"), "utf8");
const network = readFileSync(join(process.cwd(), "public", "playora", "core", "net.js"), "utf8");

function evaluate(source, expression, bindings) {
  const context = vm.createContext({ ...bindings });
  return vm.runInContext(`${source}\n${expression}`, context);
}

test("the new host can take the disconnected host's turn and other players cannot", () => {
  const canActSource = engine.match(/const nm=.*?canAct=.*?;/)?.[0];
  const actionStart = engine.indexOf("const actOk=");
  const actionEnd = engine.indexOf("$('rx')", actionStart);
  const actOkSource = actionStart >= 0 && actionEnd > actionStart
    ? engine.slice(actionStart, actionEnd).trim().replace(/;$/, "")
    : null;
  assert.ok(canActSource, "engine must define its turn permission");
  assert.ok(actOkSource, "engine must define action validation");

  const bindings = {
    S: { t: 0, over: false },
    disconnectPending: false,
    seat: 1,
    ids: ["host-id", "guest-id"],
    dead: new Set([0]),
    amHost: () => true,
    G: {},
  };
  assert.equal(evaluate(canActSource, "canAct()", bindings), true);

  const actionBindings = {
    ...bindings,
    G: { valid: () => true },
    hostSeat: () => 1,
  };
  assert.equal(evaluate(actOkSource, "actOk({ id: 'guest-id', seat: 1 }, {})", actionBindings), true);
  assert.equal(evaluate(actOkSource, "actOk({ id: 'spectator-id', seat: 2 }, {})", actionBindings), false);

  bindings.amHost = () => false;
  assert.equal(evaluate(canActSource, "canAct()", bindings), false);
});

test("the old host disconnect path clears the pause and saves the recovered state", () => {
  assert.match(network, /hostLost\)\{clearDisconnectRecovery\(\);fixTurn\(\);persistPreviousGame\(\)\}else syncDisconnectRecovery\(\)/);
});
