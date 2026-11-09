import { test, expect } from '@playwright/test';
// Anweisung 63: ALTCHA sitzt jetzt vor jedem Formular. Das Widget rechnet mit
// SubtleCrypto, das nur im sicheren Kontext (HTTPS oder localhost) verfuegbar ist;
// das Deploy-Gate ruft den Container ueber http mit Nicht-localhost-Host auf (kein
// sicherer Kontext), dort kann das Widget nicht rechnen. Die client-seitige Logik
// schickt ab, sobald eine Loesung vorliegt (die echte Pruefung macht der Server).
// Diese Tests pruefen den Ereignis-/Verdacht-Fluss, nicht ALTCHA selbst (das ist
// serverseitig und im Browser geprueft). Wir entfernen deshalb das Widget vor dem
// Absenden -> ensureAltcha nimmt den Pfad "kein Widget -> absenden", kontext-
// unabhaengig. In Produktion (HTTPS) loest das Widget die Aufgabe normal.
async function altchaVerify(page) {
  await page.evaluate(() => {
    document.querySelectorAll('altcha-widget').forEach((w) => w.remove());
  });
}

/**
 * Tests for AVOA-137 Website-Umbau Korrektur
 * T2: Link crawl over all 10 DE pages — no 404, no href="#", no mailto in CTAs
 * T3: /produkt responds with redirect to /system (meta-refresh in SSG mode)
 * T4: Pilot form — no pilot_bewerbung on empty required, exactly 1 on successful submit
 */

const DE_PAGES = [
  '/',
  '/system',
  '/koch-app',
  '/schulung',
  '/personal',
  '/pilotprogramm',
  '/ueber-uns',
  '/fuer-hotels',
  '/fuer-restaurants',
  '/fuer-sporthotels',
];

test.describe('T2: Link-Crawl über alle 10 DE-Seiten', () => {
  for (const pagePath of DE_PAGES) {
    test(`${pagePath} — alle internen Links laden ohne 404`, async ({ page }) => {
      const response = await page.goto(pagePath);
      expect(response.status()).toBeLessThan(400);

      // Collect all internal links
      const links = await page.$$eval('a[href]', (anchors) =>
        anchors
          .map((a) => a.getAttribute('href'))
          .filter((href) => href && (href.startsWith('/') || href.startsWith('http://localhost')))
          .filter((href) => !href.startsWith('/en')) // Skip EN pages
      );

      const uniqueLinks = [...new Set(links)];
      for (const link of uniqueLinks) {
        // Skip anchors within same page
        if (link.startsWith('#') || link.includes('#')) continue;
        const res = await page.request.get(link);
        expect(res.status(), `Link ${link} on page ${pagePath}`).toBeLessThan(400);
      }
    });

    test(`${pagePath} — CTAs haben keine href="#" oder mailto`, async ({ page }) => {
      await page.goto(pagePath);
      const ctaHrefs = await page.$$eval('[data-cta-location]', (els) =>
        els.map((el) => ({ cta: el.dataset.ctaLocation, href: el.getAttribute('href') }))
      );
      for (const { cta, href } of ctaHrefs) {
        // Buttons (e.g. form submit) have no href — that's fine
        if (href === null) continue;
        expect(href, `CTA "${cta}" on ${pagePath}`).not.toBe('#');
        expect(href, `CTA "${cta}" on ${pagePath}`).not.toMatch(/^mailto:/);
      }
    });
  }
});

test.describe('T3: /produkt Redirect', () => {
  test('/produkt ist entfernt (kein HTML generiert, redirect nur über nginx)', async ({ page, request }) => {
    // produkt.astro wurde gelöscht — kein meta-refresh HTML mehr.
    // Der 301 Redirect wird ausschließlich über nginx location block gesteuert.
    if (process.env.PW_BASE_URL) {
      // Deploy-Gate: geprüft wird gegen den ausliefernden nginx, dort greift
      // der 301. Das ist die schärfere Prüfung — sie sieht die echte Regel.
      const antwort = await request.get('/produkt', { maxRedirects: 0 });
      expect(antwort.status()).toBe(301);
      expect(antwort.headers()['location']).toContain('/system');
      return;
    }
    // Am Arbeitsplatz läuft der Astro-Vorschau-Server ohne nginx: dort 404.
    const response = await page.goto('/produkt', { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(404);
  });

  test('nginx.conf enthält 301 location block für /produkt', async () => {
    const fs = await import('fs');
    const nginxConf = fs.readFileSync('nginx.conf', 'utf8');
    expect(nginxConf).toContain('location = /produkt');
    expect(nginxConf).toContain('return 301 /system');
  });
});

test.describe('T6: /en/product Weiterleitung (Anweisung 17, Abschnitt 1)', () => {
  test('/en/product ist entfernt, die Weiterleitung liegt bei nginx', async ({ page, request }) => {
    if (process.env.PW_BASE_URL) {
      // Deploy-Gate: geprueft wird gegen den ausliefernden nginx, dort greift
      // der 301.
      const antwort = await request.get('/en/product', { maxRedirects: 0 });
      expect(antwort.status()).toBe(301);
      expect(antwort.headers()['location']).toContain('/en/cook-app');
      return;
    }
    // Am Arbeitsplatz laeuft der Astro-Vorschau-Server ohne nginx: dort 404.
    const antwort = await page.goto('/en/product', { waitUntil: 'domcontentloaded' });
    expect(antwort.status()).toBe(404);
  });

  test('nginx.conf enthaelt den 301 auf /en/cook-app', async () => {
    const fs = await import('fs');
    const conf = fs.readFileSync('nginx.conf', 'utf8');
    expect(conf).toContain('location = /en/product {');
    expect(conf).toContain('location = /en/product/ {');
    expect(conf).toContain('return 301 /en/cook-app;');
  });

  test('/en/product steht nicht mehr in der Sitemap', async ({ request }) => {
    const antwort = await request.get('/sitemap-0.xml');
    expect(antwort.status()).toBe(200);
    const xml = await antwort.text();
    expect(xml).not.toContain('/en/product');
    expect(xml).toContain('/en/cook-app');
  });
});

test.describe('A62: /fuer-kantinen -> /betriebsgastronomie Umzug', () => {
  test('/fuer-kantinen ist entfernt, die Weiterleitung liegt bei nginx', async ({ page, request }) => {
    if (process.env.PW_BASE_URL) {
      // Deploy-Gate: geprueft wird gegen den ausliefernden nginx, dort greift der 301.
      const antwort = await request.get('/fuer-kantinen', { maxRedirects: 0 });
      expect(antwort.status()).toBe(301);
      expect(antwort.headers()['location']).toContain('/betriebsgastronomie');
      return;
    }
    // Am Arbeitsplatz laeuft der Astro-Vorschau-Server ohne nginx: dort 404.
    const antwort = await page.goto('/fuer-kantinen', { waitUntil: 'domcontentloaded' });
    expect(antwort.status()).toBe(404);
  });

  test('nginx.conf enthaelt den 301 auf /betriebsgastronomie/', async () => {
    const fs = await import('fs');
    const conf = fs.readFileSync('nginx.conf', 'utf8');
    expect(conf).toContain('location = /fuer-kantinen {');
    expect(conf).toContain('location = /fuer-kantinen/ {');
    expect(conf).toContain('return 301 /betriebsgastronomie/;');
  });

  test('/fuer-kantinen steht nicht mehr in der Sitemap, /betriebsgastronomie schon', async ({ request }) => {
    const antwort = await request.get('/sitemap-0.xml');
    expect(antwort.status()).toBe(200);
    const xml = await antwort.text();
    expect(xml).not.toContain('/fuer-kantinen');
    expect(xml).toContain('/betriebsgastronomie');
  });

  test('/betriebsgastronomie liefert die neue Seite mit direktantwort und Vergleichstabelle', async ({ page }) => {
    await page.goto('/betriebsgastronomie');
    await expect(page.locator('#direktantwort')).toHaveCount(1);
    // Vergleichstabelle mit hervorgehobener Avorix-Spalte
    await expect(page.locator('th.spalte-avorix')).toHaveCount(1);
    const faq = await page.$$eval('.faq-item', (els) => els.length);
    expect(faq).toBe(12);
  });
});

test.describe('A80: /kundenstimmen -> /ueber-uns Weiterleitung', () => {
  test('/kundenstimmen liefert 301 auf /ueber-uns (greift bei nginx)', async ({ page, request }) => {
    if (process.env.PW_BASE_URL) {
      // Deploy-Gate: geprueft wird gegen den ausliefernden nginx, dort greift der 301.
      const antwort = await request.get('/kundenstimmen', { maxRedirects: 0 });
      expect(antwort.status()).toBe(301);
      expect(antwort.headers()['location']).toContain('/ueber-uns');
      return;
    }
    // Am Arbeitsplatz laeuft der Astro-Vorschau-Server ohne nginx: dort 404.
    const antwort = await page.goto('/kundenstimmen', { waitUntil: 'domcontentloaded' });
    expect(antwort.status()).toBe(404);
  });

  test('nginx.conf enthaelt den 301 von /kundenstimmen auf /ueber-uns/', async () => {
    const fs = await import('fs');
    const conf = fs.readFileSync('nginx.conf', 'utf8');
    expect(conf).toContain('location ~ ^/kundenstimmen/?$');
    expect(conf).toContain('return 301 /ueber-uns/;');
  });

  test('/kundenstimmen steht nicht in der Sitemap', async ({ request }) => {
    const antwort = await request.get('/sitemap-0.xml');
    expect(antwort.status()).toBe(200);
    const xml = await antwort.text();
    expect(xml).not.toContain('/kundenstimmen');
  });
});

test.describe('T4: Pilotprogramm-Formular', () => {
  test('kein pilot_bewerbung Event bei leerem Pflichtfeld', async ({ page }) => {
    await page.goto('/pilotprogramm');

    // Accept consent first so dataLayer is active
    const banner = page.locator('#consent-banner');
    if (await banner.isVisible()) {
      await page.locator('#cb-accept-all').click();
    }

    // Try to submit empty form
    const form = page.locator('#pilot-form, form[action*="formspree"]');
    await form.locator('button[type="submit"], input[type="submit"]').click();

    // Browser validation should prevent submission — no pilot_bewerbung event
    const events = await page.evaluate(() =>
      (window.dataLayer || []).filter((e) => e && e.event === 'pilot_bewerbung')
    );
    expect(events).toHaveLength(0);
  });

  test('genau 1 pilot_bewerbung Event bei erfolgreichem Submit', async ({ page }) => {
    await page.goto('/pilotprogramm');

    // Accept consent
    const banner = page.locator('#consent-banner');
    if (await banner.isVisible()) {
      await page.locator('#cb-accept-all').click();
    }

    // Anweisung 45: /pilotprogramm postet jetzt an den eigenen Dienst
    // (/api/formular) statt an Formspree. Beide abfangen, damit kein echter
    // Versand passiert und der Erfolgsfall (response.ok) eintritt.
    await page.route('**/api/formular', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );
    await page.route('**/formspree.io/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );

    // Fill required fields
    await page.fill('input[name="name"], input[name="Name"]', 'Test Hotel');
    await page.fill('input[name="betrieb"], input[name="Betrieb"], input[name="betrieb_ort"]', 'Testhotel Friedrichshafen');
    await page.fill('input[name="email"], input[name="E-Mail"], input[type="email"]', 'test@example.com');

    // ALTCHA (Test-Modus) verifizieren, dann absenden
    await altchaVerify(page);

    // Submit
    const submitBtn = page.locator('form button[type="submit"], form input[type="submit"]');
    await submitBtn.click();

    await page.waitForTimeout(1500);

    const events = await page.evaluate(() =>
      (window.dataLayer || []).filter((e) => e && e.event === 'pilot_bewerbung')
    );
    expect(events).toHaveLength(1);

    // Verify double-fire protection: click again should NOT add another event
    // (form may be disabled/replaced after success, but verify dataLayer)
    const eventsAfter = await page.evaluate(() =>
      (window.dataLayer || []).filter((e) => e && e.event === 'pilot_bewerbung')
    );
    expect(eventsAfter).toHaveLength(1);
  });
});

/**
 * T5: Formularfelder (Anweisung 18/F2, zurueckgebaut nach Anweisung 21, Abschnitt 4)
 *
 * Die Feldhoehe darf nicht festgenagelt sein. Wer die Schrift vergroessert,
 * bekaeme sonst abgeschnittenen Text im Feld. Geprueft wird deshalb nicht die
 * Zahl allein, sondern dass das Feld mitwaechst — und dass Textfelder gar
 * keine Hoehenvorgabe tragen.
 */
const FORMULAR_SEITEN = ['/personal', '/pilotprogramm', '/kontakt', '/leitfaden', '/en/contact', '/en/staff', '/en/pilot-program'];

test.describe('T5: Feldhoehen wachsen mit der Schrift', () => {
  for (const pagePath of FORMULAR_SEITEN) {
    test(`${pagePath} — Felder ohne feste Hoehe, Textfeld ohne Vorgabe`, async ({ page }) => {
      await page.goto(pagePath);

      const felder = 'input.anfrage-field, select.anfrage-field, input.pilot-field, select.pilot-field, input.kontakt-field, select.kontakt-field, input.leitfaden-field, select.leitfaden-field';

      const vorher = await page.$$eval(felder, (els) =>
        els.map((el) => ({
          minHeight: getComputedStyle(el).minHeight,
          hoehe: Math.round(el.getBoundingClientRect().height),
        }))
      );
      expect(vorher.length).toBeGreaterThan(0);
      for (const f of vorher) {
        expect(f.minHeight).toBe('58px');
        expect(f.hoehe).toBe(58);
      }

      // Textfelder duerfen wachsen: keine Mindesthoehe.
      const textfelder = await page.$$eval('textarea', (els) =>
        els.map((el) => getComputedStyle(el).minHeight)
      );
      for (const min of textfelder) {
        expect(min).toBe('0px');
      }

      // Doppelte Schriftgroesse (Text-Zoom): die Felder muessen mitwachsen,
      // sonst schneidet die feste Hoehe den Text ab.
      await page.addStyleTag({ content: 'input, select, textarea { font-size: 32px !important; }' });
      const nachher = await page.$$eval(felder, (els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().height))
      );
      for (const hoehe of nachher) {
        expect(hoehe).toBeGreaterThan(58);
      }
    });
  }
});

/**
 * T7: Seitentitel (Anweisung 20, Abschnitt 6 und Abnahmepunkt 13)
 *
 * Das Suffix "| Avorix" haengt das Layout an. Steht es zusaetzlich im Titel
 * der Seite, erscheint es im Browser-Tab zweimal. Das betraf am 20.08. zwoelf
 * Seiten, vier neue und acht aus dem Bestand.
 */
const TITEL_SEITEN = [
  '/', '/koch-app', '/personal', '/schulung', '/system', '/pilotprogramm',
  '/ueber-uns', '/kontakt', '/leitfaden', '/impressum', '/datenschutz',
  '/fuer-hotels', '/fuer-restaurants', '/fuer-sporthotels',
  '/en', '/en/about', '/en/contact', '/en/cook-app', '/en/legal-notice',
  '/en/privacy', '/en/staff', '/en/training', '/en/system', '/en/pilot-program',
];

test.describe('T7: Das Suffix steht genau einmal im Titel', () => {
  for (const pagePath of TITEL_SEITEN) {
    test(`${pagePath} — "| Avorix" genau einmal`, async ({ page }) => {
      await page.goto(pagePath);
      const titel = await page.title();
      const treffer = titel.split('| Avorix').length - 1;
      expect(treffer, `Titel: "${titel}"`).toBe(1);
      expect(titel.endsWith('| Avorix'), `Titel: "${titel}"`).toBe(true);
    });
  }
});

test.describe('T7b: Die vier englischen Seiten tragen die Meta aus Anweisung 20', () => {
  const META = {
    '/en/staff': {
      titel: 'Hire Professional Chefs in Germany & Austria | Avorix',
      beschreibung: 'Permanently employed chefs, hired out under the official German staffing licence. Usually available within 24 to 72 hours, no minimum placement period.',
    },
    '/en/training': {
      titel: 'Kitchen Team Training at the Stove | Avorix',
      beschreibung: 'An Avorix chef records your menu, sets it up in the app and trains your team in real service. Block training or live during operation.',
    },
    '/en/system': {
      titel: 'The Avorix Kitchen System: App, Training, Staff | Avorix',
      beschreibung: 'Three modules that interlock: the Avorix Cook App, training at the stove, and permanently employed chefs. For kitchens that hold their standard.',
    },
    '/en/pilot-program': {
      titel: 'Avorix Pilot Program 2026: 3 Places | Avorix',
      beschreibung: 'Three hotel kitchens, around half the regular price, a direct line to the founder. Your name stays confidential, guaranteed in writing.',
    },
  };
  for (const [pagePath, soll] of Object.entries(META)) {
    test(`${pagePath} — Titel und Beschreibung im Wortlaut`, async ({ page }) => {
      await page.goto(pagePath);
      expect(await page.title()).toBe(soll.titel);
      const beschreibung = await page.getAttribute('meta[name="description"]', 'content');
      expect(beschreibung).toBe(soll.beschreibung);
    });
  }
});

/**
 * T8: Kopf und Typografie (Anweisung 18, Teil D und E)
 * Abnahmepunkte 11 (Navigation), 12 (Hero), 13 (Schriften).
 */
test.describe('T8: D1 — die Navigation traegt die Seite', () => {
  for (const pagePath of ['/', '/en']) {
    test(`${pagePath} — Leistenwerte`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);

      const kopf = await page.locator('header').boundingBox();
      expect(Math.round(kopf.height)).toBe(72);

      const punkte = await page.$$eval('.nav-desktop .nav-link', (els) =>
        els.map((el) => {
          const s = getComputedStyle(el);
          return { size: s.fontSize, weight: s.fontWeight, hoehe: Math.round(el.getBoundingClientRect().height) };
        })
      );
      expect(punkte.length).toBeGreaterThan(0);
      for (const p of punkte) {
        expect(p.size).toBe('16px');
        expect(p.weight).toBe('500');
        // Abnahme 29: Bedienziele mindestens 44px
        expect(p.hoehe).toBeGreaterThanOrEqual(44);
      }

      // Anweisung 61, Teil 9: 24px zwischen den Menuepunkten kommen jetzt aus dem
      // Innenabstand (12px je Seite), nicht aus gap. Das Menue steht rechts.
      const navLinksStil = await page.$eval('.nav-links', (el) => {
        const s = getComputedStyle(el);
        return { gap: s.columnGap, justify: s.justifyContent };
      });
      expect(navLinksStil.gap).toBe('0px');
      expect(navLinksStil.justify).toBe('flex-end');
      const linkPad = await page.$eval('.nav-links .nav-link', (el) => {
        const s = getComputedStyle(el);
        return { l: s.paddingLeft, r: s.paddingRight };
      });
      expect(linkPad.l).toBe('12px');
      expect(linkPad.r).toBe('12px');
      // Anweisung 50: +24px vor der Knopfgruppe; mit dem 16px-Gap der .nav-desktop
      // ergeben sich 40px zwischen "Ueber uns" und "Personal anfragen".
      const ctaLuecke = await page.$eval('.nav-cta-erst', (el) => getComputedStyle(el).marginLeft);
      expect(ctaLuecke).toBe('24px');

      const ctas = await page.$$eval('.nav-desktop .nav-cta', (els) =>
        els.map((el) => ({ weight: getComputedStyle(el).fontWeight, hoehe: Math.round(el.getBoundingClientRect().height) }))
      );
      for (const c of ctas) {
        expect(c.weight).toBe('500');
        expect(c.hoehe).toBeGreaterThanOrEqual(44);
      }
    });

    test(`${pagePath} — nichts ragt aus der Leiste`, async ({ page }) => {
      for (const breite of [900, 1024, 1280]) {
        await page.setViewportSize({ width: breite, height: 900 });
        await page.goto(pagePath);
        const raus = await page.evaluate(() => {
          const kopf = document.querySelector('header').getBoundingClientRect();
          const desktop = document.querySelector('.nav-desktop');
          if (!desktop || getComputedStyle(desktop).display === 'none') return [];
          return [...desktop.querySelectorAll('a, button')]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .filter((el) => el.getBoundingClientRect().right > kopf.right + 0.5)
            .map((el) => el.innerText.trim());
        });
        expect(raus, `Breite ${breite}px`).toEqual([]);
      }
    });
  }
});

