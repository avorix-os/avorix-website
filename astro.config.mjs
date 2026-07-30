import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://avorix.cloud";

// Slot-Tabellen aus Anweisung 05, Abschnitt 3 — Seite → Bilddateien
// /pilotprogramm bewusst ausgelassen (§3.6: keine Bilder)
const PAGE_IMAGES = {
  [`${SITE}/`]: [
    "leerer-pass-morgens.jpg",
    "waage-zutaten.jpg",
    "app-kochmodus-schritt1.png",
    "app-rezept-detail-portionsrechner.png",
    "app-rezepte-liste.png",
  ],
  [`${SITE}/system/`]: [
    "bon-leiste.jpg",
    "schulung-von-hinten.jpg",
  ],
  [`${SITE}/koch-app/`]: [
    "app-kochmodus-schritt1.png",
    "app-kochmodus-schritt2-haccp.png",
    "app-rezept-detail-portionsrechner.png",
    "app-rezepte-liste.png",
    "app-dashboard.png",
    "app-menuplaner-woche.png",
    "app-einkaufsliste.png",
  ],
  [`${SITE}/schulung/`]: [
    "schulung-von-hinten.jpg",
    "anrichten-haende.jpg",
  ],
  [`${SITE}/personal/`]: [
    "dampf-topf.jpg",
  ],
  [`${SITE}/ueber-uns/`]: [
    "vakuumbeutel-kuehlhaus.jpg",
    "koch-von-hinten-pass.jpg",
  ],
  [`${SITE}/fuer-hotels/`]: [
    "hotel-speisesaal.jpg",
    "teller-stapel-reihe.jpg",
  ],
  [`${SITE}/fuer-restaurants/`]: [
    "speiselokal-gastraum.jpg",
    "steak-nahaufnahme.jpg",
  ],
  [`${SITE}/fuer-sporthotels/`]: [
    "sporthotel-speisesaal.jpg",
  ],
};

// Kopiert Originalbilder nach dist/bilder/ für build-stabile, crawlbare Sitemap-URLs.
// Astro-Pipeline erzeugt hash-basierte Namen in _astro/ — diese Kopien bleiben stabil.
const copyBilderToDist = {
  name: "copy-bilder-to-dist",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      const srcBilder = fileURLToPath(new URL("src/assets/bilder/", import.meta.url));
      const dstBilder = fileURLToPath(new URL("bilder/", dir));
      mkdirSync(dstBilder, { recursive: true });
      for (const file of readdirSync(srcBilder)) {
        copyFileSync(join(srcBilder, file), join(dstBilder, file));
      }
    },
  },
};

export default defineConfig({
  site: SITE,
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/produkt"),
      serialize(item) {
        const images = PAGE_IMAGES[item.url];
        if (images) {
          item.img = images.map((filename) => ({
            url: `${SITE}/bilder/${filename}`,
          }));
        }
        return item;
      },
    }),
    copyBilderToDist,
  ],
  i18n: {
    locales: ["de", "en"],
    defaultLocale: "de",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
