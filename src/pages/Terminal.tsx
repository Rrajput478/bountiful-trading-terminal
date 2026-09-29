import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import Chart from '../components/Chart'
import './Terminal.css'
import { useTrading, type Position } from '../hooks/useTrading'
import * as api from '../services/api'

type MT5Tab = 'QUOTES' | 'CHART' | 'TRADE' | 'HISTORY' | 'SETTINGS'
type SymbolCategory = 'ALL' | 'CRYPTO' | 'INDIAN'
type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'

interface SymbolInfo {
  symbol: string
  name: string
  category: 'CRYPTO' | 'INDIAN'
  basePrice: number
  decimals: number
  lotSize: number
  currency: 'USDT' | 'INR'
}

const AVAILABLE_SYMBOLS: SymbolInfo[] = [
  // Crypto
  { symbol: 'BTC/USDT', name: 'Bitcoin', category: 'CRYPTO', basePrice: 67550, decimals: 2, lotSize: 1, currency: 'USDT' },
  { symbol: 'ETH/USDT', name: 'Ethereum', category: 'CRYPTO', basePrice: 3520, decimals: 2, lotSize: 1, currency: 'USDT' },
  { symbol: 'SOL/USDT', name: 'Solana', category: 'CRYPTO', basePrice: 182.4, decimals: 2, lotSize: 1, currency: 'USDT' },
  { symbol: 'BNB/USDT', name: 'Binance Coin', category: 'CRYPTO', basePrice: 590.2, decimals: 2, lotSize: 1, currency: 'USDT' },
  { symbol: 'DOGE/USDT', name: 'Dogecoin', category: 'CRYPTO', basePrice: 0.165, decimals: 4, lotSize: 100, currency: 'USDT' },
  // Indian Markets (Upstox)
  { symbol: 'NIFTY 50', name: 'Nifty 50 Index', category: 'INDIAN', basePrice: 25930, decimals: 2, lotSize: 25, currency: 'INR' },
  { symbol: 'BANKNIFTY', name: 'Bank Nifty Index', category: 'INDIAN', basePrice: 54100, decimals: 2, lotSize: 15, currency: 'INR' },
  { symbol: 'RELIANCE', name: 'Reliance Industries', category: 'INDIAN', basePrice: 2980.5, decimals: 2, lotSize: 1, currency: 'INR' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', category: 'INDIAN', basePrice: 4250, decimals: 2, lotSize: 1, currency: 'INR' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', category: 'INDIAN', basePrice: 1680, decimals: 2, lotSize: 1, currency: 'INR' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', category: 'INDIAN', basePrice: 975, decimals: 2, lotSize: 1, currency: 'INR' },
  { symbol: 'INFY', name: 'Infosys Limited', category: 'INDIAN', basePrice: 1890, decimals: 2, lotSize: 1, currency: 'INR' },
]

const TIMEFRAMES = [
  { label: 'M1', value: '1m' },
  { label: 'M5', value: '5m' },
  { label: 'M15', value: '15m' },
  { label: 'M30', value: '30m' },
  { label: 'H1', value: '1H' },
  { label: 'H4', value: '4H' },
  { label: 'D1', value: '1D' },
]

function Terminal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialBroker = searchParams.get('broker') || localStorage.getItem('active_broker') || 'paper'

  const trading = useTrading(initialBroker)

  // MT5 Tab state (Quotes, Chart, Trade, History, Settings)
  const [mt5Tab, setMt5Tab] = useState<MT5Tab>('CHART')

  // Symbol & timeframe
  const [symbol, setSymbol] = useState<string>('BTC/USDT')
  const [symbolCategory, setSymbolCategory] = useState<SymbolCategory>('ALL')
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [timeframe, setTimeframe] = useState<string>('1m')

  // Trading parameters
  const [lots, setLots] = useState<number>(0.1)
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [limitPrice, setLimitPrice] = useState<string>('')
  const [stopPrice, setStopPrice] = useState<string>('')
  const [stopLoss, setStopLoss] = useState<string>('')
  const [takeProfit, setTakeProfit] = useState<string>('')
  const [leverage, setLeverage] = useState<number>(10)
  const [tradeModalOpen, setTradeModalOpen] = useState<boolean>(false)
  const [modifyModalPos, setModifyModalPos] = useState<Position | null>(null)
  const [modSl, setModSl] = useState<string>('')
  const [modTp, setModTp] = useState<string>('')

  // Layout toggles
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [orderbookOpen, setOrderbookOpen] = useState<boolean>(true)
  const [quotes, setQuotes] = useState<Record<string, api.Quote>>({})
  const [orderBook, setOrderBook] = useState<{ bids: any[]; asks: any[] }>({ bids: [], asks: [] })

  // Active Symbol metadata
  const currentSymbolInfo = useMemo(() => {
    return AVAILABLE_SYMBOLS.find((s) => s.symbol === symbol) || AVAILABLE_SYMBOLS[0]
  }, [symbol])

  // Sync broker selection
  const handleBrokerChange = (newBroker: string) => {
    trading.setActiveBroker(newBroker)
    localStorage.setItem('active_broker', newBroker)
    setSearchParams({ broker: newBroker })
  }

  // Poll current symbol quote & orderbook
  useEffect(() => {
    let active = true

    const fetchMarketData = async () => {
      try {
        const q = await api.getQuote(symbol)
        if (active) {
          setQuotes((prev) => ({ ...prev, [symbol]: q }))
        }
      } catch (err) {
        // silent
      }

      try {
        const book = await api.getOrderBook(symbol)
        if (active && book) {
          setOrderBook(book)
        }
      } catch (err) {
        // silent
      }
    }

    fetchMarketData()
    const interval = setInterval(fetchMarketData, 1000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [symbol])

  // Poll watchlist quotes every 2s
  useEffect(() => {
    let active = true
    const fetchWatchlistQuotes = async () => {
      const updated: Record<string, api.Quote> = {}
      for (const item of AVAILABLE_SYMBOLS) {
        try {
          const q = await api.getQuote(item.symbol)
          updated[item.symbol] = q
        } catch (e) {
          // ignore
        }
      }
      if (active) {
        setQuotes((prev) => ({ ...prev, ...updated }))
      }
    }

    fetchWatchlistQuotes()
    const interval = setInterval(fetchWatchlistQuotes, 2000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const selectedQuote = quotes[symbol]
  const currentPrice = selectedQuote?.last || currentSymbolInfo.basePrice
  const askPrice = selectedQuote?.ask || currentPrice * 1.0002
  const bidPrice = selectedQuote?.bid || currentPrice * 0.9998
  const change24h = selectedQuote?.change24h || 0

  // Filtered symbols for quotes list
  const filteredSymbols = useMemo(() => {
    return AVAILABLE_SYMBOLS.filter((s) => {
      const matchCat =
        symbolCategory === 'ALL' ||
        (symbolCategory === 'CRYPTO' && s.category === 'CRYPTO') ||
        (symbolCategory === 'INDIAN' && s.category === 'INDIAN')
      const matchSearch =
        s.symbol.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.name.toLowerCase().includes(searchFilter.toLowerCase())
      return matchCat && matchSearch
    })
  }, [symbolCategory, searchFilter])

  // Quantity calculation
  const totalQuantity = useMemo(() => {
    return Number((lots * currentSymbolInfo.lotSize).toFixed(4))
  }, [lots, currentSymbolInfo])

  const notionalValue = totalQuantity * currentPrice
  const requiredMargin = leverage > 1 ? notionalValue / leverage : notionalValue

  // Floating P&L from positions
  const totalFloatingPnl = useMemo(() => {
    return trading.positions.reduce((acc, pos) => acc + (pos.pnl || 0), 0)
  }, [trading.positions])

  const balanceInfo = trading.balances[0] || {
    available: 100000,
    locked: 0,
    total: 100000,
    equity: 100000,
    freeMargin: 100000,
    marginLevel: 9999,
  }

  const equity = (balanceInfo.total || 100000) + totalFloatingPnl
  const freeMargin = Math.max(0, equity - (balanceInfo.locked || 0))
  const marginLevel = balanceInfo.locked > 0 ? (equity / balanceInfo.locked) * 100 : 9999

  // Order Execution Handlers
  const handleExecuteOrder = async (side: 'BUY' | 'SELL') => {
    if (totalQuantity <= 0) {
      alert('Please specify a valid lot size')
      return
    }

    const orderReq: api.OrderRequest = {
      symbol,
      side,
      type: orderType,
      quantity: totalQuantity,
      price: orderType === 'LIMIT' || orderType === 'STOP_LIMIT' ? parseFloat(limitPrice) || currentPrice : undefined,
      stopPrice: orderType === 'STOP' || orderType === 'STOP_LIMIT' ? parseFloat(stopPrice) || currentPrice : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
      leverage,
    }

    await trading.placeOrder(orderReq)
    setTradeModalOpen(false)
  }

  // Quick 1-Click execution directly from Chart MT5 bar
  const handleQuickTrade = async (side: 'BUY' | 'SELL', quickLot: number) => {
    const qty = Number((quickLot * currentSymbolInfo.lotSize).toFixed(4))
    if (qty <= 0) return

    const orderReq: api.OrderRequest = {
      symbol,
      side,
      type: 'MARKET',
      quantity: qty,
      leverage,
    }

    await trading.placeOrder(orderReq)
  }

  // Open Modify SL/TP Modal
  const openModifyModal = (pos: Position) => {
    setModifyModalPos(pos)
    setModSl(pos.stopLoss ? pos.stopLoss.toString() : '')
    setModTp(pos.takeProfit ? pos.takeProfit.toString() : '')
  }

  const handleSaveModify = async () => {
    if (!modifyModalPos) return
    const slVal = modSl ? parseFloat(modSl) : undefined
    const tpVal = modTp ? parseFloat(modTp) : undefined
    await trading.modifyPosition(modifyModalPos.symbol, slVal, tpVal)
    setModifyModalPos(null)
  }

  const formatCurrency = (val: number | undefined, curr = currentSymbolInfo.currency) => {
    if (val === undefined || isNaN(val)) return '—'
    const prefix = curr === 'INR' ? '₹' : '$'
    return `${prefix}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Quick SL/TP helper presets
  const applySlPreset = (percent: number, side: 'BUY' | 'SELL') => {
    const price = currentPrice
    const factor = side === 'BUY' ? 1 - percent / 100 : 1 + percent / 100
    setStopLoss((price * factor).toFixed(currentSymbolInfo.decimals))
  }

  const applyTpPreset = (percent: number, side: 'BUY' | 'SELL') => {
    const price = currentPrice
    const factor = side === 'BUY' ? 1 + percent / 100 : 1 - percent / 100
    setTakeProfit((price * factor).toFixed(currentSymbolInfo.decimals))
  }

  return (
    <div className={`mt5-terminal ${theme}`}>
      {/* 1. Universal Header (Broker, Symbol, Theme, Status) */}
      <header className="mt5-header">
        <div className="header-left">
          <div className="app-logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">BOUNTIFUL MT5</span>
          </div>

          <div className="broker-pill-selector">
            <span className="live-dot online"></span>
            <select
              value={trading.activeBroker}
              onChange={(e) => handleBrokerChange(e.target.value)}
              className="broker-dropdown"
            >
              <option value="paper">⚡ Paper Trading (Demo $100k)</option>
              <option value="upstox">📈 Upstox Pro V2 (India Equities/F&O)</option>
              <option value="coindcx">🪙 CoinDCX Pro (Crypto)</option>
            </select>
          </div>
        </div>

        <div className="header-center">
          <div className="active-symbol-summary" onClick={() => setMt5Tab('QUOTES')}>
            <span className="sym-name">{symbol}</span>
            <span className="sym-price">{formatCurrency(currentPrice)}</span>
            <span className={`sym-chg ${change24h >= 0 ? 'up' : 'down'}`}>
              {change24h >= 0 ? `+${change24h}%` : `${change24h}%`}
            </span>
          </div>
        </div>

        <div className="header-right">
          <button
            className="mt5-icon-btn"
            onClick={() => setOrderbookOpen(!orderbookOpen)}
            title="Toggle Order Book"
          >
            📊 Book
          </button>
          <button
            className="mt5-icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle Theme"
          >
            {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
          </button>
          <button
            className="new-order-top-btn"
            onClick={() => setTradeModalOpen(true)}
          >
            + New Order
          </button>
        </div>
      </header>

      {/* Notifications Toast */}
      {trading.lastOrderSuccess && (
        <div className="mt5-toast success">
          <span className="toast-icon">✓</span> {trading.lastOrderSuccess}
        </div>
      )}
      {trading.error && (
        <div className="mt5-toast error">
          <span className="toast-icon">⚠</span> {trading.error}
        </div>
      )}

      {/* 2. Main Body Container (Desktop Multi-Pane OR Mobile Active Tab View) */}
      <main className="mt5-main-layout">
        {/* TAB 1: QUOTES (Quotes / Watchlist) */}
        <section className={`quotes-screen ${mt5Tab === 'QUOTES' ? 'mobile-visible' : ''}`}>
          <div className="quotes-top-bar">
            <h3>Market Watch</h3>
            <div className="category-chips">
              {(['ALL', 'CRYPTO', 'INDIAN'] as SymbolCategory[]).map((cat) => (
                <button
                  key={cat}
                  className={`chip ${symbolCategory === cat ? 'active' : ''}`}
                  onClick={() => setSymbolCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="quotes-search-box">
            <input
              type="text"
              placeholder="Search symbol (BTC, NIFTY, RELIANCE)..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>

          <div className="quotes-list-table">
            <div className="quotes-thead">
              <div className="col-sym">Symbol / Name</div>
              <div className="col-bid">Bid (Sell)</div>
              <div className="col-ask">Ask (Buy)</div>
              <div className="col-chg">24h High/Low</div>
            </div>

            <div className="quotes-tbody">
              {filteredSymbols.map((item) => {
                const q = quotes[item.symbol]
                const itemPrice = q?.last || item.basePrice
                const itemBid = q?.bid || itemPrice * 0.9998
                const itemAsk = q?.ask || itemPrice * 1.0002
                const itemChg = q?.change24h || 0
                const isSelected = symbol === item.symbol

                return (
                  <div
                    key={item.symbol}
                    className={`quote-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSymbol(item.symbol)
                      setMt5Tab('CHART')
                    }}
                  >
                    <div className="col-sym">
                      <div className="sym-code">{item.symbol}</div>
                      <div className="sym-sub">{item.name}</div>
                    </div>

                    <div className="col-bid">
                      <span className="price-box bid-box">
                        {formatCurrency(itemBid, item.currency)}
                      </span>
                    </div>

                    <div className="col-ask">
                      <span className="price-box ask-box">
                        {formatCurrency(itemAsk, item.currency)}
                      </span>
                    </div>

                    <div className="col-chg">
                      <div className={`chg-val ${itemChg >= 0 ? 'up' : 'down'}`}>
                        {itemChg >= 0 ? `+${itemChg}%` : `${itemChg}%`}
                      </div>
                      <div className="hl-sub">
                        H: {q?.high24h || '—'} / L: {q?.low24h || '—'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* TAB 2: CHART (Fullscreen Chart + MT5 1-Click Quick Trading Bar & Lines) */}
        <section className={`chart-screen ${mt5Tab === 'CHART' ? 'mobile-visible' : ''}`}>
          {/* MT5 Top One-Click Quick Trading Bar */}
          <div className="mt5-quick-trade-bar">
            <button
              className="quick-trade-btn sell"
              onClick={() => handleQuickTrade('SELL', lots)}
              disabled={trading.isExecuting}
            >
              <div className="qt-label">SELL</div>
              <div className="qt-price">{formatCurrency(bidPrice)}</div>
            </button>

            <div className="quick-lot-stepper">
              <button
                className="step-btn"
                onClick={() => setLots(Math.max(0.01, Number((lots - 0.1).toFixed(2))))}
              >
                -0.1
              </button>
              <button
                className="step-btn micro"
                onClick={() => setLots(Math.max(0.01, Number((lots - 0.01).toFixed(2))))}
              >
                -0.01
              </button>

              <input
                type="number"
                step="0.01"
                min="0.01"
                value={lots}
                onChange={(e) => setLots(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                className="lot-input"
                title="Trading Lot Size"
              />

              <button
                className="step-btn micro"
                onClick={() => setLots(Number((lots + 0.01).toFixed(2)))}
              >
                +0.01
              </button>
              <button
                className="step-btn"
                onClick={() => setLots(Number((lots + 0.1).toFixed(2)))}
              >
                +0.1
              </button>
            </div>

            <button
              className="quick-trade-btn buy"
              onClick={() => handleQuickTrade('BUY', lots)}
              disabled={trading.isExecuting}
            >
              <div className="qt-label">BUY</div>
              <div className="qt-price">{formatCurrency(askPrice)}</div>
            </button>
          </div>

          {/* MT5 Timeframe Selector & Toolbar */}
          <div className="chart-timeframe-bar">
            <div className="tf-group">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  className={`tf-btn ${timeframe === tf.value ? 'active' : ''}`}
                  onClick={() => setTimeframe(tf.value)}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <div className="chart-meta-indicators">
              <span className="meta-item">
                Spread: <strong className="val-spread">{(askPrice - bidPrice).toFixed(currentSymbolInfo.decimals)}</strong>
              </span>
              <span className="meta-item">
                Vol: <strong>{selectedQuote?.volume24h?.toLocaleString() || '—'}</strong>
              </span>
              <span className="meta-item">
                Leverage: <strong>{leverage}x</strong>
              </span>
            </div>
          </div>

          {/* Lightweight Candlestick Chart with Dynamic On-Chart Position & SL/TP Lines */}
          <div className="interactive-chart-viewport">
            <Chart
              symbol={symbol}
              timeframe={timeframe}
              theme={theme}
              positions={trading.positions}
            />
          </div>
        </section>

        {/* Orderbook Sidebar (Desktop or Toggled) */}
        {orderbookOpen && (
          <aside className="orderbook-sidebar desktop-only">
            <div className="ob-title-bar">
              <span>Order Book Depth</span>
              <span className="spread-badge">
                Spread: {(askPrice - bidPrice).toFixed(currentSymbolInfo.decimals)}
              </span>
            </div>

            <div className="ob-list asks">
              {orderBook.asks?.slice(0, 7).map((ask, i) => (
                <div key={`ask-${i}`} className="ob-row ask-row">
                  <span className="ob-col price">{ask.price}</span>
                  <span className="ob-col qty">{ask.quantity}</span>
                  <div
                    className="ob-depth-fill red"
                    style={{ width: `${Math.min(100, (ask.quantity / 5) * 100)}%` }}
                  />
                </div>
              ))}
            </div>

            <div className="ob-mid-ticker">
              <span className="mid-label">Mark Price</span>
              <span className="mid-price">{formatCurrency(currentPrice)}</span>
            </div>

            <div className="ob-list bids">
              {orderBook.bids?.slice(0, 7).map((bid, i) => (
                <div key={`bid-${i}`} className="ob-row bid-row">
                  <span className="ob-col price">{bid.price}</span>
                  <span className="ob-col qty">{bid.quantity}</span>
                  <div
                    className="ob-depth-fill green"
                    style={{ width: `${Math.min(100, (bid.quantity / 5) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* TAB 3: TRADE (MT5 Trade Terminal: Balances, Floating P&L, Active Positions, Open Orders) */}
        <section className={`trade-screen ${mt5Tab === 'TRADE' ? 'mobile-visible' : ''}`}>
          {/* MT5 Account Summary Banner */}
          <div className="mt5-account-banner">
            <div className="floating-pnl-card">
              <div className="pnl-header-row">
                <span className="pnl-title">FLOATING PROFIT / LOSS</span>
                <span className={`pnl-val-big ${totalFloatingPnl >= 0 ? 'profit' : 'loss'}`}>
                  {totalFloatingPnl >= 0 ? `+${formatCurrency(totalFloatingPnl)}` : formatCurrency(totalFloatingPnl)}
                </span>
              </div>
            </div>

            <div className="account-metrics-grid">
              <div className="metric-box">
                <span className="m-label">Balance:</span>
                <strong className="m-val">{formatCurrency(balanceInfo.total)}</strong>
              </div>
              <div className="metric-box">
                <span className="m-label">Equity:</span>
                <strong className="m-val">{formatCurrency(equity)}</strong>
              </div>
              <div className="metric-box">
                <span className="m-label">Margin Used:</span>
                <strong className="m-val">{formatCurrency(balanceInfo.locked)}</strong>
              </div>
              <div className="metric-box">
                <span className="m-label">Free Margin:</span>
                <strong className="m-val">{formatCurrency(freeMargin)}</strong>
              </div>
              <div className="metric-box">
                <span className="m-label">Margin Level:</span>
                <strong className="m-val">{marginLevel > 9000 ? '—' : `${marginLevel.toFixed(1)}%`}</strong>
              </div>
            </div>
          </div>

          {/* Positions & Orders Tabs */}
          <div className="trade-data-tables">
            <div className="section-heading">
              <h4>Open Positions ({trading.positions.length})</h4>
            </div>

            {trading.positions.length === 0 ? (
              <div className="empty-positions-placeholder">
                <p>No open positions. Use the 1-Click Buy/Sell bar on the chart or place a New Order.</p>
              </div>
            ) : (
              <div className="positions-cards-list">
                {trading.positions.map((pos) => {
                  const isLong = pos.side === 'LONG'
                  const pnl = pos.pnl || 0
                  const pnlPct = pos.pnlPercentage || 0

                  return (
                    <div key={pos.symbol} className={`position-card ${isLong ? 'long' : 'short'}`}>
                      <div className="pos-card-header">
                        <div className="pos-sym-group">
                          <span className={`side-badge ${isLong ? 'buy' : 'sell'}`}>
                            {pos.side} {pos.quantity}
                          </span>
                          <span className="pos-symbol-text">{pos.symbol}</span>
                          {pos.leverage && <span className="pos-lev-badge">{pos.leverage}x</span>}
                        </div>

                        <div className={`pos-pnl-badge ${pnl >= 0 ? 'profit' : 'loss'}`}>
                          <div className="pnl-amount">
                            {pnl >= 0 ? `+${formatCurrency(pnl)}` : formatCurrency(pnl)}
                          </div>
                          <div className="pnl-percent">
                            {pnlPct >= 0 ? `+${pnlPct}%` : `${pnlPct}%`}
                          </div>
                        </div>
                      </div>

                      <div className="pos-card-body">
                        <div className="pos-info-item">
                          <span>Entry Price:</span>
                          <strong>{pos.entryPrice}</strong>
                        </div>
                        <div className="pos-info-item">
                          <span>Current Mark:</span>
                          <strong>{pos.currentPrice}</strong>
                        </div>
                        <div className="pos-info-item">
                          <span>S / L:</span>
                          <strong className={pos.stopLoss ? 'sl-active' : ''}>
                            {pos.stopLoss || 'Not set'}
                          </strong>
                        </div>
                        <div className="pos-info-item">
                          <span>T / P:</span>
                          <strong className={pos.takeProfit ? 'tp-active' : ''}>
                            {pos.takeProfit || 'Not set'}
                          </strong>
                        </div>
                        {pos.liquidationPrice && (
                          <div className="pos-info-item">
                            <span>Liq. Price:</span>
                            <strong className="liq-warn">{pos.liquidationPrice}</strong>
                          </div>
                        )}
                      </div>

                      <div className="pos-card-actions">
                        <button
                          className="pos-action-btn modify"
                          onClick={() => openModifyModal(pos)}
                        >
                          ✎ Modify SL / TP
                        </button>
                        <button
                          className="pos-action-btn close"
                          onClick={() => trading.closePosition(pos.symbol)}
                          disabled={trading.isExecuting}
                        >
                          ✕ Close Position
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pending Orders */}
            {trading.orders.length > 0 && (
              <div className="pending-orders-section">
                <div className="section-heading">
                  <h4>Pending Orders ({trading.orders.length})</h4>
                </div>
                <div className="orders-cards-list">
                  {trading.orders.map((ord) => (
                    <div key={ord.id} className="order-row-item">
                      <div className="ord-left">
                        <span className={`ord-side ${ord.side.toLowerCase()}`}>{ord.side}</span>
                        <span className="ord-sym">{ord.symbol}</span>
                        <span className="ord-type">{ord.type} @ {ord.price || ord.stopPrice || 'MKT'}</span>
                        <span className="ord-qty">Qty: {ord.quantity}</span>
                      </div>
                      <button
                        className="cancel-btn"
                        onClick={() => trading.cancelOrder(ord.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* TAB 4: HISTORY (Trade History & Win Rate Analytics) */}
        <section className={`history-screen ${mt5Tab === 'HISTORY' ? 'mobile-visible' : ''}`}>
          <div className="history-header">
            <h3>Trade History & Deals</h3>
            <span className="total-deals-badge">Total Deals: {trading.orderHistory.length}</span>
          </div>

          <div className="history-table-container">
            {trading.orderHistory.length === 0 ? (
              <div className="empty-history-placeholder">
                <p>No closed trades in this session. Completed deals will appear here.</p>
              </div>
            ) : (
              <table className="mt5-table history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>ID</th>
                    <th>Symbol</th>
                    <th>Type / Side</th>
                    <th>Volume</th>
                    <th>Executed Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trading.orderHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.timestamp).toLocaleTimeString()}</td>
                      <td className="id-cell">{item.id}</td>
                      <td><strong>{item.symbol}</strong></td>
                      <td>
                        <span className={`table-badge ${item.side.toLowerCase()}`}>
                          {item.side} {item.type}
                        </span>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{item.price ? formatCurrency(item.price) : '—'}</td>
                      <td>
                        <span className={`status-tag ${item.status.toLowerCase()}`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* TAB 5: SETTINGS / BROKER CONFIG */}
        <section className={`settings-screen ${mt5Tab === 'SETTINGS' ? 'mobile-visible' : ''}`}>
          <div className="settings-container">
            <h3>Terminal & Broker Settings</h3>

            <div className="settings-card">
              <h4>Active Trading Broker</h4>
              <p className="subtext">Select which broker API to route your orders and live positions to:</p>

              <div className="broker-option-tiles">
                <div
                  className={`broker-tile ${trading.activeBroker === 'paper' ? 'active' : ''}`}
                  onClick={() => handleBrokerChange('paper')}
                >
                  <div className="b-icon">⚡</div>
                  <div className="b-title">Paper Trading Demo</div>
                  <div className="b-desc">Zero-risk simulated terminal with $100,000 balance</div>
                </div>

                <div
                  className={`broker-tile ${trading.activeBroker === 'upstox' ? 'active' : ''}`}
                  onClick={() => handleBrokerChange('upstox')}
                >
                  <div className="b-icon">📈</div>
                  <div className="b-title">Upstox Pro V2</div>
                  <div className="b-desc">Indian Equities, NIFTY 50 & BANKNIFTY F&O derivatives</div>
                </div>

                <div
                  className={`broker-tile ${trading.activeBroker === 'coindcx' ? 'active' : ''}`}
                  onClick={() => handleBrokerChange('coindcx')}
                >
                  <div className="b-icon">🪙</div>
                  <div className="b-title">CoinDCX Pro</div>
                  <div className="b-desc">Crypto Spot & Futures (BTC, ETH, SOL, etc.)</div>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <h4>Account Information</h4>
              <div className="info-grid">
                <div><span>Account ID:</span> <strong>MT5-DEMO-ACCOUNT</strong></div>
                <div><span>Server:</span> <strong>Bountiful-Fast-Execute-01</strong></div>
                <div><span>Latency:</span> <strong className="ping-good">12 ms</strong></div>
                <div><span>Base Currency:</span> <strong>{currentSymbolInfo.currency}</strong></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 3. MT5 Mobile Bottom Navigation Bar (5 Core MT5 Tabs) */}
      <nav className="mt5-bottom-nav">
        <button
          className={`nav-tab-item ${mt5Tab === 'QUOTES' ? 'active' : ''}`}
          onClick={() => setMt5Tab('QUOTES')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-text">Quotes</span>
        </button>

        <button
          className={`nav-tab-item ${mt5Tab === 'CHART' ? 'active' : ''}`}
          onClick={() => setMt5Tab('CHART')}
        >
          <span className="nav-icon">📈</span>
          <span className="nav-text">Chart</span>
        </button>

        <button
          className={`nav-tab-item ${mt5Tab === 'TRADE' ? 'active' : ''}`}
          onClick={() => setMt5Tab('TRADE')}
        >
          <span className="nav-icon">💼</span>
          <span className="nav-text">Trade</span>
          {trading.positions.length > 0 && (
            <span className="nav-badge">{trading.positions.length}</span>
          )}
        </button>

        <button
          className={`nav-tab-item ${mt5Tab === 'HISTORY' ? 'active' : ''}`}
          onClick={() => setMt5Tab('HISTORY')}
        >
          <span className="nav-icon">📜</span>
          <span className="nav-text">History</span>
        </button>

        <button
          className={`nav-tab-item ${mt5Tab === 'SETTINGS' ? 'active' : ''}`}
          onClick={() => setMt5Tab('SETTINGS')}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-text">Settings</span>
        </button>
      </nav>

      {/* 4. MODAL: Advanced Order Placement (Market, Limit, Stop, Stop Loss, Take Profit) */}
      {tradeModalOpen && (
        <div className="modal-backdrop" onClick={() => setTradeModalOpen(false)}>
          <div className="order-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>New Order — {symbol}</h3>
                <span className="modal-sub">{currentSymbolInfo.name}</span>
              </div>
              <button className="modal-close-btn" onClick={() => setTradeModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body">
              {/* Order Type Selector */}
              <div className="modal-row">
                <label>Order Type</label>
                <div className="type-pills">
                  {(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'] as OrderType[]).map((t) => (
                    <button
                      key={t}
                      className={`type-pill ${orderType === t ? 'active' : ''}`}
                      onClick={() => setOrderType(t)}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price fields for Limit/Stop */}
              {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
                <div className="modal-row">
                  <label>Limit Price</label>
                  <input
                    type="number"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder={currentPrice.toString()}
                    className="modal-input"
                  />
                </div>
              )}

              {(orderType === 'STOP' || orderType === 'STOP_LIMIT') && (
                <div className="modal-row">
                  <label>Stop Trigger Price</label>
                  <input
                    type="number"
                    value={stopPrice}
                    onChange={(e) => setStopPrice(e.target.value)}
                    placeholder={currentPrice.toString()}
                    className="modal-input"
                  />
                </div>
              )}

              {/* Lot size & Leverage */}
              <div className="modal-row-grid">
                <div>
                  <label>Lot Size</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={lots}
                    onChange={(e) => setLots(parseFloat(e.target.value) || 0.01)}
                    className="modal-input"
                  />
                </div>
                <div>
                  <label>Leverage</label>
                  <select
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="modal-input"
                  >
                    {[1, 2, 3, 5, 10, 20, 50, 100].map((lev) => (
                      <option key={lev} value={lev}>{lev}x</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stop Loss (SL) with Presets */}
              <div className="sl-tp-section">
                <div className="modal-row">
                  <div className="label-with-presets">
                    <label className="sl-label">Stop Loss (SL Price)</label>
                    <div className="preset-buttons">
                      <button onClick={() => applySlPreset(1, 'BUY')}>-1%</button>
                      <button onClick={() => applySlPreset(2, 'BUY')}>-2%</button>
                      <button onClick={() => applySlPreset(5, 'BUY')}>-5%</button>
                    </div>
                  </div>
                  <input
                    type="number"
                    placeholder="e.g. 65000 (Optional)"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className="modal-input sl-input"
                  />
                </div>

                {/* Take Profit (TP) with Presets */}
                <div className="modal-row">
                  <div className="label-with-presets">
                    <label className="tp-label">Take Profit (TP Price)</label>
                    <div className="preset-buttons">
                      <button onClick={() => applyTpPreset(2, 'BUY')}>+2%</button>
                      <button onClick={() => applyTpPreset(5, 'BUY')}>+5%</button>
                      <button onClick={() => applyTpPreset(10, 'BUY')}>+10%</button>
                    </div>
                  </div>
                  <input
                    type="number"
                    placeholder="e.g. 71000 (Optional)"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    className="modal-input tp-input"
                  />
                </div>
              </div>

              {/* Order calculations */}
              <div className="modal-summary-box">
                <div className="sum-row">
                  <span>Total Quantity:</span>
                  <strong>{totalQuantity} {currentSymbolInfo.symbol.split('/')[0]}</strong>
                </div>
                <div className="sum-row">
                  <span>Required Margin:</span>
                  <strong>{formatCurrency(requiredMargin)}</strong>
                </div>
                <div className="sum-row">
                  <span>Est. Liquidation:</span>
                  <strong className="liq-warn">{formatCurrency(currentPrice * (1 - (1 / leverage) * 0.9))}</strong>
                </div>
              </div>

              {/* BUY & SELL Submit Buttons */}
              <div className="modal-actions-grid">
                <button
                  className="modal-exec-btn sell"
                  onClick={() => handleExecuteOrder('SELL')}
                  disabled={trading.isExecuting}
                >
                  <div className="b-side">SELL / SHORT</div>
                  <div className="b-sub">{formatCurrency(bidPrice)}</div>
                </button>

                <button
                  className="modal-exec-btn buy"
                  onClick={() => handleExecuteOrder('BUY')}
                  disabled={trading.isExecuting}
                >
                  <div className="b-side">BUY / LONG</div>
                  <div className="b-sub">{formatCurrency(askPrice)}</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: Modify SL / TP on Active Position */}
      {modifyModalPos && (
        <div className="modal-backdrop" onClick={() => setModifyModalPos(null)}>
          <div className="order-modal-box modify-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>Modify Position (S/L & T/P)</h3>
                <span className="modal-sub">
                  {modifyModalPos.side} {modifyModalPos.quantity} {modifyModalPos.symbol} @ {modifyModalPos.entryPrice}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setModifyModalPos(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="current-pos-summary">
                <div><span>Mark Price:</span> <strong>{modifyModalPos.currentPrice}</strong></div>
                <div>
                  <span>P&L:</span>
                  <strong className={modifyModalPos.pnl >= 0 ? 'profit-text' : 'loss-text'}>
                    {modifyModalPos.pnl >= 0 ? `+${formatCurrency(modifyModalPos.pnl)}` : formatCurrency(modifyModalPos.pnl)}
                  </strong>
                </div>
              </div>

              <div className="modal-row">
                <label className="sl-label">Stop Loss Price (SL)</label>
                <input
                  type="number"
                  placeholder="Set Stop Loss price"
                  value={modSl}
                  onChange={(e) => setModSl(e.target.value)}
                  className="modal-input sl-input"
                />
              </div>

              <div className="modal-row">
                <label className="tp-label">Take Profit Price (TP)</label>
                <input
                  type="number"
                  placeholder="Set Take Profit price"
                  value={modTp}
                  onChange={(e) => setModTp(e.target.value)}
                  className="modal-input tp-input"
                />
              </div>

              <div className="modify-modal-actions">
                <button
                  className="save-modify-btn"
                  onClick={handleSaveModify}
                  disabled={trading.isExecuting}
                >
                  Confirm & Update SL/TP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Terminal
