#!/bin/bash
# Setup cron job for auto-deploy on the VPS
# Run this script once on the VPS as root.

SCRIPT_PATH="/docker/avorix-website/scripts/auto-deploy.sh"
CRON_JOB="*/5 * * * * $SCRIPT_PATH >> /var/log/avorix-deploy.log 2>&1"

# Make deploy script executable
chmod +x "$SCRIPT_PATH"

# Create log file
touch /var/log/avorix-deploy.log

# Add cron job if not already present
if crontab -l 2>/dev/null | grep -qF "$SCRIPT_PATH"; then
    echo "Cron job already configured."
else
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "Cron job added: $CRON_JOB"
fi

echo "Auto-deploy setup complete. Runs every 5 minutes."
echo "Logs: tail -f /var/log/avorix-deploy.log"
