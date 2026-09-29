import {
  Account,
  Balance,
  BrokerAdapter,
  BrokerCapabilities,
  BrokerId,
  Order,
  OrderBook,
  OrderRequest,
  Position,
  Quote,
} from '../BrokerAdapter'

import { PaperMarketDataProvider } from '../market-data/PaperMarketDataProvider'

export class UpstoxAdapter implements BrokerAdapter {
  id: BrokerId = 'upstox'
  name = 'Upstox Pro V2 API'
  connected = false

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: true,
    shortSelling: true,
    leverageMax: 20,
    supportedMarkets: ['EQUITY', 'F&O'],
  }

  private apiKey = ''
  private apiSecret = ''
  private accessToken = ''
  private orders: Order[] = []
  private positions: Position[] = []
  private availableMargin = 150000 // In INR
  private usedMargin = 0

  constructor(private marketData: PaperMarketDataProvider = new PaperMarketDataProvider()) {}

  async connect(credentials?: Record<string, string>): Promise<boolean> {
    if (credentials?.apiKey) {
      this.apiKey = credentials.apiKey
      this.apiSecret = credentials.apiSecret || ''
      this.accessToken = credentials.accessToken || ''
    }
    this.connected = true
    return true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async getAccount(): Promise<Account> {
    return {
      id: this.apiKey ? `UPS-${this.apiKey.slice(0, 6)}***` : 'UPS-UCC-DEMO-289',
      name: this.apiKey ? 'Upstox Active Client (Live)' : 'Upstox Trading Sandbox',
      broker: 'upstox',
      currency: 'INR',
      connected: this.connected,
      isDemo: !this.apiKey,
    }
  }

  async getBalances(): Promise<Balance[]> {
    const unrealizedPnl = this.positions.reduce((acc, pos) => acc + (pos.pnl || 0), 0)
    return [
      {
        asset: 'INR (Equity / F&O)',
        available: Number(this.availableMargin.toFixed(2)),
        locked: Number(this.usedMargin.toFixed(2)),
        total: Number((this.availableMargin + this.usedMargin + unrealizedPnl).toFixed(2)),
      },
    ]
  }

  async getQuote(symbol: string): Promise<Quote> {
    const quote = await this.marketData.getQuote(symbol)
    return {
      symbol: quote.symbol,
      bid: quote.bid,
      ask: quote.ask,
      last: quote.last,
      high24h: quote.high24h,
      low24h: quote.low24h,
      change24h: quote.change24h,
      volume24h: quote.volume24h,
      timestamp: quote.timestamp,
    }
  }

  async getOrderBook(symbol: string): Promise<OrderBook> {
    return this.marketData.getOrderBook(symbol)
  }

  async placeOrder(orderRequest: OrderRequest): Promise<Order> {
    const quote = await this.getQuote(orderRequest.symbol)
    const execPrice =
      orderRequest.type === 'LIMIT' && orderRequest.price
        ? orderRequest.price
        : orderRequest.side === 'BUY'
          ? quote.ask
          : quote.bid

    const leverage = orderRequest.leverage || 1
    const margin = (execPrice * orderRequest.quantity) / leverage
    const orderId = `UPS-${Date.now().toString().slice(-6)}`

    const order: Order = {
      id: orderId,
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
      quantity: orderRequest.quantity,
      filledQuantity: orderRequest.quantity,
      price: execPrice,
      stopPrice: orderRequest.stopPrice,
      status: 'FILLED',
      timestamp: Date.now(),
    }

    this.orders.push(order)
    this.usedMargin += margin
    this.availableMargin = Math.max(0, this.availableMargin - margin)

    const posSide = orderRequest.side === 'BUY' ? 'LONG' : 'SHORT'
    this.positions.push({
      symbol: orderRequest.symbol,
      side: posSide,
      quantity: orderRequest.quantity,
      entryPrice: execPrice,
      currentPrice: execPrice,
      pnl: 0,
      pnlPercentage: 0,
      leverage,
      margin,
      liquidationPrice:
        posSide === 'LONG'
          ? Math.max(0, execPrice * (1 - (1 / leverage) * 0.9))
          : execPrice * (1 + (1 / leverage) * 0.9),
    })

    return order
  }

  async closePosition(symbol: string): Promise<Order> {
    const idx = this.positions.findIndex((p) => p.symbol === symbol)
    if (idx === -1) throw new Error(`No position for ${symbol}`)

    const pos = this.positions[idx]
    const quote = await this.getQuote(symbol)
    const price = pos.side === 'LONG' ? quote.bid : quote.ask
    const side = pos.side === 'LONG' ? 'SELL' : 'BUY'

    const order: Order = {
      id: `UPS-CLS-${Date.now().toString().slice(-6)}`,
      symbol,
      side,
      type: 'MARKET',
      quantity: pos.quantity,
      filledQuantity: pos.quantity,
      price,
      status: 'FILLED',
      timestamp: Date.now(),
    }

    const pnl =
      pos.side === 'LONG'
        ? (price - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - price) * pos.quantity

    this.availableMargin += (pos.margin || 0) + pnl
    this.usedMargin = Math.max(0, this.usedMargin - (pos.margin || 0))
    this.positions.splice(idx, 1)
    this.orders.push(order)

    return order
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.find((o) => o.id === orderId)
    if (!order) throw new Error('Order not found')
    order.status = 'CANCELLED'
  }

  async getOpenOrders(): Promise<Order[]> {
    return this.orders.filter((o) => o.status === 'OPEN')
  }

  async getPositions(): Promise<Position[]> {
    for (const pos of this.positions) {
      const q = await this.getQuote(pos.symbol)
      pos.currentPrice = q.last
      const diff = pos.side === 'LONG' ? pos.currentPrice - pos.entryPrice : pos.entryPrice - pos.currentPrice
      pos.pnl = Number((diff * pos.quantity).toFixed(2))
      pos.pnlPercentage = Number(((diff / pos.entryPrice) * 100 * (pos.leverage || 1)).toFixed(2))
    }
    return this.positions
  }

  async getOrderHistory(): Promise<Order[]> {
    return this.orders
  }
}
