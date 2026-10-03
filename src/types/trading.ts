export type OrderSide = 'BUY' | 'SELL'
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
export type PositionSide = 'LONG' | 'SHORT'
export type SizeMode = 'LOT' | 'QUANTITY' | 'MARGIN'
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D'
export type Theme = 'dark' | 'light'
export type WorkspaceTab = 'POSITIONS' | 'ORDERS' | 'JOURNAL'

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

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

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
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
  leverage?: number
  margin?: number
  fee?: number
  realizedPnl?: number
  entryPrice?: number
  exitPrice?: number
  positionSide?: PositionSide
}

export interface Position {
  id?: string
  symbol: string
  side: PositionSide
  quantity: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercentage?: number
  leverage?: number
  margin?: number
  liquidationPrice?: number
  stopLoss?: number
  takeProfit?: number
  openedAt?: number
}

export interface Trade {
  id: string
  symbol: string
  side: PositionSide
  quantity: number
  entryPrice: number
  exitPrice: number
  pnl: number
  fee: number
  closeReason?: Order['closeReason']
  openedAt: number
  closedAt: number
  durationMs: number
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

export interface Account {
  id: string
  name: string
  broker: string
  currency: string
  connected: boolean
  isDemo?: boolean
}

export interface BrokerInfo {
  id: string
  name: string
  description?: string
  connected: boolean
  isLive?: boolean
  enabled?: boolean
  capabilities: {
    spot: boolean
    futures: boolean
    options: boolean
    shortSelling: boolean
    leverageMax: number
    supportedMarkets: string[]
  }
}

export interface SymbolSpec {
  symbol: string
  description: string
  category: 'CRYPTO' | 'FOREX' | 'INDIAN'
  digits: number
  point: number
  contractSize: number
  lotSize: number
  minQuantity: number
  maxQuantity: number
  quantityStep: number
  tickValue: number
  swapLong: number
  swapShort: number
  leverageMax: number
  spreadPoints: number
}

export interface SizePreview {
  mode: SizeMode
  input: number
  quantity: number
  notional: number
  initialMargin: number
  estimatedFee: number
  lotSize: number
  minQuantity: number
  maxQuantity: number
  quantityStep: number
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

/** Which protection line the user last grabbed on the chart. */
export type ProtectionTarget = 'TP' | 'SL' | null