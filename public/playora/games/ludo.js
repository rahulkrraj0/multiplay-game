/* global S, np, isLocalComputerGame, nm, ids, canAct, act, registerGame */
/*
 * Ludo UI v2 + corrected rules  (ONE merged game, set up inside the game)
 *
 * Setup (asked on the board when the game starts, by player 1 / the host):
 *   - 2 players: first choose "1 house each" (4 tokens) or "2 houses each" (8 tokens).
 *   - Then choose the house colour:
 *       1 house each  -> any of Red, Green, Yellow, Blue. A 2-player rival gets the
 *                        opposite (diagonal) house. With 3-4 players the others take the
 *                        next colours clockwise (Red -> Green -> Yellow -> Blue).
 *       2 houses each -> "Red & Yellow" or "Green & Blue". The rival gets the other pair.
 *     Your own two houses never capture each other; you win when all 8 tokens are home.
 *   - 3 or 4 players skip the houses question and go straight to the colour choice.
 *
 * Rules (fixed):
 *   - A token travels 51 squares of the shared track (positions 0..50), then
 *     turns into its own 5-square home lane (51..55); position 56 = home.
 *     (Old code walked a 52nd square and jumped diagonally into the lane.)
 *   - Exact roll needed to reach home. A six brings a token out of the yard.
 *   - A six, a capture, or reaching home gives another roll.
 *   - Start squares and star squares are safe. Capture = send rival to yard.
 *   - A token move is only valid after the die has been rolled.
 *   - After two sixes in a row the next roll can only be 1-5.
 *   - Two tokens of the same colour can never share a square (a move onto
 *     your own colour's square is not allowed) EXCEPT on safe squares (the
 *     stars and the start squares) and in the home lane, where tokens of the
 *     same colour may stay together.
 *     Rivals share/capture as usual.
 *
 * Wide screens (>= 900px, landscape): the dice and the Roll button are placed
 * to the right of the board (they are found automatically next to the board)
 * and the board gets a large explicit square size:
 *   min(84vh, 760px, 100vw - 340px)
 * (narrow screens keep the normal size: min(94vw, 82vh, 680px)).
 *
 * Rotate board (THIS SCREEN ONLY):
 *   - A round button at the centre of the board turns it 90 degrees clockwise
 *     on every tap (4 positions), so every player can put their own
 *     house at the bottom. It is purely a local view setting: nothing is sent to
 *     the game or to the other players, and the rules/state are untouched.
 *   - The choice is remembered in this browser (localStorage, when available).
 *   - Stars, player names, and the setup card stay upright, and token lighting
 *     follows the turn, so the board still looks natural from every side.
 *   - window.ludoRotateBoard(n) turns by n quarter turns (default 1, negative =
 *     anticlockwise). For example, call ludoRotateBoard(2) to flip the board.
 *
 * Auto move (human turns):
 *   - only 1 token can move  -> it moves by itself (after a short pause)
 *   - 2+ tokens can move     -> a 15 s countdown shows; if nobody picks, the
 *                               best movable token is played automatically.
 *   - in user-vs-computer play, the user always chooses their own token.
 *   Options: window.ludoAutoMove = false, window.ludoMoveSeconds = 15,
 *            window.ludoIsBotTurn = function (player) { ... }
 *
 * Game list: a single "Ludo" entry (2-4 players). The old separate
 * "Ludo · 2 Houses" entry is gone; choose it inside the game instead.
 *
 * Usage: load this AFTER your host script (the one that defines registerGame,
 * S, np and act). If registerGame is not ready yet this file waits for it.
 *
 * Optional hooks:
 *   installLudoUI(game)      -> wrap game.draw() to read the status text
 *   ludoCelebrate("red")     -> manually trigger the celebration (red|green|yellow|blue)
 *   ludoRotateBoard(n)       -> turn the board n quarter turns on this screen
 */
