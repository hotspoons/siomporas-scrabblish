// Word validation and scoring. Pure functions over a board snapshot; the
// browser and the Worker both call exactly this code.
import {
  BOARD_SIZE,
  CENTER,
  premiumAt,
  type Board,
} from './board.ts'
import { tileValue, type Tile } from './tiles.ts'
import type { Dictionary } from './dictionary.ts'

export interface Placement {
  row: number
  col: number
  /** A letter A-Z; for a blank this is the designation chosen by the player. */
  letter: string
  blank?: boolean
}

export interface LineCell {
  row: number
  col: number
}

export interface FormedWord {
  word: string
  cells: LineCell[]
  score: number
}

export interface PlayError {
  code: string
  message: string
  hint?: string
}

export interface PlayCheck {
  ok: boolean
  error?: PlayError
  words: FormedWord[]
  total: number
  bingo: boolean
  placements: Placement[]
}

const DIRECTIONS = [
  { dr: 0, dc: 1 }, // across
  { dr: 1, dc: 0 }, // down
] as const

type Overlay = Map<string, Placement>

const key = (row: number, col: number) => `${row},${col}`

function tileAt(board: Board, overlay: Overlay, row: number, col: number): Tile | null {
  const placed = overlay.get(key(row, col))
  if (placed) return { letter: placed.letter, blank: !!placed.blank }
  return board[row]?.[col] ?? null
}

function occupied(board: Board, overlay: Overlay, row: number, col: number): boolean {
  return tileAt(board, overlay, row, col) !== null
}

function fail(code: string, message: string, hint?: string): PlayCheck {
  return { ok: false, error: { code, message, hint }, words: [], total: 0, bingo: false, placements: [] }
}

function lineThrough(
  board: Board,
  overlay: Overlay,
  row: number,
  col: number,
  dr: number,
  dc: number,
): { cells: LineCell[]; word: string } {
  let r = row
  let c = col
  while (occupied(board, overlay, r - dr, c - dc)) {
    r -= dr
    c -= dc
  }
  const cells: LineCell[] = []
  let word = ''
  while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
    const tile = tileAt(board, overlay, r, c)
    if (!tile) break
    cells.push({ row: r, col: c })
    word += tile.letter
    r += dr
    c += dc
  }
  return { cells, word }
}

function scoreWord(board: Board, overlay: Overlay, cells: LineCell[]): number {
  let sum = 0
  let multiplier = 1
  for (const { row, col } of cells) {
    const tile = tileAt(board, overlay, row, col)
    if (!tile) continue
    const placedHere = overlay.has(key(row, col))
    const value = tileValue(tile.letter, tile.blank)
    if (!placedHere) {
      sum += value
      continue
    }
    const premium = premiumAt(row, col)
    if (premium === 'DL') sum += value * 2
    else if (premium === 'TL') sum += value * 3
    else {
      sum += value
      if (premium === 'DW') multiplier *= 2
      else if (premium === 'TW') multiplier *= 3
    }
  }
  return sum * multiplier
}

function normalizeLetter(letter: string): string {
  return letter.trim().toUpperCase()
}

/**
 * Validate a play and, when it is legal, return every word it forms and the
 * total score. `firstMove` is true only when the board has no tiles yet.
 */
