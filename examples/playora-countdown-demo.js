(() => {
  "use strict";

  const game = {
    id: "counter-clash-demo",
    i: "🔟",
    t: "Counter Clash Demo",
    d: "Take one or two counters each turn. The player who takes the last counter wins.",
    max: 2,
    cat: "classic casual",
    tag: "Demo game",
    diff: "Easy",
    art: "art-counter-clash-demo",
    n: ["Red", "Blue"],

    init() {
      return { left: 15, t: 0, over: 0, msg: "" };
    },
    valid(action) {
      return !!action &&
        typeof action === "object" &&
        !Array.isArray(action) &&
        Object.keys(action).length === 1 &&
        (action.take === 1 || action.take === 2) &&
        action.take <= S.left &&
        !S.over;
    },
    apply(action) {
      // Only a rules-based win ends the game; the shared runtime handles disconnects.
      S.left -= action.take;
      if (S.left === 0) {
        S.over = 1;
        S.msg = nm(S.t) + " wins!";
        return;
      }
      S.t = 1 - S.t;
      S.msg = "";
    },
    draw() {
      const isMyTurn = !S.over && canAct();
      const counters = Array.from({ length: S.left }, () => "<span aria-hidden=\"true\">●</span>").join("");
      const buttons = [1, 2].map((take) =>
        '<button type="button" data-i="take" data-take="' + take + '"' +
        (!isMyTurn || take > S.left ? " disabled" : "") +
        '>Take ' + take + "</button>"
      ).join("");
      const html =
        '<section class="counter-clash-demo" aria-label="Counter Clash game">' +
        '<p class="counter-clash-demo__count" aria-live="polite">' + S.left + " counters remain</p>" +
        '<div class="counter-clash-demo__counters" aria-hidden="true">' + counters + "</div>" +
        '<div class="counter-clash-demo__actions">' + buttons + "</div>" +
        "</section>";
      return [html, game.n[S.t] + " to move"];
    },
    click(element) {
      const button = element.closest('[data-i="take"]');
      if (!button || !canAct()) return;
      const action = { take: Number(button.dataset.take) };
      if (game.valid(action)) act(action);
    },
    bot() {
      const winningTake = S.left % 3;
      return { take: winningTake || 1 };
    },
  };

  registerGame(game);
})();
