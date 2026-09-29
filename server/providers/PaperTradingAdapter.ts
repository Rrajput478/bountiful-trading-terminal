import {
  Account,
  Balance,
  BrokerAdapter,
  BrokerCapabilities,
  Order,
  OrderRequest,
  Position,
  Quote,
} from '../BrokerAdapter'

import { PaperMarketDataProvider } from '../market-data/PaperMarketDataProvider'

export class PaperTradingAdapter
  implements BrokerAdapter
{
  id = 'paper' as const
  name = 'Paper Trading'

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: false,
    shortSelling: true,
  }

  private orders: Order[] = []

  private positions: Position[] = []

  private balance = 10000

  private marketData = new PaperMarketDataProvider()

  constructor() {}

  async connect(): Promise<void> {
    console.log('Paper Trading connected')
  }

  async disconnect(): Promise<void> {
    console.log('Paper Trading disconnected')
  }

  async getAccount(): Promise<Account> {
    return {
      id: 'paper-account',
      name: 'Paper Trading Account',
    }
  }

  async getBalances(): Promise<Balance[]> {
    return [
      {
        asset: 'USDT',
        available: this.balance,
        locked: 0,
      },
    ]
  }

  async getQuote(
    symbol: string,
  ): Promise<Quote> {
    const quote =
      await this.marketData.getQuote(symbol)

    return {
      symbol: quote.symbol,
      bid: quote.bid,
      ask: quote.ask,
      last: quote.last,
      timestamp: quote.timestamp,
    }
  }

  async placeOrder(
    orderRequest: OrderRequest,
  ): Promise<Order> {
    const quote =
      await this.getQuote(
        orderRequest.symbol,
      )

    const executionPrice =
      orderRequest.side === 'BUY'
        ? quote.ask
        : quote.bid

    const order: Order = {
      id: `paper-${Date.now()}`,
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
      quantity: orderRequest.quantity,
      filledQuantity:
        orderRequest.quantity,
      price: executionPrice,
      status: 'FILLED',
      timestamp: Date.now(),
    }

    this.orders.push(order)

    this.updatePosition(
      orderRequest.symbol,
      orderRequest.side,
      orderRequest.quantity,
      executionPrice,
    )

    return order
  }

  private updatePosition(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    executionPrice: number,
  ) {
    const existing =
      this.positions.find(
        (position) =>
          position.symbol === symbol,
      )

    if (!existing) {
      this.positions.push({
        symbol,
        side:
          side === 'BUY'
            ? 'LONG'
            : 'SHORT',
        quantity,
        entryPrice: executionPrice,
        currentPrice: executionPrice,
        pnl: 0,
      })

      return
    }

    if (
      (existing.side === 'LONG' &&
        side === 'BUY') ||
      (existing.side === 'SHORT' &&
        side === 'SELL')
    ) {
      const totalQuantity =
        existing.quantity + quantity

      existing.entryPrice =
        (
          existing.entryPrice *
            existing.quantity +
          executionPrice * quantity
        ) /
        totalQuantity

      existing.quantity =
        totalQuantity

      return
    }

    if (quantity < existing.quantity) {
      existing.quantity -= quantity

      return
    }

    if (quantity === existing.quantity) {
      this.positions =
        this.positions.filter(
          (position) =>
            position !== existing,
        )

      return
    }

    const remainingQuantity =
      quantity - existing.quantity

    this.positions =
      this.positions.filter(
        (position) =>
          position !== existing,
      )

    this.positions.push({
      symbol,
      side:
        side === 'BUY'
          ? 'LONG'
          : 'SHORT',
      quantity: remainingQuantity,
      entryPrice: executionPrice,
      currentPrice: executionPrice,
      pnl: 0,
    })
  }

  async cancelOrder(
    orderId: string,
  ): Promise<void> {
    const order =
      this.orders.find(
        (item) =>
          item.id === orderId,
      )

    if (!order) {
      throw new Error(
        'Order not found',
      )
    }

    if (order.status === 'FILLED') {
      throw new Error(
        'Filled orders cannot be cancelled',
      )
    }

    order.status = 'CANCELLED'
  }

  async getOpenOrders(): Promise<Order[]> {
    return this.orders.filter(
      (order) =>
        order.status === 'OPEN' ||
        order.status ===
          'PARTIALLY_FILLED',
    )
  }

  async getPositions(): Promise<Position[]> {
    for (const position of this.positions) {
      const quote =
        await this.getQuote(
          position.symbol,
        )

      position.currentPrice =
        quote.last

      if (position.side === 'LONG') {
        position.pnl =
          (
            position.currentPrice -
            position.entryPrice
          ) * position.quantity
      } else {
        position.pnl =
          (
            position.entryPrice -
            position.currentPrice
          ) * position.quantity
      }
    }

    return this.positions
  }

  async getOrderHistory(): Promise<Order[]> {
    return this.orders
  }
}