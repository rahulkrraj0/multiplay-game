(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Poker - Texas Hold'em (no-limit) for 2 to 6 players.
   *
   *  - Freeze-out match: everyone starts with 1,000 chips, blinds go up
   *    every 5 hands, the last player with chips wins.
   *  - Each hand: dealer button, small and big blind, 2 private cards,
   *    then betting rounds pre-flop, flop (3 cards), turn, river.
   *  - Actions: fold, check, call, bet / raise (any amount up to your
   *    whole stack). A raise must be at least the size of the previous
   *    bet or raise; a short all-in is allowed but does not re-open the
   *    betting for players who already acted.
   *  - Showdown: best five cards out of seven. Side pots are built for
   *    all-in players, uncalled bets are returned, split pots share the
   *    chips and the odd chip goes to the first winner left of the dealer.
   *  - Heads-up (2 players left): the dealer posts the small blind, acts
   *    first before the flop and last after it.
   *
   * Online play: uses the shared runtime (act/valid/apply). The only random
   * input is the shuffled deck, which the dealer's client puts inside the
   * deal action so apply() stays deterministic on every peer.
   *
   * Privacy: the board only draws the hole cards of the seat this browser
   * has played (remembered the first time canAct() is true); everyone else
   * is shown as card backs. See viewSeat() if the runtime exposes the local
   * seat directly.
   * NOTE: every peer holds the full state, so this hides cards in the UI only.
   * ------------------------------------------------------------------ */

  const STYLE_ID = "poker-styles";
  const CSS = `
.art-poker {
  background:
    radial-gradient(circle at 22% 26%, #22d3ee 0, transparent 42%),
    radial-gradient(circle at 80% 78%, #f43f5e 0, transparent 40%),
    linear-gradient(135deg, #0e4f36, #04140d);
}

.poker {
  --pk-gold: #fbbf24;
  --cw: clamp(2.2rem, 8vw, 5rem);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  box-sizing: border-box;
  width: min(100%, 72rem);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: clamp(0.6rem, 2.5vw, 1.25rem);
  overflow: hidden;
  border: 0;
  border-radius: 1.25rem;
  background:
    radial-gradient(ellipse at 50% 0, rgba(255, 255, 255, 0.07), transparent 60%),
    linear-gradient(180deg, #12261d, #060d0a);
  color: #f8fafc;
  text-align: center;
}

.poker *,
.poker *::before,
.poker *::after { box-sizing: border-box; }

#room .poker.sel,
#room .poker .sel { outline: none !important; }
#room .poker.mv,
#room .poker .mv { animation: none !important; box-shadow: none !important; }

.poker .pk-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

#gm:has(#bd .poker) > #lg,
#gm:has(#bd .poker) > #st { display: none !important; }

/* ---------- top bar ---------- */
.poker .pk-bar { position: relative; z-index: 6; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.poker .pk-info { margin: 0; min-width: 0; font-size: 0.8rem; font-weight: 600; opacity: 0.8; text-align: left; }
.poker .pk-bar__btns { display: flex; flex: none; gap: 0.4rem; }

.poker .pk-iconbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.26);
  color: inherit;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.poker .pk-iconbtn::-webkit-details-marker { display: none; }
.poker .pk-rules { position: relative; }
.poker .pk-rules__icon { font-family: Georgia, serif; font-style: italic; }
.poker .pk-rules__content {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  width: min(28rem, calc(100vw - 2rem));
  max-height: min(60vh, 32rem);
  padding: 1rem;
  overflow: auto;
  border: 1px solid rgba(167, 243, 208, 0.45);
  border-radius: 0.85rem;
  background: #04180f;
  box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.65);
  text-align: left;
}
.poker .pk-rules__title { margin: 0 0 0.6rem; font-size: 1rem; }
.poker .pk-rules__list { display: grid; gap: 0.5rem; margin: 0; padding-left: 1.1rem; font-size: 0.88rem; line-height: 1.5; }
.poker .pk-rules__ranks { display: grid; gap: 0.15rem; margin: 0.3rem 0 0; padding-left: 1.2rem; }

/* ---------- seats ---------- */
.poker .pk-seats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr)); gap: 0.4rem; }
.poker .pk-seat {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  padding: 0.4rem 0.6rem;
  border: 2px solid transparent;
  border-top: 0.25rem solid var(--sc);
  border-radius: 0.8rem;
  background: rgba(0, 0, 0, 0.34);
  text-align: left;
  transition: border-color 0.25s, box-shadow 0.25s, opacity 0.25s;
}
.poker .pk-seat.is-active { border-color: var(--sc); border-top-color: var(--sc); box-shadow: none; }
.poker .pk-seat.is-act { animation: pk-bump 0.55s ease; animation-delay: calc(0ms - var(--el, 0ms)); }
.poker .pk-seat.is-fold { opacity: 0.5; }
.poker .pk-seat.is-out { opacity: 0.32; filter: grayscale(1); }
.poker .pk-seat__top { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 0.4rem; }
.poker .pk-seat__name { min-width: 0; overflow: hidden; color: var(--sc); font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.poker .pk-seat__chips { font-size: 1.1rem; font-weight: 900; line-height: 1.1; font-variant-numeric: tabular-nums; }
.poker .pk-seat__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; min-height: 1.1rem; font-size: 0.7rem; opacity: 0.9; }
.poker .pk-badge { padding: 0 0.35rem; border: 1px solid rgba(255, 255, 255, 0.45); border-radius: 0.5rem; font-weight: 800; }
.poker .pk-badge--d { border-color: var(--pk-gold); background: var(--pk-gold); color: #1c1917; }
.poker .pk-seat__row { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; min-height: 1.6rem; }
.poker .pk-seat__bet { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.poker .pk-backs { display: flex; gap: 0.15rem; }
.poker .pk-back {
  position: relative;
  width: 1.1rem;
  height: 1.55rem;
  border: 2px solid #fff;
  border-radius: 0.22rem;
  background: repeating-linear-gradient(45deg, rgba(255,226,160,.24) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(255,226,160,.24) 0 1px, transparent 1px 5px), #9c1f2e;
  box-shadow: 0 0.1rem 0.25rem rgba(0, 0, 0, 0.45);
}
.poker .pk-back::after { content: ""; position: absolute; inset: 4.5%; border: 1px solid rgba(233,185,73,.85); border-radius: 5%; }

.poker .pk-chip {
  display: inline-block;
  flex: none;
  width: 1.05rem;
  height: 1.05rem;
  border: 3px dashed #fff;
  border-radius: 50%;
  background: #dc2626;
  box-shadow: 0 0.1rem 0.2rem rgba(0, 0, 0, 0.5);
}

/* ---------- cards ---------- */
.poker .pk-card {
  --face: linear-gradient(158deg, #fffefa, #fbf8f1 52%, #eee6d4);
  --edge: 1px solid rgba(23, 26, 36, 0.2);
  --sh: 0 1px 1px rgba(0, 0, 0, 0.28), 0 5px 12px rgba(0, 0, 0, 0.34);
  position: relative;
  display: block;
  flex: none;
  width: var(--cw);
  height: calc(var(--cw) * 1.42);
  border: var(--edge);
  border-radius: calc(var(--cw) * 0.09);
  background: var(--face);
  color: #1c1917;
  font-size: calc(var(--cw) * 0.34);
  font-weight: 800;
  box-shadow: var(--sh);
  overflow: hidden;
}
.poker .pk-red { color: #c4202f; }
.poker .pk-card svg { display: block; fill: currentColor; }
.poker .pk-card .ix { position: absolute; left: 7%; top: 4.5%; display: flex; flex-direction: column; align-items: center; font: 800 calc(var(--cw) * 0.22)/1 Georgia, "Times New Roman", serif; }
.poker .pk-card .ix svg { width: calc(var(--cw) * 0.17); height: calc(var(--cw) * 0.17); margin-top: calc(var(--cw) * 0.03); }
.poker .pk-card .ix.br { left: auto; top: auto; right: 7%; bottom: 4.5%; transform: rotate(180deg); }
.poker .pk-card .pp { position: absolute; inset: 0; }
.poker .pk-card .pp span { position: absolute; width: calc(var(--cw) * 0.17); height: calc(var(--cw) * 0.17); transform: translate(-50%, -50%); }
.poker .pk-card .pp span.f { transform: translate(-50%, -50%) rotate(180deg); }
.poker .pk-card .pp span.big { width: calc(var(--cw) * 0.5); height: calc(var(--cw) * 0.5); }
.poker .pk-card .pp svg { width: 100%; height: 100%; }
.poker .pk-card .ct { position: absolute; inset: 15% 23%; display: flex; align-items: center; justify-content: center; border: 1.5px solid currentColor; border-radius: calc(var(--cw) * 0.05); background: linear-gradient(135deg, rgba(233,185,73,.3), transparent 62%), repeating-linear-gradient(45deg, rgba(23,26,36,.05) 0 2px, transparent 2px 6px); }
.poker .pk-card .ct b { font: 800 calc(var(--cw) * 0.5)/1 Georgia, "Times New Roman", serif; }
.poker .pk-card .ct svg { position: absolute; width: calc(var(--cw) * 0.15); height: calc(var(--cw) * 0.15); }
.poker .pk-card .ct b + svg { left: 8%; top: 5%; }
.poker .pk-card .ct svg + svg { right: 8%; bottom: 5%; transform: rotate(180deg); }
.poker .pk-card__c { position: absolute; display: flex; flex-direction: column; align-items: center; line-height: 1; font-size: 0.95em; }
.poker .pk-card__c i { font-style: normal; font-size: 0.85em; }
.poker .pk-card__c--tl { top: 7%; left: 9%; }
.poker .pk-card__c--br { right: 9%; bottom: 7%; transform: rotate(180deg); }
.poker .pk-card__pip { position: absolute; inset: 0; display: grid; place-items: center; padding-top: 0.2em; font-size: 1.9em; opacity: 0.9; }
.poker .pk-card--slot { border: 2px dashed rgba(255, 255, 255, 0.28); background: rgba(0, 0, 0, 0.2); box-shadow: none; }
.poker .pk-card.is-new { animation: pk-flip 0.6s cubic-bezier(0.2, 0.8, 0.3, 1.1) backwards; animation-delay: calc(var(--i) * 150ms - var(--el, 0ms)); }
.poker .pk-card.is-dealt { animation: pk-deal 0.55s cubic-bezier(0.2, 0.8, 0.3, 1.1) backwards; animation-delay: calc(var(--i) * 120ms - var(--el, 0ms)); }

/* ---------- table ---------- */
.poker .pk-table {
  position: relative;
  display: grid;
  flex: 1 1 auto;
  align-content: center;
  justify-items: center;
  gap: 0.45rem;
  min-height: 9rem;
  padding: clamp(0.7rem, 2.4vw, 1.4rem);
  border: 0.45rem solid #5b3a1e;
  border-radius: clamp(1.5rem, 8vw, 6rem);
  background: radial-gradient(ellipse at 50% 40%, #16825a, #0b5a3b 55%, #063d27);
  box-shadow: inset 0 0 2.2rem rgba(0, 0, 0, 0.55), 0 0.5rem 1.2rem rgba(0, 0, 0, 0.45);
}
.poker .pk-street { margin: 0; font-size: 0.75rem; font-weight: 700; opacity: 0.85; }
.poker .pk-board { display: flex; flex-wrap: nowrap; justify-content: center; gap: calc(var(--cw) * 0.14); }
.poker .pk-pot { display: flex; align-items: center; justify-content: center; gap: 0.4rem; margin: 0; font-size: 1.1rem; font-variant-numeric: tabular-nums; }
.poker .pk-la { min-height: 1.3em; margin: 0; font-size: 0.85rem; font-weight: 600; opacity: 0.92; }

/* ---------- own hand ---------- */
.poker .pk-me { display: grid; justify-items: center; gap: 0.3rem; }
.poker .pk-me__label { margin: 0; font-size: 0.8rem; font-weight: 700; opacity: 0.85; }
.poker .pk-hole { display: flex; justify-content: center; gap: calc(var(--cw) * 0.12); padding-top: 0.2rem; }
.poker .pk-hole .pk-card { width: calc(var(--cw) * 1.2); height: calc(var(--cw) * 1.7); font-size: calc(var(--cw) * 0.41); border-radius: calc(var(--cw) * 0.16); }
.poker .pk-hole.is-folded .pk-card { opacity: 0.4; filter: grayscale(1); }
.poker .pk-me__made { min-height: 1.3em; margin: 0; font-size: 0.9rem; font-weight: 800; color: var(--pk-gold); }

/* ---------- controls & panels ---------- */
.poker .pk-player-layout { display: grid; gap: 0.7rem; width: 100%; }
.poker .pk-controls { display: grid; gap: 0.5rem; justify-items: center; min-height: 2.6rem; margin-top: 0.1rem; }
.poker .pk-hint { min-height: 1.4em; margin: 0; font-size: 0.9rem; font-weight: 700; }
.poker .pk-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; }
.poker .pk-btn {
  min-width: 7.5rem;
  min-height: 2.75rem;
  padding: 0.6rem 1.1rem;
  border: 0;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 0.2rem 0 rgba(0, 0, 0, 0.35);
  transition: transform 0.12s;
}
.poker .pk-btn:active:not(:disabled) { transform: translateY(0.15rem); box-shadow: none; }
.poker .pk-btn--fold { background: #dc2626; }
.poker .pk-btn--check { background: #2563eb; }
.poker .pk-btn--call { background: #16a34a; }
.poker .pk-btn--gold { background: var(--pk-gold); color: #1c1917; }
.poker .pk-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.poker .pk-raise { display: grid; gap: 0.45rem; justify-items: center; width: min(100%, 32rem); padding: 0.5rem 0.6rem; border-radius: 1rem; background: rgba(0, 0, 0, 0.28); }
.poker .pk-presets,
.poker .pk-stepper { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.4rem; }
.poker .pk-mb {
  min-width: 2.4rem;
  min-height: 2.1rem;
  padding: 0.25rem 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
}
.poker .pk-mb:disabled { opacity: 0.4; cursor: not-allowed; }
.poker .pk-amt { min-width: 6rem; padding: 0.3rem 0.6rem; border-radius: 0.6rem; background: rgba(0, 0, 0, 0.4); font-size: 1.15rem; font-weight: 900; font-variant-numeric: tabular-nums; }

.poker .pk-panel { display: grid; flex: 1 1 auto; align-content: center; justify-items: center; gap: 0.8rem; padding: 0.5rem; }
.poker .pk-panel__h { margin: 0; font-size: clamp(1.1rem, 4cqw, 1.6rem); animation: pk-banner 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) backwards; }
.poker .pk-panel__p { margin: 0; opacity: 0.88; }
.poker .pk-pns { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; }
.poker .pk-pn {
  display: grid;
  width: 4.2rem;
  justify-items: center;
  padding: 0.6rem 0.4rem;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font: inherit;
  font-size: 1.6rem;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}
.poker .pk-pn small { font-size: 0.65rem; font-weight: 600; opacity: 0.8; }
.poker .pk-pn:hover:not(:disabled) { transform: translateY(-0.25rem); border-color: var(--pk-gold); }
.poker .pk-pn:disabled { opacity: 0.5; cursor: not-allowed; }

.poker .pk-sum { display: grid; gap: 0.3rem; width: min(100%, 38rem); }
.poker .pk-sum__board { display: flex; align-items: center; justify-content: center; gap: 0.2rem; min-height: 2.3rem; }
.poker .pk-sum__row { display: grid; grid-template-columns: 6rem 1fr auto; align-items: center; gap: 0.5rem; padding: 0.3rem 0.5rem; border-radius: 0.6rem; background: rgba(0, 0, 0, 0.26); text-align: left; }
.poker .pk-sum__row.is-win { box-shadow: inset 0 0 0 2px var(--pk-gold); }
.poker .pk-sum__n { overflow: hidden; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; color: var(--sc); }
.poker .pk-sum__cards { display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem 0.5rem; font-size: 0.8rem; }
.poker .pk-sum__h { font-weight: 700; color: var(--pk-gold); }
.poker .pk-sum__pts { font-weight: 800; font-variant-numeric: tabular-nums; }
.poker .pk-sum__pts.is-up { color: #86efac; }
.poker .pk-sum__pts.is-down { color: #fca5a5; }
.poker .pk-mini {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 2.2rem;
  border-radius: 0.28rem;
  background: linear-gradient(160deg, #fff, #efe8d8);
  color: #1c1917;
  font-size: 0.65rem;
  font-weight: 800;
  line-height: 1.05;
  box-shadow: 0 0.1rem 0.25rem rgba(0, 0, 0, 0.4);
}
.poker .pk-mini i { font-style: normal; }
.poker .pk-mini.pk-red { color: #dc2626; }

.poker .pk-turn-status { flex: none; min-height: 1.4rem; margin: auto 0 0; font-size: 0.85rem; font-weight: 700; }

.poker .pk-btn:focus-visible,
.poker .pk-mb:focus-visible,
.poker .pk-iconbtn:focus-visible,
.poker .pk-pn:focus-visible { z-index: 3; outline: 3px solid #a78bfa; outline-offset: 3px; }

/* ---------- seat colours ---------- */
.poker .pk-s0 { --sc: #fca5a5; }
.poker .pk-s1 { --sc: #7dd3fc; }
.poker .pk-s2 { --sc: #86efac; }
.poker .pk-s3 { --sc: #fde68a; }
.poker .pk-s4 { --sc: #d8b4fe; }
.poker .pk-s5 { --sc: #fdba74; }

/* ---------- hardening: win against the host page's generic button styles ---------- */
.poker button.pk-btn[data-i] {
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: auto !important;
  min-width: 7.5rem !important;
  min-height: 2.75rem !important;
  margin: 0 !important;
  padding: 0.6rem 1.1rem !important;
  border: 0 !important;
  border-radius: 999px !important;
  color: #fff !important;
  font-family: inherit !important;
  font-size: 1rem !important;
  font-weight: 800 !important;
  text-transform: none !important;
}
.poker button.pk-btn--fold[data-i] { background: #dc2626 !important; }
.poker button.pk-btn--check[data-i] { background: #2563eb !important; }
.poker button.pk-btn--call[data-i] { background: #16a34a !important; }
.poker button.pk-btn--gold[data-i] { background: #fbbf24 !important; color: #1c1917 !important; }
.poker button.pk-btn[data-i]:disabled { opacity: 0.45 !important; }

.poker button.pk-mb[data-i] {
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: auto !important;
  min-width: 2.4rem !important;
  min-height: 2.1rem !important;
  margin: 0 !important;
  padding: 0.25rem 0.7rem !important;
  border: 1px solid rgba(255, 255, 255, 0.35) !important;
  border-radius: 999px !important;
  background: rgba(0, 0, 0, 0.3) !important;
  color: #fff !important;
  font-family: inherit !important;
  font-size: 0.85rem !important;
  font-weight: 800 !important;
  text-transform: none !important;
}
.poker button.pk-mb[data-i]:disabled { opacity: 0.4 !important; }

.poker button.pk-iconbtn[data-i] {
  width: 2.25rem !important;
  min-width: 0 !important;
  height: 2.25rem !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 50% !important;
  background: rgba(0, 0, 0, 0.26) !important;
  color: #fff !important;
}
.poker button.pk-pn[data-i] {
  display: grid !important;
  width: 4.2rem !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0.6rem 0.4rem !important;
  border: 2px solid rgba(255, 255, 255, 0.35) !important;
  border-radius: 1rem !important;
  background: rgba(0, 0, 0, 0.3) !important;
  color: #fff !important;
}

/* ---------- responsive: sized by the game's own container and screen height ---------- */
.poker button { touch-action: manipulation; }

@supports (width: 1cqw) {
  .poker { --cw: clamp(2.2rem, min(7.2cqw, 10.5vh), 5.2rem); container-type: inline-size; }
}

@container (max-width: 40rem) {
  .poker .pk-seat { padding: 0.3rem 0.45rem; }
  .poker .pk-seat__chips { font-size: 1rem; }
  .poker .pk-btn { min-width: 0; flex: 1 1 6rem; }
  .poker .pk-actions { width: 100%; flex-wrap: nowrap; gap: 0.45rem; }
  .poker .pk-actions .pk-btn { min-width: 0 !important; flex: 1 1 0 !important; padding-right: 0.35rem !important; padding-left: 0.35rem !important; white-space: normal; }
  .poker .pk-sum__row { grid-template-columns: 4.5rem 1fr auto; }
}

@container (max-width: 24rem) {
  .poker .pk-pn { width: 3.6rem; font-size: 1.35rem; }
  .poker .pk-backs { display: none; }
}

@container (min-width: 56rem) {
  .poker .pk-seat__chips { font-size: 1.3rem; }
  .poker .pk-info { font-size: 0.9rem; }
  .poker .pk-hint { font-size: 1.05rem; }
}

@container (min-width: 42rem) {
  .poker .pk-player-layout {
    position: relative;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: auto auto 1fr;
    grid-template-areas: "hand raise" "hint raise" "actions raise";
    align-items: stretch;
    gap: 0.25rem 0.65rem;
    max-width: 56rem;
    margin: 0 auto;
  }
  .poker .pk-player-layout::before,
  .poker .pk-player-layout::after {
    content: "";
    z-index: 0;
    border-radius: 0.9rem;
    background: rgba(0, 0, 0, 0.28);
  }
  .poker .pk-player-layout::before { grid-area: 1 / 1 / 4 / 2; }
  .poker .pk-player-layout::after { grid-area: 1 / 2 / 4 / 3; }
  .poker .pk-me,
  .poker .pk-hint,
  .poker .pk-actions,
  .poker .pk-raise {
    position: relative;
    z-index: 1;
  }
  .poker .pk-me {
    grid-area: hand;
    align-content: start;
    width: 100%;
    min-width: 0;
    padding: 0.45rem 0.6rem 0;
  }
  .poker .pk-me__label { font-size: 0.95rem; }
  .poker .pk-me__made { min-height: 0; }
  .poker .pk-controls { display: contents; }
  .poker .pk-hint { grid-area: hint; align-self: end; padding: 0 0.45rem; }
  .poker .pk-actions { grid-area: actions; align-self: start; width: 100%; padding: 0 0.45rem 0.55rem; }
  .poker .pk-actions .pk-btn { flex: 1 1 6rem; }
  .poker .pk-raise { grid-area: raise; align-self: center; width: 100%; max-width: none; }
}

@media (max-width: 30rem) {
  .poker { height: 100%; min-height: 0; }
  .poker button.pk-btn[data-i] { min-width: 0 !important; flex: 1 1 0 !important; padding: 0.55rem 0.35rem !important; font-size: 0.9rem !important; }
  .poker .pk-actions { width: 100%; flex-wrap: nowrap; gap: 0.45rem; }
}

@media (max-height: 48rem) {
  .poker { gap: 0.35rem; padding: 0.5rem; --cw: clamp(2.1rem, min(7cqw, calc(9vh - 0.2rem)), 4rem); }
  .poker .pk-seat { padding: 0.25rem 0.5rem; }
  .poker .pk-table { min-height: 6rem; padding: 0.5rem; }
  .poker .pk-hint { min-height: 1em; font-size: 0.8rem; }
  .poker .pk-btn { min-height: 2.35rem; padding: 0.4rem 0.8rem; }
}

/* ---------- keyframes ---------- */
@keyframes pk-deal { from { opacity: 0; transform: translate(0, -9rem) rotate(18deg) scale(0.5); } }
@keyframes pk-flip { from { opacity: 0; transform: translateY(-3rem) rotateY(90deg) scale(0.7); } }
@keyframes pk-bump { 0%, 100% { transform: none; } 40% { transform: translateY(-0.25rem) scale(1.04); } }
@keyframes pk-banner { from { opacity: 0; transform: scale(0.7) translateY(1rem); } }

@media (prefers-reduced-motion: reduce) {
  .poker *,
  .poker *::before,
  .poker *::after { animation: none !important; transition: none !important; }
}
`;

  if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ------------------------------ constants ------------------------------ */

  const SUITS = ["♠", "♥", "♦", "♣"];
  const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
  const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RN = [null, null, "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
  const RP = [null, null, "Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];
  const STREET_NAMES = { preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River" };
  const MIN_P = 2;
  const MAX_P = 6;
  const DECK = 52;
  const START = 1000;
  const PER_LEVEL = 5;
  const LEVELS = [
    [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
    [200, 400], [300, 600], [400, 800], [500, 1000], [750, 1500], [1000, 2000],
  ];

  // ids 0..51: 0-12 spades, 13-25 hearts, 26-38 diamonds, 39-51 clubs; 2 low ... Ace high.
  const rank = (id) => (id % 13) + 2;
  const suit = (id) => Math.floor(id / 13);
  const isId = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const zeros = (n) => Array(n).fill(0);
  const falses = (n) => Array(n).fill(false);
  const sortHole = (h) => h.slice().sort((a, b) => rank(b) - rank(a) || suit(a) - suit(b));
  const fmt = (n) => Number(n).toLocaleString("en-US");

  let anim = { seq: -1, start: 0 };   // local animation clock for S.last
  let mySeat = null;                  // seat this browser has played (see viewSeat)
  let raiseTo = 0;                    // local, un-synced raise amount
  let rzKey = "";                     // which turn raiseTo belongs to

  /* ------------------------------ helpers ------------------------------- */

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function blinds(hn) {
    const lv = Math.floor((hn - 1) / PER_LEVEL);
    if (lv < LEVELS.length) return LEVELS[lv];
    const m = Math.pow(2, lv - LEVELS.length + 1);
    const last = LEVELS[LEVELS.length - 1];
    return [last[0] * m, last[1] * m];
  }

  /* ----------------------------- hand evaluator ------------------------- */

  // Score of exactly five cards. Higher is better; equal scores tie.
  // score = category * 15^5 + up to five tie-break ranks, most important first.
  // 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush,
  // 6 full house, 7 quads, 8 straight flush (royal flush = ace high).
  function eval5(c) {
    const rs = [rank(c[0]), rank(c[1]), rank(c[2]), rank(c[3]), rank(c[4])].sort((a, b) => b - a);
    const flush = suit(c[0]) === suit(c[1]) && suit(c[1]) === suit(c[2]) && suit(c[2]) === suit(c[3]) && suit(c[3]) === suit(c[4]);
    let straight = 0;
    if (rs[0] !== rs[1] && rs[1] !== rs[2] && rs[2] !== rs[3] && rs[3] !== rs[4]) {
      if (rs[0] - rs[4] === 4) straight = rs[0];
      else if (rs[0] === 14 && rs[1] === 5) straight = 5;          // A-2-3-4-5 (the wheel)
    }
    const cnt = new Array(15).fill(0);
    for (let i = 0; i < 5; i++) cnt[rs[i]]++;
    const g = [];
    for (let r = 14; r >= 2; r--) if (cnt[r]) g.push(r);
    g.sort((a, b) => cnt[b] - cnt[a] || b - a);
    const shape = g.map((r) => cnt[r]).join("");
    let cat; let ks;
    if (straight && flush) { cat = 8; ks = [straight]; }
    else if (shape === "41") { cat = 7; ks = g; }
    else if (shape === "32") { cat = 6; ks = g; }
    else if (flush) { cat = 5; ks = rs; }
    else if (straight) { cat = 4; ks = [straight]; }
    else if (shape === "311") { cat = 3; ks = g; }
    else if (shape === "221") { cat = 2; ks = g; }
    else if (shape === "2111") { cat = 1; ks = g; }
    else { cat = 0; ks = rs; }
    let v = cat;
    for (let i = 0; i < 5; i++) v = v * 15 + (ks[i] || 0);
    return v;
  }

  // Best five-card hand out of 5, 6 or 7 cards.
  function best(cards) {
    const n = cards.length;
    const idx = [0, 1, 2, 3, 4];
    let bv = -1;
    let bc = null;
    for (;;) {
      const five = idx.map((k) => cards[k]);
      const v = eval5(five);
      if (v > bv) { bv = v; bc = five; }
      let i = 4;
      while (i >= 0 && idx[i] === n - 5 + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < 5; j++) idx[j] = idx[j - 1] + 1;
    }
    return { v: bv, c: bc };
  }

  function describe(v) {
    const ks = [];
    let x = v;
    for (let i = 0; i < 5; i++) { ks.unshift(x % 15); x = Math.floor(x / 15); }
    switch (x) {
      case 8: return ks[0] === 14 ? "Royal flush" : "Straight flush, " + RN[ks[0]] + " high";
      case 7: return "Four of a kind, " + RP[ks[0]];
      case 6: return "Full house, " + RP[ks[0]] + " full of " + RP[ks[1]];
      case 5: return "Flush, " + RN[ks[0]] + " high";
      case 4: return "Straight, " + RN[ks[0]] + " high";
      case 3: return "Three of a kind, " + RP[ks[0]];
      case 2: return "Two pair, " + RP[ks[0]] + " and " + RP[ks[1]];
      case 1: return "Pair of " + RP[ks[0]];
      default: return RN[ks[0]] + " high";
    }
  }

  /* ----------------------------- seats & chips -------------------------- */

  const nxt = (s, pred) => {
    for (let k = 1; k <= S.np; k++) {
      const q = (s + k) % S.np;
      if (pred(q)) return q;
    }
    return -1;
  };

  const potTotal = () => S.tot.reduce((a, b) => a + b, 0);

  function liveSeats() {
    const r = [];
    for (let i = 0; i < S.np; i++) if (S.in[i] && !S.fold[i]) r.push(i);
    return r;
  }

  function pay(seat, amt) {
    const p = Math.max(0, Math.min(S.ch[seat], amt));
    S.ch[seat] -= p;
    S.bet[seat] += p;
    S.tot[seat] += p;
    return p;
  }

  // [lowest, highest] raise-to total for the seat to act.
  function bounds() {
    const t = S.t;
    const mx = S.bet[t] + S.ch[t];
    return [Math.min(S.cur + S.mr, mx), mx];
  }

  // Raising needs chips beyond the current bet, a betting round that is open
  // to this seat, and at least one opponent who still has chips to respond.
  function canRaiseNow() {
    const t = S.t;
    if (S.ph !== "bet" || !S.in[t] || S.fold[t] || !S.rz[t]) return false;
    if (S.bet[t] + S.ch[t] <= S.cur) return false;
    for (let q = 0; q < S.np; q++) if (q !== t && S.in[q] && !S.fold[q] && S.ch[q] > 0) return true;
    return false;
  }

  function blank(np, ph) {
    return {
      ph, t: 0, over: 0, msg: "", seq: 0,
      np, dealer: 0, hn: 1, st: "preflop",
      ch: Array(np).fill(START), out: falses(np), elim: zeros(np),
      in: falses(np), fold: falses(np), todo: falses(np), rz: falses(np),
      bet: zeros(np), tot: zeros(np), cur: 0, mr: 0,
      sbA: 0, bbA: 0, sbS: -1, bbS: -1,
      hole: Array.from({ length: np }, () => []), board: [], dk: [],
      lh: null, la: "", last: null,
    };
  }

  /* ------------------------------- hand flow ---------------------------- */

  function startHand(p) {
    const np = S.np;
    S.in = S.out.map((o) => !o);
    S.fold = falses(np);
    S.bet = zeros(np);
    S.tot = zeros(np);
    S.todo = falses(np);
    S.rz = Array(np).fill(true);
    S.hole = Array.from({ length: np }, () => []);
    S.board = [];
    S.lh = null;
    S.msg = "";

    const inHand = (q) => S.in[q];
    const sb = S.in.filter(Boolean).length === 2 ? S.dealer : nxt(S.dealer, inHand);
    const bb = nxt(sb, inHand);
    const order = [];
    let q = sb;
    do { order.push(q); q = nxt(q, inHand); } while (q !== sb);
    let k = 0;
    for (let r = 0; r < 2; r++) order.forEach((s) => { S.hole[s].push(p[k++]); });
    S.hole = S.hole.map(sortHole);
    S.dk = p.slice(k);

    const bl = blinds(S.hn);
    S.sbA = bl[0];
    S.bbA = bl[1];
    S.sbS = sb;
    S.bbS = bb;
    pay(sb, S.sbA);
    pay(bb, S.bbA);
    S.cur = S.bbA;
    S.mr = S.bbA;
    S.st = "preflop";
    for (let i = 0; i < np; i++) S.todo[i] = S.in[i] && S.ch[i] > 0;
    S.ph = "bet";
    S.t = S.dealer;
    S.last = { seq: ++S.seq, kind: "deal", seat: S.dealer };
    S.la = "Blinds " + fmt(S.sbA) + "/" + fmt(S.bbA);
    advance(bb);
  }

  // After any betting action: who acts next, or is the round (or hand) over?
  function advance(from) {
    const lv = liveSeats();
    if (lv.length === 1) { winByFold(lv[0]); return; }
    const n = nxt(from, (q) => S.in[q] && !S.fold[q] && S.ch[q] > 0 && S.todo[q]);
    if (n >= 0) { S.t = n; return; }
    nextStreet();
  }

  function dealStreet() {
    const from = S.board.length;
    S.dk.shift();                                   // burn card
    const n = S.st === "preflop" ? 3 : 1;
    for (let k = 0; k < n; k++) S.board.push(S.dk.shift());
    S.st = S.st === "preflop" ? "flop" : S.st === "flop" ? "turn" : "river";
    S.last = { seq: ++S.seq, kind: "street", seat: -1, from };
  }

  function nextStreet() {
    S.bet = zeros(S.np);
    S.cur = 0;
    S.mr = S.bbA;
    for (;;) {
      if (S.st === "river") { showdown(); return; }
      dealStreet();
      const able = [];
      for (let i = 0; i < S.np; i++) if (S.in[i] && !S.fold[i] && S.ch[i] > 0) able.push(i);
      if (able.length >= 2) {
        S.todo = falses(S.np);
        S.rz = Array(S.np).fill(true);
        able.forEach((i) => { S.todo[i] = true; });
        S.t = nxt(S.dealer, (q) => S.todo[q]);
        return;
      }
      // nobody (or only one player) can still bet: run the board out
    }
  }

  // The biggest bet goes back to its owner when nobody matched all of it.
  function returnUncalled() {
    let m1 = -1; let i1 = -1; let m2 = 0;
    S.tot.forEach((v, i) => {
      if (v > m1) { m2 = Math.max(m1, 0); m1 = v; i1 = i; }
      else if (v > m2) m2 = v;
    });
    if (i1 >= 0 && m1 > m2) {
      S.ch[i1] += m1 - m2;
      S.tot[i1] = m2;
    }
  }

  // Main pot and side pots: one pot per contribution level, only players who
  // did not fold and paid at least that level can win it.
  function buildPots() {
    const levels = Array.from(new Set(S.tot.filter((v) => v > 0))).sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    levels.forEach((lv) => {
      let amt = 0;
      S.tot.forEach((v) => { amt += Math.max(0, Math.min(v, lv) - prev); });
      const el = [];
      S.tot.forEach((v, i) => { if (v >= lv && S.in[i] && !S.fold[i]) el.push(i); });
      if (el.length) pots.push({ amt, el });
      else if (pots.length) pots[pots.length - 1].amt += amt;
      prev = lv;
    });
    return pots;
  }

  function winByFold(w) {
    const total = potTotal();
    const won = zeros(S.np);
    won[w] = total;
    finishHand(won, {}, false, nm(w) + " takes the pot of " + fmt(total) + ". Everyone else folded.");
  }

  function showdown() {
    while (S.board.length < 5) dealStreet();
    returnUncalled();
    const pots = buildPots();
    const sc = {};
    liveSeats().forEach((i) => { sc[i] = best(S.hole[i].concat(S.board)); });
    const won = zeros(S.np);
    pots.forEach((pt) => {
      let top = -1;
      let ws = [];
      pt.el.forEach((i) => {
        const v = sc[i].v;
        if (v > top) { top = v; ws = [i]; } else if (v === top) ws.push(i);
      });
      const dist = (s) => (s - S.dealer - 1 + S.np) % S.np;       // clockwise from the dealer
      ws.sort((a, b) => dist(a) - dist(b));
      const share = Math.floor(pt.amt / ws.length);
      let rem = pt.amt - share * ws.length;
      ws.forEach((w) => {
        won[w] += share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
      });
    });
    const parts = [];
    for (let i = 0; i < S.np; i++) {
      if (won[i] > 0 && sc[i]) parts.push(nm(i) + " wins " + fmt(won[i]) + " with " + describe(sc[i].v));
    }
    finishHand(won, sc, true, parts.join(". ") + ".");
  }

  function finishHand(won, sc, show, msg) {
    const np = S.np;
    const seats = [];
    for (let i = 0; i < np; i++) {
      if (!S.in[i]) continue;
      seats.push({
        i, f: S.fold[i], w: won[i] > 0, x: false,
        c: show && !S.fold[i] ? S.hole[i].slice() : null,
        h: show && sc[i] ? describe(sc[i].v) : "",
        net: won[i] - S.tot[i],
      });
      S.ch[i] += won[i];
    }
    const busted = [];
    seats.forEach((r) => {
      if (S.ch[r.i] === 0) { S.out[r.i] = true; S.elim[r.i] = S.hn; r.x = true; busted.push(r.i); }
    });
    S.lh = { n: S.hn, show, board: S.board.slice(), seats, bl: [S.sbA, S.bbA] };

    S.in = falses(np);
    S.fold = falses(np);
    S.todo = falses(np);
    S.rz = falses(np);
    S.bet = zeros(np);
    S.tot = zeros(np);
    S.hole = Array.from({ length: np }, () => []);
    S.board = [];
    S.dk = [];
    S.cur = 0;
    S.la = "";
    S.last = { seq: ++S.seq, kind: "win", seat: -1 };

    const alive = [];
    for (let i = 0; i < np; i++) if (!S.out[i]) alive.push(i);
    if (alive.length <= 1) {
      const champ = alive.length ? alive[0] : 0;
      S.over = 1;
      S.ph = "end";
      S.t = champ;
      S.msg = nm(champ) + " wins the match with " + fmt(S.ch[champ]) + " chips!";
      return;
    }
    S.msg = msg + (busted.length
      ? " " + busted.map((i) => nm(i)).join(" and ") + (busted.length > 1 ? " are" : " is") + " out."
      : "");
    S.hn += 1;
    S.ph = "deal";
    S.dealer = nxt(S.dealer, (q) => !S.out[q]);
    S.t = S.dealer;
  }

  /* ------------------------------ rendering ----------------------------- */

  const redCls = (id) => (suit(id) === 1 || suit(id) === 2 ? " pk-red" : "");
  const cardName = (id) => RN[rank(id)] + " of " + SUIT_NAMES[suit(id)];
  const mine = () => !!canAct() && !S.over;

  // The seat whose hole cards this browser may see. If the runtime exposes the
  // local seat, return it here. Otherwise remember the seat the first time it is ours.
  function viewSeat() {
    if (canAct()) mySeat = S.t;
    return mySeat !== null && mySeat < S.np ? mySeat : null;
  }

  function face(id) {
    const value = rank(id), r = RANK_LABELS[value - 2], symbol = SUITS[suit(id)];
    const key = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" }[symbol];
    const path = {
      S: '<path d="M12 2C12 2 3 8.5 3 14.2c0 3 2.3 5 4.9 5 1.5 0 2.8-.6 3.6-1.7-.2 2.2-.9 3.7-2.1 4.9h5.2c-1.2-1.2-1.9-2.7-2.1-4.9.8 1.1 2.1 1.7 3.6 1.7 2.6 0 4.9-2 4.9-5C21 8.5 12 2 12 2z"/>',
      H: '<path d="M12 21C4 15 2 11.5 2 8.2 2 5.4 4.2 3.2 6.9 3.2c2.2 0 4.1 1.2 5.1 3.2 1-2 2.9-3.2 5.1-3.2 2.7 0 4.9 2.2 4.9 5C22 11.5 20 15 12 21z"/>',
      C: '<circle cx="12" cy="7.3" r="4.7"/><circle cx="6.9" cy="14.2" r="4.7"/><circle cx="17.1" cy="14.2" r="4.7"/><circle cx="12" cy="12.3" r="3.2"/><path d="M12 11c0 5-1.4 8.7-3.4 11.5h6.8C13.4 19.7 12 16 12 11z"/>',
      D: '<path d="M12 1.5l8 10.5-8 10.5L4 12z"/>'
    }[key];
    const suitArt = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + "</svg>";
    let middle;
    if (value >= 11 && value < 14) middle = '<span class="ct"><b>' + r + "</b>" + suitArt + suitArt + "</span>";
    else if (value === 14) middle = '<span class="pp"><span class="big" style="left:50%;top:50%">' + suitArt + "</span></span>";
    else {
      const layouts = {
        2: [[1, 0], [1, 1]], 3: [[1, 0], [1, .5], [1, 1]], 4: [[0, 0], [2, 0], [0, 1], [2, 1]],
        5: [[0, 0], [2, 0], [1, .5], [0, 1], [2, 1]], 6: [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1]],
        7: [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1], [1, .25]],
        8: [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1], [1, .25], [1, .75]],
        9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1], [1, .5]],
        10: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1], [1, 1 / 6], [1, 5 / 6]]
      };
      middle = '<span class="pp">' + layouts[value].map(([x, y]) =>
        '<span' + (y > .5 ? ' class="f"' : '') + ' style="left:' + [32, 50, 68][x] + "%;top:" + (23 + y * 54).toFixed(1) + "%>" + suitArt + "</span>"
      ).join("") + "</span>";
    }
    return '<i class="ix br" aria-hidden="true">' + r + suitArt + "</i><i class=\"ix\">" + r + suitArt + "</i>" + middle;
  }

  function mini(id) {
    return '<span class="pk-mini' + redCls(id) + '"><b>' + RANK_LABELS[rank(id) - 2] + "</b><i>" + SUITS[suit(id)] + "</i></span>";
  }

  function raiseLabel() {
    const b = bounds();
    if (raiseTo >= b[1]) return "All-in " + fmt(b[1]);
    return (S.cur === 0 ? "Bet " : "Raise to ") + fmt(raiseTo);
  }

  function hintText() {
    if (S.ph !== "bet" || !mine()) return "";
    const t = S.t;
    const full = S.cur - S.bet[t];
    const pot = fmt(potTotal());
    if (full === 0) return "Your turn · pot " + pot + " · check" + (canRaiseNow() ? " or bet." : ".");
    return "Your turn · " + fmt(Math.min(full, S.ch[t])) + " to call · pot " + pot + ".";
  }

  function syncRaise(root) {
    if (!root) return;
    const b = bounds();
    const amt = root.querySelector('[data-role="amt"]');
    if (amt) amt.textContent = fmt(raiseTo);
    const btn = root.querySelector('[data-role="raise"]');
    if (btn) btn.textContent = raiseLabel();
    const lo = root.querySelector('[data-role="minus"]');
    if (lo) lo.disabled = raiseTo <= b[0];
    const hi = root.querySelector('[data-role="plus"]');
    if (hi) hi.disabled = raiseTo >= b[1];
  }

  function seatHTML(i, an, L) {
    const out = S.out[i];
    const inHand = S.ph === "bet" && S.in[i];
    const folded = inHand && S.fold[i];
    const allin = inHand && !folded && S.ch[i] === 0;
    const active = !S.over && S.ph === "bet" && S.t === i;
    const acted = an && L && L.seat === i && L.kind !== "deal" && L.kind !== "street";
    const badges = [];
    if (!out && !S.over && S.dealer === i) badges.push('<span class="pk-badge pk-badge--d" title="Dealer">D</span>');
    if (inHand && S.sbS === i) badges.push('<span class="pk-badge" title="Small blind">SB</span>');
    if (inHand && S.bbS === i) badges.push('<span class="pk-badge" title="Big blind">BB</span>');
    const state = out ? "Out" : folded ? "Folded" : allin ? "All-in" : active ? "To act" : "";
    return '<div class="pk-seat pk-s' + i + (active ? " is-active" : "") + (acted ? " is-act" : "") +
      (folded ? " is-fold" : "") + (out ? " is-out" : "") + '">' +
      '<div class="pk-seat__top"><span class="pk-seat__name">' + computerBadge(i) + esc(nm(i)) + "</span>" +
      '<span class="pk-seat__chips" aria-label="' + S.ch[i] + ' chips">' + fmt(S.ch[i]) + "</span></div>" +
      '<div class="pk-seat__meta">' + badges.join("") + (state ? "<span>" + state + "</span>" : "") + "</div>" +
      '<div class="pk-seat__row">' +
      (inHand && !folded ? '<span class="pk-backs" aria-hidden="true"><span class="pk-back"></span><span class="pk-back"></span></span>' : "<span></span>") +
      (inHand && S.bet[i] > 0 ? '<span class="pk-seat__bet"><span class="pk-chip"></span>' + fmt(S.bet[i]) + "</span>" : "") +
      "</div></div>";
  }

  function tableHTML(an, L) {
    const slots = [];
    for (let k = 0; k < 5; k++) {
      if (k < S.board.length) {
        const id = S.board[k];
        const fresh = an && L && L.kind === "street" && k >= L.from;
        slots.push('<span class="pk-card' + redCls(id) + (fresh ? " is-new" : "") + '" style="--i:' + Math.max(0, k - (L ? L.from : 0)) +
          '" role="img" aria-label="' + cardName(id) + '">' + face(id) + "</span>");
      } else {
        slots.push('<span class="pk-card pk-card--slot" aria-hidden="true"></span>');
      }
    }
    return '<div class="pk-table"><p class="pk-street">' + STREET_NAMES[S.st] + " · Blinds " + fmt(S.sbA) + "/" + fmt(S.bbA) + "</p>" +
      '<div class="pk-board" aria-label="Community cards">' + slots.join("") + "</div>" +
      '<p class="pk-pot"><span class="pk-chip"></span>Pot <b>' + fmt(potTotal()) + "</b></p>" +
      '<p class="pk-la" aria-live="polite">' + esc(S.la) + "</p></div>";
  }

  function meHTML(vs, an, L) {
    if (vs === null) {
      return '<div class="pk-panel"><p class="pk-panel__p">Your cards appear here once it is your turn.</p></div>';
    }
    if (S.out[vs]) {
      return '<div class="pk-me"><p class="pk-me__label">' + esc(nm(vs)) + " is out of the match. You can keep watching.</p></div>";
    }
    if (!S.in[vs]) return "";
    const folded = S.fold[vs];
    const hc = S.hole[vs];
    const cards = hc.map((id, i) =>
      '<span class="pk-card' + redCls(id) + (an && L && L.kind === "deal" ? " is-dealt" : "") + '" style="--i:' + i +
      '" role="img" aria-label="' + cardName(id) + '">' + face(id) + "</span>").join("");
    const made = !folded && S.board.length >= 3 ? describe(best(hc.concat(S.board)).v) : "";
    return '<div class="pk-me"><p class="pk-me__label">' + esc(nm(vs)) + (folded ? " · folded" : "") + "</p>" +
      '<div class="pk-hole' + (folded ? " is-folded" : "") + '" role="group" aria-label="' + esc(nm(vs)) + ' hole cards">' + cards + "</div>" +
      '<p class="pk-me__made">' + esc(made) + "</p></div>";
  }

  function controlsHTML() {
    let inner = "";
    if (S.ph === "bet" && mine()) {
      const t = S.t;
      const full = S.cur - S.bet[t];
      const callAmt = Math.min(full, S.ch[t]);
      inner += '<div class="pk-actions"><button type="button" class="pk-btn pk-btn--fold" data-i="fold">Fold</button>' +
        (full === 0
          ? '<button type="button" class="pk-btn pk-btn--check" data-i="check">Check</button>'
          : '<button type="button" class="pk-btn pk-btn--call" data-i="call">' + (callAmt >= S.ch[t] ? "Call all-in " : "Call ") + fmt(callAmt) + "</button>") +
        "</div>";
      if (canRaiseNow()) {
        const b = bounds();
        inner += '<div class="pk-raise">' +
          '<div class="pk-presets">' +
          '<button type="button" class="pk-mb" data-i="pre" data-p="min">Min</button>' +
          '<button type="button" class="pk-mb" data-i="pre" data-p="half">½ pot</button>' +
          '<button type="button" class="pk-mb" data-i="pre" data-p="pot">Pot</button>' +
          '<button type="button" class="pk-mb" data-i="pre" data-p="max">All-in</button></div>' +
          '<div class="pk-stepper">' +
          '<button type="button" class="pk-mb" data-i="minus" data-role="minus" aria-label="Lower amount"' + (raiseTo <= b[0] ? " disabled" : "") + ">−</button>" +
          '<output class="pk-amt" data-role="amt">' + fmt(raiseTo) + "</output>" +
          '<button type="button" class="pk-mb" data-i="plus" data-role="plus" aria-label="Raise amount"' + (raiseTo >= b[1] ? " disabled" : "") + ">+</button></div>" +
          '<button type="button" class="pk-btn pk-btn--gold" data-i="raise" data-role="raise">' + esc(raiseLabel()) + "</button></div>";
      }
    }
    return '<div class="pk-controls"><p class="pk-hint" data-role="hint" aria-live="polite">' + esc(hintText()) + "</p>" + inner + "</div>";
  }

  function summaryHTML() {
    const lh = S.lh;
    if (!lh) return "";
    const rows = lh.seats.map((s) => {
      let mid;
      if (s.f) mid = "Folded";
      else if (s.c) mid = s.c.map(mini).join("") + (s.h ? ' <span class="pk-sum__h">' + esc(s.h) + "</span>" : "");
      else mid = "Won without showing";
      const net = s.net > 0 ? "+" + fmt(s.net) : s.net < 0 ? "−" + fmt(-s.net) : "0";
      return '<div class="pk-sum__row pk-s' + s.i + (s.w ? " is-win" : "") + '"><span class="pk-sum__n">' + esc(nm(s.i)) + (s.x ? " (out)" : "") + "</span>" +
        '<span class="pk-sum__cards">' + mid + "</span>" +
        '<span class="pk-sum__pts' + (s.net > 0 ? " is-up" : s.net < 0 ? " is-down" : "") + '">' + net + "</span></div>";
    }).join("");
    return '<div class="pk-sum">' +
      (lh.board.length ? '<div class="pk-sum__board" aria-label="Board">' + lh.board.map(mini).join("") + "</div>" : "") + rows + "</div>";
  }

  function setupHTML() {
    const enabled = mine();
    return '<div class="pk-panel"><h3 class="pk-panel__h">Poker</h3>' +
      '<p class="pk-panel__p">' + esc(nm(S.t)) + ", how many players?</p>" +
      '<div class="pk-pns">' + [2, 3, 4, 5, 6].map((n) =>
        '<button type="button" class="pk-pn" data-i="players" data-n="' + n + '"' + (enabled ? "" : " disabled") + ">" + n +
        "<small>players</small></button>").join("") + "</div>" +
      '<p class="pk-panel__p">Texas Hold’em for 2 to 6 players. Everyone starts with ' + fmt(START) + " chips.</p></div>";
  }

  function dealHTML() {
    const bl = blinds(S.hn);
    const left = S.out.filter((o) => !o).length;
    return '<div class="pk-panel"><h3 class="pk-panel__h">' + esc(S.lh ? S.msg : "Texas Hold’em") + "</h3>" + summaryHTML() +
      '<p class="pk-panel__p">' + esc(nm(S.t)) + " deals hand " + S.hn + " · " + left + " players · Blinds " + fmt(bl[0]) + "/" + fmt(bl[1]) +
      (S.lh ? "" : " · " + fmt(START) + " chips each") + "</p>" +
      '<div class="pk-actions"><button type="button" class="pk-btn pk-btn--gold" data-i="deal"' + (mine() ? "" : " disabled") +
      ">Shuffle and deal</button></div></div>";
  }

  function endHTML() {
    const order = S.ch.map((_, i) => i).sort((a, b) => S.ch[b] - S.ch[a] || S.elim[b] - S.elim[a] || a - b);
    return '<div class="pk-panel"><h3 class="pk-panel__h">' + esc(S.msg) + "</h3>" + summaryHTML() +
      '<div class="pk-sum">' + order.map((i, k) =>
        '<div class="pk-sum__row pk-s' + i + (k === 0 ? " is-win" : "") + '"><span class="pk-sum__n">' + esc(nm(i)) +
        '</span><span class="pk-sum__cards">' + (k === 0 ? "Champion" : "Out in hand " + S.elim[i]) + '</span><span class="pk-sum__pts">' + fmt(S.ch[i]) + "</span></div>").join("") +
      "</div></div>";
  }

  function rulesHTML() {
    return '<details class="pk-rules"><summary class="pk-iconbtn" aria-label="Game rules" title="Game rules">' +
      '<span class="pk-rules__icon" aria-hidden="true">i</span><span class="pk-sr">Game rules</span></summary><div class="pk-rules__content">' +
      '<h2 class="pk-rules__title">How to play Texas Hold’em</h2><ul class="pk-rules__list">' +
      "<li>2 to 6 players. Everyone starts with " + fmt(START) + " chips. Blinds start at 10/20 and go up every " + PER_LEVEL + " hands. The last player with chips wins the match.</li>" +
      "<li>The dealer button moves left every hand. The next two players post the small and big blind. With only two players, the dealer posts the small blind.</li>" +
      "<li>Every player gets two private cards. There are four betting rounds: pre-flop, the flop (3 shared cards), the turn (1 card) and the river (1 card). Pre-flop, the player after the big blind acts first; after that, the first player left of the dealer.</li>" +
      "<li>On your turn you can fold, check (if nobody has bet), call, or bet / raise any amount up to all your chips. A raise must be at least as big as the last bet or raise in that round. A short all-in is allowed but does not re-open the betting.</li>" +
      "<li>At the showdown, each player makes the best five-card hand from their two cards and the five shared cards. Highest wins; equal hands split the pot, and any odd chip goes to the first winner left of the dealer.</li>" +
      "<li>If you are all-in, you can only win as much from each player as you matched. The rest goes into a side pot for the other players. Bets nobody matched are returned.</li>" +
      "<li>Hand ranks, best to worst:<ol class=\"pk-rules__ranks\"><li>Straight flush (A-K-Q-J-10 is a royal flush)</li><li>Four of a kind</li><li>Full house</li><li>Flush</li>" +
      "<li>Straight (the Ace can be high or low)</li><li>Three of a kind</li><li>Two pair</li><li>One pair</li><li>High card</li></ol> Suits never break ties.</li>" +
      "</ul></div></details>";
  }

  /* ------------------------------ bot helpers ---------------------------- */

  // Bill Chen's pre-flop formula: AA = 20, 72o is negative.
  function chen(h) {
    const a = Math.max(rank(h[0]), rank(h[1]));
    const b = Math.min(rank(h[0]), rank(h[1]));
    const pts = (r) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
    let s = pts(a);
    if (a === b) return Math.max(5, Math.ceil(s * 2));
    if (suit(h[0]) === suit(h[1])) s += 2;
    const gap = a - b - 1;
    s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && a < 12) s += 1;
    return Math.ceil(s);
  }

  // Monte Carlo share of the pot against `opps` random hands.
  function equity(hole, board, opps, iters) {
    const known = hole.concat(board);
    const deck = [];
    for (let i = 0; i < DECK; i++) if (known.indexOf(i) < 0) deck.push(i);
    const need = 5 - board.length;
    let score = 0;
    for (let it = 0; it < iters; it++) {
      const m = need + 2 * opps;
      for (let k = 0; k < m; k++) {
        const j = k + Math.floor(Math.random() * (deck.length - k));
        const t = deck[k]; deck[k] = deck[j]; deck[j] = t;
      }
      const full = board.concat(deck.slice(0, need));
      const mine7 = best(hole.concat(full)).v;
      let win = true;
      let ties = 0;
      for (let o = 0; o < opps; o++) {
        const ov = best([deck[need + 2 * o], deck[need + 2 * o + 1]].concat(full)).v;
        if (ov > mine7) { win = false; break; }
        if (ov === mine7) ties++;
      }
      if (win) score += 1 / (ties + 1);
    }
    return score / iters;
  }

  function decide() {
    const t = S.t;
    const hole = S.hole[t];
    const full = S.cur - S.bet[t];
    const stack = S.bet[t] + S.ch[t];
    const b = bounds();
    const can = canRaiseNow();
    const bb = S.bbA;
    const pot = potTotal();
    const opps = liveSeats().length - 1;
    const R = Math.random();
    const to = (x) => ({ raise: Math.max(b[0], Math.min(b[1], Math.round(x))) });
    const sized = (frac) => {
      const x = Math.max(b[0], Math.min(b[1], Math.round(S.cur + frac * (pot + full))));
      return { raise: x >= b[1] * 0.65 ? b[1] : x };
    };

    if (S.st === "preflop") {
      const c = chen(hole);
      const raised = S.cur > bb;
      if (stack <= bb * 10 && c >= 7 && can) return { raise: b[1] };
      if (!raised) {
        if (c >= 9 && can && R < 0.85) return to(3 * bb);
        if (full === 0) return { check: true };
        if (c >= 5 || (c >= 3 && full <= bb / 2)) return { call: true };
        return { fold: true };
      }
      const heavy = full > stack * 0.25;
      if (c >= 13 && can && R < 0.7) return to(S.cur * 3);
      if (full === 0) return { check: true };
      if (c >= (heavy ? 11 : 8)) return { call: true };
      if (c >= 6 && full <= bb * 3 && !heavy) return { call: true };
      return { fold: true };
    }

    const e = equity(hole, S.board, Math.max(1, opps), 90);
    if (full === 0) {
      if (can && e > 0.7 && R < 0.8) return sized(0.66);
      if (can && e > 0.55 && R < 0.45) return sized(0.4);
      if (can && e < 0.3 && opps === 1 && R < 0.07) return sized(0.6);
      return { check: true };
    }
    const odds = full / (pot + full);
    if (can && e > 0.8 && R < 0.65) return sized(0.8);
    if (e > odds + 0.08 || (e > odds && R < 0.4)) return { call: true };
    return { fold: true };
  }

  /* ------------------------------- the game ------------------------------ */

  const game = {
    id: "poker",
    i: "♠️",
    t: "Poker",
    d: "Texas Hold’em for 2 to 6 players. Blind bets, flop, turn and river, side pots and a showdown. Last player with chips wins.",
    min: 2,
    max: MAX_P,
    cat: "classic casual",
    tag: "Card classic",
    diff: "Hard",
    art: "art-poker",
    n: ["Red", "Blue", "Green", "Gold", "Violet", "Orange"],

    // The runtime may pass the player count (a number, or an object with
    // players/n/count). Without it the first seat picks it in a setup step.
    init(opts) {
      mySeat = null;
      raiseTo = 0;
      rzKey = "";
      anim = { seq: -1, start: 0 };

      const raw = typeof opts === "number" ? opts
        : opts && typeof opts === "object" ? (opts.players || opts.n || opts.count || opts.np) : 0;
      const hinted = Number.isInteger(raw) && raw >= MIN_P && raw <= MAX_P ? raw
        : typeof ids !== "undefined" && ids.length && Number.isInteger(np) && np >= MIN_P && np <= MAX_P ? np : 0;
      return blank(hinted || 2, hinted ? "deal" : "setup");
    },

    valid(action) {
      if (!action || typeof action !== "object" || Array.isArray(action) || S.over) return false;
      const key = Object.keys(action).sort().join(",");
      if (S.ph === "setup") {
        return key === "players" && Number.isInteger(action.players) && action.players >= MIN_P && action.players <= MAX_P;
      }
      if (S.ph === "deal") {
        const p = action.deal;
        return key === "deal" && Array.isArray(p) && p.length === DECK &&
          p.every((v) => isId(v, DECK)) && new Set(p).size === DECK;
      }
      if (S.ph !== "bet") return false;
      const t = S.t;
      if (!S.in[t] || S.fold[t] || S.ch[t] <= 0 || !S.todo[t]) return false;
      const full = S.cur - S.bet[t];
      if (key === "fold") return action.fold === true;
      if (key === "check") return action.check === true && full === 0;
      if (key === "call") return action.call === true && full > 0;
      if (key === "raise") {
        const x = action.raise;
        if (!Number.isInteger(x) || !canRaiseNow()) return false;
        const mx = S.bet[t] + S.ch[t];
        return x > S.cur && x <= mx && (x >= S.cur + S.mr || x === mx);
      }
      return false;
    },

    apply(action) {
      if (S.ph === "setup") {
        Object.assign(S, blank(action.players, "deal"));
        return;
      }
      if (S.ph === "deal") { startHand(action.deal); return; }

      const seat = S.t;
      const who = nm(seat);
      if (has(action, "fold")) {
        S.fold[seat] = true;
        S.todo[seat] = false;
        S.la = who + " folds";
        S.last = { seq: ++S.seq, kind: "fold", seat };
      } else if (has(action, "check")) {
        S.todo[seat] = false;
        S.rz[seat] = false;
        S.la = who + " checks";
        S.last = { seq: ++S.seq, kind: "check", seat };
      } else if (has(action, "call")) {
        const amt = pay(seat, S.cur - S.bet[seat]);
        S.todo[seat] = false;
        S.rz[seat] = false;
        S.la = who + " calls " + fmt(amt) + (S.ch[seat] === 0 ? " (all-in)" : "");
        S.last = { seq: ++S.seq, kind: "call", seat };
      } else {
        const x = action.raise;
        const wasBet = S.cur === 0;
        pay(seat, x - S.bet[seat]);
        const fullRaise = x >= S.cur + S.mr;
        if (fullRaise) S.mr = x - S.cur;           // a short all-in does not change the minimum raise
        S.cur = x;
        for (let q = 0; q < S.np; q++) {
          if (q === seat || !S.in[q] || S.fold[q] || S.ch[q] <= 0) continue;
          S.todo[q] = true;
          if (fullRaise) S.rz[q] = true;           // only a full raise re-opens the betting
        }
        S.todo[seat] = false;
        S.rz[seat] = false;
        S.la = who + (wasBet ? " bets " : " raises to ") + fmt(x) + (S.ch[seat] === 0 ? " (all-in)" : "");
        S.last = { seq: ++S.seq, kind: "raise", seat };
      }
      advance(seat);
    },

    draw() {
      const L = S.last;
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!L) anim.seq = -1;
      let el = -1;
      if (L && !reduce) {
        if (anim.seq !== L.seq) anim = { seq: L.seq, start: Date.now() };
        const dur = L.kind === "deal" ? 1500 : 1100;
        const elapsed = Date.now() - anim.start;
        if (elapsed < dur) el = elapsed;
      }
      const an = el >= 0;

      const vs = viewSeat();
      if (S.ph === "bet" && mine()) {
        const key = S.seq + ":" + S.t;
        const b = bounds();
        if (key !== rzKey) { rzKey = key; raiseTo = b[0]; }
        raiseTo = Math.max(b[0], Math.min(b[1], raiseTo));
      }

      let body;
      if (S.ph === "setup") body = setupHTML();
      else if (S.ph === "deal") body = dealHTML();
      else if (S.ph === "end") body = endHTML();
      else if (S.ph === "bet") {
        body = tableHTML(an, L) + '<div class="pk-player-layout">' + meHTML(vs, an, L) + controlsHTML() + "</div>";
      } else body = tableHTML(an, L) + meHTML(vs, an, L) + controlsHTML();

      let status;
      if (S.over) status = S.msg;
      else if (S.ph === "setup") status = nm(S.t) + " picks the number of players";
      else if (S.ph === "deal") status = nm(S.t) + " to deal";
      else status = nm(S.t) + " to act · " + STREET_NAMES[S.st];

      const info = S.ph === "setup" ? "Poker · 2 to 6 players"
        : S.ph === "bet" ? "Hand " + S.hn + " · Blinds " + fmt(S.sbA) + "/" + fmt(S.bbA) + " · Pot " + fmt(potTotal())
          : "Hand " + S.hn + " · Blinds " + fmt(blinds(S.hn)[0]) + "/" + fmt(blinds(S.hn)[1]);
      const html =
        '<section class="poker" aria-label="Poker card game" style="--el:' + (an ? el : 0) + 'ms">' +
        '<div class="pk-bar"><p class="pk-info">' + esc(info) + '</p><div class="pk-bar__btns">' +
        '<button type="button" class="pk-iconbtn" data-i="fs" aria-label="Toggle full screen" title="Full screen">⛶</button>' +
        rulesHTML() + "</div></div>" +
        (S.ph === "setup" ? "" : '<div class="pk-seats">' + S.ch.map((_, i) => seatHTML(i, an, L)).join("") + "</div>") +
        body +
        '<p class="pk-turn-status" role="status" aria-live="polite">' + esc(status) + "</p></section>";
      return [html, status];
    },

    click(element) {
      const target = element && element.closest ? element.closest("[data-i]") : null;
      if (!target) return;
      const kind = target.dataset.i;
      const root = target.closest(".poker");

      // Local-only controls work on anyone's turn.
      if (kind === "fs") {
        if (typeof document === "undefined") return;
        if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        return;
      }
      if (!canAct() || S.over) return;

      if (kind === "minus" || kind === "plus" || kind === "pre") {
        if (S.ph !== "bet" || !canRaiseNow()) return;
        const b = bounds();
        const full = S.cur - S.bet[S.t];
        if (kind === "minus") raiseTo = Math.max(b[0], raiseTo - S.bbA);
        else if (kind === "plus") raiseTo = Math.min(b[1], raiseTo + S.bbA);
        else {
          const p = target.dataset.p;
          const v = p === "min" ? b[0] : p === "max" ? b[1]
            : S.cur + Math.round((p === "half" ? 0.5 : 1) * (potTotal() + full));
          raiseTo = Math.max(b[0], Math.min(b[1], v));
        }
        syncRaise(root);
        return;
      }

      let action = null;
      if (kind === "players") action = { players: Number(target.dataset.n) };
      else if (kind === "deal") action = { deal: shuffled(DECK) };
      else if (kind === "fold") action = { fold: true };
      else if (kind === "check") action = { check: true };
      else if (kind === "call") action = { call: true };
      else if (kind === "raise") action = { raise: raiseTo };

      if (action && game.valid(action)) act(action);
    },

    bot() {
      if (S.ph === "setup") return { players: 2 };
      if (S.ph === "deal") return { deal: shuffled(DECK) };
      const a = decide();
      if (game.valid(a)) return a;
      if (game.valid({ check: true })) return { check: true };
      if (game.valid({ call: true })) return { call: true };
      return { fold: true };
    },
  };

  registerGame(game);
})();
