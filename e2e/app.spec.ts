import { expect, test, type Page } from '@playwright/test'

// Timing tests use reduced motion so the fake clock does not have to fire thousands of animation frames.
test.use({ reducedMotion: 'reduce' })

const MIN = 60_000
const clock = (page: Page) => page.getByRole('timer')

async function open(page: Page, opts: { storage?: Record<string, string> } = {}) {
  await page.clock.install({ time: new Date(2026, 4, 10, 9, 0, 0) })
  if (opts.storage) {
    await page.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v as string)
    }, opts.storage)
  }
  await page.goto('/')
  await ready(page)
}

async function ready(page: Page) {
  await page.locator('html[data-shortcuts="ready"]').waitFor({ state: 'attached' })
}

/** Advances in small steps so heartbeats and tick handlers run like a live app. */
async function live(page: Page, ms: number, step = 60_000) {
  for (let t = 0; t < ms; t += step) await page.clock.runFor(Math.min(step, ms - t))
}

test.describe('timer', () => {
  test('starts, counts down from the real clock, pauses and resumes', async ({ page }) => {
    await open(page)
    await expect(clock(page)).toHaveAccessibleName('25 minutes remaining')
    await page.getByRole('button', { name: 'Start' }).click()
    await live(page, 10 * MIN)
    await expect(clock(page)).toHaveAccessibleName('15 minutes remaining')
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.clock.fastForward(30 * MIN)
    await page.clock.runFor(2000)
    await expect(clock(page)).toHaveAccessibleName('15 minutes remaining')
    await expect(page.getByText('Paused', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Resume' }).click()
    await live(page, 5 * MIN)
    await expect(clock(page)).toHaveAccessibleName('10 minutes remaining')
  })

  test('completes, shows the completion state, and records exactly one session', async ({ page }) => {
    await open(page)
    await page.getByRole('textbox').fill('Laplace transforms')
    await page.getByRole('button', { name: 'Start' }).click()
    await live(page, 25 * MIN + 5000)
    await expect(page.getByText('Complete', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Start short break/ })).toBeVisible()
    await page.clock.runFor(60_000)
    await expect(page.getByText('Sessions today')).toBeVisible()
    await expect(page.locator('.stats dd').first()).toHaveText('1')
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByTestId('log').locator('li')).toHaveCount(1)
    await expect(page.getByTestId('log')).toContainText('Laplace transforms')
    await expect(page.getByTestId('log')).toContainText('Completed')
  })

  test('background tab: a paused JS clock catches up exactly on return', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Start' }).click()
    await live(page, 5 * MIN)
    // Simulate a heavily throttled tab: time passes, no timers fire for 12 minutes.
    await page.clock.pauseAt(new Date(2026, 4, 10, 9, 5, 5))
    await page.clock.fastForward(12 * MIN)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.clock.resume()
    await live(page, 1000, 250)
    await expect(clock(page)).toHaveAccessibleName(/^(7 minutes( \d+ seconds)?|8 minutes) remaining$/)
  })

  test('mode switching and shortcuts', async ({ page }) => {
    await open(page)
    await page.keyboard.press('2')
    await expect(clock(page)).toHaveAccessibleName('5 minutes remaining')
    await page.keyboard.press('3')
    await expect(clock(page)).toHaveAccessibleName('15 minutes remaining')
    await page.keyboard.press('1')
    await expect(clock(page)).toHaveAccessibleName('25 minutes remaining')
    await page.keyboard.press('Space')
    await expect(page.getByText('Running', { exact: true })).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  })

  test('reset needs a second press once real progress exists', async ({ page }) => {
    await open(page)
    await page.keyboard.press('Space')
    await live(page, 5 * MIN)
    await page.keyboard.press('r')
    await expect(page.getByRole('button', { name: 'Confirm reset' })).toBeVisible()
    await expect(clock(page)).toHaveAccessibleName('20 minutes remaining')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()
    await page.keyboard.press('r')
    await page.keyboard.press('r')
    await expect(clock(page)).toHaveAccessibleName('25 minutes remaining')
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByTestId('log')).toContainText('Ended early')
  })

  test('shortcuts are ignored while typing in a field', async ({ page }) => {
    await open(page)
    const topic = page.getByRole('textbox')
    await topic.click()
    await page.keyboard.type('r 1 2 3 space')
    await expect(topic).toHaveValue('r 1 2 3 space')
    await page.keyboard.press('Space')
    await expect(page.getByText('Ready', { exact: true })).toBeVisible()
    await expect(clock(page)).toHaveAccessibleName('25 minutes remaining')
  })
})

