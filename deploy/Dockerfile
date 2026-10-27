FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_PUBLIC_SITE_URL
ARG VITE_AUTH_ENABLED=true
ENV VITE_PUBLIC_SITE_URL=${VITE_PUBLIC_SITE_URL}
ENV VITE_AUTH_ENABLED=${VITE_AUTH_ENABLED}

RUN node scripts/with-app-env.mjs vite build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "deploy/entrypoint.sh"]
