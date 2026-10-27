// chess: rules + UI, registered with registerGame(). 2 players (seat 0 = White, seat 1 = Black).
// Same conventions as the ludo game: globals S, np, nm(), canAct(), act(), registerGame().
// Features: full rules (castling, en passant, promotion, check/mate/stalemate, 50-move,
// repetition, insufficient material), 3D board (CSS perspective, standing pieces, hopping moves, contact shadows),
// capture effects, keyboard play, and a win celebration (confetti + fireworks + banner).
// View: every player sees their own side at the bottom. Black's view is the same board turned 180 degrees
// (squares are re-ordered with CSS `order`, so DOM child index still equals the square index). Purely local, never part of S.
// 3D: the .cb grid is tilted with rotateX(var(--tilt)); each piece sits in .mv3 > .up, where .up counter-rotates so the
// piece stands upright facing the camera. Tilt buttons under the board change --tilt (local only, never part of S).
(() => {
"use strict";

/* ------------------------------------------------------------------ */
/* rules                                                               */
/* ------------------------------------------------------------------ */
// board: array of 64, index 0 = a8 ... 63 = h1. Upper-case = White, lower-case = Black, '' = empty.
const START = "rnbqkbnrpppppppp" + ".".repeat(32) + "PPPPPPPPRNBQKBNR";
const startBoard = () => START.split("").map(x => x === "." ? "" : x);
const D8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DB = D8.filter(d => d[0] && d[1]), DR = D8.filter(d => !(d[0] && d[1]));
const DN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isW = p => p < "a";

// is square s attacked by White (byW) or Black pieces?
function att(b, s, byW) {
  const r = s >> 3, c = s & 7;
  const P = byW ? "P" : "p", N = byW ? "N" : "n", K = byW ? "K" : "k",
        B = byW ? "B" : "b", R = byW ? "R" : "r", Q = byW ? "Q" : "q";
  const pr = byW ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (inb(pr, c + dc) && b[pr * 8 + c + dc] === P) return true;
  for (const [dr, dc] of DN) if (inb(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === N) return true;
  for (const [dr, dc] of D8) if (inb(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === K) return true;
  for (const [dr, dc] of D8) {
    const diag = dr && dc;
    let rr = r + dr, cc = c + dc;
    while (inb(rr, cc)) {
      const p = b[rr * 8 + cc];
      if (p) { if (p === Q || p === (diag ? B : R)) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}

// pseudo-legal moves for the side to move (w = White to move)
function gen(b, w, cs, ep) {
  const out = [];
  const own = p => p && isW(p) === w, foe = p => p && isW(p) !== w;
  for (let s = 0; s < 64; s++) {
    const p = b[s];
    if (!p || !own(p)) continue;
    const r = s >> 3, c = s & 7, u = p.toUpperCase();
    const push = (to, x) => out.push(Object.assign({ f: s, t: to }, x));
    if (u === "P") {
      const d = w ? -1 : 1, st = w ? 6 : 1, pr = w ? 0 : 7, r1 = r + d;
      if (r1 < 0 || r1 > 7) continue;
      const add = (to, x) => {
        if ((to >> 3) === pr) ["Q", "R", "B", "N"].forEach(q => push(to, Object.assign({ p: q }, x)));
        else push(to, x);
      };
      if (!b[r1 * 8 + c]) {
        add(r1 * 8 + c, {});
        if (r === st && !b[(r + 2 * d) * 8 + c]) push((r + 2 * d) * 8 + c, { dp: 1 });
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (cc < 0 || cc > 7) continue;
        const to = r1 * 8 + cc;
        if (foe(b[to])) add(to, {});
        else if (to === ep) push(to, { ep: 1 });
      }
    } else if (u === "N" || u === "K") {
      for (const [dr, dc] of (u === "N" ? DN : D8)) {
        const rr = r + dr, cc = c + dc;
        if (inb(rr, cc) && !own(b[rr * 8 + cc])) push(rr * 8 + cc);
      }
      if (u === "K" && s === (w ? 60 : 4) && !att(b, s, !w)) {
        const k = w ? "K" : "k", q = w ? "Q" : "q", rk = w ? "R" : "r", h = w ? 56 : 0;
        if (cs.includes(k) && b[h + 7] === rk && !b[h + 5] && !b[h + 6] && !att(b, h + 5, !w)) push(h + 6, { cs: "K" });
        if (cs.includes(q) && b[h] === rk && !b[h + 1] && !b[h + 2] && !b[h + 3] && !att(b, h + 3, !w)) push(h + 2, { cs: "Q" });
      }
    } else {
      for (const [dr, dc] of (u === "B" ? DB : u === "R" ? DR : D8)) {
        let rr = r + dr, cc = c + dc;
        while (inb(rr, cc)) {
          const to = rr * 8 + cc, x = b[to];
          if (!x) push(to);
          else { if (foe(x)) push(to); break; }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}

function mk(b, m) {
  const n = b.slice(), p = n[m.f];
  n[m.t] = m.p ? (isW(p) ? m.p : m.p.toLowerCase()) : p;
  n[m.f] = "";
  if (m.ep) n[m.t + (isW(p) ? 8 : -8)] = "";
  if (m.cs) {
    const h = (m.f >> 3) * 8;
    if (m.cs === "K") { n[h + 5] = n[h + 7]; n[h + 7] = ""; }
    else { n[h + 3] = n[h]; n[h] = ""; }
  }
  return n;
}

const kingSq = (b, w) => b.indexOf(w ? "K" : "k");
const inCheck = (b, w) => att(b, kingSq(b, w), !w);
// st = {b, t (0 white / 1 black), cs, ep}
function legal(st) {
  const w = st.t === 0;
  return gen(st.b, w, st.cs, st.ep).filter(m => !inCheck(mk(st.b, m), w));
}

// position after move m (pure) — also reports capture info
function next(st, m) {
  const b = st.b, p = b[m.f], w = st.t === 0;
  const cq = m.ep ? m.t + (w ? 8 : -8) : m.t;
  const cap = b[cq] || "";
  let cs = st.cs;
  const rm = ch => { cs = cs.replace(ch, ""); };
  if (p === "K") { rm("K"); rm("Q"); }
  if (p === "k") { rm("k"); rm("q"); }
  [[63, "K"], [56, "Q"], [7, "k"], [0, "q"]].forEach(([sq, ch]) => { if (m.f === sq || m.t === sq) rm(ch); });
  return {
    b: mk(b, m), t: 1 - st.t, cs, ep: m.dp ? (m.f + m.t) / 2 : -1,
    hm: (p.toUpperCase() === "P" || cap) ? 0 : (st.hm || 0) + 1, cap, cq
  };
}

const findMove = (st, a) => legal(st).find(m => m.f === a.f && m.t === a.t && (m.p || "") === (a.p || ""));

function insufficient(b) {
  const rest = b.filter(x => x && x.toUpperCase() !== "K");
  return rest.length === 0 || (rest.length === 1 && /[bn]/i.test(rest[0]));
}

/* ------------------------------------------------------------------ */
/* look                                                                */
/* ------------------------------------------------------------------ */
const GL = { K: "\u265A\uFE0E", Q: "\u265B\uFE0E", R: "\u265C\uFE0E", B: "\u265D\uFE0E", N: "\u265E\uFE0E", P: "\u265F\uFE0E" };
const PN = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
const FILES = "abcdefgh";
const SQN = i => FILES[i & 7] + (8 - (i >> 3));
const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// note: .cb has no entrance animation on purpose. The host replaces the board element on every draw, so a CSS
// animation there replays (fade from opacity 0) after every move, which shows up as a fade out / fade in each turn.
// 3D notes: .cb must not use overflow/isolation/opacity/filter (they flatten preserve-3d). Pieces are animated on
// .mv3 (board-plane x/y plus a real Z hop); the upright counter-rotation lives on .up so animations never clobber it.
const CSS = `
.cb3w{width:100%}
.cb3{--tilt:48deg;--bs:min(94vw,82vh,640px);perspective:calc(var(--bs)*2.3);perspective-origin:50% 40%;width:100%;
  margin:calc(var(--bs)*-.06) 0 calc(var(--bs)*-.14);
  margin:calc(var(--bs)*((1 - cos(var(--tilt)))/-2 + sin(var(--tilt))*.11)) 0 calc(var(--bs)*((1 - cos(var(--tilt)))/-2 + .02));
  transition:margin .45s ease}
.cb{--bs:min(94vw,82vh,640px);--cs:calc((var(--bs) - 20px)/8);position:relative;display:grid;
  grid-template:repeat(8,1fr)/repeat(8,1fr);width:var(--bs);aspect-ratio:1/1;margin:0 auto;box-sizing:border-box;
  border:10px solid #3b2a1e;border-radius:8px;
  transform-style:preserve-3d;transform:rotateX(var(--tilt));transition:transform .45s ease;
  box-shadow:0 0 50px rgba(30,20,10,.4)}
.cb::before{content:"";position:absolute;left:-10px;right:-10px;top:calc(100% + 10px);height:calc(var(--cs)*.34);
  transform-origin:50% 0;transform:rotateX(-90deg);background:linear-gradient(#4a3524,#24180f);border-radius:0 0 8px 8px;pointer-events:none}
.cb::after{content:"";position:absolute;inset:-10px;background:rgba(15,10,5,.5);filter:blur(16px);
  transform:translateZ(calc(var(--cs)*-.45));pointer-events:none}
.cb .sq{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;
  user-select:none;-webkit-tap-highlight-color:transparent;transform-style:preserve-3d;transform:translateZ(.5px)}
.cb .sq.l{background:#efe0c2}.cb .sq.d{background:#a9774b}
.cb .sq::before{content:"";position:absolute;inset:0;pointer-events:none}
.cb .sq.lm::before{background:rgba(255,214,10,.40)}
.cb .sq.sel::before{background:rgba(70,190,110,.55)}
.cb .sq.chk::before{background:radial-gradient(circle,rgba(255,40,40,.9) 0,rgba(255,40,40,.4) 45%,transparent 72%);
  animation:cb-chk .8s ease-in-out infinite alternate}
.cb .sq.champ::before{background:radial-gradient(circle,rgba(255,205,50,.95) 0,rgba(255,205,50,.35) 50%,transparent 75%);
  animation:cb-chk .7s ease-in-out infinite alternate}
.cb .sq.tg::after,.cb .sq.cap::after{content:"";position:absolute;pointer-events:none;border-radius:50%;z-index:1;
  animation:cb-pop .18s ease-out both}
.cb .sq.tg::after{width:30%;height:30%;background:rgba(25,35,25,.30)}
.cb .sq.cap::after{width:92%;height:92%;border:calc(var(--cs)*.09) solid rgba(25,35,25,.32)}
.cb .sh{position:absolute;left:20%;width:60%;top:64%;height:20%;border-radius:50%;pointer-events:none;
  background:radial-gradient(ellipse at center,rgba(0,0,0,.5) 0,rgba(0,0,0,.22) 55%,transparent 72%);transition:transform .16s ease}
.cb .mv3{position:absolute;inset:0;transform-style:preserve-3d;transform:translateZ(1px);pointer-events:none}
.cb .up{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;
  transform-origin:50% 76%;transform:rotateX(calc(var(--tilt)*-1));transition:transform .45s ease}
.cb .gw .up{pointer-events:none}
.cb .pc{position:relative;z-index:2;font-style:normal;font-weight:400;line-height:1;font-size:calc(var(--cs)*.9);
  font-family:"Segoe UI Symbol","Noto Sans Symbols 2","Apple Symbols","DejaVu Sans",serif;pointer-events:none;
  paint-order:stroke fill;transition:transform .16s ease;will-change:transform}
.cb .pc.w{color:#fffdf4;-webkit-text-stroke:calc(var(--cs)*.035) #2a1d12;
  text-shadow:0 calc(var(--cs)*.02) 0 #d9cdb0,0 calc(var(--cs)*.04) 0 #bcae8c,0 calc(var(--cs)*.06) 0 #9c8e6e,0 calc(var(--cs)*.1) calc(var(--cs)*.05) rgba(0,0,0,.35)}
.cb .pc.b{color:#27211d;-webkit-text-stroke:calc(var(--cs)*.03) #e6d6b8;
  text-shadow:0 calc(var(--cs)*.02) 0 #3a322c,0 calc(var(--cs)*.04) 0 #4c4238,0 calc(var(--cs)*.06) 0 #5d5146,0 calc(var(--cs)*.1) calc(var(--cs)*.05) rgba(0,0,0,.4)}
.cb .sq.mv{cursor:pointer}
.cb .sq.mv:hover .pc,.cb .sq.sel .pc{transform:translateY(-7%) scale(1.07)}
.cb .sq.mv:hover .sh,.cb .sq.sel .sh{transform:scale(.8)}
.cb .sq:focus-visible{outline:3px solid #111827;outline-offset:-3px;z-index:4}
.cb .rk,.cb .fl{position:absolute;font:700 calc(var(--cs)*.17)/1 system-ui,sans-serif;pointer-events:none;opacity:.8;z-index:1}
.cb .rk{top:4%;left:5%}.cb .fl{right:5%;bottom:3%}
.cb .l .rk,.cb .l .fl{color:#a9774b}.cb .d .rk,.cb .d .fl{color:#efe0c2}
.cb.won{animation:cb-glow 1.3s ease-in-out infinite alternate}
.cb .sq.fallen .pc{animation:cb-fall .7s .5s ease-in both}
.cb .ghost{pointer-events:none}
.cb .rip{position:absolute;z-index:5;width:100%;height:100%;border-radius:50%;pointer-events:none;
  border:calc(var(--cs)*.06) solid rgba(255,255,255,.9)}
.cb-pick{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;
  background:rgba(15,23,42,.55);animation:cb-fade .2s ease both;transform:translateZ(calc(var(--cs)*2.4))}
.cb-pick>div{display:flex;gap:6px;padding:10px;border-radius:16px;background:#f7efe0;animation:cb-pop .25s cubic-bezier(.2,1.4,.3,1) both}
.cb-pick button{border:0;border-radius:12px;background:#e6d3ae;width:calc(var(--cs)*1.05);height:calc(var(--cs)*1.05);
  font-size:calc(var(--cs)*.8);line-height:1;cursor:pointer;transition:transform .15s,background .15s;
  font-family:"Segoe UI Symbol","Noto Sans Symbols 2","Apple Symbols","DejaVu Sans",serif}
.cb-pick button:hover,.cb-pick button:focus-visible{background:#f3c969;transform:translateY(-4px)}
.cb-pick .w{color:#fffdf4;-webkit-text-stroke:1px #2a1d12;paint-order:stroke fill}
.cb-pick .b{color:#27211d}
.cb3-ctl{display:flex;gap:8px;justify-content:center;margin:22px 0 2px;position:relative;z-index:2}
.cb3-ctl button{border:0;border-radius:999px;padding:7px 14px;background:#e6d3ae;color:#3b2a1e;font:600 13px/1 system-ui,sans-serif;
  cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:transform .15s,background .15s}
.cb3-ctl button:hover,.cb3-ctl button:focus-visible{background:#f3c969;transform:translateY(-2px)}
.cbx-win{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cbx-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(15,23,42,.3),rgba(15,23,42,.75));animation:cb-fade .4s ease both}
.cbx-cv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cbx-card{position:relative;box-sizing:border-box;width:min(90vw,420px);padding:26px 30px 24px;text-align:center;border-radius:26px;
  background:linear-gradient(165deg,#fffdf7,#f3ecdc);box-shadow:0 0 0 5px var(--w),0 0 60px 8px color-mix(in srgb,var(--w) 55%,transparent),0 26px 70px rgba(0,0,0,.4);
  animation:cb-card .75s cubic-bezier(.2,1.25,.3,1) both}
.cbx-ic{font-size:72px;line-height:1;display:inline-block;transform-origin:50% 90%;filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));
  animation:cb-ic 1.1s ease-in-out infinite alternate}
.cbx-t{margin:8px 0 4px;font-size:clamp(26px,6.5vw,38px);font-weight:900;line-height:1.1;letter-spacing:-.01em;
  background:linear-gradient(90deg,var(--wd),var(--w),#ffb300,var(--w),var(--wd));background-size:240% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;animation:cb-shine 2.8s linear infinite}
.cbx-s{margin:0;color:#57534e;font-size:15px;line-height:1.4}
.cbx-b{margin-top:18px;padding:11px 30px;border:0;border-radius:999px;background:var(--wd);color:#fff;font:700 15px/1 system-ui,sans-serif;
  cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.25);transition:transform .15s,box-shadow .15s}
.cbx-b:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(0,0,0,.3)}
.cbx-b:focus-visible{outline:3px solid #111827;outline-offset:3px}
.cbx-win.out .cbx-card{animation:cb-cardout .28s ease both}.cbx-win.out .cbx-bg{animation:cb-fadeout .28s ease both}
@keyframes cb-chk{from{opacity:.55}to{opacity:1}}
@keyframes cb-pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
@keyframes cb-fade{from{opacity:0}to{opacity:1}}
@keyframes cb-fadeout{from{opacity:1}to{opacity:0}}
@keyframes cb-glow{from{box-shadow:0 0 0 0 var(--w,#f5b301),0 0 50px rgba(30,20,10,.4)}to{box-shadow:0 0 0 6px var(--w,#f5b301),0 0 46px 10px var(--w,#f5b301)}}
@keyframes cb-fall{to{transform:rotate(84deg) translate(8%,14%);opacity:.7}}
@keyframes cb-card{0%{opacity:0;transform:translateY(40px) scale(.6) rotate(-4deg)}100%{opacity:1;transform:none}}
@keyframes cb-cardout{to{opacity:0;transform:translateY(20px) scale(.9)}}
@keyframes cb-ic{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(8deg) scale(1.12)}}
@keyframes cb-shine{from{background-position:0 0}to{background-position:-240% 0}}
@media (max-width:480px){.cb{border-width:6px;border-radius:6px;--cs:calc((var(--bs) - 12px)/8)}.cb::before{left:-6px;right:-6px;top:calc(100% + 6px)}.cb::after{inset:-6px}}
@media (prefers-reduced-motion:reduce){.cb,.cb *,.cb3,.cbx-win *{animation:none!important;transition:none!important}}
`;
function addStyles() {
  if (document.getElementById("chess-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "chess-ui-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ */
/* UI state (local to this client — never part of S)                   */
/* ------------------------------------------------------------------ */
let sel = null, pend = null, animN = null, shown = null, kbFocus = null;
let view = 0;                               // whose side is drawn at the bottom (0 = White, 1 = Black)
let tilt = 48;                              // camera tilt in degrees: 0 = straight down (2D-like), ~48 = default, max 70
const TILT_MAX = 70, TILT_DEFAULT = 48;
let actSeen = [false, false], waitSeen = [false, false], seenN = 0;   // what this client has been allowed to do, per seat on turn

// Which seat should be at the bottom?
//  - online: my own seat for the whole game (canAct is true only on my turn, so the other seat is the one waiting)
//  - vs the bot: the human's seat
//  - user vs user (one device, canAct is true for both seats): never rotate, the board stays put
// Detected from what canAct() has allowed so far, because the host does not tell us the mode. If the host exposes the
// mode or the local seat directly, return that here instead.
function wantView() {
  if (!S || S.over) return view;
  if (typeof canAct !== "function") return 0;
  if (typeof S.n === "number") {                       // new game: forget what we learned about this client
    if (S.n < seenN) { actSeen = [false, false]; waitSeen = [false, false]; }
    seenN = S.n;
  }
  const can = canAct();
  (can ? actSeen : waitSeen)[S.t] = true;
  if (actSeen[0] && actSeen[1]) return 0;              // this client moves for BOTH seats = user vs user: never rotate
  if (!can) return 1 - S.t;                            // someone else is on turn: I am the other seat
  return S.t === 1 && !waitSeen[0] ? 0 : S.t;          // my turn as Black counts only if I have seen White move (online)
}

function paint(cb) {
  cb.querySelectorAll(".sel,.tg,.cap").forEach(e => e.classList.remove("sel", "tg", "cap"));
  if (sel === null) return;
  cb.children[sel].classList.add("sel");
  legal(S).filter(m => m.f === sel).forEach(m => {
    cb.children[m.t].classList.add(S.b[m.t] || m.ep ? "cap" : "tg");
  });
}

function closePicker(cb) {
  const p = cb && cb.querySelector(".cb-pick");
  if (p) p.remove();
  pend = null;
}

function showPicker(cb, f, t) {
  closePicker(cb);
  pend = { f, t };
  const w = S.t === 0, el = document.createElement("div");
  el.className = "cb-pick";
  el.innerHTML = "<div role='group' aria-label='Promote to'>" +
    ["Q", "R", "B", "N"].map(k =>
      `<button type="button" class="${w ? "w" : "b"}" data-pp="${k}" aria-label="Promote to ${PN[k]}">${GL[k]}</button>`).join("") + "</div>";
  cb.appendChild(el);
  const first = el.querySelector("button");
  if (first) try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}

function onSquare(i, cb) {
  if (S.over || (typeof canAct === "function" && !canAct())) return;
  const L = legal(S);
  if (sel !== null) {
    const ms = L.filter(m => m.f === sel && m.t === i);
    if (ms.length) {
      if (ms[0].p) { showPicker(cb, sel, i); return; }
      const f = sel; sel = null; paint(cb);
      act({ f, t: i });
      return;
    }
  }
  const p = S.b[i];
  if (p && isW(p) === (S.t === 0) && L.some(m => m.f === i)) sel = sel === i ? null : i;
  else sel = null;
  paint(cb);
}

function setTilt(v) {
  tilt = Math.max(0, Math.min(TILT_MAX, v));
  document.querySelectorAll(".cb3").forEach(el => el.style.setProperty("--tilt", tilt + "deg"));
}

document.addEventListener("click", e => {
  if (typeof S === "undefined" || !S || !S.b || !e.target.closest) return;
  const tb = e.target.closest(".cb3-ctl button");
  if (tb) {
    const a = tb.dataset.tilt;
    if (a === "flat") setTilt(tilt > 4 ? 0 : TILT_DEFAULT);
    else setTilt(tilt + (+a || 0));
    return;
  }
  const pk = e.target.closest(".cb-pick button[data-pp]");
  if (pk) {
    const cb = pk.closest(".cb"), a = { f: pend.f, t: pend.t, p: pk.dataset.pp };
    closePicker(cb); sel = null;
    if (typeof canAct !== "function" || canAct()) act(a);
    return;
  }
  const back = e.target.closest(".cb-pick");
  if (back) { closePicker(back.closest(".cb")); sel = null; paint(back.closest(".cb")); return; }
  const sq = e.target.closest(".cb .sq");
  if (!sq) return;
  if (e.detail > 0) kbFocus = null;
  onSquare(+sq.dataset.sq, sq.closest(".cb"));
});

document.addEventListener("keydown", e => {
  const t = e.target;
  if (e.key === "Escape" && winEl) { closeBanner(); return; }
  if (!t || !t.classList || !t.classList.contains("sq") || !t.closest(".cb")) return;
  const i = +t.dataset.sq, cb = t.closest(".cb");
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kbFocus = i; t.click(); return; }
  const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
  if (!d) return;
  e.preventDefault();
  const k = view === 1 ? -1 : 1;           // arrows follow the screen, so they flip with the board
  const r = (i >> 3) + d[0] * k, c = (i & 7) + d[1] * k;
  if (!inb(r, c)) return;
  kbFocus = r * 8 + c;
  cb.children[kbFocus].focus();
});

/* ------------------------------------------------------------------ */
/* movement animation                                                  */
/* ------------------------------------------------------------------ */
function moveFx(cb) {
  const m = S.last;
  if (!m || reduced()) return;
  const cell = cb.children[0].offsetWidth, k = view === 1 ? -1 : 1;   // screen direction flips with the board
  // The piece (.mv3) travels across the board plane (x, y) and arcs up along the board's Z axis, so it really hops
  // in 3D; the contact shadow (.sh) slides along the board and shrinks while the piece is in the air.
  const fly = (to, from, knight) => {
    const sq = cb.children[to], mv = sq && sq.querySelector(".mv3"), sh = sq && sq.querySelector(".sh");
    if (!mv || !mv.animate) return 0;
    const dx = ((from & 7) - (to & 7)) * cell * k, dy = ((from >> 3) - (to >> 3)) * cell * k;
    const dist = Math.hypot(dx, dy) / cell;
    const dur = Math.round(Math.min(700, 280 + dist * 60));
    const lift = knight ? cell * 1.0 : Math.min(cell * 0.55, cell * (0.15 + dist * 0.07));
    const N = 8, pf = [], sf = [];
    for (let j = 0; j <= N; j++) {
      const u = j / N, rem = 1 - u, arc = 4 * u * rem;
      const x = dx * rem, y = dy * rem;
      pf.push({ transform: `translate3d(${x}px,${y}px,${1 + lift * arc}px)`, offset: u });
      sf.push({ transform: `translate(${x}px,${y}px) scale(${1 - 0.35 * arc})`, opacity: 1 - 0.4 * arc, offset: u });
    }
    sq.style.zIndex = "30";
    const a = mv.animate(pf, { duration: dur, easing: "cubic-bezier(.3,.6,.2,1)", fill: "backwards" });
    a.onfinish = a.oncancel = () => { sq.style.zIndex = ""; };
    if (sh && sh.animate) sh.animate(sf, { duration: dur, easing: "cubic-bezier(.3,.6,.2,1)", fill: "backwards" });
    return dur;
  };
  const dur = fly(m.t, m.f, /n/i.test(m.pc)) || 300;
  if (m.rk) fly(m.rk[1], m.rk[0], false);
  if (m.cap) {
    const gs = cb.children[m.cq];
    const wrap = document.createElement("span");
    wrap.className = "mv3 gw";
    const up = document.createElement("span");
    up.className = "up";
    const g = document.createElement("b");
    g.className = "pc ghost " + (isW(m.cap) ? "w" : "b");
    g.textContent = GL[m.cap.toUpperCase()];
    up.appendChild(g); wrap.appendChild(up); gs.appendChild(wrap);
    if (g.animate) {
      g.animate([
        { opacity: 1, transform: "scale(1) rotate(0)" },
        { opacity: 0, transform: "scale(1.6) rotate(28deg) translateY(-35%)" }
      ], { duration: 520, delay: dur * 0.55, easing: "ease-out", fill: "both" }).onfinish = () => wrap.remove();
      const rip = document.createElement("span");
      rip.className = "rip";
      gs.appendChild(rip);
      rip.animate([{ transform: "scale(.3)", opacity: 0.9 }, { transform: "scale(1.5)", opacity: 0 }],
        { duration: 480, delay: dur * 0.85, easing: "ease-out", fill: "both" }).onfinish = () => rip.remove();
    } else wrap.remove();
  }
}

/* ------------------------------------------------------------------ */
/* celebration                                                         */
/* ------------------------------------------------------------------ */
let winEl = null, stopFx = null;

function closeBanner(now) {
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
  const base = draw ? "#64748b" : win === 0 ? "#e0a800" : "#4b3f72";
  const dark = draw ? "#334155" : win === 0 ? "#8a6200" : "#2a2145";
  const el = document.createElement("div");
  el.className = "cbx-win";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Game over");
  el.style.setProperty("--w", base);
  el.style.setProperty("--wd", dark);
  el.innerHTML = '<div class="cbx-bg"></div><canvas class="cbx-cv"></canvas><div class="cbx-card"><div class="cbx-ic" aria-hidden="true"></div>' +
    '<h2 class="cbx-t"></h2><p class="cbx-s"></p><button type="button" class="cbx-b">Close</button></div>';
  el.querySelector(".cbx-ic").textContent = draw ? "\uD83E\uDD1D" : "\uD83D\uDC51";
  el.querySelector(".cbx-t").textContent = title;
  el.querySelector(".cbx-s").textContent = sub;
  el.querySelector(".cbx-b").addEventListener("click", () => closeBanner());
  el.querySelector(".cbx-bg").addEventListener("click", () => closeBanner());
  document.body.appendChild(el);
  winEl = el;
  if (!draw) stopFx = confetti(el.querySelector(".cbx-cv"));
  try { el.querySelector(".cbx-b").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (!draw && navigator.vibrate) { try { navigator.vibrate([90, 50, 90, 50, 220]); } catch (e) { /* ignore */ } }
}

function confetti(cv) {
  if (reduced() || !cv.getContext) return () => {};
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const cols = ["#e5322d", "#2fa84f", "#2160c4", "#fadb14", "#ffffff", "#ff7ab8", "#ffd23f"];
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
    const pw = Math.max(650, H * 1.15);
    for (let i = 0; i < n; i++) {
      const a = (dir + rnd(-spread / 2, spread / 2)) * Math.PI / 180, s = rnd(0.45, 1) * pw;
      parts.push(piece(x, y, Math.cos(a) * s, Math.sin(a) * s));
    }
  };
  const firework = (x, y) => {
    const c = pick(cols);
    for (let i = 0; i < 70; i++) {
      const a = i / 70 * 6.283, s = rnd(120, 360);
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 0, m: rnd(0.9, 1.5), c: Math.random() < 0.3 ? "#fff" : c });
    }
  };
  ev.push({ t: 0, f: () => { burst(0, H, -58, 40, 110); burst(W, H, -122, 40, 110); } },
    { t: 0.4, f: () => firework(W * rnd(0.2, 0.4), H * rnd(0.15, 0.4)) },
    { t: 0.7, f: () => { burst(0, H, -62, 36, 70); burst(W, H, -118, 36, 70); } },
    { t: 1.0, f: () => firework(W * rnd(0.6, 0.8), H * rnd(0.15, 0.4)) },
    { t: 1.8, f: () => firework(W * rnd(0.4, 0.6), H * rnd(0.1, 0.3)) },
    { t: 2.4, f: () => burst(W / 2, H * 0.95, -90, 70, 100) },
    { t: 3.2, f: () => { firework(W * rnd(0.15, 0.35), H * rnd(0.2, 0.45)); firework(W * rnd(0.65, 0.85), H * rnd(0.2, 0.45)); } });
  const stop = () => { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); ctx.clearRect(0, 0, W, H); };
  const frame = now => {
    if (!alive) return;
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    const el = (now - t0) / 1000;
    while (ev.length && ev[0].t <= el) ev.shift().f();
    if (el > 0.9 && el < 5) for (let n = Math.round(90 * dt + Math.random()); n > 0; n--) parts.push(piece(rnd(0, W), -12, rnd(-60, 60), rnd(40, 160)));
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
    if (el > 6 && !parts.length && !sparks.length && !ev.length) { stop(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return stop;
}

/* ------------------------------------------------------------------ */
/* after each render (the board element is replaced on every draw)      */
/* ------------------------------------------------------------------ */
function post() {
  const cb = document.querySelector(".cb");
  if (!cb || cb.dataset.lui || typeof S === "undefined" || !S || !S.b) return;
  cb.dataset.lui = "1";
  if (typeof S.n === "number") {
    if (animN === null || S.n < animN) animN = S.n;
    else if (S.n > animN) { animN = S.n; moveFx(cb); }
  }
  if (kbFocus !== null && cb.children[kbFocus]) {
    try { cb.children[kbFocus].focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  if (S.over) {
    const key = S.msg + "|" + S.n;
    if (shown !== key) {
      shown = key;
      const w = S.win;
      celebrate(w, w < 0 ? "Draw" : `${nm(w)} wins!`, S.msg.replace(/[^\x20-\u024F\u2014\u2013]/g, "").trim());
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
const NMS = ["White", "Black"];
const game = {
  id: "chess", i: "\u265F\uFE0F", t: "3D Chess", max: 2, cat: "classic strategy", tag: "\u265B Timeless", diff: "Deep to master", art: "art-chess",
  d: "The classic game of kings in 3D. Castling, en passant, promotion — all the rules, for two players. Tilt the camera under the board.",
  get n() { return NMS; },
  valid: a => !S.over && Number.isInteger(a.f) && Number.isInteger(a.t) && !!findMove(S, a),
  init: () => ({ b: startBoard(), t: 0, cs: "KQkq", ep: -1, hm: 0, n: 0, last: null, rep: {}, over: 0 }),
  apply(a) {
    const m = findMove(S, a);
    if (!m) return;
    const w = S.t === 0, pc = S.b[m.f];
    const nx = next(S, m);
    const last = { f: m.f, t: m.t, pc, cap: nx.cap, cq: nx.cq, p: m.p || "" };
    if (m.cs) { const h = (m.f >> 3) * 8; last.rk = m.cs === "K" ? [h + 7, h + 5] : [h, h + 3]; }
    S.b = nx.b; S.t = nx.t; S.cs = nx.cs; S.ep = nx.ep; S.hm = nx.hm; S.n++; S.last = last;
    const key = S.b.join(",") + "|" + S.t + "|" + S.cs + "|" + S.ep;
    S.rep[key] = (S.rep[key] || 0) + 1;
    const L = legal(S), chk = inCheck(S.b, S.t === 0);
    S.chk = chk ? 1 : 0;
    if (!L.length) {
      S.over = 1;
      if (chk) { S.win = w ? 0 : 1; S.msg = `${nm(S.win)} wins by checkmate! \uD83C\uDF89`; }
      else { S.win = -1; S.msg = "Draw \u2013 stalemate"; }
    } else if (S.hm >= 100) { S.over = 1; S.win = -1; S.msg = "Draw \u2013 fifty-move rule"; }
    else if (S.rep[key] >= 3) { S.over = 1; S.win = -1; S.msg = "Draw \u2013 threefold repetition"; }
    else if (insufficient(S.b)) { S.over = 1; S.win = -1; S.msg = "Draw \u2013 insufficient material"; }
  },
  bot() {
    const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    const evaluate = st => {
      let score = 0;
      for (let i = 0; i < st.b.length; i++) {
        const p = st.b[i];
        if (!p) continue;
        const value = values[p.toLowerCase()] || 0;
        score += p === p.toLowerCase() ? value : -value;
      }
      const moves = legal(st);
      if (!moves.length) return inCheck(st.b, st.t === 0) ? (st.t === 1 ? -10000 : 10000) : 0;
      return score;
    };
    const moves = legal(S);
    let best = -Infinity, choices = [];
    for (const move of moves) {
      const afterBlack = next(S, move);
      const replies = legal(afterBlack);
      const value = replies.length ? Math.min(...replies.map(reply => evaluate(next(afterBlack, reply)))) : evaluate(afterBlack);
      if (value > best) { best = value; choices = [move]; }
      else if (value === best) choices.push(move);
    }
    if (!choices.length) return null;
    const move = choices[Math.floor(Math.random() * choices.length)];
    return { f: move.f, t: move.t, p: move.p || "" };
  },
  draw() {
    sel = null; pend = null;
    view = wantView();
    const fl = view === 1;                  // Black's view: same squares, shown in reverse order
    const w = S.t === 0, L = S.over ? [] : legal(S);
    const mine = typeof canAct === "function" ? canAct() : true;
    const from = new Set(mine ? L.map(m => m.f) : []);
    const last = S.last, tab = from.size ? Math.min(...from) : -1;
    const wk = kingSq(S.b, true), bk = kingSq(S.b, false);
    let h = `<div class="cb3w"><div class="cb3" style="--tilt:${tilt}deg"><div class="cb` + (S.over && S.win >= 0 ? " won" : "") + '" role="grid" aria-label="Chess board"' +
      (S.over && S.win >= 0 ? ` style="--w:${S.win === 0 ? "#e0a800" : "#4b3f72"}"` : "") + ">";
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7, p = S.b[i];
      let cl = "sq " + ((r + c) % 2 ? "d" : "l");
      if (last && (i === last.f || i === last.t)) cl += " lm";
      if (!S.over && S.chk && i === (w ? wk : bk)) cl += " chk";
      if (S.over && S.win >= 0) {
        if (i === (S.win === 0 ? wk : bk)) cl += " champ";
        if (i === (S.win === 0 ? bk : wk)) cl += " fallen";
      }
      if (from.has(i)) cl += " mv";
      // DOM child index stays = square index (the rest of the file relies on it); only the visual order flips
      const ord = fl ? ` style="order:${63 - i}"` : "";
      // rank numbers sit on the visual left edge, file letters on the visual bottom edge
      const rankHere = c === (fl ? 7 : 0), fileHere = r === (fl ? 0 : 7);
      h += `<div class="${cl}" data-sq="${i}"${ord} tabindex="${i === tab ? 0 : -1}" role="gridcell" aria-label="${SQN(i)}${p ? ", " + (isW(p) ? "white " : "black ") + PN[p.toUpperCase()] : ""}">` +
        (rankHere ? `<span class="rk">${8 - r}</span>` : "") + (fileHere ? `<span class="fl">${FILES[c]}</span>` : "") +
        (p ? `<i class="sh"></i><span class="mv3"><span class="up"><b class="pc ${isW(p) ? "w" : "b"}">${GL[p.toUpperCase()]}</b></span></span>` : "") + "</div>";
    }
    const status = S.over ? S.msg : `${nm(S.t)} ${S.chk ? "is in check!" : "to move"}${S.last ? " \u2013 last move " + SQN(S.last.f) + "\u2192" + SQN(S.last.t) : ""}`;
    const ctl = '<div class="cb3-ctl" role="group" aria-label="Camera">' +
      '<button type="button" data-tilt="-8" aria-label="Look more from above">\u2B06 Higher</button>' +
      '<button type="button" data-tilt="flat" aria-label="Toggle flat view">2D / 3D</button>' +
      '<button type="button" data-tilt="8" aria-label="Look more from the side">\u2B07 Lower</button></div>';
    return [h + "</div></div>" + ctl + "</div>", status];
  },
  click() { /* input is handled by the delegated listener above (squares carry data-sq, not data-m) */ }
};

if (typeof registerGame === "function") registerGame(game);
if (typeof __CHESS_TEST !== "undefined") globalThis.__chessCore = { legal, next, startBoard, game };
})();