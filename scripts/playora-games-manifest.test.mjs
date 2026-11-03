import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { discoverPlayoraGames } from "./playora-games-manifest.mjs";

test("discovers game scripts in stable order and ignores non-game files", () => {
  const root = mkdtempSync(join(tmpdir(), "playora-games-"));
  const directory = join(root, "public", "playora", "games");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "zebra.js"), "");
  writeFileSync(join(directory, "newgame.js"), "");
  writeFileSync(join(directory, "chess copy.js"), "");
  writeFileSync(join(directory, "notes.txt"), "");
  mkdirSync(join(directory, "folder.js"));

  try {
    assert.deepEqual(discoverPlayoraGames(root), ["newgame.js", "zebra.js"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the lazy-load catalog maps every game script exactly once", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const catalogPath = new URL("../public/playora/games/catalog.json", import.meta.url);
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const scripts = discoverPlayoraGames(root);
  const files = catalog.map((game) => game.file);
  const ids = catalog.map((game) => game.id);

  assert.deepEqual([...files].sort(), scripts);
  assert.equal(new Set(files).size, files.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(catalog.find((game) => game.id === "carrom")?.i, "\u{1F7EB}");
  for (const game of catalog) {
    assert.match(game.id, /^[a-z0-9][a-z0-9_-]*$/i);
    assert.ok(game.file.endsWith(".js"));
    const source = readFileSync(join(root, "public", "playora", "games", game.file), "utf8");
    assert.match(source, new RegExp(`\\bid\\s*:\\s*["']${game.id}["']`));
    assert.equal(typeof game.i, "string");
    assert.equal(typeof game.t, "string");
    assert.equal(typeof game.d, "string");
    assert.ok(Number.isInteger(game.max) && game.max >= 1);
    assert.equal(typeof game.cat, "string");
    assert.equal(typeof game.tag, "string");
    assert.equal(typeof game.diff, "string");
    assert.equal(typeof game.art, "string");
    if (game.logo) assert.ok(existsSync(join(root, "public", "playora", "game-logos", game.logo)));
  }

  for (const id of ["2048", "checkers", "sudoku", "uno"]) {
    const game = catalog.find((entry) => entry.id === id);
    assert.ok(game, `missing catalog entry for ${id}`);
    const source = readFileSync(join(root, "public", "playora", "games", game.file), "utf8");
    if (id === "checkers" || id === "uno") {
      assert.match(source, new RegExp(`max:\\s*${game.max}\\b`));
    }
    if (id === "2048" || id === "sudoku") {
      assert.equal(game.standalone, true);
      assert.match(source, /standalone\s*:\s*true/);
    } else {
      assert.equal(game.standalone, undefined);
      assert.match(source, /draw\(\)|draw:\s*roomDraw/);
      assert.match(source, /apply\(|apply:\s*roomApply/);
      assert.match(source, /click\(|click:\s*roomClick/);
    }
  }
});

test("Checkers and UNO expose Playora multiplayer game actions", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const createGame = (file, globals = {}) => {
    let game;
    const styles = [];
    const context = {
      console,
      Math,
      setTimeout,
      clearTimeout,
      document: {
        getElementById(id) { return styles.find((style) => style.id === id) || null; },
        createElement() { return { textContent: "", remove() {} }; },
        head: { appendChild(style) { styles.push(style); } },
      },
      registerGame(value) { game = value; },
      S: null,
      np: 2,
      seat: -1,
      ids: [],
      sel: -1,
      nm(index) { return `Player ${index + 1}`; },
      canAct() { return true; },
      act(action) { context.lastAction = action; },
      render() {},
      ...globals,
    };
    context.window = context;
    vm.runInNewContext(readFileSync(join(root, "public", "playora", "games", file), "utf8"), context);
    return { game, context, styles };
  };

  const checkers = createGame("checkers-game.js");
  checkers.context.S = checkers.game.init();
  const move = checkers.game.legalMoves(checkers.context.S)[0];
  assert.ok(checkers.game.valid(move));
  checkers.game.apply(move);
  assert.equal(checkers.context.S.t, 1);
  assert.deepEqual(checkers.context.S.lastMove.from, move.from);
  assert.deepEqual(checkers.context.S.lastMove.to, move.to);
  assert.equal(checkers.context.S.moveSeq, 1);
  assert.equal((checkers.game.draw()[0].match(/data-i=/g) || []).length, 64);

  const uno = createGame("uno.js", { np: 3 });
  uno.context.S = uno.game.init();
  assert.equal(uno.context.S.players.length, 3);
  assert.ok(uno.context.S.players.every((player) => player.hand.length >= 7));
  const draw = { type: "draw", player: uno.context.S.t };
  assert.equal(uno.game.valid(draw), true);
  uno.game.apply(draw);
  assert.ok(uno.context.S.players.some((player) => player.hand.length > 7));
  const [unoHtml] = uno.game.draw();
  assert.match(unoHtml, /^<div class="uno">/);
  const unoStyle = uno.styles.find((style) => style.id === "uno-game-style");
  assert.ok(unoStyle);
  assert.match(unoStyle.textContent, /#room \.uno \.card/);
});
