#!/bin/bash
#
# start-query-daemon.sh
# Start the unified query system daemon
#

set -e

HOME=$(eval echo ~)
SYSTEM_ROOT="$HOME/.grok/hard-allow"
MCP_DAEMON="$SYSTEM_ROOT/mcp-server-daemon.mjs"
API_SERVER="$HOME/dev/multi-llm-ha-chat/src/context-graph-api.mjs"

echo "Starting unified query system..."

# Check if already running
if [ -f "$SYSTEM_ROOT/mcp-daemon.pid" ]; then
  PID=$(cat "$SYSTEM_ROOT/mcp-daemon.pid")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Daemon already running (PID: $PID)"
    exit 1
  fi
fi

# Start MCP daemon
echo "Starting MCP daemon..."
node "$MCP_DAEMON" start &
MCP_PID=$!
echo $MCP_PID > "$SYSTEM_ROOT/mcp-daemon.pid"

# Give daemon time to start
sleep 2

# Start API server
echo "Starting API server..."
node "$API_SERVER" 7777 &
API_PID=$!
echo $API_PID > "$SYSTEM_ROOT/api-server.pid"

echo "Unified query system started"
echo "  MCP Daemon PID: $MCP_PID"
echo "  API Server PID: $API_PID"
echo "  API URL: http://127.0.0.1:7777"
echo ""
echo "To stop: bash $SYSTEM_ROOT/stop-query-daemon.sh"

wait
