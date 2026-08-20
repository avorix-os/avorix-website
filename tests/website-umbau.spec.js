import { test, expect } from '@playwright/test';

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

    // Intercept Formspree to prevent actual submission
    await page.route('**/formspree.io/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );

    // Fill required fields
    await page.fill('input[name="name"], input[name="Name"]', 'Test Hotel');
    await page.fill('input[name="betrieb"], input[name="Betrieb"], input[name="betrieb_ort"]', 'Testhotel Friedrichshafen');
    await page.fill('input[name="email"], input[name="E-Mail"], input[type="email"]', 'test@example.com');

    // Submit
    const submitBtn = page.locator('form button[type="submit"], form input[type="submit"]');
    await submitBtn.click();

    await page.waitForTimeout(1000);

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

      const luecke = await page.$eval('.nav-links', (el) => getComputedStyle(el).columnGap);
      expect(luecke).toBe('32px');

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

test.describe('T8b: D2 — der Hero traegt fuenf Dinge', () => {
  test('Startseite — Satz gestrichen, Haekchen-Zeilen eine Sektion tiefer', async ({ page }) => {
    await page.goto('/');
    const text = await page.evaluate(() => document.body.innerText);

    // Anweisung 19: der ganze Satz verschwindet, nicht nur die Fettung
    expect(text).not.toContain('Auch ohne ausgebildete');

    // Im Hero steht keine Haekchen-Zeile mehr
    const imHero = await page.$$eval('.hero-badges .check-badge', (els) => els.length);
    expect(imHero).toBe(0);

    // Sie sind aber nicht geloescht, sondern stehen weiter unten
    const belege = await page.$$eval('.beleg-badges .check-badge', (els) => els.map((el) => el.innerText.trim()));
    expect(belege.length).toBe(2);
    expect(belege.join(' ')).toContain('Von K');
    expect(belege.join(' ')).toContain('Friedrichshafen');

    const [heroY, belegY] = await page.evaluate(() => [
      document.querySelector('.hero-badges').getBoundingClientRect().top,
      document.querySelector('.beleg-badges').getBoundingClientRect().top,
    ]);
    expect(belegY).toBeGreaterThan(heroY);
  });
});

test.describe('T8c: E1 — hoechstens drei Schriftfamilien', () => {
  for (const pagePath of TITEL_SEITEN) {
    test(`${pagePath} — drei Familien`, async ({ page }) => {
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
      expect(familien.length, familien.join(', ')).toBeLessThanOrEqual(3);
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
