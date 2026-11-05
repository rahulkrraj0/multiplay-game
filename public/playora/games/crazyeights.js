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
  var roomStyleNode = null, roomPick = null, roomAnimationSeen = 0;

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
  function cardHTML(c, cls, attrs) {
    var tag = attrs ? 'button type="button"' : 'div', col = c.s === 'H' || c.s === 'D' ? ' r' : ' b';
    return '<' + tag + ' class="card' + col + (cls || '') + '" ' + (attrs || '') + ' aria-label="' + cname(c) + '"><i class="rk">' +
      RK[c.r - 1] + '<br>' + SYM[c.s] + '</i><span class="su">' + SYM[c.s] + '</span></' + tag.split(' ')[0] + '>';
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
      root.innerHTML = '<div class="ovl"><h1>Crazy Eights</h1><p>Play a card that matches the suit or rank of the top card. Eights are wild: play one any time and choose the suit. ' +
        'No playable card? Draw until you get one. First to empty their hand scores the points left in the others\u2019 hands; first to ' + TARGET + ' wins.</p>' +
        '<p>Play against</p><div class="row">' + [1, 2, 3].map(function (n) { return '<button class="btn" data-a="start" data-v="' + n + '">' + n + (n > 1 ? ' bots' : ' bot') + '</button>'; }).join('') + '</div></div>';
      return;
    }
    var me = G.players[0], active = G.phase === 'play', mine = active && G.turn === 0 && G.pick == null;
    var needDraw = mine && !me.hand.some(playable), draw = needDraw && canDraw();
    h += '<div class="bar"><b class="logo">Crazy Eights</b><span class="sc">' + G.players.map(function (p) { return '<span>' + p.name + ' <b>' + p.score + '</b></span>'; }).join('') +
      '</span><button class="btn small" data-a="new">New game</button></div><div class="opps">';
    G.players.forEach(function (p, i) {
      if (!i) return;
      var n = p.hand.length, fan = '';
      for (var k = 0; k < Math.min(n, 8); k++) fan += BACK;
      h += '<div class="opp' + (active && G.turn === i ? ' on' : '') + '"><div class="fan">' + fan + '</div><span class="nm">' + p.name + '</span><span class="n">' +
        n + (n === 1 ? ' card' : ' cards') + '</span></div>';
    });
    var red = G.suit === 'H' || G.suit === 'D';
    h += '</div><div class="table"><button class="pile' + (draw ? ' ok' : '') + '" data-a="draw" aria-label="Draw a card"' + (draw ? '' : ' disabled') + '>' + BACK +
      '<span>Draw (' + G.stock.length + ')</span></button><div class="cur">' + cardHTML(top(), top().id === G.lastPlayed ? ' fresh' : '') + '<span class="suit' + (red ? ' red' : '') + '">' + SYM[G.suit] + ' ' + SNAME[G.suit] + '</span></div></div>';
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
      h += '<div class="ovl"><p>Choose a suit</p><div class="row">' + SUITS.map(function (s) {
        return '<button class="sw' + (s === 'H' || s === 'D' ? ' red' : '') + '" data-a="suit" data-v="' + s + '" aria-label="' + SNAME[s] + '">' + SYM[s] + '</button>';
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

  function roomCount() { return typeof ids !== 'undefined' && ids.length ? 4 : Math.max(2, Math.min(4, Number(np) || 2)); }
  function roomBotSeat(index) {
    var humans = typeof ids !== 'undefined' && ids.length ? Number(np) || 2 :
      (typeof localBot !== 'undefined' && localBot ? 1 : Number(np) || 2);
    return index >= humans;
  }
  function roomPlayerName(index) {
    if (roomBotSeat(index)) return 'Computer ' + (index - ((typeof ids !== 'undefined' && ids.length) ? Number(np) || 2 :
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
        '#bd .ce-room .ce button{width:auto;margin:0}#bd .ce-room .ce .btn{font:inherit;font-weight:800;padding:.6em 1.2em;border:0;border-radius:999px;background:#ffcf5a;color:#0d2530;cursor:pointer}' +
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
    var topCard = roomTop(), html = '<div class="ce-room"><div class="ce"><div class="bar"><b class="logo">Crazy Eights</b><span>' +
      S.players.map(function (player, index) { return '<span' + (index === S.t ? ' class="on"' : '') + '>' +
        roomEscape(player.name) + (player.bot ? ' 🤖' : '') + ' · ' + player.score + '</span>'; }).join('') +
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
      '<span class="suit' + (S.color === 'H' || S.color === 'D' ? ' red' : '') + '">' + SYM[S.color] + ' ' + SNAME[S.color] + '</span></div></div>' +
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
    if (roomWildCard != null && active) html += '<div class="ovl"><p>Choose a suit</p><div class="row">' +
      SUITS.map(function (suit) { return '<button class="sw' + (suit === 'H' || suit === 'D' ? ' red' : '') +
        '" data-m="suit:' + suit + '" aria-label="' + SNAME[suit] + '">' + SYM[suit] + '</button>'; }).join('') +
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

  var CSS = '.ce{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden;user-select:none;' +
    'font-family:"Trebuchet MS","Avenir Next",system-ui,sans-serif;--w:clamp(44px,min(12.2vw,15vh),92px);' +
    'background:radial-gradient(ellipse at 50% 40%,#1b6d7a 0,#0f4552 60%,#082a33 100%)}.ce *{box-sizing:border-box}' +
    '.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;flex:none;font-size:13px}.bar .logo{font-size:20px;font-weight:800}' +
    '.sc{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.btn{font:inherit;font-weight:800;padding:.6em 1.2em;border:0;border-radius:999px;background:#ffcf5a;color:#0d2530;cursor:pointer}' +
    '.btn.small{padding:.45em 1em;font-size:13px}.opps{display:flex;justify-content:space-around;gap:8px;padding:4px 10px;flex:none}' +
    '.opp{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 10px;border-radius:12px;font-size:13px;border:2px solid transparent}' +
    '.opp.on{border-color:#ffcf5a;background:rgba(255,207,90,.14)}.opp .nm{font-weight:800}.opp .n{font-size:11px;opacity:.8}' +
    '.fan{display:flex;height:calc(var(--w)*.63)}.fan .card+.card{margin-left:calc(var(--w)*-.22)}.fan .card{--cw:calc(var(--w)*.42)}' +
    '.table{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;gap:calc(var(--w)*.7)}' +
    '.pile{background:none;border:0;padding:0;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;font:inherit;font-size:12px}' +
    '.pile.ok{cursor:pointer}.pile.ok .card{box-shadow:0 0 0 4px #ffcf5a,0 6px 14px rgba(0,0,0,.5)}.pile:disabled{opacity:1}' +
    '.cur{display:flex;flex-direction:column;align-items:center;gap:6px}.suit{font-size:14px;font-weight:800;background:#fff;color:#1b1f2a;border-radius:999px;padding:3px 12px}.suit.red{color:#d02b3a}' +
    '.card{--cw:var(--w);position:relative;flex:none;width:var(--cw);height:calc(var(--cw)*1.45);padding:0;border-radius:calc(var(--cw)*.1);background:#fff;' +
    'border:1px solid #c9ccd6;color:var(--k);font:inherit;box-shadow:0 3px 8px rgba(0,0,0,.4);overflow:hidden}.card.r{--k:#d02b3a}.card.b{--k:#1b1f2a}' +
    '.rk{position:absolute;top:5%;left:9%;font-style:normal;font-weight:800;font-size:calc(var(--cw)*.27);line-height:1.05;text-align:center}' +
    '.su{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.6);padding-top:10%}' +
    '.back{background:repeating-linear-gradient(45deg,#c2412d 0 6px,#d9573f 6px 12px);border:2px solid #fff}' +
    '.msg{text-align:center;font-size:14px;padding:4px 12px;min-height:3.4em;flex:none}.msg small{display:block;opacity:.8;margin-top:2px}' +
    '.acts{display:flex;justify-content:center;gap:10px;min-height:44px;flex:none}' +
    '.hand{display:flex;overflow-x:auto;overflow-y:hidden;padding:20px 14px 12px;flex:none}.hand .card:first-child{margin-left:auto}.hand .card:last-child{margin-right:auto}' +
    '.hand .card+.card{margin-left:calc(var(--w)*-.4)}.hand .card{cursor:default}.hand .card.ok{position:relative;z-index:2;transform:translateY(-14px);cursor:pointer;box-shadow:0 0 0 3px #ffcf5a,0 6px 14px rgba(0,0,0,.5)}' +
    '.hand .card.no{filter:brightness(.6)}' +
    '.ovl{position:absolute;inset:0;z-index:5;background:rgba(5,24,30,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px}' +
    '.ovl h1{margin:0;font-size:clamp(34px,9vw,60px);color:#ffcf5a}.ovl p{margin:0;max-width:42ch;line-height:1.45}.row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}' +
    '.sw{width:68px;height:68px;border-radius:50%;border:4px solid #ffcf5a;background:#fff;color:#1b1f2a;font-size:34px;cursor:pointer;line-height:1}.sw.red{color:#d02b3a}' +
    '.btn:focus-visible,.card:focus-visible,.pile:focus-visible,.sw:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@media(max-width:600px){.hand{grid-template-columns:repeat(16,minmax(0,1fr))}.hand .card{grid-column:span 2}.hand .card[style*="--hand-row"]{grid-row:var(--hand-row);grid-column:var(--hand-column)}}' +
    '@keyframes card-land{from{opacity:0;translate:0 -34px;rotate:-8deg;scale:.9}to{opacity:1;translate:0 0;rotate:0deg;scale:1}}' +
    '@media (prefers-reduced-motion:no-preference){.hand .card{transition:transform .2s cubic-bezier(.2,.8,.2,1)}.cur .card.fresh{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both}.hand .card.dealing{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both}.pile .card{transition:transform .22s cubic-bezier(.2,.8,.2,1)}.pile.ok:hover .card{transform:translateY(-5px) rotate(-3deg)}}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';

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