(function () {
  "use strict";
  if (window.__ludoUiV2) return;
  window.__ludoUiV2 = true;

  /* ------------------------------------------------------------------ */
  /* constants                                                           */
  /* ------------------------------------------------------------------ */
  var N = 15;
  var STYLE_ID = "ludo-ui-v2-styles";
  var ORDER = ["red", "green", "yellow", "blue"];
  var PAL = {
    red:    { name: "Red",    base: "#e5322d", light: "#f48a85", dark: "#a8161b", rgb: [229, 50, 45] },
    green:  { name: "Green",  base: "#2fa84f", light: "#7fd394", dark: "#16722f", rgb: [47, 168, 79] },
    yellow: { name: "Yellow", base: "#fadb14", light: "#fff08a", dark: "#b89100", rgb: [250, 219, 20] },
    blue:   { name: "Blue",   base: "#2160c4", light: "#7fa9ec", dark: "#123a85", rgb: [33, 96, 196] }
  };
  var GOLD = { name: "", base: "#f5b301", light: "#ffe08a", dark: "#a86b00", rgb: [245, 179, 1] };
  var YARD_ORIGIN = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] }; // [row, col]
  var SOCK = [[1.9, 1.9], [4.1, 1.9], [1.9, 4.1], [4.1, 4.1]];                    // [x, y] inside 6x6 yard
  var TK = 0.72;   // token size, fraction of a cell
  var SM = 0.44;   // stacked token size
  var STARS = { "2,6": "green", "6,12": "yellow", "8,2": "red", "12,8": "blue" };
  var WIN_RE = /\b(wins|won|winner|victory|you win)\b/i;

  var lastStatus = "";
  var winActive = false;
  var winColor = "";
  var manualWin = false;
  var entered = false;
  var focusUntil = 0;
  var snaps = [];
  var slotMaps = { red: new Map(), green: new Map(), yellow: new Map(), blue: new Map() };

  /* rotate board (this screen only) */
  var ROT_KEY = "ludo-board-rotation";
  var COS = [1, 0, -1, 0], SIN = [0, 1, 0, -1];   // cos / sin of 0, 90, 180, 270 degrees (exact)
  var rotQ = 0;       // quarter turns clockwise, 0..3
  var rotAcc = 0;     // total degrees turned so far, so the board always spins the same way
  var rotBtn = null;
  var rotGrid = null;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ------------------------------------------------------------------ */
  /* styles                                                              */
  /* ------------------------------------------------------------------ */
  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      ".g.c15.lui{",
      "  --lui-cell:calc(var(--lui-size,min(94vw,82vh,680px))/15);",
      "  display:grid;grid-template-columns:repeat(15,minmax(0,1fr));grid-template-rows:repeat(15,minmax(0,1fr));",
      "  position:relative;box-sizing:border-box;width:var(--lui-size,min(94vw,82vh,680px));aspect-ratio:1/1;margin:0 auto;padding:0;gap:0;",
      "  overflow:hidden;border:3px solid #1f2937;border-radius:14px;background:#fff;isolation:isolate;",
      "  box-shadow:0 18px 48px rgba(17,24,39,.22),0 3px 10px rgba(17,24,39,.12);",
      /* local view rotation (individual 'rotate' property, so it never fights the entrance animation) */
      "  rotate:var(--lui-rot,0deg);transition:rotate .35s ease;",
      "}",
      ".g.c15.lui.lui-enter{animation:lui-board-in .55s cubic-bezier(.2,.8,.2,1) both}",

      /* cells */
      ".g.c15.lui .lc{position:relative;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;",
      "  box-sizing:border-box;border:.5px solid rgba(30,41,59,.55);background:#fff;transition:background-color .18s ease}",
      ".g.c15.lui .lc.lui-p:not(.lui-busy):hover{background:#eef4ff}",
      ".g.c15.lui .lc.lui-y{border-color:transparent}",
      ".g.c15.lui .lc.lui-ct{background:transparent!important;border-color:transparent}",
      ".g.c15.lui .lc.lui-c{border-color:rgba(0,0,0,.38)}",
      ".g.c15.lui .lc.lui-r{background:" + PAL.red.base + "!important}",
      ".g.c15.lui .lc.lui-g{background:" + PAL.green.base + "!important}",
      ".g.c15.lui .lc.lui-yl{background:" + PAL.yellow.base + "!important}",
      ".g.c15.lui .lc.lui-b{background:" + PAL.blue.base + "!important}",

      /* decoration layer: yards + centre */
      ".lui-deco{position:absolute;inset:0;z-index:1;pointer-events:none}",
      ".lui-player-name{position:absolute;z-index:2;max-width:38%;overflow:hidden;padding:3px 7px;border:1px solid rgba(255,255,255,.85);",
      "  border-radius:999px;background:rgba(15,23,42,.78);color:#fff;font-size:clamp(8px,calc(var(--lui-cell)*.38),13px);",
      "  font-weight:800;line-height:1.15;text-align:center;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 1px 4px #0005}",
      ".lui-yard{position:absolute;width:40%;height:40%}",
      ".lui-yard-in{position:absolute;inset:15.5%;background:#fff;border-radius:9%;",
      "  box-shadow:0 0 0 calc(var(--lui-cell)*.12) var(--l),inset 0 2px 8px rgba(0,0,0,.12)}",
      ".lui-sock{position:absolute;width:20.8%;height:20.8%;border-radius:50%;background:var(--b);",
      "  box-shadow:inset 0 0 0 calc(var(--lui-cell)*.09) var(--d),0 1px 3px rgba(0,0,0,.25)}",
      ".lui-sock::after{content:'';position:absolute;inset:18%;border-radius:50%;",
      "  background:radial-gradient(circle at 35% 30%,var(--l),var(--b) 70%)}",
      ".lui-centre{position:absolute;left:40%;top:40%;width:20%;height:20%}",
      ".lui-centre svg{display:block;width:100%;height:100%}",

      /* stars (counter-rotated so they stay upright when the board is turned) */
      ".lui-star{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;",
      "  font-size:calc(var(--lui-cell)*.78);line-height:1;pointer-events:none;color:#d4a000;",
      "  text-shadow:0 0 1px #fff,0 1px 2px rgba(0,0,0,.28);rotate:var(--lui-unrot,0deg);transition:rotate .35s ease;",
      "  animation:lui-twinkle 2.6s ease-in-out infinite}",

      /* tokens (light and shadow directions follow the board rotation through the --lui-* variables) */
      ".g.c15.lui .tk{position:absolute;width:" + TK * 100 + "%;height:" + TK * 100 + "%;max-width:none;max-height:none;",
      "  box-sizing:border-box;border:2px solid rgba(255,255,255,.96);border-radius:50%;z-index:3;",
      "  background-image:radial-gradient(circle at var(--lui-hx,32%) var(--lui-hy,28%),rgba(255,255,255,.78) 0,rgba(255,255,255,0) 46%),",
      "    radial-gradient(circle at var(--lui-gx,70%) var(--lui-gy,80%),rgba(0,0,0,.30) 0,rgba(0,0,0,0) 58%);",
      "  box-shadow:var(--lui-ox,0px) var(--lui-oy,2px) 5px rgba(15,23,42,.45),inset var(--lui-ix,0px) var(--lui-iy,-3px) 4px rgba(0,0,0,.22);animation:none;",
      "  transition:filter .18s ease,transform .18s ease;will-change:transform}",
      ".g.c15.lui .tk::after{content:'';position:absolute;inset:24%;border-radius:50%;border:1px solid rgba(255,255,255,.7);pointer-events:none}",
      ".g.c15.lui .tk.sm{width:" + SM * 100 + "%;height:" + SM * 100 + "%;border-width:1px}",
      ".g.c15.lui .tk.xs{width:30%;height:30%;border-width:1px}",
      ".g.c15.lui .tk.xxs{width:21%;height:21%;border-width:1px}",
      ".g.c15.lui .tk.mv{cursor:pointer;z-index:8;animation:lui-ring 1.05s ease-in-out infinite}",
      ".g.c15.lui .tk.mv:hover,.g.c15.lui .tk.mv:focus-visible{transform:scale(1.2);filter:brightness(1.12)}",
      ".g.c15.lui .tk.mv:focus-visible{outline:3px solid #111827;outline-offset:3px}",

      /* in-game setup panel (houses per player + house colour) */
      ".g.c15.lui .lui-setup{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;",
      "  background:rgba(15,23,42,.66);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
      ".lui-setup-card{box-sizing:border-box;width:min(88%,400px);padding:calc(var(--lui-cell)*.8) calc(var(--lui-cell)*.9);",
      "  text-align:center;border-radius:20px;background:linear-gradient(165deg,#fff,#f4f6fb);box-shadow:0 14px 40px rgba(0,0,0,.45);",
      "  rotate:var(--lui-unrot,0deg);transition:rotate .35s ease}",
      ".lui-setup-card h3{margin:0 0 4px;font-size:clamp(16px,calc(var(--lui-cell)*.95),24px);font-weight:900;color:#1f2937;line-height:1.15}",
      ".lui-setup-card p{margin:0 0 12px;font-size:clamp(11px,calc(var(--lui-cell)*.55),15px);color:#475569;line-height:1.35}",
      ".lui-setup-btns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
      ".lui-setup-btn{box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;",
      "  min-height:52px;padding:10px 8px;border:2px solid #cbd5e1;border-radius:14px;background:#fff;color:#1f2937;",
      "  font:inherit;line-height:1.15;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}",
      ".lui-setup-btn b{font-size:clamp(13px,calc(var(--lui-cell)*.7),17px);font-weight:800}",
      ".lui-setup-btn small{font-size:clamp(10px,calc(var(--lui-cell)*.45),12px);color:#64748b}",
      ".lui-setup-btn:hover:not([disabled]){transform:translateY(-2px);border-color:#1f2937;box-shadow:0 6px 14px rgba(0,0,0,.2)}",
      ".lui-setup-btn:focus-visible{outline:3px solid #111827;outline-offset:2px}",
      ".lui-setup-btn[disabled]{opacity:.5;cursor:default}",
      ".lui-dots{display:flex;gap:5px}",
      ".lui-dots i{display:block;width:calc(var(--lui-cell)*.8);height:calc(var(--lui-cell)*.8);min-width:16px;min-height:16px;max-width:26px;max-height:26px;",
      "  border-radius:50%;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25),0 1px 2px rgba(0,0,0,.25)}",

      /* wide screens: board on the left, dice + roll button on the right */
      "@media (min-width:900px) and (min-aspect-ratio:5/4){",
      /* board gets an explicit square size (as large as the screen allows, leaving room for the side column) */
      "  .lui-wide{--lui-size:min(84vh,760px,calc(100vw - 340px));",
      "    display:grid!important;grid-template-columns:var(--lui-size) minmax(160px,280px);grid-template-rows:var(--lui-rows,auto);",
      "    column-gap:clamp(12px,2vw,32px);justify-content:center;justify-content:safe center;align-items:center;",
      "    width:100%;max-width:none;box-sizing:border-box}",
      "  .lui-wide>.lui-board{grid-column:1;grid-row:var(--lui-row);width:var(--lui-size);min-width:0;max-width:none}",
      "  .lui-wide .g.c15.lui{width:var(--lui-size)!important;height:var(--lui-size)!important;min-width:var(--lui-size)!important;",
      "    max-width:none!important;max-height:none!important;margin:0!important}",
      "  .lui-wide>.lui-side{grid-column:2;grid-row:var(--lui-row);align-self:center;justify-self:center;text-align:center;",
      "    margin:0 0 14px!important;max-width:100%}",
      "  .lui-wide>.lui-full{grid-column:1/-1;grid-row:var(--lui-row)}",
      "}",

      /* auto-move countdown */
      ".lui-timer{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);",
      "  z-index:9000;display:none;flex-direction:column;gap:6px;min-width:220px;max-width:92vw;box-sizing:border-box;",
      "  padding:9px 16px 10px;border-radius:14px;background:rgba(15,23,42,.92);color:#fff;text-align:center;",
      "  font:600 14px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none}",
      ".lui-timer-bar{height:5px;border-radius:99px;background:rgba(255,255,255,.25);overflow:hidden}",
      ".lui-timer-fill{height:100%;width:100%;border-radius:99px;background:#4ade80}",
      ".lui-timer.lui-low .lui-timer-fill{background:#f87171}",

      /* rotate-board button (this screen only); positioned over the board centre */
      ".lui-rot{position:fixed;left:var(--lui-center-x,50vw);top:var(--lui-center-y,50vh);",
      "  z-index:9000;display:none;align-items:center;justify-content:center;width:46px;height:46px;padding:0;border:0;border-radius:50%;",
      "  background:rgba(15,23,42,.92);color:#fff;cursor:pointer;touch-action:manipulation;",
      "  box-shadow:0 8px 24px rgba(0,0,0,.3);transform:translate(-50%,-50%);transition:transform .15s ease}",
      ".lui-rot.on{display:flex}",
      ".lui-rot:hover{transform:translate(-50%,-50%) scale(1.06)}",
      ".lui-rot:focus-visible{outline:3px solid #111827;outline-offset:3px}",
      ".lui-rot svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;",
      "  stroke-linecap:round;stroke-linejoin:round;transition:transform .35s ease}",

      /* win glow on board */
      ".g.c15.lui.lui-won{animation:lui-board-glow 1.3s ease-in-out infinite alternate}",

      /* celebration */
      ".lui-win{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;",
      "  font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
      ".lui-win-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(15,23,42,.30),rgba(15,23,42,.74));",
      "  animation:lui-fade .4s ease both}",
      ".lui-confetti{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}",
      ".lui-win-card{position:relative;box-sizing:border-box;width:min(90vw,420px);padding:26px 30px 24px;text-align:center;",
      "  border-radius:26px;background:linear-gradient(165deg,#fff,#f4f6fb);",
      "  box-shadow:0 0 0 5px var(--w),0 0 60px 8px color-mix(in srgb,var(--w) 55%,transparent),0 26px 70px rgba(0,0,0,.4);",
      "  animation:lui-card-in .75s cubic-bezier(.2,1.25,.3,1) both}",
      ".lui-trophy{font-size:76px;line-height:1;display:inline-block;transform-origin:50% 90%;",
      "  filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));animation:lui-trophy 1.1s ease-in-out infinite alternate}",
      ".lui-win-title{margin:8px 0 4px;font-size:clamp(28px,7vw,40px);font-weight:900;letter-spacing:-.01em;line-height:1.1;",
      "  background:linear-gradient(90deg,var(--wd),var(--w),#ffb300,var(--w),var(--wd));background-size:240% 100%;",
      "  -webkit-background-clip:text;background-clip:text;color:transparent;animation:lui-shine 2.8s linear infinite}",
      ".lui-win-sub{margin:0;color:#475569;font-size:15px;line-height:1.4}",
      ".lui-win-btn{margin-top:18px;padding:11px 30px;border:0;border-radius:999px;background:var(--wd);color:#fff;",
      "  font:700 15px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.25);",
      "  transition:transform .15s ease,box-shadow .15s ease}",
      ".lui-win-btn:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(0,0,0,.3)}",
      ".lui-win-btn:focus-visible{outline:3px solid #111827;outline-offset:3px}",
      ".lui-win.lui-out .lui-win-card{animation:lui-card-out .28s ease both}",
      ".lui-win.lui-out .lui-win-bg{animation:lui-fade-out .28s ease both}",

      /* keyframes */
      "@keyframes lui-board-in{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:none}}",
      "@keyframes lui-ring{0%,100%{box-shadow:0 0 0 2px #fff,0 0 5px 3px var(--tc,#ffd166),var(--lui-ox,0px) var(--lui-oy,2px) 5px rgba(15,23,42,.45)}",
      "  50%{box-shadow:0 0 0 3px #fff,0 0 15px 7px var(--tc,#ffd166),var(--lui-ox,0px) var(--lui-oy,2px) 5px rgba(15,23,42,.45)}}",
      "@keyframes lui-twinkle{0%,100%{opacity:.8;transform:scale(.94) rotate(0)}50%{opacity:1;transform:scale(1.1) rotate(10deg)}}",
      "@keyframes lui-board-glow{from{box-shadow:0 0 0 0 var(--w,#f5b301),0 18px 48px rgba(17,24,39,.22)}",
      "  to{box-shadow:0 0 0 6px var(--w,#f5b301),0 0 46px 10px var(--w,#f5b301)}}",
      "@keyframes lui-fade{from{opacity:0}to{opacity:1}}",
      "@keyframes lui-fade-out{from{opacity:1}to{opacity:0}}",
      "@keyframes lui-card-in{0%{opacity:0;transform:translateY(40px) scale(.6) rotate(-4deg)}100%{opacity:1;transform:none}}",
      "@keyframes lui-card-out{to{opacity:0;transform:translateY(20px) scale(.9)}}",
      "@keyframes lui-trophy{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(8deg) scale(1.12)}}",
      "@keyframes lui-shine{from{background-position:0 0}to{background-position:-240% 0}}",

      "@media (max-width:480px){.g.c15.lui{border-width:2px;border-radius:9px}}",
      "@media (prefers-reduced-motion:reduce){",
      "  .g.c15.lui,.g.c15.lui *,.lui-win *,.lui-rot,.lui-rot *{animation:none!important;transition:none!important}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* board geometry                                                      */
  /* ------------------------------------------------------------------ */
  var LANE_CLS = { red: "lui-r", green: "lui-g", yellow: "lui-yl", blue: "lui-b" };

  function cellInfo(r, c) {
    if (r < 6 && c < 6) return { kind: "yard", p: "red",    cls: ["lui-y", LANE_CLS.red] };
    if (r < 6 && c > 8) return { kind: "yard", p: "green",  cls: ["lui-y", LANE_CLS.green] };
    if (r > 8 && c > 8) return { kind: "yard", p: "yellow", cls: ["lui-y", LANE_CLS.yellow] };
    if (r > 8 && c < 6) return { kind: "yard", p: "blue",   cls: ["lui-y", LANE_CLS.blue] };
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return { kind: "center", cls: ["lui-ct"] };
    var lane = null;
    if (r === 7 && c >= 1 && c <= 5) lane = "red";
    else if (c === 7 && r >= 1 && r <= 5) lane = "green";
    else if (r === 7 && c >= 9 && c <= 13) lane = "yellow";
    else if (c === 7 && r >= 9 && r <= 13) lane = "blue";
    else if (r === 6 && c === 1) lane = "red";
    else if (r === 1 && c === 8) lane = "green";
    else if (r === 8 && c === 13) lane = "yellow";
    else if (r === 13 && c === 6) lane = "blue";
    if (lane) return { kind: "lane", p: lane, cls: ["lui-c", LANE_CLS[lane]] };
    return { kind: "path", cls: ["lui-p"] };
  }

  function buildDeco() {
    var d = document.createElement("div");
    d.className = "lui-deco";
    d.setAttribute("aria-hidden", "true");
    var h = "";
    ORDER.forEach(function (p) {
      var o = YARD_ORIGIN[p], c = PAL[p];
      h += '<div class="lui-yard" style="left:' + (o[1] / N * 100) + "%;top:" + (o[0] / N * 100) +
        "%;--b:" + c.base + ";--l:" + c.light + ";--d:" + c.dark + '"><div class="lui-yard-in"></div>';
      SOCK.forEach(function (s) {
        h += '<i class="lui-sock" style="left:' + (s[0] / 6 * 100 - 10.4) + "%;top:" + (s[1] / 6 * 100 - 10.4) + '%"></i>';
      });
      h += "</div>";
    });
    h += '<div class="lui-centre"><svg viewBox="0 0 3 3" preserveAspectRatio="none">' +
      '<polygon points="0,0 1.5,1.5 0,3" fill="' + PAL.red.base + '"/>' +
      '<polygon points="0,0 3,0 1.5,1.5" fill="' + PAL.green.base + '"/>' +
      '<polygon points="3,0 3,3 1.5,1.5" fill="' + PAL.yellow.base + '"/>' +
      '<polygon points="0,3 3,3 1.5,1.5" fill="' + PAL.blue.base + '"/>' +
      '<g stroke="#fff" stroke-width=".05" stroke-linejoin="round" fill="none">' +
      '<polygon points="0,0 1.5,1.5 0,3"/><polygon points="0,0 3,0 1.5,1.5"/>' +
      '<polygon points="3,0 3,3 1.5,1.5"/><polygon points="0,3 3,3 1.5,1.5"/></g></svg></div>';
    d.innerHTML = h;
    return d;
  }

  function playerNamesHtml() {
    if (!S || !S.p || !S.cols || S.setup) return "";
    var positions = [
      { left: "2%", top: "2%", color: PAL.red.base },
      { right: "2%", top: "2%", color: PAL.green.base },
      { right: "2%", bottom: "2%", color: PAL.yellow.dark },
      { left: "2%", bottom: "2%", color: PAL.blue.base }
    ];
    var labels = "";
    S.p.forEach(function (_, player) {
      var seen = {};
      (S.cols[player] || []).forEach(function (color) {
        if (seen[color]) return;
        seen[color] = true;
        var pos = positions[color];
        labels += '<span class="lui-player-name" style="position:absolute;' + (pos.left ? "left:" + pos.left + ";" : "") +
          (pos.right ? "right:" + pos.right + ";" : "") + (pos.top ? "top:" + pos.top + ";" : "") +
          (pos.bottom ? "bottom:" + pos.bottom + ";" : "") +
          "z-index:20;display:block;box-sizing:border-box;max-width:46%;overflow:hidden;padding:4px 8px;border:2px solid #fff;border-radius:999px;" +
          "background:" + pos.color + ";color:#fff;font:800 clamp(10px,2.2vw,15px)/1.2 system-ui,sans-serif;" +
          "text-align:center;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 2px 6px #0009;pointer-events:none;" +
          "rotate:var(--lui-unrot,0deg);transform-origin:center;transition:rotate .35s ease\">" +
          escapeHtml(playerName(player)) + "</span>";
      });
    });
    return labels ? '<div class="lui-player-names" style="position:absolute;inset:0;z-index:20;pointer-events:none">' +
      labels + "</div>" : "";
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */
  function slotFor(p, key) {
    var m = slotMaps[p];
    if (m.has(key)) return m.get(key);
    if (m.size >= 4) m.clear();
    var used = new Set(m.values()), s = 0;
    while (used.has(s)) s++;
    m.set(key, s);
    return s;
  }

  function stackOffset(k, n) {
    if (n === 2) return [[-0.2, 0], [0.2, 0]][k];
    if (n === 3) return [[-0.2, -0.18], [0.2, -0.18], [0, 0.22]][k];
    if (n === 4) return [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]][k];
    var columns = Math.ceil(Math.sqrt(n));
    var rows = Math.ceil(n / columns);
    var size = columns === 3 ? 0.3 : 0.21;
    var step = columns === 3 ? 0.32 : 0.24;
    return [
      (k % columns - (columns - 1) / 2) * step,
      (Math.floor(k / columns) - (rows - 1) / 2) * step,
      size
    ];
  }

  function setTranslate(tk, dx, dy, size) {
    tk.style.translate = (dx / size * 100).toFixed(2) + "% " + (dy / size * 100).toFixed(2) + "%";
  }

  function nearestPlayer(css) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(css || "");
    if (!m) return "";
    var best = "", bd = 1e9;
    ORDER.forEach(function (p) {
      var c = PAL[p].rgb;
      var d = Math.pow(c[0] - m[1], 2) + Math.pow(c[1] - m[2], 2) + Math.pow(c[2] - m[3], 2);
      if (d < bd) { bd = d; best = p; }
    });
    return bd < 9000 ? best : "";
  }

  function readStatus(grid) {
    if (lastStatus) return lastStatus;
    var p = grid.parentElement;
    if (!p) return "";
    for (var i = 0; i < p.children.length; i++) {
      var ch = p.children[i];
      if (ch === grid || ch.classList.contains("lui-win")) continue;
      if (ch.querySelector && ch.querySelector(".g.c15")) continue;
      var t = (ch.textContent || "").trim();
      if (t && t.length < 120 && WIN_RE.test(t)) return t;
    }
    return "";
  }

  /* ------------------------------------------------------------------ */
  /* rotate board (this screen only)                                     */
  /*  The board is turned with CSS on this client; nothing is sent to    */
  /*  the game, so every player can choose their own side.               */
  /* ------------------------------------------------------------------ */
  function loadRotation() {
    try {
      var v = parseInt(window.localStorage.getItem(ROT_KEY), 10);
      if (v >= 0 && v <= 3) { rotQ = v; rotAcc = v * 90; }
    } catch (e) { /* storage unavailable: start unrotated */ }
  }

  function saveRotation() {
    try { window.localStorage.setItem(ROT_KEY, String(rotQ)); } catch (e) { /* ignore */ }
  }

  /* a screen-space offset (x right, y down) expressed in the board's own (turned) frame */
  function toLocal(x, y) {
    return [x * COS[rotQ] + y * SIN[rotQ], -x * SIN[rotQ] + y * COS[rotQ]];
  }

  /* sets the rotation and matching light/shadow directions on one board */
  function applyRotation(grid) {
    var st = grid.style;
    st.setProperty("--lui-rot", rotAcc + "deg");
    st.setProperty("--lui-unrot", (-rotAcc) + "deg");      /* cancels the turn for stars and the setup card */
    var hi = toLocal(-18, -22), lo = toLocal(20, 30), dr = toLocal(0, 2), ins = toLocal(0, -3);
    st.setProperty("--lui-hx", (50 + hi[0]) + "%");        /* token highlight stays at the top-left of the screen */
    st.setProperty("--lui-hy", (50 + hi[1]) + "%");
    st.setProperty("--lui-gx", (50 + lo[0]) + "%");        /* token shade stays at the bottom-right */
    st.setProperty("--lui-gy", (50 + lo[1]) + "%");
    st.setProperty("--lui-ox", dr[0] + "px");              /* drop shadow stays below the token */
    st.setProperty("--lui-oy", dr[1] + "px");
    st.setProperty("--lui-ix", ins[0] + "px");
    st.setProperty("--lui-iy", ins[1] + "px");
  }

  function ensureRotBtn() {
    if (rotBtn && rotBtn.isConnected) return rotBtn;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lui-rot";
    b.title = "Rotate board (this screen only)";
    b.setAttribute("aria-label", "Rotate board (this screen only)");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"/>' +
      '<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    b.firstChild.style.transform = "rotate(" + rotAcc + "deg)";
    b.addEventListener("click", function () { rotateBoard(1); });
    document.body.appendChild(b);
    rotBtn = b;
    return b;
  }

  function positionRotBtn(grid) {
    if (!grid) return;
    rotGrid = grid;
    if (!rotBtn || !rotBtn.isConnected) return;
    var rect = grid.getBoundingClientRect();
    rotBtn.style.setProperty("--lui-center-x", (rect.left + rect.width / 2) + "px");
    rotBtn.style.setProperty("--lui-center-y", (rect.top + rect.height / 2) + "px");
  }

  function showRotBtn(on) {
    if (on) {
      var button = ensureRotBtn();
      positionRotBtn(document.querySelector(".g.c15.lui"));
      button.classList.add("on");
    }
    else if (rotBtn) rotBtn.classList.remove("on");
  }

  /* turn the board by n quarter turns clockwise (negative = anticlockwise) on this screen */
  function rotateBoard(step) {
    var n = typeof step === "number" && isFinite(step) ? Math.round(step) : 1;
    if (!n) return;
    rotAcc += n * 90;
    rotQ = (((rotQ + n) % 4) + 4) % 4;
    saveRotation();
    var grids = document.querySelectorAll(".g.c15");
    for (var i = 0; i < grids.length; i++) applyRotation(grids[i]);
    if (rotBtn && rotBtn.firstChild) rotBtn.firstChild.style.transform = "rotate(" + rotAcc + "deg)";
    positionRotBtn(rotGrid);
  }

  /* ------------------------------------------------------------------ */
  /* smooth movement                                                     */
  /* ------------------------------------------------------------------ */
  function glide(el, dxPx, dyPx, distCells) {
    if (reduced() || !el.animate) return;
    var dur = Math.max(300, Math.min(760, 260 + distCells * 42));
    var lift = Math.min(20, 8 + distCells * 1.6);
    /* the hop always goes "up" on the screen, whatever way the board is turned */
    var lx = -SIN[rotQ] * lift, ly = -COS[rotQ] * lift;
    var squash = rotQ % 2 ? "scale(.9,1.1)" : "scale(1.1,.9)";
    el.style.zIndex = "30";
    var a = el.animate([
      { transform: "translate(" + dxPx + "px," + dyPx + "px) scale(1)", offset: 0 },
      { transform: "translate(" + (dxPx / 2 + lx) + "px," + (dyPx / 2 + ly) + "px) scale(1.3)", offset: 0.5 },
      { transform: "translate(0,0) " + squash, offset: 0.88 },
      { transform: "translate(0,0) scale(1)", offset: 1 }
    ], { duration: dur, easing: "cubic-bezier(.33,.05,.25,1)", fill: "backwards" });
    var done = function () { el.style.zIndex = ""; };
    a.onfinish = done;
    a.oncancel = done;
  }

  function animateMoves(prev, cur, width) {
    if (!prev || !prev.length) return;
    var groups = {};
    prev.forEach(function (t) { (groups[t.col] = groups[t.col] || { o: [], n: [] }).o.push(t); });
    cur.forEach(function (t) { (groups[t.col] = groups[t.col] || { o: [], n: [] }).n.push(t); });
    Object.keys(groups).forEach(function (k) {
      var o = groups[k].o.slice(), moved = [];
      groups[k].n.forEach(function (t) {
        var i = -1;
        for (var j = 0; j < o.length; j++) if (o[j].key === t.key) { i = j; break; }
        if (i >= 0) o.splice(i, 1); else moved.push(t);
      });
      moved.forEach(function (t) {
        if (!o.length) return;
        var bi = 0, bd = 1e9;
        o.forEach(function (x, i) {
          var d = Math.hypot(x.fx - t.fx, x.fy - t.fy);
          if (d < bd) { bd = d; bi = i; }
        });
        var from = o.splice(bi, 1)[0];
        glide(t.el, (from.fx - t.fx) * width, (from.fy - t.fy) * width, bd * N);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* decorate one board                                                  */
  /* ------------------------------------------------------------------ */
  function decorate(grid, gi) {
    var cells = grid.querySelectorAll(".lc");
    if (cells.length !== N * N) return null;

    grid.classList.add("lui");
    applyRotation(grid);     /* before any style read, so a fresh board never animates from 0 */
    if (!entered && !reduced()) {
      entered = true;
      grid.classList.add("lui-enter");
      grid.addEventListener("animationend", function (e) {
        if (e.target === grid) grid.classList.remove("lui-enter");
      });
    }
    if (!grid.querySelector(".lui-deco")) grid.appendChild(buildDeco());

    var tokens = [], hostStar = false, centre = {}, firstMv = null;

    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i], r = (i / N) | 0, c = i % N, info = cellInfo(r, c);
      for (var q = 0; q < info.cls.length; q++) cell.classList.add(info.cls[q]);

      /* stars: wrap the host's ★ text (or reuse an existing wrapper) */
      var nodes = cell.childNodes;
      for (var w = 0; w < nodes.length; w++) {
        var nd = nodes[w];
        if (nd.nodeType === 3 && nd.nodeValue.indexOf("\u2605") > -1) {
          nd.nodeValue = nd.nodeValue.replace(/\u2605/g, "");
          hostStar = true;
          if (!cell.querySelector(".lui-star")) cell.appendChild(makeStar(r, c));
        }
      }
      var old = cell.querySelector(".ludo-safe-star");
      if (old) { hostStar = true; old.style.display = "none"; if (!cell.querySelector(".lui-star")) cell.appendChild(makeStar(r, c)); }
      if (cell.querySelector(".lui-star")) hostStar = true;

      var list = cell.querySelectorAll(".tk");
      if (list.length) cell.classList.add("lui-busy"); else cell.classList.remove("lui-busy");

      for (var k = 0; k < list.length; k++) {
        var tk = list[k], dx = 0, dy = 0;
        if (info.kind === "yard") {
          tk.classList.remove("sm");
          tk.classList.remove("xs", "xxs");
          var slot = slotFor(info.p, i + ":" + k);
          var o = YARD_ORIGIN[info.p];
          dx = o[1] + SOCK[slot][0] - (c + 0.5);
          dy = o[0] + SOCK[slot][1] - (r + 0.5);
          setTranslate(tk, dx, dy, TK);
        } else if (list.length > 1) {
          tk.classList.remove("sm", "xs", "xxs");
          var so = stackOffset(k, list.length);
          var size = so[2] || SM;
          tk.classList.add(size === SM ? "sm" : size === 0.3 ? "xs" : "xxs");
          dx = so[0]; dy = so[1];
          setTranslate(tk, dx, dy, size);
        } else {
          tk.classList.remove("sm", "xs", "xxs");
          tk.style.translate = "";
        }
        tokens.push({ el: tk, cell: i, r: r, c: c, dx: dx, dy: dy, kind: info.kind });
      }
    }

    /* fallback stars if the host does not render any */
    if (!hostStar) {
      Object.keys(STARS).forEach(function (key) {
        var rc = key.split(",");
        cells[+rc[0] * N + +rc[1]].appendChild(makeStar(+rc[0], +rc[1]));
      });
    }

    /* reads happen after all writes */
    var cur = tokens.map(function (t) {
      var col = getComputedStyle(t.el).backgroundColor;
      if (t.el.classList.contains("mv")) {
        t.el.style.setProperty("--tc", col);
        t.el.setAttribute("role", "button");
        t.el.setAttribute("tabindex", "0");
        var who = nearestPlayer(col);
        t.el.setAttribute("aria-label", "Move " + (who ? PAL[who].name + " " : "") + "token");
        if (!firstMv) firstMv = t.el;
      }
      if (t.kind === "center") centre[col] = (centre[col] || 0) + 1;
      return {
        el: t.el,
        col: col,
        fx: (t.c + 0.5 + t.dx) / N,
        fy: (t.r + 0.5 + t.dy) / N,
        key: t.cell + "|" + t.dx.toFixed(2) + "|" + t.dy.toFixed(2)
      };
    });

    animateMoves(snaps[gi], cur, grid.clientWidth || grid.getBoundingClientRect().width);
    snaps[gi] = cur.map(function (t) { return { col: t.col, fx: t.fx, fy: t.fy, key: t.key }; });

    if (firstMv && performance.now() < focusUntil) {
      focusUntil = 0;
      try { firstMv.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* structural win: all 4 tokens of one colour in the centre.
       Not used in 2-house mode (a player needs all 8 tokens home there;
       the game's own "... wins!" status triggers the celebration instead). */
    var structWinner = "";
    if (!twoHouseMode()) {
      Object.keys(centre).forEach(function (col) {
        if (centre[col] >= 4) structWinner = nearestPlayer(col) || "gold";
      });
    }
    return { grid: grid, structWinner: structWinner };
  }

  function makeStar(r, c) {
    var s = document.createElement("span");
    s.className = "lui-star";
    s.setAttribute("aria-label", "Safe square");
    s.textContent = "\u2605";
    var p = STARS[r + "," + c];
    if (p) s.style.color = PAL[p].base;
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* win detection                                                       */
  /* ------------------------------------------------------------------ */
  function updateWin(results) {
    if (!results.length) return;
    var first = results[0], status = readStatus(first.grid);
    var matched = WIN_RE.test(status);
    var active = !!first.structWinner || matched;

    if (active) {
      var color = first.structWinner && first.structWinner !== "gold" ? first.structWinner : "";
      if (!color) {
        var m = /\b(red|green|yellow|blue)\b/i.exec(status);
        if (m) color = m[1].toLowerCase();
      }
      if (!winActive) {
        winActive = true;
        winColor = color;
        var title = (matched && status.length <= 50) ? status :
          (Number.isInteger(S.win) ? playerName(S.win) + " wins!" : "We have a winner!");
        showCelebration({
          color: color,
          title: title,
          sub: (matched && title !== status && status.length <= 90) ? status : ""
        });
      }
    } else if (winActive && !manualWin) {
      winActive = false;
      winColor = "";
      hideCelebration();
    }

    results.forEach(function (r) {
      r.grid.classList.toggle("lui-won", winActive);
      if (winActive) r.grid.style.setProperty("--w", (PAL[winColor] || GOLD).base);
    });
  }

  /* ------------------------------------------------------------------ */
  /* celebration                                                         */
  /* ------------------------------------------------------------------ */
  var winEl = null, stopFx = null;

  function showCelebration(o) {
    hideCelebration(true);
    var pal = PAL[o.color] || GOLD;
    var el = document.createElement("div");
    el.className = "lui-win";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Game won");
    el.style.setProperty("--w", pal.base);
    el.style.setProperty("--wd", pal.dark);
    el.innerHTML =
      '<div class="lui-win-bg"></div><canvas class="lui-confetti"></canvas>' +
      '<div class="lui-win-card"><div class="lui-trophy" aria-hidden="true">\uD83C\uDFC6</div>' +
      '<h2 class="lui-win-title"></h2><p class="lui-win-sub"></p>' +
      '<button type="button" class="lui-win-btn">Close</button></div>';
    el.querySelector(".lui-win-title").textContent = o.title;
    var sub = el.querySelector(".lui-win-sub");
    if (o.sub && o.sub !== o.title) sub.textContent = o.sub; else sub.remove();
    el.querySelector(".lui-win-btn").addEventListener("click", function () { hideCelebration(); });
    el.querySelector(".lui-win-bg").addEventListener("click", function () { hideCelebration(); });
    document.body.appendChild(el);
    winEl = el;
    document.addEventListener("keydown", onEsc);
    stopFx = launchFx(el.querySelector(".lui-confetti"));
    try { el.querySelector(".lui-win-btn").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    if (navigator.vibrate) { try { navigator.vibrate([90, 50, 90, 50, 220]); } catch (e) { /* ignore */ } }
  }

  function hideCelebration(immediate) {
    document.removeEventListener("keydown", onEsc);
    if (!immediate) manualWin = false;
    if (stopFx) { stopFx(); stopFx = null; }
    var el = winEl;
    winEl = null;
    if (!el) return;
    if (immediate || reduced()) { el.remove(); return; }
    el.classList.add("lui-out");
    setTimeout(function () { el.remove(); }, 300);
  }

  function onEsc(e) { if (e.key === "Escape") hideCelebration(); }

  function launchFx(canvas) {
    if (reduced() || !canvas.getContext) return function () {};
    var ctx = canvas.getContext("2d");
    if (!ctx) return function () {};
    var W = 0, H = 0, dpr = 1, raf = 0, alive = true;
    var start = performance.now(), last = start;
    var parts = [], sparks = [], events = [];
    var colors = ORDER.map(function (p) { return PAL[p].base; }).concat(["#ffd23f", "#ffffff", "#ff7ab8"]);
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function burst(x, y, dirDeg, spreadDeg, count) {
      var power = Math.max(650, H * 1.15);
      for (var i = 0; i < count; i++) {
        var a = (dirDeg + rnd(-spreadDeg / 2, spreadDeg / 2)) * Math.PI / 180;
        var sp = rnd(0.45, 1) * power;
        parts.push(piece(x, y, Math.cos(a) * sp, Math.sin(a) * sp));
      }
    }
    function piece(x, y, vx, vy) {
      return {
        x: x, y: y, vx: vx, vy: vy, w: rnd(7, 13), h: rnd(5, 9), rot: rnd(0, 6.28), vr: rnd(-8, 8),
        tilt: rnd(0, 6.28), vt: rnd(5, 11), color: pick(colors), round: Math.random() < 0.25
      };
    }
    function firework(x, y) {
      var col = pick(colors), n = 70;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + rnd(-0.05, 0.05), sp = rnd(120, 360);
        sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.9, 1.5), color: Math.random() < 0.3 ? "#ffffff" : col });
      }
    }

    events.push({ t: 0.0, fn: function () { burst(0, H, -58, 40, 110); burst(W, H, -122, 40, 110); } });
    events.push({ t: 0.35, fn: function () { firework(W * rnd(0.2, 0.4), H * rnd(0.15, 0.4)); } });
    events.push({ t: 0.6, fn: function () { burst(0, H, -62, 36, 70); burst(W, H, -118, 36, 70); } });
    events.push({ t: 0.9, fn: function () { firework(W * rnd(0.6, 0.8), H * rnd(0.15, 0.4)); } });
    events.push({ t: 1.5, fn: function () { firework(W * rnd(0.4, 0.6), H * rnd(0.1, 0.3)); } });
    events.push({ t: 2.1, fn: function () { burst(W / 2, H * 0.95, -90, 70, 100); } });
    events.push({ t: 2.6, fn: function () { firework(W * rnd(0.15, 0.35), H * rnd(0.2, 0.45)); firework(W * rnd(0.65, 0.85), H * rnd(0.2, 0.45)); } });
    events.push({ t: 3.6, fn: function () { burst(0, H, -60, 40, 60); burst(W, H, -120, 40, 60); } });

    function frame(now) {
      if (!alive) return;
      var dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      var el = (now - start) / 1000;

      while (events.length && events[0].t <= el) events.shift().fn();
      if (el > 0.8 && el < 5) {
        var rain = Math.round(90 * dt + Math.random());
        for (var r = 0; r < rain; r++) parts.push(piece(rnd(0, W), -12, rnd(-60, 60), rnd(40, 160)));
      }

      ctx.clearRect(0, 0, W, H);

      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy += 1000 * dt;
        p.vx *= Math.exp(-1.3 * dt);
        p.vy *= Math.exp(-0.9 * dt);
        if (p.vy > 330) p.vy = 330;
        p.x += (p.vx + Math.sin(p.tilt) * 40) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.tilt += p.vt * dt;
        if (p.y > H + 24) { parts.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.color;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, 6.283); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      ctx.globalCompositeOperation = "lighter";
      for (var j = sparks.length - 1; j >= 0; j--) {
        var s = sparks[j];
        s.life += dt;
        if (s.life > s.max) { sparks.splice(j, 1); continue; }
        s.vy += 260 * dt;
        s.vx *= Math.exp(-2.2 * dt);
        s.vy *= Math.exp(-2.2 * dt);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.globalAlpha = Math.max(0, 1 - s.life / s.max);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.4, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (el > 6 && !parts.length && !sparks.length && !events.length) { stop(); return; }
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, W, H);
    }
    raf = requestAnimationFrame(frame);
    return stop;
  }

  /* ------------------------------------------------------------------ */
  /* keyboard support                                                    */
  /* ------------------------------------------------------------------ */
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains("tk") || !t.classList.contains("mv")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      focusUntil = performance.now() + 1500;
      t.click();
      return;
    }
    var dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    var all = Array.prototype.slice.call(document.querySelectorAll(".g.c15 .tk.mv"));
    if (all.length < 2) return;
    e.preventDefault();
    all[(all.indexOf(t) + dir + all.length) % all.length].focus();
  });

  /* ------------------------------------------------------------------ */
  /* wide-screen layout: dice + roll button go to the right of the board */
  /* (finds the controls automatically; CSS only applies on wide screens) */
  /* ------------------------------------------------------------------ */
  var layoutRoot = null, layoutWarned = false;
  var ROLL_SEL = '[data-i="roll"],[data-i*="roll"],[data-i*="dice"],[id*="dice" i],[id*="roll" i],' +
                 '[class*="dice" i],[class~="die"],[class*="roll" i]';

  function isRollControl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.querySelector(".g.c15") || el.classList.contains("g")) return false;
    try { if (el.matches(ROLL_SEL) || el.querySelector(ROLL_SEL)) return true; } catch (e) { /* ignore */ }
    var btns = el.matches("button") ? [el] : Array.prototype.slice.call(el.querySelectorAll("button,[role=button]"));
    return btns.some(function (b) { return /\broll\b/i.test(b.textContent || ""); });
  }

  function clearLayout(root) {
    if (!root) return;
    root.classList.remove("lui-wide");
    root.style.removeProperty("--lui-rows");
    Array.prototype.forEach.call(root.children, function (c) {
      c.classList.remove("lui-board", "lui-side", "lui-full");
      c.style.removeProperty("--lui-row");
    });
  }

  function applyWideLayout(grid) {
    var branch = grid, root = grid.parentElement, levels = 0;
    while (root && root !== document.body && root !== document.documentElement && levels < 4) {
      var kids = Array.prototype.filter.call(root.children, function (c) {
        return !/^(SCRIPT|STYLE|LINK)$/.test(c.tagName) && !c.classList.contains("lui-win") && !c.classList.contains("lui-timer");
      });
      var sideKids = kids.filter(function (c) { return c !== branch && isRollControl(c); });
      if (sideKids.length) {
        if (layoutRoot && layoutRoot !== root) clearLayout(layoutRoot);
        layoutRoot = root;
        var bi = kids.indexOf(branch), before = [], after = [];
        kids.forEach(function (c, i) {
          if (c === branch || sideKids.indexOf(c) > -1) return;
          (i < bi ? before : after).push(c);
        });
        var rows = [];
        before.forEach(function () { rows.push("auto"); });
        rows.push("1fr");
        sideKids.forEach(function () { rows.push("auto"); });
        rows.push("1fr");
        after.forEach(function () { rows.push("auto"); });

        root.classList.add("lui-wide");
        root.style.setProperty("--lui-rows", rows.join(" "));
        before.forEach(function (c, i) { c.classList.remove("lui-side", "lui-board"); c.classList.add("lui-full"); c.style.setProperty("--lui-row", String(i + 1)); });
        branch.classList.remove("lui-side", "lui-full");
        branch.classList.add("lui-board");
        branch.style.setProperty("--lui-row", (before.length + 1) + " / span " + (sideKids.length + 2));
        sideKids.forEach(function (c, i) { c.classList.remove("lui-full", "lui-board"); c.classList.add("lui-side"); c.style.setProperty("--lui-row", String(before.length + 2 + i)); });
        after.forEach(function (c, i) { c.classList.remove("lui-side", "lui-board"); c.classList.add("lui-full"); c.style.setProperty("--lui-row", String(before.length + sideKids.length + 3 + i)); });
        return;
      }
      branch = root;
      root = root.parentElement;
      levels++;
    }
    if (layoutRoot) { clearLayout(layoutRoot); layoutRoot = null; }
    if (!layoutWarned && window.console) {
      layoutWarned = true;
      console.info("[ludo] wide layout: could not find the dice / roll button next to the board, so the layout was left unchanged.");
    }
  }

  /* ------------------------------------------------------------------ */
  /* auto move                                                           */
  /*  - exactly 1 movable token  -> it moves by itself                   */
  /*  - 2+ movable tokens        -> 15 s countdown; if the player does   */
  /*                                nothing, a movable token is played   */
  /* Options (set before or during play):                                */
  /*   window.ludoAutoMove = false          turn the feature off         */
  /*   window.ludoMoveSeconds = 15          countdown length             */
  /*   window.ludoIsBotTurn = function(p){} return true for computer     */
  /*                                        seats if your host has any   */
  /* ------------------------------------------------------------------ */
  var AUTO_SINGLE_DELAY = 650;   /* ms: lets the player see the dice first        */
  var AUTO_SHOW_DELAY = 1200;    /* ms: countdown pill appears after this         */
  var auto = { key: "", single: 0, tick: 0, box: null, fill: null, text: null };

  function gameState() {
    try { return typeof S === "object" && S ? S : null; } catch (e) { return null; }
  }

  function movableEls() {
    return Array.prototype.slice.call(document.querySelectorAll(".g.c15 .tk.mv"));
  }

  function autoSeconds() {
    var n = Number(window.ludoMoveSeconds);
    return n > 0 ? n : 15;
  }

  function ensureTimerBox() {
    if (auto.box && auto.box.isConnected) return auto.box;
    var box = document.createElement("div");
    box.className = "lui-timer";
    box.setAttribute("aria-hidden", "true");
    var text = document.createTextNode("");
    var label = document.createElement("div");
    label.appendChild(text);
    var bar = document.createElement("div");
    bar.className = "lui-timer-bar";
    var fill = document.createElement("div");
    fill.className = "lui-timer-fill";
    bar.appendChild(fill);
    box.appendChild(label);
    box.appendChild(bar);
    document.body.appendChild(box);
    auto.box = box; auto.fill = fill; auto.text = text;
    return box;
  }

  function cancelAuto() {
    clearTimeout(auto.single);
    clearInterval(auto.tick);
    auto.single = 0;
    auto.tick = 0;
    auto.key = "";
    if (auto.box) auto.box.style.display = "none";
  }

  function fireAuto(key) {
    if (auto.key !== key) return;
    var st = gameState();
    var els = movableEls();
    if (!st || st.over || !st.die || !els.length) { cancelAuto(); return; }

    var pick = els[0];
    if (els.length > 1) {
      var ids = els.map(function (el) { return Number(el.getAttribute("data-token")); });
      var choice = typeof chooseBotToken === "function"
        ? chooseBotToken(st.t, st.die, ids)
        : ids[Math.floor(Math.random() * ids.length)];
      pick = els.filter(function (el) { return Number(el.getAttribute("data-token")) === choice; })[0] || els[0];
    }
    cancelAuto();
    auto.key = key;      /* if the host ignores this click we do not retry in a loop */
    pick.click();
  }

  function startCountdown(key) {
    var t0 = Date.now(), total = autoSeconds() * 1000;
    var box = ensureTimerBox();
    box.classList.remove("lui-low");
    auto.tick = setInterval(function () {
      var elapsed = Date.now() - t0, left = total - elapsed;
      if (left <= 0) { fireAuto(key); return; }
      if (elapsed < AUTO_SHOW_DELAY) return;
      var secs = Math.ceil(left / 1000);
      auto.text.data = "Pick a token \u00b7 auto-move in " + secs + "s";
      auto.fill.style.width = (left / total * 100).toFixed(1) + "%";
      box.classList.toggle("lui-low", secs <= 5);
      box.style.display = "flex";
    }, 200);
  }

  function syncAuto() {
    var st = gameState();
    if (window.ludoAutoMove === false || !st || st.over || st.setup || winActive || !st.die) { cancelAuto(); return; }
    if (typeof isLocalComputerGame === "function" && isLocalComputerGame()) { cancelAuto(); return; }
    if (typeof window.ludoIsBotTurn === "function") {
      try { if (window.ludoIsBotTurn(st.t)) { cancelAuto(); return; } } catch (e) { /* ignore */ }
    }
    var els = movableEls();
    if (!els.length) { cancelAuto(); return; }

    var key = st.moves + ":" + st.t + ":" + st.die + ":" + els.map(function (el) {
      return el.getAttribute("data-player") + "-" + el.getAttribute("data-token");
    }).join(",");
    if (key === auto.key) return;      /* same position as before: keep the running timer */

    cancelAuto();
    auto.key = key;
    if (els.length === 1) {
      auto.single = setTimeout(function () { fireAuto(key); }, AUTO_SINGLE_DELAY);
    } else {
      startCountdown(key);
    }
  }

  /* ------------------------------------------------------------------ */
  /* observer + optional game hook                                       */
  /* ------------------------------------------------------------------ */
  var obs = null;

  function pass() {
    if (!document.querySelector(".g.c15")) { cancelAuto(); showRotBtn(false); return; }
    if (obs) obs.disconnect();
    try {
      addStyles();
      var results = [];
      var grids = document.querySelectorAll(".g.c15");
      for (var i = 0; i < grids.length; i++) {
        var res = decorate(grids[i], i);
        if (res) results.push(res);
      }
      updateWin(results);
      if (grids.length) applyWideLayout(grids[0]);
      showRotBtn(results.length > 0);
      syncAuto();
    } catch (err) {
      if (window.console) console.warn("[ludo-ui]", err);
    } finally {
      if (obs) obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  function start() {
    addStyles();
    window.addEventListener("resize", function () { positionRotBtn(rotGrid); }, { passive: true });
    obs = new MutationObserver(pass);
    obs.observe(document.body, { childList: true, subtree: true });
    pass();
  }

  function hookGame(game) {
    if (!game || game.__luiHooked || typeof game.draw !== "function") return false;
    var original = game.draw;
    game.draw = function () {
      var result = original.apply(this, arguments);
      if (Array.isArray(result) && result[1] != null) lastStatus = String(result[1]);
      return result;
    };
    game.__luiHooked = true;
    return true;
  }

  /* ================================================================== */
  /* GAME RULES                                                          */
  /*                                                                    */
  /* Token position:  -1 yard | 0..50 shared track (0 = own start)      */
  /*                  51..55 home lane | 56 home                        */
  /*                                                                    */
  /* S.cols[player] = colour indexes (0 red, 1 green, 2 yellow, 3 blue) */
  /* of the house(s) that player hosts; token>>2 picks the house.       */
  /* S.setup: 1 = choosing houses per player (2 players only),          */
  /*          2 = choosing the house colour, 0 = playing.               */
  /* ================================================================== */
  var TRACK = [
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6],
    [0, 6], [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10],
    [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14], [8, 13], [8, 12], [8, 11],
    [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7],
    [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3],
    [8, 2], [8, 1], [8, 0], [7, 0], [6, 0]
  ];
  var STARTS = [0, 13, 26, 39];
  var LANES = [
    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
  ];
  var FINISH = [[7, 6], [6, 7], [7, 8], [8, 7]];
  var YARDS = [[0, 0], [0, 9], [9, 9], [9, 0]];
  var YARD_SLOTS = [[2, 2], [2, 4], [4, 2], [4, 4]];
  var SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  var TOKEN_COLORS = [PAL.red.base, PAL.green.base, PAL.yellow.base, PAL.blue.base];
  var TOKEN_NAMES = ORDER.map(function (color) { return PAL[color].name; });

  var LAST_TRACK = 50;   // last shared-track square before the home lane
  var HOME = 56;         // finished

  function playerCount() {
    return typeof np === "number" ? Math.max(2, Math.min(4, np)) : 2;
  }

  function ordinal(position) {
    var remainder = position % 100;
    var suffix = remainder >= 11 && remainder <= 13 ? "th" :
      position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
    return position + suffix;
  }

  function placementSummary() {
    var places = (S.placements || []).map(function (player, index) {
      return ordinal(index + 1) + ": " + playerName(player);
    });
    if (Number.isInteger(S.loser)) places.push("Lost: " + playerName(S.loser));
    return places;
  }

  function finishGame() {
    S.over = 1;
    S.win = S.placements[0];
    S.msg = playerName(S.win) + " wins! " + placementSummary().join(" · ");
  }

  /* true only for a 2-player game where each player owns 2 houses */
  function twoHouseMode() {
    return typeof S === "object" && !!S && !!S.p && S.p.length === 2 && S.h === 2;
  }

  function tokensPerPlayer() {
    return twoHouseMode() ? 8 : 4;
  }

  /* which colours each player hosts, given the colour player 1 picked (c) */
  function assignColors(count, houses, c) {
    if (houses === 2) {                       // 2 players, diagonal pairs: Red+Yellow or Green+Blue
      var a = c % 2;
      return [[a, a + 2], [1 - a, 3 - a]];
    }
    if (count === 2) return [[c], [(c + 2) % 4]];   // 2 players: opposite houses
    var out = [];
    for (var i = 0; i < count; i++) out.push([(c + i) % 4]);   // 3-4 players: next colours clockwise
    return out;
  }

  function makeTokens(count, houses) {
    return Array.from({ length: count }, function () {
      return Array.from({ length: houses === 2 ? 8 : 4 }, function () { return -1; });
    });
  }

  /* colour index (0 red, 1 green, 2 yellow, 3 blue) of one of a player's tokens */
  function colorOf(player, token) {
    var cols = S.cols && S.cols[player];
    if (!cols) return player;                  // safety net for a state without cols
    return cols[Math.min(token >> 2, cols.length - 1)];
  }

  function playerName(player) {
    return typeof nm === "function" ? nm(player) : TOKEN_NAMES[player];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function tokenCoords(player, position, token) {
    var color = colorOf(player, token);
    if (position < 0) {
      var yard = YARDS[color], slot = YARD_SLOTS[token % 4];
      return [yard[0] + slot[0], yard[1] + slot[1]];
    }
    if (position <= LAST_TRACK) return TRACK[(STARTS[color] + position) % TRACK.length];
    if (position < HOME) return LANES[color][position - (LAST_TRACK + 1)];
    return FINISH[color];
  }

  /* true if another token of the SAME COLOUR already stands on that square
     (yard and home are shared spaces, so they never block) */
  function blockedBySameColor(player, token, to) {
    if (to < 0 || to >= HOME) return false;
    var color = colorOf(player, token);
    /* your own home lane is shared: tokens of the same colour may stack there */
    if (to > LAST_TRACK) return false;
    /* safe squares (stars and start squares): any tokens may stay together */
    if (SAFE.has(pathIndex(color, to))) return false;
    return S.p[player].some(function (position, other) {
      return other !== token && position === to && colorOf(player, other) === color;
    });
  }

  function legalTokens(player, roll) {
    var moves = [];
    if (!roll || (S.placements || []).indexOf(player) >= 0) return moves;
    S.p[player].forEach(function (position, token) {
      var to = position < 0 ? 0 : position + roll;
      if (position < 0 ? roll !== 6 : to > HOME) return;
      if (blockedBySameColor(player, token, to)) return;
      moves.push(token);
    });
    return moves;
  }

  function advanceTurn() {
    for (var offset = 1; offset <= S.p.length; offset++) {
      var next = (S.t + offset) % S.p.length;
      if ((S.placements || []).indexOf(next) < 0) {
        S.t = next;
        break;
      }
    }
    S.sixes = 0;
  }

  function rollSides() {
    return (S.sixes || 0) >= 2 ? 5 : 6;
  }

  function pathIndex(color, position) {
    return (STARTS[color] + position) % TRACK.length;
  }

  /* Captures every rival token on the landing square unless it is safe.
     Tokens of the same player (both houses in 2-house mode) never capture
     each other. */
  function captureAt(player, token, position) {
    if (position < 0 || position > LAST_TRACK) return [];
    var landing = pathIndex(colorOf(player, token), position);
    if (SAFE.has(landing)) return [];
    var captured = [];
    S.p.forEach(function (opponent, otherPlayer) {
      if (otherPlayer === player) return;
      opponent.forEach(function (opponentPosition, otherToken) {
        if (opponentPosition >= 0 && opponentPosition <= LAST_TRACK &&
            pathIndex(colorOf(otherPlayer, otherToken), opponentPosition) === landing) {
          opponent[otherToken] = -1;
          var name = playerName(otherPlayer);
          if (captured.indexOf(name) < 0) captured.push(name);
        }
      });
    });
    return captured;
  }

  function applyRoll(roll) {
    if (!Number.isInteger(roll) || roll < 1 || roll > rollSides() || S.over || S.die ||
        (S.placements || []).indexOf(S.t) >= 0) return;
    S.sixes = roll === 6 ? (S.sixes || 0) + 1 : 0;
    S.die = roll;
    S.lastDie = roll;
    var moves = legalTokens(S.t, roll);
    if (!moves.length) {
      S.log = playerName(S.t) + " rolled " + roll + " but has no legal move.";
      S.die = 0;
      if (roll !== 6) advanceTurn();
    } else {
      S.log = playerName(S.t) + " rolled " + roll + (roll === 6 ? " and gets another roll after moving." : ". Choose a token.");
    }
  }

  function applyToken(token) {
    if (!Number.isInteger(token) || token < 0 || token >= tokensPerPlayer() || !S.die) return;
    var player = S.t, from = S.p[player][token], roll = S.die;
    if (legalTokens(player, roll).indexOf(token) < 0) return;

    var to = from < 0 ? 0 : from + roll;
    S.p[player][token] = to;
    var captured = captureAt(player, token, to);
    S.moves = (S.moves || 0) + 1;
    S.lastMove = { id: S.moves, player: player, token: token, from: from, to: to, roll: roll };
    S.die = 0;

    var log = playerName(player) + " moved a token " + (from < 0 ? "out of the yard." : roll + " spaces.");
    if (captured.length) log += " Captured " + captured.join(" and ") + ".";
    if (to === HOME) log = playerName(player) + " brought a token home.";
    if (S.p[player].every(function (position) { return position === HOME; })) {
      if (S.p.length < 3) {
        S.over = 1;
        S.win = player;
        S.msg = playerName(player) + " wins!";
        S.log = log;
        return;
      }
      S.placements = (S.placements || []).concat(player);
      S.log = playerName(player) + " finished " + ordinal(S.placements.length) + ".";
      if (S.placements.length >= S.p.length - 1) {
        S.loser = S.p.findIndex(function (_, index) { return S.placements.indexOf(index) < 0; });
        finishGame();
        S.log += " " + placementSummary().join(" · ");
      } else {
        S.log += " The game continues.";
        advanceTurn();
      }
      return;
    }

    /* extra roll for a six, a capture, or reaching home */
    if (roll === 6 || captured.length || to === HOME) {
      S.log = log + " Roll again.";
    } else {
      S.log = log;
      advanceTurn();
    }
  }

  /* ------------------------------------------------------------------ */
  /* computer player                                                     */
  /* ------------------------------------------------------------------ */

  /* how many rival tokens could land on this square with their next roll */
  function threatAt(player, color, position) {
    if (position < 0 || position > LAST_TRACK) return 0;
    var idx = pathIndex(color, position);
    if (SAFE.has(idx)) return 0;
    var n = 0;
    S.p.forEach(function (tokens, other) {
      if (other === player) return;
      tokens.forEach(function (pos, t) {
        if (pos < 0 || pos > LAST_TRACK) return;
        var d = (idx - pathIndex(colorOf(other, t), pos) + TRACK.length) % TRACK.length;
        if (d >= 1 && d <= 6 && pos + d <= LAST_TRACK) n++;
      });
    });
    return n;
  }

  /* progress of the rival tokens that a move would capture (0 = no capture) */
  function captureValue(player, color, position) {
    if (position < 0 || position > LAST_TRACK) return { count: 0, lost: 0 };
    var idx = pathIndex(color, position);
    if (SAFE.has(idx)) return { count: 0, lost: 0 };
    var count = 0, lost = 0;
    S.p.forEach(function (tokens, other) {
      if (other === player) return;
      tokens.forEach(function (pos, t) {
        if (pos >= 0 && pos <= LAST_TRACK && pathIndex(colorOf(other, t), pos) === idx) {
          count++;
          lost += pos;
        }
      });
    });
    return { count: count, lost: lost };
  }

  /* number of rival tokens 1..6 squares ahead of this square (targets to chase) */
  function targetsAhead(player, color, position) {
    if (position < 0 || position > LAST_TRACK) return 0;
    var idx = pathIndex(color, position), n = 0;
    S.p.forEach(function (tokens, other) {
      if (other === player) return;
      tokens.forEach(function (pos, t) {
        if (pos < 0 || pos > LAST_TRACK) return;
        var rivalIdx = pathIndex(colorOf(other, t), pos);
        var d = (rivalIdx - idx + TRACK.length) % TRACK.length;
        if (d >= 1 && d <= 6 && !SAFE.has(rivalIdx)) n++;
      });
    });
    return n;
  }

  /* Priorities: reach home > capture > leave the yard > escape danger >
     reach a safe square / home lane > avoid danger > advance. */
  function scoreMove(player, token, roll) {
    var from = S.p[player][token];
    var to = from < 0 ? 0 : from + roll;
    var color = colorOf(player, token);
    var score = 0;

    if (to === HOME) score += 1000;

    var cap = captureValue(player, color, to);
    if (cap.count) score += 600 + cap.lost * 3 + cap.count * 100;

    if (from < 0) {
      score += 350;
      /* the more tokens still stuck in the yard, the more a new one matters */
      var inYard = S.p[player].filter(function (p) { return p < 0; }).length;
      score += inYard * 10;
    }

    var threatFrom = threatAt(player, color, from);
    var threatTo = threatAt(player, color, to);
    if (threatFrom && !threatTo) score += 150 + 40 * threatFrom;   /* escaped danger */
    score -= threatTo * 160;                                       /* landing in danger */

    if (to > LAST_TRACK && to < HOME) score += 120;                /* inside home lane: safe */
    else if (to <= LAST_TRACK && SAFE.has(pathIndex(color, to))) score += 90;

    /* do not leave a safe square for nothing if a rival is right behind */
    if (from >= 0 && from <= LAST_TRACK && SAFE.has(pathIndex(color, from)) && !threatFrom && threatTo) score -= 40;

    score += targetsAhead(player, color, to) * 25;                 /* set up a capture */
    score += roll * 2 + Math.max(0, to) * 0.6;                     /* general progress */
    score += Math.random() * 4;                                    /* break ties */
    return score;
  }

  function chooseBotToken(player, roll, moves) {
    var best = moves[0], bestScore = -Infinity;
    moves.forEach(function (token) {
      var s = scoreMove(player, token, roll);
      if (s > bestScore) { bestScore = s; best = token; }
    });
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* setup: houses per player + house colour, chosen inside the game     */
  /* ------------------------------------------------------------------ */
  var SEAT_NAMES = ["Player 1", "Player 2", "Player 3", "Player 4"];
  var lastSetup = 0;

  function makeState(count) {
    return {
      p: makeTokens(count, 1),            /* preview tokens; replaced when setup is done */
      h: 1,
      cols: assignColors(count, 1, 0),
      setup: count === 2 ? 1 : 2,         /* 2 players pick houses first; 3-4 players pick a colour */
      t: 0,
      die: 0,
      lastDie: 0,
      sixes: 0,
      moves: 0,
      over: 0,
      placements: [],
      log: "Choose your houses to start."
    };
  }

  /* show the chosen colours in the host's player list (if it reads game.n) */
  function syncNames() {
    if (!S || !S.p || !S.cols) return;
    for (var i = 0; i < 4; i++) {
      ludoGame.n[i] = i < S.p.length && !S.setup ? playerName(i) : SEAT_NAMES[i];
    }
  }

  function mine() {
    return !S.over && (typeof canAct === "function" ? canAct() : true);
  }

  function validAction(action) {
    if (!action || S.over) return false;
    if (!S.setup && (S.placements || []).indexOf(S.t) >= 0) return false;
    if (S.setup === 1) return action.houses === 1 || action.houses === 2;
    if (S.setup === 2) {
      return Number.isInteger(action.color) && action.color >= 0 && action.color <= (S.h === 2 ? 1 : 3);
    }
    if (action.r !== undefined) {
      return Number.isInteger(action.r) && action.r >= 1 && action.r <= rollSides() && !S.die;
    }
    return !!S.die && Number.isInteger(action.token) &&
      legalTokens(S.t, S.die).indexOf(action.token) >= 0;
  }

  /* a setup button was pressed (the host click and the safety-net listener may both call this) */
  function setupPick(el) {
    var now = Date.now();
    if (typeof S !== "object" || !S || S.over || !S.setup || now - lastSetup < 400) return;
    if (typeof canAct === "function" && !canAct()) return;
    var houses = el.getAttribute("data-houses");
    var action = houses !== null ? { houses: Number(houses) } : { color: Number(el.getAttribute("data-color")) };
    if (!validAction(action)) return;
    lastSetup = now;
    act(action);
  }

  function dotsHtml(list) {
    return '<span class="lui-dots">' + list.map(function (c) {
      return '<i style="background:' + TOKEN_COLORS[c] + '"></i>';
    }).join("") + "</span>";
  }

  function setupBtn(attr, dots, label, small, off) {
    return '<button type="button" class="lui-setup-btn" data-i="setup" ' + attr + (off ? " disabled" : "") + ">" +
      (dots ? dotsHtml(dots) : "") + "<b>" + label + "</b>" + (small ? "<small>" + small + "</small>" : "") + "</button>";
  }

  function setupHtml() {
    var can = mine(), off = !can, count = S.p.length, title, sub, btns = "";
    if (S.setup === 1) {
      title = "Houses per player";
      sub = can ? "How many houses does each player get?" : "Waiting for " + nm(0) + " to choose\u2026";
      btns = setupBtn('data-houses="1"', null, "1 house", "4 tokens each", off) +
             setupBtn('data-houses="2"', null, "2 houses", "8 tokens each", off);
    } else if (S.h === 2) {
      title = "Choose your houses";
      sub = can ? "Your rival gets the other two houses." : "Waiting for " + nm(0) + " to choose\u2026";
      btns = setupBtn('data-color="0"', [0, 2], TOKEN_NAMES[0] + " & " + TOKEN_NAMES[2], "", off) +
             setupBtn('data-color="1"', [1, 3], TOKEN_NAMES[1] + " & " + TOKEN_NAMES[3], "", off);
    } else {
      title = "Choose your house colour";
      sub = !can ? "Waiting for " + nm(0) + " to choose\u2026" :
        count === 2 ? "Your rival gets the opposite house." : "The other players take the next colours clockwise.";
      for (var c = 0; c < 4; c++) btns += setupBtn('data-color="' + c + '"', [c], TOKEN_NAMES[c], "", off);
    }
    return '<div class="lui-setup" role="group" aria-label="Game setup"><div class="lui-setup-card"><h3>' + title +
      "</h3><p>" + sub + '</p><div class="lui-setup-btns">' + btns + "</div></div></div>";
  }

  var ludoGame = {
    id: "ludo",
    i: "🎲",
    t: "Ludo",
    d: "Roll a six to enter, race your tokens home, and send rivals back to their yards. Pick 1 or 2 houses and your colour inside the game.",
    n: SEAT_NAMES.slice(),
    max: 4,
    min: 2,
    cat: "classic casual",
    tag: "Roll & race",
    diff: "Easy to learn",
    art: "art-ludo",
    roll: true,
    rollSides: rollSides,
    cr: function () { return !S.over && !S.die && !S.setup; },
    init: function () {
      for (var i = 0; i < 4; i++) ludoGame.n[i] = SEAT_NAMES[i];
      return makeState(playerCount());
    },
    valid: validAction,
    soundEvent: function (action, previousState, currentState) {
      if (action.r !== undefined) return "roll";
      if (!Number.isInteger(action.token)) return "menu";
      if (!previousState) return "move";
      var player = currentState.lastMove && currentState.lastMove.player;
      var token = action.token;
      if (player == null || !previousState.p[player]) return "move";
      if (previousState.p[player][token] < 0) return "token-enter";
      if (currentState.lastMove && currentState.lastMove.to === HOME) return "home";
      for (var other = 0; other < currentState.p.length; other++) {
        if (other === player || !previousState.p[other]) continue;
        for (var index = 0; index < currentState.p[other].length; index++) {
          if (previousState.p[other][index] >= 0 && currentState.p[other][index] < 0) return "capture";
        }
      }
      return "move";
    },
    apply: function (action) {
      if (!action) return;
      if (S.setup === 1) {
        if (action.houses === undefined) return;
        S.h = action.houses;
        S.p = makeTokens(2, S.h);
        S.cols = assignColors(2, S.h, 0);
        S.setup = 2;
        S.log = "Choose your " + (S.h === 2 ? "houses" : "house colour") + " to start.";
        return;
      }
      if (S.setup === 2) {
        if (action.color === undefined) return;
        S.cols = assignColors(S.p.length, S.h, action.color);
        S.p = makeTokens(S.p.length, S.h);
        S.setup = 0;
        S.t = 0;
        S.sixes = 0;
        syncNames();
        S.log = playerName(0) + " starts. Roll a six to bring a token out of your yard.";
        return;
      }
      if (action.r !== undefined) applyRoll(action.r);
      else if (action.token !== undefined) applyToken(action.token);
    },
    bot: function () {
      if (S.setup === 1) return { houses: 1 };
      if (S.setup === 2) return { color: 0 };
      if (!S.die) return { r: 1 + Math.floor(Math.random() * rollSides()) };
      var moves = legalTokens(S.t, S.die);
      if (!moves.length) return null;
      return { token: chooseBotToken(S.t, S.die, moves) };
    },
    draw: function () {
      if (!S.setup) syncNames();
      var player = S.t;
      var moves = S.die && !S.setup ? new Set(legalTokens(player, S.die)) : new Set();
      var cells = Array.from({ length: N * N }, function () { return []; });

      S.p.forEach(function (tokens, p) {
        tokens.forEach(function (position, token) {
          var coords = tokenCoords(p, position, token);
          var cell = coords[0] * N + coords[1];
          var movable = p === player && moves.has(token);
          var color = colorOf(p, token);
          var label = TOKEN_NAMES[color] + " token " + ((token % 4) + 1) +
            (position < 0 ? " in yard" : position === HOME ? " home" : "") +
            (movable ? ", move available" : "");
          cells[cell].push(
            '<div class="tk' + (movable ? " mv" : "") + '" data-i="token" data-token="' + token +
            '" data-player="' + p + '" style="background-color:' + TOKEN_COLORS[color] +
            '" aria-label="' + label + '" role="button" tabindex="' + (movable ? "0" : "-1") + '"></div>'
          );
        });
      });

      var html = '<div class="g c15" role="grid" aria-label="Ludo board">';
      for (var i = 0; i < N * N; i++) {
        html += '<div class="lc" role="gridcell" aria-label="Board square ' + (i + 1) + '">' +
          cells[i].join("") + "</div>";
      }
      html += playerNamesHtml();
      if (S.setup) html += setupHtml();
      html += "</div>";
      var status = S.setup ? nm(0) + " \u00b7 " + (S.setup === 1 ? "choose houses per player" : "choose your house colour") :
        S.over ? S.msg : playerName(player) + " to play" +
        (S.die ? " · rolled " + S.die + (moves.size ? " · choose a highlighted token" : "") : " · roll the dice");
      var places = placementSummary();
      if (places.length && !S.over) status += " · " + places.join(" · ");
      if (places.length) html += '<ol class="ludo-placements" aria-label="Player placements">' +
        places.map(function (place) { return "<li>" + escapeHtml(place) + "</li>"; }).join("") + "</ol>";
      return [html, status];
    },
    click: function (element) {
      var setup = element && element.closest ? element.closest("[data-i=setup]") : null;
      if (setup) { setupPick(setup); return; }
      var token = element && element.closest ? element.closest("[data-token]") : element;
      if (!token || !token.dataset || Number(token.dataset.player) !== S.t) return;
      var index = Number(token.dataset.token);
      if (validAction({ token: index })) act({ token: index });
    }
  };

  /* safety net if the host only forwards clicks it knows about: setupPick ignores a quick second call */
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("[data-i=setup]");
    if (el) setupPick(el);
  });

  /* ------------------------------------------------------------------ */
  /* registration (one "Ludo" entry in the game list)                    */
  /* ------------------------------------------------------------------ */
  var registered = false;

  function registerLudo() {
    if (registered) return true;
    if (typeof registerGame !== "function") return false;
    hookGame(ludoGame);   /* wraps draw once */
    registerGame(ludoGame);
    registered = true;
    return true;
  }

  /* host script may define registerGame a moment later: keep trying briefly */
  function registerWhenReady() {
    if (registerLudo()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (registerLudo()) {
        clearInterval(timer);
      } else if (tries > 50) {          /* ~10 s */
        clearInterval(timer);
        if (window.console) console.warn("[ludo] registerGame() was never found, so Ludo was not added to the game list.");
      }
    }, 200);
  }

  registerWhenReady();

  window.installLudoUI = hookGame;
  window.ludoRotateBoard = rotateBoard;
  window.ludoCelebrate = function (color, title) {
    var c = (color || "").toLowerCase();
    winActive = true;
    winColor = PAL[c] ? c : "";
    showCelebration({ color: winColor, title: title || (winColor ? playerName(S && Number.isInteger(S.win) ? S.win : 0) + " wins!" : "We have a winner!"), sub: "" });
    manualWin = true;
  };

  function tryAutoHook() {
    [window.games, window.GAMES, window.gameRegistry, window.registry].forEach(function (reg) {
      if (reg && reg.ludo) hookGame(reg.ludo);
    });
  }

  loadRotation();   /* remembered turn for this screen, read before the first board is drawn */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { tryAutoHook(); registerLudo(); start(); }, { once: true });
  } else {
    tryAutoHook();
    start();
  }
})();