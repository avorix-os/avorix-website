# Paperclip-Anweisung 05: Bilder in die Website einsetzen (SEO + GEO optimiert)

Stand: 2026-07-28 (v2, gegen Live-Seite avorix.cloud abgeglichen) · Autor: Simon Förstemann · Für: avorix.cloud (aktuelle Live-Struktur, KEINE Design-Änderung)

---

## 0. Lese-Konventionen und harte Regeln

1. **Nichts erfinden.** Nur die im Paket gelieferten Bilddateien verwenden, exakt in den unten definierten Slots. Keine anderen Bilder, keine Stock-Downloads, keine KI-Generierung.
2. **Keine Bildbearbeitung.** Keine Filter, keine Farbkorrektur, kein Text auf Bildern. Zuschnitt nur technisch (object-fit im CSS), nie destruktiv.
3. **Texte der Website bleiben unverändert.** Diese Anweisung fügt ausschließlich Bilder ein.
4. **Alt-Texte exakt wie in den Tabellen** übernehmen (Zeichen für Zeichen, sie sind rechtlich geprüft).
5. Die Sektionsnamen in den Tabellen sind die sichtbaren Überschriften der Live-Seite (Stand 28.07.2026). Ein Slot, der hier nicht aufgeführt ist, bekommt KEIN Bild. Abschnitt 7 listet, was bewusst leer bleibt.

## 1. Das Bildpaket

Ordner `bilder/` im ZIP, 21 Dateien:
- **Fotos** (JPEG, max. 2000 px Breite): `hotel-speisesaal.jpg`, `gasthof-stube.jpg`, `sporthotel-speisesaal.jpg`, `leerer-pass-morgens.jpg`, `bon-leiste.jpg`, `vakuumbeutel-kuehlhaus.jpg`, `dampf-topf.jpg`, `waage-zutaten.jpg`, `koch-von-hinten-pass.jpg`, `anrichten-haende.jpg`, `schulung-von-hinten.jpg`, `teller-stapel-reihe.jpg`, `steak-nahaufnahme.jpg`, `anrichten-detail.jpg`
- **App-Screenshots** (PNG, echtes UI aus app.avorix.cloud mit fiktiven Demo-Daten): `app-kochmodus-schritt1.png`, `app-kochmodus-schritt2-haccp.png`, `app-rezept-detail-portionsrechner.png`, `app-rezepte-liste.png`, `app-dashboard.png`, `app-menuplaner-woche.png`, `app-einkaufsliste.png`

**Dateinamen NICHT umbenennen** (sie sind SEO-relevant: sprechend, deutsch, kebab-case).

## 2. Technische Vorgaben (für alle Bilder)

1. **Astro-Bildpipeline verwenden** (`astro:assets`, `<Image>`-Komponente): automatische Formate (WebP/AVIF), responsive `srcset` mit `widths={[480, 800, 1200, 1600]}` und passendem `sizes`-Attribut je Layoutbreite.
2. **`width` und `height` immer setzen** (kein Layout-Shift, CLS = 0 für alle Bild-Slots).
3. **Lazy Loading:** alle Bilder `loading="lazy"` und `decoding="async"`, AUSSER dem jeweils ersten sichtbaren Bild einer Seite (in den Tabellen mit ⚡ markiert): diese bekommen `loading="eager"` und `fetchpriority="high"` (LCP).
4. **Keine Bild-Hotlinks**, alles über den Build ausliefern (immutable, hash-basierte Dateinamen macht Astro automatisch).
5. App-Screenshots (PNG) nicht zu JPEG konvertieren; die Pipeline darf WebP/AVIF daraus erzeugen (Qualität ≥ 90), UI-Text muss scharf bleiben.
6. Fotos als Hero-/Sektionsflächen: `object-fit: cover`, Fokuspunkt Mitte.

## 3. Slot-Tabellen je Seite

Format: Sichtbare Sektions-Überschrift (live) → Datei → exakter Alt-Text. ⚡ = LCP-Kandidat (eager + fetchpriority).

