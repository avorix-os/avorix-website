import { test, expect } from '@playwright/test';

const GOOGLE = /googletagmanager\.com|google-analytics\.com|doubleclick\.net/;

function collectGoogleRequests(page) {
  const hits = [];
  page.on('request', (r) => { if (GOOGLE.test(r.url())) hits.push(r.url()); });
  return hits;
}

test.describe('Consent und Tracking', () => {

  test.beforeEach(async ({ context }) => {
    // Sicherstellen, dass localStorage sauber ist
    await context.clearCookies();
  });

  test('T1: Erstbesuch: Banner sichtbar, keine Google-Requests, keine Cookies', async ({ page }) => {
    const hits = collectGoogleRequests(page);
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.waitForTimeout(3000);
    expect(hits).toHaveLength(0);
    expect(await page.context().cookies()).toHaveLength(0);
  });

  test('T2+T3: Ablehnen speichert denied und ist persistent', async ({ page }) => {
    const hits = collectGoogleRequests(page);
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.locator('#consent-decline').click();
    await expect(page.locator('#consent-banner')).toBeHidden();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.status).toBe('denied');
    expect(stored.version).toBe(1);
    expect(stored.timestamp).toBeTruthy();
    await page.reload();
    await expect(page.locator('#consent-banner')).toBeHidden();
    await page.waitForTimeout(2000);
    expect(hits).toHaveLength(0);
  });

  test('T4: Akzeptieren: Update vor GTM-Load, GTM lädt', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    const gtmRequest = page.waitForRequest(/googletagmanager\.com\/gtm\.js/);
    await page.locator('#consent-accept').click();
    await gtmRequest;
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
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('avorix_consent')));
    expect(stored.status).toBe('granted');
  });

  test('T5: Nach Akzeptieren: kein Banner, genau ein GTM-Load pro Seite', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.locator('#consent-accept').click();
    const hits = collectGoogleRequests(page);
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.locator('#consent-banner')).toBeHidden();
    const gtmLoads = hits.filter((u) => u.includes('/gtm.js'));
    expect(gtmLoads).toHaveLength(1);
  });

  test('T6: Widerruf über Footer-Link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.locator('#consent-accept').click();
    await expect(page.locator('#consent-banner')).toBeHidden();
    await page.locator('#footer-cookie-settings').click();
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.locator('#consent-decline').click();
    await expect(page.locator('#consent-banner')).toBeHidden();
    const hits = collectGoogleRequests(page);
    await page.reload();
    await page.waitForTimeout(2000);
    expect(hits).toHaveLength(0);
  });

  test('T7: cta_demo_click feuert genau einmal pro Klick', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.locator('#consent-accept').click();
    const cta = page.locator('[data-cta-location]').first();
    await cta.click();
    const count = await page.evaluate(() =>
      window.dataLayer.filter((e) => e && e.event === 'cta_demo_click').length
    );
    expect(count).toBe(1);
  });

  test('T13: blockierter localStorage crasht nicht', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new Error('blocked'); }
      });
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    expect(errors).toHaveLength(0);
  });

});
