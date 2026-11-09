/**
 * WebRTC signaling over the app database (Neon deployed, PGLite in preview).
 * Only rendezvous traffic passes through here — roster + SDP/ICE relay while a
 * mesh forms; game data then flows peer-to-peer. DB-backed so any serverless
 * instance can serve any poll. Mount at /api/rtc.
 */
import { z } from "zod";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { dbSource, getSql, type Sql } from "../db.ts";
import type { PeerRow, RtcPollResponse, SignalRow } from "./p2p";

const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const PEER_TOKEN = z.string().regex(/^[a-f0-9]{64}$/);
const MAX_POST_BODY_BYTES = 64 * 1024;
const MAX_SIGNAL_PAYLOAD_BYTES = 8 * 1024;
const MAX_ACTIVE_PEERS_PER_ROOM = 8;
const MIN_POLL_INTERVAL_SECONDS = 0.3;
const SIGNAL_RATE_WINDOW_SECONDS = 60;
const MAX_SIGNALS_PER_PEER_WINDOW = 120;
const MAX_SIGNALS_PER_ROOM_WINDOW = 512;
const MAX_POLL_URL_LENGTH = 2_048;
const IP_RATE_WINDOW_SECONDS = 60;
const MAX_RTC_REQUESTS_PER_IP_WINDOW = 300;

function payloadWithinLimit(value: unknown): boolean {
  if (value === undefined) return false;
  const serialized = JSON.stringify(value);
  return (
    typeof serialized === "string" &&
    new TextEncoder().encode(serialized).byteLength <= MAX_SIGNAL_PAYLOAD_BYTES
  );
}

const signalSchema = z.object({
  op: z.literal("signal"),
  room: ID,
  from: ID,
  token: PEER_TOKEN,
  to: ID,
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.unknown().refine(payloadWithinLimit, { message: "payload too large" }),
});
const leaveSchema = z.object({
  op: z.literal("leave"),
  room: ID,
  peer: ID,
  token: PEER_TOKEN,
});
const postSchema = z.discriminatedUnion("op", [signalSchema, leaveSchema]);

const PEER_TTL_SECONDS = 300;
const SIGNAL_TTL_SECONDS = 60;
const PRUNE_INTERVAL_MS = 60_000;

const globalRef = globalThis as typeof globalThis & {
  __rtcLastPruneAt__?: number;
  __rtcPrunePromise__?: Promise<void>;
};

async function roster(sql: Sql, room: string): Promise<PeerRow[]> {
  const rows = await sql.query<{ peer_id: string; name: string }>(
    `SELECT peer_id, name FROM webrtc_peers
     WHERE room = $1 AND last_seen > now() - make_interval(secs => $2)
     ORDER BY peer_id LIMIT 8`,
    [room, PEER_TTL_SECONDS],
  );
  return rows.map((r) => ({ id: r.peer_id, name: r.name }));
}

