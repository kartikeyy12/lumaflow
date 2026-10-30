import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Files that are copied from public/ as they are, so they are not part of the bundle listing. */
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

/** Writes sw.js at build time with the exact list of files to keep for offline use. */
function serviceWorker(): Plugin {
  return {
    name: 'lumaflow-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((name) => name !== 'sw.js' && !name.endsWith('.map'))
        .map((name) => `/${name}`)
      const files = [...new Set([...STATIC_FILES, ...built])].sort()
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10)
      const source = readFileSync(new URL('./pwa/sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(files, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
