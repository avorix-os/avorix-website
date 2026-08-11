#!/usr/bin/env bash
#
# Website-Deploy mit Test-Gate.
#
# Ablauf: neuen Stand holen -> Image bauen -> das GEBAUTE Image in einem
# Testcontainer starten -> Consent-Suite dagegen laufen lassen -> nur bei
# Gruen live schalten. Faellt ein Test, bleibt der Live-Stand unangetastet.
#
# Der Cron ruft dieses Skript alle 5 Minuten. Ohne neue Commits endet es
# sofort, ohne zu bauen oder zu testen — die Tests laufen also nur dann,
# wenn wirklich etwas ausgerollt wird.
#
# NOTAUSSTIEG: Legt jemand die Datei .deploy-gate-aus im Repo an, wird ohne
# Tests deployt (Log-Eintrag). Gedacht fuer den Fall, dass das Gate selbst
# klemmt und die Website trotzdem live muss:
#     touch /docker/avorix-website/.deploy-gate-aus
# Wieder scharf stellen:
#     rm /docker/avorix-website/.deploy-gate-aus
#
set -euo pipefail

REPO="${REPO_DIR:-/docker/avorix-website}"
ZWEIG="${DEPLOY_BRANCH:-master}"
TESTCONTAINER="avorix-website-test"
NETZ="traefik-proxy"
PW_IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright:v1.61.1-noble}"
LOCKDATEI="/run/lock/avorix-website-deploy.lock"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

aufraeumen() {
  docker rm -f "$TESTCONTAINER" >/dev/null 2>&1 || true
}
trap aufraeumen EXIT

# Kein Parallellauf: Der Cron kommt alle 5 Minuten, ein Lauf kann laenger dauern.
exec 9>"$LOCKDATEI"
if ! flock -n 9; then
  exit 0
fi

cd "$REPO"

# 1. Gibt es ueberhaupt etwas Neues?
git fetch -q origin "$ZWEIG"
ALT=$(git rev-parse HEAD)
NEU=$(git rev-parse "origin/$ZWEIG")
if [ "$ALT" = "$NEU" ]; then
  exit 0
fi

log "Neuer Stand: ${ALT:0:7} -> ${NEU:0:7}"
git pull -q --ff-only origin "$ZWEIG"
chown -R 1000:1000 "$REPO/.git" 2>/dev/null || true

# 2. Image bauen — der laufende Container bleibt dabei unangetastet.
log "Baue Image ..."
docker compose build --quiet
IMAGE=$(docker compose config --images | head -1)
log "Image: $IMAGE"

# 3. Test-Gate
if [ -f "$REPO/.deploy-gate-aus" ]; then
  log "ACHTUNG: .deploy-gate-aus liegt vor — Tests werden UEBERSPRUNGEN."
else
  log "Starte Testcontainer ..."
  docker rm -f "$TESTCONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$TESTCONTAINER" --network "$NETZ" "$IMAGE" >/dev/null

  # Warten, bis der Nginx im Testcontainer antwortet (max. 60s).
  # Geprueft wird aus dem Container selbst — kein zusaetzliches Image noetig.
  bereit=0
  for _ in $(seq 1 30); do
    # Bewusst 127.0.0.1 statt localhost: Das busybox-wget im Alpine-Image
    # nimmt sonst ::1, und der Nginx lauscht nur auf IPv4 — das gaebe ein
    # irrefuehrendes "Connection refused".
    if docker exec "$TESTCONTAINER" wget -q -O /dev/null -T 3 http://127.0.0.1/ 2>/dev/null; then
      bereit=1
      break
    fi
    sleep 2
  done
  if [ "$bereit" -ne 1 ]; then
    log "FEHLER: Testcontainer antwortet nicht — kein Deploy."
    exit 1
  fi

  # node_modules und npm-Cache liegen in Volumes: Das Repo bleibt sauber
  # (node_modules ist gitignored, wuerde aber als root im Arbeitsbaum landen),
  # und der zweite Lauf ist deutlich schneller als der erste.
  log "Consent-Suite laeuft gegen den Testcontainer ..."
  if docker run --rm --network "$NETZ" \
       -v "$REPO:/work" -w /work \
       -v avorix-website-pw-node:/work/node_modules \
       -v avorix-website-npm-cache:/root/.npm \
       -e PW_BASE_URL="http://$TESTCONTAINER" \
       -e CI=1 \
       "$PW_IMAGE" \
       sh -c 'npm ci --no-audit --no-fund --silent && npx playwright test --reporter=line'; then
    log "Tests gruen."
  else
    log "FEHLER: Tests rot — Deploy abgebrochen, der Live-Stand bleibt auf ${ALT:0:7}."
    exit 1
  fi

  docker rm -f "$TESTCONTAINER" >/dev/null 2>&1 || true
fi

# 4. Live schalten — nutzt das oben gebaute Image, baut also nicht erneut.
log "Schalte live ..."
docker compose up -d --quiet-pull
chown -R 1000:1000 "$REPO/.git" 2>/dev/null || true
log "Deploy erfolgreich. Laufender Commit: ${NEU:0:7}"
