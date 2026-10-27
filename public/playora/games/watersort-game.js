// water sort: rules + UI, registered with registerGame(). SOLO puzzle: one player, no turns, no opponent, no multiplayer.
// One file, two modes: if the page already defines registerGame() (your host) the game registers itself there;
// otherwise it runs on its own, so a plain <script src="watersort-game.js"></script> in any page is enough.
// 500 levels; progress resumes from localStorage. Same host conventions as the other games: global S, act(), registerGame().
// Every action is a small integer object: {k:"pour", a:fromTube, b:toTube} | {k:"undo"} | {k:"add"} | {k:"restart"} | {k:"goto", L} | {k:"next"}
// S (JSON only): {L, max, tubes, moves, hist, extra, cleared, t, n, last, over, win, msg}   (t is always 0, kept for the host)
// Local-only UI state (never in S): selected tube, pour animation, popups. Progress is saved by post() after each render.
(() => {
"use strict";

/* ------------------------------------------------------------------ */
/* constants + rules                                                   */
/* ------------------------------------------------------------------ */
const CAP = 8, BH = 0.62, MAXL = 500, EASY = 5, KEY = "waterSortSave_v4";   // CAP = blocks per tube, BH = block height / tube width
let CHROME = 230;                      // px of host page (header, status line, margins) around the board; tune for your layout
const NMS = ["Player"];
const COL = ["#ef4444", "#3b82f6", "#22c55e", "#facc15", "#a855f7", "#f97316",
  "#06b6d4", "#ec4899", "#92400e", "#a3e635", "#e2e8f0", "#64748b"];
const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const solved = t => t.every(x => !x.length || (x.length === CAP && x.every(c => c === x[0])));
const ok = (a, b) => a.length > 0 && b.length < CAP &&
  (b.length ? b[b.length - 1] === a[a.length - 1] : !a.every(c => c === a[0]));

// Solved board scrambled by reversed legal moves, so every level is solvable. Levels 1-5: 6 colours + 2 empty tubes. From level 6: only 1 empty tube, 8 tubes (7 colours) up to level 167, 9 from 168, 10 from 335.
function gen(L, salt = 0) {
  const n = L <= EASY ? 6 : Math.min(9, 7 + ((L - 1) / 167 | 0)), r = mulberry32(L * 7919 + 13 + salt * 104729), t = [];
  for (let i = 0; i < n; i++) t.push(Array(CAP).fill(i));
  t.push([]);
    if (L <= EASY) t.push([]);
  const steps = (60 + n * 30 + L / 2 | 0) * CAP / 2;
  const scramble = () => {
    for (let s = 0; s < steps; s++) {
      const p = [];
      t.forEach((a, i) => {
        const m = a.length;
        if (!m) return;
        const c = a[m - 1];
        if (m > 1 && a[m - 2] !== c) return;
        t.forEach((b, j) => { if (i !== j && b.length < CAP && (!b.length || b[b.length - 1] !== c)) p.push([i, j]); });
      });
      if (!p.length) return;
      const [i, j] = p[r() * p.length | 0];
      t[j].push(t[i].pop());
    }
  };
  scramble();
  for (let k = 0; k < 6 && t.some(x => x.length === CAP && x.every(c => c === x[0])); k++) scramble();
  for (let i = t.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [t[i], t[j]] = [t[j], t[i]]; }
  if (salt < 8 && t.some(x => x.length === CAP && x.every(c => c === x[0]))) return gen(L, salt + 1);
  return t;
}

function openLevel(st, L) {
  st.L = L; st.max = Math.max(st.max || 1, L);
  st.tubes = gen(L); st.moves = 0; st.hist = []; st.extra = 0; st.cleared = 0; st.last = null;
}

function validOn(st, a) {
  if (!st || !a || typeof a !== "object" || st.over) return false;
  const I = Number.isInteger, nT = st.tubes.length;
  switch (a.k) {
    case "pour": return !st.cleared && I(a.a) && I(a.b) && a.a !== a.b && a.a >= 0 && a.b >= 0 && a.a < nT && a.b < nT && ok(st.tubes[a.a], st.tubes[a.b]);
    case "undo": return !st.cleared && st.hist.length > 0;
    case "add": return !st.cleared && !st.extra;
    case "restart": return true;
    case "goto": return I(a.L) && a.L >= 1 && a.L <= st.max;
    case "next": return !!st.cleared && st.L < MAXL;
  }
  return false;
}

// mutates st. Pure function of (st, a).
function applyTo(st, a) {
  if (a.k === "pour") {
    const pre = st.tubes.map(t => t.slice());
    st.hist.push(pre);
    if (st.hist.length > 100) st.hist.shift();
    const A = st.tubes[a.a], B = st.tubes[a.b], c = A[A.length - 1];
    while (A.length && A[A.length - 1] === c && B.length < CAP) B.push(A.pop());
    st.moves++;
    st.last = { pre, a: a.a, b: a.b };
    if (solved(st.tubes)) {
      st.cleared = 1;
      st.max = Math.max(st.max, Math.min(st.L + 1, MAXL));
      if (st.L >= MAXL) { st.over = 1; st.win = 0; st.msg = "All " + MAXL + " levels cleared! \uD83C\uDF89"; }
    }
  } else if (a.k === "undo") {
    st.tubes = st.hist.pop(); st.moves = Math.max(0, st.moves - 1); st.last = null;
  } else if (a.k === "add") {
    st.tubes.push([]); st.hist.forEach(h => h.push([])); st.extra = 1; st.last = null;
  } else if (a.k === "restart") openLevel(st, st.L);
  else if (a.k === "goto") openLevel(st, a.L);
  else if (a.k === "next") openLevel(st, st.L + 1);
  st.n++;
}

/* ------------------------------------------------------------------ */
/* saved progress (browser only)                                       */
/* ------------------------------------------------------------------ */
const okTubes = t => Array.isArray(t) && t.length >= 2 && t.length <= 20 &&
  t.every(a => Array.isArray(a) && a.length <= CAP && a.every(c => Number.isInteger(c) && c >= 0 && c < COL.length));

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Number.isInteger(d.L) && d.L >= 1 && d.L <= MAXL && okTubes(d.tubes)) return d;
  } catch (e) { /* ignore */ }
  return null;
}

