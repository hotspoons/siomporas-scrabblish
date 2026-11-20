import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BOT_LEVELS, chooseBotMove, type BotLevel, type WordTiers } from './bot.ts'
import { emptyBoard, type Board } from './board.ts'
import { Dictionary } from './dictionary.ts'
import { checkPlay } from './rules.ts'
import { generateMoves } from './movegen.ts'
import { mulberry32, type Tile } from './tiles.ts'
import { botTurn, createLocalGame, humanPass } from './local-game.ts'

const tiles = (...letters: string[]): Tile[] =>
  letters.map((letter) => (letter === '?' ? { letter: '?', blank: true } : { letter, blank: false }))

const tiny = Dictionary.fromText('at\ncat\ncats\ndog\ndogs\nas\ngo\n')

test('a sharp robot only plays moves it can make from its own rack', () => {
  const board: Board = emptyBoard()
  board[7][6] = { letter: 'C', blank: false }
  board[7][7] = { letter: 'A', blank: false }
  board[7][8] = { letter: 'T', blank: false }
  const rack = tiles('S', 'D', 'O', 'G')

  for (let seed = 1; seed <= 10; seed++) {
    const decision = chooseBotMove({
      level: 5,
      board,
      rack,
      bagCount: seed * 7,
      dict: tiny,
      rand: mulberry32(seed),
    })
    if (decision.kind !== 'play') continue
    const check = checkPlay(board, decision.move.placements, tiny)
    assert.ok(check.ok, check.error?.message)
    // Every placed tile is either from the rack or (never) a square already used.
    for (const p of decision.move.placements) assert.equal(board[p.row][p.col], null)
    const used = decision.move.placements.map((p) => p.letter)
    const pool = rack.map((t) => t.letter)
    for (const letter of used) {
      const at = pool.indexOf(letter)
      assert.ok(at >= 0, `${letter} came from the rack`)
      pool.splice(at, 1)
    }
  }
})

test('the bag count does not change a sharp decision', () => {
  const board: Board = emptyBoard()
  board[7][7] = { letter: 'C', blank: false }
  board[7][8] = { letter: 'A', blank: false }
  board[7][9] = { letter: 'T', blank: false }
  const rack = tiles('S', 'D', 'O', 'G')
  const one = chooseBotMove({ level: 5, board, rack, bagCount: 0, dict: tiny, rand: mulberry32(9) })
  const two = chooseBotMove({ level: 5, board, rack, bagCount: 90, dict: tiny, rand: mulberry32(9) })
  assert.deepEqual(one, two)
})

test('the word tiers narrow the gentle robot vocabulary', () => {
  const board: Board = emptyBoard()
  board[7][7] = { letter: 'C', blank: false }
  board[7][8] = { letter: 'A', blank: false }
  board[7][9] = { letter: 'T', blank: false }
  board[10][10] = { letter: 'D', blank: false }
  board[10][11] = { letter: 'O', blank: false }
  board[10][12] = { letter: 'G', blank: false }
  const rack = tiles('S', 'A', 'E')
  const tiers: WordTiers = { twoK: new Set(['DOGS', 'DOG', 'GO']), twentyK: new Set(['CATS']) }
  assert.equal(BOT_LEVELS[1].vocabulary, '2k')

  // The full dictionary offers both CATS and DOGS from this rack.
  const all = generateMoves(board, rack, tiny, { limit: 100 })
  assert.ok(all.some((m) => m.words.some((w) => w.word === 'CATS')))
  assert.ok(all.some((m) => m.words.some((w) => w.word === 'DOGS')))

  // The 2k tier drops CATS, so the gentle robot can only pick DOGS (or pass).
  for (let seed = 1; seed <= 20; seed++) {
    const decision = chooseBotMove({ level: 1, board, rack, bagCount: 50, dict: tiny, tiers, rand: mulberry32(seed) })
    if (decision.kind !== 'play') continue
    for (const word of decision.move.words) assert.ok(tiers.twoK.has(word.word), `${word.word} is common`)
    assert.ok(decision.move.words.some((w) => w.word === 'DOGS'))
  }
})

// --- seeded games --------------------------------------------------------

const dictPath = fileURLToPath(new URL('../../public/dict.txt', import.meta.url))
const tier2k = fileURLToPath(new URL('../../public/tier-2k.txt', import.meta.url))
const tier20k = fileURLToPath(new URL('../../public/tier-20k.txt', import.meta.url))
const ready = existsSync(dictPath) && existsSync(tier2k) && existsSync(tier20k)

function readSet(path: string): Set<string> {
  return new Set(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter(Boolean),
  )
}

function playOne(level: BotLevel, seed: number, dict: Dictionary, tiers: WordTiers): number {
  let game = createLocalGame(seed, level, { bagSize: 28 })
  for (let guard = 0; guard < 120 && game.status === 'active'; guard++) {
    if (game.turn === 1) {
      game = botTurn(game, {
        dict,
        tiers,
        rand: mulberry32(game.seed ^ game.version ^ 0x2545f491),
      })
    } else {
      // A silent opponent: it gives the robot every chance to score.
      const result = humanPass(game)
      if (result.error) break
      game = result.game
    }
  }
  return game.scores[1]
}

test('harder robots score more, on the same seeds', { skip: !ready, timeout: 120000 }, () => {
  const dict = Dictionary.fromText(readFileSync(dictPath, 'utf8'))
  const tiers: WordTiers = { twoK: readSet(tier2k), twentyK: readSet(tier20k) }
  const seeds = [3, 17, 41]
  const means: number[] = []
  for (const level of [1, 2, 3, 4, 5] as BotLevel[]) {
    const scores = seeds.map((seed) => playOne(level, seed, dict, tiers))
    means.push(scores.reduce((a, b) => a + b, 0) / scores.length)
  }
  for (let i = 1; i < means.length; i++) {
    assert.ok(
      means[i] >= means[i - 1],
      `level ${i + 1} mean ${means[i].toFixed(1)} should be at least level ${i} mean ${means[i - 1].toFixed(1)} (${means.join(', ')})`,
    )
  }
  assert.ok(means[4] > means[0], `level 5 (${means[4].toFixed(1)}) beats level 1 (${means[0].toFixed(1)})`)
})
