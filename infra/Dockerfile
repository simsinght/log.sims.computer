# syntax=docker/dockerfile:1

# Production image for the tvlog Next.js app. Multi-stage: install deps, build
# with Next's standalone output, then a minimal runner. Domain-generic — the
# public URL is supplied at runtime via BASE_URL (see infra/compose.yaml).

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runtime OS dependency: the Trakt import streams entries out of the uploaded
# zip with `unzip -p`. `ls` (used by the directory-source path) is in the base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/*

# Next standalone output: a self-contained server.js plus only the traced
# node_modules. Static assets and public/ are not part of it and are copied
# separately. Runs as the base image's built-in non-root `node` user.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
