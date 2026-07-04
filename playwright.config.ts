import { defineConfig, devices } from "@playwright/test";

const PORT = 4300;

// Runs against a local Supabase stack (`supabase start` + `supabase db reset`), never the
// production project — .env.test points VITE_SUPABASE_URL/ANON_KEY at http://127.0.0.1:54321,
// loaded by Vite's own `--mode test` env resolution (.env.test), no code changes needed.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx vite --mode test --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
