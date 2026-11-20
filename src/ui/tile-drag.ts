// Tile dragging for the play screen, ported from the solitaire board.
//
// One path for mouse and touch. A mouse drags as soon as it moves. A finger
// on a scrolling screen may swipe to pan, or rest briefly and then drag a
// tile. The floating tile is a small element attached to <body>, so it follows
// the pointer no matter how the play screen is scrolled or centred. The real
// tile is hidden beneath it, and the square under the pointer lights up.
export interface TileGhost {
  label: string
  blank: boolean
}

let suppressUntil = 0

/** A drag ends with a pointerup that browsers also turn into a click. Ignore that click. */
export function suppressTileClicks(ms = 400): void {
  suppressUntil = performance.now() + ms
}

export function tileClicksSuppressed(): boolean {
  return performance.now() < suppressUntil
}

export interface TileGesture {
  event: PointerEvent
  /** null means the source cannot be dragged; taps still work. */
  ghost: TileGhost | null
  /** the squares (and rack) this tile may be dropped on */
  targets: HTMLElement[]
  /** a gentle tap: select a rack tile, or take a placed tile back */
  onTap: () => void
  /** the tile was dragged and released on one of `targets` */
  onDrop: (target: HTMLElement) => void
}

const DRAG_THRESHOLD = 5
// A little longer than the solitaire original: a calm, slow tap should not
// flicker a ghost before it becomes a selection.
const HOLD_MS = 180
const EDGE = 48

const targetAt = (x: number, y: number): HTMLElement | null =>
  (document.elementFromPoint(x, y)?.closest('[data-cell],[data-rack]') as HTMLElement | null) ?? null

