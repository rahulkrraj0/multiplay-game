import { createHmac } from "node:crypto";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
];

const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60;

export interface IceConfiguration {
  iceServers: RTCIceServer[];
  turnConfigured: boolean;
}

function parseIceServer(value: unknown): RTCIceServer | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const urls = item.urls;
  if (
    typeof urls !== "string" &&
    !(Array.isArray(urls) && urls.every((url: unknown) => typeof url === "string"))
  ) {
    return null;
  }

  return {
    urls,
    ...(typeof item.username === "string" ? { username: item.username } : {}),
    ...(typeof item.credential === "string" ? { credential: item.credential } : {}),
  };
}

export function getIceConfiguration(env: Record<string, string | undefined>): IceConfiguration {
  const urls = (env.TURN_URLS ?? env.TURN_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const sharedSecret = env.TURN_SHARED_SECRET?.trim();
  const username = env.TURN_USERNAME?.trim();
  const credential = env.TURN_CREDENTIAL?.trim();

  if (urls.length === 0) {
    return { iceServers: DEFAULT_ICE_SERVERS, turnConfigured: false };
  }

  if (urls.some((url) => !/^turns?:/i.test(url))) {
    throw new Error("TURN_URLS must contain only turn: or turns: URLs.");
  }

  if (sharedSecret) {
    const turnUsername = `${Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS}:multiplay-game`;
    const turnCredential = createHmac("sha1", sharedSecret).update(turnUsername).digest("base64");
    return {
      iceServers: [
        ...DEFAULT_ICE_SERVERS,
        { urls, username: turnUsername, credential: turnCredential },
      ],
      turnConfigured: true,
    };
  }

  if (!username || !credential) {
    return { iceServers: DEFAULT_ICE_SERVERS, turnConfigured: false };
  }

  return {
    iceServers: [...DEFAULT_ICE_SERVERS, { urls, username, credential }],
    turnConfigured: true,
  };
}

export async function getMeteredIceConfiguration(
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<IceConfiguration> {
  const apiKey = env.METERED_API_KEY?.trim() || env.METERED_SECRET_KEY?.trim();
  if (!apiKey) return getIceConfiguration(env);

  const domain = (env.METERED_DOMAIN || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+\.metered\.live$/.test(domain)) {
    throw new Error("METERED_DOMAIN must be your Metered app domain ending in .metered.live.");
  }

  const endpoint = new URL(`https://${domain}/api/v1/turn/credentials`);
  endpoint.searchParams.set("apiKey", apiKey);
  let response: Response;
  try {
    response = await fetcher(endpoint, { cache: "no-store" });
  } catch {
    throw new Error("Could not reach Metered. Check the Metered domain and Vercel settings.");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Metered rejected the API key. Check that METERED_API_KEY is the Open Relay API key for METERED_DOMAIN in Vercel.",
      );
    }
    throw new Error(`Metered credential request failed (${response.status}).`);
  }

  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error("Metered returned an invalid ICE server list.");

  const turnServers = result
    .map(parseIceServer)
    .filter((server): server is RTCIceServer => server !== null);
  if (
    turnServers.length === 0 ||
    !turnServers.some((server) => {
      const urls = typeof server.urls === "string" ? [server.urls] : (server.urls ?? []);
      return urls.some((url) => /^turns?:/i.test(url));
    })
  ) {
    throw new Error("Metered returned no usable TURN servers.");
  }

  return { iceServers: [...DEFAULT_ICE_SERVERS, ...turnServers], turnConfigured: true };
}
