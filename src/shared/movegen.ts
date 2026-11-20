// Legal move generation: anchor-free but prefix-pruned. For each maximal run of
// squares we walk the word left-to-right through the dictionary, honouring the
// cross-check letter sets so every perpendicular word is valid too. The result
// is ranked by score. Pure, shared by the client and the Worker.
import { BOARD_SIZE, CENTER, isBoardEmpty, type Board } from './board.ts'
import { ALPHABET, type Tile } from './tiles.ts'
import { checkPlay, type FormedWord, type Placement } from './rules.ts'
import type { Dictionary } from './dictionary.ts'

export interface MoveCandidate {
  placements: Placement[]
  words: FormedWord[]
  total: number
  bingo: boolean
}

export interface GenerateOptions {
  /** How many ranked moves to return. Default 50, max 100. */
  limit?: number
  /** Do not use more than this many tiles in one move. Default 7. */
  maxPlacements?: number
}

interface RackState {
  counts: Map<string, number>
  blanks: number
  total: number
}

const ALL_LETTERS = new Set(ALPHABET.split(''))

function rackState(rack: readonly Tile[]): RackState {
  const counts = new Map<string, number>()
  let blanks = 0
  let total = 0
  for (const tile of rack) {
    total++
    if (tile.blank || tile.letter === '?') blanks++
    else counts.set(tile.letter, (counts.get(tile.letter) ?? 0) + 1)
  }
  return { counts, blanks, total }
}

function crossSets(
  board: Board,
  dict: Dictionary,
  fixed: number,
  horizontal: boolean,
): { letters: Array<Tile | null>; allowed: Array<Set<string> | null> } {
  const letters: Array<Tile | null> = []
  const allowed: Array<Set<string> | null> = []
  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = horizontal ? fixed : i
    const col = horizontal ? i : fixed
    const tile = board[row][col]
    letters.push(tile)
    if (tile) {
      allowed.push(null)
      continue
    }

    // Contiguous neighbours perpendicular to the word direction.
    let before = ''
    let r = horizontal ? row - 1 : row
    let c = horizontal ? col : col - 1
    while (r >= 0 && c >= 0) {
      const t = board[r][c]
      if (!t) break
      before = t.letter + before
      r -= horizontal ? 1 : 0
      c -= horizontal ? 0 : 1
    }
    let after = ''
    r = horizontal ? row + 1 : row
    c = horizontal ? col : col + 1
    while (r < BOARD_SIZE && c < BOARD_SIZE) {
      const t = board[r][c]
      if (!t) break
      after += t.letter
      r += horizontal ? 1 : 0
      c += horizontal ? 0 : 1
    }

    if (!before && !after) {
      allowed.push(ALL_LETTERS)
    } else {
      const set = new Set<string>()
      for (const letter of ALPHABET) {
        if (dict.has(before + letter + after)) set.add(letter)
      }
      allowed.push(set)
    }
  }
  return { letters, allowed }
}

export function generateMoves(
  board: Board,
  rack: readonly Tile[],
  dict: Dictionary,
  opts: GenerateOptions = {},
): MoveCandidate[] {
  const limit = Math.min(opts.limit ?? 50, 100)
  const maxPlacements = Math.min(opts.maxPlacements ?? 7, 7)
  const state = rackState(rack)
  if (state.total === 0) return []

  const firstMove = isBoardEmpty(board)
  const found: MoveCandidate[] = []
  const seen = new Set<string>()

  const record = (placements: Placement[]) => {
    if (placements.length === 0 || placements.length > maxPlacements) return
    const k = placements
      .map((p) => `${p.row},${p.col},${p.letter},${p.blank ? 1 : 0}`)
      .sort()
      .join('|')
    if (seen.has(k)) return
    const check = checkPlay(board, placements, dict, { firstMove })
    if (!check.ok) return
    seen.add(k)
    found.push({ placements: check.placements, words: check.words, total: check.total, bingo: check.bingo })
  }

  for (const horizontal of [true, false]) {
    for (let fixed = 0; fixed < BOARD_SIZE; fixed++) {
      if (firstMove && fixed !== CENTER.row) continue
      const { letters, allowed } = crossSets(board, dict, fixed, horizontal)
      const cellAt = (i: number): Placement => ({
        row: horizontal ? fixed : i,
        col: horizontal ? i : fixed,
        letter: '',
      })

      for (let start = 0; start < BOARD_SIZE; start++) {
        if (start > 0 && letters[start - 1] !== null) continue
        let empties = 0
        for (let end = start; end < BOARD_SIZE; end++) {
          if (letters[end] === null) empties++
          // Only consider maximal runs: the next square must be empty or the edge.
          if (end < BOARD_SIZE - 1 && letters[end + 1] !== null) continue
          if (end - start + 1 < 2) continue
          if (empties === 0 || empties > state.total) continue
          if (firstMove && (start > CENTER.col || end < CENTER.col)) continue
          // On a non-empty board the play must touch something: an existing
          // tile in the run, or a perpendicular neighbour of a filled square.
          if (!firstMove) {
            let touches = false
            for (let i = start; i <= end && !touches; i++) {
              if (letters[i]) touches = true
              else {
                const pos = cellAt(i)
                const neighbours = horizontal
                  ? [[pos.row - 1, pos.col], [pos.row + 1, pos.col]]
                  : [[pos.row, pos.col - 1], [pos.row, pos.col + 1]]
                touches = neighbours.some(
                  ([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && !!board[r][c],
                )
              }
            }
            if (!touches) continue
          }

          const counts = new Map(state.counts)
          let blanks = state.blanks
          const placements: Placement[] = []

          const walk = (pos: number, prefix: string): void => {
            if (pos > end) {
              if (prefix.length >= 2 && dict.has(prefix)) {
                record(
                  placements.map((p) => ({ ...p })),
                )
              }
              return
            }
            const existing = letters[pos]
            if (existing) {
              const next = prefix + existing.letter
              if (!dict.hasPrefix(next)) return
              walk(pos + 1, next)
              return
            }
            if (placements.length >= maxPlacements) return
            const options = allowed[pos]
            if (!options || options.size === 0) return
            for (const letter of ALPHABET) {
              if (!options.has(letter)) continue
              const available = counts.get(letter) ?? 0
              let useBlank = false
              if (available > 0) {
                counts.set(letter, available - 1)
              } else if (blanks > 0) {
                blanks--
                useBlank = true
              } else {
                continue
              }
              const next = prefix + letter
              if (dict.hasPrefix(next)) {
                const cell = cellAt(pos)
                placements.push({ row: cell.row, col: cell.col, letter, blank: useBlank })
                walk(pos + 1, next)
                placements.pop()
              }
              if (useBlank) blanks++
              else counts.set(letter, (counts.get(letter) ?? 0) + 1)
            }
          }

          walk(start, '')
        }
      }
    }
  }

  found.sort((a, b) => b.total - a.total || a.placements.length - b.placements.length)
  return found.slice(0, limit)
}
