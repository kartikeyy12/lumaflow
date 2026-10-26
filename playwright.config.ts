import { defineConfig, devices } from '@playwright/test'

// Set LUMAFLOW_CHROMIUM to use an existing Chromium binary instead of `npx playwright install chromium`.
const executablePath = process.env.LUMAFLOW_CHROMIUM || undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
    launchOptions: { executablePath },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
