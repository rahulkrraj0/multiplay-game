import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const engineSource = readFileSync(fileURLToPath(new URL("../public/playora/core/engine.js", import.meta.url)), "utf8");
const networkSource = readFileSync(fileURLToPath(new URL("../public/playora/core/net.js", import.meta.url)), "utf8");

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
