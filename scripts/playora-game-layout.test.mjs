import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const engineSource = readFileSync(fileURLToPath(new URL("../public/playora/core/engine.js", import.meta.url)), "utf8");
const networkSource = readFileSync(fileURLToPath(new URL("../public/playora/core/net.js", import.meta.url)), "utf8");
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

test("both rejoin state paths synchronize the restored game's layout", () => {
  assert.equal((networkSource.match(/syncGameLayout\(G\.id\)/g) || []).length, 2);
});
