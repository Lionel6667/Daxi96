// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const baseURL = process.env.DAXI_BASE_URL || 'http://127.0.0.1:8000';

module.exports = defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.(js|ts)$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: path.join('artifacts', 'test-results'),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-HT',
    timezoneId: 'America/Port-au-Prince',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
