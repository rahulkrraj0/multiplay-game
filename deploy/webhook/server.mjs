import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { execFile } from "node:child_process";

const secret = process.env.WEBHOOK_SECRET ?? "";
const repoDir = process.env.REPO_DIR ?? "";
const branch = process.env.WATCH_BRANCH ?? "main";
const port = Number(process.env.PORT ?? 8787);

if (!secret || !repoDir) {
  console.error("[redeploy] WEBHOOK_SECRET and REPO_DIR are required");
  process.exit(1);
}

let running = false;
let again = false;

/**
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: 20 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const text = `${stdout ?? ""}${stderr ?? ""}`.trim();
        if (text) console.log(text);
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * @param {Buffer} raw
 * @param {string} header
 */
function verify(raw, header) {
  if (!header) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`,
  );
  const got = Buffer.from(header);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

async function redeploy() {
  const compose = `${repoDir}/deploy/docker-compose.yml`;
  await exec("git", ["config", "--global", "--add", "safe.directory", repoDir]);
  await exec("git", ["-C", repoDir, "fetch", "origin", branch]);
  await exec("git", ["-C", repoDir, "reset", "--hard", `origin/${branch}`]);
  // Rebuild the game only. Rebuilding this hook from inside itself would
  // kill the job mid-flight. Postgres, TURN, the tunnel, and Drive keeper stay up.
  await exec("docker", [
    "compose",
    "-f",
    compose,
    "up",
    "-d",
    "--build",
    "--no-deps",
    "playora",
  ]);
  console.log("[redeploy] playora replaced from origin/" + branch);
}

function loop() {
  if (running) return;
  running = true;
  (async () => {
    try {
      do {
        again = false;
        await redeploy();
      } while (again);
    } catch (err) {
      console.error("[redeploy] failed", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  })();
}

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, running, branch }));
    return;
  }

  if (req.method !== "POST" || path !== "/hooks/github") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 2_000_000) {
      res.writeHead(413);
      res.end("too large");
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (res.writableEnded) return;
    const raw = Buffer.concat(chunks);
    const sig = req.headers["x-hub-signature-256"];
    if (!verify(raw, typeof sig === "string" ? sig : "")) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("bad signature");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("bad json");
      return;
    }

    const event = req.headers["x-github-event"];
    if (event === "ping") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("pong");
      return;
    }

    const wanted = `refs/heads/${branch}`;
    if (event !== "push" || payload.ref !== wanted) {
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ ignored: true, ref: payload.ref ?? null }));
      return;
    }

    const coalesced = running;
    if (running) again = true;
    else loop();

    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, coalesced, ref: payload.after ?? null }));
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[redeploy] listening on ${port} for refs/heads/${branch}`);
});
