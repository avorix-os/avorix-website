# Paperclip-Anweisung 06: Neues Design „Meisterbetrieb" (V5.1, Kupfer) implementieren

Stand: 2026-08-03 · Autor: Simon Förstemann · Freigegeben: Simon + Uwe · Für: avorix.cloud (alle Seiten, DE + EN)

**Visuelle Referenz (mitgeliefert, verbindlich):**
1. `avorix-design-v5.1-meisterbetrieb-kupfer.pdf` — so sehen Startseite, /koch-app und /fuer-hotels im Ziel-Design aus.
2. `referenz-v5.1-kupfer.html` — dieselben Seiten als HTML zum Inspizieren (Werte nachmessen erlaubt; die Tokens unten sind die Wahrheit).

---

## 0. Lese-Konventionen und harte Regeln

1. **Nur das Design ändern.** Alle Texte, Seitenstrukturen, URLs, das Tracking (GTM/GA4, dataLayer-Events, data-cta-location), SEO/GEO-Elemente (Meta, Schema, llms.txt, Sitemap) und das Cookie-Banner-VERHALTEN bleiben exakt wie sie sind. Diese Anweisung ersetzt ausschließlich die visuelle Schicht.
2. **Token-first:** Alle Farben, Schriften, Radien und Schatten kommen aus den CSS-Variablen in Abschnitt 1. Keine hartcodierten Hexwerte in Komponenten.
3. **Violett-Purge:** Die bisherige violette Akzentfarbe verschwindet vollständig aus der Website (Buttons, Links, Icons, Fokus-Ringe, Hover). Einzige erlaubte violette Flächen: die echten App-Screenshots (Bilddateien bleiben unverändert).
4. **Ein Primär-Button pro Sichtbereich.** Wo heute zwei gleichwertige Buttons stehen, wird der zweite zum Sekundär-Button (Outline).
5. **Bilder niemals einfärben:** keine Farbfilter, keine Duoton-/Sepia-/Kupfer-Tönung, keine farbigen Overlays auf Fotos. Fotos zeigen natürliches Licht, so wie die Dateien geliefert werden. Die Website darf insgesamt nicht „kupferlastig" wirken: Kupfer ist AKZENT (Buttons, betonte Wörter, kleine Elemente), nie Fläche.
6. Kein Modul auslassen: Abschnitt 3 listet ALLE Komponenten der Live-Seite. Findet Paperclip eine Komponente, die dort fehlt, wird sie VOR der Umsetzung gemeldet und nicht frei gestaltet.

## 1. Design-Tokens (CSS Custom Properties, global)

```css
:root{
  /* Farben */
  --papier:#F7F6F2;        /* Seitenhintergrund */
  --flaeche:#FFFFFF;       /* Karten, Formulare */
  --eisen:#26251F;         /* Nav, Footer, dunkle Sektionen, Screenshot-Kopfleisten */
  --druck:#1F1E1A;         /* Fließtext, Headlines */
  --grau:#6E6A60;          /* Sekundärtext */
  --linie:rgba(38,37,31,.14);
  --akzent:#A8532B;        /* KUPFER: Links, betonte Wörter, Icons, Fokus */
  --akzent-bg:#A8532B;     /* Primär-Button-Fläche */
  --akzent-fg:#FFFFFF;     /* Primär-Button-Text */
  --akzent-hell:#E09B63;   /* Kupfer HELL: Eyebrows/Links/Zahlen auf dunklen Flächen (identisch zur App, Anweisung 07) */
  --fehler:#B3372B;        /* Formular-Fehler (bewusst ≠ Akzent) */
  --marker:#F3D9C8;        /* Text-Selection, dezente Hervorhebungsfläche */
  --flaeche-hover:#F1EFE9; /* Hover-Hintergrund für Dropdown-/Listeneinträge */

  /* Typografie */
  --f-head:'Avenir Next','Avenir','Nunito Sans','Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;
  --f-body:'Helvetica Neue',Helvetica,Arial,sans-serif;
  --f-mono:Menlo,Consolas,monospace;

  /* Form */
  --radius:6px;
  --schatten:0 1px 2px rgba(38,37,31,.05), 0 6px 20px rgba(38,37,31,.06);
  --schatten-hover:0 4px 10px rgba(38,37,31,.07), 0 16px 36px rgba(38,37,31,.1);
}
```

