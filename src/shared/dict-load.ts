// Loads the vendored word lists once per page. In production the service
// worker has them precached, so these resolve offline too.
import { Dictionary } from './dictionary.ts'
import type { WordTiers } from './bot.ts'

let cachedDict: Promise<Dictionary> | null = null
let cachedTiers: Promise<WordTiers> | null = null

export function loadDictionary(url = `${import.meta.env.BASE_URL}dict.txt`): Promise<Dictionary> {
  if (!cachedDict) {
    cachedDict = fetchText(url).then((text) => Dictionary.fromText(text))
  }
  return cachedDict
}

export function loadTiers(base = import.meta.env.BASE_URL): Promise<WordTiers> {
  if (!cachedTiers) {
    cachedTiers = Promise.all([fetchText(`${base}tier-2k.txt`), fetchText(`${base}tier-20k.txt`)]).then(
      ([twoK, twentyK]) => ({ twoK: toSet(twoK), twentyK: toSet(twentyK) }),
    )
  }
  return cachedTiers
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`)
  return res.text()
}

function toSet(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter(Boolean),
  )
}
