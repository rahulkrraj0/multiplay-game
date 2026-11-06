/* sudoku.js - Sudoku with 3 difficulty levels, notes, undo, hints and auto-save.
   Add <script src="sudoku.js"></script> to any page. */
(function (global) {
  'use strict';
  var KEY = 'sudoku-save-v1';
  var LV = { easy: ['Easy', 40], medium: ['Medium', 32], hard: ['Hard', 26] }; // [name, target clues]
  var R = [], C = [], B = [], i;
  for (i = 0; i < 81; i++) { R[i] = (i / 9) | 0; C[i] = i % 9; B[i] = ((R[i] / 3) | 0) * 3 + ((C[i] / 3) | 0); }
  var G = null, root = null, sel = -1, pencil = false, menu = false, busy = false;
  var timer = null, newGameTimer = null, styleNode = null;

  /* ---------- puzzle generation ---------- */
  function shuffle(a) {
    for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)), t = a[k]; a[k] = a[j]; a[j] = t; }
    return a;
  }
  function pop(m) { var n = 0; while (m) { m &= m - 1; n++; } return n; }
  function peer(a, b) { return a !== b && (R[a] === R[b] || C[a] === C[b] || B[a] === B[b]); }

  // Backtracking solver (fewest-candidates cell first). Stops after `limit` solutions.
  function search(g, limit, rnd) {
    var rows = [0, 0, 0, 0, 0, 0, 0, 0, 0], cols = rows.slice(), boxes = rows.slice(), count = 0, sol = null, k, v;
    for (k = 0; k < 81; k++) if (g[k]) { v = 1 << (g[k] - 1); rows[R[k]] |= v; cols[C[k]] |= v; boxes[B[k]] |= v; }
    (function rec() {
      var best = -1, bm = 0, bc = 10, m, n, x;
      for (x = 0; x < 81; x++) if (!g[x]) {
        m = ~(rows[R[x]] | cols[C[x]] | boxes[B[x]]) & 511; n = pop(m);
        if (n < bc) { bc = n; best = x; bm = m; if (n < 2) break; }
      }
      if (best < 0) { count++; if (!sol) sol = g.slice(); return; }
      var bits = [], j;
      for (j = 0; j < 9; j++) if (bm & (1 << j)) bits.push(j);
      if (rnd) shuffle(bits);
      for (j = 0; j < bits.length; j++) {
        var b = 1 << bits[j];
        g[best] = bits[j] + 1; rows[R[best]] ^= b; cols[C[best]] ^= b; boxes[B[best]] ^= b;
        rec();
        g[best] = 0; rows[R[best]] ^= b; cols[C[best]] ^= b; boxes[B[best]] ^= b;
        if (count >= limit) return;
      }
    })();
    return { count: count, sol: sol };
  }
  function generate(level) {
    var sol = search(new Array(81).fill(0), 1, true).sol, p = sol.slice(), clues = 81, target = LV[level][1];
    var order = shuffle(Array.apply(null, Array(81)).map(function (_, k) { return k; }));
    for (var j = 0; j < 81 && clues > target; j++) {
      var k = order[j], keep = p[k];
      p[k] = 0;
      if (search(p.slice(), 2, false).count !== 1) p[k] = keep; else clues--; // keep the puzzle uniquely solvable
    }
    return { puz: p, sol: sol };
  }

  /* ---------- game state ---------- */
  function save() {
    try { if (G) localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.puz && s.puz.length === 81 && s.sol && s.cur && s.notes) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function newGame(level) {
    busy = true; menu = false; render();
    clearTimeout(newGameTimer);
    newGameTimer = setTimeout(function () {
      newGameTimer = null;
      var p = generate(level);
      G = { level: level, puz: p.puz, sol: p.sol, cur: p.puz.slice(), notes: new Array(81).fill(0), hist: [], secs: 0, miss: 0, hints: 0, done: false };
      sel = -1; pencil = false; busy = false; save(); render();
    }, 30);
  }
  function snap() { G.hist.push({ c: G.cur.slice(), n: G.notes.slice() }); if (G.hist.length > 300) G.hist.shift(); }
  function clearPeers(k, v) { for (var x = 0; x < 81; x++) if (peer(k, x)) G.notes[x] &= ~(1 << (v - 1)); }
  function after() {
    G.done = G.cur.every(function (v, k) { return v === G.sol[k]; });
    save(); render();
  }
  function put(v) {
    if (!G || sel < 0 || G.done || G.puz[sel]) return;
    if (pencil) { if (G.cur[sel]) return; snap(); G.notes[sel] ^= 1 << (v - 1); }
    else {
      snap();
      if (G.cur[sel] === v) G.cur[sel] = 0;
      else { G.cur[sel] = v; G.notes[sel] = 0; clearPeers(sel, v); if (v !== G.sol[sel]) G.miss++; }
    }
    after();
  }
  function erase() {
    if (!G || sel < 0 || G.done || G.puz[sel] || (!G.cur[sel] && !G.notes[sel])) return;
    snap(); G.cur[sel] = 0; G.notes[sel] = 0; after();
  }
  function undo() {
    if (!G || G.done || !G.hist.length) return;
    var h = G.hist.pop(); G.cur = h.c; G.notes = h.n; after();
  }
  function hint() {
    if (!G || G.done) return;
    var t = sel >= 0 && !G.puz[sel] && G.cur[sel] !== G.sol[sel] ? sel : -1;
    if (t < 0) {
      var open = []; for (var k = 0; k < 81; k++) if (G.cur[k] !== G.sol[k]) open.push(k);
      if (!open.length) return;
      t = open[Math.floor(Math.random() * open.length)];
    }
    snap(); G.cur[t] = G.sol[t]; G.notes[t] = 0; clearPeers(t, G.sol[t]); sel = t; G.hints++; after();
  }

  /* ---------- UI ---------- */
  function fmt(s) { return ('0' + ((s / 60) | 0)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }
  function render() {
    if (!root) return;
    var had = root.contains(document.activeElement), h = '';
    if (G) {
      var sv = sel >= 0 ? G.cur[sel] : 0, left = {}, v, k;
      for (v = 1; v <= 9; v++) left[v] = 9;
      G.cur.forEach(function (x, j) { if (x && x === G.sol[j]) left[x]--; });
      h += '<div class="bar"><b class="logo">Sudoku</b><button class="btn" data-a="new">New game</button></div><div class="main"><div class="board" role="grid">';
      for (k = 0; k < 81; k++) {
        var cl = 'c' + (C[k] % 3 === 2 && C[k] < 8 ? ' br' : '') + (R[k] % 3 === 2 && R[k] < 8 ? ' bb' : '') +
          (G.puz[k] ? '' : ' u') + (G.cur[k] && G.cur[k] !== G.sol[k] ? ' w' : '');
        if (sel >= 0) {
          if (k === sel) cl += ' s';
          else if (sv && G.cur[k] === sv) cl += ' v';
          else if (peer(sel, k)) cl += ' p';
        }
        var inner = '';
        if (G.cur[k]) inner = G.cur[k];
        else if (G.notes[k]) {
          inner = '<span class="nt">';
          for (v = 1; v <= 9; v++) inner += '<i>' + (G.notes[k] & (1 << (v - 1)) ? v : '') + '</i>';
          inner += '</span>';
        }
        h += '<button class="' + cl + '" data-i="' + k + '" aria-label="Row ' + (R[k] + 1) + ', column ' + (C[k] + 1) + ', ' +
          (G.cur[k] ? G.cur[k] + (G.puz[k] ? ', given' : '') : 'empty') + '">' + inner + '</button>';
      }
      h += '</div><div class="panel"><div class="info"><span>' + LV[G.level][0] + '</span><span class="tm">' + fmt(G.secs) +
        '</span><span>Mistakes ' + G.miss + '</span></div><div class="tools">' +
        '<button class="t" data-a="undo">Undo</button><button class="t" data-a="erase">Erase</button>' +
        '<button class="t" data-a="notes" aria-pressed="' + pencil + '">Notes</button><button class="t" data-a="hint">Hint</button></div><div class="pad">';
      for (v = 1; v <= 9; v++) h += '<button class="n" data-a="num" data-v="' + v + '"' + (left[v] <= 0 ? ' disabled' : '') + '>' + v + '<small>' + Math.max(left[v], 0) + ' left</small></button>';
      h += '</div></div></div>';
    }
    if (busy) h += '<div class="ovl"><p>Making a puzzle\u2026</p></div>';
    else if (menu || !G) {
      h += '<div class="ovl"><h1>Sudoku</h1><p>Fill every row, column and 3\u00D73 box with the digits 1 to 9.</p><div class="row">' +
        Object.keys(LV).map(function (l) { return '<button class="btn" data-a="level" data-v="' + l + '">' + LV[l][0] + '</button>'; }).join('') +
        '</div>' + (G && !G.done ? '<button class="btn alt" data-a="cancel">Back to game</button>' : '') + '</div>';
    } else if (G.done) {
      h += '<div class="ovl"><h1>Solved!</h1><p>' + LV[G.level][0] + ' in ' + fmt(G.secs) + '. ' + G.miss + (G.miss === 1 ? ' mistake' : ' mistakes') + ', ' +
        G.hints + (G.hints === 1 ? ' hint' : ' hints') + '.</p><button class="btn" data-a="new">New game</button></div>';
    }
    root.innerHTML = h;
    if (had && sel >= 0) { var el = root.querySelector('[data-i="' + sel + '"]'); if (el) el.focus({ preventScroll: true }); }
  }
  function onClick(e) {
    var t = e.target.closest('[data-i],[data-a]'); if (!t || busy) return;
    if (t.hasAttribute('data-i')) { sel = +t.getAttribute('data-i'); return render(); }
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v');
    if (a === 'level') newGame(v);
    else if (a === 'new') { menu = true; render(); }
    else if (a === 'cancel') { menu = false; render(); }
    else if (a === 'num') put(+v);
    else if (a === 'erase') erase();
    else if (a === 'undo') undo();
    else if (a === 'hint') hint();
    else if (a === 'notes') { pencil = !pencil; render(); }
  }
  function onMountClick(e) { e.stopPropagation(); onClick(e); }
  function onKey(e) {
    if (!G || menu || busy || G.done || e.altKey || e.metaKey) return;
    var k = e.key;
    if ((e.ctrlKey && k.toLowerCase() === 'z')) { e.preventDefault(); return undo(); }
    if (e.ctrlKey) return;
    if (/^[1-9]$/.test(k)) put(+k);
    else if (k === 'Backspace' || k === 'Delete' || k === '0') erase();
    else if (k.toLowerCase() === 'n') { pencil = !pencil; render(); }
    else if (k.indexOf('Arrow') === 0) {
      e.preventDefault();
      if (sel < 0) sel = 0;
      else {
        var r = R[sel], c = C[sel];
        if (k === 'ArrowUp') r = (r + 8) % 9; else if (k === 'ArrowDown') r = (r + 1) % 9;
        else if (k === 'ArrowLeft') c = (c + 8) % 9; else c = (c + 1) % 9;
        sel = r * 9 + c;
      }
      render();
    }
  }

  var CSS = '.sdk{position:absolute;inset:0;display:flex;flex-direction:column;overflow:auto;user-select:none;font-family:Inter,"Avenir Next",system-ui,sans-serif;' +
    '--bg:#0b1020;--surface:#141d33;--surface2:#1a2742;--ink:#f3f6ff;--line:#334363;--pe:#1e3150;--sv:#273f68;--sel:#513f19;--user:#a9c5ff;--bad:#ff858b;--mute:#9baac5;--accent:#a78bfa;--s:min(94vw,54vh);' +
    'background:radial-gradient(ellipse at 50% -18%,#34356b 0,transparent 50%),linear-gradient(160deg,#111a30,#090e1b 80%);color:var(--ink);padding:clamp(8px,2vh,20px)}' +
    '.sdk *{box-sizing:border-box}.sdk .bar{width:min(100%,1050px);display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 2px 14px;margin:0 auto;flex:none}' +
    '.sdk .logo{font-size:clamp(21px,3vw,30px);font-weight:850;letter-spacing:-.04em;color:#fff}.sdk .bar .btn{width:auto;min-width:118px}' +
    '.sdk .main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(14px,2.4vh,24px);padding:0 3vw 16px}' +
    '.sdk .board{display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(9,1fr);width:var(--s);height:var(--s);border:2px solid #7186aa;border-radius:12px;overflow:hidden;background:#111a2b;flex:none;box-shadow:0 18px 50px #0007,0 0 0 5px #ffffff08}' +
    '.sdk .c{position:relative;border:0;border-right:1px solid #34445f;border-bottom:1px solid #34445f;background:#131e32;color:var(--ink);font:inherit;font-size:calc(var(--s)/9*.56);font-weight:780;padding:0;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s,color .12s}' +
    '.sdk .c.br{border-right:2px solid #7588a8}.sdk .c.bb{border-bottom:2px solid #7588a8}.sdk .c:nth-child(9n){border-right:0}.sdk .c:nth-child(n+73){border-bottom:0}' +
    '.sdk .c.p{background:#1b2b45}.sdk .c.v{background:#293e60;color:#dbe7ff}.sdk .c.s{z-index:1;background:#5a461b;color:#ffe7a2;box-shadow:inset 0 0 0 2px #f4c95d}.sdk .c.u{color:#b6ceff;font-weight:650}.sdk .c.w{color:var(--bad);background:#482435}' +
    '.sdk .nt{display:grid;grid-template-columns:repeat(3,1fr);width:100%;height:100%;font-size:calc(var(--s)/9*.22);font-weight:600;color:var(--mute);line-height:1}' +
    '.sdk .nt i{font-style:normal;display:flex;align-items:center;justify-content:center}' +
    '.sdk .panel{display:flex;flex-direction:column;gap:12px;width:var(--s);padding:clamp(12px,2vw,18px);border:1px solid #ffffff12;border-radius:18px;background:linear-gradient(145deg,#17223a,#10192b);box-shadow:0 12px 32px #0003}' +
    '.sdk .info{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--mute)}.sdk .info span{padding:5px 9px;border:1px solid #ffffff12;border-radius:999px;background:#0e1728}.sdk .info .tm{color:#e4d7ff;font-variant-numeric:tabular-nums}' +
    '.sdk .tools{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}' +
    '.sdk .t{font:inherit;font-weight:700;font-size:13px;padding:10px 4px;border-radius:12px;border:1px solid #ffffff20;background:#1a2740;color:var(--ink);cursor:pointer;transition:background .15s,transform .15s}' +
    '.sdk .t[aria-pressed=true]{background:#4b3b76;color:#fff;border-color:#a78bfa}.sdk .pad{display:grid;grid-template-columns:repeat(9,1fr);gap:6px}' +
    '.sdk .n{font:inherit;font-weight:800;font-size:calc(var(--s)/9*.5);padding:7px 0 5px;border-radius:10px;border:1px solid #ffffff12;background:linear-gradient(150deg,#273857,#1a2942);color:#f4f6ff;cursor:pointer;display:flex;flex-direction:column;align-items:center;line-height:1.1;transition:transform .15s,background .15s}' +
    '.sdk .n small{font-size:9px;font-weight:600;opacity:.62}.sdk .n:disabled{opacity:.25;cursor:default}' +
    '.sdk .btn{font:inherit;font-weight:800;padding:.65em 1.15em;border:0;border-radius:12px;background:linear-gradient(135deg,#a78bfa,#7664e8);color:#fff;cursor:pointer;box-shadow:0 5px 14px #6952d044}.sdk .btn.alt{background:transparent;color:var(--ink);border:1px solid #ffffff30;box-shadow:none}' +
    '.sdk .ovl{position:absolute;inset:0;z-index:5;background:#090e1bdc;backdrop-filter:blur(12px);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:20px}' +
    '.sdk .ovl h1{margin:0;font-size:clamp(42px,10vw,76px);letter-spacing:-.06em;background:linear-gradient(100deg,#fff,#cfc0ff);color:transparent;background-clip:text}.sdk .ovl p{margin:0;max-width:38ch;color:#bac6dd;line-height:1.55}.sdk .ovl .btn{background:linear-gradient(135deg,#a78bfa,#7664e8);color:#fff}.sdk .ovl .btn.alt{background:transparent;color:#fff;border-color:#ffffff55}' +
    '.sdk .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.sdk .row .btn{min-width:108px}' +
    '.sdk button:focus-visible{outline:3px solid #c4b5fd;outline-offset:2px}.sdk button:disabled{cursor:default}' +
    '#room .sdk button{width:auto;margin:0}#room .sdk .board button.c{width:100%;height:100%;min-width:0;min-height:0;padding:0;border:0;border-right:1px solid #34445f;border-bottom:1px solid #34445f;border-radius:0;background:#131e32;color:var(--ink);font-size:calc(var(--s)/9*.56);box-shadow:none}' +
    '#room .sdk .board button.c.br{border-right:2px solid #7588a8}#room .sdk .board button.c.bb{border-bottom:2px solid #7588a8}#room .sdk .board button.c.p{background:#1b2b45}#room .sdk .board button.c.v{background:#293e60;color:#dbe7ff}#room .sdk .board button.c.s{background:#5a461b;color:#ffe7a2;box-shadow:inset 0 0 0 2px #f4c95d}#room .sdk .board button.c.u{color:#b6ceff}#room .sdk .board button.c.w{color:var(--bad);background:#482435}' +
    '#room .sdk .tools button.t{width:auto;margin:0;padding:10px 4px;border:1px solid #ffffff20;border-radius:12px;background:#1a2740;color:var(--ink);font-size:13px}#room .sdk .tools button.t[aria-pressed=true]{background:#4b3b76;color:#fff;border-color:#a78bfa}' +
    '#room .sdk .pad button.n{width:auto;margin:0;padding:7px 0 5px;border:1px solid #ffffff12;border-radius:10px;background:linear-gradient(150deg,#273857,#1a2942);color:#f4f6ff;font-size:calc(var(--s)/9*.5)}' +
    '#room .sdk .bar .btn,#room .sdk .ovl .btn{padding:.65em 1.15em;border-radius:12px}.sdk .main{min-width:0}' +
    '@media (min-aspect-ratio:1/1){.sdk{--s:min(76vh,49vw)}.sdk .main{flex-direction:row;align-items:center;justify-content:center;gap:clamp(20px,4vw,56px)}' +
    '.sdk .panel{width:min(34vw,360px)}.sdk .pad{grid-template-columns:repeat(3,1fr)}.sdk .n{font-size:22px}}' +
    '@media (max-width:520px){.sdk{--s:min(94vw,48vh);padding:8px}.sdk .bar{padding:4px 2px 10px}.sdk .bar .btn{min-width:96px;font-size:13px}.sdk .main{gap:12px}.sdk .panel{gap:9px;padding:11px}.sdk .tools{gap:5px}.sdk .t{font-size:12px;padding:9px 2px}.sdk .pad{gap:4px}.sdk .n small{font-size:8px}.sdk .board{border-radius:8px}}' +
    '@media (max-height:520px) and (orientation:landscape){#room .sdk{--s:min(calc(100dvh - 164px),49vw);padding:4px}#room .sdk .bar{padding:0 2px 6px}#room .sdk .main{gap:clamp(12px,2vw,24px);padding-bottom:0}#room .sdk .panel{gap:6px;padding:8px}#room .sdk .pad{gap:4px}#room .sdk .n{font-size:clamp(16px,4.2vh,20px);padding:3px 0 2px}#room .sdk .t{padding:6px 3px}}' +
    '@media (prefers-reduced-motion:reduce){.sdk *{transition:none!important;scroll-behavior:auto!important}}';

  function mount(container) {
    if (root || typeof document === 'undefined') return unmount;
    styleNode = document.getElementById('sudoku-game-style');
    if (!styleNode) { styleNode = document.createElement('style'); styleNode.id = 'sudoku-game-style'; styleNode.textContent = CSS; document.head.appendChild(styleNode); }
    root = document.createElement('div'); root.className = 'sdk'; (container || document.body).appendChild(root);
    root.addEventListener('click', onMountClick); document.addEventListener('keydown', onKey);
    G = load(); if (G && G.done) G = null; // resume the saved game, if there is one
    timer = setInterval(function () {
      if (!G || G.done || menu || busy || document.hidden) return;
      G.secs++; var t = root.querySelector('.tm'); if (t) t.textContent = fmt(G.secs);
      if (G.secs % 5 === 0) save();
    }, 1000);
    render();
    return unmount;
  }

  function unmount() {
    if (root) { save(); root.removeEventListener('click', onMountClick); document.removeEventListener('keydown', onKey); root.remove(); root = null; }
    clearInterval(timer); timer = null; clearTimeout(newGameTimer); newGameTimer = null; busy = false;
    if (styleNode) { styleNode.remove(); styleNode = null; }
  }

  var api = {
    id: 'sudoku', name: 'Sudoku', t: 'Sudoku', i: '🔢',
    d: 'Fill every row, column, and 3×3 box with the numbers 1–9. Choose a difficulty, add notes, undo moves, or ask for a hint.',
    minPlayers: 1, maxPlayers: 1, cat: 'puzzle', tag: 'Logic puzzle', diff: 'Easy to hard',
    art: 'art-puzzle', logo: 'sudoku.svg', standalone: true,
    mount: mount, unmount: unmount, newGame: newGame, generate: generate,
    solve: function (g) { return search(g.slice(), 1, false).sol; },
    count: function (g) { return search(g.slice(), 2, false).count; }
  };
  global.Sudoku = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof registerGame === 'function') registerGame(api);
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
