# Investment Simulator — project briefing

Read this before starting any feature. Update it when a feature lands or a decision changes (keep it under ~80 lines).

## Goal
A web app that simulates portfolios and single assets against each other. Educational simulator only: no trading, no investment advice, show a disclaimer.

## Tabs
1. **Simulation / Backtester** — compare portfolios side by side: monthly/annual gain, CAGR, volatility, max drawdown, beta, Sharpe/Sortino, best/worst year, and the difference between portfolios. Growth chart + drawdown chart, with a time-range selector (1Y, 3Y, 5Y, 10Y, Max, custom).
2. **Portfolio Creator** — build portfolios from stocks, bonds, funds, commodities, etc. Set weights, rebalancing rule (none / monthly / quarterly / annual / drift band), and other options. Show a portfolio profile (sector, geographic concentration, asset mix, characteristics) modelled on Vanguard's VOO profile page. The owner's words were "until the portfolio composition part"; since they asked for sector and geographic mix, which sit inside that section on Vanguard's page, read it as up to and including it (unconfirmed).
3. **Monte Carlo** — thousands of randomized runs for a selected portfolio: failure rate, probability cones (percentile bands). Stress tests against historical crises (2008 crash, 2020 downturn).

## Finance rules (do not break)
- Always use split- and dividend-adjusted (total return) prices for returns.
- Beta and relative stats are measured against a benchmark (default: S&P 500).
- Crisis windows are the S&P 500's peak-to-trough dates: dot-com 24 Mar 2000 – 9 Oct 2002; GFC 9 Oct 2007 – 9 Mar 2009; COVID 19 Feb – 23 Mar 2020; 2022 3 Jan – 12 Oct 2022.
- Many ETFs are younger than 2008 (VOO launched Sep 2010). Crisis tests need a proxy map (e.g. VOO -> SPY/VFINX) or must say the asset has no data for that period. Never silently truncate.
- Monte Carlo "failure" = portfolio hits zero before the horizon under the chosen withdrawals. State the method used (bootstrap vs parametric) in the UI.
- API keys never ship to the browser or the repo; all Tiingo calls go through the Cloudflare Worker proxy.

