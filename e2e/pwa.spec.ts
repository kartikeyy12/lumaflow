import { expect, test } from '@playwright/test'

test.describe('installable app', () => {
  test('the manifest is valid and its icons exist', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()
    const res = await request.get(href as string)
    expect(res.ok()).toBe(true)
    const m = await res.json()
    expect(m).toMatchObject({ name: 'LumaFlow', display: 'standalone', start_url: '/', scope: '/' })
    expect(m.background_color).toMatch(/^#/)
    const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
    for (const icon of m.icons) {
      const r = await request.get(icon.src)
      expect(r.ok(), icon.src).toBe(true)
      expect(r.headers()['content-type']).toContain('image/png')
    }
  })

  test('the service worker installs, takes control, and the app opens offline', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys()
      const cache = await caches.open(keys[0])
      return (await cache.keys()).map((r) => new URL(r.url).pathname)
    })
    expect(cached).toEqual(expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest']))
    expect(cached.some((p) => p.startsWith('/assets/') && p.endsWith('.js'))).toBe(true)
    expect(cached.some((p) => p.endsWith('.woff2'))).toBe(true)

    await context.setOffline(true)
    await page.reload()
    await page.locator('html[data-shortcuts="ready"]').waitFor({ state: 'attached' })
    await expect(page.getByRole('timer')).toHaveAccessibleName('25 minutes remaining')
    await page.keyboard.press('Space')
    await expect(page.getByText('Running', { exact: true })).toBeVisible()
    await context.setOffline(false)
  })

  test('a deep link opens offline too', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await context.setOffline(true)
    await page.goto('/?utm=test')
    await expect(page.getByRole('timer')).toBeVisible()
    await context.setOffline(false)
  })

  test('the worker lists every file the page needs', async ({ page, request }) => {
    const sw = await (await request.get('/sw.js')).text()
    const html = await (await request.get('/')).text()
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
    expect(assets.length).toBeGreaterThanOrEqual(2)
    for (const a of assets) expect(sw).toContain(a)
    expect(sw).not.toContain('__VERSION__')
    expect(sw).not.toContain('__PRECACHE__')
    await page.goto('/')
  })
})
