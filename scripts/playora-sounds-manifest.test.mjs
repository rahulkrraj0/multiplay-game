import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPlayoraSoundsManifest, discoverPlayoraSounds } from "./playora-sounds-manifest.mjs";

test("discovers supported audio files across game and shared sound folders", () => {
  const root = mkdtempSync(join(tmpdir(), "playora-sounds-"));
  const sounds = join(root, "public", "playora", "sounds");
  mkdirSync(join(sounds, "chess"), { recursive: true });
  mkdirSync(join(sounds, "shared"));
  mkdirSync(join(sounds, "notes.txt"));
  writeFileSync(join(sounds, "chess", "move.ogg"), "");
  writeFileSync(join(sounds, "chess", "capture.mp3"), "");
  writeFileSync(join(sounds, "chess", "SOUND-LIST.txt"), "");
  writeFileSync(join(sounds, "shared", "win.wav"), "");
  writeFileSync(join(sounds, "shared", ".hidden.ogg"), "");
  writeFileSync(join(sounds, "shared", "sound file.ogg"), "");

  try {
    assert.deepEqual(discoverPlayoraSounds(root), ["chess/capture.mp3", "chess/move.ogg", "shared/win.wav"]);
    assert.equal(
      createPlayoraSoundsManifest(root),
      'window.PLAYORA_SOUND_ASSETS = ["chess/capture.mp3","chess/move.ogg","shared/win.wav"];',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("all checked-in audio assets are included in the generated sound manifest", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const sounds = discoverPlayoraSounds(root);
  assert.equal(
    createPlayoraSoundsManifest(root),
    `window.PLAYORA_SOUND_ASSETS = ${JSON.stringify(sounds)};`,
  );
});
