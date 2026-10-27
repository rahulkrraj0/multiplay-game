// snakes & ladders: registered with registerGame(), same host contract as tictactoe.js / ludo.js.
// Globals used: S (state), nm(t), act(action), canAct() if the host provides it.
//
// Rules
//  - 10x10 board, square 1 bottom-left, snaking up to 100 top-left.
//  - Every token starts OFF the board (drawn on the START square) and needs a roll of 1 to enter (like a 6 in Ludo).
//  - A 6 gives the same player another roll (SIX_ROLLS_AGAIN).
//  - A 1 also gives the same player another roll (ONE_ROLLS_AGAIN).
//  - Exact roll needed to land on 100. A token that would overshoot cannot move.
//  - Landing on a ladder climbs it, on a snake slides down it.
//  - Players CUT each other (any rival, 2-4 players): ending a move on a square with a rival token sends that
//    token back to the start (it needs a 1 again). Square 1 and square 100 are safe.
//    Your own tokens never cut each other and may share a square.
//  - Win: ALL of your tokens reach 100.
//  - 2, 3 or 4 players (Yellow, Black, Red, Blue); the player count comes from the host variable `np`, like ludo.js.
//    Cutting works between all players, turns go round in order.
//  - ONE game in the list. After it starts, a panel asks how many tokens each player gets (1, 2, 3 or 4).
//      * 1 usable token  -> it moves by itself (no choice needed)
//      * 2+ usable tokens -> pick one (click it on the board)
//
// The die value is picked by the client that presses "Roll" and travels inside the action ({ r }); choosing a
// token travels as { token }, so apply() stays deterministic for online play.
//
// Layout (same as Ludo): narrow screens = board on top, players + dice + Roll button below.
// Wide screens (>= 900px, landscape) = board on the left, players + dice + Roll button on the right.
(() => {
"use strict";

/* ---- the board: edit these two tables to match your physical board (from -> to) ---- */
const LADDERS = { 6: 48, 8: 29, 21: 84, 26: 88, 44: 65, 49: 70 };
const SNAKES = { 31: 9, 42: 23, 47: 28, 61: 37, 86: 45, 92: 53, 98: 59 };
const SIX_ROLLS_AGAIN = true;          // a 6 gives the same player another roll
const ONE_ROLLS_AGAIN = true;          // a 1 also gives the same player another roll
const SAFE_SQ = new Set([1]);          // squares where a token cannot be cut (100 is always safe)

const PAL = ["#d6288f", "#2e9e50", "#2563c9", "#f08f1f", "#7a3aa6", "#7b3b1d"];             // square colours
const LADDER_COL = ["#f2762e", "#e0a800", "#2f9e4f", "#2f80ed", "#8e44ad", "#d63a3a"];      // by ladder, low to high
const SNAKE_COL = ["#7c3aed", "#22a85a", "#16a085", "#1e40af", "#ea7a2c", "#2fb35f", "#15803d"];
const PAWN = ["#ffc61a", "#1c1f27", "#e5322d", "#2160c4"];             // Yellow, Black, Red, Blue
const PAWN_TXT = ["#1c1f27", "#ffffff", "#ffffff", "#ffffff"];
const BANNER = ["#f5b400", "#334155", "#e5322d", "#2160c4"], BANNER_DARK = ["#a16207", "#0f172a", "#a8161b", "#123a85"];
const NAMES = ["Yellow", "Black", "Red", "Blue"];
const playerCount = () => (typeof np === "number" ? Math.max(2, Math.min(4, np)) : 2);   // same host variable as ludo.js
const DICE_MS = 520, HOP_MS = 170;
const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ---------------- geometry + drawing (board is a 100x100 space, every square is 10x10) ---------------- */
const f1 = v => Math.round(v * 100) / 100;
const cxy = n => { const i = n - 1, r = i / 10 | 0, c = r % 2 ? 9 - i % 10 : i % 10; return [c * 10 + 5, (9 - r) * 10 + 5]; };

function ladderSvg(a, b, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux, w = 1.7;
  const s = [a[0] + ux * 2, a[1] + uy * 2], e = [b[0] - ux * 2, b[1] - uy * 2];
  const n = Math.max(3, Math.round((L - 4) / 3.4));
  const seg = (p, q) => "M" + f1(p[0]) + " " + f1(p[1]) + "L" + f1(q[0]) + " " + f1(q[1]);
  const rails = seg([s[0] + px * w, s[1] + py * w], [e[0] + px * w, e[1] + py * w]) + seg([s[0] - px * w, s[1] - py * w], [e[0] - px * w, e[1] - py * w]);
  let rungs = "";
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, c = [s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t];
    rungs += seg([c[0] + px * w, c[1] + py * w], [c[0] - px * w, c[1] - py * w]);
  }
  return '<g fill="none" stroke-linecap="round">' +
    '<g transform="translate(.5 .7)" stroke="rgba(0,0,0,.28)" stroke-width="1.9"><path d="' + rails + '"/><path d="' + rungs + '"/></g>' +
    '<path d="' + rails + '" stroke="rgba(0,0,0,.55)" stroke-width="1.8"/><path d="' + rungs + '" stroke="rgba(0,0,0,.55)" stroke-width="1.5"/>' +
    '<path d="' + rails + '" stroke="' + col + '" stroke-width="1.05"/><path d="' + rungs + '" stroke="' + col + '" stroke-width=".75"/></g>';
}

function snakePts(h, t, k) {                       // centre line of a snake, head -> tail
  const dx = t[0] - h[0], dy = t[1] - h[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const waves = Math.max(1.5, L / 16), amp = Math.min(5.5, 2.4 + L / 16), ph = k % 2 ? Math.PI : 0, N = 48, pts = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, o = Math.sin(s * waves * 6.2832 + ph) * amp * Math.sin(Math.PI * s);
    pts.push([h[0] + dx * s + px * o, h[1] + dy * s + py * o]);
  }
  return pts;
}

function snakeSvg(pts, col) {
  const N = pts.length - 1, hw = s => 0.35 + 1.75 * Math.pow(1 - s, 0.8), Lp = [], Rp = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, w = hw(i / N);
    Lp.push([p[0] + nx * w, p[1] + ny * w]); Rp.push([p[0] - nx * w, p[1] - ny * w]);
  });
  const P = arr => arr.map((q, i) => (i ? "L" : "M") + f1(q[0]) + " " + f1(q[1])).join("");
  const body = P(Lp) + P(Rp.slice().reverse()).replace("M", "L") + "Z";
  const h0 = pts[0], h1 = pts[1], hl = Math.hypot(h0[0] - h1[0], h0[1] - h1[1]) || 1;
  const fx = (h0[0] - h1[0]) / hl, fy = (h0[1] - h1[1]) / hl, gx = -fy, gy = fx, ang = Math.atan2(fy, fx) * 57.2958;
  const at = (a, b) => f1(h0[0] + fx * a + gx * b) + " " + f1(h0[1] + fy * a + gy * b);
  const xy = (a, b) => [f1(h0[0] + fx * a + gx * b), f1(h0[1] + fy * a + gy * b)];
  const tongue = '<path d="M' + at(2.4, 0) + "L" + at(4.4, 0) + "M" + at(4.4, 0) + "L" + at(5.3, 0.7) + "M" + at(4.4, 0) + "L" + at(5.3, -0.7) +
    '" fill="none" stroke="#e11d2e" stroke-width=".38" stroke-linecap="round"/>';
  const eye = side => { const [x, y] = xy(0.9, side); const [px2, py2] = xy(1.05, side); return '<circle cx="' + x + '" cy="' + y + '" r=".66" fill="#fff"/><circle cx="' + px2 + '" cy="' + py2 + '" r=".31" fill="#111"/>'; };
  const dots = pts.slice(0, Math.round(N * 0.82)).map(q => f1(q[0]) + "," + f1(q[1])).join(" ");
  return '<g><path d="' + body + '" transform="translate(.5 .8)" fill="rgba(0,0,0,.25)"/>' +
    '<path d="' + body + '" fill="' + col + '" stroke="rgba(0,0,0,.5)" stroke-width=".3" stroke-linejoin="round"/>' +
    '<polyline points="' + dots + '" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1" stroke-dasharray="0.01 2.8" stroke-linecap="round"/>' +
    tongue + '<ellipse cx="' + f1(h0[0]) + '" cy="' + f1(h0[1]) + '" rx="2.7" ry="2.15" transform="rotate(' + f1(ang) + " " + f1(h0[0]) + " " + f1(h0[1]) + ')" fill="' + col + '" stroke="rgba(0,0,0,.5)" stroke-width=".3"/>' +
    eye(1.05) + eye(-1.05) + "</g>";
}

