// tic-tac-toe: registered with registerGame(), so it gets a homepage card and online play automatically.
// Globals used: S (state), G (this game), nm(t), act(action), canAct() if the host provides it.
// Look: ink on paper. Marks are drawn stroke-by-stroke, the winning line is drawn across the board,
// then a celebration (confetti + fireworks + banner) plays. Keyboard: arrows move, Enter/Space plays.
(() => {
"use strict";

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const INK = { X: "#e8401c", O: "#2a62d9" };
const INK_DARK = { X: "#a22a0f", O: "#173f8f" };
const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const markSvg = (v, cls) => v === "X"
  ? `<svg class="mk ${cls}" viewBox="0 0 100 100" aria-hidden="true" style="color:${INK.X}"><path pathLength="1" d="M24 24L76 76"/><path pathLength="1" d="M76 24L24 76"/></svg>`
  : `<svg class="mk ${cls}" viewBox="0 0 100 100" aria-hidden="true" style="color:${INK.O}"><circle pathLength="1" cx="50" cy="50" r="27" transform="rotate(-90 50 50)"/></svg>`;

const ghost = (v) => "url(\"data:image/svg+xml," + encodeURIComponent(v === "X"
  ? `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M24 24L76 76M76 24L24 76' stroke='${INK.X}' stroke-width='11' stroke-linecap='round' fill='none'/></svg>`
  : `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='27' stroke='${INK.O}' stroke-width='11' fill='none'/></svg>`) + "\")";

const CSS = `
.g.c3.tt{--bs:min(88vw,70vh,420px);position:relative;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr)!important;
  width:var(--bs)!important;height:var(--bs)!important;max-width:none!important;aspect-ratio:1/1!important;margin:0 auto;padding:10px;gap:0!important;box-sizing:border-box;
  border:0;border-radius:22px;background:#f6efe0;
  background-image:radial-gradient(circle at 20% 15%,rgba(255,255,255,.7),transparent 55%),radial-gradient(circle at 85% 90%,rgba(190,160,110,.18),transparent 60%);
  box-shadow:0 16px 40px rgba(60,40,10,.22),0 2px 6px rgba(60,40,10,.15),inset 0 0 0 1px rgba(120,90,40,.18);isolation:isolate}
.g.c3.tt .bd{position:absolute;inset:10px;pointer-events:none;z-index:2}
.g.c3.tt .ln{position:absolute;display:block!important;opacity:1!important;background:#111827!important;border-radius:8px}
.g.c3.tt .ln.v{width:8px;top:0;bottom:0;transform:translateX(-50%)}
.g.c3.tt .ln.h{height:8px;left:0;right:0;transform:translateY(-50%)}
.g.c3.tt.fresh .ln.v{animation:tt-lv .5s cubic-bezier(.3,.7,.2,1) both}
.g.c3.tt.fresh .ln.h{animation:tt-lh .5s cubic-bezier(.3,.7,.2,1) both}
.g.c3.tt .ln:nth-child(2),.g.c3.tt .ln:nth-child(4){animation-delay:.12s}
.g.c3.tt .sq{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;
  aspect-ratio:auto;width:auto;height:auto;margin:0;padding:0;border:0!important;border-radius:12px;background:transparent!important;box-shadow:none!important;font-size:0;
  cursor:default;user-select:none;-webkit-tap-highlight-color:transparent;transition:background-color .15s ease}
.g.c3.tt .sq.e{cursor:pointer}
.g.c3.tt .sq.e:hover,.g.c3.tt .sq.e:focus-visible{background:rgba(38,50,63,.07)!important}
.g.c3.tt .sq:focus-visible{outline:3px solid #111827;outline-offset:-4px}
.g.c3.tt[data-p="X"] .sq.e:hover::after,.g.c3.tt[data-p="X"] .sq.e:focus-visible::after{background-image:${ghost("X")}}
.g.c3.tt[data-p="O"] .sq.e:hover::after,.g.c3.tt[data-p="O"] .sq.e:focus-visible::after{background-image:${ghost("O")}}
.g.c3.tt .sq.e:hover::after,.g.c3.tt .sq.e:focus-visible::after{content:"";position:absolute;inset:19%;opacity:.25;
  background-position:center;background-size:contain;background-repeat:no-repeat;pointer-events:none}
.g.c3.tt .mk{width:62%;height:62%;overflow:visible;pointer-events:none}
.g.c3.tt .mk path,.g.c3.tt .mk circle{fill:none;stroke:currentColor;stroke-width:11;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:0}
.g.c3.tt .mk.new{animation:tt-pop .32s ease-out both}
.g.c3.tt .mk.new path,.g.c3.tt .mk.new circle{animation:tt-draw .24s ease-out both}
.g.c3.tt .mk.new path:nth-child(2){animation-delay:.2s}
.g.c3.tt .mk.new circle{animation-duration:.46s;animation-timing-function:cubic-bezier(.4,.1,.2,1)}
.g.c3.tt .wl{position:absolute;inset:10px;width:calc(100% - 20px);height:calc(100% - 20px);z-index:3;pointer-events:none;overflow:visible}
.g.c3.tt .wl line{stroke-width:9;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:0;
  animation:tt-draw .5s .3s cubic-bezier(.4,.1,.2,1) both;filter:drop-shadow(0 0 6px currentColor)}
.g.c3.tt.won .sq:not(.w) .mk{opacity:.3;transition:opacity .4s .5s}
.g.c3.tt .sq.w .mk{animation:tt-win .55s ease-in-out .8s infinite alternate}
.g.c3.tt .sq.w{background:rgba(255,214,10,.16)!important}
.ttx-win{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.ttx-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(15,23,42,.3),rgba(15,23,42,.72));animation:tt-fade .4s ease both}
.ttx-cv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.ttx-card{position:relative;box-sizing:border-box;width:min(90vw,400px);padding:26px 30px 24px;text-align:center;border-radius:26px;
  background:linear-gradient(165deg,#fffdf7,#f4ecd9);box-shadow:0 0 0 5px var(--w),0 0 60px 8px color-mix(in srgb,var(--w) 55%,transparent),0 26px 70px rgba(0,0,0,.4);
  animation:tt-card .75s cubic-bezier(.2,1.25,.3,1) both}
.ttx-ic{font-size:70px;line-height:1;display:inline-block;transform-origin:50% 90%;filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));
  animation:tt-ic 1.1s ease-in-out infinite alternate}
.ttx-t{margin:8px 0 4px;font-size:clamp(28px,7vw,40px);font-weight:900;line-height:1.1;letter-spacing:-.01em;
  background:linear-gradient(90deg,var(--wd),var(--w),#ffb300,var(--w),var(--wd));background-size:240% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;animation:tt-shine 2.8s linear infinite}
.ttx-s{margin:0;color:#57534e;font-size:15px;line-height:1.4}
.ttx-b{margin-top:18px;padding:11px 30px;border:0;border-radius:999px;background:var(--wd);color:#fff;font:700 15px/1 system-ui,sans-serif;
  cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.25);transition:transform .15s,box-shadow .15s}
.ttx-b:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(0,0,0,.3)}
.ttx-b:focus-visible{outline:3px solid #111827;outline-offset:3px}
.ttx-win.out .ttx-card{animation:tt-cardout .28s ease both}.ttx-win.out .ttx-bg{animation:tt-fadeout .28s ease both}
@keyframes tt-lv{from{transform:translateX(-50%) scaleY(0)}to{transform:translateX(-50%) scaleY(1)}}
@keyframes tt-lh{from{transform:translateY(-50%) scaleX(0)}to{transform:translateY(-50%) scaleX(1)}}
@keyframes tt-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes tt-pop{0%{transform:scale(.8) rotate(-6deg)}60%{transform:scale(1.08) rotate(2deg)}100%{transform:none}}
@keyframes tt-win{from{transform:scale(1)}to{transform:scale(1.14)}}
@keyframes tt-fade{from{opacity:0}to{opacity:1}}
@keyframes tt-fadeout{from{opacity:1}to{opacity:0}}
@keyframes tt-card{0%{opacity:0;transform:translateY(40px) scale(.6) rotate(-4deg)}100%{opacity:1;transform:none}}
@keyframes tt-cardout{to{opacity:0;transform:translateY(20px) scale(.9)}}
@keyframes tt-ic{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(8deg) scale(1.12)}}
@keyframes tt-shine{from{background-position:0 0}to{background-position:-240% 0}}
@media (prefers-reduced-motion:reduce){.g.c3.tt,.g.c3.tt *,.ttx-win *{animation:none!important;transition:none!important}}
`;
function addStyles() {
  if (document.getElementById("ttt-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "ttt-ui-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ---------------- celebration ---------------- */
let winEl = null, stopFx = null, shown = null, timer = 0, kbFocus = null;

function closeBanner(now) {
  clearTimeout(timer);
  if (stopFx) { stopFx(); stopFx = null; }
  const el = winEl; winEl = null;
  if (!el) return;
  if (now || reduced()) { el.remove(); return; }
  el.classList.add("out");
  setTimeout(() => el.remove(), 300);
}

function banner(winner) {
  closeBanner(true);
  const draw = winner < 0, mark = draw ? "" : ["X", "O"][winner];
  const el = document.createElement("div");
  el.className = "ttx-win";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Game over");
  el.style.setProperty("--w", draw ? "#64748b" : INK[mark]);
  el.style.setProperty("--wd", draw ? "#334155" : INK_DARK[mark]);
  el.innerHTML = '<div class="ttx-bg"></div><canvas class="ttx-cv"></canvas><div class="ttx-card"><div class="ttx-ic" aria-hidden="true"></div>' +
    '<h2 class="ttx-t"></h2><p class="ttx-s"></p><button type="button" class="ttx-b">Close</button></div>';
  el.querySelector(".ttx-ic").textContent = draw ? "\uD83E\uDD1D" : "\uD83C\uDFC6";
  el.querySelector(".ttx-t").textContent = draw ? "It's a draw" : `${nm(winner)} wins!`;
  el.querySelector(".ttx-s").textContent = draw ? "Nobody got three in a row." : "Three in a row.";
  el.querySelector(".ttx-b").addEventListener("click", () => closeBanner());
  el.querySelector(".ttx-bg").addEventListener("click", () => closeBanner());
  document.body.appendChild(el);
  winEl = el;
  if (!draw) stopFx = confetti(el.querySelector(".ttx-cv"), [INK[mark], "#ffd23f", "#ffffff", "#2fa84f", "#ff7ab8"]);
  try { el.querySelector(".ttx-b").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (!draw && navigator.vibrate) { try { navigator.vibrate([80, 40, 80, 40, 200]); } catch (e) { /* ignore */ } }
}

function confetti(cv, cols) {
  if (reduced() || !cv.getContext) return () => {};
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
  let W = 0, H = 0, raf = 0, alive = true;
  const t0 = performance.now(); let last = t0;
  const parts = [], sparks = [], ev = [];
  const resize = () => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  resize(); addEventListener("resize", resize);
  const piece = (x, y, vx, vy) => ({ x, y, vx, vy, w: rnd(7, 13), h: rnd(5, 9), r: rnd(0, 6.3), vr: rnd(-8, 8),
    tl: rnd(0, 6.3), vt: rnd(5, 11), c: pick(cols), round: Math.random() < 0.25 });
  const burst = (x, y, dir, spread, n) => {
    const pw = Math.max(650, H * 1.1);
    for (let i = 0; i < n; i++) {
      const a = (dir + rnd(-spread / 2, spread / 2)) * Math.PI / 180, s = rnd(0.45, 1) * pw;
      parts.push(piece(x, y, Math.cos(a) * s, Math.sin(a) * s));
    }
  };
  const firework = (x, y) => {
    const c = pick(cols);
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * 6.283, s = rnd(120, 340);
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 0, m: rnd(0.9, 1.4), c: Math.random() < 0.3 ? "#fff" : c });
    }
  };
  ev.push({ t: 0, f: () => { burst(0, H, -58, 40, 90); burst(W, H, -122, 40, 90); } },
    { t: 0.4, f: () => firework(W * rnd(0.2, 0.4), H * rnd(0.15, 0.4)) },
    { t: 0.8, f: () => firework(W * rnd(0.6, 0.8), H * rnd(0.15, 0.4)) },
    { t: 1.4, f: () => burst(W / 2, H * 0.95, -90, 70, 80) },
    { t: 2.2, f: () => firework(W * rnd(0.35, 0.65), H * rnd(0.12, 0.35)) });
  const stop = () => { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); ctx.clearRect(0, 0, W, H); };
  const frame = now => {
    if (!alive) return;
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    const el = (now - t0) / 1000;
    while (ev.length && ev[0].t <= el) ev.shift().f();
    if (el > 0.7 && el < 4) for (let n = Math.round(70 * dt + Math.random()); n > 0; n--) parts.push(piece(rnd(0, W), -12, rnd(-60, 60), rnd(40, 160)));
    ctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 1000 * dt; p.vx *= Math.exp(-1.3 * dt); p.vy *= Math.exp(-0.9 * dt);
      if (p.vy > 330) p.vy = 330;
      p.x += (p.vx + Math.sin(p.tl) * 40) * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.tl += p.vt * dt;
      if (p.y > H + 24) { parts.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.tl)); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, 6.283); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "lighter";
    for (let j = sparks.length - 1; j >= 0; j--) {
      const s = sparks[j];
      s.l += dt;
      if (s.l > s.m) { sparks.splice(j, 1); continue; }
      s.vy += 260 * dt; s.vx *= Math.exp(-2.2 * dt); s.vy *= Math.exp(-2.2 * dt); s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - s.l / s.m); ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.4, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (el > 5 && !parts.length && !sparks.length && !ev.length) { stop(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return stop;
}

/* ---------------- after each render ---------------- */
function post() {
  const bd = document.querySelector(".g.c3.tt");
  if (!bd || bd.dataset.lui || typeof S === "undefined" || !S || !Array.isArray(S.b) || S.b.length !== 9) return;
  bd.dataset.lui = "1";
  if (kbFocus !== null && bd.children[kbFocus + 1]) {          // child 0 is the .bd decoration layer
    try { bd.children[kbFocus + 1].focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  if (S.over) {
    const key = S.b.join("") + "|" + S.msg;
    if (shown !== key) {
      shown = key;
      clearTimeout(timer);
      timer = setTimeout(() => { if (S.over) banner(typeof S.win === "number" ? S.win : -1); }, S.win >= 0 ? 1100 : 650);
    }
  } else if (shown) { shown = null; closeBanner(true); }
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && winEl) { closeBanner(); return; }
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains("sq") || !t.closest(".g.c3.tt") || t.dataset.i === undefined) return;
  const i = +t.dataset.i, bd = t.closest(".g.c3.tt");
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kbFocus = i; t.click(); return; }
  const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
  if (!d) return;
  e.preventDefault();
  const r = (i / 3 | 0) + d[0], c = i % 3 + d[1];
  if (r < 0 || r > 2 || c < 0 || c > 2) return;
  kbFocus = r * 3 + c;
  bd.children[kbFocus + 1].focus();
});
document.addEventListener("click", e => { if (e.detail > 0) kbFocus = null; }, true);

let obs = null;
function startObserver() {
  addStyles();
  obs = new MutationObserver(() => { obs.disconnect(); try { post(); } finally { obs.observe(document.body, { childList: true, subtree: true }); } });
  obs.observe(document.body, { childList: true, subtree: true });
  post();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
else startObserver();

/* ---------------- game ---------------- */
// Who opens the next game. Flips every time a game finishes (win or draw), so back-to-back
// games alternate: X starts game 1, O starts game 2, X starts game 3, ...
let nextFirst = 0;
const game = {
  id: "ttt", i: "\u274C", t: "Tic-Tac-Toe", cat: "classic casual", tag: "Quick game", diff: "Easy", art: "art-ttt",
  d: "Three in a row wins. Ink on paper, one quick round at a time.", n: ["X", "O"],
  valid: a => Number.isInteger(a.i) && a.i >= 0 && a.i < 9 && !S.b[a.i] && !S.over,
  init: () => ({ b: Array(9).fill(""), t: nextFirst, first: nextFirst, n: 0, last: -1, over: 0 }),
  apply(a) {
    S.b[a.i] = G.n[S.t];
    S.n = (S.n || 0) + 1;
    S.last = a.i;
    const line = LINES.find(l => S.b[l[0]] && l.every(i => S.b[i] === S.b[l[0]]));
    if (line) { S.over = 1; S.win = S.t; S.line = line; S.msg = nm(S.t) + " wins! \uD83C\uDF89"; nextFirst = 1 - (S.first || 0); return; }
    if (S.b.every(x => x)) { S.over = 1; S.win = -1; S.msg = "Draw"; nextFirst = 1 - (S.first || 0); return; }
    S.t = 1 - S.t;
  },
  bot() {
    const ai = G.n[S.t], human = G.n[1 - S.t];
    const winner = board => {
      const line = LINES.find(cells => board[cells[0]] && cells.every(i => board[i] === board[cells[0]]));
      return line ? board[line[0]] : "";
    };
    const score = (board, turn, depth) => {
      const won = winner(board);
      if (won === ai) return 10 - depth;
      if (won === human) return depth - 10;
      const empty = board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
      if (!empty.length) return 0;
      const values = empty.map(i => {
        board[i] = turn;
        const value = score(board, turn === ai ? human : ai, depth + 1);
        board[i] = "";
        return value;
      });
      return turn === ai ? Math.max(...values) : Math.min(...values);
    };
    const moves = S.b.map((v, i) => v ? -1 : i).filter(i => i >= 0);
    let best = -Infinity, choices = [];
    for (const i of moves) {
      const board = S.b.slice();
      board[i] = ai;
      const value = score(board, human, 1);
      if (value > best) { best = value; choices = [i]; }
      else if (value === best) choices.push(i);
    }
    return choices.length ? { i: choices[Math.floor(Math.random() * choices.length)] } : null;
  },
  draw() {
    const mine = !S.over && (typeof canAct === "function" ? canAct() : true);
    const empty = S.b.every(x => !x);
    const win = S.over && S.win >= 0 ? new Set(S.line) : null;
    let h = `<div class="g c3 tt${empty ? " fresh" : ""}${win ? " won" : ""}" role="grid" aria-label="Tic-tac-toe board"` +
      (mine ? ` data-p="${G.n[S.t]}"` : "") + `><div class="bd" aria-hidden="true">` +
      `<i class="ln v" style="left:33.333%"></i><i class="ln v" style="left:66.666%"></i>` +
      `<i class="ln h" style="top:33.333%"></i><i class="ln h" style="top:66.666%"></i></div>`;
    const firstEmpty = S.b.findIndex(x => !x);
    S.b.forEach((v, i) => {
      const e = mine && !v;
      const lbl = `Row ${(i / 3 | 0) + 1}, column ${i % 3 + 1}${v ? ", " + v : ", empty"}`;
      h += `<div class="sq l${e ? " e" : ""}${win && win.has(i) ? " w" : ""}" data-i="${i}" role="gridcell" aria-label="${lbl}" tabindex="${e && i === firstEmpty ? 0 : -1}">` +
        (v ? markSvg(v, i === S.last ? "new" : "") : "") + "</div>";
    });
    if (win) {
      const c = k => [(k % 3) * 100 + 50, (k / 3 | 0) * 100 + 50];
      const [x1, y1] = c(S.line[0]), [x2, y2] = c(S.line[2]);
      const dx = (x2 - x1) * 0.14, dy = (y2 - y1) * 0.14, col = INK[G.n[S.win]];
      h += `<svg class="wl" viewBox="0 0 300 300" style="color:${col}" aria-hidden="true"><line pathLength="1" x1="${x1 - dx}" y1="${y1 - dy}" x2="${x2 + dx}" y2="${y2 + dy}" stroke="${col}"/></svg>`;
    }
    return [h + "</div>", S.over ? S.msg : `${nm(S.t)} to move`];
  },
  click(el) {
    const c = el && el.closest ? el.closest("[data-i]") : el;
    if (!c) return;
    const i = +c.dataset.i;
    if (S.over || S.b[i] || (typeof canAct === "function" && !canAct())) return;
    act({ i });
  }
};

registerGame(game);
if (typeof __TTT_TEST !== "undefined") globalThis.__tttGame = game;
})();