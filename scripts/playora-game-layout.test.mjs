import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const engineSource = readFileSync(fileURLToPath(new URL("../public/playora/core/engine.js", import.meta.url)), "utf8");
const networkSource = readFileSync(fileURLToPath(new URL("../public/playora/core/net.js", import.meta.url)), "utf8");
const bluffSource = readFileSync(fileURLToPath(new URL("../public/playora/games/bluff.js", import.meta.url)), "utf8");
const callBreakSource = readFileSync(fileURLToPath(new URL("../public/playora/games/callbreak.js", import.meta.url)), "utf8");
const crazyEightsSource = readFileSync(fileURLToPath(new URL("../public/playora/games/crazyeights.js", import.meta.url)), "utf8");
const heartsSource = readFileSync(fileURLToPath(new URL("../public/playora/games/hearts.js", import.meta.url)), "utf8");
const spadesSource = readFileSync(fileURLToPath(new URL("../public/playora/games/spades.js", import.meta.url)), "utf8");
const unoSource = readFileSync(fileURLToPath(new URL("../public/playora/games/uno.js", import.meta.url)), "utf8");
const markup = readFileSync(fileURLToPath(new URL("../src/playora/markup.html", import.meta.url)), "utf8");
const gameStyles = readFileSync(fileURLToPath(new URL("../src/playora/game.css", import.meta.url)), "utf8");

