import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const engineSource = readFileSync(fileURLToPath(new URL("../public/playora/core/engine.js", import.meta.url)), "utf8");
const networkSource = readFileSync(fileURLToPath(new URL("../public/playora/core/net.js", import.meta.url)), "utf8");
const bluffSource = readFileSync(fileURLToPath(new URL("../public/playora/games/bluff.js", import.meta.url)), "utf8");
const spadesSource = readFileSync(fileURLToPath(new URL("../public/playora/games/spades.js", import.meta.url)), "utf8");
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

test("Spades unplayable cards stay legible while remaining visually muted", () => {
  assert.match(spadesSource, /'\.hand \.card\.no\{filter:brightness\(\.82\)\}'/);
});

test("Bluff cards overlap vertically at all screen sizes", () => {
  assert.match(gameStyles, /#room #bd \.bl-room \.hand\{grid-template-rows:repeat\(2,calc\(var\(--w\)\*1\.05\)\)\}/);
});

test("Bluff claim and pile are arranged side by side", () => {
  assert.match(bluffSource, /'\.table\{[^']*grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\);/);
  assert.match(bluffSource, /'\.mid\{[^']*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);grid-template-areas:"need pile" "claim pile" "rev rev";/);
  assert.match(bluffSource, /'\.need\{grid-area:need\}\.pilebox\{grid-area:pile;justify-self:center\}\.claim\{grid-area:claim\}/);
});

test("Bluff claim label and rank are inline on mobile", () => {
  assert.match(bluffSource, /@media\(max-width:600px\)\{\.mid\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"need" "pile" "claim" "rev"\}\.need\{display:flex;align-items:center;justify-content:center;gap:4px\}\.need b\{display:inline-block;margin:0;font-size:calc\(var\(--w\)\*\.55\)\}\}/);
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
