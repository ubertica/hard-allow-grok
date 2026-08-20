#!/usr/bin/env bash
# Refresh this repo from live ~/.grok (excludes secrets / logs / operator session).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HA="${HOME}/.grok/hard-allow"
GROK="${HOME}/.grok"
CLAUDE_RULES="${HOME}/.claude/rules"

if [[ ! -d "$HA" ]]; then
  echo "missing $HA" >&2
  exit 1
fi

mkdir -p "$ROOT/src" "$ROOT/skills" "$ROOT/rules/grok" "$ROOT/rules/claude" \
  "$ROOT/installer/wrappers" "$ROOT/examples" "$ROOT/docs"

rsync -a --delete \
  --exclude 'session.json' \
  --exclude 'active.env' \
  --exclude 'active.env.*' \
  --exclude 'ARMED' \
  --exclude 'operator.json' \
  --exclude '*.jsonl' \
  --exclude '*.log' \
  --exclude '*.pid' \
  --exclude 'installer/dist' \
  --exclude 'generated/' \
  --exclude 'semantic-maps/' \
  --exclude 'matrix-checkpoints/' \
  --exclude '*.bak' \
  --exclude '*.bak.*' \
  --exclude '.DS_Store' \
  --exclude 'INSTALL-STAMP.json' \
  --exclude 'grok-paths.env' \
  --exclude 'grok-paths.cmd' \
  --exclude 'grok-paths.json' \
  "$HA/" "$ROOT/src/"

# Installer (portable)
cp -f "$HA/installer/install.mjs" "$ROOT/installer/install.mjs"
cp -f "$HA/installer/detect-grok.mjs" "$ROOT/installer/detect-grok.mjs"
cp -f "$HA/installer/build.mjs" "$ROOT/installer/build.mjs"
cp -f "$HA/installer/README.md" "$ROOT/installer/README.md"
rsync -a "$HA/installer/wrappers/" "$ROOT/installer/wrappers/"

# Skills
for sk in ha-offense ha-drainer ha-infra ha-fable-mythos hat2 muchachos; do
  if [[ -d "${GROK}/skills/${sk}" ]]; then
    mkdir -p "$ROOT/skills/${sk}"
    rsync -a --exclude '.DS_Store' "${GROK}/skills/${sk}/" "$ROOT/skills/${sk}/"
  fi
done

# Rule stamps (templates; regenerated on arm)
shopt -s nullglob
for f in "${GROK}/rules/"*.md; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  case "$base" in
    *hard-allow*|0[0-9]-*|1[0-6]-*|99-*|hat2*|muchachos.md|wire-comms*|opsec*|offwks-context*|ha-god*|ha-nodes*|agent-access*|mcp-mail*)
      cp -f "$f" "$ROOT/rules/grok/$base"
      ;;
  esac
done

if [[ -d "$CLAUDE_RULES" ]]; then
  for f in "$CLAUDE_RULES"/hard-allow*.md "$CLAUDE_RULES"/hat2*.md; do
    [[ -f "$f" ]] || continue
    cp -f "$f" "$ROOT/rules/claude/$(basename "$f")"
  done
fi

# Portable grok wrapper lives in installer/wrappers
if [[ -f "$ROOT/installer/wrappers/grok" ]]; then
  mkdir -p "$ROOT/bin"
  cp -f "$ROOT/installer/wrappers/grok" "$ROOT/bin/grok-wrapper.sh"
  chmod +x "$ROOT/bin/grok-wrapper.sh"
fi

chmod +x "$ROOT/src"/*.mjs 2>/dev/null || true
chmod +x "$ROOT/src/bin"/*.mjs 2>/dev/null || true
chmod +x "$ROOT/scripts"/*.sh 2>/dev/null || true
chmod +x "$ROOT/installer/wrappers/grok" 2>/dev/null || true

echo "Packaged live HA → $ROOT"
echo "  src files: $(find "$ROOT/src" -type f | wc -l | tr -d ' ')"
echo "  grants:    $(ls "$ROOT/src/grants"/*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "  skills:    $(ls -d "$ROOT/skills"/ha-* "$ROOT/skills"/hat2 "$ROOT/skills"/muchachos 2>/dev/null | wc -l | tr -d ' ')"
echo "  (excluded: session.json active.env ARMED operator.json logs generated/ dist)"
