# Avorix-Formular-Dienst

Eigener kleiner Dienst, der alle Website-Formulare von avorix.de annimmt und
per E-Mail zustellt. Löst **Formspree** ab (Anweisung 45). Die Daten verlassen
den Server nicht mehr; die Datenschutzerklärung stimmt danach wieder.

Läuft **neben** der (weiterhin statischen) Website: nginx reicht nur den Pfad
`/api/formular` an diesen Dienst auf `127.0.0.1:8081` weiter.

## Was der Dienst tut

- **Eine Kennung je Formular** (Feld `formular`), Betreff wird vom Dienst
  gesetzt (nicht mehr fälschbar über `_subject`).
- **Spamabwehr ohne Drittanbieter:** Honigtopf-Feld + Zeitfalle (< 3 s = Bot);
  Ratenbegrenzung macht nginx. Kein reCAPTCHA/hCaptcha.
- **Validierung:** Pflichtfelder, Feldlängen (Name 100, Betrieb 150, Freitext
  5000), E-Mail-Format, Abweisung von Zeilenumbrüchen in Kopfzeilenfeldern.
- **Zustellung** an `info@avorix.de`, `Reply-To` = Absender, `From` =
  `formular@avorix.de`. **Eingangsbestätigung** an den Absender (außer Bewerbung).
- **Nichts verlieren:** jede Anfrage wird **erst als Datei abgelegt**, dann
  gesendet. Scheitert der Versand, ist die Anfrage trotzdem da (+ Logeintrag,
  optional Failover-Mail).
- **Sparsam:** keine IP in Mail/Log; automatische Löschung nach 90 Tagen
  (Bewerbungen 180).
- **Anhang-Weg** (PDF/JPG/PNG, max 3, zusammen 10 MB, Magic-Byte-Prüfung) ist
  für spätere Bewerbungen vorbereitet.
- **Zwei Antwortarten:** Hintergrundversand → JSON; normale Formularabsendung
  (kein JS) → 303-Redirect (Leitfaden auf die Downloadseite **mit** Schrägstrich).

## Lokaler Test (ohne Server, ohne SMTP)

```bash
cd form-service
npm install
node server.js
```

Der Dienst startet auf `127.0.0.1:8081` und warnt, dass SMTP/Origins leer sind
(DEV). Test-Absendung (JSON-Antwort, Anfrage wird als Datei unter `./data/`
abgelegt, Mailversand schlägt ohne SMTP fehl, Nutzer bekommt trotzdem `ok`):

```bash
curl -s -X POST http://127.0.0.1:8081/api/formular \
  -H 'Accept: application/json' \
  -d 'formular=kontakt&name=Test&email=test@example.com&message=Hallo'
```

## Installation auf dem Server (Phase B)

**Dieser Server läuft über Docker + Traefik** (avorix.de = Container
`avorix-website` auf dem Netz `traefik-proxy`). Der Dienst wird deshalb als
eigener Container ausgeliefert — nicht über systemd/nginx.

Der Code liegt nach dem nächsten Deploy (Cron alle 5 Min, `git pull`) unter
`/docker/avorix-website/form-service`.

```bash
cd /docker/avorix-website/form-service

# .env anlegen (SMTP-Passwort NUR hier, nie ins Repo/Chat)
cp .env.example .env
chmod 600 .env
nano .env         # SMTP_USER=info@avorix.de, SMTP_PASS=<App-Passwort>,
                  # MAIL_FROM=formular@avorix.de, MAIL_TO=info@avorix.de,
                  # ALLOWED_ORIGINS=https://avorix.de,https://www.avorix.de

# Container bauen + starten (Traefik-Routing kommt aus docker-compose.yml)
docker compose up -d --build
docker compose logs -f --tail=30

# Testmail (nach ein paar Sekunden)
curl -s -X POST https://avorix.de/api/formular \
  -H 'Accept: application/json' \
  -d 'formular=kontakt&name=Test&email=DEINE@ADRESSE&message=Servertest'
```

Traefik fängt nur `avorix.de/api/formular` ab (höhere Priorität als der
Website-Router); alles andere bleibt beim `avorix-website`-Container.

> Die Dateien unter `deploy/` (systemd-Unit + nginx-Snippet) sind für einen
> **klassischen Host ohne Docker** gedacht und hier nicht nötig.

**Voraussetzungen, die nur ihr liefern könnt:**
- SMTP-Zugang für `formular@avorix.de` (in `.env`).
- DNS: **SPF, DKIM, DMARC** für die Absenderdomain, sonst landen die Mails im
  Spam.
- Auftragsverarbeitungsvertrag mit dem Hoster (nach dem Umbau der einzige Dritte).

## Rollout (Phase C, Anweisung 45 §4)

1. Dienst live, per `curl` geprüft (Mail kommt an, `Reply-To` stimmt).
2. **Zuerst nur `/pilotprogramm/`** auf `/api/formular` umstellen (kleinstes
   Volumen), eine Woche beobachten.
3. Läuft es, die übrigen Formulare umstellen (ein Deploy, DE + EN).
4. **Erst danach** die alten Formspree-Einsendungen exportieren und das
   Formspree-Konto stilllegen.

## Abnahme

Siehe Anweisung 45 §5 (17 Punkte). Der Dienst deckt Punkte 1–16 ab; DNS
(Punkt 7), Datenschutz-Text (Punkt 12) und Formspree-Export (Punkt 13) sind
Server-/Ops-Schritte in Phase B/C.