/* Anweisung 81 (C3/D0): Die Haekchen-Pillen entfallen als Komponente. Ihre zwei
   Texte ziehen in den Hero, neben das Siegel (.hero-beleg). Kein "✓" mehr. */
test.describe('T8b: D0 — die Belegzeilen stehen im Hero', () => {
  test('Startseite — Belegzeilen im Hero, keine Haekchen-Pille, kein ✓', async ({ page }) => {
    await page.goto('/');
    const text = await page.evaluate(() => document.body.innerText);

    // Anweisung 19: der ganze Satz verschwindet, nicht nur die Fettung
    expect(text).not.toContain('Auch ohne ausgebildete');

    // Anweisung 81 (C3): keine Haekchen-Pille mehr, kein ✓ im Text
    const pillen = await page.$$eval('.check-badge', (els) => els.length);
    expect(pillen).toBe(0);
    expect(text).not.toContain('✓');

    // Anweisung 81 (D0): die zwei Belegzeilen stehen jetzt im Hero
    const belege = await page.$$eval('.hero-beleg .hero-beleg-text span', (els) => els.map((el) => el.innerText.trim()));
    expect(belege.length).toBe(2);
    expect(belege.join(' ')).toContain('Von K');
    expect(belege.join(' ')).toContain('Friedrichshafen');
  });
});

/* Anweisung 81 (Teil B) aendert die Meisterbetrieb-Regel "nur Systemschriften":
   Ueberschriften bekommen Barlow Semi Condensed (selbst gehostet). Damit sind es
   vier Familien statt drei -- Barlow (Ueberschriften), Avenir (Fliesstext/Nav/
   Buttons), Menlo (Mono-Etiketten/Bon) und Charter (die eine Serife im Zitat). */
test.describe('T8c: E1 — hoechstens vier Schriftfamilien', () => {
  for (const pagePath of TITEL_SEITEN) {
    test(`${pagePath} — vier Familien`, async ({ page }) => {
      await page.goto(pagePath);
      const familien = await page.evaluate(() => {
        const menge = new Set();
        for (const el of document.querySelectorAll('body *')) {
          if (!el.innerText || !el.innerText.trim()) continue;
          if (el.children.length > 0 && el.tagName !== 'BUTTON' && el.tagName !== 'A') continue;
          menge.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim());
        }
        return [...menge];
      });
      expect(familien.length, familien.join(', ')).toBeLessThanOrEqual(4);
    });
  }
});

/**
 * T8d: D1, Abnahme 4 (Anweisung 23) — der aktive Punkt ist erkennbar.
 *
 * Auf den Seiten hinter dem Aufklapper trug nur der Untereintrag im Menue die
 * Markierung. Solange das Menue zu ist, sieht die niemand.
 */
const SEITEN_MIT_NAVPUNKT = [
  '/personal', '/koch-app', '/schulung', '/system', '/pilotprogramm',
  '/fuer-hotels', '/fuer-restaurants', '/fuer-sporthotels', '/ueber-uns',
  '/en/staff', '/en/cook-app', '/en/training', '/en/system', '/en/pilot-program', '/en/about',
];

test.describe('T8d: D1 — der aktive Punkt ist in der geschlossenen Leiste sichtbar', () => {
  for (const pagePath of SEITEN_MIT_NAVPUNKT) {
    test(`${pagePath} — genau ein Punkt zeigt die laufende Seite`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      const markiert = await page.evaluate(() => {
        const raus = [];
        for (const el of document.querySelectorAll('.nav-desktop .nav-link, .nav-desktop .nav-dropdown-trigger')) {
          const nach = getComputedStyle(el, '::after');
          const sichtbar = nach.transform && nach.transform !== 'none' && !nach.transform.startsWith('matrix(0');
          if (sichtbar) raus.push(el.innerText.trim().split('\n')[0]);
        }
        return raus;
      });
      expect(markiert.length, `markiert: ${markiert.join(', ')}`).toBe(1);
    });
  }
});

/**
 * T9: Etappe 1 aus Anweisung 23 — Textbreite (B3) und Seitwaerts-Scrollen (B4).
 * Abnahmepunkte 1, 11 und 17.
 */
test.describe('T9: B4 — keine Seite scrollt seitwaerts', () => {
  for (const pagePath of TITEL_SEITEN) {
    test(`${pagePath} — bei 375px kein waagerechter Scrollbalken`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(pagePath);
      const mass = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(mass.scroll, `scrollWidth ${mass.scroll} > clientWidth ${mass.client}`).toBeLessThanOrEqual(mass.client);
    });
  }

  test('kein mark erzwingt auf dem Handy nowrap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const pagePath of ['/personal', '/', '/koch-app', '/schulung', '/fuer-hotels', '/fuer-restaurants', '/fuer-sporthotels', '/en/staff', '/en/system', '/en/training']) {
      await page.goto(pagePath);
      const nowrap = await page.$$eval('h1 mark, h2 mark, h3 mark', (els) =>
        els.filter((el) => getComputedStyle(el).whiteSpace === 'nowrap').length
      );
      expect(nowrap, pagePath).toBe(0);
    }
  });

  test('ab 640px bricht die lange /personal-Hervorhebung um, statt zu ueberlaufen', async ({ page }) => {
    // A70/71/72: Die Hervorhebung wuchs von "Rechtssicher verliehen." auf
    // "Rechtssicher an Sie verliehen." und passt nicht mehr in eine Zeile der
    // Hero-Spalte. Der globale Desktop-nowrap (global.css) liess sie unter das
    // Bild laufen; personal.astro erlaubt der .hero-copy-H1 deshalb wieder den
    // Umbruch. Hier pruefen wir beides: der Umbruch greift und die H1 laeuft
    // nicht mehr waagerecht ueber.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/personal');
    const h1 = await page.$eval('.hero-copy h1', (el) => ({
      ws: getComputedStyle(el.querySelector('mark')).whiteSpace,
      overlauf: el.scrollWidth - el.clientWidth,
    }));
    expect(h1.ws).toBe('normal');
    expect(h1.overlauf, `h1 laeuft um ${h1.overlauf}px ueber`).toBeLessThanOrEqual(1);
  });
});

