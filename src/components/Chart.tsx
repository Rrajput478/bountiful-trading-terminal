import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'
import * as api from '../services/api'
import { type Position } from '../hooks/useTrading'

type ChartProps = {
  symbol: string
  timeframe: string
  theme?: 'dark' | 'light'
  positions?: Position[]
}

function Chart({
  symbol,
  timeframe,
  theme = 'dark',
  positions = [],
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])

  // 1. Initialize Lightweight Chart instance
  useEffect(() => {
    if (!containerRef.current) return

    const isDark = theme === 'dark'
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: isDark ? '#080b10' : '#ffffff' },
        textColor: isDark ? '#94a3b8' : '#334155',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
        horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: isDark ? '#1e293b' : '#cbd5e1',
        autoScale: true,
      },
      timeScale: {
        borderColor: isDark ? '#1e293b' : '#cbd5e1',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    seriesRef.current = series

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      priceLinesRef.current = []
    }
  }, [theme])

  // 2. Load historical candles
  useEffect(() => {
    let active = true

    const loadData = async () => {
      try {
        const rawCandles = await api.getCandles(symbol, timeframe, 120)
        if (!active || !seriesRef.current || !Array.isArray(rawCandles) || rawCandles.length === 0) return

        const formatted: CandlestickData<Time>[] = rawCandles.map((c: any) => ({
          time: Number(c.time) as Time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }))

        formatted.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0))

        seriesRef.current.setData(formatted)
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent()
        }
      } catch (err) {
        console.error('Failed to load chart data for', symbol, err)
      }
    }

    loadData()

    const tickInterval = setInterval(async () => {
      if (!seriesRef.current || !active) return
      try {
        const latest = await api.getCandles(symbol, timeframe, 1)
        if (active && Array.isArray(latest) && latest.length > 0 && seriesRef.current) {
          const lastCandle = latest[latest.length - 1]
          seriesRef.current.update({
            time: Number(lastCandle.time) as Time,
            open: Number(lastCandle.open),
            high: Number(lastCandle.high),
            low: Number(lastCandle.low),
            close: Number(lastCandle.close),
          })
        }
      } catch (e) {
        // silent
      }
    }, 1000)

    return () => {
      active = false
      clearInterval(tickInterval)
    }
  }, [symbol, timeframe])

  // 3. Render Position, SL, TP, Liquidation Price Lines on Chart!
  useEffect(() => {
    if (!seriesRef.current) return

    // Remove existing price lines
    priceLinesRef.current.forEach((line) => {
      try {
        seriesRef.current?.removePriceLine(line)
      } catch (e) {
        // ignore
      }
    })
    priceLinesRef.current = []

    // Filter positions matching current symbol
    const activeSymbolPositions = positions.filter((p) => p.symbol === symbol)

    activeSymbolPositions.forEach((pos) => {
      const isLong = pos.side === 'LONG'
      const posColor = isLong ? '#10b981' : '#ef4444'

      // 1. Entry Price Line
      if (pos.entryPrice) {
        const entryLine = seriesRef.current!.createPriceLine({
          price: pos.entryPrice,
          color: posColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${pos.side} ${pos.quantity} @ ${pos.entryPrice}`,
        })
        priceLinesRef.current.push(entryLine)
      }

      // 2. Take Profit (TP) Line
      if (pos.takeProfit) {
        const tpLine = seriesRef.current!.createPriceLine({
          price: pos.takeProfit,
          color: '#10b981',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `TP: ${pos.takeProfit}`,
        })
        priceLinesRef.current.push(tpLine)
      }

      // 3. Stop Loss (SL) Line
      if (pos.stopLoss) {
        const slLine = seriesRef.current!.createPriceLine({
          price: pos.stopLoss,
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `SL: ${pos.stopLoss}`,
        })
        priceLinesRef.current.push(slLine)
      }

      // 4. Liquidation Line
      if (pos.liquidationPrice) {
        const liqLine = seriesRef.current!.createPriceLine({
          price: pos.liquidationPrice,
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: `LIQ: ${pos.liquidationPrice}`,
        })
        priceLinesRef.current.push(liqLine)
      }
    })
  }, [positions, symbol])

  return (
    <div className="chart-wrapper-rel">
      {/* Chart Canvas */}
      <div
        ref={containerRef}
        className="chart-canvas-div"
      />
    </div>
  )
}

export default Chart
