/* global S, np, seat, ids, amHost, nm, canAct, act, registerGame */
// carrom: rules + physics + UI, registered with registerGame(). Supports 2-4 players.
// Same conventions as chess/connect-four: globals S, np, nm(), canAct(), act(), registerGame().
// Online-safe: a shot is the action {x, dx, dy, p} (all integers). The physics uses only + - * / and sqrt
// (no sin/cos), so every peer computes the identical outcome. The animation re-plays the shot from S.last.pre.
// Rules: pocket your own coins to keep shooting; pocket the queen and cover it with one of your coins on the same
// or next shot (otherwise it returns to the centre); pocketing the striker is a foul (a coin of yours comes back and
// the turn passes). Three- and four-player matches also support point and clear-the-board formats.
// View: every player sees their shooting side at the bottom. The board is simply drawn rotated 180 degrees for alternate seats
// (purely local, never part of S), and pointer input and the sliders are mapped back, so the physics is untouched.
(() => {
"use strict";

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */
// board is 1000 x 1000. coin ids: 0 = queen, 1..9 = White, 10..18 = Black. id 19 is the striker (sim only).
const NP = 19, SI = 19;
const RC = 21, RS = 26, PR = 38, PR2 = PR * PR;
const PK = [[18, 18], [982, 18], [18, 982], [982, 982]];
const BY = [855, 145];                 // baseline y per seat
const XMIN = 170, XMAX = 830;          // striker travel along the baseline
const MS = 1.7, FR = 0.9885, WE = 0.8, HE = 0.94, MIN2 = 0.0025, MAXT = 3200, MAXTURNS = 300;
const NMS = ["White", "Black", "Yellow", "Blue"];
const playerCount = () => typeof np === "number" ? Math.max(2, Math.min(4, np)) : 2;
const sideFor = seat => seat % 2;
const owner = (st, i) => i === 0 ? -1 : Array.isArray(st.owners) && st.owners[i] !== undefined ? st.owners[i] : i <= 9 ? 0 : 1;
const groupOf = (st, player) => st.teamMode ? st.teams[player] : player;
const who = s => (typeof nm === "function" ? nm(s) : NMS[s]);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
const r2 = v => Math.round(v * 100) / 100;
const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const INNER = [[0, -43], [37.2, -21.5], [37.2, 21.5], [0, 43], [-37.2, 21.5], [-37.2, -21.5]];
const OUTER = [[0, -86], [43, -74.5], [74.5, -43], [86, 0], [74.5, 43], [43, 74.5], [0, 86], [-43, 74.5], [-74.5, 43], [-86, 0], [-74.5, -43], [-43, -74.5]];

function startCoins() {
  const c = new Array(NP);
  c[0] = [500, 500, 0];
  let wi = 1, bi = 10;
  INNER.forEach((o, k) => { const id = k % 2 === 0 ? wi++ : bi++; c[id] = [500 + o[0], 500 + o[1], 0]; });
  OUTER.forEach((o, k) => { const id = k % 2 === 1 ? wi++ : bi++; c[id] = [500 + o[0], 500 + o[1], 0]; });
  return c;
}

/* ------------------------------------------------------------------ */
/* physics (deterministic)                                             */
/* ------------------------------------------------------------------ */
function makeWorld(coins, seat, a) {
  const side = sideFor(seat);
  const w = { x: [], y: [], vx: [], vy: [], r: [], m: [], live: [], out: [], ev: [], t: 0, done: false, vm: 0 };
  for (let i = 0; i < NP; i++) {
    const c = coins[i];
    w.x.push(c[0]); w.y.push(c[1]); w.vx.push(0); w.vy.push(0); w.r.push(RC); w.m.push(1); w.live.push(c[2] ? 0 : 1);
  }
  const len = Math.sqrt(a.dx * a.dx + a.dy * a.dy), v = 2 + 0.26 * a.p;
  w.x.push(a.x); w.y.push(BY[side]); w.vx.push(a.dx / len * v); w.vy.push(a.dy / len * v);
  w.r.push(RS); w.m.push(MS); w.live.push(1);
  return w;
}

function stepWorld(w) {
  const x = w.x, y = w.y, vx = w.vx, vy = w.vy, r = w.r, m = w.m, live = w.live, n20 = NP + 1;
  let vm = 0;
  for (let i = 0; i < n20; i++) if (live[i]) { const s = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]); if (s > vm) vm = s; }
  w.vm = vm;
  const sub = vm > 9 ? Math.ceil(vm / 9) : 1, inv = 1 / sub;
  for (let k = 0; k < sub; k++) {
    for (let i = 0; i < n20; i++) if (live[i]) { x[i] += vx[i] * inv; y[i] += vy[i] * inv; }
    for (let i = 0; i < n20; i++) {
      if (!live[i]) continue;
      for (let p = 0; p < 4; p++) {
        const dx = x[i] - PK[p][0], dy = y[i] - PK[p][1];
        if (dx * dx + dy * dy < PR2) { live[i] = 0; vx[i] = 0; vy[i] = 0; w.out.push(i); w.ev.push([i, p]); break; }
      }
    }
    for (let i = 0; i < n20; i++) {
      if (!live[i]) continue;
      const ri = r[i];
      if (x[i] < ri) { x[i] = ri; if (vx[i] < 0) vx[i] = -vx[i] * WE; }
      else if (x[i] > 1000 - ri) { x[i] = 1000 - ri; if (vx[i] > 0) vx[i] = -vx[i] * WE; }
      if (y[i] < ri) { y[i] = ri; if (vy[i] < 0) vy[i] = -vy[i] * WE; }
      else if (y[i] > 1000 - ri) { y[i] = 1000 - ri; if (vy[i] > 0) vy[i] = -vy[i] * WE; }
    }
    for (let i = 0; i < n20; i++) {
      if (!live[i]) continue;
      for (let j = i + 1; j < n20; j++) {
        if (!live[j]) continue;
        const dx = x[j] - x[i], dy = y[j] - y[i], rr = r[i] + r[j], d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = rr - d, mi = m[i], mj = m[j], ms = mi + mj;
        x[i] -= nx * ov * mj / ms; y[i] -= ny * ov * mj / ms;
        x[j] += nx * ov * mi / ms; y[j] += ny * ov * mi / ms;
        const rv = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
        if (rv < 0) {
          const imp = -(1 + HE) * rv / (1 / mi + 1 / mj);
          vx[i] -= imp * nx / mi; vy[i] -= imp * ny / mi;
          vx[j] += imp * nx / mj; vy[j] += imp * ny / mj;
        }
      }
    }
  }
  let any = false;
  for (let i = 0; i < n20; i++) {
    if (!live[i]) continue;
    vx[i] *= FR; vy[i] *= FR;
    if (vx[i] * vx[i] + vy[i] * vy[i] < MIN2) { vx[i] = 0; vy[i] = 0; } else any = true;
  }
  w.t++;
  if (!any) w.done = true;
  else if (w.t >= MAXT) { for (let i = 0; i < n20; i++) { vx[i] = 0; vy[i] = 0; } w.done = true; }
}

const runWorld = w => { while (!w.done) stepWorld(w); };

/* ------------------------------------------------------------------ */
/* rules                                                               */
/* ------------------------------------------------------------------ */
const isIn = (st, i) => !!st.c[i][2];
const coinsOf = (st, s) => { const o = []; for (let i = 1; i < NP; i++) if (owner(st, i) === s) o.push(i); return o; };
const leftOf = (st, s) => coinsOf(st, s).filter(i => !isIn(st, i)).length;

function assignOwners(count, teams, teamMode) {
  const owners = new Array(NP).fill(-1);
  for (let i = 1; i < NP; i++) {
    if (teamMode) owners[i] = i <= 9 ? 0 : 1;
    else owners[i] = (i - 1) % count;
  }
  return owners.map((owner, i) => i > 0 && teamMode ? teams[owner === 0 ? 0 : 1] : owner);
}

