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

export class CoinDcxAdapter implements BrokerAdapter {
  id: BrokerId = 'coindcx'
  name = 'CoinDCX Pro / API'
  connected = false

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: false,
    shortSelling: true,
    leverageMax: 50,
    supportedMarkets: ['CRYPTO'],
  }

  private apiKey = ''
  private apiSecret = ''
  private orders: Order[] = []
  private positions: Position[] = []
  private availableBalance = 25000 // In USDT / INR
  private lockedMargin = 0

  constructor(private marketData: PaperMarketDataProvider = new PaperMarketDataProvider()) {}

  async connect(credentials?: Record<string, string>): Promise<boolean> {
    if (credentials?.apiKey) {
      this.apiKey = credentials.apiKey
      this.apiSecret = credentials.apiSecret || ''
    }
    this.connected = true
    return true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async getAccount(): Promise<Account> {
    return {
      id: this.apiKey ? `CDX-${this.apiKey.slice(0, 6)}***` : 'CDX-SANDBOX-DEMO',
      name: this.apiKey ? 'CoinDCX Live API Linked' : 'CoinDCX Sandbox Account',
      broker: 'coindcx',
      currency: 'USDT',
      connected: this.connected,
      isDemo: !this.apiKey,
    }
  }

  async getBalances(): Promise<Balance[]> {
    const unrealizedPnl = this.positions.reduce((acc, pos) => acc + (pos.pnl || 0), 0)
    return [
      {
        asset: 'USDT',
        available: Number(this.availableBalance.toFixed(2)),
        locked: Number(this.lockedMargin.toFixed(2)),
        total: Number((this.availableBalance + this.lockedMargin + unrealizedPnl).toFixed(2)),
      },
      {
        asset: 'INR',
        available: Number((this.availableBalance * 86.5).toFixed(2)),
        locked: Number((this.lockedMargin * 86.5).toFixed(2)),
        total: Number(((this.availableBalance + this.lockedMargin + unrealizedPnl) * 86.5).toFixed(2)),
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
    const orderId = `CDX-${Date.now().toString().slice(-6)}`

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
    this.lockedMargin += margin
    this.availableBalance = Math.max(0, this.availableBalance - margin)

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
      id: `CDX-CLS-${Date.now().toString().slice(-6)}`,
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

    this.availableBalance += (pos.margin || 0) + pnl
    this.lockedMargin = Math.max(0, this.lockedMargin - (pos.margin || 0))
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
