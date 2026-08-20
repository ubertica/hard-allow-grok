#!/usr/bin/env bash
# HARD ALLOW — Grok: install the system onto THIS machine (no live token).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Need Node.js 18+ on PATH" >&2
  exit 1
fi
exec node "$ROOT/installer/install.mjs" "$@"