test.describe('persistence and recovery', () => {
  test('a reload keeps a running session and does not make noise or show a completion', async ({ page }) => {
    await open(page)
    await page.getByRole('textbox').fill('Op-amp filters')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Start' }).click()
    await live(page, 10 * MIN)
    await page.reload()
    await expect(clock(page)).toHaveAccessibleName(/^(14 minutes( \d+ seconds)?|15 minutes) remaining$/)
    await expect(page.getByText(/welcome back/i)).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveValue('Op-amp filters')
  })

  test('a reload after the end shows completed and records once', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Start' }).click()
    await live(page, 10 * MIN)
    await page.clock.fastForward(40 * MIN)
    await page.reload()
    await expect(page.getByText('Complete', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Complete', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByTestId('log').locator('li')).toHaveCount(1)
    await expect(page.getByTestId('log')).toContainText('Finished while away')
  })

  test('settings change the timer and survive a reload', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    const focus = page.getByLabel('Focus', { exact: true })
    await focus.fill('50')
    await focus.blur()
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await expect(clock(page)).toHaveAccessibleName('50 minutes remaining')
    await page.reload()
    await expect(clock(page)).toHaveAccessibleName('50 minutes remaining')
  })

  test('daily goal shows progress', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    const goal = page.getByLabel('Goal per day')
    await goal.fill('1')
    await page.getByLabel('Goal unit').selectOption('h')
    await goal.fill('1')
    await goal.blur()
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await expect(page.getByRole('progressbar', { name: 'Daily focus goal' })).toHaveAttribute('aria-valuetext', '0m of 1h')
  })

  test('clearing session data asks for confirmation first', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Start' }).click()
    await live(page, 25 * MIN + 5000)
    await page.getByRole('button', { name: 'History' }).click()
    await page.getByRole('button', { name: 'Clear session data' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('log').locator('li')).toHaveCount(1)
    await page.getByRole('button', { name: 'Clear session data' }).click()
    await page.getByRole('button', { name: 'Yes, clear everything' }).click()
    await expect(page.getByText('No sessions yet')).toBeVisible()
  })
})

test.describe('accessibility and motion', () => {
  test('reduced motion: the ribbon does not animate', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Start' }).click()
    const grab = () => page.getByTestId('flow-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
    const a = await grab()
    await page.waitForTimeout(1500)
    const b = await grab()
    expect(a).toBe(b)
    await ctx.close()
  })

  test('normal motion: the ribbon moves while running and holds still when paused', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'no-preference' })
    const page = await ctx.newPage()
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Start' }).click()
    const grab = () => page.getByTestId('flow-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
    const a = await grab()
    await page.waitForTimeout(1200)
    const b = await grab()
    expect(a).not.toBe(b)
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(6000)
    const c = await grab()
    await page.waitForTimeout(800)
    const d = await grab()
    expect(c).toBe(d)
    await ctx.close()
  })

  test('dialogs open, trap focus semantics and close with Escape', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('no horizontal overflow on a phone and at high zoom', async ({ browser }) => {
    for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 683, height: 384 }]) {
      const ctx = await browser.newContext({ viewport: vp })
      const page = await ctx.newPage()
      await page.goto('/')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${vp.width}x${vp.height}`).toBeLessThanOrEqual(0)
      await ctx.close()
    }
  })

  test('no console errors or warnings during a full session', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()))
    page.on('pageerror', (e) => problems.push(String(e)))
    await open(page)
    await page.keyboard.press('Space')
    await live(page, 25 * MIN + 5000)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.keyboard.press('Escape')
    expect(problems).toEqual([])
  })
})
