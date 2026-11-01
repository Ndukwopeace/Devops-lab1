#!/usr/bin/env bash
# Usage: build-component.sh <frontend|python-api|node-api|java-api>
# Tags the image ${REGISTRY_IMAGE_PREFIX}/<component>:${GITHUB_SHA}, or
# local/<component>:dev when either variable is unset (local use).
set -euo pipefail

component="${1:-}"
case "$component" in
  frontend)   context="frontend" ;;
  python-api|node-api|java-api) context="services/$component" ;;
  *)
    echo "usage: $0 <frontend|python-api|node-api|java-api>" >&2
    exit 2
    ;;
esac

if [ -n "${REGISTRY_IMAGE_PREFIX:-}" ] && [ -n "${GITHUB_SHA:-}" ]; then
  tag="${REGISTRY_IMAGE_PREFIX}/${component}:${GITHUB_SHA}"
else
  tag="local/${component}:dev"
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "Building $tag"
docker build -t "$tag" "$root/$context"
