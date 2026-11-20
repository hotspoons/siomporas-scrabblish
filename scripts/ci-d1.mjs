#!/usr/bin/env node
// Runs in GitHub Actions before the deploy. Finds the `scrabbleish` D1 database
// (creating it the first time) and writes its real id into wrangler.jsonc.
// The id is not a secret; it just cannot be known until the account is reachable.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

function parseJson(text) {
  const start = text.indexOf('[') >= 0 && (text.indexOf('[') < text.indexOf('{') || text.indexOf('{') < 0) ? text.indexOf('[') : text.indexOf('{')
  if (start < 0) throw new Error('no JSON in wrangler output')
  return JSON.parse(text.slice(start))
}

let databases = []
try {
  const out = run(['d1', 'list', '--json'])
  databases = parseJson(out)
  if (!Array.isArray(databases)) databases = databases.d1_databases ?? []
} catch (err) {
  console.error('d1 list failed, will try to create the database:', err.message)
}

let db = databases.find((d) => d.name === 'scrabbleish' || d.database_name === 'scrabbleish')
if (!db) {
  console.log('scrabbleish D1 database does not exist yet; creating it.')
  const out = run(['d1', 'create', 'scrabbleish'])
  const parsed = parseJson(out)
  db = Array.isArray(parsed.d1_databases) ? parsed.d1_databases[0] : Array.isArray(parsed) ? parsed[0] : parsed
}

const id = db.uuid ?? db.database_id ?? db.databaseId ?? db.id
if (!id) {
  console.error('Could not read the database id from wrangler:', JSON.stringify(db))
  process.exit(1)
}

const file = new URL('../wrangler.jsonc', import.meta.url)
const source = readFileSync(file, 'utf8')
const next = source.replace(/("database_id":\s*")[^"]*(")/, `$1${id}$2`)
if (next === source) {
  console.log(`wrangler.jsonc already has database_id ${id}.`)
} else {
  writeFileSync(file, next)
  console.log(`wrote database_id ${id} into wrangler.jsonc.`)
}
