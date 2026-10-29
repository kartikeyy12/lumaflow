import { expect, test, type Page } from '@playwright/test'

const MIN = 60_000
const clock = (page: Page) => page.getByRole('timer')

async function ready(page: Page) {
  await page.locator('html[data-shortcuts="ready"]').waitFor({ state: 'attached' })
}

async function open(page: Page, storage?: Record<string, string>) {
  await page.clock.install({ time: new Date(2026, 4, 10, 9, 0, 0) })
  if (storage) {
    await page.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v as string)
    }, storage)
  }
  await page.goto('/')
  await ready(page)
}

async function live(page: Page, ms: number, step = 60_000) {
  for (let t = 0; t < ms; t += step) await page.clock.runFor(Math.min(step, ms - t))
}

test.describe('stopwatch', () => {
  test.use({ reducedMotion: 'reduce' })

  test('counts up, pauses, resumes, and saves one entry on finish', async ({ page }) => {
    await open(page)
    await page.getByRole('textbox').fill('Thermodynamics')
    await page.getByRole('button', { name: 'Stopwatch' }).click()
    await expect(clock(page)).toHaveAccessibleName('0 seconds elapsed')
    await page.getByRole('button', { name: 'Start' }).click()
    await live(page, 20 * MIN)
    await expect(clock(page)).toHaveAccessibleName('20 minutes elapsed')
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.clock.fastForward(30 * MIN)
    await page.clock.runFor(2000)
    await expect(clock(page)).toHaveAccessibleName('20 minutes elapsed')
    await page.getByRole('button', { name: 'Resume' }).click()
    await live(page, 5 * MIN)
    await expect(clock(page)).toHaveAccessibleName('25 minutes elapsed')
    await page.getByRole('button', { name: 'Finish' }).click()
    await page.getByRole('button', { name: 'Confirm finish' }).click()
    await expect(clock(page)).toHaveAccessibleName('0 seconds elapsed')
    await page.getByRole('button', { name: 'History' }).click()
    const log = page.getByTestId('log')
    await expect(log.locator('li')).toHaveCount(1)
    await expect(log).toContainText('Thermodynamics')
    await expect(log).toContainText('Stopwatch')
  })

  test('the 4 key opens it and 1 goes back to the focus timer', async ({ page }) => {
    await open(page)
    await page.keyboard.press('4')
    await expect(page.getByRole('button', { name: 'Stopwatch' })).toHaveAttribute('aria-pressed', 'true')
    await expect(clock(page)).toHaveAccessibleName('0 seconds elapsed')
    await page.keyboard.press('1')
    await expect(clock(page)).toHaveAccessibleName('25 minutes remaining')
  })

  test('leaving a running stopwatch needs a second press, then saves the time', async ({ page }) => {
    await open(page)
    await page.keyboard.press('4')
    await page.keyboard.press('Space')
    await live(page, 10 * MIN)
    await page.keyboard.press('2')
    await expect(page.getByText(/Switching saves your stopwatch time/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Stopwatch' })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('2')
    await expect(clock(page)).toHaveAccessibleName('5 minutes remaining')
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByTestId('log').locator('li')).toHaveCount(1)
  })

  test('a run under a minute is not saved and says so', async ({ page }) => {
    await open(page)
    await page.keyboard.press('4')
    await page.keyboard.press('Space')
    await live(page, 20_000, 5000)
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page.getByText(/under a minute/i)).toBeVisible()
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByText('No sessions yet')).toBeVisible()
  })

  test('a reload keeps the view and the running count', async ({ page }) => {
    await open(page)
    await page.keyboard.press('4')
    await page.keyboard.press('Space')
    await live(page, 10 * MIN)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Stopwatch' })).toHaveAttribute('aria-pressed', 'true')
    await expect(clock(page)).toHaveAccessibleName(/^10 minutes( \d+ seconds)? elapsed$/)
    await expect(page.getByText(/welcome back/i)).toBeVisible()
  })

  test('a long absence pauses it instead of counting the gap', async ({ page }) => {
    await open(page)
    await page.keyboard.press('4')
    await page.keyboard.press('Space')
    await live(page, 10 * MIN)
    await page.clock.fastForward(5 * 60 * MIN)
    await page.reload()
    await expect(page.getByText('Paused', { exact: true })).toBeVisible()
    await expect(clock(page)).toHaveAccessibleName(/^(9 minutes \d+ seconds|10 minutes) elapsed$/)
    await expect(page.getByText(/not counted|paused where you left it/i)).toBeVisible()
  })
})

