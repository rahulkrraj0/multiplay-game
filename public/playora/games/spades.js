/* spades.js - Spades, 4 players in partnerships: you + North vs West + East (bots). First team to 250 wins.
   Add <script src="spades.js"></script> to any page. Progress is saved in the browser. */
(function (global) {
  'use strict';
  var KEY = 'spades-save-v1', GOAL = 250, SUITS = ['S', 'H', 'C', 'D'];
  var SYM = { S: '\u2660', H: '\u2665', C: '\u2663', D: '\u2666' }, SNAME = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
  var RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }, RNAME = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  var NAMES = ['You', 'West', 'North', 'East'], TEAMS = ['You & North', 'West & East']; // teams are seats 0+2 and 1+3
  var G = { phase: 'setup', players: [] }, root = null, timer = null, mountHost = null, shadow = null;

  function playSound(event) {
    if (global.playoraSound && typeof global.playoraSound.playGame === 'function')
      global.playoraSound.playGame('spades', event);
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
  function rk(r) { return RANK[r] || String(r); }
  function cname(c) { return (RNAME[c.r] || c.r) + ' of ' + SNAME[c.s]; }
  function beats(c, w) { return c.s === w.s ? c.r > w.r : c.s === 'S'; } // c is played after w
  function winIdx(t) {
    var b = 0;
    for (var i = 1; i < t.length; i++) if (beats(t[i].card, t[b].card)) b = i;
    return b;
  }
  function legal(hand, trick, broken) { // follow suit; spades can't be led until broken (unless that's all you hold)
    if (!trick.length) {
      var ns = hand.filter(function (c) { return c.s !== 'S'; });
      return !broken && ns.length ? ns : hand.slice();
    }
    var f = hand.filter(function (c) { return c.s === trick[0].card.s; });
    return f.length ? f : hand.slice();
  }
  function contractOf(t) { return [t, t + 2].reduce(function (s, i) { return s + Math.max(0, G.players[i].bid || 0); }, 0); }
  function tricksOf(t) { return [t, t + 2].reduce(function (s, i) { return s + G.players[i].tricks; }, 0); }
  function bidTxt(p) { return p.bid === null ? '' : (p.bid === 0 ? 'Nil' : 'bid ' + p.bid) + ', won ' + p.tricks; }

  /* ---------- flow ---------- */
  function start() {
    playSound('start');
    G = { phase: 'bid', round: 1, dealer: 2, trick: [], collect: false, turn: 0, lead: 0, broken: false,
      teams: [{ score: 0, bags: 0 }, { score: 0, bags: 0 }],
      players: NAMES.map(function (n, i) { return { name: n, bot: i > 0, hand: [], bid: null, tricks: 0 }; }) };
    newRound();
  }
  function newRound() {
    var d = shuffle(deck());
    G.players.forEach(function (p, i) { p.hand = d.slice(i * 13, i * 13 + 13); p.bid = null; p.tricks = 0; });
    G.dealer = (G.dealer + 1) % 4; G.turn = G.lead = (G.dealer + 1) % 4; // the starting player rotates every round
    G.trick = []; G.collect = false; G.broken = false; G.phase = 'bid'; G.msg = 'Round ' + G.round + '. Place your bids (0 is Nil).';
    afterChange();
  }
  function bid(pi, n) {
    if (pi === 0) playSound('bid');
    G.players[pi].bid = n; G.msg = G.players[pi].name + (pi ? ' bids ' : ' bid ') + (n === 0 ? 'Nil.' : n + '.');
    if (G.players.every(function (p) { return p.bid !== null; })) { G.phase = 'play'; G.turn = G.lead; G.msg += ' ' + G.players[G.lead].name + (G.lead ? ' leads.' : ' lead.'); }
    else G.turn = (pi + 1) % 4;
    afterChange();
  }
  function playCard(pi, id) {
    playSound('move');
    var p = G.players[pi], k = p.hand.findIndex(function (c) { return c.id === id; }), c = p.hand.splice(k, 1)[0];
    G.trick.push({ p: pi, card: c }); if (c.s === 'S') G.broken = true;
    if (G.trick.length === 4) {
      var wi = winIdx(G.trick), w = G.trick[wi].p;
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
    G.notes = []; G.res = [];
    [0, 1].forEach(function (t) {
      var T = G.teams[t], contract = contractOf(t), tr = tricksOf(t), d = 0, bags = 0;
      if (contract > 0) { if (tr >= contract) { d += contract * 10 + (tr - contract); bags = tr - contract; } else d -= contract * 10; }
      else bags = tr;
      [t, t + 2].forEach(function (i) {
        var p = G.players[i];
        if (p.bid === 0) { var ok = p.tricks === 0; d += ok ? 100 : -100; G.notes.push(p.name + ' Nil ' + (ok ? 'made: +100' : 'failed: -100')); }
      });
      T.bags += bags; var pen = 0;
      while (T.bags >= 10) { T.bags -= 10; d -= 100; pen++; }
      if (pen) G.notes.push(TEAMS[t] + ' collected 10 bags: -100');
      T.score += d; G.res.push({ contract: contract, tr: tr, d: d });
    });
    var a = G.teams[0].score, b = G.teams[1].score;
    G.finished = (a >= GOAL || b >= GOAL) && a !== b ? (a > b ? 0 : 1) : -1;
    if (G.finished > -1) playSound(G.finished === 0 ? 'win' : 'loss');
    G.phase = 'roundend'; afterChange();
  }
  function next() {
    playSound('next');
    if (G.finished > -1) { clearTimeout(timer); G = { phase: 'setup', players: [] }; clearSave(); return render(); }
    G.round++; newRound();
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
    return { e: e, sp: sp };
  }
  function botBid() {
    if (G.phase !== 'bid' || !G.players[G.turn].bot) return;
    var r = estimate(G.players[G.turn].hand);
    bid(G.turn, r.e < 0.55 && r.sp <= 3 ? 0 : Math.max(1, Math.min(7, Math.round(r.e))));
  }
  function botCard(pi) {
    var p = G.players[pi], t = pi % 2, partner = (pi + 2) % 4, pp = G.players[partner];
    var L = legal(p.hand, G.trick, G.broken).slice(), need = contractOf(t) - tricksOf(t), nil = p.bid === 0;
    function cost(c) { return c.r + (c.s === 'S' ? 20 : 0); }
    L.sort(function (a, b) { return cost(a) - cost(b); });
    if (!G.trick.length) {
      if (nil || need <= 0) return L[0];
      var strong = L.filter(function (c) { return c.s !== 'S' && c.r >= 13; });
      return strong.length ? strong[strong.length - 1] : L[0];
    }
    var wi = winIdx(G.trick), wc = G.trick[wi].card, wp = G.trick[wi].p;
    var wins = L.filter(function (c) { return beats(c, wc); }), rest = L.filter(function (c) { return wins.indexOf(c) < 0; });
    if (nil) return rest.length ? rest[rest.length - 1] : wins[0];                       // a Nil bidder ducks every trick
    if (wp === partner) return pp.bid === 0 && pp.tricks === 0 && wins.length ? wins[0] : L[0]; // cover a Nil partner, else let partner win
    if (need > 0) return wins.length ? wins[0] : L[0];                                    // need tricks: win cheaply
    return rest.length ? rest[rest.length - 1] : wins[0];                                 // contract made: avoid bags
  }
  function botPlay() { if (G.phase === 'play' && !G.collect && G.players[G.turn].bot) playCard(G.turn, botCard(G.turn).id); }

  /* ---------- save ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.players && s.players.length === 4 && s.teams && s.phase && s.phase !== 'setup') return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- UI ---------- */
  function cardHTML(c, cls, attrs) {
    var tag = attrs ? 'button type="button"' : 'div', col = c.s === 'H' || c.s === 'D' ? ' r' : ' b';
    return '<' + tag + ' class="card' + col + (cls || '') + '" ' + (attrs || '') + ' aria-label="' + cname(c) + '"><i class="rk">' +
      rk(c.r) + '<br>' + SYM[c.s] + '</i><span class="su">' + SYM[c.s] + '</span></' + tag.split(' ')[0] + '>';
  }
  function seat(i) {
    var p = G.players[i], on = (G.phase === 'bid' || G.phase === 'play') && G.turn === i && !G.collect;
    var st = p.bid !== null ? bidTxt(p) : (G.phase === 'bid' ? (on ? 'bidding\u2026' : 'waiting') : '');
    return '<div class="seat s' + i + (on ? ' on' : '') + '"><div class="card back mini">' + p.hand.length + '</div><span class="nm">' + p.name +
      '</span><span class="st">' + st + '</span></div>';
  }
  function render() {
    if (!root) return;
    var keep = root.querySelector('.hand'), sl = keep ? keep.scrollLeft : 0, h = '';
    if (G.phase === 'setup') {
      root.innerHTML = '<div class="ovl"><h1>Spades</h1><p>You and North play against West and East. Spades are always trump. Each player bids how many tricks they will win; ' +
        'your team\u2019s bid is the total of both bids.</p><p>Make the bid and score 10 points per trick bid, plus 1 for each extra trick (a bag). Miss it and lose 10 per trick bid. ' +
        'Nil (a bid of 0) is worth +100 if you win no tricks and \u2212100 if you do. Ten bags cost 100. First team to ' + GOAL + ' wins.</p><button class="btn" data-a="start">Start game</button></div>';
      return;
    }
    var me = G.players[0], myTurn = G.phase === 'play' && G.turn === 0 && !G.collect, bidding = G.phase === 'bid' && G.turn === 0;
    var L = myTurn ? legal(me.hand, G.trick, G.broken) : [];
    h += '<div class="bar"><b class="logo">Spades</b><span class="sc">' + G.teams.map(function (t, i) {
      return '<span>' + TEAMS[i] + ' <b>' + t.score + '</b> <small>(' + t.bags + ' bags)</small></span>';
    }).join('') + '</span><button class="btn small" data-a="new">New game</button></div><div class="sub">Round ' + G.round + ', spades ' + (G.broken ? '' : 'not ') + 'broken' +
      (G.phase === 'play' ? ' \u2022 Your team: ' + tricksOf(0) + ' of ' + contractOf(0) + ' tricks' : '') + '</div><div class="table">' + seat(2) + seat(1) + '<div class="trick">';
    G.trick.forEach(function (t, i) { h += cardHTML(t.card, ' t' + t.p + (G.collect && G.win === t.p ? ' win' : '') + (i === G.trick.length - 1 ? ' fresh' : '')); });
    h += '</div>' + seat(3);
    if (bidding) {
      h += '<div class="bidbox"><p>Your bid: how many tricks will you win?</p><div class="bids">';
      for (var n = 0; n <= 13; n++) h += '<button class="btn" data-a="bid" data-v="' + n + '">' + (n ? n : 'Nil') + '</button>';
      h += '</div></div>';
    }
    var hint = G.phase === 'bid' ? (bidding ? '' : G.players[G.turn].name + ' is bidding\u2026') : G.collect ? '' : myTurn ? 'Your turn.' : G.phase === 'play' ? G.players[G.turn].name + ' is playing\u2026' : '';
    h += '</div><div class="msg">' + G.msg + '<small>' + hint + '</small></div><div class="mine">You: ' + (me.bid === null ? 'no bid yet' : bidTxt(me)) + '</div><div class="hand">';
    me.hand.slice().sort(function (a, b) { return SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || b.r - a.r; }).forEach(function (c) {
      var ok = L.some(function (x) { return x.id === c.id; });
      h += cardHTML(c, myTurn ? (ok ? ' ok' : ' no') : '', 'data-a="card" data-v="' + c.id + '"');
    });
    h += '</div>';
    if (G.phase === 'roundend') {
      var f = G.finished;
      h += '<div class="ovl"><h1>' + (f > -1 ? (f === 0 ? 'Your team wins!' : TEAMS[f] + ' win') : 'Round ' + G.round + ' done') + '</h1>' +
        '<table class="sc2"><tr><th></th><th>Bid</th><th>Won</th><th>Round</th><th>Total</th></tr>' + G.teams.map(function (t, i) {
          var r = G.res[i]; return '<tr><td>' + TEAMS[i] + '</td><td>' + r.contract + '</td><td>' + r.tr + '</td><td>' + (r.d > 0 ? '+' : '') + r.d + '</td><td><b>' + t.score + '</b></td></tr>';
        }).join('') + '</table>' + (G.notes.length ? '<p>' + G.notes.join('<br>') + '</p>' : '') +
        '<button class="btn" data-a="next">' + (f > -1 ? 'New game' : 'Next round') + '</button></div>';
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
      var hand = G.players[0].hand, ok = legal(hand, G.trick, G.broken).some(function (c) { return c.id === +v; });
      if (ok) playCard(0, +v);
      else {
        G.msg = 'Not allowed: ' + (G.trick.length ? 'follow suit, play a ' + SNAME[G.trick[0].card.s] + ' card.' : 'spades are not broken yet.');
        render();
      }
    }
  }

  /* ---------- shared room contract ---------- */
  var S = null, roomStyleNode = null, roomAnimationSeq = 0;
  function roomOnline() { return typeof ids !== 'undefined' && ids.length > 0; }
  function roomBotSeat(index) {
    var humans = roomOnline() ? Number(np) || 2 :
      (typeof localBot !== 'undefined' && localBot ? 1 : Number(np) || 2);
    return index >= humans;
  }
  function roomName(index) {
    if (roomBotSeat(index)) return 'Computer ' + (index - (roomOnline() ? Number(np) || 2 :
      (typeof localBot !== 'undefined' && localBot ? 1 : Number(np) || 2)) + 1);
    if (typeof gamePlayerNames !== 'undefined' && gamePlayerNames[index] && gamePlayerNames[index] !== 'Computer')
      return gamePlayerNames[index];
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
  function roomDeck() {
    var cards = [], id = 0;
    SUITS.forEach(function (suit) {
      for (var rank = 2; rank <= 14; rank++) cards.push({ id: id++, s: suit, r: rank });
    });
    return cards;
  }
  function roomSetTurn(index) { S.turn = S.t = index; }
  function roomNewRound() {
    var hands, valid = false, attempts = 0;
    while (!valid && attempts++ < 1000) {
      var cards = roomShuffle(roomDeck());
      hands = [0, 1, 2, 3].map(function (index) { return cards.slice(index * 13, (index + 1) * 13); });
      valid = hands.every(function (hand) {
        return hand.some(function (card) { return card.s === 'S'; }) &&
          hand.some(function (card) { return card.r >= 11; });
      });
    }
    if (!valid) throw new Error('Spades could not deal valid hands.');
    S.players.forEach(function (player, index) {
      player.hand = hands[index];
      player.bid = null;
      player.tricks = 0;
    });
    S.dealer = (S.dealer + 1) % 4;
    S.turn = S.lead = (S.dealer + 1) % 4;
    S.trick = [];
    S.collect = false;
    S.broken = false;
    S.phase = 'bid';
    S.round++;
    S.msg = 'Round ' + S.round + '. Place your bids (0 is Nil).';
    S.animation = null;
    roomSetTurn(S.turn);
  }
  function roomInit() {
    roomAnimationSeq = 0;
    var seed = Math.floor(Math.random() * 4294967296) >>> 0;
    S = {
      phase: 'bid', round: 0, dealer: 2, trick: [], collect: false, turn: 0, t: 0, lead: 0,
      players: Array.from({ length: 4 }, function (_, index) {
        return { name: roomName(index), bot: roomBotSeat(index), hand: [], bid: null, tricks: 0 };
      }),
      teams: [{ score: 0, bags: 0 }, { score: 0, bags: 0 }],
      rng: seed || 1, broken: false, over: false, winner: -1, animationSeq: 0, animation: null
    };
    roomNewRound();
    return S;
  }
  function roomLegal(hand, trick, broken) {
    if (!trick.length) {
      var nonSpades = hand.filter(function (card) { return card.s !== 'S'; });
      return !broken && nonSpades.length ? nonSpades : hand.slice();
    }
    var follow = hand.filter(function (card) { return card.s === trick[0].card.s; });
    return follow.length ? follow : hand.slice();
  }
  function roomWinnerIdx(trick) {
    var best = 0;
    for (var i = 1; i < trick.length; i++) if (beats(trick[i].card, trick[best].card)) best = i;
    return best;
  }
  function roomContract(team) {
    return [team, team + 2].reduce(function (sum, index) {
      return sum + Math.max(0, S.players[index].bid || 0);
    }, 0);
  }
  function roomTricks(team) {
    return [team, team + 2].reduce(function (sum, index) { return sum + S.players[index].tricks; }, 0);
  }
  function roomScoreRound() {
    S.notes = [];
    S.results = [];
    [0, 1].forEach(function (team) {
      var contract = roomContract(team), won = roomTricks(team), score = 0, bags = 0;
      if (contract > 0) {
        if (won >= contract) { score += contract * 10 + (won - contract); bags = won - contract; }
        else score -= contract * 10;
      } else bags = won;
      [team, team + 2].forEach(function (index) {
        var player = S.players[index];
        if (player.bid === 0) {
          var madeNil = player.tricks === 0;
          score += madeNil ? 100 : -100;
          S.notes.push(player.name + ' Nil ' + (madeNil ? 'made: +100' : 'failed: -100'));
        }
      });
      var totalBags = S.teams[team].bags + bags, penalties = 0;
      while (totalBags >= 10) { totalBags -= 10; score -= 100; penalties++; }
      S.teams[team].bags = totalBags;
      S.teams[team].score += score;
      if (penalties) S.notes.push(TEAMS[team] + ' collected 10 bags: -100');
      S.results.push({ contract: contract, tricks: won, score: score });
    });
    var homeScore = S.teams[0].score, awayScore = S.teams[1].score;
    S.winner = homeScore >= GOAL || awayScore >= GOAL
      ? homeScore === awayScore ? -1 : homeScore > awayScore ? 0 : 1
      : -1;
    S.over = S.winner >= 0;
    S.phase = 'roundend';
    S.msg = S.over ? TEAMS[S.winner] + ' win the game.' : 'Round ' + S.round + ' complete.';
  }
  function roomValid(action) {
    if (!action || typeof action !== 'object' || S.over || action.player !== S.t ||
        !Number.isInteger(action.player) || !S.players[action.player]) return false;
    if (S.phase === 'bid') return action.type === 'bid' && Number.isInteger(action.value) &&
      action.value >= 0 && action.value <= 13 && S.players[action.player].bid == null;
    if (S.phase === 'roundend') return action.type === 'next' && !S.over;
    if (S.phase !== 'play') return false;
    if (S.collect) return action.type === 'collect' && action.player === S.win;
    return action.type === 'play' && Number.isInteger(action.cardId) &&
      roomLegal(S.players[action.player].hand, S.trick, S.broken).some(function (card) {
        return card.id === action.cardId;
      });
  }
  function roomApply(action) {
    if (!roomValid(action)) return;
    var pi = action.player, player = S.players[pi];
    if (action.type === 'next') { roomNewRound(); return; }
    if (action.type === 'bid') {
      player.bid = action.value;
      S.msg = player.name + ' bid ' + (action.value === 0 ? 'Nil.' : action.value + '.');
      if (S.players.every(function (seatPlayer) { return seatPlayer.bid !== null; })) {
        S.phase = 'play';
        S.turn = S.lead;
        S.msg += ' ' + S.players[S.lead].name + ' leads.';
      } else S.turn = (pi + 1) % S.players.length;
      roomSetTurn(S.turn);
      return;
    }
    if (action.type === 'collect') {
      S.players[S.win].tricks++;
      S.trick = [];
      S.collect = false;
      S.lead = S.turn = S.win;
      if (S.players[0].hand.length === 0) {
        roomScoreRound();
        roomSetTurn(S.win);
      } else {
        S.msg = S.players[S.win].name + ' leads the next trick.';
        roomSetTurn(S.turn);
      }
      return;
    }
    var index = player.hand.findIndex(function (card) { return card.id === action.cardId; });
    var card = player.hand.splice(index, 1)[0];
    S.trick.push({ p: pi, card: card });
    if (card.s === 'S') S.broken = true;
    S.animation = { seq: ++S.animationSeq, type: 'play', player: pi, cardId: card.id };
    if (S.trick.length === 4) {
      var winningIndex = roomWinnerIdx(S.trick);
      S.win = S.trick[winningIndex].p;
      S.collect = true;
      S.turn = S.win;
      S.msg = S.players[S.win].name + ' wins the trick with the ' + cname(S.trick[winningIndex].card) + '.';
    } else {
      S.turn = (pi + 1) % S.players.length;
      S.msg = player.name + ' played the ' + cname(card) + '.';
    }
    roomSetTurn(S.turn);
  }
  function roomBot() {
    var pi = S && S.t, player = S && S.players[pi];
    if (!player || !player.bot || S.over) return null;
    if (S.phase === 'bid') {
      var estimateResult = estimate(player.hand);
      var estimateBid = estimateResult.e < 0.55 && estimateResult.sp <= 3 ? 0 :
        Math.max(1, Math.min(7, Math.round(estimateResult.e)));
      return { type: 'bid', player: pi, value: estimateBid };
    }
    if (S.phase === 'roundend') return { type: 'next', player: pi };
    if (S.phase !== 'play') return null;
    if (S.collect) return { type: 'collect', player: pi };
    var partner = S.players[(pi + 2) % 4], needed = roomContract(pi % 2) - roomTricks(pi % 2);
    var cards = roomLegal(player.hand, S.trick, S.broken).slice(), nil = player.bid === 0;
    function cardCost(card) { return card.r + (card.s === 'S' ? 20 : 0); }
    cards.sort(function (a, b) { return cardCost(a) - cardCost(b); });
    var chosen;
    if (!S.trick.length) {
      var strong = !nil && needed > 0 ? cards.filter(function (card) { return card.s !== 'S' && card.r >= 13; }) : [];
      chosen = strong.length ? strong[strong.length - 1] : cards[0];
    } else {
      var winningCard = S.trick[roomWinnerIdx(S.trick)].card;
      var winners = cards.filter(function (card) { return beats(card, winningCard); });
      var losers = cards.filter(function (card) { return winners.indexOf(card) < 0; });
      if (nil) chosen = losers.length ? losers[losers.length - 1] : winners[0];
      else if (S.trick[roomWinnerIdx(S.trick)].p === (pi + 2) % 4)
        chosen = partner.bid === 0 && partner.tricks === 0 && winners.length ? winners[0] : cards[0];
      else if (needed > 0) chosen = winners.length ? winners[0] : cards[0];
      else chosen = losers.length ? losers[losers.length - 1] : winners[0];
    }
    return chosen ? { type: 'play', player: pi, cardId: chosen.id } : null;
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
  function roomSeatHTML(index, position) {
    var player = S.players[index], active = S.t === index && !S.over;
    var status = player.bid === null ? (S.phase === 'bid' && active ? 'bidding…' : '') :
      (player.bid === 0 ? 'Nil' : 'bid ' + player.bid) + ', won ' + player.tricks;
    return '<div class="seat s' + position + (active ? ' on' : '') + '"><div class="card back mini">' +
      player.hand.length + '</div><span class="nm">' + roomEscape(player.name) + (player.bot ? ' 🤖' : '') +
      '</span><span class="st">' + roomEscape(status) + '</span></div>';
  }
  function roomDraw() {
    if (!roomStyleNode && typeof document !== 'undefined') {
      roomStyleNode = document.createElement('style');
      roomStyleNode.id = 'spades-room-style';
      roomStyleNode.textContent = scopeRoomStyles(CSS, '.sp-room') +
        '#bd .sp-room .sp button{width:auto;margin:0}#bd .sp-room .sp .btn{font:inherit;font-weight:800;padding:.6em 1.2em;border:0;border-radius:999px;background:#ffd45c;color:#121a2c;cursor:pointer}' +
        '@media(prefers-reduced-motion:reduce){.sp-room *,.sp-room *::before,.sp-room *::after{animation:none!important;transition:none!important}}';
      document.head.appendChild(roomStyleNode);
    }
    var online = roomOnline(), currentIndex = online
      ? (typeof seat === 'number' && seat >= 0 && seat < 4 ? seat : -1)
      : 0;
    var teamIndex = currentIndex >= 0 ? currentIndex % 2 : 0;
    var player = currentIndex >= 0 ? S.players[currentIndex] : null;
    var active = player && currentIndex === S.t && !S.over &&
      (typeof canAct !== 'function' || canAct());
    var fresh = S.animation && S.animation.seq > roomAnimationSeq ? S.animation : null;
    if (fresh) roomAnimationSeq = fresh.seq;
    var html = '<div class="sp-room"><div class="sp"><div class="bar"><b class="logo">Spades</b><span class="sc">' +
      S.teams.map(function (team, index) {
        return '<span>' + TEAMS[index] + ' <b>' + team.score + '</b> <small>(' + team.bags + ' bags)</small></span>';
      }).join('') + '</span></div><div class="sub">Round ' + S.round + ', spades ' +
      (S.broken ? '' : 'not ') + 'broken · ' + TEAMS[teamIndex] + ': ' + roomTricks(teamIndex) +
      ' of ' + roomContract(teamIndex) + ' tricks</div><div class="table">';
    if (currentIndex >= 0) {
      html += roomSeatHTML((currentIndex + 2) % 4, 2) +
        roomSeatHTML((currentIndex + 1) % 4, 1) +
        roomSeatHTML((currentIndex + 3) % 4, 3);
    } else {
      html += roomSeatHTML(2, 2) + roomSeatHTML(1, 1) + roomSeatHTML(3, 3) + roomSeatHTML(0, 0);
    }
    html += '<div class="trick">';
    S.trick.forEach(function (trick, index) {
      html += cardHTML(trick.card, ' t' + trick.p + (S.collect && S.win === trick.p ? ' win' : '') +
        (fresh && fresh.type === 'play' && fresh.cardId === trick.card.id ? ' fresh' : ''));
    });
    html += '</div>';
    if (active && S.phase === 'bid') {
      html += '<div class="bidbox"><p>Your bid: how many tricks will you win?</p><div class="bids">';
      for (var bid = 0; bid <= 13; bid++)
        html += '<button class="btn" data-m="bid:' + bid + '">' + (bid ? bid : 'Nil') + '</button>';
      html += '</div></div>';
    }
    var hint = S.over ? 'Use Restart to play again.' :
      S.phase === 'roundend' ? (active ? 'Start the next round.' : S.players[S.t].name + ' can start the next round.') :
        S.collect ? (active ? 'Collect the trick.' : S.players[S.win].name + ' won the trick.') :
          S.phase === 'bid' ? (active ? 'Your turn to bid.' : S.players[S.t].name + ' is bidding…') :
            (active ? 'Your turn.' : S.players[S.t].name + ' is playing…');
    html += '</div><div class="msg">' + roomEscape(S.msg) + '<small>' + roomEscape(hint) +
      '</small></div><div class="mine">' + (player ? roomEscape(player.name) + ': ' +
        (player.bid === null ? 'no bid yet' : bidTxt(player)) : 'Waiting for your turn') + '</div><div class="hand">';
    if (player) player.hand.slice().sort(function (a, b) { return SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || b.r - a.r; })
      .forEach(function (card) {
        var allowed = active && S.phase === 'play' && !S.collect &&
          roomLegal(player.hand, S.trick, S.broken).some(function (item) { return item.id === card.id; });
        html += cardHTML(card, allowed ? ' ok' : ' no',
          allowed ? 'data-m="card:' + card.id + '"' : '');
      });
    html += '</div>';
    if (active && S.collect) html += '<div class="acts"><button class="btn" data-m="collect">Collect trick</button></div>';
    if (S.phase === 'roundend') {
      html += '<div class="ovl"><h1>' + (S.over ? TEAMS[S.winner] + ' win!' : 'Round ' + S.round + ' complete') +
        '</h1><table class="sc2"><tr><th>Team</th><th>Contract</th><th>Tricks</th><th>Round</th><th>Total</th></tr>' +
        S.teams.map(function (team, index) {
          var result = S.results[index];
          return '<tr><td>' + TEAMS[index] + '</td><td>' + result.contract + '</td><td>' + result.tricks +
            '</td><td>' + (result.score > 0 ? '+' : '') + result.score + '</td><td><b>' + team.score + '</b></td></tr>';
        }).join('') + (S.notes.length ? '<tr><td colspan="5">' + S.notes.map(roomEscape).join('<br>') + '</td></tr>' : '') +
        '</table>' + (S.over ? '<p>Use Restart to play again.</p>' : active ? '<button class="btn" data-m="next">Next round</button>' : '') +
        '</div>';
    }
    return [html + '</div></div>', S.msg];
  }
  function roomClick(element) {
    if (!S || !element || !element.dataset || S.over) return;
    var command = element.dataset.m || '', action = null;
    if (command.indexOf('bid:') === 0) action = { type: 'bid', player: S.t, value: Number(command.slice(4)) };
    else if (command.indexOf('card:') === 0) action = { type: 'play', player: S.t, cardId: Number(command.slice(5)) };
    else if (command === 'collect' || command === 'next') action = { type: command, player: S.t };
    if (action && roomValid(action) && typeof act === 'function') act(action);
  }
  function roomSoundEvents(action) {
    if (action.type === 'bid') return ['bid'];
    if (action.type === 'collect') return ['capture'];
    if (action.type === 'next') return ['next'];
    return ['move'];
  }

  var CSS = '.sp{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden;user-select:none;' +
    'font-family:"Trebuchet MS","Avenir Next",system-ui,sans-serif;--w:clamp(44px,min(12.2vw,15vh),92px);' +
    'background:radial-gradient(ellipse at 50% 40%,#33456b 0,#1d2a46 60%,#0e1526 100%)}.sp *{box-sizing:border-box}' +
    '.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;flex:none;font-size:13px}.bar .logo{font-size:20px;font-weight:800}' +
    '.sc{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}.sc small{opacity:.75}.sub{text-align:center;font-size:12px;opacity:.85;flex:none}' +
    '.btn{font:inherit;font-weight:800;padding:.6em 1.2em;border:0;border-radius:999px;background:#ffd45c;color:#121a2c;cursor:pointer}.btn.small{padding:.45em 1em;font-size:13px}' +
    '.table{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto 1fr;padding:0 8px}' +
    '.seat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 8px;border-radius:12px;font-size:12px;border:2px solid transparent;min-width:64px}' +
    '.seat.on{border-color:#ffd45c;background:rgba(255,212,92,.14)}.seat .st{opacity:.85;font-size:11px;text-align:center;min-height:1.2em}.seat .nm{font-weight:800;font-size:13px}' +
    '.s2{grid-column:1/-1;justify-self:center}.s1{grid-column:1;grid-row:2;align-self:center}.s3{grid-column:3;grid-row:2;align-self:center}' +
    '.trick{grid-column:2;grid-row:2;justify-self:center;align-self:center;position:relative;width:calc(var(--w)*2.9);height:calc(var(--w)*2.7)}' +
    '.trick .card{--cw:calc(var(--w)*.8);position:absolute}.t0{bottom:0;left:50%;transform:translateX(-50%)}.t2{top:0;left:50%;transform:translateX(-50%)}' +
    '.t1{left:0;top:50%;transform:translateY(-50%)}.t3{right:0;top:50%;transform:translateY(-50%)}.trick .win{box-shadow:0 0 0 4px #ffd45c,0 6px 14px rgba(0,0,0,.5)}' +
    '.card{--cw:var(--w);position:relative;flex:none;width:var(--cw);height:calc(var(--cw)*1.45);padding:0;border-radius:calc(var(--cw)*.1);background:#fff;' +
    'border:1px solid #c9ccd6;color:var(--k);font:inherit;box-shadow:0 3px 8px rgba(0,0,0,.4);overflow:hidden}.card.r{--k:#d02b3a}.card.b{--k:#1b1f2a}' +
    '.rk{position:absolute;top:5%;left:9%;font-style:normal;font-weight:800;font-size:calc(var(--cw)*.27);line-height:1.05;text-align:center}' +
    '.su{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.6);padding-top:10%}' +
    '.back{background:repeating-linear-gradient(45deg,#8a6d1c 0 6px,#a8862a 6px 12px);border:2px solid #fff;color:#fff}' +
    '.mini{--cw:calc(var(--w)*.5);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(var(--w)*.26)}' +
    '.bidbox{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:min(90vw,340px);padding:14px;border-radius:16px;background:rgba(8,14,28,.95);text-align:center}' +
    '.bidbox p{margin:0 0 10px;font-size:14px}.bids{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.bids .btn{padding:.6em 0}' +
    '.msg{text-align:center;font-size:14px;padding:4px 12px;min-height:3.2em;flex:none}.msg small{display:block;opacity:.8;margin-top:2px}.mine{text-align:center;font-size:12px;opacity:.85;flex:none}' +
    '.hand{display:flex;overflow-x:auto;overflow-y:hidden;padding:20px 14px 12px;flex:none}.hand .card:first-child{margin-left:auto}.hand .card:last-child{margin-right:auto}' +
    '.hand .card+.card{margin-left:calc(var(--w)*-.45)}.hand .card{cursor:default}.hand .card.ok{transform:translateY(-14px);cursor:pointer;box-shadow:0 0 0 3px #ffd45c,0 6px 14px rgba(0,0,0,.5)}' +
    '.hand .card.no{filter:brightness(.6)}' +
    '.ovl{position:absolute;inset:0;z-index:5;background:rgba(7,12,24,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px}' +
    '.ovl h1{margin:0;font-size:clamp(34px,9vw,60px);color:#ffd45c}.ovl p{margin:0;max-width:44ch;line-height:1.45}' +
    '.sc2{border-collapse:collapse;font-size:15px}.sc2 th,.sc2 td{padding:6px 12px;text-align:center}.sc2 th{opacity:.7;font-weight:600;font-size:12px}.sc2 tr+tr td{border-top:1px solid rgba(255,255,255,.18)}' +
    '.btn:focus-visible,.card:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@keyframes card-land{from{opacity:0;translate:0 -34px;rotate:-8deg;scale:.9}to{opacity:1;translate:0 0;rotate:0deg;scale:1}}' +
    '@media (prefers-reduced-motion:no-preference){.hand .card{transition:transform .2s cubic-bezier(.2,.8,.2,1)}.trick .card.fresh{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both}.trick .win{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both,win-glow .8s ease-in-out infinite alternate}@keyframes win-glow{to{box-shadow:0 0 0 5px #ffe58a,0 8px 18px rgba(0,0,0,.6)}}}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';

  function mount(host) {
    if (root || typeof document === 'undefined') return;
    mountHost = host || document.createElement('div');
    if (!host) document.body.appendChild(mountHost);
    shadow = mountHost.attachShadow({ mode: 'open' });
    var st = document.createElement('style'); st.textContent = ':host{display:block;position:absolute;inset:0;min-height:0}' + CSS; shadow.appendChild(st);
    root = document.createElement('div'); root.className = 'sp'; shadow.appendChild(root);
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
    id: 'spades', name: 'Spades', t: 'Spades', i: '♠️',
    d: 'Bid tricks with your partner, follow suit, and win the contract with spades as trump.',
    minPlayers: 2, maxPlayers: 4, max: 4, cat: 'classic strategy', tag: 'Bid & team up',
    diff: 'Medium', art: 'art-cards', logo: 'spades.svg',
    init: roomInit, valid: roomValid, apply: roomApply, bot: roomBot, draw: roomDraw, click: roomClick,
    soundEvents: roomSoundEvents,
    mount: mount, start: start, _t: { get G() { return G; }, botBid: botBid, botPlay: botPlay, resolve: resolve, next: next, legal: legal },
  };
  global.Spades = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof registerGame === 'function') registerGame(api);
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
