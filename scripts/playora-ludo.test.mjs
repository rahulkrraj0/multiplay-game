import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "ludo.js"), "utf8");

function createLudo() {
  let game;
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
  };
  const window = {
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    removeEventListener() {},
    console,
  };
  const sandbox = {
    document,
    window,
    np: 2,
    S: null,
    nm: (seat) => ["Red", "Blue"][seat],
    registerGame: (registered) => { game = registered; },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "ludo.js" });
  return {
    game,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

test("Ludo limits its third consecutive six and applies the shown roll unchanged", () => {
  const ludo = createLudo();
  ludo.state = ludo.game.init();
  ludo.game.apply({ houses: 1 });
  ludo.game.apply({ color: 0 });

  assert.equal(ludo.game.rollSides(), 6);
  ludo.state.sixes = 2;
  assert.equal(ludo.game.rollSides(), 5);
  assert.equal(ludo.game.valid({ r: 6 }), false);
  assert.equal(ludo.game.valid({ r: 5 }), true);

  ludo.game.apply({ r: 6 });
  assert.equal(ludo.state.lastDie, 0, "an invalid third six must not be applied");
  ludo.game.apply({ r: 5 });
  assert.equal(ludo.state.lastDie, 5);
});
