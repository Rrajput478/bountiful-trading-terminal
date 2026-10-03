# Deploying Bountiful Trading Terminal

## The shape: one process, one port

The server serves both the API and the built frontend. Run `npm run build`
first, then `npm start`. That is the whole deployment.

Two processes are only needed for development (`npm run dev` and
`npm run dev:server`), where Vite proxies `/api` to port 3000.

```bash
git clone https://github.com/Rrajput478/bountiful-trading-terminal.git
cd bountiful-trading-terminal
npm ci
npm run build
npm start          # serves API + frontend on PORT (default 3000)
```

Environment:

| Variable           | Default | Purpose                                             |
| ------------------ | ------- | --------------------------------------------------- |
| `PORT`             | `3000`  | HTTP port                                            |
| `HOST`             | `0.0.0.0`| Bind address (must be 0.0.0.0 in a container)       |
| `PAPER_STATE_PATH` | `./data/paper-state.json` | Paper account file. Set `off` to disable persistence |

## Requirements the host must meet

- **HTTPS.** A service worker, and therefore the install prompt, requires a
  secure context. Plain HTTP works only on `localhost`. Every mainstream host
  provides HTTPS automatically; use it.
- **A writable filesystem**, or a mounted volume. The paper account is saved
  to disk. On a serverless platform the local filesystem is ephemeral, so set
  `PAPER_STATE_PATH` to a mounted path or to `off` and accept that the paper
  account resets on redeploy.
- **Node 20 or newer.**

## Picking a host

**Railway, Render, Fly.io, or any VM/container** — the best fit. One process,
one port, persistent disk. This is the recommended option.

**Vercel, Netlify, Cloudflare Pages** — these are static hosts. The Node
backend cannot run there without a separate serverless function layer, and
that split breaks the same-origin `/api` path the frontend expects. If you
choose one of these, the backend has to be deployed separately and pointed at
via an absolute API base URL, which is extra work and an extra failure point.

**A VPS** (Hetzner, DigitalOcean, Oracle free tier) — also a good fit and the
cheapest long-term option if you are comfortable with SSH and a reverse proxy.

## Keeping the paper account across restarts and deploys

The paper engine persists to `data/paper-state.json` using an atomic
write-then-rename, so a crash mid-write cannot corrupt the file. A graceful
shutdown (`SIGTERM`/`SIGINT`) flushes immediately; a hard kill loses at most
the last 250 ms of activity.

On a platform that restarts containers on deploy, mount a volume and point
`PAPER_STATE_PATH` at it, otherwise each deploy starts from a fresh 10,000
USDT account.

## Live trading

Live brokers are deliberately disabled. `PAPER_LIVE_TRADING` is not honoured
by the current adapters, and there is no code path that places a real order.
Do not attempt to enable it by environment variable; a live adapter has to be
implemented and tested against that broker's own sandbox first.