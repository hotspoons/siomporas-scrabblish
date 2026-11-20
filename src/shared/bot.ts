// The robot. It sees only the board and its own rack — never the bag, never
// the opponent's tiles. Difficulty comes from vocabulary, word length, how
// much noise it tolerates when picking, and whether it is allowed to bingo.
import { premiumAt, type Board } from './board.ts'
import type { Dictionary } from './dictionary.ts'
import { generateMoves, type MoveCandidate } from './movegen.ts'
import type { Tile } from './tiles.ts'

export type BotLevel = 1 | 2 | 3 | 4 | 5

export interface WordTiers {
  /** Most frequent 2,000 common words. */
  twoK: Set<string>
  /** Most frequent 20,000 common words. */
  twentyK: Set<string>
}

export interface BotConfig {
  level: BotLevel
  name: string
  blurb: string
  vocabulary: '2k' | '20k' | 'all'
  minLength: number
  maxLength: number
  topK: number
  /** 0 means always take the best move. */
  temperature: number
  passChance: number
  exchangeChance: number
  allowBingo: boolean
  /** Weight for denying premium squares to the opponent. */
  defence: number
}

export const BOT_LEVELS: Record<BotLevel, BotConfig> = {
  1: {
    level: 1,
    name: 'Gentle',
    blurb: 'Short, everyday words. Sometimes passes.',
    vocabulary: '2k',
    minLength: 3,
    maxLength: 5,
    topK: 12,
    temperature: 30,
    passChance: 0.18,
    exchangeChance: 0.2,
    allowBingo: false,
    defence: 0,
  },
  2: {
    level: 2,
    name: 'Easy',
    blurb: 'Everyday words, a little longer.',
    vocabulary: '2k',
    minLength: 3,
    maxLength: 6,
    topK: 8,
    temperature: 14,
    passChance: 0.1,
    exchangeChance: 0.15,
    allowBingo: false,
    defence: 0,
  },
  3: {
    level: 3,
    name: 'Steady',
    blurb: 'A wider vocabulary and better squares.',
    vocabulary: '20k',
    minLength: 2,
    maxLength: 8,
    topK: 5,
    temperature: 7,
    passChance: 0.05,
    exchangeChance: 0.1,
    allowBingo: false,
    defence: 0.05,
  },
  4: {
    level: 4,
    name: 'Strong',
    blurb: 'Long words and bingos.',
    vocabulary: 'all',
    minLength: 2,
    maxLength: 99,
    topK: 3,
    temperature: 3,
    passChance: 0.02,
    exchangeChance: 0.05,
    allowBingo: true,
    defence: 0.15,
  },
  5: {
    level: 5,
    name: 'Sharp',
    blurb: 'The best move it can find, and it closes squares.',
    vocabulary: 'all',
    minLength: 2,
    maxLength: 99,
    topK: 1,
    temperature: 0,
    passChance: 0,
    exchangeChance: 0,
    allowBingo: true,
    defence: 0.35,
  },
}

export interface BotView {
  level: BotLevel
  board: Board
  rack: readonly Tile[]
  bagCount: number
  dict: Dictionary
  tiers?: WordTiers | null
  rand: () => number
}

export type BotDecision =
  | { kind: 'play'; move: MoveCandidate }
  | { kind: 'pass' }
  | { kind: 'exchange' }

function vocabularyFor(cfg: BotConfig, tiers?: WordTiers | null): Set<string> | null {
  if (!tiers) return null
  if (cfg.vocabulary === '2k') return tiers.twoK
  if (cfg.vocabulary === '20k') return tiers.twentyK
  return null
}

function mainWord(move: MoveCandidate): string {
  return move.words.reduce((best, w) => (w.word.length > best.length ? w.word : best), '')
}

/** How much of the valuable board this move takes away from the opponent. */
export function denialValue(board: Board, move: MoveCandidate): number {
  let value = 0
  for (const p of move.placements) {
    if (board[p.row][p.col]) continue
    switch (premiumAt(p.row, p.col)) {
      case 'TW': value += 5; break
      case 'DW': value += 3; break
      case 'TL': value += 1.5; break
      case 'DL': value += 0.5; break
    }
  }
  return value
}

function pickWeighted<T>(items: T[], weights: number[], rand: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return items[0]
  let roll = rand() * total
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return items[i]
  }
  return items[items.length - 1]
}

/**
 * Pick this turn's move. The caller supplies the randomness so a game can be
 * replayed from its seed.
 */
export function chooseBotMove(view: BotView): BotDecision {
  const cfg = BOT_LEVELS[view.level]
  const { board, rack, dict, rand } = view
  if (rack.length === 0) return { kind: 'pass' }

  const all = generateMoves(board, rack, dict, { limit: 200 })
  const vocab = vocabularyFor(cfg, view.tiers)

  const allowed = all.filter((move) => {
    const main = mainWord(move)
    if (main.length < cfg.minLength || main.length > cfg.maxLength) return false
    if (!cfg.allowBingo && move.placements.length === 7) return false
    if (vocab && !move.words.every((w) => vocab.has(w.word))) return false
    return true
  })
  // A narrow vocabulary must never leave the robot mute; fall back to the full
  // list rather than pass every turn.
  const moves = allowed.length > 0 ? allowed : all

  if (moves.length === 0) {
    if (view.bagCount >= 7 && rand() < cfg.exchangeChance) return { kind: 'exchange' }
    return { kind: 'pass' }
  }

  if (rand() < cfg.passChance) return { kind: 'pass' }

  const ranked = moves
    .map((move) => ({ move, value: move.total + cfg.defence * denialValue(board, move) }))
    .sort((a, b) => b.value - a.value)

  const top = ranked.slice(0, Math.max(1, cfg.topK))
  if (cfg.temperature <= 0 || top.length === 1) return { kind: 'play', move: top[0].move }

  const best = top[0].value
  const weights = top.map((entry) => Math.exp(-(best - entry.value) / cfg.temperature))
  return { kind: 'play', move: pickWeighted(top, weights, rand).move }
}

/** Plain description for the difficulty picker. */
export function levelChoices(): BotConfig[] {
  return ([1, 2, 3, 4, 5] as BotLevel[]).map((level) => BOT_LEVELS[level])
}
