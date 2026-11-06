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

test("relay-only privacy mode is opt-in and requires working TURN", () => {
  assert.match(net, /iceTransportPolicy:'all'/);
  assert.match(room, /window\.playoraTurnAvailable = config\.turnConfigured === true/);
  assert.match(room, /CFG\.iceTransportPolicy = active \? "relay" : "all"/);
  assert.match(markup, /id="relayModeLobby"/);
  assert.match(markup, /id="relayModeJoin"/);
});

test("security headers include a CSP, HSTS, no-sniff and referrer policy", () => {
  assert.match(headers, /"content-security-policy"/);
  assert.match(headers, /"frame-ancestors 'self'/);
  assert.match(headers, /"strict-transport-security"/);
  assert.match(headers, /"x-content-type-options": "nosniff"/);
  assert.match(headers, /"referrer-policy"/);
});
