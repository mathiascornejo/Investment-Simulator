# Investment Simulator — project briefing

Read this before starting any feature. Update it when a feature lands or a decision changes (keep it under ~80 lines).

## Goal
A web app that simulates portfolios and single assets against each other. Educational simulator only: no trading, no investment advice, show a disclaimer.

## Tabs
1. **Simulation / Backtester** — compare portfolios side by side: monthly/annual gain, CAGR, volatility, max drawdown, beta, Sharpe/Sortino, best/worst year, and the difference between portfolios. Growth chart + drawdown chart, with a time-range selector (1M, 1Y, 3Y, 5Y, 10Y, Max, custom).
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
| Visual style | DECIDED (2026-11-15) — "Quiet Paper" (picked from `design-options.html`): warm white, hairlines instead of boxes, light-weight system-font headings and figures, one ink colour, light mode only. Tokens at the top of `styles.css`. Green/red reserved for gain/loss data. Tabs sit in a full-height side menu (`#menu`) that slides out from the left and pushes the page right (floats over it under 60rem wide); its button is fixed in the screen's top-left corner, apart from the logo; segmented controls have a sliding pill. |
| Chart library | DECIDED — Apache ECharts 6.1.0, loaded by script tag from jsDelivr with an integrity hash: `https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js`, `sha256-tmslrrTfhOMxmdwhaUAU0zbSIsvZ3rDlp8FL1qoND9A=`. One library covers lines, bars, donuts and Monte Carlo bands. |
| Chart colours | DECIDED — series colours in fixed order, validated colour-blind safe on white: `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4` (first 5; the Backtester adds 5 unvalidated extras for up to 10 series). Colour follows the asset, never its rank. Text is never series-coloured; always show a legend and the stats table. |
| Non-US prices | DECIDED (2026-11-15) — Yahoo Finance's unofficial chart endpoint, called only from the Worker: used for tickers with a dot (`VOD.L`, `7203.T`) and as the fallback when Tiingo 404s. Dividend-adjusted, global, free, but unlicensed (its terms bar redistribution) and may break or block. Prices are in the listing currency (London in pence); the app does not convert currencies. Needs `npx wrangler deploy` to go live. |
| Form controls | DECIDED (2026-11-15) — "live feedback" (option 10 of 10 explored): fields are checked as you type (tick draws in, or the box shakes red with a reason), dropdowns are custom menus with a check mark and a one-line explanation of the chosen option. Not applied to the Backtester date boxes, chip box or ⌘K palette. |
| Section separation | DECIDED (2026-11-15) — option 4: each `.block` is a two-column grid; the title sits in a 9rem left rail in small caps with a blue bar, content on the right; stacks under 40rem. |
| Known risk | Tiingo's free and $30 plans are "internal use only"; a public site showing its prices is outside that licence. Revisit before sharing the URL. |

