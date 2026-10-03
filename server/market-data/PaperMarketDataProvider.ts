import type { Candle, MarketDataProvider, MarketQuote } from './MarketDataProvider'

export interface ExtendedMarketQuote extends MarketQuote {
  high24h: number
  low24h: number
  change24h: number
  volume24h: number
}

/** Contract specification per symbol, mirroring MT5's symbol properties. */
export interface SymbolSpec {
  symbol: string
  description: string
  category: 'CRYPTO' | 'FOREX' | 'INDIAN'
  digits: number
  point: number
  contractSize: number
  lotSize: number
  minQuantity: number
  maxQuantity: number
  quantityStep: number
  tickValue: number
  swapLong: number
  swapShort: number
  leverageMax: number
  spreadPoints: number
  basePrice: number
  volatility: number
}

const SPECS: Record<string, Omit<SymbolSpec, 'symbol'>> = {
  'BTC/USDT': { description: 'Bitcoin / Tether USD', category: 'CRYPTO', digits: 2, point: 0.01, contractSize: 1, lotSize: 0.01, minQuantity: 0.0001, maxQuantity: 50, quantityStep: 0.0001, tickValue: 0.01, swapLong: -0.6, swapShort: 0.2, leverageMax: 100, spreadPoints: 15, basePrice: 67450, volatility: 0.0012 },
  'ETH/USDT': { description: 'Ethereum / Tether USD', category: 'CRYPTO', digits: 2, point: 0.01, contractSize: 1, lotSize: 0.01, minQuantity: 0.001, maxQuantity: 200, quantityStep: 0.001, tickValue: 0.01, swapLong: -0.4, swapShort: 0.15, leverageMax: 50, spreadPoints: 8, basePrice: 3520.5, volatility: 0.0014 },
  'SOL/USDT': { description: 'Solana / Tether USD', category: 'CRYPTO', digits: 2, point: 0.01, contractSize: 1, lotSize: 0.1, minQuantity: 0.1, maxQuantity: 5000, quantityStep: 0.1, tickValue: 0.01, swapLong: -0.2, swapShort: 0.08, leverageMax: 20, spreadPoints: 5, basePrice: 182.4, volatility: 0.002 },
  'BNB/USDT': { description: 'BNB / Tether USD', category: 'CRYPTO', digits: 2, point: 0.01, contractSize: 1, lotSize: 0.1, minQuantity: 0.1, maxQuantity: 5000, quantityStep: 0.1, tickValue: 0.01, swapLong: -0.1, swapShort: 0.05, leverageMax: 20, spreadPoints: 4, basePrice: 590.2, volatility: 0.0016 },
  'DOGE/USDT': { description: 'Dogecoin / Tether USD', category: 'CRYPTO', digits: 5, point: 0.00001, contractSize: 1, lotSize: 1, minQuantity: 1, maxQuantity: 50000000, quantityStep: 1, tickValue: 0.00001, swapLong: -0.05, swapShort: 0.02, leverageMax: 25, spreadPoints: 200, basePrice: 0.165, volatility: 0.0035 },
  'EUR/USD': { description: 'Euro / US Dollar', category: 'FOREX', digits: 5, point: 0.00001, contractSize: 100000, lotSize: 0.01, minQuantity: 1000, maxQuantity: 10000000, quantityStep: 1000, tickValue: 1.0, swapLong: -0.8, swapShort: 0.3, leverageMax: 100, spreadPoints: 12, basePrice: 1.0854, volatility: 0.0004 },
  'GBP/USD': { description: 'British Pound / US Dollar', category: 'FOREX', digits: 5, point: 0.00001, contractSize: 100000, lotSize: 0.01, minQuantity: 1000, maxQuantity: 10000000, quantityStep: 1000, tickValue: 1.0, swapLong: -0.9, swapShort: 0.35, leverageMax: 100, spreadPoints: 16, basePrice: 1.294, volatility: 0.0005 },
  'XAU/USD': { description: 'Gold vs US Dollar', category: 'FOREX', digits: 2, point: 0.01, contractSize: 100, lotSize: 0.01, minQuantity: 1, maxQuantity: 5000, quantityStep: 1, tickValue: 1.0, swapLong: -3.2, swapShort: 1.1, leverageMax: 100, spreadPoints: 25, basePrice: 2735.4, volatility: 0.0008 },
  'NIFTY 50': { description: 'NSE Nifty 50 Index', category: 'INDIAN', digits: 2, point: 0.05, contractSize: 25, lotSize: 1, minQuantity: 1, maxQuantity: 2000, quantityStep: 1, tickValue: 1.25, swapLong: -12, swapShort: 8, leverageMax: 5, spreadPoints: 2, basePrice: 25930, volatility: 0.0009 },
  BANKNIFTY: { description: 'NSE Bank Nifty Index', category: 'INDIAN', digits: 2, point: 0.05, contractSize: 15, lotSize: 1, minQuantity: 1, maxQuantity: 1500, quantityStep: 1, tickValue: 0.75, swapLong: -18, swapShort: 11, leverageMax: 5, spreadPoints: 6, basePrice: 54100, volatility: 0.0013 },
  RELIANCE: { description: 'Reliance Industries (NSE)', category: 'INDIAN', digits: 2, point: 0.05, contractSize: 1, lotSize: 1, minQuantity: 1, maxQuantity: 10000, quantityStep: 1, tickValue: 0.05, swapLong: -2.5, swapShort: 1.2, leverageMax: 5, spreadPoints: 2, basePrice: 2980.5, volatility: 0.0012 },
  TCS: { description: 'Tata Consultancy Services', category: 'INDIAN', digits: 2, point: 0.05, contractSize: 1, lotSize: 1, minQuantity: 1, maxQuantity: 10000, quantityStep: 1, tickValue: 0.05, swapLong: -2.1, swapShort: 1.0, leverageMax: 5, spreadPoints: 3, basePrice: 4250, volatility: 0.0011 },
  HDFCBANK: { description: 'HDFC Bank (NSE)', category: 'INDIAN', digits: 2, point: 0.05, contractSize: 1, lotSize: 1, minQuantity: 1, maxQuantity: 10000, quantityStep: 1, tickValue: 0.05, swapLong: -1.8, swapShort: 0.9, leverageMax: 5, spreadPoints: 2, basePrice: 1680, volatility: 0.001 },
  TATAMOTORS: { description: 'Tata Motors (NSE)', category: 'INDIAN', digits: 2, point: 0.05, contractSize: 1, lotSize: 1, minQuantity: 1, maxQuantity: 10000, quantityStep: 1, tickValue: 0.05, swapLong: -2.2, swapShort: 1.1, leverageMax: 5, spreadPoints: 3, basePrice: 975, volatility: 0.0017 },
  INFY: { description: 'Infosys (NSE)', category: 'INDIAN', digits: 2, point: 0.05, contractSize: 1, lotSize: 1, minQuantity: 1, maxQuantity: 10000, quantityStep: 1, tickValue: 0.05, swapLong: -1.7, swapShort: 0.85, leverageMax: 5, spreadPoints: 2, basePrice: 1890, volatility: 0.0011 },
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
}

