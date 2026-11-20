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
npm test           # rules, scoring, move generation, robot, and game-state tests
npm run dict       # rebuild the word lists and frequency tiers from the source lists
```

Checks against a running preview or the live site:

```bash
npm run m0 -- --url http://localhost:4173/   # shell installs and opens offline
npm run m1 -- --url http://localhost:4173/   # board lab plays an engine move, offline too
npm run m2 -- --url 'http://localhost:4173/?bag=21&fast=1'   # robot game, restart, offline
```

`?bag=` and `?fast=` are test conveniences: a smaller tile bag finishes a game
quickly, and `fast` shortens the robot's thinking pause. They do not change the
rules or the robot's choices.

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
| `bot.ts` | The five robot levels, its vocabulary and move choice |
| `local-game.ts` | One whole off-line game: turns, refills, exchange, finish, storage |
| `dict-load.ts` | Loads the vendored list and tiers once (precached, so offline works) |

The **Board lab** on the home screen is the manual playground: tap a rack tile, tap a
square, see the score preview and any friendly rule message, then play the word. It
uses the exact code the server will use.

**M2 — the robot.** New game asks how hard the robot should play, then the whole
game happens on the phone. Tap a rack tile then a square, or drag the tile into
place; see the words and score before committing. Placed tiles can be dragged to a
new square or back to the rack. On a scrolling screen a quick swipe pans the board,
while resting a finger picks a tile up — the same gesture model as the solitaire. The screen shows both scores,
whose turn it is, the tiles left in the bag, and how many tiles the robot holds —
never which ones. Shuffle, recall, exchange, pass, blanks, bingo scoring, the last
move outline, and a calm finish screen are all there. The game, including a
half-placed word, is saved to `localStorage` on every change, so closing the tab or
restarting the phone resumes exactly where it was. Everything except installing the
app works offline.

| Level | Name | Vocabulary | Length | Style |
|---|---|---|---|---|
| 1 | Gentle | 2,000 common words | 3–5 | sometimes passes or exchanges |
| 2 | Easy | 2,000 common words | 3–6 | a little longer |
| 3 | Steady | 20,000 common words | 2–8 | takes good squares now and then |
| 4 | Strong | full list | any | finds long words and bingos |
| 5 | Sharp | full list | any | best move it can find, and blocks premiums |

The robot is given only the board, its own rack, and the number of tiles in the
bag. It never sees the bag's contents or the player's rack, so it cannot cheat.
Difficulty comes from vocabulary, word length, top-K sampling with a temperature,
pass/exchange likelihood, bingo permission, and how much it values denying premium
squares. `src/shared/bot.test.ts` plays seeded games and asserts that the mean score
rises with each level and that level 5 beats level 1.

### The word lists

`public/dict.txt` is ENABLE (public domain), filtered to the 168,551 words that are
2–15 letters and playable on the board. `public/tier-2k.txt` and
`public/tier-20k.txt` are the most frequent 2,000 and 20,000 of the 25,298-word
common subset, ranked with Peter Norvig's `count_1w`. All are built by
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
