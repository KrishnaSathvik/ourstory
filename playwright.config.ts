import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// Use the preinstalled Chromium when the bundled one isn't downloaded.
const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:4173', launchOptions: { executablePath } },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
})
