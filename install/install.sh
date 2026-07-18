#!/usr/bin/env bash
# Install Hard Allow — Grok into ~/.grok
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_GROK="${HOME}/.grok"
HA="${HOME_GROK}/hard-allow"
BIN="${HOME_GROK}/bin"
HOOKS="${HOME_GROK}/hooks"
DL="${HOME_GROK}/downloads"
SKILLS="${HOME_GROK}/skills"

echo "==> Hard Allow — Grok install"
mkdir -p "$HA" "$HA/grants" "$BIN" "$HOOKS" "${HOME_GROK}/rules" \
  "${HOME}/.claude/rules" "$SKILLS"

# Real binary
if [[ ! -e "${BIN}/grok-real" ]]; then
  if [[ -x "${DL}/grok-macos-aarch64" ]]; then
    ln -sfn "${DL}/grok-macos-aarch64" "${BIN}/grok-real"
  elif [[ -x "${DL}/grok-0.2.101-restored" ]]; then
    ln -sfn "${DL}/grok-0.2.101-restored" "${BIN}/grok-real"
  else
    echo "WARN: no Mach-O found under ~/.grok/downloads — install Grok first, then re-run"
  fi
fi

if [[ -e "${BIN}/grok-real" ]]; then
  REAL="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BIN}/grok-real")"
  if head -c 2 "$REAL" | grep -q '#!'; then
    echo "ERROR: grok-real points to a script: $REAL"
    echo "  Fix: ln -sfn ~/.grok/downloads/grok-macos-aarch64 ~/.grok/bin/grok-real"
    exit 1
  fi
fi

# Copy sources (flat files into hard-allow/)
shopt -s nullglob
for f in "$ROOT"/src/*; do
  base="$(basename "$f")"
  if [[ -f "$f" ]]; then
    cp -f "$f" "$HA/$base"
  fi
done
# grants subdir
if [[ -d "$ROOT/src/grants" ]]; then
  mkdir -p "$HA/grants"
  cp -f "$ROOT"/src/grants/*.md "$HA/grants/" 2>/dev/null || true
fi
chmod +x "$HA"/*.mjs 2>/dev/null || true

# Wrapper as REGULAR file (never symlink into downloads)
rm -f "${BIN}/grok"
cp -f "$ROOT/bin/grok-wrapper.sh" "${BIN}/grok"
chmod +x "${BIN}/grok"

# Hooks
cp -f "$ROOT"/hooks/*.json "$HOOKS/" 2>/dev/null || true

# Skills
for sk in ha-offense ha-drainer ha-infra; do
  if [[ -f "$ROOT/skills/${sk}/SKILL.md" ]]; then
    mkdir -p "$SKILLS/${sk}" "${HOME}/.claude/skills/${sk}"
    cp -f "$ROOT/skills/${sk}/SKILL.md" "$SKILLS/${sk}/SKILL.md"
    cp -f "$ROOT/skills/${sk}/SKILL.md" "${HOME}/.claude/skills/${sk}/SKILL.md"
  fi
done

# Build effective context if possible
if [[ -f "$HA/build-ha-context.mjs" ]]; then
  node "$HA/build-ha-context.mjs" 2>/dev/null || true
fi

# zshrc auto-source
if [[ -f "${HOME}/.zshrc" ]] && ! grep -q 'HARD ALLOW auto-source' "${HOME}/.zshrc"; then
  cat >> "${HOME}/.zshrc" << 'EOF'

# ── HARD ALLOW auto-source (global operator session) ──────────────
if [[ -f "$HOME/.grok/hard-allow/active.env" && -f "$HOME/.grok/hard-allow/ceremony.mjs" ]]; then
  if command -v node >/dev/null 2>&1 && node "$HOME/.grok/hard-allow/ceremony.mjs" --check >/dev/null 2>&1; then
    set -a
    # shellcheck disable=SC1090
    source "$HOME/.grok/hard-allow/active.env" 2>/dev/null || true
    set +a
  fi
fi
# ── end HARD ALLOW auto-source ────────────────────────────────────
EOF
  echo "Appended HARD ALLOW auto-source to ~/.zshrc"
fi

echo "OK. Ensure PATH has ~/.grok/bin first."
echo "  export PATH=\"\$HOME/.grok/bin:\$PATH\""
echo "Then: grok --hard-allow"
echo "Smoke: node ~/.grok/hard-allow/ha-smoke.mjs"
echo "Verify grants: node ~/.grok/hard-allow/verify-injection.mjs"
