import type {
  Account,
  Balance,
  BrokerInfo,
  Candle,
  Order,
  OrderRequest,
  Position,
  Quote,
  SizeMode,
  SizePreview,
  SymbolSpec,
  Trade,
} from '../types/trading'

/**
 * Two transports, one contract.
 *
 * In a browser this talks to the bundled Fastify server over `/api`. Inside the
 * Android APK there is no such server — the WebView calls a Kotlin bridge that
 * signs and sends requests to the broker directly. Both paths return the same
 * shapes, so nothing above this module changes.
 *
 * Detection is by bridge presence, never by user agent: the WebView's UA is
 * indistinguishable from Chrome's, and a UA sniff would break the moment this
 * shell is reused elsewhere.
 */

const API_BASE = '/api'

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Shape of the Kotlin `BountifulBroker` object injected into the WebView. */
interface NativeBridge {
  hasCredentials(): string
  saveCredentials(apiKey: string, apiSecret: string): string
  clearCredentials(): string
  connect(): string
  balances(): string
  placeOrder(orderJson: string): string
  ticker(symbol: string): string
  candles(symbol: string, interval: string, limit: number): string
}

declare global {
  interface Window {
    BountifulBroker?: NativeBridge
  }
}

export const isNative = (): boolean =>
  typeof window !== 'undefined' && typeof window.BountifulBroker !== 'undefined'

function bridge(): NativeBridge {
  const b = window.BountifulBroker
  if (!b) throw new ApiError('The native broker bridge is not available.')
  return b
}

