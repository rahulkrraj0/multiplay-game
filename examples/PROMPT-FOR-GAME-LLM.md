# Prompt for an LLM: build a Playora game

Copy the prompt below into the coding LLM you want to use. Give it access to
this repository so it can read the real game contract and inspect existing
game examples.

---

You are adding one browser game to the Playora project. First read
`public/playora/games/README.md` and inspect at least one existing game script
and its styles. Follow those repository conventions rather than introducing a
new runtime or multiplayer implementation.

## My game

- Game name: **[name]**
- Rules and objective: **[describe how a complete game works]**
- Player count: **[number or range]**
- Local computer opponent: **[yes/no; describe its behavior if yes]**
- Continuous simultaneous movement (for example steering): **[yes/no]**
- Special requirements: **[accessibility, mobile, visual style, etc.]**

If these details leave important rules ambiguous, ask me before implementing.

## Requirements

- Add one self-contained classic browser script under
  `public/playora/games/`, with a filename made of letters, numbers, `_`, or
  `-`. Register exactly one game using a unique, stable lowercase `id`.
- Keep implementation details inside an IIFE. Implement the required metadata
  and `init`, `valid`, `apply`, `draw`, and `click` methods from the README.
- Keep state plain and JSON-serializable. `init()` must return fresh state;
  `S.t` is the active seat and `S.over` marks a finished game.
- Set `S.over` only for an outcome defined by the game rules, such as a win or
  draw. The shared runtime handles online disconnects: it pauses actions,
  offers wait-for-reconnect or finish-game choices, and resumes the saved game
  when the same player rejoins. Do not display a disconnect as a win or add
  game-specific reconnect UI/protocol.
- Use the shared `nm(seat)` helper for player names in all visible game text,
  including turn/status labels and winner messages. Keep synchronized results
  identical on every peer; do not append local-only labels such as “(you)”.
- Send each player action through `act(action)`. Keep all state changes in
  deterministic `apply(action)` logic. Reject malformed, illegal, and
  out-of-turn online actions in `valid(action)`. Put random outcomes into the
  action rather than generating them independently on each client.
- For turn-based multiplayer, use the standard action contract. Playora
  already transports those actions reliably; do not build a parallel network
  protocol.
- Only for continuous games, follow the README's `realtime: true` lifecycle
  and lossy input/state channel contract. Validate host inputs, keep the host
  authoritative, and clean up timers and listeners on stop.
- Make controls keyboard and touch accessible. Escape untrusted text, scope
  styles under a unique game class in `src/playora/game.css`, and support
  narrow screens.
- Add `bot()` only if it returns legal actions for local computer play. Never
  let a bot act for an online player.
- Do not add runtime dependencies, network calls, a hand-maintained game list,
  or unrelated changes.
- Add or update focused tests for the game rules and invalid actions. Run
  `npm test`, `npm run typecheck`, and `npm run build`, and report any failures
  accurately.
- Summarize changed files and explain how to play and test the game.

## Optional small reference

`examples/playora-countdown-demo.js` demonstrates a deterministic,
turn-based two-player game with validation, a local bot, and accessible
controls. `examples/playora-countdown-demo.css` contains its scoped styles.
These are examples, not discovered game scripts. When adapting them, use a new
game ID and copy only the relevant CSS into `src/playora/game.css`.

---
