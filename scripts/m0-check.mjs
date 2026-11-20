#!/usr/bin/env node
// M0 acceptance check: the deployed shell loads, precaches, and opens offline.
//   node scripts/m0-check.mjs [--url https://scrabbleish.siomporas.com/] [--out shots]
import { chromium, devices } from 'playwright'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : dflt
}
const url = opt('url', 'https://scrabbleish.siomporas.com/')
const out = opt('out', 'shots')

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 7'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('.menu', { timeout: 20000 })
const heading = (await page.locator('h1').first().innerText()).trim()
if (heading !== 'Scrabbleish') errors.push(`unexpected heading: ${heading}`)
if (!(await page.locator('link[rel="manifest"]').count())) errors.push('manifest link missing')
if (!(await page.locator('meta[name="theme-color"]').count())) errors.push('theme-color missing')

const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready
  for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100))
  const keys = await caches.keys()
  const name = keys.find((k) => k.startsWith('workbox')) ?? keys[0] ?? ''
  const cache = await caches.open(name)
  const cached = (await cache.keys()).map((r) => new URL(r.url)).filter((u) => u.origin === location.origin)
  return { scope: reg.scope, controlled: !!navigator.serviceWorker.controller, paths: cached.map((u) => u.pathname) }
})
console.log(`service worker: scope ${sw.scope}, controlling ${sw.controlled}, cached ${sw.paths.length} same-origin URLs`)
if (!sw.controlled) errors.push('the service worker is not controlling the page')
if (!sw.paths.some((p) => p === '/' || p.endsWith('/index.html'))) errors.push('the shell is not precached')
if (!sw.paths.some((p) => /\/assets\/.*\.(js|css)$/.test(p))) errors.push('no JS/CSS bundle precached')
if (!sw.paths.some((p) => p === '/manifest.webmanifest')) errors.push('manifest is not precached')

const targets = await page.evaluate(() =>
  [...document.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect()
    return { text: b.textContent?.trim(), w: Math.round(r.width), h: Math.round(r.height) }
  }),
)
for (const t of targets) if (t.h < 44 || t.w < 44) errors.push(`tap target too small: "${t.text}" ${t.w}x${t.h}`)
console.log(`tap targets: ${targets.map((t) => `${t.w}x${t.h}`).join(', ')}`)

const fits = async (label) => {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
  }))
  if (m.scrollW > m.innerW + 1) errors.push(`${label}: horizontal page scroll ${m.scrollW} > ${m.innerW}`)
  console.log(`${label}: ${m.scrollW}x${m.scrollH} in ${m.innerW}x${m.innerH}`)
}

await fits('portrait')
await page.screenshot({ path: `${out}/m0-portrait.png` })

await page.getByRole('button', { name: 'Rules' }).click()
await page.waitForSelector('h1:text("Rules")')
await page.getByRole('button', { name: 'Back' }).click()
await page.waitForSelector('h1:text("Scrabbleish")')
console.log('rules screen: opens and returns')

await context.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
const menu = await page.waitForSelector('.menu', { timeout: 15000 }).then(() => true).catch(() => false)
const offlineHeading = menu ? (await page.locator('h1').first().innerText()).trim() : ''
console.log(`offline reload: menu=${menu}, heading="${offlineHeading}"`)
if (!menu || offlineHeading !== 'Scrabbleish') errors.push('offline: the shell did not render')
await page.screenshot({ path: `${out}/m0-offline.png` })

await page.setViewportSize({ width: 915, height: 412 })
await page.waitForTimeout(200)
await fits('landscape')
await page.screenshot({ path: `${out}/m0-landscape.png` })

await browser.close()
console.log(`wrote ${out}/m0-portrait.png, ${out}/m0-offline.png, ${out}/m0-landscape.png`)
if (errors.length) {
  console.error(`ERRORS:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log('OK: M0 shell loads, installs and opens offline')