interface SymbolState {
  current: number
  open24h: number
  high24h: number
  low24h: number
  volume24h: number
  history: Record<string, Candle[]>
  active: Record<string, Candle>
}

export class PaperMarketDataProvider implements MarketDataProvider {
  private states: Record<string, SymbolState> = {}

  constructor() {
    for (const [symbol, spec] of Object.entries(SPECS)) {
      this.states[symbol] = {
        current: spec.basePrice,
        open24h: spec.basePrice * (1 - (spec.volatility * 30) / 2),
        high24h: spec.basePrice * 1.004,
        low24h: spec.basePrice * 0.996,
        volume24h: 10000,
        history: {},
        active: {},
      }
    }
  }

  getSpec(symbol: string): SymbolSpec {
    const spec = SPECS[symbol]
    if (spec) return { symbol, ...spec }
    // unknown symbol: allow it with permissive crypto-style defaults
    return {
      symbol,
      description: symbol,
      category: 'CRYPTO',
      digits: 2,
      point: 0.01,
      contractSize: 1,
      lotSize: 0.01,
      minQuantity: 0.0001,
      maxQuantity: 1000000,
      quantityStep: 0.0001,
      tickValue: 0.01,
      swapLong: 0,
      swapShort: 0,
      leverageMax: 100,
      spreadPoints: 10,
      basePrice: 100,
      volatility: 0.0015,
    }
  }

