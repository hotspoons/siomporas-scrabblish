// M1 board lab: a small sandbox to play words by hand and watch the shared
// engine validate and score them. It uses the same rules, dictionary and board
// code as the Worker, so what happens here is what will happen in a game.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { BOARD_SIZE, emptyBoard, isBoardEmpty, premiumAt, premiumLabel, type Board } from '../shared/board.ts'
import { applyPlay, checkPlay, type Placement } from '../shared/rules.ts'
import { createBag, drawTiles, mulberry32, shuffle, type Tile } from '../shared/tiles.ts'
import type { Dictionary } from '../shared/dictionary.ts'
import { loadDictionary } from '../shared/dict-load.ts'

const SLOTS = 7
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

type Slot = Tile | null
interface Pending extends Placement {
  slot: number
}

const cellKey = (row: number, col: number) => `${row},${col}`

export function DebugBoard({ onHome }: { onHome: () => void }) {
  const [dict, setDict] = useState<Dictionary | null>(null)
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [rack, setRack] = useState<Slot[]>(Array(SLOTS).fill(null))
  const [bag, setBag] = useState<Tile[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [blankFor, setBlankFor] = useState('E')
  const [message, setMessage] = useState('Loading the dictionary…')
  const [last, setLast] = useState<Set<string>>(new Set())
  const [score, setScore] = useState(0)
  const [turns, setTurns] = useState(0)

  const start = (seed = 1) => {
    const freshBag = createBag(mulberry32(seed))
    const drawn = drawTiles(freshBag, SLOTS)
    setBoard(emptyBoard())
    setBag(freshBag)
    setRack(Array.from({ length: SLOTS }, (_, i) => drawn[i] ?? null))
    setSelected(null)
    setPending([])
    setLast(new Set())
    setScore(0)
    setTurns(0)
    setMessage('')
  }

  useEffect(() => {
    start(1)
  }, [])

  useEffect(() => {
    let live = true
    loadDictionary()
      .then((d) => {
        if (!live) return
        setDict(d)
        setMessage(`${d.size.toLocaleString()} words loaded. Tap a tile, then a square.`)
      })
      .catch((err) => live && setMessage(String(err?.message ?? err)))
    return () => {
      live = false
    }
  }, [])

  const firstMove = isBoardEmpty(board)
  const placements = pending.map(({ slot, ...p }) => p)

  const preview = useMemo(() => {
    if (!dict || pending.length === 0) return null
    return checkPlay(board, placements, dict, { firstMove })
  }, [dict, board, pending, firstMove])

  const takeBack = (entry: Pending) => {
    setPending((list) => list.filter((p) => p !== entry))
    setRack((slots) => {
      const next = slots.slice()
      next[entry.slot] = entry.blank ? { letter: '?', blank: true } : { letter: entry.letter, blank: false }
      return next
    })
  }

  const clickCell = (row: number, col: number) => {
    if (board[row][col]) return
    const existing = pending.find((p) => p.row === row && p.col === col)
    if (existing) {
      takeBack(existing)
      return
    }
    if (selected === null) {
      setMessage('Tap a tile in your rack first.')
      return
    }
    const tile = rack[selected]
    if (!tile) return
    const blank = !!tile.blank
    setPending((list) => [
      ...list,
      { row, col, letter: blank ? blankFor : tile.letter, blank, slot: selected },
    ])
    setRack((slots) => {
      const next = slots.slice()
      next[selected] = null
      return next
    })
    setSelected(null)
    setMessage('')
  }

  const recall = () => {
    const back = pending.reduce<Slot[]>((slots, p) => {
      const next = slots.slice()
      next[p.slot] = p.blank ? { letter: '?', blank: true } : { letter: p.letter, blank: false }
      return next
    }, rack)
    setRack(back)
    setPending([])
    setMessage('')
  }

  const submit = () => {
    if (!dict || pending.length === 0) return
    const check = checkPlay(board, placements, dict, { firstMove })
    if (!check.ok) {
      setMessage(check.error?.message ?? 'That play is not legal.')
      return
    }
    setBoard(applyPlay(board, check.placements))
    setScore((s) => s + check.total)
    setTurns((t) => t + 1)
    setLast(new Set(check.placements.map((p) => cellKey(p.row, p.col))))
    const empty = rack.filter((slot) => slot === null).length
    const nextBag = bag.slice()
    const drawn = drawTiles(nextBag, empty)
    setBag(nextBag)
    setRack((slots) => {
      const next = slots.slice()
      let i = 0
      for (let s = 0; s < next.length; s++) if (!next[s]) next[s] = drawn[i++] ?? null
      return next
    })
    setPending([])
    setSelected(null)
    setMessage(
      `+${check.total}${check.bingo ? ' — bingo!' : ''} · ${check.words.map((w) => w.word).join(', ')}`,
    )
  }

  const selectedTile = selected !== null ? rack[selected] : null

  return (
    <main class="debug">
      <header class="debug-head">
        <button class="btn small" onClick={onHome}>
          Home
        </button>
        <strong>Board lab</strong>
        <span class="debug-stat">
          {score} pts · {turns} {turns === 1 ? 'turn' : 'turns'} · bag {bag.length}
        </span>
      </header>

      <div class="debug-board" role="group" aria-label="Board">
        {Array.from({ length: BOARD_SIZE }, (_, row) =>
          Array.from({ length: BOARD_SIZE }, (_, col) => {
            const placed = pending.find((p) => p.row === row && p.col === col)
            const cell = board[row][col]
            const premium = premiumAt(row, col)
            const letter = placed ? placed.letter : cell?.letter
            const blank = placed ? !!placed.blank : !!cell?.blank
            const classes = [
              'db-cell',
              premium ? `p-${premium.toLowerCase()}` : '',
              last.has(cellKey(row, col)) ? 'last' : '',
              placed ? 'pending' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                type="button"
                class={classes}
                onClick={() => clickCell(row, col)}
                aria-label={`row ${row + 1} column ${col + 1}${letter ? `, ${letter}${blank ? ' (blank)' : ''}` : premium ? `, ${premiumLabel(premium)}` : ''}`}
              >
                {letter ? (
                  <span class={blank ? 'db-letter blank' : 'db-letter'}>
                    {letter}
                    {blank && <i class="db-blank-mark" />}
                  </span>
                ) : (
                  <span class="db-premium">{premiumLabel(premium)}</span>
                )}
              </button>
            )
          }),
        )}
      </div>

      <div class="db-message" role="status">
        {preview
          ? preview.ok
            ? `+${preview.total}${preview.bingo ? ' bingo' : ''} — ${preview.words.map((w) => w.word).join(', ')}`
            : preview.error?.message
          : message}
      </div>

      <div class="db-rack" role="group" aria-label="Your rack">
        {rack.map((tile, i) => (
          <button
            type="button"
            class={`db-tile${selected === i ? ' selected' : ''}`}
            disabled={!tile}
            onClick={() => setSelected(selected === i ? null : i)}
            aria-label={tile?.blank ? 'Blank tile' : `Tile ${tile?.letter ?? 'empty'}`}
          >
            {tile ? (tile.blank ? '?' : tile.letter) : ''}
          </button>
        ))}
      </div>

      {selectedTile?.blank && (
        <label class="db-blank-pick">
          Blank stands for
          <select value={blankFor} onChange={(e) => setBlankFor((e.target as HTMLSelectElement).value)}>
            {LETTERS.map((l) => (
              <option value={l}>{l}</option>
            ))}
          </select>
        </label>
      )}

      <div class="db-controls">
        <button class="btn small" onClick={() => setRack((slots) => shuffle(slots, Math.random))}>
          Shuffle
        </button>
        <button class="btn small" onClick={recall} disabled={pending.length === 0}>
          Recall
        </button>
        <button class="btn primary small" onClick={submit} disabled={!preview?.ok}>
          Play word
        </button>
        <button class="btn small" onClick={() => start(Math.floor(Math.random() * 1e9))}>
          New
        </button>
      </div>
    </main>
  )
}
