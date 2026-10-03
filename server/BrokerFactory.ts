import type { BrokerAdapter, BrokerId } from './BrokerAdapter'
import { PaperTradingAdapter } from './providers/PaperTradingAdapter'
import { CoinDcxAdapter } from './providers/CoinDcxAdapter'
import { UpstoxAdapter, DeltaAdapter, hasEnvCredentials } from './providers/LiveBrokerStubs'
import { PaperMarketDataProvider } from './market-data/PaperMarketDataProvider'

const sharedMarketData = new PaperMarketDataProvider()

const coinDcx = new CoinDcxAdapter()
const upstox = new UpstoxAdapter(sharedMarketData)
const delta = new DeltaAdapter(sharedMarketData)

const brokerInstances: Record<string, BrokerAdapter> = {
  paper: new PaperTradingAdapter(sharedMarketData),
  coindcx: coinDcx,
  upstox,
  delta,
}

/**
 * Whether an operator has deliberately opened a broker to real execution.
 *
 * This is the single switch that governs live money. It defaults to closed, so
 * a fresh deploy — or one whose env vars were mis-copied — can never place a
 * real order, no matter how many credentials happen to be present.
 */
export function liveTradingAllowed(): boolean {
  return process.env.LIVE_TRADING_ENABLED === 'true'
}

export function getBroker(brokerId: BrokerId | string = 'paper'): BrokerAdapter {
  const broker = brokerInstances[brokerId]
  if (!broker) {
    throw new Error(
      `Broker "${brokerId}" is not recognized. Available: ${Object.keys(brokerInstances).join(', ')}`,
    )
  }
  return broker
}

function liveUsable(broker: BrokerAdapter): boolean {
  switch (broker.id) {
    case 'coindcx':
      return coinDcx.enabled
    case 'upstox':
      return liveTradingAllowed() && hasEnvCredentials('UPSTOX')
    case 'delta':
      return liveTradingAllowed() && hasEnvCredentials('DELTA')
    default:
      return false
  }
}

/**
 * Paper is always first and always usable. A live broker is reported as
 * enabled only when the operator has both opted in AND supplied credentials —
 * so the UI can never offer an unconfigured broker as connected.
 */
export function listBrokers() {
  const descriptions: Record<string, string> = {
    paper: 'Virtual account · 10,000 USDT · no real funds',
    coindcx: 'CoinDCX crypto spot & futures · real funds when enabled',
    upstox: 'Upstox NSE/BSE equities and F&O · adapter not implemented',
    delta: 'Delta Exchange derivatives · adapter not implemented',
  }

  return Object.values(brokerInstances).map((broker) => {
    const enabled = broker.id === 'paper' || liveUsable(broker)
    return {
      id: broker.id,
      name: broker.name,
      description: descriptions[broker.id] ?? '',
      connected: broker.id === 'paper' ? broker.connected : broker.connected && enabled,
      isLive: broker.id !== 'paper',
      enabled,
      capabilities: broker.capabilities,
    }
  })
}

export { coinDcx, sharedMarketData }