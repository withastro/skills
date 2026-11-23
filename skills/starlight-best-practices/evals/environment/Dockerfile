FROM node:22-bookworm-slim AS node

# Trial image for the eval cases: the default Python image plus Node.js, so the
# agent can run Astro commands and the grader can run `astro build`.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

ENV ASTRO_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false
