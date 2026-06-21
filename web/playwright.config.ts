import { defineConfig } from "@playwright/test";

// E2E proof harness. The extension is loaded into a real Chromium via a persistent
// context inside the test (Playwright can only load extensions in Chromium), and the
// session is recorded to e2e-results/videos as the per-browser "it actually works"
// screencast. The fixture server is started here.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: {
    baseURL: "http://localhost:5188",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    url: "http://localhost:5188",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