test.describe('backgrounds', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the picker lists six and the choice applies and persists', async ({ page }) => {
    await open(page)
    await expect(page.locator('.app')).toHaveAttribute('data-scene', 'ribbon')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('radiogroup', { name: 'Background', exact: true }).getByRole('radio')).toHaveCount(6)
    await page.getByRole('radio', { name: /Nebula/ }).check({ force: true })
    await expect(page.locator('.app')).toHaveAttribute('data-scene', 'nebula')
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await page.reload()
    await expect(page.locator('.app')).toHaveAttribute('data-scene', 'nebula')
  })

  test('B cycles through every background and wraps around', async ({ page }) => {
    await open(page)
    const seen: string[] = []
    for (let i = 0; i < 6; i++) {
      seen.push((await page.locator('.app').getAttribute('data-scene')) ?? '')
      await page.keyboard.press('b')
    }
    expect(new Set(seen).size).toBe(6)
    await expect(page.locator('.app')).toHaveAttribute('data-scene', seen[0])
    await expect(page.getByRole('button', { name: /Change background, now/ })).toBeVisible()
  })

  test('changing the background does not disturb a running session', async ({ page }) => {
    await open(page)
    await page.keyboard.press('Space')
    await live(page, 5 * MIN)
    await page.keyboard.press('b')
    await live(page, 5 * MIN)
    await expect(clock(page)).toHaveAccessibleName('15 minutes remaining')
    await expect(page.getByText('Running', { exact: true })).toBeVisible()
  })

  test('an unknown saved background falls back to the default', async ({ page }) => {
    await open(page, { 'lumaflow.v1.settings': JSON.stringify({ scene: 'lava' }) })
    await expect(page.locator('.app')).toHaveAttribute('data-scene', 'ribbon')
  })

  test('reduced motion keeps every background still', async ({ page }) => {
    await open(page)
    await page.keyboard.press('Space')
    const grab = () => page.getByTestId('flow-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250)
      const a = await grab()
      await page.waitForTimeout(700)
      expect(await grab(), await page.locator('.app').getAttribute('data-scene') ?? '').toBe(a)
      await page.keyboard.press('b')
    }
  })
})

test.describe('background motion', () => {
  const scenes = ['ribbon', 'nebula', 'aurora', 'ripples', 'drift']

  for (const scene of scenes) {
    test(`${scene} moves while running and holds still once paused`, async ({ browser }) => {
      const ctx = await browser.newContext({ reducedMotion: 'no-preference' })
      const page = await ctx.newPage()
      await page.addInitScript((s) => localStorage.setItem('lumaflow.v1.settings', JSON.stringify({ scene: s })), scene)
      await page.goto('/')
      await ready(page)
      await expect(page.locator('.app')).toHaveAttribute('data-scene', scene)
      await page.getByRole('button', { name: 'Start' }).click()
      const grab = () => page.getByTestId('flow-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
      await page.waitForTimeout(600)
      const a = await grab()
      await page.waitForTimeout(1500)
      expect(await grab()).not.toBe(a)
      await page.getByRole('button', { name: 'Pause' }).click()
      await page.waitForTimeout(6000)
      const c = await grab()
      await page.waitForTimeout(800)
      expect(await grab()).toBe(c)
      await ctx.close()
    })
  }

  test('still never moves, even while running', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'no-preference' })
    const page = await ctx.newPage()
    await page.addInitScript(() => localStorage.setItem('lumaflow.v1.settings', JSON.stringify({ scene: 'still' })))
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Start' }).click()
    const grab = () => page.getByTestId('flow-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
    await page.waitForTimeout(600)
    const a = await grab()
    await page.waitForTimeout(1500)
    expect(await grab()).toBe(a)
    await ctx.close()
  })
})