function finishSetup(st) {
  const count = playerCount();
  st.teamMode = st.style === "team" ? 1 : 0;
  st.teams = Array.from({ length: count }, (_, player) =>
    st.teamMode ? (player === 0 || player === st.partner ? 0 : 1) : player
  );
  st.owners = assignOwners(count, st.teams, st.teamMode);
  st.scores = new Array(st.teamMode ? 2 : count).fill(0);
  st.setup = "";
  st.t = 0;
  st.msg = "";
  st.ev = st.mode === "points"
    ? "Point Game · 8 boards. White 20 · Black 10 · Queen 50."
    : "Clear-the-board game. " + who(0) + " starts.";
}

function setupAction(st, action) {
  if (st.setup === "mode") {
    st.mode = action.gameMode;
    if (playerCount() === 3) {
      st.style = "individual";
      finishSetup(st);
    } else st.setup = "style";
    return;
  }
  if (st.setup === "style") {
    st.style = action.playStyle;
    if (st.style === "team") st.setup = "partner";
    else finishSetup(st);
    return;
  }
  if (st.setup === "partner") {
    st.partner = action.partner;
    finishSetup(st);
  }
}

function freeAt(st, x, y, skip) {
  const lim = (2 * RC + 1) * (2 * RC + 1);
  for (let j = 0; j < NP; j++) {
    if (j === skip || isIn(st, j)) continue;
    const dx = st.c[j][0] - x, dy = st.c[j][1] - y;
    if (dx * dx + dy * dy < lim) return false;
  }
  return true;
}

function place(st, id) {
  const spots = [[0, 0]].concat(INNER, OUTER);
  for (const o of spots) {
    if (freeAt(st, 500 + o[0], 500 + o[1], id)) { st.c[id] = [500 + o[0], 500 + o[1], 0]; st.po = st.po.filter(k => k !== id); return; }
  }
  for (let y = 300; y <= 700; y += 25) for (let x = 300; x <= 700; x += 25) {
    if (freeAt(st, x, y, id)) { st.c[id] = [x, y, 0]; st.po = st.po.filter(k => k !== id); return; }
  }
  st.c[id] = [500, 500, 0]; st.po = st.po.filter(k => k !== id);
}

function baseFree(st, seat, x) {
  const lim = (RS + RC) * (RS + RC), y = BY[sideFor(seat)];
  for (let j = 0; j < NP; j++) {
    if (isIn(st, j)) continue;
    const dx = st.c[j][0] - x, dy = st.c[j][1] - y;
    if (dx * dx + dy * dy < lim) return false;
  }
  return true;
}
function anyBaseFree(st, seat) {
  for (let x = XMIN; x <= XMAX; x += 4) if (baseFree(st, seat, x)) return true;
  return false;
}

function validOn(st, a) {
  if (!a || typeof a !== "object" || st.over) return false;
  if (st.setup) {
    if (st.t !== 0) return false;
    if (st.setup === "mode") return a.gameMode === "points" || a.gameMode === "clear";
    if (st.setup === "style") return a.playStyle === "individual" || (playerCount() === 4 && a.playStyle === "team");
    if (st.setup === "partner") return Number.isInteger(a.partner) && a.partner > 0 && a.partner < playerCount();
    return false;
  }
  if (!Number.isInteger(a.x) || !Number.isInteger(a.dx) || !Number.isInteger(a.dy) || !Number.isInteger(a.p)) return false;
  if (a.x < XMIN || a.x > XMAX || a.p < 1 || a.p > 100) return false;
  if (Math.abs(a.dx) > 1000 || Math.abs(a.dy) > 1000) return false;
  if (sideFor(st.t) === 0 ? a.dy >= 0 : a.dy <= 0) return false; // shoot towards the opponent's side
  if (!baseFree(st, sideFor(st.t), a.x) && anyBaseFree(st, sideFor(st.t))) return false;
  return true;
}

function pointValue(id) {
  return id === 0 ? 50 : id <= 9 ? 20 : 10;
}

function scoreIndex(st, player) {
  return st.teamMode ? st.teams[player] : player;
}

function competitors(st) {
  return st.teamMode ? [0, 1] : Array.from({ length: st.teams.length || 2 }, (_, player) => player);
}

function competitorName(st, competitor) {
  if (!st.teamMode) return who(competitor);
  return st.teams.map((team, player) => team === competitor ? who(player) : "").filter(Boolean).join(" & ");
}

function placementOrder(st) {
  return competitors(st).slice().sort((a, b) => st.scores[b] - st.scores[a]);
}

