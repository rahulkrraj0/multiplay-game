import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "snl.js"), "utf8");

function createSnl({ computer = false } = {}) {
  let game;
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
  };
  const window = {
    matchMedia: () => ({ matches: true }),
    console,
  };
  const sandbox = {
    document,
    window,
    np: 2,
    seat: 0,
    S: null,
    nm: (seat) => ["Player", "Computer"][seat],
    canAct: () => true,
    isLocalComputerGame: () => computer,
    registerGame: (registered) => { game = registered; },
    __SNL_TEST: true,
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "snl.js" });
  return {
    game,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

test("computer matches always ask the human to choose a shared token count", () => {
  const snl = createSnl({ computer: true });
  snl.state = snl.game.init();

  assert.equal(snl.state.t, 0, "the human owns setup even when turns alternate between games");
  assert.equal(snl.game.bot(), null, "the computer must not choose the token count");
  assert.match(snl.game.draw()[0], /Choose how many tokens each player gets/);

  snl.game.apply({ k: 3 });
  assert.equal(snl.state.p[0].length, 3);
  assert.equal(snl.state.p[1].length, 3);
});

test("Snakes and Ladders disallows a third consecutive six and resets the streak", () => {
  const snl = createSnl();
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });

  for (let roll = 0; roll < 2; roll += 1) {
    assert.equal(snl.game.valid({ r: 6 }), true);
    snl.game.apply({ r: 6 });
    assert.equal(snl.state.t, 0, "a six keeps the same player rolling");
  }
  assert.equal(snl.state.sixes, 2);
  assert.equal(snl.game.valid({ r: 6 }), false);
  for (let roll = 1; roll <= 5; roll += 1) {
    assert.equal(snl.game.valid({ r: roll }), true);
  }

  snl.game.apply({ r: 5 });
  assert.equal(snl.state.t, 1, "a non-six passes the turn");
  assert.equal(snl.state.sixes, 0);
});

test("the settled dice face matches the roll applied to the board", () => {
  const snl = createSnl();
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });
  snl.game.apply({ r: 1 });

  assert.equal(snl.state.p[0][0], 1, "a roll of one enters the token on square one");
  assert.equal(snl.state.die, 1);
  assert.match(snl.game.draw()[0], /class="snl-die" data-v="1" role="img" aria-label="Dice shows 1"/);
});
