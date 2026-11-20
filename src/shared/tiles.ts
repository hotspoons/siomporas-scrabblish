// Standard English tile set, values and bag. Shared by the browser and the Worker.

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const BLANK = '?'

export interface Tile {
  /** A letter A-Z, or BLANK for a blank tile. */
  letter: string
  /** True for a blank; letter is then the designation chosen when played. */
  blank: boolean
}

export const LETTER_VALUES: Readonly<Record<string, number>> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  [BLANK]: 0,
}

export const DISTRIBUTION: Readonly<Record<string, number>> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
  [BLANK]: 2,
}

export function tileValue(letter: string, blank = false): number {
  return blank ? 0 : (LETTER_VALUES[letter] ?? 0)
}

/** Small deterministic PRNG so a game can be replayed from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** All 100 tiles, ordered deterministically for a seed. */
export function createBag(rand: () => number): Tile[] {
  const tiles: Tile[] = []
  for (const letter of [...ALPHABET, BLANK]) {
    for (let i = 0; i < (DISTRIBUTION[letter] ?? 0); i++) {
      tiles.push({ letter, blank: letter === BLANK })
    }
  }
  return shuffle(tiles, rand)
}

export function drawTiles(bag: Tile[], count: number): Tile[] {
  return bag.splice(0, Math.min(count, bag.length))
}

/** Letters of a rack as a sorted string, useful in tests and logs. */
export function rackKey(tiles: readonly Tile[]): string {
  return tiles
    .map((t) => t.letter)
    .sort()
    .join('')
}
