import { readdirSync } from "node:fs";
import { join } from "node:path";

const GAME_FILE = /^[a-z0-9][a-z0-9_-]*\.js$/i;

export function discoverPlayoraGames(root) {
  const directory = join(root, "public", "playora", "games");
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && GAME_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}