Grundlagen: `body{background:var(--papier); color:var(--druck); font-family:var(--f-body); font-size:17px; line-height:1.6; -webkit-font-smoothing:antialiased}`. Sektionsabstand vertikal 84px (mobil 56px). Inhaltsbreite max. 1040–1100px zentriert. `::selection{background:var(--marker); color:var(--druck)}`.

**Fokus:** `:focus-visible{outline:3px solid var(--akzent); outline-offset:2px}` auf allen interaktiven Elementen — bewusst `:focus-visible`, NICHT `:focus` (kein Ring beim Maus-Klick, voller Ring bei Tastaturbedienung). Zusätzlich `:focus{outline:none}` nur dort, wo `:focus-visible` greift.

**Anker-Scrollen:** `html{scroll-behavior:smooth}`, aber innerhalb von `@media (prefers-reduced-motion: no-preference)` — bei reduzierter Bewegung springt die Seite.

## 2. Typografie-Skala

| Rolle | Schrift | Größe | Details |
|---|---|---|---|
| H1 | --f-head, 700 | clamp(30px, 4.4vw, 52px) | line-height 1.14, letter-spacing -0.008em, max. ~16ch |
| H2 | --f-head, 700 | clamp(22px, 2.9vw, 32px) | wie H1 |
| H3 / Kartentitel | --f-head, 700 | 20px | |
| Lead-Absatz | --f-body | 18px | max. 56ch |
| Fließtext | --f-body | 17px | Sekundärtext in --grau |
| Eyebrow/Labels | --f-mono, 700 | 11px | uppercase, letter-spacing .18em, Farbe --akzent (auf dunklen Flächen --akzent-hell) |
| Buttons | --f-head, 700 | 16px | gleiche Familie wie Headlines = ein Stimm-Klang |
| Bildunterschriften | --f-body | 14px | --grau |

**Betonte Wörter in Headlines** (heute teils farbig/markiert): als `<mark>` oder `<em>` auszeichnen und in KUPFER-Textfarbe rendern (keine Hintergrund-Hinterlegung in diesem Design). Der Peak-End-Satz „Es ist geregelt." ist die EINZIGE Serifen-Stelle: Charter/Georgia kursiv, 24px.

## 3. Komponenten-Inventar (vollständig) und Ziel-Design

### 3.1 Navigation (alle Seiten)
- Dunkle Leiste (--eisen), Logo links (helle Wortmarke, Höhe 26px), Links 14.5px in Papierweiß mit 82% Opazität, 100% bei Hover.
- **Hover-Unterstrich:** 2px, wächst von links (transform scaleX 0→1, .2s).
- **Dropdown-Gruppen „Unser System" und „Für wen" bleiben Dropdowns:** Panel = weiße Fläche, --radius, --schatten, Einträge 15px mit 10px 14px Padding, Hover-Hintergrund var(--flaeche-hover). Kein Violett im aktiven Zustand, aktiver Eintrag = Kupfer-Text. **Öffnen:** Panel erscheint mit opacity 0→1 + translateY(-4px→0) in 0.16s (bei reduced-motion: sofort).
- CTA „Demo vereinbaren" rechts: Papierweiße Fläche, Eisen-Text, --radius (auffällig auf dunkler Leiste). Hover: brightness 1.06.
- **Sprach-Umschalter „English"** bleibt an gleicher Stelle, gleiche Link-Optik.
- **Mobil (<900px):** Burger-Menü; Panel als Vollflächen-Overlay in --eisen, Links 18px, Touch-Ziele min. 48px, Dropdown-Gruppen als aufklappbare Abschnitte.

