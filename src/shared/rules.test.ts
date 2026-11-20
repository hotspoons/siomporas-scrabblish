import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBoard, type Board } from './board.ts'
import { Dictionary } from './dictionary.ts'
import { applyPlay, checkPlay, type Placement } from './rules.ts'

const dict = Dictionary.fromText(['HELLO', 'HELLOS', 'CAT', 'CATS', 'AS', 'ABCDEFG', 'AT'].join('\n'))

function play(...cells: Array<[number, number, string, boolean?]>): Placement[] {
  return cells.map(([row, col, letter, blank]) => ({ row, col, letter, blank }))
}

test('a first word across the center scores with word premiums', () => {
  const result = checkPlay(emptyBoard(), play([7, 5, 'H'], [7, 6, 'E'], [7, 7, 'L'], [7, 8, 'L'], [7, 9, 'O']), dict, {
    firstMove: true,
  })
  assert.ok(result.ok, result.error?.message)
  assert.equal(result.words.length, 1)
  assert.equal(result.words[0].word, 'HELLO')
  assert.equal(result.words[0].score, 16) // 8 points, doubled by the center
  assert.equal(result.total, 16)
  assert.equal(result.bingo, false)
})

test('a first word must cover the middle square', () => {
  const result = checkPlay(emptyBoard(), play([7, 0, 'H'], [7, 1, 'E'], [7, 2, 'L'], [7, 3, 'L'], [7, 4, 'O']), dict, {
    firstMove: true,
  })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'not_centered')
})

test('a blank scores zero but keeps its chosen letter', () => {
  const result = checkPlay(emptyBoard(), play([7, 7, 'C', true], [7, 8, 'A'], [7, 9, 'T']), dict, { firstMove: true })
  assert.ok(result.ok, result.error?.message)
  assert.equal(result.total, 4) // (0 + 1 + 1) doubled at the center
  assert.equal(result.placements[0].blank, true)
  assert.equal(result.placements[0].letter, 'C')
})

test('using all seven tiles adds the 50-point bonus', () => {
  const result = checkPlay(
    emptyBoard(),
    play([7, 4, 'A'], [7, 5, 'B'], [7, 6, 'C'], [7, 7, 'D'], [7, 8, 'E'], [7, 9, 'F'], [7, 10, 'G']),
    dict,
    { firstMove: true },
  )
  assert.ok(result.ok, result.error?.message)
  assert.equal(result.bingo, true)
  assert.equal(result.total, 32 + 50)
})

test('cross words are found and scored', () => {
  const board: Board = emptyBoard()
  board[7][6] = { letter: 'C', blank: false }
  board[7][7] = { letter: 'A', blank: false }
  board[7][8] = { letter: 'T', blank: false }
  const result = checkPlay(board, play([8, 7, 'S']), dict)
  assert.ok(result.ok, result.error?.message)
  assert.deepEqual(result.words.map((w) => w.word), ['AS'])
  assert.equal(result.total, 2)
})

test('an invalid cross word rejects the whole play', () => {
  const board: Board = emptyBoard()
  board[7][6] = { letter: 'C', blank: false }
  board[7][7] = { letter: 'A', blank: false }
  board[7][8] = { letter: 'T', blank: false }
  const result = checkPlay(board, play([8, 8, 'S']), dict)
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'not_a_word')
  assert.match(result.error?.message ?? '', /TS/)
})

test('gaps, diagonals and occupied squares are refused', () => {
  const gap = checkPlay(emptyBoard(), play([7, 7, 'A'], [7, 9, 'T']), dict, { firstMove: true })
  assert.equal(gap.error?.code, 'gap')

  const diagonal = checkPlay(emptyBoard(), play([6, 6, 'A'], [7, 7, 'T']), dict, { firstMove: true })
  assert.equal(diagonal.error?.code, 'not_in_line')

  const board = emptyBoard()
  board[7][7] = { letter: 'A', blank: false }
  const occupied = checkPlay(board, play([7, 7, 'T']), dict)
  assert.equal(occupied.error?.code, 'occupied')
})

test('a later word must touch the board', () => {
  const board: Board = emptyBoard()
  board[0][0] = { letter: 'C', blank: false }
  const result = checkPlay(board, play([7, 6, 'A'], [7, 7, 'T']), dict)
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'not_connected')
})

test('thoughts are not words', () => {
  const result = checkPlay(emptyBoard(), play([7, 6, 'Z'], [7, 7, 'Z']), dict, { firstMove: true })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'not_a_word')
})

test('applyPlay copies the board', () => {
  const board = emptyBoard()
  const next = applyPlay(board, play([7, 7, 'A', true]))
  assert.equal(board[7][7], null)
  assert.deepEqual(next[7][7], { letter: 'A', blank: true })
})
