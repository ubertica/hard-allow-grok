#!/bin/bash
#
# stop-query-daemon.sh
# Stop the unified query system daemon
#

set -e

HOME=$(eval echo ~)
SYSTEM_ROOT="$HOME/.grok/hard-allow"

echo "Stopping unified query system..."

# Stop MCP daemon
if [ -f "$SYSTEM_ROOT/mcp-daemon.pid" ]; then
  PID=$(cat "$SYSTEM_ROOT/mcp-daemon.pid")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping MCP daemon (PID: $PID)..."
    kill "$PID" || true
    rm -f "$SYSTEM_ROOT/mcp-daemon.pid"
  fi
fi

# Stop API server
if [ -f "$SYSTEM_ROOT/api-server.pid" ]; then
  PID=$(cat "$SYSTEM_ROOT/api-server.pid")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping API server (PID: $PID)..."
    kill "$PID" || true
    rm -f "$SYSTEM_ROOT/api-server.pid"
  fi
fi

echo "Unified query system stopped"
