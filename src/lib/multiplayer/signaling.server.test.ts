import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Sql } from "../db.ts";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
const { createSignalingHandler } = await import("./signaling.server.ts");

type Peer = { room: string; peer_id: string; name: string; auth_token_hash?: string | null };

function tokenFor(peerId: string): string {
  return peerId === "peer-1" ? "1".repeat(64) : "2".repeat(64);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function fakeSql({
  peers = [],
  senderSignalCount = 0,
  roomSignalCount = 0,
  pollTooFast = false,
}: {
  peers?: Peer[];
  senderSignalCount?: number;
  roomSignalCount?: number;
  pollTooFast?: boolean;
} = {}) {
  const activePeers = new Map<string, Peer>();
  for (const peer of peers) {
    activePeers.set(`${peer.room}:${peer.peer_id}`, {
      ...peer,
      auth_token_hash: tokenHash(tokenFor(peer.peer_id)),
    });
  }
  let signals = roomSignalCount;
  const query = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    if (/^(CREATE|ALTER)/i.test(text.trim())) return [];

    if (
      text.includes("SELECT peer_id, auth_token_hash FROM webrtc_peers") &&
      text.includes("peer_id IN")
    ) {
      const [room, from, to] = params as string[];
      return [from, to]
        .map((peerId) => activePeers.get(`${room}:${peerId}`))
        .filter((peer): peer is Peer => peer !== undefined)
        .map(({ peer_id, auth_token_hash }) => ({ peer_id, auth_token_hash })) as T[];
    }

    if (text.includes("SELECT peer_id, auth_token_hash FROM webrtc_peers")) {
      const [room, peerId] = params as string[];
      const peer = activePeers.get(`${room}:${peerId}`);
      return peer
        ? ([{ peer_id: peer.peer_id, auth_token_hash: peer.auth_token_hash ?? null }] as T[])
        : [];
    }

    if (text.includes("SELECT peer_id FROM webrtc_peers")) {
      const [room, peerId] = params as string[];
      const peer = activePeers.get(`${room}:${peerId}`);
      return peer ? ([{ peer_id: peer.peer_id }] as T[]) : [];
    }

    if (text.includes("SELECT auth_token_hash FROM webrtc_peers")) {
      const [room, peerId] = params as string[];
      const peer = activePeers.get(`${room}:${peerId}`);
      return peer ? ([{ auth_token_hash: peer.auth_token_hash }] as T[]) : [];
    }

    if (text.includes("count(*)::int AS count FROM webrtc_peers")) {
      const [room] = params as string[];
      return [
        { count: [...activePeers.values()].filter((peer) => peer.room === room).length },
      ] as T[];
    }

    if (text.includes("INSERT INTO webrtc_peers")) {
      if (pollTooFast) return [];
      const [room, peer_id, name, auth_token_hash] = params as string[];
      activePeers.set(`${room}:${peer_id}`, {
        room,
        peer_id,
        name,
        auth_token_hash: auth_token_hash ?? null,
      });
      return [{ peer_id }] as T[];
    }

    if (text.includes("DELETE FROM webrtc_peers") && text.includes("auth_token_hash")) {
      const [room, peer_id, auth_token_hash] = params as string[];
      const key = `${room}:${peer_id}`;
      const peer = activePeers.get(key);
      if (peer?.auth_token_hash !== auth_token_hash) return [];
      activePeers.delete(key);
      return [{ peer_id }] as T[];
    }

    if (/^DELETE FROM/i.test(text.trim())) return [];

    if (text.includes("count(*)::int AS count FROM webrtc_signals")) {
      if (text.includes("from_peer = $2")) return [{ count: senderSignalCount }] as T[];
      return [{ count: signals }] as T[];
    }

    if (text.includes("INSERT INTO webrtc_signals")) {
      signals += 1;
      return [];
    }

    throw new Error(`Unexpected SQL in signaling test: ${text}`);
  };
  const sql = Object.assign(async () => [], { query }) as unknown as Sql;
  return { sql, activePeers };
}

function makeHandler(
  options: Parameters<typeof fakeSql>[0] = {},
  getSql: () => Promise<Sql> = async () => fakeSql(options).sql,
) {
  return createSignalingHandler({ getSql, dbSource: "neon" });
}

function signalRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://gameslord.online/api/rtc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      op: "signal",
      room: "room-1",
      from: "peer-1",
      token: tokenFor("peer-1"),
      to: "peer-2",
      kind: "offer",
      payload: { type: "offer", sdp: "test" },
      ...overrides,
    }),
  });
}

test("rejects oversized signaling bodies before opening the database", async () => {
  let databaseOpened = false;
  const handler = makeHandler({}, async () => {
    databaseOpened = true;
    throw new Error("database must not be used for oversized input");
  });
  const response = await handler(
    new Request("https://gameslord.online/api/rtc", {
      method: "POST",
      headers: { "content-length": String(65 * 1024) },
      body: "{}",
    }),
  );
  assert.equal(response.status, 413);
  assert.equal(databaseOpened, false);
});

test("rejects signal payloads over the per-signal limit", async () => {
  const handler = makeHandler();
  const response = await handler(signalRequest({ payload: { data: "x".repeat(9 * 1024) } }));
  assert.equal(response.status, 400);
});

test("refuses a ninth active attendee in a room", async () => {
  const peers = Array.from({ length: 8 }, (_, index) => ({
    room: "room-1",
    peer_id: `peer-${index}`,
    name: "",
  }));
  const handler = makeHandler({ peers });
  const response = await handler(
    new Request("https://gameslord.online/api/rtc?room=room-1&peer=peer-new", {
      headers: { authorization: `Bearer ${tokenFor("peer-2")}` },
    }),
  );
  assert.equal(response.status, 409);
});

test("throttles signaling polls that arrive too quickly", async () => {
  const handler = makeHandler({
    peers: [{ room: "room-1", peer_id: "peer-1", name: "" }],
    pollTooFast: true,
  });
  const response = await handler(
    new Request("https://gameslord.online/api/rtc?room=room-1&peer=peer-1", {
      headers: { authorization: `Bearer ${tokenFor("peer-1")}` },
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "1");
});

test("refuses to let another client refresh a registered peer identity", async () => {
  const handler = makeHandler({ peers: [{ room: "room-1", peer_id: "peer-1", name: "" }] });
  const response = await handler(
    new Request("https://gameslord.online/api/rtc?room=room-1&peer=peer-1", {
      headers: { authorization: `Bearer ${tokenFor("peer-2")}` },
    }),
  );
  assert.equal(response.status, 403);
});

test("rejects signaling unless both endpoints are active room members", async () => {
  const handler = makeHandler({ peers: [{ room: "room-1", peer_id: "peer-1", name: "" }] });
  const response = await handler(signalRequest());
  assert.equal(response.status, 403);
});

test("rate-limits excessive signals from a room member", async () => {
  const handler = makeHandler({
    peers: [
      { room: "room-1", peer_id: "peer-1", name: "" },
      { room: "room-1", peer_id: "peer-2", name: "" },
    ],
    senderSignalCount: 120,
  });
  const response = await handler(signalRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "1");
});

test("caps the number of recently queued signals per room", async () => {
  const handler = makeHandler({
    peers: [
      { room: "room-1", peer_id: "peer-1", name: "" },
      { room: "room-1", peer_id: "peer-2", name: "" },
    ],
    roomSignalCount: 512,
  });
  const response = await handler(signalRequest());
  assert.equal(response.status, 429);
});

test("relays signaling between active room members", async () => {
  const handler = makeHandler({
    peers: [
      { room: "room-1", peer_id: "peer-1", name: "" },
      { room: "room-1", peer_id: "peer-2", name: "" },
    ],
  });
  const response = await handler(signalRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("removes a peer only when its matching credential is provided", async () => {
  const { sql, activePeers } = fakeSql({
    peers: [{ room: "room-1", peer_id: "peer-1", name: "" }],
  });
  const handler = makeHandler({}, async () => sql);
  const response = await handler(
    new Request("https://gameslord.online/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "leave",
        room: "room-1",
        peer: "peer-1",
        token: tokenFor("peer-2"),
      }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(activePeers.has("room-1:peer-1"), true);
});
