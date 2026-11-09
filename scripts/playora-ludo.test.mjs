import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "ludo.js"), "utf8");

function createLudo({
  players = 2,
  names,
  playerIds = [],
  rotation = null,
  seat = 99,
  orientationColor = null,
} = {}) {
  let game;
  const actions = [];
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
  };
  const window = {
    localStorage: {
      getItem: (key) => key === "ludo-board-rotation" ? (rotation == null ? null : String(rotation)) :
        key === "ludo-board-player-color" ? orientationColor : null,
      setItem() {},
    },
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    removeEventListener() {},
    console,
  };
  const sandbox = {
    document,
    window,
    np: players,
    ids: playerIds,
    gamePlayerNames: names || [],
    seat,
    S: null,
    nm: (seat) => (names || ["Red", "Green", "Yellow", "Blue"])[seat],
    act: (action) => actions.push(action),
    registerGame: (registered) => { game = registered; },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "ludo.js" });
  return {
    game,
    actions,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

test("Ludo fills selected online seats beyond the connected players with computer turns", () => {
  const names = ["Host", "Guest", "Computer 1", "Computer 2"];
  const ludo = createLudo({ players: 4, playerIds: ["host", "guest"], names });
  const state = ludo.game.init();
  ludo.state = state;

  assert.equal(state.p.length, 4);
  assert.equal(ludo.game.minPlayers, 2);
  assert.equal(ludo.game.maxPlayers, 4);

  ludo.game.apply({ color: 0 });
  assert.equal(state.setup, 0);
  ludo.game.draw();
  assert.deepEqual(Array.from(ludo.game.n), names);

  for (const botSeat of [2, 3]) {
    state.t = botSeat;
    state.die = 0;
    const roll = ludo.game.bot();
    assert.ok(roll && Number.isInteger(roll.r), `computer seat ${botSeat} should roll`);
    assert.equal(ludo.game.valid(roll), true);
    ludo.game.apply(roll);
    const moves = ludo.game.bot();
    if (moves && moves.token !== undefined) {
      assert.equal(ludo.game.valid(moves), true, `computer seat ${botSeat} should make a legal move`);
    }
  }
});

test("Ludo rotation control tracks the board center", () => {
  assert.match(source, /\.lui-rot\{position:fixed;left:var\(--lui-center-x,50vw\);top:var\(--lui-center-y,50vh\)/);
  assert.match(source, /rect\.left \+ rect\.width \/ 2/);
  assert.match(source, /rect\.top \+ rect\.height \/ 2/);
  assert.match(source, /room\.addEventListener\("scroll", syncRotBtnPosition/);
});

test("Ludo identifies roll, token entry, capture and home sound events", () => {
  const { game } = createLudo();
  assert.equal(game.soundEvent({ r: 6 }), "roll");
  assert.equal(game.soundEvent({ houses: 1 }), "menu");
  assert.equal(game.soundEvent({ token: 0 }, { p: [[-1], [0]] }, { lastMove: { player: 0, to: 0 }, p: [[0], [0]] }), "token-enter");
  assert.equal(game.soundEvent({ token: 0 }, { p: [[1], [2]] }, { lastMove: { player: 0, to: 56 }, p: [[56], [2]] }), "home");
  assert.equal(game.soundEvent({ token: 0 }, { p: [[1], [2]] }, { lastMove: { player: 0, to: 3 }, p: [[3], [-1]] }), "capture");
  assert.equal(game.soundEvent({ token: 0 }, { p: [[1], [2]] }, { lastMove: { player: 0, to: 3 }, p: [[3], [2]] }), "move");
});

test("Ludo asks for colors on first start, then rotates them on restart", () => {
  const ludo = createLudo({ players: 2 });
  ludo.state = ludo.game.init();
  assert.equal(ludo.state.setup, 1);
  ludo.game.apply({ houses: 1 });
  ludo.game.apply({ color: 0 });

  ludo.state = ludo.game.init(ludo.state);
  assert.equal(ludo.state.setup, 0);
  assert.deepEqual(Array.from(ludo.state.cols, (colors) => Array.from(colors)), [[1], [3]]);

  ludo.state = ludo.game.init(ludo.state);
  assert.deepEqual(Array.from(ludo.state.cols, (colors) => Array.from(colors)), [[2], [0]]);
});

test("Ludo alternates two-house color pairs on restart", () => {
  const ludo = createLudo({ players: 2 });
  ludo.state = ludo.game.init();
  ludo.game.apply({ houses: 2 });
  ludo.game.apply({ color: 0 });

  ludo.state = ludo.game.init(ludo.state);
  assert.deepEqual(Array.from(ludo.state.cols, (colors) => Array.from(colors)), [[1, 3], [0, 2]]);
  assert.equal(ludo.state.h, 2);
  assert.equal(ludo.state.p[0].length, 8);
});

test("Ludo rotates all player colors clockwise on restart", () => {
  const ludo = createLudo({ players: 4 });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 2 });

  ludo.state = ludo.game.init(ludo.state);
  assert.deepEqual(Array.from(ludo.state.cols, (colors) => Array.from(colors)), [[3], [0], [1], [2]]);
});

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

test("Ludo prevents two-house teammates from sharing any track square", () => {
  const ludo = createLudo();
  ludo.state = ludo.game.init();
  ludo.game.apply({ houses: 2 });
  ludo.game.apply({ color: 0 });

  ludo.state.p[0][0] = 8;  // Red token on the star at track index 8.
  ludo.state.p[0][4] = 39; // Yellow teammate on the destination star at index 13.
  ludo.state.die = 5;

  assert.equal(ludo.game.valid({ token: 0 }), false,
    "a teammate's other-color token blocks a move onto a safe square");
});

test("Ludo still allows same-color stacks on safe squares in one-house mode", () => {
  const ludo = createLudo();
  ludo.state = ludo.game.init();
  ludo.game.apply({ houses: 1 });
  ludo.game.apply({ color: 0 });

  ludo.state.p[0][0] = 8;
  ludo.state.p[0][1] = 13;
  ludo.state.die = 5;

  assert.equal(ludo.game.valid({ token: 0 }), true);
});

test("Ludo keeps crowded safe-square tokens visible and selectable", () => {
  const ludo = createLudo({ players: 4 });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });

  // All four houses meet at one star; a five-space move lands on the next star.
  const sharedStarPositions = [8, 47, 34, 21];
  ludo.state.p.forEach((tokens, player) => tokens.fill(sharedStarPositions[player]));
  ludo.state.die = 5;

  const html = ludo.game.draw()[0];
  assert.match(html, /class="lui-stack-trigger"[^>]*aria-label="Choose from 16 tokens; 4 can move">\+16/);
  assert.equal((html.match(/data-i="token" data-token="\d" data-player="0"/g) || []).length, 8,
    "the four highlighted moves are listed in the chooser as well as on the board");
});

