# multiplay-game — Docker Desktop deployment

This stack runs the app, PostgreSQL, coturn, and an optional Cloudflare Tunnel
in Docker. PostgreSQL persists in a Docker-managed volume; this setup does not
use Google Drive or create off-site backups.

For the complete Linux server instructions, see
[LINUX_DEPLOYMENT.md](./LINUX_DEPLOYMENT.md).

## Run locally in Docker Desktop

1. Install and start Docker Desktop for Windows.
2. Copy `.env.example` to `.env`. Replace all `replace_...` example values
   with unique random secrets. Keep the PostgreSQL password alphanumeric.
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
when the `public` profile is enabled. Keep it private and do not commit `.env`.

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

The TURN container uses the `coturn/coturn:latest` image published by the
[coturn project](https://github.com/coturn/coturn).

TURN credentials are generated on the server and expire after one hour. The
coturn shared secret must match `TURN_SHARED_SECRET`. Relay access is limited
by coturn quotas and a fixed UDP relay port range.

## Redeploy from `main`

The included `.github/workflows/deploy.yml` runs on every push to `main`. For
it to deploy to a Linux server:

1. Add a **self-hosted Linux x64 GitHub Actions runner** for this repository
   on the Linux server. Keep the runner service running and make sure its
   account can use Docker.
2. Add the values from `.env` as repository Actions secrets with these exact
   names: `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`,
   `VITE_PUBLIC_SITE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
   `TURN_URLS`, `TURN_HOSTNAME`, `TURN_EXTERNAL_IP`, `TURN_BIND_IP`,
   `TURN_SHARED_SECRET`, and `CLOUDFLARE_TUNNEL_TOKEN`.
3. Push this deployment setup to the repository's `main` branch. Every later
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
- The host must stay online. Power loss, network changes, ISP restrictions, or
  a changing public IP can take the site or multiplayer relay offline.