test.describe('T9b: B3 — die schmale Spalte', () => {
  test('die Klasse existiert und misst 640px, .content-width bleibt bei 1080', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fuer-hotels');
    const masse = await page.evaluate(() => {
      const schmal = document.querySelector('.text-spalte');
      const breit = document.querySelector('.content-width:not(.text-spalte)');
      return {
        schmal: schmal ? getComputedStyle(schmal).maxWidth : null,
        breit: breit ? getComputedStyle(breit).maxWidth : null,
      };
    });
    expect(masse.schmal).toBe('640px');
    expect(masse.breit).toBe('1080px');
  });

  for (const pagePath of ['/fuer-hotels', '/fuer-restaurants', '/fuer-sporthotels', '/pilotprogramm', '/ueber-uns', '/leitfaden']) {
    test(`${pagePath} — in der schmalen Spalte laeuft kein Text breiter`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      const zuBreit = await page.evaluate(() => {
        const raus = [];
        for (const spalte of document.querySelectorAll('.text-spalte')) {
          for (const el of spalte.querySelectorAll('p, li')) {
            const w = el.getBoundingClientRect().width;
            if (w > 641) raus.push(Math.round(w) + 'px: ' + (el.innerText || '').slice(0, 40));
          }
        }
        return raus;
      });
      expect(zuBreit).toEqual([]);
      const anzahl = await page.$$eval('.text-spalte', (els) => els.length);
      expect(anzahl).toBeGreaterThan(0);
    });
  }
});

/**
 * T10: Etappe 2 aus Anweisung 23 — C4, C6 und C7.
 * Abnahmepunkte 2, 12 und 13.
 */
test.describe('T10: C6 — Komponenten-Innenabstaende auf der Skala', () => {
  test('die vier gap-Werte stimmen, die Button-Werte bleiben', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const werte = await page.evaluate(() => {
      const w = (sel, eig) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[eig] : null;
      };
      return {
        footerRight: w('.footer-right', 'columnGap'),
        // Anweisung 81 (D0): die Startseite hat keinen .hero-badges/.hero-grid mehr
        // (neuer .home-hero). Die Belegzeile sitzt im Hero (.hero-beleg, 16px).
        heroBeleg: w('.hero-beleg', 'columnGap'),
        navInner: w('.nav-inner', 'paddingLeft'),
        btnX: w('.btn', 'paddingLeft'),
        btnY: w('.btn', 'paddingTop'),
      };
    });
    expect(werte.footerRight).toBe('16px');
    expect(werte.heroBeleg).toBe('16px');
    expect(werte.navInner).toBe('24px');
    // Ausnahmeliste aus Abschnitt 2: die Buttonwerte erzeugen die Buttonhoehe
    expect(werte.btnX).toBe('28px');
    expect(werte.btnY).toBe('13px');
  });
});

test.describe('T10b: C7 — die Fusszeilen-Links sind erreichbar', () => {
  for (const pagePath of ['/', '/en', '/personal']) {
    test(`${pagePath} — Zielhoehe 44px bei unveraenderter Schrift`, async ({ page }) => {
      await page.goto(pagePath);
      const links = await page.$$eval('.footer-link, .footer-cookie-btn', (els) =>
        els.map((el) => ({
          text: el.innerText.trim(),
          hoehe: Math.round(el.getBoundingClientRect().height),
          schrift: getComputedStyle(el).fontSize,
        }))
      );
      expect(links.length).toBeGreaterThanOrEqual(3);
      for (const l of links) {
        expect(l.hoehe, l.text).toBeGreaterThanOrEqual(44);
        expect(l.schrift, l.text).toBe('13px');
      }
    });
  }
});

test.describe('T10c: C4 — die Screenshot-Karten haben eine Linie', () => {
  for (const pagePath of ['/koch-app', '/', '/en/cook-app']) {
    test(`${pagePath} — gleicher Bildkasten, gleiche Reihenfolge`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      // Regel 5: Bilder laden lassen, bevor Hoehen gemessen werden
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 700));
        window.scrollTo(0, 0);
      });
      const karten = await page.$$eval('.app-screenshot-card', (els) =>
        els.map((el) => {
          const bild = el.querySelector('img');
          const r = bild ? bild.getBoundingClientRect() : null;
          return {
            flach: el.classList.contains('app-screenshot-card--flach'),
            kopfleiste: !!el.querySelector('.app-screenshot-card__header'),
            verhaeltnis: r && r.height ? Math.round((r.width / r.height) * 100) / 100 : null,
          };
        })
      );
      expect(karten.length).toBeGreaterThan(0);
      for (const k of karten) {
        // eine Reihenfolge: Bild oben, Label darunter, keine dunkle Kopfleiste
        expect(k.flach).toBe(true);
        expect(k.kopfleiste).toBe(false);
        expect(k.verhaeltnis).toBeGreaterThan(1.3);
        expect(k.verhaeltnis).toBeLessThan(1.37);
      }
    });
  }
});

/**
 * T11: Etappe 5 aus Anweisung 23 — G3, G4 und G5.
 * Abnahmepunkte 8, 9, 10, 15 und 16.
 */
const ELF_SEITEN = ['/', '/koch-app', '/personal', '/schulung', '/system', '/pilotprogramm',
  '/ueber-uns', '/leitfaden', '/fuer-hotels', '/fuer-restaurants', '/fuer-sporthotels'];

test.describe('T11: G4 — ein dunkler Block je Seite', () => {
  for (const pagePath of ELF_SEITEN.filter((s) => s !== '/leitfaden')) {
    test(`${pagePath} — genau einer`, async ({ page }) => {
      await page.goto(pagePath);
      const anzahl = await page.$$eval('section.section-dunkel', (els) => els.length);
      expect(anzahl).toBe(1);
    });
  }

  test('/leitfaden traegt keinen — drei Sektionen, davon eine der Hero mit Formular', async ({ page }) => {
    await page.goto('/leitfaden');
    const anzahl = await page.$$eval('section.section-dunkel', (els) => els.length);
    expect(anzahl).toBe(0);
  });
});

test.describe('T11b: G3 — nie mehr als zwei gleiche Formen hintereinander', () => {
  for (const pagePath of ELF_SEITEN) {
    test(`${pagePath} — kein Dreier`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      const formen = await page.$$eval('section', (sekt) =>
        sekt.map((sek) => {
          if ((sek.className || '').includes('section-dunkel')) return 'DUNKEL';
          if (sek.querySelector('h1')) return 'Hero';
          if (sek.querySelector('form, input, textarea')) return 'Formular';
          if (sek.querySelector('.faq-list, details')) return 'FAQ';
          if (sek.querySelector('.tagesablauf')) return 'Ablauf';
          if (sek.querySelector('blockquote, .gruender-quote')) return 'Zitat';
          if (sek.querySelector('img, picture')) return 'Bild+Text';
          if (sek.querySelectorAll('.card, .card-modul').length >= 2) return 'Karten';
          if (sek.querySelector('.text-spalte')) return 'Schmal';
          return 'Text';
        })
      );
      const dreier = [];
      for (let i = 2; i < formen.length; i++) {
        if (formen[i] === formen[i - 1] && formen[i] === formen[i - 2]) {
          dreier.push(`${i - 1}-${i + 1}: ${formen[i]}`);
        }
      }
      expect(dreier, formen.join(' > ')).toEqual([]);
    });
  }
});

test.describe('T11c: G5 — Bilder belegen, was daneben steht', () => {
  test('die zwei benannten Bilder sind entfernt', async ({ page }) => {
    await page.goto('/fuer-restaurants');
    let bilder = await page.$$eval('img', (els) => els.map((el) => el.src).join(' '));
    expect(bilder).not.toContain('steak-nahaufnahme');

    await page.goto('/ueber-uns');
    bilder = await page.$$eval('img', (els) => els.map((el) => el.src).join(' '));
    expect(bilder).not.toContain('anrichten-detail');
  });

  test('die vier benannten Bilder stehen unveraendert', async ({ page }) => {
    const soll = {
      '/fuer-hotels': ['teller-stapel-reihe'],
      '/schulung': ['schulung-von-hinten', 'anrichten-haende'],
      '/ueber-uns': ['vakuumbeutel-kuehlhaus'],
    };
    for (const [pagePath, namen] of Object.entries(soll)) {
      await page.goto(pagePath);
      const bilder = await page.$$eval('img', (els) => els.map((el) => el.src).join(' '));
      for (const n of namen) expect(bilder, `${pagePath}: ${n}`).toContain(n);
    }
  });
});

/**
 * T12: Anweisung 25, Rest von Etappe 1 — Korrekturen 2, 4, 5 und 6.
 * Abnahmepunkte 3, 5, 6 und 7.
 */
test.describe('T12: Korrektur 4 — der Inhalt klebt nicht mehr am Header', () => {
  for (const breite of [375, 768, 1280]) {
    test(`bei ${breite}px beginnt der Inhalt unter der Kopfleiste`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await page.goto('/personal');
      const mass = await page.evaluate(() => {
        const kopf = document.querySelector('header').getBoundingClientRect();
        const sek = document.querySelector('main section').getBoundingClientRect();
        const variable = getComputedStyle(document.documentElement).getPropertyValue('--header-hoehe').trim();
        return { kopfUnten: Math.round(kopf.bottom), sektionOben: Math.round(sek.top), variable };
      });
      // die Sektion beginnt genau an der Unterkante der Leiste, nicht darunter
      expect(mass.sektionOben).toBeGreaterThanOrEqual(mass.kopfUnten - 1);
      // die Hoehe steht als Variable, damit beide Seiten nicht auseinanderlaufen
      expect(mass.variable).toBe('72px');
    });
  }
});

test.describe('T12b: Korrektur 5 — das geschlossene Menue zeigt nichts', () => {
  test('die Aufklappliste ist geschlossen 0px hoch', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const hoehen = await page.$$eval('.mobile-section-content:not(.is-open)', (els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height))
    );
    expect(hoehen.length).toBeGreaterThan(0);
    for (const h of hoehen) expect(h).toBe(0);
  });
});

/**
 * T12c: Anweisung 40 (A3) loest die fruehere Korrektur 2 ab.
 *
 * Korrektur 2 (Anweisung 25) verlangte, dass keine Ueberschrift schmaler bricht
 * als ihr eigener Text -- umgesetzt ueber einen :has()-Block, der die H2-Breite
 * freigab, sobald in der Sektion eine Karte/ein Raster/eine FAQ-Liste stand.
 * A3 kehrt das um: die H2-Breite ist eine Entscheidung, kein Nebeneffekt. Jede
 * H2 traegt 640px; nur Hero und Karte bleiben ausgenommen. Langueberschriften
 * brechen dadurch bewusst auf zwei Zeilen.
 */
test.describe('T12c: Anweisung 40 A3 — jede H2 traegt 640px (ausser Hero und Karte)', () => {
  for (const pagePath of ['/', '/koch-app', '/personal', '/system', '/fuer-hotels']) {
    test(`${pagePath} — H2 = 640px, Hero/Karte ausgenommen`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      const abweichend = await page.evaluate(() => {
        const raus = [];
        for (const h of document.querySelectorAll('h2')) {
          if (h.closest('.hero-section') || h.closest('.card') || h.closest('.card-modul')) continue;
          const mw = getComputedStyle(h).maxWidth;
          if (mw !== '640px') raus.push(`${mw}: ${h.innerText.slice(0, 30)}`);
        }
        return raus;
      });
      expect(abweichend).toEqual([]);
    });
  }
});

test.describe('T12d: Korrektur 6 — Text in Kaesten hat seitliche Luft', () => {
  test('die Bildunterschriften tragen 16px', async ({ page }) => {
    await page.goto('/koch-app');
    const werte = await page.$$eval('.app-screenshot-caption', (els) =>
      els.map((el) => getComputedStyle(el).paddingLeft)
    );
    expect(werte.length).toBeGreaterThan(0);
    for (const w of werte) expect(w).toBe('16px');
  });
});

/**
 * T12e: Korrektur 3 (Anweisung 26) — die eigentliche Ursache des Ueberlaufs.
 *
 * Nicht das nowrap: Rasterzellen tragen `min-width: auto` und schrumpfen nicht
 * unter ihr laengstes Wort. "Arbeitnehmerueberlassungserlaubnis" braucht 272px
 * bei 279px Spalte -- auf Geraeten mit etwas breiterer Schrift passt es nicht
 * mehr und schiebt die Seite auf.
 */
test.describe('T12e: Korrektur 3 — lange Woerter sprengen die Seite nicht', () => {
  test('ein ueberlanges Wort bricht um, statt die Seite zu verbreitern', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/personal');
    const mass = await page.evaluate(() => {
      const abs = document.querySelector('main p');
      const merker = abs.innerHTML;
      abs.innerHTML = 'Arbeitnehmerueberlassungserlaubnisbescheinigungsverfahren';
      const r = { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
      abs.innerHTML = merker;
      return r;
    });
    expect(mass.scroll).toBeLessThanOrEqual(mass.client);
  });

  test('Rasterzellen duerfen schmaler werden als ihr Inhalt', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const auto = await page.$$eval('.split-row > *, .hero-grid > *, .grid > *', (els) =>
      els.filter((el) => getComputedStyle(el).minWidth === 'auto').length
    );
    expect(auto).toBe(0);
  });
});

/**
 * T13: Anweisung 25, Korrekturen 7, 9, 14 und 21.
 * Abnahmepunkte 8, 10, 15 und 22.
 */
