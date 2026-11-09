import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const room = read("public/playora/core/room.js");
const net = read("public/playora/core/net.js");
const markup = read("src/playora/markup.html");
const headers = read("server/middleware/security-headers.ts");

test("new rooms use ten characters from the 32-symbol alphabet", () => {
  assert.match(room, /getRandomValues\(new Uint8Array\(10\)\)/);
});

test("host approval happens before a new peer connection offer", () => {
  assert.match(room, /window\.confirm\("A player wants to join your lobby/);
  assert.match(room, /if \(window\.confirm\([\s\S]*?void admit\(m\.src\);/);
  assert.match(room, /k: "rejected"/);
  assert.match(room, /p\.k === "rejected"/);
  assert.match(room, /p\.k === "failed"/);
  assert.match(room, /Could not prepare the approved player's connection/);
});

test("online connections use TURN relay candidates only", () => {
  assert.match(net, /iceTransportPolicy:'relay'/);
  assert.match(room, /CFG\.iceServers = config\.iceServers/);
  assert.doesNotMatch(room, /setRelayOnly|relayModeLobby|relayModeJoin/);
  assert.doesNotMatch(markup, /relayModeLobby|relayModeJoin|Hide your public IP/);
  assert.match(room, /connection services may be busy because many players are active/);
  assert.match(room, /Please try again in a little while/);
});

test("security headers include a CSP, HSTS, no-sniff and referrer policy", () => {
  assert.match(headers, /"content-security-policy"/);
  assert.match(headers, /"frame-ancestors 'self'/);
  assert.match(headers, /"strict-transport-security"/);
  assert.match(headers, /"x-content-type-options": "nosniff"/);
  assert.match(headers, /"referrer-policy"/);
});
