import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "callbreak.js"), "utf8");

function createOnlineCallBreak(seat = 0, playerCount = 4) {
  let game;
  const context = {
    ids: ["host", "guest"],
    np: playerCount,
    seat,
    S: null,
    canAct: () => true,
    registerGame: (registered) => { game = registered; },
  };
  vm.runInNewContext(source, context, { filename: "callbreak.js" });
  context.S = game.init();
  return { game, context };
}

test("online Call Break renders the local player's hand for host and guest seats", () => {
  const { game, context } = createOnlineCallBreak();
  const state = context.S;

  assert.equal(state.players.length, 4);
  assert.deepEqual(Array.from(state.players, (player) => player.bot), [false, false, true, true]);

  const hostHtml = game.draw()[0];
  assert.equal((hostHtml.match(/aria-label="[^"]+ of [^"]+"/g) || []).length, 13);
  assert.match(hostHtml, /data-m="bid:1"/);

  context.seat = 1;
  state.t = state.turn = 1;
  const guestHtml = game.draw()[0];
  assert.equal((guestHtml.match(/aria-label="[^"]+ of [^"]+"/g) || []).length, 13);
  assert.match(guestHtml, /data-m="bid:1"/);
  assert.match(guestHtml, /Your turn\./);

  state.phase = "play";
  state.turn = state.t = 1;
  state.collect = true;
  state.win = 1;
  const collectHtml = game.draw()[0];
  const tableIndex = collectHtml.indexOf('<div class="table">');
  const collectIndex = collectHtml.indexOf('class="btn collect-action"');
  const handIndex = collectHtml.indexOf('<div class="hand">');
  assert.ok(tableIndex < collectIndex && collectIndex < handIndex,
    "the collect action is centered above the player's hand");
});

test("online two-player Call Break deals 26 cards and has no bot seats", () => {
  const { game, context } = createOnlineCallBreak(0, 2);
  const state = context.S;

  assert.equal(state.players.length, 2);
  assert.deepEqual(Array.from(state.players, (player) => player.bot), [false, false]);
  assert.equal(state.handSize, 26);
  assert.ok(state.players.every((player) => player.hand.length === 26));
  assert.equal(game.valid({ type: "bid", player: 0, value: 26 }), true);

  game.apply({ type: "bid", player: 0, value: 26 });
  assert.equal(state.t, 1);
  assert.equal(state.phase, "bid");

  let steps = 0;
  while (state.phase !== "roundend" && steps < 100) {
    if (state.phase === "bid") {
      game.apply({ type: "bid", player: state.t, value: 1 });
    } else if (state.collect) {
      game.apply({ type: "collect", player: state.win });
    } else {
      const player = state.t;
      const card = state.players[player].hand.find((candidate) =>
        game.valid({ type: "play", player, cardId: candidate.id }));
      assert.ok(card, `player ${player} should have a legal card`);
      game.apply({ type: "play", player, cardId: card.id });
    }
    steps++;
  }

  assert.equal(state.phase, "roundend");
  assert.ok(state.players.every((player) => player.hand.length === 0));
  assert.equal(state.players.reduce((total, player) => total + player.tricks, 0), 26);
});