export function checkPlay(
  board: Board,
  placements: Placement[],
  dict: Dictionary,
  opts: { firstMove?: boolean } = {},
): PlayCheck {
  const list = placements.map((p) => ({ ...p, letter: normalizeLetter(p.letter) }))
  if (list.length === 0) return fail('empty', 'Place at least one tile.')

  const seen = new Set<string>()
  for (const p of list) {
    if (!Number.isInteger(p.row) || !Number.isInteger(p.col)) return fail('bad_cell', 'That square is not on the board.')
    if (p.row < 0 || p.row >= BOARD_SIZE || p.col < 0 || p.col >= BOARD_SIZE) return fail('out_of_bounds', 'That square is not on the board.')
    if (!/^[A-Z]$/.test(p.letter)) return fail('bad_letter', `"${p.letter}" is not a letter.`)
    if (board[p.row][p.col]) return fail('occupied', 'There is already a tile there.', 'Take that tile back first.')
    const k = key(p.row, p.col)
    if (seen.has(k)) return fail('duplicate', 'That square is used twice.')
    seen.add(k)
  }

  const sameRow = list.every((p) => p.row === list[0].row)
  const sameCol = list.every((p) => p.col === list[0].col)
  if (!sameRow && !sameCol) {
    return fail('not_in_line', 'Play the tiles in one straight line.', 'All tiles in a turn must share a row or a column.')
  }

  const overlay: Overlay = new Map()
  for (const p of list) overlay.set(key(p.row, p.col), p)

  // No gaps in the main line: every square between the ends must be filled.
  const line = sameRow
    ? { dr: 0, dc: 1, fixed: list[0].row, axis: list.map((p) => p.col) }
    : { dr: 1, dc: 0, fixed: list[0].col, axis: list.map((p) => p.row) }
  const lo = Math.min(...line.axis)
  const hi = Math.max(...line.axis)
  for (let i = lo; i <= hi; i++) {
    const r = sameRow ? line.fixed : i
    const c = sameRow ? i : line.fixed
    if (!occupied(board, overlay, r, c)) {
      return fail('gap', 'There is a gap in your word.', 'Fill every square between the tiles.')
    }
  }

  // Every distinct word formed, main line plus each cross word of length > 1.
  const words: FormedWord[] = []
  const lineKeys = new Set<string>()
  const addLine = (dr: number, dc: number, row: number, col: number) => {
    const found = lineThrough(board, overlay, row, col, dr, dc)
    if (found.cells.length < 2) return
    const k = found.cells.map((c2) => key(c2.row, c2.col)).join('|')
    if (lineKeys.has(k)) return
    lineKeys.add(k)
    words.push({ word: found.word, cells: found.cells, score: scoreWord(board, overlay, found.cells) })
  }

  addLine(line.dr, line.dc, list[0].row, list[0].col)
  for (const p of list) {
    addLine(1, 0, p.row, p.col)
    addLine(0, 1, p.row, p.col)
  }

  if (words.length === 0) {
    return fail('too_short', 'A word needs at least two tiles.')
  }
  for (const w of words) {
    if (!dict.has(w.word)) {
      return fail('not_a_word', `"${w.word}" isn't in the dictionary we use.`, 'Try another word, or take the tiles back.')
    }
  }

  if (opts.firstMove) {
    if (!overlay.has(key(CENTER.row, CENTER.col))) {
      return fail('not_centered', 'The first word must cover the middle square.', 'The gold square in the center.')
    }
  } else {
    let touches = false
    for (const p of list) {
      for (const { dr, dc } of DIRECTIONS) {
        for (const sign of [1, -1]) {
          const r = p.row + dr * sign
          const c = p.col + dc * sign
          if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c]) touches = true
        }
      }
    }
    if (!touches) {
      return fail('not_connected', 'Your word must touch a word already on the board.', 'Put at least one tile next to an existing tile.')
    }
  }

  const bingo = list.length === 7
  const total = words.reduce((sum, w) => sum + w.score, 0) + (bingo ? 50 : 0)
  return {
    ok: true,
    words,
    total,
    bingo,
    placements: list.map((p) => ({ row: p.row, col: p.col, letter: p.letter, blank: !!p.blank })),
  }
}

/** Apply a checked play to a copy of the board (leaves the input untouched). */
export function applyPlay(board: Board, placements: Placement[]): Board {
  const next = board.map((row) => row.slice())
  for (const p of placements) {
    next[p.row][p.col] = { letter: normalizeLetter(p.letter), blank: !!p.blank }
  }
  return next
}

/** The plain text grid used by tests and debugging ('.' for an empty square). */
export function boardToAscii(board: Board): string {
  return board
    .map((row) => row.map((cell) => (cell ? (cell.blank ? cell.letter.toLowerCase() : cell.letter) : '.')).join(' '))
    .join('\n')
}
