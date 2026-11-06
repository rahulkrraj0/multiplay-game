complete deployment process using /multiplay-game-linex instead of /opt.
Step 1. Clone GitHub repository
Run this on your Debian server:
cd / && \
git clone https://github.com/rahulkrraj0/multiplay-game-linex.git && \
cd /multiplay-game-linex && \
nano .env



Step 2. Configure .env
After editing, save using:
- Ctrl + O
- Enter
- Ctrl + X
Step 3. Build and install dependencies
cd /multiplay-game-linex && \
git pull origin main && \
docker compose --progress=plain build --no-cache


Step 4. Start all containers
cd /multiplay-game-linex && \
docker compose up -d --force-recreate --remove-orphans && \
docker compose ps


Step 5. Monitor installation and logs
cd /multiplay-game-linex && \
docker compose logs -f --tail=100


If the repository folder already exists
Do not clone again. Run this instead:
cd /multiplay-game-linex && \
git pull origin main && \
docker compose --progress=plain build --no-cache && \
docker compose up -d --force-recreate --remove-orphans && \
docker compose ps


Step 6. Verify deployment
docker ps -a
docker images
docker volume ls


Important: This deployment rebuilds all Compose services without cache, installs dependencies declared in the Dockerfiles, and starts the application.

## Signaling load protection

The app limits signaling requests to 64 KiB, individual SDP/ICE payloads to 8 KiB,
rooms to 8 active attendees, and recent signaling traffic to 120 messages per
peer and 512 messages per room per minute. PostgreSQL connections and query time
are bounded as well. These limits reduce accidental or abusive load; they do not
replace edge protection.

Signaling and ICE endpoints also enforce shared-Postgres per-IP rate limits using
Cloudflare's `CF-Connecting-IP`; hashed IP counters expire after ten minutes.
Configure Cloudflare edge rules for `/api/rtc` and `/api/ice` as well, so abusive
requests are blocked before they use database connections. The service expects
Cloudflare to set `CF-Connecting-IP` in production.

## Production access checklist

- Protect `main` with pull requests, required reviews, and 2FA.
- Put deployment behind the `production` GitHub Environment with required
  reviewers. Manual dispatches from branches other than `main` fail.
- Keep the Docker-enabled self-hosted runner isolated, dedicated, and non-root.
- Configure your own OAuth broker credentials before setting
  `VITE_AUTH_ENABLED=true`. Production will not fall back to the shared preview
  OAuth client; auth is off by default in Docker.
- The app container runs as `node`, with all Linux capabilities dropped and
  `no-new-privileges`; database migrations run separately with the owner role.
- Cloudflared and coturn use version-pinned images; the tunnel token is mounted
  as a Compose secret rather than passed as a process argument.
- Coturn blocks loopback, private, link-local, and CGNAT destinations and has
  its CLI disabled.
- For participant IP privacy, enable TURN-only mode on every player; direct
  peer-to-peer connections expose public IPs to other participants.

The app adds security response headers including CSP, HSTS,
`X-Content-Type-Options`, and `Referrer-Policy`. CSP currently permits inline
scripts to preserve existing rendering; migrate to request nonces before
removing that exception.

Game clients exchange complete game state. Hidden poker cards are only hidden
by the UI; do not attach prizes or trusted rankings without moving game logic
and secret state to a server-authoritative implementation.