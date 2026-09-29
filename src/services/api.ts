const API_BASE_URL = 'http://127.0.0.1:3000'

export interface OrderRequest {
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  quantity: number
  price?: number
  stopPrice?: number
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
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
  timestamp: number
}

export interface Balance {
  asset: string
  available: number
  locked: number
  total: number
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

export async function getBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/api/health`)
  if (!response.ok) throw new Error('Backend is not responding')
  return response.json()
}

export async function getBrokers(): Promise<BrokerInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/brokers`)
  if (!response.ok) throw new Error('Failed to fetch brokers')
  return response.json()
}

export async function connectBroker(broker: string, credentials?: Record<string, string>) {
  const response = await fetch(`${API_BASE_URL}/api/broker/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broker, credentials }),
  })
  if (!response.ok) throw new Error('Failed to connect broker')
  return response.json()
}

export async function getQuote(symbol: string): Promise<Quote> {
  const response = await fetch(`${API_BASE_URL}/api/quote?symbol=${encodeURIComponent(symbol)}`)
  if (!response.ok) throw new Error('Failed to fetch quote')
  return response.json()
}

export async function getOrderBook(symbol: string) {
  const response = await fetch(`${API_BASE_URL}/api/orderbook?symbol=${encodeURIComponent(symbol)}`)
  if (!response.ok) throw new Error('Failed to fetch order book')
  return response.json()
}

export async function getCandles(symbol: string, timeframe = '1m', limit = 120) {
  const response = await fetch(
    `${API_BASE_URL}/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
  )
  if (!response.ok) throw new Error('Failed to fetch candles')
  return response.json()
}

export async function placeOrder(orderRequest: OrderRequest, broker = 'paper') {
  const response = await fetch(`${API_BASE_URL}/api/order/${broker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderRequest),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Order placement failed')
  }
  return response.json()
}

export async function closePosition(symbol: string, broker = 'paper') {
  const response = await fetch(`${API_BASE_URL}/api/position/close/${broker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to close position')
  }
  return response.json()
}

export async function cancelOrder(orderId: string, broker = 'paper') {
  const response = await fetch(`${API_BASE_URL}/api/order/cancel/${broker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })
  if (!response.ok) throw new Error('Failed to cancel order')
  return response.json()
}

export async function getPositions(broker = 'paper'): Promise<Position[]> {
  const response = await fetch(`${API_BASE_URL}/api/positions/${broker}`)
  if (!response.ok) throw new Error('Failed to fetch positions')
  return response.json()
}

export async function getOpenOrders(broker = 'paper'): Promise<Order[]> {
  const response = await fetch(`${API_BASE_URL}/api/orders/${broker}`)
  if (!response.ok) throw new Error('Failed to fetch orders')
  return response.json()
}

export async function getOrderHistory(broker = 'paper'): Promise<Order[]> {
  const response = await fetch(`${API_BASE_URL}/api/history/${broker}`)
  if (!response.ok) throw new Error('Failed to fetch order history')
  return response.json()
}

export async function getBalances(broker = 'paper'): Promise<Balance[]> {
  const response = await fetch(`${API_BASE_URL}/api/balances/${broker}`)
  if (!response.ok) throw new Error('Failed to fetch balances')
  return response.json()
}
