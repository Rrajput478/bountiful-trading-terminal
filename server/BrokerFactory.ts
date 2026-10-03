import type { BrokerAdapter, BrokerId } from './BrokerAdapter'
import { PaperTradingAdapter } from './providers/PaperTradingAdapter'
import { CoinDcxAdapter, DeltaAdapter, UpstoxAdapter } from './providers/LiveBrokerStubs'
import { PaperMarketDataProvider } from './market-data/PaperMarketDataProvider'

const sharedMarketData = new PaperMarketDataProvider()

const brokerInstances: Record<string, BrokerAdapter> = {
  paper: new PaperTradingAdapter(sharedMarketData),
  coindcx: new CoinDcxAdapter(sharedMarketData),
  upstox: new UpstoxAdapter(sharedMarketData),
  delta: new DeltaAdapter(sharedMarketData),
}

export function getBroker(brokerId: BrokerId | string = 'paper'): BrokerAdapter {
  const broker = brokerInstances[brokerId]
  if (!broker) {
    throw new Error(`Broker "${brokerId}" is not recognized. Available: ${Object.keys(brokerInstances).join(', ')}`)
  }
  return broker
}

/**
 * Paper Trading is always listed first and is the only broker enabled by
 * default. Live brokers report live=false until their adapter is implemented,
 * so the UI can never present an unimplemented broker as connected.
 */
export function listBrokers() {
  const descriptions: Record<string, string> = {
    paper: 'Virtual account · 10,000 USDT · no real funds',
    coindcx: 'Crypto spot and futures (adapter not implemented)',
    upstox: 'NSE/BSE equities and F&O (adapter not implemented)',
    delta: 'Crypto derivatives (adapter not implemented)',
  }

  return Object.values(brokerInstances).map((broker) => ({
    id: broker.id,
    name: broker.name,
    description: descriptions[broker.id] ?? '',
    connected: broker.id === 'paper' ? broker.connected : false,
    isLive: broker.id !== 'paper',
    enabled: broker.id === 'paper',
    capabilities: broker.capabilities,
  }))
}

export { sharedMarketData }