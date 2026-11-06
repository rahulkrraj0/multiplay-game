# multiplay-game — Docker Desktop deployment

This stack runs the app, PostgreSQL, coturn, and an optional Cloudflare Tunnel
in Docker. PostgreSQL persists in a Docker-managed volume; this setup does not
use Google Drive or create off-site backups.

For the complete Linux server instructions, see
[LINUX_DEPLOYMENT.md](./LINUX_DEPLOYMENT.md).

## Run locally in Docker Desktop

1. Install and start Docker Desktop for Windows.
2. Copy `.env.example` to `.env`. Replace all `replace_...` example values
   with unique random secrets. Keep the PostgreSQL and app-role passwords
   alphanumeric. Sign-in is off by default; set `VITE_AUTH_ENABLED=true` only
   after adding your own `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, and
   `GROK_AUTH_CLIENT_SECRET`.
3. In a terminal opened in this project folder, start the app, database, and
   coturn:

   ```powershell
   docker compose up -d --build
   ```

4. Open [http://localhost:8080](http://localhost:8080). The app and database
   run in Docker Desktop; TURN is configured for local-only testing on this
   computer. PostgreSQL data stays in the `postgres_data` Docker volume and
   survives container rebuilds.

To stop the app and database without deleting stored data:

```powershell
docker compose down
```

## Optional public hosting and TURN

For remote access, use a domain you own and have added to Cloudflare. In
Cloudflare Zero Trust, create a tunnel, set
`CLOUDFLARE_TUNNEL_TOKEN` in `.env`, and add a public hostname such as
`play.your-domain.example` with service `http://app:8080`. Set
`BETTER_AUTH_URL` to that HTTPS address and `VITE_PUBLIC_SITE_URL` to its
origin, then rebuild and start the tunnel:

```powershell
docker compose up -d --build
docker compose --profile public up -d
```

The `cloudflared` container joins the Compose network and connects to the app
at `http://app:8080`; it does not need a host port open. The token is required
when the `public` profile is enabled. It is mounted as a Compose secret rather
than passed as a process argument. Keep it private and do not commit `.env`.

The app and migration job use different PostgreSQL roles. The app role has data
access only; the one-shot migration job uses `POSTGRES_USER`. On an existing
`postgres_data` volume, first start PostgreSQL and run the idempotent role setup
script before deploying the app:

```powershell
docker compose up -d postgres
docker compose exec -T postgres sh /docker-entrypoint-initdb.d/01-create-app-role.sh
docker compose up -d --build
```

New database volumes run this setup automatically.

### Run the tunnel and app on a Linux server

The same Docker Compose files work on a Linux server with Docker Engine and the
Docker Compose plugin:

1. Push this deployment setup to your GitHub repository, then clone the
   repository on the Linux server.
2. Install Docker Engine and the Compose plugin for your distribution. Enable
   Docker at startup with `sudo systemctl enable --now docker`.
3. In the project directory, create `.env` from `.env.example`. Set strong
   random `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` values, plus
   `CLOUDFLARE_TUNNEL_TOKEN` from Cloudflare Zero Trust. Set
   `BETTER_AUTH_URL` and `VITE_PUBLIC_SITE_URL` to your public HTTPS origin.
4. In Cloudflare Zero Trust, configure the tunnel's public hostname with
   service `http://app:8080`.
5. Start the application, database, and tunnel:

   ```sh
   docker compose --profile public up -d --build
   docker compose ps
   ```

Compose starts the containers with `restart: unless-stopped`; after Docker is
enabled at boot, they come back after a server restart. Do not copy the
Windows-hosted `.env` or database volume to the server unless you intend to
reuse those credentials and have separately migrated the database.

For internet users to use TURN, replace the local TURN values in `.env` with a
TURN hostname that resolves directly to the server's public IP (Cloudflare
DNS-only), that public IPv4, a strong shared secret, and URLs such as
`turn:turn.your-domain.example:3478?transport=udp,turn:turn.your-domain.example:3478?transport=tcp`.
Also set `TURN_BIND_IP=0.0.0.0` to publish TURN on the server's network
interfaces. Forward TCP and UDP port `3478`, plus UDP ports `49160-49200`, to
the Docker host and allow them through its firewall. If your ISP uses CGNAT,
self-hosted TURN will not be reachable from the internet. Restart the stack
after changing these settings:

```powershell
docker compose up -d
```

The Compose file pins coturn and cloudflared to versioned images. Review and
update those versions deliberately rather than deploying floating `latest`
tags.

TURN credentials are generated on the server and expire after one hour. The
coturn shared secret must match `TURN_SHARED_SECRET`. Relay access is limited
by coturn quotas and a fixed UDP relay port range.

## Redeploy from `main`

The included `.github/workflows/deploy.yml` runs on every push to `main`. For
it to deploy to a Linux server:

1. Add a **self-hosted Linux x64 GitHub Actions runner** on a dedicated,
   isolated deployment machine. The runner needs Docker access, so treat it as
   production-privileged; do not run it as root.
2. Add the values from `.env` as repository Actions secrets with these exact
   names: `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`,
   `VITE_PUBLIC_SITE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
   `TURN_URLS`, `TURN_HOSTNAME`, `TURN_EXTERNAL_IP`, `TURN_BIND_IP`,
   `TURN_SHARED_SECRET`, and `CLOUDFLARE_TUNNEL_TOKEN`.
   If enabling sign-in, also add `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`,
   and `GROK_AUTH_CLIENT_SECRET`. Set the repository variable
   `VITE_AUTH_ENABLED` to `true`; it defaults to `false`.
3. Configure the GitHub `production` Environment with required reviewers, and
   protect `main` with pull requests, required review, and 2FA for contributors.
   The workflow only deploys `main`, including manual dispatches.
4. Push this deployment setup to the repository's `main` branch. Every later
   push rebuilds the app image and recreates the stack. The PostgreSQL Docker
   volume survives container replacement.

If the Linux server is shut down or the runner is offline, GitHub cannot deploy
until it comes back online. Keep the server and runner available for
deployments.

## Data and networking notes

- Do not put PostgreSQL's live data directory in Google Drive. This stack keeps
  database files in the local Docker volume `postgres_data`; it has no Google
  Drive integration or backup schedule.
- Cloudflare Tunnel exposes the website over HTTPS. TURN media traffic goes
  directly to the DNS-only `turn` address over the forwarded ports; TURN
  cannot run through a normal HTTP Cloudflare Tunnel.
- Add Cloudflare rate-limit rules for `/api/rtc` and `/api/ice` keyed by
  source IP. The app also enforces shared-database limits (300 signaling
  requests and 20 ICE-configuration requests per IP per minute), but edge
  limits protect the database from floods before requests reach the app.
- The game transport is peer-to-peer. Players can see each other's public IP
  unless every participant enables the lobby's TURN-only privacy option; it
  requires a working TURN service and can reduce connection reliability.
- Poker and other games exchange their full state among browsers. They are
  suitable for casual play, not prizes or trusted leaderboards; preventing
  clients from inspecting hidden information requires a server-authoritative
  game implementation.
- The host must stay online. Power loss, network changes, ISP restrictions, or
  a changing public IP can take the site or multiplayer relay offline.
