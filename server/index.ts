import Fastify from 'fastify'
import cors from '@fastify/cors'

import { getBroker } from './BrokerFactory'
import { PaperMarketDataProvider } from './market-data/PaperMarketDataProvider'

const app = Fastify({
  logger: true,
})

const paperMarketData =
  new PaperMarketDataProvider()

await app.register(cors, {
  origin: true,
})

app.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'Bountiful Trading Terminal Backend',
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

try {
  await app.listen({
    port: 3000,
    host: '127.0.0.1',
  })

  console.log(
    'Backend running on http://127.0.0.1:3000',
  )
} catch (error) {
  app.log.error(error)
  process.exit(1)
}