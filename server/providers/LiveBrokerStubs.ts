import type { Account, Balance, BrokerAdapter, BrokerCapabilities, BrokerId, Order, OrderBook, OrderRequest, Position, Quote, SizeMode, SizePreview, Trade } from '../BrokerAdapter'
import { PaperMarketDataProvider } from '../market-data/PaperMarketDataProvider'

/**
 * Credentials are read from the process environment ONLY. They never travel to
 * the browser and are never stored on the adapter instance.
 */
export function readEnvCredentials(prefix: string): Record<string, string> {
  const keys = [
    'API_KEY',
    'API_SECRET',
    'ACCESS_TOKEN',
    'REFRESH_TOKEN',
    'CLIENT_ID',
    'CLIENT_SECRET',
  ]
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = process.env[`${prefix}_${key}`]
    if (value && value.trim().length > 0) out[key] = value.trim()
  }
  return out
}

export function hasEnvCredentials(prefix: string): boolean {
  return Object.keys(readEnvCredentials(prefix)).length > 0
}

/**
 * Shared base for brokers whose real API integration is not implemented yet.
 *
 * It serves live market data so the UI can be exercised, but it refuses every
 * trading action instead of simulating one behind a "connected" badge.
 */
export abstract class NotImplementedBrokerAdapter implements BrokerAdapter {
  abstract id: BrokerId
  abstract name: string
  abstract capabilities: BrokerCapabilities
  abstract envPrefix: string

  connected = false

  protected marketData: PaperMarketDataProvider

  constructor(marketData: PaperMarketDataProvider = new PaperMarketDataProvider()) {
    this.marketData = marketData
  }

  async connect(): Promise<boolean> {
    if (!hasEnvCredentials(this.envPrefix)) {
      throw new Error(
        `${this.name} is not connected. Set ${this.envPrefix}_API_KEY and ${this.envPrefix}_API_SECRET on the backend, then implement the live adapter.`,
      )
    }
    // Credentials are present but the REST integration is still unimplemented.
    throw new Error(
      `${this.name} live API integration is not implemented yet. Use Paper Trading, or ask for the adapter to be built.`,
    )
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async getAccount(): Promise<Account> {
    return {
      id: `${this.id.toUpperCase()}-NOT-CONFIGURED`,
      name: `${this.name} (not connected)`,
      broker: this.id,
      currency: 'INR',
      connected: false,
      isDemo: false,
    }
  }

  async getBalances(): Promise<Balance[]> {
    return []
  }

  async getQuote(symbol: string): Promise<Quote> {
    return this.marketData.getQuote(symbol)
  }

  async getOrderBook(symbol: string): Promise<OrderBook> {
    return this.marketData.getOrderBook(symbol)
  }

  protected unavailable(): never {
    throw new Error(
      `${this.name} live trading is disabled. This broker is not connected — switch to Paper Trading.`,
    )
  }

  async placeOrder(_order: OrderRequest): Promise<Order> {
    this.unavailable()
  }

  async cancelOrder(_orderId: string): Promise<void> {
    this.unavailable()
  }

  async closePosition(_symbol: string, _quantity?: number, _reason?: Order['closeReason']): Promise<Order> {
    this.unavailable()
  }

  async modifyPosition(_symbol: string, _sl?: number, _tp?: number): Promise<Position> {
    this.unavailable()
  }

  async getOpenOrders(): Promise<Order[]> {
    return []
  }

  async getPositions(): Promise<Position[]> {
    return []
  }

  async getOrderHistory(): Promise<Order[]> {
    return []
  }

  async getTrades(): Promise<Trade[]> {
    return []
  }

  async previewSize(
    symbol: string,
    mode: SizeMode,
    input: number,
    leverage: number,
  ): Promise<SizePreview> {
    const spec = this.marketData.getSpec(symbol)
    const quote = await this.marketData.getQuote(symbol)
    const lev = Math.min(Math.max(leverage || 1, 1), spec.leverageMax)
    const price = mode === 'QUANTITY' ? quote.last : quote.ask
    const quantity =
      mode === 'QUANTITY'
        ? input
        : mode === 'MARGIN'
          ? (input * lev) / Math.max(price, 1e-9)
          : input * spec.contractSize
    const notional = quantity * price
    return {
      mode,
      input,
      quantity,
      notional: Number(notional.toFixed(2)),
      initialMargin: Number((notional / lev).toFixed(2)),
      estimatedFee: Number((notional * 0.0004).toFixed(2)),
      lotSize: spec.lotSize,
      minQuantity: spec.minQuantity,
      maxQuantity: spec.maxQuantity,
      quantityStep: spec.quantityStep,
    }
  }
}

export class CoinDcxAdapter extends NotImplementedBrokerAdapter {
  id: BrokerId = 'coindcx'
  name = 'CoinDCX'
  envPrefix = 'COINDCX'

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: false,
    shortSelling: true,
    leverageMax: 50,
    supportedMarkets: ['CRYPTO'],
  }
}

export class UpstoxAdapter extends NotImplementedBrokerAdapter {
  id: BrokerId = 'upstox'
  name = 'Upstox'
  envPrefix = 'UPSTOX'

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: true,
    shortSelling: true,
    leverageMax: 20,
    supportedMarkets: ['EQUITY', 'F&O'],
  }
}

export class DeltaAdapter extends NotImplementedBrokerAdapter {
  id: BrokerId = 'delta'
  name = 'Delta Exchange'
  envPrefix = 'DELTA'

  capabilities: BrokerCapabilities = {
    spot: true,
    futures: true,
    options: true,
    shortSelling: true,
    leverageMax: 75,
    supportedMarkets: ['CRYPTO'],
  }
}