### 3.1 Startseite `/`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| „Kommt Ihnen das bekannt vor?" ⚡ | leerer-pass-morgens.jpg | Leere Hotelküche am Morgen vor dem Service |
| „Was ist Avorix? In einer Minute erklärt." | waage-zutaten.jpg | Digitale Küchenwaage mit einer Schüssel geschnittenem Gemüse in einer Profiküche |
| „So sieht das am Herd aus." Tile 1 („Jeder Schritt mit Foto, Menge und Zeit…") | app-kochmodus-schritt1.png | Screenshot der Avorix Koch-App: Rezeptschritt im Koch-Modus mit Temperatur und Timer |
| „So sieht das am Herd aus." Tile 2 („Heute 80 Gäste statt 60…") | app-rezept-detail-portionsrechner.png | Screenshot der Avorix Koch-App: Portionsrechner skaliert ein Rezept auf 80 Portionen |
| „So sieht das am Herd aus." Tile 3 („Ihre ganze Karte an einem Ort…") | app-rezepte-liste.png | Screenshot der Avorix Koch-App: Rezeptbibliothek mit Kategorien, Zeiten und Kosten pro Portion |

**Kein Bild** im Hero (wartet auf Echtfoto Tablet + App am Pass) und **kein Bild im Gründer-Block** „Von einem Küchenchef gebaut…" (dort steht Börge Penks Name; die Sektion wartet auf sein echtes Portrait, ein Symbolbild ist hier nicht zulässig).

### 3.2 `/system`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| „Unser System. Die Schulung. Die Verstärkung." ⚡ | bon-leiste.jpg | Bon-Leiste mit Bestellzetteln über dem Pass einer Restaurantküche |
| „Vom ersten Gespräch zur Küche, die immer funktioniert." | schulung-von-hinten.jpg | Zwei Köche von hinten am Herd, einer erklärt einen Arbeitsschritt |

### 3.3 `/koch-app`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| Hero (ersetzt den Platzhaltertext „Rezeptschritt-Ansicht auf Tablet, groß") ⚡ | app-kochmodus-schritt1.png | Screenshot der Avorix Koch-App: Rezeptschritt im Koch-Modus mit Temperatur und Timer |
| Karte „1 · Schritt-für-Schritt-Führung" | app-kochmodus-schritt2-haccp.png | Screenshot der Avorix Koch-App: Arbeitsschritt mit rotem HACCP-Kontrollpunkt und 75 Grad Kerntemperatur |
| Karte „2 · Automatischer Portionsrechner" | app-rezept-detail-portionsrechner.png | Screenshot der Avorix Koch-App: Portionsrechner skaliert ein Rezept auf 80 Portionen |
| Karte „3 · Die Rezeptbibliothek" | app-rezepte-liste.png | Screenshot der Avorix Koch-App: Rezeptbibliothek mit Kategorien, Zeiten und Kosten pro Portion |
| Sektion „Und die App organisiert gleich die ganze Küche mit." (Sektions-Aufmacher, vor oder neben den Karten) | app-dashboard.png | Screenshot der Avorix Koch-App: Dashboard mit den Modulen der Küchenverwaltung |
| Karte „Menüplaner" | app-menuplaner-woche.png | Screenshot der Avorix Koch-App: Wochenplan mit Mittagessen und Abendessen inklusive Portionszahlen |
| Karte „Einkaufslisten auf Knopfdruck" | app-einkaufsliste.png | Screenshot der Avorix Koch-App: Einkaufsliste mit Mengen, Einheiten und abgehakten Positionen |

Die Karten „4 · Wareneinsatz im Blick", „5 · Läuft überall", „Kalkulation", „Dienstplan", „Zeiterfassung" und „Klare Rollen" bleiben ohne Bild.

### 3.4 `/schulung`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| Hero ⚡ | schulung-von-hinten.jpg | Zwei Köche von hinten am Herd, einer erklärt einen Arbeitsschritt |
| „Am Herd. Im echten Betrieb. Mit Ihrem eigenen Essen." | anrichten-haende.jpg | Koch richtet ein Gericht mit einer Anrichtepinzette an, Blick über die Schulter |

