/* arrows-game.js
   Arrow puzzle: every arrow is a bent line ending in an arrowhead. Tap an arrow to slide it
   out in the direction its head points. It only leaves if nothing is in its way.
   Blocked taps cost a life. Clear every arrow to win.
   - Engine: generate(level) / init / blocker / freeArrows / valid / apply (pure, no DOM)
   - Levels are generated automatically from the level number (seeded), are always solvable,
     and keep getting harder with no upper limit.
   - UI: mount(root) with a canvas, slide-out animation, hint button, lives and saved level.
   Registers with registerGame() if the host defines it, otherwise runs standalone. */
(function () {
  'use strict';

  // ---------- Engine ----------
  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // [dRow, dCol]: up, right, down, left
  const ARROW_COLORS = ['#83a8ff', '#a8cf82', '#f3d16f', '#c49be8', '#f0a58b', '#56c9bd', '#f27f79', '#b6bfd5'];
  const LIVES = 3;
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function playSound(event) {
    if (window.playoraSound && typeof window.playoraSound.playGame === 'function')
      window.playoraSound.playGame('arrows', event);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bigger board, fuller board, longer arrows, and more tangled placement as the level rises.
  function params(level) {
    const cols = Math.min(30, 18 + (level >> 1));
    return {
      cols,
      rows: Math.min(32, cols + 2 + (level >> 3)),
      fill: Math.min(0.78, 0.56 + level * 0.008),
      maxLen: Math.min(18, 5 + (level >> 1)),
      pick: Math.min(30, 1 + level * 2), // candidates compared per arrow: the most tangled one wins
    };
  }

  // Arrows are placed one at a time. A new arrow's exit line may not touch any arrow already
  // on the board, so removing arrows in reverse order of placement always works: solvable.
  function generate(level) {
    const P = params(level), rng = mulberry32(level * 7919 + 13);
    const { rows, cols } = P, total = rows * cols;
    const occ = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const rayMap = new Map(); // "r,c" -> ids of arrows whose exit line passes through that cell
    const arrows = [];
    let filled = 0;
    const inside = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;

    function candidate() {
      let r = -1, c = -1;
      for (let k = 0; k < 8; k++) {
        r = Math.floor(rng() * rows); c = Math.floor(rng() * cols);
        if (occ[r][c] < 0) break;
        r = -1;
      }
      if (r < 0) return null;
      const len = 2 + Math.floor(rng() * (P.maxLen - 1));
      const cells = [[r, c]], seen = new Set([r + ',' + c]);
      let di = Math.floor(rng() * 4);
      for (let i = 1; i < len; i++) {
        const a = (di + 1) % 4, b = (di + 3) % 4;
        const order = rng() < 0.6 ? [di, a, b] : rng() < 0.5 ? [a, b, di] : [b, a, di];
        let moved = false;
        for (const d of order) {
          const nr = r + DIRS[d][0], nc = c + DIRS[d][1];
          if (!inside(nr, nc) || occ[nr][nc] >= 0 || seen.has(nr + ',' + nc)) continue;
          r = nr; c = nc; di = d; cells.push([r, c]); seen.add(r + ',' + c); moved = true;
          break;
        }
        if (!moved) break;
      }
      if (cells.length < 2) return null;
      const ray = [];
      let rr = r + DIRS[di][0], cc = c + DIRS[di][1];
      while (inside(rr, cc)) {
        if (occ[rr][cc] >= 0 || seen.has(rr + ',' + cc)) return null; // its own exit would be blocked
        ray.push([rr, cc]);
        rr += DIRS[di][0]; cc += DIRS[di][1];
      }
      const hit = new Set();
      cells.forEach(([a, b]) => { const set = rayMap.get(a + ',' + b); if (set) set.forEach(x => hit.add(x)); });
      return { cells, dir: DIRS[di], ray, score: hit.size * 3 + ray.length * 0.6 };
    }

    let tries = total * 10;
    while (filled < total * P.fill && tries > 0) {
      let best = null;
      for (let k = 0; k < P.pick && tries > 0; k++) {
        tries--;
        const c = candidate();
        if (c && (!best || c.score > best.score)) best = c;
      }
      if (!best) continue;
      const id = arrows.length;
      arrows.push({ cells: best.cells, dir: best.dir, alive: true, color: ARROW_COLORS[(id * 5 + Math.floor(rng() * ARROW_COLORS.length)) % ARROW_COLORS.length] });
      best.cells.forEach(([a, b]) => { occ[a][b] = id; });
      best.ray.forEach(([a, b]) => {
        const k = a + ',' + b;
        if (!rayMap.has(k)) rayMap.set(k, new Set());
        rayMap.get(k).add(id);
      });
      filled += best.cells.length;
    }
    return { rows, cols, arrows };
  }

  function init(level = 1) {
    const g = generate(level);
    return { level, rows: g.rows, cols: g.cols, arrows: g.arrows, lives: LIVES, won: false, over: false, last: null };
  }

  // Index of the first arrow standing in arrow i's way, or -1 when it can leave.
  function blocker(s, i) {
    const map = new Map();
    s.arrows.forEach((a, j) => { if (a.alive && j !== i) a.cells.forEach(([r, c]) => map.set(r + ',' + c, j)); });
    const a = s.arrows[i];
    let [r, c] = a.cells[a.cells.length - 1];
    for (;;) {
      r += a.dir[0]; c += a.dir[1];
      if (r < 0 || r >= s.rows || c < 0 || c >= s.cols) return -1;
      const j = map.get(r + ',' + c);
      if (j !== undefined) return j;
    }
  }

  const valid = (s, i) => !s.won && !s.over && !!s.arrows[i] && s.arrows[i].alive;
  const freeArrows = s => s.arrows.map((_, i) => i).filter(i => s.arrows[i].alive && blocker(s, i) < 0);

  // move = arrow index. Returns a new state; s.last says what happened.
  function apply(s, i) {
    if (!valid(s, i)) return s;
    const n = JSON.parse(JSON.stringify(s)), b = blocker(s, i);
    if (b < 0) {
      n.arrows[i].alive = false;
      n.won = n.arrows.every(a => !a.alive);
      n.last = { arrow: i, ok: true };
    } else {
      n.lives--;
      n.over = n.lives <= 0;
      n.last = { arrow: i, ok: false, blocker: b };
    }
    return n;
  }

  // ---------- UI ----------
  const CSS = `
.ar-wrap{max-width:560px;margin:0 auto;font-family:system-ui,sans-serif}
.ar-bar{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.ar-lv{font-weight:700;font-size:18px}
.ar-hearts{color:#e11d48;font-size:20px;letter-spacing:2px}
.ar-btns{margin-left:auto;display:flex;gap:6px}
.ar-btns button{font:inherit;padding:5px 12px}
.ar-board{position:relative;width:fit-content;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,.18);overflow:hidden}
.ar-board canvas{display:block;touch-action:manipulation}
.ar-ov{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(255,255,255,.9);color:#1f2937;font-size:22px;font-weight:700;text-align:center;cursor:pointer}
.ar-ov.on{display:flex}
.ar-ov button{font:inherit;font-size:16px;padding:8px 18px}
`;

  function injectStyles() {
    if (document.getElementById('ar-style')) return;
    const el = document.createElement('style');
    el.id = 'ar-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  // The part of a polyline between arc lengths a and b.
  function sub(pts, a, b) {
    const out = [];
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], l = Math.hypot(x2 - x1, y2 - y1);
      const s0 = Math.max(a, acc), s1 = Math.min(b, acc + l);
      if (s1 > s0) {
        const t0 = (s0 - acc) / l, t1 = (s1 - acc) / l;
        if (!out.length) out.push([x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0]);
        out.push([x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1]);
      }
      acc += l;
    }
    return out;
  }

  function mount(root) {
    injectStyles();
    let level = Math.max(1, parseInt(store.get('arrows.level'), 10) || 1);
    let s, cell = 40, dpr = 1, raf = 0, hint = null, timer = 0;
    const anims = new Map(); // arrow index -> { type: 'out' | 'shake' | 'flash', t0, dur }

    root.innerHTML =
      '<div class="ar-wrap"><div class="ar-bar"><span class="ar-lv"></span><span class="ar-hearts"></span>' +
      '<span class="ar-btns"><button class="ar-hint">Hint</button><button class="ar-restart">Restart</button></span></div>' +
      '<div class="ar-board"><canvas></canvas><div class="ar-ov"></div></div></div>';
    const $ = q => root.querySelector(q);
    const cv = $('canvas'), ctx = cv.getContext('2d'), ov = $('.ar-ov');

    const px = c => (c + 0.5) * cell, py = r => (r + 0.5) * cell;

    function layout() {
      const wrap = $('.ar-wrap'), host = wrap.parentElement;
      const W = Math.max(0, wrap.clientWidth - 24);
      const barH = $('.ar-bar').getBoundingClientRect().height;
      const hostH = host && host.clientHeight || window.innerHeight || 700;
      const maxH = Math.max(160, Math.min((window.innerHeight || 700) * 0.82, hostH - barH - 24));
      cell = Math.max(8, Math.floor(Math.min(64, W / s.cols, maxH / s.rows)));
      dpr = window.devicePixelRatio || 1;
      cv.width = s.cols * cell * dpr; cv.height = s.rows * cell * dpr;
      cv.style.width = s.cols * cell + 'px'; cv.style.height = s.rows * cell + 'px';
    }

    // Path of an arrow in pixels, its length, and how far it must travel to leave the board.
    function geo(a) {
      const pts = a.cells.map(([r, c]) => [px(c), py(r)]);
      let L = 0;
      for (let k = 0; k < pts.length - 1; k++) L += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      const [r0, c0] = a.cells[a.cells.length - 1], [dr, dc] = a.dir;
      const rem = dr < 0 ? r0 : dr > 0 ? s.rows - 1 - r0 : dc < 0 ? c0 : s.cols - 1 - c0;
      return { pts, L, total: (rem + 1.5) * cell + L };
    }
    const outDur = a => 300 + (geo(a).total / cell) * 32;

    function drawArrow(a, an, i, now) {
      const g = geo(a), [dr, dc] = a.dir;
      let line = g.pts, color = a.color || '#1f2937', ox = 0, oy = 0, w = cell * 0.15;
      if (an && an.type === 'out') {
        const p = Math.min(1, (now - an.t0) / an.dur), e = 1 - Math.pow(1 - p, 3);
        const [hx, hy] = g.pts[g.pts.length - 1];
        const ext = g.pts.concat([[hx + dc * g.total, hy + dr * g.total]]);
        line = sub(ext, e * g.total, e * g.total + g.L);
      } else if (an && an.type === 'shake') {
        const p = (now - an.t0) / an.dur, k = Math.sin(p * 30) * cell * 0.12 * (1 - p);
        ox = dc * k; oy = dr * k; color = '#dc2626';
      } else if (an && an.type === 'flash') color = '#dc2626';
      else if (hint && hint.i === i) {
        color = '#2563eb';
        w = cell * (0.14 + 0.05 * Math.sin((now - hint.t0) / 120));
      }
      if (line.length < 2) return;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      line.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      const [x, y] = line[line.length - 1], h = cell * 0.36, hw = cell * 0.22;
      ctx.beginPath();
      ctx.moveTo(x + dc * h, y + dr * h);
      ctx.lineTo(x - dc * cell * 0.04 + dr * hw, y - dr * cell * 0.04 + dc * hw);
      ctx.lineTo(x - dc * cell * 0.04 - dr * hw, y - dr * cell * 0.04 - dc * hw);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#4a5262';
      for (let r = 0; r < s.rows; r++)
        for (let c = 0; c < s.cols; c++) {
          ctx.beginPath(); ctx.arc(px(c), py(r), Math.max(1.5, cell * 0.075), 0, 6.2832); ctx.fill();
        }
      s.arrows.forEach((a, i) => {
        const an = anims.get(i);
        if (a.alive || (an && an.type === 'out')) drawArrow(a, an, i, now);
      });
    }

    function loop(now) {
      raf = 0;
      draw(now);
      anims.forEach((an, i) => { if (now - an.t0 >= an.dur) anims.delete(i); });
      if (hint && (reducedMotion() || now - hint.t0 > 2600)) hint = null;
      if (anims.size || hint) raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    function hud() {
      $('.ar-lv').textContent = 'Level ' + level;
      $('.ar-hearts').textContent = '\u2665'.repeat(s.lives) + '\u2661'.repeat(LIVES - s.lives);
    }

    function overlay(html, onClick) {
      ov.innerHTML = html;
      ov.classList.add('on');
      ov.onclick = onClick;
    }

    function load(lv) {
      clearTimeout(timer);
      timer = 0;
      level = lv;
      store.set('arrows.level', String(level));
      s = init(level);
      anims.clear(); hint = null;
      ov.classList.remove('on');
      layout(); hud(); draw(performance.now());
    }

    function nextLevel() { load(level + 1); }

    function win() {
      playSound('win');
      overlay('Level ' + level + ' complete!<button>Next level</button>', () => { clearTimeout(timer); nextLevel(); });
      timer = setTimeout(nextLevel, 1600);
    }

    function lose() {
      playSound('loss');
      overlay('Out of lives<button>Try again</button>', () => load(level));
    }

    function tap(i) {
      if (!valid(s, i) || anims.has(i)) return;
      s = apply(s, i);
      const now = performance.now(), l = s.last;
      hint = null;
      const motion = !reducedMotion();
      if (l.ok) {
        const d = motion ? outDur(s.arrows[i]) : 0;
        playSound('move');
        if (motion) anims.set(i, { type: 'out', t0: now, dur: d });
        if (s.won) timer = setTimeout(win, d + 150);
      } else {
        playSound('error');
        if (motion) {
          anims.set(i, { type: 'shake', t0: now, dur: 420 });
          anims.set(l.blocker, { type: 'flash', t0: now, dur: 700 });
        }
        if (s.over) timer = setTimeout(lose, motion ? 700 : 0);
      }
      hud();
      if (motion) kick(); else draw(now);
    }

    cv.addEventListener('click', e => {
      if (s.won || s.over) return;
      const rect = cv.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (e.clientX - rect.left) * cv.clientWidth / rect.width;
      const y = (e.clientY - rect.top) * cv.clientHeight / rect.height;
      let best = -1, bd = cell * 0.55;
      s.arrows.forEach((a, i) => {
        if (!a.alive) return;
        const p = a.cells.map(([r, c]) => [px(c), py(r)]);
        for (let k = 0; k < p.length; k++) {
          const [x1, y1] = p[k], [x2, y2] = p[Math.min(k + 1, p.length - 1)];
          const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
          const d = Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
          if (d < bd) { bd = d; best = i; }
        }
      });
      if (best >= 0) tap(best);
    });

    $('.ar-hint').addEventListener('click', () => {
      const free = freeArrows(s);
      if (!free.length || s.won || s.over) return;
      hint = { i: free[Math.floor(Math.random() * free.length)], t0: performance.now() };
      playSound('menu');
      if (reducedMotion()) { draw(performance.now()); hint = null; } else kick();
    });
    const onResize = () => { if (s) { layout(); draw(performance.now()); } };
    $('.ar-restart').addEventListener('click', () => { playSound('menu'); load(level); });
    window.addEventListener('resize', onResize);

    load(level);
    playSound('start');
    return {
      load,
      getState: () => s,
      dispose() {
        clearTimeout(timer);
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      },
    };
  }

  // ---------- Registration ----------
  const api = {
    id: 'arrows', name: 'Arrows', t: 'Arrows', i: '↗️',
    d: 'Clear the board by sliding arrows off in the direction they point. Plan around blocked paths, use hints wisely, and keep your lives.',
    minPlayers: 1, maxPlayers: 1, max: 1, cat: 'puzzle', tag: 'Slide & clear',
    diff: 'Easy to learn', art: 'art-puzzle', logo: 'arrows.svg', standalone: true,
    generate, init, blocker, freeArrows, valid, apply, mount,
  };

  if (typeof registerGame === 'function') {
    registerGame(api);
  } else if (typeof document !== 'undefined') {
    const go = () => {
      const root = document.getElementById('arrows') || document.body.appendChild(document.createElement('div'));
      mount(root);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }
  if (typeof window !== 'undefined') window.ArrowsGame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
