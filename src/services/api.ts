const API_BASE_URL = 'http://127.0.0.1:3000'

export async function getBackendHealth() {
  const response = await fetch(
    `${API_BASE_URL}/api/health`,
  )

  if (!response.ok) {
    throw new Error('Backend is not responding')
  }

  return response.json()
}

export async function getPaperTradingAccount() {
  const response = await fetch(
    `${API_BASE_URL}/api/brokers/paper`,
  )

  if (!response.ok) {
    throw new Error(
      'Paper Trading backend request failed',
    )
  }

  return response.json()
}

export interface OrderRequest {
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  quantity: number
  price?: number
  stopPrice?: number
}

export async function placeOrder(orderRequest: OrderRequest) {
  const response = await fetch(
    `${API_BASE_URL}/api/order/paper`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderRequest),
    },
  )

  if (!response.ok) {
    throw new Error('Order placement failed')
  }

  return response.json()
}

export async function getPositions() {
  const response = await fetch(
    `${API_BASE_URL}/api/positions/paper`,
  )

  if (!response.ok) {
    throw new Error('Failed to fetch positions')
  }

  return response.json()
}

export async function getOpenOrders() {
  const response = await fetch(
    `${API_BASE_URL}/api/orders/paper`,
  )

  if (!response.ok) {
    throw new Error('Failed to fetch orders')
  }

  return response.json()
}

export async function getOrderHistory() {
  const response = await fetch(
    `${API_BASE_URL}/api/orders/paper/history`,
  )

  if (!response.ok) {
    throw new Error('Failed to fetch order history')
  }

  return response.json()
}

export async function getBalances() {
  const response = await fetch(
    `${API_BASE_URL}/api/balances/paper`,
  )

  if (!response.ok) {
    throw new Error('Failed to fetch balances')
  }

  return response.json()
}

export async function cancelOrder(orderId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/order/paper/${orderId}`,
    {
      method: 'DELETE',
    },
  )

  if (!response.ok) {
    throw new Error('Failed to cancel order')
  }

  return response.json()
}