### 3.2 Hero (jede Seite)
- Aufbau: Eyebrow (mono, Kupfer) → H1 → Lead → Buttons → ✓-Badge-Zeile. Bei Seiten mit Hero-Bild: Split ~52/48, Bild rechts mit --radius und --schatten.
- ✓-Badges: als schlichte Zeile oder Chips auf --flaeche mit --linie-Rahmen; das ✓ in Kupfer. Kein Violett.

### 3.3 Buttons (global)
- Primär: Kupfer-Fläche, weißer Text, 700, 16px, min-height 50px, Padding 13px 28px, --radius, --schatten. Hover brightness 1.08, Active translateY(1px).
- Sekundär: 1.5px Rahmen --linie, Text --druck, Fläche --flaeche. Hover: Rahmen+Text Kupfer.
- Text-Links im Fließtext: Kupfer, Unterstrich bei Hover.

### 3.4 Stempel (AÜ-Signatur)
Rahmen 1.5px Kupfer, Kupfer-Text, mono 12px 700, uppercase, letter-spacing .14em, Padding 8px 14px, Radius 3px, Fläche --flaeche, Rotation -1°, richtet sich bei Hover auf 0° auf. Einsatz: Hero-Badge „Geprüft · AÜ-Erlaubnis", Verstärkungs-Karte, Peak-End.

### 3.5 Karten allgemein (Schmerz-Karten, „Warum Avorix", Angebots-/Passt-Listen, …)
Weiße Fläche, 1px --linie, --radius, --schatten, Innenabstand 22–24px. Hover: translateY(-3px) + --schatten-hover. **VERBOTEN: farbige Akzentbalken an Kartenoberkanten** (KI-Klischee).

