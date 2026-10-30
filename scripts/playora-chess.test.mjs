import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "chess.js"), "utf8");

function createChess(names = ["Alex", "Blair"]) {
  let game;
  const sandbox = {
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById() {
        return null;
      },
    },
    window: { matchMedia: () => ({ matches: true }) },
    canAct: () => true,
    nm: (player) => names[player],
    act() {},
    registerGame: (registered) => {
      game = registered;
    },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "chess.js" });
  return {
    game,
    get state() {
      return sandbox.S;
    },
    set state(value) {
      sandbox.S = value;
    },
  };
}

test("Chess shows White to move first and updates the player marker after each move", () => {
  const chess = createChess();
  chess.state = chess.game.init();

  let markup = chess.game.draw()[0];
  assert.match(
    markup,
    /class="chess-player active" aria-current="step"><b>White<\/b><span>Alex<\/span><small>to move<\/small>/,
  );
  assert.match(markup, /class="chess-player"><b>Black<\/b><span>Blair<\/span><\/span>/);
  assert.ok(markup.indexOf('class="cb3-ctl"') < markup.indexOf('class="chess-turns"'));

  chess.game.apply({ f: 52, t: 36 });
  markup = chess.game.draw()[0];
  assert.match(markup, /class="chess-player"><b>White<\/b><span>Alex<\/span><\/span>/);
  assert.match(
    markup,
    /class="chess-player active" aria-current="step"><b>Black<\/b><span>Blair<\/span><small>to move<\/small>/,
  );
});