## Decisions
| Topic | Status |
|---|---|
| Historical data source | DECIDED — Tiingo EOD API (adjusted prices, 30+ yrs). Free tier limits: 500 unique symbols/month, 50 requests/hour, 1,000/day, internal use only — so cache every series. FRED as free add-on for risk-free rate / CPI. |
| Fund profile data (sector / country weights) | PENDING (owner's decision, costs money) — Tiingo does not provide it. Candidates: EODHD fundamentals ($59.99/mo, sector + region + holdings), FMP (sector and country endpoints; which plan includes them is unconfirmed), Alpha Vantage free key (25 requests/day; ETF sectors only, no geography; free access unconfirmed). The profile shows a "not available yet" note until this is chosen. |
| Saved portfolios | DECIDED — kept in the visitor's browser (`localStorage`, key `portfolios`). No accounts, no server. They do not travel between browsers or devices. |
| Chart look | DECIDED — Portfolio Visualizer: growth chart, annual return bars, drawdown chart/table, Monte Carlo percentile bands. |
| Overall site design | DECIDED — blend of Simply Wall St (visual, infographic-style analysis), Wealthsimple (calm, editorial), Monarch (warm, friendly dashboards), Mercury (calm presentation of money), Vanguard (fund profile layout for tab 2). |
| Hosting | DECIDED — static front end on GitHub Pages (no server-side code; site is public even from a private repo). All backtest / Monte Carlo maths runs in the browser. |
| Data proxy | DECIDED — Cloudflare Worker (free plan: 100,000 requests/day, 10 ms CPU per request) sits between the browser and Tiingo. Holds the Tiingo key as a Worker secret, allows only the EOD price endpoint, sends CORS headers for the Pages origin only, and caches each ticker's full history in Workers KV for 6 hours to stay under Tiingo's 50 requests/hour. |
| Front end | DECIDED — plain HTML/CSS/JS with native ES modules. No framework, no build step, no npm dependencies: pushing to GitHub is the deploy. Revisit only if UI state becomes unmanageable. |
| Visual style | DECIDED — tokens at the top of `styles.css`: cool paper background, navy ink, one marigold highlight, serif headings, system fonts only, light mode only. Green/red are reserved for gain/loss data. |
| Chart library | DECIDED — Apache ECharts 6.1.0, loaded by script tag from jsDelivr with an integrity hash: `https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js`, `sha256-tmslrrTfhOMxmdwhaUAU0zbSIsvZ3rDlp8FL1qoND9A=`. One library covers lines, bars, donuts and Monte Carlo bands. |
| Chart colours | DECIDED — series colours in fixed order, validated colour-blind safe on white: `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4` (max 5 series). Colour follows the asset, never its rank. Text is never series-coloured; always show a legend and the stats table. |
| Non-US prices | DECIDED (2026-11-15) — Yahoo Finance's unofficial chart endpoint, called only from the Worker: used for tickers with a dot (`VOD.L`, `7203.T`) and as the fallback when Tiingo 404s. Dividend-adjusted, global, free, but unlicensed (its terms bar redistribution) and may break or block. Prices are in the listing currency (London in pence); the app does not convert currencies. Needs `npx wrangler deploy` to go live. |
| Known risk | Tiingo's free and $30 plans are "internal use only"; a public site showing its prices is outside that licence. Revisit before sharing the URL. |

## Project map
Add one line per folder/file as it is created, so chats don't need to search.
- `index.html` — the whole page: top bar, three tab sections (`#backtester`, `#creator`, `#monte-carlo`), disclaimer.
- `styles.css` — design tokens and all styles.
- `js/app.js` — tab switching (URL hash); imports each tab's module.
- `js/portfolios.js` — saved-portfolio storage (`loadPortfolios`, `savePortfolios`, which fires a `portfolios-changed` event) and the engine `portfolioSeries(portfolio, prices)`, which returns a price-like series starting at 100 so every `stats.js` function works on a portfolio. Tested by `js/portfolios.test.js`.
- `js/creator.js` — the Portfolio creator tab: the form, validation, and the profile.
- `js/format.js` — shared number/date formatters, `show()` and the `element()` DOM helper. Use these; don't add new formatters per tab.
- `js/montecarlo.js` — pure simulation maths, tested by `js/montecarlo.test.js`: `walk` (one balance through a list of monthly returns), `simulate`, `percentile`, `crisisTest`, `historicalRun`, `CRISES`.
- `js/montecarlo-tab.js` — the Monte Carlo tab: inputs, loading, cone chart, crises table.
- `js/backtester.js` — the Backtester tab: loads tickers and saved portfolios, holds the selected period, draws the three ECharts charts and the statistics table. It exports `frame()`, the shared ECharts options (axes, grid, tooltip): build every new chart on it so all charts look alike.
- `js/ticker-search.js` — `attachTickerSearch(input, {multi})`: suggestions drop down under a ticker text box as you type (↑↓ Enter Esc), modelled on King Crab House's search. ~40 named tickers plus `js/tickers.csv` (~20k active US + Shanghai/Shenzhen stocks and ETFs from Tiingo's supported_tickers.zip, ticker + exchange only); any typed symbol is offered as "Use XYZ". Takes `extra()` entries (saved portfolios, listed first). Used on the Backtester list and the Monte Carlo ticker; not on the Creator's holding rows yet. Styles: `.suggest` in `styles.css`.
- `js/data.js` — `PROXY_URL` and `fetchPrices(ticker)` -> `[{ date, adjClose }]`, oldest first. All price loading goes through this.
- `js/stats.js` — pure maths, tested by `js/stats.test.js` (`node --test js/stats.test.js`): `windowOf`, `totalReturn`, `cagr` (null under 1 year), `drawdowns`, `maxDrawdown`, `volatility`, `sharpe`, `sortino`, `beta`, `periodReturns` (yearly/monthly, flags partial periods), `summarize`. Uses daily returns, 252 trading days, 0% risk-free rate.
- `worker/worker.js` — Cloudflare Worker proxy: `GET /prices?ticker=SPY` (Tiingo; Yahoo for dotted tickers and Tiingo misses). `worker/wrangler.jsonc` is its config, `worker/worker.test.js` its tests.
- `.claude/launch.json` — local preview server (port 8000).

