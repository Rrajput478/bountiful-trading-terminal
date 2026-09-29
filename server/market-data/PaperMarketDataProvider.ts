import {
  Candle,
  MarketDataProvider,
  MarketQuote,
} from './MarketDataProvider'

export interface ExtendedMarketQuote extends MarketQuote {
  high24h: number
  low24h: number
  change24h: number
  volume24h: number
}

export class PaperMarketDataProvider implements MarketDataProvider {
  private prices: Record<string, { current: number; open24h: number; high24h: number; low24h: number; volume24h: number }> = {
    // Crypto Pairs
    'BTC/USDT': { current: 67450.00, open24h: 66100.00, high24h: 68200.00, low24h: 65800.00, volume24h: 18450.5 },
    'ETH/USDT': { current: 3520.50, open24h: 3410.00, high24h: 3580.00, low24h: 3390.00, volume24h: 125400.0 },
    'SOL/USDT': { current: 182.40, open24h: 174.00, high24h: 186.20, low24h: 172.50, volume24h: 890000.0 },
    'BNB/USDT': { current: 590.20, open24h: 582.00, high24h: 596.00, low24h: 579.00, volume24h: 94000.0 },
    'DOGE/USDT': { current: 0.165, open24h: 0.158, high24h: 0.172, low24h: 0.155, volume24h: 45000000.0 },
    // Indian Indices & Stocks (for Upstox)
    'NIFTY 50': { current: 25930.00, open24h: 25810.00, high24h: 26010.00, low24h: 25780.00, volume24h: 320000.0 },
    'BANKNIFTY': { current: 54100.00, open24h: 53800.00, high24h: 54350.00, low24h: 53650.00, volume24h: 210000.0 },
    'RELIANCE': { current: 2980.50, open24h: 2940.00, high24h: 3010.00, low24h: 2930.00, volume24h: 450000.0 },
    'TCS': { current: 4250.00, open24h: 4210.00, high24h: 4280.00, low24h: 4190.00, volume24h: 180000.0 },
    'HDFCBANK': { current: 1680.00, open24h: 1665.00, high24h: 1695.00, low24h: 1658.00, volume24h: 620000.0 },
    'TATAMOTORS': { current: 975.00, open24h: 960.00, high24h: 988.00, low24h: 955.00, volume24h: 890000.0 },
    'INFY': { current: 1890.00, open24h: 1870.00, high24h: 1910.00, low24h: 1860.00, volume24h: 410000.0 },
  }

  private activeCandles: Record<string, Candle> = {}

  private getCandleKey(symbol: string, timeframe: string) {
    return `${symbol}:${timeframe}`
  }

  public updatePrice(symbol: string) {
    if (!this.prices[symbol]) {
      this.prices[symbol] = {
        current: 100,
        open24h: 100,
        high24h: 102,
        low24h: 98,
        volume24h: 5000,
      }
    }

    const state = this.prices[symbol]
    // Random walk with 0.1% max fluctuation per tick
    const change = (Math.random() - 0.495) * state.current * 0.0015
    state.current = Math.max(0.0001, Number((state.current + change).toFixed(state.current < 1 ? 4 : 2)))

    state.high24h = Math.max(state.high24h, state.current)
    state.low24h = Math.min(state.low24h, state.current)
    state.volume24h += Math.abs(change) * 5

    return state
  }

  async getQuote(symbol: string): Promise<ExtendedMarketQuote> {
    const state = this.updatePrice(symbol)
    const spread = state.current < 1 ? 0.0001 : state.current < 1000 ? 0.05 : state.current * 0.0002
    const bid = Number((state.current - spread).toFixed(state.current < 1 ? 4 : 2))
    const ask = Number((state.current + spread).toFixed(state.current < 1 ? 4 : 2))
    const change24h = Number((((state.current - state.open24h) / state.open24h) * 100).toFixed(2))

    return {
      symbol,
      bid,
      ask,
      last: state.current,
      high24h: state.high24h,
      low24h: state.low24h,
      change24h,
      volume24h: Math.round(state.volume24h),
      timestamp: Date.now(),
    }
  }

