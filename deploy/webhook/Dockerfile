FROM docker:27-cli

RUN apk add --no-cache bash ca-certificates curl git nodejs \
  && mkdir -p /usr/local/lib/docker/cli-plugins /usr/libexec/docker/cli-plugins \
  && arch="$(uname -m)" \
  && case "$arch" in \
       aarch64|arm64) cpu=aarch64 ;; \
       armv7l) cpu=armv7 ;; \
       *) cpu=x86_64 ;; \
     esac \
  && curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
       "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-${cpu}" \
  && cp /usr/local/lib/docker/cli-plugins/docker-compose /usr/libexec/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose /usr/libexec/docker/cli-plugins/docker-compose

WORKDIR /srv
COPY server.mjs /srv/server.mjs

ENV PORT=8787
EXPOSE 8787

CMD ["node", "/srv/server.mjs"]
