import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { startServer } from './app'

const production = process.env.NODE_ENV === 'production'
if (production && !process.env.WORDX_DROP_SALT) console.warn('WORDX_DROP_SALT is not set: daily-drop answers are guessable from the app code.')
const dist = resolve(import.meta.dirname, '../dist')

const app = startServer({
  // Hosts set PORT in production; in development the API always sits on 8787 behind Vite's proxy.
  port: Number((production ? process.env.PORT : process.env.WORDX_API_PORT) ?? 8787),
  dbPath: process.env.WORDX_DB ?? resolve(import.meta.dirname, '../data/wordx.db'),
  // In production the same process serves the built app; in development Vite does.
  staticDir: production && existsSync(dist) ? dist : undefined,
  dropSalt: process.env.WORDX_DROP_SALT,
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}