/* pawn icon; `label` (token number) is only drawn when a player has several tokens */
const pawn = (c, label, tc) => {
  const sh = f => '<ellipse cx="20" cy="45" rx="14" ry="5" ' + f + '/><path d="M13 44Q14 31 17.5 26H22.5Q26 31 27 44Z" ' + f + '/><circle cx="20" cy="15" r="9" ' + f + "/>";
  return '<svg viewBox="0 0 40 52" aria-hidden="true">' + sh('fill="#fff" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"') + sh('fill="' + c + '"') +
    (label ? '<text x="20" y="19" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="900" fill="' + tc + '">' + label + "</text>"
           : '<ellipse cx="17" cy="12" rx="3" ry="2.2" fill="rgba(255,255,255,.5)"/>') + "</svg>";
};

const LAD_KEYS = Object.keys(LADDERS).map(Number).sort((a, b) => a - b);
const SNK_KEYS = Object.keys(SNAKES).map(Number).sort((a, b) => a - b);
const SNAKE_PTS = {};
SNK_KEYS.forEach((h, k) => { SNAKE_PTS[h] = snakePts(cxy(h), cxy(SNAKES[h]), k); });
const ART = LAD_KEYS.map((a, k) => ladderSvg(cxy(a), cxy(LADDERS[a]), LADDER_COL[k % LADDER_COL.length])).join("") +
            SNK_KEYS.map((h, k) => snakeSvg(SNAKE_PTS[h], SNAKE_COL[k % SNAKE_COL.length])).join("");

let CELLS = "", NUMS = "";
for (let r = 9; r >= 0; r--) for (let c = 0; c < 10; c++) {
  const n = r * 10 + (r % 2 ? 10 - c : c + 1);
  CELLS += '<div class="snl-c' + (n === 100 ? " fin" : "") + '" style="--cc:' + PAL[(r * 3 + c * 2) % 6] + '">' +
    (n === 1 ? '<i class="snl-tag s">START</i>' : "") + (n === 100 ? '<i class="snl-tag w">WINNER</i>' : "") + "</div>";
  NUMS += '<b class="' + (n === 100 ? "fin" : "") + '">' + n + "</b>";
}

