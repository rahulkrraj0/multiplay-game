(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Teen Patti (3 Patti) - Indian three-card poker for 2 to 6 players.
   *
   *  - Everyone antes the boot, gets 3 cards face down, and bets in turn.
   *  - Blind players have not looked at their cards and pay the stake.
   *    Seen players have looked and pay double. Raise doubles the stake
   *    (up to a limit). Pack folds. When two players are left either one
   *    can ask for a show: pay, and both hands are compared.
   *  - Ranking, best to worst: Trail (three of a kind), Pure sequence
   *    (straight flush), Sequence (straight), Color (flush), Pair, High card.
   *    Sequences: A-K-Q is highest, A-2-3 is second, 4-3-2 is lowest.
   *  - If the pot reaches the pot limit everyone left shows and the best
   *    hand takes it. On a tie in a show, the player who asked loses.
   *  - 1000 chips each, 10 hands. Players who cannot pay the boot are out.
   *    Most chips after the last hand wins (or the last player standing).
   *
   * Online play: uses the shared Playora runtime (act/valid/apply). The only
   * random input is the shuffled deck, which the dealer's client puts inside
   * the deal action so apply() stays deterministic on every peer.
   *
   * Privacy: the board only draws the hand of the seat this browser has
   * played (remembered the first time canAct() is true). Face-down cards are
   * a UI rule: every peer holds the full state.
   * ------------------------------------------------------------------ */

  const STYLE_ID = "teenpatti-styles";
  const CSS = `
.art-teenpatti {
  background:
    radial-gradient(circle at 24% 26%, #f59e0b 0, transparent 42%),
    radial-gradient(circle at 80% 78%, #e11d48 0, transparent 44%),
    linear-gradient(135deg, #5a1022, #1d050c);
}

.teenpatti {
  --tp-felt: #5a1022;
  --tp-felt-deep: #1d050c;
  --tp-gold: #f4c04e;
  --tp-serif: Georgia, "Times New Roman", serif;
  --cw: clamp(3rem, 15vw, 5.6rem);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  box-sizing: border-box;
  width: min(100%, 64rem);
  min-height: calc(100vh - 4.25rem);
  min-height: calc(100dvh - 4.25rem);
  margin: 0 auto;
  padding: clamp(0.6rem, 2.5vw, 1.25rem);
  overflow: hidden;
  border: 2px solid rgba(244, 192, 78, 0.55);
  border-radius: 1.25rem;
  background:
    radial-gradient(ellipse at 50% 0, rgba(255, 214, 140, 0.13), transparent 60%),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.025) 0 0.6rem, transparent 0.6rem 1.2rem),
    linear-gradient(180deg, var(--tp-felt), var(--tp-felt-deep));
  color: #fff7ed;
  text-align: center;
}

.teenpatti *,
.teenpatti *::before,
.teenpatti *::after { box-sizing: border-box; }

.teenpatti .tp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

#gm:has(#bd .teenpatti) > #lg,
#gm:has(#bd .teenpatti) > #st { display: none !important; }

/* ---------- top bar ---------- */
.teenpatti .tp-bar { position: relative; z-index: 6; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.teenpatti .tp-info { margin: 0; min-width: 0; font-size: 0.8rem; font-weight: 600; opacity: 0.85; text-align: left; }
.teenpatti .tp-bar__btns { display: flex; flex: none; gap: 0.4rem; }

.teenpatti .tp-iconbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.28);
  color: inherit;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.teenpatti .tp-iconbtn::-webkit-details-marker { display: none; }
.teenpatti .tp-rules { position: relative; }
.teenpatti .tp-rules__icon { font-family: var(--tp-serif); font-style: italic; }
.teenpatti .tp-rules__content {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  width: min(27rem, calc(100vw - 2rem));
  max-height: min(60vh, 32rem);
  padding: 1rem;
  overflow: auto;
  border: 1px solid rgba(244, 192, 78, 0.5);
  border-radius: 0.85rem;
  background: #1a050b;
  box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.65);
  text-align: left;
}
.teenpatti .tp-rules__title { margin: 0 0 0.6rem; font-family: var(--tp-serif); font-size: 1.1rem; }
.teenpatti .tp-rules__list { display: grid; gap: 0.5rem; margin: 0; padding-left: 1.1rem; font-size: 0.88rem; line-height: 1.5; }

/* ---------- seats ---------- */
.teenpatti .tp-seats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr)); gap: 0.4rem; }
.teenpatti .tp-seat {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  padding: 0.4rem 0.6rem;
  border: 2px solid transparent;
  border-top: 0.25rem solid var(--sc);
  border-radius: 0.8rem;
  background: rgba(0, 0, 0, 0.32);
  text-align: left;
  transition: border-color 0.25s, box-shadow 0.25s, opacity 0.25s;
}
.teenpatti .tp-seat.is-active { border-color: var(--tp-gold); border-top-color: var(--tp-gold); box-shadow: 0 0 1.1rem rgba(244, 192, 78, 0.35); }
.teenpatti .tp-seat.is-act { animation: tp-bump 0.55s ease; animation-delay: calc(0ms - var(--el, 0ms)); }
.teenpatti .tp-seat.is-packed { opacity: 0.55; }
.teenpatti .tp-seat.is-out { opacity: 0.35; }
.teenpatti .tp-seat__top { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 0.4rem; }
.teenpatti .tp-seat__name { min-width: 0; overflow: hidden; color: var(--sc); font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.teenpatti .tp-seat__chips { font-size: 1.1rem; font-weight: 900; line-height: 1.1; }
.teenpatti .tp-seat__meta { display: flex; align-items: center; gap: 0.35rem; min-height: 1.1rem; font-size: 0.72rem; opacity: 0.9; }
.teenpatti .tp-seat__dealer { padding: 0 0.35rem; border-radius: 0.5rem; background: var(--tp-gold); color: #1c1917; font-weight: 800; }
.teenpatti .tp-seat__cards { display: flex; margin-left: auto; }
.teenpatti .tp-sback {
  width: 0.8rem;
  height: 1.1rem;
  margin-left: -0.25rem;
  border: 1px solid var(--tp-gold);
  border-radius: 0.15rem;
  background: repeating-linear-gradient(45deg, #7f1d1d 0 0.2rem, #9f1239 0.2rem 0.4rem);
}

/* ---------- cards ---------- */
.teenpatti .tp-card {
  position: relative;
  display: block;
  flex: none;
  width: var(--cw);
  height: calc(var(--cw) * 1.42);
  border-radius: calc(var(--cw) * 0.14);
  background: linear-gradient(160deg, #fffdf8, #f3e7cf);
  color: #1c1917;
  font-size: calc(var(--cw) * 0.34);
  font-weight: 800;
  box-shadow: 0 0.25rem 0.6rem rgba(0, 0, 0, 0.5);
}
.teenpatti .tp-red { color: #dc2626; }
.teenpatti .tp-card__c { position: absolute; display: flex; flex-direction: column; align-items: center; line-height: 1; font-size: 0.95em; }
.teenpatti .tp-card__c i { font-style: normal; font-size: 0.85em; }
.teenpatti .tp-card__c--tl { top: 7%; left: 9%; }
.teenpatti .tp-card__c--br { right: 9%; bottom: 7%; transform: rotate(180deg); }
.teenpatti .tp-card__pip { position: absolute; inset: 0; display: grid; place-items: center; padding-top: 0.2em; font-size: 1.9em; opacity: 0.9; }
.teenpatti .tp-card--back {
  border: calc(var(--cw) * 0.05) solid var(--tp-gold);
  background: repeating-linear-gradient(45deg, #7f1d1d 0 0.35rem, #9f1239 0.35rem 0.7rem);
}
.teenpatti .tp-card--back::after {
  content: "◆";
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--tp-gold);
  font-size: 1.5em;
}

.teenpatti .tp-hand {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: calc(var(--cw) * 0.12);
  min-height: calc(var(--cw) * 1.42 + 0.8rem);
  padding-top: 0.6rem;
  perspective: 40rem;
}
.teenpatti .tp-hand .tp-card:nth-child(1) { transform: rotate(-6deg) translateY(0.2rem); }
.teenpatti .tp-hand .tp-card:nth-child(3) { transform: rotate(6deg) translateY(0.2rem); }
.teenpatti .tp-hand.is-packed { opacity: 0.45; filter: grayscale(0.4); }
.teenpatti .tp-hand .tp-card.is-dealt { animation: tp-deal 0.55s cubic-bezier(0.2, 0.8, 0.3, 1.1) backwards; animation-delay: calc(var(--i) * 110ms - var(--el, 0ms)); }
.teenpatti .tp-hand .tp-card.is-flip { animation: tp-flip 0.5s ease backwards; animation-delay: calc(var(--i) * 120ms - var(--el, 0ms)); }
.teenpatti .tp-handbtn { cursor: pointer; }
.teenpatti .tp-handbtn:hover .tp-card { box-shadow: 0 0 0 0.16rem var(--tp-gold), 0 0.5rem 0.9rem rgba(0, 0, 0, 0.5); }
.teenpatti .tp-handname { min-height: 1.5em; margin: 0.2rem 0 0; font-family: var(--tp-serif); font-size: 1.05rem; font-style: italic; color: var(--tp-gold); }

.teenpatti .tp-btn:focus-visible,
.teenpatti .tp-handbtn:focus-visible,
.teenpatti .tp-iconbtn:focus-visible,
.teenpatti .tp-pn:focus-visible { z-index: 3; outline: 3px solid #f59e0b; outline-offset: 3px; }

/* ---------- table: pot ---------- */
.teenpatti .tp-table {
  display: grid;
  flex: 1 1 auto;
  align-content: center;
  justify-items: center;
  gap: 0.5rem;
  min-height: 8rem;
  padding: 0.6rem;
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.2);
}
.teenpatti .tp-pot { display: flex; align-items: center; gap: 0.9rem; }
.teenpatti .tp-pot.is-pulse .tp-stack { animation: tp-pulse 0.7s ease; animation-delay: calc(0ms - var(--el, 0ms)); }
.teenpatti .tp-stack { display: flex; flex-direction: column-reverse; align-items: center; min-width: 3.2rem; padding: 0.2rem; border-radius: 0.6rem; }
.teenpatti .tp-chip {
  width: 3rem;
  height: 0.55rem;
  margin-top: -0.2rem;
  border: 1px solid rgba(0, 0, 0, 0.35);
  border-radius: 50%;
  background: repeating-linear-gradient(90deg, var(--tp-gold) 0 0.4rem, #fff7ed 0.4rem 0.6rem);
  box-shadow: 0 0.12rem 0.15rem rgba(0, 0, 0, 0.5);
}
.teenpatti .tp-chip:nth-child(even) { background: repeating-linear-gradient(90deg, #e11d48 0 0.4rem, #fff7ed 0.4rem 0.6rem); }
.teenpatti .tp-pot__n { display: grid; text-align: left; line-height: 1.05; }
.teenpatti .tp-pot__n small { font-size: 0.8rem; opacity: 0.85; }
.teenpatti .tp-pot__n b { font-family: var(--tp-serif); font-size: clamp(1.7rem, 7cqw, 2.6rem); color: var(--tp-gold); }
.teenpatti .tp-stakes { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.3rem 1rem; font-size: 0.8rem; opacity: 0.9; }
.teenpatti .tp-stakes b { color: var(--tp-gold); }
.teenpatti .tp-feed { min-height: 1.3em; margin: 0; font-size: 0.9rem; font-weight: 700; }

/* ---------- controls & panels ---------- */
.teenpatti .tp-controls { margin-top: 0.1rem; }
.teenpatti .tp-hint { min-height: 1.4em; margin: 0 0 0.5rem; font-size: 0.9rem; font-weight: 700; }
.teenpatti .tp-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; }
.teenpatti .tp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-width: 6.5rem;
  min-height: 2.75rem;
  padding: 0.6rem 1rem;
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
.teenpatti .tp-btn small { font-size: 0.8em; font-weight: 700; opacity: 0.9; }
.teenpatti .tp-btn:active:not(:disabled) { transform: translateY(0.15rem); box-shadow: none; }
.teenpatti .tp-btn--see { background: #7c3aed; }
.teenpatti .tp-btn--chaal { background: #16a34a; }
.teenpatti .tp-btn--raise { background: #ea580c; }
.teenpatti .tp-btn--show { background: #0e7490; }
.teenpatti .tp-btn--pack { background: #b91c1c; }
.teenpatti .tp-btn--gold { background: var(--tp-gold); color: #1c1917; }
.teenpatti .tp-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.teenpatti .tp-panel { display: grid; flex: 1 1 auto; align-content: center; justify-items: center; gap: 0.8rem; padding: 0.5rem; }
.teenpatti .tp-panel__h { margin: 0; font-family: var(--tp-serif); font-size: clamp(1.3rem, 5cqw, 2rem); animation: tp-banner 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) backwards; }
.teenpatti .tp-panel__p { margin: 0; opacity: 0.9; }
.teenpatti .tp-pns { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; }
.teenpatti .tp-pn {
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
.teenpatti .tp-pn small { font-size: 0.65rem; font-weight: 600; opacity: 0.8; }
.teenpatti .tp-pn:hover:not(:disabled) { transform: translateY(-0.25rem); border-color: var(--tp-gold); }
.teenpatti .tp-pn:disabled { opacity: 0.5; cursor: not-allowed; }

.teenpatti .tp-sum { display: grid; gap: 0.3rem; width: min(100%, 38rem); }
.teenpatti .tp-sum__row { display: grid; grid-template-columns: 5.5rem 1fr auto; align-items: center; gap: 0.5rem; padding: 0.3rem 0.5rem; border-radius: 0.6rem; background: rgba(0, 0, 0, 0.28); text-align: left; }
.teenpatti .tp-sum__row.is-win { box-shadow: inset 0 0 0 2px var(--tp-gold); }
.teenpatti .tp-sum__n { overflow: hidden; color: var(--sc); font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.teenpatti .tp-sum__cards { display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem 0.5rem; }
.teenpatti .tp-sum__hand { font-size: 0.8rem; opacity: 0.9; }
.teenpatti .tp-sum__pts { display: grid; font-weight: 800; text-align: right; line-height: 1.1; }
.teenpatti .tp-sum__pts small { font-size: 0.65rem; font-weight: 600; opacity: 0.8; }
.teenpatti .tp-mini {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 2.1rem;
  margin-inline: -0.02rem;
  border-radius: 0.25rem;
  background: linear-gradient(160deg, #fffdf8, #f3e7cf);
  color: #1c1917;
  font-size: 0.65rem;
  font-weight: 800;
  line-height: 1.05;
  box-shadow: 0 0.1rem 0.25rem rgba(0, 0, 0, 0.4);
}
.teenpatti .tp-mini i { font-style: normal; }

.teenpatti .tp-turn-status { flex: none; min-height: 1.4rem; margin: auto 0 0; font-size: 0.85rem; font-weight: 700; }

/* ---------- seat colours ---------- */
.teenpatti .tp-s0 { --sc: #fca5a5; }
.teenpatti .tp-s1 { --sc: #7dd3fc; }
.teenpatti .tp-s2 { --sc: #86efac; }
.teenpatti .tp-s3 { --sc: #fde68a; }
.teenpatti .tp-s4 { --sc: #d8b4fe; }
.teenpatti .tp-s5 { --sc: #fdba74; }

/* ---------- hardening: win against the host page's generic button styles ---------- */
.teenpatti button.tp-btn[data-i] {
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: auto !important;
  min-width: 6.5rem !important;
  min-height: 2.75rem !important;
  margin: 0 !important;
  padding: 0.6rem 1rem !important;
  border: 0 !important;
  border-radius: 999px !important;
  color: #fff !important;
  font-family: inherit !important;
  font-size: 1rem !important;
  font-weight: 800 !important;
  text-transform: none !important;
}
.teenpatti button.tp-btn--see[data-i] { background: #7c3aed !important; }
.teenpatti button.tp-btn--chaal[data-i] { background: #16a34a !important; }
.teenpatti button.tp-btn--raise[data-i] { background: #ea580c !important; }
.teenpatti button.tp-btn--show[data-i] { background: #0e7490 !important; }
.teenpatti button.tp-btn--pack[data-i] { background: #b91c1c !important; }
.teenpatti button.tp-btn--gold[data-i] { background: #f4c04e !important; color: #1c1917 !important; }
.teenpatti button.tp-btn[data-i]:disabled { opacity: 0.4 !important; }

.teenpatti button.tp-handbtn[data-i] {
  display: flex !important;
  width: auto !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 auto !important;
  padding: 0.6rem 0 0 !important;
  border: 0 !important;
  background: none !important;
  color: inherit !important;
  box-shadow: none !important;
}
.teenpatti button.tp-iconbtn[data-i] {
  width: 2.25rem !important;
  min-width: 0 !important;
  height: 2.25rem !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 50% !important;
  background: rgba(0, 0, 0, 0.28) !important;
  color: #fff !important;
}
.teenpatti button.tp-pn[data-i] {
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
.teenpatti button { touch-action: manipulation; }

@supports (width: 1cqw) {
  .teenpatti { --cw: clamp(3rem, min(16cqw, 15vh), 6rem); container-type: inline-size; }
}

@container (max-width: 40rem) {
  .teenpatti .tp-seat { padding: 0.3rem 0.45rem; }
  .teenpatti .tp-seat__chips { font-size: 1rem; }
  .teenpatti .tp-btn { min-width: 0; flex: 1 1 5.5rem; }
  .teenpatti .tp-sum__row { grid-template-columns: 4.5rem 1fr auto; }
}

@container (max-width: 24rem) {
  .teenpatti .tp-seat__cards { display: none; }
  .teenpatti .tp-pn { width: 3.6rem; font-size: 1.35rem; }
}

@container (min-width: 56rem) {
  .teenpatti .tp-seat__chips { font-size: 1.35rem; }
  .teenpatti .tp-info { font-size: 0.9rem; }
  .teenpatti .tp-hint { font-size: 1.05rem; }
}

@media (max-width: 30rem) {
  .teenpatti { min-height: calc(100vh - 4.625rem); min-height: calc(100dvh - 4.625rem); }
  .teenpatti button.tp-btn[data-i] { min-width: 0 !important; flex: 1 1 5.5rem !important; padding: 0.55rem 0.4rem !important; font-size: 0.9rem !important; }
}

@media (max-height: 48rem) {
  .teenpatti { gap: 0.35rem; padding: 0.5rem; --cw: clamp(2.8rem, min(15cqw, calc(12vh - 0.2rem)), 4.6rem); }
  .teenpatti .tp-seat { padding: 0.25rem 0.5rem; }
  .teenpatti .tp-table { min-height: 5rem; padding: 0.4rem; gap: 0.3rem; }
  .teenpatti .tp-hand { min-height: calc(var(--cw) * 1.42 + 0.5rem); padding-top: 0.4rem; }
  .teenpatti .tp-hint { min-height: 1em; margin-bottom: 0.3rem; font-size: 0.8rem; }
  .teenpatti .tp-btn { min-height: 2.35rem; padding: 0.4rem 0.8rem; }
}

/* ---------- keyframes ---------- */
@keyframes tp-deal { from { opacity: 0; transform: translate(0, -9rem) rotate(18deg) scale(0.5); } }
@keyframes tp-flip { from { transform: rotateY(90deg); } }
@keyframes tp-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(244, 192, 78, 0); } 40% { box-shadow: 0 0 0 0.6rem rgba(244, 192, 78, 0.5); } }
@keyframes tp-bump { 0%, 100% { transform: none; } 40% { transform: translateY(-0.25rem) scale(1.04); } }
@keyframes tp-banner { from { opacity: 0; transform: scale(0.7) translateY(1rem); } }

@media (prefers-reduced-motion: reduce) {
  .teenpatti *,
  .teenpatti *::before,
  .teenpatti *::after { animation: none !important; transition: none !important; }
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
  const LBL = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RN = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King", "Ace"];
  const MIN_P = 2;
  const MAX_P = 6;
  const START = 1000;               // chips per player
  const BOOT = 10;                  // ante
  const MAX_STAKE = BOOT * 8;       // highest blind stake (seen players pay double)
  const POT_CAP = BOOT * 100;       // reaching this forces a showdown
  const HANDS = 10;                 // hands per match
  const DECK = 52;

  // ids 0..51. value 2..14 (14 = Ace), suit 0..3.
  const val = (id) => (id % 13) + 2;
  const suit = (id) => Math.floor(id / 13);
  const isId = (v) => Number.isInteger(v) && v >= 0 && v < DECK;
  const sortDesc = (ids) => ids.slice().sort((a, b) => val(b) - val(a) || suit(a) - suit(b));
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  let anim = { seq: -1, start: 0 };   // local animation clock for S.last
  let mySeat = null;                  // seat this browser has played (see viewSeat)

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

  const lbl = (v) => LBL[v - 2];

  // Pure. Score a 3-card hand. Higher score always beats lower.
  // cat: 6 trail, 5 pure sequence, 4 sequence, 3 color, 2 pair, 1 high card.
  function evalHand(ids) {
    const v = ids.map(val).sort((x, y) => y - x);
    const a = v[0], b = v[1], c = v[2];
    const flush = suit(ids[0]) === suit(ids[1]) && suit(ids[1]) === suit(ids[2]);
    let seq = 0; // A-K-Q = 15, A-2-3 = 14, K-Q-J = 13 ... 4-3-2 = 4
    if (a - b === 1 && b - c === 1) seq = a === 14 ? 15 : a;
    else if (a === 14 && b === 3 && c === 2) seq = 14;

    let cat, key, name;
    if (a === b && b === c) {
      cat = 6; key = a; name = "Trail of " + RN[a - 2] + "s";
    } else if (seq) {
      cat = flush ? 5 : 4; key = seq;
      const run = seq === 14 ? "A-2-3" : v.map(lbl).join("-");
      name = (flush ? "Pure sequence " : "Sequence ") + run;
    } else if (flush) {
      cat = 3; key = a * 225 + b * 15 + c; name = "Color, " + lbl(a) + " high";
    } else if (a === b || b === c) {
      const pr = a === b ? a : b;
      const kick = a === b ? c : a;
      cat = 2; key = pr * 15 + kick; name = "Pair of " + RN[pr - 2] + "s";
    } else {
      cat = 1; key = a * 225 + b * 15 + c; name = "High card " + lbl(a);
    }
    return { cat, score: cat * 1e6 + key, top: a, name };
  }

  const strength = (e) => [0, 0.1, 0.4, 0.55, 0.72, 0.88, 0.97][e.cat] + ((e.top - 2) / 12) * 0.08;

  /* ----------------------------- table logic ---------------------------- */

  function aliveList() {
    const out = [];
    S.al.forEach((v, i) => { if (v) out.push(i); });
    return out;
  }

  function nextAlive(from) {
    for (let k = 1; k <= S.np; k++) {
      const j = (from + k) % S.np;
      if (S.al[j]) return j;
    }
    return from;
  }

  function nextSolvent(from) {
    for (let k = 1; k <= S.np; k++) {
      const j = (from + k) % S.np;
      if (!S.ou[j]) return j;
    }
    return from;
  }

  // Seen players pay double the stake.
  const costOf = (i, st) => (S.sn[i] ? 2 : 1) * st;

  function pay(i, amount) {
    const amt = Math.min(amount, S.ch[i]);
    S.ch[i] -= amt;
    S.pot += amt;
    return amt;
  }

  function legal(i) {
    const two = aliveList().length === 2;
    return {
      see: !S.sn[i],
      chaal: S.ch[i] >= costOf(i, S.st),
      raise: S.st * 2 <= S.maxst && S.ch[i] >= costOf(i, S.st * 2),
      show: two && S.ch[i] > 0,
      pack: true,
    };
  }

  function endHand(winners, how, shown) {
    const played = S.h.map((h) => h.length > 0);
    const rev = shown
      ? aliveList().map((s) => ({ s, c: sortDesc(S.h[s]), e: evalHand(S.h[s]).name }))
      : [];
    const pot = S.pot;
    const share = Math.floor(pot / winners.length);
    winners.forEach((w) => { S.ch[w] += share; });
    S.ch[winners[0]] += pot - share * winners.length;

    let msg;
    if (how === "pack") {
      msg = nm(winners[0]) + " wins " + pot + " because everyone else packed.";
    } else if (winners.length > 1) {
      msg = "The pot of " + pot + " is split between " + winners.map((w) => nm(w)).join(" and ") + ".";
    } else {
      const r = rev.find((x) => x.s === winners[0]);
      msg = nm(winners[0]) + " wins " + pot + " with " + (r ? r.e : "the best hand") + ".";
    }
    if (how === "cap") msg = "Pot limit reached. " + msg;

    S.lh = {
      n: S.hn, w: winners, how, pot, rev, p: played,
      d: S.ch.map((c, i) => c - S.cs[i]),
    };
    S.pot = 0;
    S.st = S.boot;
    S.al = S.al.map(() => false);
    S.sn = S.sn.map(() => false);
    S.h = S.h.map(() => []);
    S.ou = S.ch.map((c) => c < S.boot);

    const solvent = S.ou.filter((o) => !o).length;
    if (S.hn >= HANDS || solvent <= 1) {
      let champ = 0;
      S.ch.forEach((c, i) => { if (c > S.ch[champ]) champ = i; });
      S.over = 1;
      S.ph = "end";
      S.t = champ;
      S.msg = nm(champ) + " wins the match with " + S.ch[champ] + " chips!";
      return;
    }
    S.msg = msg;
    S.hn += 1;
    S.ph = "deal";
    S.dealer = nextSolvent(S.dealer);
    S.t = S.dealer;
  }

  function showdown() {
    const a = aliveList();
    const sc = a.map((s) => evalHand(S.h[s]).score);
    const best = Math.max.apply(null, sc);
    endHand(a.filter((s, k) => sc[k] === best), "cap", true);
  }

  /* ------------------------------ rendering ----------------------------- */

  const redCls = (id) => (suit(id) === 1 || suit(id) === 2 ? " tp-red" : "");
  const cardName = (id) => RN[id % 13] + " of " + SUIT_NAMES[suit(id)];
  const mine = () => !!canAct() && !S.over;

  // The seat whose hand this browser may see. If the runtime exposes the local
  // seat, return it here. Otherwise remember the seat the first time it is ours.
  function viewSeat() {
    if (canAct()) mySeat = S.t;
    return mySeat !== null && mySeat < S.np ? mySeat : null;
  }

  function face(id) {
    const r = lbl(val(id));
    const s = SUITS[suit(id)];
    return '<span class="tp-card__c tp-card__c--tl"><b>' + r + "</b><i>" + s + "</i></span>" +
      '<span class="tp-card__pip" aria-hidden="true">' + s + "</span>" +
      '<span class="tp-card__c tp-card__c--br" aria-hidden="true"><b>' + r + "</b><i>" + s + "</i></span>";
  }

  function mini(id) {
    return '<span class="tp-mini' + redCls(id) + '"><b>' + lbl(val(id)) + "</b><i>" + SUITS[suit(id)] + "</i></span>";
  }

  function feedText() {
    const L = S.last;
    if (!L) return "";
    const n = nm(L.seat);
    const how = L.blind ? " blind." : " seen.";
    if (L.kind === "deal") return "Each player put in the boot of " + S.boot + ".";
    if (L.kind === "see") return n + " looked at their cards.";
    if (L.kind === "chaal") return n + " bet " + L.amt + how;
    if (L.kind === "raise") return n + " raised the stake to " + L.st + " and bet " + L.amt + how;
    if (L.kind === "pack") return n + " packed.";
    if (L.kind === "show") return n + " paid " + L.amt + " and asked for a show.";
    return "";
  }

  function hintText(o) {
    if (S.ph !== "play") return "";
    if (!mine()) return "Waiting for " + nm(S.t) + ".";
    if (!o.chaal && !o.show) return "You can't cover the bet. Pack to keep your chips.";
    if (!S.sn[S.t]) return "You're blind: bet the blind stake, or look at your cards first.";
    if (aliveList().length === 2) return "Two players left: bet, raise, pack, or ask for a show.";
    return "You've seen your cards, so you pay double the stake.";
  }

  function seatHTML(i, an, L) {
    const play = S.ph === "play";
    const acted = an && L && L.seat === i && L.kind !== "deal";
    const packed = play && !S.al[i] && !S.ou[i];
    const dealer = S.ph !== "setup" && S.dealer === i && !S.ou[i];
    let tag = "";
    if (S.ou[i]) tag = "Out";
    else if (play) tag = !S.al[i] ? "Packed" : S.sn[i] ? "Seen" : "Blind";
    const backs = play && S.al[i]
      ? '<span class="tp-seat__cards" aria-hidden="true"><span class="tp-sback"></span><span class="tp-sback"></span><span class="tp-sback"></span></span>' : "";
    return '<div class="tp-seat tp-s' + i + (!S.over && S.t === i && S.ph !== "setup" && !S.ou[i] ? " is-active" : "") +
      (acted ? " is-act" : "") + (packed ? " is-packed" : "") + (S.ou[i] ? " is-out" : "") + '">' +
      '<div class="tp-seat__top"><span class="tp-seat__name">' + computerBadge(i) + esc(nm(i)) + "</span>" +
      '<span class="tp-seat__chips" aria-label="' + S.ch[i] + ' chips">' + S.ch[i] + "</span></div>" +
      '<div class="tp-seat__meta">' + (tag ? "<span>" + tag + "</span>" : "") +
      (dealer ? '<span class="tp-seat__dealer">Dealer</span>' : "") + backs + "</div></div>";
  }

  function tableHTML(an, L) {
    const n = Math.max(1, Math.min(8, Math.ceil(S.pot / (S.boot * 6))));
    const pulse = an && (L.kind === "deal" || L.kind === "chaal" || L.kind === "raise" || L.kind === "show");
    return '<div class="tp-table"><div class="tp-pot' + (pulse ? " is-pulse" : "") + '">' +
      '<div class="tp-stack" aria-hidden="true">' + '<i class="tp-chip"></i>'.repeat(n) + "</div>" +
      '<div class="tp-pot__n"><small>Pot</small><b>' + S.pot + "</b></div></div>" +
      '<div class="tp-stakes"><span>Blind bet <b>' + S.st + "</b></span><span>Seen bet <b>" + S.st * 2 +
      "</b></span><span>Pot limit <b>" + S.cap + "</b></span></div>" +
      '<p class="tp-feed" aria-live="polite">' + esc(feedText()) + "</p></div>";
  }

  function handHTML(vs, an, L) {
    if (vs === null) {
      return '<div class="tp-panel"><p class="tp-panel__p">Your cards appear here once it is your turn.</p></div>';
    }
    const hand = S.h[vs] || [];
    if (!hand.length) {
      return '<div class="tp-panel"><p class="tp-panel__p">You are sitting this hand out.</p></div>';
    }
    const seen = S.sn[vs];
    const active = mine() && S.ph === "play" && S.t === vs;
    const dealt = an && L.kind === "deal";
    const flip = an && L.kind === "see" && L.seat === vs;
    const o = active ? legal(vs) : null;

    const cards = sortDesc(hand).map((id, i) => {
      const fx = (dealt ? " is-dealt" : "") + (flip ? " is-flip" : "");
      return seen
        ? '<span class="tp-card' + redCls(id) + fx + '" style="--i:' + i + '" role="img" aria-label="' + cardName(id) + '">' + face(id) + "</span>"
        : '<span class="tp-card tp-card--back' + fx + '" style="--i:' + i + '" role="img" aria-label="Hidden card"></span>';
    }).join("");
    const packed = S.al[vs] ? "" : " is-packed";
    const handEl = !seen && active
      ? '<button type="button" class="tp-hand tp-handbtn' + packed + '" data-i="see" aria-label="Look at your cards">' + cards + "</button>"
      : '<div class="tp-hand' + packed + '" role="group" aria-label="' + esc(nm(vs)) + ' hand">' + cards + "</div>";

    const btn = (kind, cls, label, amt, on) =>
      '<button type="button" class="tp-btn tp-btn--' + cls + '" data-i="' + kind + '"' + (on ? "" : " disabled") + ">" +
      label + (amt === null ? "" : " <small>" + amt + "</small>") + "</button>";
    const cost = costOf(vs, S.st);
    const on = (k) => !!o && o[k];

    return handEl +
      '<p class="tp-handname">' + (seen ? esc(evalHand(hand).name) : "Cards face down") + "</p>" +
      '<div class="tp-controls"><p class="tp-hint" aria-live="polite">' + esc(o ? hintText(o) : hintText({ chaal: 1 })) + "</p>" +
      '<div class="tp-actions">' +
      btn("see", "see", "See cards", null, on("see")) +
      btn("chaal", "chaal", "Chaal", cost, on("chaal")) +
      btn("raise", "raise", "Raise", costOf(vs, S.st * 2), on("raise")) +
      btn("show", "show", "Show", Math.min(cost, S.ch[vs]), on("show")) +
      btn("pack", "pack", "Pack", null, on("pack")) +
      "</div></div>";
  }

  function summaryHTML() {
    const L = S.lh;
    if (!L) return "";
    return '<div class="tp-sum">' + S.ch.map((c, i) => {
      const r = L.rev.find((x) => x.s === i);
      const won = L.w.indexOf(i) >= 0;
      let mid;
      if (r) mid = r.c.map((id) => mini(id)).join("") + '<span class="tp-sum__hand">' + esc(r.e) + "</span>";
      else mid = '<span class="tp-sum__hand">' + (!L.p[i] ? "Out" : won ? "Cards not shown" : "Packed") + "</span>";
      const d = L.d[i];
      return '<div class="tp-sum__row tp-s' + i + (won ? " is-win" : "") + '"><span class="tp-sum__n">' + esc(nm(i)) + "</span>" +
        '<span class="tp-sum__cards">' + mid + "</span>" +
        '<span class="tp-sum__pts">' + (d > 0 ? "+" : "") + d + "<small>" + c + " chips</small></span></div>";
    }).join("") + "</div>";
  }

  function setupHTML() {
    const enabled = mine();
    return '<div class="tp-panel"><h3 class="tp-panel__h">Teen Patti</h3>' +
      '<p class="tp-panel__p">' + esc(nm(S.t)) + ", how many players?</p>" +
      '<div class="tp-pns">' + [2, 3, 4, 5, 6].map((n) =>
        '<button type="button" class="tp-pn" data-i="players" data-n="' + n + '"' + (enabled ? "" : " disabled") + ">" + n +
        "<small>players</small></button>").join("") + "</div>" +
      '<p class="tp-panel__p">Everyone starts with ' + START + " chips. The match lasts " + HANDS + " hands.</p></div>";
  }

  function dealHTML() {
    return '<div class="tp-panel"><h3 class="tp-panel__h">' + esc(S.lh ? S.msg : "Teen Patti") + "</h3>" + summaryHTML() +
      '<p class="tp-panel__p">' + esc(nm(S.t)) + " deals hand " + S.hn + " of " + HANDS + ". Boot is " + S.boot + " chips.</p>" +
      '<div class="tp-actions"><button type="button" class="tp-btn tp-btn--gold" data-i="deal"' + (mine() ? "" : " disabled") +
      ">Shuffle and deal</button></div></div>";
  }

  function endHTML() {
    const order = S.ch.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]);
    return '<div class="tp-panel"><h3 class="tp-panel__h">' + esc(S.msg) + "</h3>" + summaryHTML() +
      '<div class="tp-sum">' + order.map(([c, i], k) =>
        '<div class="tp-sum__row tp-s' + i + (k === 0 ? " is-win" : "") + '"><span class="tp-sum__n">' + esc(nm(i)) +
        '</span><span class="tp-sum__cards">' + (k === 0 ? "Champion" : "") + '</span><span class="tp-sum__pts">' + c + "<small>chips</small></span></div>").join("") + "</div></div>";
  }

  function rulesHTML() {
    return '<details class="tp-rules"><summary class="tp-iconbtn" aria-label="Game rules" title="Game rules">' +
      '<span class="tp-rules__icon" aria-hidden="true">i</span><span class="tp-sr">Game rules</span></summary><div class="tp-rules__content">' +
      '<h2 class="tp-rules__title">How to play Teen Patti</h2><ul class="tp-rules__list">' +
      "<li>2 to 6 players, 3 cards each, " + START + " chips to start. Every hand begins with a boot of " + BOOT + " chips from each player.</li>" +
      "<li>On your turn you are either blind (you haven't looked) or seen. A blind player pays the stake to chaal (bet). A seen player pays double.</li>" +
      "<li>See cards looks at your hand without ending your turn. Tap your face-down cards or press See cards.</li>" +
      "<li>Raise doubles the stake (up to " + MAX_STAKE + ") and then you pay it. Pack folds and gives up your chips in the pot.</li>" +
      "<li>When only two players remain, either can pay and ask for a show. Both hands are revealed and the better hand takes the pot. If they tie, the player who asked loses.</li>" +
      "<li>If the pot reaches " + POT_CAP + ", everyone still in shows and the best hand wins (ties split the pot). Last player left after everyone packs wins without showing.</li>" +
      "<li>Hands from best to worst: Trail (three of a kind), Pure sequence (three in a row, one suit), Sequence (three in a row), Color (one suit), Pair, High card.</li>" +
      "<li>Ace is high, except A-2-3, which counts as a sequence and ranks just below A-K-Q. Sequences do not wrap (Q-K-A is fine, K-A-2 is not).</li>" +
      "<li>If you can't cover a bet you can only pack, or ask for an all-in show when two players are left.</li>" +
      "<li>After " + HANDS + " hands the player with the most chips wins. Anyone who can't pay the boot is out.</li>" +
      "</ul></div></details>";
  }

  /* ------------------------------- bot ---------------------------------- */

  function botPlay() {
    const i = S.t;
    const o = legal(i);
    if (!S.sn[i]) {
      if (S.st >= S.boot * 4 || Math.random() < 0.3) return { see: 1 };
      if (o.raise && Math.random() < 0.1) return { raise: 1 };
      if (o.chaal) return { chaal: 1 };
      return o.show ? { show: 1 } : { pack: 1 };
    }
    const s = strength(evalHand(S.h[i]));
    if (o.show && (s >= 0.5 || Math.random() < 0.12 || !o.chaal)) return { show: 1 };
    if (s >= 0.72 && o.raise && Math.random() < 0.6) return { raise: 1 };
    if (s >= 0.4 && o.chaal) {
      if (s < 0.5 && S.st >= S.boot * 4 && Math.random() < 0.4) return { pack: 1 };
      return { chaal: 1 };
    }
    if (o.chaal && S.st <= S.boot * 2 && Math.random() < 0.4) return { chaal: 1 };
    return { pack: 1 };
  }

  /* ------------------------------- the game ------------------------------ */

  const game = {
    id: "teenpatti",
    i: "🃏",
    t: "Teen Patti",
    d: "Indian three-card poker for 2 to 6 players. Play blind or seen, bet, raise, pack, or call a show.",
    min: 2,
    max: MAX_P,
    cat: "classic casual",
    tag: "Card classic",
    diff: "Medium",
    art: "art-teenpatti",
    n: ["Red", "Blue", "Green", "Gold", "Violet", "Orange"],

    // The runtime may pass the player count (a number, or an object with
    // players/n/count). Without it the first seat picks it in a setup step.
    init(opts) {
      mySeat = null;
      anim = { seq: -1, start: 0 };

      const raw = typeof opts === "number" ? opts
        : opts && typeof opts === "object" ? (opts.players || opts.n || opts.count || opts.np) : 0;
      const hinted = Number.isInteger(raw) && raw >= MIN_P && raw <= MAX_P ? raw : 0;
      const np = hinted || 2;
      return {
        ph: hinted ? "deal" : "setup", t: 0, over: 0, msg: "", seq: 0,
        np, dealer: 0, hn: 1,
        boot: BOOT, st: BOOT, maxst: MAX_STAKE, cap: POT_CAP, pot: 0,
        ch: Array(np).fill(START), cs: Array(np).fill(START),
        ou: Array(np).fill(false), al: Array(np).fill(false), sn: Array(np).fill(false),
        h: Array.from({ length: np }, () => []),
        lh: null, last: null,
      };
    },

    valid(action) {
      if (!action || typeof action !== "object" || Array.isArray(action) || S.over) return false;
      const key = Object.keys(action).sort().join(",");
      if (S.ph === "setup") {
        return key === "players" && Number.isInteger(action.players) && action.players >= MIN_P && action.players <= MAX_P;
      }
      if (S.ph === "deal") {
        const p = action.deal;
        return key === "deal" && Array.isArray(p) && p.length === S.np * 3 &&
          p.every(isId) && new Set(p).size === p.length;
      }
      if (S.ph !== "play") return false;
      const o = legal(S.t);
      if (key === "see") return action.see === 1 && o.see;
      if (key === "chaal") return action.chaal === 1 && o.chaal;
      if (key === "raise") return action.raise === 1 && o.raise;
      if (key === "show") return action.show === 1 && o.show;
      if (key === "pack") return action.pack === 1;
      return false;
    },

    apply(action) {
      if (S.ph === "setup") {
        const np = action.players;
        S.np = np;
        S.ch = Array(np).fill(START);
        S.cs = Array(np).fill(START);
        S.ou = Array(np).fill(false);
        S.al = Array(np).fill(false);
        S.sn = Array(np).fill(false);
        S.h = Array.from({ length: np }, () => []);
        S.dealer = 0;
        S.t = 0;
        S.hn = 1;
        S.ph = "deal";
        return;
      }
      if (S.ph === "deal") {
        const p = action.deal;
        S.cs = S.ch.slice();
        S.pot = 0;
        S.st = S.boot;
        for (let i = 0; i < S.np; i++) {
          S.sn[i] = false;
          if (S.ou[i]) { S.al[i] = false; S.h[i] = []; continue; }
          S.al[i] = true;
          S.ch[i] -= S.boot;
          S.pot += S.boot;
          S.h[i] = p.slice(i * 3, i * 3 + 3);
        }
        S.lh = null;
        S.msg = "";
        S.ph = "play";
        S.last = { seq: ++S.seq, kind: "deal", seat: S.dealer };
        S.t = nextAlive(S.dealer);
        return;
      }

      const i = S.t;
      if (has(action, "see")) {
        S.sn[i] = true;                       // looking does not end the turn
        S.last = { seq: ++S.seq, kind: "see", seat: i };
        return;
      }
      if (has(action, "pack")) {
        S.al[i] = false;
        S.last = { seq: ++S.seq, kind: "pack", seat: i };
        const a = aliveList();
        if (a.length === 1) { endHand(a, "pack", false); return; }
        S.t = nextAlive(i);
        return;
      }
      if (has(action, "show")) {
        const other = aliveList().find((s) => s !== i);
        const amt = pay(i, costOf(i, S.st));
        S.last = { seq: ++S.seq, kind: "show", seat: i, amt };
        const mineScore = evalHand(S.h[i]).score;
        const theirScore = evalHand(S.h[other]).score;
        endHand([mineScore > theirScore ? i : other], "show", true);   // a tie goes against the asker
        return;
      }

      // chaal or raise
      const raise = has(action, "raise");
      if (raise) S.st *= 2;
      const blind = !S.sn[i];
      const amt = pay(i, costOf(i, S.st));
      S.last = { seq: ++S.seq, kind: raise ? "raise" : "chaal", seat: i, amt, blind, st: S.st };
      if (S.pot >= S.cap) { showdown(); return; }
      S.t = nextAlive(i);
    },

    draw() {
      const L = S.last;
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!L) anim.seq = -1;
      let el = -1;
      if (L && !reduce) {
        if (anim.seq !== L.seq) anim = { seq: L.seq, start: Date.now() };
        const dur = L.kind === "deal" ? 1800 : 1100;
        const elapsed = Date.now() - anim.start;
        if (elapsed < dur) el = elapsed;
      }
      const an = el >= 0;

      const vs = viewSeat();

      let body;
      if (S.ph === "setup") body = setupHTML();
      else if (S.ph === "deal") body = dealHTML();
      else if (S.ph === "end") body = endHTML();
      else body = tableHTML(an, L) + handHTML(vs, an, L);

      let status;
      if (S.over) status = S.msg;
      else if (S.ph === "setup") status = nm(S.t) + " picks the number of players";
      else if (S.ph === "deal") status = nm(S.t) + " to deal";
      else status = nm(S.t) + (S.sn[S.t] ? " (seen) to act" : " (blind) to act");

      const info = S.ph === "setup" ? "Teen Patti, 2 to 6 players"
        : "Hand " + Math.min(S.hn, HANDS) + " of " + HANDS + ", boot " + S.boot;
      const html =
        '<section class="teenpatti" aria-label="Teen Patti card game" style="--el:' + (an ? el : 0) + 'ms">' +
        '<div class="tp-bar"><p class="tp-info">' + esc(info) + '</p><div class="tp-bar__btns">' +
        '<button type="button" class="tp-iconbtn" data-i="fs" aria-label="Toggle full screen" title="Full screen">⛶</button>' +
        rulesHTML() + "</div></div>" +
        (S.ph === "setup" ? "" : '<div class="tp-seats">' + S.ch.map((_, i) => seatHTML(i, an, L)).join("") + "</div>") +
        body +
        '<p class="tp-turn-status" role="status" aria-live="polite">' + esc(status) + "</p></section>";
      return [html, status];
    },

    click(element) {
      const target = element && element.closest ? element.closest("[data-i]") : null;
      if (!target) return;
      const kind = target.dataset.i;

      // Local-only control works on anyone's turn.
      if (kind === "fs") {
        if (typeof document === "undefined") return;
        if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        return;
      }
      if (!canAct()) return;

      let action = null;
      if (kind === "players") action = { players: Number(target.dataset.n) };
      else if (kind === "deal") action = { deal: shuffled(DECK).slice(0, S.np * 3) };
      else if (kind === "see" || kind === "chaal" || kind === "raise" || kind === "show" || kind === "pack") action = { [kind]: 1 };

      if (action && game.valid(action)) act(action);
    },

    bot() {
      if (S.ph === "setup") return { players: 2 };
      if (S.ph === "deal") return { deal: shuffled(DECK).slice(0, S.np * 3) };
      return botPlay();
    },
  };

  registerGame(game);
})();
