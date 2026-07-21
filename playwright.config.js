import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: '/tmp/pw-results',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4321',
    headless: true,
    launchOptions: {
      args: ['--no-sandbox', '--font-render-hinting=none', '--disable-skia-runtime-opts'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
