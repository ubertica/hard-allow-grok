#!/bin/bash
###############################################################################
# MCP Context Query Pipeline — Tool Registration Script
#
# Registers the context-query-pipeline tool in all LLM MCP configs.
# Run once after daemon installation to wire up tool discovery.
###############################################################################

set -e

HOME="${HOME:=$(eval echo ~$(whoami))}"
HARD_ALLOW_DIR="$HOME/.grok/hard-allow"
TOOL_PATH="$HARD_ALLOW_DIR/mcp-context-query-pipeline.mjs"
LOG_FILE="$HARD_ALLOW_DIR/mcp-tool-registration.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
  exit 1
}

success() {
  echo -e "${GREEN}[OK]${NC} $*" | tee -a "$LOG_FILE"
}

info() {
  echo -e "${YELLOW}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

# Verify tool exists
if [[ ! -f "$TOOL_PATH" ]]; then
  error "Tool not found: $TOOL_PATH"
fi

log "Starting MCP tool registration"

# Target LLM configurations
declare -a LLM_CONFIGS=(
  "$HOME/.grok/.mcp/tools"
  "$HOME/.claude/.mcp/tools"
  "$HOME/.kimi/.mcp/tools"
  "$HOME/.fable/.mcp/tools"
)

REGISTERED=0
FAILED=0

for config_dir in "${LLM_CONFIGS[@]}"; do
  llm_name=$(basename "$(dirname "$config_dir")")

  if [[ "$llm_name" == ".grok" ]]; then
    llm_name="grok"
  elif [[ "$llm_name" == ".claude" ]]; then
    llm_name="claude"
  elif [[ "$llm_name" == ".kimi" ]]; then
    llm_name="kimi"
  elif [[ "$llm_name" == ".fable" ]]; then
    llm_name="fable"
  fi

  info "Registering for $llm_name at $config_dir"

  if mkdir -p "$config_dir" 2>/dev/null; then
    config_file="$config_dir/context-query-pipeline.json"

    # Create tool config pointing to daemon socket or direct tool
    cat > "$config_file" << EOF
{
  "type": "command",
  "command": "node",
  "args": ["$TOOL_PATH", "--server"],
  "env": {
    "PATH": "\$PATH",
    "HOME": "$HOME",
    "MCP_TOOL_PATH": "$TOOL_PATH"
  }
}
EOF

    success "Registered context-query-pipeline for $llm_name"
    ((REGISTERED++))
  else
    error "Failed to create directory: $config_dir"
    ((FAILED++))
  fi
done

# Summary
log "Registration Summary"
log "  Registered: $REGISTERED"
log "  Failed: $FAILED"

if [[ $FAILED -eq 0 ]]; then
  success "All registrations complete"
  exit 0
else
  error "Some registrations failed ($FAILED/$((REGISTERED + FAILED)))"
  exit 1
fi
