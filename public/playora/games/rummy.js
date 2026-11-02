(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Rummy - classic (straight) rummy for 2 to 6 players.
   *
   *  - 2 players: 10 cards each. 3-4 players: 7 each. 5-6 players: 6 each
   *    and two decks (104 cards) so there is always enough stock.
   *  - Turn: draw (stock or top discard) -> meld / lay off (optional)
   *    -> discard. Sets are 3-4 cards of one rank in different suits,
   *    runs are 3+ consecutive cards of one suit (Ace low or high, no wrap).
   *  - Going out scores the points left in every other hand (A=1, face=10).
   *    First to 100 points wins the match.
   *
   * Online play: uses the shared Playora runtime (act/valid/apply, reconnects,
   * disconnect handling). The only random input is the shuffled deck, which
   * the dealer's client puts inside the deal action so apply() stays
   * deterministic on every peer. No custom network protocol.
   *
   * Privacy: the board only draws the hand of the seat this browser has played
   * (remembered the first time canAct() is true); everyone else is shown as
   * card counts. See viewSeat() if the runtime exposes the local seat directly.
   * NOTE: every peer holds the full state, so this hides hands in the UI only.
   * ------------------------------------------------------------------ */

  const STYLE_ID = "rummy-styles";
  const CSS = `
.art-rummy {
  background:
    radial-gradient(circle at 24% 26%, #34d399 0, transparent 44%),
    radial-gradient(circle at 80% 78%, #fbbf24 0, transparent 40%),
    linear-gradient(135deg, #0f4a2e, #052014);
}

.rummy {
  --rm-felt: #0f4a2e;
  --rm-felt-deep: #062416;
  --rm-gold: #fbbf24;
  --cw: clamp(2.2rem, 8vw, 5rem);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  box-sizing: border-box;
  width: min(100%, 72rem);
  min-height: calc(100vh - 4.25rem);
  min-height: calc(100dvh - 4.25rem);
  margin: 0 auto;
  padding: clamp(0.6rem, 2.5vw, 1.25rem);
  overflow: hidden;
  border: 2px solid #14532d;
  border-radius: 1.25rem;
  background:
    radial-gradient(ellipse at 50% 0, rgba(255, 255, 255, 0.08), transparent 60%),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.025) 0 0.6rem, transparent 0.6rem 1.2rem),
    linear-gradient(180deg, var(--rm-felt), var(--rm-felt-deep));
  color: #f8fafc;
  text-align: center;
}

.rummy *,
.rummy *::before,
.rummy *::after { box-sizing: border-box; }

.rummy .rm-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

#gm:has(#bd .rummy) > #lg,
#gm:has(#bd .rummy) > #st { display: none !important; }

/* ---------- top bar ---------- */
.rummy .rm-bar { position: relative; z-index: 6; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.rummy .rm-info { margin: 0; min-width: 0; font-size: 0.8rem; font-weight: 600; opacity: 0.8; text-align: left; }
.rummy .rm-bar__btns { display: flex; flex: none; gap: 0.4rem; }

.rummy .rm-iconbtn {
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
.rummy .rm-iconbtn::-webkit-details-marker { display: none; }
.rummy .rm-rules { position: relative; }
.rummy .rm-rules__icon { font-family: Georgia, serif; font-style: italic; }
.rummy .rm-rules__content {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  width: min(27rem, calc(100vw - 2rem));
  max-height: min(60vh, 32rem);
  padding: 1rem;
  overflow: auto;
  border: 1px solid rgba(167, 243, 208, 0.45);
  border-radius: 0.85rem;
  background: #04180f;
  box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.65);
  text-align: left;
}
.rummy .rm-rules__title { margin: 0 0 0.6rem; font-size: 1rem; }
.rummy .rm-rules__list { display: grid; gap: 0.5rem; margin: 0; padding-left: 1.1rem; font-size: 0.88rem; line-height: 1.5; }

/* ---------- seats ---------- */
.rummy .rm-seats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr)); gap: 0.4rem; }
.rummy .rm-seat {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
  padding: 0.4rem 0.6rem;
  border: 2px solid transparent;
  border-top: 0.25rem solid var(--sc);
  border-radius: 0.8rem;
  background: rgba(0, 0, 0, 0.3);
  text-align: left;
  transition: border-color 0.25s, box-shadow 0.25s;
}
.rummy .rm-seat.is-active { border-color: var(--rm-gold); border-top-color: var(--rm-gold); box-shadow: 0 0 1.1rem rgba(251, 191, 36, 0.3); }
.rummy .rm-seat.is-act { animation: rm-bump 0.55s ease; animation-delay: calc(0ms - var(--el, 0ms)); }
.rummy .rm-seat__top { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 0.4rem; }
.rummy .rm-seat__name { min-width: 0; overflow: hidden; color: var(--sc); font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.rummy .rm-seat__score { font-size: 1.15rem; font-weight: 900; line-height: 1.1; }
.rummy .rm-seat__meta { display: flex; gap: 0.4rem; font-size: 0.7rem; opacity: 0.8; }
.rummy .rm-seat__dealer { padding: 0 0.35rem; border-radius: 0.5rem; background: var(--rm-gold); color: #1c1917; font-weight: 800; }

/* ---------- cards ---------- */
.rummy .rm-card {
  position: relative;
  flex: none;
  width: var(--cw);
  height: calc(var(--cw) * 1.42);
  padding: 0;
  border: 0;
  border-radius: calc(var(--cw) * 0.14);
  background: linear-gradient(160deg, #ffffff, #efe8d8);
  color: #1c1917;
  font: inherit;
  font-size: calc(var(--cw) * 0.34);
  font-weight: 800;
  box-shadow: 0 0.2rem 0.5rem rgba(0, 0, 0, 0.45);
  transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.3), box-shadow 0.18s;
}
.rummy .rm-red { color: #dc2626; }
.rummy .rm-card__c { position: absolute; display: flex; flex-direction: column; align-items: center; line-height: 1; font-size: 0.95em; }
.rummy .rm-card__c i { font-style: normal; font-size: 0.85em; }
.rummy .rm-card__c--tl { top: 7%; left: 9%; }
.rummy .rm-card__c--br { right: 9%; bottom: 7%; transform: rotate(180deg); }
.rummy .rm-card__pip { position: absolute; inset: 0; display: grid; place-items: center; padding-top: 0.2em; font-size: 1.9em; opacity: 0.9; }
.rummy .rm-cardback {
  width: var(--cw);
  height: calc(var(--cw) * 1.42);
  border: calc(var(--cw) * 0.06) solid #fff;
  border-radius: calc(var(--cw) * 0.14);
  background: repeating-linear-gradient(45deg, #1e3a8a 0 0.35rem, #2563eb 0.35rem 0.7rem);
  box-shadow: 0 0.2rem 0.5rem rgba(0, 0, 0, 0.45);
}
.rummy .rm-cardback--empty { border-style: dashed; border-color: rgba(255, 255, 255, 0.35); background: transparent; box-shadow: none; }

.rummy .rm-hand {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  min-height: calc(var(--cw) * 1.42 + 1.4rem);
  padding-top: 1.1rem;
}
.rummy .rm-hand .rm-card { margin-inline: calc(var(--cw) * -0.04); cursor: pointer; }
/* hover lift only on real hover devices, and never on a selected card
   (on touch screens :hover sticks after a tap and used to cancel the selected lift) */
@media (hover: hover) {
  .rummy .rm-hand .rm-card:hover:not(:disabled):not(.is-selected) { transform: translateY(-0.35rem); }
}
.rummy .rm-hand .rm-card.is-selected {
  z-index: 2;
  transform: translateY(-1rem) rotate(-1.5deg);
  box-shadow: 0 0 0 0.18rem var(--rm-gold), 0 0.8rem 1rem rgba(0, 0, 0, 0.5);
}
.rummy .rm-hand .rm-card:disabled { cursor: default; }
.rummy .rm-hand .rm-card.is-drawn { animation: rm-draw 0.6s cubic-bezier(0.2, 0.8, 0.3, 1.1) backwards; animation-delay: calc(0ms - var(--el, 0ms)); }
.rummy .rm-hand .rm-card.is-drawn-d { animation-name: rm-draw-d; }
.rummy .rm-hand .rm-card.is-dealt { animation: rm-deal 0.55s cubic-bezier(0.2, 0.8, 0.3, 1.1) backwards; animation-delay: calc(var(--i) * 70ms - var(--el, 0ms)); }

.rummy .rm-card:focus-visible,
.rummy .rm-btn:focus-visible,
.rummy .rm-pile:focus-visible,
.rummy .rm-meld:focus-visible,
.rummy .rm-iconbtn:focus-visible,
.rummy .rm-pn:focus-visible { z-index: 3; outline: 3px solid #f59e0b; outline-offset: 3px; }

/* ---------- table: piles + melds ---------- */
.rummy .rm-table {
  display: grid;
  grid-template-columns: auto 1fr;
  flex: 1 1 auto;
  align-items: start;
  gap: 0.8rem;
  min-height: 8rem;
  padding: 0.6rem;
  overflow: auto;
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.18);
}
.rummy .rm-piles { display: flex; gap: 0.7rem; }
.rummy .rm-pile { display: grid; justify-items: center; gap: 0.3rem; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.rummy .rm-pile:disabled { cursor: default; }
.rummy .rm-pile__label { font-size: 0.72rem; font-weight: 700; opacity: 0.85; }
.rummy .rm-pile.is-hint .rm-cardback,
.rummy .rm-pile.is-hint .rm-card { animation: rm-pulse 1.4s ease-in-out infinite; }
.rummy .rm-pile.is-pulse .rm-cardback,
.rummy .rm-pile.is-pulse .rm-card { animation: rm-pulse 0.7s ease; animation-delay: calc(0ms - var(--el, 0ms)); }
.rummy .rm-pile.is-drop .rm-card { animation: rm-drop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards; animation-delay: calc(0ms - var(--el, 0ms)); }

.rummy .rm-melds { display: flex; flex-wrap: wrap; align-content: flex-start; justify-content: center; gap: 0.5rem; min-height: 100%; }
.rummy .rm-melds__empty { align-self: center; margin: 0; font-size: 0.9rem; opacity: 0.7; }
.rummy .rm-meld {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.4rem;
  border: 2px solid var(--sc);
  border-radius: 0.7rem;
  background: rgba(0, 0, 0, 0.28);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.rummy .rm-meld:disabled { cursor: default; }
.rummy .rm-meld.is-target { box-shadow: 0 0 0.9rem rgba(251, 191, 36, 0.55); }
.rummy .rm-meld.is-bad { animation: rm-shake 0.35s ease; }
.rummy .rm-meld.is-new .rm-mini { animation: rm-pop 0.45s ease backwards; animation-delay: calc(var(--i) * 60ms - var(--el, 0ms)); }
.rummy .rm-meld .rm-mini.is-added { animation: rm-pop 0.5s ease backwards; animation-delay: calc(0ms - var(--el, 0ms)); box-shadow: 0 0 0.8rem var(--rm-gold); }
.rummy .rm-mini {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: calc(var(--cw) * 0.6);
  height: calc(var(--cw) * 0.86);
  margin-inline: calc(var(--cw) * -0.02);
  border-radius: calc(var(--cw) * 0.1);
  background: linear-gradient(160deg, #fff, #efe8d8);
  color: #1c1917;
  font-size: calc(var(--cw) * 0.22);
  font-weight: 800;
  line-height: 1.05;
  box-shadow: 0 0.1rem 0.25rem rgba(0, 0, 0, 0.4);
}
.rummy .rm-mini i { font-style: normal; }

/* ---------- controls & panels ---------- */
.rummy .rm-controls { margin-top: 0.2rem; }
.rummy .rm-hint { min-height: 1.4em; margin: 0 0 0.5rem; font-size: 0.9rem; font-weight: 700; }
.rummy .rm-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; }
.rummy .rm-btn {
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
.rummy .rm-btn:active:not(:disabled) { transform: translateY(0.15rem); box-shadow: none; }
.rummy .rm-btn--meld { background: #16a34a; }
.rummy .rm-btn--discard { background: #dc2626; }
.rummy .rm-btn--sort { background: #475569; }
.rummy .rm-btn--gold { background: var(--rm-gold); color: #1c1917; }
.rummy .rm-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.rummy .rm-panel { display: grid; flex: 1 1 auto; align-content: center; justify-items: center; gap: 0.8rem; padding: 0.5rem; }
.rummy .rm-panel__h { margin: 0; font-size: clamp(1.15rem, 4cqw, 1.7rem); animation: rm-banner 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) backwards; }
.rummy .rm-panel__p { margin: 0; opacity: 0.88; }
.rummy .rm-pns { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; }
.rummy .rm-pn {
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
.rummy .rm-pn small { font-size: 0.65rem; font-weight: 600; opacity: 0.8; }
.rummy .rm-pn:hover:not(:disabled) { transform: translateY(-0.25rem); border-color: var(--rm-gold); }
.rummy .rm-pn:disabled { opacity: 0.5; cursor: not-allowed; }

.rummy .rm-sum { display: grid; gap: 0.3rem; width: min(100%, 36rem); }
.rummy .rm-sum__row { display: grid; grid-template-columns: 6rem 1fr auto; align-items: center; gap: 0.5rem; padding: 0.3rem 0.5rem; border-radius: 0.6rem; background: rgba(0, 0, 0, 0.26); text-align: left; }
.rummy .rm-sum__row.is-win { box-shadow: inset 0 0 0 2px var(--rm-gold); }
.rummy .rm-sum__n { overflow: hidden; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.rummy .rm-sum__cards { display: flex; flex-wrap: wrap; }
.rummy .rm-sum__pts { font-weight: 800; }
.rummy .rm-sum .rm-mini { width: 1.5rem; height: 2.1rem; font-size: 0.6rem; }

.rummy .rm-turn-status { flex: none; min-height: 1.4rem; margin: auto 0 0; font-size: 0.85rem; font-weight: 700; }

/* ---------- seat colours ---------- */
.rummy .rm-s0 { --sc: #fca5a5; }
.rummy .rm-s1 { --sc: #7dd3fc; }
.rummy .rm-s2 { --sc: #86efac; }
.rummy .rm-s3 { --sc: #fde68a; }
.rummy .rm-s4 { --sc: #d8b4fe; }
.rummy .rm-s5 { --sc: #fdba74; }

/* ---------- hardening: win against the host page's generic button styles ---------- */
.rummy button.rm-card[data-i] {
  box-sizing: border-box !important;
  position: relative !important;
  display: block !important;
  flex: none !important;
  width: var(--cw) !important;
  min-width: 0 !important;
  max-width: none !important;
  height: calc(var(--cw) * 1.42) !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 calc(var(--cw) * -0.04) !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: calc(var(--cw) * 0.14) !important;
  background: linear-gradient(160deg, #ffffff, #efe8d8) !important;
  color: #1c1917 !important;
  font-family: inherit !important;
  font-size: calc(var(--cw) * 0.34) !important;
  font-weight: 800 !important;
  line-height: normal !important;
  text-align: center !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  box-shadow: 0 0.2rem 0.5rem rgba(0, 0, 0, 0.45) !important;
  opacity: 1 !important;
  filter: none !important;
  -webkit-appearance: none !important;
  appearance: none !important;
}
.rummy button.rm-card.rm-red[data-i] { color: #dc2626 !important; }
.rummy button.rm-card[data-i].is-selected { box-shadow: 0 0 0 0.18rem #fbbf24, 0 0.8rem 1rem rgba(0, 0, 0, 0.5) !important; }

.rummy button.rm-btn[data-i] {
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
.rummy button.rm-btn--meld[data-i] { background: #16a34a !important; }
.rummy button.rm-btn--discard[data-i] { background: #dc2626 !important; }
.rummy button.rm-btn--sort[data-i] { background: #475569 !important; }
.rummy button.rm-btn--gold[data-i] { background: #fbbf24 !important; color: #1c1917 !important; }
.rummy button.rm-btn[data-i]:disabled { opacity: 0.45 !important; }

.rummy button.rm-pile[data-i] {
  display: grid !important;
  width: auto !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  color: inherit !important;
}
.rummy button.rm-meld[data-i] {
  display: inline-flex !important;
  width: auto !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0.3rem 0.4rem !important;
  border: 2px solid var(--sc) !important;
  border-radius: 0.7rem !important;
  background: rgba(0, 0, 0, 0.28) !important;
  color: inherit !important;
}
.rummy button.rm-iconbtn[data-i] {
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
.rummy button.rm-pn[data-i] {
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
.rummy button { touch-action: manipulation; }

@supports (width: 1cqw) {
  .rummy { --cw: clamp(2.2rem, min(7.2cqw, 11.5vh), 5.2rem); container-type: inline-size; }
}

@container (max-width: 40rem) {
  .rummy .rm-table { grid-template-columns: 1fr; justify-items: center; }
  .rummy .rm-seat { padding: 0.3rem 0.45rem; }
  .rummy .rm-seat__score { font-size: 1rem; }
  .rummy .rm-hand { --cw: clamp(2.5rem, min(13.5cqw, 10vh), 3.9rem); row-gap: 0.6rem; }
  .rummy .rm-btn { min-width: 0; flex: 1 1 6rem; }
}

@container (max-width: 24rem) {
  .rummy .rm-seat__meta span:not(.rm-seat__dealer) { display: none; }
  .rummy .rm-pn { width: 3.6rem; font-size: 1.35rem; }
}

@container (min-width: 56rem) {
  .rummy .rm-seat__score { font-size: 1.4rem; }
  .rummy .rm-info { font-size: 0.9rem; }
  .rummy .rm-hint { font-size: 1.05rem; }
}

@media (max-width: 30rem) {
  .rummy { min-height: calc(100vh - 4.625rem); min-height: calc(100dvh - 4.625rem); }
  .rummy button.rm-btn[data-i] { min-width: 0 !important; flex: 1 1 6rem !important; padding: 0.55rem 0.4rem !important; font-size: 0.9rem !important; }
}

@media (max-height: 48rem) {
  .rummy { gap: 0.35rem; padding: 0.5rem; --cw: clamp(2.1rem, min(7cqw, calc(9.5vh - 0.2rem)), 4.2rem); }
  .rummy .rm-seat { padding: 0.25rem 0.5rem; }
  .rummy .rm-table { min-height: 5rem; padding: 0.4rem; }
  .rummy .rm-hand { min-height: calc(var(--cw) * 1.42 + 0.6rem); padding-top: 0.5rem; }
  .rummy .rm-hand .rm-card.is-selected { transform: translateY(-0.6rem) rotate(-1.5deg); }
  .rummy .rm-hint { min-height: 1em; margin-bottom: 0.3rem; font-size: 0.8rem; }
  .rummy .rm-btn { min-height: 2.35rem; padding: 0.4rem 0.8rem; }
}

/* ---------- keyframes ---------- */
@keyframes rm-deal { from { opacity: 0; transform: translate(0, -9rem) rotate(18deg) scale(0.5); } }
@keyframes rm-draw { from { opacity: 0; transform: translate(-22vw, -9rem) rotate(-14deg) scale(0.6); } }
@keyframes rm-draw-d { from { opacity: 0; transform: translate(-12vw, -9rem) rotate(12deg) scale(0.7); } }
@keyframes rm-drop { from { opacity: 0; transform: translateY(-6rem) rotate(-20deg) scale(1.25); } }
@keyframes rm-pop { 0% { opacity: 0; transform: scale(0.55); } 60% { opacity: 1; transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes rm-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); } 40% { box-shadow: 0 0 0 0.45rem rgba(251, 191, 36, 0.6); } }
@keyframes rm-bump { 0%, 100% { transform: none; } 40% { transform: translateY(-0.25rem) scale(1.04); } }
@keyframes rm-shake { 0%, 100% { transform: none; } 25% { transform: translateX(-0.3rem); } 75% { transform: translateX(0.3rem); } }
@keyframes rm-banner { from { opacity: 0; transform: scale(0.7) translateY(1rem); } }

@media (prefers-reduced-motion: reduce) {
  .rummy *,
  .rummy *::before,
  .rummy *::after { animation: none !important; transition: none !important; }
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
  const RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RANK_NAMES = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"];
  const MIN_P = 2;
  const MAX_P = 6;
  const GOAL = 100;

  const handSize = (np) => (np === 2 ? 10 : np <= 4 ? 7 : 6);
  const decksFor = (np) => (np <= 4 ? 1 : 2);
  const totalFor = (np) => decksFor(np) * 52;

  // ids 0..51 are the first deck, 52..103 the second (same cards again).
  const rank = (id) => (id % 13) + 1;                  // 1 = Ace ... 13 = King
  const suit = (id) => Math.floor((id % 52) / 13);
  const hiRank = (id) => (rank(id) === 1 ? 14 : rank(id));
  const points = (id) => Math.min(rank(id), 10);
  const isId = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
  const sortCards = (ids, mode) => ids.slice().sort(mode === "rank"
    ? (a, b) => rank(a) - rank(b) || suit(a) - suit(b) || a - b
    : (a, b) => suit(a) - suit(b) || rank(a) - rank(b) || a - b);

  let sel = [];                       // local, un-synced selection
  let anim = { seq: -1, start: 0 };   // local animation clock for S.last
  let mySeat = null;                  // seat this browser has played (see viewSeat)
  let sortMode = "suit";              // local hand ordering

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

  // Pure. A valid meld is a set (same rank, different suits, 3-4 cards) or a
  // run (3+ consecutive cards of one suit, Ace low or high, no wrap-around).
  function meldOf(ids) {
    const n = ids.length;
    if (n < 3 || n > 13) return null;
    const rs = ids.map(rank);
    const ss = ids.map(suit);
    if (rs.every((r) => r === rs[0])) {
      return n <= 4 && new Set(ss).size === n
        ? { t: "set", c: ids.slice().sort((a, b) => suit(a) - suit(b) || a - b) } : null;
    }
    if (!ss.every((s) => s === ss[0]) || new Set(rs).size !== n) return null;
    const low = ids.slice().sort((a, b) => rank(a) - rank(b));
    if (rank(low[n - 1]) - rank(low[0]) === n - 1) return { t: "run", c: low };
    if (rank(low[0]) === 1) {
      const hi = ids.slice().sort((a, b) => hiRank(a) - hiRank(b));
      if (hiRank(hi[n - 1]) - hiRank(hi[0]) === n - 1) return { t: "run", c: hi };
    }
    return null;
  }

  function canLay(id, m) {
    const r = meldOf(S.mel[m].c.concat([id]));
    return !!r && r.t === S.mel[m].t;
  }

  /* ----------------------------- turn flow ------------------------------ */

  function startTurn() {
    // Stock empty: turn the discards over once; a second time ends the hand.
    if (!S.stock.length && S.rc < 1 && S.disc.length > 1) {
      const top = S.disc.pop();
      S.stock = S.disc.reverse();
      S.disc = [top];
      S.rc += 1;
    }
    if (!S.stock.length) endHand(-1);
  }

  function endHand(winner) {
    let gain = 0;
    if (winner >= 0) {
      S.h.forEach((h, i) => { if (i !== winner) gain += h.reduce((a, id) => a + points(id), 0); });
      S.sc[winner] += gain;
    }
    S.lh = { n: S.hn, w: winner, gain, hands: S.h.map((h) => sortCards(h, "suit")) };
    S.log.push({ n: S.hn, w: winner, gain });
    S.h = S.h.map(() => []);
    S.took = null;

    const top = Math.max(...S.sc);
    if (top >= GOAL) {
      const leaders = S.sc.map((s, i) => [s, i]).filter(([s]) => s === top).map(([, i]) => i);
      const champ = leaders.includes(winner) ? winner : leaders[0];
      S.over = 1;
      S.ph = "end";
      S.t = champ;
      S.msg = nm(champ) + " wins the match with " + top + " points!";
      return;
    }
    S.msg = winner >= 0 ? nm(winner) + " went out and scores " + gain + "!"
      : "The stock ran out, so this hand is a draw.";
    S.hn += 1;
    S.ph = "deal";
    S.dealer = (S.dealer + 1) % S.np;
    S.t = S.dealer;
  }

  /* ------------------------------ rendering ----------------------------- */

  const redCls = (id) => (suit(id) === 1 || suit(id) === 2 ? " rm-red" : "");
  const cardName = (id) => RANK_NAMES[rank(id) - 1] + " of " + SUIT_NAMES[suit(id)];
  const mine = () => !!canAct() && !S.over;

  // The seat whose hand this browser may see. If the runtime exposes the local
  // seat, return it here. Otherwise remember the seat the first time it is ours.
  function viewSeat() {
    if (canAct()) mySeat = S.t;
    return mySeat !== null && mySeat < S.np ? mySeat : null;
  }

  function face(id) {
    const r = RANK_LABELS[rank(id) - 1];
    const s = SUITS[suit(id)];
    return '<span class="rm-card__c rm-card__c--tl"><b>' + r + "</b><i>" + s + "</i></span>" +
      '<span class="rm-card__pip" aria-hidden="true">' + s + "</span>" +
      '<span class="rm-card__c rm-card__c--br" aria-hidden="true"><b>' + r + "</b><i>" + s + "</i></span>";
  }

  function mini(id, cls) {
    return '<span class="rm-mini' + redCls(id) + (cls || "") + '"><b>' + RANK_LABELS[rank(id) - 1] +
      "</b><i>" + SUITS[suit(id)] + "</i></span>";
  }

  function describeMeld(m) {
    if (!m) return "";
    if (m.t === "set") return "Set of " + RANK_NAMES[rank(m.c[0]) - 1] + "s";
    const first = RANK_LABELS[rank(m.c[0]) - 1];
    const last = RANK_LABELS[rank(m.c[m.c.length - 1]) - 1];
    return "Run " + first + " to " + last + " of " + SUIT_NAMES[suit(m.c[0])];
  }

  const canMakeMeld = () => mine() && S.ph === "act" && sel.length >= 3 && !!meldOf(sel);
  const canDiscard = () => mine() && S.ph === "act" && sel.length === 1 &&
    (sel[0] !== S.took || S.h[S.t].length === 1);
  const canLayOff = () => mine() && S.ph === "act" && sel.length === 1;

  function hintText() {
    if (!mine()) return "";
    if (S.ph === "draw") return "Draw from the stock or take the top discard.";
    if (S.ph !== "act") return "";
    if (!sel.length) return "Select 3+ cards to meld, or 1 card to discard or lay off.";
    if (sel.length === 1) {
      return sel[0] === S.took && S.h[S.t].length > 1
        ? "You can't discard the card you just took. Meld or lay it off."
        : "Discard it, or tap a meld on the table to lay it off.";
    }
    const m = meldOf(sel);
    return m ? describeMeld(m) + ". Press Meld." : "Not a valid set or run yet.";
  }

  function syncSel(root) {
    if (!root) return;
    root.querySelectorAll('.rm-hand [data-i="card"]').forEach((b) => {
      const on = sel.includes(Number(b.dataset.id));
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const hint = root.querySelector('[data-role="hint"]');
    if (hint) hint.textContent = hintText();
    const set = (role, on) => { const b = root.querySelector('[data-role="' + role + '"]'); if (b) b.disabled = !on; };
    set("makemeld", canMakeMeld());
    set("discard", canDiscard());
    root.querySelectorAll('[data-i="meld"]').forEach((b) => {
      const ok = canLayOff() && canLay(sel[0], Number(b.dataset.m));
      b.disabled = !canLayOff();
      b.classList.toggle("is-target", ok);
    });
  }

  function seatHTML(i, an, L) {
    const acted = an && L && L.seat === i && L.kind !== "deal";
    const dealer = S.ph !== "setup" && S.dealer === i;
    return '<div class="rm-seat rm-s' + i + (!S.over && S.t === i && S.ph !== "setup" ? " is-active" : "") +
      (acted ? " is-act" : "") + '">' +
      '<div class="rm-seat__top"><span class="rm-seat__name">' + esc(nm(i)) + "</span>" +
      '<span class="rm-seat__score" aria-label="' + S.sc[i] + ' points">' + S.sc[i] + "</span></div>" +
      '<div class="rm-seat__meta"><span>' + S.h[i].length + " cards</span>" +
      (dealer ? '<span class="rm-seat__dealer">Dealer</span>' : "") + "</div></div>";
  }

  function pilesHTML(an, L) {
    const top = S.disc[S.disc.length - 1];
    const draw = mine() && S.ph === "draw";
    const stockCls = (draw && S.stock.length ? " is-hint" : "") +
      (an && L.kind === "draw" && L.from === "stock" ? " is-pulse" : "");
    const discCls = (draw && S.disc.length ? " is-hint" : "") +
      (an && L.kind === "draw" && L.from === "discard" ? " is-pulse" : "") +
      (an && L.kind === "discard" ? " is-drop" : "");
    return '<div class="rm-piles">' +
      '<button type="button" class="rm-pile' + stockCls + '" data-i="stock"' + (draw && S.stock.length ? "" : " disabled") +
      ' aria-label="Draw from stock, ' + S.stock.length + ' cards">' +
      '<span class="' + (S.stock.length ? "rm-cardback" : "rm-cardback rm-cardback--empty") + '"></span>' +
      '<span class="rm-pile__label">Stock ' + S.stock.length + "</span></button>" +
      '<button type="button" class="rm-pile' + discCls + '" data-i="pile"' + (draw && S.disc.length ? "" : " disabled") +
      ' aria-label="' + (top === undefined ? "Discard pile empty" : "Take " + cardName(top) + " from discard") + '">' +
      (top === undefined ? '<span class="rm-cardback rm-cardback--empty"></span>'
        : '<span class="rm-card' + redCls(top) + '">' + face(top) + "</span>") +
      '<span class="rm-pile__label">Discard ' + S.disc.length + "</span></button></div>";
  }

  function meldsHTML(an, L) {
    if (!S.mel.length) return '<div class="rm-melds"><p class="rm-melds__empty">No melds on the table yet.</p></div>';
    const canTap = canLayOff();
    const items = S.mel.map((m, idx) => {
      const isNew = an && (L.kind === "meld" || L.kind === "layoff") && L.m === idx;
      return '<button type="button" class="rm-meld rm-s' + m.o + (isNew ? " is-new" : "") + '" data-i="meld" data-m="' + idx +
        '" aria-label="' + esc(describeMeld(m)) + ', laid by ' + esc(nm(m.o)) + '"' + (canTap ? "" : " disabled") + ">" +
        m.c.map((id, i) => '<span style="--i:' + i + '" class="rm-mini' + redCls(id) +
          (isNew && L.kind === "layoff" && L.card === id ? " is-added" : "") + '"><b>' + RANK_LABELS[rank(id) - 1] +
          "</b><i>" + SUITS[suit(id)] + "</i></span>").join("") + "</button>";
    }).join("");
    return '<div class="rm-melds" aria-label="Melds on the table">' + items + "</div>";
  }

  function handHTML(vs, an, L) {
    if (vs === null) {
      return '<div class="rm-panel"><p class="rm-panel__p">Your cards appear here once it is your turn.</p></div>';
    }
    const active = vs === S.t && mine();
    const hand = sortCards(S.h[vs], sortMode);
    const cards = hand.map((id, i) => {
      let extra = "";
      if (an && L.kind === "deal") extra = " is-dealt";
      else if (an && L.kind === "draw" && L.seat === vs && L.card === id) extra = L.from === "stock" ? " is-drawn" : " is-drawn is-drawn-d";
      const on = active && sel.includes(id);
      return '<button type="button" class="rm-card' + redCls(id) + (on ? " is-selected" : "") + extra +
        '" data-i="card" data-id="' + id + '" aria-pressed="' + on + '" aria-label="' + cardName(id) + '"' +
        (active ? "" : " disabled") + ' style="--i:' + i + '">' + face(id) + "</button>";
    }).join("");
    return '<div class="rm-hand" role="group" aria-label="' + esc(nm(vs)) + ' hand">' + cards + "</div>" +
      '<div class="rm-controls"><p class="rm-hint" data-role="hint" aria-live="polite">' + esc(hintText()) + "</p>" +
      '<div class="rm-actions">' +
      '<button type="button" class="rm-btn rm-btn--meld" data-i="makemeld" data-role="makemeld"' + (canMakeMeld() ? "" : " disabled") + ">Meld</button>" +
      '<button type="button" class="rm-btn rm-btn--discard" data-i="discard" data-role="discard"' + (canDiscard() ? "" : " disabled") + ">Discard</button>" +
      '<button type="button" class="rm-btn rm-btn--sort" data-i="sort" data-role="sort">Sort: ' + (sortMode === "suit" ? "suit" : "rank") + "</button>" +
      "</div></div>";
  }

  function summaryHTML() {
    if (!S.lh) return "";
    return '<div class="rm-sum">' + S.lh.hands.map((h, i) => {
      const won = S.lh.w === i;
      return '<div class="rm-sum__row rm-s' + i + (won ? " is-win" : "") + '"><span class="rm-sum__n" style="color:var(--sc)">' + esc(nm(i)) + "</span>" +
        '<span class="rm-sum__cards">' + (won ? "Went out" : h.map((id) => mini(id)).join("") || "-") + "</span>" +
        '<span class="rm-sum__pts">' + (won ? "+" + S.lh.gain : h.reduce((a, id) => a + points(id), 0) + " pts") + "</span></div>";
    }).join("") + "</div>";
  }

  function setupHTML() {
    const enabled = mine();
    return '<div class="rm-panel"><h3 class="rm-panel__h">Rummy</h3>' +
      '<p class="rm-panel__p">' + esc(nm(S.t)) + ", how many players?</p>" +
      '<div class="rm-pns">' + [2, 3, 4, 5, 6].map((n) =>
        '<button type="button" class="rm-pn" data-i="players" data-n="' + n + '"' + (enabled ? "" : " disabled") + ">" + n +
        "<small>" + handSize(n) + " cards</small></button>").join("") + "</div>" +
      '<p class="rm-panel__p">Up to 6 players. Five or six players use two decks.</p></div>';
  }

  function dealHTML() {
    return '<div class="rm-panel"><h3 class="rm-panel__h">' + esc(S.lh ? S.msg : "Rummy") + "</h3>" + summaryHTML() +
      '<p class="rm-panel__p">' + esc(nm(S.t)) + " deals hand " + S.hn + " · " + S.np + " players · " + handSize(S.np) +
      " cards each" + (decksFor(S.np) === 2 ? " · two decks" : "") + "</p>" +
      '<div class="rm-actions"><button type="button" class="rm-btn rm-btn--gold" data-i="deal"' + (mine() ? "" : " disabled") +
      ">Shuffle and deal</button></div></div>";
  }

  function endHTML() {
    const order = S.sc.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    return '<div class="rm-panel"><h3 class="rm-panel__h">' + esc(S.msg) + "</h3>" +
      '<div class="rm-sum">' + order.map(([s, i], k) =>
        '<div class="rm-sum__row rm-s' + i + (k === 0 ? " is-win" : "") + '"><span class="rm-sum__n" style="color:var(--sc)">' + esc(nm(i)) +
        '</span><span class="rm-sum__cards">' + (k === 0 ? "Champion" : "") + '</span><span class="rm-sum__pts">' + s + "</span></div>").join("") + "</div></div>";
  }

  function rulesHTML() {
    return '<details class="rm-rules"><summary class="rm-iconbtn" aria-label="Game rules" title="Game rules">' +
      '<span class="rm-rules__icon" aria-hidden="true">i</span><span class="rm-sr">Game rules</span></summary><div class="rm-rules__content">' +
      '<h2 class="rm-rules__title">How to play Rummy</h2><ul class="rm-rules__list">' +
      "<li>2 to 6 players. With 2 players each gets 10 cards, with 3–4 players 7 cards, and with 5–6 players 6 cards from two shuffled decks. One card starts the discard pile.</li>" +
      "<li>On your turn, first draw one card: either the top of the stock or the top discard.</li>" +
      "<li>Then you may meld and lay off as often as you like. A set is 3–4 cards of the same rank in different suits. A run is 3 or more consecutive cards of one suit; the Ace can be low (A-2-3) or high (Q-K-A), but runs cannot wrap around.</li>" +
      "<li>To meld, select the cards and press Meld. To lay off, select one card and tap a meld on the table (yours or another player's) that it extends.</li>" +
      "<li>End your turn by discarding one card. You cannot discard the card you just took from the discard pile, unless it is your last card.</li>" +
      "<li>Go out by getting rid of all your cards, by melding, laying off, or discarding your last card. You score the points left in every other player's hand: Ace 1, number cards face value, J/Q/K 10.</li>" +
      "<li>If the stock runs out, the discard pile is turned over once to make a new stock. If it runs out again, the hand is a draw and nobody scores.</li>" +
      "<li>The first player to reach " + GOAL + " points wins the match.</li>" +
      "</ul></div></details>";
  }

  /* ------------------------------ bot helpers ---------------------------- */

  function candidates(hand) {
    const out = [];
    const byRank = {};
    hand.forEach((id) => { (byRank[rank(id)] = byRank[rank(id)] || []).push(id); });
    Object.keys(byRank).forEach((r) => {
      const seen = {};
      const c = [];
      byRank[r].forEach((id) => { if (!seen[suit(id)]) { seen[suit(id)] = 1; c.push(id); } });
      if (c.length >= 3) out.push(c);
    });
    for (let s = 0; s < 4; s++) {
      const pos = {};
      hand.forEach((id) => { if (suit(id) === s && !pos[rank(id)]) pos[rank(id)] = id; });
      let run = [];
      for (let k = 1; k <= 14; k++) {
        const id = pos[k === 14 ? 1 : k];
        if (id !== undefined && !(k === 14 && run.length === 13)) run.push(id);
        else { if (run.length >= 3) out.push(run); run = []; }
      }
      if (run.length >= 3) out.push(run);
    }
    return out.filter((c) => meldOf(c));
  }

  function findMeld(hand, must) {
    let best = null;
    candidates(hand).forEach((c) => {
      if (must !== undefined && !c.includes(must)) return;
      if (!best || c.length > best.length) best = c;
    });
    return best;
  }

  function keepValue(hand, id) {
    let k = 0;
    hand.forEach((o) => {
      if (o === id) return;
      if (rank(o) === rank(id) && suit(o) !== suit(id)) k += 2;
      if (suit(o) === suit(id)) {
        const d = Math.abs(rank(o) - rank(id));
        if (d === 1) k += 1.5; else if (d === 2) k += 0.8;
      }
    });
    return k;
  }

  /* ------------------------------- the game ------------------------------ */

  const game = {
    id: "rummy",
    i: "♣️",
    t: "Rummy",
    d: "Classic rummy for 2 to 6 players. Draw, make sets and runs, lay off on the table and be first to go out.",
    min: 2,
    max: MAX_P,
    cat: "classic casual",
    tag: "Card classic",
    diff: "Medium",
    art: "art-rummy",
    n: ["Red", "Blue", "Green", "Gold", "Violet", "Orange"],

    // The runtime may pass the player count (a number, or an object with
    // players/n/count). Without it the first seat picks it in a setup step.
    init(opts) {
      // New game: forget the seat, selection and animation state of any previous game.
      mySeat = null;
      sel = [];
      anim = { seq: -1, start: 0 };

      const raw = typeof opts === "number" ? opts
        : opts && typeof opts === "object" ? (opts.players || opts.n || opts.count || opts.np) : 0;
      const hinted = Number.isInteger(raw) && raw >= MIN_P && raw <= MAX_P ? raw : 0;
      const np = hinted || 2;
      return {
        ph: hinted ? "deal" : "setup", t: 0, over: 0, msg: "", seq: 0,
        np, dealer: 0, hn: 1, rc: 0, took: null,
        stock: [], disc: [], mel: [],
        h: Array.from({ length: np }, () => []),
        sc: Array(np).fill(0),
        log: [], lh: null, last: null,
      };
    },

    valid(action) {
      if (!action || typeof action !== "object" || Array.isArray(action) || S.over) return false;
      const key = Object.keys(action).sort().join(",");
      if (S.ph === "setup") {
        return key === "players" && Number.isInteger(action.players) && action.players >= MIN_P && action.players <= MAX_P;
      }
      if (S.ph === "deal") {
        const total = totalFor(S.np);
        const p = action.deal;
        return key === "deal" && Array.isArray(p) && p.length === total &&
          p.every((v) => isId(v, total)) && new Set(p).size === total;
      }
      if (S.ph === "draw") {
        return key === "draw" &&
          ((action.draw === "stock" && S.stock.length > 0) || (action.draw === "discard" && S.disc.length > 0));
      }
      if (S.ph !== "act") return false;
      const hand = S.h[S.t];
      if (key === "meld") {
        const c = action.meld;
        return Array.isArray(c) && c.length >= 3 && c.length <= 13 && c.every((v) => Number.isInteger(v) && hand.includes(v)) &&
          new Set(c).size === c.length && !!meldOf(c);
      }
      if (key === "layoff,to") {
        return Number.isInteger(action.layoff) && hand.includes(action.layoff) &&
          Number.isInteger(action.to) && action.to >= 0 && action.to < S.mel.length && canLay(action.layoff, action.to);
      }
      if (key === "discard") {
        return Number.isInteger(action.discard) && hand.includes(action.discard) &&
          (action.discard !== S.took || hand.length === 1);
      }
      return false;
    },

    apply(action) {
      if (S.ph === "setup") {
        S.np = action.players;
        S.h = Array.from({ length: S.np }, () => []);
        S.sc = Array(S.np).fill(0);
        S.dealer = 0;
        S.t = 0;
        S.hn = 1;
        S.ph = "deal";
        return;
      }
      if (S.ph === "deal") {
        const p = action.deal;
        const hs = handSize(S.np);
        S.h = Array.from({ length: S.np }, (_, i) => sortCards(p.slice(i * hs, (i + 1) * hs), "suit"));
        const next = S.np * hs;
        S.disc = [p[next]];
        S.stock = p.slice(next + 1);
        S.mel = [];
        S.rc = 0;
        S.took = null;
        S.lh = null;
        S.msg = "";
        S.ph = "draw";
        S.last = { seq: ++S.seq, kind: "deal", seat: S.dealer };
        S.t = (S.dealer + 1) % S.np;
        return;
      }

      const seat = S.t;
      if (S.ph === "draw") {
        const fromStock = action.draw === "stock";
        const card = fromStock ? S.stock.pop() : S.disc.pop();
        S.took = fromStock ? null : card;
        S.h[seat] = sortCards(S.h[seat].concat([card]), "suit");
        S.last = { seq: ++S.seq, kind: "draw", seat, from: fromStock ? "stock" : "discard", card };
        S.ph = "act";
        return;
      }

      if (Object.prototype.hasOwnProperty.call(action, "meld")) {
        const m = meldOf(action.meld);
        S.mel.push({ t: m.t, c: m.c, o: seat });
        S.h[seat] = S.h[seat].filter((id) => !action.meld.includes(id));
        S.last = { seq: ++S.seq, kind: "meld", seat, m: S.mel.length - 1 };
        if (!S.h[seat].length) endHand(seat);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(action, "layoff")) {
        const m = meldOf(S.mel[action.to].c.concat([action.layoff]));
        S.mel[action.to].c = m.c;
        S.h[seat] = S.h[seat].filter((id) => id !== action.layoff);
        S.last = { seq: ++S.seq, kind: "layoff", seat, m: action.to, card: action.layoff };
        if (!S.h[seat].length) endHand(seat);
        return;
      }

      // discard: ends the turn
      S.h[seat] = S.h[seat].filter((id) => id !== action.discard);
      S.disc.push(action.discard);
      S.took = null;
      S.last = { seq: ++S.seq, kind: "discard", seat, card: action.discard };
      if (!S.h[seat].length) { endHand(seat); return; }
      S.t = (seat + 1) % S.np;
      S.ph = "draw";
      startTurn();
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
      sel = S.ph === "act" && mine() ? sel.filter((id) => S.h[S.t].includes(id)) : [];

      let body;
      if (S.ph === "setup") body = setupHTML();
      else if (S.ph === "deal") body = dealHTML();
      else if (S.ph === "end") body = endHTML();
      else {
        body = '<div class="rm-table">' + pilesHTML(an, L) + meldsHTML(an, L) + "</div>" + handHTML(vs, an, L);
      }

      let status;
      if (S.over) status = S.msg;
      else if (S.ph === "setup") status = nm(S.t) + " picks the number of players";
      else if (S.ph === "deal") status = nm(S.t) + " to deal";
      else if (S.ph === "draw") status = nm(S.t) + " to draw";
      else status = nm(S.t) + " to meld or discard";

      const info = S.ph === "setup" ? "Rummy · 2 to 6 players"
        : "Hand " + S.hn + " · First to " + GOAL + " · Stock " + S.stock.length;
      const html =
        '<section class="rummy" aria-label="Rummy card game" style="--el:' + (an ? el : 0) + 'ms">' +
        '<div class="rm-bar"><p class="rm-info">' + esc(info) + '</p><div class="rm-bar__btns">' +
        '<button type="button" class="rm-iconbtn" data-i="fs" aria-label="Toggle full screen" title="Full screen">⛶</button>' +
        rulesHTML() + "</div></div>" +
        (S.ph === "setup" ? "" : '<div class="rm-seats">' + S.h.map((_, i) => seatHTML(i, an, L)).join("") + "</div>") +
        body +
        '<p class="rm-turn-status" role="status" aria-live="polite">' + esc(status) + "</p></section>";
      return [html, status];
    },

    click(element) {
      const target = element && element.closest ? element.closest("[data-i]") : null;
      if (!target) return;
      const kind = target.dataset.i;
      const root = target.closest(".rummy");

      // Local-only controls work on anyone's turn.
      if (kind === "fs") {
        if (typeof document === "undefined") return;
        if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        return;
      }
      if (kind === "sort") {
        sortMode = sortMode === "suit" ? "rank" : "suit";
        if (root) {
          const hand = root.querySelector(".rm-hand");
          if (hand) {
            const byId = {};
            Array.from(hand.children).forEach((b) => { byId[b.dataset.id] = b; });
            sortCards(Object.keys(byId).map(Number), sortMode).forEach((id) => hand.appendChild(byId[id]));
          }
          target.textContent = "Sort: " + (sortMode === "suit" ? "suit" : "rank");
        }
        return;
      }
      if (!canAct()) return;

      if (kind === "card") {
        if (S.ph !== "act" || S.over) return;
        const id = Number(target.dataset.id);
        if (!S.h[S.t].includes(id)) return;
        const at = sel.indexOf(id);
        if (at >= 0) sel.splice(at, 1); else sel.push(id);
        syncSel(root);
        return;
      }

      let action = null;
      if (kind === "players") action = { players: Number(target.dataset.n) };
      else if (kind === "deal") action = { deal: shuffled(totalFor(S.np)) };
      else if (kind === "stock") action = { draw: "stock" };
      else if (kind === "pile") action = { draw: "discard" };
      else if (kind === "makemeld" && sel.length) action = { meld: sortCards(sel, "rank") };
      else if (kind === "discard" && sel.length === 1) action = { discard: sel[0] };
      else if (kind === "meld" && sel.length === 1) action = { layoff: sel[0], to: Number(target.dataset.m) };

      if (action && game.valid(action)) { sel = []; act(action); }
      else if (kind === "meld" && target.classList) {
        target.classList.add("is-bad");
        setTimeout(() => target.classList.remove("is-bad"), 400);
      }
    },

    bot() {
      if (S.ph === "setup") return { players: 2 };
      if (S.ph === "deal") return { deal: shuffled(totalFor(S.np)) };
      const hand = S.h[S.t];
      if (S.ph === "draw") {
        const top = S.disc[S.disc.length - 1];
        if (top !== undefined && findMeld(hand.concat([top]), top)) return { draw: "discard" };
        return { draw: S.stock.length ? "stock" : "discard" };
      }
      const meld = findMeld(hand);
      if (meld) return { meld };
      for (const id of hand) {
        for (let m = 0; m < S.mel.length; m++) if (canLay(id, m)) return { layoff: id, to: m };
      }
      const options = hand.filter((id) => id !== S.took || hand.length === 1);
      options.sort((a, b) => keepValue(hand, a) - keepValue(hand, b) || points(b) - points(a));
      return { discard: options[0] };
    },
  };

  registerGame(game);
})();
