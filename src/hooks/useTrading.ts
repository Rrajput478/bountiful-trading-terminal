import { useCallback, useEffect, useState } from 'react'
import * as api from '../services/api'

export interface Position {
  symbol: string
  side: 'LONG' | 'SHORT'
  quantity: number
  entryPrice: number
  currentPrice: number
  pnl: number
}

export interface Order {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  quantity: number
  filledQuantity: number
  price?: number
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
  timestamp: number
}

export interface Balance {
  asset: string
  available: number
  locked: number
}

export function useTrading() {
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [orderHistory, setOrderHistory] = useState<Order[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOrderSuccess, setLastOrderSuccess] = useState<string | null>(null)

  // Load positions
  const loadPositions = useCallback(async () => {
    try {
      const response = await api.getPositions()
      setPositions(response.positions || [])
    } catch (err) {
      console.error('Failed to load positions:', err)
    }
  }, [])

  // Load open orders
  const loadOrders = useCallback(async () => {
    try {
      const response = await api.getOpenOrders()
      setOrders(response.orders || [])
    } catch (err) {
      console.error('Failed to load orders:', err)
    }
  }, [])

  // Load order history
  const loadOrderHistory = useCallback(async () => {
    try {
      const response = await api.getOrderHistory()
      setOrderHistory(response.orders || [])
    } catch (err) {
      console.error('Failed to load order history:', err)
    }
  }, [])

  // Load balances
  const loadBalances = useCallback(async () => {
    try {
      const response = await api.getBalances()
      setBalances(response.balances || [])
    } catch (err) {
      console.error('Failed to load balances:', err)
    }
  }, [])

  // Place order
  const placeOrder = useCallback(
    async (orderRequest: api.OrderRequest) => {
      setIsExecuting(true)
      setError(null)
      setLastOrderSuccess(null)

      try {
        const response = await api.placeOrder(orderRequest)

        if (response.success) {
          setLastOrderSuccess(
            `${orderRequest.side} order executed: ${orderRequest.quantity} ${orderRequest.symbol}`,
          )

          // Reload data after successful order
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
    [loadPositions, loadOrders, loadOrderHistory, loadBalances],
  )

  // Cancel order
  const cancelOrder = useCallback(
    async (orderId: string) => {
      try {
        await api.cancelOrder(orderId)
        await loadOrders()
        await loadOrderHistory()
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to cancel order'
        setError(errorMessage)
        throw err
      }
    },
    [loadOrders, loadOrderHistory],
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

  // Auto-refresh positions and balances
  useEffect(() => {
    refreshAll()

    const interval = setInterval(() => {
      loadPositions()
      loadBalances()
    }, 3000) // Refresh every 3 seconds

    return () => clearInterval(interval)
  }, [loadPositions, loadBalances, refreshAll])

  // Clear success message after 5 seconds
  useEffect(() => {
    if (lastOrderSuccess) {
      const timeout = setTimeout(() => {
        setLastOrderSuccess(null)
      }, 5000)

      return () => clearTimeout(timeout)
    }
  }, [lastOrderSuccess])

  // Clear error message after 5 seconds
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => {
        setError(null)
      }, 5000)

      return () => clearTimeout(timeout)
    }
  }, [error])

  return {
    positions,
    orders,
    orderHistory,
    balances,
    isExecuting,
    error,
    lastOrderSuccess,
    placeOrder,
    cancelOrder,
    refreshAll,
  }
}
