# Sandbox image for Aviator (registry-sourced e2b template, AWS ECR path).
# Registry images are used as-is — nothing is injected — so git and claude-code
# are baked in here, unlike the paste-a-Dockerfile path (infra/e2b.Dockerfile).
# Must be built linux/amd64.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs curl ca-certificates jq sqlite3 build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install --system

RUN npm install -g @anthropic-ai/claude-code
