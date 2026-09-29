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

export class PaperTradingAdapter implements BrokerAdapter {
  id: BrokerId = 'paper'
  name = 'Paper Trading Terminal'
  connected = true

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: true,
    shortSelling: true,
    leverageMax: 100,
    supportedMarkets: ['CRYPTO', 'EQUITY', 'F&O'],
  }

  private orders: Order[] = []
  private positions: Position[] = []
  private initialBalance = 100000 // $100k or ₹100k
  private availableBalance = 100000
  private lockedMargin = 0

  constructor(private marketData: PaperMarketDataProvider = new PaperMarketDataProvider()) {}

  async connect(): Promise<boolean> {
    this.connected = true
    return true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async getAccount(): Promise<Account> {
    return {
      id: 'ACC-PAPER-DEMO-99',
      name: 'Simulated Fast Terminal Account',
      broker: 'paper',
      currency: 'USDT',
      connected: this.connected,
      isDemo: true,
    }
  }

  async getBalances(): Promise<Balance[]> {
    const unrealizedPnl = this.positions.reduce((acc, pos) => acc + (pos.pnl || 0), 0)
    const totalBalance = this.availableBalance + this.lockedMargin + unrealizedPnl

    return [
      {
        asset: 'USDT / INR',
        available: Number(this.availableBalance.toFixed(2)),
        locked: Number(this.lockedMargin.toFixed(2)),
        total: Number(totalBalance.toFixed(2)),
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
    const executionPrice =
      orderRequest.type === 'LIMIT' && orderRequest.price
        ? orderRequest.price
        : orderRequest.side === 'BUY'
          ? quote.ask
          : quote.bid

    const leverage = orderRequest.leverage || 1
    const notional = executionPrice * orderRequest.quantity
    const requiredMargin = leverage > 1 ? notional / leverage : notional

    if (requiredMargin > this.availableBalance && orderRequest.side === 'BUY') {
      // In paper trading, we still allow but warn or auto-cap if balance exceeds
    }

    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`

    // If LIMIT order and price not yet reached, can be open; for demo responsiveness, MARKET is instant FILLED
    const isInstant = orderRequest.type === 'MARKET' || !orderRequest.price
    const status = isInstant ? 'FILLED' : 'OPEN'

    const order: Order = {
      id: orderId,
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
      quantity: orderRequest.quantity,
      filledQuantity: isInstant ? orderRequest.quantity : 0,
      price: executionPrice,
      stopPrice: orderRequest.stopPrice,
      status,
      timestamp: Date.now(),
    }

    this.orders.push(order)

    if (isInstant) {
      this.lockedMargin += requiredMargin
      this.availableBalance = Math.max(0, this.availableBalance - requiredMargin)
      this.updatePosition(
        orderRequest.symbol,
        orderRequest.side,
        orderRequest.quantity,
        executionPrice,
        leverage,
        requiredMargin,
      )
    }

    return order
  }

  private updatePosition(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    executionPrice: number,
    leverage: number,
    margin: number,
  ) {
    const existingIndex = this.positions.findIndex((pos) => pos.symbol === symbol)
    const posSide = side === 'BUY' ? 'LONG' : 'SHORT'

    if (existingIndex === -1) {
      // Calculate liquidation price
      const liqBuffer = 1 / leverage
      const liquidationPrice =
        posSide === 'LONG'
          ? Math.max(0, executionPrice * (1 - liqBuffer * 0.9))
          : executionPrice * (1 + liqBuffer * 0.9)

      this.positions.push({
        symbol,
        side: posSide,
        quantity,
        entryPrice: executionPrice,
        currentPrice: executionPrice,
        pnl: 0,
        pnlPercentage: 0,
        leverage,
        margin,
        liquidationPrice: Number(liquidationPrice.toFixed(2)),
      })
      return
    }

    const existing = this.positions[existingIndex]

    if (existing.side === posSide) {
      // Adding to existing position
      const totalQty = existing.quantity + quantity
      const avgEntry = (existing.entryPrice * existing.quantity + executionPrice * quantity) / totalQty
      existing.quantity = Number(totalQty.toFixed(4))
      existing.entryPrice = Number(avgEntry.toFixed(2))
      existing.margin = (existing.margin || 0) + margin
      existing.currentPrice = executionPrice
    } else {
      // Reducing or closing position
      if (quantity >= existing.quantity) {
        // Full close (and optional flip)
        const realizedPnl =
          existing.side === 'LONG'
            ? (executionPrice - existing.entryPrice) * existing.quantity
            : (existing.entryPrice - executionPrice) * existing.quantity

        this.availableBalance += (existing.margin || 0) + realizedPnl
        this.lockedMargin = Math.max(0, this.lockedMargin - (existing.margin || 0))

        const excessQty = quantity - existing.quantity
        this.positions.splice(existingIndex, 1)

        if (excessQty > 0) {
          const excessMargin = (executionPrice * excessQty) / leverage
          this.lockedMargin += excessMargin
          this.availableBalance = Math.max(0, this.availableBalance - excessMargin)
          this.positions.push({
            symbol,
            side: posSide,
            quantity: excessQty,
            entryPrice: executionPrice,
            currentPrice: executionPrice,
            pnl: 0,
            pnlPercentage: 0,
            leverage,
            margin: excessMargin,
          })
        }
      } else {
        // Partial close
        const fraction = quantity / existing.quantity
        const releasedMargin = (existing.margin || 0) * fraction
        const realizedPnl =
          existing.side === 'LONG'
            ? (executionPrice - existing.entryPrice) * quantity
            : (existing.entryPrice - executionPrice) * quantity

        existing.quantity = Number((existing.quantity - quantity).toFixed(4))
        existing.margin = Math.max(0, (existing.margin || 0) - releasedMargin)
        this.lockedMargin = Math.max(0, this.lockedMargin - releasedMargin)
        this.availableBalance += releasedMargin + realizedPnl
      }
    }
  }

  async closePosition(symbol: string): Promise<Order> {
    const existingIndex = this.positions.findIndex((pos) => pos.symbol === symbol)
    if (existingIndex === -1) {
      throw new Error(`No active position found for ${symbol}`)
    }

    const pos = this.positions[existingIndex]
    const quote = await this.getQuote(symbol)
    const closePrice = pos.side === 'LONG' ? quote.bid : quote.ask
    const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY'

    const orderId = `CLS-${Date.now().toString().slice(-6)}`
    const order: Order = {
      id: orderId,
      symbol,
      side: closeSide,
      type: 'MARKET',
      quantity: pos.quantity,
      filledQuantity: pos.quantity,
      price: closePrice,
      status: 'FILLED',
      timestamp: Date.now(),
    }

    const realizedPnl =
      pos.side === 'LONG'
        ? (closePrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - closePrice) * pos.quantity

    this.availableBalance += (pos.margin || 0) + realizedPnl
    this.lockedMargin = Math.max(0, this.lockedMargin - (pos.margin || 0))
    this.positions.splice(existingIndex, 1)
    this.orders.push(order)

    return order
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.find((item) => item.id === orderId)
    if (!order) {
      throw new Error('Order not found')
    }
    if (order.status === 'FILLED') {
      throw new Error('Filled orders cannot be cancelled')
    }
    order.status = 'CANCELLED'
  }

  async getOpenOrders(): Promise<Order[]> {
    return this.orders.filter(
      (order) => order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED',
    )
  }

  async getPositions(): Promise<Position[]> {
    for (const position of this.positions) {
      const quote = await this.getQuote(position.symbol)
      position.currentPrice = quote.last

      const diff =
        position.side === 'LONG'
          ? position.currentPrice - position.entryPrice
          : position.entryPrice - position.currentPrice

      position.pnl = Number((diff * position.quantity).toFixed(2))
      position.pnlPercentage = Number(((diff / position.entryPrice) * 100 * (position.leverage || 1)).toFixed(2))
    }

    return this.positions
  }

  async getOrderHistory(): Promise<Order[]> {
    return this.orders
  }
}
