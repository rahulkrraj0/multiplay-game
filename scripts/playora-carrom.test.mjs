import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "games", "carrom.js"), "utf8");

function createCarrom(players, names = ["Alex", "Blair", "Casey", "Drew"], { online = false, isHost = false } = {}) {
  let game;
  const sandbox = {
    document: { readyState: "loading", addEventListener() {} },
    window: { matchMedia: () => ({ matches: true }) },
    np: players,
    seat: online ? isHost ? 99 : 1 : -1,
    ids: online ? Array.from({ length: players }, (_, player) => "player-" + player) : [],
    S: null,
    nm: (player) => names[player],
    amHost: () => isHost,
    canAct: () => !online,
    act() {},
    registerGame: (registered) => { game = registered; },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "carrom.js" });
  return {
    game,
    get state() { return sandbox.S; },
    set state(value) { sandbox.S = value; },
  };
}

function completeSetup(carrom, mode, style = "individual", partner) {
  carrom.state = carrom.game.init();
  carrom.game.apply({ gameMode: mode });
  if (carrom.state.setup === "style") carrom.game.apply({ playStyle: style });
  if (carrom.state.setup === "partner") carrom.game.apply({ partner });
}

function makeLastCoinShot(carrom, player, coinId) {
  const state = carrom.state;
  state.c.forEach((_, id) => { state.c[id] = [500, 500, 1]; });
  for (let other = 0; other < state.teams.length; other += 1) {
    if (other === player || (state.placements || []).includes(other)) continue;
    const otherCoin = state.owners.findIndex((owner, id) => id > 0 && owner === other);
    state.c[otherCoin] = [500, 500, 0];
  }
  state.c[coinId] = [18, 18, 0];
  state.q = 2;
  state.qw = 0;
  state.t = player;
  const shot = { x: 500, dx: 0, dy: player % 2 ? 1000 : -1000, p: 1 };
  assert.equal(carrom.game.valid(shot), true);
  carrom.game.apply(shot);
}

test("Carrom identifies setup, shot, pocket and foul sound events", () => {
  const carrom = createCarrom(2);
  carrom.state = carrom.game.init();

  assert.deepEqual(Array.from(carrom.game.soundEvents({ gameMode: "clear" }, null, carrom.state)), []);
  assert.deepEqual(Array.from(carrom.game.soundEvents({ x: 500 }, null, { last: { foul: 0, out: [] } })), ["move"]);
  assert.deepEqual(Array.from(carrom.game.soundEvents({ x: 500 }, null, { last: { foul: 0, out: [1] } })), ["capture"]);
  assert.deepEqual(Array.from(carrom.game.soundEvents({ x: 500 }, null, { last: { foul: 1, out: [19] } })), ["foul"]);
});

test("Carrom keeps two-player rules and offers four-player match setup", () => {
  const two = createCarrom(2);
  two.state = two.game.init();
  assert.equal(two.game.max, 4);
  assert.equal(two.state.setup, "");
  assert.equal(two.state.mode, "classic");

  const four = createCarrom(4);
  four.state = four.game.init();
  assert.equal(four.state.setup, "mode");
  assert.match(four.game.draw()[0], /Point Game · 8 boards/);
  assert.equal(four.game.valid({ gameMode: "points" }), true);
  assert.equal(four.game.valid({ gameMode: "invalid" }), false);
});

test("only the online host can use Carrom setup choices", () => {
  const host = createCarrom(4, undefined, { online: true, isHost: true });
  host.state = host.game.init();
  assert.match(host.game.draw()[0], /data-cr-setup=.*Point Game/);
  assert.doesNotMatch(host.game.draw()[0], /data-cr-setup=.*disabled/);

  const guest = createCarrom(4, undefined, { online: true, isHost: false });
  guest.state = guest.game.init();
  assert.match(guest.game.draw()[0], /Waiting for the host to choose/);
  assert.match(guest.game.draw()[0], /disabled/);
});

test("three-player Carrom uses individual play and records ranked clear-game finishes", () => {
  const carrom = createCarrom(3);
  completeSetup(carrom, "clear");
  assert.deepEqual(Array.from(carrom.state.teams), [0, 1, 2]);
  assert.equal(carrom.state.setup, "");

  makeLastCoinShot(carrom, 0, 1);
  assert.deepEqual(Array.from(carrom.state.placements), [0]);
  assert.equal(carrom.state.over, 0);
  assert.equal(carrom.state.t, 1);

  makeLastCoinShot(carrom, 1, 2);
  assert.equal(carrom.state.over, 1);
  assert.deepEqual(Array.from(carrom.state.placements), [0, 1]);
  assert.equal(carrom.state.loser, 2);
  assert.match(carrom.state.msg, /1st: Alex · 2nd: Blair · Lost: Casey/);
});

