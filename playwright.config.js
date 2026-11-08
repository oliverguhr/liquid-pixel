const { defineConfig } = require('@playwright/test');
const port = Number(process.env.LIQUID_PIXEL_TEST_PORT || 4174);
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './browser-tests',
  workers: 1,
  timeout: 60000,
  use: {
    browserName: 'chromium',
    baseURL,
    viewport: { width: 1000, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.cjs',
    env: { PORT: String(port) },
    url: baseURL,
    reuseExistingServer: false,
  },
});
