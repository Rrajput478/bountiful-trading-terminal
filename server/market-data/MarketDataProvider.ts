export interface MarketQuote {
  symbol: string
  bid: number
  ask: number
  last: number
  timestamp: number
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<MarketQuote>

  getCandles(
    symbol: string,
    timeframe: string,
    limit?: number,
  ): Promise<Candle[]>

  subscribeToQuotes(
    symbol: string,
    callback: (quote: MarketQuote) => void,
  ): () => void
}