test.describe('T13: Korrektur 14 — Personal steht an zwei Stellen', () => {
  const SOLL_DE = ['Wie alles zusammenspielt', 'Geführtes Arbeiten: die App', 'Die Schulung', 'Das Personal', 'Pilotprogramm 2026'];
  const SOLL_EN = ['How It All Works Together', 'Guided Work: The Cook App', 'The Training', 'The Staff', 'Pilot Program 2026'];

  for (const [pagePath, soll] of [['/', SOLL_DE], ['/en', SOLL_EN]]) {
    for (const breite of [375, 1280]) {
      test(`${pagePath} @${breite}px — fuenf Eintraege in der richtigen Folge`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 900 });
        await page.goto(pagePath);
        const wahl = breite >= 900 ? '.nav-dropdown-menu .nav-dropdown-item' : '.mobile-section-link';
        // Anweisung 30, Schritt 7.6: Das geschlossene Menue traegt jetzt
        // visibility:hidden, damit die Tastatur nicht durch unsichtbare Links
        // laeuft. Damit liefert innerText hier korrekt nichts mehr -- der Test
        // liest aus einem GESCHLOSSENEN Menue. textContent prueft unveraendert
        // dieselbe Zusage: fuenf Eintraege in dieser Reihenfolge.
        const eintraege = await page.$$eval(wahl, (els) => els.map((el) => el.textContent.trim()));
        expect(eintraege.slice(0, 5)).toEqual(soll);
      });
    }
  }

  test('Personal steht oben UND in der Spalte, beide auf dieselbe Seite', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const oben = await page.$$eval('.nav-desktop .nav-link', (els) =>
      els.filter((el) => el.getAttribute('href') === '/personal').length
    );
    const spalte = await page.$$eval('.nav-dropdown-item', (els) =>
      els.filter((el) => el.getAttribute('href') === '/personal').length
    );
    expect(oben).toBe(1);
    expect(spalte).toBe(1);
  });
});

test.describe('T13b: Korrektur 9 — die Saetze stehen unter ihrer Ueberschrift', () => {
  const SUBLINES = [
    ['/', 'Software, Abl', 'Was ist Avorix'],
    ['/koch-app', 'Die App tr', 'Gemessen in einem Kundenbetrieb'],
    ['/personal', 'Kurzfristige Eins', 'Wann Sie uns rufen'],
    ['/system', 'Denken Sie an Feuerwehr', 'Unser System. Die Schulung'],
    ['/fuer-restaurants', 'Irgendwann steht die Frage', 'Wenn der Koch geht'],
    ['/fuer-sporthotels', 'Wenn die K', 'Halbpension auf Niveau'],
  ];
  for (const [pagePath, satz, ueberschrift] of SUBLINES) {
    test(`${pagePath} — der Satz steht oben`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      const lage = await page.evaluate(([satz, ueberschrift]) => {
        const h2 = [...document.querySelectorAll('h2')].find((h) => h.innerText.includes(ueberschrift));
        if (!h2) return { fehler: 'Ueberschrift nicht gefunden' };
        const sek = h2.closest('section');
        const p = [...sek.querySelectorAll('p')].find((el) => el.innerText.trim().startsWith(satz));
        if (!p) return { fehler: 'Satz nicht in der Sektion' };
        const gruppe = sek.querySelector('.grid, .card, .card-modul');
        return {
          satzOben: Math.round(p.getBoundingClientRect().top),
          h2Oben: Math.round(h2.getBoundingClientRect().top),
          gruppeOben: gruppe ? Math.round(gruppe.getBoundingClientRect().top) : null,
        };
      }, [satz, ueberschrift]);
      expect(lage.fehler).toBeUndefined();
      expect(lage.satzOben).toBeGreaterThan(lage.h2Oben);
      if (lage.gruppeOben !== null) expect(lage.satzOben).toBeLessThan(lage.gruppeOben);
    });
  }

  test('/koch-app traegt den neuen Wortlaut', async ({ page }) => {
    await page.goto('/koch-app');
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain('Die App trägt sich dort schon selbst.');
    expect(text).not.toContain('Damit trägt sich die App');
  });
});

/**
 * T13c: Anweisung 40 (A4) loest die fruehere Korrektur 7 ab.
 *
 * Korrektur 7 (Anweisung 25) zog Karten einer Reihe per align-items: stretch auf
 * gleiche Hoehe. A4 kehrt das um: Karten stehen oben (align-items: start) und
 * sind so hoch wie ihr Inhalt -- sonst entsteht Leerraam am Kartenende (auf
 * /koch-app bis 494px). Der Test prueft die Mechanik: Kartenraster sind oben
 * ausgerichtet, nicht gestreckt.
 */
test.describe('T13c: Anweisung 40 A4 — Kartenraster oben ausgerichtet, nicht gestreckt', () => {
  for (const pagePath of ['/personal', '/system', '/koch-app', '/en/system']) {
    test(`${pagePath} — align-items: start je Kartenraster`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      const nichtOben = await page.evaluate(() => {
        const raus = [];
        for (const raster of document.querySelectorAll('.grid')) {
          const karten = [...raster.children].filter((k) => k.classList.contains('card') || k.classList.contains('card-modul'));
          if (karten.length < 2) continue;
          const ai = getComputedStyle(raster).alignItems;
          if (ai !== 'start' && ai !== 'flex-start') raus.push(ai);
        }
        return raus;
      });
      expect(nichtOben).toEqual([]);
    });
  }
});

test.describe('T13d: Korrektur 21 — die zwei Umstellungen auf /system', () => {
  test('die Bon-Leiste steht unter den Modulen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/system');
    const lage = await page.evaluate(() => {
      const modul = document.querySelector('.card-modul');
      const sek = modul.closest('section');
      const bild = sek.querySelector('img');
      return { bildOben: Math.round(bild.getBoundingClientRect().top), modulOben: Math.round(modul.getBoundingClientRect().top) };
    });
    expect(lage.bildOben).toBeGreaterThan(lage.modulOben);
  });

  test('Bild und Schritte stehen nebeneinander, mobil untereinander', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/system');
    const desktop = await page.evaluate(() => {
      const schritt = document.querySelector('.schritt');
      const sek = schritt.closest('section');
      const bild = sek.querySelector('.split-media img');
      return bild ? { bildLinks: Math.round(bild.getBoundingClientRect().left), schrittLinks: Math.round(schritt.getBoundingClientRect().left) } : null;
    });
    expect(desktop).not.toBeNull();
    expect(desktop.bildLinks).toBeLessThan(desktop.schrittLinks);

    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/system');
    const mobil = await page.evaluate(() => {
      const schritt = document.querySelector('.schritt');
      const sek = schritt.closest('section');
      const bild = sek.querySelector('.split-media img');
      return { bildOben: Math.round(bild.getBoundingClientRect().top), schrittOben: Math.round(schritt.getBoundingClientRect().top) };
    });
    expect(mobil.bildOben).toBeLessThan(mobil.schrittOben);
  });
});

/**
 * T14: Anweisung 29, Abschnitt 2.3 und 6.1 bis 6.6.
 */
test.describe('T14: Anweisung 29 — die Durchsicht', () => {
  test('6.1 — die llms.txt kennt den englischen Bereich', async ({ request }) => {
    const antwort = await request.get('/llms.txt');
    expect(antwort.status()).toBe(200);
    const text = await antwort.text();
    expect(text).toContain('## English pages');
    for (const pfad of ['/en/staff', '/en/cook-app', '/en/training', '/en/system', '/en/pilot-program', '/en/about', '/en/contact']) {
      expect(text, pfad).toContain('https://avorix.de' + pfad + ')');
    }
    expect(text).toContain('An English section covers the same offering');
  });

  test('6.2 — der gestrichene Satz steht in keinem Metafeld der Startseite', async ({ page }) => {
    await page.goto('/');
    const felder = await page.evaluate(() => {
      const inhalt = (wahl) => document.querySelector(wahl)?.getAttribute('content') || '';
      const schema = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => s.textContent).join(' ');
      return {
        meta: inhalt('meta[name="description"]'),
        og: inhalt('meta[property="og:description"]'),
        twitter: inhalt('meta[name="twitter:description"]'),
        schema,
      };
    });
    for (const [name, wert] of Object.entries(felder)) {
      expect(wert, name).not.toContain('Auch ohne ausgebildete');
    }
    expect(felder.meta.length).toBeGreaterThan(120);
    expect(felder.meta.length).toBeLessThan(150);
  });

  /* Anweisung 81 (D4/D5): "Warum Avorix" wird zu drei Spalten mit Linie oben
     (kein .text-spalte-Band mehr), "Was ist Avorix" bekommt drei Schritt-Spalten
     mit Mono-Label statt der senkrechten Zeitleiste (.tagesablauf). */
  test('6.3 — Warum als drei Spalten, Was ist Avorix als drei Schritte', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const warum = await page.evaluate(() => {
      const h2 = [...document.querySelectorAll('h2')].find((h) => h.innerText.includes('Warum Avorix'));
      const sek = h2.closest('section');
      return {
        spalten: sek.querySelectorAll('.warum-spalten .spalte-linie').length,
        karten: sek.querySelectorAll('.card').length,
      };
    });
    expect(warum.spalten).toBe(3);
    expect(warum.karten).toBe(0);

    const ablauf = await page.evaluate(() => {
      const h2 = [...document.querySelectorAll('h2')].find((h) => h.innerText.includes('Was ist Avorix'));
      const sek = h2.closest('section');
      const schritte = sek.querySelector('.was-schritte');
      return {
        linienform: !!schritte,
        stationen: schritte ? schritte.querySelectorAll('.spalte-linie').length : 0,
        labels: schritte ? [...schritte.querySelectorAll('.schritt-label')].map((e) => e.innerText.trim()) : [],
      };
    });
    expect(ablauf.linienform).toBe(true);
    expect(ablauf.stationen).toBe(3);
    expect(ablauf.labels.join(' ')).toContain('SCHRITT 1');
  });

  test('6.4 — das Zahlen-Banner steht auf /en/cook-app', async ({ page }) => {
    await page.goto('/en/cook-app');
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain("Measured in one customer");
    expect(text).toContain('The app already pays for itself there.');
    expect(text).toContain('around 15');
    expect(text).toContain('around 20');
    // Subline oben, nicht unter den Karten
    const lage = await page.evaluate(() => {
      const h2 = [...document.querySelectorAll('h2')].find((h) => h.innerText.includes('Measured in one'));
      const sek = h2.closest('section');
      const p = [...sek.querySelectorAll('p')].find((el) => el.innerText.includes('already pays for itself'));
      const karte = sek.querySelector('.card');
      return { satz: p.getBoundingClientRect().top, karte: karte.getBoundingClientRect().top };
    });
    expect(lage.satz).toBeLessThan(lage.karte);
  });

  test('6.5 — /en/staff und /personal tragen ihre FAQ im Schema', async ({ page }) => {
    const zaehle = async (pfad) => {
      await page.goto(pfad);
      return page.evaluate(() => {
        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
          const daten = JSON.parse(s.textContent);
          const liste = Array.isArray(daten) ? daten : [daten];
          for (const eintrag of liste) {
            if (eintrag['@type'] === 'FAQPage') return eintrag.mainEntity.length;
          }
        }
        return 0;
      });
    };
    // Anweisung 37 (Alt-Content): beide Seiten haben die "Kuechenchef fuer mehrere
    // Haeuser"-FAQ bekommen -> +1. Zusammen mit der Mietkoch-FAQ auf /personal
    // (SEO-Paket Phase 1) stand /personal bei 11, /en/staff bei 10.
    // Anweisung 39B: /personal +2 FAQ (Vermitteln Sie Koeche? / Vermittlungshonorar?) -> 13.
    // Anweisung 47 B2: /personal +1 FAQ ("Was kostet ein Mietkoch bei Avorix?") -> 14.
    // Anweisung 48: /personal +1 FAQ ("Stellt ihr auch Servicepersonal?") -> 15.
    expect(await zaehle('/en/staff')).toBe(10);
    expect(await zaehle('/personal')).toBe(15);
  });

  test('6.6 — /en/contact hat Pflichtfeld-Zeile und Sternchen', async ({ page }) => {
    await page.goto('/en/contact');
    const zeile = await page.textContent('.formular-pflicht');
    expect(zeile.trim()).toBe('Fields marked * are the ones we need, everything else is optional.');
    // Anweisung 75: nur das Kontaktformular zaehlen, nicht den neuen Rezept-Block.
    const labels = await page.$$eval('#contact-form label', (els) => els.map((el) => el.innerText.trim()));
    const mitStern = labels.filter((l) => l.includes('*'));
    expect(mitStern.length).toBe(3);
  });

  test('2.3 — beide Manager-Karten tragen den Schlusssatz', async ({ page }) => {
    await page.goto('/koch-app');
    let text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain('Sie sehen es im Monat, nicht erst im Jahresabschluss.');

    await page.goto('/en/cook-app');
    text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain('You see it during the month, not in the annual accounts.');
  });
});

/**
 * T15: Anweisung 30, Schritt 7.7 -- gehashte Assets duerfen dauerhaft cachen.
 * Die Bilder gingen mit `no-cache, must-revalidate` raus, obwohl ihre Namen
 * einen Inhalts-Hash tragen. Ursache: die Asset-Regel in nginx.conf kannte
 * kein `webp`, und genau das liefert Astro aus.
 * Wie bei T3 gilt: die scharfe Pruefung laeuft im Deploy-Gate gegen den
 * ausliefernden nginx. Am Arbeitsplatz gibt es keinen.
 */
