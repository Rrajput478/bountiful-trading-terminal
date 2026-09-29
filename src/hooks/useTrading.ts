import { useCallback, useEffect, useState } from 'react'
import * as api from '../services/api'

export interface Position {
  symbol: string
  side: 'LONG' | 'SHORT'
  quantity: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercentage?: number
  leverage?: number
  margin?: number
  liquidationPrice?: number
}

export interface Order {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  quantity: number
  filledQuantity: number
  price?: number
  stopPrice?: number
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
  timestamp: number
}

export interface Balance {
  asset: string
  available: number
  locked: number
  total: number
}

export interface TradeJournalEntry {
  id: string
  timestamp: number
  symbol: string
  side: 'BUY' | 'SELL'
  type: string
  quantity: number
  price: number
  broker: string
  notes?: string
}

export function useTrading(initialBroker: string = 'paper') {
  const [activeBroker, setActiveBroker] = useState<string>(initialBroker)
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [orderHistory, setOrderHistory] = useState<Order[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [journal, setJournal] = useState<TradeJournalEntry[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOrderSuccess, setLastOrderSuccess] = useState<string | null>(null)

  // Load positions
  const loadPositions = useCallback(async () => {
    try {
      const response = await api.getPositions(activeBroker)
      setPositions(Array.isArray(response) ? response : [])
    } catch (err) {
      console.error('Failed to load positions:', err)
    }
  }, [activeBroker])

  // Load open orders
  const loadOrders = useCallback(async () => {
    try {
      const response = await api.getOpenOrders(activeBroker)
      setOrders(Array.isArray(response) ? response : [])
    } catch (err) {
      console.error('Failed to load orders:', err)
    }
  }, [activeBroker])

  // Load order history
  const loadOrderHistory = useCallback(async () => {
    try {
      const response = await api.getOrderHistory(activeBroker)
      setOrderHistory(Array.isArray(response) ? response : [])
    } catch (err) {
      console.error('Failed to load order history:', err)
    }
  }, [activeBroker])

  // Load balances
  const loadBalances = useCallback(async () => {
    try {
      const response = await api.getBalances(activeBroker)
      setBalances(Array.isArray(response) ? response : [])
    } catch (err) {
      console.error('Failed to load balances:', err)
    }
  }, [activeBroker])

  // Place order
  const placeOrder = useCallback(
    async (orderRequest: api.OrderRequest) => {
      setIsExecuting(true)
      setError(null)
      setLastOrderSuccess(null)

      try {
        const response = await api.placeOrder(orderRequest, activeBroker)

        if (response.success) {
          const successMsg = `${orderRequest.side} ${orderRequest.quantity} ${orderRequest.symbol} executed successfully!`
          setLastOrderSuccess(successMsg)

          // Add to local journal
          const newEntry: TradeJournalEntry = {
            id: response.order?.id || `JRN-${Date.now()}`,
            timestamp: Date.now(),
            symbol: orderRequest.symbol,
            side: orderRequest.side,
            type: orderRequest.type,
            quantity: orderRequest.quantity,
            price: response.order?.price || 0,
            broker: activeBroker.toUpperCase(),
          }
          setJournal((prev) => [newEntry, ...prev])

          // Reload state
          await Promise.all([
            loadPositions(),
            loadOrders(),
            loadOrderHistory(),
            loadBalances(),
          ])
        }

        return response
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Order execution failed'
        setError(errorMessage)
        throw err
      } finally {
        setIsExecuting(false)
      }
    },
    [activeBroker, loadPositions, loadOrders, loadOrderHistory, loadBalances],
  )

  // Close position
  const closePosition = useCallback(
    async (symbol: string) => {
      setIsExecuting(true)
      setError(null)
      try {
        const response = await api.closePosition(symbol, activeBroker)
        setLastOrderSuccess(`Position closed for ${symbol}`)
        await Promise.all([
          loadPositions(),
          loadOrders(),
          loadOrderHistory(),
          loadBalances(),
        ])
        return response
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to close position'
        setError(msg)
        throw err
      } finally {
        setIsExecuting(false)
      }
    },
    [activeBroker, loadPositions, loadOrders, loadOrderHistory, loadBalances],
  )

  // Cancel order
  const cancelOrder = useCallback(
    async (orderId: string) => {
      try {
        await api.cancelOrder(orderId, activeBroker)
        setLastOrderSuccess(`Order ${orderId} cancelled`)
        await loadOrders()
        await loadOrderHistory()
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to cancel order'
        setError(errorMessage)
        throw err
      }
    },
    [activeBroker, loadOrders, loadOrderHistory],
  )

  // Refresh all data
  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadPositions(),
      loadOrders(),
      loadOrderHistory(),
      loadBalances(),
    ])
  }, [loadPositions, loadOrders, loadOrderHistory, loadBalances])

  // Auto-refresh positions, orders, balances
  useEffect(() => {
    refreshAll()
    const interval = setInterval(() => {
      loadPositions()
      loadBalances()
    }, 2000)

    return () => clearInterval(interval)
  }, [loadPositions, loadBalances, refreshAll, activeBroker])

  // Clear success notification
  useEffect(() => {
    if (lastOrderSuccess) {
      const timeout = setTimeout(() => {
        setLastOrderSuccess(null)
      }, 4000)
      return () => clearTimeout(timeout)
    }
  }, [lastOrderSuccess])

  // Clear error notification
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => {
        setError(null)
      }, 5000)
      return () => clearTimeout(timeout)
    }
  }, [error])

  return {
    activeBroker,
    setActiveBroker,
    positions,
    orders,
    orderHistory,
    balances,
    journal,
    isExecuting,
    error,
    lastOrderSuccess,
    placeOrder,
    closePosition,
    cancelOrder,
    refreshAll,
  }
}
