import { defineConfig } from '@playwright/test';

/**
 * Zwei Betriebsarten:
 *
 * 1. Am Arbeitsplatz (ohne PW_BASE_URL): Playwright baut die Seite selbst und
 *    startet den Vorschau-Server.
 * 2. Im Deploy-Gate auf dem Server (mit PW_BASE_URL): Die Seite läuft schon —
 *    als frisch gebauter Testcontainer, gegen den geprüft wird, bevor der
 *    Stand live geht. Dann darf Playwright keinen eigenen Server starten.
 */
const BASIS_URL = process.env.PW_BASE_URL;

export default defineConfig({
  testDir: './tests',
  outputDir: '/tmp/pw-results',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: BASIS_URL || 'http://localhost:4321',
    headless: true,
    launchOptions: {
      args: ['--no-sandbox', '--font-render-hinting=none', '--disable-skia-runtime-opts'],
    },
  },
  ...(BASIS_URL
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm run preview',
          url: 'http://localhost:4321',
          reuseExistingServer: true,
          timeout: 120000,
        },
      }),
});
