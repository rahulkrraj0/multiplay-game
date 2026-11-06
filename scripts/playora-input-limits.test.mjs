import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const markup = source("src/playora/markup.html");
const room = source("public/playora/core/room.js");
const net = source("public/playora/core/net.js");
const signaling = source("src/lib/multiplayer/signaling.server.ts");

function getPeerMessageParser() {
  const definition = net.match(/function parsePeerMessage\(data\)\{[\s\S]*?\}/)?.[0];
  assert.ok(definition, "peer-message parser should exist");
  return runInNewContext(`${definition}; parsePeerMessage`);
}

test("user-facing text inputs have explicit length limits", () => {
  assert.match(markup, /id="search"[^>]*maxlength="128"/);
  assert.match(markup, /id="jid"[^>]*maxlength="2048"/);
  assert.match(markup, /id="displayNameInput"[^>]*maxlength="24"/);
  assert.match(markup, /id="ci"[^>]*maxlength="200"/);
  for (const id of ["oi", "ac", "oc", "ar"]) {
    assert.match(markup, new RegExp(`id="${id}" maxlength="65536"`));
  }
});

test("room and manual connection codes are checked before parsing", () => {
  assert.match(room, /rawCode\.length > MAX_ROOM_INPUT_LENGTH/);
  assert.match(net, /value\.length>MAX_MANUAL_CODE_LENGTH/);
  assert.match(net, /reply\.length>MAX_MANUAL_CODE_LENGTH/);
});

test("peer messages reject oversized payloads and chat strings", () => {
  const parsePeerMessage = getPeerMessageParser();
  assert.deepEqual({ ...parsePeerMessage('{"k":"m","m":"hello"}') }, { k: "m", m: "hello" });
  assert.throws(() => parsePeerMessage("x".repeat(262145)), /supported size/);
  assert.throws(() => parsePeerMessage(JSON.stringify({ k: "m", m: "x".repeat(201) })), /200 characters/);
  assert.throws(() => parsePeerMessage(JSON.stringify({ k: "m", m: 1 })), /200 characters/);
});

test("signaling display names use the same 24-character limit as the UI", () => {
  assert.match(signaling, /name: z\.string\(\)\.max\(24\)\.default\(""\)/);
});
