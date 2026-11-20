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

mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'dict.txt'), words.join('\n') + '\n')
writeFileSync(resolve(outDir, 'popular.txt'), popular.join('\n') + '\n')

const license = `Word lists
==========

dict.txt is the ENABLE word list (Enhanced North American Benchmark Lexicon,
172,823 words), which its authors released into the public domain. This copy
comes from the dolph/dictionary repository (enable1.txt), filtered to the
168,551 entries that are 2-15 letters and playable on a 15x15 board.

popular.txt is the common subset of ENABLE, filtered against Wiktionary's word
frequency lists by the same repository (25,322 words). It ships alongside
ENABLE so the robot's easier levels can prefer everyday words.

No changes are made to the words themselves beyond upper-casing and sorting.

Sources:
  https://github.com/dolph/dictionary
  https://wordlist.sourceforge.net/ (original ENABLE project, archived)
`
writeFileSync(resolve(outDir, 'dict-LICENSE.txt'), license)

console.log(`wrote ${words.length} ENABLE words, ${popular.length} popular words to ${outDir}`)
