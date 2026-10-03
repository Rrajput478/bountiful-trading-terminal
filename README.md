# Bountiful Trading Terminal

A personalised trading terminal inspired by MT5's execution feel, built for fast
market observation, chart-based trading and position management.

**It starts and runs entirely in Paper Trading.** Live brokers are architecturally
present but deliberately refuse to trade until their real API integration is
implemented. See [Live broker status](#live-broker-status).

---

## Quick start

```bash
npm install
npm run dev:server     # backend on http://localhost:3000
npm run dev            # frontend on http://localhost:5173
```

Open <http://localhost:5173/terminal>. No credentials or configuration are needed
for paper trading.

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (frontend) |
| `npm run dev:server` | Fastify backend with reload |
| `npm run build` | Type-check frontend **and** server, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm start` | Run the compiled backend |

---

## Architecture

```text
Browser (React + TypeScript + Lightweight Charts)
    │  same-origin /api calls, proxied by Vite in dev
    ▼
Fastify server
    │
    ├─ BrokerFactory ──► PaperTradingAdapter        (live, fully implemented)
    │                 └► CoinDcxAdapter              (stub - refuses to trade)
    │                 └► UpstoxAdapter               (stub - refuses to trade)
    │                 └► DeltaAdapter                (stub - refuses to trade)
    │
    └─ MarketDataProvider ──► PaperMarketDataProvider
                              (future: real feed providers)
```

The UI never talks to a broker directly. Everything goes through `BrokerAdapter`
(`server/BrokerAdapter.ts`), so adding a broker does not require frontend changes.

### Key files

| Path | Role |
| --- | --- |
| `server/BrokerAdapter.ts` | The broker contract every adapter implements |
| `server/BrokerFactory.ts` | Adapter registry and the broker list served to the UI |
| `server/providers/PaperTradingAdapter.ts` | Paper execution, margin, P&L, triggers, journal |
| `server/providers/LiveBrokerStubs.ts` | Honest stubs for CoinDCX / Upstox / Delta |
| `server/market-data/PaperMarketDataProvider.ts` | Symbols, specs, quotes, stable candles |
| `server/index.ts` | REST API and the tick loop |
| `src/hooks/useTrading.ts` | The single polling source for all terminal state |
| `src/components/ExecutionPalette.tsx` | BUY / SIZE / SELL / LEVERAGE control surface |
| `src/components/ChartPanel.tsx` | Chart, position lines, draggable TP/SL |

---

## What the paper engine actually does

These are enforced **on the server**, not in the browser:

- **10,000 USDT** starting balance, with real margin accounting and trading fees.
- **Market, Limit, Stop and Stop-Limit** orders. Pending orders fill when the
  paper market crosses their trigger, and can be cancelled from the Orders panel.
- **Take-profit and stop-loss** on every position, editable by dragging the line
  on the chart or from the position panel. Crossing either level closes the
  position for real.
- **Leverage** with margin, free-margin and liquidation tracking. The UI warns
  above 3x and requires an explicit confirmation above 10x.
- **Closing a position never reverses it** - it closes exactly the size you asked
  for, and nothing else opens behind it.
- **Journal** - every closed trade records entry, exit, size, fee, realised P&L,
  duration and the close reason (`MANUAL`, `TAKE_PROFIT`, `STOP_LOSS`,
  `LIQUIDATION`).
- **Leverage limits, quantity minimum/maximum and step** are validated against
  each symbol's spec before an order is accepted.

The UI only ever renders state the backend returns. It does not simulate fills.

---

## Live broker status

| Broker | Market data | Order placement | Credentials |
| --- | --- | --- | --- |
| Paper Trading | Working | Working | Not needed |
| CoinDCX | Paper feed | **Refused** | `COINDCX_*` env vars |
| Upstox | Paper feed | **Refused** | `UPSTOX_*` env vars |
| Delta Exchange | Paper feed | **Refused** | `DELTA_*` env vars |

The live adapters read credentials from the backend environment only. They are
never sent to the browser and never stored in frontend state. With credentials
present but the integration incomplete, they report a clear error instead of
showing a fake "connected" badge or a fabricated balance.

To enable a live broker for real, implement its adapter
(`server/providers/LiveBrokerStubs.ts` is the shared starting point), authenticate,
and add tests. Until then the terminal stays paper-first by design.

---

## Configuration

Copy `.env.example` to `.env`. Every broker block can stay empty - that is a
valid paper-trading setup. See the file for the full variable list.

---

## Deployment

The frontend is a static Vite build and the backend is a Fastify server.

```bash
npm run build          # type-checks both, emits dist/
```

Serve `dist/` from any static host and run `npm start` for the API. Two
deployment details matter:

1. **`/api` must be proxied to the backend** on the same origin. In dev, Vite does
   this for you; in production, configure the reverse proxy (nginx, Caddy, or your
   platform's rewrite rules).
2. **Broker credentials belong on the backend host only.** Never in `dist/`,
   never in a client-side env var.

A minimal nginx rule:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
}
location / {
    root /var/www/bountiful/dist;
    try_files $uri $uri/ /index.html;
}
```

### PWA

The app is installable: `public/manifest.json` ships `any` and `maskable` icons,
and `index.html` carries the Apple touch icon and theme colour.

---

## Safety notes

- Paper Trading is the default and is the only broker enabled by default.
- Live trading cannot be switched on by configuration alone.
- Position size, leverage, order type and TP/SL values are all validated
  server-side; the frontend gates are a convenience, not the enforcement point.