## Project map
Add one line per folder/file as it is created, so chats don't need to search.
- `index.html` — the whole page: top bar, three tab sections (`#backtester`, `#creator`, `#monte-carlo`), disclaimer.
- `styles.css` — design tokens and all styles.
- `js/app.js` — tab switching (URL hash), the logo-opened side menu; imports each tab's module.
- `js/portfolios.js` — saved-portfolio storage (`loadPortfolios`, `savePortfolios`, which fires a `portfolios-changed` event) and the engine `portfolioSeries(portfolio, prices)`, which returns a price-like series starting at 100 so every `stats.js` function works on a portfolio. Tested by `js/portfolios.test.js`.
- `js/creator.js` — the Portfolio creator tab: the form, validation, and the profile.
- `js/format.js` — shared number/date formatters, `show()` and the `element()` DOM helper. Use these; don't add new formatters per tab.
- `js/visuals.js` — `sparkline`, `glyph`/`assetClass` (asset-class icons; unknown tickers get a neutral icon), `countUp`, `gauge`, `slidingPill` (every `.segmented`, follows `aria-pressed`), `toast` (Undo).
- `js/glossary.js` — `term(label)`: dotted-underline words with a plain-English definition popover (top layer, never clipped). Static headings use `data-term`.
- `section-options.html` — 6 ways to make sections obvious (2026-11-15); the owner picked option 4 (label rail with blue marker), now in `.block` in `styles.css`. Reference only, not linked.
- `label-options.html` — 5 ways to label the growth-chart toolbar (time horizon, date range, step), 2026-11-15; reference only, not linked.
- `design-options.html` — the 20 looks / 30 elements explored on 2026-11-15; reference only, not linked from the site.
- `js/fields.js` — `liveField(input, {compact, clear})` (tick / shake + reason from the input's min, max, step; tickers get a format check) and `dropdown(select, {help})` (menu over a hidden native select, which stays the source of truth: `.value`, `change` and option changes still work). Used by Creator (rebalance, picker, holdings, band) and Monte Carlo. Styles: `.fx`, `.dd`, `.help` in `styles.css`.
- `js/montecarlo.js` — pure simulation maths, tested by `js/montecarlo.test.js`: `walk` (one balance through a list of monthly returns), `simulate` (optional `samples` = that many runs' yearly paths; typed arrays, year by year: 1M runs x 30 years ~10 s, ~60 MB), `percentile`, `crisisTest`, `historicalRun`, `CRISES`.
- `js/montecarlo-worker.js` — runs `simulate` in a Web Worker so big runs don't freeze the tab (the tab falls back to the main thread if workers fail).
- `js/montecarlo-tab.js` — the Monte Carlo tab: inputs, loading, cone chart, crises table.
- `js/backtester.js` — the Backtester tab: loads tickers and saved portfolios, holds the selected period, draws the three ECharts charts and the statistics table. It exports `frame()`, the shared ECharts options (axes, grid, tooltip): build every new chart on it so all charts look alike.
- `js/ticker-search.js` — `attachTickerSearch(input, {multi})`: suggestions drop down under a ticker text box as you type (↑↓ Enter Esc), modelled on King Crab House's search. suggestions come only from Yahoo search via the Worker (no local ticker list; `tickers.csv` was deleted 2026-11-15); any typed symbol is offered as "Use XYZ". Takes `extra()` entries (saved portfolios, listed first). Used on the Backtester list, the Monte Carlo ticker and the Creator holding rows. Styles: `.suggest` in `styles.css`.
- `js/data.js` — `PROXY_URL` and `fetchPrices(ticker)` -> `[{ date, adjClose }]`, oldest first. All price loading goes through this.
- `js/stats.js` — pure maths, tested by `js/stats.test.js` (`node --test js/stats.test.js`): `windowOf`, `totalReturn`, `cagr` (null under 1 year), `drawdowns`, `maxDrawdown`, `volatility`, `sharpe`, `sortino`, `beta`, `correlation`, `periodReturns` (yearly/monthly, flags partial periods), `summarize`. Uses daily returns, 252 trading days, 0% risk-free rate.
- `worker/worker.js` — Cloudflare Worker proxy: `GET /prices?ticker=SPY` (Tiingo; Yahoo for dotted tickers and Tiingo misses). `worker/wrangler.jsonc` is its config, `worker/worker.test.js` its tests.
- `.claude/launch.json` — local preview server (port 8000).

## Status of the tabs
- **Backtester — built (2026-11-14), tickers only.** Up to 10 tickers (default `SPY, BND`; SPY is always fetched as the beta benchmark). Period buttons 1M/1Y/3Y/5Y/10Y/Max (1Y is the default, set on every load). The head-to-head sits under the growth chart. Chart crosshair snaps to the data and shows a circle on each line plus From/To dates. Charts: growth of $10,000 (log toggle), returns by year or month, drawdowns. Stats table with a difference column when exactly two assets are compared. The comparison covers only the dates every asset has (no note says which asset limits the start).
  - Compared lines are chips (colour dot, asset icon, sparkline and change over the period, ✕ removes; comma or a suggestion adds one, Backspace removes the last). Saved portfolios are added by name like tickers (max 10 lines). On submit the chips plus any typed text are joined and saved names lifted out first, so names may contain spaces; the rest is split into tickers.
  - Also shows: per-asset headline figures that count up (head-to-head with winners marked when exactly two), underwater drawdowns with the deepest point pinned, best/worst badges on the return bars (one or two lines only), a monthly-returns heatmap (pick the line), a risk-vs-return scatter (total return instead of annualised under a year). Metric names explain themselves on hover.
  - Zoom/pan (2026-11-15): wheel over the growth or drawdown chart zooms around the pointer, drag pans; both move `state.start/end`, so the From/To boxes, table and all charts follow. An increment selector (1 day default / 1 week / 1 month) thins only the growth and drawdown lines (`resample`); statistics stay daily.
  - Not built yet: a table of the worst drawdowns, a real risk-free rate.
  - Gotcha: don't turn on ECharts `sampling` for lines; it drops different dates per series and the shared tooltip then omits assets.
- **Portfolio creator — built (2026-11-14), without sector/regional mix.** Name, up to 10 holdings with weights that must total 100%, rebalancing rule (never / month / quarter / year / drift band in percentage points). Saving checks every ticker has price data. The profile shows allocation bars and risk-and-return figures over the dates every holding has.
  - Profile: treemap of weights plus an icon list, correlation grid of the holdings (over the shared period), count-up figures. Delete is immediate with an Undo toast. An empty state shows until something is saved.
  - Not built yet: sector and regional mix (blocked on the data-source decision), asset names next to tickers, regular contributions or withdrawals, trading costs.
- **Monte Carlo — built (2026-11-14).** Pick a saved portfolio or one ticker; set starting amount, yearly withdrawal, yearly rise in withdrawals, yearly contribution (flat, added monthly or at the start of each year), years (1-60) and runs (1,000/10,000/50,000/100,000/1,000,000; default 10,000). Shows the share of runs that ran out of money, median/10th/90th percentile ending balances, a cone chart (median line, middle 50% and middle 80% bands), and a past-crises table.
  - Shows a survival dial (share of runs that lasted) and 30 sample runs that draw themselves before the bands fade in (no animation under reduced motion). The cone's y axis is capped just above the 90th percentile so stray sample runs don't squash it.
  - Starting amount and withdrawal are capped at $1 trillion (bigger could overflow over 60 years). Money uses `moneyFit` (whole dollars under $1B, then $1.2B/$3.4T, then $1.2E18) so huge results never overflow tiles, axis or table. Form fields sit on shared label/box/hint rows (CSS subgrid) so boxes stay level whatever wraps.
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
- Commit and push every change immediately after making it (`git add -A`, commit, `git push` to `main`); never leave work uncommitted or unpushed.
- Check this file first; do not re-research settled decisions.
- Smallest change that fully works; no features nobody asked for.
- New calculation logic (returns, drawdown, beta, Monte Carlo) gets a small test against a known value.
- After finishing a feature: update Decisions, Project map, and anything here that changed.
