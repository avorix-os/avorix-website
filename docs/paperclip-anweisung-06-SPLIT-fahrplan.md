# Anweisung 06 „Meisterbetrieb" (V5.1 Kupfer) — Umsetzungs-Fahrplan (gesplittet)

**Zweck:** Die große Design-Anweisung 06 wird NICHT als ein Sammelauftrag umgesetzt, sondern in
kleine, je-für-sich abnehmbare Einheiten. Es wird immer nur die **nächste** Einheit ins Board
gegeben; erst nach Abnahme folgt die nächste. Grund: kleine, isolierte Aufträge werden
zuverlässig fehlerfrei umgesetzt, große Sammelaufträge nicht.

**Quelle der Wahrheit:** `docs/paperclip-anweisung-06-design-meisterbetrieb-kupfer.md`
(Tokens = Abschnitt 1, Typo = Abschnitt 2, Komponenten = Abschnitt 3, Effekte = 4, Bilder = 5,
Responsive = 6, Abnahme = 7). Visuelle Referenz: `docs/avorix-design-v5.1-meisterbetrieb-kupfer.pdf`.

**Harte Rahmenregeln für JEDE Einheit (aus Abschnitt 0):**
- Nur die visuelle Schicht ändern. Texte, Seitenstruktur, URLs, Tracking (GTM/GA4, dataLayer,
  `data-cta-location`), SEO/Schema/llms.txt/Sitemap und das Cookie-Banner-VERHALTEN bleiben exakt.
- Token-first: Farben/Radien/Schatten nur aus den CSS-Variablen (Abschnitt 1), keine Streu-Hexwerte.
- Violett-Purge: Indigo/Violett (`--color-brand-*`, `#6366F1`/`#4F46E5`) verschwindet außerhalb der
  echten App-Screenshots vollständig.
- System-Schriften only, KEIN Webfont-Download (Inter-`@font-face` entfällt).
- Bilder nie einfärben (kein `filter:`, keine Overlays auf Fotos).
- `prefers-reduced-motion: reduce` schaltet alle Animationen ab.

**Ausgangslage im Code (Stand Klon master):**
- Tailwind v4, Tokens in `src/styles/global.css` (`@theme` + `:root`), Marke = Indigo.
- Inter als Webfont via `@font-face` in `global.css`.
- Komponenten in `src/components/*.astro`, Seiten in `src/pages/*.astro`, Layout `src/layouts/BaseLayout.astro`.
- Farben werden per Tailwind-Utility-Klassen (`bg-brand-600`, `text-brand` …) UND über `:root`-Semantik-Vars genutzt.

**Liefer-/Deploy-Regel:** Der Paperclip-Agent darf `avorix-website` NICHT pushen (403 ist gewollt).
Fertige Arbeit wird als **Patch** geliefert (`git format-patch`/Code-Block), wir wenden ihn an,
bauen gegen (`npm ci && npm run build`), Sichtprüfung, und pushen selbst. Merge nach `master` = live
ist ein separater, bewusster Schritt (Deploy manuell auf VPS 72.61.184.225).

---

## Einheiten (Reihenfolge = Abhängigkeit)