function finishPointGame(st) {
  st.placements = placementOrder(st);
  const top = st.placements[0], tied = st.placements.length > 1 && st.scores[st.placements[1]] === st.scores[top];
  st.win = tied ? -1 : st.teamMode ? st.teams.indexOf(top) : top;
  const standings = st.placements.map((competitor, index) =>
    (index + 1) + (index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th") +
    ": " + competitorName(st, competitor) + " (" + st.scores[competitor] + ")"
  );
  st.over = 1;
  st.msg = (tied ? "Point Game draw" : competitorName(st, top) + " wins the Point Game!") + " " + standings.join(" · ");
}

function finishClearGame(st, player) {
  if (st.mode === "classic") {
    st.over = 1; st.win = player; st.msg = `${who(player)} clears the board and wins! \uD83C\uDF89`;
    return;
  }
  if (st.teamMode) {
    const team = player, winner = st.teams.indexOf(team);
    st.over = 1;
    st.win = winner;
    st.msg = competitorName(st, team) + " wins the Clear-the-board game!";
    return;
  }
  st.placements = (st.placements || []).concat(player);
  st.log = who(player) + " finished " + st.placements.length + ".";
  if (st.placements.length >= st.teams.length - 1) {
    st.loser = st.teams.findIndex((_, index) => !st.placements.includes(index));
    st.win = st.placements[0];
    st.over = 1;
    st.msg = who(st.win) + " wins! " + st.placements.map((seat, index) =>
      (index + 1) + (index === 0 ? "st" : index === 1 ? "nd" : "rd") + ": " + who(seat)
    ).join(" · ") + " · Lost: " + who(st.loser);
  }
}

function advanceTurn(st, player) {
  const count = st.teams.length;
  for (let offset = 1; offset <= count; offset++) {
    const next = (player + offset) % count;
    if (st.mode !== "clear" || st.teamMode || !(st.placements || []).includes(next)) {
      st.t = next;
      return;
    }
  }
}

function resetPointBoard(st) {
  st.boards++;
  if (st.boards >= 8) {
    finishPointGame(st);
    return true;
  }
  st.c = startCoins();
  st.q = 0;
  st.qw = -1;
  st.po = [];
  st.t = st.boards % st.teams.length;
  st.ev = "Board " + st.boards + " complete. Board " + (st.boards + 1) + " of 8.";
  return true;
}

// plays shot `a` on state `st` (mutates st). Pure function of (st, a).
function resolve(st, a) {
  if (st.setup) {
    setupAction(st, a);
    return;
  }
  const seat = st.t, pre = st.c.map(p => p.slice());
  const w = makeWorld(st.c, seat, a);
  runWorld(w);
  for (let i = 0; i < NP; i++) st.c[i] = w.live[i] ? [r2(w.x[i]), r2(w.y[i]), 0] : [0, 0, 1];
  const got = w.out.filter(i => i < NP), foul = w.out.indexOf(SI) >= 0;
  const group = groupOf(st, seat);
  const own = got.filter(i => owner(st, i) === group), opp = got.filter(i => owner(st, i) !== group && i !== 0), qGot = got.indexOf(0) >= 0;
  got.forEach(i => { if (i > 0) st.po.push(i); });
  if (st.mode === "points" && !foul) {
    st.scores[scoreIndex(st, seat)] += got.filter(i => i > 0).reduce((total, id) => total + pointValue(id), 0);
  }
  let keep = false, back = 0, boardCompleted = false;
  const parts = [];
  if (foul) {
    parts.push("foul \u2013 striker pocketed");
    if (qGot || st.q === 1) { place(st, 0); st.q = 0; parts.push("queen back to centre"); }
    const mine = st.po.filter(i => owner(st, i) === group);
    if (mine.length) { place(st, mine[mine.length - 1]); back = 1; parts.push("a coin returns"); }
  } else {
    if (st.q === 1) {
      if (st.qw === group && (st.mode === "points" ? got.some(i => i > 0) : own.length)) {
        st.q = 2; keep = true; parts.push("queen covered");
        if (st.mode === "points") st.scores[scoreIndex(st, seat)] += 50;
      } else {
        place(st, 0); st.q = 0; parts.push("queen not covered \u2013 back to centre");
      }
    } else if (qGot) {
      st.qw = group; keep = true;
      if (st.mode === "points" ? got.some(i => i > 0) : own.length) {
        st.q = 2; parts.push("queen pocketed and covered");
        if (st.mode === "points") st.scores[scoreIndex(st, seat)] += 50;
      }
      else { st.q = 1; parts.push("queen pocketed \u2013 cover it"); }
    }
    if (own.length || (st.mode === "points" && got.some(i => i > 0))) {
      keep = true;
      const coinCount = got.filter(i => i > 0).length;
      if (!qGot && parts.indexOf("queen covered") < 0) parts.push(`${coinCount} coin${coinCount > 1 ? "s" : ""} in`);
    }
    if (opp.length) parts.push(`${opp.length} opponent coin${opp.length > 1 ? "s" : ""} in`);
  }
  if (st.mode === "points") {
    if (st.q === 2 && st.c.slice(1).every(coin => coin[2])) boardCompleted = resetPointBoard(st);
  } else {
    competitors(st).forEach(s => {
      if (st.over || (st.placements || []).includes(s) || leftOf(st, s) > 0) return;
      if (st.q === 2) {
        finishClearGame(st, s);
        if (!st.teamMode && st.mode !== "classic" && s === seat) keep = false;
      }
      else {
        const last = st.po.filter(i => owner(st, i) === s).pop();
        if (last !== undefined) { place(st, last); parts.push("last coin returns \u2013 queen first"); if (s === group) keep = false; }
      }
    });
  }
  st.n++;
  const turnLimit = st.mode === "points" ? MAXTURNS * 8 : MAXTURNS;
  if (!st.over && st.n >= turnLimit) {
    if (st.mode === "points") {
      finishPointGame(st);
    } else if (!st.teamMode) {
      const ranked = competitors(st).sort((a, b) => leftOf(st, a) - leftOf(st, b));
      st.placements = ranked.slice(0, -1);
      st.loser = ranked[ranked.length - 1];
      st.win = st.placements[0];
      st.over = 1;
      st.msg = who(st.win) + " wins on coins pocketed. " + st.placements.map((player, index) =>
        (index + 1) + (index === 0 ? "st" : index === 1 ? "nd" : "rd") + ": " + who(player)
      ).join(" · ") + " · Lost: " + who(st.loser);
    } else {
      const a0 = leftOf(st, 0), a1 = leftOf(st, 1);
      st.over = 1; st.win = a0 === a1 ? -1 : st.teams.indexOf(a0 < a1 ? 0 : 1);
      st.msg = st.win < 0 ? "Draw – turn limit reached" : competitorName(st, st.teams[st.win]) + " wins on coins pocketed!";
    }
  }
  if (!st.over && !keep && !boardCompleted) advanceTurn(st, seat);
  if (!boardCompleted) st.ev = `${who(seat)}: ${parts.length ? parts.join(", ") : "no coin pocketed"}`;
  st.last = { pre, a: { x: a.x, dx: a.dx, dy: a.dy, p: a.p }, seat, out: w.out.slice(), foul: foul ? 1 : 0 };
  void back;
}

/* ------------------------------------------------------------------ */
/* bot (local play only — returns a normal action)                     */
/* ------------------------------------------------------------------ */
function botShot(st) {
  const seat = st.t, by = BY[sideFor(seat)], dirY = sideFor(seat) ? 1 : -1;
  const ownIn = s => coinsOf(st, s).filter(i => st.c[i][2]).length;
  const base = { own: ownIn(seat), opp: ownIn(1 - seat) };
  const evalShot = a => {
    const c = JSON.parse(JSON.stringify(st));
    resolve(c, a);
    const o = coinsOf(c, seat).filter(i => c.c[i][2]).length, p = coinsOf(c, 1 - seat).filter(i => c.c[i][2]).length;
    let s = (o - base.own) * 10 - (p - base.opp) * 6;
    if (c.over) s += c.win === seat ? 1000 : c.win < 0 ? 0 : -1000;
    if (c.q === 2 && st.q !== 2 && c.qw === seat) s += 14; else if (c.q === 1 && c.qw === seat) s += 5;
    if (c.last.foul) s -= 12;
    if (c.t === seat && !c.over) s += 4;
    return s + Math.random() * 0.5;
  };
  let targets = [];
  for (let i = 1; i < NP; i++) if (owner(st, i) === seat && !st.c[i][2]) targets.push(i);
  if (st.q === 0) targets.push(0);
  if (!targets.length) for (let i = 0; i < NP; i++) if (!st.c[i][2]) targets.push(i);
  const xs = [];
  for (let x = XMIN; x <= XMAX; x += 55) if (baseFree(st, seat, x)) xs.push(x);
  if (!xs.length) xs.push(500);
  const cands = [];
  targets.forEach(i => {
    const tx = st.c[i][0], ty = st.c[i][1];
    PK.forEach(pk => {
      let ux = pk[0] - tx, uy = pk[1] - ty;
      const ul = Math.sqrt(ux * ux + uy * uy);
      if (ul < 1) return;
      ux /= ul; uy /= ul;
      const gx = tx - ux * (RC + RS), gy = ty - uy * (RC + RS);
      if (gx < RS || gx > 1000 - RS || gy < RS || gy > 1000 - RS) return;
      xs.forEach(x => {
        const sx = gx - x, sy = gy - by, sl = Math.sqrt(sx * sx + sy * sy);
        if (sl < 1 || sy * dirY <= 0.05 * sl) return;
        const cut = (sx / sl) * ux + (sy / sl) * uy;
        if (cut < 0.3) return;
        cands.push({ x, sx, sy, sl, dt: ul, sc: cut * 100 - sl * 0.02 - ul * 0.03 });
      });
    });
  });
  cands.sort((p, q) => q.sc - p.sc);
  const shots = [];
  cands.slice(0, 16).forEach(c => {
    const v0 = Math.max(6, Math.min(28, (c.sl + c.dt * 1.6) * 0.0115 * 1.15 + 3));
    const p1 = Math.max(1, Math.min(100, Math.round((v0 - 2) / 0.26)));
    const dx = Math.round(c.sx / c.sl * 1000), dy = Math.round(c.sy / c.sl * 1000);
    [p1, Math.min(100, Math.round(p1 * 1.35) + 1)].forEach(p => shots.push({ x: c.x, dx, dy, p }));
  });
  for (let k = 0; k < 3; k++) {
    const x = xs[Math.floor(Math.random() * xs.length)];
    shots.push({ x, dx: Math.round((Math.random() - 0.5) * 500), dy: dirY * 1000, p: 40 + Math.floor(Math.random() * 40) });
  }
  let best = -Infinity, pick = null;
  shots.forEach(a => {
    if (!validOn(st, a)) return;
    const s = evalShot(a);
    if (s > best) { best = s; pick = a; }
  });
  if (!pick) return { x: xs[0], dx: 0, dy: dirY * 1000, p: 50 };
  // human-like imprecision: about +/-2 degrees of aim and a little power noise (local bot only)
  const jit = { x: pick.x, dx: pick.dx + Math.round((Math.random() - 0.5) * 90), dy: pick.dy,
    p: Math.max(1, Math.min(100, pick.p + Math.round((Math.random() - 0.5) * 10))) };
  return validOn(st, jit) ? jit : pick;
}

/* ------------------------------------------------------------------ */
/* look                                                                */
/* ------------------------------------------------------------------ */
// note: .cr-wrap has no entrance animation on purpose. The host replaces the board element on every draw, so a CSS
// animation there replays (fades in from opacity 0) after every shot, which shows up as a blink.
const CSS = `
.cr-wrap{--bw:min(94vw,640px);width:var(--bw);margin:0 auto;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cr-board{position:relative;width:100%;aspect-ratio:1/1}
.cr{display:block;width:100%;height:auto;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:14px;
  box-shadow:0 18px 44px rgba(40,25,10,.4);cursor:crosshair}
.cr.nomv{cursor:default}
.cr-logo{display:inline-block;vertical-align:middle}
.cr-guide{stroke:#fff;stroke-linecap:round;pointer-events:none}
.cr-fl{fill:none;stroke:#fff;stroke-width:5;animation:cr-fl .55s ease-out both;pointer-events:none}
.cr-hud{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 0}
.cr-player-name{position:absolute;left:12%;width:76%;z-index:5;box-sizing:border-box;overflow:hidden;color:#21170f;
  font:800 clamp(11px,2.4vw,16px)/1.2 system-ui,sans-serif;text-align:center;text-overflow:ellipsis;white-space:nowrap;
  text-shadow:0 1px 2px rgba(255,255,255,.9);pointer-events:none}
.cr-player-name.top{top:3%}.cr-player-name.bottom{bottom:3%}
.cr-places{flex-basis:100%;padding:8px 10px;border-radius:10px;background:rgba(120,100,70,.1);font-size:13px;font-weight:700}
.cr-side{flex:1 1 40%;min-width:0;padding:8px 10px;border-radius:12px;background:rgba(120,100,70,.14);border:2px solid transparent;
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;line-height:1.2}
.cr-side.on{border-color:#c98a2b;background:rgba(201,138,43,.16)}
.cr-dots{display:inline-flex;gap:3px;flex-wrap:wrap}
.cr-dots i{display:inline-block;width:11px;height:11px;border-radius:50%;box-sizing:border-box}
.cr-dots .w{background:#f6ead2;border:1.5px solid #8a7550}.cr-dots .b{background:#2b2b2b;border:1.5px solid #000}
.cr-dots .x{background:transparent;border:1.5px dashed currentColor;opacity:.45}
.cr-q{font-weight:700;color:#d9363e}.cr-q.pend{animation:cr-bl .7s ease-in-out infinite alternate}
.cr-ctl{display:grid;grid-template-columns:1fr;gap:6px;margin:10px 0 0;padding:10px 12px;border-radius:14px;background:rgba(120,100,70,.14)}
.cr-ctl label{display:grid;grid-template-columns:78px 1fr 44px;align-items:center;gap:8px;font-size:14px}
.cr-ctl input[type=range]{width:100%;min-height:34px;accent-color:#c98a2b}
.cr-ctl output{text-align:right;font-variant-numeric:tabular-nums;opacity:.8}
.cr-shoot{margin-top:2px;padding:12px 18px;border:0;border-radius:999px;background:#c98a2b;color:#fff;font:700 16px/1 system-ui,sans-serif;
  cursor:pointer;box-shadow:0 6px 14px rgba(0,0,0,.22);transition:transform .15s,opacity .15s;min-height:46px}
.cr-shoot:hover:not(:disabled){transform:translateY(-2px)}
.cr-shoot:focus-visible,.cr-ctl input:focus-visible{outline:3px solid #111827;outline-offset:2px}
.cr-shoot:disabled,.cr-ctl input:disabled{opacity:.45;cursor:default}
.cr-hint{margin:6px 2px 0;font-size:12.5px;opacity:.7;text-align:center}
.cr-setup{margin:12px 0;padding:14px;border-radius:16px;background:rgba(120,100,70,.14);text-align:center}
.cr-setup h3{margin:0 0 5px;font-size:19px}.cr-setup p{margin:0 0 12px;font-size:14px;opacity:.75}
.cr-setup-btns{display:flex;justify-content:center;flex-wrap:wrap;gap:8px}
.cr-setup-btn{min-height:44px;padding:10px 16px;border:2px solid #c98a2b;border-radius:999px;background:#fff;color:#3b2511;font:700 14px/1.2 system-ui,sans-serif;cursor:pointer}
.cr-setup-btn:hover:not(:disabled){background:#f9e8c8}.cr-setup-btn:disabled{opacity:.5;cursor:default}
.cr-x{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cr-xbg{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(15,23,42,.3),rgba(15,23,42,.75));animation:cr-fade .4s ease both}
.cr-xcv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cr-xcard{position:relative;box-sizing:border-box;width:min(90vw,400px);padding:26px 30px 24px;text-align:center;border-radius:26px;
  background:linear-gradient(165deg,#fffdf7,#f3ecdc);box-shadow:0 0 0 5px var(--w),0 0 60px 8px color-mix(in srgb,var(--w) 55%,transparent),0 26px 70px rgba(0,0,0,.4);
  animation:cr-card .7s cubic-bezier(.2,1.25,.3,1) both}
.cr-xic{font-size:64px;line-height:1;display:inline-block;filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));animation:cr-ic 1.1s ease-in-out infinite alternate}
.cr-xt{margin:8px 0 4px;font-size:clamp(26px,6.5vw,36px);font-weight:900;line-height:1.1;color:#2a1d12}
.cr-xs{margin:0;color:#57534e;font-size:15px;line-height:1.4}
.cr-xb{margin-top:18px;padding:11px 30px;border:0;border-radius:999px;background:#8a5a14;color:#fff;font:700 15px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.25);transition:transform .15s}
.cr-xb:hover{transform:translateY(-2px)}.cr-xb:focus-visible{outline:3px solid #111827;outline-offset:3px}
.cr-x.out .cr-xcard{animation:cr-cardout .28s ease both}.cr-x.out .cr-xbg{animation:cr-fadeout .28s ease both}
@keyframes cr-fl{from{opacity:.95;transform:scale(.4)}to{opacity:0;transform:scale(2.2)}}
@keyframes cr-bl{from{opacity:.45}to{opacity:1}}
@keyframes cr-fade{from{opacity:0}to{opacity:1}}
@keyframes cr-fadeout{from{opacity:1}to{opacity:0}}
@keyframes cr-card{0%{opacity:0;transform:translateY(40px) scale(.6) rotate(-4deg)}100%{opacity:1;transform:none}}
@keyframes cr-cardout{to{opacity:0;transform:translateY(20px) scale(.9)}}
@keyframes cr-ic{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(8deg) scale(1.12)}}
@media (max-width:480px){.cr-ctl label{grid-template-columns:64px 1fr 38px}}
@media (prefers-reduced-motion:reduce){.cr-wrap,.cr-wrap *,.cr-x *{animation:none!important;transition:none!important}}
`;
function addStyles() {
  if (document.getElementById("carrom-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "carrom-ui-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const fx = n => Math.round(n * 10) / 10;
const ROT = "rotate(180 500 500)";          // the board is symmetric, so a 180 degree turn is all the "view" needs
const GROT = "rotate(180 .5 .5)";           // keeps the coin highlights in the top-left once the board is turned

// rot: true when the board is drawn from seat 1's side
function playerNameOverlay(st) {
  if (!st || st.setup) return "";
  const seats = Array.from({ length: st.teams.length }, (_, player) => player);
  const labels = [seats.filter(player => sideFor(player) === 1), seats.filter(player => sideFor(player) === 0)];
  const names = labels.map((players, index) => {
    if (!players.length) return "";
    const name = players.map(player => who(player)).join(" · ");
    const side = index === 0 ? "top" : "bottom";
    return `<span class="cr-player-name ${side}" role="note" aria-label="${esc(name)}">${esc(name)}</span>`;
  }).join("");
  return names;
}

function boardSVG(rot) {
  const gt = rot ? ` gradientTransform="${GROT}"` : "";
  const rg = (id, stops) => `<radialGradient class="cr-rg" id="${id}" cx="35%" cy="30%"${gt}>${stops}</radialGradient>`;
  let h = '<defs>' +
    rg("cr-gw", '<stop offset="0" stop-color="#fffdf6"/><stop offset=".7" stop-color="#eadcb8"/><stop offset="1" stop-color="#cdb98a"/>') +
    rg("cr-gb", '<stop offset="0" stop-color="#6b6b6b"/><stop offset=".6" stop-color="#262626"/><stop offset="1" stop-color="#050505"/>') +
    rg("cr-gq", '<stop offset="0" stop-color="#ff9a9a"/><stop offset=".6" stop-color="#d9363e"/><stop offset="1" stop-color="#8f1219"/>') +
    rg("cr-gs", '<stop offset="0" stop-color="#fff6c9"/><stop offset=".6" stop-color="#f2c94c"/><stop offset="1" stop-color="#b8861b"/>') +
    '<clipPath id="cr-clip"><rect x="0" y="0" width="1000" height="1000"/></clipPath></defs>';
  h += '<rect x="-60" y="-60" width="1120" height="1120" rx="40" fill="#5a3a1c"/><rect x="-46" y="-46" width="1092" height="1092" rx="30" fill="#7a5128"/>' +
    '<rect x="0" y="0" width="1000" height="1000" fill="#e9c88b"/><rect x="0" y="0" width="1000" height="1000" fill="none" stroke="#3b2511" stroke-width="6"/>';
  PK.forEach(p => { h += `<circle cx="${p[0]}" cy="${p[1]}" r="38" fill="#111" stroke="#3b2511" stroke-width="5"/>`; });
  h += '<g fill="none" stroke="#7a2e1c" stroke-width="3" opacity=".75">' +
    '<circle cx="500" cy="500" r="110"/><circle cx="500" cy="500" r="22"/>' +
    '<line x1="170" y1="829" x2="830" y2="829"/><line x1="170" y1="881" x2="830" y2="881"/><circle cx="170" cy="855" r="26"/><circle cx="830" cy="855" r="26"/>' +
    '<line x1="170" y1="119" x2="830" y2="119"/><line x1="170" y1="171" x2="830" y2="171"/><circle cx="170" cy="145" r="26"/><circle cx="830" cy="145" r="26"/>' +
    '<line x1="119" y1="170" x2="119" y2="830"/><line x1="171" y1="170" x2="171" y2="830"/><circle cx="145" cy="170" r="26"/><circle cx="145" cy="830" r="26"/>' +
    '<line x1="829" y1="170" x2="829" y2="830"/><line x1="881" y1="170" x2="881" y2="830"/><circle cx="855" cy="170" r="26"/><circle cx="855" cy="830" r="26"/></g>';
  return h;
}

// list: [[x, y, in], ...] (19 entries). striker: {x, y} or null
function piecesSVG(list, striker) {
  let h = "";
  for (let i = 0; i < NP; i++) {
    const c = list[i];
    if (!c || c[2]) continue;
    const g = i === 0 ? "cr-gq" : i <= 9 ? "cr-gw" : "cr-gb", ring = i > 9 ? "rgba(255,255,255,.35)" : "rgba(60,40,20,.35)";
    h += `<g><circle cx="${fx(c[0])}" cy="${fx(c[1])}" r="${RC}" fill="url(#${g})" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>` +
      `<circle cx="${fx(c[0])}" cy="${fx(c[1])}" r="${RC * 0.58}" fill="none" stroke="${ring}" stroke-width="1.6"/></g>`;
  }
  if (striker) {
    h += `<g><circle cx="${fx(striker.x)}" cy="${fx(striker.y)}" r="${RS}" fill="url(#cr-gs)" stroke="#6b4a0e" stroke-width="2"/>` +
      `<circle cx="${fx(striker.x)}" cy="${fx(striker.y)}" r="${RS * 0.6}" fill="none" stroke="rgba(107,74,14,.55)" stroke-width="2"/></g>`;
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* UI state (local to this client — never part of S)                   */
/* ------------------------------------------------------------------ */
let aim = { x: 500, ang: 0, p: 60, n: -1 }, busy = false, animN = null, shown = null, winEl = null, stopFx = null, winTimer = 0;
let drag = null, refocus = false, animRaf = 0;
let view = 0, pendingView = 0;              // whose side is drawn at the bottom (0 = White, 1 = Black)

const canMove = () => !!S && !S.over && !S.setup && (typeof canAct !== "function" || canAct());
const canSetup = () => {
  if (!S || !S.setup) return false;
  if (typeof ids !== "undefined" && ids.length) return typeof amHost === "function" && amHost();
  return typeof canAct !== "function" || canAct();
};
const willAnim = () => animN !== null && S.n > animN && !!S.last && !reduced();

/* ---- per-player view ------------------------------------------------ */
// Seat 1 sees the board turned 180 degrees. `aim` always stays in board coordinates (so aimAction and validOn are
// unchanged); only the sliders and the pointer are mapped, so "right" on screen is always "right" for the player.
const flipped = () => view === 1;
const sliderX = () => flipped() ? XMIN + XMAX - aim.x : aim.x;
const sliderAng = () => flipped() ? -aim.ang : aim.ang;

// Which seat should be at the bottom?
//  - online: my own seat for the whole game (canAct is true only on my turn, so the other seat is the one waiting)
//  - vs the bot: the human's seat
//  - user vs user (one device, canAct is true for both seats): never rotate, the board stays put
// Detected from what canAct() has allowed so far, because the host does not tell us the mode. If the host exposes the
// mode or the local seat directly, return that here instead.
function wantView() {
  if (!S || S.over) return view;
  if (typeof ids !== "undefined" && !ids.length) return 0;
  if (typeof seat === "number" && seat >= 0 && seat < playerCount()) return sideFor(seat);
  if (typeof canAct === "function" && canAct()) return sideFor(S.t);
  return 0;
}

// turns the board after a shot replay finishes (the replay itself is shown from the shooter's side)
function syncView(wrap) {
  if (view === pendingView) return;
  view = pendingView;
  const rot = flipped(), g = wrap.querySelector("#cr-view");
  if (g) { if (rot) g.setAttribute("transform", ROT); else g.removeAttribute("transform"); }
  wrap.querySelectorAll(".cr-rg").forEach(el => { if (rot) el.setAttribute("gradientTransform", GROT); else el.removeAttribute("gradientTransform"); });
}

function aimAction() {
  const rad = aim.ang * Math.PI / 180;       // UI only: quantised to integers, so the physics stays deterministic
  const side = sideFor(S.t);
  const dx = Math.round(Math.sin(rad) * 1000), dy = Math.round(Math.cos(rad) * 1000) * (side === 0 ? -1 : 1);
  return { x: aim.x, dx, dy, p: aim.p };
}

function aimSVG() {
  if (!canMove() || busy) return "";
  const a = aimAction(), by = BY[sideFor(S.t)], len = Math.sqrt(a.dx * a.dx + a.dy * a.dy), ux = a.dx / len, uy = a.dy / len;
  const bad = !validOn(S, a);
  const L = 70 + aim.p * 3.2;
  return `<g clip-path="url(#cr-clip)" opacity="${bad ? 0.5 : 1}">` +
    `<line class="cr-guide" x1="${a.x}" y1="${by}" x2="${fx(a.x + ux * 1600)}" y2="${fx(by + uy * 1600)}" stroke-width="2.5" stroke-dasharray="4 12" opacity=".8"/>` +
    `<line class="cr-guide" x1="${a.x}" y1="${by}" x2="${fx(a.x + ux * L)}" y2="${fx(by + uy * L)}" stroke-width="9" stroke="${bad ? "#ef4444" : "#ffffff"}" opacity=".85"/></g>` +
    piecesSVG([], { x: a.x, y: by }).replace("<g>", `<g opacity="${bad ? 0.55 : 1}">`);
}

function hud() {
  if (S.setup) return "";
  let h = '<div class="cr-hud">';
  if (S.placements && S.placements.length) {
    const standings = S.placements.map((player, index) =>
      (index + 1) + (index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th") +
      ": " + competitorName(S, player)
    );
    if (Number.isInteger(S.loser)) standings.push("Lost: " + competitorName(S, S.loser));
    h += `<div class="cr-places" role="status">${standings.map(esc).join(" · ")}</div>`;
  }
  competitors(S).forEach(group => {
    const active = S.teamMode ? groupOf(S, S.t) === group : S.t === group;
    const q = S.q === 2 && S.qw === group ? '<span class="cr-q" title="Queen covered">\u265B</span>' :
      S.q === 1 && S.qw === group ? '<span class="cr-q pend" title="Cover the queen">\u265B?</span>' : "";
    const detail = S.mode === "points"
      ? `<span>${S.scores[group]} points</span><small>Board ${Math.min(S.boards + 1, 8)} of 8</small>`
      : `<span>${leftOf(S, group)} coins left</span>`;
    const accessibleDetail = S.mode === "points"
      ? `${S.scores[group]} points, board ${Math.min(S.boards + 1, 8)} of 8`
      : `${leftOf(S, group)} coins left`;
    h += `<div class="cr-side${active && !S.over ? " on" : ""}" role="group" aria-label="${esc(competitorName(S, group))}: ${accessibleDetail}${S.q === 2 && S.qw === group ? ", queen covered" : ""}">` +
      `<b>${esc(competitorName(S, group))}</b>${detail}${q}</div>`;
  });
  return h + "</div>";
}

function fmtOut(id, text) { return `<output id="${id}">${text}</output>`; }

function setupButton(action, label, disabled) {
  return `<button type="button" class="cr-setup-btn" data-cr-setup="${esc(JSON.stringify(action))}"${disabled ? " disabled" : ""}>${esc(label)}</button>`;
}

function setupHtml() {
  const can = canSetup(), waiting = "<p>Waiting for the host to choose\u2026</p>";
  let title = "", buttons = "";
  if (S.setup === "mode") {
    title = "Choose a Carrom game";
    buttons = setupButton({ gameMode: "points" }, "Point Game · 8 boards", !can) +
      setupButton({ gameMode: "clear" }, "Clear-the-board Game", !can);
  } else if (S.setup === "style") {
    title = "Choose how to play";
    buttons = setupButton({ playStyle: "individual" }, "Individual", !can) +
      setupButton({ playStyle: "team" }, "Teams · 2 vs 2", !can);
  } else if (S.setup === "partner") {
    title = "Choose your team partner";
    for (let player = 1; player < playerCount(); player++) {
      buttons += setupButton({ partner: player }, who(player), !can);
    }
  }
  return `<div class="cr-setup" role="group" aria-label="Carrom game setup"><h3>${title}</h3>` +
    (can ? "" : waiting) + `<div class="cr-setup-btns">${buttons}</div></div>`;
}

function updateAim(wrap) {
  if (!wrap) return;
  const layer = wrap.querySelector("#cr-aim");
  if (layer) layer.innerHTML = aimSVG();
  const set = (k, v, txt) => {
    const el = wrap.querySelector(`input[data-k="${k}"]`);
    if (el && +el.value !== v) el.value = v;
    const o = wrap.querySelector("#cr-o-" + k);
    if (o) o.textContent = txt;
  };
  set("x", sliderX(), String(sliderX()));
  set("ang", sliderAng(), sliderAng() + "\u00B0");
  set("p", aim.p, String(aim.p));
  const btn = wrap.querySelector(".cr-shoot");
  if (btn) btn.disabled = !(canMove() && !busy && validOn(S, aimAction()));
  const svg = wrap.querySelector(".cr");
  if (svg) svg.classList.toggle("nomv", !(canMove() && !busy));
}

function refreshUI(wrap) {
  if (!wrap) return;
  const can = canMove() && !busy;
  wrap.querySelectorAll(".cr-ctl input").forEach(el => { el.disabled = !can; });
  updateAim(wrap);
  if (refocus && can) {
    const b = wrap.querySelector(".cr-shoot");
    if (b && !b.disabled) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  refocus = false;
}

function shoot() {
  if (!canMove() || busy) return;
  const a = aimAction();
  if (validOn(S, a)) act(a);
}

/* ------------------------------------------------------------------ */
/* input                                                               */
/* ------------------------------------------------------------------ */
const live = () => typeof S !== "undefined" && S && S.c && S.last !== undefined;

document.addEventListener("click", e => {
  if (!live() || !e.target.closest) return;
  const setup = e.target.closest(".cr-setup-btn");
  if (setup && canSetup()) {
    let action;
    try { action = JSON.parse(setup.dataset.crSetup); }
    catch (error) { console.error("[carrom] Invalid setup choice.", error); return; }
    if (validOn(S, action)) act(action);
    return;
  }
  const b = e.target.closest(".cr-shoot");
  if (!b) return;
  refocus = e.detail === 0;
  shoot();
});

document.addEventListener("input", e => {
  if (!live() || !e.target.matches || !e.target.matches(".cr-ctl input[data-k]")) return;
  const k = e.target.dataset.k, v = +e.target.value;
  if (k === "x") aim.x = Math.max(XMIN, Math.min(XMAX, Math.round(flipped() ? XMIN + XMAX - v : v)));
  else if (k === "ang") aim.ang = Math.max(-80, Math.min(80, Math.round(flipped() ? -v : v)));
  else if (k === "p") aim.p = Math.max(1, Math.min(100, Math.round(v)));
  updateAim(e.target.closest(".cr-wrap"));
});

// screen -> board coordinates (undoes the 180 degree turn when the board is drawn from seat 1's side)
function boardPt(e, svg) {
  const r = svg.getBoundingClientRect(), k = 1120 / r.width;
  const x = (e.clientX - r.left) * k - 60, y = (e.clientY - r.top) * k - 60;
  return flipped() ? [1000 - x, 1000 - y] : [x, y];
}

function aimFromPointer(px, py) {
  const side = sideFor(S.t), sx = aim.x, sy = BY[side], vx = sx - px, vy = sy - py, fwd = side === 0 ? -vy : vy;
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len < 8) return { len, fwd };
  let ang = Math.atan2(vx, fwd) * 180 / Math.PI;
  ang = Math.max(-80, Math.min(80, Math.round(ang)));
  aim.ang = ang;
  aim.p = Math.max(1, Math.min(100, Math.round(len / 3)));
  return { len, fwd };
}

document.addEventListener("pointerdown", e => {
  if (!live() || !e.target.closest) return;
  const svg = e.target.closest(".cr");
  if (!svg || !canMove() || busy) return;
  e.preventDefault();
  const [px, py] = boardPt(e, svg), dx = px - aim.x, dy = py - BY[sideFor(S.t)];
  drag = { svg, mode: dx * dx + dy * dy < 60 * 60 ? "move" : "aim", len: 0, fwd: 0 };
  try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (drag.mode === "aim") { const r = aimFromPointer(px, py); drag.len = r.len; drag.fwd = r.fwd; updateAim(svg.closest(".cr-wrap")); }
});

document.addEventListener("pointermove", e => {
  if (!drag || !live()) return;
  const [px, py] = boardPt(e, drag.svg);
  if (drag.mode === "move") aim.x = Math.max(XMIN, Math.min(XMAX, Math.round(px)));
  else { const r = aimFromPointer(px, py); drag.len = r.len; drag.fwd = r.fwd; }
  updateAim(drag.svg.closest(".cr-wrap"));
});

function endDrag(fire) {
  const d = drag; drag = null;
  if (!d || !live()) return;
  if (fire && d.mode === "aim" && d.len >= 45 && d.fwd > 0.15 * d.len) shoot();
}
document.addEventListener("pointerup", () => endDrag(true));
document.addEventListener("pointercancel", () => endDrag(false));

document.addEventListener("keydown", e => { if (e.key === "Escape") { if (winEl) closeBanner(); else if (drag) drag = null; } });

/* ------------------------------------------------------------------ */
/* replay animation                                                    */
/* ------------------------------------------------------------------ */
function worldList(w) {
  const l = [];
  for (let i = 0; i < NP; i++) l.push([w.x[i], w.y[i], w.live[i] ? 0 : 1]);
  return l;
}

function finishAnim() {
  cancelAnimationFrame(animRaf); animRaf = 0;
  busy = false;
  const wrap = document.querySelector(".cr-wrap");
  if (wrap) {
    syncView(wrap);                          // turn the board to the next shooter's side (if it changed)
    const pl = wrap.querySelector("#cr-pieces");
    if (pl) pl.innerHTML = piecesSVG(S.c, null);
    refreshUI(wrap);
  }
  maybeBanner();
}

function startAnim(wrap) {
  const m = S.last;
  busy = true;
  const w = makeWorld(m.pre, m.seat, m.a);
  let prev = performance.now(), acc = 0, seen = 0;
  const loop = now => {
    const cur = document.querySelector(".cr-wrap");
    if (!cur) { busy = false; animRaf = 0; return; }
    const dt = Math.min(64, now - prev); prev = now;
    acc += dt / 16.667 * (w.vm > 3 ? 4 : w.vm > 0.6 ? 7 : 12);
    while (acc >= 1 && !w.done) { stepWorld(w); acc--; }
    const pl = cur.querySelector("#cr-pieces"), fxl = cur.querySelector("#cr-fx");
    if (pl) pl.innerHTML = piecesSVG(worldList(w), w.live[SI] ? { x: w.x[SI], y: w.y[SI] } : null);
    while (seen < w.ev.length) {
      const p = PK[w.ev[seen][1]];
      seen++;
      if (fxl) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("class", "cr-fl"); c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", 34);
        c.style.transformOrigin = p[0] + "px " + p[1] + "px"; c.style.transformBox = "view-box";
        c.addEventListener("animationend", () => c.remove());
        fxl.appendChild(c);
      }
    }
    if (w.done) { finishAnim(); return; }
    animRaf = requestAnimationFrame(loop);
  };
  animRaf = requestAnimationFrame(loop);
  void wrap;
}

/* ------------------------------------------------------------------ */
/* celebration                                                         */
/* ------------------------------------------------------------------ */
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
  el.className = "cr-x";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Game over");
  el.style.setProperty("--w", draw ? "#64748b" : win === 0 ? "#d4a73a" : "#3f3a35");
  el.innerHTML = '<div class="cr-xbg"></div><canvas class="cr-xcv"></canvas><div class="cr-xcard"><div class="cr-xic" aria-hidden="true"></div>' +
    '<h2 class="cr-xt"></h2><p class="cr-xs"></p><button type="button" class="cr-xb">Close</button></div>';
  el.querySelector(".cr-xic").textContent = draw ? "\uD83E\uDD1D" : "\uD83C\uDFC6";
  el.querySelector(".cr-xt").textContent = title;
  el.querySelector(".cr-xs").textContent = sub;
  el.querySelector(".cr-xb").addEventListener("click", () => closeBanner());
  el.querySelector(".cr-xbg").addEventListener("click", () => closeBanner());
  document.body.appendChild(el);
  winEl = el;
  if (!draw) stopFx = confetti(el.querySelector(".cr-xcv"));
  try { el.querySelector(".cr-xb").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (!draw && navigator.vibrate) { try { navigator.vibrate([90, 50, 90, 50, 220]); } catch (e) { /* ignore */ } }
}

function confetti(cv) {
  if (reduced() || !cv.getContext) return () => {};
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const cols = ["#e5322d", "#d4a73a", "#2160c4", "#2fa84f", "#ffffff", "#ff7ab8"];
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
    const left = i % 2 === 0, an = ((left ? -58 : -122) + rnd(-20, 20)) * Math.PI / 180, s = rnd(0.45, 1) * Math.max(650, H * 1.1);
    add(left ? 0 : W, H, Math.cos(an) * s, Math.sin(an) * s);
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

function maybeBanner() {
  if (!S || !S.over || busy) return;
  const key = S.msg + "|" + S.n;
  if (shown === key) return;
  shown = key;
  const w = S.win, sub = String(S.msg || "").replace(/[^\x20-\u024F\u2014\u2013]/g, "").trim();
  clearTimeout(winTimer);
  const winner = w < 0 ? "Draw" : S.teamMode ? competitorName(S, groupOf(S, w)) + " wins!" : `${who(w)} wins!`;
  winTimer = setTimeout(() => { if (S.over && shown === key) celebrate(w, winner, sub); }, reduced() ? 0 : 500);
}

/* ------------------------------------------------------------------ */
/* after each render (the board element is replaced on every draw)      */
/* ------------------------------------------------------------------ */
function post() {
  const wrap = document.querySelector(".cr-wrap");
  if (!wrap || wrap.dataset.crui || typeof S === "undefined" || !S || !S.c) return;
  wrap.dataset.crui = "1";
  let animate = false;
  if (typeof S.n === "number") {
    if (animN === null || S.n < animN) animN = S.n;
    else if (S.n > animN) { animN = S.n; animate = !!S.last && !reduced(); }
  }
  if (!S.over && shown) { shown = null; closeBanner(true); }
  if (animate) startAnim(wrap);
  else { if (animRaf) { cancelAnimationFrame(animRaf); animRaf = 0; } busy = false; refreshUI(wrap); maybeBanner(); }
}

/* ------------------------------------------------------------------ */
/* game logo                                                           */
/* ------------------------------------------------------------------ */
// Preview logo: a small carrom board (frame, pockets, centre circle, queen, coins, striker on the baseline).
// Flat fills only (no gradient ids), so it can be placed on a page any number of times without id clashes.
// Sized in em, so it scales with whatever font size the host uses for the game icon.
// The host prints game.i as plain TEXT (an <svg> string there would show up as code), so game.i is a single marker
// emoji (a brown square, which also works as a fallback) and upgradeLogos() swaps every marker on the page for this
// logo. It runs inside the MutationObserver callback, i.e. before the browser paints, so the marker never flashes.
const LOGO = '<svg class="cr-logo" viewBox="0 0 100 100" width="1em" height="1em" role="img" aria-label="Carrom board" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="2" y="2" width="96" height="96" rx="12" fill="#7a5128"/>' +
  '<rect x="9" y="9" width="82" height="82" rx="4" fill="#e9c88b" stroke="#3b2511" stroke-width="1.5"/>' +
  '<circle cx="15" cy="15" r="6" fill="#111"/><circle cx="85" cy="15" r="6" fill="#111"/>' +
  '<circle cx="15" cy="85" r="6" fill="#111"/><circle cx="85" cy="85" r="6" fill="#111"/>' +
  '<circle cx="50" cy="50" r="20" fill="none" stroke="#7a2e1c" stroke-width="1.5"/>' +
  '<line x1="24" y1="75" x2="76" y2="75" stroke="#7a2e1c" stroke-width="1.2"/>' +
  '<line x1="24" y1="85" x2="76" y2="85" stroke="#7a2e1c" stroke-width="1.2"/>' +
  '<circle cx="50" cy="39" r="4.2" fill="#f6ead2" stroke="#6b5a3a" stroke-width="1"/>' +
  '<circle cx="59.5" cy="44.5" r="4.2" fill="#2b2b2b" stroke="#000" stroke-width="1"/>' +
  '<circle cx="59.5" cy="55.5" r="4.2" fill="#f6ead2" stroke="#6b5a3a" stroke-width="1"/>' +
  '<circle cx="50" cy="61" r="4.2" fill="#2b2b2b" stroke="#000" stroke-width="1"/>' +
  '<circle cx="40.5" cy="55.5" r="4.2" fill="#f6ead2" stroke="#6b5a3a" stroke-width="1"/>' +
  '<circle cx="40.5" cy="44.5" r="4.2" fill="#2b2b2b" stroke="#000" stroke-width="1"/>' +
  '<circle cx="50" cy="50" r="4.6" fill="#d9363e" stroke="#8f1219" stroke-width="1"/>' +
  '<circle cx="50" cy="80" r="5.2" fill="#f2c94c" stroke="#6b4a0e" stroke-width="1.2"/></svg>';

const LOGO_MARK = "\u{1F7EB}";

function logoNode() {
  const t = document.createElement("template");
  t.innerHTML = LOGO;
  return t.content.firstChild;
}

function swapMarker(t) {
  const p = t.parentNode;
  if (!p || p.namespaceURI === "http://www.w3.org/2000/svg" || /^(SCRIPT|STYLE|TEXTAREA|TITLE|OPTION)$/.test(p.nodeName)) return;
  const frag = document.createDocumentFragment();
  t.nodeValue.split(LOGO_MARK).forEach((part, k) => {
    if (k) frag.appendChild(logoNode());
    if (part) frag.appendChild(document.createTextNode(part));
  });
  p.replaceChild(frag, t);
}

// root: a text node or an element; every text node below it that contains the marker is upgraded
function upgradeLogos(root) {
  if (!root || !document.createTreeWalker) return;
  const hits = [];
  if (root.nodeType === 3) { if (root.nodeValue.indexOf(LOGO_MARK) >= 0) hits.push(root); }
  else if (root.nodeType === 1) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.nodeValue.indexOf(LOGO_MARK) >= 0) hits.push(n);
  }
  hits.forEach(swapMarker);
}

// looks only at what the observer says changed, so it stays cheap while the shot animation redraws every frame
function upgradeChanged(recs) {
  recs.forEach(r => {
    if (r.type === "characterData") { upgradeLogos(r.target); return; }
    r.addedNodes.forEach(n => {
      if (n.nodeType === 3 ? n.nodeValue.indexOf(LOGO_MARK) >= 0 : n.nodeType === 1 && n.textContent.indexOf(LOGO_MARK) >= 0) upgradeLogos(n);
    });
  });
}

/* ------------------------------------------------------------------ */
/* after each render (observer)                                        */
/* ------------------------------------------------------------------ */
const OBS_OPT = { childList: true, subtree: true, characterData: true };
let obs = null;
function startObserver() {
  addStyles();
  upgradeLogos(document.body);
  obs = new MutationObserver(recs => { obs.disconnect(); try { upgradeChanged(recs); post(); } finally { obs.observe(document.body, OBS_OPT); } });
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
  id: "carrom", i: LOGO_MARK, t: "Carrom", min: 2, max: 4, hostSetup: true, cat: "classic strategy", tag: "Flick & pocket", diff: "Easy to learn", art: "art-carrom",
  d: "Choose Point Game or Clear-the-board for 3–4 players. In Point Game, pocket coins to score across eight boards.",
  get n() { return Array.from({ length: playerCount() }, (_, player) => who(player)); },
  valid: a => validOn(S, a),
  soundEvents(action, previousState, currentState) {
    if (!Number.isInteger(action.x) || (previousState && previousState.setup)) return [];
    const last = currentState.last;
    if (last && last.foul) return ["foul"];
    if (last && last.out.length) return ["capture"];
    return ["move"];
  },
  init() {
    const count = playerCount();
    return {
      c: startCoins(), t: 0, n: 0, q: 0, qw: -1, po: [], last: null, ev: "",
      over: 0, win: -1, msg: "", setup: count > 2 ? "mode" : "",
      mode: count > 2 ? "" : "classic", style: "individual", teamMode: 0,
      teams: Array.from({ length: count }, (_, player) => player), owners: null,
      scores: [], boards: 0, placements: []
    };
  },
  apply(a) {
    if (!validOn(S, a)) return;
    resolve(S, a);
  },
  bot() { return botShot(S); },
  draw() {
    if (aim.n !== S.n) aim = { x: 500, ang: 0, p: 60, n: S.n };
    const anim = willAnim(), can = canMove() && !busy && !anim;
    // view: during a replay keep the shooter's side at the bottom and turn the board afterwards (see syncView)
    const want = wantView();
    if (anim) pendingView = want; else view = pendingView = want;
    const rot = flipped();
    const list = anim ? S.last.pre : S.c;
    const striker = anim ? { x: S.last.a.x, y: BY[sideFor(S.last.seat)] } : null;
    let h = '<div class="cr-wrap"><div class="cr-board">' +
      '<svg class="cr' + (can ? "" : " nomv") + '" viewBox="-60 -60 1120 1120" role="img" aria-label="Carrom board. Drag back from the board to aim and release to shoot, or use the sliders below.">' +
      '<g id="cr-view"' + (rot ? ` transform="${ROT}"` : "") + '>' +
      boardSVG(rot) + '<g id="cr-pieces">' + piecesSVG(list, striker) + '</g><g id="cr-aim"></g><g id="cr-fx"></g></g></svg>' +
      playerNameOverlay(S) + '</div>' + hud();
    const dis = can ? "" : " disabled";
    if (S.setup) h += setupHtml();
    else {
      h += '<div class="cr-ctl" role="group" aria-label="Shot controls">' +
        `<label>Striker<input type="range" data-k="x" min="${XMIN}" max="${XMAX}" step="1" value="${sliderX()}"${dis}>${fmtOut("cr-o-x", sliderX())}</label>` +
        `<label>Angle<input type="range" data-k="ang" min="-80" max="80" step="1" value="${sliderAng()}"${dis}>${fmtOut("cr-o-ang", sliderAng() + "\u00B0")}</label>` +
        `<label>Power<input type="range" data-k="p" min="1" max="100" step="1" value="${aim.p}"${dis}>${fmtOut("cr-o-p", aim.p)}</label>` +
        `<button type="button" class="cr-shoot"${dis}>Shoot</button></div>` +
        '<p class="cr-hint">Drag near the striker to slide it \u00B7 drag back anywhere to aim, release to shoot</p>';
    }
    h += "</div>";
    const status = S.over ? S.msg : S.setup
      ? (canSetup() ? "Choose the Carrom match settings." : "Waiting for the host to choose the Carrom match settings.")
      : `${who(S.t)} to shoot${S.q === 1 && S.qw === groupOf(S, S.t) ? " \u2013 cover the queen!" : ""}${S.ev ? " \u2014 " + S.ev : ""}`;
    return [h, status];
  },
  click() { /* input is handled by the delegated listeners above (board is SVG; controls are native inputs) */ }
};

if (typeof registerGame === "function") registerGame(game);
if (typeof __CARROM_TEST !== "undefined") globalThis.__carromCore = { resolve, makeWorld, stepWorld, runWorld, validOn, startCoins, game, botShot, owner, assignOwners, finishPointGame };
})();
