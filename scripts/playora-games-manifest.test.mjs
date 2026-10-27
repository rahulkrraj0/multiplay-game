import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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