/* little picture for the homepage card (.art-snl) */
function artCss() {
  let r = "";
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++)
    r += '<rect x="' + x * 10 + '" y="' + y * 10 + '" width="10" height="10" fill="' + PAL[(y * 3 + x * 2) % 6] + '" stroke="rgba(255,255,255,.5)" stroke-width=".25"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' + r + ladderSvg([8, 43], [27, 7], "#2f9e4f") + snakeSvg(snakePts([40, 6], [18, 44], 1), "#7c3aed") + "</svg>";
  return '.art-snl{background:#d9441f url("data:image/svg+xml,' + encodeURIComponent(svg) + '") center/cover no-repeat!important}';
}

/* ---------------- styles ---------------- */
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const pipCss = Object.keys(PIPS).map(v => PIPS[v].map(k => '.snl-die[data-v="' + v + '"] i:nth-child(' + k + ")").join(",") + "{opacity:1}").join("\n");
const CSS = `
.snl{--bs:min(94vw,82vh,680px);--tw:calc(var(--bs)*.062);display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;margin:0 auto;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.snl *{box-sizing:border-box}
.snl-frame{width:var(--bs);height:var(--bs);padding:calc(var(--bs)*.022);border-radius:calc(var(--bs)*.035);
  background:linear-gradient(145deg,#ec5a2c,#c63a16);
  box-shadow:0 18px 44px rgba(60,20,5,.4),0 2px 6px rgba(60,20,5,.3),inset 0 0 0 2px rgba(255,255,255,.4)}
.snl-in{position:relative;width:100%;height:100%}
.snl-grid{position:absolute;inset:0;display:grid;grid-template:repeat(10,1fr)/repeat(10,1fr);gap:calc(var(--bs)*.005)}
.snl-c{position:relative;overflow:hidden;border-radius:calc(var(--bs)*.01);
  background:linear-gradient(160deg,rgba(255,255,255,.28),rgba(0,0,0,.14)),var(--cc);box-shadow:inset 0 0 0 1px rgba(255,255,255,.5)}
.snl-c.fin{background:linear-gradient(160deg,#27489c,#0b1a4a)}
.snl-nums{position:absolute;inset:0;z-index:2;display:grid;grid-template:repeat(10,1fr)/repeat(10,1fr);gap:calc(var(--bs)*.005);pointer-events:none}
.snl-nums b{padding:5% 0 0 9%;font-size:calc(var(--bs)*.028);font-weight:800;line-height:1;color:#fff;
  text-shadow:0 0 2px #000,0 0 3px rgba(0,0,0,.9),0 1px 3px rgba(0,0,0,.7)}
.snl-nums b.fin{color:#ffd23f}
.snl-tag{position:absolute;left:8%;right:8%;bottom:7%;padding:.18em 0;border-radius:99px;font:800 calc(var(--bs)*.0165)/1 system-ui,sans-serif;
  font-style:normal;letter-spacing:.04em;text-align:center}
.snl-tag.s{background:#1b8a3a;color:#fff}
.snl-tag.w{background:#ffd23f;color:#2b2200}
.snl-setup{position:absolute;inset:0;z-index:8;display:flex;align-items:center;justify-content:center;border-radius:calc(var(--bs)*.02);
  background:rgba(15,23,42,.62)}
.snl-setup-card{width:min(86%,360px);padding:calc(var(--bs)*.04) calc(var(--bs)*.05);text-align:center;border-radius:20px;
  background:linear-gradient(165deg,#fffdf7,#f4ecd9);box-shadow:0 14px 40px rgba(0,0,0,.45)}
.snl-setup-card h3{margin:0 0 4px;font-size:clamp(17px,calc(var(--bs)*.04),24px);font-weight:900;color:#3b2a14}
.snl-setup-card p{margin:0 0 12px;font-size:clamp(12px,calc(var(--bs)*.024),15px);color:#57534e}
.snl-setup-btns{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.snl-setup-btns button{all:unset;box-sizing:border-box;cursor:pointer;padding:12px 0;border-radius:14px;text-align:center;
  background:linear-gradient(180deg,#ff7a45,#e5481a);color:#fff;font:900 20px/1 system-ui,sans-serif;box-shadow:0 5px 12px rgba(200,60,20,.4)}
.snl-setup-btns button:hover{transform:translateY(-2px)}
.snl-setup-btns button:focus-visible{outline:3px solid #111827;outline-offset:2px}
.snl-setup.wait .snl-setup-btns{opacity:.5;pointer-events:none}
.snl-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.snl-tk{position:absolute;z-index:3;width:var(--tw);height:calc(var(--tw)*1.3);margin-top:calc(var(--tw)*-.95);pointer-events:none;
  filter:drop-shadow(0 3px 3px rgba(0,0,0,.5))}
.snl-tk.sm{--tw:calc(var(--bs)*.05)}
.snl-tk svg{display:block;width:100%;height:100%}
.snl-tk.mv{z-index:5;pointer-events:auto;cursor:pointer;animation:snl-glow 1.05s ease-in-out infinite}
.snl.busy .mv{pointer-events:none}
.snl-bar{display:flex;flex-direction:column;align-items:center;gap:14px;width:min(100%,var(--bs))}
.snl-act{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px 18px}
.snl-die{position:relative;width:64px;height:64px;padding:10px;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);border-radius:16px;
  background:linear-gradient(145deg,#fff,#e8e4da);box-shadow:0 8px 18px rgba(0,0,0,.3),inset 0 -3px 0 rgba(0,0,0,.12)}
.snl-die i{width:78%;height:78%;place-self:center;border-radius:50%;background:#1f2937;opacity:0}
${pipCss}
.snl-die[data-v="0"]::after{content:"?";position:absolute;inset:0;display:grid;place-items:center;font:900 30px/1 system-ui,sans-serif;color:#9ca3af}
.snl .snl-roll{all:unset;display:inline-block;box-sizing:border-box;cursor:pointer;padding:15px 28px;border-radius:999px;
  background:linear-gradient(180deg,#ff7a45,#e5481a);color:#fff;font:800 17px/1 system-ui,sans-serif;text-align:center;
  box-shadow:0 8px 18px rgba(200,60,20,.45),inset 0 -3px 0 rgba(0,0,0,.2);transition:transform .15s,box-shadow .15s}
.snl .snl-roll:hover{transform:translateY(-2px)}
.snl .snl-roll:focus-visible{outline:3px solid #fde047;outline-offset:3px}
.snl .snl-roll[disabled],.snl.busy .snl-roll{opacity:.5;pointer-events:none;cursor:default;box-shadow:none}

/* wide screens: board on the left, players + dice + Roll button on the right (same as Ludo) */
@media (min-width:900px) and (min-aspect-ratio:5/4){
  .snl{--bs:min(84vh,760px,calc(100vw - 340px));display:grid;grid-template-columns:var(--bs) minmax(180px,300px);
    column-gap:clamp(12px,2vw,32px);justify-content:center;justify-content:safe center;align-items:center}
  .snl-frame{grid-column:1;grid-row:1}
  .snl-bar{grid-column:2;grid-row:1;width:auto;max-width:100%;align-items:stretch}
  .snl-act{flex-direction:column}
}
/* small phones */
@media (max-width:480px){
  .snl{gap:12px}
  .snl-bar{gap:10px}
  .snl-act{gap:8px 12px}
  .snl-die{width:56px;height:56px;padding:8px}
  .snl .snl-roll{padding:14px 22px;font-size:16px}
}

.snlx-win{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.snlx-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(15,23,42,.3),rgba(15,23,42,.72));animation:snl-fade .4s ease both}
.snlx-cf{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.snlx-cf i{position:absolute;top:-16px;height:14px;border-radius:2px;animation:snl-fall linear both}
.snlx-card{position:relative;box-sizing:border-box;width:min(90vw,400px);padding:26px 30px 24px;text-align:center;border-radius:26px;
  background:linear-gradient(165deg,#fffdf7,#f4ecd9);box-shadow:0 0 0 5px var(--w),0 0 60px 8px color-mix(in srgb,var(--w) 55%,transparent),0 26px 70px rgba(0,0,0,.4);
  animation:snl-card .75s cubic-bezier(.2,1.25,.3,1) both}
.snlx-ic{font-size:70px;line-height:1;display:inline-block;transform-origin:50% 90%;filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));animation:snl-ic 1.1s ease-in-out infinite alternate}
.snlx-t{margin:8px 0 4px;font-size:clamp(28px,7vw,40px);font-weight:900;line-height:1.1;color:var(--wd)}
.snlx-s{margin:0;color:#57534e;font-size:15px;line-height:1.4}
.snlx-b{margin-top:18px;padding:11px 30px;border:0;border-radius:999px;background:var(--wd);color:#fff;font:700 15px/1 system-ui,sans-serif;cursor:pointer;
  box-shadow:0 6px 16px rgba(0,0,0,.25);transition:transform .15s}
.snlx-b:hover{transform:translateY(-2px)}
.snlx-b:focus-visible{outline:3px solid #111827;outline-offset:3px}
.snlx-win.out .snlx-card{animation:snl-cardout .28s ease both}.snlx-win.out .snlx-bg{animation:snl-fadeout .28s ease both}
@keyframes snl-fade{from{opacity:0}to{opacity:1}}
@keyframes snl-fadeout{from{opacity:1}to{opacity:0}}
@keyframes snl-card{0%{opacity:0;transform:translateY(40px) scale(.6) rotate(-4deg)}100%{opacity:1;transform:none}}
@keyframes snl-cardout{to{opacity:0;transform:translateY(20px) scale(.9)}}
@keyframes snl-ic{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(8deg) scale(1.12)}}
@keyframes snl-fall{from{transform:translateY(0) rotate(0)}to{transform:translateY(110vh) rotate(var(--rot))}}
@keyframes snl-glow{0%,100%{filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 5px var(--pc,#ffd166)) drop-shadow(0 3px 3px rgba(0,0,0,.5))}
  50%{filter:drop-shadow(0 0 3px #fff) drop-shadow(0 0 14px var(--pc,#ffd166)) drop-shadow(0 3px 3px rgba(0,0,0,.5))}}
@media (prefers-reduced-motion:reduce){.snl,.snl *,.snlx-win *{animation:none!important;transition:none!important}}
` + artCss();
function addStyles() {
  if (document.getElementById("snl-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "snl-ui-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ---------------- winner banner ---------------- */
let winEl = null, shown = null, timer = 0, seenMv = -1, busyUntil = 0, lastRoll = 0, lastPick = 0, kbRoll = false;

function closeBanner(now) {
  clearTimeout(timer);
  const el = winEl; winEl = null;
  if (!el) return;
  if (now || reduced()) { el.remove(); return; }
  el.classList.add("out");
  setTimeout(() => el.remove(), 300);
}

function banner(w) {
  closeBanner(true);
  const el = document.createElement("div");
  el.className = "snlx-win";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Game over");
  el.style.setProperty("--w", BANNER[w]);
  el.style.setProperty("--wd", BANNER_DARK[w]);
  el.innerHTML = '<div class="snlx-bg"></div><div class="snlx-cf"></div><div class="snlx-card"><div class="snlx-ic" aria-hidden="true">\uD83C\uDFC6</div>' +
    '<h2 class="snlx-t"></h2><p class="snlx-s"></p><button type="button" class="snlx-b">Close</button></div>';
  el.querySelector(".snlx-t").textContent = nm(w) + " wins!";
  el.querySelector(".snlx-s").textContent = (S.k || 1) > 1 ? "Got every token to square 100 first." : "Reached square 100 first.";
  el.querySelector(".snlx-b").addEventListener("click", () => closeBanner());
  el.querySelector(".snlx-bg").addEventListener("click", () => closeBanner());
  if (!reduced()) {
    const cols = [BANNER[w], "#ffd23f", "#ffffff", "#2fa84f", "#ff7ab8", "#2f80ed"];
    let cf = "";
    for (let i = 0; i < 80; i++)
      cf += '<i style="left:' + (Math.random() * 100).toFixed(1) + "%;width:" + (6 + Math.random() * 6 | 0) + "px;background:" + cols[i % cols.length] +
        ";animation-duration:" + (2.2 + Math.random() * 2.4).toFixed(2) + "s;animation-delay:" + (Math.random() * 1.4).toFixed(2) + "s;--rot:" + (Math.random() * 900 - 450 | 0) + 'deg"></i>';
    el.querySelector(".snlx-cf").innerHTML = cf;
  }
  document.body.appendChild(el);
  winEl = el;
  try { el.querySelector(".snlx-b").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}

/* ---------------- animation ---------------- */
function tumble(die, final) {
  if (!die) return;
  let k = 0;
  const tick = () => {
    if (!die.isConnected) return;
    if (k++ < 6) { die.dataset.v = 1 + Math.floor(Math.random() * 6); setTimeout(tick, 70); } else die.dataset.v = final;
  };
  tick();
  if (die.animate) die.animate([{ transform: "rotate(0) scale(1)" }, { transform: "rotate(200deg) scale(1.18)" }, { transform: "rotate(360deg) scale(1)" }], { duration: DICE_MS - 60, easing: "ease-out" });
}

function shake(tk, delay) {
  const d = 5;
  tk.animate([0, 0.2, 0.4, 0.6, 0.8, 1].map((o, i) => ({ offset: o, transform: "translateX(" + [0, -d, d, -d, d, 0][i] + "px)" })), { duration: 420, delay, fill: "backwards" });
}

function animateMove(root, mv) {        // returns how long the whole thing takes (ms), 0 if skipped
  if (reduced()) return 0;
  const inn = root.querySelector(".snl-in");
  if (!inn) return 0;
  if (!mv.pick) tumble(root.querySelector(".snl-die"), S.die);
  const base = mv.pick ? 0 : DICE_MS;
  if (mv.k < 0) {                       // no token moved: either "choose a token" or "nothing can move"
    if (mv.stay) {
      const all = root.querySelectorAll('.snl-tk[data-p="' + mv.p + '"]');
      all.forEach(tk => tk.animate && shake(tk, base));
      return base + (all.length ? 420 : 0);
    }
    return base;
  }
  const tk = root.querySelector('.snl-tk[data-p="' + mv.p + '"][data-k="' + mv.k + '"]');
  if (!tk || !tk.animate) return base;
  if (mv.from === 0) {                  // enters the board: pops in on square 1
    tk.animate([{ transform: "scale(.2)", opacity: 0 }, { transform: "scale(1.25)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }],
      { duration: 360, delay: base, fill: "backwards", easing: "ease-out" });
    return base + 360;
  }
  const W = inn.clientWidth, H = inn.clientHeight, to = cxy(mv.to);
  const rel = pt => "translate(" + (pt[0] - to[0]) * W / 100 + "px," + (pt[1] - to[1]) * H / 100 + "px)";
  const fr = [];
  let t = 0, cur = cxy(mv.from);
  fr.push([0, cur]);
  for (let s = mv.from + 1; s <= mv.mid; s++) {
    const B = cxy(s);
    fr.push([t + HOP_MS / 2, [(cur[0] + B[0]) / 2, (cur[1] + B[1]) / 2 - 4]]);
    t += HOP_MS; fr.push([t, B]); cur = B;
  }
  if (mv.kind) {
    t += 300; fr.push([t, cur]);
    const pts = mv.kind === "snake" ? SNAKE_PTS[mv.mid] : [cxy(mv.mid), cxy(mv.to)], dur = mv.kind === "snake" ? 1100 : 800;
    pts.forEach((pt, i) => { if (i) fr.push([t + dur * i / (pts.length - 1), pt]); });
    t += dur;
  }
  if (!t) return base;
  tk.style.zIndex = 6;
  const a = tk.animate(fr.map(([time, pt]) => ({ offset: time / t, transform: rel(pt) })), { duration: t, delay: base, easing: "linear", fill: "backwards" });
  a.onfinish = a.oncancel = () => { tk.style.zIndex = ""; };
  return base + t;
}

/* a cut token waits on its square until the mover arrives, then shrinks away to the start */
function ghostCuts(root, mv, wait) {
  const inn = root.querySelector(".snl-in");
  if (!inn || !mv.cap || !mv.cap.length || reduced()) return;
  mv.cap.forEach(c => {
    const xy = cxy(c.sq), g = document.createElement("div");
    g.className = "snl-tk ghost";
    g.style.left = xy[0] + "%"; g.style.top = xy[1] + "%"; g.style.marginLeft = "calc(var(--tw) / -2)";
    g.innerHTML = pawn(PAWN[c.p], (S.k || 1) > 1 ? String(c.k + 1) : "", PAWN_TXT[c.p]);
    inn.appendChild(g);
    if (g.animate) {
      const a = g.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "translateY(-16px) scale(.3)" }],
        { duration: 520, delay: Math.max(0, wait - 120), fill: "both", easing: "ease-in" });
      a.onfinish = () => g.remove();
    } else setTimeout(() => g.remove(), wait + 400);
  });
}

/* ---------------- after each render ---------------- */
function post() {
  const root = document.querySelector(".snl");
  if (!root || root.dataset.lui || typeof S === "undefined" || !S || !Array.isArray(S.p) || !S.p.length) return;
  root.dataset.lui = "1";
  if (kbRoll) { const b = root.querySelector(".snl-roll"); if (b && !b.disabled) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  let wait = 0;
  if (!S.mv) seenMv = -1;
  else if (S.mv.id !== seenMv) { seenMv = S.mv.id; wait = animateMove(root, S.mv); if (S.mv.cap) ghostCuts(root, S.mv, wait); }
  if (wait) {
    const online = typeof ids !== "undefined" && ids.length > 0;
    busyUntil = Date.now() + (online ? Math.min(wait, 300) : wait) + 60;
  }
  if (Date.now() < busyUntil) {
    root.classList.add("busy");
    setTimeout(() => root.classList.remove("busy"), Math.max(0, busyUntil - Date.now()));
  }
  if (S.over) {
    const key = S.n + "|" + S.msg;
    if (shown !== key) {
      shown = key;
      clearTimeout(timer);
      timer = setTimeout(() => { if (S.over) banner(typeof S.win === "number" ? S.win : 0); }, wait + 500);
    }
  } else if (shown) { shown = null; closeBanner(true); }
}

const mine = () => !S.over && (typeof canAct === "function" ? canAct() : true);
const online = () => typeof ids !== "undefined" && ids.length > 0;

function rollNow() {
  const now = Date.now();
  if (typeof S === "undefined" || !S || S.over || S.pend || S.setup || now < busyUntil || now - lastRoll < (online() ? 120 : 700) || !mine()) return;
  lastRoll = now;
  if (online() && typeof amHost === "function" && !amHost()) {
    const rollButton = document.getElementById("rl");
    if (rollButton) rollButton.click();
    return;
  }
  act({ r: 1 + Math.floor(Math.random() * 6) });
}

function pickCount(el) {
  const now = Date.now();
  if (typeof S === "undefined" || !S || S.over || !S.setup || now - lastPick < (online() ? 120 : 400) || !mine()) return;
  const n = Number(el.getAttribute("data-n"));
  if (!(n >= 1 && n <= 4)) return;
  lastPick = now;
  act({ k: n });
}

function pickNow(el) {
  const now = Date.now();
  if (typeof S === "undefined" || !S || S.over || !S.pend || now < busyUntil || now - lastPick < (online() ? 120 : 400) || !mine()) return;
  const p = Number(el.getAttribute("data-p")), k = Number(el.getAttribute("data-k"));
  if (p !== S.t || legalTokens(S.t, S.pend).indexOf(k) < 0) return;
  lastPick = now;
  act({ token: k });
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && winEl) { closeBanner(); return; }
  const t = e.target;
  if ((e.key === "Enter" || e.key === " ") && t && t.classList && t.classList.contains("snl-roll")) kbRoll = true;
});
document.addEventListener("click", e => { if (e.detail > 0) kbRoll = false; }, true);
// safety net if the host only forwards clicks from its own grid: rollNow()/pickNow() ignore a quick second call
document.addEventListener("click", e => {
  const el = e.target && e.target.closest && e.target.closest(".snl-roll,[data-i=tk],[data-i=kn]");
  if (!el) return;
  if (el.classList.contains("snl-roll")) rollNow();
  else if (el.getAttribute("data-i") === "kn") pickCount(el);
  else pickNow(el);
});

let obs = null;
function startObserver() {
  addStyles();
  obs = new MutationObserver(() => { obs.disconnect(); try { post(); } finally { obs.observe(document.body, { childList: true, subtree: true }); } });
  obs.observe(document.body, { childList: true, subtree: true });
  post();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
else startObserver();

/* ---------------- rules ---------------- */
/* tokens that can use roll r: a token off the board needs a 1; a token on the board needs an exact finish */
function legalTokens(p, r) {
  const out = [];
  S.p[p].forEach((pos, j) => { if (pos === 0 ? r === 1 : pos < 100 && pos + r <= 100) out.push(j); });
  return out;
}
/* tokens standing on the same square are interchangeable: keep the first of each */
function distinct(p, list) {
  const seen = new Set(), out = [];
  list.forEach(j => { const q = S.p[p][j]; if (!seen.has(q)) { seen.add(q); out.push(j); } });
  return out;
}

/* a 6 or a 1 gives the same player another roll; otherwise the turn passes on */
function endTurn(r, log) {
  const again = (SIX_ROLLS_AGAIN && r === 6) || (ONE_ROLLS_AGAIN && r === 1);
  if (again) log += " \u2014 rolls again"; else S.t = (S.t + 1) % S.p.length;
  S.log = log;
}

function doMove(t, j, r, pick) {
  const from = S.p[t][j], mid = from === 0 ? 1 : from + r, k = S.k || 1;
  let to = mid, kind = "";
  if (LADDERS[mid]) { to = LADDERS[mid]; kind = "ladder"; }
  else if (SNAKES[mid]) { to = SNAKES[mid]; kind = "snake"; }
  S.p[t][j] = to;
  const cap = [];
  if (to !== 100 && !SAFE_SQ.has(to)) {                     // cut every rival token on the square we end on
    S.p.forEach((toks, o) => {
      if (o === t) return;
      toks.forEach((q, i) => { if (q === to) { toks[i] = 0; cap.push({ p: o, k: i, sq: to }); } });
    });
  }
  S.n = (S.n || 0) + 1;
  S.mv = { id: S.n, p: t, k: j, from, r, mid, to, kind, stay: 0, cap, pick: pick ? 1 : 0 };

  let log = nm(t) + (pick ? " moved" : " rolled " + r) + (k > 1 ? " token " + (j + 1) : "");
  if (from === 0) log += " \u2014 enters the board";
  else if (kind === "ladder") log += " \u2014 ladder up, " + mid + " \u2192 " + to;
  else if (kind === "snake") log += " \u2014 snake! " + mid + " \u2192 " + to;
  else log += " \u2192 " + to;
  if (cap.length) log += " \u2014 cut " + Array.from(new Set(cap.map(c => nm(c.p)))).join(" & ") + "'s token" + (cap.length > 1 ? "s" : "") + " back to start";

  if (S.p[t].every(q => q === 100)) {
    S.over = 1; S.win = t; S.log = log;
    S.msg = nm(t) + (k > 1 ? " gets every token to 100 and wins! " : " reaches 100 and wins! ") + "\uD83C\uDF89";
    nextFirst = ((S.first || 0) + 1) % S.p.length;
    return;
  }
  endTurn(r, log);
}

let nextFirst = 0;       // who rolls first in the next game; flips after every finished game, like tictactoe.js

const core = {
  valid(a) {
    if (!a || S.over) return false;
    if (S.setup) return a.r === undefined && Number.isInteger(a.k) && a.k >= 1 && a.k <= 4;
    if (a.r !== undefined) return Number.isInteger(a.r) && a.r >= 1 && a.r <= 6 && !S.pend;
    return !!S.pend && Number.isInteger(a.token) && legalTokens(S.t, S.pend).indexOf(a.token) >= 0;
  },
  apply(a) {
    const t = S.t;
    if (a.k !== undefined) {                               // token count chosen after the game started
      S.k = a.k;
      S.p = S.p.map(() => Array(a.k).fill(0));
      S.setup = 0;
      S.log = a.k + (a.k === 1 ? " token" : " tokens") + " each";
      return;
    }
    if (a.r === undefined) {                               // a token was chosen
      const r = S.pend;
      S.pend = 0;
      doMove(t, a.token, r, true);
      return;
    }
    const r = a.r, groups = distinct(t, legalTokens(t, r));
    S.die = r;
    if (!groups.length) {                                  // nothing can move
      S.n = (S.n || 0) + 1;
      S.mv = { id: S.n, p: t, k: -1, r, mid: 0, to: 0, kind: "", stay: 1, cap: [], pick: 0 };
      let log = nm(t) + " rolled " + r;
      if (S.p[t].every(q => q === 0)) log += " \u2014 needs a 1 to start";
      else if ((S.k || 1) === 1) log += " \u2014 needs exactly " + (100 - S.p[t][0]) + " to finish";
      else log += " \u2014 no token can move";
      endTurn(r, log);
    } else if (groups.length === 1) {                      // only one choice: it moves by itself
      doMove(t, groups[0], r, false);
    } else {                                               // several choices: wait for { token }
      S.n = (S.n || 0) + 1;
      S.mv = { id: S.n, p: t, k: -1, r, mid: 0, to: 0, kind: "", stay: 0, cap: [], pick: 0 };
      S.pend = r;
      S.log = nm(t) + " rolled " + r + " \u2014 choose a token";
    }
  },
  bot() {
    if (S.setup) return { k: 1 };
    if (!S.pend) return { r: 1 + Math.floor(Math.random() * 6) };
    const t = S.t, r = S.pend, legal = legalTokens(t, r);
    let best = legal[0], bs = -1e9;
    legal.forEach(j => {
      const from = S.p[t][j], mid = from === 0 ? 1 : from + r, to = LADDERS[mid] || SNAKES[mid] || mid;
      let s = to * 0.2 + Math.random();
      if (to === 100) s += 1000;
      if (from === 0) s += 30;
      if (LADDERS[mid]) s += 40 + (to - mid);
      if (SNAKES[mid]) s -= 20 + (mid - to);
      if (to !== 100 && !SAFE_SQ.has(to)) S.p.forEach((toks, o) => { if (o !== t) toks.forEach(q => { if (q === to) s += 60 + q; }); });
      if (s > bs) { bs = s; best = j; }
    });
    return { token: best };
  },
  draw() {
    const k = S.k || 1, can = mine(), movable = new Set();
    if (can && S.pend) legalTokens(S.t, S.pend).forEach(j => movable.add(j));

    /* every token is drawn; tokens still off the board (pos 0) wait on START (square 1).
       Tokens sharing a square are spread out a little */
    const bySq = {};
    S.p.forEach((toks, p) => toks.forEach((sq, j) => {
      const at = sq >= 1 ? sq : 1;
      (bySq[at] = bySq[at] || []).push([p, j]);
    }));
    const offs = (n, i) => {
      if (n === 1) return [0, 0];
      if (n === 2) return [[-2.6, 0], [2.6, 0]][i];
      if (n === 3) return [[-2.8, 1.2], [2.8, 1.2], [0, -2.2]][i];
      if (n === 4) return [[-2.8, -1.8], [2.8, -1.8], [-2.8, 2], [2.8, 2]][i];
      const a = i / n * 6.2832 - 1.5708; return [Math.cos(a) * 3.6, Math.sin(a) * 3.2];
    };
    let tokens = "";
    Object.keys(bySq).forEach(sq => {
      const list = bySq[sq], xy = cxy(+sq);
      list.forEach(([p, j], i) => {
        const o = offs(list.length, i), mv = p === S.t && movable.has(j);
        tokens += '<div class="snl-tk' + (list.length > 1 ? " sm" : "") + (mv ? " mv" : "") + '" data-p="' + p + '" data-k="' + j + '"' + (mv ? ' data-i="tk"' : "") +
          ' style="--pc:' + BANNER[p] + ";left:" + xy[0] + "%;top:" + xy[1] + "%;margin-left:calc(var(--tw) / -2 + " + o[0] + "%);margin-top:calc(var(--tw) * -.95 + " + o[1] + '%)">' +
          pawn(PAWN[p], k > 1 ? String(j + 1) : "", PAWN_TXT[p]) + "</div>";
      });
    });

    const setupHtml = S.setup ? '<div class="snl-setup' + (can ? "" : " wait") + '"><div class="snl-setup-card"><h3>Tokens per player</h3><p>' +
      (can ? "How many tokens does each player get?" : "Waiting for " + nm(S.t) + " to choose\u2026") + '</p><div class="snl-setup-btns">' +
      [1, 2, 3, 4].map(n => '<button type="button" data-i="kn" data-n="' + n + '" aria-label="' + n + (n === 1 ? " token" : " tokens") + ' each">' + n + "</button>").join("") +
      "</div></div></div>" : "";
    const where = q => q === 0 ? "start" : q === 100 ? "home" : "#" + q;
    const die = '<div class="snl-die" data-v="' + (S.die || 0) + '" role="img" aria-label="' + (S.die ? "Dice shows " + S.die : "Dice") + '">' + "<i></i>".repeat(9) + "</div>";
    const label = S.over ? "Game over" : S.setup ? "Choose tokens" : !can ? "Waiting for " + nm(S.t) + "\u2026" : S.pend ? "Choose a token" : "Roll the dice";
    const h = '<div class="snl"><div class="snl-frame"><div class="snl-in" role="img" aria-label="Snakes and ladders board. ' + S.p.map((toks, i) => nm(i) + " has " + toks.map(where).join(", ")).join("; ") + '.">' +
      '<div class="snl-grid">' + CELLS + '</div><svg class="snl-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + ART + '</svg><div class="snl-nums" aria-hidden="true">' + NUMS + "</div>" + tokens + setupHtml + "</div></div>" +
      '<div class="snl-bar"><div class="snl-act">' + die +
      '<button type="button" class="snl-roll" data-i="roll"' + (can && !S.pend && !S.setup ? "" : " disabled") + ">" + label + "</button></div></div></div>";
    if (S.setup) return [h, "Choose how many tokens each player gets"];
    return [h, S.over ? S.msg : (S.log ? S.log + " \u00B7 " : "") + nm(S.t) + (S.pend ? " to choose a token" : " to roll")];
  },
  click(el) {
    const c = el && el.closest ? el.closest("[data-i]") : el;
    if (!c || !c.dataset) return;
    if (c.dataset.i === "roll") rollNow();
    else if (c.dataset.i === "tk") pickNow(c);
    else if (c.dataset.i === "kn") pickCount(c);
  }
};

/* ---------------- one game: the number of tokens per player is chosen inside it ---------------- */
const GAME = Object.assign({}, core, {
  id: "snl", i: "\uD83D\uDC0D", t: "Snakes & Ladders",
  cat: "classic casual", tag: "1-4 tokens each", diff: "Easy", art: "art-snl",
  d: "Race to 100: roll a 1 to start (and roll again), cut rivals back to the start, climb ladders, dodge snakes. Choose 1-4 tokens each once the game starts.",
  n: NAMES, min: 2, max: 4,
  init: () => {
    const count = playerCount(), first = nextFirst % count;
    return { p: Array.from({ length: count }, () => [0]), k: 1, setup: 1, t: first, first, n: 0, over: 0, die: 0, pend: 0, mv: null, log: "Choose how many tokens each player gets" };
  }
});
const GAMES = [GAME];

let registered = false;
function registerAll() {
  if (registered) return true;
  if (typeof registerGame !== "function") return false;
  GAMES.forEach(g => registerGame(g));
  registered = true;
  return true;
}
if (!registerAll()) {                   // host script may define registerGame a moment later
  let tries = 0;
  const wait = setInterval(() => {
    if (registerAll()) clearInterval(wait);
    else if (++tries > 50) { clearInterval(wait); if (window.console) console.warn("[snakes&ladders] registerGame() was never found, so the games were not added to the list."); }
  }, 200);
}
if (typeof __SNL_TEST !== "undefined") { globalThis.__snlGame = GAMES[0]; globalThis.__snlGames = GAMES; }
})();