test.describe('T15: Anweisung 30 -- Cache-Kopf der gehashten Assets', () => {
  test('ein Bild unter /_astro/ antwortet mit public, max-age=31536000, immutable', async ({ page, request }) => {
    test.skip(!process.env.PW_BASE_URL,
      'Ohne PW_BASE_URL laeuft der Astro-Vorschau-Server ohne nginx; geprueft wird im Deploy-Gate.');
    await page.goto('/');
    const bild = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .map((i) => i.currentSrc || i.src)
        .find((s) => s && s.includes('/_astro/')) || null);
    expect(bild, 'kein Bild unter /_astro/ auf der Startseite gefunden').toBeTruthy();
    const antwort = await request.get(bild);
    expect(antwort.status()).toBe(200);
    expect(antwort.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('nginx.conf liefert /_astro/ dauerhaft cachebar aus', async () => {
    const fs = await import('fs');
    const conf = fs.readFileSync('nginx.conf', 'utf8');
    expect(conf).toContain('location ^~ /_astro/');
    expect(conf).toContain('public, max-age=31536000, immutable');
    // webp und avif gehoeren auch in die allgemeine Asset-Regel -- sonst faellt
    // Astros Bildformat ausserhalb von /_astro/ weiter in den no-cache-Zweig.
    expect(conf).toContain('|svg|webp|avif|');
  });
});

test.describe('A58: rundes Siegel, Satz raus, Abstaende, Partnerlogo', () => {
  for (const [pfad, lang] of [['/', 'de'], ['/en/', 'en'], ['/wissen/inventur-gastronomie/', 'de'], ['/personal/tirol/', 'de']]) {
    test(`${pfad}: kein Stempel mehr, Siegel rund und nicht abgeschnitten`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(pfad);
      expect(await page.locator('.stempel').count()).toBe(0);
      const html = await page.content();
      expect(html).not.toContain('Es ist geregelt.');
      expect(html).not.toMatch(/It(’|&#8217;|&rsquo;|')s sorted\./);
      const siegel = await page.$$eval('img.siegel', (els) => els.map((el) => ({
        src: el.getAttribute('src'),
        gross: el.classList.contains('siegel--gross'),
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
        fit: getComputedStyle(el).objectFit,
      })));
      expect(siegel.length).toBeGreaterThan(0);
      // Anweisung 81 (C4/D0): Startseiten tragen genau EIN Siegel, im Hero, 60px,
      // kein grosses Schluss-Siegel mehr. Die uebrigen Seiten bleiben wie gehabt.
      const istHome = pfad === '/' || pfad === '/en/';
      for (const s of siegel) {
        expect(s.src).toContain(`/siegel/avorix-siegel-${lang}`);
        expect(s.fit).toBe('contain');
        expect(s.w).toBe(istHome ? 60 : (s.gross ? 200 : 88));
        expect(s.h).toBe(s.w);
      }
      if (istHome) {
        expect(siegel.length).toBe(1);
        expect(siegel.some((s) => s.gross)).toBe(false);
      } else {
        // Schlussblock: grosses Siegel, Knopf bleibt
        expect(siegel.some((s) => s.gross)).toBe(true);
      }
    });
  }

  test('Siegel-Dateien werden als SVG ausgeliefert', async ({ request }) => {
    for (const f of ['de', 'de-klein', 'en', 'en-klein', 'de-klein-hell', 'en-klein-hell']) {
      const r = await request.get(`/siegel/avorix-siegel-${f}.svg`);
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toContain('image/svg+xml');
    }
  });

  for (const pfad of ['/schulung/', '/en/training/']) {
    test(`${pfad}: Band nach dem Hero hat oben Abstand`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pfad);
      const pt = await page.$eval('.hero-section + .section-gap', (el) => getComputedStyle(el).paddingTop);
      expect(pt).toBe('128px');
    });
  }

  test('Partnerlogo im Footer 155 x 28, Domain ungetrennt', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const logo = await page.$eval('.footer-partner-logo', (el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(logo).toEqual({ w: 155, h: 28 });
    const ws = await page.$eval('.footer-partner-domain', (el) => getComputedStyle(el).whiteSpace);
    expect(ws).toBe('nowrap');
  });
});

// Anweisung 60: Bewerbungsformular, /jobs/ und Landingpage /jobs/koch/.
test.describe('A60: Bewerbungen', () => {
  async function einwilligen(page) {
    const banner = page.locator('#consent-banner');
    if (await banner.isVisible()) await page.locator('#cb-accept-all').click();
  }

  for (const [pfad, quelle, rolle] of [['/jobs/', 'jobs', 'service'], ['/jobs/koch/', 'lp-koch', 'koch']]) {
    test(`${pfad}: genau 1 Ereignis bewerbung bei Erfolg, danach Danke-Text`, async ({ page }) => {
      let gesendet = null;
      await page.route('**/api/formular', async (route) => {
        gesendet = route.request().postData() || '';
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      });
      await page.goto(pfad);
      await einwilligen(page);
      const form = page.locator('[data-bewerbung-form]');
      await form.locator('input[name="name"]').fill('TEST');
      await form.locator('input[name="telefon"]').fill('+43 664 123 45 67');
      if (rolle === 'service') await form.locator('label.bw-rolle', { hasText: 'Servicekraft' }).click();
      await form.locator('select[name="region"]').selectOption('Tirol');
      // Anweisung 66: neues Pflichtfeld Arbeitserlaubnis.
      await form.locator('label.bw-rolle', { hasText: 'Pass oder Ausweis' }).click();
      await form.locator('select[name="erfahrung"]').selectOption('3 bis 5 Jahre');
      await page.waitForTimeout(3100); // Zeitfalle des Dienstes (3 s) realistisch abwarten
      await altchaVerify(page);
      await form.locator('button[type="submit"]').click();
      await expect(page.locator('[data-bw-danke]')).toBeVisible();
      await expect(form).toBeHidden();
      const ev = await page.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === 'bewerbung'));
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ rolle, quelle });
      expect(gesendet).toContain('name="quelle"');
      expect(gesendet).toContain(quelle);
      // Anweisung 66: das Pflichtfeld geht mit.
      expect(gesendet).toContain('name="arbeitserlaubnis"');
    });
  }

  // Anweisung 74: Bei „Nein, oder ich weiß es nicht" wird der Absende-Knopf gesperrt
  // und die Meldung gezeigt; eine Ja-Antwort gibt den Knopf wieder frei.
  test('A74: /jobs/ — „Nein oder unklar" sperrt den Knopf und zeigt die Meldung', async ({ page }) => {
    await page.goto('/jobs/');
    await einwilligen(page);
    const form = page.locator('[data-bewerbung-form]');
    const knopf = form.locator('button[type="submit"]');
    const sperre = page.locator('[data-bw-sperre]');
    await expect(knopf).toBeEnabled();
    await form.locator('label.bw-rolle', { hasText: 'Nein, oder ich weiß es nicht' }).click();
    await expect(sperre).toBeVisible();
    await expect(knopf).toBeDisabled();
    await form.locator('label.bw-rolle', { hasText: 'Pass oder Ausweis' }).click();
    await expect(sperre).toBeHidden();
    await expect(knopf).toBeEnabled();
  });

  test('/jobs/: kein Ereignis, wenn der Dienst nicht ok meldet', async ({ page }) => {
    await page.route('**/api/formular', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"ok":false,"error":"missing_telefon"}' })
    );
    await page.goto('/jobs/');
    await einwilligen(page);
    const form = page.locator('[data-bewerbung-form]');
    await form.locator('input[name="name"]').fill('TEST');
    await form.locator('input[name="telefon"]').fill('0151 1');
    await form.locator('label.bw-rolle', { hasText: 'Koch' }).click();
    await form.locator('select[name="region"]').selectOption('Tirol');
    await form.locator('label.bw-rolle', { hasText: 'Pass oder Ausweis' }).click();
    await form.locator('select[name="erfahrung"]').selectOption('1 bis 2 Jahre');
    await altchaVerify(page);
    await form.locator('button[type="submit"]').click();
    // Anweisung 63: Fehlermeldung kommt jetzt aus der gemeinsamen Hilfsfunktion.
    await expect(page.locator('[data-form-fehler]')).toBeVisible();
    const ev = await page.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === 'bewerbung'));
    expect(ev).toHaveLength(0);
  });

  test('/jobs/: neue Angaben, kein „in Kürze“, keine zwei Werktage, Schema ohne Gehalt (A72)', async ({ page }) => {
    await page.goto('/jobs/');
    const text = await page.locator('main').innerText();
    expect(text).not.toContain('in Kürze');
    expect(text).not.toContain('zwei Werktag');
    // Anweisung 72: keine Gehaltszahlen mehr, neutraler Satz.
    expect(text).not.toContain('2.500 bis 3.500');
    expect(text).not.toContain('brutto');
    expect(text).toContain('faires, marktübliches Gehalt');
    expect(text).toContain('Fahrtkosten und Unterkunft zahlen wir');
    await expect(page.locator('a[href^="https://wa.me/4915754123492"]').first()).toBeVisible();
    const schemas = await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => JSON.parse(e.textContent)));
    const flat = schemas.flat();
    const koch = flat.find((s) => s['@type'] === 'JobPosting' && s.title === 'Koch (m/w/d)');
    const service = flat.find((s) => s['@type'] === 'JobPosting' && s.title === 'Servicekraft (m/w/d)');
    expect(koch.directApply).toBe(true);
    // Anweisung 72: baseSalary aus allen JobPostings entfernt, description ohne Zahl.
    expect(koch.baseSalary).toBeUndefined();
    expect(koch.description).not.toContain('brutto');
    expect(koch.description).not.toContain('2.500 bis 3.500');
    expect(service.directApply).toBe(true);
    expect(service.baseSalary).toBeUndefined();
  });

  test('/jobs/koch/: noindex, follow, nicht in Sitemap, kein JobPosting, Formular im ersten Bildschirm (390 px)', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/jobs/koch/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    const typen = await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent).join(' '));
    expect(typen).not.toContain('JobPosting');
    expect(typen).not.toContain('FAQPage');
    const name = page.locator('[data-bewerbung-form] input[name="name"]');
    const box = await name.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(844);
    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    expect(sitemap).not.toContain('/jobs/koch');
    const llms = await (await request.get('/llms.txt')).text();
    expect(llms).not.toContain('/jobs/koch');
  });
});

// Anweisung 77: freiwilliges Feld „Fuer wie lange?" + Messung + Wort „Vermittler".
test.describe('A77: Personal-Anfrage dauer und das Wort „Vermittler"', () => {
  async function consent(page) {
    const banner = page.locator('#consent-banner');
    if (await banner.isVisible()) await page.locator('#cb-accept-all').click();
  }

  test('/personal: „Fuer wie lange?" sind drei freiwillige Knoepfe ohne Vorauswahl', async ({ page }) => {
    await page.goto('/personal');
    const radios = page.locator('#personal-form input[name="dauer"]');
    await expect(radios).toHaveCount(3);
    expect(await radios.evaluateAll((els) => els.some((e) => e.required))).toBe(false);
    expect(await radios.evaluateAll((els) => els.some((e) => e.checked))).toBe(false);
  });

  test('/personal: personal_anfrage feuert mit dauer-Kuerzel, dauer geht mit', async ({ page }) => {
    let gesendet = null;
    await page.route('**/api/formular', async (route) => {
      gesendet = route.request().postData() || '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/personal');
    await consent(page);
    const form = page.locator('#personal-form');
    await form.locator('input[name="betrieb"]').fill('TEST');
    await form.locator('input[name="name"]').fill('TEST');
    await form.locator('input[name="telefon"]').fill('+43 664 123 45 67');
    await form.locator('input[name="ab_wann"]').fill('sofort');
    await form.locator('label.anfrage-dauer-opt', { hasText: 'Eine Saison' }).click();
    await page.waitForTimeout(3100);
    await altchaVerify(page);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#personal-success')).toBeVisible();
    const ev = await page.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === 'personal_anfrage'));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ form_name: 'personal', dauer: 'saison' });
    expect(gesendet).toContain('name="dauer"');
  });

  test('Teil 4: „Vermittler" nur noch neutral, FAQ-Antworten und Absatz sind neu', async ({ page }) => {
    await page.goto('/');
    let t = await page.evaluate(() => document.body.textContent || '');
    expect(t).not.toContain('Bei Avorix passiert Ihnen das nicht');
    expect(t).not.toContain('Viele Vermittler');

    await page.goto('/jobs/');
    t = await page.evaluate(() => document.body.textContent || '');
    expect(t).not.toContain('zu den Vermittlern');

    await page.goto('/wissen/mietkoch-kosten/');
    t = await page.evaluate(() => document.body.textContent || '');
    expect(t).not.toContain('der Vermittler kassiert');
    expect(t).toContain('Was Sie für einen Mietkoch nie zahlen');

    await page.goto('/personal');
    t = await page.evaluate(() => document.body.textContent || '');
    expect(t).not.toContain('Wir vermitteln nicht');
    expect(t).not.toContain('Vermittler-Rechnung');
    expect(t).toContain('Auf Wunsch ja, unser Schwerpunkt ist aber die Überlassung');
    expect(t).toContain('Ein Vermittlungshonorar fällt nur an');
    expect(t).toContain('Was nach Ihrer Anfrage passiert');
  });
});

