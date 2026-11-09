# Linux server deployment

This guide deploys the app, PostgreSQL, coturn, and a Cloudflare Tunnel on a
Linux server using the project's Docker Compose stack.

## What you need

- A Linux server with a public IPv4 address. A VPS is usually easier for TURN
  than a home connection.
- A domain registered at GoDaddy.
- A Cloudflare account and a Cloudflare Tunnel token.
- Inbound firewall access for the TURN ports listed below.

Cloudflare Tunnel carries the website's HTTP/HTTPS traffic. It does **not**
carry TURN media traffic; coturn needs its own direct public network access.
TURN on port 3478 can still be blocked by some restrictive mobile networks.
This project configuration does not provide TURN/TLS on port 443.

## 1. Point the domain to Cloudflare DNS

You can keep GoDaddy as the registrar and use Cloudflare for DNS:

1. Add your domain to Cloudflare.
2. Cloudflare will provide two authoritative nameservers.
3. In GoDaddy's domain settings, replace the domain's nameservers with the
   Cloudflare nameservers. DNS changes may take time to propagate.
4. After the domain is active in Cloudflare, create the website hostname as a
   public hostname on a Cloudflare Tunnel (step 4 below).
5. Create a separate `A` record in Cloudflare DNS:
   - **Name:** `turn`
   - **IPv4 address:** the Linux server's public IPv4 address
   - **Proxy status:** DNS only (not proxied)

The TURN record must resolve directly to the server. Do not configure it as a
Cloudflare Tunnel hostname.

## 2. Install Docker and get the project

Install Docker Engine and the Docker Compose plugin by following Docker's
official instructions for your Linux distribution. Then enable Docker at boot:

```sh
sudo systemctl enable --now docker
```

Clone the GitHub repository and enter the project directory:

```sh
git clone https://github.com/rahulkrraj0/multiplay-game.git
cd multiplay-game
```

Use a checkout that includes the Docker files in this repository. If those
changes have not been pushed to GitHub yet, push them first before cloning.

## 3. Create and configure `.env`

Create a private environment file from the example:

```sh
cp .env.example .env
chmod 600 .env
```

Generate three different secrets. Run this command three times and use one
unique result for each secret:

```sh
openssl rand -hex 32
```

Edit `.env`:

```sh
nano .env
```

Set these values, replacing the example domain and address with your own:

```dotenv
POSTGRES_USER=multiplay
POSTGRES_DB=multiplay
POSTGRES_PASSWORD=YOUR_NEW_POSTGRES_SECRET
APP_DB_USER=gameslord_app
APP_DB_PASSWORD=YOUR_DIFFERENT_APP_ROLE_SECRET
BETTER_AUTH_SECRET=YOUR_DIFFERENT_AUTH_SECRET
VITE_AUTH_ENABLED=false

VITE_PUBLIC_SITE_URL=https://play.yourdomain.com
BETTER_AUTH_URL=https://play.yourdomain.com

TURN_HOSTNAME=turn.yourdomain.com
TURN_EXTERNAL_IP=YOUR_LINUX_SERVER_PUBLIC_IPV4
TURN_BIND_IP=0.0.0.0
TURN_URLS=turn:turn.yourdomain.com:3478?transport=udp,turn:turn.yourdomain.com:3478?transport=tcp
TURN_SHARED_SECRET=YOUR_DIFFERENT_TURN_SECRET

CLOUDFLARE_TUNNEL_TOKEN=YOUR_CLOUDFLARE_TUNNEL_TOKEN
```

Authentication is disabled by default. To enable it, register an app-specific
OAuth client with your broker, set `VITE_AUTH_ENABLED=true`, and configure
`GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, and `GROK_AUTH_CLIENT_SECRET`.
Production will not fall back to the shared preview OAuth client.

Use the actual public IPv4 address assigned to the Linux server for
`TURN_EXTERNAL_IP`. Do not reuse the `.env` or database from the Windows
Docker Desktop setup unless you deliberately want to reuse its secrets and
migrate its database.

Never commit `.env` or share its secrets.

## 4. Configure the Cloudflare Tunnel

In Cloudflare Zero Trust:

1. Create a remotely managed Cloudflare Tunnel.
2. Copy its connector token into `CLOUDFLARE_TUNNEL_TOKEN` in the Linux
   server's `.env`.
3. Add a public hostname such as `play.yourdomain.com`.
4. Set the hostname's service type to HTTP and its URL to:
   `http://app:8080`

The `cloudflared` container joins the Compose network, so it reaches the app
by its service name. The app does not need to publish port 8080 to the public
internet.

## 5. Open network firewalls for TURN

