# Anweisung 40 · Teil B.4 — Band-Zuordnung: Vorschlag für die übrigen Seiten

Stand: 2026-09-01 · An: Simon / FORMM · Von: Paperclip/Claude Code

`/personal` und `/koch-app` sind bereits nach den Tabellen in Teil B gesetzt (im
Code umgesetzt). Für alle anderen Seiten wurden – wie in B2.4 verlangt – alle
unsichtbaren `style="background: var(--papier)"` entfernt; **Bänder sind dort noch
nicht gesetzt**, bis ihr diese Zuordnung freigebt.

Regeln aus B2.3, hier angewandt:
- Höchstens zwei Bänder je Seite, zusätzlich zum einen dunklen Block.
- Ein Band klammert zusammengehörige Sektionen, nie eine isolierte.
- Zwischen zwei Bändern liegt mindestens eine **farblose** Sektion (der dunkle
  Block zählt nicht als Trenner, weil er selbst eine Fläche ist).
- Erstes Band frühestens ab Sektion 2. Der Hero (0) trägt nie ein Band.

Der Vorschlag ist bewusst **konservativ** (meist ein Band je Seite). Dünne Seiten
bleiben ganz ohne Band – das ist laut B2.4 unkritisch.

## Bereits gesetzt (Referenz)

| Seite | Bänder (Sektions-Nr.) | Begründung |
|---|---|---|
| `/personal` | 3–5; 12–13 | Ablauf-Kapitel; Entscheidungsstelle |
| `/koch-app` | 2; 5 | Funktionsübersicht; Zusatzangebot |

## Vorschlag – deutsche Seiten

| Seite | Band(er) | Begründung (3 Worte) |
|---|---|---|
| `/` (Startseite) | 4–5 | Avorix vorgestellt |
| `/system` | — | Inhalte prüfen* |
| `/schulung` | — | zu dünn |
| `/pilotprogramm` | 2–3 | Angebot & Ablauf |
| `/ueber-uns` | 2–3 | Haltung/Ansatz |
| `/fuer-hotels` | 2–3 | System & Idealfall |
| `/fuer-restaurants` | 2–3 | System & Karte |
| `/fuer-sporthotels` | 2–3 | System & Idealfall |
| `/fuer-catering` | 2–3 | System & Idealfall |
| `/fuer-kantinen` | 2–3 | System & Idealfall |
| `/personal/bodensee` | 3–4 | Einsatz-Kapitel |
| `/personal/frankfurt` | 3–4 | Einsatz-Kapitel |
| `/personal/muenchen` | 3–4 | Einsatz-Kapitel |
| `/personal/tirol` | 3–4 | Einsatz-Kapitel |
| `/leitfaden` | — | zu dünn |
| `/kontakt` | — | reine Formularseite |
| `/wissen` (Index) | — | reine Liste |
| `/wissen/*` (5 Artikel) | — | Prosa, ein Kapitel |
| `/datenschutz`, `/impressum` | — | Rechtstext |

\* `/system`: Die mittleren Sektionen tragen keine sichtbare H2 (Modulkarten).
Vorschlag zurückgestellt, bis der Aufbau geklärt ist.

## Vorschlag – englische Seiten (spiegeln die deutschen)

| Seite | Band(er) | Begründung |
|---|---|---|
| `/en` | 4–5 | Avorix vorgestellt (wie `/`) |
| `/en/cook-app` | 2; 5 | wie `/koch-app` |
| `/en/staff` | 3–4; 12 | wie `/personal` (Struktur leicht anders) |
| `/en/pilot-program` | 2–3 | wie `/pilotprogramm` |
| `/en/system` | — | Inhalte prüfen* |
| `/en/training` | — | zu dünn |
| `/en/about` | — | einseitig |
| `/en/contact` | — | Formularseite |
| `/en/privacy`, `/en/legal-notice` | — | Rechtstext |

Sobald ihr die Zuordnung freigebt (oder korrigiert), setzen wir die
`class="section-band"` an den benannten Sektionen – genau wie auf `/personal`
und `/koch-app` bereits geschehen.
