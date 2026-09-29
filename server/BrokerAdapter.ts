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
  high24h?: number
  low24h?: number
  change24h?: number
  volume24h?: number
  timestamp: number
}

export interface OrderBookEntry {
  price: number
  quantity: number
  total: number
}

export interface OrderBook {
  symbol: string
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
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

export interface OrderRequest {
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  price?: number
  stopPrice?: number
  stopLoss?: number
  takeProfit?: number
  leverage?: number
}

export interface Order {
  id: string
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  filledQuantity: number
  price?: number
  stopPrice?: number
  stopLoss?: number
  takeProfit?: number
  status: OrderStatus
  timestamp: number
  closeReason?: 'MANUAL' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'LIQUIDATION'
}

export interface Account {
  id: string
  name: string
  broker: BrokerId
  currency: string
  connected: boolean
  isDemo?: boolean
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

export interface BrokerCapabilities {
  spot: boolean
  futures: boolean
  options: boolean
  shortSelling: boolean
  leverageMax: number
  supportedMarkets: ('CRYPTO' | 'EQUITY' | 'F&O')[]
}

export interface BrokerAdapter {
  id: BrokerId
  name: string
  capabilities: BrokerCapabilities
  connected: boolean

  connect(credentials?: Record<string, string>): Promise<boolean>
  disconnect(): Promise<void>

  getAccount(): Promise<Account>
  getBalances(): Promise<Balance[]>
  getQuote(symbol: string): Promise<Quote>
  getOrderBook(symbol: string): Promise<OrderBook>

  placeOrder(order: OrderRequest): Promise<Order>
  cancelOrder(orderId: string): Promise<void>
  closePosition(symbol: string, reason?: 'MANUAL' | 'TAKE_PROFIT' | 'STOP_LOSS'): Promise<Order>
  modifyPosition(symbol: string, stopLoss?: number, takeProfit?: number): Promise<Position>

  getOpenOrders(): Promise<Order[]>
  getPositions(): Promise<Position[]>
  getOrderHistory(): Promise<Order[]>
}
