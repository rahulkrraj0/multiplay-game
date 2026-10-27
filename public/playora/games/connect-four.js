// connect-four: rules + UI, registered with registerGame(). 2 players (seat 0 = Red, seat 1 = Yellow).
// Same conventions as chess/ludo: globals S, nm(), canAct(), act(), registerGame().
// Features: first move rotates every game (Red, then Yellow, then Red...), gravity drop animation,
// last-move marker, winning-line highlight, keyboard play (Tab to the board, arrows to pick a column,
// Enter/Space to drop), win banner with confetti, board that always uses the largest possible size at a
// fixed 7:6 ratio for any screen, and a local-play bot (alpha-beta search).
(() => {
"use strict";

/* ------------------------------------------------------------------ */
/* rules                                                               */
/* ------------------------------------------------------------------ */
// board: array of 42, index = row * 7 + col, row 0 = top. -1 = empty, 0 = Red, 1 = Yellow.
const R = 6, C = 7, N = R * C;
const NMS = ["Red", "Yellow"];
const COLORS = ["#ef4444", "#facc15"];
const ix = (r, c) => r * C + c;
const who = s => (typeof nm === "function" ? nm(s) : NMS[s]);
const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// lowest free row in column c, or -1 when the column is full
function dropRow(b, c) {
  for (let r = R - 1; r >= 0; r--) if (b[ix(r, c)] < 0) return r;
  return -1;
}

// the four cells that make a line for player p, or null
function findLine(b, p) {
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (b[ix(r, c)] !== p) continue;
    for (const [dr, dc] of DIRS) {
      const cells = [ix(r, c)];
      for (let k = 1; k < 4; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= R || cc < 0 || cc >= C || b[ix(rr, cc)] !== p) break;
        cells.push(ix(rr, cc));
      }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* bot (local play only — returns a normal action)                     */
/* ------------------------------------------------------------------ */
const ORDER = [3, 2, 4, 1, 5, 0, 6];

function heuristic(b, p) {
  const o = 1 - p;
  let score = 0;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dr, dc] of DIRS) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= R || ec < 0 || ec >= C) continue;
    let mine = 0, theirs = 0;
    for (let k = 0; k < 4; k++) {
      const v = b[ix(r + dr * k, c + dc * k)];
      if (v === p) mine++; else if (v === o) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) score += 50; else if (mine === 2) score += 10;
    if (theirs === 3) score -= 60; else if (theirs === 2) score -= 8;
  }
  for (let r = 0; r < R; r++) if (b[ix(r, 3)] === p) score += 4;
  return score;
}

