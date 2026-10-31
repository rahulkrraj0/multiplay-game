# Adding a Playora game

Game scripts in this folder are discovered automatically. Add a file named
`newgame.js`, save it, and refresh the app. Use only letters, numbers, `_`, or
`-` in the filename; names with spaces (for example, `new game.js`) are ignored.
The script must register a game with `registerGame(game)` to appear in the game
list. Do not add it to a separate file list.

## Game contract

Scripts are loaded as classic browser scripts after `core/engine.js` and before
`core/net.js`. Follow the existing pattern: wrap the game in an IIFE, keep its
implementation private, and register one game object.

```js
(() => {
  "use strict";

  const game = {
    id: "newgame",          // Unique, stable ID; do not reuse another game's ID.
    i: "🎯",                // Card icon.
    t: "New Game",          // Display name.
    d: "Short description.",
    max: 2,                 // Maximum active players (default is 2).
    cat: "classic casual",  // Search/filter categories.
    tag: "Quick game",
    diff: "Easy",
    art: "art-newgame",     // Optional class for the game card.
    n: ["Red", "Blue"],     // Name for each player/seat.
    computer: true,         // Optional: realtime game controls its computer opponent.

    init() {
      // Return a fresh, JSON-serializable state. `t` is the active seat index.
      return { t: 0, over: 0 };
    },
    valid(action) {
      // Return true only when this action is legal in the current global `S`.
      return !S.over && Number.isInteger(action.move);
    },
    apply(action) {
      // Update global `S` for one accepted action. Set S.over when finished.
      // Advance S.t when the next player's turn begins.
    },
    draw() {
      // Return [boardHTML, statusText]. Keep markup accessible and game styles
      // scoped to this game's class.
      return ['<div class="newgame">...</div>', "Red to move"];
    },
    click(element) {
      // Handle a user click and submit an action with act({ move: ... }).
    },
    bot() {
      // Optional: return one legal action object for the local computer turn.
      // Return null if no action is available.
      return { move: 0 };
    },
  };

  registerGame(game);
})();
```

## Required behavior

- `id` must be unique. `t`, `i`, `d`, `n`, and `init`, `apply`, `draw`, and
  `click` are required. `max` defaults to 2.
- `init()` must create a fresh state every time; use plain objects, arrays,
  strings, numbers, booleans, and null so online state can be JSON-serialized.
- Keep the active seat in `S.t`. `S.over` should be truthy when the game ends.
  Put a user-readable game result in `S.msg` when appropriate.
- Use the shared `nm(seat)` helper anywhere player-facing game text needs a
  player name, including status and winner displays. Do not use a game-specific
  fixed label or add viewer-local text such as “(you)” to synchronized results;
  all peers must calculate the same `S.msg`.
- Send every move through `act(action)`. Do not mutate state directly from click
  handlers: `apply(action)` is the one place that changes game state. Implement
  `valid(action)` to reject malformed or illegal online actions.
- Set `S.over` only when the game rules end the game (for example, a win or
  draw). The shared runtime handles online player disconnects by pausing actions
  and offering wait-for-reconnect or finish-game choices; do not turn a network
  disconnect into a game win or add game-specific reconnect UI. When the same
  player rejoins, the runtime restores their seat and resumes the saved state.
- For games with more than two active players, record finished-player
  placements and skip finished players' turns. The game may continue until
  third place is decided, with remaining players shown as not placed.
- Carrom supports 2–4 active players. For 3–4 players, the host selects Point
  Game (8 boards; white 20, black 10, covered queen 50) or Clear-the-board.
  Three-player rooms use individual play. Four-player rooms can use individual
  play or teams; the host selects a partner, and that pairing persists across
  point-game boards.
- A game may set `hostSetup: true` when its synchronized setup actions must be
  chosen by the online host before turns begin. Keep those actions constrained
  by `valid()` to the setup phase.
- The engine delegates clicks on `[data-i]` and `[data-m]` inside `#bd` to
  `game.click(element)`. A game may use its own delegated document listener for
  more specialized controls, as Chess does.
- `draw()` runs after each action. Return a pair containing the board HTML and
  a status string. Escape player-provided text; do not interpolate untrusted
  input as HTML. Use semantic labels and keyboard/touch-friendly controls.
