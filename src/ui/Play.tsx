// A whole game of Scrabbleish against the robot, on this device, offline.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { BOARD_SIZE, isBoardEmpty, premiumAt, premiumLabel } from '../shared/board.ts'
import { checkPlay, type Placement } from '../shared/rules.ts'
import type { Dictionary } from '../shared/dictionary.ts'
import { BOT_LEVELS, type WordTiers } from '../shared/bot.ts'
import {
  botTurn,
  canEndGame,
  clearLocalGame,
  createLocalGame,
  describeLastMove,
  endLocalGame,
  humanExchange,
  humanPass,
  humanPlay,
  loadLocalGame,
  remainingTiles,
  saveLocalGame,
  setPending,
  type LocalGame,
} from '../shared/local-game.ts'
import { mulberry32, shuffle, type Tile } from '../shared/tiles.ts'
import { startTileGesture, tileClicksSuppressed } from './tile-drag.ts'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

interface Props {
  dict: Dictionary
  tiers: WordTiers | null
  startGame: LocalGame | null
  fast?: boolean
  onHome: () => void
  onNewGame: () => void
}

const cellFrom = (el: HTMLElement): { row: number; col: number } | null => {
  const raw = el.dataset.cell
  if (!raw) return null
  const [row, col] = raw.split(',').map(Number)
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

export function Play({ dict, tiers, startGame, fast, onHome, onNewGame }: Props) {
  const [game, setGame] = useState<LocalGame>(
    () => startGame ?? loadLocalGame() ?? createLocalGame(Math.floor(Math.random() * 1e9), 1),
  )
  const [selected, setSelected] = useState<number | null>(null)
  const [blankFor, setBlankFor] = useState('E')
  const [exchangeMode, setExchangeMode] = useState(false)
  const [exchangeSel, setExchangeSel] = useState<Set<number>>(new Set())
  const [confirmPass, setConfirmPass] = useState(false)
  const [message, setMessage] = useState('')
  const [salt, setSalt] = useState(0)

  useEffect(() => {
    if (game.status === 'active') saveLocalGame(game)
    else clearLocalGame()
  }, [game])

  // The robot takes its turn after a short, calm pause.
  useEffect(() => {
    if (!dict || game.status !== 'active' || game.turn !== 1) return
    const timer = setTimeout(
      () =>
        setGame((g) =>
          g.status === 'active' && g.turn === 1
            ? botTurn(g, { dict, tiers, rand: mulberry32(g.seed ^ g.version ^ 0x2545f491) })
            : g,
        ),
      fast ? 40 : 700,
    )
    return () => clearTimeout(timer)
  }, [dict, tiers, game.turn, game.status, game.version, fast])

  const firstMove = isBoardEmpty(game.board)
  const left = remainingTiles(game.racks[0], game.pending) ?? []
  const source: Array<{ tile: Tile; index: number }> = (exchangeMode ? game.racks[0] : left).map((tile, index) => ({
    tile,
    index,
  }))
  const displayed = shuffle(source, mulberry32(salt + 1))
  const selectedTile = selected !== null ? (displayed[selected]?.tile ?? null) : null
  const pendingBlank = game.pending.some((p) => p.blank)

  const preview = useMemo(() => {
    if (game.pending.length === 0) return null
    return checkPlay(game.board, game.pending, dict, { firstMove })
  }, [game.board, game.pending, dict, firstMove])

  const myTurn = game.status === 'active' && game.turn === 0

  const toggleSelect = (index: number) => {
    setSelected(selected === index ? null : index)
    setMessage('')
    setConfirmPass(false)
  }

  const placeTile = (tile: Tile, row: number, col: number) => {
    if (!myTurn || exchangeMode) return
    if (game.board[row][col]) return
    if (game.pending.some((p) => p.row === row && p.col === col)) return
    const placement: Placement = {
      row,
      col,
      letter: tile.blank ? blankFor : tile.letter,
      blank: !!tile.blank,
    }
    setGame(setPending(game, [...game.pending, placement]))
    setSelected(null)
    setMessage('')
    setConfirmPass(false)
  }

  const removePending = (p: Placement) => {
    setGame(setPending(game, game.pending.filter((x) => !(x.row === p.row && x.col === p.col))))
    setSelected(null)
    setMessage('')
  }

  /** The empty squares a tile can be dropped on right now. */
  const emptyCells = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.play-board .db-cell')).filter((el) => {
      const cell = cellFrom(el)
      if (!cell) return false
      if (game.board[cell.row][cell.col]) return false
      return !game.pending.some((p) => p.row === cell.row && p.col === cell.col)
    })

  const onRackPointerDown = (event: PointerEvent, displayIndex: number) => {
    if (!myTurn || exchangeMode) return
    const tile = displayed[displayIndex]?.tile
    if (!tile) return
    startTileGesture({
      event,
      ghost: { label: tile.blank ? '?' : tile.letter, blank: !!tile.blank },
      targets: emptyCells(),
      onTap: () => toggleSelect(displayIndex),
      onDrop: (target) => {
        const cell = cellFrom(target)
        if (cell) placeTile(tile, cell.row, cell.col)
      },
    })
  }

  const onPendingPointerDown = (event: PointerEvent, p: Placement) => {
    if (!myTurn || exchangeMode) return
    const targets = emptyCells()
    const rackEl = document.querySelector<HTMLElement>('.db-rack')
    if (rackEl) targets.push(rackEl)
    startTileGesture({
      event,
      ghost: { label: p.letter, blank: !!p.blank },
      targets,
      onTap: () => removePending(p),
      onDrop: (target) => {
        if (target.hasAttribute('data-rack')) {
          removePending(p)
          return
        }
        const cell = cellFrom(target)
        if (!cell) return
        setGame(
          setPending(
            game,
            game.pending.map((x) =>
              x.row === p.row && x.col === p.col ? { ...x, row: cell.row, col: cell.col } : x,
            ),
          ),
        )
        setSelected(null)
        setMessage('')
        setConfirmPass(false)
      },
    })
  }

  const place = (row: number, col: number) => {
    if (tileClicksSuppressed()) return
    if (!myTurn || exchangeMode) return
    if (game.board[row][col]) return
    const existing = game.pending.find((p) => p.row === row && p.col === col)
    if (existing) {
      removePending(existing)
      return
    }
    if (selected === null) {
      setMessage('Tap a tile first.')
      return
    }
    const tile = displayed[selected]?.tile
    if (tile) placeTile(tile, row, col)
  }

  const recall = () => {
    setGame(setPending(game, []))
    setSelected(null)
    setMessage('')
  }

  const submit = () => {
    const result = humanPlay(game, game.pending, dict)
    if (result.error) {
      setMessage(result.error)
      return
    }
    setGame(result.game)
    setSelected(null)
    setMessage('')
  }

  const pass = () => {
    if (!confirmPass) {
      setConfirmPass(true)
      setMessage('Tap Pass again to end your turn.')
      return
    }
    const result = humanPass(game)
    setConfirmPass(false)
    setSelected(null)
    setMessage(result.error ?? '')
    if (!result.error) setGame(result.game)
  }

  const enterExchange = () => {
    setGame(setPending(game, []))
    setExchangeMode(true)
    setExchangeSel(new Set())
    setSelected(null)
    setConfirmPass(false)
    setMessage('')
  }

  const confirmExchange = () => {
    const result = humanExchange(game, [...exchangeSel])
    if (result.error) {
      setMessage(result.error)
      return
    }
    setGame(result.game)
    setExchangeMode(false)
    setExchangeSel(new Set())
    setMessage('')
  }

  const endEarly = () => {
    setGame(endLocalGame(game))
    setMessage('')
  }

  const lastLine = describeLastMove(game)
  const cfg = BOT_LEVELS[game.difficulty]

  if (game.status === 'done') {
    const won = game.scores[0] > game.scores[1]
    const tied = game.scores[0] === game.scores[1]
    return (
      <main class="play over">
        <h1>{tied ? 'A tie' : won ? 'You won' : 'The robot won'}</h1>
        <p class="play-final">
          You {game.scores[0]} · Robot {game.scores[1]}
        </p>
        <p class="play-note">
          {game.endReason === 'out_of_tiles'
            ? 'The bag is empty and one player has used every tile.'
            : 'You ended this game early.'}
        </p>
        <div class="play-actions">
          <button class="btn primary big" onClick={onNewGame}>
            New game
          </button>
          <button class="btn big" onClick={onHome}>
            Home
          </button>
        </div>
      </main>
    )
  }

  return (
    <main class="play">
      <header class="play-head">
        <button class="btn small" onClick={onHome} aria-label="Home">
          Home
        </button>
        <div class="play-score">
          <span class={game.turn === 0 ? 'active' : ''}>You {game.scores[0]}</span>
          <span class="dash">·</span>
          <span class={game.turn === 1 ? 'active' : ''}>Robot {game.scores[1]}</span>
        </div>
        <button class="btn small" onClick={onHome} aria-label="Menu">
          Menu
        </button>
      </header>

      <div class="play-status" role="status">
        <span>{myTurn ? 'Your move' : 'Robot is thinking…'}</span>
        <span class="play-meta">
          {cfg.name} · bag {game.bag.length} · robot has {game.racks[1].length}
        </span>
      </div>

      <div class="play-board" role="group" aria-label="Board">
        {Array.from({ length: BOARD_SIZE }, (_, row) =>
          Array.from({ length: BOARD_SIZE }, (_, col) => {
            const placed = game.pending.find((p) => p.row === row && p.col === col)
            const cell = game.board[row][col]
            const premium = premiumAt(row, col)
            const letter = placed ? placed.letter : cell?.letter
            const blank = placed ? !!placed.blank : !!cell?.blank
            const isLast = game.lastMove?.cells.some((c) => c.row === row && c.col === col) ?? false
            const classes = [
              'db-cell',
              premium ? `p-${premium.toLowerCase()}` : '',
              isLast ? 'last' : '',
              placed ? 'pending' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                type="button"
                class={classes}
                data-cell={`${row},${col}`}
                onClick={() => place(row, col)}
                onPointerDown={(e) => {
                  if (placed) onPendingPointerDown(e, placed)
                }}
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

      <div class="play-message" role="status">
        {exchangeMode
          ? exchangeSel.size > 0
            ? `Exchange ${exchangeSel.size} ${exchangeSel.size === 1 ? 'tile' : 'tiles'}`
            : 'Tap the tiles you want to exchange.'
          : confirmPass
            ? message
            : preview
            ? preview.ok
              ? `+${preview.total}${preview.bingo ? ' bingo' : ''} — ${preview.words.map((w) => w.word).join(', ')}`
              : preview.error?.message
            : message || lastLine || 'Tap or drag a tile onto a square.'}
      </div>

      <div class="db-rack" role="group" aria-label="Your rack" data-rack="">
        {displayed.map(({ tile, index }, i) => (
          <button
            type="button"
            class={[
              'db-tile',
              !exchangeMode && selected === i ? 'selected' : '',
              exchangeMode && exchangeSel.has(index) ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerDown={(e) => onRackPointerDown(e, i)}
            onClick={(e) => {
              if (e.detail !== 0 && tileClicksSuppressed()) return
              if (exchangeMode) {
                setExchangeSel((set) => {
                  const next = new Set(set)
                  if (next.has(index)) next.delete(index)
                  else next.add(index)
                  return next
                })
              } else {
                setSelected(selected === i ? null : i)
                setMessage('')
              }
            }}
            aria-label={tile.blank ? 'Blank tile' : `Tile ${tile.letter}`}
            aria-pressed={!exchangeMode && selected === i}
          >
            {tile.blank ? '?' : tile.letter}
          </button>
        ))}
      </div>

      {(selectedTile?.blank || pendingBlank) && !exchangeMode && (
        <label class="db-blank-pick">
          Blank stands for
          <select
            value={blankFor}
            onChange={(e) => {
              const letter = (e.target as HTMLSelectElement).value
              setBlankFor(letter)
              // A blank dropped by dragging never had a turn in the picker.
              if (selectedTile?.blank || !pendingBlank) return
              let last = -1
              game.pending.forEach((p, i) => {
                if (p.blank) last = i
              })
              if (last >= 0) {
                setGame(
                  setPending(
                    game,
                    game.pending.map((p, i) => (i === last ? { ...p, letter } : p)),
                  ),
                )
              }
            }}
          >
            {LETTERS.map((l) => (
              <option value={l}>{l}</option>
            ))}
          </select>
        </label>
      )}

      <div class="play-controls">
        {exchangeMode ? (
          <>
            <button
              class="btn small"
              onClick={() => {
                setExchangeMode(false)
                setExchangeSel(new Set())
              }}
            >
              Cancel
            </button>
            <button class="btn primary small" onClick={confirmExchange} disabled={exchangeSel.size === 0}>
              Exchange
            </button>
          </>
        ) : (
          <>
            <button class="btn small" onClick={() => setSalt((s) => s + 1)} disabled={!myTurn}>
              Shuffle
            </button>
            <button class="btn small" onClick={recall} disabled={game.pending.length === 0}>
              Recall
            </button>
            <button class="btn small" onClick={enterExchange} disabled={!myTurn}>
              Exchange
            </button>
            <button class="btn small" onClick={pass} disabled={!myTurn}>
              {confirmPass ? 'Pass?' : 'Pass'}
            </button>
            <button class="btn primary small" onClick={submit} disabled={!myTurn || !preview?.ok}>
              Play word
            </button>
          </>
        )}
      </div>

      {canEndGame(game) && (
        <button class="btn subtle" onClick={endEarly}>
          End this game
        </button>
      )}
    </main>
  )
}
