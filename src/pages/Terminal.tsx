import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrading } from '../hooks/useTrading'
import type { OrderRequest, Position, ProtectionTarget, Timeframe } from '../types/trading'
import { TIMEFRAMES } from '../types/trading'
import ChartPanel from '../components/ChartPanel'
import { ExecutionPalette, ProtectionFields } from '../components/ExecutionPalette'
import { TerminalHeader, Watchlist, Workspace } from '../components/TerminalPanels'
import type { WorkspaceTab } from '../types/trading'
import '../styles/terminal.css'

const THEME_KEY = 'bountiful.theme'

export default function Terminal() {
  const t = useTrading()
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark',
  )
  const [fullscreen, setFullscreen] = useState(false)
  const [watchOpen, setWatchOpen] = useState(false)
  const [wsTab, setWsTab] = useState<WorkspaceTab>('POSITIONS')
  const [target, setTarget] = useState<ProtectionTarget>(null)
  const [activePos, setActivePos] = useState<Position | null>(null)
  const [chartNotice, setChartNotice] = useState<string | null>(null)
  const [winPos, setWinPos] = useState({ x: 0, y: 0 })
  const winRef = useRef<HTMLDivElement>(null)
  const dragWin = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Escape exits chart fullscreen (§8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false)
        else if (target) {
          setTarget(null)
          setActivePos(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, target])

  const noticeSeq = useRef(0)
  useEffect(() => {
    if (!chartNotice) return
    const seq = ++noticeSeq.current
    const id = setTimeout(() => {
      if (noticeSeq.current === seq) setChartNotice(null)
    }, 2200)
    return () => clearTimeout(id)
  }, [chartNotice])

  const quote = t.quotes[t.activeSymbol]
  const position = activePos
    ? (t.positions.find(
        (p) => p.symbol === activePos.symbol && p.side === activePos.side,
      ) ?? activePos)
    : null

  // -------------------------------------------------------------- order flow

  const onSubmit = useCallback(
    async (req: Omit<OrderRequest, 'symbol'>) => {
      await t.executeOrder({ ...req, symbol: t.activeSymbol })
    },
    [t],
  )

  // -------------------------------------------------------------- protection

  const openProtection = useCallback((tg: ProtectionTarget, p: Position) => {
    setActivePos(p)
    setTarget(tg)
    if (tg && window.matchMedia('(orientation: landscape)').matches) {
      // Landscape: park the floating window near the centre of the viewport.
      setWinPos({
        x: Math.max(12, Math.round(window.innerWidth * 0.5 - 130)),
        y: Math.max(12, Math.round(window.innerHeight * 0.25)),
      })
    }
  }, [])

  const commitDrag = useCallback(
    async (p: Position, tg: 'TP' | 'SL', price: number) => {
      const sl = tg === 'SL' ? price : (p.stopLoss ?? null)
      const tp = tg === 'TP' ? price : (p.takeProfit ?? null)
      try {
        await t.applyProtection(p.symbol, sl, tp)
        setChartNotice('Protection modified')
        setTarget(null)
        setActivePos(null)
      } catch {
        /* toast already raised */
      }
    },
    [t],
  )

  const saveProtection = useCallback(
    async (sl: number | null, tp: number | null) => {
      if (!position) return
      await t.applyProtection(position.symbol, sl, tp)
      setChartNotice('Protection modified')
      setTarget(null)
      setActivePos(null)
    },
    [position, t],
  )

  // keep the open protection sheet bound to live position data
  useEffect(() => {
    if (!activePos) return
    const live = t.positions.find(
      (p) => p.symbol === activePos.symbol && p.side === activePos.side,
    )
    if (live) setActivePos(live)
    else {
      setActivePos(null)
      setTarget(null)
    }
  }, [t.positions, activePos])

  // -------------------------------------------------------------- floating window

  const startWinDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    dragWin.current = { dx: e.clientX - winPos.x, dy: e.clientY - winPos.y }
  }

  const moveWin = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragWin.current
    if (!d) return
    e.preventDefault()
    const rect = winRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 260
    const h = rect?.height ?? 150
    setWinPos({
      x: Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - w),
      y: Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - h),
    })
  }

  const endWinDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    dragWin.current = null
  }

  // -------------------------------------------------------------- render

  const chartArea = (
    <div className={`chart-area${fullscreen ? ' fullscreen' : ''}`}>
      <div className="chart-toolbar">
        <div className="tf-row" role="tablist" aria-label="Timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={t.timeframe === tf}
              className={`tf${t.timeframe === tf ? ' on' : ''}`}
              onClick={() => t.setTimeframe(tf as Timeframe)}
            >
              {tf}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="icon-btn fullscreen-btn"
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? 'Exit chart fullscreen' : 'Chart fullscreen'}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen chart'}
        >
          {fullscreen ? '×' : '⛶'}
        </button>
      </div>

      <ChartPanel
        candles={t.candles}
        positions={t.positions}
        theme={theme}
        onGrabLine={openProtection}
        onCommitDrag={commitDrag}
      />

      {quote && (
        <div className="ohlc" aria-hidden>
          O {quote.last.toFixed(2)} · H {quote.high24h?.toFixed(2)} · L {quote.low24h?.toFixed(2)}
        </div>
      )}

      {chartNotice && <div className="chart-notice">{chartNotice}</div>}

      {/* Portrait: the TP/SL palette sits below the execution palette */}
      {!fullscreen && target && position && (
        <div className="protection-dock">
          <ProtectionFields
            position={position}
            target={target}
            onModify={saveProtection}
            onClose={() => {
              void t.closePosition(position.symbol)
              setTarget(null)
              setActivePos(null)
            }}
            onDismiss={() => {
              setTarget(null)
              setActivePos(null)
            }}
          />
        </div>
      )}

      {!fullscreen && (
        <div className="palette-dock">
          <ExecutionPalette
            quote={quote}
            symbol={t.activeSymbol}
            busy={t.busy}
            disabled={t.loading}
            onSubmit={onSubmit}
          />
        </div>
      )}

      {/* Landscape fullscreen: palette floats over the chart */}
      {fullscreen && (
        <div className="palette-float">
          <ExecutionPalette
            quote={quote}
            symbol={t.activeSymbol}
            busy={t.busy}
            disabled={t.loading}
            onSubmit={onSubmit}
          />
        </div>
      )}

      {/* Landscape fullscreen: draggable protection window over the chart */}
      {fullscreen && target && position && (
        <div
          ref={winRef}
          className="protection-window"
          style={{ left: winPos.x, top: winPos.y }}
        >
          <div className="win-grip" onPointerDown={startWinDrag} onPointerMove={moveWin} onPointerUp={endWinDrag}>
            <span className="grip-dots" aria-hidden />
            {position.symbol}
          </div>
          <ProtectionFields
            compact
            position={position}
            target={target}
            onModify={saveProtection}
            onClose={() => {
              void t.closePosition(position.symbol)
              setTarget(null)
              setActivePos(null)
            }}
            onDismiss={() => {
              setTarget(null)
              setActivePos(null)
            }}
          />
        </div>
      )}
    </div>
  )

  return (
    <div className={`terminal${fullscreen ? ' is-fullscreen' : ''}`}>
      <TerminalHeader
        symbol={t.activeSymbol}
        quote={quote}
        balance={t.balance}
        theme={theme}
        paper
        onToggleTheme={() => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))}
        onToggleWatchlist={() => setWatchOpen((o) => !o)}
      />

      <Watchlist
        specs={t.symbols}
        quotes={t.quotes}
        active={t.activeSymbol}
        open={watchOpen}
        onSelect={(s) => {
          t.selectSymbol(s)
          setWatchOpen(false)
        }}
        onClose={() => setWatchOpen(false)}
      />

      <main className="terminal-main">
        {fullscreen ? (
          chartArea
        ) : (
          <>
            {chartArea}
            <Workspace
              tab={wsTab}
              onTab={setWsTab}
              positions={t.positions}
              orders={t.orders}
              journal={t.journal}
              onClosePosition={(s, q) => void t.closePosition(s, q)}
              onCancelOrder={(id) => void t.cancelOrder(id)}
              onEditProtection={(p) => openProtection('SL', p)}
              onSelectSymbol={t.selectSymbol}
            />
          </>
        )}
      </main>

      <div className="toasts" aria-live="polite">
        {t.toasts.map((x) => (
          <div key={x.id} className={`toast ${x.kind}`} onClick={() => t.dismissToast(x.id)}>
            {x.message}
          </div>
        ))}
      </div>
    </div>
  )
}