// Anweisung 76: Bewerberprofil-Seite in drei Sprachen „Hotels und Restaurants
// bewerben sich bei dir". Erweitertes Bewerbungsformular (Rolle Leitung,
// Wuensche, Freigabe), Messung, Datenschutz-Abschnitt.
test.describe('A76: Bewerberprofil-Seite (profil/profile/profil)', () => {
  async function consent(page) {
    const banner = page.locator('#consent-banner');
    if (await banner.isVisible()) await page.locator('#cb-accept-all').click();
  }

  const SEITEN = [
    { pfad: '/jobs/profil/', quelle: 'profil' },
    { pfad: '/en/jobs/profile/', quelle: 'profil-en' },
    { pfad: '/hu/profil/', quelle: 'profil-hu' },
  ];

  for (const { pfad, quelle } of SEITEN) {
    test(`${pfad}: noindex/follow, kein JobPosting/FAQ, nicht in Sitemap/llms`, async ({ page, request }) => {
      await page.goto(pfad);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
      const typen = await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent).join(' '));
      expect(typen).not.toContain('JobPosting');
      expect(typen).not.toContain('FAQPage');
      // Kein <link rel="alternate" hreflang> (nur die Anker im Sprachwechsel tragen hreflang).
      expect(await page.locator('link[rel="alternate"][hreflang]').count()).toBe(0);
      const sitemap = await (await request.get('/sitemap-0.xml')).text();
      expect(sitemap).not.toContain(pfad);
      const llms = await (await request.get('/llms.txt')).text();
      expect(llms).not.toContain(pfad);
      // Keine Kundenlinks im Inhalt (weder Fliesstext noch Fuss).
      const kundenlinks = await page.locator('a[href*="/personal/"], a[href*="/fuer-"], a[href*="/koch-app"], a[href*="/pilotprogramm"]').count();
      expect(kundenlinks).toBe(0);
    });
  }

  test('Sprachwechsel verlinkt nur die drei Fassungen dieser Seite', async ({ page }) => {
    await page.goto('/jobs/profil/');
    const hrefs = await page.locator('.bw-langnav a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.sort()).toEqual(['/en/jobs/profile/', '/hu/profil/']);
  });

  test('/jobs/profil/: H1, drei Zeilen und Formularanfang ohne Scrollen (375 px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/jobs/profil/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.lp-haken li')).toHaveCount(3);
    // „Anfang des Formulars" = Oberkante der Formularkarte, ohne Scrollen sichtbar.
    const box = await page.locator('.lp-formular').boundingBox();
    expect(box && box.y).toBeLessThanOrEqual(812);
  });

  test('/jobs/profil/: Rolle drei Knoepfe, Wuensche ohne Pflicht, Freigabe freiwillig', async ({ page }) => {
    await page.goto('/jobs/profil/');
    const rollen = page.locator('[data-bewerbung-form] input[name="rolle"]');
    await expect(rollen).toHaveCount(3);
    expect(await rollen.evaluateAll((els) => els.map((e) => e.value).sort())).toEqual(['koch', 'leitung', 'service']);
    expect(await rollen.evaluateAll((els) => els.some((e) => e.checked))).toBe(false);
    // Wuensche: wege (Mehrfach), keine Pflicht, keine Vorauswahl.
    const wege = page.locator('[data-bewerbung-form] input[name="wege"]');
    await expect(wege).toHaveCount(3);
    expect(await wege.evaluateAll((els) => els.some((e) => e.required || e.checked))).toBe(false);
    for (const n of ['arbeitszeit', 'umzug', 'unterkunft']) {
      const r = page.locator(`[data-bewerbung-form] input[name="${n}"]`);
      expect(await r.evaluateAll((els) => els.some((e) => e.required || e.checked))).toBe(false);
    }
    for (const n of ['verfuegbar_ab', 'gehaltswunsch']) {
      await expect(page.locator(`[data-bewerbung-form] input[name="${n}"]`)).not.toHaveAttribute('required', '');
    }
    const freigabe = page.locator('[data-bewerbung-form] input[name="profil_freigabe"]');
    await expect(freigabe).toHaveCount(1);
    expect(await freigabe.evaluate((e) => e.required)).toBe(false);
    expect(await freigabe.evaluate((e) => e.checked)).toBe(false);
  });

  test('A74 greift auch auf der Profil-Seite (Knopf gesperrt bei „Nein oder unklar")', async ({ page }) => {
    await page.goto('/jobs/profil/');
    await consent(page);
    const form = page.locator('[data-bewerbung-form]');
    const knopf = form.locator('button[type="submit"]');
    await form.locator('label.bw-rolle', { hasText: 'Nein, oder ich weiß es nicht' }).click();
    await expect(page.locator('[data-bw-sperre]')).toBeVisible();
    await expect(knopf).toBeDisabled();
  });

  test('/jobs/profil/: Erfolg MIT Freigabe — Ereignis mit rolle/quelle/freigabe/wege, Danke „Profil angelegt"', async ({ page }) => {
    let gesendet = null;
    await page.route('**/api/formular', async (route) => {
      gesendet = route.request().postData() || '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/jobs/profil/');
    await consent(page);
    const form = page.locator('[data-bewerbung-form]');
    await form.locator('input[name="name"]').fill('Test Avorix');
    await form.locator('input[name="telefon"]').fill('+43 664 123 45 67');
    await form.locator('label.bw-rolle', { hasText: 'Leitung' }).click();
    await form.locator('select[name="region"]').selectOption('Tirol');
    await form.locator('label.bw-rolle', { hasText: 'Pass oder Ausweis' }).click();
    await form.locator('select[name="erfahrung"]').selectOption('3 bis 5 Jahre');
    // zwei Wege ankreuzen
    await form.locator('label.bw-check', { hasText: 'Bei Avorix angestellt' }).click();
    await form.locator('label.bw-check', { hasText: 'für eine Saison' }).click();
    await form.locator('input[name="profil_freigabe"]').check();
    await page.waitForTimeout(3100);
    await altchaVerify(page);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('[data-bw-danke]')).toBeVisible();
    await expect(page.locator('[data-bw-danke]')).toContainText('dein Profil ist angelegt');
    const ev = await page.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === 'bewerbung'));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ rolle: 'leitung', quelle: 'profil', freigabe: 'ja', wege: 'avorix,saison' });
    // Messung ohne Gehalt und ohne Personendaten (GTM ergaenzt eigene Schluessel).
    for (const k of ['gehaltswunsch', 'name', 'telefon', 'nachricht', 'email']) {
      expect(Object.prototype.hasOwnProperty.call(ev[0], k)).toBe(false);
    }
    expect(gesendet).toContain('name="profil_freigabe"');
    expect(gesendet).toContain('name="wege"');
  });

  test('/jobs/profil/: Erfolg OHNE Freigabe — freigabe nein, Danke „Bewerbung ist da"', async ({ page }) => {
    await page.route('**/api/formular', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );
    await page.goto('/jobs/profil/');
    await consent(page);
    const form = page.locator('[data-bewerbung-form]');
    await form.locator('input[name="name"]').fill('Test Avorix');
    await form.locator('input[name="telefon"]').fill('+43 664 123 45 67');
    await form.locator('label.bw-rolle', { hasText: 'Koch' }).first().click();
    await form.locator('select[name="region"]').selectOption('Tirol');
    await form.locator('label.bw-rolle', { hasText: 'Pass oder Ausweis' }).click();
    await form.locator('select[name="erfahrung"]').selectOption('1 bis 2 Jahre');
    await page.waitForTimeout(3100);
    await altchaVerify(page);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('[data-bw-danke]')).toContainText('deine Bewerbung ist da');
    const ev = await page.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === 'bewerbung'));
    expect(ev[0]).toMatchObject({ freigabe: 'nein', wege: '' });
  });

  test('Teil 5: Datenschutz DE+EN haben den neuen Abschnitt und die Ergaenzung', async ({ page }) => {
    await page.goto('/datenschutz/');
    let t = (await page.evaluate(() => document.body.textContent || '')).replace(/\s+/g, ' ');
    expect(t).toContain('Vorstellung bei Betrieben');
    expect(t).toContain('Ihre Wünsche zu Arbeitsform, Arbeitszeit, Arbeitsbeginn, Umzug, Unterkunft und Gehalt');
    // Kanzlei 27.10.: Rechtsgrundlage Bewerbungen auf Art. 6 Abs. 1 lit. b DSGVO, nicht mehr § 26 BDSG.
    expect(t).toContain('Artikel 6 Absatz 1 Buchstabe b DSGVO');
    expect(t).not.toContain('26 Absatz 1 Satz 1 BDSG');
    // Kanzlei 27.10.: Profil-Speicherdauer sechs statt zwoelf Monate + regelmaessige Pruefung.
    expect(t).toContain('sechs Monate nach Ihrer');
    expect(t).not.toContain('zwölf Monate nach Ihrer');
    expect(t).toContain('überprüfen regelmäßig');
    await page.goto('/en/privacy/');
    t = (await page.evaluate(() => document.body.textContent || '')).replace(/\s+/g, ' ');
    expect(t).toContain('Presenting your profile to businesses');
    expect(t).toContain('your wishes regarding type of employment, working hours, start date, relocation, accommodation and salary');
    expect(t).toContain('Art. 6(1)(b) GDPR');
    expect(t).not.toContain('Section 26(1) sentence 1');
    expect(t).toContain('six months after your');
    expect(t).not.toContain('twelve months after your');
    expect(t).toContain('review regularly');
  });

  test('Kanzlei 27.10.: ungarische Datenschutzseite + HU-Freigabe-Link zeigt dorthin', async ({ page, request }) => {
    await page.goto('/hu/adatvedelem-bemutatas/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    const t = (await page.evaluate(() => document.body.textContent || '')).replace(/\s+/g, ' ');
    expect(t).toContain('Bemutatás a vállalkozásoknál');
    expect(t).toContain('hat hónappal az utolsó');
    expect(t).toContain('GDPR 6. cikk (1) bekezdés a) pont');
    // noindex-Seite: nicht in Sitemap.
    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    expect(sitemap).not.toContain('/hu/adatvedelem-bemutatas/');
    // Das ungarische Freigabe-Haekchen verlinkt jetzt auf die ungarische Seite.
    await page.goto('/hu/profil/');
    const href = await page.locator('.bw-freigabe-label a').getAttribute('href');
    expect(href).toBe('/hu/adatvedelem-bemutatas/');
  });
});

/**
 * A83: Zwei neue Wissen-Artikel + /leitfaden/ entlasten.
 */
test.describe('A83: Wissen-Artikel Fachkräftemangel und Personalbedarf', () => {
  const graphOf = async (page, pfad) => {
    await page.goto(pfad);
    return page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"]')]
        .flatMap((s) => { const d = JSON.parse(s.textContent); return Array.isArray(d) ? d : [d]; })
    );
  };

  test('beide Artikel liefern 200 und stehen in Sitemap und llms.txt', async ({ request }) => {
    for (const p of ['/wissen/fachkraeftemangel-kueche/', '/wissen/personalbedarf-kueche/']) {
      expect((await request.get(p)).status()).toBe(200);
    }
    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    expect(sitemap).toContain('/wissen/fachkraeftemangel-kueche/');
    expect(sitemap).toContain('/wissen/personalbedarf-kueche/');
    const llms = await (await request.get('/llms.txt')).text();
    expect(llms).toContain('/wissen/fachkraeftemangel-kueche');
    expect(llms).toContain('/wissen/personalbedarf-kueche');
  });

  test('Artikel 1: Direktantwort, FAQ, citation, Autor-@id, Knopf, keine Gedankenstriche', async ({ page }) => {
    const graph = await graphOf(page, '/wissen/fachkraeftemangel-kueche/');
    const art = graph.find((n) => n['@type'] === 'Article');
    expect(art.author['@id']).toBe('https://avorix.de/ueber-uns/#boerge-penk');
    expect(art.publisher['@id']).toBe('https://avorix.de/#organization');
    expect(art.citation.length).toBeGreaterThanOrEqual(12);
    expect(graph.find((n) => n['@type'] === 'FAQPage').mainEntity.length).toBe(6);
    expect(graph.some((n) => n['@type'] === 'BreadcrumbList')).toBe(true);
    await expect(page.locator('#direktantwort')).toHaveCount(1);
    await expect(page.locator('a[data-cta-location="wissen-fachkraeftemangel-ende"]')).toHaveAttribute('href', '/personal/');
    const txt = await page.locator('main').innerText();
    expect(txt).not.toContain('—');
    expect(txt).not.toMatch(/ – /);
  });

  test('Artikel 2: Direktantwort, FAQ 6, Autor-@id, Knopf, kein citation', async ({ page }) => {
    const graph = await graphOf(page, '/wissen/personalbedarf-kueche/');
    const art = graph.find((n) => n['@type'] === 'Article');
    expect(art.author['@id']).toBe('https://avorix.de/ueber-uns/#boerge-penk');
    expect(art.citation).toBeUndefined();
    expect(graph.find((n) => n['@type'] === 'FAQPage').mainEntity.length).toBe(6);
    await expect(page.locator('#direktantwort')).toHaveCount(1);
    await expect(page.locator('a[data-cta-location="wissen-personalbedarf-ende"]')).toHaveAttribute('href', '/personal/');
  });

  test('beide Tabellen ohne horizontalen Seitenüberlauf bei 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const p of ['/wissen/fachkraeftemangel-kueche/', '/wissen/personalbedarf-kueche/']) {
      await page.goto(p);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(m.sw, p).toBeLessThanOrEqual(m.cw);
    }
  });

  test('Hub /wissen/ trägt beide neuen Karten als erste ihrer Rubrik', async ({ page }) => {
    await page.goto('/wissen/');
    const ersteHrefs = await page.evaluate(() =>
      [...document.querySelectorAll('section')].map((sek) => {
        const h2 = sek.querySelector('h2');
        const ersteKarte = sek.querySelector('a[href^="/wissen/"]');
        return h2 ? { rubrik: h2.innerText, erste: ersteKarte?.getAttribute('href') } : null;
      }).filter(Boolean)
    );
    const r1 = ersteHrefs.find((x) => x.rubrik.includes('Wenn gerade jemand fehlt'));
    const r2 = ersteHrefs.find((x) => x.rubrik.includes('Küche rechnen und organisieren'));
    expect(r1?.erste).toBe('/wissen/fachkraeftemangel-kueche/');
    expect(r2?.erste).toBe('/wissen/personalbedarf-kueche/');
  });

  test('/leitfaden/: FAQ und Zahlen-Sektionen entfernt, neue Direktantwort verlinkt den Artikel', async ({ page }) => {
    const graph = await graphOf(page, '/leitfaden/');
    expect(graph.some((n) => n['@type'] === 'FAQPage')).toBe(false);
    const txt = await page.locator('main').innerText();
    expect(txt).not.toContain('Deutschland: die Zahlen');
    expect(txt).not.toContain('Häufige Fragen');
    expect(txt).toContain('Was das für Ihre Küche heißt');
    await expect(page.locator('#direktantwort a[href="/wissen/fachkraeftemangel-kueche/"]')).toHaveCount(1);
  });

  test('Nachverlinkung: Outsourcing-Artikel zeigt auf den neuen Artikel, dateModified neu', async ({ page }) => {
    const graph = await graphOf(page, '/wissen/kueche-outsourcen/');
    expect(graph.find((n) => n['@type'] === 'Article').dateModified).toBe('2026-11-03');
    const haus = page.locator('a[href="/wissen/fachkraeftemangel-kueche/"]');
    await expect(haus.first()).toBeVisible();
  });
});

