/* 2048-game.js
   2048 sliding-tile puzzle (solo).
   - Pure engine: init / legalMoves / valid / apply (no DOM, easy to reuse in a host runtime)
   - UI: mount(rootElement) with arrow keys / WASD, swipe, undo, saved game and best score
   Registers with registerGame() if the host defines it, otherwise runs standalone. */
(function () {
  'use strict';

  // ---------- Engine ----------
  const DIRS = ['left', 'right', 'up', 'down'];
  const WIN = 2048;
  const BEST_KEY = 'game2048.best';
  const SAVE_KEY = 'game2048.save';

  // Slide and merge one line toward index 0. Each tile merges at most once per move.
  function slideLine(line) {
    const vals = line.filter(Boolean);
    const out = [];
    let gained = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === vals[i + 1]) {
        out.push(vals[i] * 2);
        gained += vals[i] * 2;
        i++;
      } else out.push(vals[i]);
    }
    while (out.length < line.length) out.push(0);
    return { line: out, gained };
  }

  function slide(grid, dir) {
    const n = grid.length;
    const next = grid.map(r => r.slice());
    const horizontal = dir === 'left' || dir === 'right';
    const reverse = dir === 'right' || dir === 'down';
    let gained = 0;
    for (let i = 0; i < n; i++) {
      const idx = [...Array(n).keys()];
      if (reverse) idx.reverse();
      const line = idx.map(j => (horizontal ? grid[i][j] : grid[j][i]));
      const res = slideLine(line);
      idx.forEach((j, k) => {
        if (horizontal) next[i][j] = res.line[k];
        else next[j][i] = res.line[k];
      });
      gained += res.gained;
    }
    const moved = next.some((row, r) => row.some((v, c) => v !== grid[r][c]));
    return { grid: next, gained, moved };
  }

  // Puts a 2 (90%) or 4 (10%) on a random empty cell. Returns [r, c] or null.
  function spawn(grid) {
    const empty = [];
    grid.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r, c]); }));
    if (!empty.length) return null;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    return [r, c];
  }

  function init(size = 4) {
    const grid = Array.from({ length: size }, () => Array(size).fill(0));
    spawn(grid);
    const spawned = spawn(grid);
    return { size, grid, score: 0, won: false, over: false, spawned };
  }

  const legalMoves = s => (s.over ? [] : DIRS.filter(d => slide(s.grid, d).moved));
  const valid = (s, dir) => !s.over && DIRS.includes(dir) && slide(s.grid, dir).moved;

  // Returns a new state; returns the same state if the move changes nothing.
  function apply(s, dir) {
    if (!valid(s, dir)) return s;
    const m = slide(s.grid, dir);
    const spawned = spawn(m.grid);
    return {
      size: s.size,
      grid: m.grid,
      score: s.score + m.gained,
      won: s.won || m.grid.some(r => r.some(v => v >= WIN)),
      over: DIRS.every(d => !slide(m.grid, d).moved),
      spawned,
    };
  }

  // ---------- Storage (safe when localStorage is unavailable) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  function loadSaved() {
    try {
      const d = JSON.parse(store.get(SAVE_KEY));
      const n = d && d.size;
      if (!d || !Array.isArray(d.grid) || d.grid.length !== n) return null;
      if (!d.grid.every(r => Array.isArray(r) && r.length === n && r.every(v => Number.isInteger(v) && v >= 0))) return null;
      const s = { size: n, grid: d.grid, score: +d.score || 0, won: !!d.won, over: false, spawned: null };
      return legalMoves(s).length ? s : null;
    } catch (e) { return null; }
  }

  // ---------- UI ----------
  const CSS = `
.g48-wrap{--g48-size:min(88vw,58vh,520px);width:min(100%,760px);min-height:100%;margin:0 auto;padding:clamp(16px,4vw,36px);display:flex;flex-direction:column;justify-content:center;color:#f6f7fb;font-family:Inter,system-ui,sans-serif;outline-offset:4px}
.g48-bar{width:min(100%,var(--g48-size));display:flex;align-items:center;gap:10px;margin:0 auto 14px;flex-wrap:wrap}
.g48-title{flex:1;min-width:100px;margin:0;color:#fff;font-size:clamp(36px,8vw,60px);font-weight:900;letter-spacing:-.08em;line-height:1;text-shadow:0 4px 20px #0005}
.g48-box{min-width:72px;padding:6px 13px;display:flex;flex-direction:column;align-items:center;border:1px solid #ffffff15;border-radius:12px;background:linear-gradient(145deg,#283650,#1a2539);box-shadow:0 6px 16px #0002}
.g48-box small{color:#aebbd2;font-size:10px;font-weight:750;letter-spacing:.1em;text-transform:uppercase}
.g48-box b{color:#fff;font-size:20px;font-variant-numeric:tabular-nums}
.g48-btns{width:min(100%,var(--g48-size));display:flex;justify-content:flex-end;gap:8px;margin:0 auto 14px}
.g48-btns button{width:auto;min-width:0;min-height:42px;flex:1 1 0;margin:0;padding:8px 14px;border:1px solid #ffffff25;border-radius:12px;background:#1a2740;color:#f6f7fb;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:transform .15s,background .15s}
#room .g48-btns button{width:auto;min-width:0;min-height:42px;flex:1 1 0;margin:0;padding:8px 14px}
.g48-btns button:hover:not(:disabled){transform:translateY(-1px);background:#263858}
.g48-btns button.g48-new{border:0;background:linear-gradient(135deg,#9b7cf6,#6f63e8);box-shadow:0 5px 16px #765fe044}
.g48-btns button:disabled{opacity:.45;cursor:default}
.g48-msg{width:min(100%,var(--g48-size));min-height:1.5em;margin:0 auto 9px;color:#c5cde0;text-align:center;font-size:14px;font-weight:650}
.g48-board{width:var(--g48-size);max-width:100%;margin:0 auto;display:grid;gap:clamp(7px,2vw,12px);padding:clamp(9px,2vw,14px);border:1px solid #ffffff24;border-radius:22px;background:linear-gradient(145deg,#28344a,#182238);aspect-ratio:1;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 24px 70px #0007,inset 0 1px #ffffff18}
.g48-cell{min-width:0;min-height:0;border:1px solid #ffffff09;border-radius:12px;background:rgba(6,12,24,.34);display:flex;overflow:hidden}
.g48-tile{flex:1;border-radius:11px;display:flex;align-items:center;justify-content:center;font-weight:850;letter-spacing:-.05em;text-shadow:0 1px 1px #0002;box-shadow:inset 0 1px #ffffff45,0 5px 12px #0002}
.g48-wrap button:focus-visible{outline:3px solid #c4b5fd;outline-offset:3px}
@media(max-width:520px){.g48-wrap{--g48-size:min(92vw,56vh);padding:12px 10px 18px}.g48-bar{gap:7px;margin-bottom:12px}.g48-title{font-size:42px}.g48-box{min-width:62px;padding:5px 9px}.g48-box b{font-size:18px}.g48-btns{margin-bottom:10px}.g48-btns button{flex:1;padding:8px 10px}.g48-board{border-radius:16px;gap:7px;padding:9px}.g48-cell{border-radius:9px}.g48-tile{border-radius:8px}}
@media(max-height:620px) and (orientation:landscape){.g48-wrap{--g48-size:min(calc(100dvh - 230px),42vw);padding:8px 16px}.g48-bar{flex-wrap:nowrap;gap:4px;margin-bottom:6px}.g48-title{min-width:0;font-size:30px}.g48-box{min-width:0;padding:4px 6px}.g48-btns{margin-bottom:5px}.g48-btns button{padding:6px 4px;font-size:12px}#room .g48-btns button{padding:6px 4px;font-size:12px}.g48-msg{min-height:1.2em;margin-bottom:4px}.g48-board{height:var(--g48-size);min-height:0}}
@media(prefers-reduced-motion:reduce){.g48-wrap *{transition:none!important;scroll-behavior:auto!important}}
@media(prefers-reduced-motion:no-preference){.g48-tile.pop{animation:g48pop .16s cubic-bezier(.2,.8,.25,1)}}
@keyframes g48pop{0%{transform:scale(.55);filter:brightness(1.35)}75%{transform:scale(1.06)}100%{transform:scale(1);filter:none}}
`;

  function injectStyles() {
    if (document.getElementById('g48-style')) return;
    const el = document.createElement('style');
    el.id = 'g48-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  function tileStyle(v) {
    const palette = {
      2: ['#f5eadc', '#574536'], 4: ['#f2dfbd', '#574536'],
      8: ['#f4b77a', '#fffaf3'], 16: ['#f28d62', '#fffaf3'],
      32: ['#ed6b50', '#fffaf3'], 64: ['#dc4f3d', '#fffaf3'],
      128: ['#e9c85d', '#fffaf3'], 256: ['#e4bc42', '#fffaf3'],
      512: ['#dcae29', '#fffaf3'], 1024: ['#b796ee', '#fff'],
      2048: ['#9b7cf6', '#fff'],
    };
    const [background, color] = palette[v] || ['#596fd2', '#fff'];
    const d = String(v).length;
    const fs = d <= 2 ? 'clamp(22px,8vw,40px)' : d === 3 ? 'clamp(18px,6.5vw,34px)'
      : d === 4 ? 'clamp(15px,5.5vw,28px)' : 'clamp(12px,4.5vw,22px)';
    return 'background:' + background + ';color:' + color + ';font-size:' + fs;
  }

  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
  };

  function mount(root) {
    injectStyles();
    let s = loadSaved() || init();
    let prev = null;
    let best = +store.get(BEST_KEY) || 0;

    root.innerHTML =
      '<div class="g48-wrap" tabindex="0" aria-label="2048 game: use arrow keys or swipe">' +
      '<div class="g48-bar">' +
      '<h1 class="g48-title">2048</h1>' +
      '<div class="g48-box"><small>Score</small><b class="g48-score"></b></div>' +
      '<div class="g48-box"><small>Best</small><b class="g48-best"></b></div>' +
      '</div><div class="g48-btns"><button class="g48-undo">Undo</button>' +
      '<button class="g48-new">New game</button></div>' +
      '<div class="g48-msg" aria-live="polite"></div><div class="g48-board" role="grid" aria-label="2048 tile board"></div></div>';
    const $ = q => root.querySelector(q);
    const wrap = $('.g48-wrap');

    function render() {
      const bd = $('.g48-board');
      bd.style.gridTemplateColumns = 'repeat(' + s.size + ',minmax(0,1fr))';
      bd.style.gridTemplateRows = 'repeat(' + s.size + ',minmax(0,1fr))';
      bd.innerHTML = '';
      s.grid.forEach((row, r) => row.forEach((v, c) => {
        const cell = document.createElement('div');
        cell.className = 'g48-cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', v ? String(v) : 'empty');
        if (v) {
          const t = document.createElement('div');
          t.className = 'g48-tile' + (s.spawned && s.spawned[0] === r && s.spawned[1] === c ? ' pop' : '');
          t.style.cssText = tileStyle(v);
          t.textContent = v;
          cell.appendChild(t);
        }
        bd.appendChild(cell);
      }));
      $('.g48-score').textContent = s.score;
      $('.g48-best').textContent = best;
      $('.g48-undo').disabled = !prev;
      $('.g48-msg').textContent = s.over ? 'Game over: no moves left.'
        : s.won ? 'You made 2048! Keep playing for a higher score.' : '';
    }

    function persist() {
      if (s.score > best) { best = s.score; store.set(BEST_KEY, String(best)); }
      if (s.over) store.del(SAVE_KEY);
      else store.set(SAVE_KEY, JSON.stringify({ size: s.size, grid: s.grid, score: s.score, won: s.won }));
    }

    function go(dir) {
      if (!valid(s, dir)) return;
      prev = s;
      s = apply(s, dir);
      persist();
      render();
    }

    wrap.addEventListener('keydown', e => {
      const dir = KEYS[e.key] || KEYS[e.key.toLowerCase()];
      if (!dir || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      go(dir);
    });

    let t0 = null;
    const board = $('.g48-board');
    root.addEventListener('click', e => e.stopPropagation());
    board.addEventListener('touchstart', e => {
      const t = e.touches[0];
      t0 = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    board.addEventListener('touchend', e => {
      if (!t0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - t0.x, dy = t.clientY - t0.y;
      t0 = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });

    $('.g48-undo').addEventListener('click', () => {
      if (!prev) return;
      s = prev; prev = null;
      persist(); render(); wrap.focus();
    });
    $('.g48-new').addEventListener('click', () => {
      s = init(); prev = null;
      persist(); render(); wrap.focus();
    });

    render();
    wrap.focus({ preventScroll: true });
    return { go, getState: () => s, dispose: () => { root.innerHTML = ''; } };
  }

  // ---------- Registration ----------
  const api = {
    id: '2048',
    name: '2048',
    t: '2048',
    i: '🔢',
    d: 'Slide numbered tiles on a 4×4 board, combine matching numbers, and build the 2048 tile. Your progress is saved on this device.',
    minPlayers: 1,
    maxPlayers: 1,
    cat: 'puzzle',
    tag: 'Number puzzle',
    diff: 'Easy to learn',
    art: 'art-puzzle',
    logo: '2048.svg',
    standalone: true,
    init, legalMoves, valid, apply, mount,
  };

  if (typeof registerGame === 'function') {
    registerGame(api);
  } else if (typeof document !== 'undefined') {
    const go = () => {
      const root = document.getElementById('game2048') ||
        document.body.appendChild(document.createElement('div'));
      mount(root);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }
  if (typeof window !== 'undefined') window.Game2048 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