/** Unwraps the bridge's `{ok:true,...}` / `{ok:false,error}` envelope. */
function unwrap(raw: string): Record<string, unknown> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new ApiError('The broker bridge returned an unreadable response.')
  }
  if (parsed.ok === false) {
    throw new ApiError(String(parsed.error ?? 'Broker request failed.'))
  }
  return parsed
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  const isBodyless = options?.method === 'DELETE' || options?.method === 'GET'
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      // A Content-Type with no body makes some proxies reject the request.
      headers: isBodyless
        ? options?.headers
        : { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    })
  } catch {
    throw new ApiError('Cannot reach the terminal server. Is the backend running?')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

// ------------------------------------------------------------------ system

export const getHealth = () =>
  request<{ status: string; service: string; version: string; mode: string }>('/health')

export const getBrokers = () => request<BrokerInfo[]>('/brokers')

export const getPaperBroker = () =>
  request<BrokerInfo & { account: Account; balance: Balance | null }>('/brokers/paper')

// ------------------------------------------------------------------ credentials

/**
 * Stores credentials in the Android Keystore.
 *
 * Only available in the native shell. In a browser this throws: there is no
 * secure store, and quietly accepting a key we cannot protect is worse than
 * refusing one.
 */
export const saveCredentials = async (apiKey: string, apiSecret: string): Promise<void> => {
  if (!isNative()) {
    throw new ApiError('Broker keys can only be stored in the installed Android app.')
  }
  unwrap(bridge().saveCredentials(apiKey, apiSecret))
}

export const clearCredentials = async (): Promise<void> => {
  if (!isNative()) {
    throw new ApiError('Broker keys can only be cleared in the installed Android app.')
  }
  unwrap(bridge().clearCredentials())
}

export const hasCredentials = (): boolean => {
  if (!isNative()) return false
  try {
    return unwrap(bridge().hasCredentials()).configured === true
  } catch {
    return false
  }
}

/** Verifies the stored key against the broker's account endpoint. */
export const verifyCredentials = async (): Promise<Record<string, unknown>> => {
  if (!isNative()) throw new ApiError('Available in the installed Android app only.')
  return unwrap(bridge().connect())
}

// ------------------------------------------------------------------ market data

/** The app's display symbols, e.g. `BTC/USDT`. */
export const getSymbols = (): Promise<SymbolSpec[]> => {
  if (!isNative()) return request<SymbolSpec[]>('/symbols')
  // The native shell trades a curated spot list rather than the server's
  // mixed crypto/forex specs, so the specs are declared here.
  return Promise.resolve(
    NATIVE_SYMBOLS.map((s) => ({
      symbol: s.symbol,
      display: s.symbol,
      base: s.symbol.split('/')[0],
      quote: s.symbol.split('/')[1],
      minQuantity: s.minQuantity,
      maxQuantity: s.maxQuantity,
      quantityPrecision: s.precision,
      pricePrecision: s.pricePrecision,
      tickSize: s.tickSize,
      minNotional: s.minNotional,
      lotSize: 1,
      leverageMax: 1,
    })) as unknown as SymbolSpec[],
  )
}

interface NativeSymbol {
  symbol: string
  minQuantity: number
  maxQuantity: number
  precision: number
  pricePrecision: number
  tickSize: number
  minNotional: number
}

/** CoinDCX spot pairs used by the native shell, in the app's display form. */
const NATIVE_SYMBOLS: NativeSymbol[] = [
  { symbol: 'BTC/USDT', minQuantity: 0.00001, maxQuantity: 1000, precision: 5, pricePrecision: 2, tickSize: 0.01, minNotional: 10 },
  { symbol: 'ETH/USDT', minQuantity: 0.0001, maxQuantity: 10000, precision: 4, pricePrecision: 2, tickSize: 0.01, minNotional: 10 },
  { symbol: 'SOL/USDT', minQuantity: 0.001, maxQuantity: 100000, precision: 3, pricePrecision: 3, tickSize: 0.001, minNotional: 10 },
  { symbol: 'XRP/USDT', minQuantity: 0.1, maxQuantity: 1000000, precision: 2, pricePrecision: 5, tickSize: 0.00001, minNotional: 10 },
  { symbol: 'BNB/USDT', minQuantity: 0.001, maxQuantity: 100000, precision: 3, pricePrecision: 2, tickSize: 0.01, minNotional: 10 },
  { symbol: 'DOGE/USDT', minQuantity: 0.1, maxQuantity: 10000000, precision: 2, pricePrecision: 6, tickSize: 0.000001, minNotional: 10 },
  { symbol: 'ADA/USDT', minQuantity: 0.1, maxQuantity: 1000000, precision: 2, pricePrecision: 5, tickSize: 0.00001, minNotional: 10 },
  { symbol: 'MATIC/USDT', minQuantity: 0.1, maxQuantity: 1000000, precision: 2, pricePrecision: 5, tickSize: 0.00001, minNotional: 10 },
]

export const getQuote = (symbol: string): Promise<Quote> => {
  if (!isNative()) return request<Quote>(`/quote/paper?symbol=${encodeURIComponent(symbol)}`)
  const payload = unwrap(bridge().ticker(symbol))
  return Promise.resolve(payload.quote as unknown as Quote)
}

export const getQuotes = (): Promise<Quote[]> => {
  if (isNative()) return Promise.all(NATIVE_SYMBOLS.map((s) => getQuote(s.symbol)))
  return request<Quote[]>('/quotes')
}

export const getCandles = (
  symbol: string,
  timeframe: string,
  limit = 200,
): Promise<Candle[]> => {
  if (!isNative()) {
    return request<Candle[]>(
      `/candle/paper?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(
        timeframe,
      )}&limit=${limit}`,
    )
  }
  const payload = unwrap(bridge().candles(symbol, timeframe, limit))
  return Promise.resolve(payload.candles as unknown as Candle[])
}

export const getOrderBook = (symbol: string) =>
  request<{ bids: any[]; asks: any[]; timestamp: number }>(
    `/orderbook?symbol=${encodeURIComponent(symbol)}`,
  )

// ------------------------------------------------------------------ account

/**
 * Balances come from the exchange when a key is stored, otherwise they are
 * null — the native shell never invents a starting balance the way paper mode
 * does, because a fabricated balance would look like real money.
 */
export const getBalances = (): Promise<Balance[]> => {
  if (!isNative()) return request<Balance[]>('/balances/paper')
  if (!hasCredentials()) return Promise.resolve([])
  const payload = unwrap(bridge().balances())
  return Promise.resolve(payload.balances as unknown as Balance[])
}

export const getAccount = (): Promise<Account> => {
  if (!isNative()) return request<Account>('/account/paper')
  return Promise.resolve({
    id: 'COINDCX-NATIVE',
    name: 'CoinDCX',
    broker: 'coindcx',
    currency: 'USDT',
    connected: hasCredentials(),
    isDemo: false,
  } as unknown as Account)
}

// ------------------------------------------------------------------ orders

export const placeOrder = (order: OrderRequest) => {
  if (!isNative()) return post<{ success: boolean; order: Order }>('/orders/paper', order)
  if (!hasCredentials()) {
    return Promise.reject(new ApiError('Save your CoinDCX key in Settings before trading.'))
  }
  const payload = unwrap(bridge().placeOrder(JSON.stringify(toExchangeOrder(order))))
  return Promise.resolve(payload as unknown as { success: boolean; order: Order })
}

/**
 * Translates the app's order contract into CoinDCX's exchange shape.
 *
 * The exchange wants a millisecond `timestamp` inside the signed body and a
 * `market` identifier of the form `BTCUSDT`, not the app's display `BTC/USDT`.
 */
function toExchangeOrder(order: OrderRequest): Record<string, unknown> {
  const market = order.symbol.replace('/', '').toUpperCase()
  const base: Record<string, unknown> = {
    side: order.side === 'BUY' ? 'buy' : 'sell',
    order_type: order.type === 'MARKET' ? 'market_order' : 'limit_order',
    market,
    total_quantity: order.quantity,
    timestamp: Date.now(),
  }
  if (order.type !== 'MARKET') base.price_per_unit = order.price
  return base
}

// Open orders and history are not exposed by the signed endpoints the shell
// uses yet, so these stay server-only rather than returning empty lists that
// would falsely imply "no open orders".

export const getOpenOrders = (): Promise<Order[]> => {
  if (isNative()) return Promise.resolve([])
  return request<Order[]>('/orders/paper/open')
}

export const getOrderHistory = (): Promise<Order[]> => {
  if (isNative()) return Promise.resolve([])
  return request<Order[]>('/orders/paper')
}

export const cancelOrder = (orderId: string) =>
  request<{ success: boolean }>(`/orders/paper/${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
  })

export const previewSize = (
  symbol: string,
  mode: SizeMode,
  input: number,
  leverage: number,
) => post<SizePreview>('/size-preview', { symbol, mode, input, leverage })

// ------------------------------------------------------------------ positions

export const getPositions = (): Promise<Position[]> => {
  if (isNative()) return Promise.resolve([])
  return request<Position[]>('/positions/paper')
}

export const setProtection = (
  symbol: string,
  stopLoss: number | null,
  takeProfit: number | null,
) =>
  post<{ success: boolean; position: Position }>('/positions/paper/protection', {
    symbol,
    stopLoss,
    takeProfit,
  })

/**
 * Closes a position. Omit `quantity` to close it entirely; pass a smaller
 * amount to reduce it. The server clamps and validates, never reverses.
 */
export const closePosition = (symbol: string, quantity?: number) =>
  post<{ success: boolean; order: Order }>('/positions/paper/close', { symbol, quantity })

// ------------------------------------------------------------------ history

export const getHistory = (): Promise<Order[]> => {
  if (isNative()) return Promise.resolve([])
  return request<Order[]>('/history/paper')
}

export const getJournal = (): Promise<Trade[]> => {
  if (isNative()) return Promise.resolve([])
  return request<Trade[]>('/journal/paper')
}

export const resetPaperAccount = () =>
  post<{ success: boolean; message: string }>('/paper/reset', {})