test("Ludo crowded-stack picker opens and submits the selected move", () => {
  const ludo = createLudo({ players: 4 });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });
  ludo.state.p.forEach((tokens, player) => tokens.fill([8, 47, 34, 21][player]));
  ludo.state.die = 5;

  const attrs = { "aria-expanded": "false" };
  let focused = false;
  const picker = { hidden: true, querySelector: () => ({ focus: () => { focused = true; } }) };
  const trigger = {
    parentNode: { querySelector: () => picker },
    getAttribute: (name) => attrs[name],
    setAttribute: (name, value) => { attrs[name] = value; },
  };
  ludo.game.click({ closest: (selector) => selector === "[data-i=stack]" ? trigger : null });

  assert.equal(picker.hidden, false);
  assert.equal(attrs["aria-expanded"], "true");
  assert.equal(focused, true, "opening the picker focuses its first token choice");

  const choice = {
    dataset: { player: "0", token: "2" },
    closest(selector) { return selector === "[data-token]" ? this : null; },
  };
  ludo.game.click(choice);
  assert.equal(ludo.actions.length, 1);
  assert.equal(ludo.actions[0].token, 2);
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
    assert.match(html, new RegExp('<span class="lui-player-name-badge"[^>]*>' + name + "</span>"));
  }
  assert.match(html, /left:2%;top:2%;transform:;/);
  assert.match(html, /left:98%;top:2%;transform:translateX\(-100%\);/);
  assert.match(html, /left:98%;top:98%;transform:translate\(-100%,-100%\);/);
  assert.match(html, /left:2%;top:98%;transform:translateY\(-100%\);/);
  assert.equal((html.match(/class="lui-player-name-anchor"/g) || []).length, 4,
    "each player's name is anchored at its house's outer corner");
  assert.equal((source.match(/rotate:var\(--lui-unrot,0deg\)/g) || []).length, 5,
    "the name badges and other board labels counter-rotate so their text stays upright");
});

