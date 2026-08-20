#!/bin/bash
# disposition-scheduler.sh
# Set up cron job to run disposition-canary daily at 3 AM

set -e

HOME="${HOME:-$( cd ~ && pwd )}"
CANARY_SCRIPT="$HOME/.grok/hard-allow/disposition-canary.mjs"
CRON_SCHEDULE="0 3 * * *"  # Daily at 3 AM

if [ ! -f "$CANARY_SCRIPT" ]; then
    echo "❌ disposition-canary.mjs not found at $CANARY_SCRIPT"
    exit 1
fi

# Create crontab entry
echo "Setting up cron job..."

# Get current crontab (avoid error if none exists)
CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")

# Check if already scheduled
if echo "$CURRENT_CRON" | grep -q "disposition-canary.mjs"; then
    echo "✅ Cron job already exists"
    exit 0
fi

# Add new cron entry
NEW_CRON=$(echo "$CURRENT_CRON"; echo "$CRON_SCHEDULE /usr/bin/node $CANARY_SCRIPT")
echo "$NEW_CRON" | crontab -

echo "✅ Disposition canary scheduled to run daily at 03:00 (UTC)"
echo ""
echo "To verify:"
echo "  crontab -l | grep disposition"
echo ""
echo "To remove:"
echo "  crontab -e  # and delete the disposition-canary line"
