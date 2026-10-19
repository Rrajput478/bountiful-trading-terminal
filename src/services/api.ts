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
 * One transport: HTTP to the terminal server.
 *
 * The broker API key lives only in the server's environment. Nothing in this
 * bundle — JavaScript, native shell, or otherwise — ever sees the secret, so a
 * compromised or inspected APK yields no credentials.
 *
 * Two origins matter. In a browser the bundle is served by the same Fastify
 * process that exposes `/api`, so requests stay same-origin and no CORS or
 * cookie complexity appears. Inside the Android shell the bundle is served from
 * the device, so it points at the configured server URL instead.
 */

/** Reads the server origin baked into the native shell at build time. */
function nativeOrigin(): string {
  const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim()
  return configured ? configured.replace(/\/+$/, '') : ''
}

const API_BASE = nativeOrigin() ? `${nativeOrigin()}/api` : '/api'

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * The access token that unlocks this deployment.
 *
 * Kept in localStorage so a reload on a phone does not re-prompt. It is a
 * shared secret for the operator's own server, not a broker credential: the
 * CoinDCX key stays server-side and is never sent to, or accepted by, the app.
 */
function accessToken(): string {
  try {
    return window.localStorage.getItem('bountiful.accessToken') ?? ''
  } catch {
    return ''
  }
}

export function setAccessToken(token: string): void {
  try {
    if (token) window.localStorage.setItem('bountiful.accessToken', token)
    else window.localStorage.removeItem('bountiful.accessToken')
  } catch {
    // Private browsing can refuse storage; the session then simply re-prompts.
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  const isBodyless = options?.method === 'DELETE' || options?.method === 'GET'
  const token = accessToken()
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      // A Content-Type with no body makes some proxies reject the request.
      headers: {
        ...(token ? { 'X-Access-Token': token } : {}),
        ...(isBodyless
          ? options?.headers
          : { 'Content-Type': 'application/json', ...(options?.headers || {}) }),
      },
    })
  } catch {
    throw new ApiError(
      nativeOrigin()
        ? `Cannot reach the terminal server at ${nativeOrigin()}. Check your connection.`
        : 'Cannot reach the terminal server. Is the backend running?',
    )
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
  request<{
    status: string
    service: string
    version: string
    mode: string
    activeBroker: string
    liveTradingEnabled: boolean
  }>('/health')

export const getBrokers = () => request<BrokerInfo[]>('/brokers')

export const getPaperBroker = () =>
  request<BrokerInfo & { account: Account; balance: Balance | null }>('/brokers/paper')

// ------------------------------------------------------------------ broker selection

/**
 * Switches the active broker on the server.
 *
 * The credentials for that broker already live in the server's environment —
 * this only selects which configured account the terminal talks to.
 */
export const selectBroker = (brokerId: string) =>
  post<{ success: boolean; broker: BrokerInfo }>('/broker/select', { brokerId })

// ------------------------------------------------------------------ market data

export const getSymbols = () => request<SymbolSpec[]>('/symbols')

export const getQuote = (symbol: string) =>
  request<Quote>(`/quote?symbol=${encodeURIComponent(symbol)}`)

export const getQuotes = () => request<Quote[]>('/quotes')

export const getCandles = (symbol: string, timeframe: string, limit = 200) =>
  request<Candle[]>(
    `/candle?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(
      timeframe,
    )}&limit=${limit}`,
  )

export const getOrderBook = (symbol: string) =>
  request<{ bids: unknown[]; asks: unknown[]; timestamp: number }>(
    `/orderbook?symbol=${encodeURIComponent(symbol)}`,
  )

// ------------------------------------------------------------------ account

export const getBalances = () => request<Balance[]>('/balances')

export const getAccount = () => request<Account>('/account')

// ------------------------------------------------------------------ orders

export const placeOrder = (order: OrderRequest) =>
  post<{ success: boolean; order: Order }>('/orders', order)

export const getOpenOrders = () => request<Order[]>('/orders/open')

export const getOrderHistory = () => request<Order[]>('/orders')

export const cancelOrder = (orderId: string) =>
  request<{ success: boolean }>(`/orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
  })

export const previewSize = (
  symbol: string,
  mode: SizeMode,
  input: number,
  leverage: number,
) => post<SizePreview>('/size-preview', { symbol, mode, input, leverage })

// ------------------------------------------------------------------ positions

export const getPositions = () => request<Position[]>('/positions')

export const setProtection = (symbol: string, stopLoss: number | null, takeProfit: number | null) =>
  post<{ success: boolean; position: Position }>('/positions/protection', {
    symbol,
    stopLoss,
    takeProfit,
  })

/**
 * Closes a position. Omit `quantity` to close it entirely; pass a smaller
 * amount to reduce it. The server clamps and validates, never reverses.
 */
export const closePosition = (symbol: string, quantity?: number) =>
  post<{ success: boolean; order: Order }>('/positions/close', { symbol, quantity })

// ------------------------------------------------------------------ history

export const getHistory = () => request<Order[]>('/history')

export const getJournal = () => request<Trade[]>('/journal')

export const resetPaperAccount = () =>
  post<{ success: boolean; message: string }>('/paper/reset', {})