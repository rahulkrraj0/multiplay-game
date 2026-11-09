import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "crazyeights.js"), "utf8");

function createOnlineCrazyEights() {
  let game;
  const context = {
    gamePlayerNames: ["Host", "Guest"],
    ids: ["host", "guest"],
    np: 2,
    seat: 1,
    canAct: () => true,
    document: {
      createElement: () => ({}),
      head: { appendChild() {} },
    },
    registerGame: (registered) => { game = registered; },
  };
  vm.runInNewContext(source, context, { filename: "crazyeights.js" });
  return { game, context };
}

test("online Crazy Eights adopts the host snapshot before guest rendering and actions", () => {
  const { game } = createOnlineCrazyEights();
  const state = JSON.parse(JSON.stringify(game.init()));
  state.players[0].name = "Host";
  state.players[0].hand = [{ id: 10, s: "S", r: 5 }, { id: 13, s: "S", r: 6 }];
  state.players[1].name = "Guest";
  state.players[1].hand = [{ id: 11, s: "H", r: 7 }];
  state.stock = [{ id: 20, s: "D", r: 2 }];
  state.disc = [{ id: 12, s: "S", r: 5 }];
  state.color = "S";
  state.turn = state.t = 0;
  state.phase = "play";

  game.setState(state);

  const html = game.draw()[0];
  assert.match(html, /5 of spades/);
  assert.match(html, /Host is playing…/);
  assert.match(html, /aria-label="7 of hearts"/);
  assert.equal(game.valid({ type: "play", player: 0, cardId: 10, suit: "S" }), true);

  game.apply({ type: "play", player: 0, cardId: 10, suit: "S" });
  assert.equal(state.t, 1);
  assert.equal(state.disc.at(-1).id, 10);
  assert.equal(state.players[0].hand.length, 1);

  assert.equal(game.valid({ type: "draw", player: 1 }), true);
  game.apply({ type: "draw", player: 1 });
  assert.equal(state.players[1].hand.length, 2);
  assert.equal(state.drawnId, 20);
});
