#!/usr/bin/env node
// M1 acceptance: the board lab plays a real engine-generated move through the
// UI, then still opens offline with the dictionary from the precache.
//   node scripts/m1-check.mjs [--url http://localhost:4173/] [--out shots]
import { chromium, devices } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { emptyBoard } from '../src/shared/board.ts'
import { Dictionary } from '../src/shared/dictionary.ts'
import { generateMoves } from '../src/shared/movegen.ts'
import { createBag, drawTiles, mulberry32 } from '../src/shared/tiles.ts'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : dflt
}
const url = opt('url', 'http://localhost:4173/')
const out = opt('out', 'shots')
const dict = Dictionary.fromText(readFileSync(fileURLToPath(new URL('../public/dict.txt', import.meta.url)), 'utf8'))

// The debug board starts from seed 1, so the test can reproduce its rack.
const rack = drawTiles(createBag(mulberry32(1)), 7)
const candidates = generateMoves(emptyBoard(), rack, dict, { limit: 50 })
const move = candidates.find((m) => !m.placements.some((p) => p.blank))
if (!move) throw new Error('no blank-free move for the seeded rack')

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 7'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Board lab' }).click()
await page.waitForSelector('.debug-board')
await page.waitForFunction(() => /words loaded/.test(document.querySelector('.db-message')?.textContent ?? ''), null, {
  timeout: 20000,
})

const scroll = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
}))
if (scroll.scrollW > scroll.innerW + 1) errors.push(`board lab scrolls horizontally: ${scroll.scrollW} > ${scroll.innerW}`)
console.log(`layout: ${scroll.scrollW}px wide in ${scroll.innerW}px`)

// Map each placement to its rack slot, exactly as a player taps it.
const slots = rack.map((tile) => tile.letter)
const used = new Set()
for (const placement of move.placements) {
  const slot = slots.findIndex((letter, i) => !used.has(i) && letter === placement.letter)
  if (slot < 0) throw new Error(`no rack slot for ${placement.letter}`)
  used.add(slot)
  await page.locator('.db-tile').nth(slot).click()
  await page.locator('.db-cell').nth(placement.row * 15 + placement.col).click()
}
const preview = await page.locator('.db-message').innerText()
console.log(`preview: ${preview}`)
if (!new RegExp(`^\\+${move.total}`).test(preview.trim())) errors.push(`preview did not show +${move.total}: ${preview}`)

await page.screenshot({ path: `${out}/m1-placed.png` })
await page.getByRole('button', { name: 'Play word' }).click()
await page.waitForFunction(() => document.querySelectorAll('.db-cell.last').length > 0, null, {
  timeout: 10000,
})
const played = await page.locator('.db-message').innerText()
console.log(`played: ${played}`)
const filled = await page.locator('.db-cell.last').count()
if (filled !== move.placements.length) errors.push(`expected ${move.placements.length} highlighted squares, saw ${filled}`)
const score = await page.locator('.debug-stat').innerText()
console.log(`score line: ${score}`)
if (!score.startsWith(`${move.total} pts`)) errors.push(`score line did not advance: ${score}`)
await page.screenshot({ path: `${out}/m1-played.png` })

// The engine and the dictionary must come from the service worker too.
await page.evaluate(async () => {
  await navigator.serviceWorker.ready
  for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100))
})
const cached = await page.evaluate(async () => {
  const keys = await caches.keys()
  const cache = await caches.open(keys[0])
  return (await cache.keys()).map((r) => new URL(r.url).pathname)
})
if (!cached.includes('/dict.txt')) errors.push('dict.txt is not precached')
console.log(`precached ${cached.length} files, dictionary: ${cached.includes('/dict.txt')}`)

await context.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Board lab' }).click()
const offlineLoaded = await page
  .waitForFunction(() => /words loaded/.test(document.querySelector('.db-message')?.textContent ?? ''), null, {
    timeout: 20000,
  })
  .then(() => true)
  .catch(() => false)
console.log(`offline board lab: dictionary loaded = ${offlineLoaded}`)
if (!offlineLoaded) errors.push('offline: the dictionary did not load from the cache')
await page.screenshot({ path: `${out}/m1-offline.png` })

await browser.close()
console.log(`wrote ${out}/m1-placed.png, ${out}/m1-played.png, ${out}/m1-offline.png`)
if (errors.length) {
  console.error(`ERRORS:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log('OK: the engine plays through the board lab and works offline')