### 3.6 Modul-Karten (Unser System / Die Schulung / Die Verstärkung)
Wie 3.5, zusätzlich Kopfzeile: mono-Label („MODUL 1") gefolgt von einer **Speisekarten-Punktlinie** bis zum rechten Rand (1.5px dotted, rgba(38,37,31,.35)). Verstärkungs-Karte trägt den AÜ-Stempel unten.

### 3.7 Nummerierte Schritte (1–4, auf /, /system, /pilotprogramm, Segmentseiten)
Nummern-Chip: mono, Kupfer-Text, dezenter Kreis/Chip auf --flaeche mit --linie. Kein gefüllter violetter Kreis mehr. Schritte gerade gestellt, großzügiger Abstand.

### 3.8 Türen-Sektion „Wo stehen Sie gerade?" (Startseite) und Problem→Antwort-Zeilen
- Türen: 3 Karten nach 3.5 mit eigenem Sekundär-Button je Tür (nur EINE Tür darf den Primär-Button tragen: „Jetzt Hilfe holen").
- Wo Problem→Antwort-Paare vorkommen: **Pfeilzeilen-Muster** = eine Karte pro Paar, eine Zeile: fetter Problemsatz, gezeichneter SVG-Pfeil in Kupfer, Antwortsatz. SVG-Pfeil exakt: `<svg width="22" height="11" viewBox="0 0 24 12" fill="none"><path d="M1 6h20m0 0-4.5-4.5M21 6l-4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`. Hover: Pfeil schiebt 5px nach rechts, Kartenrahmen wird Kupfer.

### 3.9 App-Screenshot-Rahmen (alle Screenshot-Slots aus Anweisung 05)
Karte mit dunkler Kopfleiste (--eisen, mono 10.5px, uppercase, Label wie „REZEPTSCHRITT"), darunter Screenshot, darunter Bildunterschrift 14px --grau. Screenshots bleiben unverändert violett (echtes UI).

**Lightbox (Klick auf Screenshot):**
- Overlay rgba(20,20,19,.9), Bild max. 94vw/90vh, `cursor:zoom-in` auf den Screenshots.
- **Öffnen animiert:** Overlay opacity 0→1 (0.2s), Bild scale 0.97→1 + opacity (0.2s ease-out). Schließen umgekehrt. Bei reduced-motion: ohne Animation.
- Schließen per Klick aufs Overlay, per Esc UND per sichtbarem ✕-Button oben rechts (44px Touch-Ziel, Papierweiß).
- Die Bildunterschrift der Karte erscheint unter dem Lightbox-Bild (14px, Papierweiß 70%).
- **A11y:** `role="dialog"` + `aria-modal="true"`, Fokus springt beim Öffnen auf den ✕-Button und beim Schließen zurück zum Auslöser; Body-Scroll ist gesperrt, solange die Lightbox offen ist.

### 3.10 Dunkle Beweis-Sektion (z.B. HACCP auf /koch-app, Scheinselbständigkeits-Block auf /personal)
Voller Hintergrund --eisen, Text in Papierweiß, Eyebrow/Links/betonte Zahlen in var(--akzent-hell) — auf dunklen Flächen NIE das dunkle Kupfer --akzent verwenden (zu wenig Kontrast). Screenshot-/Bild-Karte daneben wie 3.9.

### 3.11 Segment-Teaser (Startseite „Für wen")
Bild-Karten: Foto oben (Höhe ~180px, object-fit cover), Label-Zeile darunter mit Titel (--f-head 17px) und dem SVG-Pfeil in Kupfer rechts. Ganze Karte ist Link (Textfarbe --druck, KEIN Browser-Blau), Hover-Lift.

### 3.12 Gründer-/Zitat-Block
Split Bild+Text nach Hero-Muster. Zitate: normale Typo mit Anführungszeichen, kein Sonderstyling nötig; Name darf beim INTERIM-Symbolbild nicht ans Bild (Regel aus Anweisung 05 gilt weiter).

### 3.13 FAQ-Accordion (auf fast allen Seiten)
Einträge als Liste mit 1px --linie-Trennern (keine Karten-Stapel). Frage: --f-head 700 17px, Chevron rechts in Kupfer, dreht bei Öffnung (0.2s). Antwort: 16px --grau, Padding unten 18px. **Öffnen animiert:** Antwort gleitet auf statt zu springen — `grid-template-rows: 0fr→1fr` (0.25s ease) auf einem Wrapper mit `overflow:hidden` (robuster als max-height-Hacks); bei reduced-motion ohne Animation. Fokus-Ring Pflicht. Verhalten (auf/zu, ggf. Schema-Markup) unverändert.

### 3.14 Formulare (Pilotprogramm-Anfrage, Kontaktformular)
Felder: --flaeche, 1px --linie, --radius, Innenabstand 14px 16px, 16px Schrift, Label darüber (nicht nur Placeholder). Fokus: Rahmen Kupfer + Fokus-Ring. Select wie Textfeld. Fehlermeldungen: klarer Satz unter dem Feld in var(--fehler) (nicht Kupfer, damit Fehler ≠ Akzent). Absenden = Primär-Button. Formspree-Anbindung und Events (pilot_bewerbung, generate_lead) NICHT anfassen.

### 3.15 Kontakt-Seite Spezialmodule
„Termin auswählen"-Kalender-Einbindung: umgebende Karte nach 3.5; der Button zum Kalender = Primär-Button. E-Mail-Angabe als Kupfer-Link.

### 3.16 Lead-Magnet-Block (Leitfaden „5 Strategien…", Seitenende Startseite)
Karte nach 3.5 mit Sekundär-Button; Download-Event unverändert.

### 3.17 Preis-/Pilotkonditionen-Sektionen
Reine Typo-Blöcke nach Abschnitt 2; Zahlenangaben dürfen mono gesetzt werden. Kein Violett.

### 3.18 Peak-End (JEDE Seite, letzter Block vor dem Footer)
Zentriert: AÜ-Stempel → „Es ist geregelt." (Charter kursiv 24px) → EIN Primär-Button. Keine weiteren Elemente daneben.

### 3.19 Footer
--eisen, helle Wortmarke links (22px hoch), rechts mono 13px, Papierweiß 55% Opazität: Firmenzeile + Links Impressum/Datenschutz (Hover 100%). Gleicher Footer auf /impressum, /datenschutz, /kontakt.

### 3.20 Cookie-Consent-Banner (aus Anweisung 04)
NUR Optik anpassen: Fläche --flaeche, --radius, --schatten, Titel --f-head, „Alle akzeptieren" = Primär-Button (Kupfer), „Alle ablehnen" + „Einstellungen" = Sekundär/Textlink wie in Anweisung 04 hierarchisiert. Ebene 2 (Kategorien-Schalter): Schalter in Kupfer statt Violett. Texte, Logik, Speicherung, Events: UNVERÄNDERT.

### 3.21 Sonderseiten
/impressum + /datenschutz: Typo-Seiten nach Abschnitt 2 (max. 72ch Textbreite). /en-Seiten: identisches Design, alle Regeln gelten 1:1.

## 4. Mikro-Interaktionen und Effekte (global, dezent)

Grundhaltung: Die Effekte sollen sich anfühlen wie ein gut geführter Betrieb — ruhig, präzise, nie verspielt. Lieber wenige, konsequent gleiche Bewegungen als viele verschiedene.

### 4.1 Hover/Active (CSS)
- Transitions NUR auf transform/box-shadow/filter/border-color/opacity, 0.18s ease. Nie auf Layout-Eigenschaften (width/height/margin).
- Karten/Screens: Hover-Lift translateY(-3px) + --schatten-hover. Fotos in Bild-Containern: scale 1.025 über 0.6s bei Hover (Container mit overflow:hidden).
- Nav-Unterstrich (wächst von links), Stempel-Aufrichten (-1°→0°), Pfeil-Slide (+5px): wie in den Komponenten beschrieben.
- Buttons: Hover brightness 1.08, Active translateY(1px) — der „Druckpunkt".

### 4.2 Scroll-Reveal (der eine sichtbare Auftritts-Effekt)
- Sektions-Inhalte (Headline-Block, Karten-Raster, Bild-Karten) erscheinen beim ersten Ins-Bild-Scrollen mit **opacity 0→1 + translateY(14px→0), 0.5s ease-out, einmalig** (IntersectionObserver, threshold ~0.15).
- Karten innerhalb eines Rasters dürfen mit 60ms Versatz nacheinander erscheinen (max. 4 Elemente gestaffelt, danach gleichzeitig).
- Der Hero der jeweiligen Seite erscheint SOFORT ohne Reveal (LCP nicht verzögern).
- **Robustheit (Pflicht):** Ohne JavaScript ist alles sichtbar (Ausgangszustand „sichtbar", die Verstecken-Klasse setzt erst JS). Nur transform/opacity animieren = kein CLS. Bei `prefers-reduced-motion: reduce` erscheint alles sofort.

### 4.3 Overlays
- Dropdown-Panels, Lightbox, Mobile-Menü: Auf-/Abtritt wie in 3.1/3.9 beschrieben (opacity + minimale Bewegung, 0.16–0.2s). Das Mobile-Overlay gleitet nicht seitlich rein, sondern blendet auf (ruhiger).

### 4.4 Abschaltung
- **`prefers-reduced-motion: reduce` schaltet ALLE Transitions, Reveals und Overlay-Animationen ab** (Inhalte erscheinen sofort, Zustände wechseln hart).

## 5. Bilder (Klarstellung)

1. Slot-Zuordnung und Alt-Texte aus **Anweisung 05** gelten unverändert (inkl. Hero-Update „koeche-am-pass-mit-tablet.jpg", separat geliefert).
2. **Natürliches Licht:** Bilder werden ohne jegliche Tönung ausgespielt. Keine CSS-Filter, keine Overlays, keine „Erwärmung". Falls ein Bild im Layout zu warm wirkt, wird das gemeldet (wir liefern dann eine neutralere Bildversion), NICHT per CSS korrigiert.
3. Bild-Container: --radius + --schatten, object-fit cover.

## 6. Responsive-Regeln

- Breakpoint ~900px: Splits stapeln (Bild über Text), Karten-Raster auf 1 Spalte, Nav → Burger.
- Touch-Ziele überall min. 48px. Basisschrift bleibt 17px, H1 min. 30px.
- Kein horizontales Scrollen auf keiner Seite (375px-Viewport testen).

## 7. Abnahmeprotokoll (alle Punkte müssen PASS sein)

| Nr. | Test | PASS-Kriterium |
|---|---|---|
| 1 | Violett-Purge | Außerhalb der App-Screenshots existiert kein violetter Farbwert mehr (Code-Suche nach alten Hexwerten) |
| 2 | Token-Nutzung | Stichprobe: Komponenten nutzen die CSS-Variablen, keine Streu-Hexwerte |
| 3 | Alle Seiten | /, /system, /koch-app, /schulung, /personal, /pilotprogramm, /ueber-uns, /fuer-hotels, /fuer-restaurants, /fuer-sporthotels, /kontakt, /impressum, /datenschutz + alle /en-Pendants im neuen Design |
| 4 | Dropdowns + Mobile-Nav | Dropdown-Panels und Burger-Menü funktionieren mit Tastatur (Tab/Enter/Esc) und zeigen Fokus |
| 5 | Lightbox | Screenshots öffnen im Popup, Esc/Klick schließt |
| 6 | Kontrast | Text auf Papier/Weiß und auf Eisen erfüllt WCAG AA; Kupfer nur in geprüften Kombinationen (Kupfer-Text auf Weiß/Papier: ok) |
| 7 | Peak-End | Jede Inhaltsseite endet mit Stempel + Satz + genau einem Primär-Button |
| 8 | Reduced Motion | Mit OS-Einstellung „Bewegung reduzieren" gibt es keine Animationen |
| 9 | Tracking/Consent | Alle dataLayer-Events feuern unverändert; Consent-Verhalten identisch (Playwright-Tests aus Anweisung 04 grün) |
| 10 | Performance | Lighthouse: CLS < 0.02, keine neuen Webfont-Downloads (Systemschriften!), Score ≥ 90 mobil |
| 11 | KI-Klischee-Check | Keine Akzentbalken auf Karten, keine Violett-Gradienten, kein Emoji als Icon-Ersatz |
| 12 | Bilder | Kein CSS-Filter auf irgendeinem Foto (Code-Suche nach `filter:` in Bild-Kontexten) |
| 13 | Scroll-Reveal robust | Mit deaktiviertem JavaScript sind alle Inhalte sichtbar; Reveal verursacht kein CLS (nur transform/opacity); Hero erscheint ohne Verzögerung |
| 14 | Lightbox-A11y | Fokus wandert beim Öffnen in die Lightbox und beim Schließen zurück; Body scrollt nicht, solange sie offen ist; ✕-Button per Tastatur erreichbar |
| 15 | Fokus-Verhalten | Maus-Klick erzeugt KEINEN Fokus-Ring, Tab-Navigation zeigt ihn überall (`:focus-visible` korrekt umgesetzt) |

## 8. Vorab-Bestätigungen (vor Umsetzung durch Paperclip)

1. Alle Komponenten aus Abschnitt 3 wurden im Code gefunden; zusätzliche, hier nicht gelistete Komponenten werden VOR dem Umbau gemeldet.
2. Avenir Next ist als System-Schrift-Stack umgesetzt (KEIN Webfont-Einkauf/-Download; die Fallback-Kette aus Abschnitt 1 wird exakt übernommen).
3. Tracking-, Consent- und SEO-Schicht bleiben nachweislich unangetastet (Diff zeigt nur Styling-Dateien/Klassen).
