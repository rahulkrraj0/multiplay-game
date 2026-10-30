import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { initializeStaticAdSenseSlots } from "@/lib/adsense";
import markup from "../playora/markup.html?raw";
import "../playora/site.css";
import "../playora/game.css";
import { canonicalUrl } from "../playora/seo-config";

const rootCanonical = canonicalUrl("/");

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    room: typeof search.room === "string" ? search.room : "",
  }),
  head: () => ({
    links: rootCanonical ? [{ rel: "canonical", href: rootCanonical }] : [],
  }),
  component: Home,
});

const ENGINE_FILES = [
  "/playora/core/config.js",
  "/playora/core/sounds.js",
  "/playora/core/engine.js",
];

const RUNTIME_FILES = [
  "/playora/core/net.js",
  "/playora/core/room.js",
  "/playora/core/site.js",
];

type GameCatalogEntry = {
  file: string;
  id: string;
  i: string;
  t: string;
  d: string;
  max: number;
  cat: string;
  tag: string;
  diff: string;
  art: string;
};

declare global {
  interface Window {
    PLAYORA_GAME_CATALOG?: GameCatalogEntry[];
    PLAYORA_LOAD_SCRIPT?: (src: string) => Promise<void>;
  }
}

function asset(path: string) {
  const host = window.location.hostname.toLowerCase();
  const pathBased =
    host === "preview.grok.genai.mil" || host === "preview.grok.mil" || host === "preview.grokgsac.com";
  if (!pathBased) return path;
  const prefix = window.location.pathname.match(/^\/hds-[a-z0-9]+-\d+-[a-z0-9]+/i);
  return (prefix ? prefix[0] : "") + path;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(src));
    document.body.appendChild(s);
  });
}

let boot: Promise<void> | null = null;

function getInviteRoomCode(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/[?&#]room=([^&#\s]+)/i);
  const code = (match?.[1] ?? trimmed)
    .replace(/^playora-/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  return code.length >= 4 ? code : "";
}

function bootScripts() {
  if (boot) return boot;
  boot = (async () => {
    const catalogRequest = fetch(asset("/playora/games/catalog.json"), { cache: "force-cache" });
    const engineScripts = (async () => {
      for (const file of ENGINE_FILES) await loadScript(asset(file));
    })();
    const [response] = await Promise.all([catalogRequest, engineScripts]);
    if (!response.ok) throw new Error("Could not load the game list.");
    const catalog: unknown = await response.json();
    if (
      !Array.isArray(catalog) ||
      !catalog.every(
        (game) =>
          typeof game === "object" &&
          game !== null &&
          "file" in game &&
          typeof game.file === "string" &&
          /^[a-z0-9][a-z0-9_-]*\.js$/i.test(game.file) &&
          "id" in game &&
          typeof game.id === "string" &&
          /^[a-z0-9][a-z0-9_-]*$/i.test(game.id) &&
          "i" in game &&
          typeof game.i === "string" &&
          "t" in game &&
          typeof game.t === "string" &&
          "d" in game &&
          typeof game.d === "string" &&
          "max" in game &&
          typeof game.max === "number" &&
          Number.isInteger(game.max) &&
          game.max >= 1 &&
          "cat" in game &&
          typeof game.cat === "string" &&
          "tag" in game &&
          typeof game.tag === "string" &&
          "diff" in game &&
          typeof game.diff === "string" &&
          "art" in game &&
          typeof game.art === "string",
      ) ||
      new Set(catalog.map((game) => (game as GameCatalogEntry).id)).size !== catalog.length
    ) {
      throw new Error("The game list is invalid.");
    }
    window.PLAYORA_GAME_CATALOG = catalog as GameCatalogEntry[];
    window.PLAYORA_LOAD_SCRIPT = (file) => loadScript(asset(`/playora/games/${file}`));
    await loadScript(asset("/playora/core/game-loader.js"));
    for (const file of RUNTIME_FILES) await loadScript(asset(file));
  })();
  return boot;
}

function Home() {
  const { room } = Route.useSearch();
  const inviteCode = getInviteRoomCode(room);
  const pageMarkup = inviteCode
    ? markup
        .replace('id="inviteCode"></strong>', `id="inviteCode">${inviteCode}</strong>`)
        .replace('<main id="invitePage" class="invite-page" hidden>', '<main id="invitePage" class="invite-page">')
    : markup;

  useEffect(() => {
    let cancel = false;
    if (!inviteCode) initializeStaticAdSenseSlots();
    const timer = window.setTimeout(() => {
      if (cancel) return;
      bootScripts().catch(() => {
        const note = document.getElementById("playora-boot");
        if (note) note.textContent = "The game table didn’t finish loading. Refresh and try again.";
        const grid = document.getElementById("gameGrid");
        if (grid) {
          grid.setAttribute("aria-busy", "false");
          grid.innerHTML = '<p class="empty" role="status">The game list couldn’t load. Refresh and try again.</p>';
        }
      });
    }, 0);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [inviteCode]);

  return (
    <div id="playora-root" data-invite={inviteCode ? "true" : undefined}>
    {rootCanonical ? (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Playora",
            url: rootCanonical,
          }),
        }}
      />
    ) : null}
    <p id="playora-boot" />
    <div dangerouslySetInnerHTML={{ __html: pageMarkup }} />
    </div>
  );
}
