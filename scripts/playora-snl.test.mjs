import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "snl.js"), "utf8");

function createSnl({ computer = false, players = 2, names } = {}) {
  let game;
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
  };
  const window = {
    matchMedia: () => ({ matches: true }),
    console,
  };
  const sandbox = {
    document,
    window,
    np: players,
    seat: 0,
    S: null,
    nm: (seat) => (names || ["Player 1", "Player 2", "Player 3", "Player 4"])[seat],
    canAct: () => true,
    isLocalComputerGame: () => computer,
    registerGame: (registered) => { game = registered; },
    __SNL_TEST: true,
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "snl.js" });
  return {
    game,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

test("computer matches always ask the human to choose a shared token count", () => {
  const snl = createSnl({ computer: true });
  snl.state = snl.game.init();

  assert.equal(snl.state.t, 0, "the human owns setup even when turns alternate between games");
  assert.equal(snl.game.bot(), null, "the computer must not choose the token count");
  assert.match(snl.game.draw()[0], /Choose how many tokens each player gets/);

  snl.game.apply({ k: 3 });
  assert.equal(snl.state.p[0].length, 3);
  assert.equal(snl.state.p[1].length, 3);
});

test("Snakes and Ladders disallows a third consecutive six and resets the streak", () => {
  const snl = createSnl();
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });

  for (let roll = 0; roll < 2; roll += 1) {
    assert.equal(snl.game.valid({ r: 6 }), true);
    snl.game.apply({ r: 6 });
    assert.equal(snl.state.t, 0, "a six keeps the same player rolling");
  }
  assert.equal(snl.state.sixes, 2);
  assert.equal(snl.game.valid({ r: 6 }), false);
  for (let roll = 1; roll <= 5; roll += 1) {
    assert.equal(snl.game.valid({ r: roll }), true);
  }

  snl.game.apply({ r: 5 });
  assert.equal(snl.state.t, 1, "a non-six passes the turn");
  assert.equal(snl.state.sixes, 0);
});

test("the settled dice face matches the roll applied to the board", () => {
  const snl = createSnl();
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });
  snl.game.apply({ r: 1 });

  assert.equal(snl.state.p[0][0], 1, "a roll of one enters the token on square one");
  assert.equal(snl.state.die, 1);
  assert.match(snl.game.draw()[0], /class="snl-die" data-v="1" role="img" aria-label="Dice shows 1"/);
});

test("four-player matches continue until third place, then name the loser", () => {
  const snl = createSnl({ players: 4 });
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });
  snl.state.setup = 0;
  snl.state.p = [[99], [99], [99], [99]];

  for (const [rank, player] of [0, 1, 2].entries()) {
    snl.state.t = player;
    assert.equal(snl.game.valid({ r: 1 }), true);
    snl.game.apply({ r: 1 });
    assert.equal(snl.state.placements.length, rank + 1);
    if (rank < 2) {
      assert.equal(snl.state.over, 0, "the game continues before third place is decided");
      assert.equal(snl.state.t, player + 1, "the next unfinished player takes a turn");
      const suffix = rank === 0 ? "st" : "nd";
      assert.match(snl.game.draw()[0], new RegExp((rank + 1) + suffix + " — Player"));
    }
  }

  assert.equal(snl.state.over, 1);
  assert.equal(snl.state.win, 0);
  assert.equal(snl.state.loser, 3);
  assert.equal(snl.state.t, 2, "the final third-place player ends the match");
  assert.deepEqual(Array.from(snl.state.placements), [0, 1, 2]);
  assert.match(snl.state.msg, /1st: Player 1 · 2nd: Player 2 · 3rd: Player 3 · Lost: Player 4/);
  assert.match(snl.game.draw()[0], /Lost — Player 4/);
});

test("three-player Snakes and Ladders ends after second place with one loser", () => {
  const snl = createSnl({ players: 3 });
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });
  snl.state.setup = 0;
  snl.state.p = [[99], [99], [99]];

  for (const player of [0, 1]) {
    snl.state.t = player;
    snl.game.apply({ r: 1 });
    assert.equal(snl.state.placements.length, player + 1);
  }

  assert.equal(snl.state.over, 1);
  assert.equal(snl.state.loser, 2);
  assert.match(snl.state.msg, /1st: Player 1 · 2nd: Player 2 · Lost: Player 3/);
});

test("Snakes and Ladders escapes names in its placement list and board label", () => {
  const snl = createSnl({ players: 3, names: ['<img src=x onerror="alert(1)">', "Player 2", "Player 3"] });
  snl.state = snl.game.init();
  snl.game.apply({ k: 1 });
  snl.state.setup = 0;
  snl.state.placements = [0];
  const html = snl.game.draw()[0];

  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});
