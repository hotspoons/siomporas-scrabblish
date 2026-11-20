import test from 'node:test'
import assert from 'node:assert/strict'
import { Dictionary } from './dictionary.ts'

const dict = Dictionary.fromText('cat\ncats\ndog\ndogs\nquiz\n')

test('lookup is case-insensitive and exact', () => {
  assert.ok(dict.has('cat'))
  assert.ok(dict.has('CAT'))
  assert.ok(!dict.has('ca'))
  assert.ok(!dict.has('catt'))
})

test('prefix search finds real prefixes only', () => {
  assert.ok(dict.hasPrefix('c'))
  assert.ok(dict.hasPrefix('ca'))
  assert.ok(dict.hasPrefix('cat'))
  assert.ok(!dict.hasPrefix('cx'))
  assert.ok(!dict.hasPrefix('dogss'))
})

test('non-alpha and out-of-range words are ignored', () => {
  const odd = Dictionary.fromText("a\nab\nit's\nnaïve\ntoolongwordtoolong\n zz \n")
  assert.ok(odd.has('ab'))
  assert.ok(!odd.has('a')) // single letters are not playable
  assert.ok(!odd.has("IT'S"))
  assert.ok(!odd.has('NAÏVE'))
  assert.equal(odd.size, 2)
})

test('anagrams respect the rack', () => {
  assert.deepEqual(dict.anagrams('tac'), ['CAT'])
  assert.deepEqual(dict.anagrams('tacs'), ['CATS'])
  assert.deepEqual(dict.anagrams('zzz'), [])
})

test('wordsOfLength filters', () => {
  assert.deepEqual(dict.wordsOfLength(4), ['CATS', 'DOGS', 'QUIZ'])
})
