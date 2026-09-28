import {
  Candle,
  MarketDataProvider,
  MarketQuote,
} from './MarketDataProvider'

export class PaperMarketDataProvider
  implements MarketDataProvider
{
  private prices: Record<string, number> = {
    'BTC/USDT': 62000,
    'ETH/USDT': 3000,
    'SOL/USDT': 150,
  }

  private activeCandles: Record<
    string,
    Candle
  > = {}

  private getCandleKey(
    symbol: string,
    timeframe: string,
  ) {
    return `${symbol}:${timeframe}`
  }

  private updatePrice(symbol: string) {
    const currentPrice =
      this.prices[symbol] ?? 100

    const change =
      (Math.random() - 0.5) *
      currentPrice *
      0.001

    this.prices[symbol] =
      currentPrice + change

    return this.prices[symbol]
  }

  async getQuote(
    symbol: string,
  ): Promise<MarketQuote> {
    const price = this.updatePrice(symbol)

    return {
      symbol,
      bid: price - 1,
      ask: price + 1,
      last: price,
      timestamp: Date.now(),
    }
  }

  private updateActiveCandle(
    symbol: string,
    timeframe: string,
  ): Candle {
    const intervalMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1H': 3600,
      '4H': 14400,
      '1D': 86400,
    }

    const interval =
      intervalMap[timeframe] ?? 60

    const now =
      Math.floor(Date.now() / 1000)

    const candleStart =
      Math.floor(now / interval) * interval

    const key =
      this.getCandleKey(
        symbol,
        timeframe,
      )

    const existing =
      this.activeCandles[key]

    const price =
      this.updatePrice(symbol)

    if (
      !existing ||
      existing.time !== candleStart
    ) {
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

    existing.high = Math.max(
      existing.high,
      price,
    )

    existing.low = Math.min(
      existing.low,
      price,
    )

    existing.close = price

    existing.volume =
      (existing.volume ?? 0) + 1

    return existing
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit = 100,
  ): Promise<Candle[]> {
    const basePrice =
      this.prices[symbol] ?? 100

    const intervalMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1H': 3600,
      '4H': 14400,
      '1D': 86400,
    }

    const interval =
      intervalMap[timeframe] ?? 60

    const now =
      Math.floor(Date.now() / 1000)

    const activeCandle =
      this.updateActiveCandle(
        symbol,
        timeframe,
      )

    const candles: Candle[] = []

    let price =
      activeCandle.open

    for (
      let i = limit - 1;
      i > 0;
      i--
    ) {
      const candleTime =
        activeCandle.time -
        interval * i

      const open = price

      const change =
        (Math.random() - 0.48) *
        basePrice *
        0.01

      const close =
        open + change

      const high =
        Math.max(open, close) +
        Math.random() *
          basePrice *
          0.005

      const low =
        Math.min(open, close) -
        Math.random() *
          basePrice *
          0.005

      candles.push({
        time: candleTime,
        open,
        high,
        low,
        close,
        volume:
          Math.random() * 100,
      })

      price = close
    }

    candles.push({
      ...activeCandle,
    })

    return candles
  }

  subscribeToQuotes(
    symbol: string,
    callback: (
      quote: MarketQuote,
    ) => void,
  ): () => void {
    const interval =
      setInterval(async () => {
        const quote =
          await this.getQuote(symbol)

        callback(quote)
      }, 1000)

    return () => {
      clearInterval(interval)
    }
  }
}