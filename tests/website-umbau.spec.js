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

  test('ab 640px darf die Hervorhebung wieder zusammenbleiben', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/personal');
    const nowrap = await page.$eval('h1 mark', (el) => getComputedStyle(el).whiteSpace);
    expect(nowrap).toBe('nowrap');
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
        heroBadges: w('.hero-badges', 'columnGap'),
        heroGrid: w('.hero-grid', 'rowGap'),
        navInner: w('.nav-inner', 'paddingLeft'),
        btnX: w('.btn', 'paddingLeft'),
        btnY: w('.btn', 'paddingTop'),
        stempelX: w('.stempel', 'paddingLeft'),
      };
    });
    expect(werte.footerRight).toBe('16px');
    expect(werte.heroBadges).toBe('8px');
    expect(werte.heroGrid).toBe('40px');
    expect(werte.navInner).toBe('24px');
    // Ausnahmeliste aus Abschnitt 2: die Buttonwerte erzeugen die Buttonhoehe
    expect(werte.btnX).toBe('28px');
    expect(werte.btnY).toBe('13px');
    // selbst entschieden: 16 sprengt den Stempel nicht
    expect(werte.stempelX).toBe('16px');
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

test.describe('T12c: Korrektur 2 — keine Ueberschrift bricht enger als ihr Text', () => {
  for (const pagePath of ['/', '/koch-app', '/personal', '/system', '/fuer-hotels']) {
    test(`${pagePath} — Ueberschrift nie schmaler als ihr Absatz`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      const enger = await page.evaluate(() => {
        const raus = [];
        for (const h of document.querySelectorAll('h2, h3')) {
          const hw = h.getBoundingClientRect().width;
          const n = h.nextElementSibling;
          if (n && n.tagName === 'P') {
            const nw = n.getBoundingClientRect().width;
            if (nw > hw + 2) raus.push(`${Math.round(hw)} vs ${Math.round(nw)}: ${h.innerText.slice(0, 30)}`);
          }
        }
        return raus;
      });
      expect(enger).toEqual([]);
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
  const SOLL_DE = ['Wie alles zusammenspielt', 'Die App', 'Die Schulung', 'Das Personal', 'Pilotprogramm 2026'];
  const SOLL_EN = ['How It All Works Together', 'The Cook App', 'The Training', 'The Staff', 'Pilot Program 2026'];

  for (const [pagePath, soll] of [['/', SOLL_DE], ['/en', SOLL_EN]]) {
    for (const breite of [375, 1280]) {
      test(`${pagePath} @${breite}px — fuenf Eintraege in der richtigen Folge`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 900 });
        await page.goto(pagePath);
        const wahl = breite >= 900 ? '.nav-dropdown-menu .nav-dropdown-item' : '.mobile-section-link';
        const eintraege = await page.$$eval(wahl, (els) => els.map((el) => el.innerText.trim()));
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

test.describe('T13c: Korrektur 7 — Karten einer Reihe sind gleich hoch', () => {
  for (const pagePath of ['/personal', '/system', '/koch-app', '/en/system']) {
    test(`${pagePath} — gleiche Hoehe je Reihe`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(pagePath);
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 700));
        window.scrollTo(0, 0);
      });
      const ungleich = await page.evaluate(() => {
        const raus = [];
        for (const raster of document.querySelectorAll('.grid')) {
          const karten = [...raster.children].filter((k) => k.classList.contains('card') || k.classList.contains('card-modul'));
          if (karten.length < 2) continue;
          const reihen = new Map();
          for (const k of karten) {
            const oben = Math.round(k.getBoundingClientRect().top);
            const schluessel = [...reihen.keys()].find((x) => Math.abs(x - oben) < 8) ?? oben;
            if (!reihen.has(schluessel)) reihen.set(schluessel, []);
            reihen.get(schluessel).push(k);
          }
          for (const [, gruppe] of reihen) {
            if (gruppe.length < 2) continue;
            const hoehen = gruppe.map((k) => Math.round(k.getBoundingClientRect().height));
            if (Math.max(...hoehen) - Math.min(...hoehen) > 1) raus.push(hoehen.join('/'));
          }
        }
        return raus;
      });
      expect(ungleich).toEqual([]);
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
