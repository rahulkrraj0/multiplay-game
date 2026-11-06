FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_PUBLIC_SITE_URL
ARG VITE_AUTH_ENABLED=false
ENV NITRO_PRESET=node-server \
    VITE_AUTH_ENABLED=${VITE_AUTH_ENABLED} \
    VITE_PUBLIC_SITE_URL=${VITE_PUBLIC_SITE_URL}

RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=node:node /app/scripts/migration-plan.mjs ./scripts/migration-plan.mjs
COPY --from=build --chown=node:node /app/migrations ./migrations

EXPOSE 8080

USER node

CMD ["node", ".output/server/index.mjs"]
