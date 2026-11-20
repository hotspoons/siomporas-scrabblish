import { useState } from 'preact/hooks'

export function App() {
  const [tab, setTab] = useState<'home' | 'rules'>('home')
  return (
    <div class="app">
      {tab === 'home' ? (
        <main class="menu">
          <header class="brand">
            <h1>Scrabbleish</h1>
            <p class="tagline">A calm word game for family. No ads, no clock, no rush.</p>
          </header>
          <div class="menu-actions">
            <button class="btn primary big" onClick={() => alert('The board arrives in the next update.')}>
              New game
            </button>
            <button class="btn big" onClick={() => setTab('rules')}>
              Rules
            </button>
          </div>
        </main>
      ) : (
        <main class="menu">
          <header class="brand">
            <h1>Rules</h1>
          </header>
          <p class="tagline">
            Build words across the board like a crossword. The first word crosses the middle. Every
            later word must touch one already on the board.
          </p>
          <button class="btn big" onClick={() => setTab('home')}>
            Back
          </button>
        </main>
      )}
    </div>
  )
}
