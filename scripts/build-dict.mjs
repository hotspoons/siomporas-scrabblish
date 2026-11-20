#!/usr/bin/env node
// Vendor the word lists into public/ so the browser, the Worker and the PWA
// cache all read the same bytes.
//   node scripts/build-dict.mjs --enable /workspace/dl/enable/enable1.txt \
//        --popular /workspace/dl/enable/popular.txt [--out public]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : dflt
}
const here = dirname(fileURLToPath(import.meta.url))
const enablePath = opt('enable', '/workspace/dl/enable/enable1.txt')
const popularPath = opt('popular', '/workspace/dl/enable/popular.txt')
const freqPath = opt('freq', '/workspace/dl/freq/count_1w.txt')
const outDir = resolve(opt('out', resolve(here, '../public')))

function normalize(path) {
  const words = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter((w) => /^[A-Z]{2,15}$/.test(w))
  return [...new Set(words)].sort()
}

const words = normalize(enablePath)
const popular = normalize(popularPath)
if (words.length < 100000) {
  console.error(`refusing: only ${words.length} words read from ${enablePath}`)
  process.exit(1)
}
const wordSet = new Set(words)
if (!popular.every((w) => wordSet.has(w))) {
  console.error('refusing: popular.txt has words missing from ENABLE')
  process.exit(1)
}

// Frequency tiers for the robot: order the common words by how often they are
// used, so level 1 can prefer everyday vocabulary.
const counts = new Map()
for (const line of readFileSync(freqPath, 'utf8').split(/\r?\n/)) {
  const [word, count] = line.split('\t')
  if (!word || !count) continue
  const upper = word.toUpperCase()
  if (/^[A-Z]{2,15}$/.test(upper)) counts.set(upper, Number(count))
}
const ranked = popular.filter((w) => counts.has(w)).sort((a, b) => counts.get(b) - counts.get(a))
if (ranked.length < 20000) {
  console.error(`refusing: only ${ranked.length} ranked popular words (need 20000)`)
  process.exit(1)
}
const tier2k = ranked.slice(0, 2000)
const tier20k = ranked.slice(0, 20000)

mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'dict.txt'), words.join('\n') + '\n')
writeFileSync(resolve(outDir, 'popular.txt'), popular.join('\n') + '\n')
writeFileSync(resolve(outDir, 'tier-2k.txt'), tier2k.join('\n') + '\n')
writeFileSync(resolve(outDir, 'tier-20k.txt'), tier20k.join('\n') + '\n')

const license = `Word lists
==========

dict.txt is the ENABLE word list (Enhanced North American Benchmark Lexicon,
172,823 words), which its authors released into the public domain. This copy
comes from the dolph/dictionary repository (enable1.txt), filtered to the
168,551 entries that are 2-15 letters and playable on a 15x15 board.

popular.txt is the common subset of ENABLE, filtered against Wiktionary's word
frequency lists by the same repository (25,322 words). It ships alongside
ENABLE so the robot's easier levels can prefer everyday words.

tier-2k.txt and tier-20k.txt are that common set ordered by frequency using
Peter Norvig's count_1w list (norvig.com/ngrams), then trimmed to the most
frequent 2,000 and 20,000. The robot's easier levels draw only from these, so
it plays the words a person would actually say.

No changes are made to the words themselves beyond upper-casing, alphabetising
dict.txt and popular.txt, and ordering the two tier files by frequency.

Sources:
  https://github.com/dolph/dictionary
  https://wordlist.sourceforge.net/ (original ENABLE project, archived)
`
writeFileSync(resolve(outDir, 'dict-LICENSE.txt'), license)

console.log(
  `wrote ${words.length} ENABLE words, ${popular.length} popular words, ` +
    `${tier2k.length} / ${tier20k.length} tier words to ${outDir}`,
)