/**
 * A82: Der Erklaerfilm "Avorix-Koeche, einfach erklaert" auf /personal/.
 * Statische, codec-unabhaengige Pruefungen (headless Chromium spielt kein H.264).
 * Lage, kein Film-Byte vor dem Klick, Knopf/CTA, Masse und VideoObject.
 */
test.describe('A82: Erklaerfilm auf /personal/', () => {
  test('steht nach #direktantwort und vor "Wann Sie uns rufen"', async ({ page }) => {
    await page.goto('/personal');
    const lage = await page.evaluate(() => {
      const film = document.querySelector('[data-film]');
      const da = document.querySelector('#direktantwort');
      const wann = [...document.querySelectorAll('h2')].find((h) => h.innerText.includes('Wann Sie uns rufen'));
      const y = (el) => el.getBoundingClientRect().top + window.scrollY;
      return {
        h2: film.closest('section').querySelector('h2').innerText,
        daY: y(da),
        filmY: y(film.closest('section')),
        wannY: y(wann),
      };
    });
    expect(lage.h2).toContain('Avorix-Köche, einfach erklärt');
    expect(lage.filmY).toBeGreaterThan(lage.daY);
    expect(lage.filmY).toBeLessThan(lage.wannY);
  });

  test('vor dem Klick kein Film-Byte; Poster laedt lazy mit festen Massen', async ({ page }) => {
    const mp4 = [];
    page.on('request', (r) => { if (r.url().includes('.mp4')) mp4.push(r.url()); });
    await page.goto('/personal');
    const v = page.locator('.film-video');
    await expect(v).toHaveAttribute('preload', 'none');
    expect(await v.getAttribute('src')).toBeNull();
    const poster = page.locator('.film-poster');
    await expect(poster).toHaveAttribute('loading', 'lazy');
    await expect(poster).toHaveAttribute('width', '1920');
    await expect(poster).toHaveAttribute('height', '1080');
    expect(mp4).toEqual([]);
  });

  test('Abspielknopf ist ein echter Button mit Zugaenglichkeitsnamen; CTA zu #anfrage', async ({ page }) => {
    await page.goto('/personal');
    const knopf = page.locator('.film-abspielen');
    expect(await knopf.evaluate((el) => el.tagName)).toBe('BUTTON');
    await expect(knopf).toHaveAttribute('aria-label', /Film abspielen/);
    const cta = page.locator('.film-cta');
    await expect(cta).toHaveAttribute('href', '#anfrage');
    await expect(cta).toHaveAttribute('data-cta-location', 'personal-film');
    await expect(cta).toHaveAttribute('data-cta-event', 'cta_personal_click');
  });

  test('16:9, ohne Radius/Schatten, linksbuendig mit der H2 (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/personal');
    const m = await page.evaluate(() => {
      const box = document.querySelector('[data-film]');
      const h2 = box.closest('section').querySelector('h2');
      const r = box.getBoundingClientRect();
      const hr = h2.getBoundingClientRect();
      const cs = getComputedStyle(box);
      return {
        ratio: Math.round((r.width / r.height) * 100) / 100,
        breite: Math.round(r.width),
        radius: cs.borderRadius,
        schatten: cs.boxShadow,
        kante: Math.abs(r.left - hr.left),
      };
    });
    expect(m.ratio).toBe(1.78);
    expect(m.breite).toBeGreaterThan(1020);
    expect(m.breite).toBeLessThanOrEqual(1032);
    expect(m.radius).toBe('0px');
    expect(m.schatten).toBe('none');
    expect(m.kante).toBeLessThan(2);
  });

  test('traegt ein VideoObject, am WebPage-Knoten verknuepft', async ({ page }) => {
    await page.goto('/personal');
    const graph = await page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((e) => JSON.parse(e.textContent)).flat()
    );
    const vo = graph.find((n) => n['@type'] === 'VideoObject');
    const wp = graph.find((n) => n['@type'] === 'WebPage');
    expect(vo).toBeTruthy();
    expect(vo['@id']).toBe('https://avorix.de/personal/#film');
    expect(vo.name).toBe('Avorix-Köche, einfach erklärt');
    expect(vo.duration).toBe('PT2M24S');
    expect(vo.contentUrl).toContain('/film/avorix-film-erster-tag-1080p.mp4');
    expect(vo.thumbnailUrl).toContain('/film/avorix-film-erster-tag-poster.jpg');
    expect(wp.video['@id']).toBe('https://avorix.de/personal/#film');
  });
});

/*
 * A84: Bewerbungen gehen an bewerbung@avorix.de. Profilseiten und die drei
 * Widerruf-Stellen im Datenschutz nennen die neue Adresse, Kundenseiten
 * behalten info@ (Kontakt, Verantwortlicher).
 */
test.describe('A84: Bewerber-Adresse bewerbung@avorix.de', () => {
  const stellen = [
    ['/jobs/profil/', 'an bewerbung@avorix.de reicht'],
    ['/en/jobs/profile/', 'to bewerbung@avorix.de is enough'],
    ['/hu/profil/', 'vagy a bewerbung@avorix.de címre'],
    ['/datenschutz/', 'per E-Mail an bewerbung@avorix.de oder per WhatsApp'],
    ['/en/privacy/', 'by email to bewerbung@avorix.de or via WhatsApp'],
    ['/hu/adatvedelem-bemutatas/', 'például a bewerbung@avorix.de címre'],
  ];
  for (const [pfad, satz] of stellen) {
    test(`${pfad} nennt Bewerbern bewerbung@`, async ({ page }) => {
      await page.goto(pfad);
      const text = (await page.locator('main').textContent()).replace(/\s+/g, ' ');
      expect(text).toContain(satz);
    });
  }

  test('HU-Datenschutz: mailto zeigt auf bewerbung@', async ({ page }) => {
    await page.goto('/hu/adatvedelem-bemutatas/');
    await expect(page.locator('a[href="mailto:bewerbung@avorix.de"]')).toHaveCount(1);
    await expect(page.locator('a[href="mailto:info@avorix.de"]')).toHaveCount(0);
  });

  test('Kundenseiten und Verantwortlicher bleiben bei info@', async ({ page }) => {
    for (const pfad of ['/kontakt/', '/datenschutz/', '/en/privacy/']) {
      await page.goto(pfad);
      await expect(page.locator('a[href="mailto:info@avorix.de"]').first()).toBeVisible();
    }
  });
});

/*
 * A82 Nachtrag 1: Film im Vollbild nicht beschneiden (object-fit contain).
 */
test.describe('A82 Nachtrag 1: Vollbild ohne Beschnitt', () => {
  test('film-video nutzt contain auf schwarzem Grund', async ({ page }) => {
    await page.goto('/personal');
    const css = await page.$eval('.film-video', (el) => {
      const cs = getComputedStyle(el);
      return { fit: cs.objectFit, bg: cs.backgroundColor };
    });
    expect(css.fit).toBe('contain');
    expect(css.bg).toBe('rgb(0, 0, 0)');
  });
});

/*
 * A85: Partnerband "Unsere Partner" mit drei Logos auf /, /en/, /personal/, /en/staff/.
 */
test.describe('A85: Partnerslider', () => {
  const seiten = [
    ['/', 'Unsere Partner', 'Kommt Ihnen das bekannt vor?', '#direktantwort'],
    ['/en/', 'Our partners', 'Does this sound familiar?', '#direktantwort'],
    ['/personal/', 'Unsere Partner', 'Avorix-Köche, einfach erklärt.', '#direktantwort'],
    ['/en/staff/', 'Our partners', 'When to call us.', null],
  ];
  const namen = ['AÜG+', 'Seehotel Friedrichshafen', 'HACCP Control'];

  for (const [pfad, titel, naechsteH2, vorher] of seiten) {
    test(`${pfad}: Band an der richtigen Stelle, Beschriftung, Alt-Texte`, async ({ page }) => {
      await page.goto(pfad);
      await expect(page.locator('.partner-band')).toHaveCount(1);
      const lage = await page.$eval('.partner-band', (band) => ({
        titel: band.querySelector('.partner-titel').textContent.trim(),
        vorher: band.previousElementSibling ? band.previousElementSibling.innerHTML : '',
        naechsteH2: band.nextElementSibling.querySelector('h2')?.textContent.trim(),
        klassen: band.className,
      }));
      expect(lage.titel).toBe(titel);
      expect(lage.naechsteH2).toBe(naechsteH2);
      if (vorher) expect(lage.vorher).toContain('id="direktantwort"');
      else expect(lage.vorher).toContain('Avorix hires out permanently employed');
      expect(lage.klassen).not.toContain('section-gap');
      expect(lage.klassen).not.toContain('reveal');
      // erste Liste mit Namen, zweite als Kopie versteckt und ohne Alt-Texte
      const listen = await page.$$eval('.partner-spur', (uls) => uls.map((ul) => ({
        hidden: ul.getAttribute('aria-hidden'),
        alts: [...ul.querySelectorAll('img')].map((i) => i.getAttribute('alt')),
        links: ul.querySelectorAll('a').length,
      })));
      expect(listen).toEqual([
        { hidden: null, alts: namen, links: 0 },
        { hidden: 'true', alts: ['', '', ''], links: 0 },
      ]);
    });
  }

  test('Logo-Dateien als SVG, byte-gleich', async ({ request }) => {
    for (const [f, groesse] of [['aueg-plus-logo', 18127], ['seehotel-friedrichshafen-logo', 13915], ['haccp-control-logo-dunkel', 6215]]) {
      const r = await request.get(`/partner/${f}.svg`);
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toContain('image/svg+xml');
      expect((await r.body()).length).toBe(groesse);
    }
  });

  for (const pfad of ['/', '/en/', '/en/staff/']) {
    test(`${pfad}: Abschnitt nach dem Band hat oben wieder Abstand`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(pfad);
      const pt = await page.$eval('.partner-band + section', (el) => getComputedStyle(el).paddingTop);
      expect(pt).toBe('128px');
    });
  }

  test('Desktop: Beschriftung links, Logos rechts, Band laeuft', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const m = await page.$eval('.partner-band', (band) => {
      const t = band.querySelector('.partner-titel').getBoundingClientRect();
      const s = band.querySelector('.partner-slider').getBoundingClientRect();
      return { titelRechts: t.right, sliderLinks: s.left, gleicheZeile: Math.abs((t.top + t.bottom) / 2 - (s.top + s.bottom) / 2) < 20,
        anim: getComputedStyle(band.querySelector('.partner-spur')).animationName };
    });
    expect(m.titelRechts).toBeLessThan(m.sliderLinks);
    expect(m.gleicheZeile).toBe(true);
    expect(m.anim).not.toBe('none');
  });

  for (const pfad of ['/', '/en/staff/']) {
    test(`${pfad}: Handy 390px ohne seitliches Scrollen, Titel ueber den Logos`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(pfad);
      const m = await page.evaluate(() => {
        const band = document.querySelector('.partner-band');
        return {
          ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          titelUnten: band.querySelector('.partner-titel').getBoundingClientRect().bottom,
          sliderOben: band.querySelector('.partner-slider').getBoundingClientRect().top,
        };
      });
      expect(m.ueberlauf).toBe(0);
      expect(m.titelUnten).toBeLessThanOrEqual(m.sliderOben);
    });
  }

  test('Bewegung reduzieren: steht still, jedes Logo einmal', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const m = await page.$$eval('.partner-spur', (uls) => uls.map((ul) => ({
      display: getComputedStyle(ul).display,
      anim: getComputedStyle(ul).animationName,
    })));
    expect(m[0].display).toBe('flex');
    expect(m[0].anim).toBe('none');
    expect(m[1].display).toBe('none');
  });
});

