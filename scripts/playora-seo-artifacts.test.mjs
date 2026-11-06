import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlayoraSeoArtifacts,
  normalizePublicSiteUrl,
  resolvePublicSiteOrigin,
} from "./playora-seo-artifacts.mjs";

test("normalizes only public HTTPS origins", () => {
  assert.equal(normalizePublicSiteUrl(undefined), null);
  assert.equal(normalizePublicSiteUrl(""), null);
  assert.equal(normalizePublicSiteUrl("https://playora.example/"), "https://playora.example");
  assert.throws(() => normalizePublicSiteUrl("http://playora.example"));
  assert.throws(() => normalizePublicSiteUrl("https://playora.example/path"));
  assert.throws(() => normalizePublicSiteUrl("https://user:pass@playora.example"));
});

test("prefers the configured public URL and falls back to Vercel's production host", () => {
  assert.equal(
    resolvePublicSiteOrigin("https://playora.example/", "preview.vercel.app"),
    "https://playora.example",
  );
  assert.equal(resolvePublicSiteOrigin(undefined, "playora.example"), "https://playora.example");
  assert.equal(resolvePublicSiteOrigin(undefined, undefined), null);
});

test("creates a sitemap and robots policy for the homepage, guides, and all game pages", () => {
  const { sitemap, robots } = createPlayoraSeoArtifacts("https://playora.example");
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 26);
  for (const slug of [
    "2048",
    "arrows",
    "bluff",
    "callbreak",
    "carrom",
    "checkers",
    "chess",
    "connect-four",
    "crazyeights",
    "hearts",
    "joker-duel",
    "ludo",
    "poker",
    "racer",
    "rummy",
    "snakes-and-ladders",
    "spades",
    "sudoku",
    "teenpatti",
    "tic-tac-toe",
    "uno",
    "watersort",
  ]) {
    assert.match(sitemap, new RegExp(`https://playora\\.example/games/${slug}(?:<|$)`));
  }
  assert.match(sitemap, /https:\/\/playora\.example\/online-multiplayer/);
  assert.match(sitemap, /https:\/\/playora\.example\/privacy-policy/);
  assert.match(robots, /^User-agent: \*\nAllow: \/\nSitemap: https:\/\/playora\.example\/sitemap\.xml\n$/);
});
