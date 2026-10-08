import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "./e2e/testAccounts.ts";

loadEnv();

// E2E_BASE_URL=https://word-counter.ankile.com runs the suite against production (prod Convex, real reCAPTCHA).
// Otherwise it starts `next dev` against the Convex dev deployment, on E2E_PORT (default 3100; set it to run a second
// checkout, such as a worktree, alongside one already serving 3100, which would otherwise be reused).
const port = process.env.E2E_PORT ?? "3100";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // Tests share the synthetic accounts, so run one at a time
  workers: 1,
  globalSetup: "./e2e/globalSetup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: devices["Desktop Chrome"] },
    { name: "iphone", use: devices["iPhone 15"] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npx next dev --port ${port}`, url: baseURL, reuseExistingServer: true },
});
