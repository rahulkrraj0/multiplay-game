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
  const scripts = discoverPlayoraGames(root).filter((file) => file !== "blackjack.js");
  const files = catalog.map((game) => game.file);
  const ids = catalog.map((game) => game.id);

  assert.deepEqual([...files].sort(), scripts);
  assert.ok(existsSync(join(root, "public", "playora", "games", "blackjack.js")),
    "the legacy standalone Blackjack script is not a registered Playora game");
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

test("Arrows removes a free arrow when its canvas is clicked", () => {
  let game;
  const listeners = {};
  const canvas = {
    style: {},
    get clientWidth() { return Number.parseInt(this.style.width, 10) || 0; },
    get clientHeight() { return Number.parseInt(this.style.height, 10) || 0; },
    getBoundingClientRect() {
      return { left: 100, top: 50, width: this.clientWidth, height: this.clientHeight };
    },
    getContext() {
      return {
        setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, save() {},
        translate() {}, moveTo() {}, lineTo() {}, stroke() {}, closePath() {}, restore() {},
      };
    },
    addEventListener(name, callback) { listeners[name] = callback; },
  };
  const elements = {
    ".ar-wrap": { clientWidth: 560, parentElement: { clientHeight: 800 } },
    ".ar-bar": { getBoundingClientRect: () => ({ height: 40 }) },
    ".ar-lv": { textContent: "" },
    ".ar-hearts": { textContent: "" },
    canvas,
    ".ar-ov": { classList: { add() {}, remove() {} } },
    ".ar-hint": { addEventListener() {} },
    ".ar-restart": { addEventListener() {} },
  };
  const root = {
    innerHTML: "",
    querySelector(selector) { return elements[selector]; },
  };
  const document = {
    getElementById() { return null; },
    createElement() { return {}; },
    head: { appendChild() {} },
  };
  const window = {
    devicePixelRatio: 2,
    innerHeight: 800,
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    removeEventListener() {},
  };
  const context = {
    console, Math, document, window, performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout, clearTimeout, registerGame(value) { game = value; },
  };
  vm.runInNewContext(
    readFileSync(new URL("../public/playora/games/arrows-game.js", import.meta.url), "utf8"),
    context,
  );
  const mounted = game.mount(root);
  const state = mounted.getState();
  const arrowIndex = game.freeArrows(state)[0];
  const [row, col] = state.arrows[arrowIndex].cells[0];
  const cell = canvas.clientWidth / state.cols;

  assert.equal(typeof listeners.click, "function", "the board should listen for click events");
  listeners.click({
    clientX: 100 + (col + 0.5) * cell,
    clientY: 50 + (row + 0.5) * cell,
  });

  assert.equal(mounted.getState().arrows[arrowIndex].alive, false);
  assert.equal(mounted.getState().lives, 3);
  mounted.dispose();
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

test("interactive cards in the new games keep their card dimensions in room UI", () => {
  const gameStyles = readFileSync(new URL("../src/playora/site.css", import.meta.url), "utf8");
  const cardGameFiles = ["bluff.js", "callbreak.js", "crazyeights.js", "hearts.js", "spades.js", "uno.js"];
  const cardGameSources = cardGameFiles.map((file) =>
    readFileSync(new URL(`../public/playora/games/${file}`, import.meta.url), "utf8"));
  const bluffSource = cardGameSources[0];
  const callBreakSource = cardGameSources[1];

  assert.match(gameStyles, /#room \.rbar\{position:sticky;top:0;z-index:16;/,
    "the room toolbar should stay above game content and floating media tiles");
  for (const [index, source] of cardGameSources.entries()) {
    if (cardGameFiles[index] === "uno.js") {
      assert.match(source, /#room \.uno \.card\{width:var\(--cw\);height:calc\(var\(--cw\)\*1\.5\)/,
        "uno.js should own its room card dimensions");
    } else {
      assert.match(source, /button\.card\{(?:--cw:var\(--w\);)?width:var\(--cw\);height:calc\(var\(--cw\)\*1\.45\)/,
        `${cardGameFiles[index]} should own its room card dimensions`);
    }
  }
  assert.match(bluffSource, /#room #bd \.bl-room \.hand button\.card:first-child,#room #bd \.bl-room \.hand button\.card:last-child,#room #bd \.bl-room \.hand button\.card\+button\.card\{margin-left:0;margin-right:0\}/,
    "Bluff cards should use the grid layout without overlap margins");
  for (const source of cardGameSources.slice(1, 5))
    assert.match(source, /#room #bd \.(?:cb|ce-room|hr|sp-room) .*?hand button\.card\+button\.card\{margin-left:calc\(var\(--w\)\*-.45\)\}/,
      "standard card hands should retain their intended overlap");
  assert.match(cardGameSources[3], /#room #bd \.hr \.hand\{display:flex;flex-wrap:wrap;justify-content:center;align-content:center;gap:4px 2px;overflow:hidden\}/,
    "Hearts cards should wrap into centered rows instead of requiring horizontal scrolling");
  assert.match(cardGameSources[3], /#room #bd \.hr \.hand button\.card:first-child,#room #bd \.hr \.hand button\.card:last-child,#room #bd \.hr \.hand button\.card\+button\.card\{margin:0\}/,
    "Hearts cards should not overlap when arranged in rows");
  assert.match(bluffSource, /#room #bd \.bl-room \.acts button\.btn\{width:auto;min-width:min\(220px,100%\);margin:0;padding:10px 24px\}/,
    "Bluff's single action button should be compact and centered like Poker's actions");
  assert.match(bluffSource, /\.hand\{display:grid;grid-template-columns:repeat\(30,minmax\(0,1fr\)\);grid-auto-rows:calc\(var\(--w\)\*\.95\)/,
    "Bluff cards should use the current responsive, wrapped grid instead of horizontal scrolling");
  assert.match(bluffSource, /\.hand \.card\{grid-column:span 2;width:var\(--w\);height:calc\(var\(--w\)\*1\.45\);justify-self:center;cursor:default\}/,
    "Bluff cards should keep readable card faces in the wrapped hand");
  assert.match(bluffSource, /\.hand \.card\.sel\{position:relative;z-index:5;transform:translateY\(calc\(var\(--w\)\*-.55\)\)/,
    "selected Bluff cards should rise above the overlapping hand");
  for (const source of cardGameSources.slice(0, 5)) {
    assert.match(source, /--w:clamp\(44px,min\(12\.2vw,15vh\),92px\)/,
      "the new card games should use the larger responsive card size");
  }
  assert.match(callBreakSource, /\.hand\{display:flex;overflow-x:auto;overflow-y:hidden;padding:20px 14px 12px;flex:none\}/,
    "Call Break should leave hand spacing to the shared room styles");
  assert.match(callBreakSource, /\.seat\{[^}]*min-height:84px\}/,
    "Call Break's top seat should reserve room for its card and player label");
  assert.match(callBreakSource, /\.bids\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);gap:6px\}\.bids \.btn\{box-sizing:border-box;width:100%;min-width:0;/,
    "Call Break's bid buttons should fit their columns on narrow screens");
  assert.match(callBreakSource, /#bd \.cb \.bids \.btn\{box-sizing:border-box;width:100%;min-width:0;padding:\.6em 0\}/,
    "the room button override should not force bid buttons beyond their columns");
  assert.match(callBreakSource, /@media\(max-width:520px\)\{#bd \.cb \.table\{padding-top:12px\}\}/,
    "Call Break should keep its top player's card clear of the mobile toolbar");
});

test("previously unlisted card games complete multiplayer bot matches", async (t) => {
  const games = ["bluff.js", "callbreak.js", "crazyeights.js", "hearts.js", "spades.js"];

  for (const file of games) {
    await t.test(file, () => {
      const { game, context } = createGame(file, {
        np: 4,
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

test("Crazy Eights keeps the turn actionable after an unplayable draw", () => {
  const { game, context } = createGame("crazyeights.js");
  const state = game.init();
  context.S = state;
  const player = state.players[0];
  const playable = { id: 100, s: "H", r: 8 };
  const oldCard = { id: 101, s: "S", r: 10 };
  const drawn = { id: 102, s: "H", r: 11 };
  state.turn = 0;
  state.t = 0;
  state.color = "D";
  state.disc = [{ id: 103, s: "D", r: 7 }];
  player.hand = [playable, oldCard, drawn];
  state.drawnId = drawn.id;
  state.stock = [{ id: 104, s: "C", r: 3 }, { id: 105, s: "C", r: 4 }];

  assert.equal(game.valid({ type: "draw", player: 0 }), true,
    "an unplayable draw should allow another draw, even when an older card is playable");
  assert.equal(game.valid({ type: "play", player: 0, cardId: playable.id, suit: "H" }), false,
    "only the latest drawn card may be played after drawing");
  assert.match(game.draw()[0], /That card cannot be played\. Draw again\./);
  assert.match(game.draw()[0], /class="pile ok"[^>]*data-m="draw"/);

  game.apply({ type: "draw", player: 0 });
  assert.equal(state.drawnId, 105);
  assert.equal(game.valid({ type: "draw", player: 0 }), true);
  assert.equal(game.valid({ type: "play", player: 0, cardId: playable.id, suit: "H" }), false);

  state.stock = [];
  state.disc = [{ id: 103, s: "D", r: 7 }];
  assert.equal(game.valid({ type: "pass", player: 0 }), true,
    "a player must be able to pass when there are no drawable cards");
  assert.match(game.draw()[0], /data-m="pass">Pass<\/button>/);
});

test("Crazy Eights lets the player play a drawn wild eight", () => {
  const { game, context } = createGame("crazyeights.js");
  const state = game.init();
  context.S = state;
  const eight = { id: 200, s: "H", r: 8 };
  state.turn = 0;
  state.t = 0;
  state.color = "D";
  state.disc = [{ id: 201, s: "D", r: 7 }];
  state.players[0].hand = [eight, { id: 202, s: "S", r: 10 }, { id: 203, s: "H", r: 11 }];
  state.drawnId = eight.id;

  assert.equal(game.valid({ type: "play", player: 0, cardId: eight.id, suit: "H" }), true);
  assert.match(game.draw()[0], new RegExp('data-m="card:' + eight.id + '"'));
  let roomRenders = 0;
  context.render = () => { roomRenders++; };
  game.click({ dataset: { m: "card:" + eight.id } });
  assert.equal(roomRenders, 1, "selecting a room wild should redraw the room suit picker");
  assert.match(game.draw()[0], /Choose a suit/);
  assert.match(game.draw()[0], /data-m="suit:H"/);
  game.click({ dataset: { m: "suit:H" } });
  assert.equal(context.lastAction.cardId, eight.id);
  assert.equal(game.valid(context.lastAction), true);
  game.apply(context.lastAction);
  assert.equal(state.color, "H");
  assert.equal(state.drawnId, null);
  assert.equal(state.t, 1);
});

test("Call Break lets a local player choose the total player count", () => {
  for (const count of [2, 3, 4]) {
    const { game, context } = createGame("callbreak.js", { localBot: true, np: 1 });
    const state = game.init();
    context.S = state;

    assert.equal(state.phase, "setup");
    assert.match(game.draw()[0], new RegExp('data-m="players:' + count + '"'));
    assert.equal(game.valid({ type: "players", player: 0, count }), true);
    game.apply({ type: "players", player: 0, count });

    assert.equal(state.phase, "bid");
    assert.equal(state.players.length, count);
    assert.equal(state.handSize, Math.floor(52 / count));
    assert.deepEqual(Array.from(state.players, (player) => player.bot),
      [false, ...Array(count - 1).fill(true)]);
    assert.ok(state.players.every((player) => player.hand.length === state.handSize));
  }
});

test("Spades lets a local player choose the total player count", () => {
  for (const count of [2, 3, 4]) {
    const { game, context } = createGame("spades.js", { localBot: true, np: 1 });
    const state = game.init();
    context.S = state;

    assert.equal(state.phase, "setup");
    const [setupHtml] = game.draw();
    assert.match(setupHtml, /How many players\?/);
    assert.match(setupHtml, /Choose 2 to 4 total players\. Computers fill the remaining seats\./);
    assert.match(setupHtml, new RegExp('data-m="players:' + count + '"'));
    assert.equal(game.valid({ type: "players", player: 0, count: 1 }), false);
    assert.equal(game.valid({ type: "players", player: 0, count }), true);
    game.apply({ type: "players", player: 0, count });

    assert.equal(state.phase, "bid");
    assert.equal(state.players.length, count);
    assert.equal(state.round, 1);
    assert.deepEqual(Array.from(state.players, (player) => player.bot),
      Array.from({ length: count }, (_, index) => index > 0));
    assert.equal(state.teams.length, count === 4 ? 2 : count);
    assert.equal(state.handSize, Math.floor(52 / count));
    assert.ok(state.players.every((player) => player.hand.length === state.handSize));
    assert.deepEqual(Array.from(state.players, (player) => player.name),
      ["Player 1", ...Array.from({ length: count - 1 }, (_, index) => "Computer " + (index + 1))]);
  }
});

test("Spades completes bot matches with each selected player count", () => {
  for (const count of [2, 3, 4]) {
    const { game, context } = createGame("spades.js", { localBot: true, np: 1 });
    const state = game.init();
    context.S = state;
    game.apply({ type: "players", player: 0, count });
    state.players.forEach((player) => { player.bot = true; });

    let actions = 0;
    while (!state.over && actions < 3000) {
      const action = game.bot();
      assert.ok(action, `a bot should act during ${state.phase} with ${count} players`);
      assert.equal(game.valid(action), true, `the bot action should be valid: ${JSON.stringify(action)}`);
      game.apply(action);
      actions++;
    }

    assert.equal(state.over, true, `${count}-player Spades should finish within ${actions} actions`);
    assert.equal(state.teams.length, count === 4 ? 2 : count);
  }
});

test("Crazy Eights renders the refreshed card faces, score chips, and felt table", () => {
  const { game, context, styles } = createGame("crazyeights.js", { np: 4, ids: ["host"], seat: 0 });
  context.S = game.init();
  const wildEight = { id: 1000, s: "H", r: 8 };
  context.S.players[0].hand[0] = wildEight;
  context.S.disc = [wildEight];
  context.S.color = wildEight.s;
  const [html] = game.draw();
  const style = styles.find((item) => item.id === "crazyeights-room-style");

  assert.ok(style, "room-specific Crazy Eights styles should be injected");
  assert.match(html, /class="pl on"/, "the current player should have a highlighted score chip");
  assert.match(html, /class="card[^"]*w8/, "wild eights should receive their highlighted card face");
  assert.match(html, /class="ix[^"]*"/, "cards should show corner rank and suit indices");
  assert.match(html, /class="pp"/, "number cards should render suit pips");
  assert.match(html, /<svg viewBox="0 0 24 24"/, "suits should use consistent vector artwork");
  assert.match(style.textContent, /#0d4651/, "the table should use the supplied felt palette");
  assert.match(style.textContent, /--brass:#e9b949/, "turn highlights should use the brass accent");
  assert.match(style.textContent, /card-land/, "card movement animation should remain available");
  assert.match(style.textContent, /prefers-reduced-motion:reduce/,
    "animations should respect reduced-motion preferences");
});

test("playing-card games share the Crazy Eights face treatment, excluding UNO", () => {
  const files = [
    "blackjack.js", "bluff.js", "callbreak.js", "crazyeights.js", "hearts.js",
    "joker-duel.js", "poker-game.js", "rummy.js", "spades.js", "teenpatti.js",
  ];
  for (const file of files) {
    const source = readFileSync(join(projectRoot, "public", "playora", "games", file), "utf8");
    assert.match(source, /class="pp"/, `${file} renders pip-based number cards`);
    assert.match(source, /class="ct"/, `${file} renders illustrated court cards`);
    assert.match(source, /<svg viewBox="0 0 24 24"/, `${file} uses the shared SVG suit artwork`);
    assert.match(source, /linear-gradient\(158deg/, `${file} keeps the shared ivory card face`);
  }
});

test("Call Break completes bot matches with each selectable seat count", () => {
  for (const count of [2, 3, 4]) {
    const { game, context } = createGame("callbreak.js", { localBot: true, np: 1 });
    const state = game.init();
    context.S = state;
    game.apply({ type: "players", player: 0, count });
    state.players.forEach((player) => { player.bot = true; });

    let actions = 0;
    while (!state.over && actions < 2000) {
      const action = game.bot();
      assert.ok(action, `bot should act during ${state.phase} with ${count} players`);
      assert.equal(game.valid(action), true, `bot action should be valid: ${JSON.stringify(action)}`);
      game.apply(action);
      actions++;
    }

    assert.equal(state.over, true, `${count}-player bot match should finish`);
    assert.ok(actions < 2000);
  }
});

test("Call Break keeps the local player's hand visible while bots play", () => {
  const { game, context } = createGame("callbreak.js", { localBot: true, np: 1 });
  const state = game.init();
  context.S = state;
  game.apply({ type: "players", player: 0, count: 4 });
  const handSize = state.players[0].hand.length;

  assert.equal(handSize, 13);
  game.apply({ type: "bid", player: 0, value: 3 });
  let actions = 0;
  while ((state.phase !== "play" || state.t !== 0 || state.collect) && actions < 20) {
    const botAction = game.bot();
    assert.ok(botAction, `a bot should act during ${state.phase}`);
    game.apply(botAction);
    actions++;
  }
  assert.equal(state.t, 0, "play should return to the local player after bidding");
  const card = game._t.legal(state.players[0].hand, state.trick)[0];
  assert.ok(card);
  game.apply({ type: "play", player: 0, cardId: card.id });
  assert.equal(state.players[0].hand.length, handSize - 1);

  const [html] = game.draw();
  assert.match(html, /<div class="hand">/,
    "Call Break should render the hand during the bot's turn");
  assert.equal((html.match(/class="card/g) || []).length,
    state.players[0].hand.length + state.trick.length + state.players.length - 1,
    "the remaining hand, table cards, and opponents' card counts should stay visible");
});

test("local card games keep the human hand visible during bot turns", () => {
  const games = ["bluff.js", "callbreak.js", "crazyeights.js", "hearts.js", "spades.js"];

  for (const file of games) {
    const { game, context } = createGame(file, { localBot: true, np: 1 });
    const state = game.init();
    context.S = state;
    if ((file === "bluff.js" || file === "callbreak.js" || file === "spades.js") && state.phase === "setup") {
      game.apply({ type: "players", player: 0, count: 4 });
    }
    state.t = 1;
    if ("turn" in state) state.turn = 1;
    if ("phase" in state && file !== "hearts.js") state.phase = "play";
    if (file === "hearts.js") state.phase = "play";

    const [html] = game.draw();
    const accessibleCards = (html.match(/aria-label="/g) || []).length;
    assert.ok(accessibleCards >= state.players[0].hand.length,
      `${file} should continue rendering the local player's hand while a bot is active`);
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
  uno.context.S.turn = 0;
  uno.context.S.t = 0;
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
  uno.context.S.turn = 0;
  uno.context.S.t = 0;
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
  checkers.context.S = checkers.game.init();
  checkers.game.draw();
  assert.match(checkers.styles[0].textContent, /\.ck-pc\{[^}]*box-sizing:border-box/);
  assert.match(checkers.styles[0].textContent, /@keyframes ck-crown\{0%\{transform:scale\(\.82\) rotate\(-8deg\)\}65%\{transform:scale\(1\.04\) rotate\(4deg\)\}/);
  assert.match(checkers.styles[0].textContent, /grid-template-columns:repeat\(8,minmax\(0,1fr\)\);grid-template-rows:repeat\(8,minmax\(0,1fr\)\)/);
  assert.match(checkers.styles[0].textContent, /\.ck-sq,#room \.ck-board \.ck-sq\{box-sizing:border-box;[^}]*min-width:0;min-height:0/);
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

test("Checkers places turn status beside the board on wide screens and below on mobile", () => {
  const checkers = createGame("checkers-game.js");
  checkers.context.S = checkers.game.init();
  const [html] = checkers.game.draw();

  assert.ok(html.indexOf('class="ck-board"') < html.indexOf('class="ck-status"'),
    "the status follows the board in document order for mobile layouts");
  assert.match(checkers.styles[0].textContent, /\.ck-play-layout\{display:flex;flex-direction:column/);
  assert.match(checkers.styles[0].textContent, /@media\(min-width:900px\)\{[\s\S]*?\.ck-play-layout\{flex:1;display:grid;grid-template-columns:minmax\(0,760px\) minmax\(140px,1fr\)/);
  assert.match(checkers.styles[0].textContent, /\.ck-status\{order:1;text-align:center/);
  assert.match(checkers.styles[0].textContent, /\.ck-status\{order:0;text-align:left/);
});

test("Checkers board and status are vertically centered on mobile", () => {
  const checkers = createGame("checkers-game.js");
  checkers.context.S = checkers.game.init();
  checkers.game.draw();

  assert.match(checkers.styles[0].textContent, /@media\(max-width:899px\)\{\.ck-wrap\{box-sizing:border-box;min-height:calc\(100vh - 68px\);display:flex;flex-direction:column\}\.ck-play-layout\{flex:1;justify-content:center\}\.ck-board\{align-self:center\}\}/);
  assert.match(checkers.styles[0].textContent, /@supports\(height:100dvh\)\{@media\(max-width:899px\)\{\.ck-wrap\{min-height:calc\(100dvh - 68px - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\)\)\}\}\}/);
});

test("Checkers board height stays within the visible viewport on wide screens", () => {
  const checkers = createGame("checkers-game.js");
  checkers.context.S = checkers.game.init();
  checkers.game.draw();

  assert.match(checkers.styles[0].textContent, /@media\(min-width:900px\)\{\s*\.ck-wrap\{box-sizing:border-box;min-height:calc\(100vh - 68px\);display:flex;flex-direction:column\}/);
  assert.match(checkers.styles[0].textContent, /\.ck-play-layout\{flex:1;display:grid;grid-template-columns:minmax\(0,760px\) minmax\(140px,1fr\);align-items:center/);
  assert.match(checkers.styles[0].textContent, /\.ck-board\{width:min\(100%,760px,calc\(100vh - 100px\)\)\}/);
  assert.match(checkers.styles[0].textContent, /@supports\(height:100dvh\)\{@media\(min-width:900px\)\{\.ck-wrap\{min-height:calc\(100dvh - 68px\)\}\.ck-board\{width:min\(100%,760px,calc\(100dvh - 100px\)\)\}\}\}/);
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
