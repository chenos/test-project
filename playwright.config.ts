import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  testMatch: '**/*.test.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  outputDir: './storage/playwright-results',
  use: {
    actionTimeout: 10_000,
    trace: 'off',
    launchOptions: {
      ...(process.env.PM2_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PM2_CHROMIUM_EXECUTABLE }
        : {}),
    },
  },
});
