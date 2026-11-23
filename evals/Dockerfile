# Trial image for one eval case. scripts/lib/tasks.mjs copies this file next to
# the case's fixture project (as `project/`) when it generates Harbor tasks.
#
# Dependencies are installed at build time so trials start from a working
# project and the verifier can run `astro build` without waiting on a cold
# install. The project is a git repository so agents can inspect their changes.
FROM node:22-bookworm

ENV ASTRO_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false

WORKDIR /app
COPY project/ /app/

RUN if [ -f package.json ]; then npm install --no-audit --loglevel=error; fi \
    && if [ ! -f .gitignore ]; then printf 'node_modules/\ndist/\n.astro/\n' > .gitignore; fi \
    && git init -q \
    && git add -A \
    && git -c user.name=eval -c user.email=eval@example.com commit -q -m "Initial project"