async function touchPeer(
  sql: Sql,
  room: string,
  peer: string,
  name: string,
  tokenHash: string,
): Promise<"joined" | "full" | "too_fast" | "unauthorized"> {
  const existing = await sql.query<{ peer_id: string; auth_token_hash: string | null }>(
    `SELECT peer_id, auth_token_hash FROM webrtc_peers
     WHERE room = $1 AND peer_id = $2
       AND last_seen > now() - make_interval(secs => $3)
     LIMIT 1`,
    [room, peer, PEER_TTL_SECONDS],
  );
  if (existing.length > 0 && existing[0]?.auth_token_hash !== tokenHash) {
    return "unauthorized";
  }
  if (existing.length === 0) {
    const active = await sql.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM webrtc_peers
       WHERE room = $1 AND last_seen > now() - make_interval(secs => $2)`,
      [room, PEER_TTL_SECONDS],
    );
    if ((active[0]?.count ?? 0) >= MAX_ACTIVE_PEERS_PER_ROOM) return "full";
  }

  const touched = await sql.query<{ peer_id: string }>(
    `INSERT INTO webrtc_peers (room, peer_id, name, auth_token_hash, last_seen)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (room, peer_id)
     DO UPDATE SET last_seen = now(), name = EXCLUDED.name,
       auth_token_hash = EXCLUDED.auth_token_hash
       WHERE webrtc_peers.last_seen <= now() - make_interval(secs => $5)
         OR webrtc_peers.auth_token_hash = EXCLUDED.auth_token_hash
     RETURNING peer_id`,
    [room, peer, name, tokenHash, MIN_POLL_INTERVAL_SECONDS],
  );
  if (touched.length > 0) return "joined";

  const current = await sql.query<{ auth_token_hash: string | null }>(
    `SELECT auth_token_hash FROM webrtc_peers
     WHERE room = $1 AND peer_id = $2
       AND last_seen > now() - make_interval(secs => $3)
     LIMIT 1`,
    [room, peer, PEER_TTL_SECONDS],
  );
  if (current.length > 0 && current[0]?.auth_token_hash !== tokenHash) {
    return "unauthorized";
  }
  return "too_fast";
}

function hashPeerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function prune(sql: Sql) {
  await Promise.all([
    sql.query(`DELETE FROM webrtc_signals WHERE created_at < now() - make_interval(secs => $1)`, [
      SIGNAL_TTL_SECONDS,
    ]),
    sql.query(`DELETE FROM webrtc_peers WHERE last_seen < now() - make_interval(secs => $1)`, [
      PEER_TTL_SECONDS,
    ]),
    sql.query(
      `DELETE FROM api_rate_limits
       WHERE window_start < now() - make_interval(secs => $1)`,
      [IP_RATE_WINDOW_SECONDS * 10],
    ),
  ]);
}

function maybePrune(sql: Sql): Promise<void> | undefined {
  if (globalRef.__rtcPrunePromise__) return;

  const now = Date.now();
  if (now - (globalRef.__rtcLastPruneAt__ ?? 0) < PRUNE_INTERVAL_MS) return;

  globalRef.__rtcLastPruneAt__ = now;
  const task = prune(sql);
  globalRef.__rtcPrunePromise__ = task;
  void task.then(
    () => {
      if (globalRef.__rtcPrunePromise__ === task) {
        globalRef.__rtcPrunePromise__ = undefined;
      }
    },
    () => {
      if (globalRef.__rtcPrunePromise__ === task) {
        globalRef.__rtcPrunePromise__ = undefined;
        globalRef.__rtcLastPruneAt__ = Date.now();
      }
    },
  );
  return task;
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export async function enforceRequestRateLimit(
  request: Request,
  scope: string,
  limit: number,
  sqlProvider: () => Promise<Sql> = getSql,
): Promise<Response | null> {
  const forwardedIp = request.headers.get("cf-connecting-ip");
  const ip = forwardedIp?.trim();
  if (!ip || isIP(ip) === 0) {
    if (process.env.NODE_ENV === "production") {
      return json({ error: "client address unavailable" }, 503);
    }
    return null;
  }

  const sql = await sqlProvider();
  const windowStart = Math.floor(Date.now() / IP_RATE_WINDOW_SECONDS) * IP_RATE_WINDOW_SECONDS;
  const key = createHash("sha256").update(ip).digest("hex");
  const rows = await sql.query<{ request_count: number }>(
    `INSERT INTO api_rate_limits (scope, ip_hash, window_start, request_count)
     VALUES ($1, $2, to_timestamp($3), 1)
     ON CONFLICT (scope, ip_hash, window_start)
     DO UPDATE SET request_count = api_rate_limits.request_count + 1
     RETURNING request_count`,
    [scope, key, windowStart],
  );
  const pruneTask = maybePrune(sql);
  if (pruneTask) await pruneTask;

  if ((rows[0]?.request_count ?? 0) > limit) {
    const retryAfter = IP_RATE_WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % IP_RATE_WINDOW_SECONDS);
    return json(
      { error: "request rate limit exceeded" },
      429,
      { "retry-after": String(retryAfter) },
    );
  }
  return null;
}

async function handleGet(
  url: URL,
  token: string | undefined,
  sqlProvider: () => Promise<Sql>,
): Promise<Response> {
  const parsed = z
    .object({
      room: ID,
      peer: ID,
      name: z.string().max(24).default(""),
      since: z.coerce.number().int().min(0).default(0),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      since: url.searchParams.get("since") ?? 0,
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  if (!token || !PEER_TOKEN.safeParse(token).success) {
    return json({ error: "peer authentication required" }, 401);
  }
  const { room, peer, name, since } = parsed.data;

  const sql = await sqlProvider();
  const joinResult = await touchPeer(sql, room, peer, name, hashPeerToken(token));
  if (joinResult === "full") return json({ error: "room full" }, 409);
  if (joinResult === "unauthorized") return json({ error: "invalid peer credentials" }, 403);
  if (joinResult === "too_fast") {
    return json({ error: "polling too quickly" }, 429, { "retry-after": "1" });
  }
  const rows = await sql.query<{
    id: number;
    from_peer: string;
    kind: SignalRow["kind"];
    payload: unknown;
  }>(
    `SELECT id, from_peer, kind, payload FROM webrtc_signals
     WHERE room = $1 AND to_peer = $2 AND id > $3
     ORDER BY id LIMIT 200`,
    [room, peer, since],
  );
  const body: RtcPollResponse = {
    peers: await roster(sql, room),
    signals: rows.map((r) => ({
      id: r.id,
      from: r.from_peer,
      kind: r.kind,
      payload: r.payload,
    })),
  };
  return json(body);
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return { ok: false, response: json({ error: "invalid content length" }, 400) };
    }
    if (Number(contentLength) > MAX_POST_BODY_BYTES) {
      return { ok: false, response: json({ error: "request body too large" }, 413) };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: json({ error: "invalid JSON" }, 400) };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_POST_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, response: json({ error: "request body too large" }, 413) };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: json({ error: "invalid JSON" }, 400) };
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, response: json({ error: "invalid JSON" }, 400) };
  }
}

async function handlePost(request: Request, sqlProvider: () => Promise<Sql>): Promise<Response> {
  const result = await readJsonBody(request);
  if (!result.ok) return result.response;
  const body = result.body;
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  const sql = await sqlProvider();

  if (msg.op === "signal") {
    const peers = await sql.query<{ peer_id: string; auth_token_hash: string | null }>(
      `SELECT peer_id, auth_token_hash FROM webrtc_peers
       WHERE room = $1 AND peer_id IN ($2, $3)
         AND last_seen > now() - make_interval(secs => $4)`,
      [msg.room, msg.from, msg.to, PEER_TTL_SECONDS],
    );
    const sender = peers.find((peer) => peer.peer_id === msg.from);
    const recipient = peers.some((peer) => peer.peer_id === msg.to);
    if (!sender || sender.auth_token_hash !== hashPeerToken(msg.token) || !recipient) {
      return json({ error: "sender and recipient must be active room members" }, 403);
    }

    const senderRate = await sql.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM webrtc_signals
       WHERE room = $1 AND from_peer = $2
         AND created_at > now() - make_interval(secs => $3)`,
      [msg.room, msg.from, SIGNAL_RATE_WINDOW_SECONDS],
    );
    if ((senderRate[0]?.count ?? 0) >= MAX_SIGNALS_PER_PEER_WINDOW) {
      return json({ error: "signal rate limit exceeded" }, 429, { "retry-after": "1" });
    }

    const roomRate = await sql.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM webrtc_signals
       WHERE room = $1 AND created_at > now() - make_interval(secs => $2)`,
      [msg.room, SIGNAL_RATE_WINDOW_SECONDS],
    );
    if ((roomRate[0]?.count ?? 0) >= MAX_SIGNALS_PER_ROOM_WINDOW) {
      return json({ error: "room signaling limit reached" }, 429, { "retry-after": "1" });
    }

    await sql.query(
      `INSERT INTO webrtc_signals (room, to_peer, from_peer, kind, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [msg.room, msg.to, msg.from, msg.kind, JSON.stringify(msg.payload)],
    );
  } else {
    const removed = await sql.query<{ peer_id: string }>(
      `DELETE FROM webrtc_peers
       WHERE room = $1 AND peer_id = $2 AND auth_token_hash = $3
       RETURNING peer_id`,
      [msg.room, msg.peer, hashPeerToken(msg.token)],
    );
    if (removed.length === 0) return json({ error: "invalid peer credentials" }, 403);
  }
  return json({ ok: true });
}

