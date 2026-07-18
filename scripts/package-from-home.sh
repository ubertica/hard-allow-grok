#!/usr/bin/env bash
# Refresh this repo from live ~/.grok (excludes secrets)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HA="${HOME}/.grok/hard-allow"
cp -f "$HA"/{ceremony,arm,disarm,pretool-allow,unblock-ladder,ha-smoke}.mjs "$ROOT/src/" 2>/dev/null || true
cp -f "$HA"/{SESSION-RULES,SYSTEM-PROMPT-OVERRIDE,subagent-inherit}.md "$ROOT/src/" 2>/dev/null || true
cp -f "$HA/touchid-gate.swift" "$ROOT/src/" 2>/dev/null || true
cp -f "${HOME}/.grok/bin/grok" "$ROOT/bin/grok-wrapper.sh"
cp -f "${HOME}/.grok/hooks"/hard-allow*.json "$ROOT/hooks/" 2>/dev/null || true
chmod +x "$ROOT/bin/grok-wrapper.sh" "$ROOT/src"/*.mjs
echo "Packaged from home → $ROOT (no session secrets)"
