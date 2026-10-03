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

const API_BASE = '/api'

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
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

// ------------------------------------------------------------------ market data

export const getSymbols = () => request<SymbolSpec[]>('/symbols')

export const getQuote = (symbol: string) =>
  request<Quote>(`/quote/paper?symbol=${encodeURIComponent(symbol)}`)

export const getQuotes = () => request<Quote[]>('/quotes')

export const getCandles = (symbol: string, timeframe: string, limit = 200) =>
  request<Candle[]>(
    `/candle/paper?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(
      timeframe,
    )}&limit=${limit}`,
  )

export const getOrderBook = (symbol: string) =>
  request<{ bids: any[]; asks: any[]; timestamp: number }>(
    `/orderbook?symbol=${encodeURIComponent(symbol)}`,
  )

// ------------------------------------------------------------------ account

export const getAccount = () => request<Account>('/account/paper')

export const getBalances = () => request<Balance[]>('/balances/paper')

// ------------------------------------------------------------------ orders

export const placeOrder = (order: OrderRequest) =>
  post<{ success: boolean; order: Order }>('/orders/paper', order)

export const getOpenOrders = () => request<Order[]>('/orders/paper/open')

export const getOrderHistory = () => request<Order[]>('/orders/paper')

export const cancelOrder = (orderId: string) =>
  request<{ success: boolean }>(`/orders/paper/${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
  })

export const previewSize = (
  symbol: string,
  mode: SizeMode,
  input: number,
  leverage: number,
) =>
  post<SizePreview>('/size-preview', { symbol, mode, input, leverage })

// ------------------------------------------------------------------ positions

export const getPositions = () => request<Position[]>('/positions/paper')

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

export const getHistory = () => request<Order[]>('/history/paper')

export const getJournal = () => request<Trade[]>('/journal/paper')

export const resetPaperAccount = () =>
  post<{ success: boolean; message: string }>('/paper/reset', {})