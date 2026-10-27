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
BETTER_AUTH_SECRET=YOUR_DIFFERENT_AUTH_SECRET

VITE_PUBLIC_SITE_URL=https://play.yourdomain.com
BETTER_AUTH_URL=https://play.yourdomain.com

TURN_HOSTNAME=turn.yourdomain.com
TURN_EXTERNAL_IP=YOUR_LINUX_SERVER_PUBLIC_IPV4
TURN_BIND_IP=0.0.0.0
TURN_URLS=turn:turn.yourdomain.com:3478?transport=udp,turn:turn.yourdomain.com:3478?transport=tcp
TURN_SHARED_SECRET=YOUR_DIFFERENT_TURN_SECRET

CLOUDFLARE_TUNNEL_TOKEN=YOUR_CLOUDFLARE_TUNNEL_TOKEN
```

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
`cloudflared`. Coturn starts as part of the default stack. Containers use
`restart: unless-stopped`, so they restart with Docker after a server reboot.

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

The existing GitHub Actions workflow targets a **Windows** self-hosted
runner. It will not automatically deploy to this Linux server. For automatic
redeploys, configure a Linux self-hosted runner with Docker access and update
the workflow's runner labels and GitHub Actions secrets for the Linux host.

## Database persistence and migration

PostgreSQL data lives in the Docker-managed `postgres_data` volume and
survives container rebuilds. It is not stored in Google Drive and this setup
does not schedule off-site backups. Back up the database separately.

The Linux deployment starts a new database; it does not automatically copy
data from the Windows Docker Desktop database. Migrate data separately if
you need to preserve existing accounts or game records.
