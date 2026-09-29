import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'

type ChartProps = {
  symbol: string
  timeframe: string
  theme?: 'dark' | 'light'
}

function Chart({ symbol, timeframe, theme = 'dark' }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [candles, setCandles] = useState<any[]>([])
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  // 1. Initial / symbol / timeframe change load
  useEffect(() => {
    let active = true

    const loadCandles = async () => {
      try {
        const response = await fetch(
          `http://127.0.0.1:3000/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=120`,
        )
        const data = await response.json()
        if (active && Array.isArray(data)) {
          setCandles(data)
        }
      } catch (error) {
        console.error('Failed to load chart candles:', error)
      }
    }

    loadCandles()

    return () => {
      active = false
    }
  }, [symbol, timeframe])

  // 2. Build or rebuild chart instance
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    const isDark = theme === 'dark'
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: isDark ? '#080b10' : '#ffffff' },
        textColor: isDark ? '#687384' : '#475569',
      },
      grid: {
        vertLines: { color: isDark ? '#111820' : '#f1f5f9' },
        horzLines: { color: isDark ? '#111820' : '#f1f5f9' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: isDark ? '#1b232d' : '#e2e8f0',
      },
      timeScale: {
        borderColor: isDark ? '#1b232d' : '#e2e8f0',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth || 600,
      height: containerRef.current.clientHeight || 400,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    const formattedData: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    series.setData(formattedData)
    chart.timeScale().fitContent()

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      })
    })

    resizeObserver.observe(containerRef.current)
    chartRef.current = chart
    seriesRef.current = series

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [candles, theme])

  // 3. Real-time tick update to candle series
  useEffect(() => {
    let active = true

    const interval = setInterval(async () => {
      if (!seriesRef.current || !active) return
      try {
        const response = await fetch(
          `http://127.0.0.1:3000/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=1`,
        )
        const latestCandles = await response.json()
        if (Array.isArray(latestCandles) && latestCandles.length > 0) {
          const last = latestCandles[latestCandles.length - 1]
          seriesRef.current.update({
            time: last.time as Time,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
          })
        }
      } catch (err) {
        // silent catch
      }
    }, 1500)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [symbol, timeframe])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    />
  )
}

export default Chart
