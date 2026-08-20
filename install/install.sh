#!/usr/bin/env bash
# Back-compat wrapper. Prefer: ./install.sh from repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/install.sh" "$@"
