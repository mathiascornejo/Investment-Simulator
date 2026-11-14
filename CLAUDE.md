# Investment Simulator — project briefing

Read this before starting any feature. Update it when a feature lands or a decision changes (keep it under ~80 lines).

## Goal
A web app that simulates portfolios and single assets against each other. Educational simulator only: no trading, no investment advice, show a disclaimer.

## Tabs
1. **Simulation / Backtester** — compare portfolios side by side: monthly/annual gain, CAGR, volatility, max drawdown, beta, Sharpe/Sortino, best/worst year, and the difference between portfolios. Growth chart + drawdown chart, with a time-range selector (1Y, 3Y, 5Y, 10Y, Max, custom).
2. **Portfolio Creator** — build portfolios from stocks, bonds, funds, commodities, etc. Set weights, rebalancing rule (none / monthly / quarterly / annual / drift band), and other options. Show a portfolio profile (sector, geographic concentration, asset mix, characteristics) modelled on Vanguard's VOO profile page, down to (not including) the portfolio composition section.
3. **Monte Carlo** — thousands of randomized runs for a selected portfolio: failure rate, probability cones (percentile bands). Stress tests against historical crises (2008 crash, 2020 downturn).

## Finance rules (do not break)
- Always use split- and dividend-adjusted (total return) prices for returns.
- Beta and relative stats are measured against a benchmark (default: S&P 500).
- Crisis windows: GFC Oct 2007 – Mar 2009; COVID 19 Feb – 23 Mar 2020.
- Many ETFs are younger than 2008 (VOO launched Sep 2010). Crisis tests need a proxy map (e.g. VOO -> SPY/VFINX) or must say the asset has no data for that period. Never silently truncate.
- Monte Carlo "failure" = portfolio hits zero before the horizon under the chosen withdrawals. State the method used (bootstrap vs parametric) in the UI.
- API keys never ship to the browser or the repo; all Tiingo calls go through the Cloudflare Worker proxy.

## Decisions
| Topic | Status |
|---|---|
| Historical data source | DECIDED — Tiingo EOD API (adjusted prices, 30+ yrs). Free tier limits: 500 unique symbols/month, 50 requests/hour, 1,000/day, internal use only — so cache every series. FRED as free add-on for risk-free rate / CPI. |
| Fund profile data (sector / country weights) | PENDING — Tiingo does not provide it. Candidates when tab 2 is built: FMP or EODHD paid tiers. |
| Chart look | DECIDED — Portfolio Visualizer: growth chart, annual return bars, drawdown chart/table, Monte Carlo percentile bands. |
| Overall site design | DECIDED — blend of Simply Wall St (visual, infographic-style analysis), Wealthsimple (calm, editorial), Monarch (warm, friendly dashboards), Mercury (calm presentation of money), Vanguard (fund profile layout for tab 2). |
| Hosting | DECIDED — static front end on GitHub Pages (no server-side code; site is public even from a private repo). All backtest / Monte Carlo maths runs in the browser. |
| Data proxy | DECIDED — Cloudflare Worker (free plan: 100,000 requests/day, 10 ms CPU per request) sits between the browser and Tiingo. Holds the Tiingo key as a Worker secret, allows only the EOD price endpoint, sends CORS headers for the Pages origin only, and caches each ticker's full history in Workers KV for 6 hours to stay under Tiingo's 50 requests/hour. |
| Front end | DECIDED — plain HTML/CSS/JS with native ES modules. No framework, no build step, no npm dependencies: pushing to GitHub is the deploy. Revisit only if UI state becomes unmanageable. |
| Visual style | DECIDED — tokens at the top of `styles.css`: cool paper background, navy ink, one marigold highlight, serif headings, system fonts only, light mode only. Green/red are reserved for gain/loss data. |
| Chart library | NOT DECIDED. |
| Known risk | Tiingo's free and $30 plans are "internal use only"; a public site showing its prices is outside that licence. Revisit before sharing the URL. |

## Project map
Add one line per folder/file as it is created, so chats don't need to search.
- `index.html` — the whole page: top bar, three tab sections (`#backtester`, `#creator`, `#monte-carlo`), disclaimer.
- `styles.css` — design tokens and all styles.
- `js/app.js` — tab switching (URL hash) and the Backtester's "check the price data" form.
- `js/data.js` — `PROXY_URL` and `fetchPrices(ticker)` -> `[{ date, adjClose }]`, oldest first. All price loading goes through this.
- `worker/worker.js` — Cloudflare Worker proxy: `GET /prices?ticker=SPY`. `worker/wrangler.jsonc` is its config, `worker/worker.test.js` its tests.
- `.claude/launch.json` — local preview server (port 8000).

## Commands
- Preview the site: `python3 -m http.server 8000`, then open http://localhost:8000
- Test the proxy: `node --test worker/worker.test.js`
- Run the proxy locally: `(cd worker && npx wrangler dev)` — needs `worker/.dev.vars` containing `TIINGO_KEY=...`
- Deploy the proxy: `(cd worker && npx wrangler deploy)`

## Setup still to do (owner, one time)
Done: Cloudflare account, KV cache, Worker deployed at https://investment-simulator-proxy.investmentsimulator.workers.dev (set in `js/data.js`), Tiingo key stored as the `TIINGO_KEY` secret.
Not yet confirmed: real prices loading end to end (on 2026-11-14 the new workers.dev address was still waiting for its certificate).
Remaining: create the GitHub repo, enable Pages, and put the Pages address in `ALLOWED_ORIGINS` (`worker/wrangler.jsonc`), then redeploy.
Delete this section once done.

## Working rules
- Check this file first; do not re-research settled decisions.
- Smallest change that fully works; no features nobody asked for.
- New calculation logic (returns, drawdown, beta, Monte Carlo) gets a small test against a known value.
- After finishing a feature: update Decisions, Project map, and anything here that changed.
