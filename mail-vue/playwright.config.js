import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './test', testMatch: '**/*.e2e.js', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:3017', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npx vite build --config test/vite.config.js --mode release && npx vite preview --config test/vite.config.js --host 127.0.0.1 --port 3017', url: 'http://127.0.0.1:3017/test/signatures.html', reuseExistingServer: !process.env.CI }
});
