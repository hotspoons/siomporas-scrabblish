// A complete off-line game against the robot. Everything here is pure: the UI
// owns React state and persistence, this module owns the rules of a turn.
import { applyPlay, checkPlay, type FormedWord, type Placement } from './rules.ts'
import { createBag, drawTiles, mulberry32, tileValue, type Tile } from './tiles.ts'
import { emptyBoard, isBoardEmpty, type Board } from './board.ts'
import type { Dictionary } from './dictionary.ts'
import { BOT_LEVELS, chooseBotMove, type BotLevel, type WordTiers } from './bot.ts'

export type Seat = 0 | 1
export type GameStatus = 'active' | 'done'

export interface MoveRecord {
  seat: Seat
  kind: 'play' | 'pass' | 'exchange' | 'surrender'
  score: number
  words?: string[]
  placements?: Placement[]
}

export interface LastMove {
  seat: Seat
  cells: Array<{ row: number; col: number }>
  words: string[]
  score: number
}

export interface LocalGame {
  seed: number
  difficulty: BotLevel
  bagSize: number
  board: Board
  bag: Tile[]
  racks: [Tile[], Tile[]]
  scores: [number, number]
  turn: Seat
  status: GameStatus
  moves: MoveRecord[]
  scoreless: number
  lastMove: LastMove | null
  /** Half-placed word for the human seat, mirrored to localStorage. */
  pending: Placement[]
  endReason?: string
  createdAt: number
  updatedAt: number
  version: number
}

export interface TurnResult {
  game: LocalGame
  error?: string
}

const SEAT_NAMES = ['You', 'Robot'] as const

function clone(game: LocalGame): LocalGame {
  return {
    ...game,
    board: game.board.map((row) => row.slice()),
    bag: game.bag.slice(),
    racks: [game.racks[0].slice(), game.racks[1].slice()],
    scores: [game.scores[0], game.scores[1]],
    moves: game.moves.slice(),
    pending: game.pending.map((p) => ({ ...p })),
    lastMove: game.lastMove
      ? { ...game.lastMove, cells: game.lastMove.cells.map((c) => ({ ...c })), words: game.lastMove.words.slice() }
      : null,
  }
}

function touch(game: LocalGame): LocalGame {
  game.updatedAt = Date.now()
  game.version++
  return game
}

function refill(game: LocalGame, seat: Seat): void {
  const rack = game.racks[seat]
  while (rack.length < 7 && game.bag.length > 0) {
    const [tile] = drawTiles(game.bag, 1)
    rack.push(tile)
  }
}

function rackValue(tiles: readonly Tile[]): number {
  return tiles.reduce((sum, t) => sum + tileValue(t.letter, t.blank), 0)
}

/** Remove the tiles a move consumed, matching blanks by their role. */
export function remainingTiles(rack: readonly Tile[], placements: readonly Placement[]): Tile[] | null {
  const remaining = rack.slice()
  for (const p of placements) {
    const i = remaining.findIndex((t) => (p.blank ? t.blank : !t.blank && t.letter === p.letter))
    if (i < 0) return null
    remaining.splice(i, 1)
  }
  return remaining
}

function endGame(game: LocalGame, reason: string): LocalGame {
  game.status = 'done'
  game.endReason = reason
  if (reason === 'out_of_tiles') {
    // The player who went out takes the opponent's leftover tiles, and the
    // opponent loses them.
    const out: Seat = game.racks[0].length === 0 ? 0 : 1
    const other: Seat = out === 0 ? 1 : 0
    const leftover = rackValue(game.racks[other])
    game.scores[out] += leftover
    game.scores[other] -= leftover
  }
  return game
}

function afterTurn(game: LocalGame, seat: Seat, score: number): LocalGame {
  game.turn = seat === 0 ? 1 : 0
  game.scoreless = score > 0 ? 0 : game.scoreless + 1
  if (game.racks[seat].length === 0 && game.bag.length === 0) endGame(game, 'out_of_tiles')
  return touch(game)
}

