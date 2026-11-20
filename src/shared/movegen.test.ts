import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { emptyBoard, type Board } from './board.ts'
import { Dictionary } from './dictionary.ts'
import { checkPlay } from './rules.ts'
import { generateMoves } from './movegen.ts'
import type { Tile } from './tiles.ts'

const tiles = (...letters: string[]): Tile[] =>
  letters.map((letter) => (letter === '?' ? { letter: '?', blank: true } : { letter, blank: false }))

const tiny = Dictionary.fromText('at\ncat\ncats\nact\nabcdefg\n')

test('no tiles, no moves', () => {
  assert.deepEqual(generateMoves(emptyBoard(), [], tiny), [])
})

test('the first move goes through the center', () => {
  const moves = generateMoves(emptyBoard(), tiles('C', 'A', 'T'), tiny)
  assert.ok(moves.length > 0)
  for (const move of moves) {
    assert.ok(move.placements.some((p) => p.row === 7 && p.col === 7), 'every first move covers the center')
    assert.ok(move.words.every((w) => ['CAT', 'AT', 'ACT'].includes(w.word)))
  }
  assert.ok(moves.some((m) => m.words.some((w) => w.word === 'CAT')), 'CAT is among the moves')
  assert.ok(moves.some((m) => m.placements.length === 3))
})

test('moves are ranked by score', () => {
  const moves = generateMoves(emptyBoard(), tiles('A', 'B', 'C', 'D', 'E', 'F', 'G'), tiny)
  for (let i = 1; i < moves.length; i++) assert.ok(moves[i - 1].total >= moves[i].total)
  // The best placement puts F on the double-letter square at (7,11):
  // (1+3+3+2+1+8+2) doubled by the center = 40, plus the 50-point bingo.
  assert.equal(moves[0].total, 90)
  assert.equal(moves[0].bingo, true)
})

test('a blank can stand in for a missing letter', () => {
  const moves = generateMoves(emptyBoard(), tiles('C', 'A', '?'), tiny)
  const cat = moves.find((m) => m.words.some((w) => w.word === 'CAT'))
  assert.ok(cat, 'CAT should be found')
  const blank = cat.placements.find((p) => p.blank)
  assert.ok(blank, 'the T must be played as a blank')
  assert.equal(blank.letter, 'T')
})

test('a blank is not spent when the real letter is available', () => {
  const moves = generateMoves(emptyBoard(), tiles('C', 'A', 'T', '?'), tiny)
  const cat = moves.find(
    (m) => m.placements.length === 3 && m.words.some((w) => w.word === 'CAT'),
  )
  assert.ok(cat)
  assert.ok(cat.placements.every((p) => !p.blank))
})

test('extending an existing word is found', () => {
  const board: Board = emptyBoard()
  board[7][6] = { letter: 'C', blank: false }
  board[7][7] = { letter: 'A', blank: false }
  board[7][8] = { letter: 'T', blank: false }
  const moves = generateMoves(board, tiles('S'), tiny)
  const cats = moves.find((m) => m.words.some((w) => w.word === 'CATS'))
  assert.ok(cats, 'CATS should be found')
  assert.deepEqual(cats.placements, [{ row: 7, col: 9, letter: 'S', blank: false }])
})

test('every generated move is legal', () => {
  const board: Board = emptyBoard()
  board[7][6] = { letter: 'C', blank: false }
  board[7][7] = { letter: 'A', blank: false }
  board[7][8] = { letter: 'T', blank: false }
  board[6][7] = { letter: 'A', blank: false }
  board[8][7] = { letter: 'T', blank: false }
  for (const move of generateMoves(board, tiles('A', 'C', 'T', 'S', '?'), tiny, { limit: 100 })) {
    const check = checkPlay(board, move.placements, tiny)
    assert.ok(check.ok, check.error?.message)
    assert.equal(check.total, move.total)
  }
})

test('the real dictionary finds bingos from a common rack', () => {
  const path = fileURLToPath(new URL('../../public/dict.txt', import.meta.url))
  if (!existsSync(path)) return // the list is built by scripts/build-dict.mjs
  const dict = Dictionary.fromText(readFileSync(path, 'utf8'))
  assert.ok(dict.size > 150000)

  const started = performance.now()
  const moves = generateMoves(emptyBoard(), tiles('A', 'E', 'I', 'N', 'R', 'S', 'T'), dict, { limit: 25 })
  const elapsed = performance.now() - started
  assert.ok(moves.length > 0)
  assert.ok(elapsed < 10000, `move generation took ${elapsed.toFixed(0)}ms`)
  assert.ok(moves.some((m) => m.bingo), 'AEINRST should yield at least one bingo')
  for (const move of moves) assert.ok(checkPlay(emptyBoard(), move.placements, dict, { firstMove: true }).ok)

  const board: Board = emptyBoard()
  board[7][6] = { letter: 'C', blank: false }
  board[7][7] = { letter: 'A', blank: false }
  board[7][8] = { letter: 'T', blank: false }
  const extensions = generateMoves(board, tiles('S'), dict)
  assert.ok(extensions.some((m) => m.words.some((w) => w.word === 'CATS')))
})