let lastSaved = "";
function persist() {
  if (!live()) return;
  const d = JSON.stringify({ L: S.L, max: S.max, tubes: S.tubes, moves: S.moves, hist: S.hist, extra: S.extra });
  if (d === lastSaved) return;
  lastSaved = d;
  try { localStorage.setItem(KEY, d); } catch (e) { /* ignore */ }
}

function initState() {
  const st = { L: 1, max: 1, tubes: [], moves: 0, hist: [], extra: 0, cleared: 0, t: 0, n: 0, last: null, over: 0, win: -1, msg: "" };
  const d = load();
  if (d && !(solved(d.tubes) && d.L >= MAXL)) {          // resume; a finished game starts again from level 1
    st.L = d.L; st.max = Math.max(d.max || 1, d.L); st.tubes = d.tubes; st.moves = d.moves | 0;
    st.hist = Array.isArray(d.hist) ? d.hist.filter(okTubes) : []; st.extra = d.extra ? 1 : 0;
    st.cleared = solved(st.tubes) ? 1 : 0;
  } else { st.max = d ? Math.max(d.max || 1, 1) : 1; openLevel(st, 1); }
  return st;
}

/* ------------------------------------------------------------------ */
/* look                                                                */
/* ------------------------------------------------------------------ */
const CSS = `
.art-watersort{background:linear-gradient(160deg,#5a2d9c,#1a0b3b)}
.ws-wrap{--w:min(94vw,760px);width:var(--w);margin:0 auto;box-sizing:border-box;padding:6px 10px 14px;border-radius:16px;color:#fff;
  background:radial-gradient(120% 90% at 50% 0%,#5a2d9c 0%,#2a1458 60%,#1a0b3b 100%);box-shadow:0 18px 44px rgba(20,8,50,.45);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.ws-wrap *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ws-hud{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 2px}
.ws-hud b{display:block;font-size:20px;line-height:1.1}.ws-hud small{opacity:.7}
.ws-btns{display:flex;gap:8px}
.ws-b,.ws-xcl{width:44px;height:44px;border:0;border-radius:14px;background:rgba(255,255,255,.16);color:#fff;font-size:21px;cursor:pointer}
.ws-b:active{transform:scale(.92)}.ws-b:disabled{opacity:.3;cursor:default}
.ws-b:focus-visible,.ws-next:focus-visible,.ws-xb:focus-visible,.ws-lb:focus-visible,.ws-xcl:focus-visible{outline:3px solid #facc15;outline-offset:2px}
.ws-board{display:flex;justify-content:center;padding:6px 0}
.ws-tubes{--u:50px;position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--u)*.75) 10px}
.ws-t{width:calc(var(--u)*1.15);height:calc(var(--u)*${CAP * BH} + 8px);border:3px solid rgba(255,255,255,.75);border-top:0;border-radius:0 0 calc(var(--u)*.6) calc(var(--u)*.6);
  background:rgba(255,255,255,.09);box-shadow:inset 4px 0 0 rgba(255,255,255,.2);display:flex;flex-direction:column-reverse;padding:0 0 2px;overflow:hidden;
  cursor:pointer;transition:transform .4s ease}
.ws-t.sel{transform:translateY(calc(var(--u)*-.7))}
.ws-t i{display:block;flex:none;height:calc(var(--u)*${BH});border-top:1px solid rgba(255,255,255,.35)}
.ws-stream{position:absolute;z-index:4;pointer-events:none;border-radius:0 0 999px 999px;box-shadow:inset 2px 0 0 rgba(255,255,255,.3)}
.ws-next{display:block;margin:6px auto 0;padding:12px 28px;border:0;border-radius:999px;background:#facc15;color:#2a1458;font:700 16px/1 system-ui,sans-serif;min-height:46px;cursor:pointer}
.ws-hint{margin:8px 2px 0;font-size:12.5px;opacity:.65;text-align:center}
.ws-x{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff}
.ws-xbg{position:absolute;inset:0;background:rgba(14,4,36,.85)}
.ws-xcard,.ws-xm{position:relative;width:min(92vw,400px);padding:26px 28px 24px;text-align:center;border-radius:24px;background:linear-gradient(165deg,#3a1d78,#1a0b3b);box-shadow:0 0 0 4px #facc15,0 26px 70px rgba(0,0,0,.5)}
.ws-xic{font-size:60px;line-height:1}
.ws-xt{margin:8px 0 4px;font-size:clamp(24px,6vw,32px);line-height:1.1}
.ws-xs{margin:0;opacity:.8}
.ws-xb{margin-top:18px;padding:12px 30px;border:0;border-radius:999px;background:#facc15;color:#2a1458;font:700 16px/1 system-ui,sans-serif;cursor:pointer}
.ws-xm{width:min(94vw,560px);max-height:86vh;display:flex;flex-direction:column;padding:16px}
.ws-xh{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.ws-xh h2{margin:0}
.ws-grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:8px;align-content:start}
.ws-lb{height:48px;border:0;border-radius:12px;background:rgba(255,255,255,.15);color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer}
.ws-lb.d{background:#16a34a}.ws-lb.c{outline:3px solid #facc15}.ws-lb:disabled{opacity:.3;cursor:default}
@media (prefers-reduced-motion:reduce){.ws-wrap *,.ws-x *{transition:none!important;animation:none!important}}
`;
function addStyles() {
  if (document.getElementById("watersort-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "watersort-ui-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ */
/* UI state (local to this client — never part of S)                   */
/* ------------------------------------------------------------------ */
let sel = -1, selN = -1, busy = false, animN = null, shown = null, winEl = null, winTimer = 0, animTimers = [];
const live = () => typeof S !== "undefined" && !!S && Array.isArray(S.tubes) && Array.isArray(S.hist);
const canMove = () => !!S && !S.over;
const willAnim = () => animN !== null && S.n > animN && !!S.last && !reduced();

const tubesHTML = T => T.map((t, i) => '<div class="ws-t' + (i === sel ? " sel" : "") + '" data-i="' + i + '">' +
  t.map(c => '<i style="background:' + COL[c] + '"></i>').join("") + "</div>").join("");
const btn = (a, ch, title, dis) => '<button type="button" class="ws-b" data-a="' + a + '" title="' + title + '" aria-label="' + title + '"' + (dis ? " disabled" : "") + ">" + ch + "</button>";

// picks the number of rows that gives the biggest tubes for the current window (portrait or landscape)
function layout(wrap) {
  const n = S.tubes.length, W = Math.min(innerWidth * 0.94, 760) - 24, H = Math.max(220, innerHeight - CHROME);
  let best = 0, bc = n;
  for (let r = 1; r <= 5; r++) {
    const c = Math.ceil(n / r),
      u = Math.min((W - (c - 1) * 10) / (1.15 * c), (H - 8 * r) / (CAP * BH * r + 0.75 * (r - 1) + 0.7), 64);
    if (u > best) { best = u; bc = c; }
  }
  const u = Math.max(best, 10), el = wrap.querySelector(".ws-tubes");
  if (!el) return;
  el.style.setProperty("--u", u + "px");
  el.style.width = Math.ceil(bc * 1.15 * u + (bc - 1) * 10 + 2) + "px";
}
function relayout() {
  const w = document.querySelector(".ws-wrap");
  if (!w || !live()) return;
  if (busy) { finishAnim(); return; }          // sizes changed mid-pour: the animation's measurements are stale, so jump to the final board
  layout(w);
}
addEventListener("resize", relayout);
addEventListener("orientationchange", () => setTimeout(relayout, 250));

/* ------------------------------------------------------------------ */
/* input (delegated: the host replaces the board element on every draw) */
/* ------------------------------------------------------------------ */
function tap(i) {
  if (busy || !canMove() || S.cleared) return;
  const E = document.querySelectorAll(".ws-t"), T = S.tubes;
  if (!E[i]) return;
  if (sel < 0) { if (T[i].length) { sel = i; E[i].classList.add("sel"); } return; }
  const s = sel;
  sel = -1;
  if (E[s]) E[s].classList.remove("sel");
  if (s === i) return;
  const a = { k: "pour", a: s, b: i };
  if (validOn(S, a)) { act(a); return; }
  if (T[i].length) { sel = i; E[i].classList.add("sel"); }       // invalid target: move the selection instead
}

document.addEventListener("click", e => {
  if (!live() || !e.target.closest) return;
  const t = e.target.closest(".ws-t");
  if (t) { tap(+t.dataset.i); return; }
  const b = e.target.closest(".ws-b[data-a],.ws-next");
  if (!b || b.disabled || busy || !canMove()) return;
  const k = b.dataset.a;
  if (k === "lv") { menu(); return; }
  sel = -1;
  const a = { k };
  if (validOn(S, a)) act(a);
});

document.addEventListener("keydown", e => { if (e.key === "Escape" && winEl) closeX(); });

/* ------------------------------------------------------------------ */
/* pour animation (replays S.last from the pre-move board)             */
/*   1. the source tube lifts, travels over the target and tilts       */
/*   2. a stream of colour falls into the target; block by block the   */
/*      source drains while the target fills                           */
/*   3. the source tube returns, then the real board replaces the fake */
/* ------------------------------------------------------------------ */
const later = (fn, ms) => { animTimers.push(setTimeout(fn, ms)); };
function cancelAnim() { animTimers.forEach(clearTimeout); animTimers = []; }

function startAnim(wrap) {
  cancelAnim();
  const m = S.last, E = wrap.querySelectorAll(".ws-t"), A = E[m.a], B = E[m.b], box = wrap.querySelector(".ws-tubes");
  busy = true;
  const pa = m.pre[m.a], pb = m.pre[m.b], c = pa[pa.length - 1];
  let k = 0;                                                      // how many blocks move (same rule as applyTo)
  while (k < pa.length && pa[pa.length - 1 - k] === c && pb.length + k < CAP) k++;
  if (!A || !B || !box || !k) { finishAnim(); return; }

  const u = parseFloat(box.style.getPropertyValue("--u")) || 50, bh = BH * u, R = (CAP * BH * u + 8) / 2;   // R = half the tube height
  const dir = B.offsetLeft >= A.offsetLeft ? 1 : -1;
  const MOVE = 260, FALL = 70, BACK = 220, STEP = Math.max(70, Math.min(160, 560 / k));
  const mouthX = B.offsetLeft + B.offsetWidth / 2, mouthY = B.offsetTop - 0.3 * u;       // where the source's mouth ends up
  const surface = n => B.offsetTop + B.offsetHeight - 5 - n * bh;                          // y of the liquid top when the target holds n blocks
  const reach = n => Math.max(0, surface(n) - mouthY);                                     // stream length down to that surface
  const ease = "height " + STEP + "ms linear, border-top-width " + STEP + "ms linear";

  // 1. start from the lifted ("selected") pose so the tube doesn't drop before it travels
  A.style.zIndex = 5;
  A.style.transition = "none";
  A.style.transform = "translate(0px," + (-0.7 * u) + "px)";
  void A.offsetWidth;
  A.style.transition = "transform " + MOVE + "ms ease";
  A.style.transform = "translate(" + (B.offsetLeft - A.offsetLeft - dir * 0.82 * R) + "px," + (B.offsetTop - A.offsetTop - 0.3 * u - 0.43 * R) + "px) rotate(" + dir * 55 + "deg)";

  // 2. the stream starts once the tube is in place
  const w = Math.max(4, 0.13 * u), sx = document.createElement("div");
  sx.className = "ws-stream";
  sx.style.cssText = "left:" + (mouthX - w / 2) + "px;top:" + mouthY + "px;width:" + w + "px;height:0px;background:" + COL[c];
  later(() => {
    box.appendChild(sx);
    void sx.offsetWidth;
    sx.style.transition = "height " + FALL + "ms linear";
    sx.style.height = reach(pb.length) + "px";
  }, MOVE);

  // ...then one block per step leaves the source and lands in the target
  for (let j = 0; j < k; j++) later(() => {
    const top = A.children[pa.length - 1 - j];
    if (top) {
      top.style.transition = ease;
      top.style.height = "0px";
      top.style.borderTopWidth = "0px";
    }
    const nb = document.createElement("i");
    nb.style.cssText = "background:" + COL[c] + ";height:0px;border-top-width:0px";
    B.appendChild(nb);
    void nb.offsetWidth;
    nb.style.transition = ease;
    nb.style.height = bh + "px";
    nb.style.borderTopWidth = "1px";
    sx.style.transition = "height " + STEP + "ms linear";
    sx.style.height = reach(pb.length + j + 1) + "px";
  }, MOVE + FALL + j * STEP);

  // 3. stream stops, tube goes home, real board takes over
  const end = MOVE + FALL + k * STEP;
  later(() => {
    sx.style.transition = "opacity 80ms linear";
    sx.style.opacity = "0";
    A.style.transition = "transform " + BACK + "ms ease";
    A.style.transform = "translate(0px,0px) rotate(0deg)";
  }, end);
  later(finishAnim, end + BACK + 30);
}

function finishAnim() {
  cancelAnim();
  busy = false;
  const wrap = document.querySelector(".ws-wrap");
  if (wrap && live()) {
    const el = wrap.querySelector(".ws-tubes");
    if (el) el.innerHTML = tubesHTML(S.tubes);
    layout(wrap);
  }
  maybeBanner();
}

/* ------------------------------------------------------------------ */
/* popups: level complete + level picker (plain DOM on <body>)         */
/* ------------------------------------------------------------------ */
function closeX() {
  clearTimeout(winTimer);
  if (winEl) winEl.remove();
  winEl = null;
}

function popup(label, html) {
  closeX();
  const el = document.createElement("div");
  el.className = "ws-x";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", label);
  el.innerHTML = '<div class="ws-xbg"></div>' + html;
  el.querySelector(".ws-xbg").addEventListener("click", () => closeX());
  document.body.appendChild(el);
  winEl = el;
  return el;
}

function celebrate() {
  const end = !!S.over;
  const el = popup("Level complete", '<div class="ws-xcard"><div class="ws-xic" aria-hidden="true">\uD83C\uDF89</div><h2 class="ws-xt"></h2><p class="ws-xs"></p><button type="button" class="ws-xb"></button></div>');
  el.querySelector(".ws-xt").textContent = end ? "All " + MAXL + " levels cleared!" : "Level " + S.L + " complete!";
  el.querySelector(".ws-xs").textContent = S.moves + " moves";
  const b = el.querySelector(".ws-xb");
  b.textContent = end ? "Close" : "Next level";
  b.addEventListener("click", () => {
    closeX();
    const a = { k: "next" };
    if (!end && canMove() && validOn(S, a)) act(a);
  });
  try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (navigator.vibrate) { try { navigator.vibrate([60, 40, 120]); } catch (e) { /* ignore */ } }
}

function maybeBanner() {
  if (!S || !S.cleared || busy) return;
  const key = S.L + "|" + S.n;
  if (shown === key) return;
  shown = key;
  clearTimeout(winTimer);
  winTimer = setTimeout(() => { if (S.cleared && shown === key) celebrate(); }, reduced() ? 0 : 350);
}

function menu() {
  let g = "";
  for (let i = 1; i <= MAXL; i++) g += '<button type="button" class="ws-lb' + (i < S.max ? " d" : "") + (i === S.L ? " c" : "") + '" data-l="' + i + '"' + (i > S.max ? " disabled" : "") + ">" + i + "</button>";
  const el = popup("Choose a level", '<div class="ws-xm"><div class="ws-xh"><h2>Levels</h2><button type="button" class="ws-xcl" aria-label="Close">\u2715</button></div><div class="ws-grid">' + g + "</div></div>");
  el.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button");
    if (!b) return;
    const L = +b.dataset.l;
    closeX();
    if (L && L !== S.L && canMove() && validOn(S, { k: "goto", L })) act({ k: "goto", L });
  });
  const c = el.querySelector(".ws-lb.c");
  if (c) c.scrollIntoView({ block: "center" });
}

/* ------------------------------------------------------------------ */
/* after each render (the board element is replaced on every draw)      */
/* ------------------------------------------------------------------ */
function post() {
  const wrap = document.querySelector(".ws-wrap");
  if (!wrap || wrap.dataset.wsui || !live()) return;
  wrap.dataset.wsui = "1";
  layout(wrap);
  let animate = false;
  if (animN === null || S.n < animN) animN = S.n;
  else if (S.n > animN) { animN = S.n; animate = !!S.last && !reduced(); }
  if (!S.cleared && shown) { shown = null; closeX(); }
  persist();
  if (animate) startAnim(wrap);
  else { cancelAnim(); busy = false; maybeBanner(); }
}

const OBS_OPT = { childList: true, subtree: true };
let obs = null;
function startObserver() {
  addStyles();
  obs = new MutationObserver(() => { obs.disconnect(); try { post(); } finally { obs.observe(document.body, OBS_OPT); } });
  obs.observe(document.body, OBS_OPT);
  post();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();
}

/* ------------------------------------------------------------------ */
/* game definition                                                     */
/* ------------------------------------------------------------------ */
const game = {
  id: "watersort", i: "\uD83E\uDDEA", t: "Water Sort", max: 1, cat: "puzzle", tag: "Pour & sort", diff: "Easy to learn", art: "art-watersort",
  d: "Pour the colours until every tube holds just one. 500 levels, and your progress is saved so you can pick up where you left off.",
  get n() { return NMS; },
  valid: a => validOn(S, a),
  init: initState,
  apply(a) { if (validOn(S, a)) applyTo(S, a); },
  draw() {
    if (selN !== S.n) { sel = -1; selN = S.n; }
    const anim = willAnim(), T = anim ? S.last.pre : S.tubes;
    let h = '<div class="ws-wrap"><div class="ws-hud"><div><b>Level ' + S.L + " / " + MAXL + "</b><small>" + S.moves + " moves</small></div>" +
      '<div class="ws-btns">' + btn("lv", "\u2630", "Choose level") + btn("undo", "\u21B6", "Undo", !S.hist.length || S.cleared) +
      btn("restart", "\u21BB", "Restart level") + btn("add", "\uFF0B", "Add an empty tube (once per level)", S.extra || S.cleared) + "</div></div>" +
      '<div class="ws-board"><div class="ws-tubes">' + tubesHTML(T) + "</div></div>" +
      (S.cleared && !S.over ? '<button type="button" class="ws-next" data-a="next">Next level</button>' : "") +
      '<p class="ws-hint">Tap a tube, then tap another to pour</p></div>';
    const status = S.over ? S.msg : S.cleared ? "Level " + S.L + " complete!" : "Level " + S.L + " \u2014 " + S.moves + " moves";
    return [h, status];
  },
  click() { /* input is handled by the delegated listeners above */ }
};

/* ------------------------------------------------------------------ */
/* standalone mode: no host on the page, so this file runs the game itself */
/* ------------------------------------------------------------------ */
function standalone() {
  CHROME = 150;
  const go = () => {
    const st = document.createElement("style");
    st.textContent = "html,body{margin:0;height:100%;background:#1a0b3b}" +
      "#ws-root{position:fixed;inset:0;overflow:auto;display:flex;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}" +
      "#ws-root>.ws-wrap{margin:auto}";
    document.head.appendChild(st);
    if (!document.title) document.title = "Water Sort Puzzle";
    if (!document.querySelector("meta[name=viewport]")) {
      const m = document.createElement("meta");
      m.name = "viewport";
      m.content = "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover";
      document.head.appendChild(m);
    }
    const root = document.createElement("div");
    root.id = "ws-root";
    document.body.appendChild(root);
    window.S = game.init();
    const render = () => { root.innerHTML = game.draw()[0]; };
    window.act = a => { if (game.valid(a)) { game.apply(a); render(); } };
    render();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
}

if (typeof registerGame === "function") registerGame(game);
else if (typeof document !== "undefined") standalone();
if (typeof __WS_TEST !== "undefined") globalThis.__wsCore = { gen, solved, ok, validOn, applyTo, initState, game };
})();