export function startTileGesture({ event, ghost, targets, onTap, onDrop }: TileGesture): void {
  const e = event
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const sourceEl = e.currentTarget as HTMLElement
  const scrollEl = sourceEl.closest('.play') as HTMLElement | null
  const rect = sourceEl.getBoundingClientRect()
  const ox = e.clientX - rect.left
  const oy = e.clientY - rect.top
  const startX = e.clientX
  const startY = e.clientY
  const pointerId = e.pointerId
  const touch = e.pointerType !== 'mouse'
  const scrollable = touch && !!scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 1
  const panTop = scrollEl?.scrollTop ?? 0
  const panLeft = scrollEl?.scrollLeft ?? 0

  let mode: 'idle' | 'drag' | 'pan' = 'idle'
  let lastX = startX
  let lastY = startY
  let intentX = 0
  let intentY = 0
  let hovered: HTMLElement | null = null
  let layer: HTMLDivElement | null = null
  let ghostEl: HTMLDivElement | null = null
  let finished = false
  let moved = false
  let holdTimer = 0
  let raf = 0

  const moveGhost = (x: number, y: number): void => {
    if (layer) layer.style.transform = `translate3d(${x - ox}px, ${y - oy}px, 0)`
  }

  const paint = (x: number, y: number): void => {
    const next = targetAt(x, y)
    const nextTarget = next && next.classList.contains('drag-target') ? next : null
    if (next !== hovered) {
      hovered?.classList.remove('drop-hover')
      hovered = next
      nextTarget?.classList.add('drop-hover')
    }
    ghostEl?.classList.toggle('over', !!nextTarget)
    moveGhost(x, y)
  }

  const canPan = (dy: number): boolean => {
    if (!scrollEl) return false
    if (dy < 0) return scrollEl.scrollTop < scrollEl.scrollHeight - scrollEl.clientHeight - 1
    return scrollEl.scrollTop > 0
  }

  const pan = (ev: PointerEvent): void => {
    if (!scrollEl) return
    scrollEl.scrollTop = panTop - (ev.clientY - startY)
    scrollEl.scrollLeft = panLeft - (ev.clientX - startX)
  }

  // Dragging near an edge scrolls the screen, so a square just out of view can
  // still be reached without letting go of the tile. Only the edge the finger
  // is travelling toward scrolls, so a drag never rewinds the board underfoot.
  const autoScroll = (): void => {
    if (mode !== 'drag' || !scrollEl) return
    const r = scrollEl.getBoundingClientRect()
    const step = (d: number) => Math.max(2, Math.round(d / 4))
    let dx = 0
    let dy = 0
    if (lastX < r.left + EDGE && intentX < 0) dx = -step(r.left + EDGE - lastX)
    else if (lastX > r.right - EDGE && intentX > 0) dx = step(lastX - (r.right - EDGE))
    if (lastY < r.top + EDGE && intentY < 0) dy = -step(r.top + EDGE - lastY)
    else if (lastY > r.bottom - EDGE && intentY > 0) dy = step(lastY - (r.bottom - EDGE))
    if (dx !== 0 || dy !== 0) {
      scrollEl.scrollLeft += dx
      scrollEl.scrollTop += dy
      paint(lastX, lastY)
    }
    raf = requestAnimationFrame(autoScroll)
  }

  const activate = (x: number, y: number): void => {
    if (!ghost) return
    mode = 'drag'
    sourceEl.classList.add('drag-src')
    for (const target of targets) target.classList.add('drag-target')
    layer = document.createElement('div')
    layer.className = 'tile-drag-layer'
    layer.setAttribute('aria-hidden', 'true')
    layer.style.width = `${rect.width}px`
    layer.style.height = `${rect.height}px`
    ghostEl = document.createElement('div')
    ghostEl.className = `db-tile drag-ghost${ghost.blank ? ' blank' : ''}`
    ghostEl.style.fontSize = `${Math.round(rect.height * 0.48)}px`
    ghostEl.textContent = ghost.label
    if (ghost.blank) {
      const mark = document.createElement('i')
      mark.className = 'db-blank-mark'
      ghostEl.appendChild(mark)
    }
    layer.appendChild(ghostEl)
    document.body.appendChild(layer)
    moveGhost(x, y)
    paint(x, y)
    raf = requestAnimationFrame(autoScroll)
  }

  // Resting a finger on a tile arms the drag. A finger that starts moving
  // first is panning the screen, not picking anything up.
  if (touch && ghost && scrollable) {
    holdTimer = window.setTimeout(() => {
      holdTimer = 0
      if (mode === 'idle' && !finished) activate(startX, startY)
    }, HOLD_MS)
  }

  const onMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== pointerId || finished) return
    const mx = ev.clientX - lastX
    const my = ev.clientY - lastY
    if (Math.abs(mx) > 0.5) intentX = Math.sign(mx)
    if (Math.abs(my) > 0.5) intentY = Math.sign(my)
    lastX = ev.clientX
    lastY = ev.clientY

    if (mode === 'pan') {
      pan(ev)
      return
    }
    if (mode === 'idle') {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.hypot(dx, dy) < (touch ? 10 : DRAG_THRESHOLD)) return
      // On a screen that scrolls, a quick vertical swipe is always a scroll.
      // Picking a tile up vertically takes a short rest on it (above), so the
      // two gestures never fight over the same movement.
      if (scrollable && Math.abs(dy) > Math.abs(dx)) {
        mode = 'pan'
        window.clearTimeout(holdTimer)
        holdTimer = 0
        if (canPan(dy)) pan(ev)
        return
      }
      if (!ghost) return
      activate(ev.clientX, ev.clientY)
      moved = true
      return
    }
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) moved = true
    paint(lastX, lastY)
  }

  const teardown = (): void => {
    window.clearTimeout(holdTimer)
    holdTimer = 0
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    sourceEl.classList.remove('drag-src')
    document.querySelectorAll('.drag-target').forEach((el) => el.classList.remove('drag-target'))
    hovered?.classList.remove('drop-hover')
    hovered = null
    layer?.remove()
    layer = null
    ghostEl = null
  }

  const onUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== pointerId || finished) return
    finished = true
    const was = mode
    // Resolve the landing before teardown removes the target lights.
    const px = ev.clientX || lastX
    const py = ev.clientY || lastY
    const landing = was === 'drag' && moved ? targetAt(px, py) : null
    const valid = !!landing && landing.classList.contains('drag-target')
    teardown()
    if (was === 'pan') {
      suppressTileClicks()
      return
    }
    if (was !== 'drag' || !moved) {
      // A hold that never became a drag is still a tap. The source may be
      // hidden now, so a real click cannot be relied on here.
      if (was === 'drag') {
        suppressTileClicks()
        onTap()
      }
      return
    }
    suppressTileClicks()
    if (valid && landing) onDrop(landing)
  }

  const onCancel = (ev: PointerEvent): void => {
    if (ev.pointerId !== pointerId || finished) return
    finished = true
    teardown()
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}
