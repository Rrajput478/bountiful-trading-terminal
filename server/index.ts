import Fastify from 'fastify'
import cors from '@fastify/cors'

import { getBroker } from './BrokerFactory'
import { PaperMarketDataProvider } from './market-data/PaperMarketDataProvider'

const app = Fastify({
  logger: true,
})

const paperMarketData =
  new PaperMarketDataProvider()

const paperBroker = getBroker('paper')

await app.register(cors, {
  origin: true,
})

app.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'Bountiful Trading Terminal Backend',
    version: 'DEPLOY-TEST-001',
  }
})

app.get('/api/brokers/paper', async () => {
  const broker = getBroker('paper')

  await broker.connect()

  const account = await broker.getAccount()

  return {
    broker: broker.name,
    account,
  }
})

app.get('/api/market-data/paper', async (request: any) => {
  const { symbol = 'BTC/USDT', timeframe = '1m' } =
    request.query as {
      symbol?: string
      timeframe?: string
    }

  const quote =
    await paperMarketData.getQuote(symbol)

  const candles =
    await paperMarketData.getCandles(
      symbol,
      timeframe,
      100,
    )

  return {
    quote,
    candles,
  }
})

app.get('/api/quote/paper', async (request: any) => {
  const { symbol = 'BTC/USDT' } =
    request.query as {
      symbol?: string
    }

  const quote =
    await paperMarketData.getQuote(symbol)

  return quote
})

app.get('/api/candle/paper', async (request: any) => {
  const { symbol = 'BTC/USDT', timeframe = '1m' } =
    request.query as {
      symbol?: string
      timeframe?: string
    }

  const candles =
    await paperMarketData.getCandles(
      symbol,
      timeframe,
      1,
    )

  return candles[0]
})

// Place order
app.post('/api/order/paper', async (request: any) => {
  const orderRequest = request.body

  await paperBroker.connect()
  const order = await paperBroker.placeOrder(orderRequest)

  return {
    success: true,
    order,
  }
})

// Get positions
app.get('/api/positions/paper', async () => {
  await paperBroker.connect()
  const positions = await paperBroker.getPositions()

  return {
    success: true,
    positions,
  }
})

// Get open orders
app.get('/api/orders/paper', async () => {
  await paperBroker.connect()
  const orders = await paperBroker.getOpenOrders()

  return {
    success: true,
    orders,
  }
})

// Get order history
app.get('/api/orders/paper/history', async () => {
  await paperBroker.connect()
  const orders = await paperBroker.getOrderHistory()

  return {
    success: true,
    orders,
  }
})

// Get balances
app.get('/api/balances/paper', async () => {
  await paperBroker.connect()
  const balances = await paperBroker.getBalances()

  return {
    success: true,
    balances,
  }
})

// Cancel order
app.delete('/api/order/paper/:orderId', async (request: any) => {
  const { orderId } = request.params

  await paperBroker.connect()
  await paperBroker.cancelOrder(orderId)

  return {
    success: true,
    message: 'Order cancelled',
  }
})

// Order Placement
app.post('/api/orders/paper', async (request: any) => {
  const orderRequest = request.body

  await paperBroker.connect()
  const order = await paperBroker.placeOrder(orderRequest)

  return {
    success: true,
    order,
  }
})

// Get Positions
app.get('/api/positions/paper', async () => {
  await paperBroker.connect()
  const positions = await paperBroker.getPositions()

  return {
    positions,
  }
})

// Get Open Orders
app.get('/api/orders/paper', async () => {
  await paperBroker.connect()
  const orders = await paperBroker.getOpenOrders()

  return {
    orders,
  }
})

// Get Order History
app.get('/api/orders/paper/history', async () => {
  await paperBroker.connect()
  const orders = await paperBroker.getOrderHistory()

  return {
    orders,
  }
})

// Get Balances
app.get('/api/balances/paper', async () => {
  await paperBroker.connect()
  const balances = await paperBroker.getBalances()

  return {
    balances,
  }
})

// Cancel Order
app.delete('/api/orders/paper/:orderId', async (request: any) => {
  const { orderId } = request.params

  await paperBroker.connect()
  await paperBroker.cancelOrder(orderId)

  return {
    success: true,
  }
})

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await app.listen({
    port,
    host,
  })

  console.log(
    `Backend running on http://${host}:${port}`,
  )
} catch (error) {
  app.log.error(error)
  process.exit(1)
}