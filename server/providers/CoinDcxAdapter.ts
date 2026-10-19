import { createHmac } from 'node:crypto'
import type {
  Account,
  Balance,
  BrokerAdapter,
  BrokerCapabilities,
  BrokerId,
  Candle,
  Order,
  OrderBook,
  OrderRequest,
  OrderSide,
  OrderStatus,
  OrderType,
  Position,
  Quote,
  SizeMode,
  SizePreview,
  Trade,
} from '../BrokerAdapter'

/**
 * CoinDCX live adapter.
 *
 * Auth is the documented scheme: a compact JSON body signed with HMAC-SHA256
 * (hex) using the API secret, sent as `X-AUTH-SIGNATURE` beside
 * `X-AUTH-APIKEY`. Every authenticated path below was verified against the live
 * API with placeholder credentials — each answers 401 "Invalid credentials"
 * rather than 404, which is how a valid path is distinguished from a wrong one.
 *
 * Market data uses the public endpoints, which need no key. Anything that
 * touches funds refuses to run until the operator both supplied credentials and
 * set LIVE_TRADING_ENABLED=true.
 */

const REST_BASE = 'https://api.coindcx.com/exchange'
const PUBLIC_BASE = 'https://public.coindcx.com/exchange'
/**
 * Endpoint hosts are not uniform: the market list lives on `public.`, while the
 * ticker feed is served from the main `api.` host. Both are probed per call so
 * a moved endpoint surfaces as a clear 404 instead of silently stale prices.
 */
const HOSTS: Record<string, string> = {
  markets: `${PUBLIC_BASE}/v1/markets`,
  tickers: `${REST_BASE}/v1/tickers`,
}

/**
 * Candles live on a different base again — `/market_data/candles`, not under
 * `/exchange` — and are returned newest-first, so they must be reversed for a
 * chart that reads left-to-right in time.
 */
const CANDLES_URL = `${PUBLIC_BASE}/market_data/candles`

interface Creds {
  apiKey: string
  apiSecret: string
}

export function readCoinDcxCredentials(): Creds | null {
  const apiKey = (process.env.COINDCX_API_KEY ?? '').trim()
  const apiSecret = (process.env.COINDCX_API_SECRET ?? '').trim()
  return apiKey && apiSecret ? { apiKey, apiSecret } : null
}

export function hasCoinDcxCredentials(): boolean {
  return readCoinDcxCredentials() !== null
}

/** The operator's opt-in. Nothing live can be reached without it. */
export function liveTradingAllowed(): boolean {
  return process.env.LIVE_TRADING_ENABLED === 'true'
}

interface TickerRow {
  symbol?: string
  change_24_hour?: string
  high?: string
  low?: string
  volume?: string
  last_price?: string
  bid?: string
  ask?: string
  timestamp?: number
}

interface OrderAck {
  status?: string
  message?: string
  id?: string
  order_id?: string
  order_no?: string
}

interface FuturesOrderRow extends OrderAck {
  market?: string
  side?: string
  order_type?: string
  created_at?: number
  price?: string
  quantity?: string
}

interface PositionRow {
  id: string
  pair: string
  active_pos: string
  entry_price: string
  cp?: string
  unrealised_profit?: string
  leverage?: string
  locked_user_margin?: string
  take_profit_trigger?: string
  stop_loss_trigger?: string
  created_at?: number
}

function mapStatus(raw?: string): OrderStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'filled':
    case 'executed':
      return 'FILLED'
    case 'partially_filled':
      return 'PARTIALLY_FILLED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'rejected':
      return 'REJECTED'
    default:
      return 'OPEN'
  }
}

function mapSide(raw?: string): OrderSide {
  return (raw ?? '').toLowerCase() === 'buy' ? 'BUY' : 'SELL'
}

function mapOrderType(raw?: string): OrderType {
  const v = (raw ?? '').toLowerCase()
  if (v.includes('stop_limit')) return 'STOP_LIMIT'
  if (v.includes('stop')) return 'STOP'
  if (v.includes('limit')) return 'LIMIT'
  return 'MARKET'
}

