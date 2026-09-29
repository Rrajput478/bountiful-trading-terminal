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
  name = 'CoinDCX Pro (Crypto)'
  connected = true

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: false,
    shortSelling: true,
    leverageMax: 50,
    supportedMarkets: ['CRYPTO'],
  }

  private orders: Order[] = []
  private positions: Position[] = []
  private availableBalance = 50000
  private lockedMargin = 0

  constructor(private marketData: PaperMarketDataProvider = new PaperMarketDataProvider()) {}

  async connect(credentials?: Record<string, string>): Promise<boolean> {
    this.connected = true
    return true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async getAccount(): Promise<Account> {
    return {
      id: 'COINDCX-LIVE-001',
      name: 'CoinDCX Pro Trading Account',
      broker: 'coindcx',
      currency: 'USDT',
      connected: this.connected,
      isDemo: false,
    }
  }

  async getBalances(): Promise<Balance[]> {
    const unrealizedPnl = this.positions.reduce((acc, pos) => acc + (pos.pnl || 0), 0)
    const equity = this.availableBalance + this.lockedMargin + unrealizedPnl

    return [
      {
        asset: 'USDT',
        available: Number(this.availableBalance.toFixed(2)),
        locked: Number(this.lockedMargin.toFixed(2)),
        total: Number((this.availableBalance + this.lockedMargin).toFixed(2)),
        equity: Number(equity.toFixed(2)),
        freeMargin: Number(this.availableBalance.toFixed(2)),
        marginLevel: this.lockedMargin > 0 ? Number(((equity / this.lockedMargin) * 100).toFixed(1)) : 9999,
      },
    ]
  }

  async getQuote(symbol: string): Promise<Quote> {
    return this.marketData.getQuote(symbol)
  }

  async getOrderBook(symbol: string): Promise<OrderBook> {
    return this.marketData.getOrderBook(symbol)
  }

  async placeOrder(orderRequest: OrderRequest): Promise<Order> {
    const quote = await this.getQuote(orderRequest.symbol)
    const executionPrice = orderRequest.side === 'BUY' ? quote.ask : quote.bid
    const leverage = orderRequest.leverage || 1
    const notional = executionPrice * orderRequest.quantity
    const requiredMargin = leverage > 1 ? notional / leverage : notional

    const order: Order = {
      id: `CDX-${Date.now().toString().slice(-6)}`,
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
      quantity: orderRequest.quantity,
      filledQuantity: orderRequest.quantity,
      price: executionPrice,
      stopLoss: orderRequest.stopLoss,
      takeProfit: orderRequest.takeProfit,
      status: 'FILLED',
      timestamp: Date.now(),
    }

    this.orders.push(order)
    this.lockedMargin += requiredMargin
    this.availableBalance = Math.max(0, this.availableBalance - requiredMargin)

    const posSide = orderRequest.side === 'BUY' ? 'LONG' : 'SHORT'
    this.positions.push({
      symbol: orderRequest.symbol,
      side: posSide,
      quantity: orderRequest.quantity,
      entryPrice: executionPrice,
      currentPrice: executionPrice,
      pnl: 0,
      pnlPercentage: 0,
      leverage,
      margin: requiredMargin,
      stopLoss: orderRequest.stopLoss,
      takeProfit: orderRequest.takeProfit,
      liquidationPrice: Number((posSide === 'LONG' ? executionPrice * 0.85 : executionPrice * 1.15).toFixed(2)),
    })

    return order
  }

  async modifyPosition(symbol: string, stopLoss?: number, takeProfit?: number): Promise<Position> {
    const pos = this.positions.find((p) => p.symbol === symbol)
    if (!pos) throw new Error(`No active position for ${symbol}`)
    pos.stopLoss = stopLoss
    pos.takeProfit = takeProfit
    return pos
  }

  async closePosition(symbol: string): Promise<Order> {
    const idx = this.positions.findIndex((p) => p.symbol === symbol)
    if (idx === -1) throw new Error(`Position ${symbol} not found`)
    const pos = this.positions[idx]
    const quote = await this.getQuote(symbol)
    const closePrice = pos.side === 'LONG' ? quote.bid : quote.ask

    const order: Order = {
      id: `CLS-CDX-${Date.now().toString().slice(-6)}`,
      symbol,
      side: pos.side === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: pos.quantity,
      filledQuantity: pos.quantity,
      price: closePrice,
      status: 'FILLED',
      timestamp: Date.now(),
    }

    const diff = pos.side === 'LONG' ? closePrice - pos.entryPrice : pos.entryPrice - closePrice
    this.availableBalance += (pos.margin || 0) + diff * pos.quantity
    this.lockedMargin = Math.max(0, this.lockedMargin - (pos.margin || 0))
    this.positions.splice(idx, 1)
    this.orders.push(order)
    return order
  }

  async cancelOrder(orderId: string): Promise<void> {
    const o = this.orders.find((ord) => ord.id === orderId)
    if (o) o.status = 'CANCELLED'
  }

  async getOpenOrders(): Promise<Order[]> {
    return this.orders.filter((o) => o.status === 'OPEN')
  }

  async getPositions(): Promise<Position[]> {
    for (const p of this.positions) {
      const q = await this.getQuote(p.symbol)
      p.currentPrice = q.last
      const diff = p.side === 'LONG' ? p.currentPrice - p.entryPrice : p.entryPrice - p.currentPrice
      p.pnl = Number((diff * p.quantity).toFixed(2))
      p.pnlPercentage = Number(((diff / p.entryPrice) * 100 * (p.leverage || 1)).toFixed(2))
    }
    return this.positions
  }

  async getOrderHistory(): Promise<Order[]> {
    return this.orders
  }
}
