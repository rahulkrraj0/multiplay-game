/* crazyeights.js - Crazy Eights for 2-4 players (you + 1-3 bots). First to 100 points wins.
   Add <script src="crazyeights.js"></script> to any page. Progress is saved in the browser. */
(function (global) {
  'use strict';
  var KEY = 'crazyeights-save-v1', TARGET = 100, SUITS = ['S', 'H', 'C', 'D'];
  var SYM = { S: '\u2660', H: '\u2665', C: '\u2663', D: '\u2666' }, SNAME = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
  var RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var RNAME = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
  var G = { phase: 'setup', players: [] }, root = null, timer = null, mountHost = null, shadow = null;
  var S = null, roomStyleNode = null, roomAnimationSeq = 0, roomWildCard = null;
  var roomPick = null, roomAnimationSeen = 0;
  var BTN = 'font:inherit;font-weight:800;padding:.6em 1.3em;border:0;border-radius:999px;background:linear-gradient(180deg,#f8d775,#e0aa31);color:#2b1e06;cursor:pointer;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 3px 0 #99701a,0 8px 16px rgba(0,0,0,.35)';
  var SUIT_PICKER_STYLE = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
    'background:radial-gradient(ellipse at 50% 40%,rgba(8,45,54,.95),rgba(2,12,16,.98));-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);padding:20px';
  var SUIT_GRID_STYLE = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(12px,3vw,20px)';
  var SUIT_BUTTON_STYLE = 'display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;width:clamp(88px,18vw,136px);height:clamp(88px,18vw,136px);' +
    'border-radius:26px;border:3px solid;box-shadow:inset 0 -6px 0 rgba(0,0,0,.08),0 10px 24px rgba(0,0,0,.45)';
  var SUIT_PATH = {
    S: '<path d="M12 2C12 2 3 8.5 3 14.2c0 3 2.3 5 4.9 5 1.5 0 2.8-.6 3.6-1.7-.2 2.2-.9 3.7-2.1 4.9h5.2c-1.2-1.2-1.9-2.7-2.1-4.9.8 1.1 2.1 1.7 3.6 1.7 2.6 0 4.9-2 4.9-5C21 8.5 12 2 12 2z"/>',
    H: '<path d="M12 21C4 15 2 11.5 2 8.2 2 5.4 4.2 3.2 6.9 3.2c2.2 0 4.1 1.2 5.1 3.2 1-2 2.9-3.2 5.1-3.2 2.7 0 4.9 2.2 4.9 5C22 11.5 20 15 12 21z"/>',
    C: '<circle cx="12" cy="7.3" r="4.7"/><circle cx="6.9" cy="14.2" r="4.7"/><circle cx="17.1" cy="14.2" r="4.7"/><circle cx="12" cy="12.3" r="3.2"/><path d="M12 11c0 5-1.4 8.7-3.4 11.5h6.8C13.4 19.7 12 16 12 11z"/>',
    D: '<path d="M12 1.5l8 10.5-8 10.5L4 12z"/>'
  };
  function svg(suit) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + SUIT_PATH[suit] + '</svg>'; }
  function suitButtonStyle(suit) {
    var red = suit === 'H' || suit === 'D';
    return SUIT_BUTTON_STYLE + ';background:#fbf8f1;color:' + (red ? '#c4202f' : '#171a24') +
      ';border-color:' + (red ? '#f0a4ab' : '#b4bdd2');
  }

  function playSound(event) {
    if (global.playoraSound && typeof global.playoraSound.playGame === 'function')
      global.playoraSound.playGame('crazyeights', event);
  }

  /* ---------- rules ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function deck() {
    var d = [], id = 0;
    SUITS.forEach(function (s) { for (var r = 1; r <= 13; r++) d.push({ id: id++, s: s, r: r }); });
    return d;
  }
  function cname(c) { return RNAME[c.r - 1] + ' of ' + SNAME[c.s]; }
  function short(c) { return RK[c.r - 1] + SYM[c.s]; }
  function pts(c) { return c.r === 8 ? 50 : c.r >= 11 ? 10 : c.r; } // 8 = 50, face cards = 10, Ace = 1
  function top() { return G.disc[G.disc.length - 1]; }
  function playable(c) { return c.r === 8 || c.s === G.suit || c.r === top().r; }
  function canDraw() { return G.stock.length > 0 || G.disc.length > 1; }
  function nextIdx(i) { return (i + 1) % G.players.length; }
  function take() {
    if (!G.stock.length) { // reshuffle everything under the top card
      var t = G.disc.pop(); G.stock = shuffle(G.disc); G.disc = [t];
    }
    return G.stock.pop() || null;
  }

  /* ---------- flow ---------- */
  function start(nBots) {
    playSound('start');
    var N = nBots + 1, ps = [];
    for (var i = 0; i < N; i++) ps.push({ name: i ? 'Bot ' + i : 'You', bot: i > 0, hand: [], score: 0 });
    G = { phase: 'play', players: ps, dealer: (((N - 2) % N) + N) % N, stock: [], disc: [], pick: null, round: 0 };
    newRound();
  }
  function newRound() {
    var N = G.players.length, per = N === 2 ? 7 : 5, c;
    G.stock = shuffle(deck()); G.disc = []; G.pick = null; G.lastPlayed = null; G.phase = 'play'; G.round++;
    G.players.forEach(function (p) { p.hand = []; for (var k = 0; k < per; k++) p.hand.push(G.stock.pop()); });
    do { c = G.stock.pop(); if (c.r === 8) G.stock.unshift(c); } while (c.r === 8); // never start on an 8
    G.disc.push(c); G.suit = c.s;
    G.dealer = nextIdx(G.dealer); G.turn = nextIdx(G.dealer); // the starting player rotates every round
    G.msg = 'Round ' + G.round + '. The first card is the ' + cname(c) + '.';
    afterChange();
  }
  function play(pi, id, suit) {
    playSound('move');
    var p = G.players[pi], k = p.hand.findIndex(function (c) { return c.id === id; }), c = p.hand.splice(k, 1)[0];
    G.lastPlayed = c.id;
    G.disc.push(c); G.suit = c.r === 8 ? suit : c.s;
    var msg = p.name + ' played the ' + cname(c) + (c.r === 8 ? ' and chose ' + SNAME[suit] : '') + '.';
    if (!p.hand.length) return endRound(pi, msg);
    G.turn = nextIdx(pi); G.msg = msg; afterChange();
  }
  function endRound(w, msg) {
    var sum = 0;
    G.players.forEach(function (p, i) { if (i !== w) p.hand.forEach(function (c) { sum += pts(c); }); });
    G.players[w].score += sum; G.phase = 'over'; G.winner = w; G.gain = sum; G.msg = msg;
    playSound(w === 0 ? 'win' : 'loss');
    afterChange();
  }
  function passTurn(pi, why) { G.turn = nextIdx(pi); G.msg = G.players[pi].name + (pi ? ' passes' : ' pass') + why; afterChange(); }
  function matchWinner() {
    var best = null;
    G.players.forEach(function (p, i) { if (p.score >= TARGET && (best === null || p.score > G.players[best].score)) best = i; });
    return best;
  }
  function afterChange() {
    clearTimeout(timer);
    if (root) save();
    render();
    if (root && G.phase === 'play' && G.players[G.turn].bot) timer = setTimeout(botMove, 900);
  }

  /* ---------- bots ---------- */
  function botMove() {
    if (G.phase !== 'play' || !G.players[G.turn].bot) return;
    var pi = G.turn, p = G.players[pi], drew = 0;
    while (!p.hand.some(playable) && canDraw()) { var c = take(); if (!c) break; p.hand.push(c); drew++; }
    if (drew) playSound('draw');
    var opts = p.hand.filter(playable);
    if (!opts.length) return passTurn(pi, ' (nothing to play, stock is empty).');
    var cnt = { S: 0, H: 0, C: 0, D: 0 };
    p.hand.forEach(function (x) { if (x.r !== 8) cnt[x.s]++; });
    function score(x) { return x.r === 8 ? (p.hand.length <= 2 ? 5 : -10) : cnt[x.s] + pts(x) / 20; } // keep 8s for emergencies, dump high cards
    opts.sort(function (a, b) { return score(b) - score(a); });
    var card = opts[0], suit = card.s;
    if (card.r === 8) {
      suit = SUITS.slice().sort(function (a, b) { return cnt[b] - cnt[a] || Math.random() - 0.5; })[0];
    }
    play(pi, card.id, suit);
    if (drew && G.phase === 'play') G.msg = p.name + ' drew ' + drew + (drew > 1 ? ' cards. ' : ' card. ') + G.msg;
  }

  /* ---------- save ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.players && s.players.length > 1 && s.phase && s.phase !== 'setup') return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- UI ---------- */
  function pipLayout(rank) {
    function cols(rows) {
      var positions = [];
      rows.forEach(function (row) { positions.push([0, row], [2, row]); });
      return positions;
    }
    var layouts = {
      2: [[1, 0], [1, 1]], 3: [[1, 0], [1, 0.5], [1, 1]], 4: cols([0, 1]),
      5: cols([0, 1]).concat([[1, 0.5]]), 6: cols([0, 0.5, 1]),
      7: cols([0, 0.5, 1]).concat([[1, 0.25]]),
      8: cols([0, 0.5, 1]).concat([[1, 0.25], [1, 0.75]]),
      9: cols([0, 1 / 3, 2 / 3, 1]).concat([[1, 0.5]]),
      10: cols([0, 1 / 3, 2 / 3, 1]).concat([[1, 1 / 6], [1, 5 / 6]])
    };
    return layouts[rank] || [];
  }
  function cardHTML(c, cls, attrs) {
    var tag = attrs ? 'button type="button"' : 'div', col = c.s === 'H' || c.s === 'D' ? ' r' : ' b', rank = c.r, middle;
    function index(extra) { return '<i class="ix' + extra + '">' + RK[rank - 1] + svg(c.s) + '</i>'; }
    if (rank >= 11) middle = '<span class="ct"><b>' + RK[rank - 1] + '</b>' + svg(c.s) + svg(c.s) + '</span>';
    else if (rank === 1) middle = '<span class="pp"><span class="big" style="left:50%;top:50%">' + svg(c.s) + '</span></span>';
    else middle = '<span class="pp">' + pipLayout(rank).map(function (position) {
      return '<span' + (position[1] > 0.5 ? ' class="f"' : '') + ' style="left:' + [32, 50, 68][position[0]] +
        '%;top:' + (23 + position[1] * 54).toFixed(1) + '%">' + svg(c.s) + '</span>';
    }).join('') + '</span>';
    return '<' + tag + ' class="card' + col + (rank === 8 ? ' w8' : '') + (cls || '') + '" ' + (attrs || '') +
      ' aria-label="' + cname(c) + '">' + index(rank === 10 ? ' ten' : '') + middle +
      index((rank === 10 ? ' ten' : '') + ' br') + '</' + tag.split(' ')[0] + '>';
  }
  function scoreChip(player, active, tag) {
    var progress = Math.min(100, Math.round(player.score / TARGET * 100));
    return '<span class="pl' + (active ? ' on' : '') + '"><i class="pn">' + roomEscape(player.name) +
      (tag || '') + '</i><b>' + player.score + '</b><span class="pg" style="--p:' + progress + '%"></span></span>';
  }
  function heroHTML() {
    return '<div class="hero">' + ['S', 'H', 'D'].map(function (suit, index) {
      return cardHTML({ id: -1 - index, s: suit, r: 8 });
    }).join('') + '</div>';
  }
  function handGridPosition(index, count) {
    var columns = 8, row = Math.ceil(count / columns), remainder = count % columns || columns;
    var lastRowStart = count - remainder;
    if (index < lastRowStart) return '';
    var startColumn = Math.floor((columns * 2 - remainder * 2) / 2) + 1;
    return 'style="--hand-row:' + row + ';--hand-column:' + (startColumn + (index - lastRowStart) * 2) + '"';
  }
  var BACK = '<div class="card back"></div>';
  function render() {
    if (!root) return;
    var keep = root.querySelector('.hand'), sl = keep ? keep.scrollLeft : 0, h = '';
    if (G.phase === 'setup') {
      root.innerHTML = '<div class="ovl">' + heroHTML() + '<h1>Crazy Eights</h1><p>Play a card that matches the suit or rank of the top card. Eights are wild: play one any time and choose the suit. ' +
        'No playable card? Draw until you get one. First to empty their hand scores the points left in the others\u2019 hands; first to ' + TARGET + ' wins.</p>' +
        '<p>Play against</p><div class="row">' + [1, 2, 3].map(function (n) { return '<button class="btn" data-a="start" data-v="' + n + '">' + n + (n > 1 ? ' bots' : ' bot') + '</button>'; }).join('') + '</div></div>';
      return;
    }
    var me = G.players[0], active = G.phase === 'play', mine = active && G.turn === 0 && G.pick == null;
    var needDraw = mine && !me.hand.some(playable), draw = needDraw && canDraw();
    h += '<div class="bar"><b class="logo">Crazy Eights</b><span class="sc">' + G.players.map(function (p, i) {
      return scoreChip(p, active && G.turn === i, p.bot ? ' 🤖' : '');
    }).join('') +
      '</span><button class="btn small alt" data-a="new">New game</button></div><div class="opps">';
    G.players.forEach(function (p, i) {
      if (!i) return;
      var n = p.hand.length, fan = '';
      for (var k = 0; k < Math.min(n, 8); k++) fan += BACK;
      h += '<div class="opp' + (active && G.turn === i ? ' on' : '') + '"><div class="fan">' + fan + '</div><span class="nm">' + p.name + '</span><span class="n">' +
        n + (n === 1 ? ' card' : ' cards') + '</span></div>';
    });
    var red = G.suit === 'H' || G.suit === 'D';
    h += '</div><div class="table"><button class="pile' + (draw ? ' ok' : '') + '" data-a="draw" aria-label="Draw a card"' + (draw ? '' : ' disabled') + '>' + BACK +
      '<span>Draw (' + G.stock.length + ')</span></button><div class="cur">' + cardHTML(top(), top().id === G.lastPlayed ? ' fresh' : '') + '<span class="suit' + (red ? ' red' : '') + '">' + svg(G.suit) + SNAME[G.suit] + '</span></div></div>';
    var hint = !active ? '' : G.turn !== 0 ? G.players[G.turn].name + ' is thinking\u2026' : needDraw ? (canDraw() ? 'No playable card. Draw from the pile.' : 'Nothing to play and the pile is empty.') : 'Your turn.';
    h += '<div class="msg">' + G.msg + '<small>' + hint + '</small></div><div class="acts">';
    if (needDraw && !canDraw()) h += '<button class="btn" data-a="pass">Pass</button>';
    h += '</div><div class="hand">';
    var hand = me.hand.slice().sort(function (a, b) { return SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || a.r - b.r; });
    hand.forEach(function (c, index) {
      var ok = mine && playable(c);
      h += cardHTML(c, mine ? (ok ? ' ok' : ' no') : '',
        'data-a="card" data-v="' + c.id + '" ' + handGridPosition(index, hand.length));
    });
    h += '</div>';
    if (G.pick != null) {
      h += '<div class="ovl suit-picker" style="' + SUIT_PICKER_STYLE + '"><p>Choose a suit</p><div class="row" style="' + SUIT_GRID_STYLE + '">' + SUITS.map(function (s) {
        return '<button class="sw' + (s === 'H' || s === 'D' ? ' red' : '') + '" style="' + suitButtonStyle(s) + '" data-a="suit" data-v="' + s + '" aria-label="' + SNAME[s] + '">' + svg(s) + '</button>';
      }).join('') + '</div></div>';
    }
    if (G.phase === 'over') {
      var mw = matchWinner(), w = G.players[G.winner];
      h += '<div class="ovl"><h1>' + (mw !== null ? (mw === 0 ? 'You win the game!' : G.players[mw].name + ' wins the game') : (G.winner === 0 ? 'You win the round!' : w.name + ' wins the round')) + '</h1><p>' +
        (mw !== null ? '' : w.name + ' scores ' + G.gain + ' points. ') + 'Scores: ' + G.players.map(function (p) { return p.name + ' ' + p.score; }).join(', ') +
        '.</p><button class="btn" data-a="next">' + (mw !== null ? 'New game' : 'Next round') + '</button></div>';
    }
    root.innerHTML = h;
    if (typeof global.playoraStackHandCards === 'function') global.playoraStackHandCards(root);
    var nh = root.querySelector('.hand'); if (nh) nh.scrollLeft = sl;
  }
  function onClick(e) {
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v'), mine = G.phase === 'play' && G.turn === 0 && G.pick == null, me = G.players[0];
    if (a === 'start') start(+v);
    else if (a === 'new') {
      if (typeof confirm === 'function' && G.phase !== 'over' && !confirm('Start a new game? Your current game will be lost.')) return;
      clearTimeout(timer); G = { phase: 'setup', players: [] }; clearSave(); render();
    }
    else if (a === 'next') {
      playSound('next');
      if (matchWinner() !== null) { clearTimeout(timer); G = { phase: 'setup', players: [] }; clearSave(); render(); } else newRound();
    }
    else if (a === 'suit' && G.pick != null) { var id = G.pick; G.pick = null; play(0, id, v); }
    else if (!mine) return;
    else if (a === 'card') {
      var c = me.hand.find(function (x) { return x.id === +v; });
      if (!c) return;
      if (!playable(c)) { G.msg = 'Play a ' + SNAME[G.suit] + ' card, a ' + RNAME[top().r - 1] + ', or an 8.'; return render(); }
      if (c.r === 8) { playSound('menu'); G.pick = c.id; return render(); }
      play(0, c.id);
    }
    else if (a === 'draw' && !me.hand.some(playable) && canDraw()) {
      playSound('draw');
      var d = take(); if (d) me.hand.push(d);
      G.msg = 'You drew the ' + (d ? cname(d) : 'last card') + '.'; afterChange();
    }
    else if (a === 'pass' && !me.hand.some(playable) && !canDraw()) passTurn(0, '.');
  }

  function roomCount() { return Math.max(2, Math.min(4, Number(np) || 2)); }
  function roomBotSeat(index) {
    var humans = typeof ids !== 'undefined' && ids.length ? ids.length :
      (typeof localBot !== 'undefined' && localBot ? 1 : Number(np) || 2);
    return index >= humans;
  }
  function roomPlayerName(index) {
    if (roomBotSeat(index)) return 'Computer ' + (index - ((typeof ids !== 'undefined' && ids.length) ? ids.length :
      (typeof localBot !== 'undefined' && localBot ? 1 : Number(np) || 2)) + 1);
    if (typeof gamePlayerNames !== 'undefined' && gamePlayerNames[index] && gamePlayerNames[index] !== 'Computer') return gamePlayerNames[index];
    if (typeof nm === 'function') return nm(index);
    return 'Player ' + (index + 1);
  }
  function roomRandom() {
    S.rng = (Math.imul(S.rng >>> 0, 1664525) + 1013904223) >>> 0;
    return S.rng / 4294967296;
  }
  function roomShuffle(cards) {
    for (var i = cards.length - 1; i > 0; i--) {
      var j = Math.floor(roomRandom() * (i + 1)), card = cards[i];
      cards[i] = cards[j]; cards[j] = card;
    }
    return cards;
  }
  function roomTake(count) {
    var cards = [];
    while (count-- > 0) {
      if (!S.stock.length) {
        if (S.disc.length <= 1) break;
        var topCard = S.disc.pop();
        S.stock = roomShuffle(S.disc);
        S.disc = [topCard];
      }
      if (S.stock.length) cards.push(S.stock.pop());
    }
    return cards;
  }
  function roomNext(from, steps) {
    var count = S.players.length;
    return ((from + S.dir * steps) % count + count) % count;
  }
  function roomTop() { return S.disc[S.disc.length - 1]; }
  function roomPlayable(card, player) {
    return !!card && (card.r === 8 || card.s === S.color || card.r === roomTop().r);
  }
  function roomCanDraw(player) {
    var drawnCard = player.hand.find(function (card) { return card.id === S.drawnId; });
    var canDrawCard = S.stock.length > 0 || S.disc.length > 1;
    if (!canDrawCard) return false;
    return drawnCard && S.drawnId != null ? !roomPlayable(drawnCard, player) :
      !player.hand.some(function (card) { return roomPlayable(card, player); });
  }
  function roomCanPass(player) {
    if (S.stock.length > 0 || S.disc.length > 1) return false;
    var drawnCard = player.hand.find(function (card) { return card.id === S.drawnId; });
    return drawnCard && S.drawnId != null ? !roomPlayable(drawnCard, player) :
      !player.hand.some(function (card) { return roomPlayable(card, player); });
  }
  function roomInit() {
    roomWildCard = null;
    roomAnimationSeq = 0;
    var count = roomCount(), seed = Math.floor(Math.random() * 4294967296) >>> 0;
    S = {
      players: Array.from({ length: count }, function (_, index) {
        return { name: roomPlayerName(index), bot: roomBotSeat(index), hand: [], score: 0 };
      }),
      dealer: count - 2, turn: 0, t: 0, dir: 1, stock: [], disc: [], color: '',
      drawnId: null, round: 0, phase: 'roundend', over: false, winner: -1, msg: 'New game.',
      rng: seed || 1, animationSeq: 0, animation: null
    };
    roomNewRound();
    return S;
  }
  function roomNewRound() {
    S.stock = roomShuffle(deck());
    S.disc = [];
    S.dir = 1;
    S.drawnId = null;
    S.phase = 'play';
    S.over = false;
    S.winner = -1;
    S.round++;
    var perPlayer = S.players.length === 2 ? 7 : 5;
    S.players.forEach(function (player) { player.hand = roomTake(perPlayer); });
    var first;
    do {
      first = roomTake(1)[0];
      if (first && first.r === 8) S.stock.unshift(first); // never start on an 8: return it to the bottom of the deck
    } while (first && first.r === 8);
    if (!first) throw new Error('Crazy Eights could not deal a starting card.');
    S.disc.push(first);
    S.color = first.s;
    S.dealer = (S.dealer + 1) % S.players.length;
    S.turn = roomNext(S.dealer, 1);
    S.msg = 'Round ' + S.round + '. The first card is the ' + cname(first) + '.';
    S.t = S.turn;
    S.animation = null;
  }
  function roomValid(action) {
    if (!action || typeof action !== 'object' || S.over || action.player !== S.t ||
        !Number.isInteger(action.player) || !S.players[action.player]) return false;
    var player = S.players[S.t];
    if (S.phase === 'roundend') return action.type === 'next' && !S.over;
    if (S.phase !== 'play') return false;
    if (action.type === 'draw') return roomCanDraw(player);
    if (action.type === 'pass') return roomCanPass(player);
    if (action.type !== 'play' || !Number.isInteger(action.cardId)) return false;
    var card = player.hand.find(function (item) { return item.id === action.cardId; });
    if (!card || !roomPlayable(card, player) || (S.drawnId != null && action.cardId !== S.drawnId)) return false;
    return card.r !== 8 || SUITS.includes(action.suit);
  }
  function roomApply(action) {
    if (!roomValid(action)) return;
    var pi = S.t, player = S.players[pi];
    if (action.type === 'next') { roomNewRound(); return; }
    if (action.type === 'draw') {
      var drawn = roomTake(1)[0];
      if (!drawn) { S.msg = 'The draw pile is empty.'; return; }
      player.hand.push(drawn);
      S.drawnId = drawn.id;
      S.animation = { seq: ++S.animationSeq, type: 'draw', player: pi, cardId: drawn.id };
      S.msg = 'You drew a card' + (roomPlayable(drawn, player) ? ' and may play it.' : '. Draw again or pass when the pile is empty.');
      return;
    }
    if (action.type === 'pass') {
      S.drawnId = null;
      S.turn = roomNext(pi, 1);
      S.t = S.turn;
      S.msg = player.name + ' passed.';
      return;
    }
    var index = player.hand.findIndex(function (card) { return card.id === action.cardId; });
    var card = player.hand.splice(index, 1)[0];
    S.disc.push(card);
    S.drawnId = null;
    S.color = card.r === 8 ? action.suit : card.s;
    S.animation = { seq: ++S.animationSeq, type: 'play', cardId: card.id };
    S.msg = player.name + ' played the ' + cname(card) + (card.r === 8 ? ' and chose ' + SNAME[S.color] : '') + '.';
    if (!player.hand.length) {
      var points = S.players.reduce(function (sum, p, playerIndex) {
        return sum + (playerIndex === pi ? 0 : p.hand.reduce(function (cardsPoints, held) { return cardsPoints + pts(held); }, 0));
      }, 0);
      player.score += points;
      S.phase = 'roundend';
      S.winner = pi;
      var matchWinner = S.players.map(function (p, playerIndex) { return { score: p.score, index: playerIndex }; })
        .filter(function (p) { return p.score >= TARGET; })
        .sort(function (a, b) { return b.score - a.score; })[0];
      S.over = !!matchWinner;
      S.msg += ' ' + player.name + ' scores ' + points + (points === 1 ? ' point.' : ' points.');
      if (S.over) S.winner = matchWinner.index;
      return;
    }
    S.turn = roomNext(pi, 1);
    S.t = S.turn;
  }
  function roomBot() {
    var pi = S && S.t, player = S && S.players[pi];
    if (!player || !player.bot || S.over) return null;
    if (S.phase === 'roundend') return { type: 'next', player: pi };
    var options = player.hand.filter(function (card) {
      return (S.drawnId == null || card.id === S.drawnId) && roomPlayable(card, player);
    });
    if (!options.length) {
      if (roomCanDraw(player)) return { type: 'draw', player: pi };
      if (roomCanPass(player)) return { type: 'pass', player: pi };
      return null;
    }
    var counts = { S: 0, H: 0, C: 0, D: 0 };
    player.hand.forEach(function (card) { if (card.r !== 8) counts[card.s]++; });
    options.sort(function (a, b) {
      var valueA = a.r === 8 ? (player.hand.length <= 2 ? 5 : -10) : counts[a.s] + pts(a) / 20;
      var valueB = b.r === 8 ? (player.hand.length <= 2 ? 5 : -10) : counts[b.s] + pts(b) / 20;
      return valueB - valueA;
    });
    var card = options[0], suit = card.r === 8
      ? SUITS.slice().sort(function (a, b) { return counts[b] - counts[a]; })[0]
      : card.s;
    return { type: 'play', player: pi, cardId: card.id, suit: suit };
  }
  function roomEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function scopeRoomStyles(css, scope) {
    function transform(text, keyframes) {
      var output = '', cursor = 0;
      while (cursor < text.length) {
        var open = text.indexOf('{', cursor);
        if (open < 0) { output += text.slice(cursor); break; }
        var header = text.slice(cursor, open), depth = 1, end = open + 1;
        while (end < text.length && depth) {
          if (text[end] === '{') depth++;
          else if (text[end] === '}') depth--;
          end++;
        }
        var body = text.slice(open + 1, end - 1), trimmed = header.trim(), nextBody = body;
        if (/^@(?:media|supports|container|layer)\b/i.test(trimmed)) nextBody = transform(body, false);
        else if (/^@keyframes\b/i.test(trimmed)) nextBody = transform(body, true);
        else if (!keyframes && trimmed.charAt(0) !== '@') {
          header = header.replace(/(^|,)\s*([^,]+)/g, function (_, comma, selector) {
            selector = selector.trim();
            return comma + ' ' + (selector.indexOf(scope) === 0 ? selector : scope + ' ' + selector);
          });
        }
        output += header + '{' + nextBody + '}';
        cursor = end;
      }
      return output;
    }
    return transform(css, false);
  }
  function roomDraw() {
    if (!roomStyleNode && typeof document !== 'undefined') {
      roomStyleNode = document.createElement('style');
      roomStyleNode.id = 'crazyeights-room-style';
      roomStyleNode.textContent = scopeRoomStyles(CSS, '.ce-room') +
        `#room #bd .ce-room button.card{width:var(--cw);height:calc(var(--cw)*1.45);flex:0 0 var(--cw);margin:0;padding:0;border:var(--edge);border-radius:calc(var(--cw)*.09);background:var(--face);color:var(--k);font:inherit;text-align:left;box-shadow:var(--sh);appearance:none;-webkit-appearance:none;overflow:hidden}
#room #bd .ce-room .hand button.card:first-child{margin-left:auto}#room #bd .ce-room .hand button.card:last-child{margin-right:auto}
#room #bd .ce-room .hand{padding-top:28px;padding-bottom:20px;margin-top:5px}
#room #bd .ce-room .hand button.card+button.card{margin-left:calc(var(--w)*-.45)}
#room #bd .ce-room .hand{max-width:1160px;margin-left:auto;margin-right:auto}
#room #bd .ce-room .acts{order:1}#room #bd .ce-room .hand{order:2}#room #bd .ce-room .msg{order:3;margin-top:8px}
#room #bd .ce-room .ce{box-sizing:border-box;padding-bottom:calc(5vh + env(safe-area-inset-bottom,0px))}
@media(min-width:601px){#room #bd .ce-room .hand{flex-wrap:wrap;justify-content:center;overflow-x:hidden;overflow-y:hidden}#room #bd .ce-room .hand .card:first-child{margin-left:0}#room #bd .ce-room .hand .card:last-child{margin-right:0}}
@media(max-width:600px){#room #bd .ce-room .ce{--w:clamp(36px,min(18vw,calc((100vw - 40px)/7)),76px);box-sizing:border-box;padding-bottom:5vh}#room #bd .ce-room .hand{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:none;grid-auto-rows:calc(var(--w)*.95);align-content:center;justify-items:center;gap:0;overflow:visible;padding:20px 8px calc(10px + var(--w)*.5 + env(safe-area-inset-bottom,0px));grid-template-columns:repeat(16,minmax(0,1fr))}#room #bd .ce-room .hand button.card{margin:0;grid-column:span 2}#room #bd .ce-room .hand button.card[style*="--hand-row"]{grid-row:var(--hand-row);grid-column:var(--hand-column)}#room #bd .ce-room .acts{margin-top:4px}}
@media(max-width:520px){#room #bd .ce-room .hand{padding-bottom:calc(32px + env(safe-area-inset-bottom,0px))}}
@media(max-width:520px) and (max-height:700px){#room #bd .ce-room .ce{--w:clamp(36px,min(12vw,12vh),46px)}#room #bd .ce-room .hand{padding-top:24px}}
@media(max-height:380px) and (orientation:landscape){#room #bd .ce-room .ce{--w:clamp(30px,min(8vw,10vh),40px);padding-bottom:0!important}#room #bd .ce-room .bar{padding:4px 10px}#room #bd .ce-room .bar .logo{font-size:16px}#room #bd .ce-room .opps{gap:4px;padding:2px 8px}#room #bd .ce-room .opp{gap:2px;padding:2px 6px;font-size:11px}#room #bd .ce-room .table{gap:calc(var(--w)*1.6)}#room #bd .ce-room .msg{font-size:12px;min-height:0;padding:2px 8px}#room #bd .ce-room .acts{gap:6px;min-height:34px}#room #bd .ce-room .btn{padding:.4em .8em}#room #bd .ce-room .hand{padding:8px 8px 4px;margin-top:0}#room #bd .ce-room .hand .card.ok{transform:translateY(-5px)}}` +
        '#bd .ce-room .ce button{width:auto;margin:0}#bd .ce-room .ce .btn{' + BTN + '}' +
        '#bd .ce-room .ce .btn.alt{background:rgba(255,255,255,.1);color:#fff;box-shadow:inset 0 0 0 2px rgba(255,255,255,.45)}' +
        '@media(prefers-reduced-motion:reduce){.ce-room *,.ce-room *::before,.ce-room *::after{animation:none!important;transition:none!important}}';
      document.head.appendChild(roomStyleNode);
    }
    var currentIndex = typeof seat === 'number' && seat >= 0 && seat < S.players.length ? seat :
      (typeof ids !== 'undefined' && ids.length ? -1 :
        (S.players[S.t].bot ? S.players.findIndex(function (player) { return !player.bot; }) : S.t));
    var current = currentIndex >= 0 ? S.players[currentIndex] : null;
    var active = currentIndex === S.t && !S.over && (typeof canAct !== 'function' || canAct());
    var fresh = S.animation && S.animation.seq > roomAnimationSeq ? S.animation : null;
    if (fresh) roomAnimationSeq = fresh.seq;
    var drawAnimating = fresh && fresh.type === 'draw' && fresh.player === currentIndex;
    var turnPlayer = S.players[S.t], canDraw = active && roomCanDraw(turnPlayer);
    var topCard = roomTop(), html = '<div class="ce-room"><div class="ce"><div class="bar"><b class="logo">Crazy Eights</b><span class="sc">' +
      S.players.map(function (player, index) {
        return scoreChip(player, index === S.t, player.bot ? ' 🤖' : '');
      }).join('') +
      '</span></div><div class="opps">';
    S.players.forEach(function (player, index) {
      if (index === currentIndex) return;
      html += '<div class="opp' + (S.t === index ? ' on' : '') + '"><div class="fan">' +
        Array(Math.min(player.hand.length, 8)).fill(BACK).join('') + '</div><span class="nm">' + roomEscape(player.name) +
        (player.bot ? ' 🤖' : '') + '</span><span class="n">' + player.hand.length + ' cards</span></div>';
    });
    html += '</div><div class="table"><button class="pile' + (canDraw ? ' ok' : '') +
      '" data-m="draw" aria-label="Draw a card"' + (!canDraw ? ' disabled' : '') +
      '>' + BACK + '<span>Draw (' + S.stock.length + ')</span></button><div class="cur">' +
      cardHTML(topCard, fresh && fresh.type === 'play' && fresh.cardId === topCard.id ? ' fresh' : '') +
      '<span class="suit' + (S.color === 'H' || S.color === 'D' ? ' red' : '') + '">' + svg(S.color) + ' ' + SNAME[S.color] + '</span></div></div>' +
      '<div class="msg">' + roomEscape(S.msg) + '<small>' + (S.over ? 'Use Restart to play again.' :
        S.phase === 'roundend' ? (active ? 'Start the next round.' : S.players[S.t].name + ' is thinking…') :
          active ? (S.drawnId != null ? (roomPlayable(turnPlayer.hand.find(function (card) { return card.id === S.drawnId; }), turnPlayer)
            ? 'Play the card you drew.' : canDraw ? 'That card cannot be played. Draw again.' : 'Nothing playable; pass.') :
            'Your turn: play a card or draw.') :
            S.players[S.t].name + ' is playing…') + '</small></div><div class="acts">';
    if (active && S.phase === 'play' && roomCanPass(turnPlayer))
      html += '<button class="btn alt" data-m="pass">Pass</button>';
    html += '</div><div class="hand">';
    if (current) {
      var hand = current.hand.slice().sort(function (a, b) { return SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || a.r - b.r; });
      hand.forEach(function (card, index) {
        var allowed = active && S.phase === 'play' && roomPlayable(card, current) &&
          (S.drawnId == null || card.id === S.drawnId);
        var drawn = drawAnimating && fresh.cardId === card.id;
        html += cardHTML(card, (allowed ? ' ok' : ' no') + (drawn ? ' dealing' : ''),
          (allowed ? 'data-m="card:' + card.id + '"' : '') + ' ' + handGridPosition(index, hand.length));
      });
    }
    html += '</div>';
    if (roomWildCard != null && active) html += '<div class="ovl suit-picker" style="' + SUIT_PICKER_STYLE + '"><p>Choose a suit</p><div class="row" style="' + SUIT_GRID_STYLE + '">' +
      SUITS.map(function (suit) { return '<button class="sw' + (suit === 'H' || suit === 'D' ? ' red' : '') +
        '" style="' + suitButtonStyle(suit) + '" data-m="suit:' + suit + '" aria-label="' + SNAME[suit] + '">' + svg(suit) + '</button>'; }).join('') +
      '</div></div>';
    if (S.phase === 'roundend') {
      var winner = S.players[S.winner];
      html += '<div class="ovl"><h1>' + roomEscape(winner.name) + (S.over ? ' wins the game!' : ' wins the round!') +
        '</h1><p>' + roomEscape(S.msg) + ' Scores: ' + S.players.map(function (player) {
          return roomEscape(player.name) + ' ' + player.score;
        }).join(', ') + '.</p>' + (S.over ? '<p>Use Restart to play again.</p>' :
          active ? '<button class="btn" data-m="next">Next round</button>' : '') + '</div>';
    }
    return ['<div class="ce-room">' + html.slice('<div class="ce-room">'.length) + '</div>', S.msg];
  }
  function roomClick(element) {
    if (!S || !element || !element.dataset || S.over) return;
    var command = element.dataset.m || '', action = null;
    if (command.indexOf('card:') === 0) {
      var cardId = Number(command.slice(5)), card = S.players[S.t].hand.find(function (item) { return item.id === cardId; });
      if (!card || !roomPlayable(card, S.players[S.t])) return;
      if (card.r === 8) {
        roomWildCard = cardId;
        if (root) render();
        else if (typeof global.render === 'function') global.render();
        return;
      }
      action = { type: 'play', player: S.t, cardId: cardId, suit: card.s };
    } else if (command.indexOf('suit:') === 0 && roomWildCard != null) {
      action = { type: 'play', player: S.t, cardId: roomWildCard, suit: command.slice(5) };
      roomWildCard = null;
    } else if (command === 'draw' || command === 'pass' || command === 'next') {
      action = { type: command, player: S.t };
    }
    if (action && roomValid(action) && typeof act === 'function') act(action);
  }
  function roomSoundEvents(action) {
    if (action.type === 'draw') return ['draw'];
    if (action.type === 'next') return ['next'];
    return [action.type === 'play' ? 'move' : 'menu'];
  }

  var CSS = [
    '.ce{position:absolute;inset:0;display:flex;flex-direction:column;color:#f6f1e4;overflow:hidden;user-select:none;-webkit-user-select:none;',
    'font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;--w:clamp(44px,min(12.2vw,15vh),92px);--ink:#171a24;--red:#c4202f;--brass:#e9b949;',
    'background:radial-gradient(120% 80% at 50% 38%,rgba(34,140,155,.5),rgba(34,140,155,0) 65%),radial-gradient(130% 100% at 50% 42%,rgba(0,0,0,0) 52%,rgba(1,12,16,.72) 100%),',
    'repeating-linear-gradient(0deg,rgba(255,255,255,.02) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px),#0d4651}',
    '.ce *{box-sizing:border-box}',
    '.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;flex:none;font-size:13px}',
    '.bar .logo{font-family:Georgia,"Times New Roman",serif;font-weight:800;font-size:20px;line-height:1;color:var(--brass);text-shadow:0 1px 0 rgba(0,0,0,.35)}',
    '.sc{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}',
    '.pl{position:relative;display:flex;align-items:baseline;gap:8px;padding:5px 12px 9px;border-radius:12px;background:rgba(2,18,24,.38);border:1px solid rgba(255,255,255,.1);transition:border-color .25s,box-shadow .25s}',
    '.pl b{font-size:16px;font-variant-numeric:tabular-nums}.pl .pn{font-style:normal;opacity:.85}',
    '.pg{position:absolute;left:10px;right:10px;bottom:4px;height:3px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}',
    '.pg::after{content:"";display:block;height:100%;width:var(--p);border-radius:inherit;background:linear-gradient(90deg,#c98d1d,#f7dc84);transition:width .6s cubic-bezier(.2,.8,.2,1)}',
    '.pl.on{border-color:var(--brass);box-shadow:0 0 0 1px rgba(233,185,73,.35),0 0 18px rgba(233,185,73,.22)}',
    '.btn{' + BTN + ';transition:transform .12s,box-shadow .12s}.btn:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 0 #99701a,0 4px 8px rgba(0,0,0,.35)}',
    '.btn.small{padding:.45em 1em;font-size:13px}.btn.alt{background:rgba(255,255,255,.1);color:#fff;box-shadow:inset 0 0 0 2px rgba(255,255,255,.45)}',
    '.opps{display:flex;justify-content:space-around;gap:8px;padding:4px 10px;flex:none}',
    '.opp{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 12px;border-radius:14px;font-size:13px;border:1.5px solid transparent;background:rgba(2,18,24,.22);transition:border-color .25s,background .25s}',
    '.opp.on{border-color:var(--brass);background:rgba(233,185,73,.13);box-shadow:0 0 16px rgba(233,185,73,.2)}',
    '.opp .nm{font-weight:800}.opp .n{font-size:11px;padding:1px 8px;border-radius:999px;background:rgba(0,0,0,.3)}',
    '.fan{display:flex;height:calc(var(--w)*.63)}.fan .card+.card{margin-left:calc(var(--w)*-.22)}.fan .card{--cw:calc(var(--w)*.42);--sh:0 1px 2px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.3)}',
    '.table{position:relative;isolation:isolate;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;gap:calc(var(--w)*2.5)}',
    '.table::before{content:"";position:absolute;z-index:-1;left:50%;top:50%;width:min(94%,calc(var(--w)*7.6));height:min(92%,calc(var(--w)*2.35 + 46px));transform:translate(-50%,-50%);border-radius:999px;border:2px dashed rgba(233,185,73,.4);background:radial-gradient(closest-side,rgba(0,0,0,.28),rgba(0,0,0,.08) 80%,transparent);box-shadow:0 0 0 6px rgba(0,0,0,.08)}',
    '.pile{background:none;border:0;padding:0;display:flex;flex-direction:column;align-items:center;gap:8px;color:#f6f1e4;font:inherit;font-size:12px}',
    '.pile .card{box-shadow:1px 1px 0 #6a1320,2px 2px 0 #f1e9d8,3px 3px 0 #6a1320,4px 4px 0 #f1e9d8,5px 8px 12px rgba(0,0,0,.45)}',
    '.pile span{opacity:.85}.pile:disabled{opacity:1}.pile.ok{cursor:pointer}.pile.ok .card{box-shadow:0 0 0 3px var(--brass),0 0 24px rgba(233,185,73,.6),4px 8px 12px rgba(0,0,0,.45)}.pile.ok span{opacity:1;font-weight:800;color:var(--brass)}',
    '.cur{display:flex;flex-direction:column;align-items:center;gap:8px}.suit{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;background:#fbf8f1;color:var(--ink);border-radius:999px;padding:3px 12px 3px 9px;box-shadow:0 2px 6px rgba(0,0,0,.35)}',
    '.suit svg{width:15px;height:15px;fill:currentColor}.suit.red{color:var(--red)}',
    '.card{--cw:var(--w);--k:var(--ink);--face:linear-gradient(158deg,#fffefa,#fbf8f1 52%,#eee6d4);--edge:1px solid rgba(23,26,36,.2);--sh:0 1px 1px rgba(0,0,0,.28),0 5px 12px rgba(0,0,0,.34);position:relative;flex:none;width:var(--cw);height:calc(var(--cw)*1.45);padding:0;border-radius:calc(var(--cw)*.09);background:var(--face);border:var(--edge);color:var(--k);font:inherit;box-shadow:var(--sh);overflow:hidden}',
    '.card.r{--k:var(--red)}.card.b{--k:var(--ink)}.card svg{display:block;fill:currentColor}.card.w8{--face:linear-gradient(158deg,#fffdf4,#fbf3dc 55%,#f0e0b0)}',
    '.card.w8::after{content:"";position:absolute;inset:3%;border:1px solid rgba(190,138,28,.85);border-radius:calc(var(--cw)*.06);pointer-events:none}',
    '.ix{position:absolute;left:7%;top:4.5%;display:flex;flex-direction:column;align-items:center;font-family:Georgia,"Times New Roman",serif;font-weight:800;font-style:normal;font-size:calc(var(--cw)*.22);line-height:1}',
    '.ix svg{width:calc(var(--cw)*.17);height:calc(var(--cw)*.17);margin-top:calc(var(--cw)*.03)}.ix.ten{letter-spacing:-.09em}.ix.br{left:auto;top:auto;right:7%;bottom:4.5%;transform:rotate(180deg)}',
    '.pp{position:absolute;inset:0}.pp span{position:absolute;width:calc(var(--cw)*.17);height:calc(var(--cw)*.17);transform:translate(-50%,-50%)}',
    '.pp span.f{transform:translate(-50%,-50%) rotate(180deg)}.pp span.big{width:calc(var(--cw)*.5);height:calc(var(--cw)*.5)}.pp svg{width:100%;height:100%}',
    '.ct{position:absolute;inset:15% 23%;display:flex;align-items:center;justify-content:center;border:1.5px solid currentColor;border-radius:calc(var(--cw)*.05);background:linear-gradient(135deg,rgba(233,185,73,.3),rgba(233,185,73,0) 62%),repeating-linear-gradient(45deg,rgba(23,26,36,.05) 0 2px,transparent 2px 6px)}',
    '.ct b{font-family:Georgia,"Times New Roman",serif;font-size:calc(var(--cw)*.5);line-height:1}.ct svg{position:absolute;width:calc(var(--cw)*.15);height:calc(var(--cw)*.15)}.ct b+svg{left:8%;top:5%}.ct svg+svg{right:8%;bottom:5%;transform:rotate(180deg)}',
    '.card.back{background:repeating-linear-gradient(45deg,rgba(255,226,160,.24) 0 1px,transparent 1px 5px),repeating-linear-gradient(-45deg,rgba(255,226,160,.24) 0 1px,transparent 1px 5px),#9c1f2e;border:max(2px,calc(var(--cw)*.05)) solid #fbf8f1}',
    '.card.back::after{content:"";position:absolute;inset:calc(var(--cw)*.045);border:1px solid rgba(233,185,73,.85);border-radius:calc(var(--cw)*.05)}',
    '.msg{text-align:center;font-size:14px;padding:4px 12px;min-height:3.4em;flex:none;text-shadow:0 1px 2px rgba(0,0,0,.4)}.msg small{display:block;margin-top:2px;color:var(--brass);font-weight:600}',
    '.acts{display:flex;justify-content:center;gap:10px;min-height:44px;flex:none}.hand{display:flex;overflow-x:auto;overflow-y:hidden;padding:20px 14px 12px;flex:none}.hand .card:first-child{margin-left:auto}.hand .card:last-child{margin-right:auto}',
    '.hand .card+.card{margin-left:calc(var(--w)*-.4)}.hand .card{cursor:default}.hand .card.ok{--sh:0 0 0 3px var(--brass),0 0 14px 2px rgba(233,185,73,.5),0 8px 16px rgba(0,0,0,.5);position:relative;z-index:2;transform:translateY(-14px);cursor:pointer}.hand .card.no{filter:brightness(.62) saturate(.8)}',
    '.ovl{position:absolute;inset:0;z-index:5;background:radial-gradient(ellipse at 50% 40%,rgba(8,45,54,.88),rgba(2,12,16,.95));-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:20px}',
    '.ovl.suit-picker{z-index:9999}.ovl.suit-picker .row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(12px,3vw,20px)}',
    '.ovl h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(34px,9vw,60px);line-height:1.05;color:var(--brass);background:linear-gradient(180deg,#fbe39a,#d9a02a);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
    '.ovl p{margin:0;max-width:42ch;line-height:1.5;color:#e8e2d2}.suit-picker p{font-family:Georgia,"Times New Roman",serif;font-size:22px;font-weight:700;color:#fff}',
    '.row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.sw{display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;line-height:1;transition:transform .15s}.sw svg{width:52%;height:52%;fill:currentColor}',
    '.hero{display:flex;justify-content:center;height:calc(var(--w)*2);padding-top:10px}.hero .card{--cw:calc(var(--w)*1.15);margin:0 calc(var(--w)*-.28);transform-origin:50% 120%;box-shadow:0 10px 22px rgba(0,0,0,.5)}',
    '.hero .card:nth-child(1){transform:rotate(-14deg)}.hero .card:nth-child(2){transform:translateY(-8px)}.hero .card:nth-child(3){transform:rotate(14deg)}',
    '.btn:focus-visible,.card:focus-visible,.pile:focus-visible,.sw:focus-visible{outline:3px solid #fff;outline-offset:3px}',
    '@media(max-width:600px){.hand{grid-template-columns:repeat(16,minmax(0,1fr))}.hand .card{grid-column:span 2}.hand .card[style*="--hand-row"]{grid-row:var(--hand-row);grid-column:var(--hand-column)}}',
    '@media(min-width:601px){.ce{--w:clamp(41.8px,min(11.59vw,14.25vh),87.4px)}}',
    '@media(max-height:380px) and (orientation:landscape){.ce{--w:clamp(30px,min(8vw,10vh),40px)}.bar{padding:4px 10px}.bar .logo{font-size:16px}.opps{gap:4px;padding:2px 8px}.opp{gap:2px;padding:2px 6px;font-size:11px}.table{gap:calc(var(--w)*1.6)}.msg{font-size:12px;min-height:0;padding:2px 8px}.acts{gap:6px;min-height:34px}.btn{padding:.4em .8em}.hand{padding:8px 8px 4px}.hand .card.ok{transform:translateY(-5px)}}',
    '@keyframes card-land{from{opacity:0;translate:0 -34px;rotate:-8deg;scale:.9}to{opacity:1;translate:0 0;rotate:0deg;scale:1}}',
    '@keyframes turn{0%,100%{box-shadow:0 0 10px rgba(233,185,73,.15)}50%{box-shadow:0 0 22px rgba(233,185,73,.4)}}',
    '@media(prefers-reduced-motion:no-preference){.hand .card{transition:transform .2s cubic-bezier(.2,.8,.2,1)}.cur .card.fresh{animation:card-land .36s cubic-bezier(.2,.8,.2,1) both}.hand .card.dealing{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both}.pile .card{transition:transform .22s cubic-bezier(.2,.8,.2,1)}.opp.on{animation:turn 1.8s ease-in-out infinite}}',
    '@media(hover:hover) and (prefers-reduced-motion:no-preference){.hand .card.ok:hover{transform:translateY(-17px)}.pile.ok:hover .card{transform:translateY(-5px) rotate(-3deg)}.sw:hover{transform:translateY(-3px) scale(1.03)}}',
    '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}'
  ].join('');

  function mount(host) {
    if (root || typeof document === 'undefined') return;
    mountHost = host || document.createElement('div');
    if (!host) document.body.appendChild(mountHost);
    shadow = mountHost.attachShadow({ mode: 'open' });
    var st = document.createElement('style'); st.textContent = ':host{display:block;position:absolute;inset:0;min-height:0}' + CSS; shadow.appendChild(st);
    root = document.createElement('div'); root.className = 'ce'; shadow.appendChild(root);
    root.addEventListener('click', onClick);
    var s = load(); if (s) G = s;
    afterChange(); // renders, and resumes bot turns for a saved game
    return function () {
      clearTimeout(timer);
      root.removeEventListener('click', onClick);
      shadow.replaceChildren();
      root = shadow = mountHost = null;
    };
  }

  var api = {
    id: 'crazyeights', name: 'Crazy Eights', t: 'Crazy Eights', i: '8️⃣',
    d: 'Match the discard pile by suit or rank, play wild eights, and race to empty your hand.',
    minPlayers: 2, maxPlayers: 4, max: 4, cat: 'classic casual', tag: 'Wild card classic',
    diff: 'Easy to learn', art: 'art-cards', logo: 'crazy-eights.svg',
    init: roomInit, valid: roomValid, apply: roomApply, bot: roomBot, draw: roomDraw, click: roomClick,
    soundEvents: roomSoundEvents,
    mount: mount, start: start, _t: { get G() { return G; }, get roomState() { return S; }, roomInit: roomInit, roomValid: roomValid, roomApply: roomApply, roomBot: roomBot, botMove: botMove, newRound: newRound, matchWinner: matchWinner },
  };
  global.CrazyEights = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof registerGame === 'function') registerGame(api);
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);