const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8000",
    headless: true
  },
  webServer: {
    command: "node scripts/static-server.mjs --port 8000",
    url: "http://127.0.0.1:8000",
    reuseExistingServer: true,
    timeout: 20000
  }
});
