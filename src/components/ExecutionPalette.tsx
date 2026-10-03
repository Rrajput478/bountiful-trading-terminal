import { useEffect, useState } from 'react'
import * as api from '../services/api'
import type {
  OrderType,
  Position,
  ProtectionTarget,
  Quote,
  SizeMode,
  SizePreview,
} from '../types/trading'
import { formatPrice } from './ChartPanel'

// ------------------------------------------------------------------ palette

interface PaletteProps {
  quote: Quote | undefined
  symbol: string
  busy: boolean
  disabled: boolean
  onSubmit: (req: {
    side: 'BUY' | 'SELL'
    type: OrderType
    quantity: number
    price?: number
    stopPrice?: number
    stopLoss?: number
    takeProfit?: number
    leverage: number
  }) => Promise<void>
}

const SIZING: { key: SizeMode; label: string; hint: string }[] = [
  { key: 'LOT', label: 'LOT', hint: 'Lots' },
  { key: 'QUANTITY', label: 'QTY', hint: 'Quantity' },
  { key: 'MARGIN', label: 'MRG', hint: 'Margin' },
]

export function ExecutionPalette({ quote, symbol, busy, disabled, onSubmit }: PaletteProps) {
  const [mode, setMode] = useState<SizeMode>('QUANTITY')
  const [sizeInput, setSizeInput] = useState('0.01')
  const [leverage, setLeverage] = useState(3)
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [preview, setPreview] = useState<SizePreview | null>(null)
  const [highRiskAck, setHighRiskAck] = useState(false)

  useEffect(() => {
    setHighRiskAck(false)
  }, [leverage])

  useEffect(() => {
    let alive = true
    const run = async () => {
      const value = Number(sizeInput)
      if (!Number.isFinite(value) || value <= 0) {
        setPreview(null)
        return
      }
      try {
        const p = await api.previewSize(symbol, mode, value, leverage)
        if (alive) setPreview(p)
      } catch {
        if (alive) setPreview(null)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [symbol, mode, sizeInput, leverage])

  const needsConfirm = leverage > 10 && !highRiskAck
  const quantity = preview?.quantity ?? 0
  const valid =
    quantity > 0 &&
    !needsConfirm &&
    !disabled &&
    (orderType === 'MARKET' ||
      (orderType === 'LIMIT' && Number(limitPrice) > 0) ||
      (orderType === 'STOP' && Number(stopPrice) > 0) ||
      (orderType === 'STOP_LIMIT' && Number(limitPrice) > 0 && Number(stopPrice) > 0))

  const submit = async (side: 'BUY' | 'SELL') => {
    if (!valid) return
    await onSubmit({
      side,
      type: orderType,
      quantity,
      price: orderType === 'LIMIT' || orderType === 'STOP_LIMIT' ? Number(limitPrice) : undefined,
      stopPrice: orderType === 'STOP' || orderType === 'STOP_LIMIT' ? Number(stopPrice) : undefined,
      stopLoss: stopLoss ? Number(stopLoss) : undefined,
      takeProfit: takeProfit ? Number(takeProfit) : undefined,
      leverage,
    })
    // clear the ticket but keep size and leverage for the next trade
    setStopLoss('')
    setTakeProfit('')
    setLimitPrice('')
    setStopPrice('')
    setHighRiskAck(false)
  }

  const levRisk = leverage > 10 ? 'danger' : leverage > 3 ? 'warn' : 'ok'

  return (
    <div className="palette" role="group" aria-label="Order execution">
      <div className="palette-row palette-modes">
        {SIZING.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`chip${mode === s.key ? ' on' : ''}`}
            onClick={() => setMode(s.key)}
            title={s.hint}
          >
            {s.label}
          </button>
        ))}
        <select
          className="chip select"
          value={orderType}
          onChange={(e) => setOrderType(e.target.value as OrderType)}
          aria-label="Order type"
        >
          <option value="MARKET">Market</option>
          <option value="LIMIT">Limit</option>
          <option value="STOP">Stop</option>
          <option value="STOP_LIMIT">Stop Limit</option>
        </select>
      </div>

      <div className="palette-row palette-main">
        <button
          type="button"
          className="side-btn buy"
          disabled={!valid || busy}
          onClick={() => submit('BUY')}
        >
          BUY
          <span className="side-px">{quote ? formatPrice(quote.ask, quoteDigits(quote.ask)) : '—'}</span>
        </button>

        <div className="size-box">
          <input
            className="size-input"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            aria-label={`Order size (${mode})`}
          />
          <div className="size-meta">
            <span className={`risk-dot ${levRisk}`} aria-hidden />
            <span>{quantity > 0 ? fmtQty(quantity) : '—'}</span>
          </div>
          <div className="size-lev">
            <input
              className="lev-input"
              type="number"
              min={1}
              max={100}
              step={1}
              value={leverage}
              onChange={(e) => setLeverage(clampLeverage(Number(e.target.value)))}
              aria-label="Leverage"
            />
            <span className="lev-x">x</span>
          </div>
        </div>

        <button
          type="button"
          className="side-btn sell"
          disabled={!valid || busy}
          onClick={() => submit('SELL')}
        >
          SELL
          <span className="side-px">{quote ? formatPrice(quote.bid, quoteDigits(quote.bid)) : '—'}</span>
        </button>
      </div>

      {/* Context-relevant inputs only, per §12 */}
      {orderType !== 'MARKET' && (
        <div className="palette-row palette-fields">
          {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
            <label className="field">
              <span>Limit</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={quote ? String(quote.last) : ''}
              />
            </label>
          )}
          {(orderType === 'STOP' || orderType === 'STOP_LIMIT') && (
            <label className="field">
              <span>Stop</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                placeholder={quote ? String(quote.last) : ''}
              />
            </label>
          )}
        </div>
      )}

      <div className="palette-row palette-fields">
        <label className="field">
          <span>SL</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder={quote ? String(Math.round(quote.last * 0.99)) : ''}
          />
        </label>
        <label className="field">
          <span>TP</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder={quote ? String(Math.round(quote.last * 1.02)) : ''}
          />
        </label>
      </div>

      {preview && (
        <div className="palette-summary" aria-live="polite">
          <span>
            Notional <b>{preview.notional.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
          </span>
          <span>
            Margin <b>{preview.initialMargin.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
          </span>
          <span>
            Fee ≈ <b>{preview.estimatedFee.toFixed(2)}</b>
          </span>
        </div>
      )}

      {leverage > 3 && (
        <div className={`leverage-note ${levRisk}`} role="status">
          {leverage > 10
            ? 'High risk: liquidation can wipe the margin quickly.'
            : 'Above 3x — liquidation moves closer to entry.'}
        </div>
      )}

      {needsConfirm && (
        <label className="confirm-row">
          <input
            type="checkbox"
            checked={highRiskAck}
            onChange={(e) => setHighRiskAck(e.target.checked)}
          />
          <span>I confirm {leverage}x leverage on this order</span>
        </label>
      )}

      {disabled && <div className="palette-note">Paper account is loading…</div>}
    </div>
  )
}

// ------------------------------------------------------------------ protection

interface ProtectionProps {
  position: Position
  target: Exclude<ProtectionTarget, null>
  busy: boolean
  onModify: (stopLoss: number | null, takeProfit: number | null) => Promise<void>
  onClose: () => void
  onDismiss: () => void
}

/** Shared TP/SL editor used in both the portrait palette and the landscape window. */
export function ProtectionFields({
  position,
  target,
  onModify,
  onClose,
  onDismiss,
  compact,
}: Omit<ProtectionProps, 'busy'> & { compact?: boolean }) {
  const [sl, setSl] = useState(
    position.stopLoss ? String(position.stopLoss) : '',
  )
  const [tp, setTp] = useState(
    position.takeProfit ? String(position.takeProfit) : '',
  )

  useEffect(() => {
    setSl(position.stopLoss ? String(position.stopLoss) : '')
    setTp(position.takeProfit ? String(position.takeProfit) : '')
  }, [position.stopLoss, position.takeProfit, position.symbol])

  const save = async () => {
    const slNum = sl ? Number(sl) : null
    const tpNum = tp ? Number(tp) : null
    if (slNum !== null && !Number.isFinite(slNum)) return
    if (tpNum !== null && !Number.isFinite(tpNum)) return
    await onModify(slNum, tpNum)
  }

  return (
    <div className={`protection${compact ? ' compact' : ''}`}>
      <div className="protection-head">
        <span className="protection-title">
          {position.side} {fmtQty(position.quantity)} {position.symbol}
        </span>
        <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Close">
          ×
        </button>
      </div>

      <div className="protection-grid">
        <label className={`field${target === 'TP' ? ' focused' : ''}`}>
          <span>TP</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            placeholder="none"
          />
        </label>
        <label className={`field${target === 'SL' ? ' focused' : ''}`}>
          <span>SL</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            placeholder="none"
          />
        </label>
      </div>

      <div className="protection-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn primary" onClick={save}>
          Modify
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ helpers

function clampLeverage(n: number): number {
  if (!Number.isFinite(n)) return 3
  return Math.min(100, Math.max(1, Math.round(n)))
}

function quoteDigits(price: number): number {
  return Math.abs(price) < 1 ? 5 : 2
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}
