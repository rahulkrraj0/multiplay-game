# Playora Project Guidelines

Playora is a browser-based board-game and multiplayer site built with TanStack
Start, Vite, and classic browser scripts for its game runtime. It is deployed to
Vercel. Make focused changes that fit the existing architecture and preserve
the working local and online game flows.

## Commands and environment

- Run the app with `npm run dev`. The package script starts Vite through
  `scripts/with-app-env.mjs` and binds the preview to `0.0.0.0:8080`; use the
  npm script rather than invoking Vite directly.
- Validate code changes with `npm run typecheck`, `npm test`, and
  `npm run build`. Use the smallest relevant checks first, then the full checks
  when appropriate.
- `npm run build` also runs `npm run db:migrate`; report migration or
  environment failures explicitly rather than treating them as a successful
  build.
- Do not assume a particular operating-system path, shell, or globally
  installed tool. Work from the repository root and use the scripts and
  dependencies already defined in `package.json`.
- The production target is Vercel. Keep secrets server-side, use the existing
  environment-variable patterns, and avoid runtime filesystem persistence or
  hard-coded deployment hosts.

## Application structure

- TanStack routes live in `src/routes/`; the router is configured in
  `src/router.tsx`. Preserve the preview-path rewrite and the existing error
  component when editing router setup.
- The Playora game shell and styles are in `src/playora/markup.html`,
  `src/playora/site.css`, and `src/playora/game.css`.
- The browser game runtime is in `public/playora/core/`. Game scripts are
  loaded by `src/routes/index.tsx` in this order: `config.js`, `engine.js`,
  discovered game scripts, then `net.js`, `room.js`, and `site.js`. Check this
  script-based runtime before introducing a second implementation of existing
  gameplay or multiplayer behavior.
- Online game rooms use the existing WebRTC and `/api/rtc` signaling flow.
  Preserve its room, peer, and message contracts when changing multiplayer
  behavior. `src/lib/multiplayer/p2p.ts` is a separate reusable primitive; do
  not assume the classic Playora runtime uses it.
- Keep styles scoped to their feature or game. Make interactive surfaces
  keyboard accessible and usable on mobile as well as desktop.
- Preserve the existing Vite, app-environment, PWA, and preview integrations
  when changing build configuration. Do not overwrite generated or
  platform-owned files without a task that specifically requires it.

## Developing a new game

Before implementing a game, read
[`public/playora/games/README.md`](public/playora/games/README.md). It is the
canonical, detailed game-authoring contract; keep this section as a concise
checklist and update the README if the contract changes.

- Add one self-contained classic browser script named with letters, numbers,
  `_`, or `-` under `public/playora/games/`. The Vite manifest discovers game
  files automatically; never add a second hand-maintained game list.
- Wrap the script in an IIFE and register exactly one game with
  `registerGame(game)`. Use a unique, stable lowercase `id`; required metadata
  and methods are `t`, `i`, `d`, `n`, `init`, `apply`, `draw`, and `click`.
  Keep implementation details private to the script.
- Follow the engine contract in `public/playora/core/engine.js`: store the
  active seat in `S.t`, set `S.over` at game end, set a readable `S.msg` when
  useful, and send each player action through `act(action)`. Keep all state
  plain and JSON-serializable; `init()` must return a fresh state.
- Implement `valid(action)` to reject malformed, out-of-turn, and illegal
  online actions. Keep `apply(action)` deterministic and the only place that
  applies a move. Include random outcomes in the action rather than generating
  them independently on each peer.
- `draw()` returns `[boardHTML, statusText]`. Render accessible,
  keyboard- and touch-friendly controls. Escape or avoid untrusted HTML, and
  keep all game styles scoped to a unique class in `src/playora/game.css`.
- Set `max` to the number of active players supported (default 2); extra room
  attendees spectate. `bot()` is optional and only used for local computer
  play; it must return an action accepted by the same validation and apply
  logic. Never let a bot impersonate an online player.
- Keep the game self-contained: do not add runtime dependencies, network
  calls, or unrelated changes to the shared engine, room protocol, or global
  styles unless the feature genuinely requires them.
- Verify the homepage card appears, then test a full game including legal and
  invalid moves, turn progression, win/draw, restart, and narrow screens. For
  online play, test independent clients and confirm state stays in sync.
  Run `npm test`, `npm run typecheck`, and `npm run build`.

## Data, auth, and multiplayer

- Prefer the project's existing helpers and patterns for database access,
  authentication, and signaling. Add new persistence or identity requirements
  only when the feature needs them.
- Scope private data to the verified server-side identity; never trust a
  user ID supplied by the browser.
- Peer-to-peer game state is client-authoritative. Treat it as casual play;
  do not use it for cheat-sensitive scoring or competitive rankings.
- Surface connection and permission failures clearly. Do not silently claim
  that camera, microphone, signaling, or database operations succeeded.

## Verification and documentation

- For UI changes, verify the rendered experience in a browser at desktop and
  mobile sizes; check for console errors, clipped content, and horizontal
  overflow.
- Run `node scripts/browser-smoke.mjs` when the dev server is available to check
  the page on desktop and mobile.
- For game or multiplayer changes, test the relevant interactions and, when
  feasible, verify behavior with independent browser sessions.
- Keep directly related documentation current. Avoid unrelated cleanup or
  broad changes while fixing a focused issue.
