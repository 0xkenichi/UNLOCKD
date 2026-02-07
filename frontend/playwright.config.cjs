const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60 * 1000,
  use: {
    baseURL: 'http://127.0.0.1:5176',
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on'
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5176',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    timeout: 120 * 1000
  }
});
