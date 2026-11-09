import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const network = readFileSync(join(process.cwd(), "public", "playora", "core", "net.js"), "utf8");
const engine = readFileSync(join(process.cwd(), "public", "playora", "core", "engine.js"), "utf8");

function initializeOnlineGame(file, playerCount = 3) {
  const source = readFileSync(join(process.cwd(), "public", "playora", "games", file), "utf8");
  let game;
  const sandbox = {
    ids: ["host", "guest"],
    np: playerCount,
    localBot: false,
    S: {},
    registerGame: (registered) => { game = registered; },
  };
  vm.runInNewContext(source, sandbox, { filename: file });
  return game.init();
}

function extract(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} should be present`);
  return match[0];
}

test("online game seats are filled by bots up to the selected count", () => {
  const source = extract(network, /function onlineBotFillCount\(game,humanCount,playerLimit\)\{[^\n]+\}/, "bot fill policy");
  const fillCount = vm.runInNewContext(`${source}; onlineBotFillCount`, {});
  const game = { minPlayers: 2, max: 4 };

  assert.equal(fillCount(game, 3, 4), 1);
  assert.equal(fillCount(game, 2, 4), 2);
  assert.equal(fillCount(game, 4, 4), 0);
  assert.equal(fillCount(game, 2, 2), 0);
  assert.equal(fillCount(game, 3, 2), -1);
  assert.equal(fillCount(game, 1, 4), -1);
  assert.equal(fillCount({ minPlayers: 4, max: 4 }, 3, 4), -1);
});

test("Spades multiplayer uses the selected two, three, or four seats", () => {
  const source = readFileSync(join(process.cwd(), "public", "playora", "games", "spades.js"), "utf8");
  for (const count of [2, 3, 4]) {
    let game;
    const context = {
      ids: ["host", "guest"],
      np: count,
      localBot: false,
      S: {},
      registerGame: (registered) => { game = registered; },
    };
    vm.runInNewContext(source, context, { filename: "spades.js" });
    const state = game.init();
    assert.equal(state.players.length, count);
    assert.equal(state.teams.length, count === 4 ? 2 : count);
    assert.equal(state.handSize, Math.floor(52 / count));
    assert.deepEqual(Array.from(state.players, (player) => player.bot),
      [false, false, ...Array(count - 2).fill(true)]);
    assert.ok(state.players.every((player) => player.hand.length === state.handSize));

    for (let turn = 0; turn < count; turn++) {
      const bid = { type: "bid", player: state.turn, value: 0 };
      assert.equal(game.valid(bid), true, `${count}-player game accepts each player's bid`);
      game.apply(bid);
    }
    assert.equal(state.phase, "play", `${count}-player game reaches the trick phase`);
    const hand = state.players[state.turn].hand;
    const firstCard = hand.find((card) => card.s !== "S") || hand[0];
    const play = { type: "play", player: state.turn, cardId: firstCard.id };
    assert.equal(game.valid(play), true, `${count}-player game accepts its first card`);
  }
});

test("bot-filled seats are hosted locally while real player seats remain peer-owned", () => {
  assert.match(engine, /amHost\(\)&&S\.t>=ids\.length/);
  assert.match(engine, /C\.seat===hostSeat\(\)&&\(dead\.has\(S\.t\)\|\|S\.t>=ids\.length\)/);
  assert.match(engine, /Math\.max\(ids\.length,Number\(activeLimit\)\|\|ids\.length\)/);
});

test("variable-seat online card games use exactly the selected seat count", () => {
  for (const file of ["bluff.js", "crazyeights.js"]) {
    const state = initializeOnlineGame(file);
    assert.equal(state.players.length, 3, file);
    assert.deepEqual(Array.from(state.players, (player) => player.bot), [false, false, true], file);
  }
});

test("Call Break and Spades support two to four seats", () => {
  const callBreak = readFileSync(join(process.cwd(), "public", "playora", "games", "callbreak.js"), "utf8");
  const spades = readFileSync(join(process.cwd(), "public", "playora", "games", "spades.js"), "utf8");

  assert.match(callBreak, /minPlayers:\s*2,\s*playerCountMin:\s*2,\s*maxPlayers:\s*4/);
  assert.match(spades, /minPlayers:\s*2,\s*playerCountMin:\s*2,\s*maxPlayers:\s*4/);
});

test("online resume snapshots accept fewer human identities than game seats", () => {
  const source = extract(network, /function validPreviousGame\(snapshot,code\)\{[^\n]+\}/, "snapshot validator");
  const validSnapshot = vm.runInNewContext(`${source}; validPreviousGame`, {
    GAMES: { hearts: { max: 4 } },
  });
  const snapshot = {
    version: 1,
    code: "ABCD",
    game: "hearts",
    np: 4,
    playerKeys: ["host", "guest-1", "guest-2"],
    playerNames: ["Host", "Guest 1", "Guest 2", "Computer 1"],
    S: { t: 0 },
    dead: [],
  };

  assert.equal(validSnapshot(snapshot, "ABCD"), true);
  assert.equal(validSnapshot({ ...snapshot, playerKeys: ["host"] }, "ABCD"), false);
});
