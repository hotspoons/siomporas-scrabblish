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
npm test           # rules/scoring/dictionary tests (node --test)
```

## Deploy

A Cloudflare Worker serves both the built app and the game API, with D1 for online
games. Pushing to `main` builds, tests, migrates and deploys through
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers Scripts: Edit, D1: Edit; on the siomporas.com zone: Zone: Read, DNS: Edit, Workers Routes: Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → account id |

The first deploy creates the `scrabbleish` D1 database and writes its id into
`wrangler.jsonc` before deploying; later runs reuse it.

## Licence

Apache-2.0.
