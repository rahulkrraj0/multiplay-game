/* checkers-game.js
   Checkers (8x8): American or Indian rules, 2 players or play against the computer.
   - Pure engine: init / legalMoves / valid / apply (no DOM, easy to reuse in a host runtime)
   - Computer opponent: minimax with alpha-beta pruning
   - UI: mount(rootElement)
   Registers with registerGame() if the host defines it, otherwise runs standalone. */
(function () {
  'use strict';

  // ---------- Engine ----------
  // Cells: null | 'r' | 'R' | 'b' | 'B' (uppercase = king).
  // Red starts at the bottom and moves first. American rules require captures;
  // Indian rules allow quiet moves when a capture is available.
  const N = 8;
  const owner = p => (p ? p.toLowerCase() : null);
  const isKing = p => p === 'R' || p === 'B';
  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const other = t => (t === 'r' ? 'b' : 'r');
  const DRAW_AFTER = 80; // plies with no capture and no man move
  let drawnRoomMoveSeq = 0;

  function init(previousState) {
    const firstTurn = previousState
      ? other(previousState.firstTurn === 'b' ? 'b' : 'r')
      : 'r';
    const board = Array.from({ length: N }, () => Array(N).fill(null));
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        if ((r + c) % 2 === 1) {
          if (r < 3) board[r][c] = 'b';
          else if (r > 4) board[r][c] = 'r';
        }
    return { board, turn: 'r', firstTurn, chain: null, winner: null, quiet: 0, variant: null };
  }

  function dirs(p) {
    if (isKing(p)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    return owner(p) === 'r' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  }

  function pieceMoves(s, r, c) {
    const p = s.board[r][c];
    const steps = [], jumps = [];
    for (const [dr, dc] of dirs(p)) {
      const r1 = r + dr, c1 = c + dc;
      if (!inside(r1, c1)) continue;
      const t = s.board[r1][c1];
      if (!t) steps.push({ from: [r, c], to: [r1, c1], capture: null });
      else if (owner(t) !== owner(p)) {
        const r2 = r1 + dr, c2 = c1 + dc;
        if (inside(r2, c2) && !s.board[r2][c2])
          jumps.push({ from: [r, c], to: [r2, c2], capture: [r1, c1] });
      }
    }
    return { steps, jumps };
  }

  function legalMoves(s) {
    if (s.winner || !s.variant) return [];
    if (s.chain) return pieceMoves(s, s.chain[0], s.chain[1]).jumps;
    const steps = [], jumps = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        if (owner(s.board[r][c]) === s.turn) {
          const m = pieceMoves(s, r, c);
          steps.push(...m.steps);
          jumps.push(...m.jumps);
        }
    return s.variant === 'american' && jumps.length ? jumps : jumps.concat(steps);
  }

  function findMove(s, m) {
    if (!m || !Array.isArray(m.from) || !Array.isArray(m.to)) return null;
    return legalMoves(s).find(x => same(x.from, m.from) && same(x.to, m.to)) || null;
  }

  const valid = (s, m) => !s.variant
    ? !!m && (m.variant === 'american' || m.variant === 'indian')
    : !!findMove(s, m);

  // Returns a new state; returns the same state if the move is illegal.
  function apply(s, m) {
    if (!s.variant) return valid(s, m) ? { ...s, variant: m.variant, turn: s.firstTurn } : s;
    const move = findMove(s, m);
    if (!move) return s;
    const board = s.board.map(row => row.slice());
    const [fr, fc] = move.from, [tr, tc] = move.to;
    let p = board[fr][fc];
    const wasKing = isKing(p);
    board[fr][fc] = null;
    if (move.capture) board[move.capture[0]][move.capture[1]] = null;

    let crowned = false;
    if (!wasKing && ((p === 'r' && tr === 0) || (p === 'b' && tr === N - 1))) {
      p = p.toUpperCase();
      crowned = true;
    }
    board[tr][tc] = p;

    const next = {
      board,
      variant: s.variant,
      turn: s.turn,
      firstTurn: s.firstTurn,
      chain: null,
      winner: null,
      quiet: move.capture || !wasKing ? 0 : s.quiet + 1,
      moveSeq: (s.moveSeq || 0) + 1,
      lastMove: {
        from: move.from.slice(),
        to: move.to.slice(),
        capture: move.capture && move.capture.slice(),
        kinged: crowned,
        seq: (s.moveSeq || 0) + 1,
      },
    };

    if (move.capture && !crowned && pieceMoves(next, tr, tc).jumps.length) {
      next.chain = [tr, tc]; // same player keeps jumping
      return next;
    }
    next.turn = other(s.turn);
    if (legalMoves(next).length === 0) next.winner = s.turn;
    else if (next.quiet >= DRAW_AFTER) next.winner = 'draw';
    return next;
  }

  // ---------- Computer opponent ----------
  function evaluate(s, me) {
    let v = 0;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const p = s.board[r][c];
        if (!p) continue;
        let x = isKing(p) ? 5 : 3;
        if (!isKing(p)) x += (owner(p) === 'r' ? 7 - r : r) * 0.1; // reward advancing
        v += owner(p) === me ? x : -x;
      }
    return v;
  }

  function search(s, depth, alpha, beta, me) {
    if (s.winner) {
      if (s.winner === 'draw') return 0;
      return s.winner === me ? 1000 + depth : -1000 - depth;
    }
    if (depth === 0) return evaluate(s, me);
    const maximizing = s.turn === me; // a jump chain keeps the same side to move
    let best = maximizing ? -Infinity : Infinity;
    for (const m of legalMoves(s)) {
      const v = search(apply(s, m), depth - 1, alpha, beta, me);
      if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
      else { best = Math.min(best, v); beta = Math.min(beta, v); }
      if (beta <= alpha) break;
    }
    return best;
  }

  function bestMove(s, depth = 5) {
    const me = s.turn;
    const moves = legalMoves(s).sort(() => Math.random() - 0.5); // vary equal moves
    let best = null, bestV = -Infinity;
    for (const m of moves) {
      const v = search(apply(s, m), depth - 1, -Infinity, Infinity, me);
      if (v > bestV) { bestV = v; best = m; }
    }
    return best;
  }

  // ---------- UI ----------
  const CSS = `
.ck-wrap{width:min(100%,680px);margin:0 auto;padding:clamp(8px,2vw,18px);font-family:system-ui,sans-serif}
.ck-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:clamp(10px,2vw,18px);flex-wrap:wrap}
.ck-status{font-size:clamp(14px,2.4vw,18px);font-weight:750;letter-spacing:.01em;color:#f5e5c4}
.ck-bar select,.ck-bar button{font:inherit;padding:8px 12px;border:1px solid #ffffff27;border-radius:10px;background:#17213a;color:#fff;cursor:pointer}
.ck-variant{max-width:520px;margin:clamp(20px,7vh,64px) auto;padding:clamp(18px,4vw,30px);border:1px solid #e4b86c66;border-radius:16px;background:linear-gradient(145deg,#202a3a,#121a28);box-shadow:0 16px 38px #0006;text-align:center;color:#fff}
.ck-variant h2{margin:0 0 8px;color:#f5e5c4;font-size:clamp(20px,4vw,28px)}
.ck-variant p{margin:0 0 18px;color:#d4d8df;line-height:1.5}
.ck-variant-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.ck-variant-options button{min-height:84px;padding:12px;border:1px solid #e4b86c66;border-radius:12px;background:linear-gradient(145deg,#394a3b,#1d2b24);color:#fff;text-align:left;cursor:pointer}
.ck-variant-options button:hover,.ck-variant-options button:focus-visible{border-color:#f5d789;background:linear-gradient(145deg,#4c614a,#293b2e)}
.ck-variant-options b,.ck-variant-options small{display:block}
.ck-variant-options small{margin-top:5px;color:#e3ddcf;line-height:1.35}
#room .ck-variant-options button{width:100%;margin:0}
@media(max-width:420px){.ck-variant-options{grid-template-columns:1fr}}
.ck-board{--ck-light:repeating-linear-gradient(2deg,transparent 0 5px,#7b4e2520 6px,#fff0 8px),linear-gradient(135deg,#e6c084,#c99650 75%,#d9aa67);--ck-dark:repeating-linear-gradient(-2deg,transparent 0 6px,#5933132b 7px,#fff0 9px),linear-gradient(135deg,#c0843c,#98591f 78%,#b47431);display:grid;grid-template-columns:repeat(8,1fr);width:100%;aspect-ratio:1;border:clamp(5px,1vw,10px) ridge #8b5a27;border-radius:5px;overflow:hidden;user-select:none;-webkit-user-select:none;box-shadow:0 18px 42px #0007,inset 0 0 0 2px #e4b86c;background:#7a4a20}
#room .ck-board .ck-sq{display:flex;align-items:center;justify-content:center;position:relative;width:100%;height:100%;margin:0;padding:0;border:0;border-radius:0;font:inherit;isolation:isolate;overflow:visible}
.ck-sq.l{background-color:#d6a86a;background-image:var(--ck-light)}
.ck-sq.d{background-color:#a96d2e;background-image:var(--ck-dark)}
#room .ck-sq.l{background-color:#d6a86a;background-image:var(--ck-light)}
#room .ck-sq.d{background-color:#a96d2e;background-image:var(--ck-dark)}
.ck-sq::before{content:"";position:absolute;inset:0;z-index:0;background:linear-gradient(135deg,#fff1,transparent 55%,#5a32151c);pointer-events:none}
.ck-sq.can::after{content:"";position:absolute;inset:5%;border:2px solid #fff9;border-radius:5px;box-shadow:inset 0 0 0 1px #432b1e66,0 0 10px #fff5;pointer-events:none}
.ck-sq.sel{background-image:linear-gradient(#fff2,#fff2),var(--ck-light)}
#room .ck-sq.sel{background-image:linear-gradient(#fff2,#fff2),var(--ck-light)}
.ck-sq.tgt{box-shadow:inset 0 0 0 3px #f7e6bd}
.ck-sq.tgt::after{content:"";position:absolute;width:24%;height:24%;border-radius:50%;background:radial-gradient(circle,#fff6d8 0 28%,#4fa56a 36% 100%);box-shadow:0 0 13px #51d68e;pointer-events:none;animation:ck-target-pulse 1.15s ease-in-out infinite alternate}
.ck-pc{position:relative;z-index:1;width:78%;height:78%;border:2px solid #351e14;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#ffe08a;font-size:clamp(14px,5.2vw,38px);font-weight:900;line-height:1;text-shadow:0 2px 3px #260d0a;box-shadow:0 5px 7px #24140899,inset 0 3px 4px #fff8,inset 0 -7px 9px #0008;transition:filter .18s,box-shadow .18s}
.ck-pc::before{content:"";position:absolute;inset:9%;border:2px solid #fff3;border-radius:50%;box-shadow:inset 0 2px 3px #0008,0 1px 2px #fff4;pointer-events:none}
.ck-pc::after{content:"";position:absolute;inset:20%;border-radius:50%;background:radial-gradient(circle at 34% 26%,#fff5,transparent 38%);pointer-events:none}
.ck-pc.r{background:radial-gradient(circle at 34% 23%,#ff8170 0,#e3311d 34%,#b51008 68%,#6f100a 100%)}
.ck-pc.b{background:radial-gradient(circle at 34% 23%,#74777a 0,#3e4144 36%,#191b1d 72%,#08090a 100%)}
.ck-pc.can{filter:brightness(1.08);box-shadow:0 0 0 2px #fff,0 0 14px #fff8,0 6px 9px #24140899,inset 0 3px 4px #fff8,inset 0 -7px 9px #0008}
.ck-pc.moved{animation:ck-piece-move .34s cubic-bezier(.2,.8,.25,1) both}
.ck-pc.crowned{animation:ck-crown .55s cubic-bezier(.2,1.35,.35,1) both}
.ck-pc.king{color:#ffe28a}
.ck-sq.capture-at::before{animation:ck-capture .38s ease-out both}
@keyframes ck-piece-move{0%{transform:translate(var(--move-x),var(--move-y)) scale(.84);filter:brightness(1.35)}70%{transform:translate(0,0) scale(1.08)}100%{transform:translate(0,0) scale(1);filter:none}}
@keyframes ck-crown{0%{transform:scale(.6) rotate(-18deg)}65%{transform:scale(1.28) rotate(8deg)}100%{transform:scale(1) rotate(0)}}
@keyframes ck-target-pulse{to{transform:scale(.78);opacity:.72}}
@keyframes ck-capture{0%{background:#ffdf8a;box-shadow:inset 0 0 0 5px #fff}100%{background:transparent;box-shadow:inset 0 0 0 0 transparent}}
@media(prefers-reduced-motion:reduce){.ck-pc,.ck-sq.tgt::after{transition:none;animation:none!important}}
`;

  function injectStyles() {
    if (document.getElementById('ck-style')) return;
    const el = document.createElement('style');
    el.id = 'ck-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  function mount(root, opts = {}) {
    injectStyles();
    let mode = opts.mode || 'cpu'; // 'cpu' (you are red) or 'two'
    let s = init(), sel = null, gen = 0, drawnMoveSeq = 0;

    root.innerHTML =
      '<div class="ck-wrap"><div class="ck-bar"><span class="ck-status"></span><span>' +
      '<select class="ck-mode"><option value="cpu">vs Computer</option><option value="two">2 Players</option></select> ' +
      '<button class="ck-new">New game</button></span></div><div class="ck-variant"></div><div class="ck-board"></div></div>';
    const $ = q => root.querySelector(q);
    $('.ck-mode').value = mode;

    const cpuTurn = () => mode === 'cpu' && s.turn === 'b' && !s.winner;
    const name = t => (t === 'r' ? 'Red' : 'Black');

    function statusText() {
      if (!s.variant) return 'Choose a ruleset';
      if (s.winner === 'draw') return 'Draw';
      if (s.winner) return name(s.winner) + ' wins!';
      if (cpuTurn()) return 'Computer is thinking\u2026';
      if (s.chain) return name(s.turn) + ': keep jumping';
      return name(s.turn) + "'s turn";
    }

    function render() {
      const setup = $('.ck-variant');
      const bd = $('.ck-board');
      if (!s.variant) {
        setup.hidden = false;
        setup.innerHTML = variantHtml();
        bd.hidden = true;
        $('.ck-status').textContent = statusText();
        return;
      }
      setup.hidden = true;
      setup.innerHTML = '';
      bd.hidden = false;
      const moves = legalMoves(s);
      const movable = new Set(moves.map(m => m.from.join()));
      const targets = sel ? moves.filter(m => same(m.from, sel)).map(m => m.to.join()) : [];
      const lastMove = s.lastMove && s.lastMove.seq > drawnMoveSeq ? s.lastMove : null;
      if (lastMove) drawnMoveSeq = lastMove.seq;
      bd.innerHTML = '';
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const sq = document.createElement('div');
          sq.className = 'ck-sq ' + ((r + c) % 2 ? 'd' : 'l');
          if (movable.has(r + ',' + c) && !cpuTurn()) sq.classList.add('can');
          if (lastMove && lastMove.capture && lastMove.capture[0] === r && lastMove.capture[1] === c) sq.classList.add('capture-at');
          sq.dataset.r = r; sq.dataset.c = c;
          if (sel && sel[0] === r && sel[1] === c) sq.classList.add('sel');
          if (targets.includes(r + ',' + c)) sq.classList.add('tgt');
          const p = s.board[r][c];
          if (p) {
            const pc = document.createElement('div');
            pc.className = 'ck-pc ' + owner(p) + (isKing(p) ? ' king' : '');
            if (lastMove && lastMove.to[0] === r && lastMove.to[1] === c) {
              if (lastMove.kinged) pc.classList.add('crowned');
              else {
                pc.classList.add('moved');
                pc.style.setProperty('--move-x', ((lastMove.from[1] - c) * 128) + '%');
                pc.style.setProperty('--move-y', ((lastMove.from[0] - r) * 128) + '%');
              }
            }
            if (isKing(p)) pc.textContent = '\u265B';
            if (!cpuTurn() && movable.has(r + ',' + c)) pc.classList.add('can');
            sq.appendChild(pc);
          }
          bd.appendChild(sq);
        }
      $('.ck-status').textContent = statusText();
    }

    function play(m) {
      s = apply(s, m);
      sel = s.chain ? s.chain.slice() : null;
      render();
      cpuMove();
    }

    function cpuMove() {
      if (!cpuTurn()) return;
      const myGen = gen;
      setTimeout(() => {
        if (myGen !== gen || !cpuTurn()) return;
        const m = bestMove(s);
        if (m) { s = apply(s, m); sel = null; render(); cpuMove(); }
      }, 450);
    }

    $('.ck-board').addEventListener('click', e => {
      const sq = e.target.closest('.ck-sq');
      if (!sq || s.winner || cpuTurn()) return;
      const r = +sq.dataset.r, c = +sq.dataset.c;
      const moves = legalMoves(s);
      const hit = sel && moves.find(m => same(m.from, sel) && m.to[0] === r && m.to[1] === c);
      if (hit) return play(hit);
      sel = moves.some(m => m.from[0] === r && m.from[1] === c) ? [r, c] : null;
      render();
    });

    $('.ck-variant').addEventListener('click', e => {
      const button = e.target.closest('[data-variant]');
      if (!button || s.variant) return;
      s = apply(s, { variant: button.dataset.variant });
      render();
      cpuMove();
    });

    function newGame() { gen++; s = init(s); sel = null; render(); }
    $('.ck-new').addEventListener('click', newGame);
    $('.ck-mode').addEventListener('change', e => { mode = e.target.value; newGame(); });

    render();
    return { newGame, getState: () => s, dispose: () => { gen++; root.innerHTML = ''; } };
  }

  // ---------- Registration ----------
  const api = {
    id: 'checkers',
    name: 'Checkers',
    t: 'Checkers',
    i: '🔴',
    d: 'Choose American Checkers with mandatory captures or Indian Checkers with optional captures. Chain jumps and crown kings.',
    minPlayers: 2,
    maxPlayers: 2,
    max: 2,
    cat: 'classic strategy',
    tag: 'Jump & capture',
    diff: 'Easy to learn',
    art: 'art-chess',
    logo: 'checkers.svg',
    hostedUI: true,
    n: ['Red', 'Black'],
    init(previousState) {
      drawnRoomMoveSeq = 0;
      const state = init(previousState);
      return { ...state, t: state.turn === 'r' ? 0 : 1, moveSeq: 0 };
    },
    valid: (action) => {
      if (!action) return false;
      return valid(S, action);
    },
    apply(action) {
      const next = apply(S, action);
      Object.assign(S, next, { t: next.turn === 'r' ? 0 : 1 });
    },
    bot: () => bestMove(S),
    draw() {
      injectStyles();
      if (!S.variant) {
        return ['<div class="ck-wrap"><section class="ck-variant" aria-labelledby="ck-variant-title">' +
          variantHtml() + '</section></div>', 'Choose American or Indian Checkers'];
      }
      const moves = legalMoves(S);
      const lastMove = S.lastMove && S.lastMove.seq > drawnRoomMoveSeq ? S.lastMove : null;
      if (lastMove) drawnRoomMoveSeq = lastMove.seq;
      const selectedMoves = Number.isInteger(sel)
        ? moves.filter(move => move.from[0] * N + move.from[1] === sel)
        : [];
      const movable = new Set(moves.map(move => move.from[0] * N + move.from[1]));
      let html = '<div class="ck-wrap"><div class="ck-bar"><span class="ck-status">' +
        (S.winner === 'draw' ? 'Draw' : S.winner ? (S.winner === 'r' ? 'Red wins!' : 'Black wins!') :
          S.chain ? (S.turn === 'r' ? 'Red' : 'Black') + ': keep jumping' : (S.turn === 'r' ? 'Red' : 'Black') + "'s turn") +
        '</span></div><div class="ck-board" role="grid" aria-label="Checkers board">';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const index = r * N + c, piece = S.board[r][c];
        const target = selectedMoves.find(move => move.to[0] === r && move.to[1] === c);
        html += '<button type="button" class="ck-sq ' + ((r + c) % 2 ? 'd' : 'l') +
          (sel === index ? ' sel' : '') + (target ? ' tgt' : '') + (movable.has(index) ? ' can' : '') +
          (lastMove && lastMove.capture && lastMove.capture[0] === r && lastMove.capture[1] === c ? ' capture-at' : '') + '" data-i="' + index +
          '" aria-label="Row ' + (r + 1) + ', column ' + (c + 1) + (piece ? ', ' + (piece.toLowerCase() === 'r' ? 'red' : 'black') + (isKing(piece) ? ' king' : ' piece') : '') + '">';
        if (piece) {
          let classes = 'ck-pc ' + owner(piece) + (isKing(piece) ? ' king' : '');
          let style = '';
          if (lastMove && lastMove.to[0] === r && lastMove.to[1] === c) {
            if (lastMove.kinged) classes += ' crowned';
            else {
              classes += ' moved';
              style = ' style="--move-x:' + ((lastMove.from[1] - c) * 128) + '%;--move-y:' + ((lastMove.from[0] - r) * 128) + '%"';
            }
          }
          html += '<span class="' + classes + '"' + style + '>' + (isKing(piece) ? '♛' : '') + '</span>';
        }
        html += '</button>';
      }
      html += '</div></div>';
      return [html, S.winner ? (S.winner === 'draw' ? 'Draw' : (S.winner === 'r' ? 'Red wins!' : 'Black wins!')) :
        (typeof nm === 'function' ? nm(S.t) : 'Player ' + (S.t + 1)) + ' to move'];
    },
    click(element) {
      if (element.dataset.variant) {
        if (!S.variant && valid(S, { variant: element.dataset.variant })) act({ variant: element.dataset.variant });
        return;
      }
      const index = Number(element.dataset.i);
      if (!Number.isInteger(index) || index < 0 || index >= N * N) return;
      const row = Math.floor(index / N), col = index % N;
      const move = legalMoves(S).find(candidate =>
        Number.isInteger(sel) && candidate.from[0] * N + candidate.from[1] === sel &&
        candidate.to[0] === row && candidate.to[1] === col);
      if (move) { sel = -1; return act(move); }
      const movable = legalMoves(S).some(candidate => candidate.from[0] === row && candidate.from[1] === col);
      sel = movable ? index : -1;
      render();
    },
    legalMoves, mount,
  };

  function variantHtml() {
    return '<h2 id="ck-variant-title">Choose your rules</h2>' +
      '<p>Pick a Checkers version to play. The choice applies to both players.</p>' +
      '<div class="ck-variant-options">' +
      '<button type="button" data-i="variant" data-variant="american"><b>American Checkers</b><small>Captures are mandatory.</small></button>' +
      '<button type="button" data-i="variant" data-variant="indian"><b>Indian Checkers</b><small>Captures are optional.</small></button>' +
      '</div>';
  }

  if (typeof registerGame === 'function') {
    registerGame(api);
  } else if (typeof document !== 'undefined') {
    const go = () => {
      const root = document.getElementById('checkers') ||
        document.body.appendChild(document.createElement('div'));
      mount(root);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }
  if (typeof window !== 'undefined') window.CheckersGame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