- A `bot()` method is optional. When present, local play starts with the user
  at seat 0 and automatically requests a computer action on the other seat.
  Return an action in exactly the same shape accepted by `apply`/`valid`.
- Realtime games may set `computer: true` when they control the opponent
  continuously instead of returning turn-based actions.
- A game with the shared dice control may provide `rollSides()` to return the
  number of sides currently allowed (1–6). The engine puts the chosen roll in
  the action, so `valid()` and `apply()` must accept it without changing it.
- Set `max` to `1` for a solo-only game. Its Play button starts the game
  directly, without multiplayer choices, and it is omitted from online
  lobbies. Games with `max` greater than `1` offer local and online multiplayer;
  the computer-play option appears only when `bot()` is implemented or a
  realtime game sets `computer: true`.
- Keep the game self-contained and responsive. Add game-specific styles to
  `src/playora/game.css`, scoped under a unique class such as `.newgame`.
  Avoid global CSS changes, external runtime dependencies, and network calls.
- The shared sound runtime generates lightweight Web Audio cues for supported
  games and uses a generic synthesized cue for games without a dedicated
  profile. It tries a matching file under `public/playora/sounds/` first and
  falls back to synthesized audio when the file is missing or cannot play.
  Turn-based games receive their cues through `act()`; realtime games can call
  `window.playoraSound.playGame(gameId, event)` from lifecycle or gameplay
  callbacks. Generated cues share a normalized peak level, and audio files use
  the same playback volume; normalize custom audio files to a consistent
  loudness before adding them. Sound is controlled by the site's shared sound
  toggle.

## Online play notes

Every attendee receives the same start action and game actions. Online games
send moves over a dedicated reliable, ordered WebRTC data channel when it is
open, falling back to the room's existing channel during setup or recovery.
Players enter a display name once per browser; the name is remembered on that
device and shared with the lobby and active game seats.
The engine applies actions to each attendee's local state, so a game must be deterministic:
include any random result (such as a dice roll) in the action rather than
generating it separately in `apply()`. Validate that result in `valid()`.
Keep state compact and serializable. Games are limited by the room's eight
attendee cap; `max` is the number who actively play, while additional attendees
can spectate.

The shared room runtime owns connection recovery. On a player disconnect, it
pauses game actions without setting `S.over`, keeps the current game state, and
shows the recovery choices. A reconnecting player is restored to their original
game seat; choosing to finish returns the room to its lobby. Do not treat
transport events as game outcomes or add a separate network protocol for
recovery.

### Continuous real-time games

Turn-based games should continue to use `act(action)`; they automatically use
the reliable low-latency action channel online. A game with continuous
input/state can additionally opt into the room's separate low-latency channel
with `realtime: true`, `onStart()`, `onStop()`, and
`onRealtimeMessage(seat, kind, data)`. The current host creates an unordered
WebRTC data channel with no retransmits; use the global
`realtimeSend(kind, data)` helper to send `"input"` packets from a player to the host or `"state"`
snapshots from the host to everyone. The host should validate and clamp inputs,
simulate authoritative state, and periodically broadcast compact snapshots.
Messages are intentionally lossy, so send current controls periodically and
make snapshots sufficient to recover after a missed packet. Start and stop all
timers, animation frames, and event listeners in the lifecycle callbacks. Do not
send turn-based `act()` moves for continuous frames.

The `bot()` method is only for local play. Do not use it to take over an online
player's seat.

## LLM starter files

For an example turn-based game and a prompt to give another coding LLM, see
[`examples/playora-countdown-demo.js`](../../../examples/playora-countdown-demo.js),
[`examples/playora-countdown-demo.css`](../../../examples/playora-countdown-demo.css),
and [`examples/PROMPT-FOR-GAME-LLM.md`](../../../examples/PROMPT-FOR-GAME-LLM.md).
The examples folder is not auto-discovered; copy a finished game script into
this folder and move its scoped styles into `src/playora/game.css`.

## Check your game

1. Add `newgame.js` under this folder and register its unique game ID.
2. Refresh the app and confirm its card appears.
3. Play through a complete round, including invalid moves, restart, win/draw,
   and narrow/mobile layouts.
4. If online actions are supported, test with two browsers and confirm both
   clients reach the same state.
5. Run `npm test`, `npm run typecheck`, and `npm run build`.