  getOrderBook(symbol: string, depth = 6) {
    const state = this.prices[symbol] || { current: 100 }
    const price = state.current
    const step = price < 1 ? 0.0002 : price < 1000 ? 0.25 : price * 0.0004

    const asks = []
    let askTotal = 0
    for (let i = 1; i <= depth; i++) {
      const askPrice = Number((price + i * step).toFixed(price < 1 ? 4 : 2))
      const qty = Number((Math.random() * (price > 1000 ? 1.5 : 50) + 0.1).toFixed(3))
      askTotal += qty
      asks.push({
        price: askPrice,
        quantity: qty,
        total: Number(askTotal.toFixed(3)),
      })
    }

    const bids = []
    let bidTotal = 0
    for (let i = 1; i <= depth; i++) {
      const bidPrice = Number((price - i * step).toFixed(price < 1 ? 4 : 2))
      const qty = Number((Math.random() * (price > 1000 ? 1.5 : 50) + 0.1).toFixed(3))
      bidTotal += qty
      bids.push({
        price: bidPrice,
        quantity: qty,
        total: Number(bidTotal.toFixed(3)),
      })
    }

    return {
      symbol,
      bids,
      asks: asks.reverse(), // Top ask at the bottom of asks list
      timestamp: Date.now(),
    }
  }

  private updateActiveCandle(symbol: string, timeframe: string): Candle {
    const intervalMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1H': 3600,
      '4H': 14400,
      '1D': 86400,
    }

    const interval = intervalMap[timeframe] ?? 60
    const now = Math.floor(Date.now() / 1000)
    const candleStart = Math.floor(now / interval) * interval
    const key = this.getCandleKey(symbol, timeframe)
    const existing = this.activeCandles[key]
    const state = this.updatePrice(symbol)
    const price = state.current

    if (!existing || existing.time !== candleStart) {
      const candle: Candle = {
        time: candleStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1,
      }
      this.activeCandles[key] = candle
      return candle
    }

    existing.high = Math.max(existing.high, price)
    existing.low = Math.min(existing.low, price)
    existing.close = price
    existing.volume = (existing.volume ?? 0) + 1

    return existing
  }

  async getCandles(symbol: string, timeframe: string, limit = 120): Promise<Candle[]> {
    const state = this.prices[symbol] || { current: 100 }
    const basePrice = state.current
    const intervalMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1H': 3600,
      '4H': 14400,
      '1D': 86400,
    }

    const interval = intervalMap[timeframe] ?? 60
    const now = Math.floor(Date.now() / 1000)
    const activeCandle = this.updateActiveCandle(symbol, timeframe)

    const candles: Candle[] = []
    let price = activeCandle.open

    for (let i = limit - 1; i > 0; i--) {
      const candleTime = activeCandle.time - interval * i
      const open = price
      const change = (Math.random() - 0.49) * basePrice * 0.008
      const close = Math.max(0.01, open + change)
      const high = Math.max(open, close) + Math.random() * basePrice * 0.004
      const low = Math.min(open, close) - Math.random() * basePrice * 0.004

      candles.push({
        time: candleTime,
        open: Number(open.toFixed(basePrice < 1 ? 4 : 2)),
        high: Number(high.toFixed(basePrice < 1 ? 4 : 2)),
        low: Number(low.toFixed(basePrice < 1 ? 4 : 2)),
        close: Number(close.toFixed(basePrice < 1 ? 4 : 2)),
        volume: Math.round(Math.random() * 500 + 50),
      })

      price = close
    }

    candles.push({
      ...activeCandle,
      open: Number(activeCandle.open.toFixed(basePrice < 1 ? 4 : 2)),
      high: Number(activeCandle.high.toFixed(basePrice < 1 ? 4 : 2)),
      low: Number(activeCandle.low.toFixed(basePrice < 1 ? 4 : 2)),
      close: Number(activeCandle.close.toFixed(basePrice < 1 ? 4 : 2)),
    })

    return candles
  }

  subscribeToQuotes(symbol: string, callback: (quote: MarketQuote) => void): () => void {
    const interval = setInterval(async () => {
      const quote = await this.getQuote(symbol)
      callback(quote)
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }
}