  listSymbols(): string[] {
    return Object.keys(SPECS)
  }

  listSpecs(): SymbolSpec[] {
    return this.listSymbols().map((s) => this.getSpec(s))
  }

  private ensure(symbol: string): SymbolState {
    if (!this.states[symbol]) {
      const spec = this.getSpec(symbol)
      this.states[symbol] = {
        current: spec.basePrice,
        open24h: spec.basePrice * 0.999,
        high24h: spec.basePrice * 1.002,
        low24h: spec.basePrice * 0.998,
        volume24h: 1000,
        history: {},
        active: {},
      }
    }
    return this.states[symbol]
  }

  /** Random-walks the price once. Called on every tick, never on read. */
  public tickPrice(symbol: string): void {
    const state = this.ensure(symbol)
    const spec = this.getSpec(symbol)
    const change = (Math.random() - 0.5) * 2 * state.current * spec.volatility
    state.current = Math.max(spec.point, Number((state.current + change).toFixed(spec.digits)))
    state.high24h = Math.max(state.high24h, state.current)
    state.low24h = Math.min(state.low24h, state.current)
    state.volume24h += Math.abs(change) * 10
  }

  private buildQuote(state: SymbolState, spec: SymbolSpec): ExtendedMarketQuote {
    const spreadPoints = spec.spreadPoints * spec.point
    const bid = Number((state.current - spreadPoints / 2).toFixed(spec.digits))
    const ask = Number((state.current + spreadPoints / 2).toFixed(spec.digits))
    const change24h =
      state.open24h > 0
        ? Number((((state.current - state.open24h) / state.open24h) * 100).toFixed(2))
        : 0

    return {
      symbol: spec.symbol,
      bid,
      ask,
      last: state.current,
      high24h: Number(state.high24h.toFixed(spec.digits)),
      low24h: Number(state.low24h.toFixed(spec.digits)),
      change24h,
      volume24h: Math.round(state.volume24h),
      timestamp: Date.now(),
    }
  }

  /** Read-only quote: does not advance the price walk. */
  async peekQuote(symbol: string): Promise<ExtendedMarketQuote> {
    return this.buildQuote(this.ensure(symbol), this.getSpec(symbol))
  }

  /** Kept for the provider interface; advances the walk once. */
  async getQuote(symbol: string): Promise<ExtendedMarketQuote> {
    this.tickPrice(symbol)
    return this.peekQuote(symbol)
  }

  getOrderBook(symbol: string, depth = 8) {
    const state = this.ensure(symbol)
    const spec = this.getSpec(symbol)
    const step = spec.point * spec.spreadPoints
    const maxQty = spec.category === 'CRYPTO' ? 2.5 : 40

    const asks: { price: number; quantity: number; total: number }[] = []
    let askTotal = 0
    for (let i = 1; i <= depth; i++) {
      const quantity = Number((Math.random() * maxQty + 0.05).toFixed(4))
      askTotal += quantity
      asks.push({
        price: Number((state.current + i * step).toFixed(spec.digits)),
        quantity,
        total: Number(askTotal.toFixed(4)),
      })
    }

    const bids: { price: number; quantity: number; total: number }[] = []
    let bidTotal = 0
    for (let i = 1; i <= depth; i++) {
      const quantity = Number((Math.random() * maxQty + 0.05).toFixed(4))
      bidTotal += quantity
      bids.push({
        price: Number((state.current - i * step).toFixed(spec.digits)),
        quantity,
        total: Number(bidTotal.toFixed(4)),
      })
    }

    return {
      symbol,
      asks,
      bids,
      timestamp: Date.now(),
    }
  }

