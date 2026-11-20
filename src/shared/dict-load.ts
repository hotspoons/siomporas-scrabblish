// Loads the vendored word list once per page. In production the service worker
// has it precached, so this resolves offline too.
import { Dictionary } from './dictionary.ts'

let cached: Promise<Dictionary> | null = null

export function loadDictionary(url = `${import.meta.env.BASE_URL}dict.txt`): Promise<Dictionary> {
  if (!cached) {
    cached = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load the word list (${res.status}).`)
        return res.text()
      })
      .then((text) => Dictionary.fromText(text))
  }
  return cached
}