/** Counts how many sound sources the page starts and stops, so tests can tell when audio is really running. */
async function watchAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __audio: { started: number; stopped: number } }
    w.__audio = { started: 0, stopped: 0 }
    const proto = AudioBufferSourceNode.prototype
    const start = proto.start
    const stop = proto.stop
    proto.start = function (...a: Parameters<typeof start>) {
      w.__audio.started++
      return start.apply(this, a)
    }
    proto.stop = function (...a: Parameters<typeof stop>) {
      w.__audio.stopped++
      return stop.apply(this, a)
    }
  })
}
const audio = (page: Page) =>
  page.evaluate(() => (window as unknown as { __audio: { started: number; stopped: number } }).__audio)
const soundBtn = (page: Page) => page.getByRole('button', { name: 'Background sound' })

test.describe('background sound', () => {
  test.use({ reducedMotion: 'reduce' })

  test('plays with a focus session, and stops on pause', async ({ page }) => {
    await watchAudio(page)
    await page.goto('/')
    await ready(page)
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect((await audio(page)).started).toBe(0)
    await page.keyboard.press('Space')
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await audio(page)).started).toBeGreaterThanOrEqual(3)
    await page.keyboard.press('Space')
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await audio(page)).stopped, { timeout: 5000 }).toBeGreaterThanOrEqual(3)
  })

  test('breaks stay quiet', async ({ page }) => {
    await watchAudio(page)
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('2')
    await page.keyboard.press('Space')
    await expect(page.getByText('Running', { exact: true })).toBeVisible()
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect((await audio(page)).started).toBe(0)
  })

  test('the stopwatch plays it too', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('4')
    await page.keyboard.press('Space')
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true')
  })

  test('M turns it off for the rest of the session, and the next session plays again', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('Space')
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('m')
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Space')
    await expect(page.getByText('Paused', { exact: true })).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.getByText('Running', { exact: true })).toBeVisible()
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('r')
    await page.keyboard.press('Space')
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true')
  })

  test('with auto play off, nothing plays until you ask', async ({ page }) => {
    await watchAudio(page)
    await page.addInitScript(() => localStorage.setItem('lumaflow.v1.settings', JSON.stringify({ ambientAuto: false })))
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('Space')
    await expect(page.getByText('Running', { exact: true })).toBeVisible()
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect((await audio(page)).started).toBe(0)
    await soundBtn(page).click()
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await audio(page)).started).toBeGreaterThanOrEqual(3)
    await soundBtn(page).click()
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false')
  })

  test('each sound in the picker is used', async ({ page }) => {
    for (const [name, layers] of [['^Brown noise', 1], ['^Rain', 3], ['^Thunderstorm', 3]] as const) {
      const ctx = await page.context().browser()!.newContext({ reducedMotion: 'reduce' })
      const p = await ctx.newPage()
      await watchAudio(p)
      await p.goto('/')
      await ready(p)
      await p.getByRole('button', { name: 'Settings' }).click()
      await p.getByRole('radio', { name: new RegExp(name) }).check({ force: true })
      await p.getByRole('button', { name: 'Close Settings' }).click()
      await p.getByRole('button', { name: 'Start' }).click()
      await expect.poll(async () => (await audio(p)).started, { message: name }).toBe(layers)
      await ctx.close()
    }
  })

  test('the choice, auto play and volume are saved', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('radio', { name: /Thunderstorm/ })).toBeChecked()
    await page.getByRole('radio', { name: /^Rain/ }).check({ force: true })
    await page.getByRole('switch', { name: /Play it while I focus/ }).uncheck()
    await page.getByLabel('Volume', { exact: true }).fill('0.7')
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('radio', { name: /^Rain/ })).toBeChecked()
    await expect(page.getByRole('switch', { name: /Play it while I focus/ })).not.toBeChecked()
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.7')
  })

  test('after a reload mid-session it picks up again at the next key press', async ({ page }) => {
    await watchAudio(page)
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('Space')
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await ready(page)
    await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await page.mouse.click(5, 300)
    await expect.poll(async () => (await audio(page)).started).toBeGreaterThanOrEqual(3)
  })
})

