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
}

function Chart({ symbol, timeframe }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [candles, setCandles] = useState<any[]>([])

  const chartRef = useRef<IChartApi | null>(null)

  const seriesRef =
    useRef<ISeriesApi<'Candlestick'> | null>(null)

  // 1. Load candles from backend
   useEffect(() => {
  let active = true

  const loadCandles = async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:3000/api/market-data/paper?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      )

      const data = await response.json()

      if (active) {
        setCandles(data.candles)
      }
    } catch (error) {
      console.error(
        'Failed to load market data:',
        error,
      )
    }
  }

  loadCandles()

  return () => {
    active = false
  }
}, [symbol, timeframe]) 

  // 2. Create chart when candles arrive
  useEffect(() => {
    if (!containerRef.current) return

    if (candles.length === 0) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: {
          color: '#080b10',
        },
        textColor: '#687384',
      },

      grid: {
        vertLines: {
          color: '#111820',
        },
        horzLines: {
          color: '#111820',
        },
      },

      crosshair: {
        mode: 1,
      },

      rightPriceScale: {
        borderColor: '#1b232d',
      },

      timeScale: {
        borderColor: '#1b232d',
        timeVisible: true,
        secondsVisible: false,
      },

      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    const series = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#35d07f',
        downColor: '#d94b5b',
        borderUpColor: '#35d07f',
        borderDownColor: '#d94b5b',
        wickUpColor: '#35d07f',
        wickDownColor: '#d94b5b',
      },
    )

    const data: CandlestickData<Time>[] =
      candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }))

    series.setData(data)

    chart.timeScale().fitContent()

    const resizeObserver =
      new ResizeObserver(() => {
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
  }, [candles])

  // 3. Update live candle
useEffect(() => {
  if (!seriesRef.current) return

  const interval = setInterval(async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:3000/api/candle/paper?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      )

      const candle = await response.json()

      if (!candle?.time) return

      seriesRef.current?.update({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })
    } catch (error) {
      console.error(
        'Failed to update live candle:',
        error,
      )
    }
  }, 1000)

  return () => {
    clearInterval(interval)
  }
}, [symbol, timeframe])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  )
}


export default Chart