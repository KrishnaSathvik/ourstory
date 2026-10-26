import { expect, test, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * End-to-end against the production build (CSP active):
 * real synthetic export files → import → who's who → story → almanac.
 */
const SAMPLES = resolve('samples')
const files = ['WhatsApp Chat - Theo Lindqvist.zip', 'instagram-maya-2025.zip', 'result.json'].map((f) => resolve(SAMPLES, f))

test.beforeAll(() => {
  if (!files.every(existsSync)) execSync('npx tsx scripts/make-samples.ts')
})

// Phrases that exist in the synthetic messages and must never be rendered.
const SECRET_PHRASES = ['what do you want for dinner', 'pickle knocked over my plant', 'the train is delayed again', 'i burnt the toast again']

async function assertNoMessageText(page: Page) {
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const p of SECRET_PHRASES) expect(text, `"${p}" leaked into the UI`).not.toContain(p)
}

test('CSP blocks every outgoing connection', async ({ page }) => {
  await page.goto('/')
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("connect-src 'none'")
  const result = await page.evaluate(async () => {
    const out: string[] = []
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'x' })
      out.push('fetch-ok')
    } catch {
      out.push('fetch-blocked')
    }
    try {
      await fetch('/same-origin-probe')
      out.push('self-ok')
    } catch {
      out.push('self-blocked')
    }
    // sendBeacon returns true once *queued*; the proof is the CSP violation it triggers.
    const violated = new Promise<string>((res) =>
      document.addEventListener('securitypolicyviolation', (e) => {
        if (e.blockedURI.includes('example.com/b')) res(`beacon-blocked:${e.effectiveDirective}`)
      }),
    )
    navigator.sendBeacon('https://example.com/b', 'x')
    out.push(await Promise.race([violated, new Promise<string>((r) => setTimeout(() => r('beacon-not-blocked'), 3000))]))
    return out
  })
  expect(result).toEqual(['fetch-blocked', 'self-blocked', 'beacon-blocked:connect-src'])
})

test('imports real exports offline, builds the story, never shows message text', async ({ page, context }) => {
  const requests: string[] = []
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin with your chats' }).click()
  await page.waitForTimeout(500) // the analysis worker warms up while online

  // From here on: no network at all.
  await context.setOffline(true)
  page.on('request', (r) => requests.push(r.url()))
  await expect(page.getByText('Offline · and Duet still works')).toBeVisible()

  await page.locator('input[type=file][multiple]').setInputFiles(files)
  await expect(page.getByText('result.json')).toBeVisible()
  const read = page.getByRole('button', { name: /Read my files/ })
  await expect(read).toBeDisabled() // consent required
  await page.getByText('A conversation belongs to both of you.').click()
  await read.click()

  // Who's who
  await expect(page.getByRole('heading', { name: /Who’s who/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.chat')).toHaveCount(3)
  // Instagram zip contained a non-message JSON and a photo: neither is a chat.
  const names = page.locator('.names__field input')
  await expect(names.nth(0)).toHaveValue('Maya')
  await expect(names.nth(1)).toHaveValue('Theo')
  await assertNoMessageText(page)
  await page.getByRole('button', { name: /Weave our story/ }).click()

  // Story
  await expect(page.locator('.player')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /Maya & Theo/ })).toBeVisible()
  for (let i = 0; i < 40 && !(await page.locator('.outro').count()); i++) {
    const opt = page.locator('.predict__opt').first()
    if (await opt.count()) await opt.click()
    else await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
    await assertNoMessageText(page)
  }
  await expect(page.locator('.outro')).toBeVisible()
  await page.getByRole('button', { name: /Explore the almanac/ }).click()
  await expect(page.getByRole('heading', { name: /The whole of it/ })).toBeVisible()
  await assertNoMessageText(page)

  // Keepsakes render offline too (chunks were prefetched).
  await page.getByRole('button', { name: 'Keepsakes', exact: true }).click()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  // Only same-origin static assets may have been requested; offline they'd fail anyway.
  expect(requests.filter((u) => !u.startsWith('http://localhost:4173/') && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([])
})

test('quiz: pass-the-phone mode hides answers until both have played', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Watch the demo couple/ }).click()
  await expect(page.locator('.player')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: /Pass the phone/ }).click()
  await page.getByRole('button', { name: /I’m Maya, show me/ }).click()
  await page.locator('.qopt').first().click()
  await expect(page.getByRole('heading', { name: /Pass to Theo/ })).toBeVisible()
  await expect(page.locator('.qreveal')).toHaveCount(0)
  await page.getByRole('button', { name: /I’m Theo, show me/ }).click()
  await page.locator('.qopt').nth(1).click()
  await expect(page.locator('.qreveal')).toBeVisible()
})

test('forget everything returns to a clean start', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Watch the demo couple/ }).click()
  await expect(page.locator('.player')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  await page.getByRole('button', { name: 'Forget everything' }).click()
  await page.getByRole('button', { name: 'Yes, forget it all' }).click()
  await expect(page.getByRole('heading', { name: /played back/ })).toBeVisible()
  expect(await page.evaluate(() => localStorage.length)).toBe(0)
})
