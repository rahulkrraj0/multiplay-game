import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "examples", "playora-countdown-demo.js"), "utf8");

function createGame() {
  let game;
  const sandbox = {
    S: null,
    act: (action) => game.apply(action),
    canAct: () => !sandbox.S.over,
    nm: (seat) => ["Red", "Blue"][seat],
    registerGame: (registered) => { game = registered; },
  };
  vm.runInNewContext(source, sandbox, { filename: "playora-countdown-demo.js" });
  return { game, sandbox };
}

test("countdown demo validates and applies legal moves through a complete game", () => {
  const { game, sandbox } = createGame();
  sandbox.S = game.init();
  const otherFreshState = game.init();

  assert.equal(game.id, "counter-clash-demo");
  assert.notEqual(sandbox.S, otherFreshState);
  assert.equal(sandbox.S.left, 15);
  assert.equal(game.valid({ take: 3 }), false);
  assert.equal(game.valid({ take: 1, extra: true }), false);

  while (sandbox.S.left > 2) {
    const action = game.bot();
    assert.equal(game.valid(action), true);
    game.apply(action);
  }

  assert.equal(sandbox.S.left, 2);
  assert.equal(sandbox.S.t, 1);
  assert.equal(game.valid({ take: 2 }), true);
  game.apply({ take: 2 });
  assert.equal(sandbox.S.left, 0);
  assert.equal(sandbox.S.over, 1);
  assert.equal(sandbox.S.msg, "Blue wins!");
  assert.equal(game.valid({ take: 1 }), false);
});