export async function handleSignaling(request: Request): Promise<Response> {
  return handleSignalingWith(request, { getSql, dbSource });
}

export type SignalingDependencies = {
  getSql: () => Promise<Sql>;
  dbSource: typeof dbSource;
};

export function createSignalingHandler(dependencies: SignalingDependencies) {
  return (request: Request) => handleSignalingWith(request, dependencies);
}

async function handleSignalingWith(
  request: Request,
  dependencies: SignalingDependencies,
): Promise<Response> {
  try {
    if (request.method === "GET" && request.url.length > MAX_POLL_URL_LENGTH) {
      return json({ error: "request URL too long" }, 414);
    }
    if (process.env.NODE_ENV === "production" && dependencies.dbSource !== "neon") {
      return json(
        {
          error:
            "Shared matchmaking needs a persistent database. Configure DATABASE_URL in Vercel.",
        },
        503,
      );
    }
    if (request.method === "GET") {
      const rateLimit = await enforceRequestRateLimit(
        request,
        "rtc-get",
        MAX_RTC_REQUESTS_PER_IP_WINDOW,
        dependencies.getSql,
      );
      if (rateLimit) return rateLimit;
      const authorization = request.headers.get("authorization");
      const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
      return await handleGet(new URL(request.url), token, dependencies.getSql);
    }
    if (request.method === "POST") {
      const rateLimit = await enforceRequestRateLimit(
        request,
        "rtc-post",
        MAX_RTC_REQUESTS_PER_IP_WINDOW,
        dependencies.getSql,
      );
      if (rateLimit) return rateLimit;
      return await handlePost(request, dependencies.getSql);
    }
    return json({ error: "method not allowed" }, 405, { allow: "GET, POST" });
  } catch (error) {
    console.error("[rtc] signaling error:", error);
    return json({ error: "signaling failed" }, 500);
  }
}
