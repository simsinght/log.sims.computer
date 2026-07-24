#!/usr/bin/env bash
# Build the sandbox image (linux/amd64) and push it to ECR.
# Usage: infra/build-and-push.sh [tag]   (default tag: latest)
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
REPO_NAME="log-sims-computer-sandbox"
TAG="${1:-latest}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${REPO_NAME}:${TAG}"

aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$REPO_NAME" --region "$REGION" >/dev/null

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

docker buildx build \
  --platform linux/amd64 \
  -f "$(dirname "$0")/sandbox.Dockerfile" \
  -t "$IMAGE" \
  --push \
  "$(dirname "$0")"

echo "pushed: $IMAGE"