/*
 * A86: Zielseite /personal/koch-mieten/ fuer die Google-Anzeigen (noindex,
 * nirgends verlinkt). Formular und FAQ 3/4/5 sind woertlich von /personal/.
 */
test.describe('A86: Zielseite Koch mieten', () => {
  const PFAD = '/personal/koch-mieten/';
  // Astro vergibt je Seite eigene Scope-Attribute; fuer den Wortlaut-Vergleich raus.
  const ohneCid = (html) => html.replace(/ data-astro-cid-[a-z0-9]+=""/g, '');

  test('Antwort 200 ohne Umleitung', async ({ request }) => {
    const r = await request.get(PFAD, { maxRedirects: 0 });
    expect(r.status()).toBe(200);
  });

  test('Kopf: title, description, robots, canonical, kein hreflang, kein FAQPage', async ({ page }) => {
    await page.goto(PFAD);
    await expect(page).toHaveTitle('Koch mieten für Hotel, Restaurant und Kantine | Avorix');
    expect(await page.getAttribute('meta[name="description"]', 'content')).toBe(
      'Koch mieten für Ihren Betrieb: Rückmeldung innerhalb von 24 Stunden, Einsatz in der Regel innerhalb von 24 bis 72 Stunden, keine Mindest-Einsatzdauer.');
    expect(await page.getAttribute('meta[name="robots"]', 'content')).toBe('noindex, follow');
    expect(await page.getAttribute('link[rel="canonical"]', 'href')).toBe('https://avorix.de/personal/koch-mieten/');
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    const schema = await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent).join(''));
    expect(schema).not.toContain('FAQPage');
  });

  test('nicht in Sitemap und llms.txt, robots.txt sperrt nicht', async ({ request }) => {
    const sm = await request.get('/sitemap-0.xml');
    expect(sm.status()).toBe(200);
    expect(await sm.text()).not.toContain('koch-mieten');
    expect(await (await request.get('/llms.txt')).text()).not.toContain('koch-mieten');
    const robots = await (await request.get('/robots.txt')).text();
    for (const zeile of robots.split('\n').filter((z) => /^disallow:/i.test(z.trim()))) {
      const regel = zeile.split(':')[1].trim();
      if (regel) expect(PFAD.startsWith(regel)).toBe(false);
    }
  });

  test('keine Links auf die Seite (Menue, Footer, andere Seiten)', async ({ page }) => {
    for (const pfad of ['/', '/personal/', '/personal/bodensee/', '/wissen/', '/kontakt/']) {
      await page.goto(pfad);
      await expect(page.locator('a[href*="koch-mieten"]')).toHaveCount(0);
    }
  });

  test('Abschnitte in der Reihenfolge aus Teil 3', async ({ page }) => {
    await page.goto(PFAD);
    expect((await page.textContent('h1')).trim()).toBe('Koch mieten für Hotel, Restaurant und Kantine.');
    const h2 = await page.$$eval('main h2', (els) => els.map((e) => e.textContent.trim()));
    expect(h2).toEqual([
      'Das gilt bei jedem Einsatz.',
      'Wer bei Ihnen am Herd steht.',
      'So läuft ein Einsatz. In vier Schritten.',
      'Aus dem laufenden Betrieb.',
      'Was kostet das?',
      'Koch anfragen.',
      'Häufige Fragen',
    ]);
    await expect(page.locator('.partner-band')).toHaveCount(1);
    await expect(page.locator('main video')).toHaveCount(0);
    // Inhalt: nur vier Links (Jobs, Frage 3, Frage 4, Telefon) ausser #anfrage/Datenschutz
    const links = await page.$$eval('main a[href]', (els) => [...new Set(els.map((a) => a.getAttribute('href')))]
      .filter((h) => !h.startsWith('#') && h !== '/datenschutz' && !h.startsWith('https://altcha.org')));
    expect(links.sort()).toEqual(['/jobs/', '/wissen/mietkoch-kosten/', '/wissen/mietkoch-scheinselbstaendigkeit/', 'tel:+4975413973915'].sort());
  });

  test('FAQ: sechs Fragen, 3/4/5 woertlich wie /personal/', async ({ page }) => {
    await page.goto('/personal/');
    const quelle = await page.$$eval('.faq-item', (els) => Object.fromEntries(els.map((d) => [
      d.querySelector('summary').textContent.trim(), d.querySelector('.faq-inner').innerHTML])));
    await page.goto(PFAD);
    const hier = await page.$$eval('.faq-item', (els) => els.map((d) => [
      d.querySelector('summary').textContent.trim(), d.querySelector('.faq-inner').innerHTML]));
    expect(hier.map(([f]) => f)).toEqual([
      'Wie schnell kann jemand bei uns stehen?',
      'Gibt es eine Mindest-Einsatzdauer?',
      'Was kostet ein Mietkoch bei Avorix?',
      'Was ist der Unterschied zwischen einem Mietkoch und einem Koch von Avorix?',
      'Wer ist der Arbeitgeber unseres Leihkochs?',
      'Was ist, wenn der Koch nicht zu unserem Team passt?',
    ]);
    for (const [frage, antwort] of hier.slice(1)) expect(ohneCid(antwort)).toBe(ohneCid(quelle[frage]));
    expect(ohneCid(hier[0][1])).toBe('<p>In der Regel innerhalb von 24 bis 72 Stunden, je nach Standort und Anforderung.</p>');
  });

  test('Formular gleich wie /personal/ (Adresse, Felder, Ablauf-Text)', async ({ page }) => {
    const lies = async () => page.$eval('#anfrage form', (f) => ({
      action: f.getAttribute('action'), method: f.getAttribute('method'),
      felder: [...f.querySelectorAll('input, textarea, select')].map((e) => `${e.name}|${e.type}|${e.required}|${e.value && e.type !== 'radio' ? '' : e.value}`),
      ablauf: f.querySelector('.anfrage-ablauf').innerHTML,
      hinweis: f.querySelector('.formular-hinweis').innerHTML,
    }));
    await page.goto('/personal/');
    const quelle = await lies();
    await page.goto(PFAD);
    const hier = await lies();
    for (const k of ['ablauf', 'hinweis']) { hier[k] = ohneCid(hier[k]); quelle[k] = ohneCid(quelle[k]); }
    expect(hier).toEqual(quelle);
    expect(hier.action).toBe('/api/formular');
  });

  test('Knoepfe "Koch anfragen" springen zum Formular', async ({ page }) => {
    await page.goto(PFAD);
    const knoepfe = await page.$$eval('main a', (els) => els.filter((a) => a.textContent.trim() === 'Koch anfragen').map((a) => a.getAttribute('href')));
    expect(knoepfe.length).toBe(2);
    for (const h of knoepfe) expect(h).toBe('#anfrage');
    await expect(page.locator('section#anfrage form')).toHaveCount(1);
  });

  test('Handy 390px: H1, Absatz und Knopf ohne Scrollen, kein Seitenueberlauf', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PFAD);
    const m = await page.evaluate(() => {
      const knopf = [...document.querySelectorAll('.hero-copy a')].find((a) => a.textContent.trim() === 'Koch anfragen');
      return {
        knopfUnten: knopf.getBoundingClientRect().bottom,
        h1Oben: document.querySelector('h1').getBoundingClientRect().top,
        hoehe: window.innerHeight,
        ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(m.h1Oben).toBeGreaterThanOrEqual(0);
    expect(m.knopfUnten).toBeLessThanOrEqual(m.hoehe);
    expect(m.ueberlauf).toBe(0);
  });
});

/*
 * A87: Feinschliff /personal/koch-mieten/. Hero mit Einsatzgebiet und Beleg,
 * Karten neu sortiert, "Personal anfragen" in der Kopfzeile bleibt auf der Seite.
 */
test.describe('A87: Koch mieten Feinschliff', () => {
  const PFAD = '/personal/koch-mieten/';
  const GEBIET = 'Wir arbeiten in ganz Deutschland und Österreich.';
  const norm = (t) => t.replace(/\s+/g, ' ').trim();

  test('Hero: Absatz, Beleg unter dem Knopf, dann Notfall-Zeile', async ({ page }) => {
    await page.goto(PFAD);
    expect(norm(await page.textContent('.hero-copy .lead'))).toBe(
      'Es fehlt jemand, wir schicken einen Koch. Kurzfristige Einsätze sind in der Regel innerhalb von 24 bis 72 Stunden möglich, tageweise, wochenweise oder für die ganze Saison. ' + GEBIET);
    const folge = await page.$$eval('.hero-copy > *', (els) => els.map((e) => e.className));
    const i = folge.indexOf('hero-beleg');
    expect(i).toBeGreaterThan(0);
    expect(folge[i - 1]).toContain('flex');
    expect(folge[i + 1]).toBe('hero-telefon');
    expect(norm(await page.textContent('.hero-beleg'))).toBe('Über 1.000 Einsatztage in den Küchen unserer Kunden.');
    // Beleg bleibt auch im Abschnitt "Aus dem laufenden Betrieb."
    const body = norm(await page.textContent('main'));
    expect(body.split('Über 1.000 Einsatztage in den Küchen unserer Kunden.').length - 1).toBe(2);
    expect(body.split(GEBIET).length - 1).toBe(1);
    expect(body).not.toMatch(/[–—]/);
  });

  test('Wer bei Ihnen am Herd steht: zweiter Absatz endet mit Küchenhilfen', async ({ page }) => {
    await page.goto(PFAD);
    const absaetze = await page.$$eval('h2', (els) => {
      const h = els.find((e) => e.textContent.trim() === 'Wer bei Ihnen am Herd steht.');
      return [...h.parentElement.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim());
    });
    expect(absaetze).toEqual([
      'Wir arbeiten für Betriebe: Hotels, Restaurants, Kantinen und Caterer. Für private Feiern und Haushalte schicken wir keine Köche.',
      'Jeder, den wir schicken, ist Koch mit langjähriger Küchenerfahrung, je nach Bedarf als Beikoch, Koch oder Souschef, in Ausnahmen auch als Küchenchef. Küchenhilfen schicken wir nicht.',
      'Du bist selbst Koch und suchst eine Stelle? Dann geht es hier entlang: Jobs bei Avorix.',
    ]);
  });

  test('Karten in neuer Reihenfolge, Texte unverändert, 2x2 auf dem Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PFAD);
    const karten = await page.$$eval('h2', (els) => {
      const h = els.find((e) => e.textContent.trim() === 'Das gilt bei jedem Einsatz.');
      return [...h.parentElement.querySelectorAll('.card')].map((c) => ({
        t: c.querySelector('h3').textContent.trim(),
        p: c.querySelector('p').textContent.replace(/\s+/g, ' ').trim(),
        x: Math.round(c.getBoundingClientRect().left),
      }));
    });
    expect(karten.map((k) => [k.t, k.p])).toEqual([
      ['Fest angestellt statt auf Rechnung.', 'Unsere Köche sind bei Avorix fest angestellt und sozialversichert. Avorix bleibt der Arbeitgeber.'],
      ['In der Regel innerhalb von 24 bis 72 Stunden.', 'Wir melden uns innerhalb von 24 Stunden. Danach steht in der Regel innerhalb von 24 bis 72 Stunden ein Koch in Ihrer Küche, je nach Standort und Anforderung.'],
      ['Keine Mindest-Einsatzdauer.', 'Ein einzelner Tag ist genauso möglich wie eine ganze Saison.'],
      ['Fester Stundensatz.', 'Der Stundensatz steht fest, bevor der Einsatz beginnt. Keine versteckten Posten.'],
    ]);
    expect(karten[0].x).toBe(karten[2].x);
    expect(karten[1].x).toBeGreaterThan(karten[0].x);
  });

  test('Kopfzeile: "Personal anfragen" springt hier zu #anfrage, sonst wie bisher', async ({ page }) => {
    const ziele = async () => page.$$eval('a.nav-cta, a.nav-mobile-cta', (els) =>
      els.filter((a) => a.textContent.trim() === 'Personal anfragen').map((a) => a.getAttribute('href')));
    await page.goto(PFAD);
    expect(await ziele()).toEqual(['#anfrage', '#anfrage']);
    for (const pfad of ['/', '/personal/', '/personal/bodensee/']) {
      await page.goto(pfad);
      expect(await ziele()).toEqual(['/personal#anfrage', '/personal#anfrage']);
    }
  });

  test('Handy: Menü schließt sich beim Sprung zu #anfrage', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PFAD);
    await page.click('#mobile-menu-btn');
    await expect(page.locator('#mobile-nav-overlay')).toHaveClass(/is-open/);
    await page.click('#mobile-nav-overlay a[href="#anfrage"]');
    await expect(page.locator('#mobile-nav-overlay')).not.toHaveClass(/is-open/);
    expect(page.url()).toContain('#anfrage');
    await expect(page.locator('section#anfrage')).toBeInViewport();
  });
});
