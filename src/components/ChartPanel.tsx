import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  LineStyle,
} from 'lightweight-charts'
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  MouseEventParams,
  UTCTimestamp,
} from 'lightweight-charts'
import type { Candle, Position, ProtectionTarget } from '../types/trading'

interface Props {
  candles: Candle[]
  positions: Position[]
  theme: 'dark' | 'light'
  onGrabLine: (target: ProtectionTarget, position: Position) => void
  onCommitDrag: (position: Position, target: 'TP' | 'SL', price: number) => void
}

export const TP_COLOR = '#22c55e'
export const SL_COLOR = '#ef4444'
const ENTRY_COLOR = '#64748b'
const LIQ_COLOR = '#f59e0b'

type LineTarget = 'TP' | 'SL' | 'ENTRY' | 'LIQ'

interface DrawnLine {
  key: string
  target: LineTarget
  position: Position
  price: number
  line: IPriceLine
}

interface HandleState {
  key: string
  target: 'TP' | 'SL'
  position: Position
  price: number
  y: number
  dragging: boolean
}

export default function ChartPanel({
  candles,
  positions,
  theme,
  onGrabLine,
  onCommitDrag,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const drawnRef = useRef<DrawnLine[]>([])
  const crosshairPriceRef = useRef<number | null>(null)
  const dragRef = useRef<{
    key: string
    target: 'TP' | 'SL'
    position: Position
    startY: number
    moved: number
    price: number
  } | null>(null)
  const candlesRef = useRef<Candle[]>([])
  const [handles, setHandles] = useState<HandleState[]>([])

  // -------------------------------------------------------------- chart setup

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.06)' },
        horzLines: { color: 'rgba(148,163,184,0.06)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148,163,184,0.2)',
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        borderColor: 'rgba(148,163,184,0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(148,163,184,0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#334155',
        },
        horzLine: {
          color: 'rgba(148,163,184,0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#334155',
        },
      },
      autoSize: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    seriesRef.current = series

    const onMove = (param: MouseEventParams) => {
      const data = param.seriesData?.get(series)
      if (data && 'close' in data && typeof data.close === 'number') {
        crosshairPriceRef.current = data.close
      } else {
        crosshairPriceRef.current = null
      }
    }

    chart.subscribeCrosshairMove(onMove)

    // Re-project handle Y positions whenever the chart resizes or scrolls.
    const sync = () => {
      setHandles((prev) =>
        prev.map((h) => ({ ...h, y: series.priceToCoordinate(h.price) ?? -1 })),
      )
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(sync)

    const ro = new ResizeObserver(sync)
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.unsubscribeCrosshairMove(onMove)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(sync)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      drawnRef.current = []
    }
  }, [])

  // -------------------------------------------------------------- theme

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { textColor: theme === 'dark' ? '#94a3b8' : '#475569' },
      grid: {
        vertLines: { color: theme === 'dark' ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.07)' },
        horzLines: { color: theme === 'dark' ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.07)' },
      },
    })
  }, [theme])

  // -------------------------------------------------------------- candle data

  useEffect(() => {
    candlesRef.current = candles
  }, [candles])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || candles.length === 0) return
    const data = candles
      .map((c) => ({
        time: Math.floor(c.time) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    if (data.length === 0) return
    try {
      series.setData(data)
    } catch {
      /* a malformed bar must never take the terminal down */
    }
  }, [candles])

  // -------------------------------------------------------------- position lines

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    for (const l of drawnRef.current) {
      try {
        series.removePriceLine(l.line)
      } catch {
        /* already removed */
      }
    }
    drawnRef.current = []

    const next: HandleState[] = []

    for (const pos of positions) {
      const base = `${pos.symbol}-${pos.side}`
      const add = (target: LineTarget, price: number | undefined, color: string, style: LineStyle) => {
        if (!price || !Number.isFinite(price)) return
        try {
          const line = series.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: style,
            axisLabelVisible: true,
            title: target,
          })
          const key = `${base}-${target}`
          drawnRef.current.push({ key, target, position: pos, price, line })
          if (target === 'TP' || target === 'SL') {
            next.push({
              key,
              target,
              position: pos,
              price,
              y: series.priceToCoordinate(price) ?? -1,
              dragging: false,
            })
          }
        } catch {
          /* ignore lines outside the visible range */
        }
      }

      add('ENTRY', pos.entryPrice, ENTRY_COLOR, LineStyle.Dashed)
      add('LIQ', pos.liquidationPrice, LIQ_COLOR, LineStyle.LargeDashed)
      add('TP', pos.takeProfit, TP_COLOR, LineStyle.Dotted)
      add('SL', pos.stopLoss, SL_COLOR, LineStyle.Dotted)
    }

    setHandles(next)
  }, [positions])

  // -------------------------------------------------------------- drag handlers

  /**
   * The drag handle sits on top of the chart, so pointer events never reach the
   * crosshair while dragging. We invert the price scale instead: priceToCoordinate
   * is monotonic, so a binary search over the visible range gives the price at Y.
   */
  const priceAtY = useCallback((y: number): number | null => {
    const series = seriesRef.current
    const shell = containerRef.current
    if (!series || !shell) return null

    const rect = shell.getBoundingClientRect()
    const localY = y - rect.top
    let lo = Infinity
    let hi = -Infinity
    for (const c of candlesRef.current) {
      if (c.low < lo) lo = c.low
      if (c.high > hi) hi = c.high
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null

    const pad = (hi - lo) * 0.05
    lo -= pad
    hi += pad

    // priceToCoordinate decreases as price rises.
    let a = lo
    let b = hi
    for (let i = 0; i < 48; i++) {
      const mid = (a + b) / 2
      const coord = series.priceToCoordinate(mid)
      if (coord === null) return null
      if (coord > localY) a = mid
      else b = mid
    }
    return (a + b) / 2
  }, [])

  const handleDown = useCallback(
    (h: HandleState) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      dragRef.current = {
        key: h.key,
        target: h.target,
        position: h.position,
        startY: e.clientY,
        moved: 0,
        price: h.price,
      }
      setHandles((prev) => prev.map((x) => (x.key === h.key ? { ...x, dragging: true } : x)))
      onGrabLine(h.target, h.position)
    },
    [onGrabLine],
  )

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      e.preventDefault()
      drag.moved = Math.max(drag.moved, Math.abs(e.clientY - drag.startY))

      const raw = priceAtY(e.clientY)
      if (raw === null) return
      const price = Number(raw.toFixed(drag.position.entryPrice < 1 ? 5 : 2))
      drag.price = price
      setHandles((prev) => prev.map((x) => (x.key === drag.key ? { ...x, price } : x)))
    },
    [priceAtY],
  )

  const handleUp = useCallback(
    (h: HandleState) => (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
      if (!drag || drag.key !== h.key) return
      dragRef.current = null

      const digits = h.position.entryPrice < 1 ? 5 : 2
      const price = Number(drag.price.toFixed(digits))
      setHandles((prev) =>
        prev.map((x) =>
          x.key === h.key
            ? { ...x, price, dragging: false, y: seriesRef.current?.priceToCoordinate(price) ?? x.y }
            : x,
        ),
      )

      // A tap just opens the palette; a real drag commits the new level.
      if (drag.moved > 4) onCommitDrag(h.position, h.target, price)
      else onGrabLine(h.target, h.position)
    },
    [onCommitDrag, onGrabLine],
  )

  return (
    <div className="chart-shell" ref={containerRef}>
      {handles
        .filter((h) => h.y > 0)
        .map((h) => (
          <div
            key={h.key}
            className={`chart-line-handle${h.dragging ? ' dragging' : ''}`}
            style={{ top: h.y, borderColor: h.target === 'TP' ? TP_COLOR : SL_COLOR }}
            onPointerDown={handleDown(h)}
            onPointerMove={handleMove}
            onPointerUp={handleUp(h)}
            onPointerCancel={handleUp(h)}
          >
            <span className="chart-line-tag">{h.target}</span>
            <span className="chart-line-price">{formatPrice(h.price)}</span>
          </div>
        ))}
    </div>
  )
}

export function formatPrice(n: number, digits?: number): string {
  if (!Number.isFinite(n)) return '—'
  const d = digits ?? (Math.abs(n) < 1 ? 5 : Math.abs(n) < 1000 ? 2 : 2)
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}