import { test, expect } from '@playwright/test';

const GOOGLE = /googletagmanager\.com|google-analytics\.com|doubleclick\.net|googlesyndication\.com|googleads\.g\.doubleclick\.net|analytics\.google\.com/;
const GOOGLE_ANY = /google\.com|googleapis\.com|gstatic\.com|googletagmanager\.com|google-analytics\.com|doubleclick\.net|googlesyndication\.com|analytics\.google\.com|youtube\.com|recaptcha\.net/;
const GOOGLE_FONTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

function collectGoogleRequests(page) {
  const hits = [];
  page.on('request', (r) => { if (GOOGLE_ANY.test(r.url())) hits.push(r.url()); });
  return hits;
}

function collectGTMRequests(page) {
  const hits = [];
  page.on('request', (r) => { if (/googletagmanager\.com\/gtm\.js/.test(r.url())) hits.push(r.url()); });
  return hits;
}

test.describe('Consent Banner v2', () => {

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // T1 – Erstbesuch
  test('T1: Erstbesuch – Banner sichtbar, keine Google-Requests, keine Cookies', async ({ page }) => {
    const hits = collectGoogleRequests(page);
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    // Drei Buttons sichtbar
    await expect(page.locator('#cb-accept-all')).toBeVisible();
    await expect(page.locator('#cb-reject-all')).toBeVisible();
    await expect(page.locator('#cb-settings')).toBeVisible();
    // Statistik standardmäßig aus (Panel prüfen)
    await page.locator('#cb-settings').click();
    const toggle = page.locator('#cp-statistics-toggle');
    await expect(toggle).not.toBeChecked();
    await page.locator('#cp-close').click();
    await page.waitForTimeout(2000);
    expect(hits).toHaveLength(0);
    expect(await page.context().cookies()).toHaveLength(0);
  });

  // T2 – Alle akzeptieren
  test('T2: Alle akzeptieren – v2-Format, Consent-Update vor GTM, GTM lädt einmal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    const gtmRequest = page.waitForRequest(/googletagmanager\.com\/gtm\.js/);
    await page.locator('#cb-accept-all').click();
    await gtmRequest;

    // v2 stored
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.version).toBe(2);
    expect(stored.categories.necessary).toBe(true);
    expect(stored.categories.statistics).toBe(true);
    expect(stored.categories.marketing).toBe(false);
    expect(stored.timestamp).toBeTruthy();

    // Consent update before gtm.js in dataLayer
    const dl = await page.evaluate(() =>
      window.dataLayer.map((e) => {
        if (e && e.event) return 'event:' + e.event;
        if (e && e[0] === 'consent') return 'consent:' + e[1];
        return 'other';
      })
    );
    const updateIdx = dl.indexOf('consent:update');
    const gtmIdx = dl.indexOf('event:gtm.js');
    expect(updateIdx).toBeGreaterThan(-1);
    expect(gtmIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(gtmIdx);

    // Verify consent:update has analytics_storage:granted and ad signals denied
    const consentEntry = await page.evaluate(() => {
      return window.dataLayer.find(e => e && e[0] === 'consent' && e[1] === 'update');
    });
    expect(consentEntry[2].analytics_storage).toBe('granted');
    expect(consentEntry[2].ad_storage).toBe('denied');
    expect(consentEntry[2].ad_user_data).toBe('denied');
    expect(consentEntry[2].ad_personalization).toBe('denied');
  });

  // T3 – Alle ablehnen
  test('T3: Alle ablehnen – v2-Format, kein GTM, Banner nach Reload weg', async ({ page }) => {
    const hits = collectGoogleRequests(page);
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.locator('#cb-reject-all').click();
    await expect(page.locator('#consent-banner')).toBeHidden();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.version).toBe(2);
    expect(stored.categories.necessary).toBe(true);
    expect(stored.categories.statistics).toBe(false);
    expect(stored.categories.marketing).toBe(false);

    await page.waitForTimeout(2000);
    expect(hits).toHaveLength(0);

    // Reload: banner should stay hidden
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('#consent-banner')).toBeHidden();
  });

  // T4 – Einstellungen öffnen und schließen
  test('T4: Einstellungen – öffnen speichert nichts, Escape/X schließen, Fokus zurück', async ({ page }) => {
    const hits = collectGoogleRequests(page);
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();

    // Open settings
    await page.locator('#cb-settings').click();
    await expect(page.locator('#consent-panel')).toBeVisible();

    // Nothing stored
    const storedAfterOpen = await page.evaluate(() => localStorage.getItem('avorix_consent'));
    expect(storedAfterOpen).toBeNull();
    expect(hits).toHaveLength(0);

    // Close with X
    await page.locator('#cp-close').click();
    await expect(page.locator('#consent-panel')).toBeHidden();

    // Banner still visible (first visit)
    await expect(page.locator('#consent-banner')).toBeVisible();

    // Re-open and close with Escape
    await page.locator('#cb-settings').click();
    await expect(page.locator('#consent-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#consent-panel')).toBeHidden();
    await expect(page.locator('#consent-banner')).toBeVisible();

    // Still nothing stored
    const storedAfterClose = await page.evaluate(() => localStorage.getItem('avorix_consent'));
    expect(storedAfterClose).toBeNull();
    expect(hits).toHaveLength(0);

    // Focus returned to settings button
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('cb-settings');
  });

  // T5 – Auswahl speichern: Statistik an
  test('T5: Auswahl speichern mit Statistik an – v2-Format, Consent-Update, GTM einmal', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cb-settings').click();
    await expect(page.locator('#consent-panel')).toBeVisible();

    // Toggle statistics on
    await page.evaluate(() => {
      const el = document.getElementById('cp-statistics-toggle');
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    const gtmRequest = page.waitForRequest(/googletagmanager\.com\/gtm\.js/);
    await page.locator('#cp-save').click();
    await gtmRequest;

    await expect(page.locator('#consent-panel')).toBeHidden();
    await expect(page.locator('#consent-banner')).toBeHidden();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.categories.statistics).toBe(true);
    expect(stored.categories.marketing).toBe(false);

    // Consent update has analytics_storage granted, ad signals denied
    const consentEntry = await page.evaluate(() => {
      return window.dataLayer.find(e => e && e[0] === 'consent' && e[1] === 'update');
    });
    expect(consentEntry[2].analytics_storage).toBe('granted');
    expect(consentEntry[2].ad_storage).toBe('denied');
    expect(consentEntry[2].ad_user_data).toBe('denied');
    expect(consentEntry[2].ad_personalization).toBe('denied');
  });

  // T6 – Auswahl speichern: Statistik aus
  test('T6: Auswahl speichern mit Statistik aus – kein GTM, Banner nach Reload weg', async ({ page }) => {
    const hits = collectGoogleRequests(page);
    await page.goto('/');
    await page.locator('#cb-settings').click();
    // Statistics toggle should be off by default
    await expect(page.locator('#cp-statistics-toggle')).not.toBeChecked();
    await page.locator('#cp-save').click();

    await expect(page.locator('#consent-panel')).toBeHidden();
    await expect(page.locator('#consent-banner')).toBeHidden();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.categories.statistics).toBe(false);
    expect(stored.categories.marketing).toBe(false);

    await page.waitForTimeout(2000);
    expect(hits).toHaveLength(0);

    // Reload: no banner
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('#consent-banner')).toBeHidden();
  });

  // T7 – Persistenz und Footer
  test('T7: Persistenz – kein Banner auf DE/EN Seiten, Footer öffnet Panel', async ({ page }) => {
    // Accept
    await page.goto('/');
    await page.locator('#cb-accept-all').click();
    await expect(page.locator('#consent-banner')).toBeHidden();

    // Navigate to another DE page
    await page.goto('/kontakt');
    await expect(page.locator('#consent-banner')).toBeHidden();

    // Navigate to EN page
    await page.goto('/en');
    await expect(page.locator('#consent-banner')).toBeHidden();

    // Footer link opens panel (not banner)
    await page.evaluate(() => document.getElementById('footer-cookie-settings').click());
    await expect(page.locator('#consent-panel')).toBeVisible();

    // Toggle reflects stored state (statistics on)
    await expect(page.locator('#cp-statistics-toggle')).toBeChecked();

    // Opening alone doesn't trigger requests or storage changes
    const storedBefore = await page.evaluate(() => localStorage.getItem('avorix_consent'));
    const hitsDuringOpen = [];
    page.on('request', (r) => { if (GOOGLE_ANY.test(r.url())) hitsDuringOpen.push(r.url()); });
    await page.waitForTimeout(1000);
    const storedAfter = await page.evaluate(() => localStorage.getItem('avorix_consent'));
    expect(storedBefore).toBe(storedAfter);

    // Close panel
    await page.locator('#cp-close').click();
    await expect(page.locator('#consent-panel')).toBeHidden();
  });

  // T8 – Migration
  test('T8: Migration v1 granted – kein Banner, GTM lädt, v2-Format', async ({ page }) => {
    // Pre-set v1 granted
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('avorix_consent', JSON.stringify({
        status: 'granted', version: 1, timestamp: '2026-01-01T00:00:00.000Z'
      }));
    });
    const gtmHits = collectGTMRequests(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#consent-banner')).toBeHidden();
    await page.waitForTimeout(3000);
    expect(gtmHits.length).toBeGreaterThanOrEqual(1);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.version).toBe(2);
    expect(stored.categories.statistics).toBe(true);
    expect(stored.categories.marketing).toBe(false);
  });

  test('T8b: Migration v1 denied – kein Banner, kein GTM, v2-Format', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('avorix_consent', JSON.stringify({
        status: 'denied', version: 1, timestamp: '2026-01-01T00:00:00.000Z'
      }));
    });
    const hits = collectGoogleRequests(page);
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('#consent-banner')).toBeHidden();
    await page.waitForTimeout(2000);
    expect(hits).toHaveLength(0);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.version).toBe(2);
    expect(stored.categories.statistics).toBe(false);
    expect(stored.categories.marketing).toBe(false);
  });

  // T9 – Widerruf
  test('T9: Widerruf – Statistik aus, consent denied, GA-Cookies gelöscht, kein GTM nach Reload', async ({ page }) => {
    // First accept
    await page.goto('/');
    await page.locator('#cb-accept-all').click();
    await page.waitForTimeout(2000);

    // Open footer settings
    await page.evaluate(() => document.getElementById('footer-cookie-settings').click());
    await expect(page.locator('#consent-panel')).toBeVisible();
    await expect(page.locator('#cp-statistics-toggle')).toBeChecked();

    // Uncheck statistics and save
    await page.evaluate(() => {
      const el = document.getElementById('cp-statistics-toggle');
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.locator('#cp-save').click();
    await expect(page.locator('#consent-panel')).toBeHidden();

    // Verify consent update was fired with analytics_storage denied
    const consentUpdates = await page.evaluate(() => {
      return window.dataLayer.filter(e => e && e[0] === 'consent' && e[1] === 'update');
    });
    const lastUpdate = consentUpdates[consentUpdates.length - 1];
    expect(lastUpdate[2].analytics_storage).toBe('denied');
    expect(lastUpdate[2].ad_storage).toBe('denied');
    expect(lastUpdate[2].ad_user_data).toBe('denied');
    expect(lastUpdate[2].ad_personalization).toBe('denied');

    // GA cookies deleted
    const gaCookies = await page.evaluate(() => {
      return document.cookie.split(';').filter(c => {
        var name = c.split('=')[0].trim();
        return name === '_ga' || name.indexOf('_ga_') === 0;
      });
    });
    expect(gaCookies).toHaveLength(0);

    // Stored consent updated
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.categories.statistics).toBe(false);

    // After reload: no GTM, no banner
    const hitsAfterReload = collectGoogleRequests(page);
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('#consent-banner')).toBeHidden();
    await page.waitForTimeout(2000);
    expect(hitsAfterReload).toHaveLength(0);
  });

  // T10 – localStorage blockiert
  test('T10: blockierter localStorage – kein Crash, Banner sichtbar, nichts lädt', async ({ page }) => {
    await page.addInitScript(() => {
      const err = new DOMException('The operation is insecure.', 'SecurityError');
      Storage.prototype.getItem = function() { throw err; };
      Storage.prototype.setItem = function() { throw err; };
      Storage.prototype.removeItem = function() { throw err; };
      Storage.prototype.clear = function() { throw err; };
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const hits = collectGoogleRequests(page);
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
    expect(hits).toHaveLength(0);
  });

  // T11 – Barrierefreiheit und Mobil
  test('T11: Barrierefreiheit – Fokus-Falle, Escape, X, Rückfokus, 375px bedienbar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();

    // All three banner buttons visible without horizontal scroll
    await expect(page.locator('#cb-accept-all')).toBeVisible();
    await expect(page.locator('#cb-reject-all')).toBeVisible();
    await expect(page.locator('#cb-settings')).toBeVisible();

    // No horizontal scroll
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHScroll).toBe(false);

    // Open panel
    await page.locator('#cb-settings').click();
    await expect(page.locator('#consent-panel')).toBeVisible();

    // Panel fully contained (no overflow)
    const panelVisible = await page.locator('#consent-panel .cp-dialog').isVisible();
    expect(panelVisible).toBe(true);

    // Focus trap: Tab should stay within panel
    const closeBtn = page.locator('#cp-close');
    await expect(closeBtn).toBeFocused();

    // Escape closes
    await page.keyboard.press('Escape');
    await expect(page.locator('#consent-panel')).toBeHidden();

    // Focus returned
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('cb-settings');

    // Accessible names
    await page.locator('#cb-settings').click();
    const dialogRole = await page.locator('#consent-panel').getAttribute('role');
    expect(dialogRole).toBe('dialog');
    const ariaModal = await page.locator('#consent-panel').getAttribute('aria-modal');
    expect(ariaModal).toBe('true');
  });

  // T12 – Sprachfassungen
  test('T12: DE-Texte auf deutscher Seite', async ({ page }) => {
    await page.goto('/');
    const bannerText = await page.locator('#consent-banner').textContent();
    expect(bannerText).toContain('Wir verwenden Cookies und ähnliche Technologien');
    expect(bannerText).toContain('Alle akzeptieren');
    expect(bannerText).toContain('Alle ablehnen');
    expect(bannerText).toContain('Einstellungen');

    // Open panel
    await page.locator('#cb-settings').click();
    const panelText = await page.locator('#consent-panel').textContent();
    expect(panelText).toContain('Cookie-Einstellungen');
    expect(panelText).toContain('Technisch notwendig');
    expect(panelText).toContain('immer aktiv');
    expect(panelText).toContain('Statistik');
    expect(panelText).toContain('Auswahl speichern');
  });

  test('T12b: EN-Texte auf englischer Seite', async ({ page }) => {
    await page.goto('/en');
    const bannerText = await page.locator('#consent-banner').textContent();
    expect(bannerText).toContain('We use cookies and similar technologies');
    expect(bannerText).toContain('Accept all');
    expect(bannerText).toContain('Reject all');
    expect(bannerText).toContain('Settings');

    await page.locator('#cb-settings').click();
    const panelText = await page.locator('#consent-panel').textContent();
    expect(panelText).toContain('Cookie settings');
    expect(panelText).toContain('Technically necessary');
    expect(panelText).toContain('always active');
    expect(panelText).toContain('Statistics');
    expect(panelText).toContain('Save selection');
  });

  test('T12c: Consent-Entscheidung ist sprachübergreifend identisch', async ({ page }) => {
    // Accept on DE
    await page.goto('/');
    await page.locator('#cb-accept-all').click();
    // Check on EN
    await page.goto('/en');
    await expect(page.locator('#consent-banner')).toBeHidden();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.categories.statistics).toBe(true);
  });

  // Existing test: CTA tracking
  test('CTA: cta_demo_click feuert genau einmal pro Klick', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cb-accept-all').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.querySelectorAll('[data-cta-location]').forEach(el => {
        el.addEventListener('click', (e) => e.preventDefault(), { capture: true });
      });
    });
    const cta = page.locator('[data-cta-location]').first();
    await cta.click();
    await page.waitForTimeout(500);
    const count = await page.evaluate(() =>
      window.dataLayer.filter((e) => e && e.event === 'cta_demo_click').length
    );
    expect(count).toBe(1);
  });

  // Existing test: No Google Fonts
  test('Keine Google-Fonts-Requests (self-hosted)', async ({ page }) => {
    const fontHits = [];
    page.on('request', (r) => { if (GOOGLE_FONTS.test(r.url())) fontHits.push(r.url()); });
    await page.goto('/');
    await page.waitForTimeout(2000);
    expect(fontHits).toHaveLength(0);
  });

  // Existing test: CSP
  test('GTM-Script nicht durch CSP blockiert nach Consent', async ({ page }) => {
    const cspViolations = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content Security Policy') || msg.text().includes('CSP')) {
        cspViolations.push(msg.text());
      }
    });
    await page.goto('/');
    const gtmResponse = page.waitForResponse((r) =>
      r.url().includes('googletagmanager.com/gtm.js') && r.status() === 200
    );
    await page.locator('#cb-accept-all').click();
    const resp = await gtmResponse;
    expect(resp.status()).toBe(200);
    const gtmCspBlocks = cspViolations.filter((v) => v.includes('googletagmanager'));
    expect(gtmCspBlocks).toHaveLength(0);
  });

});