export function createLocalGame(
  seed: number,
  difficulty: BotLevel,
  opts: { bagSize?: number; now?: number } = {},
): LocalGame {
  const rand = mulberry32(seed)
  const fullBag = createBag(rand)
  const bag = opts.bagSize ? fullBag.slice(0, opts.bagSize) : fullBag
  const racks: [Tile[], Tile[]] = [[], []]
  racks[0] = drawTiles(bag, 7)
  racks[1] = drawTiles(bag, 7)
  const now = opts.now ?? Date.now()
  return {
    seed,
    difficulty,
    bagSize: bag.length + racks[0].length + racks[1].length,
    board: emptyBoard(),
    bag,
    racks,
    scores: [0, 0],
    turn: 0,
    status: 'active',
    moves: [],
    scoreless: 0,
    lastMove: null,
    pending: [],
    createdAt: now,
    updatedAt: now,
    version: 0,
  }
}

/** Update (and persist in the object) the human's half-placed word. */
export function setPending(game: LocalGame, pending: Placement[]): LocalGame {
  const next = clone(game)
  next.pending = pending.map((p) => ({ ...p }))
  return touch(next)
}

export function humanPlay(game: LocalGame, placements: Placement[], dict: Dictionary): TurnResult {
  if (game.status !== 'active') return { game, error: 'This game is over.' }
  if (game.turn !== 0) return { game, error: 'It is the robot’s turn.' }
  const check = checkPlay(game.board, placements, dict, { firstMove: isBoardEmpty(game.board) })
  if (!check.ok) return { game, error: check.error?.message ?? 'That play is not legal.' }

  const remaining = remainingTiles(game.racks[0], check.placements)
  if (!remaining) return { game, error: 'Those tiles are not in your rack.' }

  const next = clone(game)
  next.board = applyPlay(next.board, check.placements)
  next.scores[0] += check.total
  next.racks[0] = remaining
  refill(next, 0)
  next.pending = []
  next.moves.push({
    seat: 0,
    kind: 'play',
    score: check.total,
    words: check.words.map((w: FormedWord) => w.word),
    placements: check.placements,
  })
  next.lastMove = {
    seat: 0,
    cells: check.placements.map((p) => ({ row: p.row, col: p.col })),
    words: check.words.map((w) => w.word),
    score: check.total,
  }
  return { game: afterTurn(next, 0, check.total) }
}

export function humanPass(game: LocalGame): TurnResult {
  if (game.status !== 'active') return { game, error: 'This game is over.' }
  if (game.turn !== 0) return { game, error: 'It is the robot’s turn.' }
  const next = clone(game)
  next.pending = []
  next.moves.push({ seat: 0, kind: 'pass', score: 0 })
  return { game: afterTurn(next, 0, 0) }
}

export function humanExchange(game: LocalGame, indices: number[]): TurnResult {
  if (game.status !== 'active') return { game, error: 'This game is over.' }
  if (game.turn !== 0) return { game, error: 'It is the robot’s turn.' }
  if (indices.length === 0) return { game, error: 'Choose at least one tile to exchange.' }
  if (game.bag.length < 7) return { game, error: 'There are too few tiles left in the bag to exchange.' }

  const unique = [...new Set(indices)].sort((a, b) => b - a)
  const next = clone(game)
  const returned: Tile[] = []
  for (const i of unique) {
    const [tile] = next.racks[0].splice(i, 1)
    if (tile) returned.push(tile)
  }
  next.racks[0].push(...drawTiles(next.bag, returned.length))
  // Returned tiles go back into the bag, then it is shuffled so they are not
  // drawn straight back. Deterministic in the game's seed.
  next.bag.push(...returned)
  const rand = mulberry32(next.seed ^ next.version ^ 0x51ed270b)
  for (let i = next.bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[next.bag[i], next.bag[j]] = [next.bag[j], next.bag[i]]
  }
  next.pending = []
  next.moves.push({ seat: 0, kind: 'exchange', score: 0 })
  return { game: afterTurn(next, 0, 0) }
}

