#!/bin/bash
###############################################################################
# MCP Daemon Startup Health Check
#
# Validates daemon initialization and all LLM tool registrations
# Run after fresh install to verify everything is wired up correctly
###############################################################################

set -e

HOME="${HOME:=$(eval echo ~$(whoami))}"
HARD_ALLOW_DIR="$HOME/.grok/hard-allow"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check_mark="${GREEN}✓${NC}"
cross_mark="${RED}✗${NC}"

passed=0
failed=0

test_result() {
  if [[ $1 -eq 0 ]]; then
    echo -e "${check_mark} $2"
    ((passed++))
  else
    echo -e "${cross_mark} $2"
    ((failed++))
  fi
}

echo -e "${BLUE}=== MCP Daemon Startup Check ===${NC}\n"

# 1. Check files exist
echo "Files:"
[[ -f "$HARD_ALLOW_DIR/mcp-context-query-pipeline.mjs" ]]
test_result $? "Tool script exists"

[[ -f "$HARD_ALLOW_DIR/mcp-server-daemon.mjs" ]]
test_result $? "Daemon script exists"

[[ -f "$HARD_ALLOW_DIR/mcp-daemon-install.sh" ]]
test_result $? "Install script exists"

# 2. Check executability
echo -e "\nExecutability:"
[[ -x "$HARD_ALLOW_DIR/mcp-context-query-pipeline.mjs" ]]
test_result $? "Tool script is executable"

[[ -x "$HARD_ALLOW_DIR/mcp-server-daemon.mjs" ]]
test_result $? "Daemon script is executable"

# 3. Test tool in isolation
echo -e "\nTool functionality:"
if node "$HARD_ALLOW_DIR/mcp-context-query-pipeline.mjs" --test >/dev/null 2>&1; then
  test_result 0 "Tool runs standalone"
else
  test_result 1 "Tool runs standalone"
fi

# 4. Check LLM registrations
echo -e "\nLLM tool registrations:"
[[ -f "$HOME/.grok/.mcp/tools/context-query-pipeline.json" ]]
test_result $? "Registered in Grok MCP config"

[[ -f "$HOME/.claude/.mcp/tools/context-query-pipeline.json" ]]
test_result $? "Registered in Claude MCP config"

[[ -f "$HOME/.kimi/.mcp/tools/context-query-pipeline.json" ]]
test_result $? "Registered in Kimi MCP config"

[[ -f "$HOME/.fable/.mcp/tools/context-query-pipeline.json" ]]
test_result $? "Registered in Fable MCP config"

# 5. Check node registry
echo -e "\nNode registry:"
[[ -f "$HOME/.grok/context-nodes/state.json" ]]
test_result $? "Grok context nodes exist"

[[ -f "$HOME/.grok/context-nodes/search-index.json" ]]
test_result $? "Search index exists"

# 6. Check daemon processes
echo -e "\nDaemon status:"
if [[ -f "$HARD_ALLOW_DIR/mcp-daemon.pid" ]]; then
  pid=$(cat "$HARD_ALLOW_DIR/mcp-daemon.pid")
  if kill -0 "$pid" 2>/dev/null; then
    test_result 0 "Daemon process is running (PID: $pid)"
  else
    test_result 1 "Daemon process is running"
  fi
else
  echo -e "${YELLOW}⚠${NC} Daemon not installed (PID file missing)"
  echo "    Run: bash $HARD_ALLOW_DIR/mcp-daemon-install.sh --install"
fi

# 7. Check health endpoints
echo -e "\nHealth checks:"
if command -v curl &>/dev/null; then
  if curl -s http://127.0.0.1:9998/health >/dev/null 2>&1; then
    test_result 0 "Health endpoint responding"
  else
    test_result 1 "Health endpoint responding"
  fi

  if curl -s http://127.0.0.1:9998/stats >/dev/null 2>&1; then
    test_result 0 "Stats endpoint responding"
  else
    test_result 1 "Stats endpoint responding"
  fi
else
  echo -e "${YELLOW}⚠${NC} curl not available for health check"
fi

# 8. Check network ports
echo -e "\nNetwork ports:"
if command -v lsof &>/dev/null; then
  lsof -i :9999 >/dev/null 2>&1
  test_result $? "MCP TCP port (9999) listening"

  lsof -i :9998 >/dev/null 2>&1
  test_result $? "Health check port (9998) listening"
else
  echo -e "${YELLOW}⚠${NC} lsof not available for port check"
fi

# 9. Test tool via daemon
echo -e "\nTool invocation:"
if command -v curl &>/dev/null; then
  query='{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "call_tool",
    "params": {
      "name": "context_query_pipeline",
      "arguments": {
        "query": "system",
        "limit": 5
      }
    }
  }'

  response=$(echo "$query" | nc -w 2 127.0.0.1 9999 2>/dev/null || echo "")
  if [[ -n "$response" ]]; then
    test_result 0 "Tool responds via TCP socket"
  else
    test_result 1 "Tool responds via TCP socket"
  fi
else
  echo -e "${YELLOW}⚠${NC} nc not available for tool test"
fi

# Summary
echo -e "\n${BLUE}=== Summary ===${NC}"
echo -e "Passed: ${GREEN}$passed${NC}"
echo -e "Failed: ${RED}$failed${NC}"

if [[ $failed -eq 0 ]]; then
  echo -e "\n${GREEN}All checks passed!${NC}"
  echo "Tool is ready to use from all LLMs."
  exit 0
else
  echo -e "\n${RED}Some checks failed.${NC}"
  echo "Run install: bash $HARD_ALLOW_DIR/mcp-daemon-install.sh --install"
  exit 1
fi
