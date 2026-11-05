/* uno.js - UNO for 2-4 players (you + 1-3 bots). Add <script src="uno.js"></script> to any page. */
(function (global) {
  'use strict';
  var COLORS = ['red', 'yellow', 'green', 'blue'];
  var HEX = { red: '#e0302c', yellow: '#f2c230', green: '#2f9e4f', blue: '#2563c9' };
  var ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'R', '+2', 'W', '+4'];
  var WIN_SCORE = 500, BOT_DELAY = 900;
  var G = { phase: 'setup', players: [] }, root = null, timer = null, styleNode = null;
  var drawnRoomAnimationSeq = 0;

  /* ---------- rules ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function makeDeck() {
    var d = [], id = 0, k;
    COLORS.forEach(function (c) {
      d.push({ id: id++, c: c, v: '0' });
      for (var n = 1; n <= 9; n++) for (k = 0; k < 2; k++) d.push({ id: id++, c: c, v: String(n) });
      ['S', 'R', '+2'].forEach(function (a) { for (k = 0; k < 2; k++) d.push({ id: id++, c: c, v: a }); });
    });
    for (k = 0; k < 4; k++) { d.push({ id: id++, c: 'wild', v: 'W' }); d.push({ id: id++, c: 'wild', v: '+4' }); }
    return d; // 108 cards
  }
  function pts(c) { return /^\d$/.test(c.v) ? +c.v : (c.c === 'wild' ? 50 : 20); }
  function label(c) {
    var n = { S: 'Skip', R: 'Reverse', '+2': 'Draw Two', W: 'Wild', '+4': 'Wild Draw Four' }[c.v];
    return c.c === 'wild' ? n : c.c + ' ' + (n || c.v);
  }
  function nextIdx(from, steps) { var n = G.players.length; return (((from + G.dir * steps) % n) + n) % n; }
  function isPlayable(card, hand) {
    var top = G.discard[G.discard.length - 1];
    if (card.v === '+4') return !hand.some(function (x) { return x.c === G.color; }); // only if no card of current color
    if (card.c === 'wild') return true;
    return card.c === G.color || card.v === top.v;
  }
  function take(n) {
    var out = [];
    while (n-- > 0) {
      if (!G.draw.length) {
        var top = G.discard.pop();
        G.draw = shuffle(G.discard); G.discard = [top];
        if (!G.draw.length) break;
      }
      out.push(G.draw.pop());
    }
    return out;
  }
  function give(pi, n) {
    var got = take(n), h = G.players[pi].hand;
    got.forEach(function (c) { h.push(c); });
    return got;
  }

  /* ---------- game flow ---------- */
  function start(nBots) {
    var N = nBots + 1, ps = [];
    for (var i = 0; i < N; i++) ps.push({ name: i ? 'Bot ' + i : 'You', bot: i > 0, hand: [], score: 0 });
    G = { players: ps, dealer: (((N - 2) % N) + N) % N, draw: [], discard: [], dir: 1 };
    newRound();
  }
  function newRound() {
    var N = G.players.length, c;
    G.draw = shuffle(makeDeck()); G.discard = []; G.dir = 1;
    G.drawn = null; G.pick = null; G.called = {}; G.phase = 'play';
    G.players.forEach(function (p) { p.hand = take(7); });
    do { c = G.draw.pop(); if (c.v === '+4') G.draw.unshift(c); } while (c.v === '+4');
    G.discard.push(c);
    G.color = c.c === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : c.c;
    G.dealer = (G.dealer + 1) % N; // the starting player rotates every round
    G.turn = nextIdx(G.dealer, 1);
    G.msg = 'New round.';
    if (c.v === 'S') { G.msg += ' The first card is Skip.'; G.turn = nextIdx(G.turn, 1); }
    else if (c.v === 'R') { G.msg += ' The first card is Reverse.'; G.dir = -1; G.turn = G.dealer; }
    else if (c.v === '+2') { G.msg += ' ' + G.players[G.turn].name + ' draws 2.'; give(G.turn, 2); G.turn = nextIdx(G.turn, 1); }
    afterChange();
  }
  function afterChange() {
    clearTimeout(timer); render();
    if (root && G.phase === 'play' && G.players[G.turn].bot) timer = setTimeout(botMove, BOT_DELAY);
  }
  function play(pi, idx, color) {
    var p = G.players[pi], card = p.hand.splice(idx, 1)[0], steps = 1;
    G.discard.push(card); G.drawn = null;
    G.color = card.c === 'wild' ? color : card.c;
    var victim = nextIdx(pi, 1), msg = p.name + ' played ' + label(card) + (card.c === 'wild' ? ' (' + color + ')' : '') + '.';
    if (p.hand.length === 1 && !G.called[pi]) { give(pi, 2); msg += ' ' + p.name + ' forgot to call UNO and draws 2.'; }
    G.called[pi] = false;
    if (!p.hand.length) return endRound(pi, msg);
    if (card.v === 'S') { steps = 2; msg += ' ' + G.players[victim].name + ' is skipped.'; }
    else if (card.v === 'R') { G.dir = -G.dir; if (G.players.length === 2) steps = 2; msg += ' Direction reversed.'; }
    else if (card.v === '+2') { give(victim, 2); steps = 2; msg += ' ' + G.players[victim].name + ' draws 2.'; }
    else if (card.v === '+4') { give(victim, 4); steps = 2; msg += ' ' + G.players[victim].name + ' draws 4.'; }
    G.turn = nextIdx(pi, steps); G.msg = msg; afterChange();
  }
  function drawTurn(pi) {
    var p = G.players[pi], got = give(pi, 1)[0];
    G.called[pi] = false;
    if (got && isPlayable(got, p.hand)) { G.drawn = got.id; G.msg = p.name + ' drew a card' + (pi ? '.' : ' you can play.'); }
    else { G.drawn = null; G.turn = nextIdx(pi, 1); G.msg = p.name + ' drew a card and passes.'; }
    afterChange();
  }
  function pass(pi) { G.drawn = null; G.msg = G.players[pi].name + ' passed.'; G.turn = nextIdx(pi, 1); afterChange(); }
  function endRound(w, msg) {
    var sum = 0;
    G.players.forEach(function (p, i) { if (i !== w) p.hand.forEach(function (c) { sum += pts(c); }); });
    G.players[w].score += sum; G.phase = 'over'; G.winner = w; G.gain = sum; G.msg = msg;
    afterChange();
  }

  /* ---------- bot ---------- */
  function botMove() {
    if (G.phase !== 'play' || !G.players[G.turn].bot) return;
    var pi = G.turn, p = G.players[pi], cnt = { red: 0, yellow: 0, green: 0, blue: 0 };
    p.hand.forEach(function (c) { if (c.c !== 'wild') cnt[c.c]++; });
    var pool = p.hand.filter(function (c) { return (G.drawn == null || c.id === G.drawn) && isPlayable(c, p.hand); });
    if (!pool.length) return G.drawn != null ? pass(pi) : drawTurn(pi);
    var danger = G.players[nextIdx(pi, 1)].hand.length <= 2;
    function score(c) {
      var action = isNaN(+c.v);
      return (c.c === 'wild' ? (c.v === '+4' && danger ? 10 : -10) : cnt[c.c]) + (action ? (danger ? 8 : 1) : +c.v * 0.1);
    }
    pool.sort(function (a, b) { return score(b) - score(a); });
    var card = pool[0], idx = p.hand.indexOf(card), color = null;
    if (card.c === 'wild') {
      var best = COLORS.slice().sort(function (a, b) { return cnt[b] - cnt[a] || Math.random() - 0.5; });
      color = best[0];
    }
    if (p.hand.length === 2) G.called[pi] = true; // bots always call UNO
    play(pi, idx, color);
  }

  /* ---------- UI ---------- */
  function sym(c) { return c.v === 'S' ? '\u2298' : c.v === 'R' ? '\u21C4' : c.v === 'W' ? '' : c.v; }
  function cardHTML(c, cls, attrs) {
    var col = c.c === 'wild' ? '#1b1b1f' : HEX[c.c], tag = attrs ? 'button type="button"' : 'div';
    return '<' + tag + ' class="card' + (c.c === 'wild' ? ' wild' : '') + (cls || '') + '" style="--c:' + col + '" ' + (attrs || '') +
      ' aria-label="' + label(c) + '"><i class="cn">' + sym(c) + '</i><span class="ov"><b>' + sym(c) + '</b></span></' + tag.split(' ')[0] + '>';
  }
  var BACK = '<div class="card back"><span class="ov"><b>UNO</b></span></div>';
  function sortKey(c) { return (c.c === 'wild' ? 4 : COLORS.indexOf(c.c)) * 20 + ORDER.indexOf(c.v); }

  function render() {
    if (!root) return;
    var keep = root.querySelector('.hand'), sl = keep ? keep.scrollLeft : 0, h = '';
    if (G.phase === 'setup') {
      root.innerHTML = '<div class="ovl"><h1>UNO</h1><p>Match the top card by color or value. First to ' + WIN_SCORE +
        ' points wins. Call UNO before playing your second-to-last card.</p><p>Play against</p><div class="row">' +
        [1, 2, 3].map(function (n) { return '<button class="btn" data-a="start" data-v="' + n + '">' + n + (n > 1 ? ' bots' : ' bot') + '</button>'; }).join('') + '</div></div>';
      return;
    }
    var me = G.players[0], active = G.phase === 'play', mine = active && G.turn === 0 && G.pick == null;
    var top = G.discard[G.discard.length - 1];
    h += '<div class="bar"><span class="logo">UNO</span><span class="sc">' + G.players.map(function (p) {
      return '<span>' + p.name + ' <b>' + p.score + '</b></span>';
    }).join('') + '</span></div><div class="opps">';
    G.players.forEach(function (p, i) {
      if (!i) return;
      var n = p.hand.length, fan = '';
      for (var k = 0; k < Math.min(n, 8); k++) fan += BACK;
      h += '<div class="opp' + (active && G.turn === i ? ' on' : '') + '"><div class="fan">' + fan + '</div><span>' + p.name +
        '</span><span class="n">' + n + (n === 1 ? ' card, UNO!' : ' cards') + '</span></div>';
    });
    var canDraw = mine && G.drawn == null;
    h += '</div><div class="table"><button class="pile' + (canDraw ? ' ok' : '') + '" data-a="draw" aria-label="Draw a card"' + (canDraw ? '' : ' disabled') +
      '>' + BACK + '<span>Draw</span></button><div class="cur disc" style="--cur:' + HEX[G.color] + '">' + cardHTML(top) +
      '<span>' + (G.dir === 1 ? '\u21BB ' : '\u21BA ') + G.color + '</span></div></div>';
    var hint = !active ? '' : G.turn === 0 ? (G.drawn != null ? 'Play the card you drew, or pass.' : 'Your turn. Play a card or draw.') : G.players[G.turn].name + ' is thinking\u2026';
    h += '<div class="msg">' + G.msg + '<small>' + hint + '</small></div><div class="acts">';
    if (mine && me.hand.length <= 2) h += '<button class="btn uno" data-a="uno" aria-pressed="' + !!G.called[0] + '">UNO!</button>';
    if (mine && G.drawn != null) h += '<button class="btn alt" data-a="pass">Pass</button>';
    h += '</div><div class="hand">';
    me.hand.slice().sort(function (a, b) { return sortKey(a) - sortKey(b); }).forEach(function (c) {
      var ok = mine && (G.drawn == null || c.id === G.drawn) && isPlayable(c, me.hand);
      h += cardHTML(c, mine ? (ok ? ' ok' : ' no') : '', 'data-a="card" data-v="' + c.id + '"');
    });
    h += '</div>';
    if (G.pick != null) {
      h += '<div class="ovl"><p>Choose a color</p><div class="row">' + COLORS.map(function (c) {
        return '<button class="sw" style="--c:' + HEX[c] + '" data-a="color" data-v="' + c + '" aria-label="' + c + '"></button>';
      }).join('') + '</div></div>';
    }
    if (G.phase === 'over') {
      var w = G.players[G.winner], fin = w.score >= WIN_SCORE;
      h += '<div class="ovl"><h1>' + (G.winner === 0 ? 'You win!' : w.name + ' wins') + '</h1><p>' + (fin ? 'Game over with ' + w.score + ' points.' : '+' + G.gain + ' points this round.') +
        '</p><p>' + G.players.map(function (p) { return p.name + ' ' + p.score; }).join(', ') + '</p><button class="btn" data-a="next">' + (fin ? 'New game' : 'Next round') + '</button></div>';
    }
    root.innerHTML = h;
    if (typeof global.playoraStackHandCards === 'function') global.playoraStackHandCards(root);
    var nh = root.querySelector('.hand'); if (nh) nh.scrollLeft = sl;
  }
  function onCard(id) {
    var hand = G.players[0].hand, i = hand.findIndex(function (c) { return c.id === id; }), c = hand[i];
    if (i < 0 || (G.drawn != null && c.id !== G.drawn)) return;
    if (!isPlayable(c, hand)) { G.msg = c.v === '+4' ? 'Wild Draw Four only works when you have no ' + G.color + ' card.' : 'That card does not match.'; return render(); }
    if (c.c === 'wild') { G.pick = i; return render(); }
    play(0, i);
  }
  function onClick(e) {
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v'), mine = G.phase === 'play' && G.turn === 0 && G.pick == null;
    if (a === 'start') start(+v);
    else if (a === 'next') {
      if (G.players.some(function (p) { return p.score >= WIN_SCORE; })) { G.phase = 'setup'; render(); } else newRound();
    }
    else if (a === 'color' && G.pick != null) { var i = G.pick; G.pick = null; play(0, i, v); }
    else if (!mine) return;
    else if (a === 'card') onCard(+v);
    else if (a === 'draw' && G.drawn == null) drawTurn(0);
    else if (a === 'pass' && G.drawn != null) pass(0);
    else if (a === 'uno') { G.called[0] = !G.called[0]; render(); }
  }

  var CSS = '.uno{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden;user-select:none;' +
    'font-family:"Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif;--w:clamp(46px,min(12vw,17vh),92px);' +
    'background:radial-gradient(ellipse at 50% 35%,#2a3558 0,#141a2c 65%,#0d111d 100%)}.uno *{box-sizing:border-box}' +
    '.uno .bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 14px;flex:none}' +
    '.uno .logo{font-size:26px;font-weight:900;font-style:italic;color:#f2c230;text-shadow:2px 2px 0 #e0302c}' +
    '.uno .sc{display:flex;gap:12px;flex-wrap:wrap;font-size:13px}.uno .opps{display:flex;justify-content:space-around;gap:8px;padding:4px 10px;flex:none}' +
    '.uno .opp{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 10px;border-radius:12px;font-size:13px;border:2px solid transparent}' +
    '.uno .opp.on{border-color:#f2c230;background:rgba(242,194,48,.12)}.uno .opp .n{font-size:11px;opacity:.8}' +
    '.uno .fan{display:flex;height:calc(var(--w)*.63)}.uno .fan .card+.card{margin-left:calc(var(--w)*-.22)}' +
    '.uno .table{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;gap:calc(var(--w)*.6)}' +
    '.uno .pile{background:none;border:0;padding:0;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;font:inherit;font-size:12px}' +
    '.uno .pile.ok{cursor:pointer}.uno .pile.ok .card{box-shadow:0 0 0 4px #f2c230,0 6px 14px rgba(0,0,0,.5)}' +
    '.uno .cur{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px}.uno .disc .card{box-shadow:0 0 0 calc(var(--w)*.09) var(--cur)}' +
    '.uno .msg{text-align:center;font-size:14px;padding:4px 12px;min-height:2.8em;flex:none}.uno .msg small{display:block;opacity:.75;margin-top:2px}' +
    '.uno .acts{display:flex;justify-content:center;gap:10px;min-height:44px;flex:none}' +
    '.uno .btn{font:inherit;font-weight:800;padding:.65em 1.3em;border:0;border-radius:999px;background:#f2c230;color:#1b1b1f;cursor:pointer}' +
    '.uno .btn.uno{background:#e0302c;color:#fff}.uno .btn.uno[aria-pressed=true]{background:#fff;color:#e0302c;box-shadow:0 0 0 3px #e0302c}.uno .btn.alt{background:#fff}' +
    '.uno .hand{display:flex;overflow-x:auto;overflow-y:hidden;padding:20px 14px 12px;flex:none}' +
    '.uno .hand .card:first-child{margin-left:auto}.uno .hand .card:last-child{margin-right:auto}.uno .hand .card+.card{margin-left:calc(var(--w)*-.28)}' +
    '.uno .hand .card.ok{position:relative;z-index:2;transform:translateY(-14px);cursor:pointer;box-shadow:0 0 0 3px rgba(255,255,255,.4),0 6px 14px rgba(0,0,0,.5)}.uno .hand .card.no{filter:brightness(.55)}' +
    '.uno .card{--cw:var(--w);position:relative;isolation:isolate;flex:none;width:var(--cw);height:calc(var(--cw)*1.5);padding:0;border-radius:calc(var(--cw)*.12);' +
    'border:calc(var(--cw)*.055) solid #fff;background:var(--c);color:#fff;font:inherit;font-weight:900;box-shadow:0 3px 8px rgba(0,0,0,.45);overflow:hidden}' +
    '.uno .opp .card{--cw:calc(var(--w)*.42)}.uno .ov{position:absolute;left:8%;right:8%;top:15%;bottom:15%;background:#fff;border-radius:50%;transform:rotate(-24deg);display:flex;align-items:center;justify-content:center}' +
    '.uno .ov b{transform:rotate(24deg);color:var(--c);font-size:calc(var(--cw)*.46);font-style:italic;line-height:1}' +
    '.uno .cn{position:absolute;top:3%;left:10%;font-size:calc(var(--cw)*.2);font-style:normal;text-shadow:0 1px 2px rgba(0,0,0,.4)}' +
    '.uno .wild .ov{background:conic-gradient(#e0302c 0 25%,#2563c9 0 50%,#2f9e4f 0 75%,#f2c230 0)}.uno .wild .ov b{color:#fff;text-shadow:0 1px 3px #000}' +
    '.uno .back{--c:#1b1b1f}.uno .back .ov{background:#e0302c}.uno .back .ov b{color:#f2c230;font-size:calc(var(--cw)*.3)}' +
    '.uno .ovl{position:absolute;inset:0;z-index:5;background:rgba(10,12,22,.84);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px}' +
    '.uno .ovl h1{margin:0;font-size:clamp(40px,10vw,72px);font-style:italic;color:#f2c230;text-shadow:3px 3px 0 #e0302c}.uno .ovl p{margin:0;max-width:36ch;line-height:1.4}' +
    '.uno .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.uno .sw{width:64px;height:64px;border-radius:50%;border:4px solid #fff;cursor:pointer;background:var(--c)}' +
    '.uno .btn:focus-visible,.uno .pile:focus-visible,.uno .card:focus-visible,.uno .sw:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@media (prefers-reduced-motion:no-preference){.uno .hand .card{transition:transform .12s}}' +
    '.uno .card{transform-style:preserve-3d;backface-visibility:hidden;border-color:#fffdf0;background-image:linear-gradient(112deg,rgba(255,255,255,.2),transparent 24%,transparent 73%,rgba(0,0,0,.14)),linear-gradient(160deg,rgba(255,255,255,.13),transparent 45%,rgba(0,0,0,.1));box-shadow:0 2px 0 #ffffff66 inset,0 -2px 0 #0002 inset,0 3px 0 #0003,0 8px 14px rgba(0,0,0,.42)}' +
    '.uno .card::after{content:"";position:absolute;z-index:1;inset:2px;border:1px solid rgba(255,255,255,.27);border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}' +
    '.uno .card .cn,.uno .card .ov{z-index:2}' +
    '.uno .card.played{z-index:3;animation:uno-card-play .58s cubic-bezier(.18,.75,.22,1) both}' +
    '.uno .hand .card.dealing{z-index:3;animation:uno-card-deal .58s cubic-bezier(.18,.75,.22,1) both}' +
    '@keyframes uno-card-play{0%{transform:translate3d(0,150px,80px) rotateZ(-14deg) rotateY(-72deg) scale(.72);filter:brightness(1.35);box-shadow:0 22px 32px #0009}65%{transform:translate3d(0,-8px,0) rotateZ(5deg) rotateY(8deg) scale(1.06)}82%{transform:translateY(3px) rotateZ(-2deg) scale(.98)}100%{transform:translate(0) rotate(0) scale(1);filter:none}}' +
    '@keyframes uno-card-deal{0%{transform:translate3d(0,-34vh,90px) rotateZ(22deg) rotateY(72deg) scale(.68);filter:brightness(1.35);box-shadow:0 22px 32px #0009}68%{transform:translate3d(-4px,4px,0) rotateZ(-4deg) rotateY(-6deg) scale(1.06)}84%{transform:translate3d(2px,-2px,0) rotateZ(2deg) scale(.98)}100%{transform:translate(0) rotate(0) scale(1);filter:none}}' +
    '@media(prefers-reduced-motion:reduce){.uno .card.played,.uno .hand .card.dealing{animation:none!important}}' +
    '#room .uno button{width:auto;margin:0}' +
    '#room .uno .card{width:var(--cw);height:calc(var(--cw)*1.5);padding:0;border:calc(var(--cw)*.055) solid #fff;border-radius:calc(var(--cw)*.12);background:var(--c);color:#fff}' +
    '#room .uno .btn{font:inherit;font-weight:800;padding:.65em 1.3em;border:0;border-radius:999px;background:#f2c230;color:#1b1b1f}' +
    '#room .uno .btn.uno{background:#e0302c;color:#fff}' +
    '#room .uno .btn.uno[aria-pressed=true]{background:#fff;color:#e0302c;box-shadow:0 0 0 3px #e0302c}' +
    '#room .uno .btn.alt{background:#fff}' +
    '#room .uno .pile{padding:0;border:0;background:none;color:#fff}' +
    '#room .uno .sw{width:64px;height:64px;padding:0;border:4px solid #fff;border-radius:50%;background:var(--c)}' +
    '#room #bd .uno .hand{flex-wrap:wrap;justify-content:center;overflow:visible;padding:20px 14px calc(10px + var(--w)*.5 + env(safe-area-inset-bottom,0px))}' +
    '#room #bd .uno .hand .card:first-child{margin-left:0}#room #bd .uno .hand .card:last-child{margin-right:0}' +
    '#room #bd .uno{box-sizing:border-box;padding-bottom:calc(5vh + env(safe-area-inset-bottom,0px))}' +
    '#room #bd .uno .acts{order:1}#room #bd .uno .hand{order:2}#room #bd .uno .msg{order:3;margin-top:8px}' +
    '@media(max-height:520px) and (orientation:landscape){#room #bd .uno{--w:clamp(18px,min(8vh,calc((100vw - 32px)/20)),42px);padding-bottom:0}#room #bd .uno .bar{gap:6px;padding:2px 8px}#room #bd .uno .logo{font-size:20px}#room #bd .uno .opps{gap:4px;padding:0 6px}#room #bd .uno .opp{gap:2px;padding:3px 6px;font-size:11px}#room #bd .uno .table{min-height:0;gap:8px}#room #bd .uno .hand{flex-wrap:nowrap;overflow:hidden;padding:4px 8px}#room #bd .uno .acts{min-height:36px;gap:6px}#room #bd .uno .btn{padding:.35em .8em}#room #bd .uno .msg{min-height:1.6em;margin-top:0;padding:2px 8px;font-size:12px}}';

  function injectStyles() {
    if (typeof document === 'undefined') return;
    styleNode = document.getElementById('uno-game-style');
    if (!styleNode) {
      styleNode = document.createElement('style');
      styleNode.id = 'uno-game-style';
      styleNode.textContent = CSS;
      document.head.appendChild(styleNode);
    }
  }

  function mount(container) {
    if (root || typeof document === 'undefined') return unmount;
    injectStyles();
    root = document.createElement('div'); root.className = 'uno'; (container || document.body).appendChild(root);
    root.addEventListener('click', onClick);
    render();
    return unmount;
  }

  function unmount() {
    clearTimeout(timer); timer = null;
    if (root) { root.removeEventListener('click', onClick); root.remove(); root = null; }
    if (styleNode) { styleNode.remove(); styleNode = null; }
  }

  function roomNext(from, steps) {
    var count = S.players.length;
    return ((from + S.dir * steps) % count + count) % count;
  }
  function roomTop() { return S.discard[S.discard.length - 1]; }
  function roomPlayable(card, player) {
    if (card.v === '+4') return !player.hand.some(function (item) { return item.c === S.color; });
    return card.c === 'wild' || card.c === S.color || card.v === roomTop().v;
  }
  function roomTake(count) {
    var cards = [];
    while (count-- > 0) {
      if (!S.draw.length) {
        var top = S.discard.pop();
        S.draw = shuffle(S.discard);
        S.discard = [top];
        if (!S.draw.length) break;
      }
      cards.push(S.draw.pop());
    }
    return cards;
  }
  function roomGive(player, count) {
    var cards = roomTake(count);
    S.players[player].hand.push.apply(S.players[player].hand, cards);
    return cards;
  }
  function roomInit() {
    drawnRoomAnimationSeq = 0;
    var players = Array.from({ length: np }, function (_, index) {
      return { name: typeof nm === 'function' ? nm(index) : 'Player ' + (index + 1), hand: [], score: 0 };
    });
    var state = {
      players: players, draw: shuffle(makeDeck()), discard: [], dir: 1, turn: 0,
      t: 0, color: '', drawnId: null, called: Array(players.length).fill(false),
      winner: -1, over: false, msg: 'New game.', animationSeq: 0, animation: null
    };
    S = state;
    players.forEach(function (player) { player.hand.push.apply(player.hand, roomTake(7)); });
    var first;
    do { first = S.draw.pop(); if (first.v === '+4') S.draw.unshift(first); } while (first.v === '+4');
    S.discard.push(first);
    S.color = first.c === 'wild' ? COLORS[Math.floor(Math.random() * COLORS.length)] : first.c;
    if (first.v === 'S') S.turn = 1 % players.length;
    else if (first.v === 'R') { S.dir = -1; S.turn = players.length - 1; }
    else if (first.v === '+2') { roomGive(S.turn, 2); S.turn = roomNext(S.turn, 1); }
    S.t = S.turn;
    return S;
  }
  function roomValid(action) {
    if (!action || typeof action !== 'object' || S.over || action.player !== S.t) return false;
    var player = S.players[S.t];
    if (action.type === 'call') return player.hand.length <= 2 && !S.called[S.t];
    if (action.type === 'draw') return S.drawnId == null;
    if (action.type === 'pass') return S.drawnId != null;
    if (action.type !== 'play' || !Number.isInteger(action.cardId)) return false;
    if (S.drawnId != null && action.cardId !== S.drawnId) return false;
    var card = player.hand.find(function (item) { return item.id === action.cardId; });
    if (!card || !roomPlayable(card, player)) return false;
    return card.c !== 'wild' || COLORS.includes(action.color);
  }
  function roomApply(action) {
    if (!roomValid(action)) return;
    var pi = S.t, player = S.players[pi];
    if (action.type === 'call') {
      S.called[pi] = true;
      S.msg = player.name + ' called UNO!';
      return;
    }
    if (action.type === 'draw') {
      var drawn = roomGive(pi, 1)[0];
      S.animation = drawn ? { seq: ++S.animationSeq, type: 'draw', player: pi, cardId: drawn.id } : null;
      S.called[pi] = false;
      if (drawn && roomPlayable(drawn, player)) {
        S.drawnId = drawn.id;
        S.msg = player.name + ' drew a card and may play it.';
      } else {
        S.drawnId = null;
        S.turn = roomNext(pi, 1);
        S.msg = player.name + ' drew and passed.';
      }
      S.t = S.turn;
      return;
    }
    if (action.type === 'pass') {
      S.drawnId = null;
      S.called[pi] = false;
      S.turn = roomNext(pi, 1);
      S.t = S.turn;
      S.msg = player.name + ' passed.';
      return;
    }
    var cardIndex = player.hand.findIndex(function (item) { return item.id === action.cardId; });
    var card = player.hand.splice(cardIndex, 1)[0], victim = roomNext(pi, 1), steps = 1;
    S.animation = { seq: ++S.animationSeq, type: 'play', player: pi, cardId: card.id };
    S.discard.push(card);
    S.drawnId = null;
    S.color = card.c === 'wild' ? action.color : card.c;
    S.msg = player.name + ' played ' + label(card) + (card.c === 'wild' ? ' (' + S.color + ')' : '') + '.';
    if (player.hand.length === 1 && !S.called[pi]) {
      roomGive(pi, 2);
      S.msg += ' Forgot UNO and drew 2.';
    }
    S.called[pi] = false;
    if (!player.hand.length) {
      S.winner = pi;
      S.over = true;
      S.msg = player.name + ' wins!';
      return;
    }
    if (card.v === 'S') { steps = 2; S.msg += ' ' + S.players[victim].name + ' is skipped.'; }
    else if (card.v === 'R') { S.dir = -S.dir; if (S.players.length === 2) steps = 2; S.msg += ' Direction reversed.'; }
    else if (card.v === '+2') { roomGive(victim, 2); steps = 2; S.msg += ' ' + S.players[victim].name + ' draws 2.'; }
    else if (card.v === '+4') { roomGive(victim, 4); steps = 2; S.msg += ' ' + S.players[victim].name + ' draws 4.'; }
    S.turn = roomNext(pi, steps);
    S.t = S.turn;
  }
  function roomBot() {
    var pi = S.t, player = S.players[pi];
    if (!player || pi === seat || S.over) return null;
    if (player.hand.length <= 2 && !S.called[pi]) return { type: 'call', player: pi };
    var pool = player.hand.filter(function (card) {
      return (S.drawnId == null || card.id === S.drawnId) && roomPlayable(card, player);
    });
    if (!pool.length) return S.drawnId != null
      ? { type: 'pass', player: pi }
      : { type: 'draw', player: pi };
    pool.sort(function (a, b) { return (b.c === 'wild' ? -1 : 0) - (a.c === 'wild' ? -1 : 0); });
    var chosen = pool[0], color = chosen.c === 'wild'
      ? COLORS.slice().sort(function (a, b) {
        return player.hand.filter(function (item) { return item.c === b; }).length -
          player.hand.filter(function (item) { return item.c === a; }).length;
      })[0]
      : undefined;
    return { type: 'play', player: pi, cardId: chosen.id, color: color };
  }
  function roomDraw() {
    injectStyles();
    var animation = S.animation && S.animation.seq > drawnRoomAnimationSeq ? S.animation : null;
    if (animation) drawnRoomAnimationSeq = animation.seq;
    var active = !S.over && S.t === (seat < 0 ? S.t : seat) && canAct();
    var currentIndex = seat >= 0 && seat < S.players.length ? seat : ids.length ? -1 : S.t;
    var current = currentIndex >= 0 ? S.players[currentIndex] : null;
    var top = roomTop(), html = '<div class="bar"><span class="logo">UNO</span><span class="sc">' +
      S.players.map(function (player, index) {
        return '<span' + (S.t === index ? ' class="on"' : '') + '>' + player.name + ' <b>' +
          player.score + '</b> · ' + player.hand.length + ' cards</span>';
      }).join('') + '</span></div><div class="opps">';
    S.players.forEach(function (player, index) {
      if (index === currentIndex) return;
      html += '<div class="opp' + (S.t === index ? ' on' : '') + '"><div class="fan">' +
        Array(Math.min(player.hand.length, 8)).fill(BACK).join('') + '</div><span>' + player.name +
        '</span><span class="n">' + player.hand.length + ' cards</span></div>';
    });
    html += '</div><div class="table"><div class="pile"><span class="card back"><span class="ov"><b>UNO</b></span></span><span>Draw pile · ' + S.draw.length + '</span></div>' +
      '<div class="cur disc" style="--cur:' + HEX[S.color] + '">' + cardHTML(top,
        animation && animation.type === 'play' && animation.cardId === top.id ? ' played' : '', '') + '<span>' +
      (S.dir === 1 ? '↻ ' : '↺ ') + S.color + '</span></div></div><div class="msg">' + S.msg +
      '<small>' + (S.over ? 'Use Restart to play again.' : S.t === currentIndex ? (S.drawnId != null ? 'Play the card you drew or pass.' : 'Your turn: play a card or draw.') : S.players[S.t].name + ' is playing…') +
      '</small></div><div class="acts">';
    if (active && current && current.hand.length <= 2 && !S.called[S.t])
      html += '<button class="btn uno" data-m="call">Call UNO!</button>';
    if (active && S.drawnId != null && S.t === currentIndex)
      html += '<button class="btn alt" data-m="pass">Pass</button>';
    if (active && S.drawnId == null && S.t === currentIndex)
      html += '<button class="btn alt" data-m="draw">Draw card</button>';
    html += '</div><div class="hand">';
    if (current) current.hand.slice().sort(function (a, b) { return sortKey(a) - sortKey(b); }).forEach(function (card) {
      var playable = active && S.t === currentIndex && (S.drawnId == null || card.id === S.drawnId) && roomPlayable(card, current);
      var animatedDraw = animation && animation.type === 'draw' &&
        animation.player === currentIndex && animation.cardId === card.id;
      html += cardHTML(card, (playable ? ' ok' : ' no') + (animatedDraw ? ' dealing' : ''),
        playable ? 'data-m="p:' + card.id + '"' : '');
    });
    html += '</div>';
    if (sel != null && active && currentIndex === S.t) {
      var selected = current.hand.find(function (card) { return card.id === Number(sel); });
      if (selected && selected.c === 'wild')
        html += '<div class="ovl"><p>Choose a color</p><div class="row">' +
          COLORS.map(function (color) { return '<button class="sw" style="--c:' + HEX[color] +
            '" data-m="c:' + color + '" aria-label="' + color + '"></button>'; }).join('') +
          '</div></div>';
    }
    if (S.over)
      html += '<div class="ovl"><h1>' + S.players[S.winner].name + ' wins!</h1><p>' + S.msg +
        '</p><p>Use the Restart control above to play again.</p></div>';
    return ['<div class="uno">' + html + '</div>', S.msg];
  }
  function roomClick(element) {
    var command = element.dataset.m || '';
    if (command === 'draw') return act({ type: 'draw', player: S.t });
    if (command === 'pass') return act({ type: 'pass', player: S.t });
    if (command === 'call') return act({ type: 'call', player: S.t });
    if (command.indexOf('p:') === 0) {
      var card = S.players[S.t].hand.find(function (item) { return item.id === Number(command.slice(2)); });
      if (!card) return;
      if (card.c === 'wild') { sel = card.id; return render(); }
      return act({ type: 'play', player: S.t, cardId: card.id });
    }
    if (command.indexOf('c:') === 0 && sel != null) {
      var color = command.slice(2), cardId = Number(sel); sel = null;
      return act({ type: 'play', player: S.t, cardId: cardId, color: color });
    }
  }

  var api = {
    id: 'uno', name: 'UNO', t: 'UNO', i: '🃏',
    d: 'Match colors and numbers, play action cards, and race to empty your hand against up to three computer players.',
    minPlayers: 2, maxPlayers: 4, max: 4, cat: 'classic casual', tag: 'Card game',
    diff: 'Easy to learn', art: 'art-cards', logo: 'uno.svg',
    hostedUI: true,
    n: ['Red', 'Blue', 'Green', 'Yellow'],
    init: roomInit,
    valid: roomValid,
    apply: roomApply,
    bot: roomBot,
    draw: roomDraw,
    click: roomClick,
    mount: mount, unmount: unmount, start: start,
    _t: { get G() { return G; }, botMove: botMove, drawTurn: drawTurn }
  };
  global.UnoGame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof registerGame === 'function') registerGame(api);
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
