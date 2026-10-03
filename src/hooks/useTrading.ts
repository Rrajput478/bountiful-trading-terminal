import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../services/api'
import type {
  Account,
  Balance,
  Candle,
  Order,
  OrderRequest,
  Position,
  Quote,
  SymbolSpec,
  Timeframe,
  Trade,
} from '../types/trading'

const QUOTE_MS = 1000
const STATE_MS = 1500

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

export function useTrading() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [candles, setCandles] = useState<Candle[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [history, setHistory] = useState<Order[]>([])
  const [journal, setJournal] = useState<Trade[]>([])
  const [balance, setBalance] = useState<Balance | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [symbols, setSymbols] = useState<SymbolSpec[]>([])
  const [activeSymbol, setActiveSymbol] = useState('BTC/USDT')
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Refs keep the poll loops free of dependency churn (§28 performance).
  // Mirrored in an effect rather than during render, so no ref is read while
  // rendering and a symbol switch always reaches the next poll tick.
  const symbolRef = useRef(activeSymbol)
  const tfRef = useRef(timeframe)
  useEffect(() => {
    symbolRef.current = activeSymbol
  }, [activeSymbol])
  useEffect(() => {
    tfRef.current = timeframe
  }, [timeframe])

  const toastSeq = useRef(0)
  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++toastSeq.current
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  // ---------------------------------------------------------------- bootstrap

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [syms, acct, bal, pos, ord, hist, jrn] = await Promise.all([
          api.getSymbols(),
          api.getAccount(),
          api.getBalances(),
          api.getPositions(),
          api.getOpenOrders(),
          api.getOrderHistory(),
          api.getJournal(),
        ])
        if (!alive) return
        setSymbols(syms)
        setAccount(acct)
        setBalance(bal[0] ?? null)
        setPositions(pos)
        setOrders(ord)
        setHistory(hist)
        setJournal(jrn)
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Failed to load account')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [notify])

  // ---------------------------------------------------------------- quote polling

  useEffect(() => {
    let alive = true
    let timer: number

    const poll = async () => {
      try {
        const list = await api.getQuotes()
        if (!alive) return
        const next: Record<string, Quote> = {}
        for (const q of list) next[q.symbol] = q
        // keep the active symbol populated even if it is not in the list
        if (!next[symbolRef.current]) {
          const q = await api.getQuote(symbolRef.current)
          next[q.symbol] = q
        }
        setQuotes(next)
      } catch {
        /* transient: keep last known prices */
      }
    }

    poll()
    timer = window.setInterval(poll, QUOTE_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  // ---------------------------------------------------------------- candle polling

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const data = await api.getCandles(activeSymbol, timeframe, 200)
        if (alive) setCandles(data)
      } catch {
        /* transient */
      }
    }
    load()
    const timer = window.setInterval(load, 2000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [activeSymbol, timeframe])

  // ---------------------------------------------------------------- state polling

  const refreshAccountState = useCallback(async () => {
    const [pos, bal] = await Promise.all([api.getPositions(), api.getBalances()])
    setPositions(pos)
    setBalance(bal[0] ?? null)
  }, [])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const [pos, bal, ord] = await Promise.all([
          api.getPositions(),
          api.getBalances(),
          api.getOpenOrders(),
        ])
        if (!alive) return
        setPositions(pos)
        setBalance(bal[0] ?? null)
        setOrders(ord)
      } catch {
        /* transient */
      }
    }
    poll()
    const timer = window.setInterval(poll, STATE_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    const [pos, ord, hist, jrn, bal] = await Promise.all([
      api.getPositions(),
      api.getOpenOrders(),
      api.getOrderHistory(),
      api.getJournal(),
      api.getBalances(),
    ])
    setPositions(pos)
    setOrders(ord)
    setHistory(hist)
    setJournal(jrn)
    setBalance(bal[0] ?? null)
  }, [])

  // ---------------------------------------------------------------- actions

  const executeOrder = useCallback(
    async (req: OrderRequest) => {
      setBusy(true)
      try {
        const res = await api.placeOrder(req)
        await refreshAll()
        const o = res.order
        if (o.status === 'FILLED') {
          notify(
            'success',
            `${o.side} ${o.quantity} ${o.symbol} filled @ ${fmt(o.price)}${
              o.leverage ? ` · ${o.leverage}x` : ''
            }`,
          )
        } else {
          notify('info', `${o.type} order placed for ${o.symbol}`)
        }
        return res
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Order failed')
        throw err
      } finally {
        setBusy(false)
      }
    },
    [notify, refreshAll],
  )

  const applyProtection = useCallback(
    async (symbol: string, stopLoss: number | null, takeProfit: number | null) => {
      setBusy(true)
      try {
        const res = await api.setProtection(symbol, stopLoss, takeProfit)
        await refreshAccountState()
        notify('success', 'Protection modified')
        return res
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Could not update protection')
        throw err
      } finally {
        setBusy(false)
      }
    },
    [notify, refreshAccountState],
  )

  const closePosition = useCallback(
    async (symbol: string, quantity?: number) => {
      setBusy(true)
      try {
        const res = await api.closePosition(symbol, quantity)
        await refreshAll()
        const pnl = res.order.realizedPnl
        const closedQty = res.order.quantity
        notify(
          'success',
          `Closed ${closedQty} ${symbol}${pnl !== undefined ? ` · ${pnl >= 0 ? '+' : ''}${fmt(pnl)}` : ''}`,
        )
        return res
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Could not close position')
        throw err
      } finally {
        setBusy(false)
      }
    },
    [notify, refreshAll],
  )

  const cancelOrder = useCallback(
    async (orderId: string) => {
      try {
        await api.cancelOrder(orderId)
        await refreshAll()
        notify('info', `Order ${orderId} cancelled`)
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Could not cancel order')
      }
    },
    [notify, refreshAll],
  )

  const resetAccount = useCallback(async () => {
    try {
      const res = await api.resetPaperAccount()
      await refreshAll()
      notify('info', res.message)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Reset failed')
    }
  }, [notify, refreshAll])

  const selectSymbol = useCallback((symbol: string) => {
    setActiveSymbol(symbol)
  }, [])

  return {
    quotes,
    candles,
    positions,
    orders,
    history,
    journal,
    balance,
    account,
    symbols,
    activeSymbol,
    timeframe,
    loading,
    busy,
    toasts,
    notify,
    dismissToast,
    executeOrder,
    applyProtection,
    closePosition,
    cancelOrder,
    resetAccount,
    refreshAll,
    refreshAccountState,
    setTimeframe,
    selectSymbol,
  }
}

function fmt(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}