test("Ludo moves player names to their nearest screen corner for every board rotation", () => {
  const expectedCorners = [
    ["left:2%;top:2%;transform:;", "left:98%;top:2%;transform:translateX(-100%);",
      "left:98%;top:98%;transform:translate(-100%,-100%);", "left:2%;top:98%;transform:translateY(-100%);"],
    ["left:98%;top:2%;transform:translateX(-100%);", "left:98%;top:98%;transform:translate(-100%,-100%);",
      "left:2%;top:98%;transform:translateY(-100%);", "left:2%;top:2%;transform:;"],
    ["left:98%;top:98%;transform:translate(-100%,-100%);", "left:2%;top:98%;transform:translateY(-100%);",
      "left:2%;top:2%;transform:;", "left:98%;top:2%;transform:translateX(-100%);"],
    ["left:2%;top:98%;transform:translateY(-100%);", "left:2%;top:2%;transform:;",
      "left:98%;top:2%;transform:translateX(-100%);", "left:98%;top:98%;transform:translate(-100%,-100%);"],
  ];
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const ludo = createLudo({ players: 4, rotation });
    ludo.state = ludo.game.init();
    ludo.game.apply({ color: 0 });

    const html = ludo.game.draw()[0];
    for (const corner of expectedCorners[rotation]) assert.ok(html.includes(corner), `${corner} at rotation ${rotation}`);
    assert.equal((html.match(/data-house-color="/g) || []).length, 4);
  }
  assert.match(source, /function positionPlayerNames\(grid\)/);
  assert.match(source, /corners\[\(color \+ rotQ\) % 4\]/);
  assert.match(source, /\.lui-player-names\{rotate:var\(--lui-unrot,0deg\)/);
  assert.match(source, /transition:left \.35s ease,top \.35s ease,transform \.35s ease/);
  assert.match(source, /max-width:46%;pointer-events:none/);
  assert.match(source, /text-overflow:ellipsis;white-space:nowrap/);
});

test("Ludo defaults each online player's own house to the bottom-left corner", () => {
  const colors = ["red", "green", "yellow", "blue"];
  for (let playerSeat = 0; playerSeat < colors.length; playerSeat += 1) {
    const ludo = createLudo({ players: 4, seat: playerSeat });
    ludo.state = ludo.game.init();
    ludo.game.apply({ color: 0 });

    const html = ludo.game.draw()[0];
    const ownNameAnchor = html.match(new RegExp(`<span class="lui-player-name-anchor" data-house-color="${colors[playerSeat]}" style="([^"]+)"`));
    assert.ok(ownNameAnchor, `seat ${playerSeat} should have a ${colors[playerSeat]} house`);
    assert.equal(ownNameAnchor[1], "left:2%;top:98%;transform:translateY(-100%);",
      `${colors[playerSeat]} should appear at the viewer's bottom-left`);
  }
});

test("Ludo escapes player names displayed on the board", () => {
  const ludo = createLudo({ players: 3, names: ['<img src=x onerror="alert(1)">', "Green", "Yellow"] });
  ludo.state = ludo.game.init();
  ludo.game.apply({ color: 0 });

  const html = ludo.game.draw()[0];
  assert.match(html, /class="lui-player-name-badge"[^>]*title="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;" aria-label="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;">&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});
