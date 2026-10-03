import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { BrokerId, OrderRequest, SizeMode } from './BrokerAdapter'
import { getBroker, listBrokers, sharedMarketData } from './BrokerFactory'
import { PaperTradingAdapter } from './providers/PaperTradingAdapter'

const app = Fastify({ logger: false })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})

/** Wraps a handler so every failure becomes a clean { error } payload, never a stack trace. */
const handle = <T>(
  fn: (...args: any[]) => Promise<T>,
  statusOnThrow = 400,
) => {
  return async (request: any, reply: any) => {
    try {
      const result = await fn(request)
      return result
    } catch (err: any) {
      const message = err?.message || 'Unexpected server error'
      const status = /not recognized|not found/i.test(message) ? 404 : statusOnThrow
      return reply.status(status).send({ error: message })
    }
  }
}

const brokerOf = (request: any): BrokerId => (request.params?.broker || 'paper') as BrokerId


// ---------------------------------------------------------------- health

app.get('/api/health', async () => ({
  status: 'ok',
  service: 'Bountiful Trading Terminal',
  version: '3.0.0',
  mode: 'PAPER',
  time: Date.now(),
}))

// ---------------------------------------------------------------- brokers

app.get('/api/brokers', async () => listBrokers())

app.get(
  '/api/brokers/paper',
  handle(async () => {
    const broker = getBroker('paper')
    return {
      id: broker.id,
      name: broker.name,
      connected: broker.connected,
      isLive: false,
      enabled: true,
      capabilities: broker.capabilities,
      account: await broker.getAccount(),
      balance: (await broker.getBalances())[0] ?? null,
    }
  }),
)

app.post(
  '/api/broker/connect',
  handle(async (request) => {
    const body = request.body as { broker?: BrokerId }
    if (!body?.broker) throw new Error('broker parameter is required')
    const broker = getBroker(body.broker)
    await broker.connect()
    return { success: true, account: await broker.getAccount() }
  }),
)

// ---------------------------------------------------------------- market data

app.get(
  '/api/market-data/paper',
  handle(async () => ({
    symbols: sharedMarketData.listSpecs(),
  })),
)

app.get(
  '/api/quote/paper',
  handle(async (request) => {
    const { symbol = 'BTC/USDT' } = request.query as { symbol?: string }
    return sharedMarketData.getQuote(symbol)
  }),
)

// Alias kept for the existing frontend client.
app.get(
  '/api/quote',
  handle(async (request) => {
    const { symbol = 'BTC/USDT' } = request.query as { symbol?: string }
    return sharedMarketData.getQuote(symbol)
  }),
)

app.get(
  '/api/quotes',
  handle(async () => {
    const quotes = await Promise.all(
      sharedMarketData.listSymbols().map((s: string) => sharedMarketData.getQuote(s)),
    )
    return quotes
  }),
)

app.get(
  '/api/candle/paper',
  handle(async (request) => {
    const { symbol = 'BTC/USDT', timeframe = '1m', limit = '200' } = request.query as {
      symbol?: string
      timeframe?: string
      limit?: string
    }
    return sharedMarketData.getCandles(symbol, timeframe, Math.min(parseInt(limit, 10) || 200, 1000))
  }),
)

app.get(
  '/api/candles',
  handle(async (request) => {
    const { symbol = 'BTC/USDT', timeframe = '1m', limit = '200' } = request.query as {
      symbol?: string
      timeframe?: string
      limit?: string
    }
    return sharedMarketData.getCandles(symbol, timeframe, Math.min(parseInt(limit, 10) || 200, 1000))
  }),
)

app.get(
  '/api/symbols',
  handle(async () => sharedMarketData.listSpecs()),
)

app.get(
  '/api/orderbook',
  handle(async (request) => {
    const { symbol = 'BTC/USDT' } = request.query as { symbol?: string }
    return sharedMarketData.getOrderBook(symbol)
  }),
)

// ---------------------------------------------------------------- account

app.get(
  '/api/account/paper',
  handle(async (request) => getBroker(brokerOf(request)).getAccount()),
)

app.get(
  '/api/balances/paper',
  handle(async (request) => getBroker(brokerOf(request)).getBalances()),
)

// ---------------------------------------------------------------- orders

app.post(
  '/api/orders/paper',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    const body = request.body as OrderRequest
    const order = await broker.placeOrder(body)
    return { success: true, order }
  }),
)

