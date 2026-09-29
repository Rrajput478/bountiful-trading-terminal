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
  private availableBalance = 100000 // $100k
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
      id: 'ACC-MT5-PAPER-PRO',
      name: 'MT5 Pro Paper Account',
      broker: 'paper',
      currency: 'USD',
      connected: this.connected,
      isDemo: true,
    }
  }

  async getBalances(): Promise<Balance[]> {
    await this.checkTriggersAndLiquidations()
    const unrealizedPnl = this.positions.reduce((acc, pos) => acc + (pos.pnl || 0), 0)
    const equity = this.availableBalance + this.lockedMargin + unrealizedPnl
    const marginLevel = this.lockedMargin > 0 ? (equity / this.lockedMargin) * 100 : 9999

    return [
      {
        asset: 'USDT / INR',
        available: Number(this.availableBalance.toFixed(2)),
        locked: Number(this.lockedMargin.toFixed(2)),
        total: Number((this.availableBalance + this.lockedMargin).toFixed(2)),
        equity: Number(equity.toFixed(2)),
        freeMargin: Number(this.availableBalance.toFixed(2)),
        marginLevel: Number(marginLevel.toFixed(1)),
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

    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`
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
      stopLoss: orderRequest.stopLoss,
      takeProfit: orderRequest.takeProfit,
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
        orderRequest.stopLoss,
        orderRequest.takeProfit,
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
    stopLoss?: number,
    takeProfit?: number,
  ) {
    const existingIndex = this.positions.findIndex((pos) => pos.symbol === symbol)
    const posSide = side === 'BUY' ? 'LONG' : 'SHORT'
    const liqBuffer = 1 / leverage
    const liquidationPrice =
      posSide === 'LONG'
        ? Math.max(0, executionPrice * (1 - liqBuffer * 0.9))
        : executionPrice * (1 + liqBuffer * 0.9)

    if (existingIndex === -1) {
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
        stopLoss,
        takeProfit,
      })
      return
    }

    const existing = this.positions[existingIndex]

    if (existing.side === posSide) {
      const totalQty = existing.quantity + quantity
      const avgEntry = (existing.entryPrice * existing.quantity + executionPrice * quantity) / totalQty
      existing.quantity = Number(totalQty.toFixed(4))
      existing.entryPrice = Number(avgEntry.toFixed(2))
      existing.margin = (existing.margin || 0) + margin
      existing.currentPrice = executionPrice
      if (stopLoss !== undefined) existing.stopLoss = stopLoss
      if (takeProfit !== undefined) existing.takeProfit = takeProfit
    } else {
      if (quantity >= existing.quantity) {
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
            liquidationPrice: Number(liquidationPrice.toFixed(2)),
            stopLoss,
            takeProfit,
          })
        }
      } else {
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

  async modifyPosition(symbol: string, stopLoss?: number, takeProfit?: number): Promise<Position> {
    const existing = this.positions.find((pos) => pos.symbol === symbol)
    if (!existing) {
      throw new Error(`No active position for ${symbol}`)
    }
    existing.stopLoss = stopLoss
    existing.takeProfit = takeProfit
    return existing
  }

  async closePosition(symbol: string, reason: 'MANUAL' | 'TAKE_PROFIT' | 'STOP_LOSS' = 'MANUAL'): Promise<Order> {
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
      closeReason: reason,
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

  private async checkTriggersAndLiquidations() {
    const toClose: { symbol: string; reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'LIQUIDATION' }[] = []

    for (const pos of this.positions) {
      const quote = await this.marketData.getQuote(pos.symbol)
      pos.currentPrice = quote.last

      const diff =
        pos.side === 'LONG'
          ? pos.currentPrice - pos.entryPrice
          : pos.entryPrice - pos.currentPrice

      pos.pnl = Number((diff * pos.quantity).toFixed(2))
      pos.pnlPercentage = Number(((diff / pos.entryPrice) * 100 * (pos.leverage || 1)).toFixed(2))

      // Check SL / TP Triggers
      if (pos.side === 'LONG') {
        if (pos.takeProfit && pos.currentPrice >= pos.takeProfit) {
          toClose.push({ symbol: pos.symbol, reason: 'TAKE_PROFIT' })
        } else if (pos.stopLoss && pos.currentPrice <= pos.stopLoss) {
          toClose.push({ symbol: pos.symbol, reason: 'STOP_LOSS' })
        } else if (pos.liquidationPrice && pos.currentPrice <= pos.liquidationPrice) {
          toClose.push({ symbol: pos.symbol, reason: 'LIQUIDATION' })
        }
      } else {
        if (pos.takeProfit && pos.currentPrice <= pos.takeProfit) {
          toClose.push({ symbol: pos.symbol, reason: 'TAKE_PROFIT' })
        } else if (pos.stopLoss && pos.currentPrice >= pos.stopLoss) {
          toClose.push({ symbol: pos.symbol, reason: 'STOP_LOSS' })
        } else if (pos.liquidationPrice && pos.currentPrice >= pos.liquidationPrice) {
          toClose.push({ symbol: pos.symbol, reason: 'LIQUIDATION' })
        }
      }
    }

    for (const item of toClose) {
      try {
        await this.closePosition(item.symbol, item.reason)
      } catch (e) {
        // ignore
      }
    }
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
    await this.checkTriggersAndLiquidations()
    return this.positions
  }

  async getOrderHistory(): Promise<Order[]> {
    return this.orders
  }
}
