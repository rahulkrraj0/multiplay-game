import assert from "node:assert/strict";
import { test } from "node:test";
import { getIceConfiguration, getMeteredIceConfiguration } from "./ice-config.server.ts";

test("keeps STUN available when TURN credentials are not configured", () => {
  const config = getIceConfiguration({});
  assert.equal(config.turnConfigured, false);
  assert.ok(config.iceServers.some((server) => server.urls?.toString().includes("stun:")));
});

test("adds TURN servers from comma-separated environment settings", () => {
  const config = getIceConfiguration({
    TURN_URLS: "turn:relay.example:3478, turns:relay.example:5349",
    TURN_USERNAME: "ephemeral-user",
    TURN_CREDENTIAL: "ephemeral-password",
  });
  assert.equal(config.turnConfigured, true);
  assert.deepEqual(config.iceServers.at(-1), {
    urls: ["turn:relay.example:3478", "turns:relay.example:5349"],
    username: "ephemeral-user",
    credential: "ephemeral-password",
  });
});

test("rejects invalid TURN URL schemes", () => {
  assert.throws(
    () =>
      getIceConfiguration({
        TURN_URLS: "https://relay.example",
        TURN_USERNAME: "user",
        TURN_CREDENTIAL: "password",
      }),
    /TURN_URLS must contain only turn: or turns: URLs/,
  );
});

test("fetches Metered ICE servers server-side using the Open Relay API key", async () => {
  let requestedUrl = "";
  const config = await getMeteredIceConfiguration(
    {
      METERED_DOMAIN: "onlinerahulg.metered.live",
      METERED_API_KEY: "open-relay-api-key",
    },
    async (input) => {
      requestedUrl = String(input);
      return Response.json([
        {
          urls: ["turn:relay.example:80", "turns:relay.example:443"],
          username: "temporary-user",
          credential: "temporary-credential",
        },
      ]);
    },
  );

  assert.equal(new URL(requestedUrl).hostname, "onlinerahulg.metered.live");
  assert.equal(new URL(requestedUrl).searchParams.get("apiKey"), "open-relay-api-key");
  assert.equal(new URL(requestedUrl).searchParams.has("secretKey"), false);
  assert.equal(config.turnConfigured, true);
  assert.deepEqual(config.iceServers.at(-1), {
    urls: ["turn:relay.example:80", "turns:relay.example:443"],
    username: "temporary-user",
    credential: "temporary-credential",
  });
});

test("reports when Metered rejects the configured Open Relay key", async () => {
  await assert.rejects(
    getMeteredIceConfiguration(
      { METERED_DOMAIN: "onlinerahulg.metered.live", METERED_API_KEY: "invalid-key" },
      async () => new Response(null, { status: 401 }),
    ),
    /Metered rejected the API key/,
  );
});

test("rejects Metered domains outside the provider's app domain", async () => {
  await assert.rejects(
    getMeteredIceConfiguration({
      METERED_DOMAIN: "attacker.example",
      METERED_API_KEY: "open-relay-api-key",
    }),
    /METERED_DOMAIN must be your Metered app domain/,
  );
});
