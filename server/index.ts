import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import fs from 'node:fs'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import type { BrokerId, OrderRequest, SizeMode } from './BrokerAdapter'
import { getBroker, listBrokers, liveTradingAllowed, sharedMarketData } from './BrokerFactory'
import { PaperTradingAdapter } from './providers/PaperTradingAdapter'

const app = Fastify({ logger: false })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})

/*
 * Serve the built frontend from this same process.
 *
 * A hosted deployment should run one Node process on one port rather than a
 * separate static host plus an API, which keeps the /api paths same-origin and
 * removes a proxy layer that would otherwise break service worker scope.
 */
const DIST_DIR = path.join(process.cwd(), 'dist')
if (fs.existsSync(DIST_DIR)) {
  await app.register(fastifyStatic, {
    root: DIST_DIR,
    prefix: '/',
    index: ['index.html'],
  })

  // Client-side routing: any non-API GET returns the SPA shell so deep links
  // like /terminal work on a hard refresh or a cold install.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: 'Frontend build not found. Run `npm run build` before starting the server.',
    }),
  )
}

/**
 * A shared token that gates the trading surface.
 *
 * A hosted deployment has a public URL. Without a gate, anyone who learns that
 * URL could place real orders with the operator's key. The token is compared in
 * constant time and is required for everything except the health probe and the
 * static shell, so an unauthenticated visitor sees the UI but cannot trade.
 */
const ACCESS_TOKEN = (process.env.ACCESS_TOKEN ?? '').trim()

