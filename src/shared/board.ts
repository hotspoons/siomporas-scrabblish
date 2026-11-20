// The 15x15 board, premium squares and small board helpers.
import type { Tile } from './tiles.ts'

export const BOARD_SIZE = 15
export const CENTER = { row: 7, col: 7 } as const

export type Premium = 'DL' | 'TL' | 'DW' | 'TW' | null
export type Cell = Tile | null
export type Board = Cell[][]

const TRIPLE_WORD: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14],
]
const DOUBLE_WORD: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10],
  [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10],
  [7, 7],
]
const TRIPLE_LETTER: ReadonlyArray<readonly [number, number]> = [
  [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
  [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9],
]
const DOUBLE_LETTER: ReadonlyArray<readonly [number, number]> = [
  [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14],
  [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
  [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14],
  [12, 6], [12, 8], [14, 3], [14, 11],
]

function buildPremiums(): Premium[][] {
  const grid: Premium[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<Premium>(BOARD_SIZE).fill(null),
  )
  for (const [r, c] of TRIPLE_WORD) grid[r][c] = 'TW'
  for (const [r, c] of DOUBLE_WORD) grid[r][c] = 'DW'
  for (const [r, c] of TRIPLE_LETTER) grid[r][c] = 'TL'
  for (const [r, c] of DOUBLE_LETTER) grid[r][c] = 'DL'
  return grid
}

export const PREMIUMS: readonly Premium[][] = buildPremiums()

export function premiumAt(row: number, col: number): Premium {
  return PREMIUMS[row]?.[col] ?? null
}

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<Cell>(BOARD_SIZE).fill(null))
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice())
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

export function isBoardEmpty(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell === null))
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

/** Premium summary used by the debug board and later by the real board UI. */
export function premiumLabel(premium: Premium): string {
  switch (premium) {
    case 'TW': return '×3 W'
    case 'DW': return '×2 W'
    case 'TL': return '×3 L'
    case 'DL': return '×2 L'
    default: return ''
  }
}
