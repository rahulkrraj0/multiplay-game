import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { discoverPlayoraGames } from "./playora-games-manifest.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function createGame(file, globals = {}) {
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
  vm.runInNewContext(readFileSync(join(projectRoot, "public", "playora", "games", file), "utf8"), context);
  return { game, context, styles };
}

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

  for (const id of ["2048", "arrows", "checkers", "sudoku", "uno"]) {
    const game = catalog.find((entry) => entry.id === id);
    assert.ok(game, `missing catalog entry for ${id}`);
    const source = readFileSync(join(root, "public", "playora", "games", game.file), "utf8");
    if (id === "checkers" || id === "uno") {
      assert.match(source, new RegExp(`max:\\s*${game.max}\\b`));
    }
    if (id === "2048" || id === "arrows" || id === "sudoku") {
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

test("Arrows is cataloged as a standalone puzzle with a matching logo", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/playora/games/catalog.json", import.meta.url), "utf8"));
  const entry = catalog.find((game) => game.id === "arrows");
  assert.ok(entry);
  assert.equal(entry.file, "arrows-game.js");
  assert.equal(entry.t, "Arrows");
  assert.equal(entry.max, 1);
  assert.equal(entry.standalone, true);
  assert.equal(entry.logo, "arrows.svg");
  assert.ok(existsSync(new URL("../public/playora/game-logos/arrows.svg", import.meta.url)));

  const { game } = createGame(entry.file);
  assert.equal(game.id, entry.id);
  assert.equal(game.standalone, true);
  assert.equal(game.t, entry.t);
  const gameSource = readFileSync(new URL("../public/playora/games/arrows-game.js", import.meta.url), "utf8");
  assert.match(gameSource, /type: 'out'/);
  assert.match(gameSource, /type: 'shake'/);
  assert.match(gameSource, /type: 'flash'/);
  for (const event of ["start", "move", "error", "win", "loss", "menu"])
    assert.ok(gameSource.includes("playSound('" + event + "')"), `missing Arrows ${event} feedback`);
  assert.match(gameSource, /prefers-reduced-motion: reduce/);
  const soundsSource = readFileSync(new URL("../public/playora/core/sounds.js", import.meta.url), "utf8");
  assert.match(soundsSource, /arrows:\s*\{[\s\S]*?move:[\s\S]*?error:[\s\S]*?win:/);
});

test("previously unlisted card games support rooms, bots, and game feedback", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/playora/games/catalog.json", import.meta.url), "utf8"));
  const soundsSource = readFileSync(new URL("../public/playora/core/sounds.js", import.meta.url), "utf8");
  const games = [
    ["bluff", "bluff.js", "Bluff", "bluff.svg", "card-reveal"],
    ["callbreak", "callbreak.js", "Call Break", "callbreak.svg", "card-land"],
    ["crazyeights", "crazyeights.js", "Crazy Eights", "crazy-eights.svg", "card-land"],
    ["hearts", "hearts.js", "Hearts", "hearts.svg", "card-land"],
    ["spades", "spades.js", "Spades", "spades.svg", "card-land"],
  ];

  for (const [id, file, title, logo, animation] of games) {
    const entry = catalog.find((game) => game.id === id);
    assert.ok(entry, `missing catalog entry for ${id}`);
    assert.equal(entry.file, file);
    assert.equal(entry.t, title);
    assert.equal(entry.min, 2);
    assert.equal(entry.max, 4);
    assert.equal(entry.standalone, undefined);
    assert.equal(entry.logo, logo);
    assert.ok(existsSync(new URL("../public/playora/game-logos/" + logo, import.meta.url)));

    const { game } = createGame(file);
    assert.equal(game.id, id);
    assert.equal(game.minPlayers, 2);
    assert.equal(game.maxPlayers, 4);
    assert.equal(game.max, 4);
    assert.equal(game.standalone, undefined);
    for (const method of ["init", "valid", "apply", "bot", "draw", "click"])
      assert.equal(typeof game[method], "function", `${id} must provide ${method}()`);

    const source = readFileSync(new URL("../public/playora/games/" + file, import.meta.url), "utf8");
    assert.match(source, new RegExp(`playGame\\('${id}', event\\)`));
    assert.ok(source.includes("@keyframes " + animation), `${id} is missing card movement animation`);
    assert.match(source, /prefers-reduced-motion:reduce/);
    assert.ok(soundsSource.includes(id + ": {"), `${id} is missing a custom sound profile`);
  }
});

test("previously unlisted card games complete multiplayer bot matches", async (t) => {
  const games = ["bluff.js", "callbreak.js", "crazyeights.js", "hearts.js", "spades.js"];

  for (const file of games) {
    await t.test(file, () => {
      const { game, context } = createGame(file, {
        np: 2,
        seat: 0,
        ids: ["player-1", "player-2"],
      });
      const state = game.init();
      context.S = state;

      assert.equal(state.players.length, 4, "online rooms should fill four seats");
      assert.deepEqual(
        Array.from(state.players, (player) => player.bot),
        [false, false, true, true],
        "unoccupied room seats should be filled with bots",
      );
      assert.equal(game.valid({ type: "invalid", player: state.t }), false);
      assert.equal(typeof game.draw()[0], "string", "room games should render markup");

      state.players.forEach((player) => { player.bot = true; });
      let actions = 0;
      while (!state.over && actions < 3000) {
        const before = JSON.stringify(state);
        const action = game.bot();
        assert.ok(action, `bot should act during ${state.phase}`);
        assert.equal(game.valid(action), true, `bot action should be valid: ${JSON.stringify(action)}`);
        game.apply(action);
        assert.notEqual(JSON.stringify(state), before, "valid actions should update shared state");
        assert.ok(Number.isInteger(state.t) && state.t >= 0 && state.t < state.players.length,
          "shared state should retain a valid current-player index");
        assert.doesNotThrow(() => JSON.stringify(state), "shared state should remain serializable");
        actions++;
      }

      assert.equal(state.over, true, `the bot match should finish within ${actions} actions`);
    });
  }
});

test("Checkers and UNO expose Playora multiplayer game actions", () => {
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

test("UNO animates a newly drawn card and a card played to the discard pile", () => {
  const uno = createGame("uno.js", { np: 2 });
  uno.context.S = uno.game.init();
  const drawCard = uno.context.S.draw.find((card) => card.c === uno.context.S.color);
  assert.ok(drawCard);
  uno.context.S.draw = [drawCard];
  uno.game.apply({ type: "draw", player: 0 });
  assert.equal(uno.context.S.animation.type, "draw");
  assert.equal(uno.context.S.animation.cardId, drawCard.id);
  assert.match(uno.game.draw()[0], new RegExp('class="card[^"]*dealing'));
  const unoStyle = uno.styles.find((style) => style.id === "uno-game-style");
  assert.match(unoStyle.textContent, /@keyframes uno-card-play/);
  assert.match(unoStyle.textContent, /@keyframes uno-card-deal/);
  assert.match(unoStyle.textContent, /prefers-reduced-motion:reduce/);

  uno.context.S = uno.game.init();
  const player = uno.context.S.players[0];
  const playCard = { id: 1000, c: uno.context.S.color, v: "5" };
  player.hand[0] = playCard;
  player.hand[1] = { id: 1001, c: uno.context.S.color, v: "6" };
  uno.game.apply({ type: "play", player: 0, cardId: playCard.id });
  assert.equal(uno.context.S.animation.type, "play");
  assert.equal(uno.context.S.animation.cardId, playCard.id);
  assert.match(uno.game.draw()[0], new RegExp('class="card[^"]*played'));
});

test("Checkers alternates the opening color on each new game", () => {
  const checkers = createGame("checkers-game.js");
  let state = checkers.game.init();
  assert.equal(state.turn, "r");
  assert.equal(state.t, 0);

  state = checkers.game.init(state);
  assert.equal(state.turn, "b");
  assert.equal(state.t, 1);
  const move = checkers.game.legalMoves(state)[0];
  assert.ok(move.from[0] < move.to[0], "Black's opening move advances from the top of the board");

  state = checkers.game.init(state);
  assert.equal(state.turn, "r");
  assert.equal(state.t, 0);
});

test("Checkers enforces mandatory captures and forward-only man moves", () => {
  const checkers = createGame("checkers-game.js");
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[5][0] = "r";
  board[4][1] = "b";
  board[5][4] = "r";
  checkers.context.S = { board, turn: "r", chain: null, winner: null, quiet: 0 };

  const moves = checkers.game.legalMoves(checkers.context.S);
  assert.equal(moves.length, 1);
  assert.deepEqual(Array.from(moves[0].from), [5, 0]);
  assert.deepEqual(Array.from(moves[0].to), [3, 2]);
  assert.equal(checkers.game.valid({ from: [5, 4], to: [4, 3] }), false,
    "a quiet move is forbidden while a capture is available");
  assert.equal(checkers.game.valid({ from: [5, 4], to: [6, 3] }), false,
    "a man cannot move backwards");
});

test("Checkers keeps a multi-jump with the same piece and crowns at turn end", () => {
  const checkers = createGame("checkers-game.js");
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[5][0] = "r";
  board[4][1] = "b";
  board[2][3] = "b";
  checkers.context.S = { board, turn: "r", chain: null, winner: null, quiet: 0 };

  let moves = checkers.game.legalMoves(checkers.context.S);
  assert.equal(moves.length, 1);
  assert.deepEqual(Array.from(moves[0].to), [3, 2]);
  checkers.game.apply(moves[0]);
  assert.equal(checkers.context.S.turn, "r");
  assert.deepEqual(Array.from(checkers.context.S.chain), [3, 2]);
  moves = checkers.game.legalMoves(checkers.context.S);
  assert.equal(moves.length, 1);
  assert.deepEqual(Array.from(moves[0].to), [1, 4]);
  checkers.game.apply(moves[0]);
  assert.equal(checkers.context.S.turn, "b");
  assert.equal(checkers.context.S.chain, null);

  const promotionBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  promotionBoard[2][1] = "r";
  promotionBoard[1][2] = "b";
  promotionBoard[1][4] = "b";
  checkers.context.S = { board: promotionBoard, turn: "r", chain: null, winner: null, quiet: 0 };
  moves = checkers.game.legalMoves(checkers.context.S);
  assert.equal(moves.length, 1);
  assert.deepEqual(Array.from(moves[0].to), [0, 3]);
  checkers.game.apply(moves[0]);
  assert.equal(checkers.context.S.board[0][3], "R");
  assert.equal(checkers.context.S.chain, null, "crowning ends a capture turn in American checkers");
  assert.equal(checkers.context.S.turn, "b");
});

test("Checkers kings move backwards and quiet king moves count toward draws", () => {
  const checkers = createGame("checkers-game.js");
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[4][3] = "R";
  board[0][1] = "b";
  checkers.context.S = { board, turn: "r", chain: null, winner: null, quiet: 0 };

  const moves = checkers.game.legalMoves(checkers.context.S);
  assert.ok(moves.some((move) => move.to[0] === 5 && move.to[1] === 2));
  assert.ok(moves.some((move) => move.to[0] === 3 && move.to[1] === 2));

  checkers.context.S.quiet = 79;
  assert.equal(checkers.game.valid({ from: [4, 3], to: [3, 2] }), true);
  checkers.game.apply({ from: [4, 3], to: [3, 2] });
  assert.equal(checkers.context.S.winner, "draw");
});