function tokenMatches(candidate: string): boolean {
  const expected = Buffer.from(ACCESS_TOKEN, 'utf8')
  const given = Buffer.from(candidate, 'utf8')
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (expected.length === 0 || expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}

app.addHook('onRequest', async (request, reply) => {
  const path = request.url.split('?')[0]
  // Allow unauthenticated access to auth status, health check, and static frontend assets / routes
  if (path === '/api/health' || path === '/api/auth/required' || !path.startsWith('/api')) return

  if (!ACCESS_TOKEN) {
    if (path.startsWith('/api')) {
      return reply
        .status(503)
        .send({ error: 'Server is not configured. Set ACCESS_TOKEN before using this deployment.' })
    }
    return
  }

  /*
   * `onRequest` runs before the query string is parsed, so the token in the URL
   * is read straight off `request.url` rather than from `request.query`.
   */
  const xToken = request.headers['x-access-token']
  const fromHeader = Array.isArray(xToken) ? xToken[0] : xToken
  const auth = request.headers.authorization
  const bearer =
    typeof auth === 'string' && /^bearer /i.test(auth) ? auth.slice(7).trim() : ''
  const rawToken = /[?&]access_token=([^&]*)/.exec(request.url)?.[1] ?? ''
  let fromQuery = ''
  try {
    fromQuery = decodeURIComponent(rawToken)
  } catch {
    fromQuery = rawToken
  }

  const candidate = bearer || (typeof fromHeader === 'string' ? fromHeader : '') || fromQuery
  if (!tokenMatches(candidate.trim())) {
    return reply.status(401).send({ error: 'Access token required.' })
  }
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

/**
 * Which broker the terminal is currently trading.
 *
 * Paper is the default so a fresh deploy can never open a real position by
 * accident. An operator selects a live broker explicitly, and only a broker
 * that the factory reports as enabled can be selected.
 */
let activeBroker: BrokerId = 'paper'

const currentBroker = (): ReturnType<typeof getBroker> => getBroker(activeBroker)

// ---------------------------------------------------------------- health

app.get('/api/health', async () => ({
  status: 'ok',
  service: 'Bountiful Trading Terminal',
  version: '4.0.0',
  mode: activeBroker === 'paper' ? 'PAPER' : 'LIVE',
  activeBroker,
  liveTradingEnabled: liveTradingAllowed(),
  time: Date.now(),
}))

/**
 * Whether the app needs a token before it can do anything.
 *
 * Sent unauthenticated so the UI can prompt for the token rather than failing
 * every request with an opaque 401.
 */
app.get('/api/auth/required', async () => ({ required: ACCESS_TOKEN.length > 0 }))

// ---------------------------------------------------------------- brokers

app.get('/api/brokers', async () => listBrokers())

app.get(
  '/api/brokers/:broker',
  handle(async (request) => {
    const broker = getBroker(request.params.broker)
    return {
      id: broker.id,
      name: broker.name,
      connected: broker.connected,
      isLive: broker.id !== 'paper',
      enabled: broker.id === 'paper' || (await import('./BrokerFactory')).liveTradingAllowed(),
      capabilities: broker.capabilities,
      account: await broker.getAccount(),
      balance: (await broker.getBalances())[0] ?? null,
    }
  }),
)

app.post(
  '/api/broker/select',
  handle(async (request) => {
    const body = request.body as { brokerId?: BrokerId }
    if (!body?.brokerId) throw new Error('brokerId is required')

    const target = listBrokers().find((b) => b.id === body.brokerId)
    if (!target) throw new Error(`Broker "${body.brokerId}" is not recognized.`)
    // A disabled broker must be unselectable even if the request is forged,
    // so the gate lives on the server, not in the UI.
    if (!target.enabled) {
      throw new Error(
        `${target.name} is not available on this server. Set LIVE_TRADING_ENABLED=true and add COINDCX_API_KEY / COINDCX_API_SECRET to the environment.`,
      )
    }
    if (!target.isLive) {
      activeBroker = 'paper'
      return { success: true, broker: target }
    }

    // Connecting proves the key actually works before the terminal claims it
    // is connected, so a bad key surfaces here rather than at order time.
    await getBroker(body.brokerId).connect()
    activeBroker = body.brokerId
    return { success: true, broker: target }
  }),
)

app.get('/api/broker/active', async () => ({ broker: activeBroker, live: activeBroker !== 'paper' }))

// ---------------------------------------------------------------- market data

app.get(
  '/api/quote',
  handle(async (request) => {
    const { symbol = 'BTC/USDT' } = request.query as { symbol?: string }
    return currentBroker().getQuote(symbol)
  }),
)

app.get(
  '/api/quotes',
  handle(async () => {
    const quotes = await Promise.all(
      sharedMarketData.listSymbols().map((s: string) => currentBroker().getQuote(s)),
    )
    return quotes
  }),
)

app.get(
  '/api/candle',
  handle(async (request) => {
    const { symbol = 'BTC/USDT', timeframe = '1m', limit = '200' } = request.query as {
      symbol?: string
      timeframe?: string
      limit?: string
    }
    return currentBroker().getCandles(symbol, timeframe, Math.min(parseInt(limit, 10) || 200, 1000))
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
    return currentBroker().getOrderBook(symbol)
  }),
)

// ---------------------------------------------------------------- account

app.get(
  '/api/account',
  handle(async () => currentBroker().getAccount()),
)

app.get(
  '/api/balances',
  handle(async () => currentBroker().getBalances()),
)

// ---------------------------------------------------------------- orders

app.post(
  '/api/orders',
  handle(async (request) => {
    const body = request.body as OrderRequest
    const order = await currentBroker().placeOrder(body)
    return { success: true, order }
  }),
)

app.get('/api/orders', handle(async () => currentBroker().getOrderHistory()))

app.get('/api/orders/open', handle(async () => currentBroker().getOpenOrders()))

app.delete(
  '/api/orders/:orderId',
  handle(async (request) => {
    await currentBroker().cancelOrder(request.params.orderId)
    return { success: true, orderId: request.params.orderId }
  }),
)

app.post(
  '/api/size-preview',
  handle(async (request) => {
    const { symbol = 'BTC/USDT', mode = 'QUANTITY', input = 0, leverage = 1 } = request.body as {
      symbol: string
      mode: SizeMode
      input: number
      leverage: number
    }
    return currentBroker().previewSize(symbol, mode, Number(input) || 0, Number(leverage) || 1)
  }),
)

// ---------------------------------------------------------------- positions

app.get('/api/positions', handle(async () => currentBroker().getPositions()))

/** Symbols contain a slash, so they travel in the body rather than the path. */
app.post(
  '/api/positions/protection',
  handle(async (request) => {
    const { symbol, stopLoss, takeProfit } = request.body as {
      symbol?: string
      stopLoss?: number
      takeProfit?: number
    }
    if (!symbol) throw new Error('symbol is required')
    const position = await currentBroker().modifyPosition(
      symbol,
      stopLoss === null ? undefined : stopLoss,
      takeProfit === null ? undefined : takeProfit,
    )
    return { success: true, position }
  }),
)

app.post(
  '/api/positions/close',
  handle(async (request) => {
    const { symbol, quantity } = request.body as { symbol?: string; quantity?: number }
    if (!symbol) throw new Error('symbol is required')
    // Omitting quantity closes the whole position; a smaller value reduces it.
    const order = await currentBroker().closePosition(symbol, quantity)
    return { success: true, order }
  }),
)

// ---------------------------------------------------------------- history

app.get('/api/history', handle(async () => currentBroker().getOrderHistory()))

app.get('/api/journal', handle(async () => currentBroker().getTrades()))

// ---------------------------------------------------------------- paper controls

app.post(
  '/api/paper/reset',
  handle(async () => {
    const broker = currentBroker()
    if (!(broker instanceof PaperTradingAdapter)) {
      throw new Error('Reset is only available on the paper account')
    }
    broker.reset()
    return { success: true, message: 'Paper account reset to 10,000 USDT' }
  }),
)

// ---------------------------------------------------------------- tick loop

let ticking = false
const TICK_MS = Number(process.env.TICK_INTERVAL_MS) || 1000

const timer = setInterval(async () => {
  if (ticking) return
  ticking = true
  try {
    await currentBroker().tick?.()
  } catch {
    // A broker outage must not kill the process; the next tick retries.
  } finally {
    ticking = false
  }
}, TICK_MS)

/*
 * Flush the paper account before exiting so a redeploy does not lose the
 * operator's session. A hard kill still loses it, but a normal stop does not.
 */
async function shutdown(signal: string) {
  console.log(`${signal} received — flushing paper state and shutting down`)
  try {
    if (activeBroker === 'paper') {
      await (getBroker('paper') as PaperTradingAdapter).flush?.()
    }
  } catch {
    // Best effort only: never block shutdown on a failed write.
  }
  clearInterval(timer)
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

async function start() {
  const port = Number(process.env.PORT) || 3000
  const host = process.env.HOST || '0.0.0.0'
  await app.listen({ port, host })
  const mode = activeBroker === 'paper' ? 'PAPER' : 'LIVE'
  console.log(
    `Bountiful Trading Terminal ready at http://${host}:${port} — ${mode} mode` +
      (ACCESS_TOKEN ? ' (token required)' : ' (NO TOKEN — set ACCESS_TOKEN)'),
  )
  if (fs.existsSync(DIST_DIR)) {
    console.log(`Serving frontend from ${DIST_DIR}`)
  } else {
    console.log('No dist/ found — run `npm run build` before starting to serve the UI.')
  }
}

// Render sets NODE_ENV automatically. Auto-start unless something imports this
// file for its types only.
if (process.env.NODE_ENV !== 'test') {
  await start()
}