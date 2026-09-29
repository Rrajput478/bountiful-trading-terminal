import {
  BrokerAdapter,
  BrokerId,
} from './BrokerAdapter'

import { PaperTradingAdapter } from './providers/PaperTradingAdapter'
import { CoinDcxAdapter } from './providers/CoinDcxAdapter'
import { UpstoxAdapter } from './providers/UpstoxAdapter'
import { PaperMarketDataProvider } from './market-data/PaperMarketDataProvider'

const sharedMarketData = new PaperMarketDataProvider()

const brokerInstances: Record<string, BrokerAdapter> = {
  paper: new PaperTradingAdapter(sharedMarketData),
  coindcx: new CoinDcxAdapter(sharedMarketData),
  upstox: new UpstoxAdapter(sharedMarketData),
}

export function getBroker(brokerId: BrokerId = 'paper'): BrokerAdapter {
  const broker = brokerInstances[brokerId]
  if (!broker) {
    throw new Error(`Broker "${brokerId}" is not recognized. Available: paper, coindcx, upstox`)
  }
  return broker
}

export function listBrokers() {
  return Object.values(brokerInstances).map((broker) => ({
    id: broker.id,
    name: broker.name,
    connected: broker.connected,
    capabilities: broker.capabilities,
  }))
}

export { sharedMarketData }
