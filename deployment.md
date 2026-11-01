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