test("the host game picker can collapse while showing the selected game", () => {
  assert.match(markup, /<details id="gamePicker" open><summary>Choose a game <span id="gameSelection"><\/span><svg class="game-picker-arrow"/);
  assert.match(markup, /class="game-picker-arrow" viewBox="0 0 16 16"/);
  assert.match(gameStyles, /#room #hostControls #gamePicker\[open\] \.game-picker-arrow/);
  assert.match(networkSource, /\$\('gameSelection'\)\.textContent=GAMES\[pick\]\?\.t\|\|'Select a game'/);
  assert.doesNotMatch(gameStyles, /#room #hostControls #gamePicker\{[^}]*display:grid/);
});

test("guests see available games without controls to change the host selection", () => {
  assert.match(markup, /id="hostControls" class="hide"/);
  assert.match(markup, /id="guestGameChoices" class="hide"/);
  assert.match(gameStyles, /#room #hostControls\.hide\{display:none!important\}/);
  assert.match(networkSource, /\$\('guestGameChoices'\)\.classList\.toggle\('hide',host\)/);
  assert.match(networkSource, /renderLobbyGameCards\(\$\('guestLobbyGames'\),false\)/);
});

test("the game board stays hidden until the room enters active-game mode", () => {
  assert.match(gameStyles, /#room:not\(\.game-active\) #gm\{display:none!important\}/);
});

test("the game board contains full-screen games below the room toolbar", () => {
  assert.match(
    gameStyles,
    /#room\.game-active:not\(\.ludo-game\) #bd\{position:relative;min-height:calc\(100dvh - 68px - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\)\)\}/,
  );
});

test("Spades table cards render above overlapping game messages", () => {
  assert.match(spadesSource, /'\.table\{position:relative;z-index:1;flex:1;min-height:0;/);
});

test("Spades hand cards scale down on narrow and short mobile viewports", () => {
  assert.match(gameStyles, /@media\(max-width:520px\)\{#room #bd \.sp-room \.sp\{--w:clamp\(32px,11vw,44px\)\}\}/);
  assert.match(gameStyles, /@media\(max-height:520px\)\{#room #bd \.sp-room \.sp\{--w:clamp\(32px,13vh,56px\)\}\}/);
});

test("Spades hides duplicate engine status outside the game board", () => {
  assert.match(gameStyles, /#room\.spades-game #lg,#room\.spades-game #st\{display:none!important\}/);
  assert.match(engineSource, /classList\.toggle\('spades-game',game==='spades'\)/);
});

test("games hide duplicate bottom status except Chess and Ludo", () => {
  assert.match(gameStyles, /#room\.game-active:not\(\.ludo-game\):not\(\.chess-game\) #lg,#room\.game-active:not\(\.ludo-game\):not\(\.chess-game\) #st\{display:none!important\}/);
  assert.match(engineSource, /classList\.toggle\('chess-game',game==='chess'\)/);
});

test("card-game status follows each hand with five-percent bottom spacing", () => {
  const games = [
    { root: ".bl-room .bl", hand: ".bl-room .hand", msg: ".bl-room .msg", action: ".bl-room .acts" },
    { root: ".cb", hand: ".cb .hand", msg: ".cb .msg", action: ".cb .room-action" },
    { root: ".ce-room .ce", hand: ".ce-room .hand", msg: ".ce-room .msg", action: ".ce-room .acts" },
    { root: ".hr", hand: ".hr .hand", msg: ".hr .msg", action: ".hr .acts" },
    { root: ".sp-room .sp", hand: ".sp-room .hand", msg: ".sp-room .msg", action: ".sp-room .acts" },
    { root: ".uno", hand: ".uno .hand", msg: ".uno .msg", action: ".uno .acts" },
  ];
  const roots = games.map((game) => `#room #bd ${game.root}`);
  assert.ok(gameStyles.includes(roots.join(",") +
    "{box-sizing:border-box;padding-bottom:calc(5vh + env(safe-area-inset-bottom,0px))}"));
  assert.ok(gameStyles.includes(games.map((game) => `#room #bd ${game.action}`).join(",") + "{order:1}"));
  assert.ok(gameStyles.includes(games.map((game) => `#room #bd ${game.hand}`).join(",") + "{order:2}"));
  assert.ok(gameStyles.includes(games.map((game) => `#room #bd ${game.msg}`).join(",") +
    "{order:3;margin-top:8px}"));
});

test("Spades unplayable cards stay legible while remaining visually muted", () => {
  assert.match(spadesSource, /'\.hand \.card\.no\{filter:brightness\(\.82\)\}'/);
});

test("Spades bid choices stay within the bid panel on narrow screens", () => {
  assert.match(spadesSource, /'\.bidbox\{[^']*width:min\(90vw,340px\);max-width:calc\(100% - 16px\);/);
  assert.match(spadesSource, /'\.bidbox p\{[^']*\.bids\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);gap:6px;min-width:0\}\.bids \.btn\{width:100%;min-width:0;box-sizing:border-box;padding:\.6em 0\}'/);
});

test("Spades mobile status text sits below the cards with bottom spacing", () => {
  assert.match(gameStyles, /@media\(max-width:600px\)\{\s*#room #bd \.sp-room \.sp\{box-sizing:border-box;padding-bottom:calc\(18px \+ env\(safe-area-inset-bottom,0px\)\)\}\s*#room #bd \.sp-room \.msg\{padding-bottom:calc\(12px \+ env\(safe-area-inset-bottom,0px\)\)\}\s*\}/);
});

test("Crazy Eights mobile text follows cards with five-percent bottom spacing", () => {
  assert.match(gameStyles, /@media\(max-width:600px\)\{\s*#room #bd \.ce-room \.ce\{box-sizing:border-box;padding-bottom:5vh\}\s*#room #bd \.ce-room \.acts\{margin-top:4px\}\s*#room #bd \.ce-room \.hand\{grid-template-columns:repeat\(16,minmax\(0,1fr\)\)\}\s*#room #bd \.ce-room \.hand button\.card\{grid-column:span 2\}\s*#room #bd \.ce-room \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\)\}\s*\}/);
});

test("Crazy Eights mobile card spread centers the incomplete row", () => {
  const helper = crazyEightsSource.match(/function handGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "Crazy Eights exposes mobile card row positioning");
  const position = vm.runInNewContext("(" + helper + ")");
  assert.equal(position(0, 7), 'style="--hand-row:1;--hand-column:2"');
  assert.equal(position(8, 13), 'style="--hand-row:2;--hand-column:4"');
  assert.equal(position(12, 13), 'style="--hand-row:2;--hand-column:12"');
  assert.match(crazyEightsSource, /@media\(max-width:600px\)\{\.hand\{grid-template-columns:repeat\(16,minmax\(0,1fr\)\)\}\.hand \.card\{grid-column:span 2\}\.hand \.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\)\}\}/);
  assert.match(gameStyles, /#room #bd \.ce-room \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\)\}/);
});

test("Call Break mobile status follows the hand with five-percent bottom spacing", () => {
  assert.match(gameStyles, /@media\(max-width:600px\)\{\s*#room #bd \.cb\{box-sizing:border-box;padding-bottom:5vh\}\s*#room #bd \.cb \.hand\{grid-template-columns:repeat\(16,minmax\(0,1fr\)\)\}\s*#room #bd \.cb \.hand button\.card\{grid-column:span 2\}\s*#room #bd \.cb \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2;translate:calc\(var\(--w\)\*\.3\) 0\}\s*\}/);
});

test("Call Break mobile hand centers its final row", () => {
  const helper = callBreakSource.match(/function handGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "Call Break exposes mobile card row positioning");
  const position = vm.runInNewContext("(" + helper + ")");
  assert.equal(position(0, 5), 'style="--hand-row:1;--hand-column:4"');
  assert.equal(position(8, 13), 'style="--hand-row:2;--hand-column:4"');
  assert.equal(position(12, 13), 'style="--hand-row:2;--hand-column:12"');
  assert.match(callBreakSource, /@media\(max-width:600px\)\{\.hand\{display:grid;grid-template-columns:repeat\(16,minmax\(0,1fr\)\);grid-auto-rows:calc\(var\(--w\)\*\.95\);align-content:center;justify-items:center;gap:0;overflow:visible\}\.hand \.card\{grid-column:span 2;margin:0\}\.hand \.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2;translate:calc\(var\(--w\)\*\.3\) 0\}/);
  assert.match(gameStyles, /#room #bd \.cb \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2;translate:calc\(var\(--w\)\*\.3\) 0\}/);
});

test("Hearts and Spades mobile hands center the incomplete row", () => {
  for (const source of [heartsSource, spadesSource]) {
    const helper = source.match(/function roomHandGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
    assert.ok(helper, "the game exposes mobile card row positioning");
    const position = vm.runInNewContext("(" + helper + ")");
    assert.equal(position(8, 13), 'style="--hand-row:2;--hand-column:4"');
    assert.equal(position(12, 13), 'style="--hand-row:2;--hand-column:12"');
  }
  assert.match(gameStyles, /#room #bd \.hr \.hand,#room #bd \.sp-room \.hand\{grid-template-columns:repeat\(16,minmax\(0,1fr\)\)\}/);
  assert.match(gameStyles, /#room #bd \.hr \.hand button\.card\[style\*="--hand-row"\],#room #bd \.sp-room \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2\}/);
});

test("Bluff selected cards lift above neighboring cards", () => {
  assert.match(bluffSource, /'\.hand\{[^']*grid-template-columns:repeat\(30,minmax\(0,1fr\)\);grid-auto-rows:calc\(var\(--w\)\*\.95\)/);
  assert.match(bluffSource, /\.hand \.card\{grid-column:span 2;width:var\(--w\);height:calc\(var\(--w\)\*1\.45\);justify-self:center;cursor:default\}/);
  assert.match(bluffSource, /\.hand \.card\.sel\{position:relative;z-index:5;transform:translateY\(calc\(var\(--w\)\*-.55\)\);/);
  assert.match(gameStyles, /#room #bd \.bl-room \.hand\{max-width:1160px;margin-left:auto;margin-right:auto;grid-auto-rows:calc\(var\(--w\)\*\.95\);row-gap:0;overflow:visible;padding-bottom:calc\(10px \+ var\(--w\)\*\.5\)\}/);
});

test("Selectable cards stay above overlapping neighbors in every card game", () => {
  for (const [source, selector] of [
    [callBreakSource, /\.hand \.card\.ok\{position:relative;z-index:2;transform:translateY\(-14px\)/],
    [crazyEightsSource, /\.hand \.card\.ok\{position:relative;z-index:2;transform:translateY\(-14px\)/],
    [spadesSource, /\.hand \.card\.ok\{position:relative;z-index:2;transform:translateY\(-14px\)/],
    [unoSource, /\.uno \.hand \.card\.ok\{position:relative;z-index:2;transform:translateY\(-14px\)/],
  ]) {
    assert.match(source, selector);
  }
  assert.match(heartsSource, /\.hand \.card\.ok:not\(\.sel\)\{position:relative;z-index:2;transform:translateY\(-8px\)\}\.hand \.card\.sel\{position:relative;z-index:5;transform:translateY\(-20px\)/);
});

test("selected hand cards stack above later overlapping cards in every view", () => {
  const helper = engineSource.match(/function stackHandCards\(root\)(\{[^\n]+\})/)?.[1];
  assert.ok(helper, "the engine exposes shared hand-card stacking");
  const stackHandCards = vm.runInNewContext("(function(root)" + helper + ")");
  const cards = [
    { dataset: { selectedOrder: "0" }, style: {}, classList: { contains: name => name === "sel" } },
    { dataset: {}, style: {}, classList: { contains: name => name === "ok" } },
    { dataset: { selectedOrder: "1" }, style: {}, classList: { contains: name => name === "sel" } },
  ];
  const hand = { querySelectorAll: () => cards };
  stackHandCards({ querySelectorAll: () => [hand] });
  assert.deepEqual(cards.map(card => card.style.zIndex), ["100000", "10001", "100001"]);
  assert.match(engineSource, /\$\(\'bd\'\)\.innerHTML=h;stackHandCards\(\$\(\'bd\'\)\)/);
  for (const source of [bluffSource, callBreakSource, crazyEightsSource, heartsSource, spadesSource, unoSource]) {
    assert.match(source, /global\.playoraStackHandCards\(root\)/);
  }
  assert.match(bluffSource, /data-selected-order="' \+ selectedOrder \+ '"/);
  assert.match(heartsSource, /data-selected-order="' \+ selectedOrder \+ '"/);
});

test("offline Bluff asks in-game for 2, 3, or 4 total players", () => {
  assert.doesNotMatch(markup, /bluffPlayerCount|data-bluff-players/);
  assert.match(engineSource, /\$\('ml'\)\.onclick=\(\)=>begin\(pick,pick==='bluff'\?4:2,null,true\)/);
  assert.match(bluffSource, /how many players\?/);
  assert.match(bluffSource, /data-m="players:' \+ count \+ '"/);
  assert.match(bluffSource, /\.setup-panel\{display:grid;flex:1 1 auto;align-content:center;justify-items:center;gap:\.8rem;padding:\.5rem\}/);
  assert.match(bluffSource, /\.setup-choice\{display:grid;width:4\.2rem;justify-items:center;padding:\.6rem \.4rem;border:2px solid rgba\(255,255,255,\.35\);border-radius:1rem;background:rgba\(0,0,0,\.3\)/);

  for (const count of [2, 3, 4]) {
    let game;
    const context = {
      np: count,
      ids: [],
      localBot: true,
      S: null,
      registerGame(value) { game = value; },
    };
    vm.runInNewContext(bluffSource, context);

    const state = game.init();
    assert.equal(state.phase, "setup");
    assert.equal(game.valid({ type: "players", player: 0, count }), true);
    game.apply({ type: "players", player: 0, count });
    assert.equal(state.players.length, count);
    assert.deepEqual(Array.from(state.players, (player) => player.bot), [false, ...Array(count - 1).fill(true)]);
    assert.deepEqual(Array.from(state.players, (player) => player.name), [
      "Player 1",
      ...Array.from({ length: count - 1 }, (_, index) => `Computer (Bot ${index + 1})`),
    ]);
    const handSizes = Array.from(state.players, (player) => player.hand.length);
    assert.equal(handSizes.reduce((sum, size) => sum + size, 0), 52);
    assert.ok(Math.max(...handSizes) - Math.min(...handSizes) <= 1);
  }
});

test("Bluff centers each desktop and mobile row while increasing overlap", () => {
  const helper = bluffSource.match(/function handGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "Bluff exposes desktop and mobile card row positioning");
  const position = vm.runInNewContext("(" + helper + ")");
  assert.equal(position(0, 13), 'style="--hand-row:1;--hand-column:3;--mobile-row:1;--mobile-column:3"');
  assert.equal(position(8, 13), 'style="--hand-row:1;--hand-column:19;--mobile-row:2;--mobile-column:6"');
  assert.equal(position(12, 13), 'style="--hand-row:1;--hand-column:27;--mobile-row:2;--mobile-column:14"');
  assert.match(gameStyles, /@media\(max-width:600px\)\{#room #bd \.bl-room \.bl\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)\}#room #bd \.bl-room \.bl \.setup-choice\{width:3\.6rem;font-size:1\.35rem\}#room #bd \.bl-room \.hand\{grid-template-columns:repeat\(20,minmax\(0,1fr\)\);grid-template-rows:none;grid-auto-rows:calc\(var\(--w\)\*\.95\)\}#room #bd \.bl-room \.hand button\.card\{grid-column:span 2\}#room #bd \.bl-room \.hand button\.card\[style\*="--mobile-row"\]\{grid-row:var\(--mobile-row\);grid-column:var\(--mobile-column\) \/ span 2\}\}/);
});

test("Bluff mobile cards stay above status and actions with five-percent bottom spacing", () => {
  assert.match(bluffSource, /@media\(max-width:600px\)\{\.bl\{[^}]*padding-bottom:5vh\}/);
  assert.match(gameStyles, /@media\(max-width:600px\)\{\s*#room #bd \.bl-room \.bl\{box-sizing:border-box;padding-bottom:5vh\}\s*\}/);
});

test("Bluff cards overlap on narrow mobile and wide desktop viewports", () => {
  assert.match(gameStyles, /@media\(max-width:1250px\)\{#room #bd \.bl-room \.bl\{--w:clamp\(36px,min\(8vw,calc\(\(100vw - 56px\)\/11\)\),92px\)\}\}/);
  assert.match(gameStyles, /@media\(max-width:600px\)\{#room #bd \.bl-room \.bl\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)\}#room #bd \.bl-room \.bl \.setup-choice\{width:3\.6rem;font-size:1\.35rem\}#room #bd \.bl-room \.hand\{grid-template-columns:repeat\(20,minmax\(0,1fr\)\);grid-template-rows:none;grid-auto-rows:calc\(var\(--w\)\*\.95\)\}/);
});

test("Call Break, Crazy Eights, Hearts, and Spades use larger eight-column mobile hands", () => {
  const gameClasses = [
    [callBreakSource, "#room #bd .cb"],
    [crazyEightsSource, "#room #bd .ce-room .ce"],
    [heartsSource, "#room #bd .hr"],
    [spadesSource, "#room #bd .sp-room .sp"],
  ];
  for (const [source, selector] of gameClasses) {
    assert.match(source, /'\.hand\{display:flex;overflow-x:auto;overflow-y:hidden/);
    assert.ok(gameStyles.includes(selector), `${selector} gets the mobile card-size override`);
  }
  assert.match(gameStyles, /@media\(max-width:600px\)\{\s*#room #bd \.cb,#room #bd \.ce-room \.ce,#room #bd \.hr,#room #bd \.sp-room \.sp\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)\}/);
  assert.match(gameStyles, /#room #bd \.cb \.hand,#room #bd \.ce-room \.hand,#room #bd \.hr \.hand,#room #bd \.sp-room \.hand\{display:grid;grid-template-columns:repeat\(8,minmax\(0,1fr\)\);grid-template-rows:none;grid-auto-rows:calc\(var\(--w\)\*\.95\)/);
});

test("Bluff claim and pile are arranged side by side", () => {
  assert.match(bluffSource, /'\.table\{[^']*grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\);/);
  assert.match(bluffSource, /'\.mid\{[^']*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);grid-template-areas:"need pile" "claim pile" "rev rev";/);
  assert.match(bluffSource, /'\.need\{grid-area:need\}\.pilebox\{grid-area:pile;justify-self:center\}\.claim\{grid-area:claim\}/);
});

test("Bluff claim label and rank are inline on mobile", () => {
  assert.match(bluffSource, /@media\(max-width:600px\)\{[^']*\.mid\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"need" "pile" "claim" "rev"\}\.need\{display:flex;align-items:center;justify-content:center;gap:4px\}\.need b\{display:inline-block;margin:0;font-size:calc\(var\(--w\)\*\.55\)\}\}/);
});

test("Bluff call and pass buttons fit within the mobile action row", () => {
  assert.match(gameStyles, /@media\(max-width:600px\)\{#room #bd \.bl-room \.acts\{gap:6px;padding:0 8px\}#room #bd \.bl-room \.acts button\.btn\{width:auto;min-width:0;max-width:100%;flex:1 1 0;margin:0;padding:10px 6px;font-size:clamp\(12px,3\.5vw,14px\);white-space:normal\}\}/);
});

test("entering a game resets the room scroll position", () => {
  const showAssignment = engineSource.match(/show=id=>\{[^\n]+\}/)?.[0];
  assert.ok(showAssignment, "the engine exposes its shared screen transition helper");

  const roomClasses = new Set();
  const screens = new Map();
  const room = {
    scrollTop: 480,
    classList: {
      toggle(name, enabled) {
        if (enabled) roomClasses.add(name);
        else roomClasses.delete(name);
      },
    },
  };
  const context = {
    $: (id) => {
      if (id === "room") return room;
      if (!screens.has(id)) screens.set(id, new Set());
      const classes = screens.get(id);
      return {
        classList: {
          toggle(name, enabled) {
            if (enabled) classes.add(name);
            else classes.delete(name);
          },
        },
      };
    },
  };

  vm.runInNewContext(`const SC=["mode","net","lobby","gm"]; const ${showAssignment}; show("gm");`, context);

  assert.equal(room.scrollTop, 0);
  assert.ok(roomClasses.has("game-active"));
});

test("restored Ludo and Snakes and Ladders states apply their own dice layout", () => {
  const helper = engineSource.match(/function syncGameLayout\(game\)\{[^\n]+\}/)?.[0];
  assert.ok(helper, "the engine exposes its shared game layout synchronizer");

  const classes = new Set(["hide"]);
  const roomClasses = new Set();
  const room = {
    classList: {
      toggle(name, enabled) {
        if (enabled) roomClasses.add(name);
        else roomClasses.delete(name);
      },
    },
  };
  const dice = {
    textContent: "",
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
  };
  const context = {
    S: { die: 5 },
    $: (id) => id === "room" ? room : dice,
  };
  vm.runInNewContext(helper, context);

  context.syncGameLayout("ludo");
  assert.ok(roomClasses.has("ludo-game"), "restore Ludo-specific room styling");
  assert.ok(!classes.has("hide"), "show the shared Ludo die");
  assert.equal(dice.textContent, 5, "restore the current Ludo roll");

  context.syncGameLayout("snl");
  assert.ok(!roomClasses.has("ludo-game"), "do not apply Ludo styling to Snakes and Ladders");
  assert.ok(classes.has("hide"), "hide the shared die used only by Ludo");
});

test("all rejoin state paths synchronize the restored game's layout", () => {
  assert.equal((networkSource.match(/syncGameLayout\(G\.id\)/g) || []).length, 3);
});
