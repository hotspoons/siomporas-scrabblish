import { useEffect, useState } from 'preact/hooks'
import { DebugBoard } from './ui/DebugBoard.tsx'
import { Play } from './ui/Play.tsx'
import { loadDictionary, loadTiers } from './shared/dict-load.ts'
import type { Dictionary } from './shared/dictionary.ts'
import { BOT_LEVELS, levelChoices, type BotLevel, type WordTiers } from './shared/bot.ts'
import {
  clearLocalGame,
  createLocalGame,
  loadLocalGame,
  type LocalGame,
} from './shared/local-game.ts'

type Tab = 'home' | 'rules' | 'board' | 'pick' | 'play'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
}

function testOptions(): { fast: boolean; bagSize?: number; seed?: number } {
  if (typeof location === 'undefined') return { fast: false }
  const params = new URLSearchParams(location.search)
  const bag = Number(params.get('bag'))
  const seed = Number(params.get('seed'))
  return {
    fast: params.get('fast') === '1',
    bagSize: Number.isFinite(bag) && bag > 14 ? bag : undefined,
    seed: Number.isFinite(seed) && seed > 0 ? seed : undefined,
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [dict, setDict] = useState<Dictionary | null>(null)
  const [tiers, setTiers] = useState<WordTiers | null>(null)
  const [dictError, setDictError] = useState('')
  const [saved, setSaved] = useState<LocalGame | null>(() => loadLocalGame())
  const [startGame, setStartGame] = useState<LocalGame | null>(null)
  const [gameKey, setGameKey] = useState(0)
  const [install, setInstall] = useState<InstallPrompt | null>(null)
  const options = testOptions()

  useEffect(() => {
    let alive = true
    loadDictionary()
      .then((d) => alive && setDict(d))
      .catch((err) => alive && setDictError(String(err?.message ?? err)))
    loadTiers()
      .then((t) => alive && setTiers(t))
      .catch(() => {
        // The word tiers are a nicety for the gentler robots. If they fail to
        // load, play continues with the full dictionary.
        alive && setTiers(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstall(event as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const goHome = () => {
    setSaved(loadLocalGame())
    setStartGame(null)
    setTab('home')
  }

  const begin = (level: BotLevel) => {
    if (!dict) return
    clearLocalGame()
    const seed = options.seed ?? Math.floor(Math.random() * 1e9) + 1
    setStartGame(createLocalGame(seed, level, { bagSize: options.bagSize }))
    setGameKey((k) => k + 1)
    setSaved(null)
    setTab('play')
  }

  const continueGame = () => {
    setStartGame(null)
    setGameKey((k) => k + 1)
    setTab('play')
  }

  if (tab === 'board') return <DebugBoard onHome={goHome} />

  if (tab === 'play') {
    if (!dict) {
      return (
        <main class="menu">
          <h1>Getting ready…</h1>
          <p class="tagline">{dictError || 'Fetching the word list.'}</p>
          <button class="btn big" onClick={goHome}>
            Back
          </button>
        </main>
      )
    }
    return (
      <Play
        key={gameKey}
        dict={dict}
        tiers={tiers}
        startGame={startGame}
        fast={options.fast}
        onHome={goHome}
        onNewGame={() => setTab('pick')}
      />
    )
  }

  if (tab === 'pick') {
    return (
      <main class="menu picker">
        <header class="brand">
          <h1>How should the robot play?</h1>
          <p class="tagline">You can change this in a new game whenever you like.</p>
        </header>
        <div class="levels">
          {levelChoices().map((level) => (
            <button
              key={level.level}
              class="btn level"
              disabled={!dict}
              onClick={() => begin(level.level)}
            >
              <span class="level-num">{level.level}</span>
              <span class="level-text">
                <strong>{level.name}</strong>
                <small>{level.blurb}</small>
              </span>
            </button>
          ))}
        </div>
        {!dict && <p class="tagline">{dictError || 'Getting the dictionary ready…'}</p>}
        <button class="btn big" onClick={goHome}>
          Back
        </button>
      </main>
    )
  }

  if (tab === 'rules') {
    return (
      <main class="menu rules">
        <header class="brand">
          <h1>Rules</h1>
          <p class="tagline">A calm game of crosswords. Take all the time you need.</p>
        </header>
        <section class="rules-body">
          <h2>Your turn</h2>
          <p>
            Tap a tile on your rack, then tap a square on the board. Build a word across or down.
            The first word must cover the gold middle square. Every word after that must touch a
            word already on the board.
          </p>
          <p>
            When the word looks right, tap <strong>Play word</strong>. The preview above your rack
            shows the score and the words you are making before you commit. Changed your mind? Tap{' '}
            <strong>Recall</strong> to put the tiles back.
          </p>
          <h2>Scoring</h2>
          <p>
            Each letter is worth its number. Coloured squares double or triple a letter, or the
            whole word. A double word square under one of your new tiles doubles the word once;
            two of them multiply together. Using all seven tiles in one turn is a <em>bingo</em>{' '}
            and adds 50 points.
          </p>
          <h2>Passing and exchanging</h2>
          <p>
            If you cannot find a word, you may pass, or exchange some tiles for new ones while the
            bag has at least seven tiles. Passing ends your turn; six quiet turns in a row lets you
            finish the game early.
          </p>
          <h2>Blanks</h2>
          <p>
            A blank tile (shown as <strong>?</strong>) can stand for any letter. Choose the letter
            before you place it. Blanks score zero.
          </p>
          <h2>The end</h2>
          <p>
            The game ends when the bag is empty and one player has used every tile. That player
            gains the value of the other player's remaining tiles, and the other player loses it.
          </p>
        </section>
        <button class="btn big" onClick={goHome}>
          Back
        </button>
      </main>
    )
  }

  return (
    <div class="app">
      <main class="menu">
        <header class="brand">
          <h1>Scrabbleish</h1>
          <p class="tagline">A calm word game for family. No ads, no clock, no rush.</p>
        </header>
        <div class="menu-actions">
          {saved && (
            <button class="btn primary big continue" onClick={continueGame}>
              <span>Continue game</span>
              <small>
                You {saved.scores[0]} · Robot {saved.scores[1]} · {BOT_LEVELS[saved.difficulty].name}
              </small>
            </button>
          )}
          <button class="btn big" onClick={() => setTab('pick')}>
            New game
          </button>
          <button class="btn big" onClick={() => setTab('rules')}>
            Rules
          </button>
          {install && (
            <button
              class="btn big"
              onClick={async () => {
                await install.prompt()
                setInstall(null)
              }}
            >
              Install
            </button>
          )}
          <button class="btn subtle" onClick={() => setTab('board')}>
            Board lab
          </button>
        </div>
      </main>
    </div>
  )
}
