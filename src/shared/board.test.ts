import test from 'node:test'
import assert from 'node:assert/strict'
import { BOARD_SIZE, CENTER, PREMIUMS, emptyBoard, premiumAt } from './board.ts'

test('the board is 15x15 and starts empty', () => {
  const board = emptyBoard()
  assert.equal(board.length, BOARD_SIZE)
  assert.ok(board.every((row) => row.length === BOARD_SIZE && row.every((c) => c === null)))
})

test('premium squares match the standard layout', () => {
  const counts = { TW: 0, DW: 0, TL: 0, DL: 0 }
  for (const row of PREMIUMS) for (const p of row) if (p) counts[p]++
  assert.deepEqual(counts, { TW: 8, DW: 17, TL: 12, DL: 24 })
})

test('premium squares are in the expected places', () => {
  assert.equal(premiumAt(0, 0), 'TW')
  assert.equal(premiumAt(0, 7), 'TW')
  assert.equal(premiumAt(7, 7), 'DW') // the center
  assert.equal(premiumAt(1, 5), 'TL')
  assert.equal(premiumAt(0, 3), 'DL')
  assert.equal(premiumAt(0, 1), null)
  assert.equal(premiumAt(7, 6), null)
  assert.equal(CENTER.row, 7)
  assert.equal(CENTER.col, 7)
})
