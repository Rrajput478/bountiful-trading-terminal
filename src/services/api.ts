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