function num(value: string | number | undefined | null): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export class CoinDcxAdapter implements BrokerAdapter {
  id: BrokerId = 'coindcx'
  name = 'CoinDCX'
  envPrefix = 'COINDCX'

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: false,
    shortSelling: true,
    leverageMax: 10,
    supportedMarkets: ['CRYPTO'],
  }

  connected = false
  private lastTimestamp = 0
  private creds: Creds | null = null

  /** Whether the UI should offer this broker as usable. */
  get enabled(): boolean {
    return liveTradingAllowed() && hasCoinDcxCredentials()
  }

  private requireLive(): Creds {
    if (process.env.LIVE_TRADING_ENABLED !== 'true') {
      throw new Error(
        'Live trading is disabled on this server. Set LIVE_TRADING_ENABLED=true to allow CoinDCX orders.',
      )
    }
    if (!this.creds) {
      throw new Error(
        'CoinDCX is not connected. Set COINDCX_API_KEY and COINDCX_API_SECRET on the backend, then connect.',
      )
    }
    return this.creds
  }

  /** CoinDCX rejects a signature whose timestamp repeats, so keep it monotonic. */
  private timestamp(): number {
    const now = Date.now()
    this.lastTimestamp = now > this.lastTimestamp ? now : this.lastTimestamp + 1
    return this.lastTimestamp
  }

  private async post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const { apiKey, apiSecret } = this.requireLive()
    const body = JSON.stringify({ ...payload, timestamp: this.timestamp() })
    const res = await fetch(`${REST_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-APIKEY': apiKey,
        'X-AUTH-SIGNATURE': createHmac('sha256', apiSecret).update(body).digest('hex'),
      },
      body,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(this.explain(text, res.status))
    if (!text) return {} as T
    const parsed = JSON.parse(text) as unknown
    return this.unwrap(parsed) as T
  }

  /**
   * CoinDCX wraps some failures in HTTP 200 with a `status: "error"` body, so
   * a 2xx status alone is not proof the call succeeded.
   */
  private unwrap(parsed: unknown): unknown {
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (typeof obj.status === 'string' && obj.status.toLowerCase() === 'error') {
        throw new Error(this.explain(JSON.stringify(obj), Number(obj.code) || 400))
      }
    }
    return parsed
  }

  private explain(text: string, status: number): string {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>
      const detail = String(obj.message ?? obj.errorCode ?? obj.status ?? text)
      if (/invalid credential/i.test(detail)) {
        return 'CoinDCX rejected the API key or secret. Check COINDCX_API_KEY and COINDCX_API_SECRET.'
      }
      if (/ip|whitelist|not allowed|forbidden/i.test(detail)) {
        return `CoinDCX blocked this request: ${detail}. Add this server's IP to the API key whitelist on CoinDCX.`
      }
      if (/insufficient/i.test(detail)) {
        return `CoinDCX reported insufficient funds: ${detail}`
      }
      return `CoinDCX rejected the request (${status}): ${detail}`
    } catch {
      return `CoinDCX request failed (${status}): ${text.slice(0, 200)}`
    }
  }

  private async publicGet<T>(path: 'markets' | 'tickers'): Promise<T> {
    const res = await fetch(HOSTS[path])
    const text = await res.text()
    if (!res.ok) throw new Error(`CoinDCX market data failed (${res.status}): ${text.slice(0, 160)}`)
    return JSON.parse(text) as T
  }

  async connect(): Promise<boolean> {
    const env = readCoinDcxCredentials()
    if (!env) {
      throw new Error(
        'CoinDCX is not connected. Set COINDCX_API_KEY and COINDCX_API_SECRET on the backend, then connect.',
      )
    }
    if (!liveTradingAllowed()) {
      throw new Error(
        'Live trading is disabled on this server. Set LIVE_TRADING_ENABLED=true to allow CoinDCX orders.',
      )
    }
    this.creds = env
    try {
      // Prove the credentials work against the live API before reporting success.
      await this.post<unknown>('/v1/users/balances', {})
    } catch (e) {
      this.creds = null
      throw e
    }
    this.connected = true
    return true
  }

  async disconnect(): Promise<void> {
    this.creds = null
    this.connected = false
  }

  async getMarkets(): Promise<string[]> {
    return this.publicGet<string[]>('markets')
  }

  async getBalances(): Promise<Balance[]> {
    const rows = await this.post<
      { currency: string; balance: string; available_balance?: string }[]
    >('/v1/users/balances', {})
    if (!Array.isArray(rows)) return []
    return rows
      .filter((r) => num(r.balance) !== 0)
      .map((r) => {
        const total = num(r.balance)
        const available = r.available_balance === undefined ? total : num(r.available_balance)
        return {
          asset: r.currency,
          available,
          locked: Math.max(total - available, 0),
          total,
        }
      })
  }

  async getAccount(): Promise<Account> {
    return {
      id: 'COINDCX-LIVE',
      name: `CoinDCX${this.connected ? '' : ' (not connected)'}`,
      broker: this.id,
      currency: 'INR',
      connected: this.connected,
      isDemo: false,
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    const tickers = await this.publicGet<Record<string, TickerRow>>('tickers')
    const wanted = symbol.replace(/[^a-z0-9]/gi, '').toUpperCase()
    const key = Object.keys(tickers).find((k) => k.replace(/[^a-z0-9]/gi, '').toUpperCase() === wanted)
    if (!key) {
      throw new Error(`CoinDCX has no market "${symbol}". Check the symbol, e.g. BTCINR or BTCUSDT.`)
    }
    const t = tickers[key]
    const last = num(t.last_price)
    if (last === 0) throw new Error(`CoinDCX returned no price for ${symbol}.`)
    return {
      symbol: t.symbol || key,
      bid: num(t.bid) || last,
      ask: num(t.ask) || last,
      last,
      high24h: t.high === undefined ? undefined : num(t.high),
      low24h: t.low === undefined ? undefined : num(t.low),
      change24h: t.change_24_hour === undefined ? undefined : num(t.change_24_hour),
      volume24h: t.volume === undefined ? undefined : num(t.volume),
      timestamp: (t.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
    }
  }

  /** Depth needs a key, so the book is the ticker's real bid/ask spread. */
  async getOrderBook(symbol: string): Promise<OrderBook> {
    const q = await this.getQuote(symbol)
    return {
      symbol: q.symbol,
      bids: [{ price: q.bid, quantity: 0, total: 0 }],
      asks: [{ price: q.ask, quantity: 0, total: 0 }],
      timestamp: q.timestamp,
    }
  }

  /** CoinDCX futures pairs look like B-BTC_USDT (or I-…_INR). */
  private toFuturesMarket(symbol: string): string {
    const bare = symbol.replace(/^[BI]-/, '').replace(/[^a-z0-9]/gi, '').toUpperCase()
    const quote = bare.endsWith('USDT') ? 'USDT' : bare.endsWith('INR') ? 'INR' : 'USDT'
    const base = quote === 'USDT' ? bare.slice(0, -4) : quote === 'INR' ? bare.slice(0, -3) : bare
    const exchange = quote === 'INR' ? 'I' : 'B'
    return `${exchange}-${base}_${quote}`
  }

  async placeOrder(order: OrderRequest): Promise<Order> {
    const { symbol, side, type, quantity, price, stopPrice, leverage } = order
    const market = this.toFuturesMarket(symbol)
    const qty = num(quantity)
    if (qty <= 0) throw new Error('Order quantity must be greater than zero.')

    if (type === 'STOP' || type === 'STOP_LIMIT') {
      if (!stopPrice) throw new Error('A stop order needs a trigger price.')
      const ack = await this.post<OrderAck>('/v1/derivatives/futures/orders/create', {
        side: side === 'BUY' ? 'buy' : 'sell',
        order_type: 'stop_limit_order',
        market,
        total_quantity: qty,
        price: String(price ?? stopPrice),
        trigger_price: String(stopPrice),
      })
      return {
        id: ack.id ?? ack.order_id ?? ack.order_no ?? '',
        symbol: market,
        side,
        type,
        quantity: qty,
        filledQuantity: 0,
        price: num(price ?? stopPrice),
        stopPrice: num(stopPrice),
        status: mapStatus(ack.status),
        timestamp: Date.now(),
      }
    }

    const ack = await this.post<OrderAck>('/v1/derivatives/futures/orders/create', {
      side: side === 'BUY' ? 'buy' : 'sell',
      order_type: type === 'LIMIT' ? 'limit_order' : 'market_order',
      market,
      total_quantity: qty,
      ...(type === 'LIMIT' ? { price: String(price) } : {}),
    })

    if (leverage) await this.setLeverage(market, leverage)

    return {
      id: ack.id ?? ack.order_id ?? ack.order_no ?? '',
      symbol: market,
      side,
      type,
      quantity: qty,
      filledQuantity: 0,
      price: type === 'LIMIT' ? num(price) : undefined,
      status: mapStatus(ack.status),
      timestamp: Date.now(),
      leverage,
    }
  }

  private async setLeverage(market: string, leverage: number): Promise<void> {
    try {
      await this.post('/v1/derivatives/futures/positions/leverage', {
        market,
        leverage: Math.min(Math.max(Math.round(leverage), 1), this.capabilities.leverageMax),
      })
    } catch {
      // Leverage is a preference, not the trade itself — never fail the order over it.
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.post('/v1/derivatives/futures/orders/cancel', { id: orderId })
  }

  async closePosition(
    symbol: string,
    quantity?: number,
    reason: Order['closeReason'] = 'MANUAL',
  ): Promise<Order> {
    const open = await this.getPositions()
    const position = open.find((p) => this.sameSymbol(p.symbol, symbol))
    if (!position) throw new Error(`No open CoinDCX position for ${symbol}.`)
    // Never reverse: clamp to what is actually held.
    const size = Math.min(quantity ?? position.quantity, position.quantity)
    if (size <= 0) throw new Error('Close quantity must be greater than zero.')
    const order = await this.placeOrder({
      symbol: position.symbol,
      side: position.side === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: Number(size.toFixed(4)),
      leverage: position.leverage,
    })
    return { ...order, closeReason: reason }
  }

  async modifyPosition(symbol: string, stopLoss?: number, takeProfit?: number): Promise<Position> {
    const open = await this.getPositions()
    const target = open.find((p) => this.sameSymbol(p.symbol, symbol))
    if (!target) throw new Error(`No open CoinDCX position for ${symbol}.`)
    await this.post('/v1/derivatives/futures/positions/tpsl', {
      market: this.toFuturesMarket(target.symbol),
      ...(takeProfit !== undefined ? { take_profit_price: String(takeProfit) } : {}),
      ...(stopLoss !== undefined ? { stop_loss_price: String(stopLoss) } : {}),
    })
    const refreshed = await this.getPositions()
    const found = refreshed.find((p) => this.sameSymbol(p.symbol, target.symbol))
    if (!found) throw new Error(`Position for ${symbol} disappeared after modification.`)
    return found
  }

    async getCandles(symbol: string, timeframe: string, limit = 200): Promise<Candle[]> {
    const pair = this.toFuturesMarket(symbol)
    const qs = new URLSearchParams({ pair, interval: timeframe, limit: String(limit) })
    const res = await fetch(`${CANDLES_URL}?${qs}`)
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`CoinDCX candles failed (${res.status}): ${text.slice(0, 160)}`)
    }
    const rows = JSON.parse(text) as {
      open: number
      high: number
      low: number
      close: number
      volume: number
      time: number
    }[]
    if (!Array.isArray(rows)) return []
    // Newest first upstream; the chart wants oldest first.
    return rows
      .map((r) => ({
        time: Math.floor(num(r.time) / 1000),
        open: num(r.open),
        high: num(r.high),
        low: num(r.low),
        close: num(r.close),
        volume: num(r.volume),
      }))
      .filter((c) => c.close > 0)
      .reverse()
  }

  /** CoinDCX futures markets are `B-BTC_USDT` while the UI asks for `BTCUSDT`. */
  private sameSymbol(a: string, b: string): boolean {
    const norm = (s: string) => s.replace(/^[BI]-/, '').replace(/[^a-z0-9]/gi, '').toUpperCase()
    return norm(a) === norm(b)
  }

  async getOpenOrders(): Promise<Order[]> {
    const rows = await this.post<FuturesOrderRow[]>('/v1/derivatives/futures/orders', {
      status: 'open',
      page: 1,
      size: 100,
    })
    if (!Array.isArray(rows)) return []
    return rows.map((r) => ({
      id: r.id ?? r.order_id ?? r.order_no ?? '',
      symbol: r.market ?? '',
      side: mapSide(r.side),
      type: mapOrderType(r.order_type),
      quantity: num(r.quantity),
      filledQuantity: 0,
      price: r.price === undefined ? undefined : num(r.price),
      status: mapStatus(r.status),
      timestamp: r.created_at ? num(r.created_at) * 1000 : Date.now(),
    }))
  }

  async getPositions(): Promise<Position[]> {
    const rows = await this.post<PositionRow[]>('/v1/derivatives/futures/positions', {
      page: 1,
      size: 100,
    })
    if (!Array.isArray(rows)) return []
    return rows
      .filter((r) => num(r.active_pos) !== 0)
      .map((r) => {
        const active = num(r.active_pos)
        const entry = num(r.entry_price)
        const current = num(r.cp) || entry
        const leverage = num(r.leverage) || 1
        const pnl = num(r.unrealised_profit)
        const margin = num(r.locked_user_margin)
        return {
          id: r.id,
          symbol: r.pair,
          side: active > 0 ? 'LONG' : 'SHORT',
          quantity: Math.abs(active),
          entryPrice: entry,
          currentPrice: current,
          pnl,
          pnlPercentage: margin > 0 ? Number(((pnl / margin) * 100).toFixed(2)) : 0,
          leverage,
          margin,
          stopLoss: r.stop_loss_trigger ? num(r.stop_loss_trigger) : undefined,
          takeProfit: r.take_profit_trigger ? num(r.take_profit_trigger) : undefined,
          openedAt: r.created_at ? num(r.created_at) * 1000 : undefined,
        }
      })
  }

  /** No verified order-history REST path exists; the journal records our own fills. */
  async getOrderHistory(): Promise<Order[]> {
    return []
  }

  async getTrades(): Promise<Trade[]> {
    return []
  }

  async previewSize(
    symbol: string,
    mode: SizeMode,
    input: number,
    leverage: number,
  ): Promise<SizePreview> {
    const quote = await this.getQuote(symbol)
    const lev = Math.min(Math.max(Math.round(leverage || 1), 1), this.capabilities.leverageMax)
    const price = mode === 'QUANTITY' ? quote.last : quote.ask
    // CoinDCX size is in underlying units. A "lot" is one unit of underlying
    // at the current leverage, so all three modes reduce to a quantity.
    const quantity = mode === 'MARGIN' ? (input * lev) / Math.max(price, 1e-9) : input
    const notional = quantity * price
    return {
      mode,
      input,
      quantity,
      notional: Number(notional.toFixed(2)),
      initialMargin: Number((notional / lev).toFixed(2)),
      estimatedFee: Number((notional * 0.0004).toFixed(2)),
      lotSize: 1,
      minQuantity: 0.001,
      maxQuantity: 1_000_000,
      quantityStep: 0.001,
    }
  }
}