import { readdirSync } from "node:fs";
import { join } from "node:path";

const SOUND_DIRECTORY = /^[a-z0-9][a-z0-9_-]*$/i;
const SOUND_FILE = /^[a-z0-9][a-z0-9_-]*\.(?:ogg|mp3|wav|m4a|aac)$/i;

export function discoverPlayoraSounds(root) {
  const directory = join(root, "public", "playora", "sounds");
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SOUND_DIRECTORY.test(entry.name))
    .flatMap((folder) =>
      readdirSync(join(directory, folder.name), { withFileTypes: true })
        .filter((entry) => entry.isFile() && SOUND_FILE.test(entry.name))
        .map((entry) => `${folder.name}/${entry.name}`),
    )
    .sort((a, b) => a.localeCompare(b));
}

export function createPlayoraSoundsManifest(root) {
  return `window.PLAYORA_SOUND_ASSETS = ${JSON.stringify(discoverPlayoraSounds(root))};`;
}
