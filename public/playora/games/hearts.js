/* hearts.js - Hearts (4 players: you + 3 bots). Lowest score when someone reaches 100 wins.
   Add <script src="hearts.js"></script> to any page. Progress is saved in the browser. */
(function (global) {
  'use strict';
  var KEY = 'hearts-save-v1', END = 100, ORDER = ['S', 'H', 'C', 'D'];
  var SYM = { S: '\u2660', H: '\u2665', C: '\u2663', D: '\u2666' }, SNAME = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
  var RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }, RNAME = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  var NAMES = ['You', 'West', 'North', 'East']; // clockwise: you (bottom), west, north, east
  var DIRS = [['left', 1], ['right', 3], ['across', 2], ['none', 0]]; // pass direction by round, then repeat
  var G = { phase: 'setup', players: [] }, root = null, timer = null, mountHost = null, shadow = null;

  function playSound(event) {
    if (global.playoraSound && typeof global.playoraSound.playGame === 'function')
      global.playoraSound.playGame('hearts', event);
  }

  /* ---------- rules ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function deck() {
    var d = [], id = 0;
    ORDER.forEach(function (s) { for (var r = 2; r <= 14; r++) d.push({ id: id++, s: s, r: r }); });
    return d;
  }
  function rk(r) { return RANK[r] || String(r); }
  function cname(c) { return (RNAME[c.r] || c.r) + ' of ' + SNAME[c.s]; }
  function isQS(c) { return c.s === 'S' && c.r === 12; }
  function cpts(c) { return c.s === 'H' ? 1 : isQS(c) ? 13 : 0; }
  function trickPts(t) { return t.reduce(function (s, x) { return s + cpts(x.card); }, 0); }
  function winIdx(t) { // highest card of the led suit wins (no trump in Hearts)
    var b = 0;
    for (var i = 1; i < t.length; i++) if (t[i].card.s === t[0].card.s && t[i].card.r > t[b].card.r) b = i;
    return b;
  }
  function why(hand, trick, first, broken) {
    if (!trick.length) return first ? 'Lead the 2 of clubs.' : 'Hearts are not broken yet.';
    var led = trick[0].card.s;
    return hand.some(function (c) { return c.s === led; }) ? 'Follow suit: play a ' + SNAME[led] + ' card.' : 'No hearts or the Queen of spades on the first trick.';
  }
  function legal(hand, trick, first, broken) {
    if (!trick.length) {
      if (first) return hand.filter(function (c) { return c.s === 'C' && c.r === 2; });
      var nh = hand.filter(function (c) { return c.s !== 'H'; });
      return !broken && nh.length ? nh : hand.slice();
    }
    var led = trick[0].card.s, f = hand.filter(function (c) { return c.s === led; });
    if (f.length) return f;
    if (first) { var safe = hand.filter(function (c) { return c.s !== 'H' && !isQS(c); }); if (safe.length) return safe; }
    return hand.slice();
  }

  /* ---------- flow ---------- */
  function start() {
    playSound('start');
    G = { phase: 'pass', round: 1, trick: [], collect: false, sel: [], recv: [], players: NAMES.map(function (n, i) { return { name: n, bot: i > 0, hand: [], taken: [], pts: 0, total: 0 }; }) };
    newRound();
  }
  function newRound() {
    var d = shuffle(deck()), dir = DIRS[(G.round - 1) % 4];
    G.players.forEach(function (p, i) { p.hand = d.slice(i * 13, i * 13 + 13); p.taken = []; p.pts = 0; });
    G.trick = []; G.collect = false; G.broken = false; G.first = true; G.sel = []; G.recv = []; G.dir = dir[0]; G.moon = -1;
    if (!dir[1]) return beginPlay('No passing this round. ');
    G.phase = 'pass'; G.msg = 'Round ' + G.round + ': choose 3 cards to pass ' + dir[0] + '.';
    afterChange();
  }
  function riskOf(c, hand) {
    var sp = hand.filter(function (x) { return x.s === 'S'; }).length;
    if (isQS(c)) return 100;
    if (c.s === 'S' && c.r >= 13) return sp <= 4 ? 80 : 15;
    if (c.s === 'H') return 30 + c.r;
    return c.r;
  }
  function doPass() {
    playSound('move');
    var off = DIRS[(G.round - 1) % 4][1];
    var picks = G.players.map(function (p, i) {
      return i === 0 ? G.sel.slice() : p.hand.slice().sort(function (a, b) { return riskOf(b, p.hand) - riskOf(a, p.hand); }).slice(0, 3).map(function (c) { return c.id; });
    });
    var out = G.players.map(function (p, i) {
      return picks[i].map(function (id) { return p.hand.splice(p.hand.findIndex(function (c) { return c.id === id; }), 1)[0]; });
    });
    G.players.forEach(function (p, i) { var to = G.players[(i + off) % 4]; out[i].forEach(function (c) { to.hand.push(c); }); });
    var mine = out[(4 - off) % 4]; G.recv = mine.map(function (c) { return c.id; }); G.sel = [];
    beginPlay('You received ' + mine.map(function (c) { return rk(c.r) + SYM[c.s]; }).join(', ') + '. ');
  }
  function beginPlay(pre) {
    var s = 0;
    G.players.forEach(function (p, i) { if (p.hand.some(function (c) { return c.s === 'C' && c.r === 2; })) s = i; });
    G.phase = 'play'; G.turn = G.lead = s; G.first = true;
    G.msg = pre + G.players[s].name + (s ? ' has the 2 of clubs and leads.' : ' have the 2 of clubs and lead.');
    afterChange();
  }
  function playCard(pi, id) {
    playSound('move');
    var p = G.players[pi], k = p.hand.findIndex(function (c) { return c.id === id; }), c = p.hand.splice(k, 1)[0];
    G.trick.push({ p: pi, card: c }); if (c.s === 'H') G.broken = true; if (!pi) G.recv = [];
    if (G.trick.length === 4) {
      var w = G.trick[winIdx(G.trick)].p, pts = trickPts(G.trick);
      G.win = w; G.collect = true;
      G.msg = G.players[w].name + (w ? ' takes' : ' take') + ' the trick' + (pts ? ' and ' + pts + (pts > 1 ? ' points.' : ' point.') : '.');
    } else { G.turn = (pi + 1) % 4; G.msg = p.name + ' played the ' + cname(c) + '.'; }
    afterChange();
  }
  function resolve() {
    if (!G.collect) return;
    playSound('capture');
    var w = G.players[G.win];
    G.trick.forEach(function (t) { w.taken.push(t.card); });
    G.trick = []; G.collect = false; G.first = false; G.lead = G.turn = G.win;
    if (!G.players[0].hand.length) return endRound();
    afterChange();
  }
  function endRound() {
    G.players.forEach(function (p) { p.pts = p.taken.reduce(function (s, c) { return s + cpts(c); }, 0); });
    G.moon = G.players.findIndex(function (p) { return p.pts === 26; }); // shot the moon: they score 0, everyone else 26
    G.players.forEach(function (p, i) { if (G.moon > -1) p.pts = i === G.moon ? 0 : 26; p.total += p.pts; });
    if (over()) {
      var ranked = G.players.slice().sort(function (a, b) { return a.total - b.total; });
      playSound(ranked[0] === G.players[0] ? 'win' : 'loss');
    }
    G.phase = 'roundend'; afterChange();
  }
  function over() { return G.players.some(function (p) { return p.total >= END; }); }
  function next() {
    playSound('next');
    if (over()) { clearTimeout(timer); G = { phase: 'setup', players: [] }; clearSave(); return render(); }
    G.round++; newRound();
  }
  function afterChange() {
    clearTimeout(timer);
    if (root) save();
    render();
    if (!root || G.phase !== 'play') return;
    if (G.collect) timer = setTimeout(resolve, 1300);
    else if (G.players[G.turn].bot) timer = setTimeout(botPlay, 800);
  }

  /* ---------- bots ---------- */
  function botCard(pi) {
    var p = G.players[pi], L = legal(p.hand, G.trick, G.first, G.broken).slice().sort(function (a, b) { return a.r - b.r; });
    if (!G.trick.length) {
      var pool = L.filter(function (c) { return c.s !== 'H' && !(c.s === 'S' && c.r >= 12); });
      return (pool.length ? pool : L)[0]; // lead low and safe
    }
    var led = G.trick[0].card.s, f = L.filter(function (c) { return c.s === led; });
    if (f.length) {
      var hi = G.trick[winIdx(G.trick)].card, lower = f.filter(function (c) { return c.r < hi.r; });
      if (lower.length) return lower[lower.length - 1];                              // duck with the highest card that still loses
      return G.trick.length === 3 && !trickPts(G.trick) ? f[f.length - 1] : f[0];    // forced to win: take a clean trick high, else go low
    }
    var q = L.filter(isQS)[0]; if (q) return q;                                      // void: dump the Queen of spades first
    var hs = L.filter(function (c) { return c.s === 'H'; });
    return hs.length ? hs[hs.length - 1] : L[L.length - 1];
  }
  function botPlay() { if (G.phase === 'play' && !G.collect && G.players[G.turn].bot) playCard(G.turn, botCard(G.turn).id); }

  /* ---------- save ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.players && s.players.length === 4 && s.phase && s.phase !== 'setup') { s.sel = []; return s; }
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- UI ---------- */
  function cardHTML(c, cls, attrs) {
    var tag = attrs && /data-(?:a|m)=/.test(attrs) ? 'button type="button"' : 'div';
    var col = c.s === 'H' || c.s === 'D' ? ' r' : ' b';
    return '<' + tag + ' class="card' + col + (cls || '') + '" ' + (attrs || '') + ' aria-label="' + cname(c) + '"><i class="rk">' +
      rk(c.r) + '<br>' + SYM[c.s] + '</i><span class="su">' + SYM[c.s] + '</span></' + tag.split(' ')[0] + '>';
  }
  function taken(p) { return p.taken.reduce(function (s, c) { return s + cpts(c); }, 0); }
  function seat(i) {
    var p = G.players[i], on = G.phase === 'play' && G.turn === i && !G.collect;
    return '<div class="seat s' + i + (on ? ' on' : '') + '"><div class="card back mini">' + p.hand.length + '</div><span class="nm">' + p.name +
      '</span><span class="st">' + (G.phase === 'play' ? 'taken ' + taken(p) + ' pts' : '') + '</span></div>';
  }
  function render() {
    if (!root) return;
    var keep = root.querySelector('.hand'), sl = keep ? keep.scrollLeft : 0, h = '';
    if (G.phase === 'setup') {
      root.innerHTML = '<div class="ovl"><h1>Hearts</h1><p>Avoid points: every heart is 1 point and the Queen of spades is 13. Follow suit, and the highest card of the led suit takes the trick. ' +
        'Hearts can\u2019t be led until one has been played. Take all 26 points and you shoot the moon: you score 0 and everyone else gets 26.</p>' +
        '<p>Cards are passed 3 at a time (left, right, across, then none). The game ends when someone reaches ' + END + ' and the lowest score wins.</p>' +
        '<button class="btn" data-a="start">Start game</button></div>';
      return;
    }
    var me = G.players[0], passing = G.phase === 'pass', myTurn = G.phase === 'play' && G.turn === 0 && !G.collect;
    var L = myTurn ? legal(me.hand, G.trick, G.first, G.broken) : [];
    h += '<div class="bar"><b class="logo">Hearts</b><span class="sc">' + G.players.map(function (p) { return '<span>' + p.name + ' <b>' + p.total + '</b></span>'; }).join('') +
      '</span><button class="btn small" data-a="new">New game</button></div><div class="sub">Round ' + G.round + ' (pass ' + G.dir + '), hearts ' + (G.broken ? '' : 'not ') + 'broken</div>' +
      '<div class="table">' + seat(2) + seat(1) + '<div class="trick">';
    G.trick.forEach(function (t, i) { h += cardHTML(t.card, ' t' + t.p + (G.collect && G.win === t.p ? ' win' : '') + (i === G.trick.length - 1 ? ' fresh' : '')); });
    h += '</div>' + seat(3) + '</div><div class="msg">' + G.msg + '<small>' +
      (passing ? 'Select 3 cards, then press Pass.' : myTurn ? 'Your turn.' : G.phase === 'play' && !G.collect ? G.players[G.turn].name + ' is playing\u2026' : '') + '</small></div><div class="acts">';
    if (passing) h += '<button class="btn" data-a="pass"' + (G.sel.length === 3 ? '' : ' disabled') + '>Pass ' + G.sel.length + ' of 3 cards ' + G.dir + '</button>';
    h += '</div><div class="hand">';
    me.hand.slice().sort(function (a, b) { return ORDER.indexOf(a.s) - ORDER.indexOf(b.s) || b.r - a.r; }).forEach(function (c) {
      var ok = L.some(function (x) { return x.id === c.id; }), selectedOrder = G.sel.indexOf(c.id), s = selectedOrder > -1, cls = '';
      if (passing) cls = ' ok' + (s ? ' sel' : '');
      else if (myTurn) cls = ok ? ' ok' : ' no';
      if (G.recv.indexOf(c.id) > -1) cls += ' new';
      h += cardHTML(c, cls, 'data-a="card" data-v="' + c.id + '"' +
        (s ? ' data-selected-order="' + selectedOrder + '"' : ''));
    });
    h += '</div>';
    if (G.phase === 'roundend') {
      var fin = over(), rank = G.players.slice().sort(function (a, b) { return a.total - b.total; });
      h += '<div class="ovl"><h1>' + (fin ? (rank[0].bot ? rank[0].name + ' wins' : 'You win!') : 'Round ' + G.round + ' done') + '</h1>' +
        (G.moon > -1 ? '<p>' + G.players[G.moon].name + ' shot' + ' the moon!</p>' : '') +
        '<table class="sc2"><tr><th></th><th>Round</th><th>Total</th></tr>' + (fin ? rank : G.players).map(function (p) {
          return '<tr><td>' + p.name + '</td><td>' + p.pts + '</td><td><b>' + p.total + '</b></td></tr>';
        }).join('') + '</table><button class="btn" data-a="next">' + (fin ? 'New game' : 'Next round') + '</button></div>';
    }
    root.innerHTML = h;
    if (typeof global.playoraStackHandCards === 'function') global.playoraStackHandCards(root);
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
    else if (a === 'pass' && G.phase === 'pass' && G.sel.length === 3) doPass();
    else if (a === 'card' && G.phase === 'pass') {
      playSound('menu');
      var k = G.sel.indexOf(+v);
      if (k > -1) G.sel.splice(k, 1); else if (G.sel.length < 3) G.sel.push(+v);
      render();
    }
    else if (a === 'card' && G.phase === 'play' && G.turn === 0 && !G.collect) {
      var hand = G.players[0].hand, ok = legal(hand, G.trick, G.first, G.broken).some(function (c) { return c.id === +v; });
      if (ok) playCard(0, +v); else { G.msg = 'Not allowed: ' + why(hand, G.trick, G.first, G.broken); render(); }
    }
  }

  /* ---------- shared-room contract ---------- */
  function roomCount() {
    var online = typeof ids !== 'undefined' && Array.isArray(ids) && ids.length > 0;
    var humans = typeof np === 'number' ? Math.max(2, Math.min(4, np)) : 2;
    var computerGame = typeof localBot !== 'undefined' && localBot;
    return { online: online, humans: humans, count: online || computerGame ? 4 : humans, computerGame: computerGame };
  }
  function roomName(index, info) {
    if ((info.online && index >= info.humans) || (info.computerGame && index > 0))
      return 'Computer ' + (info.online ? index - info.humans + 1 : index);
    if (typeof gamePlayerNames !== 'undefined' && gamePlayerNames[index] && gamePlayerNames[index] !== 'Computer')
      return gamePlayerNames[index];
    if (typeof nm === 'function') {
      var name = nm(index);
      if (name && name !== 'Computer') return name;
    }
    return 'Player ' + (index + 1);
  }
  function roomSetTurn(index) { G.turn = index; G.t = index; }
  function roomBeginPlay(prefix) {
    var first = 0;
    G.players.forEach(function (player, index) {
      if (player.hand.some(function (c) { return c.s === 'C' && c.r === 2; })) first = index;
    });
    G.phase = 'play';
    G.first = true;
    G.lead = first;
    roomSetTurn(first);
    G.msg = (prefix || '') + G.players[first].name + (first ? ' has the 2 of clubs and leads.' : ' has the 2 of clubs and leads.');
  }
  function roomNewRound() {
    var count = G.players.length, cards = shuffle(deck()), perPlayer = Math.floor(cards.length / count);
    var direction = DIRS[(G.round - 1) % DIRS.length];
    G.players.forEach(function (player, index) {
      player.hand = cards.slice(index * perPlayer, (index + 1) * perPlayer);
      player.taken = [];
      player.pts = 0;
      player.recv = player.hand.map(function (c) { return c.id; });
    });
    G.trick = [];
    G.collect = false;
    G.broken = false;
    G.first = true;
    G.selected = G.players.map(function () { return []; });
    G.passed = G.players.map(function () { return false; });
    G.recv = [];
    G.dir = direction[0];
    G.passOffset = direction[1] ? direction[1] % count || 1 : 0;
    G.moon = -1;
    G.win = -1;
    G.over = false;
    if (!direction[1]) {
      roomBeginPlay('No passing this round. ');
      return;
    }
    G.phase = 'pass';
    roomSetTurn(0);
    G.msg = 'Round ' + G.round + ': choose 3 cards to pass ' + direction[0] + '.';
  }
  function roomPassCards(player) {
    return player.hand.slice().sort(function (a, b) {
      return riskOf(b, player.hand) - riskOf(a, player.hand);
    }).slice(0, 3).map(function (c) { return c.id; });
  }
  function roomValid(action) {
    if (!action || typeof action !== 'object' || G.over || action.player !== G.t) return false;
    var player = G.players[G.t];
    if (!player) return false;
    if (action.type === 'select')
      return G.phase === 'pass' && Number.isInteger(action.cardId) &&
        player.hand.some(function (c) { return c.id === action.cardId; });
    if (action.type === 'pass') {
      var selected = action.cardIds || G.selected[G.t];
      return G.phase === 'pass' && Array.isArray(selected) && selected.length === 3 &&
        new Set(selected).size === 3 && selected.every(function (id) {
          return Number.isInteger(id) && player.hand.some(function (c) { return c.id === id; });
        });
    }
    if (action.type === 'play')
      return G.phase === 'play' && !G.collect && Number.isInteger(action.cardId) &&
        legal(player.hand, G.trick, G.first, G.broken).some(function (c) { return c.id === action.cardId; });
    if (action.type === 'collect') return G.phase === 'play' && G.collect && G.win === G.t;
    return action.type === 'next' && G.phase === 'roundend' && !G.over;
  }
  function roomApply(action) {
    if (!roomValid(action)) return;
    var pi = G.t, player = G.players[pi];
    if (action.type === 'select') {
      var selected = G.selected[pi], existing = selected.indexOf(action.cardId);
      if (existing >= 0) selected.splice(existing, 1);
      else if (selected.length < 3) selected.push(action.cardId);
      player.recv = [];
      return;
    }
    if (action.type === 'pass') {
      var idsToPass = (action.cardIds || G.selected[pi]).slice();
      G.passed[pi] = idsToPass;
      G.selected[pi] = [];
      player.recv = [];
      var next = (pi + 1) % G.players.length;
      if (G.passed.every(Array.isArray)) {
        var outgoing = G.players.map(function (p, index) {
          return G.passed[index].map(function (id) {
            return p.hand.splice(p.hand.findIndex(function (c) { return c.id === id; }), 1)[0];
          });
        });
        G.players.forEach(function (p, index) {
          var recipient = (index + G.passOffset + G.players.length) % G.players.length;
          outgoing[index].forEach(function (c) { G.players[recipient].hand.push(c); });
          G.players[recipient].recv = G.players[recipient].recv.concat(outgoing[index].map(function (c) { return c.id; }));
        });
        var received = outgoing[(G.players.length - G.passOffset) % G.players.length];
        roomBeginPlay('You received ' + received.map(function (c) { return rk(c.r) + SYM[c.s]; }).join(', ') + '. ');
      } else {
        roomSetTurn(next);
        G.msg = player.name + ' passed cards ' + G.dir + '.';
      }
      return;
    }
    if (action.type === 'play') {
      var cardIndex = player.hand.findIndex(function (c) { return c.id === action.cardId; });
      var card = player.hand.splice(cardIndex, 1)[0];
      player.recv = [];
      G.trick.push({ p: pi, card: card });
      if (card.s === 'H') G.broken = true;
      if (G.trick.length === G.players.length) {
        G.win = G.trick[winIdx(G.trick)].p;
        G.collect = true;
        roomSetTurn(G.win);
        var points = trickPts(G.trick);
        G.msg = G.players[G.win].name + ' takes the trick' +
          (points ? ' and ' + points + (points > 1 ? ' points.' : ' point.') : '.');
      } else {
        roomSetTurn((pi + 1) % G.players.length);
        G.msg = player.name + ' played the ' + cname(card) + '.';
      }
      return;
    }
    if (action.type === 'collect') {
      var winner = G.players[G.win];
      G.trick.forEach(function (trick) { winner.taken.push(trick.card); });
      G.trick = [];
      G.collect = false;
      G.first = false;
      G.lead = G.win;
      roomSetTurn(G.win);
      if (!G.players.some(function (p) { return p.hand.length; })) {
        G.players.forEach(function (p) {
          p.pts = p.taken.reduce(function (sum, c) { return sum + cpts(c); }, 0);
        });
        G.moon = G.players.findIndex(function (p) { return p.pts === 26; });
        G.players.forEach(function (p, index) {
          if (G.moon > -1) p.pts = index === G.moon ? 0 : 26;
          p.total += p.pts;
        });
        G.over = G.players.some(function (p) { return p.total >= END; });
        G.phase = 'roundend';
        roomSetTurn(0);
        return;
      }
      G.msg = winner.name + ' leads the next trick.';
      return;
    }
    G.round++;
    roomNewRound();
  }
  function roomBot() {
    var pi = G.t, player = G.players[pi];
    if (!player || !player.bot || G.over) return null;
    if (G.phase === 'pass') return { type: 'pass', player: pi, cardIds: roomPassCards(player) };
    if (G.phase === 'roundend') return { type: 'next', player: pi };
    if (G.phase !== 'play') return null;
    if (G.collect) return { type: 'collect', player: pi };
    return { type: 'play', player: pi, cardId: botCard(pi).id };
  }
  function roomEsc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function scopeRoomCss(css) {
    function transform(text) {
      var output = '', cursor = 0;
      while (cursor < text.length) {
        var open = text.indexOf('{', cursor);
        if (open < 0) { output += text.slice(cursor); break; }
        var header = text.slice(cursor, open), depth = 1, close = open + 1;
        while (close < text.length && depth) {
          if (text.charAt(close) === '{') depth++;
          else if (text.charAt(close) === '}') depth--;
          close++;
        }
        var body = text.slice(open + 1, close - 1), trimmed = header.trim();
        if (trimmed.indexOf('@media') === 0) output += header + '{' + transform(body) + '}';
        else if (trimmed.indexOf('@') === 0) output += header + '{' + body + '}';
        else output += header.split(',').map(function (selector) {
          selector = selector.trim();
          return selector.indexOf('.hr') === 0 ? selector : '.hr ' + selector;
        }).join(',') + '{' + body + '}';
        cursor = close;
      }
      return output;
    }
    return transform(css);
  }
  function injectRoomStyles() {
    if (typeof document === 'undefined' || document.getElementById('hearts-room-style')) return;
    var style = document.createElement('style');
    style.id = 'hearts-room-style';
    style.textContent = scopeRoomCss(CSS.replace(/card-land/g, 'hearts-card-land')
      .replace(/card-deal/g, 'hearts-card-deal').replace(/win-glow/g, 'hearts-win-glow')) +
      `#room #bd .hr button.card{width:var(--cw);height:calc(var(--cw)*1.45);flex:0 0 var(--cw);margin:0;padding:0;border:1px solid #c9ccd6;border-radius:calc(var(--cw)*.1);background:#fff;color:var(--k);font:inherit;text-align:left;box-shadow:0 3px 8px rgba(0,0,0,.4);appearance:none;-webkit-appearance:none;overflow:hidden}
#room #bd .hr .hand button.card:first-child{margin-left:auto}#room #bd .hr .hand button.card:last-child{margin-right:auto}
#room #bd .hr .hand{padding-top:28px;padding-bottom:20px;margin-top:5px}
#room #bd .hr .hand button.card+button.card{margin-left:calc(var(--w)*-.45)}
#room #bd .hr .hand{max-width:1160px;margin-left:auto;margin-right:auto}
#room #bd .hr .acts{order:1}#room #bd .hr .hand{order:2}#room #bd .hr .msg{order:3;margin-top:8px}
#room #bd .hr{box-sizing:border-box;padding-bottom:calc(5vh + env(safe-area-inset-bottom,0px))}
@media(min-width:601px){#room #bd .hr .hand{flex-wrap:wrap;justify-content:center;overflow-x:hidden;overflow-y:hidden}#room #bd .hr .hand .card:first-child{margin-left:0}#room #bd .hr .hand .card:last-child{margin-right:0}}
@media(max-width:600px){#room #bd .hr{--w:clamp(36px,min(18vw,calc((100vw - 40px)/7)),76px)}#room #bd .hr .hand{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:none;grid-auto-rows:calc(var(--w)*.95);align-content:center;justify-items:center;gap:0;overflow:visible;padding:20px 8px calc(10px + var(--w)*.5 + env(safe-area-inset-bottom,0px));grid-template-columns:repeat(16,minmax(0,1fr))}#room #bd .hr .hand button.card{margin:0;grid-column:span 2}#room #bd .hr .hand button.card[style*="--hand-row"]{grid-row:var(--hand-row);grid-column:var(--hand-column) / span 2}#room #bd .hr .hand{display:flex;flex-wrap:wrap;justify-content:center;align-content:center;gap:4px 2px;overflow:hidden}#room #bd .hr .hand button.card:first-child,#room #bd .hr .hand button.card:last-child,#room #bd .hr .hand button.card+button.card{margin:0}}
@media(max-width:520px){#room #bd .hr .hand{padding-bottom:calc(32px + env(safe-area-inset-bottom,0px))}}
@media(max-width:520px) and (max-height:700px){#room #bd .hr{--w:clamp(36px,min(12vw,12vh),46px)}#room #bd .hr .hand{padding-top:24px}}
@media(max-height:520px) and (orientation:landscape){#room #bd .hr{--w:clamp(24px,min(6vh,calc((100vw - 40px)/13)),44px);padding-bottom:4px}#room #bd .hr .hand{flex-wrap:nowrap;overflow:hidden;padding:4px 8px;margin:0}#room #bd .hr .acts{min-height:0;padding:4px 8px;gap:4px}#room #bd .hr .msg{min-height:1em;margin-top:0;padding:2px 8px;font-size:12px}}`;
    document.head.appendChild(style);
  }
  function roomSeat(index) {
    var player = G.players[index], active = G.phase === 'play' && G.t === index && !G.collect;
    return '<div class="seat s' + index + (active ? ' on' : '') + '"><div class="card back mini">' + player.hand.length +
      '</div><span class="nm">' + roomEsc(player.name) + '</span><span class="st">' + (player.bot ? 'Computer' : 'Player') +
      (G.phase === 'play' ? ' · taken ' + taken(player) + ' pts' : '') + '</span></div>';
  }
  function roomHandGridPosition(index, count) {
    var columns = 8, row = Math.ceil(count / columns), remainder = count % columns || columns;
    var lastRowStart = count - remainder;
    if (index < lastRowStart) return '';
    var startColumn = Math.floor((columns * 2 - remainder * 2) / 2) + 1;
    return 'style="--hand-row:' + row + ';--hand-column:' +
      (startColumn + (index - lastRowStart) * 2) + '"';
  }
  function roomDraw() {
    injectRoomStyles();
    var online = typeof ids !== 'undefined' && Array.isArray(ids) && ids.length > 0;
    var viewer = typeof seat === 'number' && seat >= 0 && seat < G.players.length ? seat :
      (online ? -1 : (G.players[G.t].bot ? G.players.findIndex(function (player) { return !player.bot; }) : G.t));
    var current = viewer >= 0 ? G.players[viewer] : null, active = current && G.t === viewer && !G.over &&
      (typeof canAct !== 'function' || canAct());
    var passing = G.phase === 'pass', myTurn = G.phase === 'play' && active && !G.collect;
    var selected = passing && viewer >= 0 ? G.selected[viewer] : [], legalCards = myTurn ?
      legal(current.hand, G.trick, G.first, G.broken) : [];
    var html = '<div class="hr"><div class="bar"><b class="logo">Hearts</b><span class="sc">' +
      G.players.map(function (p) {
        return '<span' + (G.t === G.players.indexOf(p) ? ' class="on"' : '') + '>' + roomEsc(p.name) +
          (p.bot ? ' 🤖' : '') + ' <b>' + p.total + '</b></span>';
      }).join('') + '</span></div><div class="sub">Round ' + G.round + ' (pass ' + roomEsc(G.dir) +
      '), hearts ' + (G.broken ? '' : 'not ') + 'broken</div><div class="table">' +
      (G.players.length > 2 ? roomSeat(2) : '') + (G.players.length > 1 ? roomSeat(1) : '') + '<div class="trick">';
    G.trick.forEach(function (trick, index) {
      html += cardHTML(trick.card, ' t' + trick.p + (G.collect && G.win === trick.p ? ' win' : '') +
        (index === G.trick.length - 1 ? ' fresh' : ''), '');
    });
    html += '</div>' + (G.players.length > 3 ? roomSeat(3) : '') + '</div><div class="msg">' + roomEsc(G.msg) +
      '<small>' + (passing ? (active ? 'Select 3 cards, then press Pass.' : roomEsc(G.players[G.t].name) + ' is passing cards…') :
        myTurn ? 'Your turn.' : G.collect && active ? 'Collect the trick.' :
          G.phase === 'play' && !G.collect ? roomEsc(G.players[G.t].name) + ' is playing…' : '') +
      '</small></div><div class="acts">';
    if (passing && active) html += '<button class="btn" data-m="pass"' +
      (selected.length === 3 ? '' : ' disabled') + '>Pass ' + selected.length + ' of 3 cards ' + roomEsc(G.dir) + '</button>';
    if (G.collect && active) html += '<button class="btn" data-m="collect">Collect trick</button>';
    html += '</div><div class="hand">';
    if (current) current.hand.slice().sort(function (a, b) {
      return ORDER.indexOf(a.s) - ORDER.indexOf(b.s) || b.r - a.r;
    }).forEach(function (card, index, hand) {
      var allowed = passing ? active : myTurn && legalCards.some(function (c) { return c.id === card.id; });
      var selectedOrder = selected.indexOf(card.id), isSelected = selectedOrder > -1;
      var classes = (allowed ? ' ok' : ' no') + (isSelected ? ' sel' : '') +
        (current.recv.indexOf(card.id) > -1 ? ' new' : '');
      var command = allowed ? ' data-m="' + (passing ? 'select:' : 'play:') + card.id + '"' : '';
      html += cardHTML(card, classes, command + (isSelected ? ' data-selected-order="' + selectedOrder + '"' : '') +
        ' ' + roomHandGridPosition(index, hand.length));
    });
    html += '</div>';
    if (G.phase === 'roundend') {
      var ranked = G.players.slice().sort(function (a, b) { return a.total - b.total; });
      html += '<div class="ovl"><h1>' + (G.over ? roomEsc(ranked[0].name) + ' wins' : 'Round ' + G.round + ' done') + '</h1>' +
        (G.moon > -1 ? '<p>' + roomEsc(G.players[G.moon].name) + ' shot the moon!</p>' : '') +
        '<table class="sc2"><tr><th>Player</th><th>Round</th><th>Total</th></tr>' +
        (G.over ? ranked : G.players).map(function (p) {
          return '<tr><td>' + roomEsc(p.name) + '</td><td>' + p.pts + '</td><td><b>' + p.total + '</b></td></tr>';
        }).join('') + '</table>' + (G.over ? '<p>Use Restart to play again.</p>' :
          '<button class="btn" data-m="next">Next round</button>') + '</div>';
    }
    return [html + '</div>', G.msg];
  }
  function roomClick(element) {
    var command = element.dataset.m || '', action, pieces = command.split(':');
    if (pieces[0] === 'select' || pieces[0] === 'play')
      action = { type: pieces[0] === 'select' ? 'select' : 'play', player: G.t, cardId: Number(pieces[1]) };
    else if (pieces[0] === 'pass') action = { type: 'pass', player: G.t, cardIds: G.selected[G.t].slice() };
    else if (pieces[0] === 'collect') action = { type: 'collect', player: G.t };
    else if (pieces[0] === 'next') action = { type: 'next', player: G.t };
    if (action && roomValid(action) && typeof act === 'function') act(action);
  }
  function roomInit() {
    var info = roomCount(), players = [];
    for (var i = 0; i < info.count; i++) {
      players.push({
        name: roomName(i, info),
        bot: info.online ? i >= info.humans : info.computerGame && i > 0,
        hand: [], taken: [], pts: 0, total: 0, recv: []
      });
    }
    G = { phase: 'pass', round: 1, players: players, trick: [], collect: false, selected: [], passed: [] };
    roomNewRound();
    return G;
  }

  var CSS = '.hr{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden;user-select:none;' +
    'font-family:"Trebuchet MS","Avenir Next",system-ui,sans-serif;--w:clamp(44px,min(12.2vw,15vh),92px);' +
    'background:radial-gradient(ellipse at 50% 40%,#8a2438 0,#561628 60%,#2c0b15 100%)}.hr *{box-sizing:border-box}' +
    '.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;flex:none;font-size:13px}.bar .logo{font-size:20px;font-weight:800}' +
    '.sc{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.sub{text-align:center;font-size:12px;opacity:.85;flex:none}' +
    '.btn{font:inherit;font-weight:800;padding:.6em 1.2em;border:0;border-radius:999px;background:#ffd45c;color:#2a0f17;cursor:pointer}.btn.small{padding:.45em 1em;font-size:13px}.btn:disabled{opacity:.45;cursor:default}' +
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
    '.back{background:repeating-linear-gradient(45deg,#1f3c88 0 6px,#2a4fb0 6px 12px);border:2px solid #fff;color:#fff}' +
    '.mini{--cw:calc(var(--w)*.5);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(var(--w)*.26)}' +
    '.msg{text-align:center;font-size:14px;padding:4px 12px;min-height:3.2em;flex:none}.msg small{display:block;opacity:.8;margin-top:2px}' +
    '.acts{display:flex;justify-content:center;min-height:44px;flex:none}' +
    '.hand{display:flex;overflow-x:auto;overflow-y:hidden;padding:20px 14px 12px;flex:none}.hand .card:first-child{margin-left:auto}.hand .card:last-child{margin-right:auto}' +
    '.hand .card+.card{margin-left:calc(var(--w)*-.45)}.hand .card{cursor:default}.hand .card.ok{cursor:pointer}' +
    '.hand .card.ok:not(.sel){position:relative;z-index:2;transform:translateY(-8px)}.hand .card.sel{position:relative;z-index:5;transform:translateY(-20px);box-shadow:0 0 0 3px #ffd45c,0 6px 14px rgba(0,0,0,.5)}' +
    '.hand .card.no{filter:brightness(.6)}.hand .card.new{box-shadow:0 0 0 3px #7be0a4}' +
    '.ovl{position:absolute;inset:0;z-index:5;background:rgba(24,6,12,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px}' +
    '.ovl h1{margin:0;font-size:clamp(34px,9vw,60px);color:#ffd45c}.ovl p{margin:0;max-width:42ch;line-height:1.45}' +
    '.sc2{border-collapse:collapse;font-size:15px}.sc2 th,.sc2 td{padding:6px 14px;text-align:center}.sc2 th{opacity:.7;font-weight:600;font-size:12px}.sc2 tr+tr td{border-top:1px solid rgba(255,255,255,.18)}' +
    '.btn:focus-visible,.card:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@keyframes card-land{from{opacity:0;translate:0 -34px;rotate:-8deg;scale:.9}to{opacity:1;translate:0 0;rotate:0deg;scale:1}}' +
    '@keyframes card-deal{from{opacity:0;translate:0 -30px;rotate:-8deg;scale:.9}to{opacity:1;translate:0 0;rotate:0deg;scale:1}}' +
    '@media (prefers-reduced-motion:no-preference){.hand .card{transition:transform .2s cubic-bezier(.2,.8,.2,1)}.trick .card.fresh{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both}.trick .win{animation:card-land .34s cubic-bezier(.2,.8,.2,1) both,win-glow .8s ease-in-out infinite alternate}.hand .card.new{animation:card-deal .42s cubic-bezier(.2,.8,.2,1) both}@keyframes win-glow{to{box-shadow:0 0 0 5px #ffe58a,0 8px 18px rgba(0,0,0,.6)}}}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';

  function mount(host) {
    if (root || typeof document === 'undefined') return;
    mountHost = host || document.createElement('div');
    if (!host) document.body.appendChild(mountHost);
    shadow = mountHost.attachShadow({ mode: 'open' });
    var st = document.createElement('style'); st.textContent = ':host{display:block;position:absolute;inset:0;min-height:0}' + CSS; shadow.appendChild(st);
    root = document.createElement('div'); root.className = 'hr'; shadow.appendChild(root);
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
    id: 'hearts', name: 'Hearts', t: 'Hearts', i: '♥️',
    d: 'Avoid hearts and the Queen of Spades, pass cards each round, and finish with the lowest score.',
    minPlayers: 2, maxPlayers: 4, max: 4, cat: 'classic strategy', tag: 'Avoid the points',
    diff: 'Medium', art: 'art-cards', logo: 'hearts.svg', hostedUI: true,
    init: roomInit, valid: roomValid, apply: roomApply, bot: roomBot, draw: roomDraw, click: roomClick,
    soundEvents: function (action) {
      if (action.type === 'collect') return ['capture'];
      if (action.type === 'select') return ['menu'];
      if (action.type === 'next') return ['next'];
      return ['move'];
    },
    mount: mount, start: start, _t: { get G() { return G; }, botPlay: botPlay, resolve: resolve, next: next, doPass: doPass, legal: legal, over: over },
  };
  global.Hearts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof registerGame === 'function') registerGame(api);
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
