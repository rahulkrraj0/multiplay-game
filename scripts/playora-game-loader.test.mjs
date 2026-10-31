import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const loaderScript = fileURLToPath(new URL("../public/playora/core/game-loader.js", import.meta.url));

test("lazy game loading starts the game script and its sounds together", async () => {
  let register;
  let resolveScript;
  let resolveSounds;
  const scriptPromise = new Promise((resolve) => { resolveScript = resolve; });
  const soundPromise = new Promise((resolve) => { resolveSounds = resolve; });
  const calls = [];
  const game = { id: "chess", catalogOnly: false };
  const GAMES = {};
  const window = {
    PLAYORA_GAME_CATALOG: [{ id: "chess", file: "chess.js" }],
    PLAYORA_LOAD_SCRIPT(file) {
      calls.push(["script", file]);
      return scriptPromise.then(() => register(game));
    },
    playoraSound: {
      preloadGame(id) {
        calls.push(["sounds", id]);
        return soundPromise;
      },
    },
  };
  const context = {
    window,
    GAMES,
    registerGame(value) { GAMES[value.id] = value; },
  };
  register = (value) => { GAMES[value.id] = value; };
  vm.runInNewContext(readFileSync(loaderScript, "utf8"), context);

  const loading = window.ensurePlayoraGame("chess");
  assert.deepEqual(calls, [["script", "chess.js"], ["sounds", "chess"]]);

  resolveScript();
  await Promise.resolve();
  let completed = false;
  loading.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false, "wait for related sound assets along with the game script");

  resolveSounds();
  assert.equal(await loading, game);
});