/** End the game early, after six quiet turns or from the menu. */
export function endLocalGame(game: LocalGame, reason = 'ended_early'): LocalGame {
  if (game.status === 'done') return game
  const next = clone(game)
  next.moves.push({ seat: next.turn, kind: 'surrender', score: 0 })
  next.pending = []
  return touch(endGame(next, reason))
}

export function canEndGame(game: LocalGame): boolean {
  return game.status === 'active' && game.scoreless >= 6
}

export interface BotTurnOptions {
  dict: Dictionary
  tiers?: WordTiers | null
  /** Deterministic randomness, normally seeded from the game. */
  rand?: () => number
}

/** Run one robot turn. Returns the same object if it is not the robot's turn. */
export function botTurn(game: LocalGame, opts: BotTurnOptions): LocalGame {
  if (game.status !== 'active' || game.turn !== 1) return game
  const rand = opts.rand ?? mulberry32(game.seed ^ game.version ^ 0x9e3779b9)
  const cfg = BOT_LEVELS[game.difficulty]
  const decision = chooseBotMove({
    level: cfg.level,
    board: game.board,
    rack: game.racks[1],
    bagCount: game.bag.length,
    dict: opts.dict,
    tiers: opts.tiers,
    rand,
  })

  const next = clone(game)
  next.pending = []

  if (decision.kind === 'play') {
    const check = checkPlay(next.board, decision.move.placements, opts.dict, {
      firstMove: isBoardEmpty(next.board),
    })
    if (!check.ok) {
      // The generator should only produce legal moves; if that ever fails,
      // pass rather than corrupt the game.
      next.moves.push({ seat: 1, kind: 'pass', score: 0 })
      return afterTurn(next, 1, 0)
    }
    const remaining = remainingTiles(next.racks[1], check.placements)
    if (!remaining) {
      next.moves.push({ seat: 1, kind: 'pass', score: 0 })
      return afterTurn(next, 1, 0)
    }
    next.board = applyPlay(next.board, check.placements)
    next.scores[1] += check.total
    next.racks[1] = remaining
    refill(next, 1)
    next.moves.push({
      seat: 1,
      kind: 'play',
      score: check.total,
      words: check.words.map((w) => w.word),
      placements: check.placements,
    })
    next.lastMove = {
      seat: 1,
      cells: check.placements.map((p) => ({ row: p.row, col: p.col })),
      words: check.words.map((w) => w.word),
      score: check.total,
    }
    return afterTurn(next, 1, check.total)
  }

  if (decision.kind === 'exchange' && next.bag.length >= 7) {
    const returned = next.racks[1].splice(0, next.racks[1].length)
    next.racks[1].push(...drawTiles(next.bag, returned.length))
    next.bag.push(...returned)
    next.moves.push({ seat: 1, kind: 'exchange', score: 0 })
    return afterTurn(next, 1, 0)
  }

  next.moves.push({ seat: 1, kind: 'pass', score: 0 })
  return afterTurn(next, 1, 0)
}

/** One-line description of the robot's last turn, for the calm status line. */
export function describeLastMove(game: LocalGame): string | null {
  const move = game.lastMove
  if (!move) return null
  if (move.seat === 0) return `You played ${move.words.join(', ')} for ${move.score}.`
  return `${SEAT_NAMES[1]} played ${move.words.join(', ')} for ${move.score}.`
}

// --- persistence ---------------------------------------------------------

export const STORAGE_KEY = 'scrabbleish.game.v1'

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function saveLocalGame(game: LocalGame): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(game))
  } catch {
    // A full or disabled localStorage must never break a game in progress.
  }
}

export function loadLocalGame(): LocalGame | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return null
    const game = JSON.parse(raw) as LocalGame
    if (!game || game.status !== 'active' || !Array.isArray(game.board) || game.board.length !== 15) return null
    if (!Array.isArray(game.racks) || game.racks.length !== 2) return null
    if (game.racks[0].length === 0 && game.turn === 0 && game.status === 'active') return null
    game.pending = Array.isArray(game.pending) ? game.pending : []
    return game
  } catch {
    return null
  }
}

export function clearLocalGame(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
