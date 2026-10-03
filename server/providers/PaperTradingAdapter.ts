import type { Account, Balance, BrokerAdapter, BrokerCapabilities, BrokerId, Order, OrderBook, OrderRequest, OrderType, Position, Quote, SizeMode, SizePreview, Trade } from '../BrokerAdapter'

import { PaperMarketDataProvider } from '../market-data/PaperMarketDataProvider'
import type { SymbolSpec } from '../market-data/PaperMarketDataProvider'

export const STARTING_BALANCE = 10000
const TAKER_FEE_RATE = 0.0004 // 0.04% per side, paper approximation
const MAKER_FEE_RATE = 0.0002

export class PaperTradingAdapter implements BrokerAdapter {
  id: BrokerId = 'paper'
  name = 'Paper Trading'
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
  private trades: Trade[] = []
  private cash = STARTING_BALANCE
  private realizedPnl = 0

  private marketData: PaperMarketDataProvider

  constructor(marketData: PaperMarketDataProvider = new PaperMarketDataProvider()) {
    this.marketData = marketData
  }

  async connect(): Promise<boolean> {
    this.connected = true
    return true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async getAccount(): Promise<Account> {
    return {
      id: 'ACC-BOUNTIFUL-PAPER',
      name: 'Bountiful Paper Account',
      broker: 'paper',
      currency: 'USDT',
      connected: this.connected,
      isDemo: true,
    }
  }

  async getBalances(): Promise<Balance[]> {
    await this.processTriggers()
    const unrealized = this.positions.reduce((sum, p) => sum + (p.pnl || 0), 0)
    const margin = this.positions.reduce((sum, p) => sum + (p.margin || 0), 0)
    const equity = this.cash + unrealized
    const freeMargin = Math.max(0, equity - margin)

    return [
      {
        asset: 'USDT',
        available: round2(this.cash),
        locked: round2(margin),
        total: round2(equity),
        equity: round2(equity),
        freeMargin: round2(freeMargin),
        marginLevel: margin > 0 ? round2((equity / margin) * 100) : 0,
      },
    ]
  }

  async getOrderBook(symbol: string): Promise<OrderBook> {
    return this.marketData.getOrderBook(symbol)
  }

  async getQuote(symbol: string): Promise<Quote> {
    const q = await this.marketData.getQuote(symbol)
    return {
      symbol: q.symbol,
      bid: q.bid,
      ask: q.ask,
      last: q.last,
      high24h: q.high24h,
      low24h: q.low24h,
      change24h: q.change24h,
      volume24h: q.volume24h,
      timestamp: q.timestamp,
    }
  }

  async previewSize(
    symbol: string,
    mode: SizeMode,
    input: number,
    leverage: number,
  ): Promise<SizePreview> {
    const spec = this.marketData.getSpec(symbol)
    const quote = await this.marketData.getQuote(symbol)
    const lev = clamp(leverage || 1, 1, spec.leverageMax)
    const price = mode === 'QUANTITY' ? quote.last : quote.ask

    let quantity: number
    if (mode === 'QUANTITY') {
      // The user types the traded amount directly (0.01 BTC, 1000 EUR).
      quantity = input
    } else if (mode === 'MARGIN') {
      quantity = (input * lev) / Math.max(price, 1e-9)
    } else {
      // LOT -> contracts. Crypto contractSize is 1, so 1 lot == 1 unit; forex and
      // index contracts use their own contract size (EUR/USD 1 lot = 100,000 EUR).
      quantity = input * spec.contractSize
    }

    quantity = quantize(quantity, spec.quantityStep)
    const notional = quantity * price
    const initialMargin = notional / lev
    const fee = notional * TAKER_FEE_RATE

    return {
      mode,
      input,
      quantity,
      notional: round2(notional),
      initialMargin: round2(initialMargin),
      estimatedFee: round2(fee),
      lotSize: spec.lotSize,
      minQuantity: spec.minQuantity,
      maxQuantity: spec.maxQuantity,
      quantityStep: spec.quantityStep,
    }
  }

  async placeOrder(req: OrderRequest): Promise<Order> {
    const spec = this.marketData.getSpec(req.symbol)
    const quote = await this.getQuote(req.symbol)

    const errors = validateOrder(req, quote, spec, this.connected)
    if (errors.length > 0) throw new Error(errors[0])

    const leverage = clamp(req.leverage || 1, 1, spec.leverageMax)
    const pending = isPending(req.type)

    let executionPrice: number
    if (req.type === 'LIMIT') {
      executionPrice = req.price as number
    } else if (req.type === 'STOP' || req.type === 'STOP_LIMIT') {
      executionPrice = (req.stopPrice as number) * (1 + 0) // stop market fills at stop trigger
    } else {
      executionPrice = req.side === 'BUY' ? quote.ask : quote.bid
    }

    const order: Order = {
      id: newId('ORD'),
      symbol: req.symbol,
      side: req.side,
      type: req.type,
      quantity: quantize(req.quantity, spec.quantityStep),
      filledQuantity: 0,
      price: pending ? req.price : round2(executionPrice),
      stopPrice: req.stopPrice,
      stopLoss: req.stopLoss,
      takeProfit: req.takeProfit,
      leverage,
      status: 'OPEN',
      timestamp: Date.now(),
      positionSide: req.side === 'BUY' ? 'LONG' : 'SHORT',
    }

    this.orders.unshift(order)

    if (!pending) {
      await this.fillOrder(order, executionPrice)
    } else {
      // Reserve margin so the user cannot over-commit while resting
      const margin = (order.price! * order.quantity) / leverage
      if (margin > this.cash) {
        order.status = 'REJECTED'
        throw new Error('Insufficient free margin for this pending order')
      }
      this.cash -= margin
      order.margin = round2(margin)
    }

    return order
  }

  private async fillOrder(order: Order, price: number): Promise<void> {
    const notional = price * order.quantity
    const margin = notional / (order.leverage || 1)
    const fee = notional * (order.type === 'LIMIT' ? MAKER_FEE_RATE : TAKER_FEE_RATE)

    if (margin + fee > this.cash) {
      order.status = 'REJECTED'
      throw new Error('Insufficient balance to open this position')
    }

    this.cash -= margin
    order.filledQuantity = order.quantity
    order.price = round2(price)
    order.status = 'FILLED'
    order.margin = round2(margin)
    order.fee = round2(fee)
    order.entryPrice = round2(price)

    this.applyFill(order, price)
  }

  /** Applies a fill to the position book, netting opposite exposure first. */
  private applyFill(order: Order, price: number): void {
    const incoming: 'LONG' | 'SHORT' = order.side === 'BUY' ? 'LONG' : 'SHORT'
    const idx = this.positions.findIndex((p) => p.symbol === order.symbol)

    if (idx === -1) {
      const spec = this.marketData.getSpec(order.symbol)
      this.positions.push({
        id: newId('POS'),
        symbol: order.symbol,
        side: incoming,
        quantity: order.quantity,
        entryPrice: round2(price),
        currentPrice: round2(price),
        pnl: 0,
        pnlPercentage: 0,
        leverage: order.leverage || 1,
        margin: round2(order.margin || 0),
        liquidationPrice: liquidationFor(incoming, price, order.leverage || 1, spec),
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        openedAt: Date.now(),
      })
      return
    }

    const pos = this.positions[idx]

    if (pos.side === incoming) {
      const total = pos.quantity + order.quantity
      pos.entryPrice = round2(
        (pos.entryPrice * pos.quantity + price * order.quantity) / total,
      )
      pos.quantity = quantize(total, 0.00000001)
      pos.margin = round2((pos.margin || 0) + (order.margin || 0))
      if (order.stopLoss !== undefined) pos.stopLoss = order.stopLoss
      if (order.takeProfit !== undefined) pos.takeProfit = order.takeProfit
      return
    }

    // Opposing fill: reduce/close first, never flip silently.
    if (order.quantity >= pos.quantity) {
      const pnl = closePnl(pos, price, pos.quantity)
      const returned = (pos.margin || 0) + pnl
      this.cash += returned
      this.realizedPnl += pnl
      this.releaseFees(order, pos.quantity, pnl)

      const excess = order.quantity - pos.quantity
      this.positions.splice(idx, 1)

      if (excess > 1e-9) {
        const excessMargin = (price * excess) / (order.leverage || 1)
        this.cash -= excessMargin
        this.positions.push({
          id: newId('POS'),
          symbol: order.symbol,
          side: incoming,
          quantity: quantize(excess, 0.00000001),
          entryPrice: round2(price),
          currentPrice: round2(price),
          pnl: 0,
          pnlPercentage: 0,
          leverage: order.leverage || 1,
          margin: round2(excessMargin),
          liquidationPrice: liquidationFor(incoming, price, order.leverage || 1, this.marketData.getSpec(order.symbol)),
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          openedAt: Date.now(),
        })
        order.quantity = quantize(excess, 0.00000001)
        order.margin = round2(excessMargin)
      } else {
        order.quantity = pos.quantity
        order.margin = round2(pos.margin || 0)
      }
    } else {
      const fraction = order.quantity / pos.quantity
      const released = (pos.margin || 0) * fraction
      const pnl = closePnl(pos, price, order.quantity)
      this.cash += released + pnl
      this.realizedPnl += pnl
      this.releaseFees(order, order.quantity, pnl)

      pos.quantity = quantize(pos.quantity - order.quantity, 0.00000001)
      pos.margin = round2(Math.max(0, (pos.margin || 0) - released))
    }
  }

  private releaseFees(order: Order, qty: number, pnl: number): void {
    const fee = price2(order.price || 0) * qty * TAKER_FEE_RATE
    order.fee = round2(fee)
    this.cash -= fee
    order.realizedPnl = round2(pnl - fee)
  }

  async modifyPosition(
    symbol: string,
    stopLoss?: number,
    takeProfit?: number,
  ): Promise<Position> {
    const pos = this.positions.find((p) => p.symbol === symbol)
    if (!pos) throw new Error(`No active position for ${symbol}`)

    const quote = await this.getQuote(symbol)
    const errs = validateProtection(pos.side, quote, stopLoss, takeProfit, pos.entryPrice)
    if (errs.length > 0) throw new Error(errs[0])

    if (stopLoss !== undefined && stopLoss !== null) pos.stopLoss = stopLoss
    if (takeProfit !== undefined && takeProfit !== null) pos.takeProfit = takeProfit
    return pos
  }

  /**
   * Dedicated close path. Reduces or removes the position; never reverses it.
   */
  async closePosition(
    symbol: string,
    quantity?: number,
    reason: Order['closeReason'] = 'MANUAL',
  ): Promise<Order> {
    const idx = this.positions.findIndex((p) => p.symbol === symbol)
    if (idx === -1) throw new Error(`No active position found for ${symbol}`)

    const pos = this.positions[idx]
    const quote = await this.getQuote(symbol)
    const exitPrice = pos.side === 'LONG' ? quote.bid : quote.ask

    // Clamp to the open size so a bad request can never over-close or flip the
    // position to the opposite side.
    let closeQty = quantity === undefined || quantity === null ? pos.quantity : Number(quantity)
    if (!Number.isFinite(closeQty) || closeQty <= 0) {
      throw new Error('Close quantity must be greater than zero')
    }
    closeQty = Math.min(closeQty, pos.quantity)
    if (closeQty < this.marketData.getSpec(symbol).quantityStep) {
      throw new Error(`Close quantity is below the minimum step for ${symbol}`)
    }

    const isFullClose = closeQty >= pos.quantity
    const share = closeQty / pos.quantity
    const pnl = closePnl(pos, exitPrice, closeQty)
    const fee = exitPrice * closeQty * TAKER_FEE_RATE
    const marginReleased = (pos.margin || 0) * share

    this.cash += marginReleased + pnl - fee
    this.realizedPnl += pnl

    const order: Order = {
      id: newId('CLS'),
      symbol,
      side: pos.side === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: closeQty,
      filledQuantity: closeQty,
      price: round2(exitPrice),
      status: 'FILLED',
      timestamp: Date.now(),
      closeReason: reason,
      margin: round2(marginReleased),
      fee: round2(fee),
      realizedPnl: round2(pnl - fee),
      entryPrice: round2(pos.entryPrice),
      exitPrice: round2(exitPrice),
      positionSide: pos.side,
    }
    this.orders.unshift(order)

    if (isFullClose) {
      this.positions.splice(idx, 1)
    } else {
      // Partial close: keep the remainder open with proportionally reduced size,
      // margin and risk. The stop-loss/target stay put and are not consumed.
      pos.quantity = Number((pos.quantity - closeQty).toFixed(8))
      pos.margin = round2((pos.margin || 0) - marginReleased)
      this.positions[idx] = pos
    }

    this.trades.unshift({
      id: newId('TRD'),
      symbol,
      side: pos.side,
      quantity: closeQty,
      entryPrice: round2(pos.entryPrice),
      exitPrice: round2(exitPrice),
      pnl: round2(pnl - fee),
      fee: round2(fee),
      closeReason: reason,
      openedAt: pos.openedAt || Date.now(),
      closedAt: Date.now(),
      durationMs: Date.now() - (pos.openedAt || Date.now()),
    })

    return order
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.find((o) => o.id === orderId)
    if (!order) throw new Error('Order not found')
    if (order.status === 'FILLED') throw new Error('Filled orders cannot be cancelled')
    if (order.status === 'CANCELLED') throw new Error('Order already cancelled')
    if (order.margin) this.cash += order.margin // release reservation
    order.status = 'CANCELLED'
  }

  /** Fills pending orders whose trigger price has been touched. */
  private syncPendingOrders(quote: Quote): void {
    const pending = this.orders.filter((o) => o.status === 'OPEN')
    for (const order of pending) {
      if (order.symbol !== quote.symbol) continue

      let trigger: number | null = null
      if (order.type === 'LIMIT') trigger = order.price as number
      else if (order.type === 'STOP' || order.type === 'STOP_LIMIT') trigger = order.stopPrice as number
      if (trigger === null) continue

      const touched =
        order.side === 'BUY' ? quote.last <= trigger : quote.last >= trigger

      if (touched) {
        // release the reservation, then fill at the live price
        if (order.margin) this.cash += order.margin
        const fillPrice = order.type === 'STOP_LIMIT' ? (order.price as number) : quote.last
        try {
          this.pendingFills.push({ order, price: fillPrice })
        } catch {
          /* noop */
        }
      }
    }
  }

  private pendingFills: { order: Order; price: number }[] = []

  private flushPendingFills(): void {
    while (this.pendingFills.length > 0) {
      const item = this.pendingFills.shift()!
      const price = item.price
      try {
        const margin = (price * item.order.quantity) / (item.order.leverage || 1)
        const fee = price * item.order.quantity * TAKER_FEE_RATE
        if (margin + fee > this.cash) {
          item.order.status = 'REJECTED'
          continue
        }
        this.cash -= margin
        item.order.filledQuantity = item.order.quantity
        item.order.price = round2(price)
        item.order.status = 'FILLED'
        item.order.margin = round2(margin)
        item.order.fee = round2(fee)
        item.order.entryPrice = round2(price)
        this.applyFill(item.order, price)
      } catch {
        item.order.status = 'REJECTED'
      }
    }
  }

  private async processTriggers(): Promise<void> {
    const toClose: { symbol: string; reason: Order['closeReason'] }[] = []

    for (const pos of this.positions) {
      const q = await this.getQuote(pos.symbol)
      pos.currentPrice = q.last

      const long = pos.side === 'LONG'
      const diff = long ? q.last - pos.entryPrice : pos.entryPrice - q.last
      pos.pnl = round2(diff * pos.quantity)
      pos.pnlPercentage = round2(
        pos.entryPrice > 0 ? (diff / pos.entryPrice) * 100 * (pos.leverage || 1) : 0,
      )

      const hitLiquidation = pos.liquidationPrice
        ? long
          ? q.last <= pos.liquidationPrice
          : q.last >= pos.liquidationPrice
        : false

      if (hitLiquidation) {
        toClose.push({ symbol: pos.symbol, reason: 'LIQUIDATION' })
        continue
      }
      if (pos.takeProfit && (long ? q.last >= pos.takeProfit : q.last <= pos.takeProfit)) {
        toClose.push({ symbol: pos.symbol, reason: 'TAKE_PROFIT' })
        continue
      }
      if (pos.stopLoss && (long ? q.last <= pos.stopLoss : q.last >= pos.stopLoss)) {
        toClose.push({ symbol: pos.symbol, reason: 'STOP_LOSS' })
      }
    }

    for (const item of toClose) {
      try {
        await this.closePosition(item.symbol, undefined, item.reason as Order['closeReason'])
      } catch {
        /* already gone */
      }
    }
  }

  async getOpenOrders(): Promise<Order[]> {
    await this.getQuote('BTC/USDT').catch(() => null)
    return this.orders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED')
  }

  async getPositions(): Promise<Position[]> {
    await this.processTriggers()
    return this.positions
  }

  async getBalancesAfterSync(): Promise<Balance[]> {
    return this.getBalances()
  }

  async getOrderHistory(): Promise<Order[]> {
    return this.orders
  }

  async getTrades(): Promise<Trade[]> {
    return this.trades
  }

  /** Called by the server tick loop: fills pending orders and fires triggers. */
  async tick(symbols?: string[]): Promise<void> {
    const list = symbols && symbols.length > 0 ? symbols : this.marketData.listSymbols()
    for (const symbol of list) {
      try {
        const q = await this.getQuote(symbol)
        this.syncPendingOrders(q)
      } catch {
        /* unknown symbol */
      }
    }
    this.flushPendingFills()
    await this.processTriggers()
  }

  reset(): void {
    this.orders = []
    this.positions = []
    this.trades = []
    this.cash = STARTING_BALANCE
    this.realizedPnl = 0
  }
}

function isPending(type: OrderType): boolean {
  return type === 'LIMIT' || type === 'STOP' || type === 'STOP_LIMIT'
}

function closePnl(pos: Position, exitPrice: number, qty: number): number {
  const diff = pos.side === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice
  return diff * qty
}

function liquidationFor(
  side: 'LONG' | 'SHORT',
  entry: number,
  leverage: number,
  spec: SymbolSpec,
): number {
  const buffer = (1 / Math.max(leverage, 1)) * 0.9
  const price = side === 'LONG' ? entry * (1 - buffer) : entry * (1 + buffer)
  return Number(Math.max(0, price).toFixed(spec.digits))
}

function validateOrder(
  req: OrderRequest,
  quote: Quote,
  spec: SymbolSpec,
  connected: boolean,
): string[] {
  const e: string[] = []
  if (!connected) e.push('Broker is not connected')
  if (!req.symbol) e.push('Symbol is required')
  if (!Number.isFinite(req.quantity) || req.quantity <= 0) e.push('Quantity must be greater than zero')
  if (req.quantity < spec.minQuantity) e.push(`Minimum quantity is ${spec.minQuantity}`)
  if (req.quantity > spec.maxQuantity) e.push(`Maximum quantity is ${spec.maxQuantity}`)
  if (req.type === 'LIMIT' && (!req.price || req.price <= 0)) e.push('Limit price is required')
  if ((req.type === 'STOP' || req.type === 'STOP_LIMIT') && (!req.stopPrice || req.stopPrice <= 0))
    e.push('Stop price is required')
  if (req.type === 'STOP_LIMIT' && (!req.price || req.price <= 0)) e.push('Limit price is required')

  if (req.stopLoss !== undefined && req.takeProfit !== undefined && req.stopLoss && req.takeProfit) {
    e.push(...validateProtection(req.side === 'BUY' ? 'LONG' : 'SHORT', quote, req.stopLoss, req.takeProfit, 0))
  }
  return e
}

function validateProtection(
  side: 'LONG' | 'SHORT',
  quote: Quote,
  stopLoss?: number,
  takeProfit?: number,
  entry = 0,
): string[] {
  const e: string[] = []
  const ref = entry || quote.last

  if (stopLoss !== undefined && stopLoss !== null) {
    if (!Number.isFinite(stopLoss) || stopLoss <= 0) e.push('Stop loss must be greater than zero')
    else if (side === 'LONG' && stopLoss >= ref) e.push('Stop loss must be below the current price for a long position')
    else if (side === 'SHORT' && stopLoss <= ref) e.push('Stop loss must be above the current price for a short position')
  }

  if (takeProfit !== undefined && takeProfit !== null) {
    if (!Number.isFinite(takeProfit) || takeProfit <= 0) e.push('Take profit must be greater than zero')
    else if (side === 'LONG' && takeProfit <= ref) e.push('Take profit must be above the current price for a long position')
    else if (side === 'SHORT' && takeProfit >= ref) e.push('Take profit must be below the current price for a short position')
  }

  if (stopLoss && takeProfit && side === 'LONG' && stopLoss >= takeProfit)
    e.push('Stop loss must be below take profit')
  if (stopLoss && takeProfit && side === 'SHORT' && stopLoss <= takeProfit)
    e.push('Stop loss must be above take profit')

  return e
}

const round2 = (n: number) => Number(n.toFixed(2))
const price2 = (n: number) => Number(n.toFixed(2))
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const quantize = (n: number, step: number) => (step > 0 ? Number((Math.round(n / step) * step).toFixed(8)) : n)

let seq = 0
function newId(prefix: string): string {
  seq = (seq + 1) % 100000
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${seq.toString().padStart(4, '0')}`
}