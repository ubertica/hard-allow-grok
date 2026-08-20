#!/bin/bash
# Restart unified query system daemon

set -e

cd "~/.grok/hard-allow"
bash stop-query-daemon.sh
sleep 1
bash start-query-daemon.sh "$@"

echo "Query system restarted"
