#!/bin/bash
# Check status of query system daemon

cd "~/.grok/hard-allow"

echo "Checking query daemon status..."

if [ -f query-daemon.pid ]; then
  MCP_PID=$(cat query-daemon.pid)
  if kill -0 $MCP_PID 2>/dev/null; then
    echo "✓ MCP daemon is running (PID: $MCP_PID)"
  else
    echo "✗ MCP daemon is not running (stale PID: $MCP_PID)"
  fi
else
  echo "✗ MCP daemon is not running (no PID file)"
fi

if [ -f query-api.pid ]; then
  API_PID=$(cat query-api.pid)
  if kill -0 $API_PID 2>/dev/null; then
    echo "✓ API server is running (PID: $API_PID)"
  else
    echo "✗ API server is not running (stale PID: $API_PID)"
  fi
else
  echo "  API server not started"
fi
