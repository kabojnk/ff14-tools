import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

/** The theme screenshots run only in their own projects (a separate CI step; see SETUP.md). */
const SCREENSHOTS = /themes\.spec\.ts/

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // all tests share one seeded database
  retries: isCI ? 2 : 0,
  forbidOnly: isCI,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-desktop',
      testIgnore: SCREENSHOTS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      dependencies: ['setup'],
    },
    {
      name: 'webkit-iphone',
      testIgnore: SCREENSHOTS,
      use: { ...devices['iPhone 15'] },
      dependencies: ['setup'],
    },
    {
      name: 'screenshots-desktop',
      testMatch: SCREENSHOTS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      dependencies: ['setup'],
    },
    {
      // Chromium at an iPhone 15's size with a coarse pointer (touch), so the phone layout renders.
      name: 'screenshots-phone',
      testMatch: SCREENSHOTS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev:test',
    url: 'http://localhost:5174',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
