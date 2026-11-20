# Scrabbleish

A calm word game for family, built for a phone in the hand. Installs once and then
plays with no internet, no ads, no accounts, and nothing asking for attention.

Live at **[scrabbleish.siomporas.com](https://scrabbleish.siomporas.com)**.

*(This README grows with the build; the game itself is under construction.)*

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve dist/ on :4173
npm test           # rules/scoring/dictionary/move-generation tests (node --test)
npm run dict       # rebuild public/dict.txt + public/popular.txt from the source lists
```

Checks against a running preview or the live site:

```bash
npm run m0 -- --url http://localhost:4173/   # shell installs and opens offline
npm run m1 -- --url http://localhost:4173/   # board lab plays an engine move, offline too
```

## What exists so far

**M0 — the shell.** PWA, Worker, D1 schema, deploy pipeline. Home and Rules pages,
icons, install and offline support.

**M1 — the engine** (`src/shared/`, imported by both the browser and the Worker):

| File | What |
|---|---|
| `board.ts` | 15×15 board, standard premium squares |
| `tiles.ts` | 100-tile distribution, letter values, seeded bag |
| `dictionary.ts` | Sorted word list with exact lookup and prefix search |
| `rules.ts` | Move validation, every formed word, scoring, blanks, 50-point bingo |
| `movegen.ts` | Legal move generation, ranked by score, with blank handling |
| `dict-load.ts` | Loads the vendored list once (precached, so offline works) |

The **Board lab** on the home screen is the manual playground: tap a rack tile, tap a
square, see the score preview and any friendly rule message, then play the word. It
uses the exact code the server will use.

### The word list

`public/dict.txt` is ENABLE (public domain), filtered to the 168,551 words that are
2–15 letters and playable on the board. `public/popular.txt` is the 25,298-word
common subset used later for the robot's easier levels. Both are built by
`scripts/build-dict.mjs` and precached with the app; see `public/dict-LICENSE.txt`.

## Deploy

A Cloudflare Worker serves both the built app and the game API, with D1 for online
games. Pushing to `main` builds, tests, migrates and deploys through
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers Scripts: Edit, D1: Edit; on the siomporas.com zone: Zone: Read, DNS: Edit, Workers Routes: Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → account id |

The first deploy creates the `scrabbleish` D1 database in CI
(`scripts/ci-d1.mjs`) and writes its id into `wrangler.jsonc` before deploying;
later runs reuse it. That keeps the id out of git, at the cost of one extra API
call per deploy — chosen deliberately in M0.

Wrangler is pinned to exactly `4.158.0`: 4.165.x calls a newer worker-subdomain
API after upload and fails the action with Cloudflare error 10007 even though the
deploy succeeds.

## Licence

Apache-2.0. The word lists are public domain; see `public/dict-LICENSE.txt`.
