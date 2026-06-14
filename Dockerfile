FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    ELEPHANTNOTE_VAULT=/data/vault

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY web ./web
COPY Elephant/shared ./Elephant/shared

VOLUME ["/data/vault"]
EXPOSE 8787
CMD ["node", "web/server.mjs"]
