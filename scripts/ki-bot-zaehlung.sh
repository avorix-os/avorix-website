#!/bin/bash
# Anweisung 47 A7 / Anweisung 52 Punkt 6: monatliche Zaehlung der KI-Bot-Zugriffe.
#
# Zaehlt im nginx-Access-Log (persistiert unter logs/nginx/, siehe docker-compose.yml)
# die Requests je KI-Bot-User-Agent fuer einen Kalendermonat und schreibt das
# Ergebnis als "Monat<TAB>Bot<TAB>Anzahl" in logs/ki-bots.tsv.
#
# Aufruf:
#   ki-bot-zaehlung.sh            -> zaehlt den VORMONAT (fuer den Monats-Cron am 1.)
#   ki-bot-zaehlung.sh 2026-09    -> zaehlt genau diesen Monat (Nachtrag/Test)
#
# Cron (monatlich, 1. um 03:00): siehe scripts/setup-cron.sh.
set -uo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="$BASE/logs/nginx"
OUT="$BASE/logs/ki-bots.tsv"

# Die zu zaehlenden Bot-User-Agents (fester Substring im UA-String).
BOTS=("OAI-SearchBot" "ChatGPT-User" "PerplexityBot" "ClaudeBot" "Google-Extended" "GPTBot" "Bingbot")

# Zielmonat bestimmen (YYYY-MM). Ohne Argument: Vormonat.
if [ "${1:-}" != "" ]; then
  MONTH="$1"
else
  MONTH="$(date -d 'last month' +%Y-%m 2>/dev/null || date -v-1m +%Y-%m)"
fi
YEAR="${MONTH%-*}"; MON_NUM="${MONTH#*-}"
# nginx-Zeitstempel nutzen englische 3-Buchstaben-Monate: [DD/Mon/YYYY:...]
MONNAMES=(Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec)
MON_ABBR="${MONNAMES[$((10#$MON_NUM - 1))]}"
PATTERN="/${MON_ABBR}/${YEAR}:"   # z. B. /Sep/2026:

if [ ! -d "$LOGDIR" ]; then
  echo "Kein Log-Verzeichnis $LOGDIR (Volume noch nicht angelegt?)." >&2
  exit 0
fi

# Alle Access-Logs des Monats einsammeln (aktuell + rotiert, auch .gz).
monat_zeilen() {
  for f in "$LOGDIR"/access.log "$LOGDIR"/access.log.[0-9]*; do
    [ -e "$f" ] || continue
    case "$f" in
      *.gz) zcat -- "$f" 2>/dev/null ;;
      *)    cat -- "$f" 2>/dev/null ;;
    esac
  done | grep -F "$PATTERN"
}

TMP="$(mktemp)"; TMPLC="$(mktemp)"; trap 'rm -f "$TMP" "$TMPLC"' EXIT
monat_zeilen > "$TMP"
GESAMT="$(wc -l < "$TMP" | tr -d ' ')"
# einmal klein schreiben -> case-insensitives Matching ohne grep -i (portabel).
tr '[:upper:]' '[:lower:]' < "$TMP" > "$TMPLC"

mkdir -p "$BASE/logs"
# Alte Zeilen dieses Monats entfernen (idempotent), dann neu schreiben.
if [ -f "$OUT" ]; then grep -v "^${MONTH}	" "$OUT" > "${OUT}.tmp" 2>/dev/null || true; mv "${OUT}.tmp" "$OUT"; fi

echo "KI-Bot-Zaehlung fuer $MONTH (Requests gesamt im Monat: $GESAMT)"
for bot in "${BOTS[@]}"; do
  # case-insensitiv ueber die klein geschriebene Kopie (der echte Bingbot-UA ist
  # klein, andere Bots schwanken). Kein grep -i noetig.
  blc="$(printf '%s' "$bot" | tr '[:upper:]' '[:lower:]')"
  n="$(grep -F "$blc" "$TMPLC" | wc -l | tr -d ' ')"
  printf '%s\t%s\t%s\n' "$MONTH" "$bot" "$n" >> "$OUT"
  printf '  %-16s %s\n' "$bot" "$n"
done
echo "Geschrieben nach: $OUT"
