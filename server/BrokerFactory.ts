import {
  BrokerAdapter,
  BrokerId,
} from './BrokerAdapter'

import { PaperTradingAdapter } from './providers/PaperTradingAdapter'

export function getBroker(
  brokerId: BrokerId,
): BrokerAdapter {
  switch (brokerId) {
    case 'paper':
      return new PaperTradingAdapter()

    default:
      throw new Error(
        `Broker "${brokerId}" is not connected yet.`,
      )
  }
}