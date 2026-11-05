/* bluff.js - Bluff (also called Cheat): 4 players, you + 3 bots. First to empty their hand wins.
   Add <script src="bluff.js"></script> to any page. Progress is saved in the browser. */
(function (global) {
  'use strict';
  var KEY = 'bluff-save-v1', SUITS = ['S', 'H', 'C', 'D'];
  var SYM = { S: '\u2660', H: '\u2665', C: '\u2663', D: '\u2666' }, SNAME = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
  var RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var RNAME = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
  var NAMES = ['You', 'West', 'North', 'East']; // clockwise: you (bottom), west, north, east
  var G = { phase: 'setup', players: [] }, root = null, timer = null, mountHost = null, shadow = null;
  var roomStyleNode = null, roomSelected = [], roomAnimationSeen = 0;

  function playSound(event) {
    if (global.playoraSound && typeof global.playoraSound.playGame === 'function')
      global.playoraSound.playGame('bluff', event);
  }

  /* ---------- helpers ---------- */
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
  function playerName(i) { return G.players[i].name; }
  function cards(n) { return n + (n === 1 ? ' card' : ' cards'); }

  /* ---------- game flow ---------- */
  // G.rank is 0-based: the rank everyone must claim this turn (A, 2, 3 ... K, then A again).
  // Phases: play -> call (bots/you decide in turn) -> ask (waiting for you) -> reveal -> play ...
  function start(starter) {
    playSound('start');
    var d = shuffle(deck());
    G = {
      phase: 'play', starter: starter || 0, rank: 0, pile: [], last: null, queue: [], sel: [], reveal: null,
      players: NAMES.map(function (n, i) { return { name: n, bot: i > 0, hand: d.slice(i * 13, i * 13 + 13) }; })
    };
    G.turn = G.focus = G.starter;
    G.msg = 'Cards dealt. ' + playerName(G.turn) + (G.turn ? ' starts' : ' start') + ' with Aces.';
    afterChange();
  }
  function play(pi, ids) {
    playSound('move');
    var p = G.players[pi], put = [];
    ids.forEach(function (id) { var k = p.hand.findIndex(function (c) { return c.id === id; }); put.push(p.hand.splice(k, 1)[0]); });
    G.pile = G.pile.concat(put);
    G.last = { p: pi, cards: put, rank: G.rank + 1, n: put.length };
    G.sel = []; G.queue = [1, 2, 3].map(function (k) { return (pi + k) % 4; }); G.phase = 'call'; G.focus = pi;
    G.msg = p.name + ' put down ' + cards(put.length) + ', claiming ' + (put.length > 1 ? put.length + ' \u00D7 ' : 'a ') + RNAME[G.rank] + '.' +
      (p.hand.length ? '' : ' That was ' + (pi ? 'their' : 'your') + ' last ' + (put.length > 1 ? 'cards!' : 'card!'));
    afterChange();
  }
  function processCall() {
    if (G.phase !== 'call') return;
    if (!G.queue.length) { // nobody called
      if (!G.players[G.last.p].hand.length) return win(G.last.p);
      return advance();
    }
    var q = G.queue.shift(); G.focus = q;
    if (!G.players[q].bot) { G.phase = 'ask'; return afterChange(); }
    if (botCalls(q)) return doCall(q);
    afterChange();
  }
  function doCall(c) {
    playSound('challenge');
    var L = G.last, truth = L.cards.every(function (x) { return x.r === L.rank; }), loser = truth ? c : L.p;
    G.reveal = { caller: c, truth: truth, loser: loser }; G.phase = 'reveal'; G.focus = loser;
    G.msg = playerName(c) + (c ? ' calls' : ' call') + ' bluff! ' + (truth ? playerName(L.p) + (L.p ? ' was' : ' were') + ' honest, so ' : playerName(L.p) + (L.p ? ' was' : ' were') + ' bluffing, so ') +
      playerName(loser) + (loser ? ' picks' : ' pick') + ' up the pile (' + cards(G.pile.length) + ').';
    afterChange();
  }
  function finishReveal() {
    if (G.phase !== 'reveal') return;
    playSound('capture');
    var R = G.reveal, loser = G.players[R.loser];
    G.pile.forEach(function (c) { loser.hand.push(c); });
    G.pile = []; G.reveal = null;
    if (R.truth && !G.players[G.last.p].hand.length) return win(G.last.p);
    advance();
  }
  function advance() {
    G.turn = G.focus = (G.last.p + 1) % 4; G.rank = (G.rank + 1) % 13; G.phase = 'play';
    G.msg = G.msg + ' ' + playerName(G.turn) + (G.turn ? ' plays' : ' play') + ' ' + RNAME[G.rank] + 's next.';
    afterChange();
  }
  function win(i) { playSound(i === 0 ? 'win' : 'loss'); G.phase = 'over'; G.winner = i; G.focus = i; G.msg = playerName(i) + (i ? ' gets' : ' get') + ' rid of all cards.'; afterChange(); }
  function afterChange() {
    clearTimeout(timer);
    if (root) save();
    render();
    if (!root) return;
    if (G.phase === 'play' && G.players[G.turn].bot) timer = setTimeout(botPlay, 900);
    else if (G.phase === 'call') timer = setTimeout(processCall, 650);
    else if (G.phase === 'reveal') timer = setTimeout(finishReveal, 2600);
  }

  /* ---------- bots ---------- */
  function botPlay() {
    if (G.phase !== 'play' || !G.players[G.turn].bot) return;
    var pi = G.turn, p = G.players[pi], want = G.rank + 1;
    var own = p.hand.filter(function (c) { return c.r === want; }), rest = p.hand.filter(function (c) { return c.r !== want; }), ids;
    function later(c) { return (((c.r - 1 - G.rank + 13) % 13) * 10) % 13; } // own turns until this rank is claimed honestly
    rest.sort(function (a, b) { return later(b) - later(a) || Math.random() - 0.5; });
    if (own.length) {
      ids = own.map(function (c) { return c.id; });
      if (rest.length && own.length < 4 && Math.random() < 0.15) ids.push(rest[0].id); // sneak one extra card in
    } else {
      ids = [rest[0].id];
      if (rest.length > 9 && Math.random() < 0.3) ids.push(rest[1].id);
    }
    play(pi, ids);
  }
  function botCalls(q) {
    var L = G.last, me = G.players[q], pl = G.players[L.p], c = L.n;
    var own = me.hand.filter(function (x) { return x.r === L.rank; }).length;
    if (c + own > 4) return true; // impossible claim: only four of each rank exist
    var p = [0, 0.03, 0.1, 0.22, 0.38][c];
    p += own >= 2 ? 0.15 : own === 1 ? 0.05 : 0;
    if (pl.hand.length <= 2) p += 0.1;
    if (G.pile.length >= 12) p *= 0.8;
    if (me.hand.length <= 3) p *= 0.6;
    if (!pl.hand.length) p = Math.max(p, 0.8); // they would win: stop them if you doubt it
    return Math.random() < Math.min(p, 0.95);
  }

  /* ---------- save ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.players && s.players.length === 4 && s.phase && s.phase !== 'setup' && s.phase !== 'over') { s.sel = []; return s; }
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
    var wideCapacity = 13, mobileCapacity = 8, wideColumns = 30, mobileColumns = 20;
    var wideRow = Math.floor(index / wideCapacity) + 1, wideStart = (wideRow - 1) * wideCapacity;
    var wideCount = Math.min(wideCapacity, count - wideStart);
    var wideColumn = Math.floor((wideColumns - wideCount * 2) / 2) + 1 + (index - wideStart) * 2;
    var mobileRow = Math.floor(index / mobileCapacity) + 1, mobileStart = (mobileRow - 1) * mobileCapacity;
    var mobileCount = Math.min(mobileCapacity, count - mobileStart);
    var mobileColumn = Math.floor((mobileColumns - mobileCount * 2) / 2) + 1 + (index - mobileStart) * 2;
    return 'style="--hand-row:' + wideRow + ';--hand-column:' + wideColumn +
      ';--mobile-row:' + mobileRow + ';--mobile-column:' + mobileColumn + '"';
  }
  function seat(i) {
    var p = G.players[i], on = G.phase !== 'over' && G.focus === i, st = '';
    if (G.phase === 'play' && G.turn === i) st = 'to play';
    else if ((G.phase === 'call' || G.phase === 'ask') && G.last) st = G.last.p === i ? 'just played' : (on ? 'deciding\u2026' : '');
    else if (G.phase === 'reveal' && G.reveal) st = G.reveal.loser === i ? 'takes the pile' : '';
    return '<div class="seat s' + i + (on ? ' on' : '') + '"><div class="card back mini">' + p.hand.length + '</div><span class="nm">' + p.name +
      '</span><span class="st">' + st + '</span></div>';
  }
  function render() {
    if (!root) return;
    var keep = root.querySelector('.hand'), sl = keep ? keep.scrollLeft : 0, h = '';
    if (G.phase === 'setup') {
      root.innerHTML = '<div class="ovl"><h1>Bluff</h1><p>Four players share a 52-card deck. Take turns putting 1 to 4 cards face down and claiming they match the rank ' +
        'for that turn: Aces first, then 2, 3 and on up to King, then round again.</p><p>Anyone can call bluff. If you were lying, you pick up the pile. ' +
        'If you were honest, the caller does. First to empty their hand wins.</p><button class="btn" data-a="start">Start game</button></div>';
      return;
    }
    var me = G.players[0], myTurn = G.phase === 'play' && G.turn === 0, asking = G.phase === 'ask', n = G.sel.length;
    var show = G.last && (G.phase === 'call' || G.phase === 'ask' || G.phase === 'reveal');
    h += '<div class="bar"><b class="logo">Bluff</b><span>Pile: ' + cards(G.pile.length) + '</span><button class="btn" data-a="new">New game</button></div>' +
      '<div class="table">' + seat(2) + seat(1) + '<div class="mid"><div class="need">Claim <b>' + RK[G.rank] + '</b></div><div class="pilebox">';
    if (G.pile.length) {
      h += '<div class="stack">';
      for (var k = 0; k < Math.min(4, Math.ceil(G.pile.length / 4)); k++) h += '<div class="card back p' + k + '"></div>';
      h += '</div>';
    } else h += '<div class="stack empty">Empty</div>';
    h += '</div>' + (show ? '<div class="claim">Claimed: ' + G.last.n + ' \u00D7 ' + RK[G.last.rank - 1] + '</div>' : '<div class="claim">&nbsp;</div>');
    if (G.phase === 'reveal') {
      h += '<div class="rev">' + G.last.cards.map(function (c) { return cardHTML(c, c.r === G.last.rank ? '' : ' bad'); }).join('') + '</div>';
    }
    h += '</div>' + seat(3) + '</div><div class="msg">' + G.msg + '<small>' +
      (myTurn ? 'Your turn. Choose 1 to 4 cards to put down.' : asking ? 'Do you think they are lying?' : '') + '</small></div><div class="acts">';
    if (myTurn) h += '<button class="btn" data-a="put"' + (n ? '' : ' disabled') + '>' + (n ? 'Put down ' + cards(n) + ' as ' + RK[G.rank] : 'Select cards') + '</button>';
    if (asking) h += '<button class="btn red" data-a="call">Call bluff!</button><button class="btn alt" data-a="pass">Let it go</button>';
    h += '</div><div class="hand">';
    var hand = me.hand.slice().sort(function (a, b) { return a.r - b.r || SUITS.indexOf(a.s) - SUITS.indexOf(b.s); });
    hand.forEach(function (c, index) {
      var selectedOrder = G.sel.indexOf(c.id), selected = selectedOrder > -1;
      h += cardHTML(c, (myTurn ? ' ok' : '') + (selected ? ' sel' : ''),
        'data-a="card" data-v="' + c.id + '" aria-pressed="' + selected + '"' +
        (selected ? ' data-selected-order="' + selectedOrder + '"' : '') + ' ' + handGridPosition(index, hand.length));
    });
    h += '</div>';
    if (G.phase === 'over') {
      h += '<div class="ovl"><h1>' + (G.winner === 0 ? 'You win!' : playerName(G.winner) + ' wins') + '</h1><p>Cards left: ' + G.players.map(function (p) { return p.name + ' ' + p.hand.length; }).join(', ') +
        '</p><button class="btn" data-a="again">Play again</button></div>';
    }
    root.innerHTML = h;
    if (typeof global.playoraStackHandCards === 'function') global.playoraStackHandCards(root);
    var nh = root.querySelector('.hand'); if (nh) nh.scrollLeft = sl;
  }
  function onClick(e) {
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v'), myTurn = G.phase === 'play' && G.turn === 0;
    if (a === 'start') start(0);
    else if (a === 'again') start((G.starter + 1) % 4);
    else if (a === 'new') {
      if (typeof confirm === 'function' && G.phase !== 'over' && !confirm('Start a new game? Your current game will be lost.')) return;
      clearTimeout(timer); G = { phase: 'setup', players: [] }; clearSave(); render();
    }
    else if (a === 'card' && myTurn) {
      playSound('menu');
      var id = +v, k = G.sel.indexOf(id);
      if (k > -1) G.sel.splice(k, 1);
      else if (G.sel.length < 4) G.sel.push(id);
      else G.msg = 'You can put down at most 4 cards.';
      render();
    }
    else if (a === 'put' && myTurn && G.sel.length) play(0, G.sel.slice());
    else if (a === 'call' && G.phase === 'ask') doCall(0);
    else if (a === 'pass' && G.phase === 'ask') { G.phase = 'call'; afterChange(); }
  }

  /* ---------- shared-room API ---------- */
  function roomSetTurn(index) { S.turn = S.t = index; }
  function roomName(index) {
    if (typeof gamePlayerNames !== 'undefined' && gamePlayerNames[index] && gamePlayerNames[index] !== 'Computer')
      return gamePlayerNames[index];
    if (typeof nm === 'function') return nm(index);
    return 'Player ' + (index + 1);
  }
  function roomCreateState(count) {
    var online = typeof ids !== 'undefined' && ids.length > 0;
    var localComputer = typeof localBot !== 'undefined' && localBot;
    count = online ? 4 : Math.max(2, Math.min(4, Number(count) || 2));
    var humans = online ? Math.min(Number(np) || 2, count) : (localComputer ? 1 : count);
    var players = Array.from({ length: count }, function (_, index) {
      var bot = index >= humans;
      return {
        name: bot ? (localComputer ? 'Computer (Bot ' + (index - humans + 1) + ')' : 'Bot ' + (index - humans + 1)) : roomName(index),
        bot: bot, hand: []
      };
    });
    var cardsInDeck = shuffle(deck());
    players.forEach(function (player, index) {
      var dealt = Math.floor(cardsInDeck.length / (players.length - index));
      player.hand = cardsInDeck.splice(0, dealt);
    });
    return {
      players: players, phase: 'play', rank: 0, pile: [], last: null, queue: [], reveal: null,
      turn: 0, t: 0, winner: -1, over: false, msg: 'Cards dealt. ' + players[0].name + ' starts with Aces.',
      animationSeq: 0, animation: null
    };
  }
  function roomInit() {
    roomSelected = [];
    roomAnimationSeen = 0;
    if (typeof localBot !== 'undefined' && localBot) {
      S = {
        players: [{ name: roomName(0), bot: false, hand: [] }],
        phase: 'setup', rank: 0, pile: [], last: null, queue: [], reveal: null,
        turn: 0, t: 0, winner: -1, over: false,
        msg: roomName(0) + ', how many players total?',
        animationSeq: 0, animation: null
      };
      return S;
    }
    S = roomCreateState(np);
    return S;
  }
  function roomValid(action) {
    if (!action || typeof action !== 'object' || S.over || action.player !== S.t ||
        !Number.isInteger(action.player) || !S.players[action.player]) return false;
    if (S.phase === 'setup')
      return action.type === 'players' && Number.isInteger(action.count) && action.count >= 2 && action.count <= 4;
    if (S.phase === 'play') {
      if (action.type !== 'play' || !Array.isArray(action.cardIds) || action.cardIds.length < 1 || action.cardIds.length > 4)
        return false;
      var seen = {};
      return action.cardIds.every(function (id) {
        if (!Number.isInteger(id) || seen[id]) return false;
        seen[id] = true;
        return S.players[S.t].hand.some(function (card) { return card.id === id; });
      });
    }
    if (S.phase === 'call') return action.type === 'call' || action.type === 'pass';
    return S.phase === 'reveal' && action.type === 'continue';
  }
  function roomSetWinner(index) {
    S.winner = index;
    S.over = true;
    S.phase = 'over';
    S.msg = S.players[index].name + ' gets rid of all cards.';
    roomSelected = [];
  }
  function roomAdvance(previousMessage) {
    var lastPlayer = S.last.p;
    if (!S.players[lastPlayer].hand.length) return roomSetWinner(lastPlayer);
    S.rank = (S.rank + 1) % 13;
    S.phase = 'play';
    S.last = null;
    S.queue = [];
    S.reveal = null;
    roomSetTurn((lastPlayer + 1) % S.players.length);
    S.msg = previousMessage + ' ' + S.players[S.t].name + ' plays ' + RNAME[S.rank] + 's next.';
    roomSelected = [];
  }
  function roomBotCalls(caller) {
    var last = S.last, me = S.players[caller], played = S.players[last.p], count = last.n;
    var own = me.hand.filter(function (card) { return card.r === last.rank; }).length;
    if (count + own > 4) return true;
    var chance = [0, 0.03, 0.1, 0.22, 0.38][count];
    chance += own >= 2 ? 0.15 : own === 1 ? 0.05 : 0;
    if (played.hand.length <= 2) chance += 0.1;
    if (S.pile.length >= 12) chance *= 0.8;
    if (me.hand.length <= 3) chance *= 0.6;
    if (!played.hand.length) chance = Math.max(chance, 0.8);
    return Math.random() < Math.min(chance, 0.95);
  }
  function roomApply(action) {
    if (!roomValid(action)) return;
    if (S.phase === 'setup') {
      var nextState = roomCreateState(action.count);
      Object.keys(S).forEach(function (key) { delete S[key]; });
      Object.assign(S, nextState);
      roomSelected = [];
      return;
    }
    var playerIndex = S.t, player = S.players[playerIndex];
    if (action.type === 'play') {
      var cardsToPlay = action.cardIds.map(function (id) {
        var index = player.hand.findIndex(function (card) { return card.id === id; });
        return player.hand.splice(index, 1)[0];
      });
      S.pile.push.apply(S.pile, cardsToPlay);
      S.last = { p: playerIndex, cards: cardsToPlay, rank: S.rank + 1, n: cardsToPlay.length };
      S.queue = Array.from({ length: S.players.length - 1 }, function (_, index) {
        return (playerIndex + index + 1) % S.players.length;
      });
      S.phase = 'call';
      roomSetTurn(S.queue[0]);
      S.msg = player.name + ' put down ' + cards(cardsToPlay.length) + ', claiming ' +
        (cardsToPlay.length > 1 ? cardsToPlay.length + ' × ' : 'a ') + RNAME[S.rank] + '.';
      if (!player.hand.length) S.msg += ' That was their last card!';
      S.animation = { seq: ++S.animationSeq, type: 'play' };
      roomSelected = [];
      return;
    }
    if (action.type === 'call') {
      var last = S.last, truth = last.cards.every(function (card) { return card.r === last.rank; });
      var loser = truth ? playerIndex : last.p;
      S.reveal = { caller: playerIndex, truth: truth, loser: loser };
      S.phase = 'reveal';
      roomSetTurn(playerIndex);
      S.msg = player.name + ' calls bluff! ' + (truth
        ? S.players[last.p].name + ' was honest, so ' + player.name + ' picks up the pile.'
        : S.players[last.p].name + ' was bluffing, so ' + S.players[loser].name + ' picks up the pile.') +
        ' (' + cards(S.pile.length) + ').';
      return;
    }
    if (action.type === 'pass') {
      S.queue.shift();
      if (S.queue.length) {
        roomSetTurn(S.queue[0]);
        S.msg = player.name + ' let it go.';
      } else {
        roomAdvance(player.name + ' let it go.');
      }
      return;
    }
    var reveal = S.reveal, loserPlayer = S.players[reveal.loser];
    loserPlayer.hand.push.apply(loserPlayer.hand, S.pile);
    S.pile = [];
    if (reveal.truth && !S.players[S.last.p].hand.length) return roomSetWinner(S.last.p);
    roomAdvance(S.msg);
  }
  function roomBot() {
    var index = S.t, player = S.players[index];
    if (!player || !player.bot || (typeof seat !== 'undefined' && index === seat) || S.over) return null;
    if (S.phase === 'play') {
      var wanted = S.rank + 1;
      var own = player.hand.filter(function (card) { return card.r === wanted; });
      var rest = player.hand.filter(function (card) { return card.r !== wanted; });
      function later(card) { return (((card.r - 1 - S.rank + 13) % 13) * 10) % 13; }
      rest.sort(function (a, b) { return later(b) - later(a) || Math.random() - 0.5; });
      var chosen;
      if (own.length) {
        chosen = own.map(function (card) { return card.id; });
        if (rest.length && own.length < 4 && Math.random() < 0.15) chosen.push(rest[0].id);
      } else {
        chosen = [rest[0].id];
        if (rest.length > 9 && Math.random() < 0.3) chosen.push(rest[1].id);
      }
      return { type: 'play', player: index, cardIds: chosen };
    }
    if (S.phase === 'call') return roomBotCalls(index)
      ? { type: 'call', player: index } : { type: 'pass', player: index };
    if (S.phase === 'reveal') return { type: 'continue', player: index };
    return null;
  }
  function roomDisplayIndex() {
    if (typeof seat !== 'undefined' && seat >= 0 && seat < S.players.length) return seat;
    if (typeof ids !== 'undefined' && ids.length) return -1;
    return typeof localBot !== 'undefined' && localBot ? 0 : S.t;
  }
  function roomSeat(index) {
    var player = S.players[index], isActive = !S.over && S.t === index;
    var status = S.phase === 'play' && isActive ? 'to play' :
      S.phase === 'call' && isActive ? 'deciding…' :
      S.phase === 'reveal' && S.reveal && S.reveal.loser === index ? 'takes the pile' : '';
    return '<div class="seat s' + index + (isActive ? ' on' : '') + '"><div class="card back mini">' +
      player.hand.length + '</div><span class="nm">' + (player.bot ? '🤖 ' : '') + player.name +
      '</span><span class="st">' + status + '</span></div>';
  }
  function roomDraw() {
    injectRoomStyles();
    if (S.phase === 'setup') {
      var setup = '<div class="bl-room"><div class="bl"><div class="bar"><b class="logo">Bluff</b></div>' +
        '<section class="setup-panel" aria-labelledby="bluff-setup-title"><h3 class="setup-title" id="bluff-setup-title">Bluff</h3>' +
        '<p class="setup-copy">' + roomName(0) + ', how many players?</p><div class="setup-options">' +
        [2, 3, 4].map(function (count) {
          return '<button class="setup-choice" data-m="players:' + count + '">' + count +
            '<small>players</small></button>';
        }).join('') + '</div><p class="setup-copy">Computers fill the remaining seats.</p></section></div></div>';
      return [setup, S.msg];
    }
    var currentIndex = roomDisplayIndex(), current = currentIndex >= 0 ? S.players[currentIndex] : null;
    var active = current && currentIndex === S.t && (typeof canAct !== 'function' || canAct()) && !S.over;
    var showLast = S.last && S.phase !== 'play';
    var html = '<div class="bl-room"><div class="bl"><div class="bar"><b class="logo">Bluff</b><span>Pile: ' +
      cards(S.pile.length) + '</span></div><div class="table">';
    S.players.forEach(function (player, index) {
      if (index !== currentIndex) html += roomSeat(index);
    });
    html += '<div class="mid"><div class="need">Claim <b>' + RK[S.rank] + '</b></div><div class="pilebox">';
    if (S.pile.length) {
      html += '<div class="stack">';
      var animatePlay = S.animation && S.animation.seq > roomAnimationSeen;
      for (var k = 0; k < Math.min(4, Math.ceil(S.pile.length / 4)); k++)
        html += '<div class="card back p' + k + (animatePlay && k === 0 ? ' playing' : '') + '"></div>';
      if (animatePlay) roomAnimationSeen = S.animation.seq;
      html += '</div>';
    } else html += '<div class="stack empty">Empty</div>';
    html += '</div>' + (showLast ? '<div class="claim">Claimed: ' + S.last.n + ' × ' + RK[S.last.rank - 1] + '</div>' : '<div class="claim">&nbsp;</div>');
    if (S.phase === 'reveal')
      html += '<div class="rev">' + S.last.cards.map(function (card) { return cardHTML(card, card.r === S.last.rank ? '' : ' bad'); }).join('') + '</div>';
    html += '</div></div><div class="msg">' + S.msg + '<small>' +
      (S.phase === 'play' && active ? 'Your turn. Choose 1 to 4 cards to put down.' :
        S.phase === 'call' && active ? 'Call bluff or let it go.' :
          S.phase === 'reveal' && active ? 'Review the cards, then continue.' :
            !S.over ? S.players[S.t].name + ' is playing…' : '') +
      '</small></div><div class="acts">';
    if (S.phase === 'play' && active)
      html += '<button class="btn" data-m="put"' + (roomSelected.length ? '' : ' disabled') + '>' +
        (roomSelected.length ? 'Put down ' + cards(roomSelected.length) + ' as ' + RK[S.rank] : 'Select cards') + '</button>';
    if (S.phase === 'call' && active)
      html += '<button class="btn red" data-m="call">Call bluff!</button><button class="btn alt" data-m="pass">Let it go</button>';
    if (S.phase === 'reveal' && active) html += '<button class="btn" data-m="continue">Continue</button>';
    html += '</div><div class="hand">';
    var hand = current ? current.hand.slice().sort(function (a, b) {
      return a.r - b.r || SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
    }) : [];
    hand.forEach(function (card, index) {
      var selectedOrder = roomSelected.indexOf(card.id), selected = selectedOrder >= 0;
      html += cardHTML(card, (S.phase === 'play' && active ? ' ok' : '') + (selected ? ' sel' : ''),
        (S.phase === 'play' && active ? 'data-m="card:' + card.id + '" aria-pressed="' + selected + '"' : '') +
        (selected ? ' data-selected-order="' + selectedOrder + '"' : '') +
        ' ' + handGridPosition(index, hand.length));
    });
    html += '</div>';
    if (S.over) html += '<div class="ovl"><h1>' + S.players[S.winner].name + ' wins!</h1><p>' + S.msg + '</p><p>Use Restart to play again.</p></div>';
    return [html + '</div></div>', S.msg];
  }
  function roomClick(element) {
    if (!S || S.over) return;
    var command = element.dataset.m || '', action = null;
    if (command.indexOf('card:') === 0 && S.phase === 'play') {
      var id = Number(command.slice(5)), hand = S.players[S.t].hand;
      if (!hand.some(function (card) { return card.id === id; })) return;
      var selectedIndex = roomSelected.indexOf(id);
      if (selectedIndex >= 0) roomSelected.splice(selectedIndex, 1);
      else if (roomSelected.length < 4) roomSelected.push(id);
      if (typeof global.render === 'function') global.render();
      return;
    }
    if (command.indexOf('players:') === 0 && S.phase === 'setup')
      action = { type: 'players', player: S.t, count: Number(command.slice(8)) };
    else if (command === 'put') action = { type: 'play', player: S.t, cardIds: roomSelected.slice() };
    else if (command === 'call' || command === 'pass' || command === 'continue')
      action = { type: command, player: S.t };
    if (action && roomValid(action) && typeof act === 'function') act(action);
  }
  function scopeStyles(css, scope) {
    var output = '', position = 0;
    while (position < css.length) {
      var open = css.indexOf('{', position);
      if (open < 0) { output += css.slice(position); break; }
      var head = css.slice(position, open).trim(), depth = 1, end = open + 1;
      while (end < css.length && depth) {
        if (css[end] === '{') depth++;
        else if (css[end] === '}') depth--;
        end++;
      }
      var body = css.slice(open + 1, end - 1);
      if (head.indexOf('@media') === 0) output += head + '{' + scopeStyles(body, scope) + '}';
      else if (head.indexOf('@') === 0) output += head + '{' + body + '}';
      else output += head.split(',').map(function (selector) { return scope + ' ' + selector.trim(); }).join(',') + '{' + body + '}';
      position = end;
    }
    return output;
  }
  function injectRoomStyles() {
    if (typeof document === 'undefined' || document.getElementById('bluff-room-style')) return;
    roomStyleNode = document.createElement('style');
    roomStyleNode.id = 'bluff-room-style';
    roomStyleNode.textContent = '.bl-room{position:absolute;inset:0;min-height:0}' + scopeStyles(CSS, '.bl-room') +
      `#room #bd .bl-room button.card{--cw:var(--w);width:var(--cw);height:calc(var(--cw)*1.45);flex:none;justify-self:center;margin:0;padding:0;border:1px solid #c9ccd6;border-radius:calc(var(--cw)*.1);background:#fff;color:var(--k);font:inherit;text-align:left;box-shadow:0 3px 8px rgba(0,0,0,.4);appearance:none;-webkit-appearance:none;overflow:hidden}
#room #bd .bl-room .hand button.card:first-child,#room #bd .bl-room .hand button.card:last-child,#room #bd .bl-room .hand button.card+button.card{margin-left:0;margin-right:0}
#room #bd .bl-room .hand{max-width:1160px;margin:5px auto 0;grid-auto-rows:calc(var(--w)*.95);row-gap:0;overflow:visible;padding-top:28px;padding-bottom:calc(10px + var(--w)*.5)}
#room #bd .bl-room .acts{margin-top:12px}
#room #bd .bl-room .acts button.btn{width:auto;min-width:min(220px,100%);margin:0;padding:10px 24px}
#room #bd .bl-room .bl .setup-panel{display:grid;flex:1 1 auto;align-content:center;justify-items:center;gap:.8rem;padding:.5rem}
#room #bd .bl-room .bl .setup-choice{display:grid;width:4.2rem;min-height:0;justify-items:center;margin:0;padding:.6rem .4rem;border:2px solid rgba(255,255,255,.35);border-radius:1rem;background:rgba(0,0,0,.3);color:#fff;font:inherit;font-size:1.6rem;font-weight:900;cursor:pointer;transition:transform .15s,border-color .15s}
#room #bd .bl-room .bl .setup-choice small{font-size:.65rem;font-weight:600;opacity:.8}
#room #bd .bl-room .bl .setup-choice:hover{transform:translateY(-.25rem);border-color:#ffd45c}
#room #bd .bl-room .bl{box-sizing:border-box;padding-bottom:calc(5vh + env(safe-area-inset-bottom,0px))}
@media(max-width:1250px){#room #bd .bl-room .bl{--w:clamp(36px,min(8vw,calc((100vw - 56px)/11)),92px)}}
@media(max-width:600px){#room #bd .bl-room .bl{--w:clamp(36px,min(18vw,calc((100vw - 40px)/7)),76px)}#room #bd .bl-room .bl .setup-choice{width:3.6rem;font-size:1.35rem}#room #bd .bl-room .hand{grid-template-columns:repeat(20,minmax(0,1fr));grid-template-rows:none;grid-auto-rows:calc(var(--w)*.95)}#room #bd .bl-room .hand button.card{grid-column:span 2}#room #bd .bl-room .hand button.card[style*="--mobile-row"]{grid-row:var(--mobile-row);grid-column:var(--mobile-column) / span 2}#room #bd .bl-room .acts{gap:6px;padding:0 8px}#room #bd .bl-room .acts button.btn{width:auto;min-width:0;max-width:100%;flex:1 1 0;margin:0;padding:10px 6px;font-size:clamp(12px,3.5vw,14px);white-space:normal}}
@media(max-width:520px){#room #bd .bl-room .hand{padding-bottom:calc(32px + env(safe-area-inset-bottom,0px))}}
@media(max-width:520px) and (max-height:700px){#room #bd .bl-room .bl{--w:clamp(36px,min(12vw,12vh),46px)}#room #bd .bl-room .hand{padding-top:24px}}
@media(max-width:600px){#room #bd .bl-room .bl{padding-bottom:5vh}}
@media(max-width:600px){#room #bd .bl-room .acts{order:1}#room #bd .bl-room .hand{order:2}#room #bd .bl-room .msg{order:3;margin-top:8px}}` +
      '.bl-room .playing{animation:card-reveal .38s cubic-bezier(.2,.8,.2,1) both}' +
      '@media(prefers-reduced-motion:reduce){.bl-room .playing{animation:none!important}}';
    document.head.appendChild(roomStyleNode);
  }

  var CSS = '.bl{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden;user-select:none;' +
    'font-family:"Trebuchet MS","Avenir Next",system-ui,sans-serif;--w:clamp(44px,min(12.2vw,15vh),92px);' +
    'background:radial-gradient(ellipse at 50% 40%,#3a2a63 0,#271c47 60%,#170f2c 100%)}.bl *{box-sizing:border-box}' +
    '.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;flex:none;font-size:13px}.bar .logo{font-size:20px;font-weight:800}' +
    '.setup-panel{display:grid;flex:1 1 auto;align-content:center;justify-items:center;gap:.8rem;padding:.5rem}.setup-title{margin:0;font-size:clamp(1.1rem,4cqw,1.6rem)}.setup-copy{margin:0;opacity:.88}.setup-options{display:flex;flex-wrap:wrap;justify-content:center;gap:.6rem}.setup-choice{display:grid;width:4.2rem;justify-items:center;padding:.6rem .4rem;border:2px solid rgba(255,255,255,.35);border-radius:1rem;background:rgba(0,0,0,.3);color:#fff;font:inherit;font-size:1.6rem;font-weight:900;cursor:pointer;transition:transform .15s,border-color .15s}.setup-choice small{font-size:.65rem;font-weight:600;opacity:.8}.setup-choice:hover{transform:translateY(-.25rem);border-color:#ffd45c}.setup-choice:focus-visible{outline:3px solid #f59e0b;outline-offset:3px}' +
    '.bar span{opacity:.85;text-align:center}.btn{font:inherit;font-weight:800;padding:.6em 1.2em;border:0;border-radius:999px;background:#ffd45c;color:#20142f;cursor:pointer}' +
    '.btn.red{background:#e4453a;color:#fff}.btn.alt{background:transparent;color:#fff;box-shadow:inset 0 0 0 2px #fff}.btn:disabled{opacity:.45;cursor:default}' +
    '.table{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);grid-template-rows:auto 1fr;padding:0 8px}' +
    '.seat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 8px;border-radius:12px;font-size:12px;border:2px solid transparent;min-width:64px}' +
    '.seat.on{border-color:#ffd45c;background:rgba(255,212,92,.14)}.seat .st{opacity:.85;font-size:11px;text-align:center;min-height:1.2em}.seat .nm{font-weight:800;font-size:13px}' +
    '.s2{grid-column:1/-1;justify-self:center}.s1{grid-column:1;grid-row:2;align-self:center}.s3{grid-column:3;grid-row:2;align-self:center}' +
    '.mid{grid-column:2;grid-row:2;align-self:center;justify-self:center;width:min(100%,520px);min-width:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"need pile" "claim pile" "rev rev";align-items:center;gap:8px;text-align:center}' +
    '.need{grid-area:need}.pilebox{grid-area:pile;justify-self:center}.claim{grid-area:claim}.rev{grid-area:rev;flex-wrap:wrap}' +
    '.need{font-size:14px;opacity:.9}.need b{display:block;font-size:calc(var(--w)*.75);line-height:1;color:#ffd45c}' +
    '.stack{position:relative;width:calc(var(--w)*1.3);height:calc(var(--w)*1.5);display:flex;align-items:center;justify-content:center}' +
    '.stack.empty{border:2px dashed rgba(255,255,255,.4);border-radius:12px;font-size:12px;opacity:.7}.stack .card{position:absolute}' +
    '.p0{transform:rotate(-7deg)}.p1{transform:rotate(4deg) translate(4px,-3px)}.p2{transform:rotate(-2deg) translate(-3px,2px)}.p3{transform:rotate(8deg) translate(2px,4px)}' +
    '.claim{font-size:13px;font-weight:700}.rev{display:flex;gap:4px;justify-content:center}.rev .card{--cw:calc(var(--w)*.62)}.rev .bad{box-shadow:0 0 0 3px #e4453a}' +
    '.card{--cw:var(--w);position:relative;flex:none;width:var(--cw);height:calc(var(--cw)*1.45);padding:0;border-radius:calc(var(--cw)*.1);background:#fff;' +
    'border:1px solid #c9ccd6;color:var(--k);font:inherit;box-shadow:0 3px 8px rgba(0,0,0,.4);overflow:hidden}.card.r{--k:#d02b3a}.card.b{--k:#1b1f2a}' +
    '.rk{position:absolute;top:5%;left:9%;font-style:normal;font-weight:800;font-size:calc(var(--cw)*.27);line-height:1.05;text-align:center}' +
    '.su{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.6);padding-top:10%}' +
    '.back{background:repeating-linear-gradient(45deg,#7b2cbf 0 6px,#9d4edd 6px 12px);border:2px solid #fff;color:#fff}' +
    '.mini{--cw:calc(var(--w)*.5);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(var(--w)*.26)}' +
    '.stack .back{--cw:calc(var(--w)*.95)}' +
    '.msg{text-align:center;font-size:14px;padding:4px 12px;min-height:3.4em;flex:none}.msg small{display:block;opacity:.8;margin-top:2px}' +
    '.acts{display:flex;justify-content:center;gap:10px;min-height:46px;flex:none;padding:0 12px}' +
    '.hand{display:grid;grid-template-columns:repeat(30,minmax(0,1fr));grid-auto-rows:calc(var(--w)*.95);align-content:center;gap:0;overflow:visible;padding:16px 8px calc(10px + var(--w)*.5);flex:none}.hand .card{grid-column:span 2;width:var(--w);height:calc(var(--w)*1.45);justify-self:center;cursor:default}.hand .card[style*="--hand-row"]{grid-row:var(--hand-row);grid-column:var(--hand-column) / span 2}.hand .card.ok{cursor:pointer}' +
    '.hand .card.sel{position:relative;z-index:5;transform:translateY(calc(var(--w)*-.55));box-shadow:0 0 0 3px #ffd45c,0 6px 14px rgba(0,0,0,.5)}' +
    '.ovl{position:absolute;inset:0;z-index:5;background:rgba(15,8,30,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px}' +
    '.ovl h1{margin:0;font-size:clamp(36px,9vw,64px);color:#ffd45c}.ovl p{margin:0;max-width:40ch;line-height:1.45}' +
    '.btn:focus-visible,.card:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@media(max-width:1250px){.bl{--w:clamp(36px,min(8vw,calc((100vw - 56px)/11)),92px)}}' +
    '@media(max-width:600px){.bl{--w:clamp(36px,min(18vw,calc((100vw - 40px)/7)),76px);box-sizing:border-box;padding-bottom:5vh}.setup-choice{width:3.6rem;font-size:1.35rem}.hand{grid-template-columns:repeat(20,minmax(0,1fr));order:1}.hand .card[style*="--mobile-row"]{grid-row:var(--mobile-row);grid-column:var(--mobile-column) / span 2}.msg{order:2;margin-top:8px}.acts{order:3}.mid{grid-template-columns:minmax(0,1fr);grid-template-areas:"need" "pile" "claim" "rev"}.need{display:flex;align-items:center;justify-content:center;gap:4px}.need b{display:inline-block;margin:0;font-size:calc(var(--w)*.55)}}' +
    '@keyframes card-reveal{from{opacity:0;translate:0 -18px;rotate:y 80deg;scale:.92}to{opacity:1;translate:0 0;rotate:none;scale:1}}' +
    '@media (prefers-reduced-motion:no-preference){.hand .card{transition:transform .2s cubic-bezier(.2,.8,.2,1)}.rev .card{animation:card-reveal .38s cubic-bezier(.2,.8,.2,1) both}.stack .card:last-child{animation:card-reveal .32s ease-out both}}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';

  function mount(host) {
    if (root || typeof document === 'undefined') return;
    mountHost = host || document.createElement('div');
    if (!host) document.body.appendChild(mountHost);
    shadow = mountHost.attachShadow({ mode: 'open' });
    var st = document.createElement('style'); st.textContent = ':host{display:block;position:absolute;inset:0;min-height:0}' + CSS; shadow.appendChild(st);
    root = document.createElement('div'); root.className = 'bl'; shadow.appendChild(root);
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
    id: 'bluff', name: 'Bluff', t: 'Bluff', i: '🃏',
    d: 'Play cards face down, call bluffs, and be the first to empty your hand against three opponents.',
    minPlayers: 2, maxPlayers: 4, max: 4, cat: 'classic casual', tag: 'Bluff & call',
    diff: 'Easy to learn', art: 'art-cards', logo: 'bluff.svg',
    init: roomInit, valid: roomValid, apply: roomApply, bot: roomBot, draw: roomDraw, click: roomClick,
    mount: mount, start: start, _t: { get G() { return G; }, botPlay: botPlay, processCall: processCall, finishReveal: finishReveal },
  };
  global.Bluff = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof registerGame === 'function') registerGame(api);
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
