/* callbreak.js - Call Break (4 players: you + 3 bots, 5 rounds, spades are trump).
   Add <script src="callbreak.js"></script> to any page. Progress is saved in the browser. */
(function (global) {
  'use strict';
  var KEY = 'callbreak-save-v1', ROUNDS = 5, SUITS = ['S', 'H', 'C', 'D'];
  var SYM = { S: '\u2660', H: '\u2665', C: '\u2663', D: '\u2666' }, SNAME = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
  var RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }, RNAME = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  var NAMES = ['You', 'West', 'North', 'East']; // seats go clockwise: you (bottom), west, north, east
  var G = { phase: 'setup', players: [] }, root = null, timer = null, mountHost = null, shadow = null;
  var roomStyleNode = null, roomAnimationSeq = 0;

  function playSound(event) {
    if (global.playoraSound && typeof global.playoraSound.playGame === 'function')
      global.playoraSound.playGame('callbreak', event);
  }

  /* ---------- rules ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function deck() {
    var d = [], id = 0;
    SUITS.forEach(function (s) { for (var r = 2; r <= 14; r++) d.push({ id: id++, s: s, r: r }); });
    return d;
  }
  function cname(c) { return (RNAME[c.r] || c.r) + ' of ' + SNAME[c.s]; }
  function beats(c, w) { return c.s === w.s ? c.r > w.r : c.s === 'S'; } // c is played after w
  function winnerIdx(trick) {
    var b = 0;
    for (var i = 1; i < trick.length; i++) if (beats(trick[i].card, trick[b].card)) b = i;
    return b;
  }
  // Follow suit (and beat the top card if you can). If you cannot follow, you must play a spade that
  // beats the trick so far; if you have none, any card is allowed.
  function legal(hand, trick) {
    if (!trick.length) return hand.slice();
    var led = trick[0].card.s, w = trick[winnerIdx(trick)].card;
    var f = hand.filter(function (c) { return c.s === led; });
    if (f.length) { var hi = f.filter(function (c) { return beats(c, w); }); return hi.length ? hi : f; }
    var win = hand.filter(function (c) { return c.s === 'S' && beats(c, w); });
    return win.length ? win : hand.slice();
  }
  function fmt(t) { return (t < 0 ? '-' : '') + (Math.abs(t) / 10).toFixed(1); } // scores are kept in tenths

  /* ---------- flow ---------- */
  function start() {
    playSound('start');
    G = {
      phase: 'bid', round: 1, dealer: 2, trick: [], collect: false, turn: 0, lead: 0,
      players: NAMES.map(function (n, i) { return { name: n, bot: i > 0, hand: [], bid: 0, tricks: 0, total: 0, last: 0 }; })
    };
    newRound();
  }
  function newRound() {
    var hands, ok;
    do { // redeal if anyone has no spade or no face card
      var d = shuffle(deck());
      hands = [0, 1, 2, 3].map(function (i) { return d.slice(i * 13, i * 13 + 13); });
      ok = hands.every(function (h) { return h.some(function (c) { return c.s === 'S'; }) && h.some(function (c) { return c.r >= 11; }); });
    } while (!ok);
    G.players.forEach(function (p, i) { p.hand = hands[i]; p.bid = 0; p.tricks = 0; });
    G.dealer = (G.dealer + 1) % 4; G.turn = G.lead = (G.dealer + 1) % 4; // the starting player rotates every round
    G.trick = []; G.collect = false; G.phase = 'bid'; G.msg = 'Round ' + G.round + '. Place your bids.';
    afterChange();
  }
  function next() {
    playSound('next');
    if (G.round >= ROUNDS) { G = { phase: 'setup', players: [] }; clearSave(); return render(); }
    G.round++; newRound();
  }
  function bid(pi, n) {
    if (pi === 0) playSound('bid');
    G.players[pi].bid = n; G.msg = G.players[pi].name + ' bid ' + n + '.';
    if (G.players.every(function (p) { return p.bid; })) { G.phase = 'play'; G.turn = G.lead; G.msg += ' ' + G.players[G.lead].name + (G.lead ? ' leads.' : ' lead.'); }
    else G.turn = (pi + 1) % 4;
    afterChange();
  }
  function playCard(pi, id) {
    playSound('move');
    var p = G.players[pi], k = p.hand.findIndex(function (c) { return c.id === id; }), c = p.hand.splice(k, 1)[0];
    G.trick.push({ p: pi, card: c });
    if (G.trick.length === 4) {
      var wi = winnerIdx(G.trick), w = G.trick[wi].p;
      G.win = w; G.collect = true; G.msg = G.players[w].name + (w ? ' wins' : ' win') + ' the trick with the ' + cname(G.trick[wi].card) + '.';
    } else { G.turn = (pi + 1) % 4; G.msg = p.name + ' played the ' + cname(c) + '.'; }
    afterChange();
  }
  function resolve() {
    if (!G.collect) return;
    playSound('capture');
    G.players[G.win].tricks++; G.trick = []; G.collect = false; G.lead = G.turn = G.win;
    if (!G.players[0].hand.length) return endRound();
    afterChange();
  }
  function endRound() {
    G.players.forEach(function (p) {
      p.last = p.tricks >= p.bid ? p.bid * 10 + (p.tricks - p.bid) : -p.bid * 10; // bid + 0.1 per extra trick, or minus the bid
      p.total += p.last;
    });
    var ranked = G.players.slice().sort(function (a, b) { return b.total - a.total; });
    if (G.round >= ROUNDS) playSound(ranked[0] === G.players[0] ? 'win' : 'loss');
    G.phase = 'roundend'; afterChange();
  }
  function afterChange() {
    clearTimeout(timer);
    if (root) save();
    render();
    if (!root) return;
    if (G.phase === 'bid' && G.players[G.turn].bot) timer = setTimeout(botBid, 700);
    else if (G.phase === 'play') {
      if (G.collect) timer = setTimeout(resolve, 1300);
      else if (G.players[G.turn].bot) timer = setTimeout(botPlay, 800);
    }
  }

  /* ---------- bots ---------- */
  function estimate(hand) {
    var by = { S: [], H: [], C: [], D: [] }, e = 0;
    hand.forEach(function (c) { by[c.s].push(c.r); });
    var sp = by.S.length;
    ['H', 'C', 'D'].forEach(function (s) {
      var a = by[s], n = a.length;
      if (a.indexOf(14) > -1) e += 1;
      if (a.indexOf(13) > -1) e += n > 1 ? 0.7 : 0.2;
      if (a.indexOf(12) > -1 && n > 2) e += 0.3;
      if (sp >= 3 && n <= 1) e += n === 0 ? 1 : 0.6; // short suit + spades = ruffing chances
    });
    if (by.S.indexOf(14) > -1) e += 1;
    if (by.S.indexOf(13) > -1) e += sp > 1 ? 0.9 : 0.4;
    if (by.S.indexOf(12) > -1) e += sp > 2 ? 0.6 : 0.2;
    if (sp > 3) e += (sp - 3) * 0.8;
    return Math.max(1, Math.min(8, Math.round(e)));
  }
  function botBid() { if (G.phase === 'bid' && G.players[G.turn].bot) bid(G.turn, estimate(G.players[G.turn].hand)); }
  function botCard(pi) {
    var p = G.players[pi], need = p.bid - p.tricks, L = legal(p.hand, G.trick);
    function cost(c) { return c.r + (c.s === 'S' ? 20 : 0); }
    L.sort(function (a, b) { return cost(a) - cost(b); });
    if (!G.trick.length) {
      if (need > 0) {
        var strong = L.filter(function (c) { return c.s !== 'S' && c.r >= 13; });
        if (strong.length) return strong[strong.length - 1];
      }
      return L[0];
    }
    var w = G.trick[winnerIdx(G.trick)].card, wins = L.filter(function (c) { return beats(c, w); });
    var rest = L.filter(function (c) { return wins.indexOf(c) < 0; });
    if (need > 0) return wins.length ? wins[0] : L[0];       // win as cheaply as possible, else throw the lowest
    return rest.length ? rest[rest.length - 1] : wins[0];     // don't need tricks: lose with the highest safe card
  }
  function botPlay() {
    if (G.phase === 'play' && !G.collect && G.players[G.turn].bot) playCard(G.turn, botCard(G.turn).id);
  }

  /* ---------- save ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.players && s.players.length === 4 && s.phase && s.phase !== 'setup') return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- UI ---------- */
  function cardHTML(c, cls, attrs) {
    var tag = attrs ? 'button type="button"' : 'div', col = c.s === 'H' || c.s === 'D' ? ' r' : ' b';
    return '<' + tag + ' class="card' + col + (cls || '') + '" ' + (attrs || '') + ' aria-label="' + cname(c) + '"><i class="rk">' +
      (RANK[c.r] || c.r) + '<br>' + SYM[c.s] + '</i><span class="su">' + SYM[c.s] + '</span></' + tag.split(' ')[0] + '>';
  }
  function seat(i) {
    var p = G.players[i], on = (G.phase === 'bid' || G.phase === 'play') && G.turn === i && !G.collect;
    var st = p.bid ? 'bid ' + p.bid + ', won ' + p.tricks : (G.phase === 'bid' ? (on ? 'bidding\u2026' : 'waiting') : '');
    return '<div class="seat s' + i + (on ? ' on' : '') + '"><div class="card back mini">' + p.hand.length + '</div><span class="nm">' + p.name +
      '</span><span class="st">' + st + '</span></div>';
  }
  function render() {
    if (!root) return;
    var keep = root.querySelector('.hand'), sl = keep ? keep.scrollLeft : 0, h = '';
    if (G.phase === 'setup') {
      root.innerHTML = '<div class="ovl"><h1>Call Break</h1><p>Four players, ' + ROUNDS + ' rounds, spades are always trump. Bid how many tricks you will win. ' +
        'Hit your bid and score it, plus 0.1 for each extra trick. Miss it and lose the bid.</p><p>Follow suit and beat the top card when you can. ' +
        'If you cannot follow, play a spade that wins.</p><button class="btn" data-a="start">Start game</button></div>';
      return;
    }
    var me = G.players[0], myTurn = G.phase === 'play' && G.turn === 0 && !G.collect, bidding = G.phase === 'bid' && G.turn === 0;
    var L = myTurn ? legal(me.hand, G.trick) : [];
    h += '<div class="bar"><b class="logo">Call Break</b><span>Round ' + G.round + ' of ' + ROUNDS + ', spades \u2660 are trump</span><button class="btn" data-a="new">New game</button></div>' +
      '<div class="table">' + seat(2) + seat(1) + '<div class="trick">';
    G.trick.forEach(function (t, i) { h += cardHTML(t.card, ' t' + t.p + (G.collect && G.win === t.p ? ' win' : '') + (i === G.trick.length - 1 ? ' fresh' : '')); });
    h += '</div>' + seat(3);
    if (bidding) {
      h += '<div class="bidbox"><p>Your bid: how many tricks will you win?</p><div class="bids">';
      for (var n = 1; n <= 13; n++) h += '<button class="btn" data-a="bid" data-v="' + n + '">' + n + '</button>';
      h += '</div></div>';
    }
    var hint = G.phase === 'bid' ? (bidding ? '' : G.players[G.turn].name + ' is bidding\u2026') : G.collect ? '' :
      myTurn ? 'Your turn.' : G.players[G.turn].name + ' is playing\u2026';
    h += '</div><div class="msg">' + G.msg + '<small>' + hint + '</small></div><div class="mine">You: ' +
      (me.bid ? 'bid ' + me.bid + ', won ' + me.tricks : 'no bid yet') + '</div><div class="hand">';
    me.hand.slice().sort(function (a, b) { return SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || b.r - a.r; }).forEach(function (c) {
      var ok = L.some(function (x) { return x.id === c.id; });
      h += cardHTML(c, myTurn ? (ok ? ' ok' : ' no') : '', 'data-a="card" data-v="' + c.id + '"');
    });
    h += '</div>';
    if (G.phase === 'roundend') {
      var fin = G.round >= ROUNDS, rank = G.players.slice().sort(function (a, b) { return b.total - a.total; });
      h += '<div class="ovl"><h1>' + (fin ? (rank[0].bot ? rank[0].name + ' wins' : 'You win!') : 'Round ' + G.round + ' done') + '</h1>' +
        '<table class="sc"><tr><th></th><th>Bid</th><th>Won</th><th>Round</th><th>Total</th></tr>' +
        (fin ? rank : G.players).map(function (p) {
          return '<tr><td>' + p.name + '</td><td>' + p.bid + '</td><td>' + p.tricks + '</td><td>' + fmt(p.last) + '</td><td><b>' + fmt(p.total) + '</b></td></tr>';
        }).join('') + '</table><button class="btn" data-a="next">' + (fin ? 'New game' : 'Next round') + '</button></div>';
    }
    root.innerHTML = h;
    var nh = root.querySelector('.hand'); if (nh) nh.scrollLeft = sl;
  }
  function onClick(e) {
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v');
    if (a === 'start') start();
    else if (a === 'new') {
      if (typeof confirm === 'function' && !confirm('Start a new game? Your current game will be lost.')) return;
      clearTimeout(timer); G = { phase: 'setup', players: [] }; clearSave(); render();
    }
    else if (a === 'next') next();
    else if (a === 'bid' && G.phase === 'bid' && G.turn === 0) bid(0, +v);
    else if (a === 'card' && G.phase === 'play' && G.turn === 0 && !G.collect) {
      var id = +v, ok = legal(G.players[0].hand, G.trick).some(function (c) { return c.id === id; });
      if (ok) playCard(0, id);
      else { G.msg = 'Not allowed: follow suit, beat the top card if you can, or trump with a spade.'; render(); }
    }
  }

  /* ---------- shared room contract ---------- */
  function roomOnline() { return typeof ids !== 'undefined' && ids.length > 0; }
  function roomIsBot(i) {
    var humans = roomOnline() ? np : (typeof localBot !== 'undefined' && localBot ? 1 : (typeof np === 'number' ? np : 2));
    return i >= humans;
  }
  function roomName(i) {
    if (roomIsBot(i)) return roomOnline() ? 'Bot ' + (i - np + 1) : 'Computer ' + (i - (roomOnline() ? np : (typeof localBot !== 'undefined' && localBot ? 1 : np)) + 1);
    if (typeof gamePlayerNames !== 'undefined' && gamePlayerNames[i]) return gamePlayerNames[i];
    if (typeof nm === 'function') return nm(i);
    return i === 0 ? 'You' : 'Player ' + (i + 1);
  }
  function roomSyncTurn() { S.t = S.turn; }
  function roomRandom(state) {
    state.rng = (Math.imul(state.rng >>> 0, 1664525) + 1013904223) >>> 0;
    return state.rng / 4294967296;
  }
  function roomShuffle(state, cards) {
    for (var i = cards.length - 1; i > 0; i--) {
      var j = Math.floor(roomRandom(state) * (i + 1)), card = cards[i];
      cards[i] = cards[j]; cards[j] = card;
    }
    return cards;
  }
  function roomNewRound() {
    var hands, valid;
    do {
      var cards = roomShuffle(S, deck());
      hands = [0, 1, 2, 3].map(function (i) { return cards.slice(i * 13, i * 13 + 13); });
      valid = hands.every(function (hand) {
        return hand.some(function (card) { return card.s === 'S'; }) &&
          hand.some(function (card) { return card.r >= 11; });
      });
    } while (!valid);
    S.players.forEach(function (player, i) {
      player.hand = hands[i]; player.bid = null; player.tricks = 0;
    });
    S.dealer = (S.dealer + 1) % 4;
    S.turn = S.lead = (S.dealer + 1) % 4;
    S.trick = []; S.collect = false; S.phase = 'bid';
    S.msg = 'Round ' + S.round + '. Place your bids.';
    roomSyncTurn();
  }
  function roomInit() {
    roomAnimationSeq = 0;
    var online = roomOnline(), rng = Math.floor(Math.random() * 4294967296) >>> 0;
    S = {
      phase: 'bid', round: 1, dealer: 2, trick: [], collect: false, turn: 0, t: 0, lead: 0,
      players: Array.from({ length: 4 }, function (_, i) {
        return { name: roomName(i), bot: roomIsBot(i), hand: [], bid: null, tricks: 0, total: 0, last: 0 };
      }),
      rng: rng || 1, over: false, winner: -1, animationSeq: 0, animation: null
    };
    roomNewRound();
    return S;
  }
  function roomWinnerIdx(trick) {
    var b = 0;
    for (var i = 1; i < trick.length; i++) if (beats(trick[i].card, trick[b].card)) b = i;
    return b;
  }
  function roomLegal(hand, trick) {
    if (!trick.length) return hand.slice();
    var led = trick[0].card.s, winning = trick[roomWinnerIdx(trick)].card;
    var follow = hand.filter(function (card) { return card.s === led; });
    if (follow.length) {
      var higher = follow.filter(function (card) { return beats(card, winning); });
      return higher.length ? higher : follow;
    }
    var trump = hand.filter(function (card) { return card.s === 'S' && beats(card, winning); });
    return trump.length ? trump : hand.slice();
  }
  function roomValid(action) {
    if (!action || typeof action !== 'object' || S.over || action.player !== S.t ||
        !Number.isInteger(action.player) || !S.players[action.player]) return false;
    if (S.phase === 'bid') return action.type === 'bid' && Number.isInteger(action.value) &&
      action.value >= 1 && action.value <= 13 && S.players[action.player].bid == null;
    if (S.phase === 'play') {
      if (S.collect) return action.type === 'collect' && action.player === S.win;
      if (action.type !== 'play' || !Number.isInteger(action.cardId)) return false;
      return roomLegal(S.players[action.player].hand, S.trick).some(function (card) { return card.id === action.cardId; });
    }
    return S.phase === 'roundend' && action.type === 'next' && S.round < ROUNDS;
  }
  function roomApply(action) {
    if (!roomValid(action)) return;
    var pi = action.player, player = S.players[pi];
    if (action.type === 'next') {
      S.round++;
      roomNewRound();
      return;
    }
    if (action.type === 'bid') {
      player.bid = action.value;
      S.msg = player.name + ' bid ' + action.value + '.';
      if (S.players.every(function (p) { return p.bid != null; })) {
        S.phase = 'play'; S.turn = S.lead;
        S.msg += ' ' + S.players[S.lead].name + (S.lead ? ' leads.' : ' lead.');
      } else S.turn = (pi + 1) % S.players.length;
      roomSyncTurn();
      return;
    }
    if (action.type === 'collect') {
      S.players[S.win].tricks++;
      S.trick = []; S.collect = false; S.lead = S.turn = S.win;
      if (S.animation) S.animation = {
        seq: ++S.animationSeq, type: 'collect', cards: S.lastTrick
      };
      if (!S.players[0].hand.length) {
        S.players.forEach(function (p) {
          p.last = p.tricks >= p.bid ? p.bid * 10 + (p.tricks - p.bid) : -p.bid * 10;
          p.total += p.last;
        });
        var ranked = S.players.slice().sort(function (a, b) { return b.total - a.total; });
        S.winner = S.players.indexOf(ranked[0]);
        S.phase = 'roundend';
        S.over = S.round >= ROUNDS;
      }
      roomSyncTurn();
      return;
    }
    var index = player.hand.findIndex(function (card) { return card.id === action.cardId; });
    var card = player.hand.splice(index, 1)[0];
    S.trick.push({ p: pi, card: card });
    S.animation = { seq: ++S.animationSeq, type: 'play', player: pi, cardId: card.id };
    if (S.trick.length === 4) {
      var win = S.trick[roomWinnerIdx(S.trick)].p;
      S.win = win; S.collect = true; S.turn = win;
      S.lastTrick = S.trick.slice();
      S.msg = S.players[win].name + ' wins the trick with the ' +
        cname(S.trick[roomWinnerIdx(S.trick)].card) + '.';
    } else {
      S.turn = (pi + 1) % S.players.length;
      S.msg = player.name + ' played the ' + cname(card) + '.';
    }
    roomSyncTurn();
  }
  function roomBot() {
    var pi = S && S.t, player = S && S.players[pi];
    if (!player || !player.bot || S.over) return null;
    if (S.phase === 'roundend') return { type: 'next', player: pi };
    if (S.phase === 'bid') return { type: 'bid', player: pi, value: estimate(player.hand) };
    if (S.phase !== 'play') return null;
    if (S.collect) return { type: 'collect', player: pi };
    var hand = player.hand, need = player.bid - player.tricks, legalCards = roomLegal(hand, S.trick);
    function cost(card) { return card.r + (card.s === 'S' ? 20 : 0); }
    legalCards.sort(function (a, b) { return cost(a) - cost(b); });
    var choice;
    if (!S.trick.length) {
      var strong = need > 0 ? legalCards.filter(function (card) { return card.s !== 'S' && card.r >= 13; }) : [];
      choice = strong.length ? strong[strong.length - 1] : legalCards[0];
    } else {
      var winning = S.trick[roomWinnerIdx(S.trick)].card;
      var winners = legalCards.filter(function (card) { return beats(card, winning); });
      var losers = legalCards.filter(function (card) { return winners.indexOf(card) < 0; });
      choice = need > 0 ? (winners[0] || legalCards[0]) : (losers[losers.length - 1] || winners[0]);
    }
    return choice ? { type: 'play', player: pi, cardId: choice.id } : null;
  }
  function roomEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function roomDraw() {
    if (!roomStyleNode && typeof document !== 'undefined') {
      roomStyleNode = document.createElement('style');
      roomStyleNode.id = 'callbreak-room-style';
      roomStyleNode.textContent = scopeCSS(CSS, '.cb') +
        '#bd .cb button{width:auto;margin:0}#bd .cb .btn{font:inherit;font-weight:800;padding:.55em 1.1em;border:0;border-radius:999px;background:#ffd45c;color:#16251d;cursor:pointer}' +
        '#bd .cb .bids .btn{box-sizing:border-box;width:100%;min-width:0;padding:.6em 0}' +
        '@media(max-width:520px){#bd .cb .table{padding-top:12px}}';
      document.head.appendChild(roomStyleNode);
    }
    var online = roomOnline();
    var currentIndex = seat >= 0 && seat < S.players.length ? seat :
      (online ? -1 : (S.players[S.t].bot ? S.players.findIndex(function (p) { return !p.bot; }) : S.t)),
      active = !S.over && S.t === currentIndex &&
      (typeof canAct !== 'function' || canAct());
    var player = currentIndex >= 0 ? S.players[currentIndex] : null;
    var fresh = S.animation && S.animation.seq > roomAnimationSeq ? S.animation : null;
    if (fresh) roomAnimationSeq = fresh.seq;
    var html = '<div class="bar"><b class="logo">Call Break</b><span>Round ' + S.round + ' of ' + ROUNDS +
      ' · Spades ♠ are trump</span></div><div class="table">' +
      [2, 1].map(function (i) { return roomSeatHTML(i); }).join('') + '<div class="trick">';
    var collecting = fresh && fresh.type === 'collect';
    var cards = collecting ? S.lastTrick : S.trick;
    cards.forEach(function (turn, i) {
      var animate = fresh && fresh.type === 'play' && fresh.cardId === turn.card.id;
      html += cardHTML(turn.card, ' t' + turn.p + ((S.collect || collecting) && S.win === turn.p ? ' win' : '') +
        (animate ? ' fresh' : '') + (collecting ? ' collect' : ''));
    });
    html += '</div>' + roomSeatHTML(3);
    if (active && S.phase === 'bid') {
      html += '<div class="bidbox"><p>' + roomEscape(player.name) + ': how many tricks will you win?</p><div class="bids">';
      for (var n = 1; n <= 13; n++) html += '<button class="btn" data-m="bid:' + n + '">' + n + '</button>';
      html += '</div></div>';
    }
    var hint = S.over ? 'Use Restart to play again.' : S.phase === 'roundend' ?
      (active ? 'Start the next round.' : S.players[S.t].name + ' can start the next round.') :
      S.collect ? (active ? 'Collect the trick.' : S.players[S.t].name + ' won the trick.') :
      active ? 'Your turn.' : S.players[S.t].name + (S.phase === 'bid' ? ' is bidding…' : ' is playing…');
    html += '</div><div class="msg">' + roomEscape(S.msg || '') + '<small>' + roomEscape(hint) +
      '</small></div><div class="mine">' + (player ? roomEscape(player.name) + ': ' +
        (player.bid == null ? 'no bid yet' : 'bid ' + player.bid + ', won ' + player.tricks) : 'Waiting for your turn') +
      '</div><div class="hand">';
    if (player) player.hand.slice().sort(function (a, b) {
      return SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || b.r - a.r;
    }).forEach(function (card) {
      var allowed = active && S.phase === 'play' && !S.collect &&
        roomLegal(player.hand, S.trick).some(function (item) { return item.id === card.id; });
      html += cardHTML(card, allowed ? ' ok' : ' no',
        allowed ? 'data-m="card:' + card.id + '"' : '');
    });
    html += '</div>';
    if (active && S.collect) html += '<div class="room-action"><button class="btn" data-m="collect">Collect trick</button></div>';
    if (S.phase === 'roundend') {
      var ranked = S.players.slice().sort(function (a, b) { return b.total - a.total; });
      html += '<div class="ovl"><h1>' + (S.over ? roomEscape(ranked[0].name) + ' wins!' : 'Round ' + S.round + ' done') +
        '</h1><table class="sc"><tr><th>Player</th><th>Bid</th><th>Won</th><th>Round</th><th>Total</th></tr>' +
        S.players.map(function (p) { return '<tr><td>' + roomEscape(p.name) + '</td><td>' + p.bid +
          '</td><td>' + p.tricks + '</td><td>' + fmt(p.last) + '</td><td><b>' + fmt(p.total) +
          '</b></td></tr>'; }).join('') + '</table>' + (active && !S.over ?
          '<button class="btn" data-m="next">Next round</button>' : '') + '</div>';
    }
    return ['<div class="cb">' + html + '</div>', S.msg || ''];
  }
  function roomSeatHTML(i) {
    var p = S.players[i], on = S.t === i && !S.over;
    var status = p.bid == null ? (S.phase === 'bid' && on ? 'bidding…' : '') :
      'bid ' + p.bid + ', won ' + p.tricks;
    return '<div class="seat s' + i + (on ? ' on' : '') + '"><div class="card back mini">' +
      p.hand.length + '</div><span class="nm">' + roomEscape(p.name) + '</span><span class="st">' +
      roomEscape(status) + '</span></div>';
  }
  function roomClick(element) {
    if (!element || !element.dataset || !element.dataset.m || !S || S.over) return;
    var command = element.dataset.m, action;
    if (command.indexOf('bid:') === 0) action = { type: 'bid', value: Number(command.slice(4)), player: S.t };
    else if (command.indexOf('card:') === 0) action = { type: 'play', cardId: Number(command.slice(5)), player: S.t };
    else if (command === 'collect') action = { type: 'collect', player: S.t };
    else if (command === 'next') action = { type: 'next', player: S.t };
    if (action && roomValid(action) && typeof act === 'function') act(action);
  }
  function scopeCSS(css, prefix) {
    function transform(text, keyframes) {
      var out = '', pos = 0;
      while (pos < text.length) {
        var open = text.indexOf('{', pos);
        if (open < 0) { out += text.slice(pos); break; }
        var header = text.slice(pos, open), depth = 1, end = open + 1;
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
            return comma + ' ' + (selector.indexOf(prefix) === 0 ? selector : prefix + ' ' + selector);
          });
        }
        out += header + '{' + nextBody + '}';
        pos = end;
      }
      return out;
    }
    return transform(css, false);
  }

  var CSS = '.cb{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden;user-select:none;' +
    'font-family:"Trebuchet MS","Avenir Next",system-ui,sans-serif;--w:clamp(44px,min(12.2vw,15vh),92px);' +
    'background:radial-gradient(ellipse at 50% 40%,#1f6b49 0,#134a33 60%,#0b2e20 100%)}.cb *{box-sizing:border-box}' +
    '.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;flex:none;font-size:13px}.bar .logo{font-size:20px;font-weight:800}' +
    '.bar span{opacity:.85;text-align:center}.btn{font:inherit;font-weight:800;padding:.55em 1.1em;border:0;border-radius:999px;background:#ffd45c;color:#16251d;cursor:pointer}' +
    '.table{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto 1fr;padding:0 8px}' +
    '.seat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 8px;border-radius:12px;font-size:12px;border:2px solid transparent;min-width:64px;min-height:84px}' +
    '.seat.on{border-color:#ffd45c;background:rgba(255,212,92,.14)}.seat .st{opacity:.85;font-size:11px;text-align:center}.seat .nm{font-weight:800;font-size:13px}' +
    '.s2{grid-column:1/-1;justify-self:center}.s1{grid-column:1;grid-row:2;align-self:center}.s3{grid-column:3;grid-row:2;align-self:center}' +
    '.trick{grid-column:2;grid-row:2;justify-self:center;align-self:center;position:relative;width:calc(var(--w)*2.9);height:calc(var(--w)*2.7)}' +
    '.trick .card{--cw:calc(var(--w)*.8);position:absolute}.t0{bottom:0;left:50%;transform:translateX(-50%)}.t2{top:0;left:50%;transform:translateX(-50%)}' +
    '.t1{left:0;top:50%;transform:translateY(-50%)}.t3{right:0;top:50%;transform:translateY(-50%)}.trick .win{box-shadow:0 0 0 4px #ffd45c,0 6px 14px rgba(0,0,0,.5)}' +
    '.card{--cw:var(--w);position:relative;flex:none;width:var(--cw);height:calc(var(--cw)*1.45);padding:0;border-radius:calc(var(--cw)*.1);background:#fff;' +
    'border:1px solid #c9ccd6;color:var(--k);font:inherit;box-shadow:0 3px 8px rgba(0,0,0,.4);overflow:hidden}.card.r{--k:#d02b3a}.card.b{--k:#1b1f2a}' +
    '.rk{position:absolute;top:5%;left:9%;font-style:normal;font-weight:800;font-size:calc(var(--cw)*.27);line-height:1.05;text-align:center}' +
    '.su{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.6);padding-top:10%}' +
    '.back{background:repeating-linear-gradient(45deg,#24408e 0 6px,#2d4fa8 6px 12px);border:2px solid #fff;color:#fff}' +
    '.mini{--cw:calc(var(--w)*.5);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(var(--w)*.26)}' +
    '.bidbox{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:min(88vw,330px);padding:14px;border-radius:16px;background:rgba(8,24,16,.94);text-align:center}' +
    '.bidbox p{margin:0 0 10px;font-size:14px}.bids{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.bids .btn{box-sizing:border-box;width:100%;min-width:0;padding:.6em 0}' +
    '.msg{text-align:center;font-size:14px;padding:4px 12px;min-height:2.8em;flex:none}.msg small{display:block;opacity:.8;margin-top:2px}' +
    '.mine{text-align:center;font-size:12px;opacity:.85;flex:none}' +
    '.hand{display:flex;overflow-x:auto;overflow-y:hidden;padding:20px 14px 12px;flex:none}.hand .card:first-child{margin-left:auto}.hand .card:last-child{margin-right:auto}' +
    '.hand .card+.card{margin-left:calc(var(--w)*-.45)}.hand .card{cursor:default}.hand .card.ok{transform:translateY(-14px);cursor:pointer;box-shadow:0 0 0 3px #ffd45c,0 6px 14px rgba(0,0,0,.5)}' +
    '.hand .card.no{filter:brightness(.6)}' +
    '.ovl{position:absolute;inset:0;z-index:5;background:rgba(6,20,13,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px}' +
    '.ovl h1{margin:0;font-size:clamp(34px,9vw,60px);color:#ffd45c}.ovl p{margin:0;max-width:40ch;line-height:1.45}' +
    '.sc{border-collapse:collapse;font-size:15px}.sc th,.sc td{padding:6px 12px;text-align:center}.sc th{opacity:.7;font-weight:600;font-size:12px}.sc tr+tr td{border-top:1px solid rgba(255,255,255,.18)}' +
    '.btn:focus-visible,.card:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@keyframes card-land{from{opacity:0;translate:0 -34px;rotate:-8deg;scale:.9}to{opacity:1;translate:0 0;rotate:0deg;scale:1}}' +
    '@media (prefers-reduced-motion:no-preference){.hand .card{transition:transform .2s cubic-bezier(.2,.8,.2,1)}.trick .card.fresh{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both}.trick .win{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both,win-glow .8s ease-in-out infinite alternate}@keyframes win-glow{to{box-shadow:0 0 0 5px #ffe58a,0 8px 18px rgba(0,0,0,.6)}}}' +
    '.room-action{display:flex;justify-content:center;padding:4px 10px;flex:none}' +
    '@keyframes cb-card-play{0%{opacity:0;translate:0 -28px;rotate:-9deg;scale:.92}100%{opacity:1;translate:0 0;rotate:0deg;scale:1}}' +
    '@keyframes cb-card-collect{to{opacity:0;translate:0 -42px;scale:.72;rotate:8deg}}' +
    '@media (prefers-reduced-motion:no-preference){.hand .card{transition:transform .2s cubic-bezier(.2,.8,.2,1)}.trick .card.fresh{animation:cb-card-play .34s cubic-bezier(.2,.8,.2,1) both}.trick .card.collect{animation:cb-card-collect .5s ease-in both}}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';

  function mount(host) {
    if (root || typeof document === 'undefined') return;
    mountHost = host || document.createElement('div');
    if (!host) document.body.appendChild(mountHost);
    shadow = mountHost.attachShadow({ mode: 'open' });
    var st = document.createElement('style'); st.textContent = ':host{display:block;position:absolute;inset:0;min-height:0}' + CSS; shadow.appendChild(st);
    root = document.createElement('div'); root.className = 'cb'; shadow.appendChild(root);
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
    id: 'callbreak', name: 'Call Break', t: 'Call Break', i: '♠️',
    d: 'Bid for tricks, follow suit, and use spades as trump in this four-player card game.',
    minPlayers: 2, maxPlayers: 4, max: 4, cat: 'classic strategy', tag: 'Bid & trump',
    diff: 'Medium', art: 'art-cards', logo: 'callbreak.svg',
    init: roomInit, valid: roomValid, apply: roomApply, bot: roomBot, draw: roomDraw, click: roomClick,
    mount: mount, start: start, _t: { get G() { return G; }, botBid: botBid, botPlay: botPlay, resolve: resolve, next: next, legal: legal },
  };
  global.CallBreak = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof registerGame === 'function') registerGame(api);
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
