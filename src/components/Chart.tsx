import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'
import * as api from '../services/api'

type ChartProps = {
  symbol: string
  timeframe: string
  theme?: 'dark' | 'light'
}

function Chart({ symbol, timeframe, theme = 'dark' }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const isInitializedRef = useRef(false)

  // 1. Initialize Chart instance once
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
    isInitializedRef.current = true

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
      isInitializedRef.current = false
    }
  }, [theme])

  // 2. Load historical candles when symbol or timeframe changes
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

        // Sort ascending by time to satisfy lightweight-charts requirement
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

    // Real-time tick update every 1s
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

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '320px',
        position: 'relative',
      }}
    />
  )
}

export default Chart