function search(b, turn, me, depth, alpha, beta, filled) {
  if (findLine(b, me)) return 100000 + depth;
  if (findLine(b, 1 - me)) return -100000 - depth;
  if (filled >= N || depth === 0) return heuristic(b, me);
  const max = turn === me;
  let best = max ? -Infinity : Infinity;
  for (const c of ORDER) {
    const r = dropRow(b, c);
    if (r < 0) continue;
    b[ix(r, c)] = turn;
    const v = search(b, 1 - turn, me, depth - 1, alpha, beta, filled + 1);
    b[ix(r, c)] = -1;
    if (max) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (alpha >= beta) break;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* look                                                                */
/* ------------------------------------------------------------------ */
/*
  Sizing: the board is always an exact 7:4 rectangle (aspect-ratio 7/4). Padding is 1% and gaps 1.2% of
  the width. Discs stay perfect circles, centred in their (wider) columns. Its width is the largest value that fits BOTH the screen width
  and the screen height (minus --rsv, the room kept for the page header / status line), so it grows
  to fill any phone, tablet, laptop or wide monitor and never overflows. Change --rsv if your page
  has a taller or shorter header.
*/
const CSS = `
.cf4{--vh:1vh;--rsv:120px;--w:min(calc(100vw - 16px),calc((var(--vh) * 100 - var(--rsv)) * 7 / 4));
  --gap:calc(var(--w) * .012);--pad:calc(var(--w) * .01);--tc:#ef4444;position:relative;display:grid;
  grid-template-columns:repeat(7,1fr);gap:var(--gap);width:var(--w);height:auto;aspect-ratio:7/4;margin:0 auto;padding:var(--pad);box-sizing:border-box;
  background:linear-gradient(160deg,#2563eb,#1e40af);border-radius:calc(var(--w) * .04);overflow:hidden;isolation:isolate;
  box-shadow:0 18px 44px rgba(15,30,80,.38),inset 0 0 0 2px rgba(255,255,255,.12)}
@supports (height:1dvh){.cf4{--vh:1dvh}}
.cf4 .cf4-col{position:relative;display:grid;grid-template-columns:100%;grid-template-rows:repeat(6,1fr);gap:var(--gap);margin:0;padding:0;border:0;min-width:0;min-height:0;
  border-radius:999px;background:transparent;cursor:pointer;font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.cf4 .cf4-col.off{cursor:default}
@media (hover:hover){.cf4 .cf4-col:not(.off):hover{background:rgba(255,255,255,.16)}}
.cf4 .cf4-col:not(.off):active{background:rgba(255,255,255,.24)}
.cf4 .cf4-col:focus-visible{outline:3px solid #fff;outline-offset:1px;background:rgba(255,255,255,.18)}
.cf4 .cf4-cell{position:relative;display:block;height:100%;aspect-ratio:1/1;justify-self:center;min-width:0;min-height:0;border-radius:50%;background:#0b1b4a;
  box-shadow:inset 0 4px 7px rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.18)}
.cf4 .cf4-cell,.cf4 .cf4-col{opacity:1!important;filter:none!important}
.cf4 .cf4-cell.p0,.cf4 .cf4-cell.p1{box-shadow:inset 0 -4px 6px rgba(0,0,0,.3),inset 0 3px 5px rgba(255,255,255,.35),0 0 0 2px rgba(0,0,0,.18)}
.cf4 .cf4-cell.p0{background:radial-gradient(circle at 35% 30%,#fca5a5,#ef4444 55%,#b91c1c)}
.cf4 .cf4-cell.p1{background:radial-gradient(circle at 35% 30%,#fef08a,#facc15 55%,#ca8a04)}
.cf4 .cf4-cell.win{animation:cf4-pulse .8s ease-in-out infinite alternate;z-index:2}
.cf4 .cf4-cell.win::after{content:"";position:absolute;inset:-5%;border-radius:50%;border:3px solid #fff;box-shadow:0 0 14px 3px rgba(255,255,255,.85)}
.cf4.won{box-shadow:inset 0 0 0 5px var(--wc,#facc15),inset 0 0 30px 8px var(--wc,#facc15),0 18px 44px rgba(15,30,80,.38)}
.cf4-x{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cf4-xbg{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(15,23,42,.3),rgba(15,23,42,.75))}
.cf4-xcv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cf4-xcard{position:relative;box-sizing:border-box;width:min(90vw,400px);padding:26px 30px 24px;text-align:center;border-radius:26px;
  background:linear-gradient(165deg,#ffffff,#eef2ff);box-shadow:0 0 0 5px var(--w),0 0 60px 8px color-mix(in srgb,var(--w) 55%,transparent),0 26px 70px rgba(0,0,0,.4)}
.cf4-xic{font-size:64px;line-height:1;display:inline-block;filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));animation:cf4-ic 1.1s ease-in-out infinite alternate}
.cf4-xt{margin:8px 0 4px;font-size:clamp(26px,6.5vw,36px);font-weight:900;line-height:1.1;color:#0f172a}
.cf4-xs{margin:0;color:#475569;font-size:15px;line-height:1.4}
.cf4-xb{margin-top:18px;padding:11px 30px;border:0;border-radius:999px;background:#1e40af;color:#fff;font:700 15px/1 system-ui,sans-serif;
  cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.25);transition:transform .15s}
.cf4-xb:hover{transform:translateY(-2px)}
.cf4-xb:focus-visible{outline:3px solid #111827;outline-offset:3px}
@keyframes cf4-in{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}
@keyframes cf4-pulse{from{transform:scale(1)}to{transform:scale(.9)}}
@keyframes cf4-glow{from{box-shadow:0 0 0 0 var(--wc,#facc15),0 18px 44px rgba(15,30,80,.38)}to{box-shadow:0 0 0 5px var(--wc,#facc15),0 0 44px 10px var(--wc,#facc15)}}
@keyframes cf4-fade{from{opacity:0}to{opacity:1}}
@keyframes cf4-fadeout{from{opacity:1}to{opacity:0}}
@keyframes cf4-card{0%{opacity:0;transform:translateY(40px) scale(.6) rotate(-4deg)}100%{opacity:1;transform:none}}
@keyframes cf4-cardout{to{opacity:0;transform:translateY(20px) scale(.9)}}
@keyframes cf4-ic{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(8deg) scale(1.12)}}

/* wide screens: bigger win banner (the board already scales by itself) */
@media (min-width:900px) and (min-height:700px){
  .cf4-xcard{width:min(90vw,460px);padding:32px 36px 28px}
  .cf4-xic{font-size:76px}
}

/* phones in landscape: little vertical room is kept for the page header */
@media (orientation:landscape) and (max-height:520px){
  .cf4{--rsv:56px}
}

/* win banner: safe areas, short screens, scrolling if needed */
.cf4-x{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box}
.cf4-xcard{max-height:92%;overflow:auto}
@media (max-height:480px){
  .cf4-xcard{padding:14px 22px}
  .cf4-xic{font-size:38px}
  .cf4-xt{margin:4px 0 2px;font-size:22px}
  .cf4-xs{font-size:13px}
  .cf4-xb{margin-top:10px;padding:9px 24px}
}

@media (prefers-reduced-motion:reduce){.cf4,.cf4 *,.cf4-x *{animation:none!important;transition:none!important}}
`;
function addStyles() {
  if (document.getElementById("cf4-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "cf4-ui-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ */
/* UI state (local to this client — never part of S)                   */
/* ------------------------------------------------------------------ */
let kbFocus = null, animN = null, shown = null, winEl = null, stopFx = null, winTimer = 0;

const canMove = () => !S.over && (typeof canAct !== "function" || canAct());

document.addEventListener("click", e => {
  if (typeof S === "undefined" || !S || !S.b || !e.target.closest) return;
  const btn = e.target.closest(".cf4 .cf4-col");
  if (!btn) return;
  kbFocus = e.detail > 0 ? null : +btn.dataset.c; // keyboard "clicks" have detail 0
  if (!canMove()) return;
  const a = { c: +btn.dataset.c };
  if (game.valid(a)) act(a);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && winEl) { closeBanner(); return; }
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains("cf4-col")) return;
  const cols = t.parentNode.children, c = +t.dataset.c;
  const to = e.key === "ArrowLeft" ? c - 1 : e.key === "ArrowRight" ? c + 1 : e.key === "Home" ? 0 : e.key === "End" ? C - 1 : null;
  if (to === null || to < 0 || to >= C) return;
  e.preventDefault();
  kbFocus = to;
  Array.from(cols).forEach((b, i) => { b.tabIndex = i === to ? 0 : -1; });
  cols[to].focus();
});

/* ------------------------------------------------------------------ */
/* effects                                                             */
/* ------------------------------------------------------------------ */
function dropFx(cb) {
  const m = S.last;
  if (!m || reduced()) return;
  const col = cb.children[m.c];
  const cell = col && col.children[m.r];
  if (!cell || !cell.animate) return;
  // The falling disc is a separate overlay, so the slot it lands in keeps showing its empty hole
  // (animating the cell itself used to carry the hole away and leave a gap in the board).
  const br = cb.getBoundingClientRect(), cr = cell.getBoundingClientRect();
  const top = cr.top - br.top, size = cr.height;
  const dist = top + size + 4;
  const dur = Math.round(Math.min(560, 200 + (m.r + 1) * 60));
  const disc = document.createElement("span");
  disc.className = "cf4-cell p" + m.p;
  disc.setAttribute("aria-hidden", "true");
  disc.style.cssText = `position:absolute;left:${cr.left - br.left}px;top:${top}px;width:${cr.width}px;height:${cr.height}px;` +
    "z-index:5;pointer-events:none;margin:0";
  cb.appendChild(disc);
  cell.style.background = "#0b1b4a";
  cell.style.boxShadow = "inset 0 4px 7px rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.18)";
  const done = () => { disc.remove(); cell.style.background = ""; cell.style.boxShadow = ""; };
  const a = disc.animate([
    { transform: `translateY(${-dist}px)`, offset: 0, easing: "cubic-bezier(.5,0,1,.6)" },
    { transform: "translateY(0)", offset: 0.62, easing: "ease-out" },
    { transform: "translateY(-10%)", offset: 0.8, easing: "ease-in" },
    { transform: "translateY(0)", offset: 1 }
  ], { duration: dur, fill: "backwards" });
  a.onfinish = a.oncancel = done;
}

function closeBanner(now) {
  clearTimeout(winTimer);
  if (stopFx) { stopFx(); stopFx = null; }
  const el = winEl; winEl = null;
  if (!el) return;
  if (now || reduced()) { el.remove(); return; }
  el.classList.add("out");
  setTimeout(() => el.remove(), 300);
}

function celebrate(win, title, sub) {
  closeBanner(true);
  const draw = win < 0;
  const el = document.createElement("div");
  el.className = "cf4-x";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Game over");
  el.style.setProperty("--w", draw ? "#64748b" : COLORS[win]);
  el.innerHTML = '<div class="cf4-xbg"></div><canvas class="cf4-xcv"></canvas><div class="cf4-xcard"><div class="cf4-xic" aria-hidden="true"></div>' +
    '<h2 class="cf4-xt"></h2><p class="cf4-xs"></p><button type="button" class="cf4-xb">Close</button></div>';
  el.querySelector(".cf4-xic").textContent = draw ? "\uD83E\uDD1D" : "\uD83C\uDFC6";
  el.querySelector(".cf4-xt").textContent = title;
  el.querySelector(".cf4-xs").textContent = sub;
  el.querySelector(".cf4-xb").addEventListener("click", () => closeBanner());
  el.querySelector(".cf4-xbg").addEventListener("click", () => closeBanner());
  document.body.appendChild(el);
  winEl = el;
  if (!draw) stopFx = confetti(el.querySelector(".cf4-xcv"));
  try { el.querySelector(".cf4-xb").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (!draw && navigator.vibrate) { try { navigator.vibrate([90, 50, 90, 50, 220]); } catch (e) { /* ignore */ } }
}

function confetti(cv) {
  if (reduced() || !cv.getContext) return () => {};
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const cols = ["#ef4444", "#facc15", "#2563eb", "#22c55e", "#ffffff", "#ec4899"];
  const rnd = (a, b) => a + Math.random() * (b - a);
  let W = 0, H = 0, raf = 0, alive = true;
  const t0 = performance.now(); let last = t0;
  const ps = [];
  const resize = () => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  resize(); addEventListener("resize", resize);
  const add = (x, y, vx, vy) => ps.push({ x, y, vx, vy, w: rnd(7, 13), h: rnd(5, 9), r: rnd(0, 6.3), vr: rnd(-9, 9),
    tl: rnd(0, 6.3), vt: rnd(5, 11), c: cols[(Math.random() * cols.length) | 0] });
  for (let i = 0; i < 130; i++) {
    const left = i % 2 === 0, a = ((left ? -58 : -122) + rnd(-20, 20)) * Math.PI / 180, s = rnd(0.45, 1) * Math.max(650, H * 1.1);
    add(left ? 0 : W, H, Math.cos(a) * s, Math.sin(a) * s);
  }
  const stop = () => { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); ctx.clearRect(0, 0, W, H); };
  const frame = now => {
    if (!alive) return;
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    const el = (now - t0) / 1000;
    if (el > 0.6 && el < 4) for (let n = Math.round(80 * dt + Math.random()); n > 0; n--) add(rnd(0, W), -12, rnd(-60, 60), rnd(40, 160));
    ctx.clearRect(0, 0, W, H);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.vy += 1000 * dt; p.vx *= Math.exp(-1.3 * dt); p.vy *= Math.exp(-0.9 * dt);
      if (p.vy > 330) p.vy = 330;
      p.x += (p.vx + Math.sin(p.tl) * 40) * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.tl += p.vt * dt;
      if (p.y > H + 24) { ps.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.tl)); ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (el > 5 && !ps.length) { stop(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return stop;
}

/* ------------------------------------------------------------------ */
/* after each render (the board element is replaced on every draw)      */
/* ------------------------------------------------------------------ */
function post() {
  const cb = document.querySelector(".cf4");
  if (!cb || cb.dataset.cfui || typeof S === "undefined" || !S || !S.b) return;
  cb.dataset.cfui = "1";
  if (typeof S.n === "number") {
    if (animN === null || S.n < animN) { animN = S.n; cb.classList.add("fresh"); }
    else if (S.n > animN) { animN = S.n; dropFx(cb); }
  }
  if (kbFocus !== null && cb.children[kbFocus]) {
    try { cb.children[kbFocus].focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  if (S.over) {
    const key = S.msg + "|" + S.n;
    if (shown !== key) {
      shown = key;
      const w = S.win, sub = String(S.msg || "").replace(/[^\x20-\u024F\u2014\u2013]/g, "").trim();
      clearTimeout(winTimer);
      winTimer = setTimeout(() => { if (S.over && shown === key) celebrate(w, w < 0 ? "Draw" : `${who(w)} wins!`, sub); }, reduced() ? 0 : 650);
    }
  } else if (shown) { shown = null; closeBanner(true); }
}

let obs = null;
function startObserver() {
  addStyles();
  obs = new MutationObserver(() => { obs.disconnect(); try { post(); } finally { obs.observe(document.body, { childList: true, subtree: true }); } });
  obs.observe(document.body, { childList: true, subtree: true });
  post();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();
}

/* ------------------------------------------------------------------ */
/* game definition                                                     */
/* ------------------------------------------------------------------ */
// Rotating first move: the starter of a new game is the opposite of whoever started the previous
// Connect Four game (Red, Yellow, Red, ...). The starter is kept in the state (S.st) so every client
// sees the same value; the very first game starts with Red.
function nextStarter() {
  const prev = (typeof S !== "undefined" && S && S.gid === "connect-four" && (S.st === 0 || S.st === 1)) ? S.st : null;
  return prev === null ? 0 : 1 - prev;
}

const game = {
  id: "connect-four", i: "\uD83D\uDD34", t: "Connect Four", max: 2, cat: "classic strategy", tag: "\uD83D\uDD34 Classic", diff: "Easy to learn", art: "art-connect-four",
  d: "Drop discs and line up four in a row \u2014 across, up and down, or on the diagonal. Block your rival to win!",
  get n() { return NMS; },
  valid: a => !!a && typeof a === "object" && !S.over && Number.isInteger(a.c) && a.c >= 0 && a.c < C && dropRow(S.b, a.c) >= 0,
  init: () => {
    const st = nextStarter();
    return { gid: "connect-four", st, b: new Array(N).fill(-1), t: st, n: 0, last: null, line: [], over: 0, win: -1, msg: "" };
  },
  apply(a) {
    if (!game.valid(a)) return;
    const p = S.t, r = dropRow(S.b, a.c);
    S.b = S.b.slice();
    S.b[ix(r, a.c)] = p;
    S.n++;
    S.last = { r, c: a.c, p };
    const line = findLine(S.b, p);
    if (line) { S.over = 1; S.win = p; S.line = line; S.msg = `${who(p)} connects four! \uD83C\uDF89`; }
    else if (S.n >= N) { S.over = 1; S.win = -1; S.msg = "Draw \u2013 the board is full"; }
    else S.t = 1 - p;
  },
  bot() {
    const me = S.t, b = S.b.slice();
    let best = -Infinity, choices = [];
    for (const c of ORDER) {
      const r = dropRow(b, c);
      if (r < 0) continue;
      b[ix(r, c)] = me;
      const v = search(b, 1 - me, me, 5, -Infinity, Infinity, S.n + 1);
      b[ix(r, c)] = -1;
      if (v > best) { best = v; choices = [c]; }
      else if (v === best) choices.push(c);
    }
    if (!choices.length) return null;
    return { c: choices[Math.floor(Math.random() * choices.length)] };
  },
  draw() {
    const open = canMove(), last = S.last;
    const lineSet = new Set(S.over && S.win >= 0 ? S.line : []);
    const tab = kbFocus !== null ? kbFocus : 3;
    const tc = COLORS[S.over ? Math.max(S.win, 0) : S.t];
    let h = `<div class="cf4${S.over && S.win >= 0 ? " won" : ""}" role="group" aria-label="Connect Four board" style="--tc:${tc};--wc:${tc}">`;
    for (let c = 0; c < C; c++) {
      const free = dropRow(S.b, c) + 1, off = !open || free === 0;
      h += `<button type="button" class="cf4-col${off ? " off" : ""}" data-c="${c}" tabindex="${c === tab ? 0 : -1}"` +
        ` aria-disabled="${off}" aria-label="Column ${c + 1}, ${free ? free + (free === 1 ? " slot" : " slots") + " free" : "full"}">`;
      for (let r = 0; r < R; r++) {
        const v = S.b[ix(r, c)];
        h += `<span class="cf4-cell${v >= 0 ? " p" + v : ""}${lineSet.has(ix(r, c)) ? " win" : ""}"></span>`;
      }
      h += "</button>";
    }
    const status = S.over ? S.msg
      : S.n === 0 ? `${who(S.t)} starts this game`
      : `${who(S.t)} to move${last ? " \u2013 last disc in column " + (last.c + 1) : ""}`;
    return [h + "</div>", status];
  },
  click() { /* input is handled by the delegated listener above (columns carry data-c, not data-m) */ }
};

if (typeof registerGame === "function") registerGame(game);
if (typeof __CF4_TEST !== "undefined") globalThis.__cf4Core = { dropRow, findLine, game };
})();