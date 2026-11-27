# syntax=docker/dockerfile:1

# ─── Build stage: compile TypeScript with dev dependencies ───────────────────
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Runtime stage: production dependencies + compiled output only ───────────
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=build /app/dist ./dist

# Drop root. The app only needs read access to /app; logs go to stdout/stderr
# and the SQLite fallback is refused in production, so no writable data dir.
USER node

EXPOSE 8000

# Uses the public liveness route; readiness (authenticated) is checked by the
# orchestrator after deploy (see docs/deployment.md).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# `dist/main.js` is the validated bootstrap: env load → config gates →
# production preflight → listen.
CMD ["node", "dist/main.js"]
