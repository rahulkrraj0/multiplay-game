import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "hearts.js"), "utf8");

function createHearts({ random = 0.25, playerIds = [], playerCount = 4 } = {}) {
  let game;
  const math = Object.create(Math);
  math.random = () => random;
  const sandbox = {
    Math: math,
    ids: playerIds,
    np: playerCount,
    seat: 0,
    nm: (index) => ["Alex", "Blair", "Casey", "Drew"][index],
    canAct: () => true,
    registerGame: (registered) => { game = registered; },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "hearts.js" });
  return {
    game,
    sandbox,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

test("Hearts adds bot seats for missing online players", () => {
  const hearts = createHearts({ playerIds: ["host", "guest-1", "guest-2"], playerCount: 4 });
  const state = hearts.game.init();

  assert.equal(state.players.length, 4);
  assert.deepEqual(Array.from(state.players, (player) => player.bot), [false, false, false, true]);
  assert.equal(state.players[3].name, "Computer 1");
});

test("Hearts respects the selected seat count when filling online bot seats", () => {
  const hearts = createHearts({ playerIds: ["host", "guest-1"], playerCount: 3 });
  const state = hearts.game.init();

  assert.equal(state.players.length, 3);
  assert.deepEqual(Array.from(state.players, (player) => player.bot), [false, false, true]);
  assert.equal(state.players[2].name, "Computer 1");
});

test("Hearts applies an incoming synchronized snapshot to its active game state", () => {
  const host = createHearts({ random: 0.1 });
  const guest = createHearts({ random: 0.9 });
  const hostState = host.game.init();
  host.state = hostState;
  guest.game.init();
  const guestSnapshot = JSON.parse(JSON.stringify(hostState));
  guest.state = guestSnapshot;
  const cardId = guestSnapshot.players[0].hand[0].id;

  guest.game.apply({ type: "select", player: 0, cardId });

  assert.deepEqual(Array.from(guest.state.selected[0]), [cardId]);
});

test("Hearts deals identical later rounds from the synchronized random state", () => {
  const host = createHearts({ random: 0.1 });
  const guest = createHearts({ random: 0.9 });
  const hostState = host.game.init();
  host.state = hostState;
  guest.game.init();
  guest.state = JSON.parse(JSON.stringify(hostState));
  host.state.phase = "roundend";
  guest.state.phase = "roundend";

  host.game.apply({ type: "next", player: 0 });
  guest.game.apply({ type: "next", player: 0 });

  const hands = (state) => state.players.map((player) => player.hand.map((card) => card.id));
  assert.deepEqual(JSON.parse(JSON.stringify(hands(guest.state))), JSON.parse(JSON.stringify(hands(host.state))));
  assert.equal(guest.state.rng, host.state.rng);
});
