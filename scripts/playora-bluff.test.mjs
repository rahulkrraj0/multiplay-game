import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = process.cwd();
const bluffSource = readFileSync(join(root, "public", "playora", "games", "bluff.js"), "utf8");
const engineSource = readFileSync(join(root, "public", "playora", "core", "engine.js"), "utf8");

function createBluff({ playerCount = 3, seat = 0 } = {}) {
  let game;
  const context = {
    console,
    ids: ["host", "guest"],
    np: playerCount,
    seat,
    S: null,
    gamePlayerNames: ["Host", "Guest", "Computer 1"],
    nm: (index) => `Player ${index + 1}`,
    canAct: () => true,
    registerGame(value) { game = value; },
  };
  context.window = context;
  vm.runInNewContext(bluffSource, context, { filename: "bluff.js" });
  return { game, context };
}

function createActOk({ turn, players, valid = () => true, dead = [] }) {
  const source = engineSource.match(/const actOk=\(C,a\)=>\{[^\n]+\}/)?.[0];
  assert.ok(source, "the engine online action guard should exist");
  return vm.runInNewContext(`${source}; actOk`, {
    S: { t: turn, over: false },
    G: { valid },
    disconnectPending: false,
    hostSeat: () => 0,
    ids: players,
    dead: new Set(dead),
  });
}

test("Bluff can produce and apply a legal move for an online bot-filled seat", () => {
  const { game } = createBluff();
  const state = game.init();

  assert.equal(state.players.length, 3);
  assert.equal(state.players[2].bot, true);
  state.t = state.turn = 2;

  const action = game.bot();
  assert.equal(action.player, 2);
  assert.equal(game.valid(action), true);

  game.apply(action);
  assert.equal(state.last.p, 2);
  assert.equal(state.phase, "call");
  assert.equal(state.t, 0);
});

test("online Bluff renders the local player's hand instead of treating everyone as spectators", () => {
  const { game, context } = createBluff({ playerCount: 2 });
  const state = game.init();

  for (const seat of [0, 1]) {
    context.seat = seat;
    const [html] = game.draw();

    assert.equal((html.match(/aria-label="[^"]+ of [^"]+"/g) || []).length, 26);
    assert.equal(html.includes(`class="seat s${seat} `), false);
    assert.equal(html.includes(`class="seat s${1 - seat}`), true);
  }
  assert.equal(state.players.length, 2);
});

test("the multiplayer guard accepts a host action for an online bot seat", () => {
  const actOk = createActOk({ turn: 2, players: ["host", "guest"] });
  assert.equal(actOk({ id: "host", seat: 0 }, { type: "play", player: 2 }), true);
});

test("the multiplayer guard does not accept a non-host action for an online bot seat", () => {
  const actOk = createActOk({ turn: 2, players: ["host", "guest"] });
  assert.equal(actOk({ id: "guest", seat: 1 }, { type: "play", player: 2 }), false);
});

test("the multiplayer guard still accepts the host acting for a disconnected seat", () => {
  const actOk = createActOk({ turn: 1, players: ["host", "guest"], dead: [1] });
  assert.equal(actOk({ id: "host", seat: 0 }, { type: "move", player: 1 }), true);
});

test("the multiplayer guard still runs game action validation for host bot moves", () => {
  const actOk = createActOk({
    turn: 2,
    players: ["host", "guest"],
    valid: (action) => action.player === 2 && action.cardId === 7,
  });

  assert.equal(actOk({ id: "host", seat: 0 }, { type: "play", player: 2, cardId: 7 }), true);
  assert.equal(actOk({ id: "host", seat: 0 }, { type: "play", player: 2, cardId: 8 }), false);
});
