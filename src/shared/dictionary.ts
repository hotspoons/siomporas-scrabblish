// Word lookup and prefix search. The list is kept as a sorted array: it is
// memory-cheap (important in a 128 MB Worker) and prefix tests are binary
// searches, which is all the move generator needs.

export class Dictionary {
  private readonly sorted: string[]
  private readonly wordSet: Set<string>

  constructor(words: Iterable<string>) {
    const set = new Set<string>()
    for (const raw of words) {
      const word = raw.trim().toUpperCase()
      if (word.length < 2 || word.length > 15) continue
      if (!/^[A-Z]+$/.test(word)) continue
      set.add(word)
    }
    this.wordSet = set
    this.sorted = [...set].sort()
  }

  static fromText(text: string): Dictionary {
    return new Dictionary(text.split(/\r?\n/))
  }

  get size(): number {
    return this.sorted.length
  }

  has(word: string): boolean {
    return this.wordSet.has(word.toUpperCase())
  }

  /** True when at least one word starts with `prefix`. */
  hasPrefix(prefix: string): boolean {
    const target = prefix.toUpperCase()
    const i = this.lowerBound(target)
    return i < this.sorted.length && this.sorted[i].startsWith(target)
  }

  /** Index of the first word >= target. */
  private lowerBound(target: string): number {
    let lo = 0
    let hi = this.sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.sorted[mid] < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /** All words of a given length (used by tests and anagram helpers). */
  wordsOfLength(length: number): string[] {
    return this.sorted.filter((w) => w.length === length)
  }

  /** Words that can be made exactly from these letters (blank = '?'). */
  anagrams(letters: string): string[] {
    const target = countLetters(letters)
    return this.sorted.filter((word) => {
      if (word.length !== letters.length) return false
      const need = countLetters(word)
      for (const [letter, n] of need) if ((target.get(letter) ?? 0) < n) return false
      return true
    })
  }
}

export function countLetters(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const ch of text.toUpperCase()) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  return counts
}
