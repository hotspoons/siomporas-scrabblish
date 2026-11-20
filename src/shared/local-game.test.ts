import test from 'node:test'
import assert from 'node:assert/strict'
import { Dictionary } from './dictionary.ts'
import type { Tile } from './tiles.ts'
import {
  canEndGame,
  createLocalGame,
  endLocalGame,
  humanExchange,
  humanPass,
  humanPlay,
  loadLocalGame,
  remainingTiles,
  saveLocalGame,
  setPending,
  botTurn,
  STORAGE_KEY,
} from './local-game.ts'

const tiles = (...letters: string[]): Tile[] =>
  letters.map((letter) => (letter === '?' ? { letter: '?', blank: true } : { letter, blank: false }))

const tiny = Dictionary.fromText('at\ncat\ncats\ngo\ndog\ndogs\nas\n')

// A small localStorage stand-in so persistence can be exercised under Node.
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (key: string) => store.get(key) ?? null,
  key: (i: number) => [...store.keys()][i] ?? null,
  removeItem: (key: string) => void store.delete(key),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
} as Storage

test('the same seed makes the same opening position', () => {
  const a = createLocalGame(1234, 2, { bagSize: 20, now: 1 })
  const b = createLocalGame(1234, 2, { bagSize: 20, now: 1 })
  assert.deepEqual(a.racks, b.racks)
  assert.deepEqual(a.bag, b.bag)
  assert.deepEqual(a.board, b.board)
  assert.equal(a.bagSize, 20)
  assert.equal(a.turn, 0)
  assert.equal(a.status, 'active')
})

test('a legal first word is applied, scored, and refilled', () => {
  const game = createLocalGame(7, 2)
  game.racks[0] = tiles('C', 'A', 'T', 'S', 'E', 'R', 'O')
  const result = humanPlay(
    game,
    [
      { row: 7, col: 7, letter: 'C' },
      { row: 7, col: 8, letter: 'A' },
      { row: 7, col: 9, letter: 'T' },
    ],
    tiny,
  )
  assert.equal(result.error, undefined)
  const next = result.game
  assert.equal(next.board[7][7]?.letter, 'C')
  assert.equal(next.board[7][9]?.letter, 'T')
  // C(3)+A(1)+T(1) = 5, doubled by the centre double-word square.
  assert.equal(next.scores[0], 10)
  assert.equal(next.racks[0].length, 7)
  assert.deepEqual(next.pending, [])
  assert.equal(next.turn, 1)
  assert.equal(next.lastMove?.words[0], 'CAT')
  assert.equal(next.moves.at(-1)?.kind, 'play')
})

test('an illegal word is refused and nothing changes', () => {
  const game = createLocalGame(7, 2)
  game.racks[0] = tiles('C', 'A', 'T')
  const result = humanPlay(
    game,
    [
      { row: 0, col: 0, letter: 'C' },
      { row: 0, col: 1, letter: 'A' },
      { row: 0, col: 2, letter: 'T' },
    ],
    tiny,
  )
  assert.ok(result.error)
  assert.equal(result.game, game)
  assert.equal(game.scores[0], 0)
  assert.deepEqual(game.board[7][7], null)
})

test('passing hands the turn over and counts a quiet turn', () => {
  const game = createLocalGame(8, 2)
  const result = humanPass(game)
  assert.equal(result.error, undefined)
  assert.equal(result.game.turn, 1)
  assert.equal(result.game.scoreless, 1)
  assert.equal(result.game.moves.at(-1)?.kind, 'pass')
  result.game.scoreless = 6
  assert.equal(canEndGame(result.game), true)
})

test('exchanging keeps the rack full and only happens with a deep bag', () => {
  const game = createLocalGame(9, 2)
  const before = game.racks[0].length
  const bagBefore = game.bag.length
  const result = humanExchange(game, [0, 1])
  assert.equal(result.error, undefined)
  assert.equal(result.game.racks[0].length, before)
  assert.equal(result.game.bag.length, bagBefore)
  assert.equal(result.game.turn, 1)
  assert.equal(result.game.moves.at(-1)?.kind, 'exchange')

  const shallow = createLocalGame(9, 2, { bagSize: 20 }) // bag has 6 left
  assert.ok(humanExchange(shallow, [0]).error)
})

test('ending the game early is recorded', () => {
  const game = createLocalGame(10, 2)
  const done = endLocalGame(game)
  assert.equal(done.status, 'done')
  assert.equal(done.endReason, 'ended_early')
  assert.equal(done.moves.at(-1)?.kind, 'surrender')
})

test('pending tiles and the whole game survive a reload', () => {
  store.clear()
  const game = createLocalGame(11, 3)
  const pending = [{ row: 7, col: 7, letter: 'C', blank: false }]
  const withPending = setPending(game, pending)
  saveLocalGame(withPending)
  assert.equal(JSON.parse(store.get(STORAGE_KEY) ?? '{}').pending.length, 1)

  const loaded = loadLocalGame()
  assert.ok(loaded)
  assert.deepEqual(loaded.pending, pending)
  assert.deepEqual(loaded.racks, withPending.racks)
  assert.equal(loaded.difficulty, 3)
})

test('a finished game is not offered to continue', () => {
  store.clear()
  const game = createLocalGame(12, 1)
  saveLocalGame(endLocalGame(game))
  assert.equal(loadLocalGame(), null)
})

test('the robot takes a legal turn from its own rack', () => {
  const game = createLocalGame(13, 5)
  game.racks[1] = tiles('C', 'A', 'T', 'S')
  game.turn = 1
  const next = botTurn(game, { dict: tiny, rand: () => 0.5 })
  assert.equal(next.status, 'active')
  assert.equal(next.turn, 0)
  assert.ok(next.scores[1] > 0, 'the robot scored')
  assert.ok(next.moves.at(-1)?.kind === 'play')
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = next.board[r][c]
      if (!cell) continue
      assert.ok('CATS'.includes(cell.letter), `board tile ${cell.letter} came from the rack`)
    }
  }
})

test('remaining tiles match blanks and normal tiles correctly', () => {
  const rack = tiles('A', '?', 'T')
  const left = remainingTiles(rack, [
    { row: 7, col: 7, letter: 'A', blank: false },
    { row: 7, col: 8, letter: 'Q', blank: true },
  ])
  assert.ok(left)
  assert.deepEqual(
    left.map((t) => t.letter),
    ['T'],
  )
  assert.equal(remainingTiles(rack, [{ row: 7, col: 7, letter: 'Q', blank: false }]), null)
})