Allow these inbound ports on **both** the Linux server firewall and the VPS or
cloud provider's network firewall/security group:

- TCP `3478`
- UDP `3478`
- UDP `49160-49200`

For UFW, for example:

```sh
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49160:49200/udp
sudo ufw status
```

The coturn Compose service adds only the `NET_BIND_SERVICE` capability required
by the image's `turnserver` executable; it drops all other capabilities and
keeps `no-new-privileges` enabled.

Do not expose the PostgreSQL port to the internet. This Compose file does not
publish PostgreSQL on the host.

If Compose reports an IP address subnet conflict, another Docker network is
using `10.255.233.0/24`. Change that subnet and coturn's two matching
`10.255.233.10` addresses in `docker-compose.yml` to an unused private subnet
and address.

## 6. Start the stack

From the project directory, start the app, database, coturn, and tunnel:

```sh
docker compose --profile public up -d --build
docker compose ps
```

The app and database run by default; the `public` profile also starts
`cloudflared`. Coturn starts as part of the default stack. Containers use `restart: unless-stopped`, so they restart with Docker after a
server reboot. The app runs as the unprivileged `node` user, drops Linux
capabilities, and uses `no-new-privileges`. Migrations run in a separate
one-shot service with the database owner role; the app uses the restricted
`APP_DB_USER` role.

The app-role setup runs automatically for a new PostgreSQL volume. For an
existing `postgres_data` volume, update `.env`, start PostgreSQL, and create
the role before starting the new app image:

```sh
docker compose up -d postgres
docker compose exec -T postgres sh /docker-entrypoint-initdb.d/01-create-app-role.sh
docker compose --profile public up -d --build
```

View logs if a container does not start:

```sh
docker compose logs --tail 80 app postgres coturn cloudflared
```

If you change `.env`, apply the updated settings with:

```sh
docker compose --profile public up -d
```

## 7. Verify app and TURN configuration

Check that all containers are running:

```sh
docker compose ps
```

Check TURN without printing its short-lived credentials:

```sh
curl -fsS http://127.0.0.1:8080/api/ice |
  python3 -c 'import json,sys; d=json.load(sys.stdin); print("TURN configured:", d["turnConfigured"]); [print("TURN URLs:", ", ".join(s["urls"] if isinstance(s["urls"], list) else [s["urls"]])) for s in d["iceServers"] if any(u.startswith("turn:") or u.startswith("turns:") for u in (s["urls"] if isinstance(s["urls"], list) else [s["urls"]]))]'
```

Expect `TURN configured: True` and URLs beginning with
`turn:turn.yourdomain.com`. Then test the game from a phone on mobile data,
not only from the same Wi-Fi. Successful configuration and a running coturn
container do not by themselves prove that a carrier permits the call; confirm
voice/video in an actual game session.

## 8. Updating the app

Update manually from the server:

```sh
git pull
docker compose --profile public up -d --build
```

The deployment workflow targets a **Linux** self-hosted runner and only allows
deployment from `main`. Configure a dedicated, isolated runner account with
Docker access (not root), add the required Actions secrets, and set up the
GitHub `production` Environment with required reviewers. Protect `main` with
required pull requests/reviews and 2FA. These settings are enforced in GitHub
and cannot be created by repository code alone.

## Database persistence and migration

PostgreSQL data lives in the Docker-managed `postgres_data` volume and
survives container rebuilds. It is not stored in Google Drive and this setup
does not schedule off-site backups. Back up the database separately.

The Linux deployment starts a new database; it does not automatically copy
data from the Windows Docker Desktop database. Migrate data separately if
you need to preserve existing accounts or game records. Back up the volume
before applying role or schema changes.

## Edge security and privacy

Configure Cloudflare rate-limit rules keyed by client IP for `/api/rtc` and
`/api/ice` (300 and 20 requests per minute, respectively). The app also uses
shared PostgreSQL counters with one-minute windows, stores only SHA-256 hashes
of client IPs, and prunes old counters. Edge limits protect the database from
floods before requests reach the app.

ICE can reveal a player's public IP to other peers on direct connections.
Players can opt into TURN-only privacy in the lobby; every participant should
enable it, and TURN must be configured. This may fail on networks where relay
service is unavailable.

The app sends CSP, HSTS, `X-Content-Type-Options`, and `Referrer-Policy`
headers. CSP currently permits inline scripts for the existing rendering
architecture; consider migrating to per-request script nonces before removing
that exception.

Games exchange full game state between peers. Poker hidden cards are concealed
by the normal interface, not hidden from another participant's browser. Do not
use the games for prizes or trusted rankings without a server-authoritative
game implementation.