app.get(
  '/api/orders/paper/open',
  handle(async (request) => getBroker(brokerOf(request)).getOpenOrders()),
)

app.get(
  '/api/orders/paper',
  handle(async (request) => getBroker(brokerOf(request)).getOrderHistory()),
)

app.delete(
  '/api/orders/paper/:orderId',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    await broker.cancelOrder(request.params.orderId)
    return { success: true, orderId: request.params.orderId }
  }),
)

app.post(
  '/api/order/cancel/:broker',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    const { orderId } = request.body as { orderId: string }
    if (!orderId) throw new Error('orderId is required')
    await broker.cancelOrder(orderId)
    return { success: true, orderId }
  }),
)

app.post(
  '/api/size-preview',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    const { symbol = 'BTC/USDT', mode = 'QUANTITY', input = 0, leverage = 1 } = request.body as {
      symbol: string
      mode: SizeMode
      input: number
      leverage: number
    }
    return broker.previewSize(symbol, mode, Number(input) || 0, Number(leverage) || 1)
  }),
)

// ---------------------------------------------------------------- positions

app.get(
  '/api/positions/paper',
  handle(async (request) => getBroker(brokerOf(request)).getPositions()),
)

// Symbols contain a slash, so they travel in the body rather than the path.
app.post(
  '/api/positions/paper/protection',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    const { symbol, stopLoss, takeProfit } = request.body as {
      symbol?: string
      stopLoss?: number
      takeProfit?: number
    }
    if (!symbol) throw new Error('symbol is required')
    const position = await broker.modifyPosition(
      symbol,
      stopLoss === null ? undefined : stopLoss,
      takeProfit === null ? undefined : takeProfit,
    )
    return { success: true, position }
  }),
)

app.post(
  '/api/positions/paper/close',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    const { symbol, quantity } = request.body as { symbol?: string; quantity?: number }
    if (!symbol) throw new Error('symbol is required')
    // Omitting quantity closes the whole position; a smaller value reduces it.
    const order = await broker.closePosition(symbol, quantity)
    return { success: true, order }
  }),
)

app.post(
  '/api/position/modify/:broker',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    const { symbol, stopLoss, takeProfit } = request.body as {
      symbol: string
      stopLoss?: number
      takeProfit?: number
    }
    if (!symbol) throw new Error('symbol is required')
    const position = await broker.modifyPosition(symbol, stopLoss, takeProfit)
    return { success: true, position }
  }),
)

app.post(
  '/api/position/close/:broker',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    const { symbol, quantity } = request.body as { symbol: string; quantity?: number }
    if (!symbol) throw new Error('symbol is required')
    const order = await broker.closePosition(symbol, quantity)
    return { success: true, order }
  }),
)

// ---------------------------------------------------------------- history / journal

app.get(
  '/api/history/paper',
  handle(async (request) => getBroker(brokerOf(request)).getOrderHistory()),
)

app.get(
  '/api/journal/paper',
  handle(async (request) => getBroker(brokerOf(request)).getTrades()),
)

// ---------------------------------------------------------------- demo controls

app.post(
  '/api/paper/reset',
  handle(async (request) => {
    const broker = getBroker(brokerOf(request))
    if (broker instanceof PaperTradingAdapter) {
      broker.reset()
      return { success: true, message: 'Paper account reset to 10,000 USDT' }
    }
    throw new Error('Reset is only available on the paper account')
  }),
)

// ---------------------------------------------------------------- tick loop

let ticking = false
const TICK_MS = Number(process.env.TICK_INTERVAL_MS) || 1000

const timer = setInterval(async () => {
  if (ticking) return
  ticking = true
  try {
    const symbols = sharedMarketData.listSymbols()
    // advance the price walk first, then let the engine react to fresh ticks
    symbols.forEach((s: string) => sharedMarketData.tickPrice(s))
    const paper = getBroker('paper')
    if (paper instanceof PaperTradingAdapter) await paper.tick(symbols)
  } catch {
    // keep the loop alive
  } finally {
    ticking = false
  }
}, TICK_MS)

timer.unref?.()

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000
    const host = process.env.HOST || '0.0.0.0'
    await app.listen({ port, host })
    console.log(`Bountiful Trading Terminal API ready at http://${host}:${port} (PAPER mode)`)
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()