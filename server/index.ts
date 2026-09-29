import Fastify from 'fastify'
import cors from '@fastify/cors'

import { BrokerId, OrderRequest } from './BrokerAdapter'
import { getBroker, listBrokers, sharedMarketData } from './BrokerFactory'

const app = Fastify({
  logger: false,
})

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})

// 1. Health check
app.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'Bountiful Trading Terminal Backend',
    version: '2.0.0-PRO',
    time: Date.now(),
  }
})

// 2. Broker Management
app.get('/api/brokers', async () => {
  return listBrokers()
})

app.post('/api/broker/connect', async (request, reply) => {
  const body = request.body as { broker: BrokerId; credentials?: Record<string, string> }
  if (!body?.broker) {
    return reply.status(400).send({ error: 'broker parameter is required' })
  }

  try {
    const broker = getBroker(body.broker)
    await broker.connect(body.credentials)
    const account = await broker.getAccount()
    return { success: true, account }
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

// 3. Market Data Endpoints
app.get('/api/quote', async (request, reply) => {
  const { symbol = 'BTC/USDT' } = request.query as { symbol?: string }
  try {
    const quote = await sharedMarketData.getQuote(symbol)
    return quote
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.get('/api/orderbook', async (request, reply) => {
  const { symbol = 'BTC/USDT' } = request.query as { symbol?: string }
  try {
    const book = sharedMarketData.getOrderBook(symbol)
    return book
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.get('/api/candles', async (request, reply) => {
  const { symbol = 'BTC/USDT', timeframe = '1m', limit = '120' } = request.query as {
    symbol?: string
    timeframe?: string
    limit?: string
  }

  try {
    const candles = await sharedMarketData.getCandles(symbol, timeframe, parseInt(limit, 10) || 120)
    return candles
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

// 4. Broker Order & Position Routes
app.post('/api/order/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  const orderData = request.body as OrderRequest

  if (!orderData?.symbol || !orderData?.side || !orderData?.type || !orderData?.quantity) {
    return reply.status(400).send({ error: 'Missing required order fields (symbol, side, type, quantity)' })
  }

  try {
    const brokerAdapter = getBroker(broker)
    const order = await brokerAdapter.placeOrder(orderData)
    return { success: true, order }
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.post('/api/position/close/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  const { symbol } = request.body as { symbol: string }

  if (!symbol) {
    return reply.status(400).send({ error: 'symbol is required to close position' })
  }

  try {
    const brokerAdapter = getBroker(broker)
    const order = await brokerAdapter.closePosition(symbol)
    return { success: true, order }
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.post('/api/order/cancel/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  const { orderId } = request.body as { orderId: string }

  if (!orderId) {
    return reply.status(400).send({ error: 'orderId is required' })
  }

  try {
    const brokerAdapter = getBroker(broker)
    await brokerAdapter.cancelOrder(orderId)
    return { success: true, orderId }
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.get('/api/positions/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  try {
    const brokerAdapter = getBroker(broker)
    const positions = await brokerAdapter.getPositions()
    return positions
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.get('/api/orders/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  try {
    const brokerAdapter = getBroker(broker)
    const orders = await brokerAdapter.getOpenOrders()
    return orders
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.get('/api/history/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  try {
    const brokerAdapter = getBroker(broker)
    const history = await brokerAdapter.getOrderHistory()
    return history
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.get('/api/balances/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  try {
    const brokerAdapter = getBroker(broker)
    const balances = await brokerAdapter.getBalances()
    return balances
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

app.get('/api/account/:broker', async (request, reply) => {
  const { broker = 'paper' } = request.params as { broker: BrokerId }
  try {
    const brokerAdapter = getBroker(broker)
    const account = await brokerAdapter.getAccount()
    return account
  } catch (err: any) {
    return reply.status(500).send({ error: err.message })
  }
})

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000
    const host = '0.0.0.0'
    await app.listen({ port, host })
    console.log(`Backend server ready and running at http://${host}:${port}`)
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()
