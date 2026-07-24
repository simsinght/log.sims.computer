# Custom e2b template for Aviator coding + preview sandboxes.
# Constraints from Aviator's template builder: no ADD/COPY (source is checked out
# at runtime, not baked in); claude-code and git are injected by the build pipeline.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates sqlite3 build-essential \
    && rm -rf /var/lib/apt/lists/*
