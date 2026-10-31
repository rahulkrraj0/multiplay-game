import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "snl.js"), "utf8");

function createSnl() {
  let game;
  const sandbox = {
    document: {
      readyState: "loading",
      addEventListener() {},
    },
    window: { matchMedia: () => ({ matches: true }) },
    np: 2,
    nm: (player) => ["Yellow", "Black"][player],
    registerGame: (registered) => { game = registered; },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "snl.js" });
  return {
    game,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

function startSingleTokenGame(snl) {
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });
}

test("Snakes & Ladders reports roll and movement sound events", () => {
  const snl = createSnl();
  startSingleTokenGame(snl);

  snl.state.p[0][0] = 5;
  snl.game.apply({ r: 1 });
  assert.deepEqual(Array.from(snl.game.soundEvents({ r: 1 })), ["roll", "ladder"]);

  startSingleTokenGame(snl);
  snl.state.p[0][0] = 30;
  snl.game.apply({ r: 1 });
  assert.deepEqual(Array.from(snl.game.soundEvents({ r: 1 })), ["roll", "snake"]);

  startSingleTokenGame(snl);
  snl.state.p[0][0] = 0;
  snl.game.apply({ r: 1 });
  assert.deepEqual(Array.from(snl.game.soundEvents({ r: 1 })), ["roll", "token-enter"]);
});

test("Snakes & Ladders reports captures and leaves blocked rolls as dice-only events", () => {
  const snl = createSnl();
  startSingleTokenGame(snl);

  snl.state.p[0][0] = 32;
  snl.state.p[1][0] = 33;
  snl.game.apply({ r: 1 });
  assert.deepEqual(Array.from(snl.game.soundEvents({ r: 1 })), ["roll", "capture"]);

  startSingleTokenGame(snl);
  snl.state.p[0][0] = 98;
  snl.game.apply({ r: 3 });
  assert.deepEqual(Array.from(snl.game.soundEvents({ r: 3 })), ["roll"]);
});
