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

For a public deployment, enable your hosting provider's DDoS/WAF protections and
rate limits for `/api/rtc`, `/api/auth/*`, and room-creation endpoints. Configure
alerts for elevated 4xx/5xx responses, latency, memory, and database connections.
The app's peer-based signaling limits are not a substitute for provider-level
per-IP limits, since peer IDs are supplied by clients.