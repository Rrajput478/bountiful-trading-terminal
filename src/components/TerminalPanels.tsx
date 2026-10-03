import type { Balance, Order, Position, Quote, SymbolSpec, Trade } from '../types/trading'
import { formatPrice } from './ChartPanel'

// ------------------------------------------------------------------ header

export function TerminalHeader({
  symbol,
  quote,
  balance,
  theme,
  paper,
  onToggleTheme,
  onToggleWatchlist,
}: {
  symbol: string
  quote?: Quote
  balance: Balance | null
  theme: 'dark' | 'light'
  paper: boolean
  onToggleTheme: () => void
  onToggleWatchlist: () => void
}) {
  const up = (quote?.change24h ?? 0) >= 0
  return (
    <header className="terminal-header">
      <button type="button" className="icon-btn watch-toggle" onClick={onToggleWatchlist} aria-label="Watchlist">
        ☰
      </button>

      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Bountiful</span>
      </div>

      <div className="header-symbol">
        <span className="header-sym">{symbol}</span>
        <span className={`header-px ${up ? 'up' : 'down'}`}>
          {quote ? formatPrice(quote.last, digits(quote.last)) : '—'}
        </span>
        <span className={`header-chg ${up ? 'up' : 'down'}`}>
          {up ? '▲' : '▼'} {Math.abs(quote?.change24h ?? 0).toFixed(2)}%
        </span>
      </div>

      <div className="header-right">
        <span className="header-balance">
          {balance ? balance.equity?.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
        </span>
        <span className={`badge ${paper ? 'paper' : 'live'}`}>{paper ? 'PAPER' : 'LIVE'}</span>
        <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  )
}

// ------------------------------------------------------------------ watchlist

export function Watchlist({
  specs,
  quotes,
  active,
  onSelect,
  open,
  onClose,
}: {
  specs: SymbolSpec[]
  quotes: Record<string, Quote>
  active: string
  onSelect: (s: string) => void
  open: boolean
  onClose: () => void
}) {
  const groups: { key: SymbolSpec['category']; label: string }[] = [
    { key: 'CRYPTO', label: 'Crypto' },
    { key: 'FOREX', label: 'Forex / Metals' },
    { key: 'INDIAN', label: 'India' },
  ]

  return (
    <>
      <div
        className={`scrim${open ? ' on' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`watchlist${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="watch-head">
          <span>Watchlist</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close watchlist">
            ×
          </button>
        </div>
        {groups.map((g) => {
          const rows = specs.filter((s) => s.category === g.key)
          if (rows.length === 0) return null
          return (
            <div className="watch-group" key={g.key}>
              <div className="watch-group-label">{g.label}</div>
              {rows.map((spec) => {
                const q = quotes[spec.symbol]
                const up = (q?.change24h ?? 0) >= 0
                return (
                  <button
                    type="button"
                    key={spec.symbol}
                    className={`watch-row${active === spec.symbol ? ' on' : ''}`}
                    onClick={() => onSelect(spec.symbol)}
                  >
                    <span className="watch-sym">{spec.symbol}</span>
                    <span className="watch-bid">{q ? formatPrice(q.bid, digits(q.bid)) : '—'}</span>
                    <span className="watch-ask">{q ? formatPrice(q.ask, digits(q.ask)) : '—'}</span>
                    <span className={`watch-chg ${up ? 'up' : 'down'}`}>
                      {q ? `${up ? '+' : ''}${q.change24h?.toFixed(2)}%` : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </aside>
    </>
  )
}

// ------------------------------------------------------------------ workspace

export function Workspace({
  tab,
  onTab,
  positions,
  orders,
  journal,
  onClosePosition,
  onCancelOrder,
  onEditProtection,
  onSelectSymbol,
}: {
  tab: 'POSITIONS' | 'ORDERS' | 'JOURNAL'
  onTab: (t: 'POSITIONS' | 'ORDERS' | 'JOURNAL') => void
  positions: Position[]
  orders: Order[]
  journal: Trade[]
  onClosePosition: (symbol: string, quantity?: number) => void
  onCancelOrder: (id: string) => void
  onEditProtection: (p: Position) => void
  onSelectSymbol: (s: string) => void
}) {
  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: 'POSITIONS', label: 'Positions', count: positions.length },
    { key: 'ORDERS', label: 'Orders', count: orders.length },
    { key: 'JOURNAL', label: 'Journal', count: journal.length },
  ]

  return (
    <section className="workspace">
      <div className="workspace-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            className={`workspace-tab${tab === t.key ? ' on' : ''}`}
            onClick={() => onTab(t.key)}
          >
            {t.label}
            {t.count > 0 && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="workspace-body">
        {tab === 'POSITIONS' &&
          (positions.length === 0 ? (
            <Empty text="No open positions" />
          ) : (
            positions.map((p) => (
              <div className="row position-row" key={`${p.symbol}-${p.side}`}>
                <button type="button" className="row-main" onClick={() => onSelectSymbol(p.symbol)}>
                  <span className={`tag ${p.side === 'LONG' ? 'long' : 'short'}`}>{p.side}</span>
                  <span className="row-sym">{p.symbol}</span>
                  <span className="row-qty">{fmtQty(p.quantity)} @ {formatPrice(p.entryPrice, digits(p.entryPrice))}</span>
                </button>
                <span className={`row-pnl ${p.pnl >= 0 ? 'up' : 'down'}`}>
                  {p.pnl >= 0 ? '+' : ''}{p.pnl.toFixed(2)}
                  <em>{p.pnlPercentage ? `${p.pnlPercentage >= 0 ? '+' : ''}${p.pnlPercentage.toFixed(2)}%` : ''}</em>
                </span>
                <span className="row-tpsl">
                  {p.stopLoss ? `SL ${formatPrice(p.stopLoss, digits(p.stopLoss))}` : 'no SL'}
                  {' · '}
                  {p.takeProfit ? `TP ${formatPrice(p.takeProfit, digits(p.takeProfit))}` : 'no TP'}
                </span>
                <span className="row-actions">
                  <button type="button" className="btn tiny" onClick={() => onEditProtection(p)}>
                    Edit
                  </button>
                  {/* Partial close first, full close second - the common MT5 order. */}
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => onClosePosition(p.symbol, roundQty(p.quantity / 2))}
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    className="btn tiny danger"
                    onClick={() => onClosePosition(p.symbol)}
                  >
                    Close
                  </button>
                </span>
              </div>
            ))
          ))}

        {tab === 'ORDERS' &&
          (orders.length === 0 ? (
            <Empty text="No working orders" />
          ) : (
            orders.map((o) => (
              <div className="row order-row" key={o.id}>
                <span className="row-main">
                  <span className={`tag ${o.side === 'BUY' ? 'long' : 'short'}`}>{o.side}</span>
                  <span className="row-sym">{o.symbol}</span>
                  <span className="row-qty">{o.type}</span>
                </span>
                <span className="row-qty">
                  {fmtQty(o.filledQuantity)}/{fmtQty(o.quantity)}
                </span>
                <span className="row-px">{o.price ? formatPrice(o.price, digits(o.price)) : '—'}</span>
                <button type="button" className="btn tiny danger" onClick={() => onCancelOrder(o.id)}>
                  Cancel
                </button>
              </div>
            ))
          ))}

        {tab === 'JOURNAL' &&
          (journal.length === 0 ? (
            <Empty text="No closed trades yet" />
          ) : (
            journal.map((t) => (
              <div className="row journal-row" key={t.id}>
                <span className="row-main">
                  <span className={`tag ${t.side === 'LONG' ? 'long' : 'short'}`}>{t.side}</span>
                  <span className="row-sym">{t.symbol}</span>
                  <span className="row-qty">{fmtQty(t.quantity)}</span>
                </span>
                <span className="row-px">
                  {formatPrice(t.entryPrice, digits(t.entryPrice))} → {formatPrice(t.exitPrice, digits(t.exitPrice))}
                </span>
                <span className="row-reason">{reasonLabel(t.closeReason)}</span>
                <span className={`row-pnl ${t.pnl >= 0 ? 'up' : 'down'}`}>
                  {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                </span>
              </div>
            ))
          ))}
      </div>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export function reasonLabel(r?: string): string {
  switch (r) {
    case 'TAKE_PROFIT':
      return 'TP'
    case 'STOP_LOSS':
      return 'SL'
    case 'LIQUIDATION':
      return 'Liq.'
    default:
      return 'Manual'
  }
}

/**
 * Rounds a partial-close size to something the exchange would accept: enough
 * decimals for tiny crypto lots, without float noise like 0.15000000000000002.
 */
export function roundQty(n: number): number {
  return Number(n.toFixed(8))
}

export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function digits(price: number): number {
  return Math.abs(price) < 1 ? 5 : 2
}