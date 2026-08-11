# Avorix Website — Agenten-Instruktionen

## Tech-Stack
- **Framework:** Astro 5 (Static Site Generator)
- **Styling:** Tailwind CSS v4
- **Sprachen:** Deutsch (default) + Englisch
- **Deployment:** Docker (Nginx) hinter Traefik auf VPS 72.61.184.225

## Projektstruktur

```
src/
  components/    → Wiederverwendbare UI-Komponenten (.astro)
  i18n/          → Übersetzungen (translations.ts)
  layouts/       → Seitenlayout (BaseLayout.astro)
  pages/         → Seiten (DE root, EN unter /en/)
  styles/        → Globales CSS + Tailwind Theme
public/          → Statische Assets (Logo, Favicon)
```

## Content bearbeiten

### Texte ändern
Alle UI-Texte stehen in `src/i18n/translations.ts`:
- Schlüssel wie `hero.tagline`, `benefits.1.title` etc.
- Immer beide Sprachen (de + en) pflegen
- Umlaute direkt verwenden (ä, ö, ü, ß)

### Neue Seite hinzufügen
1. Deutsche Version: `src/pages/seitenname.astro`
2. Englische Version: `src/pages/en/pagename.astro`
3. Navigation in `src/components/Header.astro` und `Footer.astro` ergänzen
4. Übersetzungsschlüssel in `translations.ts` hinzufügen
5. Pfad-Mapping in `src/components/LanguageSwitcher.astro` ergänzen

### Styling
- Tailwind-Klassen direkt in Komponenten
- Farben: `avorix-dark` (#1a1a1a), `avorix-gray` (#4a4a4a), `avorix-silver` (#9a9a9a), `avorix-light` (#e8e8e8), `avorix-white` (#f5f5f5)
- Font: Inter (via Google Fonts)

## Build & Deploy

### Lokal testen
```bash
npm install
npm run dev      # Dev-Server auf Port 4321
npm run build    # Statischen Build erstellen
```

### Auf VPS deployen — laeuft automatisch, mit Test-Gate

Ein Cron ruft alle 5 Minuten `scripts/deploy.sh` auf. Das Skript holt neue
Commits von `master`, baut das Image, startet daraus einen **Testcontainer**,
laesst die Playwright-Suite dagegen laufen und schaltet **nur bei gruenen
Tests** live. Faellt ein Test, bleibt der Live-Stand unangetastet und der
Arbeitsbaum wird zurueckgenommen — der naechste Lauf versucht es erneut.

Ohne neue Commits endet das Skript sofort: Getestet wird nur, was auch
ausgerollt wird.

**Notausstieg**, falls das Gate selbst klemmt und die Seite trotzdem live muss:
```bash
touch /docker/avorix-website/.deploy-gate-aus   # Deploy ohne Tests
rm /docker/avorix-website/.deploy-gate-aus      # wieder scharf stellen
```

Log: `/var/log/avorix-deploy.log`. Von Hand anstossen:
`bash /docker/avorix-website/scripts/deploy.sh`

### Tests
```bash
npx playwright test          # baut selbst und startet den Vorschau-Server
```
Gegen eine laufende Instanz (so laeuft das Gate):
```bash
PW_BASE_URL=http://<host> npx playwright test
```
Der GTM-Test braucht Zugriff auf googletagmanager.com. Wo die Domain geblockt
ist (manche Arbeitsplaetze), ueberspringt er sich mit klarer Meldung — die
verbindliche Pruefung passiert im Gate auf dem Server.

## Wichtige Regeln
- Keine Änderungen an `docker-compose.yml` oder `Dockerfile` ohne Abstimmung
- Traefik-Konfiguration nicht anfassen
- Build immer lokal testen bevor Deployment
- Bilder im `public/` Ordner ablegen (werden 1:1 kopiert)