## Status of the tabs
- **Backtester — built (2026-11-14), tickers only.** Up to 5 tickers (default `SPY, BND`; SPY is always fetched as the beta benchmark). Period buttons 1Y/3Y/5Y/10Y/Max plus From/To dates. Charts: growth of $10,000 (log toggle), returns by year or month, drawdowns. Stats table with a difference column when exactly two assets are compared. The comparison covers only the dates every asset has, and the page says which asset limits the start.
  - Saved portfolios are typed (or picked from the suggestions) by name in the same box as the tickers and compared like tickers (max 5 lines in total). On submit the saved names are lifted out of the text first, so names may contain spaces and commas; the rest is split into tickers.
  - Not built yet: a table of the worst drawdowns, a real risk-free rate.
  - Gotcha: don't turn on ECharts `sampling` for lines; it drops different dates per series and the shared tooltip then omits assets.
- **Portfolio creator — built (2026-11-14), without sector/regional mix.** Name, up to 10 holdings with weights that must total 100%, rebalancing rule (never / month / quarter / year / drift band in percentage points). Saving checks every ticker has price data. The profile shows allocation bars and risk-and-return figures over the dates every holding has.
  - Not built yet: sector and regional mix (blocked on the data-source decision), asset names next to tickers, regular contributions or withdrawals, trading costs.
- **Monte Carlo — built (2026-11-14).** Pick a saved portfolio or one ticker; set starting amount, yearly withdrawal, yearly rise in withdrawals, years (1-60) and runs (1,000/10,000/50,000/100,000/1,000,000; default 10,000). Shows the share of runs that ran out of money, median/10th/90th percentile ending balances, a cone chart (median line, middle 50% and middle 80% bands), and a past-crises table.
  - Method: historical bootstrap. Months are drawn independently, with replacement, from the portfolio's own full-calendar-month returns; withdrawals are monthly; balances are nominal. Needs at least 24 months of history. The method is stated under the chart.
  - Crises table: dot-com, 2008, 2020, 2022 (dates in `CRISES`). Shows lowest point vs the crisis start, SPY's lowest point, recovery date, and what the user's amount and withdrawals would have left from that start to the latest data. A crisis the portfolio has no data for says so and why.
  - Not built yet: a proxy map for young funds (e.g. VOO -> SPY), block bootstrap, inflation-adjusted balances.

## Commands
- Preview the site: `python3 -m http.server 8000`, then open http://localhost:8000
- Run every test: `node --test js/stats.test.js js/portfolios.test.js js/montecarlo.test.js worker/worker.test.js`
- Run the proxy locally: `(cd worker && npx wrangler dev)` — needs `worker/.dev.vars` containing `TIINGO_KEY=...`
- Deploy the proxy: `(cd worker && npx wrangler deploy)`

## Deployment (live; real SPY prices confirmed on the live site 2026-11-14)
- Site: https://mathiascornejo.github.io/Investment-Simulator/ — GitHub Pages serves the `main` branch root of the public repo `mathiascornejo/Investment-Simulator`. Pushing to `main` redeploys the site.
- Proxy: https://investment-simulator-proxy.investmentsimulator.workers.dev — changes under `worker/` only go live after `npx wrangler deploy`. The Tiingo key is the Worker secret `TIINGO_KEY`.
- Caching gotcha: GitHub Pages tells browsers to keep each file for 10 minutes. A browser that visited shortly before a deploy can mix the new page with old scripts and styles (seen 2026-11-14: unstyled form, dead button) until it refreshes. When checking a deploy, reload bypassing the cache before concluding it is broken.
- Git: this repo pushes over HTTPS using the `gh` login, and commits use the GitHub no-reply email (both set in the repo's local git config).

## Working rules
- Check this file first; do not re-research settled decisions.
- Smallest change that fully works; no features nobody asked for.
- New calculation logic (returns, drawdown, beta, Monte Carlo) gets a small test against a known value.
- After finishing a feature: update Decisions, Project map, and anything here that changed.