### 3.5 `/personal`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| Hero ⚡ | dampf-topf.jpg | Dampf über einem Edelstahltopf auf dem Gasherd einer Profiküche |

Auf dieser Seite bewusst keine Personen-Bilder, bis echte Team-Fotos existieren.

### 3.6 `/pilotprogramm`
**Keine Bilder einsetzen.** Die Gründer-Sektion („Wer hinter dem Angebot steht") nennt Börge Penk namentlich und wartet auf sein echtes Portrait. Die Seite bleibt bis dahin bildfrei.

### 3.7 `/ueber-uns`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| „Erst Köche. Dann Abläufe. Dann die App." ⚡ | vakuumbeutel-kuehlhaus.jpg | Beschriftete Vakuumbeutel mit vorbereiteten Zutaten im Kühlraum einer Profiküche |
| „Technologie als Unterstützung. Nicht als Ersatz." | koch-von-hinten-pass.jpg | Küchenchef von hinten am Pass einer Hotelküche während des Betriebs |

**Wichtig:** Der bestehende Platzhalter „Foto Börge Penk" in der Sektion „Der Mann hinter dem System." bleibt UNVERÄNDERT leer bzw. wie er ist. Dort kommt später das echte Portrait hin, KEIN Bild aus diesem Paket.

### 3.8 `/fuer-hotels`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| Hero ⚡ | hotel-speisesaal.jpg | Eingedeckter Speisesaal eines Hotels mit Seeblick am Abend |
| „Halbpension ist ein Versprechen. Jeden Tag aufs Neue." | teller-stapel-reihe.jpg | Viele identisch angerichtete Teller in einer Reihe in einer Großküche |

### 3.9 `/fuer-restaurants`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| Hero ⚡ | gasthof-stube.jpg | Holzvertäfelte Gaststube eines traditionellen Gasthofs mit eingedeckten Tischen |
| „Eine feste Karte ist schneller gesichert, als Sie denken." | steak-nahaufnahme.jpg | Perfekt gebratenes Steak in Nahaufnahme auf dunklem Teller |

### 3.10 `/fuer-sporthotels`
| Sektion (live) | Datei | Alt-Text |
|---|---|---|
| Hero ⚡ | sporthotel-speisesaal.jpg | Moderner Speisesaal eines Sporthotels mit Bergpanorama |

### 3.11 Reserve (im Paket, aktuell OHNE Slot)
`anrichten-detail.jpg` (Alt: „Hände richten ein Gericht auf einem weißen Teller an"). Nur auf Rückfrage einsetzen, nicht eigenmächtig.

## 4. SEO-Vorgaben

1. **Alt-Texte** exakt aus den Tabellen (beschreibend, deutsch, keine Keyword-Ketten).
2. **Open Graph + Twitter Cards pro Seite:** `og:image` = das ⚡-Bild der jeweiligen Seite (absolute URL, gerendert mindestens 1200×630; bei 3:2-Bildern zentriert zuschneiden lassen). Dazu `og:image:width`, `og:image:height`, `og:image:alt` (= Alt-Text aus Tabelle) und `twitter:card = summary_large_image`. Für `/pilotprogramm` (keine Bilder auf der Seite) als og:image `koch-von-hinten-pass.jpg` verwenden.
3. **Bild-Sitemap:** die Bilder in die bestehende sitemap.xml aufnehmen (`<image:image>`-Einträge je Seite) oder sicherstellen, dass alle Bild-URLs crawlbar sind (kein Blockieren in robots.txt).
4. **Strukturierte Daten erweitern:** in den bestehenden Schema.org-Blöcken (aus Anweisung 02, Abschnitt 9b) ergänzen: bei SoftwareApplication das Feld `screenshot` (absolute URL von `app-kochmodus-schritt1.png`); je Seite das ⚡-Bild als `primaryImageOfPage` im WebPage-Schema.
5. **Dateigrößen:** nach Build darf kein ausgeliefertes Bild-Derivat über 300 KB liegen (Ausnahme LCP-Hero bis 450 KB).

## 5. GEO-Vorgaben (Auffindbarkeit für KI-Suchen)

1. **`<figure>`-Markup** für alle App-Screenshots, damit Screenshot und umgebender Funktionstext maschinell als Einheit lesbar sind (sichtbare Captions nur, wenn das bestehende Design welche vorsieht).
2. Die **llms.txt** (aus Anweisung 02) um einen Satz ergänzen: „Die Produktseiten enthalten echte Screenshots der Avorix Koch-App (Koch-Modus mit HACCP-Kontrollpunkten, Portionsrechner, Rezeptbibliothek, Menüplaner, Einkaufslisten)." Nichts weiter ändern.
3. Alt-Texte nennen konsequent „Avorix Koch-App" bei Screenshots (Entitäts-Zuordnung), Fotos bleiben neutral beschreibend.

## 6. Rechtliche Regeln (bindend)

1. **Symbolbild-Regel:** `koch-von-hinten-pass`, `anrichten-haende`, `schulung-von-hinten` (und alle Foto-Motive) niemals in Sektionen einsetzen, in denen ein Personenname steht, und niemals als „unser Team", „unsere Köche" oder mit Namen beschriften, weder im Alt-Text noch in Captions. Die Slot-Tabellen sind bereits danach geprüft, deshalb: exakt an die Tabellen halten.
2. **App-Screenshots** sind echt (app.avorix.cloud, fiktive Demo-Daten) und dürfen als Screenshots der App bezeichnet werden.
3. Keine neuen Text-Behauptungen aus den Bildern ableiten (z.B. keine Bildunterschrift „automatisch erzeugte Einkaufsliste").

## 7. Bewusst OHNE Bild (nicht befüllen)

1. **Startseiten-Hero** (wartet auf Echtfoto Tablet + App am Pass).
2. **Gründer-Block Startseite**, **„Der Mann hinter dem System." auf /ueber-uns**, **„Wer hinter dem Angebot steht" auf /pilotprogramm** (warten auf Börges echtes Portrait; Symbolbilder sind dort tabu).
3. Karten zu den neuen App-Modulen (Buchungen, Bruttobedarf, Inventur, Reservierungen, Menüvarianten): Screenshots folgen mit eigenem Update nach Freigabe.
4. Team-/Personenfotos auf `/personal`.

## 8. Abnahmeprotokoll (alle Punkte müssen PASS sein)

| Nr. | Test | PASS-Kriterium |
|---|---|---|
| 1 | Alle 10 Seiten laden | Jeder Slot aus Abschnitt 3 zeigt das richtige Bild, keine 404-Assets |
| 2 | Alt-Texte | Stichprobe je Seite: Alt-Text identisch mit Tabelle |
| 3 | CLS | Lighthouse CLS < 0.02 auf Startseite, /koch-app, /fuer-hotels |
| 4 | LCP | ⚡-Bilder eager + fetchpriority=high; alle anderen lazy (im DOM prüfbar) |
| 5 | Responsive | Bilder liefern srcset; auf 375 px Viewport wird kein Bild > 800 px Breite geladen |
| 6 | Formate | Auslieferung als WebP/AVIF; Screenshot-Text scharf lesbar |
| 7 | og:image | Jede der 10 Seiten liefert og:image + twitter:card (per Meta-Tag-Check) |
| 8 | Schema | primaryImageOfPage bzw. screenshot-Feld valide (Rich-Results-Test ohne Fehler) |
| 9 | Größen | Kein ausgeliefertes Derivat > 300 KB (Hero ≤ 450 KB) |
| 10 | Namens-Regel | In keiner Sektion mit einem Bild aus diesem Paket steht ein Personenname; „Foto Börge Penk"-Platzhalter unangetastet |

## 9. Vorab-Bestätigungen (vor Umsetzung durch Paperclip zu bestätigen)

1. Alle Sektions-Überschriften aus Abschnitt 3 wurden in der aktuellen Codebasis gefunden; Abweichungen werden VOR dem Einbau gemeldet, nicht selbst umgedeutet.
2. Kein Bild wird für andere als die genannten Slots verwendet.
3. Die Astro-Bildpipeline ist verfügbar; falls nicht, wird das VOR dem Einbau gemeldet (dann liefern wir vorgerenderte Größen nach).
