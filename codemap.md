# Playora Code Map

## Application entry points

- `src/router.tsx` configures the TanStack Router and its route tree.
- `src/routes/__root.tsx` provides the shared document shell and root error handling.
- `src/routes/index.tsx` renders the Playora homepage, imports its styles and HTML shell, and loads the classic browser runtime.
- Other page routes cover online play, how-to-play, privacy, and individual game guides under `src/routes/`.
- `src/components/` contains shared React UI such as the preview host bridge and ad slot.

## Playora homepage and browser runtime

- `src/playora/markup.html` is the homepage, game modal, lobby, and call-panel markup.
- `src/playora/site.css` styles the homepage and lobby. `src/playora/game.css` contains game-board styles.
- `src/playora/seo-pages.tsx` and `src/playora/seo-pages.css` provide shared game-guide content and presentation.
- `src/routes/index.tsx` loads scripts in runtime order: `config.js`, `engine.js`, discovered scripts in `public/playora/games/`, then `net.js`, `room.js`, and `site.js`.
- `public/playora/core/config.js` provides runtime configuration.
- `public/playora/core/engine.js` owns game registration, local/online game state, turn handling, and rendering.
- `public/playora/games/` contains self-contained games. `public/playora/games/README.md` documents their authoring contract.
- `public/playora/core/site.js` wires game cards, filters, homepage buttons, and the room-opening UI.

## Online rooms and multiplayer

- `public/playora/core/room.js` creates and joins lobbies, manages signaling sessions, and reconnects a room host.
- `public/playora/core/net.js` manages the peer-to-peer mesh, lobby membership, host election, game actions, chat, voice/video, and lobby controls.
- The lowest connected attendee seat is the host. A peer in the transient `disconnected` state gets a 12-second grace period before removal; once the host is dropped, the next attendee becomes host and retries claiming the room's signaling identity.
- Attendee seats remain stable across game starts and player rejoin; game-player seats are derived from the active game roster. This keeps host election independent of who is playing.
- In-game player disconnects pause actions and show a shared recovery dialog rather than setting a game win. Players can keep waiting for the same browser identity to reconnect or ask the current host to finish and return everyone to the lobby.
- Reopening a saved host room first checks for a live or recently registered host. If one exists, the previous host rejoins as an attendee instead of creating a competing host session.
- The host's player/viewer assignments and attendance history are shown in the lobby roster. A stable browser key reconnects a returning attendee to their recorded identity; history is stored in that host browser's local storage and shared among connected attendees so it can survive a host handoff.
- `src/routes/api/rtc.ts` exposes the signaling API. `src/lib/multiplayer/signaling.server.ts` stores short-lived peer presence and relays WebRTC setup messages; gameplay remains peer-to-peer.
- `src/lib/multiplayer/ice-config.server.ts` supplies ICE configuration. `src/lib/multiplayer/p2p.ts` is a separate reusable P2P primitive and is not the classic Playora runtime.
- `migrations/0002_webrtc_signaling.sql` and `migrations/0003_webrtc_expiry_indexes.sql` define signaling persistence and expiry indexes.

## Server-side libraries

- `src/lib/db.ts` and `src/lib/env.server.ts` configure database access and server environment variables.
- `src/lib/auth/` contains Better Auth setup, server-side identity verification, session handling, and sign-in gating.
- `src/lib/app-data/` contains server/client app-data access, connector readiness, related types, and tests.
- `src/lib/preview-path-prefix.ts` and `src/lib/preview-host-bridge.ts` support preview deployments and embedded previews.
- `migrations/auth/0001_auth.sql` defines auth persistence.

## Build, deployment, and verification

- `vite.config.ts`, `scripts/app-env-plugin.mjs`, and `scripts/with-app-env.mjs` configure Vite and app environment loading.
- `scripts/playora-games-manifest.mjs` discovers game scripts; Vite/build tooling supplies the generated manifest.
- `scripts/migrate.mjs` runs database migrations. `npm run build` runs the Vite build and then migrations.
- `scripts/browser-smoke.mjs` checks the homepage in desktop and mobile browser sizes.
- `scripts/*.test.mjs` and tests alongside `src/lib/` cover project scripts and server-side helpers.
- Common checks: `npm test`, `npm run typecheck`, `npm run build`, and `npm run dev`.