  /**
   * Builds candles once per bucket and caches them. Subsequent reads return the
   * same series, so the chart does not flicker or regenerate on every poll.
   */
  private candleSeries(symbol: string, timeframe: string, limit: number): Candle[] {
    const state = this.ensure(symbol)
    const spec = this.getSpec(symbol)
    const interval = TIMEFRAME_SECONDS[timeframe] ?? 60
    const key = `${symbol}:${timeframe}`

    const series = state.history[key]
    const now = Math.floor(Date.now() / 1000)
    const currentBucket = Math.floor(now / interval) * interval

    if (series && series.length > 0 && series[series.length - 1].time >= currentBucket - interval) {
      return this.trim(series, limit)
    }

    // Seed the series once for this symbol/timeframe.
    if (!series || series.length === 0) {
      const seeded: Candle[] = []
      let price = spec.basePrice * (1 - spec.volatility * limit)
      for (let i = limit - 1; i >= 0; i--) {
        const drift = (Math.random() - 0.5) * 2 * price * spec.volatility * 2.5
        const open = price
        const close = Math.max(spec.point, open + drift)
        const wick = Math.abs(drift) + price * spec.volatility
        seeded.push({
          time: currentBucket - interval * i,
          open: round(open, spec.digits),
          high: round(Math.max(open, close) + wick * Math.random(), spec.digits),
          low: round(Math.max(0, Math.min(open, close) - wick * Math.random()), spec.digits),
          close: round(close, spec.digits),
          volume: Math.round(Math.random() * 400 + 60),
        })
        price = close
      }
      state.history[key] = seeded
      return this.trim(seeded, limit)
    }

    // Roll the series forward until it reaches the current bucket.
    let last = series[series.length - 1]
    let guard = 0
    while (last.time < currentBucket && guard < limit + 10) {
      guard++
      const drift = (Math.random() - 0.5) * 2 * last.close * spec.volatility * 2
      const close = Math.max(spec.point, last.close + drift)
      const wick = Math.abs(drift) + last.close * spec.volatility
      const next: Candle = {
        time: last.time + interval,
        open: round(last.close, spec.digits),
        high: round(Math.max(last.close, close) + wick * Math.random(), spec.digits),
        low: round(Math.max(0, Math.min(last.close, close) - wick * Math.random()), spec.digits),
        close: round(close, spec.digits),
        volume: Math.round(Math.random() * 400 + 60),
      }
      series.push(next)
      last = next
    }

    return this.trim(series, limit)
  }

  private trim(series: Candle[], limit: number): Candle[] {
    return series.length > limit ? series.slice(series.length - limit) : series
  }

  /** Updates the forming candle with the latest price. */
  public updateActiveCandle(symbol: string, timeframe: string): void {
    const state = this.ensure(symbol)
    const spec = this.getSpec(symbol)
    const interval = TIMEFRAME_SECONDS[timeframe] ?? 60
    const now = Math.floor(Date.now() / 1000)
    const bucket = Math.floor(now / interval) * interval
    const series = this.candleSeries(symbol, timeframe, 300)
    const last = series[series.length - 1]
    const price = state.current

    if (!last || last.time < bucket) {
      series.push({
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1,
      })
      return
    }

    last.high = round(Math.max(last.high, price), spec.digits)
    last.low = round(Math.min(last.low, price), spec.digits)
    last.close = price
    last.volume = (last.volume || 0) + 1
    void state
  }

  async getCandles(symbol: string, timeframe: string, limit = 200): Promise<Candle[]> {
    const series = this.candleSeries(symbol, timeframe, Math.max(limit, 200))
    this.updateActiveCandle(symbol, timeframe)
    return this.trim(series, limit)
  }

  subscribeToQuotes(symbol: string, callback: (quote: MarketQuote) => void): () => void {
    const interval = setInterval(async () => {
      callback(await this.getQuote(symbol))
    }, 1000)
    return () => clearInterval(interval)
  }
}

const round = (n: number, d: number) => Number(n.toFixed(d))

export { TIMEFRAME_SECONDS }