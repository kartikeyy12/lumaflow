import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

const NOW = new Date(2026, 9, 30, 10, 0, 0).getTime()
const seed = {
  'lumaflow.v1.settings': JSON.stringify({ scene: 'drift', focusMin: 40, ambientAuto: false }),
  'lumaflow.v1.log': JSON.stringify([
    { id: 'e1', endedAt: NOW - 3_600_000, durationMs: 1_500_000, plannedMs: 1_500_000, outcome: 'completed', topic: 'Op-amp filters, active' },
    { id: 'e2', endedAt: NOW - 86_400_000, durationMs: 600_000, plannedMs: 1_500_000, outcome: 'early', topic: '=HYPERLINK("x")' },
  ]),
  'lumaflow.v1.tasks': JSON.stringify([
    { id: 't1', text: 'Past paper 2023', done: false, createdAt: 1, doneAt: null },
    { id: 't2', text: 'Lab report', done: true, createdAt: 2, doneAt: 3 },
  ]),
}

async function openSettings(page: Page, storage?: Record<string, string>) {
  if (storage) {
    await page.addInitScript((entries) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v as string)
    }, storage)
  }
  await page.goto('/')
  await page.locator('html[data-shortcuts="ready"]').waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Settings' }).click()
}

async function downloaded(page: Page, name: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()])
  const path = await download.path()
  return { name: download.suggestedFilename(), text: await readFile(path, 'utf8') }
}

test.describe('your data', () => {
  test('downloads a backup with everything in it', async ({ page }) => {
    await openSettings(page, seed)
    const file = await downloaded(page, 'Download backup')
    expect(file.name).toMatch(/^lumaflow-backup-\d{4}-\d{2}-\d{2}\.json$/)
    const data = JSON.parse(file.text)
    expect(data).toMatchObject({ app: 'lumaflow', version: 1 })
    expect(data.log.map((e: { id: string }) => e.id)).toEqual(['e1', 'e2'])
    expect(data.tasks.map((t: { text: string }) => t.text)).toEqual(['Past paper 2023', 'Lab report'])
    expect(data.settings).toMatchObject({ scene: 'drift', focusMin: 40 })
  })

  test('downloads sessions as a safe CSV', async ({ page }) => {
    await openSettings(page, seed)
    const file = await downloaded(page, 'Sessions as CSV')
    expect(file.name).toMatch(/^lumaflow-sessions-.*\.csv$/)
    const lines = file.text.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('Date,Ended,Minutes,Planned minutes,Type,Result,Topic,Review next')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("'=HYPERLINK")
    expect(lines[2]).toContain('"Op-amp filters, active"')
  })

  test('the CSV button is off when there is no history', async ({ page }) => {
    await openSettings(page)
    await expect(page.getByRole('button', { name: 'Sessions as CSV' })).toBeDisabled()
  })

  test('restores a backup on a clean browser, after a confirmation', async ({ page, browser }) => {
    await openSettings(page, seed)
    const file = await downloaded(page, 'Download backup')

    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const fresh = await ctx.newPage()
    await openSettings(fresh)
    await fresh.getByLabel('Backup file').setInputFiles({ name: file.name, mimeType: 'application/json', buffer: Buffer.from(file.text) })
    await expect(fresh.getByText(/adds 2 sessions and 2 to-do items/i)).toBeVisible()
    // Nothing changes until it is confirmed.
    await expect(fresh.locator('.app')).toHaveAttribute('data-scene', 'ribbon')
    await fresh.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(fresh.getByText('Restored. Added 2 sessions and 2 to-do items.')).toBeVisible()
    await expect(fresh.locator('.app')).toHaveAttribute('data-scene', 'drift')

    await fresh.getByRole('button', { name: 'Close Settings' }).click()
    await expect(fresh.getByTestId('todo-items').locator('li')).toHaveCount(2)
    await fresh.getByRole('button', { name: 'History' }).click()
    await expect(fresh.getByTestId('log').locator('li')).toHaveCount(2)
    await expect(fresh.getByTestId('log')).toContainText('Op-amp filters, active')

    // Restoring the same file again adds nothing and creates no duplicates.
    await fresh.keyboard.press('Escape')
    await fresh.getByRole('button', { name: 'Settings' }).click()
    await fresh.getByLabel('Backup file').setInputFiles({ name: file.name, mimeType: 'application/json', buffer: Buffer.from(file.text) })
    await expect(fresh.getByText(/already here/)).toBeVisible()
    await fresh.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(fresh.getByText('Restored. Added 0 sessions and 0 to-do items.')).toBeVisible()
    await fresh.keyboard.press('Escape')
    await fresh.getByRole('button', { name: 'History' }).click()
    await expect(fresh.getByTestId('log').locator('li')).toHaveCount(2)
    await ctx.close()
  })

  test('cancel leaves everything as it was', async ({ page }) => {
    await openSettings(page)
    const backup = { app: 'lumaflow', version: 1, settings: { scene: 'aurora' }, tasks: [{ id: 'x', text: 'New one' }], log: [] }
    await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.app')).toHaveAttribute('data-scene', 'ribbon')
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await expect(page.getByText(/Nothing on your list yet/)).toBeVisible()
  })

  test('says what is wrong with a file that is not a backup', async ({ page }) => {
    await openSettings(page)
    const pick = (name: string, text: string) =>
      page.getByLabel('Backup file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) })
    await pick('a.json', 'not json at all')
    await expect(page.getByText(/could not be read as JSON/)).toBeVisible()
    await pick('b.json', JSON.stringify({ app: 'something-else', version: 1 }))
    await expect(page.getByText('That file is not a LumaFlow backup.')).toBeVisible()
    await pick('c.json', JSON.stringify({ app: 'lumaflow', version: 99 }))
    await expect(page.getByText(/newer version of LumaFlow/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0)
  })

  test('a hostile backup cannot inject bad values', async ({ page }) => {
    await openSettings(page)
    const evil = {
      app: 'lumaflow',
      version: 1,
      settings: { scene: '<script>', focusMin: -5, noiseVolume: 'loud' },
      tasks: [{ id: 'a', text: '<img src=x onerror=alert(1)>' }],
      log: [{ id: 'z', endedAt: 'now', durationMs: 1 }],
    }
    await page.getByLabel('Backup file').setInputFiles({ name: 'e.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) })
    await page.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(page.locator('.app')).toHaveAttribute('data-scene', 'ribbon')
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await expect(page.getByTestId('todo-items')).toContainText('<img src=x onerror=alert(1)>')
    expect(await page.locator('img[src="x"]').count()).toBe(0)
  })
})