test.describe('tasks', () => {
  test.use({ reducedMotion: 'reduce' })
  const add = async (page: Page, text: string) => {
    await page.getByLabel('New task').fill(text)
    await page.keyboard.press('Enter')
  }

  test('T opens an empty list with a hint, and Esc closes it', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('t')
    await expect(page.getByRole('dialog', { name: 'Tasks' })).toBeVisible()
    await expect(page.getByText(/Nothing here yet/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('adding, ticking off, deleting and clearing', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Tasks' }).click()
    await add(page, 'Revise Laplace transforms')
    await add(page, 'Past paper 2023')
    await add(page, '   ')
    const list = page.getByTestId('tasks')
    await expect(list.locator('li')).toHaveCount(2)
    await expect(page.getByText('2 to do')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Revise Laplace transforms' }).check()
    await expect(page.getByText('1 to do, 1 done')).toBeVisible()
    await expect(list.locator('li').last()).toContainText('Revise Laplace transforms')
    await page.getByRole('button', { name: 'Clear done' }).click()
    await expect(list.locator('li')).toHaveCount(1)
    await page.getByRole('button', { name: 'Delete Past paper 2023' }).click()
    await expect(page.getByText(/Nothing here yet/)).toBeVisible()
  })

  test('the button shows how many are left and the list survives a reload', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('t')
    await add(page, 'One')
    await add(page, 'Two')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Tasks, 2 to do' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Tasks, 2 to do' })).toBeVisible()
    await page.keyboard.press('t')
    await expect(page.getByTestId('tasks').locator('li')).toHaveCount(2)
  })

  test('"Study this" puts the task in the Studying field', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('t')
    await add(page, 'Z-transform problems')
    await page.getByRole('button', { name: 'Study this: Z-transform problems' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Studying' })).toHaveValue('Z-transform problems')
  })

  test('typing in the task field does not trigger shortcuts', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('t')
    await page.getByLabel('New task').fill('')
    await page.keyboard.type('m r b 4 t')
    await expect(page.getByLabel('New task')).toHaveValue('m r b 4 t')
    await expect(page.locator('.app')).toHaveAttribute('data-scene', 'ribbon')
  })

  test('a very long task wraps instead of overflowing', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto('/')
    await ready(page)
    await page.keyboard.press('t')
    await add(page, 'x'.repeat(120))
    await add(page, 'Read the whole chapter on feedback amplifiers and write the summary table')
    const overflow = await page.evaluate(() => {
      const d = document.querySelector('dialog[open]') as HTMLElement
      return d.scrollWidth - d.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
    await ctx.close()
  })
})

test.describe('whole app', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no console errors across every view and background', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()))
    page.on('pageerror', (e) => problems.push(String(e)))
    await open(page)
    for (let i = 0; i < 6; i++) await page.keyboard.press('b')
    await page.keyboard.press('4')
    await page.keyboard.press('Space')
    await live(page, 3 * MIN)
    await page.keyboard.press('m')
    await page.keyboard.press('m')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('?')
    await page.keyboard.press('Escape')
    expect(problems).toEqual([])
  })

  test('no horizontal overflow with the four tabs on small screens', async ({ browser }) => {
    for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1366, height: 768 }]) {
      const ctx = await browser.newContext({ viewport: vp })
      const page = await ctx.newPage()
      await page.goto('/')
      await ready(page)
      await page.keyboard.press('4')
      await page.getByRole('button', { name: 'Settings' }).click()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${vp.width}x${vp.height}`).toBeLessThanOrEqual(0)
      await ctx.close()
    }
  })
})
