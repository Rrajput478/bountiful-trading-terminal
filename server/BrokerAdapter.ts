export type BrokerId =
  | 'paper'
  | 'coindcx'
  | 'upstox'
  | 'delta'

export type OrderSide = 'BUY' | 'SELL'

export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP'
  | 'STOP_LIMIT'

export type OrderStatus =
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'

export interface Quote {
  symbol: string
  bid: number
  ask: number
  last: number
  timestamp: number
}

export interface Position {
  symbol: string
  side: 'LONG' | 'SHORT'
  quantity: number
  entryPrice: number
  currentPrice: number
  pnl: number
}

export interface OrderRequest {
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  price?: number
}

export interface Order {
  id: string
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  filledQuantity: number
  price?: number
  status: OrderStatus
  timestamp: number
}

export interface Account {
  id: string
  name: string
}

export interface Balance {
  asset: string
  available: number
  locked: number
}

export interface BrokerCapabilities {
  spot: boolean
  futures: boolean
  options: boolean
  shortSelling: boolean
}

export interface BrokerAdapter {
  id: BrokerId
  name: string
  capabilities: BrokerCapabilities

  connect(): Promise<void>
  disconnect(): Promise<void>

  getAccount(): Promise<Account>
  getBalances(): Promise<Balance[]>

  getQuote(symbol: string): Promise<Quote>

  placeOrder(order: OrderRequest): Promise<Order>
  cancelOrder(orderId: string): Promise<void>

  getOpenOrders(): Promise<Order[]>
  getPositions(): Promise<Position[]>
  getOrderHistory(): Promise<Order[]>
}