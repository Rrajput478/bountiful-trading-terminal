import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import Chart from '../components/Chart'
import './Terminal.css'
import { useTrading } from '../hooks/useTrading'
import * as api from '../services/api'

type SymbolCategory = 'ALL' | 'CRYPTO' | 'INDIAN'
type SizeMode = 'LOT' | 'QTY' | 'PERCENT'
type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
type BottomTab = 'Positions' | 'Orders' | 'History' | 'Journal' | 'Balances'

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
  { symbol: 'BTC/USDT', name: 'Bitcoin', category: 'CRYPTO', basePrice: 67450, decimals: 2, lotSize: 1, currency: 'USDT' },
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

const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D']

function Terminal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialBrokerParam = searchParams.get('broker') || localStorage.getItem('active_broker') || 'paper'

  const trading = useTrading(initialBrokerParam)

  // State
  const [symbol, setSymbol] = useState<string>('BTC/USDT')
  const [symbolCategory, setSymbolCategory] = useState<SymbolCategory>('ALL')
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [timeframe, setTimeframe] = useState<string>('1m')
  const [watchlistOpen, setWatchlistOpen] = useState(false)
  const [orderbookOpen, setOrderbookOpen] = useState(true)

  // Trading state
  const [size, setSize] = useState('0.1')
  const [sizeMode, setSizeMode] = useState<SizeMode>('LOT')
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [leverage, setLeverage] = useState<number>(5)
  const [leverageEditorOpen, setLeverageEditorOpen] = useState(false)
  const [oneTapMode, setOneTapMode] = useState(true)

  // Layout & UI
  const [activeTab, setActiveTab] = useState<BottomTab>('Positions')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [chartLayout, setChartLayout] = useState<'SINGLE' | 'DUAL'>('SINGLE')
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

  // Fetch Quotes & Orderbook periodically
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

  // Fetch all quotes for watchlist
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
    const interval = setInterval(fetchWatchlistQuotes, 3000)
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

  // Filtered symbols for watchlist
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

  // Computed Quantity
  const computedQuantity = useMemo(() => {
    const rawVal = parseFloat(size) || 0
    if (sizeMode === 'QTY') return rawVal
    if (sizeMode === 'LOT') return rawVal * currentSymbolInfo.lotSize
    if (sizeMode === 'PERCENT') {
      const balance = trading.balances[0]?.available || 10000
      const marginAllocation = (balance * (rawVal / 100))
      return Number(((marginAllocation * leverage) / currentPrice).toFixed(4))
    }
    return rawVal
  }, [size, sizeMode, currentSymbolInfo, trading.balances, leverage, currentPrice])

  const notionalValue = computedQuantity * currentPrice
  const requiredMargin = leverage > 0 ? notionalValue / leverage : notionalValue

  // Order Execution Handlers
  const handleExecute = async (side: 'BUY' | 'SELL') => {
    if (computedQuantity <= 0) {
      alert('Please specify a valid quantity or size')
      return
    }

    const orderReq: api.OrderRequest = {
      symbol,
      side,
      type: orderType,
      quantity: Number(computedQuantity.toFixed(4)),
      price: orderType === 'LIMIT' || orderType === 'STOP_LIMIT' ? parseFloat(limitPrice) || currentPrice : undefined,
      stopPrice: orderType === 'STOP' || orderType === 'STOP_LIMIT' ? parseFloat(stopPrice) || currentPrice : undefined,
      leverage,
    }

    await trading.placeOrder(orderReq)
  }

  const handleClosePosition = async (posSymbol: string) => {
    await trading.closePosition(posSymbol)
  }

  const handleCancelOrder = async (orderId: string) => {
    await trading.cancelOrder(orderId)
  }

  const formatCurrency = (val: number | undefined, curr = currentSymbolInfo.currency) => {
    if (val === undefined || isNaN(val)) return '—'
    const prefix = curr === 'INR' ? '₹' : '$'
    return `${prefix}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className={`terminal-page ${theme}`}>
      {/* 1. Header Bar */}
      <header className="terminal-header">
        <div className="header-left">
          <button
            className="mobile-menu-button"
            onClick={() => setWatchlistOpen(!watchlistOpen)}
            title="Toggle Watchlist"
          >
            ☰
          </button>
          <div className="brand-mark">⚡</div>
          <span className="brand-name">BOUNTIFUL</span>

          {/* Active Broker Selector Badge */}
          <div className="broker-badge-pill">
            <span className="broker-indicator-dot online"></span>
            <select
              value={trading.activeBroker}
              onChange={(e) => handleBrokerChange(e.target.value)}
              className="broker-select"
            >
              <option value="paper">⚡ Paper Trading (Demo $100k)</option>
              <option value="upstox">📈 Upstox Pro V2 (India)</option>
              <option value="coindcx">🪙 CoinDCX Pro (Crypto)</option>
            </select>
          </div>
        </div>

        {/* Current Symbol Quick Bar */}
        <div className="header-center">
          <div className="symbol-pill" onClick={() => setWatchlistOpen(true)}>
            <span className="symbol-title">{symbol}</span>
            <span className="symbol-name-sub">{currentSymbolInfo.name}</span>
          </div>
          <div className="live-price-badge">
            <span className="price-val">{formatCurrency(currentPrice)}</span>
            <span className={`price-change ${change24h >= 0 ? 'up' : 'down'}`}>
              {change24h >= 0 ? `+${change24h}%` : `${change24h}%`}
            </span>
          </div>
        </div>

        <div className="header-right">
          {/* Theme & Layout controls */}
          <button
            className="toolbar-toggle"
            onClick={() => setChartLayout(chartLayout === 'SINGLE' ? 'DUAL' : 'SINGLE')}
            title="Toggle Dual Chart"
          >
            {chartLayout === 'SINGLE' ? '▦ Split' : '▢ Single'}
          </button>
          <button
            className="toolbar-toggle"
            onClick={() => setOrderbookOpen(!orderbookOpen)}
            title="Toggle Order Book"
          >
            📊 Book
          </button>
          <button
            className="toolbar-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle Theme"
          >
            {theme === 'dark' ? '☀' : '◐'}
          </button>
          <Link to="/connect-broker" className="connect-link-btn">
            Brokers ⚙
          </Link>
        </div>
      </header>

      {/* Notifications Toast */}
      {trading.lastOrderSuccess && (
        <div className="notification-toast success">
          <span>✓</span> {trading.lastOrderSuccess}
        </div>
      )}
      {trading.error && (
        <div className="notification-toast error">
          <span>⚠</span> {trading.error}
        </div>
      )}

      {/* 2. Main Workspace */}
      <div className="terminal-body">
        {/* Left Watchlist Drawer / Panel */}
        <aside className={`watchlist-panel ${watchlistOpen ? 'open' : ''}`}>
          <div className="watchlist-header">
            <span>Market Watch</span>
            <button className="close-watchlist-btn" onClick={() => setWatchlistOpen(false)}>
              ✕
            </button>
          </div>

          <div className="watchlist-filter-tabs">
            {(['ALL', 'CRYPTO', 'INDIAN'] as SymbolCategory[]).map((cat) => (
              <button
                key={cat}
                className={`tab-btn ${symbolCategory === cat ? 'active' : ''}`}
                onClick={() => setSymbolCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="watchlist-search">
            <input
              type="text"
              placeholder="Search symbol (e.g. NIFTY, BTC)..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>

          <div className="watchlist-items-list">
            {filteredSymbols.map((item) => {
              const q = quotes[item.symbol]
              const price = q?.last || item.basePrice
              const chg = q?.change24h || 0
              const isActive = symbol === item.symbol

              return (
                <div
                  key={item.symbol}
                  className={`watchlist-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setSymbol(item.symbol)
                    setWatchlistOpen(false)
                  }}
                >
                  <div className="wl-left">
                    <span className="wl-symbol">{item.symbol}</span>
                    <span className="wl-name">{item.name}</span>
                  </div>
                  <div className="wl-right">
                    <span className="wl-price">{formatCurrency(price, item.currency)}</span>
                    <span className={`wl-change ${chg >= 0 ? 'up' : 'down'}`}>
                      {chg >= 0 ? `+${chg}%` : `${chg}%`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Center: Interactive Chart & Toolbar */}
        <div className="center-workspace">
          <div className="chart-toolbar">
            <div className="timeframe-list">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  className={timeframe === tf ? 'active' : ''}
                  onClick={() => setTimeframe(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className="quick-stats">
              <span>High: {formatCurrency(selectedQuote?.high24h)}</span>
              <span>Low: {formatCurrency(selectedQuote?.low24h)}</span>
              <span>Vol: {selectedQuote?.volume24h?.toLocaleString() || '—'}</span>
            </div>
          </div>

          <div className="chart-area-container">
            <div className="chart-cell primary">
              <Chart symbol={symbol} timeframe={timeframe} theme={theme} />
            </div>
            {chartLayout === 'DUAL' && (
              <div className="chart-cell secondary">
                <Chart
                  symbol={symbol === 'BTC/USDT' ? 'ETH/USDT' : 'BTC/USDT'}
                  timeframe="5m"
                  theme={theme}
                />
              </div>
            )}
          </div>
        </div>

        {/* Optional Live Order Book Depth */}
        {orderbookOpen && (
          <div className="orderbook-panel">
            <div className="orderbook-header">
              <span>Order Book</span>
              <span className="spread-label">
                Spread: {(askPrice - bidPrice).toFixed(currentSymbolInfo.decimals)}
              </span>
            </div>

            <div className="orderbook-table">
              {/* Asks (Red) */}
              <div className="asks-section">
                {orderBook.asks?.slice(0, 5).map((ask, i) => (
                  <div key={`ask-${i}`} className="ob-row ask">
                    <span className="ob-price">{ask.price}</span>
                    <span className="ob-qty">{ask.quantity}</span>
                    <div
                      className="ob-bar red"
                      style={{ width: `${Math.min(100, (ask.quantity / 5) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>

              {/* Mid Market Price */}
              <div className="ob-mid-price">
                <span className="mid-val">{formatCurrency(currentPrice)}</span>
              </div>

              {/* Bids (Green) */}
              <div className="bids-section">
                {orderBook.bids?.slice(0, 5).map((bid, i) => (
                  <div key={`bid-${i}`} className="ob-row bid">
                    <span className="ob-price">{bid.price}</span>
                    <span className="ob-qty">{bid.quantity}</span>
                    <div
                      className="ob-bar green"
                      style={{ width: `${Math.min(100, (bid.quantity / 5) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Right: Fast Order Execution & Scalping Panel */}
        <aside className="trade-panel">
          <div className="trade-panel-header">
            <span>Fast Execution</span>
            <div className="scalp-toggle">
              <label>1-Tap</label>
              <input
                type="checkbox"
                checked={oneTapMode}
                onChange={(e) => setOneTapMode(e.target.checked)}
              />
            </div>
          </div>

          {/* Order Types */}
          <div className="order-type-buttons">
            {(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'] as OrderType[]).map((type) => (
              <button
                key={type}
                className={orderType === type ? 'active' : ''}
                onClick={() => setOrderType(type)}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Price inputs if limit or stop */}
          {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
            <div className="price-field">
              <label>Limit Price</label>
              <input
                type="number"
                placeholder={currentPrice.toString()}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
          )}

          {(orderType === 'STOP' || orderType === 'STOP_LIMIT') && (
            <div className="price-field">
              <label>Stop Trigger Price</label>
              <input
                type="number"
                placeholder={currentPrice.toString()}
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
              />
            </div>
          )}

          {/* Size Controls */}
          <div className="size-control-group">
            <div className="size-header">
              <label>Order Size</label>
              <div className="size-mode-selector">
                <button
                  className={sizeMode === 'LOT' ? 'active' : ''}
                  onClick={() => setSizeMode('LOT')}
                >
                  LOT
                </button>
                <button
                  className={sizeMode === 'QTY' ? 'active' : ''}
                  onClick={() => setSizeMode('QTY')}
                >
                  QTY
                </button>
                <button
                  className={sizeMode === 'PERCENT' ? 'active' : ''}
                  onClick={() => setSizeMode('PERCENT')}
                >
                  %
                </button>
              </div>
            </div>

            <div className="size-input-wrapper">
              <input
                type="number"
                step="any"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="0.1"
              />
              <span className="size-unit">
                {sizeMode === 'PERCENT' ? '%' : currentSymbolInfo.symbol.split('/')[0]}
              </span>
            </div>

            {/* Quick Scalp Presets */}
            <div className="scalp-presets">
              {sizeMode === 'PERCENT'
                ? [25, 50, 75, 100].map((pct) => (
                    <button key={pct} onClick={() => setSize(pct.toString())}>
                      {pct}%
                    </button>
                  ))
                : [0.01, 0.1, 0.5, 1.0, 5.0].map((val) => (
                    <button key={val} onClick={() => setSize(val.toString())}>
                      {val}
                    </button>
                  ))}
            </div>
          </div>

          {/* Leverage Selector */}
          <div className="leverage-control-card">
            <div className="leverage-row">
              <span>Leverage</span>
              <button
                className="leverage-badge-btn"
                onClick={() => setLeverageEditorOpen(!leverageEditorOpen)}
              >
                {leverage}x ⚡
              </button>
            </div>
            {leverageEditorOpen && (
              <div className="leverage-slider-box">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value, 10))}
                />
                <div className="leverage-quick-picks">
                  {[1, 3, 5, 10, 20, 50, 100].map((lev) => (
                    <button
                      key={lev}
                      className={leverage === lev ? 'active' : ''}
                      onClick={() => setLeverage(lev)}
                    >
                      {lev}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Margin & Notional Estimation Summary */}
          <div className="order-summary-box">
            <div className="summary-row">
              <span>Est. Qty:</span>
              <strong>{computedQuantity.toFixed(4)}</strong>
            </div>
            <div className="summary-row">
              <span>Req. Margin:</span>
              <strong>{formatCurrency(requiredMargin)}</strong>
            </div>
            <div className="summary-row">
              <span>Est. Liq Price:</span>
              <strong className="liq-text">
                {formatCurrency(
                  currentPrice * (1 - (1 / leverage) * 0.9),
                )}
              </strong>
            </div>
          </div>

          {/* Big Buy & Sell Buttons */}
          <div className="execution-buttons-grid">
            <button
              className="exec-btn buy"
              onClick={() => handleExecute('BUY')}
              disabled={trading.isExecuting}
            >
              <div className="btn-side">BUY / LONG</div>
              <div className="btn-price">{formatCurrency(askPrice)}</div>
            </button>

            <button
              className="exec-btn sell"
              onClick={() => handleExecute('SELL')}
              disabled={trading.isExecuting}
            >
              <div className="btn-side">SELL / SHORT</div>
              <div className="btn-price">{formatCurrency(bidPrice)}</div>
            </button>
          </div>
        </aside>
      </div>

      {/* 3. Bottom Management Console */}
      <footer className="terminal-bottom">
        <div className="bottom-tabs-bar">
          {(['Positions', 'Orders', 'History', 'Journal', 'Balances'] as BottomTab[]).map(
            (tab) => {
              let count = ''
              if (tab === 'Positions') count = ` (${trading.positions.length})`
              if (tab === 'Orders') count = ` (${trading.orders.length})`
              if (tab === 'History') count = ` (${trading.orderHistory.length})`
              if (tab === 'Journal') count = ` (${trading.journal.length})`

              return (
                <button
                  key={tab}
                  className={`tab-link ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                  <span className="tab-count">{count}</span>
                </button>
              )
            },
          )}
        </div>

        <div className="bottom-content-area">
          {/* Positions Table */}
          {activeTab === 'Positions' && (
            <div className="positions-table-wrap">
              {trading.positions.length === 0 ? (
                <div className="empty-state-msg">No active open positions</div>
              ) : (
                <table className="terminal-data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Size</th>
                      <th>Entry Price</th>
                      <th>Mark Price</th>
                      <th>Margin</th>
                      <th>Liq Price</th>
                      <th>Unrealized P&L</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trading.positions.map((pos, idx) => (
                      <tr key={`${pos.symbol}-${idx}`}>
                        <td className="bold-cell">{pos.symbol}</td>
                        <td>
                          <span className={`side-badge ${pos.side.toLowerCase()}`}>
                            {pos.side} {pos.leverage ? `${pos.leverage}x` : ''}
                          </span>
                        </td>
                        <td>{pos.quantity}</td>
                        <td>{formatCurrency(pos.entryPrice)}</td>
                        <td>{formatCurrency(pos.currentPrice)}</td>
                        <td>{formatCurrency(pos.margin)}</td>
                        <td className="warning-text">{formatCurrency(pos.liquidationPrice)}</td>
                        <td className={`pnl-cell ${pos.pnl >= 0 ? 'profit' : 'loss'}`}>
                          {pos.pnl >= 0 ? `+${formatCurrency(pos.pnl)}` : formatCurrency(pos.pnl)} (
                          {pos.pnlPercentage ? `${pos.pnlPercentage}%` : '0%'})
                        </td>
                        <td>
                          <button
                            className="close-pos-btn"
                            onClick={() => handleClosePosition(pos.symbol)}
                            disabled={trading.isExecuting}
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Open Orders Table */}
          {activeTab === 'Orders' && (
            <div className="orders-table-wrap">
              {trading.orders.length === 0 ? (
                <div className="empty-state-msg">No open pending orders</div>
              ) : (
                <table className="terminal-data-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Trigger Price</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trading.orders.map((ord) => (
                      <tr key={ord.id}>
                        <td>{ord.id}</td>
                        <td className="bold-cell">{ord.symbol}</td>
                        <td>
                          <span className={`side-badge ${ord.side.toLowerCase()}`}>
                            {ord.side}
                          </span>
                        </td>
                        <td>{ord.type}</td>
                        <td>{ord.quantity}</td>
                        <td>{formatCurrency(ord.price)}</td>
                        <td>{ord.status}</td>
                        <td>
                          <button
                            className="cancel-ord-btn"
                            onClick={() => handleCancelOrder(ord.id)}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Order History */}
          {activeTab === 'History' && (
            <div className="history-table-wrap">
              {trading.orderHistory.length === 0 ? (
                <div className="empty-state-msg">No executed trades yet</div>
              ) : (
                <table className="terminal-data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>Exec Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trading.orderHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{new Date(item.timestamp).toLocaleTimeString()}</td>
                        <td className="bold-cell">{item.symbol}</td>
                        <td>
                          <span className={`side-badge ${item.side.toLowerCase()}`}>
                            {item.side}
                          </span>
                        </td>
                        <td>{item.type}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.price)}</td>
                        <td>
                          <span className={`status-pill ${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Trade Journal */}
          {activeTab === 'Journal' && (
            <div className="journal-table-wrap">
              {trading.journal.length === 0 ? (
                <div className="empty-state-msg">
                  Trades executed in this session will auto-log here for performance journaling.
                </div>
              ) : (
                <table className="terminal-data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Broker</th>
                      <th>Symbol</th>
                      <th>Action</th>
                      <th>Size</th>
                      <th>Fill Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trading.journal.map((j) => (
                      <tr key={j.id}>
                        <td>{new Date(j.timestamp).toLocaleTimeString()}</td>
                        <td>{j.broker}</td>
                        <td className="bold-cell">{j.symbol}</td>
                        <td>
                          <span className={`side-badge ${j.side.toLowerCase()}`}>{j.side}</span>
                        </td>
                        <td>{j.quantity}</td>
                        <td>{formatCurrency(j.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Balances / Wallet */}
          {activeTab === 'Balances' && (
            <div className="balances-card-grid">
              {trading.balances.map((b, idx) => (
                <div key={idx} className="balance-metric-card">
                  <div className="metric-asset">{b.asset}</div>
                  <div className="metric-main-val">{formatCurrency(b.total)}</div>
                  <div className="metric-sub-row">
                    <span>Available: <strong>{formatCurrency(b.available)}</strong></span>
                    <span>Locked Margin: <strong>{formatCurrency(b.locked)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}

export default Terminal
