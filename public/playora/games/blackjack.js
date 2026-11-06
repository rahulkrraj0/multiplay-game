/* blackjack.js - Blackjack against the dealer with chips. 6-deck shoe, dealer stands on all 17s, blackjack pays 3:2.
   Double, split (re-split up to 4 hands), insurance against a dealer Ace, and late surrender.
   Add <script src="blackjack.js"></script> to any page. Your chips are saved in the browser. */
(function (global) {
  'use strict';
  var KEY = 'blackjack-save-v1', START = 1000, MIN = 10, CHIPS = [10, 50, 100, 500], CUT = 80;
  var SUITS = ['S', 'H', 'C', 'D'], SYM = { S: '\u2660', H: '\u2665', C: '\u2663', D: '\u2666' };
  var RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var CHIPCOL = { 10: '#2563c9', 50: '#d1342f', 100: '#1b1f2a', 500: '#7b2cbf' };
  var G = null, root = null, timer = null;

  /* ---------- rules ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function newShoe() {
    var s = [], id = 0;
    for (var d = 0; d < 6; d++) SUITS.forEach(function (st) { for (var r = 1; r <= 13; r++) s.push({ id: id++, s: st, r: r }); });
    return shuffle(s);
  }
  function draw() { if (!G.shoe.length) G.shoe = newShoe(); return G.shoe.pop(); }
  function cv(c) { return Math.min(c.r, 10); }
  function val(cards) { // aces count 11 unless that would bust
    var t = 0, a = 0;
    cards.forEach(function (c) { if (c.r === 1) { a++; t += 11; } else t += cv(c); });
    while (t > 21 && a > 0) { t -= 10; a--; }
    return { t: t, soft: a > 0 };
  }
  function natural(h) { return !h.split && h.cards.length === 2 && val(h.cards).t === 21; }

  /* ---------- flow ---------- */
  function fresh() {
    return { phase: 'bet', chips: START, bet: 0, last: 0, shoe: newShoe(), dealer: [], hands: [], active: 0, hide: false, fresh: [], msg: 'Place your bet.' };
  }
  function addBet(n) { if (G.phase === 'bet' && G.bet + n <= G.chips) { G.bet += n; render(); } }
  function deal() {
    if (G.phase !== 'bet' || G.bet < MIN || G.bet > G.chips) return;
    var note = '';
    if (G.shoe.length < CUT) { G.shoe = newShoe(); note = 'The shoe was reshuffled. '; }
    G.chips -= G.bet; G.last = G.bet;
    var h = { cards: [draw()], bet: G.bet, done: false, split: false, res: '', pay: 0, net: 0 };
    G.dealer = [draw()]; h.cards.push(draw()); G.dealer.push(draw());
    G.hands = [h]; G.active = 0; G.hide = true; G.fresh = []; G.bet = 0; G.ins = 0; G.phase = 'play'; G.msg = note;
    if (G.dealer[0].r === 1) { // dealer shows an Ace: offer insurance before the dealer checks for blackjack
      G.phase = 'insure'; G.msg = note + 'Dealer shows an Ace. Insurance costs ' + (h.bet / 2) + ' and pays 2 to 1.';
      if (G.chips < h.bet / 2) return insure(false);
      return afterChange();
    }
    peek();
  }
  function peek() {
    if (natural(G.hands[0]) || val(G.dealer).t === 21) { G.hide = false; return settle(); } // blackjack on either side ends the hand
    G.phase = 'play'; afterChange();
  }
  function insure(yes) {
    if (G.phase !== 'insure') return;
    var c = G.hands[0].bet / 2;
    if (yes && G.chips >= c) { G.chips -= c; G.ins = c; }
    G.msg = val(G.dealer).t !== 21 && G.ins ? 'No dealer blackjack, insurance lost. ' : '';
    peek();
  }
  function cur() { return G.hands[G.active]; }
  function canDouble() { var h = cur(); return G.phase === 'play' && h.cards.length === 2 && G.chips >= h.bet; }
  function canSplit() {
    var h = cur();
    return G.phase === 'play' && G.hands.length < 4 && h.cards.length === 2 && cv(h.cards[0]) === cv(h.cards[1]) && G.chips >= h.bet &&
      !(h.split && h.cards[0].r === 1); // no re-splitting aces
  }
  function canSurrender() { var h = G.phase === 'play' && G.hands[0]; return !!h && G.hands.length === 1 && h.cards.length === 2 && !h.split; }
  function surrender() {
    if (!canSurrender()) return;
    var h = cur(); h.sur = true; h.done = true; G.hide = false; G.fresh = []; G.msg = '';
    settle();
  }
  function hit() {
    if (G.phase !== 'play') return;
    var h = cur(), c = draw(); h.cards.push(c); G.fresh = [c.id]; G.msg = '';
    if (val(h.cards).t >= 21) h.done = true;
    advance();
  }
  function stand() { if (G.phase !== 'play') return; cur().done = true; G.fresh = []; G.msg = ''; advance(); }
  function dbl() {
    if (!canDouble()) return;
    var h = cur(), c = draw(); G.chips -= h.bet; h.bet *= 2; h.cards.push(c); G.fresh = [c.id]; h.done = true; G.msg = '';
    advance();
  }
  function split() {
    if (!canSplit()) return;
    var h = cur(), a = h.cards[0], b = h.cards[1], c1 = draw(), c2 = draw();
    G.chips -= h.bet;
    var h1 = { cards: [a, c1], bet: h.bet, done: false, split: true, res: '', pay: 0, net: 0 };
    var h2 = { cards: [b, c2], bet: h.bet, done: false, split: true, res: '', pay: 0, net: 0 };
    if (a.r === 1) h1.done = h2.done = true; // split aces get one card each
    [h1, h2].forEach(function (x) { if (val(x.cards).t === 21) x.done = true; });
    G.hands.splice(G.active, 1, h1, h2); G.fresh = [c1.id, c2.id]; G.msg = '';
    advance();
  }
  function advance() {
    while (G.active < G.hands.length && G.hands[G.active].done) G.active++;
    if (G.active >= G.hands.length) {
      G.active = G.hands.length - 1;
      if (G.hands.every(function (h) { return val(h.cards).t > 21; })) { G.hide = false; return settle(); } // everyone busted, dealer doesn't draw
      G.phase = 'dealer';
    }
    afterChange();
  }
  function dealerStep() {
    if (G.phase !== 'dealer') return;
    if (G.hide) G.hide = false;
    else if (val(G.dealer).t < 17) { var c = draw(); G.dealer.push(c); G.fresh = [c.id]; }
    else return settle();
    afterChange();
  }
  function settle() {
    var d = val(G.dealer).t, dBJ = G.dealer.length === 2 && d === 21, insNet = 0;
    if (G.ins) { if (dBJ) { G.chips += G.ins * 3; insNet = G.ins * 2; } else insNet = -G.ins; } // insurance pays 2 to 1
    G.insNet = insNet; G.ins = 0;
    G.hands.forEach(function (h) {
      var v = val(h.cards).t, bj = natural(h);
      if (h.sur) { h.res = 'Surrender'; h.pay = h.bet / 2; }
      else if (v > 21) { h.res = 'Bust'; h.pay = 0; }
      else if (bj && !dBJ) { h.res = 'Blackjack!'; h.pay = h.bet * 2.5; }
      else if (bj && dBJ) { h.res = 'Push'; h.pay = h.bet; }
      else if (dBJ) { h.res = 'Dealer blackjack'; h.pay = 0; }
      else if (d > 21 || v > d) { h.res = 'Win'; h.pay = h.bet * 2; }
      else if (v < d) { h.res = 'Lose'; h.pay = 0; }
      else { h.res = 'Push'; h.pay = h.bet; }
      h.net = h.pay - h.bet; G.chips += h.pay;
    });
    G.hide = false; G.phase = 'result'; G.fresh = [];
    G.msg = G.hands.map(function (h, i) {
      return (G.hands.length > 1 ? 'Hand ' + (i + 1) + ': ' : '') + h.res + (h.net > 0 ? ' (+' + h.net + ')' : h.net < 0 ? ' (' + h.net + ')' : '');
    }).join('   ') + (insNet ? '   Insurance (' + (insNet > 0 ? '+' : '') + insNet + ')' : '');
    afterChange();
  }
  function again(same) {
    if (G.phase !== 'result') return;
    G.dealer = []; G.hands = []; G.phase = 'bet'; G.bet = same ? Math.min(G.last, G.chips) : 0; G.msg = 'Place your bet.';
    if (same && G.bet >= MIN) return deal();
    afterChange();
  }
  function afterChange() {
    clearTimeout(timer);
    if (root) save();
    render();
    if (root && G.phase === 'dealer') timer = setTimeout(dealerStep, 750);
  }

  /* ---------- save ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.shoe && s.phase && typeof s.chips === 'number') return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- UI ---------- */
  function cardHTML(c) {
    var col = c.s === 'H' || c.s === 'D' ? ' r' : ' b', nw = G.fresh && G.fresh.indexOf(c.id) > -1 ? ' deal' : '';
    var rank = c.r, label = RK[rank - 1], face;
    function suitSvg(suit) {
      var path = {
        S: '<path d="M12 2C12 2 3 8.5 3 14.2c0 3 2.3 5 4.9 5 1.5 0 2.8-.6 3.6-1.7-.2 2.2-.9 3.7-2.1 4.9h5.2c-1.2-1.2-1.9-2.7-2.1-4.9.8 1.1 2.1 1.7 3.6 1.7 2.6 0 4.9-2 4.9-5C21 8.5 12 2 12 2z"/>',
        H: '<path d="M12 21C4 15 2 11.5 2 8.2 2 5.4 4.2 3.2 6.9 3.2c2.2 0 4.1 1.2 5.1 3.2 1-2 2.9-3.2 5.1-3.2 2.7 0 4.9 2.2 4.9 5C22 11.5 20 15 12 21z"/>',
        C: '<circle cx="12" cy="7.3" r="4.7"/><circle cx="6.9" cy="14.2" r="4.7"/><circle cx="17.1" cy="14.2" r="4.7"/><circle cx="12" cy="12.3" r="3.2"/><path d="M12 11c0 5-1.4 8.7-3.4 11.5h6.8C13.4 19.7 12 16 12 11z"/>',
        D: '<path d="M12 1.5l8 10.5-8 10.5L4 12z"/>'
      }[suit];
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + '</svg>';
    }
    function index(extra) { return '<i class="ix' + extra + '">' + label + suitSvg(c.s) + '</i>'; }
    if (rank >= 11) face = '<span class="ct"><b>' + label + '</b>' + suitSvg(c.s) + suitSvg(c.s) + '</span>';
    else if (rank === 1) face = '<span class="pp"><span class="big" style="left:50%;top:50%">' + suitSvg(c.s) + '</span></span>';
    else {
      var layouts = {
        2: [[1, 0], [1, 1]], 3: [[1, 0], [1, .5], [1, 1]], 4: [[0, 0], [2, 0], [0, 1], [2, 1]],
        5: [[0, 0], [2, 0], [1, .5], [0, 1], [2, 1]], 6: [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1]],
        7: [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1], [1, .25]],
        8: [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1], [1, .25], [1, .75]],
        9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1], [1, .5]],
        10: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1], [1, 1 / 6], [1, 5 / 6]]
      };
      face = '<span class="pp">' + layouts[rank].map(function (position) {
        return '<span' + (position[1] > .5 ? ' class="f"' : '') + ' style="left:' + [32, 50, 68][position[0]] +
          '%;top:' + (23 + position[1] * 54).toFixed(1) + '%">' + suitSvg(c.s) + '</span>';
      }).join('') + '</span>';
    }
    return '<div class="card' + col + nw + '" aria-label="' + RK[rank - 1] + ' of ' + SYM[c.s] + '">' +
      index(label === '10' ? ' ten' : '') + face + index((label === '10' ? ' ten' : '') + ' br') + '</div>';
  }
  var BACK = '<div class="card back" aria-label="Face-down card"></div>';
  function badge(cards, h) {
    var v = val(cards);
    if (v.t > 21) return 'Bust ' + v.t;
    if (h && natural(h)) return 'Blackjack';
    return (v.soft && v.t < 21 ? 'Soft ' : '') + v.t;
  }
  function render() {
    if (!root || !G) return;
    var h = '', play = G.phase === 'play';
    root.className = 'bj' + (G.hands.length > 2 ? ' many' : '');
    h += '<div class="bar"><b class="logo">Blackjack</b><span class="bank">Chips <b>' + G.chips + '</b></span><button class="btn small" data-a="new">New game</button></div>';
    h += '<div class="zone"><div class="lbl">Dealer <span class="tot">' + (G.dealer.length ? (G.hide ? String(cv(G.dealer[0]) === 1 ? 11 : cv(G.dealer[0])) : badge(G.dealer)) : '') + '</span></div><div class="cards">';
    G.dealer.forEach(function (c, k) { h += k === 1 && G.hide ? BACK : cardHTML(c); });
    h += '</div></div><div class="felt">BLACKJACK PAYS 3 TO 2<small>Dealer stands on all 17s</small></div><div class="zone">';
    if (G.hands.length) {
      h += '<div class="hands">';
      G.hands.forEach(function (hd, k) {
        var on = (play || G.phase === 'dealer') && G.hands.length > 1 && G.active === k;
        h += '<div class="hand' + (on ? ' on' : '') + '"><div class="cards">' + hd.cards.map(cardHTML).join('') + '</div><div class="lbl"><span class="tot">' + badge(hd.cards, hd) +
          '</span> <span class="betl">Bet ' + hd.bet + '</span>' + (hd.res ? ' <b class="res ' + (hd.net > 0 ? 'w' : hd.net < 0 ? 'l' : 'p') + '">' + hd.res + '</b>' : '') + '</div></div>';
      });
      h += '</div>';
    } else h += '<div class="lbl bigbet">Bet <b>' + G.bet + '</b></div>';
    h += '</div><div class="msg">' + G.msg + '</div><div class="acts">';
    if (G.phase === 'bet' && G.chips >= MIN) {
      h += '<div class="rack">' + CHIPS.map(function (n) {
        return '<button class="chip" style="--c:' + CHIPCOL[n] + '" data-a="chip" data-v="' + n + '" aria-label="Add ' + n + '"' + (G.bet + n > G.chips ? ' disabled' : '') + '>' + n + '</button>';
      }).join('') + '</div><div class="row"><button class="btn alt" data-a="clear"' + (G.bet ? '' : ' disabled') + '>Clear</button><button class="btn" data-a="deal"' +
        (G.bet >= MIN ? '' : ' disabled') + '>Deal</button></div>';
    } else if (play) {
      h += '<div class="row"><button class="btn" data-a="hit">Hit</button><button class="btn" data-a="stand">Stand</button><button class="btn alt" data-a="dbl"' + (canDouble() ? '' : ' disabled') +
        '>Double</button><button class="btn alt" data-a="split"' + (canSplit() ? '' : ' disabled') + '>Split</button>' +
        (canSurrender() ? '<button class="btn alt" data-a="sur">Surrender</button>' : '') + '</div>';
    } else if (G.phase === 'insure') {
      h += '<div class="row"><button class="btn" data-a="ins">Insurance (' + (G.hands[0].bet / 2) + ')</button><button class="btn alt" data-a="noins">No insurance</button></div>';
    } else if (G.phase === 'result' && G.chips >= MIN) {
      var nb = Math.min(G.last, G.chips);
      h += '<div class="row"><button class="btn" data-a="same">Deal again (' + nb + ')</button><button class="btn alt" data-a="change">Change bet</button></div>';
    }
    h += '</div>';
    if ((G.phase === 'bet' || G.phase === 'result') && G.chips < MIN && !G.hands.some(function (x) { return !x.res; })) {
      h += '<div class="ovl"><h1>Out of chips</h1><p>The house wins this time. Start again with ' + START + ' chips.</p><button class="btn" data-a="restart">New game</button></div>';
    }
    root.innerHTML = h;
  }
  function onClick(e) {
    var t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v');
    if (a === 'chip') addBet(+v);
    else if (a === 'clear') { G.bet = 0; render(); }
    else if (a === 'deal') deal();
    else if (a === 'hit') hit();
    else if (a === 'stand') stand();
    else if (a === 'dbl') dbl();
    else if (a === 'split') split();
    else if (a === 'sur') surrender();
    else if (a === 'ins') insure(true);
    else if (a === 'noins') insure(false);
    else if (a === 'same') again(true);
    else if (a === 'change') again(false);
    else if (a === 'restart') { clearTimeout(timer); G = fresh(); afterChange(); }
    else if (a === 'new') {
      if (typeof confirm === 'function' && !confirm('Start over with ' + START + ' chips?')) return;
      clearTimeout(timer); G = fresh(); clearSave(); afterChange();
    }
  }
  function onKey(e) {
    if (!G || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (G.phase === 'play') { if (k === 'h') hit(); else if (k === 's') stand(); else if (k === 'd') dbl(); else if (k === 'p') split(); else if (k === 'r') surrender(); }
    else if (G.phase === 'insure') { if (k === 'i') insure(true); else if (k === 'n') insure(false); }
    else if (k === 'enter' && G.phase === 'bet' && !(e.target && e.target.closest && e.target.closest('button'))) deal();
  }

  var CSS = '.bj.many{--w:clamp(38px,min(10vw,12vh),64px)}.bj{position:fixed;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden;user-select:none;' +
    'font-family:"Trebuchet MS","Avenir Next",system-ui,sans-serif;--w:clamp(50px,min(14vw,16vh),86px);' +
    'background:radial-gradient(ellipse at 50% 45%,#12724a 0,#0b4b31 62%,#062a1c 100%)}.bj *{box-sizing:border-box}' +
    '.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;flex:none;font-size:14px}.bar .logo{font-size:20px;font-weight:800}' +
    '.bank b{color:#ffd45c;font-size:18px}.zone{flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;padding:4px 10px;min-height:calc(var(--w)*1.45 + 36px)}' +
    '.cards{display:flex;justify-content:center}.cards .card+.card{margin-left:calc(var(--w)*-.35)}' +
    '.lbl{font-size:13px;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}.tot{background:rgba(0,0,0,.35);border-radius:999px;padding:2px 10px;font-weight:800}' +
    '.betl{opacity:.85}.res{padding:2px 10px;border-radius:999px;color:#10281c}.res.w{background:#ffd45c}.res.l{background:#f0a3a0}.res.p{background:#d8e2f0}' +
    '.bigbet{font-size:16px;margin-top:calc(var(--w)*.5)}.bigbet b{font-size:26px;color:#ffd45c}' +
    '.felt{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:clamp(11px,3.2vw,18px);letter-spacing:.2em;font-weight:800;color:rgba(255,255,255,.22);text-align:center}' +
    '.felt small{font-size:.6em;letter-spacing:.12em;margin-top:4px}.hands{display:flex;gap:calc(var(--w)*.5);justify-content:center;flex-wrap:wrap}' +
    '.hand{display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 8px;border-radius:14px;border:2px solid transparent}.hand.on{border-color:#ffd45c;background:rgba(255,212,92,.12)}' +
    '.card{--cw:var(--w);--k:#171a24;--face:linear-gradient(158deg,#fffefa,#fbf8f1 52%,#eee6d4);--edge:1px solid rgba(23,26,36,.2);--sh:0 1px 1px rgba(0,0,0,.28),0 5px 12px rgba(0,0,0,.34);position:relative;flex:none;width:var(--cw);height:calc(var(--cw)*1.45);border-radius:calc(var(--cw)*.09);background:var(--face);border:var(--edge);color:var(--k);box-shadow:var(--sh);overflow:hidden}' +
    '.card.r{--k:#c4202f}.card.b{--k:#171a24}.card svg{display:block;fill:currentColor}' +
    '.ix{position:absolute;left:7%;top:4.5%;display:flex;flex-direction:column;align-items:center;font-family:Georgia,"Times New Roman",serif;font-weight:800;font-style:normal;font-size:calc(var(--cw)*.22);line-height:1}.ix svg{width:calc(var(--cw)*.17);height:calc(var(--cw)*.17);margin-top:calc(var(--cw)*.03)}.ix.ten{letter-spacing:-.09em}.ix.br{left:auto;top:auto;right:7%;bottom:4.5%;transform:rotate(180deg)}' +
    '.pp{position:absolute;inset:0}.pp span{position:absolute;width:calc(var(--cw)*.17);height:calc(var(--cw)*.17);transform:translate(-50%,-50%)}.pp span.f{transform:translate(-50%,-50%) rotate(180deg)}.pp span.big{width:calc(var(--cw)*.5);height:calc(var(--cw)*.5)}.pp svg{width:100%;height:100%}' +
    '.ct{position:absolute;inset:15% 23%;display:flex;align-items:center;justify-content:center;border:1.5px solid currentColor;border-radius:calc(var(--cw)*.05);background:linear-gradient(135deg,rgba(233,185,73,.3),rgba(233,185,73,0) 62%),repeating-linear-gradient(45deg,rgba(23,26,36,.05) 0 2px,transparent 2px 6px)}.ct b{font-family:Georgia,"Times New Roman",serif;font-size:calc(var(--cw)*.5);line-height:1}.ct svg{position:absolute;width:calc(var(--cw)*.15);height:calc(var(--cw)*.15)}.ct b+svg{left:8%;top:5%}.ct svg+svg{right:8%;bottom:5%;transform:rotate(180deg)}' +
    '.back{background:repeating-linear-gradient(45deg,rgba(255,226,160,.24) 0 1px,transparent 1px 5px),repeating-linear-gradient(-45deg,rgba(255,226,160,.24) 0 1px,transparent 1px 5px),#9c1f2e;border:max(2px,calc(var(--cw)*.05)) solid #fbf8f1}.back::after{content:\"\";position:absolute;inset:calc(var(--cw)*.045);border:1px solid rgba(233,185,73,.85);border-radius:calc(var(--cw)*.05);pointer-events:none}' +
    '.msg{text-align:center;font-size:15px;font-weight:700;padding:4px 12px;min-height:2em;flex:none}' +
    '.acts{flex:none;display:flex;flex-direction:column;align-items:center;gap:10px;padding:6px 12px 16px;min-height:96px}.row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}' +
    '.rack{display:flex;gap:10px}.chip{width:56px;height:56px;border-radius:50%;border:4px dashed #fff;background:var(--c);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:inset 0 0 0 4px var(--c),0 3px 6px rgba(0,0,0,.45)}' +
    '.chip:disabled{opacity:.35;cursor:default}' +
    '.btn{font:inherit;font-weight:800;padding:.65em 1.3em;border:0;border-radius:999px;background:#ffd45c;color:#10281c;cursor:pointer}.btn.small{padding:.45em 1em;font-size:13px}' +
    '.btn.alt{background:transparent;color:#fff;box-shadow:inset 0 0 0 2px #fff}.btn:disabled{opacity:.4;cursor:default}' +
    '.ovl{position:absolute;inset:0;z-index:5;background:rgba(4,22,14,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px}' +
    '.ovl h1{margin:0;font-size:clamp(34px,9vw,60px);color:#ffd45c}.ovl p{margin:0;max-width:40ch;line-height:1.45}' +
    '.btn:focus-visible,.chip:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@media (prefers-reduced-motion:no-preference){.card.deal{animation:dealIn .25s ease-out}@keyframes dealIn{from{transform:translateY(-24px);opacity:0}to{transform:none;opacity:1}}}';

  function mount() {
    if (root || typeof document === 'undefined') return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.className = 'bj'; document.body.appendChild(root);
    root.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    G = load() || fresh();
    afterChange(); // renders, and resumes the dealer's turn for a saved game
  }

  var api = {
    newGame: function () { G = fresh(); afterChange(); },
    _t: { get G() { return G; }, init: function () { G = fresh(); }, addBet: addBet, deal: deal, hit: hit, stand: stand, dbl: dbl, split: split, dealerStep: dealerStep, again: again, val: val, canDouble: canDouble, canSplit: canSplit, insure: insure, surrender: surrender, canSurrender: canSurrender }
  };
  global.Blackjack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