| # | Einheit | Anweisung-Abschnitte | Abnahme-Bezug (Abschn. 7) |
|---|---|---|---|
| **1** | **Design-Tokens + globale Grundlagen** — neue CSS-Variablen (Abschn. 1) anlegen; Tailwind-`@theme` Marken-/Neutralpalette auf Kupfer+Eisen mappen (Bridge, damit bestehende Utility-Klassen sofort entviolettet sind); Inter-`@font-face` entfernen + System-Schrift-Stacks; `body`-Basis (Papier-BG, 17px/1.6); `::selection`; `:focus-visible`-Ring + `:focus{outline:none}`; `scroll-behavior:smooth` in `reduced-motion:no-preference`; Typo-Skala (Abschn. 2) als globale Heading-Basis. | 1, 2 | 1 (Violett-Purge), 2 (Token-Nutzung), 6 (Kontrast), 10 (keine Webfonts), 15 (Fokus) |
| **2** | **Navigation + Footer** — dunkle Leiste (3.1): Logo, Links + Hover-Unterstrich, Dropdowns „Unser System"/„Für wen" (Panel-Optik + Auf-Animation), CTA-Button, Sprach-Umschalter, Burger/Mobile-Overlay. Footer (3.19). | 3.1, 3.19 | 3, 4 |
| **3** | **Buttons + Stempel** — Primär/Sekundär/Text-Link global (3.3); AÜ-Stempel (3.4); Regel „ein Primär-Button pro Sichtbereich" (0.4). | 3.3, 3.4, 0.4 | 7, 11 |
| **4** | **Hero + ✓-Badges** — Aufbau Eyebrow→H1→Lead→Buttons→Badges, Split mit Bild (3.2). | 3.2 | 3, 6 |
| **5** | **Karten-System** — Karten allgemein (3.5, KEIN Akzentbalken), Modul-Karten mit Punktlinie (3.6), nummerierte Schritte (3.7). | 3.5, 3.6, 3.7 | 11 |
| **6** | **Türen / Pfeilzeilen / Segment-Teaser** — „Wo stehen Sie gerade?" (3.8), Problem→Antwort-Pfeilzeilen mit exaktem SVG-Pfeil, Segment-Teaser-Bildkarten (3.11). | 3.8, 3.11 | 11 |
| **7** | **Screenshot-Rahmen + Lightbox** — Rahmen mit dunkler Kopfleiste (3.9); Lightbox inkl. Öffnen-Animation, Esc/✕/Overlay-Klick, A11y (`role=dialog`, Fokus-Fang, Body-Scroll-Lock). | 3.9 | 5, 14 |
| **8** | **Dunkle Beweis-Sektion + Gründer/Zitat** — `--eisen`-Sektion mit `--akzent-hell` (3.10); Gründer-/Zitat-Split (3.12). | 3.10, 3.12 | 6 |
| **9** | **FAQ-Accordion** — Liste mit Linien-Trennern, Chevron Kupfer, `grid-template-rows`-Auf-Animation, reduced-motion, Fokus-Ring. Verhalten/Schema unverändert. | 3.13 | 8, 13 |
| **10** | **Formulare + Kontakt-Module + Lead-Magnet + Preis-Sektionen** — Feld-/Fehler-Optik (3.14, Fehler=`--fehler`≠Akzent), Kontakt-Spezialmodule (3.15), Lead-Magnet (3.16), Preis-/Pilotkonditionen (3.17). Formspree/Events unverändert. | 3.14–3.17 | 9 |
| **11** | **Peak-End + Cookie-Banner-Optik + Sonderseiten** — Peak-End je Seite (Stempel→„Es ist geregelt."-Serifen-Stelle→1 Primär-Button, 3.18); Cookie-Banner NUR Optik (3.20); Impressum/Datenschutz/EN (3.21). | 3.18, 3.20, 3.21 | 7, 9 |
| **12** | **Mikro-Interaktionen + Scroll-Reveal + Responsive + Gesamt-Abnahme** — Hover/Active-Muster, Scroll-Reveal (IntersectionObserver, ohne JS sichtbar, kein CLS), Overlays, reduced-motion global (Abschn. 4); Responsive-Regeln (Abschn. 6); komplette Abnahme-Matrix (Abschn. 7) prüfen. | 4, 6, 7 | 8, 10, 13, alle |

**Nicht frei gestalten:** Findet der CTO eine Komponente, die in Abschnitt 3 fehlt, wird sie VOR der
Umsetzung gemeldet (Regel 0.6), nicht erfunden.

**Offener Punkt (gemeldet):** Die in Abschnitt 5/Kopf genannte zweite Referenz
`referenz-v5.1-kupfer.html` wurde NICHT mitgeliefert (nur das PDF liegt vor). Tokens stehen
vollständig im Anweisungstext; die HTML ist nur zum Nachmessen. Kein Blocker.
