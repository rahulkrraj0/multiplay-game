import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = process.cwd();
const roomSource = readFileSync(join(root, "public", "playora", "core", "room.js"), "utf8");
const networkSource = readFileSync(join(root, "public", "playora", "core", "net.js"), "utf8");

function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\)\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} should be defined`);
  return match[0];
}

function createRejoinContext({ saved, host = false, currentGame = true, hostAvailable = true } = {}) {
  const elements = {};
  const visibleGame = currentGame
    ? { classList: { contains: () => false } }
    : { classList: { contains: () => true } };
  elements.gm = visibleGame;
  const calls = [];
  const room = { code: currentGame ? saved.code : "", rejoinId: null, reconnectInPlace: false, claiming: false, jt: 0 };
  const context = {
    room,
    G: currentGame ? { id: "chess" } : null,
    S: currentGame ? { turn: 1 } : null,
    ids: currentGame ? ["old-player"] : [],
    GAMES: { chess: { t: "Chess" } },
    displayName: "Test Player",
    $: (id) => (elements[id] ||= { hidden: false, value: "", textContent: "", disabled: false }),
    requireDisplayName: () => true,
    readLastRoom: () => saved,
    updateRejoinButton: () => calls.push(["updateRejoinButton"]),
    amHost: () => host,
    claimRoom: () => calls.push(["claimRoom"]),
    joinRoom: (...args) => calls.push(["joinRoom", ...args]),
    window: {
      ensurePlayoraGame: async () => {},
      playoraSetReconnectControls: (busy) => calls.push(["setReconnectControls", busy]),
    },
    openRoom: (game) => calls.push(["openRoom", game]),
    setJoinProgress: (active) => calls.push(["setJoinProgress", active]),
    jmsg: (message) => calls.push(["jmsg", message]),
    roomHostAvailable: async () => hostAvailable,
    lobbyUp: () => calls.push(["lobbyUp"]),
    startRoom: (code) => calls.push(["startRoom", code]),
    show: (screen) => calls.push(["show", screen]),
    Math,
    Number,
    Object,
  };
  return { context: vm.createContext(context), elements, calls, room };
}

const rejoinLastRoom = extractFunction(roomSource, "rejoinLastRoom");
const savedGuest = {
  code: "ABCD",
  host: false,
  game: "chess",
  limit: 2,
  playerId: "0123456789abcdef",
};

test("reconnecting a guest stays in the active game and restores the saved player identity", async () => {
  const { context, elements, calls, room } = createRejoinContext({ saved: savedGuest });

  await vm.runInContext(`${rejoinLastRoom}; rejoinLastRoom()`, context);

  assert.deepEqual(calls, [
    ["setReconnectControls", true],
    ["joinRoom", "ABCD", true],
  ]);
  assert.equal(room.rejoinId, savedGuest.playerId);
  assert.equal(room.reconnectInPlace, true);
  assert.match(elements.lg.textContent, /Your game will stay open/);
  assert.ok(!calls.some(([name]) => name === "openRoom"));

  await vm.runInContext(`${rejoinLastRoom}; rejoinLastRoom()`, context);
  assert.equal(calls.filter(([name]) => name === "joinRoom").length, 1);
});

test("a host reconnect retries its room without replacing the active game screen", async () => {
  const { context, elements, calls, room } = createRejoinContext({ saved: savedGuest, host: true });

  await vm.runInContext(`${rejoinLastRoom}; rejoinLastRoom()`, context);

  assert.deepEqual(calls, [
    ["setReconnectControls", true],
    ["claimRoom"],
  ]);
  assert.equal(room.reconnectInPlace, true);
  assert.match(elements.lg.textContent, /Your game will stay open/);
  assert.ok(!calls.some(([name]) => name === "openRoom"));
});

test("a saved guest room can still be joined from outside an active game", async () => {
  const { context, calls } = createRejoinContext({ saved: savedGuest, currentGame: false });

  await vm.runInContext(`${rejoinLastRoom}; rejoinLastRoom()`, context);

  assert.deepEqual(calls, [
    ["openRoom", "join"],
    ["joinRoom", "ABCD"],
  ]);
});

test("an unavailable saved host room reopens the lobby with the same room code", async () => {
  const savedHost = { ...savedGuest, host: true };
  const { context, calls } = createRejoinContext({
    saved: savedHost,
    currentGame: false,
    hostAvailable: false,
  });

  await vm.runInContext(`${rejoinLastRoom}; rejoinLastRoom()`, context);

  assert.ok(calls.some(([name, value]) => name === "startRoom" && value === "ABCD"));
  assert.ok(calls.some(([name, value]) => name === "show" && value === "lobby"));
});

test("there is no navigation when the browser has no saved room", async () => {
  const { context, calls } = createRejoinContext({ saved: null, currentGame: false });

  await vm.runInContext(`${rejoinLastRoom}; rejoinLastRoom()`, context);

  assert.deepEqual(calls, [["updateRejoinButton"]]);
});

test("a failed in-place reconnect preserves the room and current game for a later retry", () => {
  const jfail = extractFunction(roomSource, "jfail");
  const elements = {
    jgo: { disabled: true },
    jid: { disabled: true },
    lg: { textContent: "" },
  };
  const calls = [];
  const room = { code: "ABCD", jt: 42, rejoinId: "0123456789abcdef", reconnectInPlace: true, jws: null, jc: null };
  const context = vm.createContext({
    room,
    cs: [],
    clearTimeout: () => {},
    sigClose: () => {},
    $: (id) => elements[id],
    jmsg: (...args) => calls.push(["jmsg", ...args]),
    window: { playoraSetReconnectControls: (busy) => calls.push(["setReconnectControls", busy]) },
    updateGameControls: () => calls.push(["updateGameControls"]),
  });

  vm.runInContext(`${jfail}; jfail("network error")`, context);

  assert.equal(room.code, "ABCD");
  assert.equal(room.rejoinId, null);
  assert.equal(room.reconnectInPlace, false);
  assert.equal(room.jt, 0);
  assert.match(elements.lg.textContent, /Your game is still here/);
  assert.ok(calls.some(([name, busy]) => name === "setReconnectControls" && busy === false));
});

test("a failed ordinary join still clears the failed room attempt", () => {
  const jfail = extractFunction(roomSource, "jfail");
  const elements = {
    jgo: { disabled: true },
    jid: { disabled: true },
  };
  const messages = [];
  const room = { code: "ABCD", jt: 42, rejoinId: null, reconnectInPlace: false, jws: null, jc: null };
  const context = vm.createContext({
    room,
    cs: [],
    clearTimeout: () => {},
    sigClose: () => {},
    $: (id) => elements[id],
    jmsg: (...args) => messages.push(args),
    setReconnectControls: () => {},
    updateGameControls: () => {},
  });

  vm.runInContext(`${jfail}; jfail("That room is full.")`, context);

  assert.equal(room.code, "");
  assert.deepEqual(messages[0], ["That room is full.", 1]);
});

test("reconnecting a saved host outside a game keeps the original join-or-reopen behavior", async () => {
  const savedHost = { ...savedGuest, host: true };
  const { context, calls } = createRejoinContext({
    saved: savedHost,
    currentGame: false,
    hostAvailable: true,
  });

  await vm.runInContext(`${rejoinLastRoom}; rejoinLastRoom()`, context);

  assert.ok(calls.some(([name, value]) => name === "joinRoom" && value === "ABCD"));
  assert.ok(!calls.some(([name]) => name === "startRoom"));
});

test("a host reconnect shows success without leaving the active game", async () => {
  const claimRoom = extractFunction(roomSource, "claimRoom");
  const room = { code: "ABCD", ws: null, claiming: false, reconnectInPlace: true };
  const elements = { lg: { textContent: "" } };
  const calls = [];
  const context = vm.createContext({
    room,
    amHost: () => true,
    hostId: (code) => `h${code}`,
    rtcKey: (code) => `g${code}`,
    hostMsg: () => {},
    sigOpen: async (id, onMessage, key) => {
      calls.push(["sigOpen", id, key]);
      return { id: "host-room" };
    },
    sigClose: () => calls.push(["sigClose"]),
    watch: () => calls.push(["watch"]),
    lobbyUp: () => calls.push(["lobbyUp"]),
    roomUI: (...args) => calls.push(["roomUI", ...args]),
    window: { playoraSetReconnectControls: (busy) => calls.push(["setReconnectControls", busy]) },
    updateGameControls: () => calls.push(["updateGameControls"]),
    setTimeout: () => 1,
    $: (id) => elements[id],
  });

  await vm.runInContext(`${claimRoom}; claimRoom()`, context);

  assert.equal(room.ws.id, "host-room");
  assert.equal(room.reconnectInPlace, false);
  assert.match(elements.lg.textContent, /Connection restored/);
  assert.ok(calls.some(([name]) => name === "watch"));
  assert.ok(calls.some(([name, busy]) => name === "setReconnectControls" && busy === false));
});

test("a failed host reconnect leaves the game open and makes retry available", async () => {
  const claimRoom = extractFunction(roomSource, "claimRoom");
  const room = { code: "ABCD", ws: null, claiming: false, reconnectInPlace: true };
  const elements = { lg: { textContent: "" } };
  const calls = [];
  const context = vm.createContext({
    room,
    amHost: () => true,
    hostId: (code) => `h${code}`,
    rtcKey: (code) => `g${code}`,
    sigOpen: async () => {
      throw new Error("offline");
    },
    setTimeout: (callback) => {
      callback();
      return 1;
    },
    window: { playoraSetReconnectControls: (busy) => calls.push(["setReconnectControls", busy]) },
    updateGameControls: () => calls.push(["updateGameControls"]),
    $: (id) => elements[id],
  });

  await vm.runInContext(`${claimRoom}; claimRoom()`, context);

  assert.equal(room.ws, null);
  assert.equal(room.claiming, false);
  assert.equal(room.reconnectInPlace, false);
  assert.match(elements.lg.textContent, /Your game is still here/);
  assert.ok(calls.some(([name, busy]) => name === "setReconnectControls" && busy === false));
});

test("simultaneous host reconnect requests share one in-flight claim", async () => {
  const claimRoom = extractFunction(roomSource, "claimRoom");
  const room = { code: "ABCD", ws: null, claiming: false, claimingCode: "", reconnectInPlace: false };
  let resolveSignal;
  const signal = new Promise((resolve) => {
    resolveSignal = resolve;
  });
  let attempts = 0;
  const context = vm.createContext({
    room,
    amHost: () => true,
    hostId: (code) => `h${code}`,
    rtcKey: (code) => `g${code}`,
    hostMsg: () => {},
    sigOpen: () => {
      attempts++;
      return signal;
    },
    sigClose: () => {},
    watch: () => {},
    lobbyUp: () => {},
    roomUI: () => {},
    window: { playoraSetReconnectControls: () => {} },
    updateGameControls: () => {},
    $: () => ({ textContent: "" }),
  });

  const first = vm.runInContext(`${claimRoom}; claimRoom()`, context);
  await vm.runInContext(`${claimRoom}; claimRoom()`, context);
  assert.equal(attempts, 1);
  resolveSignal({});
  await first;
  assert.equal(room.claiming, false);
});

test("rejoining restores the disconnected seat and confirms the player's return", () => {
  assert.match(networkSource, /const oldIndex=activePlayerKeys\.indexOf\(m\.old\)/);
  assert.match(networkSource, /dead\.delete\(index\)/);
  assert.match(networkSource, /room\.reconnectInPlace=false;\$\('lg'\)\.textContent='You’re back in the game\.'/);
});
