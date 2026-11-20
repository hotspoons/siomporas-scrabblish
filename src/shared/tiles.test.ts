import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALPHABET,
  BLANK,
  DISTRIBUTION,
  LETTER_VALUES,
  createBag,
  drawTiles,
  mulberry32,
  rackKey,
  tileValue,
} from './tiles.ts'

test('the bag has exactly 100 tiles', () => {
  const bag = createBag(mulberry32(1))
  assert.equal(bag.length, 100)
  const counts = new Map<string, number>()
  for (const t of bag) counts.set(t.letter, (counts.get(t.letter) ?? 0) + 1)
  for (const letter of [...ALPHABET, BLANK]) {
    assert.equal(counts.get(letter), DISTRIBUTION[letter], `${letter} count`)
  }
})

test('the bag is deterministic for a seed and differs across seeds', () => {
  const a = createBag(mulberry32(42)).map((t) => t.letter).join('')
  const b = createBag(mulberry32(42)).map((t) => t.letter).join('')
  const c = createBag(mulberry32(43)).map((t) => t.letter).join('')
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('letter values match the standard set', () => {
  assert.equal(LETTER_VALUES.A, 1)
  assert.equal(LETTER_VALUES.Q, 10)
  assert.equal(LETTER_VALUES.Z, 10)
  assert.equal(LETTER_VALUES.K, 5)
  assert.equal(tileValue('Q'), 10)
  assert.equal(tileValue('Q', true), 0)
  assert.equal(tileValue(BLANK), 0)
})

test('drawing tiles removes them from the bag', () => {
  const bag = createBag(mulberry32(7))
  const rack = drawTiles(bag, 7)
  assert.equal(rack.length, 7)
  assert.equal(bag.length, 93)
  assert.equal(drawTiles(bag, 200).length, 93)
  assert.equal(bag.length, 0)
})

test('rackKey is stable regardless of tile order', () => {
  const rack = [
    { letter: 'T', blank: false },
    { letter: 'A', blank: false },
    { letter: '?', blank: true },
  ]
  assert.equal(rackKey(rack), rackKey(rack.slice().reverse()))
})
