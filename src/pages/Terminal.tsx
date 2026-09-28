import { useEffect, useMemo, useState } from 'react'
import Chart from '../components/Chart'
import './Terminal.css'

type SymbolName =
  | 'BTC/USDT'
  | 'ETH/USDT'
  | 'SOL/USDT'

type Quote = {
  bid: number
  ask: number
  last: number
  timestamp: number
}

type SizeMode =
  | 'LOT'
  | 'QUANTITY'
  | 'MARGIN'

type ChartLayout =
  | 'SINGLE'
  | 'DUAL'

type Theme =
  | 'dark'
  | 'light'

type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP'
  | 'STOP_LIMIT'

const symbols: SymbolName[] = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
]

const timeframes = [
  '1m',
  '5m',
  '15m',
  '1H',
  '4H',
  '1D',
]

function Terminal() {
  const [symbol, setSymbol] =
    useState<SymbolName>('BTC/USDT')

  const [timeframe, setTimeframe] =
    useState('1m')

  const [watchlistOpen, setWatchlistOpen] =
    useState(false)

  const [size, setSize] =
    useState('0.01')

  const [sizeMode, setSizeMode] =
    useState<SizeMode>('LOT')

  const [orderType, setOrderType] =
    useState<OrderType>('MARKET')

  const [limitPrice, setLimitPrice] =
    useState('')

  const [stopPrice, setStopPrice] =
    useState('')

  const [activeTab, setActiveTab] =
    useState('Positions')

  const [quotes, setQuotes] =
    useState<Record<string, Quote>>({})

  const [chartLayout, setChartLayout] =
    useState<ChartLayout>('SINGLE')

  const [oneTapMode, setOneTapMode] =
    useState(false)

  const [theme, setTheme] =
    useState<Theme>('dark')

  /* ---------------- LEVERAGE ---------------- */

  const [leverage, setLeverage] =
    useState(3)

  const [leverageInput, setLeverageInput] =
    useState('3')

  const [leverageEditorOpen, setLeverageEditorOpen] =
    useState(false)

  const [pendingHighLeverage, setPendingHighLeverage] =
    useState<number | null>(null)

  /*
   * Temporary paper values.
   * These will later come from backend/broker capabilities.
   */
  const availableBalance = 10000
  const estimatedFeeRate = 0.001
  const lotMultiplier = 1

  const selectedQuote = quotes[symbol]

  const askPrice =
    selectedQuote?.ask ?? 0

  const bidPrice =
    selectedQuote?.bid ?? 0

  const sizeNumber =
    Number.parseFloat(size) || 0

  /* ---------------- SIZE CALCULATION ---------------- */

  const estimatedQuantity = useMemo(() => {
    if (!selectedQuote) {
      return 0
    }

    if (sizeMode === 'QUANTITY') {
      return sizeNumber
    }

    if (sizeMode === 'LOT') {
      return sizeNumber * lotMultiplier
    }

    if (askPrice <= 0) {
      return 0
    }

    return (
      (sizeNumber * leverage) /
      askPrice
    )
  }, [
    askPrice,
    leverage,
    selectedQuote,
    sizeMode,
    sizeNumber,
  ])

  const buyNotional =
    estimatedQuantity * askPrice

  const sellNotional =
    estimatedQuantity * bidPrice

  const buyInitialMargin =
    leverage > 0
      ? buyNotional / leverage
      : 0

  const sellInitialMargin =
    leverage > 0
      ? sellNotional / leverage
      : 0

  const buyEstimatedFee =
    buyNotional * estimatedFeeRate

  /* ---------------- FORMATTING ---------------- */

  const formatPrice = (
    value: number,
  ) => {
    if (!value) {
      return '—'
    }

    return value.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )
  }

  const formatNumber = (
    value: number,
  ) => {
    if (!value) {
      return '0'
    }

    return value.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      },
    )
  }

  /* ---------------- LEVERAGE STATE ---------------- */

  const leverageRisk =
    leverage <= 3
      ? 'normal'
      : leverage <= 10
        ? 'warning'
        : 'danger'

  /* ---------------- WATCHLIST ---------------- */

  const selectSymbol = (
    nextSymbol: SymbolName,
  ) => {
    setSymbol(nextSymbol)
    setWatchlistOpen(false)
  }

  /* ---------------- ORDER TYPE ---------------- */

  const changeOrderType = (
    nextType: OrderType,
  ) => {
    setOrderType(nextType)

    /*
     * When switching to a price-based order,
     * prefill the relevant field with current market price.
     */
    if (
      nextType === 'LIMIT' &&
      !limitPrice
    ) {
      setLimitPrice(
        askPrice > 0
          ? String(
              Number(
                askPrice.toFixed(2),
              ),
            )
          : '',
      )
    }

    if (
      nextType === 'STOP' &&
      !stopPrice
    ) {
      setStopPrice(
        askPrice > 0
          ? String(
              Number(
                askPrice.toFixed(2),
              ),
            )
          : '',
      )
    }

    if (
      nextType === 'STOP_LIMIT'
    ) {
      if (!stopPrice) {
        setStopPrice(
          askPrice > 0
            ? String(
                Number(
                  askPrice.toFixed(2),
                ),
              )
            : '',
        )
      }

      if (!limitPrice) {
        setLimitPrice(
          askPrice > 0
            ? String(
                Number(
                  askPrice.toFixed(2),
                ),
              )
            : '',
        )
      }
    }
  }

  /* ---------------- LEVERAGE EDITOR ---------------- */

  const openLeverageEditor = () => {
    setLeverageInput(
      String(leverage),
    )

    setPendingHighLeverage(null)
    setLeverageEditorOpen(true)
  }

  const closeLeverageEditor = () => {
    setLeverageEditorOpen(false)
    setPendingHighLeverage(null)

    setLeverageInput(
      String(leverage),
    )
  }

  const requestLeverageChange = () => {
    const parsed =
      Number.parseFloat(
        leverageInput,
      )

    if (
      !Number.isFinite(parsed) ||
      parsed <= 0
    ) {
      return
    }

    const next =
      Math.min(
        Math.max(parsed, 1),
        100,
      )

    if (next > 10) {
      setPendingHighLeverage(next)
      return
    }

    setLeverage(next)

    setLeverageInput(
      String(next),
    )

    closeLeverageEditor()
  }

  /*
   * High leverage is intentionally a single-click
   * acknowledgement + apply action.
   */
  const acknowledgeAndApplyHighLeverage = () => {
    if (
      pendingHighLeverage === null
    ) {
      return
    }

    setLeverage(
      pendingHighLeverage,
    )

    setLeverageInput(
      String(
        pendingHighLeverage,
      ),
    )

    closeLeverageEditor()
  }

  /* ---------------- QUOTES ---------------- */

  useEffect(() => {
    let active = true

    const loadQuotes = async () => {
      try {
        const results =
          await Promise.all(
            symbols.map(
              async (item) => {
                const response =
                  await fetch(
                    `http://127.0.0.1:3000/api/quote/paper?symbol=${encodeURIComponent(
                      item,
                    )}`,
                  )

                if (!response.ok) {
                  throw new Error(
                    `Quote request failed for ${item}`,
                  )
                }

                const data =
                  await response.json()

                return {
                  symbol: item,
                  quote:
                    data as Quote,
                }
              },
            ),
          )

        if (!active) {
          return
        }

        const nextQuotes:
          Record<string, Quote> = {}

        for (const result of results) {
          nextQuotes[
            result.symbol
          ] = result.quote
        }

        setQuotes(nextQuotes)
      } catch (error) {
        console.error(
          'Failed to load quotes:',
          error,
        )
      }
    }

    loadQuotes()

    const interval =
      setInterval(
        loadQuotes,
        1000,
      )

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  /*
   * Current second chart is intentionally
   * independent. Synchronised multi-chart
   * interaction can be added later.
   */
  const secondSymbol =
    symbol === 'BTC/USDT'
      ? 'ETH/USDT'
      : 'BTC/USDT'

  return (
    <div
      className={`terminal-page ${
        theme === 'light'
          ? 'light'
          : ''
      }`}
    >
      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="terminal-header">
        <div className="terminal-brand">
          <button
            className="mobile-menu-button"
            onClick={() =>
              setWatchlistOpen(true)
            }
            aria-label="Open watchlist"
          >
            ☰
          </button>

          <div className="brand-mark">
            B
          </div>

          <div>
            <div className="brand-title">
              Bountiful Trading
            </div>

            <div className="brand-subtitle">
              Paper Terminal
            </div>
          </div>
        </div>

        <div className="header-symbol">
          <strong>
            {symbol}
          </strong>

          <span className="header-price">
            {selectedQuote
              ? formatPrice(
                  selectedQuote.last,
                )
              : '—'}
          </span>
        </div>

        <div className="connection-status">
          <span className="status-dot" />
          Paper Connected
        </div>

        <button
          className="theme-toggle"
          onClick={() =>
            setTheme(
              theme === 'dark'
                ? 'light'
                : 'dark',
            )
          }
          aria-label="Toggle dark and light mode"
          title={
            theme === 'dark'
              ? 'Switch to light mode'
              : 'Switch to dark mode'
          }
        >
          {theme === 'dark'
            ? '☀'
            : '◐'}
        </button>
      </header>

      <main className="terminal-layout">
        {/* ===================================================
            DESKTOP WATCHLIST
            =================================================== */}

        <aside className="watchlist-panel desktop-watchlist">
          <div className="panel-heading">
            <span>
              Watchlist
            </span>

            <span className="watchlist-count">
              {symbols.length}
            </span>
          </div>

          <div className="watchlist-items">
            {symbols.map((item) => {
              const quote =
                quotes[item]

              const active =
                item === symbol

              return (
                <button
                  key={item}
                  className={`watchlist-item ${
                    active
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    selectSymbol(item)
                  }
                >
                  <div className="watch-symbol">
                    <strong>
                      {item}
                    </strong>

                    <span>
                      Paper
                    </span>
                  </div>

                  <div className="watch-price">
                    <strong>
                      {quote
                        ? formatPrice(
                            quote.last,
                          )
                        : '—'}
                    </strong>

                    <span>
                      {quote
                        ? `A ${formatPrice(
                            quote.ask,
                          )}`
                        : '—'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ===================================================
            CENTER
            =================================================== */}

        <section className="terminal-center">
          {/* =================================================
              CHART TOOLBAR
              ================================================= */}

          <div className="chart-toolbar">
            <div className="chart-symbol-info">
              <div>
                <strong>
                  {symbol}
                </strong>

                <span>
                  Spot / Paper
                </span>
              </div>
            </div>

            <div className="chart-toolbar-right">
              <div className="timeframe-list">
                {timeframes.map(
                  (item) => (
                    <button
                      key={item}
                      className={
                        timeframe ===
                        item
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        setTimeframe(
                          item,
                        )
                      }
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>

              <button
                className={`toolbar-toggle ${
                  chartLayout ===
                  'DUAL'
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  setChartLayout(
                    chartLayout ===
                      'SINGLE'
                      ? 'DUAL'
                      : 'SINGLE',
                  )
                }
                aria-label="Toggle chart layout"
              >
                {chartLayout ===
                'SINGLE'
                  ? '▦'
                  : '□'}
              </button>

              <button
                className={`toolbar-toggle ${
                  oneTapMode
                    ? 'active danger-toggle'
                    : ''
                }`}
                onClick={() =>
                  setOneTapMode(
                    !oneTapMode,
                  )
                }
                aria-label="Toggle one tap mode"
              >
                1T
              </button>

              <button
                className="watchlist-search-button"
                onClick={() =>
                  setWatchlistOpen(true)
                }
                aria-label="Open watchlist"
              >
                ⌕
              </button>
            </div>
          </div>

          {/* =================================================
              CHART AREA
              ================================================= */}

          <div
            className={`chart-area ${
              chartLayout ===
              'DUAL'
                ? 'dual-chart-area'
                : ''
            }`}
            onClick={() => {
              if (
                watchlistOpen
              ) {
                setWatchlistOpen(
                  false,
                )
              }
            }}
          >
            <div className="chart-cell">
              <Chart
                symbol={symbol}
                timeframe={
                  timeframe
                }
              />
            </div>

            {chartLayout ===
              'DUAL' && (
              <div className="chart-cell secondary-chart">
                <div className="secondary-chart-label">
                  {secondSymbol}
                </div>

                <Chart
                  symbol={
                    secondSymbol
                  }
                  timeframe={
                    timeframe
                  }
                />
              </div>
            )}
          </div>

          {/* =================================================
              SCROLLABLE BODY
              ================================================= */}

          <div className="terminal-scroll-body">
            {/* =================================================
                ORDER TYPE
                ================================================= */}

            <section className="order-settings-card">
              <div className="order-settings-header">
                <span>
                  ORDER TYPE
                </span>

                <strong>
                  {orderType.replace(
                    '_',
                    ' ',
                  )}
                </strong>
              </div>

              <div className="order-type-buttons">
                {(
                  [
                    'MARKET',
                    'LIMIT',
                    'STOP',
                    'STOP_LIMIT',
                  ] as OrderType[]
                ).map(
                  (type) => (
                    <button
                      key={type}
                      className={
                        orderType ===
                        type
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        changeOrderType(
                          type,
                        )
                      }
                    >
                      {type.replace(
                        '_',
                        ' ',
                      )}
                    </button>
                  ),
                )}
              </div>

              {/* PRICE SETTINGS */}

              {orderType !==
                'MARKET' && (
                <div className="price-settings">
                  {(orderType ===
                    'STOP' ||
                    orderType ===
                      'STOP_LIMIT') && (
                    <label className="price-field">
                      <span>
                        STOP PRICE
                      </span>

                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={
                          stopPrice
                        }
                        onChange={(
                          event,
                        ) =>
                          setStopPrice(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder={
                          askPrice
                            ? formatPrice(
                                askPrice,
                              )
                            : '0.00'
                        }
                      />
                    </label>
                  )}

                  {(orderType ===
                    'LIMIT' ||
                    orderType ===
                      'STOP_LIMIT') && (
                    <label className="price-field">
                      <span>
                        LIMIT PRICE
                      </span>

                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={
                          limitPrice
                        }
                        onChange={(
                          event,
                        ) =>
                          setLimitPrice(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder={
                          askPrice
                            ? formatPrice(
                                askPrice,
                              )
                            : '0.00'
                        }
                      />
                    </label>
                  )}
                </div>
              )}
            </section>

            {/* =================================================
                CALCULATIONS
                ================================================= */}

            <div className="trade-stats-row">
              <div className="trade-stat">
                <span>
                  Quantity
                </span>

                <strong>
                  {formatNumber(
                    estimatedQuantity,
                  )}
                </strong>
              </div>

              <div className="trade-stat">
                <span>
                  BUY Value
                </span>

                <strong>
                  {formatPrice(
                    buyNotional,
                  )}
                </strong>
              </div>

              <div className="trade-stat">
                <span>
                  SELL Value
                </span>

                <strong>
                  {formatPrice(
                    sellNotional,
                  )}
                </strong>
              </div>

              <div className="trade-stat">
                <span>
                  Initial Margin
                </span>

                <strong>
                  {formatPrice(
                    buyInitialMargin,
                  )}
                </strong>
              </div>

              <div className="trade-stat">
                <span>
                  Est. Fee
                </span>

                <strong>
                  {formatPrice(
                    buyEstimatedFee,
                  )}
                </strong>
              </div>

              <div className="trade-stat">
                <span>
                  Available
                </span>

                <strong>
                  ₹
                  {availableBalance.toLocaleString(
                    undefined,
                    {
                      maximumFractionDigits:
                        2,
                    },
                  )}
                </strong>
              </div>

              <div className="trade-stat">
                <span>
                  Est. Liq.
                </span>

                <strong>
                  —
                </strong>
              </div>
            </div>

            {/* =================================================
                POSITIONS / ORDERS / JOURNAL
                ================================================= */}

            <section className="terminal-bottom">
              <div className="bottom-tabs">
                {[
                  'Positions',
                  'Orders',
                  'Journal',
                ].map((tab) => (
                  <button
                    key={tab}
                    className={
                      activeTab ===
                      tab
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setActiveTab(
                        tab,
                      )
                    }
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="bottom-content">
                {activeTab ===
                  'Positions' && (
                  <div className="empty-state">
                    <div className="empty-state-title">
                      No active positions
                    </div>

                    <div className="empty-state-subtitle">
                      Your open positions
                      will appear here.
                    </div>
                  </div>
                )}

                {activeTab ===
                  'Orders' && (
                  <div className="empty-state">
                    <div className="empty-state-title">
                      No open orders
                    </div>

                    <div className="empty-state-subtitle">
                      Pending orders will
                      appear here.
                    </div>
                  </div>
                )}

                {activeTab ===
                  'Journal' && (
                  <div className="empty-state">
                    <div className="empty-state-title">
                      Your journal is empty
                    </div>

                    <div className="empty-state-subtitle">
                      Trading activity and
                      notes will appear here.
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* =================================================
              EXECUTION BAR
              ONLY BUY / SIZE / SELL / LEV
              ================================================= */}

          <section
            className="trade-panel"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="trade-main-row">
              {/* BUY */}

              <button
                className="trade-side-button buy"
                aria-label={`Buy at ask ${formatPrice(
                  askPrice,
                )}`}
              >
                <strong>
                  {formatPrice(
                    askPrice,
                  )}
                </strong>
              </button>

              {/* SIZE */}

              <div className="size-control">
                <div className="size-input-row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={size}
                    onChange={(event) =>
                      setSize(
                        event.target
                          .value,
                      )
                    }
                    aria-label="Order size"
                  />

                  <select
                    value={
                      sizeMode
                    }
                    onChange={(
                      event,
                    ) =>
                      setSizeMode(
                        event.target
                          .value as SizeMode,
                      )
                    }
                    aria-label="Size unit"
                  >
                    <option value="LOT">
                      LOT
                    </option>

                    <option value="QUANTITY">
                      QTY
                    </option>

                    <option value="MARGIN">
                      MGN
                    </option>
                  </select>
                </div>
              </div>

              {/* SELL */}

              <button
                className="trade-side-button sell"
                aria-label={`Sell at bid ${formatPrice(
                  bidPrice,
                )}`}
              >
                <strong>
                  {formatPrice(
                    bidPrice,
                  )}
                </strong>
              </button>

              {/* LEVERAGE */}

              <button
                className={`trade-leverage-button ${leverageRisk}`}
                onClick={
                  openLeverageEditor
                }
                aria-label="Edit leverage"
              >
                <strong>
                  {leverage}x
                </strong>
              </button>
            </div>

            <div className="trade-footer">
              <span>
                Leverage:{' '}
                <strong>
                  {leverage}x
                </strong>
              </span>

              <span>
                Mode:{' '}
                <strong>
                  Isolated
                </strong>
              </span>

              <span>
                Order:{' '}
                <strong>
                  {orderType}
                </strong>
              </span>

              <span
                className={`one-tap-status ${
                  oneTapMode
                    ? 'enabled'
                    : ''
                }`}
              >
                1-Tap:{' '}
                <strong>
                  {oneTapMode
                    ? 'ON'
                    : 'OFF'}
                </strong>
              </span>

              <span className="risk-note">
                Paper execution only
              </span>
            </div>
          </section>
        </section>
      </main>

      {/* =====================================================
          WATCHLIST DRAWER
          ===================================================== */}

      {watchlistOpen && (
        <div
          className="watchlist-overlay"
          onClick={() =>
            setWatchlistOpen(false)
          }
        >
          <aside
            className="watchlist-drawer"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="drawer-header">
              <strong>
                Watchlist
              </strong>

              <button
                onClick={() =>
                  setWatchlistOpen(
                    false,
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="drawer-items">
              {symbols.map(
                (item) => {
                  const quote =
                    quotes[item]

                  const active =
                    item ===
                    symbol

                  return (
                    <button
                      key={item}
                      className={`drawer-symbol ${
                        active
                          ? 'active'
                          : ''
                      }`}
                      onClick={() =>
                        selectSymbol(
                          item,
                        )
                      }
                    >
                      <div>
                        <strong>
                          {item}
                        </strong>

                        <span>
                          {quote
                            ? formatPrice(
                                quote.last,
                              )
                            : '—'}
                        </span>
                      </div>

                      <div>
                        <small>
                          ASK
                        </small>

                        <strong>
                          {quote
                            ? formatPrice(
                                quote.ask,
                              )
                            : '—'}
                        </strong>
                      </div>
                    </button>
                  )
                },
              )}
            </div>
          </aside>
        </div>
      )}

      {/* =====================================================
          LEVERAGE MODAL
          ===================================================== */}

      {leverageEditorOpen && (
        <div
          className="leverage-modal-overlay"
          onClick={() => {
            if (
              pendingHighLeverage ===
              null
            ) {
              closeLeverageEditor()
            }
          }}
        >
          <div
            className="leverage-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="leverage-modal-header">
              <strong>
                Set Leverage
              </strong>

              <button
                onClick={
                  closeLeverageEditor
                }
              >
                ×
              </button>
            </div>

            <div className="leverage-input-label">
              Leverage
            </div>

            <div className="leverage-input-wrap">
              <input
                autoFocus
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={
                  leverageInput
                }
                onChange={(event) =>
                  setLeverageInput(
                    event.target
                      .value,
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key ===
                    'Enter'
                  ) {
                    requestLeverageChange()
                  }

                  if (
                    event.key ===
                    'Escape'
                  ) {
                    closeLeverageEditor()
                  }
                }}
              />

              <span>
                x
              </span>
            </div>

            {pendingHighLeverage !==
              null && (
              <div className="high-leverage-warning">
                <div className="warning-icon">
                  !
                </div>

                <div className="warning-content">
                  <strong>
                    High leverage
                  </strong>

                  <p>
                    {pendingHighLeverage}x
                    increases
                    liquidation
                    sensitivity.
                  </p>
                </div>

                <button
                  className="acknowledge-warning"
                  onClick={
                    acknowledgeAndApplyHighLeverage
                  }
                >
                  I Understand
                </button>
              </div>
            )}

            {pendingHighLeverage ===
              null && (
              <button
                className="apply-leverage"
                onClick={
                  requestLeverageChange
                }
              >
                Apply
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Terminal