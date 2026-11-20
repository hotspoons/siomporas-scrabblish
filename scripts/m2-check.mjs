#!/usr/bin/env node
// M2 acceptance: a full robot game by tapping only, restart from localStorage,
// portrait/landscape layout, and a robot turn with the network off.
//   node scripts/m2-check.mjs [--url http://localhost:4174/?bag=21&fast=1] [--out shots]
import { chromium, devices } from 'playwright'
import {mkdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {Dictionary} from '../src/shared/dictionary.ts'
import {generateMoves} from '../src/shared/movegen.ts'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : dflt
}
const base = opt('url', 'http://localhost:4174/?bag=21&fast=1')
const out = opt('out', 'shots')
mkdirSync(out, {recursive: true})
const dict = Dictionary.fromText(readFileSync(fileURLToPath(new URL('../public/dict.txt', import.meta.url)), 'utf8'))

const errors = []
const note = (ok, message) => {
  console.log(`${ok ? 'ok' : 'FAIL'} ${message}`)
  if (!ok) errors.push(message)
}

const browser = await chromium.launch()
const context = await browser.newContext({...devices['Pixel 7']})
const page = await context.newPage()
page.on('pageerror', (e) => errors.push(`page error: ${e}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})

const readState = () =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('scrabbleish.game.v1') || 'null')
    } catch {
      return null
    }
  })

async function waitForState() {
  await page.waitForFunction(() => !!localStorage.getItem('scrabbleish.game.v1'), null, {timeout: 15000})
}

async function pickLevel(name) {
  const button = page.getByRole('button', {name: new RegExp(name)})
  await button.waitFor({state: 'visible', timeout: 20000})
  await page.waitForFunction(
    (label) => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes(label) && !b.disabled),
    name,
    {timeout: 30000},
  )
  await button.click()
  await page.waitForSelector('.play-board', {timeout: 20000})
}

// Wait until the robot has answered and the human can act again. `minVersion`
// is the version we expect after both the human's turn and the robot's.
async function waitForBot(minVersion) {
  await page.waitForFunction(
    (version) => {
      if (document.querySelector('.play.over')) return true
      const raw = localStorage.getItem('scrabbleish.game.v1')
      if (!raw) return !!document.querySelector('.play.over')
      const state = JSON.parse(raw)
      return state.status === 'done' || (state.turn === 0 && state.version >= version)
    },
    minVersion,
    {timeout: 40000},
  )
}

async function tapPlacements(placements) {
  for (const p of placements) {
    const labels = await page.locator('.db-tile').allInnerTexts()
    const wanted = p.blank ? '?' : p.letter
    const slot = labels.findIndex((label, i) => label.trim() === wanted && i >= 0)
    if (slot < 0) throw new Error(`no ${wanted} tile in the rack (${labels.join('')})`)
    await page.locator('.db-tile').nth(slot).click()
    if (p.blank) await page.locator('.db-blank-pick select').selectOption(p.letter)
    await page.locator('.db-cell').nth(p.row * 15 + p.col).click()
  }
}

async function passTwice(state) {
  await page.getByRole('button', {name: 'Pass', exact: true}).click()
  await page.getByRole('button', {name: 'Pass?', exact: true}).click()
  await waitForBot(state.version + 2)
}

async function layout(label) {
  const size = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    boardW: document.querySelector('.play-board')?.getBoundingClientRect().width ?? 0,
  }))
  note(size.scrollW <= size.innerW + 1, `${label}: board ${size.boardW.toFixed(0)}px, page ${size.scrollW}px in ${size.innerW}px`)
  await page.screenshot({path: `${out}/m2-${label}.png`, fullPage: false})
}

try {
  // --- 1. start a calm game and check the portrait layout -----------------
  await page.goto(base, {waitUntil: 'networkidle'})
  await page.getByRole('button', {name: 'New game'}).click()
  await pickLevel('Steady')
  await layout('portrait')

  // --- 2. half-placed word survives a reload ------------------------------
  await page.locator('.db-tile').first().click()
  await page.locator('.db-cell').nth(7 * 15 + 7).click()
  await page.locator('.db-tile').first().click()
  await page.locator('.db-cell').nth(7 * 15 + 8).click()
  await page.waitForFunction(
    () => {
      try {
        return JSON.parse(localStorage.getItem('scrabbleish.game.v1') || 'null')?.pending?.length === 2
      } catch {
        return false
      }
    },
    null,
    {timeout: 10000},
  )
  const beforeReload = await readState()
  note(beforeReload?.pending?.length === 2, `two pending tiles saved (${beforeReload?.pending?.length})`)

  await page.reload({waitUntil: 'networkidle'})
  await page.getByRole('button', {name: /Continue game/}).click()
  await page.waitForSelector('.play-board', {timeout: 20000})
  const restored = await readState()
  const pendingCells = await page.locator('.db-cell.pending').count()
  const rackTiles = await page.locator('.db-tile').count()
  const pendingText = (await page.locator('.db-cell.pending').allInnerTexts()).map((t) => t.trim())
  note(pendingCells === 2, `restart: ${pendingCells} pending tiles on the board`)
  note(rackTiles === 5, `restart: ${rackTiles} tiles left on the rack`)
  note(
    JSON.stringify(pendingText) === JSON.stringify(restored.pending.map((p) => p.letter)),
    `restart: pending letters match (${pendingText.join('')})`,
  )
  await page.screenshot({path: `${out}/m2-restored.png`})

  await page.setViewportSize({width: 915, height: 412})
  await layout('landscape')
  await page.setViewportSize({width: 412, height: 915})
  await page.getByRole('button', {name: 'Recall'}).click()

  // --- 3. play a whole game against the robot, tapping only ---------------
  await page.getByRole('button', {name: 'Home', exact: true}).click()
  await page.getByRole('button', {name: 'New game'}).click()
  await pickLevel('Gentle')
  await waitForState()

  let turns = 0
  let lastScore = 0
  while (turns++ < 40) {
    if (await page.locator('.play.over').count()) break
    const state = await readState()
    if (state && state.status === 'active' && state.turn !== 0) {
      await waitForBot(state.version + 1)
      continue
    }
    if (!state || state.status !== 'active' || state.turn !== 0) break
    lastScore = state.scores[0]
    const moves = generateMoves(state.board, state.racks[0], dict, {limit: 50})
    if (moves.length === 0) {
      await passTwice(state)
      continue
    }
    const move = moves.find((m) => m.placements.every((p) => !p.blank)) ?? moves[0]
    await tapPlacements(move.placements)
    const preview = (await page.locator('.play-message').innerText()).trim()
    if (!preview.startsWith('+')) throw new Error(`no score preview after tapping: ${preview}`)
    await page.getByRole('button', {name: 'Play word'}).click()
    await waitForBot(state.version + move.placements.length + 2)
  }
  if (!(await page.locator('.play.over').count())) {
    const end = page.getByRole('button', {name: 'End this game'})
    if (await end.count()) await end.click()
  }
  await page.waitForSelector('.play.over', {timeout: 10000})
  const finalLine = await page.locator('.play-final').innerText()
  const heading = await page.locator('.play.over h1').innerText()
  console.log(`game over after ${turns - 1} human turns: ${heading} — ${finalLine} (last live score ${lastScore})`)
  note(/You \d+ · Robot \d+/.test(finalLine), `final scores shown: ${finalLine}`)
  await page.screenshot({path: `${out}/m2-game-over.png`})

  // --- 4. the robot still moves with the network off ----------------------
  await page.getByRole('button', {name: 'New game'}).click()
  await pickLevel('Gentle')
  await page.waitForSelector('.play-board')
  await waitForState()

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100))
  })
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys()
    const cache = await caches.open(keys[0])
    return (await cache.keys()).map((r) => new URL(r.url).pathname)
  })
  note(cached.includes('/dict.txt') && cached.includes('/tier-2k.txt'), 'dictionary and word tiers are precached')

  const beforeOffline = await readState()
  await context.setOffline(true)
  await page.reload({waitUntil: 'domcontentloaded'})
  await page.getByRole('button', {name: /Continue game/}).click({timeout: 30000})
  await page.waitForSelector('.play-board', {timeout: 30000})
  await page.getByRole('button', {name: 'Pass', exact: true}).click()
  await page.getByRole('button', {name: 'Pass?', exact: true}).click()
  await waitForBot(beforeOffline.version + 2)
  const afterOffline = await readState()
  note(
    afterOffline && afterOffline.turn === 0 && afterOffline.moves.length >= beforeOffline.moves.length + 2,
    `offline: robot answered after a pass (${beforeOffline.moves.length} → ${afterOffline?.moves.length} moves)`,
  )
  note(
    afterOffline && afterOffline.version > beforeOffline.version,
    `offline: game advanced from version ${beforeOffline.version} to ${afterOffline?.version}`,
  )
  await page.screenshot({path: `${out}/m2-offline.png`})
} finally {
  await context.setOffline(false).catch(() => {})
  await browser.close()
}

console.log(`wrote ${out}/m2-*.png`)
if (errors.length) {
  console.error(`ERRORS:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log('OK: robot game, restart, layout and offline play all work')
