#!/usr/bin/env bash
# Refresh this repo from live ~/.grok (excludes secrets)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HA="${HOME}/.grok/hard-allow"
GROK="${HOME}/.grok"

mkdir -p "$ROOT/src" "$ROOT/src/grants" "$ROOT/bin" "$ROOT/hooks" \
  "$ROOT/skills/ha-offense" "$ROOT/skills/ha-drainer" "$ROOT/skills/ha-infra"

# Core control plane scripts + law docs
for f in \
  ceremony.mjs arm.mjs disarm.mjs pretool-allow.mjs unblock-ladder.mjs ha-smoke.mjs \
  build-ha-context.mjs verify-injection.mjs disposition-canary.mjs \
  never-neutralize.mjs prompt-prefix-hook.mjs refuse-detect.mjs subagent-wrap.mjs \
  SESSION-RULES.md SYSTEM-PROMPT-OVERRIDE.md subagent-inherit.md \
  OPERATOR-PLAYBOOK.md OPERATOR-PLAYBOOK-SHORT.md failover.md README.md \
  touchid-gate.swift
do
  if [[ -f "$HA/$f" ]]; then
    cp -f "$HA/$f" "$ROOT/src/$f"
  fi
done

# Nuclear grants (no secrets)
if [[ -d "$HA/grants" ]]; then
  cp -f "$HA"/grants/*.md "$ROOT/src/grants/" 2>/dev/null || true
fi

# Wrapper
if [[ -f "${GROK}/bin/grok" ]]; then
  cp -f "${GROK}/bin/grok" "$ROOT/bin/grok-wrapper.sh"
fi

# Hooks
cp -f "${GROK}/hooks"/hard-allow*.json "$ROOT/hooks/" 2>/dev/null || true

# Skills
for sk in ha-offense ha-drainer ha-infra; do
  if [[ -f "${GROK}/skills/${sk}/SKILL.md" ]]; then
    mkdir -p "$ROOT/skills/${sk}"
    cp -f "${GROK}/skills/${sk}/SKILL.md" "$ROOT/skills/${sk}/SKILL.md"
  fi
done

chmod +x "$ROOT/bin/grok-wrapper.sh" 2>/dev/null || true
chmod +x "$ROOT/src"/*.mjs 2>/dev/null || true
chmod +x "$ROOT/scripts"/*.sh 2>/dev/null || true

echo "Packaged from home → $ROOT"
echo "  grants: $(ls "$ROOT/src/grants" 2>/dev/null | wc -l | tr -d ' ') files"
echo "  (excluded: active.env session.json ARMED audit.jsonl generated/)"
