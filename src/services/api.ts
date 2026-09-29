const API_BASE = '/api'

export interface OrderRequest {
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  quantity: number
  price?: number
  stopPrice?: number
  stopLoss?: number
  takeProfit?: number
  leverage?: number
}

export interface Quote {
  symbol: string
  bid: number
  ask: number
  last: number
  high24h?: number
  low24h?: number
  change24h?: number
  volume24h?: number
  timestamp: number
}

export interface Position {
  symbol: string
  side: 'LONG' | 'SHORT'
  quantity: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercentage: number
  leverage?: number
  margin?: number
  liquidationPrice?: number
  stopLoss?: number
  takeProfit?: number
}

export interface Order {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  quantity: number
  filledQuantity: number
  price?: number
  stopPrice?: number
  stopLoss?: number
  takeProfit?: number
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
  timestamp: number
  closeReason?: 'MANUAL' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'LIQUIDATION'
}

export interface Balance {
  asset: string
  available: number
  locked: number
  total: number
  equity?: number
  freeMargin?: number
  marginLevel?: number
}

export interface BrokerInfo {
  id: 'paper' | 'coindcx' | 'upstox' | 'delta'
  name: string
  connected: boolean
  capabilities: {
    spot: boolean
    futures: boolean
    options: boolean
    shortSelling: boolean
    leverageMax: number
    supportedMarkets: string[]
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP error ${res.status}`)
    }
    return res.json()
  } catch (err: any) {
    if (url.startsWith('/api')) {
      const directUrl = `http://127.0.0.1:3000${url}`
      const directRes = await fetch(directUrl, options)
      if (!directRes.ok) {
        const directErr = await directRes.json().catch(() => ({}))
        throw new Error(directErr.error || `Direct HTTP error ${directRes.status}`)
      }
      return directRes.json()
    }
    throw err
  }
}

export async function getBackendHealth() {
  return request<{ status: string; service: string }>(`${API_BASE}/health`)
}

export async function getBrokers(): Promise<BrokerInfo[]> {
  return request<BrokerInfo[]>(`${API_BASE}/brokers`)
}

export async function connectBroker(broker: string, credentials?: Record<string, string>) {
  return request<{ success: boolean; message: string }>(`${API_BASE}/broker/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broker, credentials }),
  })
}

export async function getQuote(symbol: string): Promise<Quote> {
  return request<Quote>(`${API_BASE}/quote?symbol=${encodeURIComponent(symbol)}`)
}

export async function getOrderBook(symbol: string) {
  return request<{ bids: any[]; asks: any[]; timestamp: number }>(
    `${API_BASE}/orderbook?symbol=${encodeURIComponent(symbol)}`,
  )
}

export async function getCandles(symbol: string, timeframe = '1m', limit = 120) {
  return request<any[]>(
    `${API_BASE}/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`,
  )
}

export async function placeOrder(orderRequest: OrderRequest, broker = 'paper') {
  return request<{ success: boolean; order: Order }>(`${API_BASE}/order/${broker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderRequest),
  })
}

export async function modifyPosition(
  symbol: string,
  stopLoss?: number,
  takeProfit?: number,
  broker = 'paper',
) {
  return request<{ success: boolean; position: Position }>(`${API_BASE}/position/modify/${broker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, stopLoss, takeProfit }),
  })
}

export async function closePosition(symbol: string, broker = 'paper') {
  return request<{ success: boolean; order: Order }>(`${API_BASE}/position/close/${broker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  })
}

export async function cancelOrder(orderId: string, broker = 'paper') {
  return request<{ success: boolean }>(`${API_BASE}/order/cancel/${broker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })
}

export async function getPositions(broker = 'paper'): Promise<Position[]> {
  return request<Position[]>(`${API_BASE}/positions/${broker}`)
}

export async function getOpenOrders(broker = 'paper'): Promise<Order[]> {
  return request<Order[]>(`${API_BASE}/orders/${broker}`)
}

export async function getOrderHistory(broker = 'paper'): Promise<Order[]> {
  return request<Order[]>(`${API_BASE}/history/${broker}`)
}

export async function getBalances(broker = 'paper'): Promise<Balance[]> {
  return request<Balance[]>(`${API_BASE}/balances/${broker}`)
}
