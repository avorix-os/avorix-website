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

# ------------------------------------------------------------------
# Anweisung 52 Punkt 6: monatliche KI-Bot-Zaehlung.
# Laeuft am 1. jedes Monats um 03:00 und zaehlt den Vormonat aus dem
# persistierten nginx-Access-Log (logs/nginx/). Ergebnis: logs/ki-bots.tsv.
# ------------------------------------------------------------------
BOT_SCRIPT="/docker/avorix-website/scripts/ki-bot-zaehlung.sh"
BOT_CRON="0 3 1 * * $BOT_SCRIPT >> /var/log/avorix-ki-bots.log 2>&1"

chmod +x "$BOT_SCRIPT"
touch /var/log/avorix-ki-bots.log

if crontab -l 2>/dev/null | grep -qF "$BOT_SCRIPT"; then
    echo "KI-Bot-Cron bereits konfiguriert."
else
    (crontab -l 2>/dev/null; echo "$BOT_CRON") | crontab -
    echo "KI-Bot-Cron hinzugefuegt: $BOT_CRON"
fi
echo "KI-Bot-Zaehlung: laeuft monatlich; Ergebnis /docker/avorix-website/logs/ki-bots.tsv"