test("four-player Carrom continues through third place and names the final loser", () => {
  const carrom = createCarrom(4);
  completeSetup(carrom, "clear");

  for (let player = 0; player < 3; player += 1) {
    const coin = carrom.state.owners.findIndex((owner, id) => id > 0 && owner === player);
    makeLastCoinShot(carrom, player, coin);
    assert.deepEqual(Array.from(carrom.state.placements), [0, 1, 2].slice(0, player + 1));
    if (player < 2) {
      assert.equal(carrom.state.over, 0);
      assert.equal(carrom.state.t, player + 1);
    }
  }

  assert.equal(carrom.state.over, 1);
  assert.equal(carrom.state.loser, 3);
  assert.match(carrom.state.msg, /1st: Alex · 2nd: Blair · 3rd: Casey · Lost: Drew/);
});

test("four-player Carrom host can choose a fixed team partner", () => {
  const carrom = createCarrom(4);
  completeSetup(carrom, "points", "team", 2);
  assert.equal(carrom.state.setup, "");
  assert.deepEqual(Array.from(carrom.state.teams), [0, 1, 0, 1]);
  assert.deepEqual(Array.from(carrom.state.scores), [0, 0]);
  assert.equal(carrom.state.owners[1], 0);
  assert.equal(carrom.state.owners[10], 1);

  const pairings = Array.from(carrom.state.teams);
  carrom.state.boards = 1;
  carrom.state.c.forEach((_, id) => { carrom.state.c[id] = [500, 500, 1]; });
  carrom.state.c[1] = [18, 18, 0];
  carrom.state.c[10] = [982, 18, 0];
  carrom.state.q = 2;
  carrom.state.qw = 0;
  carrom.state.t = 0;
  carrom.game.apply({ x: 500, dx: 0, dy: -1000, p: 1 });
  assert.deepEqual(Array.from(carrom.state.teams), pairings);
  assert.equal(carrom.state.boards, 2);
});

test("Carrom shows unboxed player names at the top and bottom of the board", () => {
  const carrom = createCarrom(4);
  completeSetup(carrom, "clear");

  const markup = carrom.game.draw()[0];
  assert.match(markup, /class="cr-player-name top"[^>]*aria-label="Blair · Drew"/);
  assert.match(markup, /class="cr-player-name bottom"[^>]*aria-label="Alex · Casey"/);
  assert.ok(markup.indexOf('class="cr-board"') < markup.indexOf('class="cr-player-name top"'));
  assert.ok(markup.indexOf('class="cr-player-name bottom"') < markup.indexOf('class="cr-hud"'));
  assert.doesNotMatch(markup, /class="cr-player-name"[^>]*style=/);
});

test("Carrom escapes player names rendered on the board", () => {
  const carrom = createCarrom(3, ['<img src=x onerror="alert(1)">', "Blair", "Casey"]);
  completeSetup(carrom, "clear");
  const markup = carrom.game.draw()[0];

  assert.match(markup, /class="cr-player-name bottom"[^>]*aria-label="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; · Casey"/);
  assert.doesNotMatch(markup, /<img src=x/);
});

test("Point Game awards coin values to the shooter and queen points to its coverer", () => {
  const carrom = createCarrom(3);
  completeSetup(carrom, "points");
  const state = carrom.state;
  state.c.forEach((_, id) => { state.c[id] = [500, 500, 1]; });
  state.c[0] = [500, 500, 1];
  state.c[1] = [18, 18, 0];
  state.c[10] = [982, 18, 0];
  state.q = 1;
  state.qw = 0;
  state.t = 0;

  const shot = { x: 500, dx: 0, dy: -1000, p: 1 };
  assert.equal(carrom.game.valid(shot), true);
  carrom.game.apply(shot);
  assert.equal(state.scores[0], 80, "20 white + 10 black + 50 queen points go to the shooter/coverer");
  assert.equal(state.boards, 1);
  assert.equal(state.t, 1, "the next board starts with the next player");
  assert.equal(state.setup, "");
});

test("Point Game ends after eight boards and ranks players by score", () => {
  const carrom = createCarrom(3);
  completeSetup(carrom, "points");
  const state = carrom.state;
  state.boards = 7;
  state.scores = [30, 40, 10];
  state.c.forEach((_, id) => { state.c[id] = [500, 500, 1]; });
  state.c[1] = [18, 18, 0];
  state.c[10] = [982, 18, 0];
  state.c[0][2] = 1;
  state.q = 2;
  state.qw = 0;

  carrom.game.apply({ x: 500, dx: 0, dy: -1000, p: 1 });
  assert.equal(state.over, 1);
  assert.equal(state.boards, 8);
  assert.equal(state.win, 0);
  assert.match(state.msg, /Alex wins the Point Game! 1st: Alex \(60\) · 2nd: Blair \(40\) · 3rd: Casey \(10\)/);
});
