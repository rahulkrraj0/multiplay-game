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

const FILES_BEFORE_GAMES = [
  "/playora/core/config.js",
  "/playora/core/engine.js",
];

const FILES_AFTER_GAMES = [
  "/playora/core/net.js",
  "/playora/core/room.js",
  "/playora/core/site.js",
];

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
    for (const file of FILES_BEFORE_GAMES) await loadScript(asset(file));
    const response = await fetch(asset("/playora/games/manifest.json"), { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the game list.");
    const games: unknown = await response.json();
    if (!Array.isArray(games) || !games.every((name) => typeof name === "string" && /^[a-z0-9][a-z0-9_-]*\.js$/i.test(name))) {
      throw new Error("The game list is invalid.");
    }
    for (const file of games) await loadScript(asset(`/playora/games/${file}`));
    for (const file of FILES_AFTER_GAMES) await loadScript(asset(file));
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
