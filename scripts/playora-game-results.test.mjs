import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

const root = process.cwd();
const engine = readFileSync(join(root, "public", "playora", "core", "engine.js"), "utf8");
const resultSource = engine.match(/function currentGameResult\(\)\{[\s\S]*?\n(?=function render\()/)?.[0];

assert.ok(resultSource, "engine result detection function should be available");

function getResult(game, state, { ids = [], seat = -1, np = 2, localBot = false } = {}) {
  const context = {
    G: game,
    S: state,
    ids,
    seat,
    np,
    localBot,
    playerLabel: index => `Player ${index + 1}`,
    act: () => {}
  };
  return runInNewContext(`(${resultSource})`, context)();
}

test("engine classifies multiplayer wins and losses from the local seat", () => {
  const game = { id: "uno", max: 4 };
  const state = { over: true, winner: 1, win: 0, players: [{ name: "Alex" }, { name: "Blair" }], msg: "Blair wins!" };

  assert.equal(getResult(game, state, { ids: ["a", "b"], seat: 1 }).outcome, "win");
  assert.equal(getResult(game, state, { ids: ["a", "b"], seat: 0 }).outcome, "loss");
  assert.equal(getResult(game, state, { ids: ["a", "b"], seat: 99 }).outcome, "result");
});

test("engine detects explicit draws and checkers color winners", () => {
  assert.equal(getResult({ id: "chess", max: 2 }, { over: true, win: -1, msg: "Draw – stalemate" }).outcome, "draw");
  const checkers = { id: "checkers", max: 2 };
  assert.equal(getResult(checkers, { winner: "r", msg: "Red wins!" }, { ids: ["a", "b"], seat: 0 }).outcome, "win");
  assert.equal(getResult(checkers, { winner: "b", msg: "Black wins!" }, { ids: ["a", "b"], seat: 0 }).outcome, "loss");
});

test("engine recognizes Water Sort level clears without treating its default winner as a draw", () => {
  const result = getResult({ id: "watersort", max: 1 }, { cleared: 1, over: 0, win: -1, L: 3, moves: 14 });

  assert.equal(result.outcome, "complete");
  assert.equal(result.actionLabel, "Next level");
});

test("engine maps partner-game results and games that store the champion in the turn field", () => {
  const players = ["Alex", "Blair", "Casey", "Dev"].map(name => ({ name }));
  const spades = { id: "spades", max: 4 };
  const won = getResult(spades, { over: true, winner: 1, players, msg: "East & West win." }, { ids: ["a", "b", "c", "d"], seat: 3, np: 4 });
  const lost = getResult(spades, { over: true, winner: 1, players, msg: "East & West win." }, { ids: ["a", "b", "c", "d"], seat: 0, np: 4 });

  assert.equal(won.outcome, "win");
  assert.equal(lost.outcome, "loss");
  assert.equal(getResult({ id: "poker", max: 4 }, { over: true, ph: "end", t: 2, msg: "Player 3 wins!" }).winner, 2);
});

test("remaining catalog games produce normalized win, loss, draw, and hearts outcomes", () => {
  const players = ["Alex", "Blair", "Casey", "Dev"].map(name => ({ name }));
  const fixtures = [
    ["bluff", { over: true, winner: 2, players, msg: "Casey wins." }, 2],
    ["callbreak", { over: true, winner: 1, players, msg: "Blair wins the game." }, 1],
    ["crazyeights", { over: true, winner: 3, players, msg: "Dev wins." }, 3],
    ["uno", { over: true, winner: 0, players, msg: "Alex wins!" }, 0],
    ["racer", { over: true, winner: 2, players, msg: "Casey wins the race!" }, 2],
    ["rummy", { over: true, t: 1, players, msg: "Blair wins the match." }, 1],
    ["poker", { over: true, t: 3, players, msg: "Dev wins the match." }, 3],
    ["teenpatti", { over: true, t: 2, players, msg: "Casey wins the match." }, 2],
    ["joker-duel", { over: true, t: 1, players, msg: "Blair wins the match." }, 1]
  ];

  for (const [id, state, winningSeat] of fixtures) {
    assert.equal(getResult({ id, max: 4 }, state, { ids: ["a", "b", "c", "d"], seat: winningSeat, np: 4 }).outcome, "win", `${id} winner`);
    assert.equal(getResult({ id, max: 4 }, state, { ids: ["a", "b", "c", "d"], seat: (winningSeat + 1) % 4, np: 4 }).outcome, "loss", `${id} other player`);
  }

  const hearts = { id: "hearts", max: 4 };
  const state = { phase: "roundend", players: players.map((player, index) => ({ ...player, total: [40, 100, 80, 105][index] })), msg: "Round 5 done" };
  assert.equal(getResult(hearts, state, { seat: 0, localBot: true }).outcome, "win");
  assert.equal(getResult(hearts, state, { ids: ["a", "b", "c", "d"], seat: 2, np: 4 }).outcome, "loss");
  assert.equal(getResult(hearts, state, { seat: 99, ids: ["a", "b", "c", "d"], np: 4 }).outcome, "result");

  assert.equal(getResult({ id: "joker-duel", max: 2 }, { over: true, t: 0, msg: "The match is a draw!" }).outcome, "draw");
});

test("engine and standalone game modules use the shared result API", () => {
  const catalog = JSON.parse(readFileSync(join(root, "public", "playora", "games", "catalog.json"), "utf8"));
  const engineGames = catalog.filter(game => !game.standalone && game.id !== "watersort");
  assert.ok(engineGames.length > 0);

  for (const game of engineGames) {
    const players = Array.from({ length: game.max || 2 }, (_, index) => ({ name: `Player ${index + 1}` }));
    const state = game.id === "checkers"
      ? { winner: "r", msg: "Red wins!" }
      : game.id === "hearts"
        ? { phase: "roundend", players: players.map((player, index) => ({ ...player, total: index ? 100 + index : 40 })), msg: "Round complete" }
        : { over: true, winner: 0, win: 0, t: 0, players, msg: "Player 1 wins!" };
    const result = getResult({ id: game.id, max: game.max }, state, { ids: ["a", "b"], seat: 0, np: game.max || 2 });
    assert.ok(result && result.outcome === "win", `${game.id} should produce a winner result`);
  }

  for (const game of ["carrom", "chess", "connect-four", "ludo", "snl", "ttt", "watersort-game"]) {
    const source = readFileSync(join(root, "public", "playora", "games", `${game}.js`), "utf8");
    assert.match(source, /playoraPresentGameResult/, `${game} should delegate its result presentation`);
  }

  for (const game of ["2048-game", "arrows-game", "sudoku"]) {
    const source = readFileSync(join(root, "public", "playora", "games", `${game}.js`), "utf8");
    assert.match(source, /playoraPresentGameResult/, `${game} should use the shared result presentation`);
  }
});

test("standalone result actions remain connected", () => {
  const arrows = readFileSync(join(root, "public", "playora", "games", "arrows-game.js"), "utf8");
  const sudoku = readFileSync(join(root, "public", "playora", "games", "sudoku.js"), "utf8");
  const waterSort = readFileSync(join(root, "public", "playora", "games", "watersort-game.js"), "utf8");

  assert.match(arrows, /actionLabel: 'Next level'[\s\S]*?nextLevel\(\)/);
  assert.match(arrows, /actionLabel: 'Try again'[\s\S]*?load\(level\)/);
  assert.match(sudoku, /actionLabel: 'New game'[\s\S]*?G = null; menu = true/);
  assert.match(waterSort, /actionLabel: end \? "Close" : "Next level"/);
});
