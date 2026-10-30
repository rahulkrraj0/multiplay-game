import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "ludo.js"), "utf8");

function createLudo({ players = 2, names } = {}) {
  let game;
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
  };
  const window = {
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    removeEventListener() {},
    console,
  };
  const sandbox = {
    document,
    window,
    np: players,
    S: null,
    nm: (seat) => (names || ["Red", "Green", "Yellow", "Blue"])[seat],
    registerGame: (registered) => { game = registered; },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "ludo.js" });
  return {
    game,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

test("Ludo limits its third consecutive six and applies the shown roll unchanged", () => {
  const ludo = createLudo();
  ludo.state = ludo.game.init();
  ludo.game.apply({ houses: 1 });
  ludo.game.apply({ color: 0 });

  assert.equal(ludo.game.rollSides(), 6);
  ludo.state.sixes = 2;
  assert.equal(ludo.game.rollSides(), 5);
  assert.equal(ludo.game.valid({ r: 6 }), false);
  assert.equal(ludo.game.valid({ r: 5 }), true);

  ludo.game.apply({ r: 6 });
  assert.equal(ludo.state.lastDie, 0, "an invalid third six must not be applied");
  ludo.game.apply({ r: 5 });
  assert.equal(ludo.state.lastDie, 5);
});

test("four-player Ludo continues after each finish and ends after third place", () => {
  const ludo = createLudo({ players: 4 });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });

  for (let player = 0; player < 3; player += 1) {
    ludo.state.p.forEach((tokens) => tokens.fill(56));
    ludo.state.p[player][0] = 55;
    ludo.state.t = player;
    assert.equal(ludo.game.valid({ r: 1 }), true);
    ludo.game.apply({ r: 1 });
    ludo.game.apply({ token: 0 });

    assert.deepEqual(Array.from(ludo.state.placements), Array.from({ length: player + 1 }, (_, index) => index));
    if (player < 2) {
      assert.equal(ludo.state.over, 0, "the remaining players continue after first and second place");
      assert.equal(ludo.state.t, player + 1);
      assert.match(ludo.game.draw()[1], new RegExp((player + 1) + (player === 0 ? "st" : "nd") + ":"));
    }
  }

  assert.equal(ludo.state.over, 1);
  assert.equal(ludo.state.win, 0);
  assert.equal(ludo.state.loser, 3);
  assert.match(ludo.state.msg, /Red wins! 1st: Red · 2nd: Green · 3rd: Yellow · Lost: Blue/);
  assert.match(ludo.game.draw()[0], /<li>Lost: Blue<\/li>/);
});

test("three-player Ludo ends after second place and names the remaining player as the loser", () => {
  const ludo = createLudo({ players: 3 });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });

  for (let player = 0; player < 2; player += 1) {
    ludo.state.p.forEach((tokens) => tokens.fill(56));
    ludo.state.p[player][0] = 55;
    ludo.state.t = player;
    ludo.game.apply({ r: 1 });
    ludo.game.apply({ token: 0 });
  }

  assert.equal(ludo.state.over, 1);
  assert.deepEqual(Array.from(ludo.state.placements), [0, 1]);
  assert.equal(ludo.state.loser, 2);
  assert.match(ludo.state.msg, /1st: Red · 2nd: Green · Lost: Yellow/);
});

test("Ludo escapes player names in the placement list", () => {
  const ludo = createLudo({ players: 3, names: ['<img src=x onerror="alert(1)">', "Green", "Yellow"] });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });
  ludo.state.placements = [0];

  const html = ludo.game.draw()[0];
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});

test("Ludo shows each player name inside their colored board area", () => {
  const ludo = createLudo({ players: 4, names: ["Red Player", "Green Player", "Yellow Player", "Blue Player"] });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });

  const html = ludo.game.draw()[0];
  for (const name of ["Red Player", "Green Player", "Yellow Player", "Blue Player"]) {
    assert.match(html, new RegExp('<span class="lui-player-name"[^>]*>' + name + "</span>"));
  }
});

test("Ludo escapes player names displayed on the board", () => {
  const ludo = createLudo({ players: 3, names: ['<img src=x onerror="alert(1)">', "Green", "Yellow"] });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });

  const html = ludo.game.draw()[0];
  assert.match(html, /class="lui-player-name"[^>]*>&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});
