# Improvement ideas (rated 2026-11-21)

100 function ideas (F001-F100) and 100 design ideas (D001-D100) were written by 8 agents and rated 1 to 10 by a separate agent on functionality, feasibility, appearance and overall value. Ideas with an overall score of 5 or more that break no settled decision and repeat no other idea are built.

Built: 98 · skipped for score: 89 · skipped as blocked: 0 · skipped as duplicate or existing: 13

## Function ideas

**F001 · Table of the worst drawdowns, with recovery times** — overall 7 · function 7 · feasibility 8 · look 5 · to build  
Add a table under the drawdown chart listing each line's five deepest falls: the date of the high, the date of the low, how deep it went, months from high to low, the date it got back to the old high (or 'not yet'), and total time below the high. A new pure function `drawdownEpisodes(points)` in stats.js splits the daily total-return drawdown series into episodes (high, then new high), so the numbers match the existing chart. A line under the table also shows 'share of days spent below a previous high'. CLAUDE.md already lists this as not built yet.  
*Owner-listed gap; a standard table built from one cheap, testable function.*

**F002 · Use the real T-bill rate in Sharpe and Sortino** — overall 6 · function 6 · feasibility 5 · look 2 · to build  
Replace the 0% risk-free shortcut in stats.js: subtract each day's 3-month US Treasury bill return (FRED series DTB3, yearly yield turned into a daily rate as (1 + y)^(1/252) - 1) from every daily return before working out Sharpe and Sortino. Add a 'Risk-free rate (average)' row to the Statistics table so users can see what was subtracted, and update the glossary text that currently says 0%. Dates with no published rate reuse the previous day's rate.  
*Fixes overstated Sharpe and Sortino in high-rate years; build after F093 so real mode deflates the rate too.*

**F003 · Pick the benchmark and draw it as a dashed line** — overall 6 · function 7 · feasibility 7 · look 5 · to build  
Add a 'Benchmark' box to the Backtester form (SPY by default, any ticker or saved portfolio allowed, using the existing ticker search). Beta and every benchmark-relative figure use it, the table label and glossary text change from 'vs SPY' to the chosen name, and a 'Show benchmark' check box draws it as a thin grey dashed line on the growth and drawdown charts without using one of the 10 series colours. The benchmark is still fetched once and cached like any ticker.  
*The finance rules imply a choosable benchmark, and the dashed line adds context cheaply.*

**F004 · Alpha, R-squared, tracking error and information ratio** — overall 5 · function 6 · feasibility 8 · look 2 · to build  
Add four benchmark-relative rows to the Statistics table, all from daily total returns on the dates both series share. Jensen's alpha (annualised: (mean daily excess return - beta x mean daily benchmark excess return) x 252), R-squared (correlation squared: how much of the line's moves the benchmark explains), tracking error (standard deviation of daily return differences x sqrt 252) and information ratio (annualised mean daily difference / tracking error). The existing `paired()` helper in stats.js already holds the sums needed; each gets a glossary definition.  
*Standard relative figures from the existing paired() sums; pair with table grouping (D038).*

**F005 · Upside and downside capture against the benchmark** — overall 4 · function 5 · feasibility 8 · look 2 · skipped: score  
Add 'Upside capture' and 'Downside capture' rows to the Statistics table, using the Morningstar method on calendar-month returns: in the months the benchmark rose, the line's compounded return divided by the benchmark's compounded return (both annualised), and the same for months it fell. Under 100% downside capture means it lost less than the benchmark in bad months. Needs at least 12 full months, otherwise shows a dash; built on the existing `periodReturns(points, 7)`.  
*Niche for this audience and adds more rows to an already long table.*

**F006 · Rolling returns chart** — overall 7 · function 8 · feasibility 7 · look 6 · to build  
Add a 'Rolling Returns' block with a 1Y / 3Y / 5Y / 10Y pick: for each trading day, the annualised return over the previous N years, worked out from daily total-return prices (the start is the last trading day on or before the date N years earlier). One line per compared asset, built on `frame()`, plus a small row under it with the lowest, median and highest rolling figure. It shows that a single start-to-end CAGR hides how much results depended on when you started.  
*Among the most instructive backtest charts, and missing today.*

**F007 · Rolling volatility, beta and correlation chart** — overall 4 · function 6 · feasibility 7 · look 5 · skipped: score  
Add a 'Rolling Risk' block with a pick of 12-month volatility, 12-month beta against the benchmark, or 12-month correlation with the benchmark, each worked out from the daily returns in a moving 252-trading-day window. It shows that risk is not fixed: correlations jump towards 1 in crashes, and a fund's beta drifts. Uses one line per asset and the shared chart frame.  
*Interesting, but one more chart in a long tab for a narrower lesson.*

**F008 · Calmar ratio, Ulcer index and Martin ratio** — overall 4 · function 4 · feasibility 8 · look 2 · skipped: score  
Add three drawdown-based risk rows to the Statistics table. Calmar ratio = annualised return / size of the maximum drawdown over the chosen period; Ulcer index = square root of the average squared daily drawdown (in %), which counts how deep and how long the falls lasted rather than only the worst day; Martin ratio = annualised return / Ulcer index. They reuse the existing `drawdowns()` and `cagr()` and show a dash under a year, like CAGR does.  
*Niche ratios that add rows with little insight beyond maximum drawdown.*

**F009 · Spread of monthly returns: histogram, skew and fat tails** — overall 5 · function 6 · feasibility 7 · look 5 · to build  
Add a 'How Returns Are Spread' block: a bar histogram of the chosen line's monthly returns (1-point buckets) with a normal curve of the same mean and standard deviation drawn over it. Under it show % of months that gained, best and worst month, skewness and excess kurtosis (sample-adjusted). This teaches that real returns have fatter tails than the bell curve a volatility figure assumes.  
*Teaches fat tails, which helps users read the Monte Carlo results.*

**F010 · Value at risk and expected shortfall rows** — overall 5 · function 6 · feasibility 8 · look 2 · to build  
Add 'Monthly value at risk (95%)' and 'Expected shortfall (95%)' rows to the Statistics table, worked out the historical way: VaR is the 5th percentile of the window's calendar-month returns, and expected shortfall is the average of the months at or below it. A plain-words tooltip says 'in 1 month out of 20, it lost at least this much'. Shows a dash with fewer than 24 full months, since a percentile of a handful of months means little.  
*A plain-words risk figure that is cheap to get from monthly returns.*

**F011 · Is the gap between two lines real or luck?** — overall 5 · function 5 · feasibility 8 · look 2 · to build  
When exactly two lines are compared, add a note under the head-to-head giving a 95% confidence range for the yearly return gap: take the difference of their monthly returns, then 12 x (mean +/- 1.96 x standard deviation / sqrt(months)). If the range crosses zero, say in plain words that the history is too short to tell whether one truly beats the other. The note names the method (paired t-test on monthly returns) and that it assumes months are independent.  
*A short, honest note against over-reading a gap; cheap.*

**F012 · How often holding for N years lost money** — overall 6 · function 7 · feasibility 7 · look 4 · to build  
Add a 'Holding Periods' table for each line over its full history: for holding periods of 1, 3, 5, 10, 15 and 20 years, the share of all monthly start dates that ended with a loss, plus the worst, median and best annualised return for that holding period. Periods longer than the history show a dash. A note says the windows overlap, so they are not independent tries.  
*Answers a top beginner question with simple maths.*

**F013 · Average return by calendar month** — overall 3 · function 2 · feasibility 8 · look 4 · skipped: score  
Add a 'Seasonality' view next to the monthly heatmap: twelve bars (Jan to Dec) with each month's average return over the window and the share of years that month gained, for the line picked in the heatmap. Each bar shows how many years it is based on, and a hint says that with few years these averages are mostly noise. Reuses `periodReturns(points, 7)`.  
*Seasonal averages are mostly noise and invite bad conclusions.*

**F014 · Crisis buttons that jump to past crashes** — overall 6 · function 7 · feasibility 6 · look 4 · to build  
Add 'Dot-com', '2008', 'COVID' and '2022' buttons beside the time-horizon presets that set From/To to the S&P 500 peak-to-trough dates already in `CRISES` (montecarlo.js). If any compared line has no data that far back, the button still works for the others but a message names the line and its first date, as the finance rules require (never silently cut the period). The statistics then read as 'how each line did through that crash'.  
*Reuses CRISES for a strong lesson; lines without data must be named, never silently cut.*

**F015 · Data notes: start dates, currency and dividends per line** — overall 6 · function 6 · feasibility 8 · look 3 · to build  
Add a short 'About the data' list under the Statistics table: each line's first available date, which line limits the comparison's start (CLAUDE.md notes this is missing today), its price currency (from the ticker suffix, e.g. London in pence, .PS in pesos), and a warning for .PS tickers that prices exclude dividends and splits. It stops users comparing pesos with dollars, or price return with total return, without knowing.  
*Closes two honesty gaps: the hidden start-limiting asset and raw .PS prices.*

**F016 · Lump sum versus investing a bit each month** — overall 4 · function 6 · feasibility 6 · look 4 · skipped: score  
Add a 'Lump Sum vs Monthly' block: put $10,000 in on day one, or spread it over 12 monthly payments with the rest held at 0% (the existing CASH rule), and compare the end value after the chosen period. Then repeat for every monthly start date in the line's history and show the share of start dates where the lump sum ended ahead, plus the money-weighted return (XIRR) of the monthly plan. It teaches why spreading in usually loses in rising markets but cuts regret.  
*A common question, but XIRR plus a new block is a lot to add to the Backtester.*

**F017 · Relative strength chart: one line divided by another** — overall 4 · function 4 · feasibility 8 · look 4 · skipped: score  
Add a 'Relative Performance' block plotting each line's value divided by the benchmark's (or, with two lines, the first divided by the second), both set to 1 at the start of the window. Rising means the line is ahead, falling means it is lagging, which is far easier to read than two growth lines that cross. Built on `frame()`, shares the zoom and period with the growth chart.  
*The log-scale growth chart already shows most of this.*

**F018 · What rebalancing did for a saved portfolio** — overall 4 · function 5 · feasibility 6 · look 2 · skipped: score  
When a saved portfolio with a rebalancing rule is compared, add a row to the Statistics table with the number of rebalances in the window (portfolioSeries already returns this count but the Backtester throws it away) and an 'Add buy-and-hold version' button. That adds a second line with the same holdings and rebalance 'none', so users see the effect on return, volatility and drawdown side by side.  
*An unsaved buy-and-hold line fits the chip model poorly; F027 covers the comparison better.*

**F019 · Which holdings drove a portfolio's return and risk** — overall 4 · function 6 · feasibility 5 · look 3 · skipped: score  
For a portfolio line, add a breakdown table: each holding's contribution to the total return (sum over days of the holding's weight at the start of the day x its daily return) and its share of the portfolio's volatility (weight x covariance with the portfolio / portfolio variance, from daily returns). A 10% holding can turn out to carry 40% of the risk. portfolioSeries would need to also return each holding's daily weight.  
*Useful maths, but it belongs in the Creator profile (F026, F046) more than in a comparison.*

**F020 · Year-by-year table against the benchmark** — overall 4 · function 4 · feasibility 8 · look 3 · skipped: score  
Add a table toggle to the 'Returns by Period' block: one row per calendar year with each line's return, the benchmark's return and each line's gap to it, partial years marked. A final row says 'beat the benchmark in X of Y full years'. The bar chart shows shape; this gives the exact numbers and the hit rate.  
*Mostly repeats the heatmap's year column and the bar chart.*

**F021 · Correlation grid between the compared lines** — overall 6 · function 6 · feasibility 9 · look 5 · to build  
Add a 'How They Move Together' grid with the Pearson correlation of every pair of compared lines over the chosen period, coloured from -1 to 1, using the existing `correlation()` in stats.js. The Creator has this for holdings, but the Backtester does not, so users comparing, say, SPY, TLT and GLD can't see the diversification today. Shown only with 2 or more lines.  
*Reuses correlation() and the Creator grid to show diversification while comparing.*

**F022 · Trailing returns table and a YTD button** — overall 4 · function 6 · feasibility 7 · look 3 · skipped: score  
Add a factsheet-style 'Trailing Returns' table: 1 month, 3 months, 6 months, year to date, 1, 3, 5, 10 and 15 years, and since the common start, ending on the To date, with periods over a year annualised and labelled so. Add a 'YTD' button to both time-horizon preset groups. Periods longer than the data show a dash instead of a shorter number.  
*The period presets already give most trailing returns.*

**F023 · Measure from daily or monthly returns** — overall 4 · function 4 · feasibility 6 · look 2 · skipped: score  
Add a 'Measured from: Daily / Monthly' switch to the Statistics block. Monthly uses calendar-month total returns, annualising volatility by sqrt 12 and Sharpe and Sortino by 12, which is how most fund factsheets and Portfolio Visualizer do it. A hint explains why it matters: markets in different time zones (VOD.L vs SPY) close at different times, so daily correlation and beta understate how closely they move, and monthly fixes that.  
*A sound point about time zones, but a technical switch few users need.*

**F024 · Show the volatility drag** — overall 4 · function 5 · feasibility 8 · look 2 · skipped: score  
Add 'Average yearly return (arithmetic)' and 'Volatility drag' rows to the Statistics table: the plain average of daily returns x 252, and its gap to the compound annual return, which is roughly volatility squared / 2. A glossary note explains why a fund averaging +10% a year with big swings grows slower than a steady +10%. Shows a dash under a year, like CAGR.  
*A good lesson that fits better as glossary text than as two more rows.*

**F025 · Returns from any start year to any end year** — overall 4 · function 5 · feasibility 6 · look 5 · skipped: score  
Add a 'Start and End Year' triangle for the line picked in the heatmap: rows are the year you started, columns the year you stopped, and each cell is the annualised return from the end of the year before the start to the end of the stop year, using full calendar years only. Cells are shaded green or red like the heatmap. It shows at a glance how much the result depends on when you got in and out.  
*Striking, but a large dense table that overlaps the holding-period idea.*

**F026 · Share of risk next to share of money for each holding** — overall 6 · function 7 · feasibility 7 · look 5 · to build  
In the Allocation block, give each holding a second bar showing how much of the portfolio's ups and downs it causes, beside its weight. Work it out from the covariance of daily total-return prices over the shared period: risk share = w\_i x (Σw)\_i / (wᵀΣw), which always adds up to 100% (the Euler risk contribution). A plain line under it explains the lesson, for example that in a 60/40 stock/bond mix the stocks cause far more than 60% of the swings. Add a riskShares(weights, dailyReturns) function with a known-value test.  
*Risk share beside weight is a key lesson; overlaps F019's risk half and suits the Creator better.*

**F027 · Compare all five rebalancing rules on the same holdings** — overall 6 · function 7 · feasibility 8 · look 3 · to build  
Add a 'Rebalancing rules compared' table to the profile. It runs portfolioSeries once per rule (never, monthly, quarterly, yearly, drift band at the user's limit) over the same dates and shows annualised return, volatility, maximum drawdown and how many times each rule traded. The `rebalances` count the engine already returns is never shown today. The saved rule's row is marked, and a note says the table leaves out trading costs and taxes unless a trading cost is set.  
*Uses the existing engine and its unused rebalance count to answer a real question.*

**F028 · Trading cost per rebalance and yearly turnover** — overall 5 · function 5 · feasibility 6 · look 2 · to build  
Add a 'Trading cost, % of each trade' field (for example 0.10%) under Rebalancing and save it on the portfolio. At each rebalance portfolioSeries adds up the money bought and sold, Σ|target value − current value|, and takes cost x that amount from the portfolio before resetting to target. It also returns one-way turnover per year (half the traded amount divided by portfolio value, averaged per year). The profile then says, for example, 'Traded about 7% of the portfolio a year; costs took 0.01% a year', and the Backtester and Monte Carlo tabs pick up the cost because they use the same engine.  
*Owner-listed gap; the engine change needs tests and reaches every tab.*

**F029 · Yearly account fee and what it costs over time** — overall 4 · function 5 · feasibility 6 · look 2 · skipped: score  
Add a 'Yearly fee, % of balance' field (an advisory or platform fee) saved on the portfolio. portfolioSeries multiplies the value by (1 − fee)^(days since last price / 365) at each date, so the fee grows with time the same way the real thing does. The profile shows the ending value of $10,000 with and without the fee, and the gap in dollars. A hint says fund expense ratios are already inside the adjusted prices and must not be entered here, or they would be counted twice.  
*A fee saved into portfolios silently changes backtests; F066 teaches fee drag more clearly.*

**F030 · Chart of how the weights drifted over time** — overall 4 · function 6 · feasibility 7 · look 6 · skipped: score  
Under the treemap, add a stacked area chart (0 to 100%) of each holding's actual weight on each date, built from units x price / portfolio value inside portfolioSeries (thinned to month-ends). With 'Never' the user sees the winners take over the portfolio. With a calendar rule or band they see the saw-tooth of drift and reset. Holding colours follow the existing COLORS order, and the chart is built on frame().  
*A nice picture of drift, but one more chart in the profile.*

**F031 · Regular deposits or withdrawals, with your return versus the fund's** — overall 5 · function 6 · feasibility 5 · look 3 · to build  
Add profile-only inputs for a starting amount and a monthly deposit (or withdrawal, as a negative number), paid at the first trading day of each month. Show the ending balance, total paid in and the gain. Show two returns side by side: the time-weighted return (the existing annualised return, which ignores when money went in) and the money-weighted return (XIRR, the yearly rate that makes every dated deposit grow to the ending balance, solved by bisection). This teaches why an investor's own return can differ from the fund's. Add xirr(flows) with a known-value test.  
*Owner-listed gap with a valuable time- vs money-weighted lesson, though it adds inputs to the profile.*

**F032 · Show asset names next to tickers** — overall 6 · function 6 · feasibility 7 · look 5 · to build  
When a holding is picked from the ticker suggestions, keep the name the search already returns (for example 'Vanguard Total Stock Market ETF') on the row and save it as holding.name. For a ticker typed by hand, look it up once through the existing /search endpoint and keep the exact match. The allocation list, treemap tooltip and correlation table then show the name beside the ticker. CLAUDE.md lists this as not built yet.  
*Owner-listed gap; names make the lists and profile much easier to read.*

**F033 · Weighting buttons: equal, inverse volatility, equal risk** — overall 4 · function 5 · feasibility 6 · look 2 · skipped: score  
Under the holdings, add three buttons that fill the weight boxes for the tickers entered. 'Equal' gives each 1/n. 'Inverse volatility' gives weights in proportion to 1/σ, with σ measured from daily returns over the shared history. 'Equal risk' solves for weights where every holding causes the same share of risk (risk parity), by simple repeated adjustment until the risk shares match. Each button has a one-line explanation. Results are rounded to 0.1% with any leftover put on the largest weight, so the total is exactly 100.  
*Equal weight is handy; inverse volatility and risk parity are niche and need prices before saving.*

**F034 · Map of possible mixes (efficient frontier) for these holdings** — overall 4 · function 6 · feasibility 6 · look 6 · skipped: score  
For 2 to 8 holdings, add an optional scatter that tries 5,000 random long-only weight sets (normalised random exponentials, so every mix is equally likely). For each it plots the annualised volatility and mean return, from the mean vector and covariance of daily returns over the shared period. The user's own mix is marked, and so are the lowest-volatility mix and the best Sharpe-ratio mix (0% risk-free rate, as in stats.js), with a 'Use these weights' button. A plain warning says the map is drawn from past returns and that weights tuned to the past often fail later.  
*Eye-catching, but it invites fitting weights to the past and adds a new module.*

**F035 · Holding-period table: worst, typical and best results** — overall 3 · function 6 · feasibility 7 · look 3 · skipped: repeats F012  
Add an 'If you held it for…' table to the profile with rows for 1, 3, 5, 10 and 15 years. From the portfolio's daily total-return series, take every window of that length starting at each month-end. Show the worst, median and best annualised return and the share of windows that ended below where they started. A note says the windows overlap, so they are not independent tries. Rows with no full window say so instead of hiding.  
*Same table as F012, which already works on saved portfolios in the Backtester.*

**F036 · Diversification check: real number of bets and near-duplicates** — overall 5 · function 5 · feasibility 8 · look 3 · to build  
Add three figures under the correlation table. 'Effective number of holdings' is 1 / Σw² by weight, so ten holdings where one is 90% count as about 1.2. The 'diversification ratio' is the weighted average of each holding's volatility divided by the portfolio's volatility; 1 means mixing gave no benefit. Any pair whose daily returns correlate above 0.95 (such as SPY and VOO) is flagged as moving almost identically.  
*Cheap figures that flag fake diversification such as SPY plus VOO.*

**F037 · Save as a copy, and warn before unsaved edits are lost** — overall 5 · function 6 · feasibility 8 · look 2 · to build  
Add a 'Save as copy' button that saves the form under a free name such as 'Growth (copy)', so a user can test a variation without overwriting the original. Mark the form as changed on any edit. If the user switches the Portfolio picker or loads another portfolio with unsaved changes, the status line asks 'Discard your changes?' with Discard and Keep editing buttons. Today those edits disappear without a word.  
*Stops edits vanishing without warning; small.*

**F038 · Share a portfolio as a link** — overall 4 · function 5 · feasibility 7 · look 2 · skipped: score  
Add a 'Copy link' button that puts the portfolio (name, holdings, rule, band) into the page address after the # as base64url JSON, for example #creator&p=…. Nothing after the # is sent to any server. Opening the link fills the form but does not save until the user presses Save, and the data is checked with the same rules as readForm because it comes from outside. This gives a way to move a portfolio between browsers with no accounts or server.  
*Worthwhile, but F076 covers sharing more fully; build one link format, not two.*

**F039 · Back up and restore portfolios as a file** — overall 6 · function 6 · feasibility 8 · look 2 · to build  
Add 'Download my portfolios' (a JSON file made with a Blob) and 'Load from file' (a file input) to the Creator. Loading checks every portfolio's shape and tickers, adds them to the saved list, and renames any name clash to 'Name (2)' rather than overwriting. This protects saved work when browser storage is cleared and lets portfolios move between devices without a server.  
*Protects work that lives only in one browser; small and self-contained.*

**F040 · Faster weight entry: paste a list, fill the rest, scale to 100** — overall 4 · function 5 · feasibility 7 · look 2 · skipped: score  
Add a 'Paste a list' box that accepts text like 'VTI 60, VXUS 30, BND 10' or two columns copied from a spreadsheet, and turns it into holding rows. Next to the total, add 'Fill the rest', which sets the last edited holding to whatever brings the total to 100%. Add 'Scale to 100%', which multiplies every weight by the same factor (rounded to 0.01%, leftover on the largest). These save the user from doing sums by hand.  
*'Fill the rest' alone would help; three new controls is clutter.*

**F041 · Start from a well-known model portfolio** — overall 6 · function 7 · feasibility 8 · look 4 · to build  
Add a 'Start from' menu that fills the form with documented textbook mixes, each with one line on the idea behind it. Examples: 60/40 (SPY/AGG); a three-fund mix (VTI/VXUS/BND); Harry Browne's Permanent Portfolio (25% each stocks, long Treasuries, gold, short Treasuries); the Golden Butterfly; and a public approximation of the All Weather mix. Each says which holding has the shortest history (for example BIL from 2007) and that these are examples to study, not advice.  
*Educational starting points that suit the site; keep the not-advice wording.*

**F042 · Relative drift band (the 5/25 rule)** — overall 3 · function 3 · feasibility 8 · look 1 · skipped: score  
Extend the drift-band option with a second limit: rebalance when a holding is more than X points from target or more than Y% of its own target, whichever comes first. With the common 5/25 rule, a 10% holding rebalances at 7.5% or 12.5%, which an absolute 5-point band would never catch. portfolioSeries gets a relBand setting with a test, and the band help text explains why small holdings need the relative limit.  
*A niche refinement few users will notice.*

**F043 · Choose the benchmark the profile is measured against** — overall 4 · function 4 · feasibility 7 · look 2 · skipped: score  
Add a 'Measured against' box in Risk and Return, using the ticker search plus saved portfolios. It defaults to SPY as the finance rules require. Beta and every relative figure use the chosen benchmark, and the choice is saved on the portfolio as benchmark. A bond-heavy mix can then be judged against AGG or a 60/40 portfolio instead of only the S&P 500.  
*Same idea as F003; saving a benchmark per portfolio adds state for little gain.*

**F044 · Upside and downside capture, tracking error, information ratio** — overall 3 · function 5 · feasibility 8 · look 2 · skipped: repeats F004  
Add these figures to Risk and Return, with glossary definitions. Compute them from full calendar months against the benchmark. Upside capture is the portfolio's geometric average return in up months divided by the benchmark's, and downside capture does the same for down months. Tracking error is the annualised standard deviation of the daily return difference. The information ratio is annualised excess return divided by tracking error. Also show R² (correlation squared) so users see how much of the movement the benchmark explains. Each function gets a known-value test.  
*Same figures as F004 and F005, which already apply to saved portfolios in the Backtester.*

**F045 · Fuller drawdown and risk figures in the profile** — overall 4 · function 5 · feasibility 7 · look 3 · skipped: score  
Show figures the profile leaves out today. Sortino is already computed by summarize but never shown. Add total return, the Calmar ratio (annualised return / |maximum drawdown|) and the Ulcer index (square root of the mean squared daily percent drawdown, which rewards shallow, short dips). Add the longest time under water, in days from a peak until it was regained. Under maximum drawdown, give its peak, low and recovery dates, or 'not yet recovered'.  
*Partly repeats F001 and F008; showing Sortino and the drawdown dates is the useful part.*

**F046 · Where the gain came from: dollars added by each holding** — overall 4 · function 6 · feasibility 6 · look 4 · skipped: score  
Add a 'What each holding added' bar list to the profile. On $10,000, it shows how many dollars each holding gained or lost over the measured period, found by adding up units x price change for each holding every day through the engine, across every rebalance. The parts add up exactly to the portfolio's gain. It shows, for example, that bonds added little money but cut the worst fall, or that a 10% holding drove most of the result.  
*Intuitive, but overlaps F019 and needs engine changes for one more list.*

**F047 · Holdings scorecard: each holding beside the whole portfolio** — overall 4 · function 6 · feasibility 8 · look 4 · skipped: score  
Add a table to the profile with one row per holding and a last row for the portfolio. Columns are weight, annualised return, volatility, maximum drawdown, worst full year and beta, all over the same shared dates. It lets users see a mix whose worst fall is milder than most of its parts, which a single set of figures can't show. Reuse summarize() for every row so figures match the rest of the site.  
*Cheap, but the Backtester can already compare a portfolio with its holdings.*

**F048 · Rolling correlation chart for a pair of holdings** — overall 3 · function 4 · feasibility 7 · look 4 · skipped: score  
In 'How the holdings move together', add a pair picker (default: the two largest holdings) and a line chart of their rolling 1-year (252 trading days) correlation of daily returns. It shows that correlation shifts over time; for example, US stocks and Treasuries moved in the same direction through 2022. A note says that for markets closing at different hours (Tokyo vs New York), daily figures understate the link, so weekly returns are used for such pairs. Add rollingCorrelation with a test.  
*A narrow pair view; F007 covers rolling correlation more generally.*

**F049 · Stand-in ticker for funds too young for the history** — overall 4 · function 5 · feasibility 4 · look 2 · skipped: score  
Give each holding row an optional 'Before it existed, use' box, for example VOO using SPY before September 2010, saved as holding.proxy. Before the holding's first date, its series is built from the stand-in's daily returns, chained to the holding's first price. The measured-period line then states it plainly, for example 'VOO before 9 Sep 2010 is SPY'. This follows the rule never to cut history short silently, and gives the Backtester and Monte Carlo crisis tests longer history once they also fetch the proxy prices. Add a splice test.  
*Touches six files and changes every statistic; F062's fixed map meets the documented need.*

**F050 · Pick the period the profile measures** — overall 3 · function 4 · feasibility 7 · look 2 · skipped: score  
Add a segmented control (1Y, 3Y, 5Y, 10Y, Max, plus From/To dates) above Risk and Return. Every profile figure, the correlation grid and the drift chart are recomputed over that window with windowOf. Max stays the default. Users learn how much the figures depend on the dates chosen, for example how a 10-year Sharpe ratio changes when 2008 is in or out.  
*The Backtester already measures saved portfolios over any period.*

**F051 · Draw blocks of real consecutive months** — overall 7 · function 7 · feasibility 8 · look 2 · to build  
Add a "How months are drawn" dropdown to the Monte Carlo form: "One month at a time" (today's method) or "Blocks of consecutive months". Blocks use the stationary bootstrap (Politis and Romano): each month a run has a 1-in-12 chance of jumping to a new random month, otherwise it takes the next real month (wrapping round at the end), so bad months stay bunched together the way they were in 2008. simulate() gets a blockLength option, the method line under the chart names the method and the average block length, and a test with a fixed random source checks that months inside a block come out in their real order.  
*Owner-listed gap flagged in the code; fixes the known optimism of independent monthly draws.*

**F052 · Add a bell-curve and a fat-tailed method to compare** — overall 5 · function 5 · feasibility 7 · look 2 · to build  
Add two more choices to the method dropdown: "Normal (bell curve)" and "Fat-tailed (Student-t, 4 degrees of freedom)". Both draw monthly log returns with the same mean and standard deviation as the portfolio's history (Box-Muller for the normal; the t draw is scaled by the square root of (v-2)/v so its spread matches). Running the same inputs under each method shows how much a bell curve understates crash months and failure rates. The method line under the chart states which method and which mean and spread were used.  
*Cheap once the method dropdown exists; shows how a bell curve understates crashes.*

**F053 · Test every real starting month in history** — overall 6 · function 6 · feasibility 7 · look 4 · to build  
Add an "Every real start date" block under the cone that runs walk() on the actual sequence of monthly returns beginning at each month that has the full horizon ahead of it (the Trinity-study method). It shows "X of Y start months ran out", the worst start month and what it left, and a small line of ending balance by start month. It says plainly that overlapping periods are not independent and how few there are (SPY from 1993 gives only about 45 thirty-year periods), and hides itself with a reason when history is shorter than the horizon.  
*A Trinity-style check that complements the bootstrap, with honest caveats.*

**F054 · Guardrails withdrawal rule (Guyton-Klinger)** — overall 5 · function 6 · feasibility 6 · look 3 · to build  
Add a "Withdrawal rule" dropdown with "Fixed amount rising each year" (today) and "Guardrails". Each year, if the withdrawal is more than 120% of the starting withdrawal rate as a share of the current balance, it is cut 10%; if it is under 80%, it is raised 10%; and the yearly rise is skipped after a year the portfolio lost money. simulate() keeps each run's current withdrawal in a Float64Array, and the results add 10th/median/90th percentile lines of yearly spending so the user sees the trade-off: fewer failures, but less to spend in bad runs. A test checks a hand-worked three-year case.  
*A popular, realistic withdrawal rule; moderate maths plus a spending chart.*

**F055 · Spend a percentage of the balance, with ceiling and floor** — overall 4 · function 5 · feasibility 6 · look 3 · skipped: score  
Add two more withdrawal rules: "Fixed percentage of the balance" (never runs out, but income swings) and "Percentage with ceiling and floor" (Vanguard's dynamic spending: spend a set % of last year-end balance, but spending may rise at most 5% and fall at most 2.5% from last year). The percentage replaces the dollar withdrawal box when chosen, and the yearly spending percentile lines show how much income varies. The caps are meant in real terms, so the tab notes this when the Inflation-adjusted switch is off.  
*A second rule set on a busy form; F054 covers the main lesson.*

**F056 · Failure rate at every withdrawal rate, from one run** — overall 5 · function 7 · feasibility 6 · look 5 · to build  
For each run, also work out its "perfect withdrawal rate": the starting yearly withdrawal that would leave exactly $0 at the end, which is the starting amount divided by the sum of each month's withdrawal share over the growth so far. Sorting these gives the failure rate at every withdrawal level at once, drawn as a curve of "share of runs that run out" against "starting withdrawal as % of the starting amount" (1% to 8%), with the user's own rate marked and the 5% and 10% failure points read out in words. It is exact only with no contributions, so it is hidden with a note when contributions are above 0; a test checks that flat 0% months give the starting amount divided by the years.  
*An insightful curve from one simulation, though exact only without contributions.*

**F057 · Repeatable runs with a seed number** — overall 4 · function 5 · feasibility 8 · look 1 · skipped: score  
Add a small "Seed" field (filled with a random number, with a "New seed" button) and pass it to simulate(), which builds a mulberry32 random generator from it; a number can cross into the Web Worker where a function cannot. The same seed and inputs always give the same result, and keeping the seed while changing one input removes random noise from the comparison. The method line shows the seed used.  
*A visible seed box is jargon; paired comparisons can seed internally.*

**F058 · Show the margin of error on the failure rate** — overall 4 · function 4 · feasibility 9 · look 1 · skipped: score  
Under the failure figure, show a 95% range using the Wilson score interval, for example "10% (between 8.3% and 12.0% at 1,000 runs)". It teaches that more runs only shrink random noise; they do not make the history-based model itself more right, and the line says so. A test checks the interval against a known value.  
*Accurate, but the range is tiny at default run counts; a line in the runs help would do.*

**F059 · Show when the failing runs ran out** — overall 5 · function 5 · feasibility 8 · look 3 · to build  
simulate() already loops year by year; have it also count how many runs hit zero in each year. The results add a line of "share of runs out of money by year N" and a sentence such as "Half of the failures happened after year 22". This teaches that most failures come late, after years of withdrawals during an early slump.  
*A cheap count in the existing loop that teaches failures come late.*

**F060 · Set an amount to leave at the end** — overall 4 · function 5 · feasibility 9 · look 2 · skipped: score  
Add an optional "Amount to leave at the end ($)" field. From the sorted final balances, the results show the share of runs that ended above that goal and the share that ended with more than the starting amount, in the same dollars as the rest of the tab. Failure keeps its current meaning (hitting zero); these are extra figures beside it.  
*A useful goal figure, but another input on a busy form.*

**F061 · Start every run with a real crash** — overall 6 · function 7 · feasibility 6 · look 3 · to build  
Add a "Begin with" dropdown: "A random month" (today) or one of the CRISES. With a crisis chosen, every run first replays the portfolio's real monthly returns from that crisis's start month to its low point (for example October 2007 to March 2009), then bootstraps the rest. The result sits beside the normal failure rate run with the same seed, such as "Starting in a 2008-style crash: 31% ran out, against 9% normally", which shows sequence-of-returns risk directly; when the portfolio has no data for that crisis it says so.  
*Shows sequence-of-returns risk directly; run both on the same random draws.*

**F062 · Stand-in history for young funds in crisis tests** — overall 6 · function 6 · feasibility 6 · look 2 · to build  
Add a small proxy map (VOO and IVV to SPY then VFINX, VTI to VTSMX, BND to VBMFX, VXUS to VGTSX, QQQM to QQQ) and a splice function that uses the stand-in's daily total-return prices before the fund's first date, joined at that date. The crises table then measures VOO through 2008 and labels the cell "uses SPY before 9 Sep 2010"; it never swaps silently. A test checks the join.  
*Owner-listed gap named in the finance rules; the labelled splice keeps it honest.*

**F063 · Add more past crises to the stress test** — overall 5 · function 5 · feasibility 9 · look 2 · to build  
Extend CRISES with more S&P 500 peak-to-trough windows by closing price: 1987 crash (25 Aug to 4 Dec 1987), 1990 (16 Jul to 11 Oct 1990), 2011 (29 Apr to 3 Oct 2011), late 2018 (20 Sep to 24 Dec 2018) and 2025 tariff drop (19 Feb to 8 Apr 2025). The table logic already says "no data" with a reason when the portfolio's history starts too late. CLAUDE.md's crisis list in the finance rules is updated to match, which the owner should confirm.  
*A cheap data change; the owner should confirm the finance-rule list, and 1987/1990 will show no data.*

**F064 · Click a crisis to replay your balance through it** — overall 4 · function 5 · feasibility 6 · look 5 · skipped: score  
Make each row of the Past Crises table clickable; a chart under the table then draws the user's balance month by month from the crisis start to today, with their withdrawals and contributions, beside SPY with the same cash flows. historicalRun() returns the monthly balances it already computes in walk(). It shows how deep the hole went and how long the balance took to climb back, which the single number in the table cannot.  
*Makes crisis figures tangible but adds another chart.*

**F065 · Withdrawals that rise with real past inflation** — overall 3 · function 4 · feasibility 4 · look 1 · skipped: score  
Add a choice "Withdrawals rise with inflation drawn from history" next to the fixed yearly rise. Each run draws the same calendar month's US CPI change along with that month's return, so high inflation arrives together with the returns it really came with (as in the 1970s), and withdrawals grow by the drawn inflation. It only applies when the Inflation-adjusted switch is off (with it on, withdrawals are already in today's dollars), and the method line says so.  
*US-only and nominal-only; the inflation switch already covers this.*

**F066 · Show what a yearly fee costs** — overall 5 · function 6 · feasibility 7 · look 2 · to build  
Add a "Yearly fees (%)" field for fund costs or an adviser's fee, taken monthly as (1 - fee) to the power of 1/12. With the same seed, the results show the failure rate and median ending balance with and without the fee, for example "A 1% fee raises the failure rate from 6% to 14% and cuts the median by $410,000". It teaches how small fees compound over decades.  
*A strong lesson on how fees compound; compare on the same random draws.*

**F067 · Add one-off costs and later income** — overall 4 · function 5 · feasibility 5 · look 2 · skipped: score  
Add a small "Other money in or out" list where each row is an amount, a start year, an end year and whether it rises with withdrawals, for example a $60,000 roof in year 5 or a $20,000-a-year pension from year 7. The tab turns the rows into one net amount per year, and walk() and simulate() add it monthly next to contributions, so the crises table uses it too. Tests check a one-off cost and a later income.  
*Realistic, but a list editor on an already busy form.*

**F068 · Pin a result and compare the next run** — overall 5 · function 5 · feasibility 7 · look 4 · to build  
Add a "Keep for comparison" button under the results. The next run draws the pinned median and 10th percentile as dashed lines on the cone and adds a small table: the inputs that changed, and the failure rate and median ending balance before and after. Paired with the seed field, the difference shows the effect of the change rather than random noise; the pin lives in memory only.  
*Makes what-if comparisons readable with one button, kept in memory only.*

**F069 · Glide path between two portfolios** — overall 3 · function 4 · feasibility 5 · look 2 · skipped: score  
Add an optional "Shift to" picker (a second saved portfolio or ticker) and "over N years". Each month's return is a mix, w times portfolio A's return plus (1 - w) times portfolio B's for the same calendar month, with w moving straight from 100% to 0% over the chosen years, so the months are drawn from the dates both have. This lets the user test a target-date style path or a rising-stock "bond tent", and the method line states the mix is rebalanced monthly.  
*Niche and complex for an educational tool.*

**F070 · Show the worst fall each run lived through** — overall 4 · function 4 · feasibility 8 · look 2 · skipped: score  
Have simulate() track each run's highest balance and its deepest fall from that high, month by month, including withdrawals. The results add tiles such as "Half of runs fell at least 38% from a high at some point; 1 in 10 fell 60%". This shows that even runs that lasted had frightening drops, and the hint says the fall includes withdrawals, so it differs from a market drawdown.  
*An interesting extra tile, low priority.*

**F071 · Run out while still alive: lifespan from a life table** — overall 4 · function 5 · feasibility 6 · look 2 · skipped: score  
Add optional "Age" and "Sex" fields. Each run draws a lifespan from the SSA period life table, and the results add "Chance of running out while still alive" beside the usual fixed-horizon failure rate, which keeps its meaning. The horizon becomes the smaller of 60 years and age 120, and the tab says the table is for the US population as a whole.  
*A meaningful figure, but it needs a data file and age and sex inputs.*

**F072 · Show the history the simulation draws from** — overall 4 · function 5 · feasibility 7 · look 4 · skipped: repeats F009  
Add a "What the runs are drawn from" block: number of months, annualised return (geometric), annualised volatility (monthly standard deviation times the square root of 12), worst and best month, skewness and excess kurtosis, plus a histogram of the monthly returns with a bell curve of the same mean and spread laid over it. It teaches that real returns have fatter tails than a bell curve. A new moments() function is tested against a known list.  
*Same histogram and moments as F009; a summary line in the method note would do.*

**F073 · Choose which years of history to draw from** — overall 4 · function 5 · feasibility 8 · look 2 · skipped: score  
Add a "Draw months from" choice: full history (today), the last 10 or 20 years, or custom From and To months. Only those months feed the bootstrap, the 24-month minimum still applies, and the method line names the dates. Running a strong decade against a weak one teaches how much the answer depends on which past you sample.  
*Teaches how much the sampled past matters, but adds another input.*

**F074 · Lower future returns by a set amount** — overall 4 · function 5 · feasibility 9 · look 1 · skipped: score  
Add a "Lower yearly returns by (%)" field, for users who expect a weaker future than the past. Every drawn month becomes (1 + r) divided by (1 + h) to the power of 1/12, minus 1, which cuts the yearly growth rate by about h while keeping the ups and downs. The method line states the cut, and a test checks that a 2% cut on flat-zero history gives about -2% a year.  
*A common planner haircut, but another input; low priority.*

**F075 · First-decade return against the final outcome** — overall 4 · function 4 · feasibility 6 · look 4 · skipped: score  
Have simulate() store each run's annualised return over its first 10 years (or the first half for shorter horizons) next to its ending balance. A scatter of 2,000 runs plots one against the other, with failed runs marked, and a sentence reports the share of failures among runs with a first-decade return below 3%. It shows that the order of returns, especially the first decade, decides most outcomes.  
*Overlaps F061's sequence-risk lesson.*

**F076 · Copy a link that reopens exactly what you see** — overall 6 · function 7 · feasibility 5 · look 2 · to build  
Add a "Copy link" button to each tab's results that writes the current setup into the address after the #. For the Backtester that means the compared tickers, preset or From/To dates, step and log scale; for Monte Carlo every input; for all tabs the inflation switch and country. Each tab reads the link back on load and runs. Saved portfolios travel inside the link as their full recipe (holdings, weights, rebalancing rule), so the receiver sees the same lines and can save them in one click. Monte Carlo links also carry a random seed (simulate() already accepts a `random` function; add a small seeded generator such as mulberry32, with a test), so the receiver gets the same failure rate. app.js must split the tab name from the rest of the hash, and nothing after the # ever reaches a server.  
*The only way to share results without accounts; a sizable change to routing and each tab.*

**F077 · Back up saved portfolios to a file and restore them** — overall 4 · function 6 · feasibility 7 · look 2 · skipped: repeats F039  
Saved portfolios live in one browser only, so add "Back up" and "Restore" to the side menu and to the Creator's empty state. Back up downloads a dated JSON file of every portfolio. Restore reads that file, or a simple CSV with name, ticker and weight columns (rebalance and band optional) from a spreadsheet. Each imported portfolio goes through one shared check in portfolios.js, with tests: ticker format, weights above 0 that add to 100%, a known rebalancing rule, and a band of 1 to 50. A preview lists what will be added, what is skipped and why, and offers Replace or Keep both when a name is already taken.  
*Superset of F039; the CSV import is the only new part.*

**F078 · Keep saved portfolios safe and in step across browser tabs** — overall 5 · function 6 · feasibility 9 · look 1 · to build  
Three gaps today. A portfolio saved in one browser tab doesn't appear in another open tab until reload. When storage is full or blocked (private browsing), Save fails without a message. Unreadable saved data is treated as empty, and the next save overwrites it, so it is lost. Fix: listen for the browser's `storage` event and fire the existing `portfolios-changed` and `inflation-changed` events. Wrap savePortfolios in try/catch, and have the Creator say "Your browser didn't let this save; back up to a file". Before treating unreadable data as empty, copy it to a `portfolios-unreadable` key and tell the user.  
*Small fixes for cross-tab sync and silent save failures.*

**F079 · Download the numbers as a spreadsheet file (CSV)** — overall 5 · function 5 · feasibility 7 · look 1 · to build  
Add a "Download CSV" button to each results area. Backtester: one row per trading day in the shown range (date, each line's value of $10,000, its drawdown), plus the statistics at full precision. Monte Carlo: the yearly 10th, 25th, 50th, 75th and 90th percentile balances, plus the crises table. Creator: the weights and the correlation grid. One shared downloadCsv helper in format.js writes ISO dates and unrounded numbers with a dot decimal, and quotes text that contains commas. It puts an apostrophe in front of user text that starts with = + - or @, so a spreadsheet can't run a portfolio name as a formula. File names include the date range and "nominal" or "real-US", so users can check the maths themselves.  
*Lets users check the maths through one shared helper with a formula-injection guard.*

**F080 · Save any chart as a picture with its settings written on it** — overall 4 · function 4 · feasibility 7 · look 3 · skipped: score  
Add a small "Save image" button to each chart's heading: growth, returns, drawdowns, scatter, treemap and the Monte Carlo cone. It uses ECharts' getDataURL({ type: "png", pixelRatio: 2, backgroundColor }) and adds a caption strip under the image. The caption gives the chart title, the date range, "nominal" or "today's dollars, US inflation", and "Investment Simulator · for education only, not advice". One shared saveChartImage(chart, caption) helper in visuals.js covers every chart, so a picture pasted into a slide or chat still says what it shows.  
*A screenshot does most of this.*

**F081 · Print or save a clean PDF report of the open tab** — overall 4 · function 4 · feasibility 6 · look 3 · skipped: score  
Add a print style sheet and a "Print report" action. The printout hides the side menu, menu button, form inputs, toolbars, hints and toasts. It shows the open tab's results under a header line with the settings and the last price date, with the education-only disclaimer at the foot. On `beforeprint`, each chart canvas is swapped for a 2× image from getDataURL, because canvases print blurry, and swapped back on `afterprint`. Page breaks are kept out of each .block so charts and tables don't split across pages.  
*Occasional use; a basic print stylesheet would do.*

**F082 · Keep downloaded prices in the browser between visits** — overall 5 · function 4 · feasibility 6 · look 1 · to build  
Prices are only remembered for one visit (the Map in data.js), and the Worker sends no caching header. So every reload downloads each ticker again (up to about 2 MB of Tiingo output each) and spends Worker requests. Store each ticker's response in the browser's Cache API (caches.open("prices-v1")) with the time it was saved. Reuse it until the next weekday close has passed (after 22:00 UTC), and keep CPI data for 24 hours like the Worker does. If the Worker fails, fall back to the saved copy with a note such as "Using prices saved on 20 Nov 2026", and drop entries not used for 30 days.  
*Faster repeat visits and fewer Worker calls; the expiry rules add some risk.*

**F083 · Send only dates and adjusted prices from the Worker** — overall 4 · function 3 · feasibility 5 · look 1 · skipped: score  
The Worker passes Tiingo's full daily JSON through untouched, about 2 MB for 30 years with 13 fields per day, and its own comment marks this as a shortcut. On a cache miss, keep only date (cut to 10 characters) and adjClose before writing to KV. That shrinks each series to roughly a fifth, so the browser parses it faster on phones and the browser cache in the previous idea costs less space. Cloudflare already compresses transfers, so the gain is mostly parse time and storage. The browser already reads only these two fields, and old KV entries expire within 6 hours. Check with `wrangler tail` that parsing stays under the free plan's 10 ms CPU limit per request.  
*Transfers are already compressed, and parsing 2 MB in the Worker risks its 10 ms CPU limit.*

**F084 · Show loading progress per asset, with a Stop button** — overall 4 · function 4 · feasibility 6 · look 2 · skipped: score  
Loading eight tickers shows one "Loading…" line until all are done. A slow source (PSE Edge, Yahoo) keeps the button disabled with no clue which asset is holding things up. Add a shared loadAll(tickers, onProgress) in data.js, used by all three tabs, that updates the status as each asset arrives ("Loaded 5 of 8 · waiting for BDO.PS"). A Stop button stops waiting and turns the form back on. It doesn't cancel the shared download, so that still fills the cache and the next try is instant.  
*Loads are usually quick from KV, so this helps only with slow sources.*

**F085 · Recover from failed loads: time limit, auto-retry, Try again** — overall 5 · function 5 · feasibility 7 · look 2 · to build  
A stuck price request can hang for minutes, and a one-off proxy error (502) forces the user to start over. Give each request a 20-second limit (AbortSignal.timeout). Retry once after 1.5 s on timeouts, network errors and 502s, but never on 400 or 404. Put a "Try again" button next to any load error in each tab; it re-runs only what failed, since loaded assets come from the cache. When Tiingo's hourly limit is used up (429), say plainly that prices already loaded still work and new tickers can be tried again within the hour.  
*Time limits and a Try again button make failures recoverable.*

**F086 · A safety net for when the site half-loads or goes offline** — overall 6 · function 5 · feasibility 8 · look 2 · to build  
CLAUDE.md records that after a deploy a browser can mix new and old files and end up with dead buttons, and app.js's top-level imports fail without any message. Wrap those imports in try/catch and show a banner, "Part of the site didn't load, usually because it was just updated", with a Reload button. Catch `unhandledrejection` and show the existing toast instead of failing silently. Use the browser's `offline` and `online` events to say "You're offline; prices already loaded still work".  
*Answers the documented half-deploy breakage with a clear message.*

**F087 · An "About this data" note for every asset shown** — overall 4 · function 5 · feasibility 5 · look 2 · skipped: repeats F015  
Under each tab's results, add a fold-out list with one line per asset. Each line gives where the prices came from (Tiingo, Yahoo Finance, PSE Edge, PDS yields, or built in for CASH), the first and last date, and whether dividends are included. Philippine stocks get a plain warning: their prices are raw closes, so returns leave out dividends and understate total return. The page never says this today, and the glossary's "total return" even says dividends are reinvested. The browser can't tell Tiingo from Yahoo, so the Worker should store the source (and Yahoo's currency) as KV metadata and return it in an X-Source header, listed in Access-Control-Expose-Headers.  
*The core repeats F015; the Worker source header adds deploy work.*

**F088 · Flag suspicious price data: unadjusted splits, gaps, stale prices** — overall 5 · function 5 · feasibility 7 · look 2 · to build  
Add a pure dataWarnings(points) function in a new js/quality.js, with tests on made-up series, and run it on every loaded series. It flags: a one-day move whose price ratio is within 1.5% of a common split ratio (1/2, 1/3, 1/4, 1/5, 1/10, or 2× and 3× for reverse splits), as "looks like a split in unadjusted prices"; any other one-day move beyond ±40%; gaps of more than 10 weekdays; and a last price over 10 days old (possibly delisted). Warnings show in the status line, for example "XYZ.PS fell 66.7% in one day, which matches a 3-for-1 split, so returns across that date are wrong". This teaches why adjusted prices matter, and it matters most for the raw Philippine closes.  
*Catches split crashes in raw PSE prices; watch for false alarms on real big moves.*

**F089 · Show each asset's currency and warn when currencies are mixed** — overall 5 · function 5 · feasibility 7 · look 3 · to build  
Prices stay in each listing's own currency (London in pence, Tokyo in yen, PSE in pesos), yet every tab labels money with "$". Show each line's currency code on its chip, legend and table header, and drop the "$" from "Growth of 10,000" when a line isn't in dollars. When compared lines use different currencies, add a note: each return is in its own currency and exchange-rate moves aren't included, so it isn't what a dollar investor would have earned. Add a similar note when the inflation country's currency differs from an asset's. Currency comes from the Worker (see the data-notes idea), with a fallback by ticker suffix: .L GBp, .T JPY, .PS PHP, TBILL PHP, plain letters USD.  
*A dollar sign on pence or pesos is wrong; overlaps F015's currency line.*

**F090 · Add INFLATION as a ticker you can compare against** — overall 6 · function 6 · feasibility 8 · look 3 · to build  
Let users type INFLATION in any ticker box (offered first, like CASH) to get the chosen country's consumer price index as a price-like series. It has a value on every weekday, filled in between readings exactly as deflate() does. In the Backtester it shows at a glance whether an asset beat inflation. With the inflation switch on it becomes a flat 0% line, which shows what "real" means. Build it in data.js from fetchCpi (cash dates divided by deflate's output). Note that the line runs flat after the latest reading: about 6 weeks for the US, up to two years for countries with yearly data. Avoid the name "CPI", which may clash with a listed fund's ticker.  
*Cheap from the existing CPI code; shows at a glance whether an asset beat inflation.*

**F091 · Explain the inflation figures right under the switch** — overall 5 · function 5 · feasibility 8 · look 2 · to build  
When Inflation-adjusted is on, add a small "i" next to the country box that opens a note. The note gives the source (US: FRED CPI-U, monthly; other countries: World Bank, yearly), the date of the latest reading, how much prices rose in the last 12 months and since 2000, and what 1 unit of money from 2000 buys today. For countries with yearly data it warns that dates after the last figure reuse it, so recent real returns look better than they were. CLAUDE.md records this limit, but the page never tells the user. It reuses the CPI data already fetched, so it costs no extra request.  
*Tells users the CPI limits that CLAUDE.md records but the page hides.*

**F092 · Show the before-inflation figure next to inflation-adjusted ones** — overall 4 · function 4 · feasibility 7 · look 2 · skipped: score  
With the switch on, users see only real numbers and can't tell how much inflation took. data.js already keeps the nominal series, so add fetchPrices(ticker, { nominal: true }). In real mode, show a small grey "before inflation: +X%" under the Backtester's headline figures and under the Creator's total and annualised return. One line ties the two together with the period's inflation filled in: real return = (1 + nominal) ÷ (1 + inflation) − 1. Monte Carlo is left out, because it would need a second simulation.  
*Flipping the switch already shows nominal figures; more numbers add clutter.*

**F093 · A US Treasury bill line that earns real interest** — overall 6 · function 6 · feasibility 5 · look 2 · to build  
CASH earns 0%, and the Philippine T-bills start only in Nov 2022, so no interest-paying cash covers 2000, 2008 or 2020. Add a USTBILL ticker built from FRED's daily 3-month bill rate (DTB3, since 1954). Convert each day's discount rate d to an investment yield, 365·d ÷ (360 − 91·d), and accrue it daily the way js/tbills.js already does. It works everywhere CASH works, has data for every crisis test, and can later serve as the risk-free rate for Sharpe and Sortino.  
*Interest-paying cash with crisis-era history, and a base for a real risk-free rate.*

**F094 · Choose the benchmark once for the whole site** — overall 4 · function 6 · feasibility 6 · look 2 · skipped: repeats F003  
CLAUDE.md says relative stats use a benchmark with the S&P 500 as the default, but SPY is hard-coded in backtester.js, creator.js, montecarlo-tab.js and the glossary. Add a "Benchmark" search box to the side menu (saved in localStorage key `benchmark`, default SPY). It accepts a ticker or a saved portfolio and fires a `benchmark-changed` event so each tab re-runs, the way the inflation switch does. Beta in the Backtester and Creator, the Monte Carlo crises comparison column and the glossary's beta text all follow it, so a 60/40 portfolio can be measured against a 60/40 benchmark instead of stocks alone. If the benchmark has no data for a crisis, the table says so.  
*Site-wide version of F003; a setting in the menu is harder to find.*

**F095 · Keyboard shortcuts, with a ? sheet that lists or turns them off** — overall 3 · function 3 · feasibility 8 · look 1 · skipped: score  
Add single-key shortcuts in app.js. They do nothing while you type in a field or hold Ctrl, ⌘ or Alt. 1, 2 and 3 switch tabs, / jumps to the open tab's ticker box, [ and ] step through the time presets, L toggles log scale, I toggles inflation, and ? opens a small dialog listing them. One-letter shortcuts can clash with speech input, so the dialog has a switch to turn them off, saved in localStorage, as the accessibility guideline WCAG 2.1.4 asks.  
*Low value for this audience, plus a settings dialog.*

**F096 · A ⌘K search box that jumps anywhere and runs actions** — overall 2 · function 3 · feasibility 6 · look 3 · skipped: score  
Bring back a command palette: ⌘K or Ctrl+K opens a dialog with one search box built on attachTickerSearch, which already draws a "Tab" icon for such entries. Typing finds tabs, saved portfolios (with "Compare", "Edit" or "Simulate"), actions such as "Turn inflation adjustment on", "Copy link" and "Back up portfolios", and any ticker as "Compare SPY" through the Backtester's exported addToCompare. Enter runs the choice and closes the dialog; Esc closes it and puts focus back where it was.  
*The owner removed the palette in commit aef497a.*

**F097 · Ready-made examples that each teach one idea** — overall 6 · function 6 · feasibility 7 · look 5 · to build  
While the Backtester and Monte Carlo tabs are empty, show three or four example cards. Each card is a link built with the share-link idea, plus a one-line lesson. Examples: SPY vs AGG over the 2008 crash window (9 Oct 2007 – 9 Mar 2009), showing what bonds did while stocks fell; VTI vs VXUS over their longest shared period (home vs world stocks); GLD vs SPY (diversification); and a 30-year Monte Carlo of $1,000,000 with $40,000 a year rising 3% (the "4% rule"). Check each lesson sentence against the real result before it ships; the cards disappear after the first run.  
*Good onboarding for an educational site; it can prefill forms without F076.*

**F098 · A glossary page with every term, a search box and direct links** — overall 5 · function 5 · feasibility 7 · look 3 · to build  
Definitions only appear on hover today. Add a Glossary page to the side menu (#glossary) that lists every entry with its formula, plus a filter box and direct links such as #glossary/sharpe-ratio. Add the terms the site uses but never defines, each stating the method used here: real vs nominal return, consumer price index, bootstrap (monthly returns drawn with replacement), ran-out-of-money rate, median, drift band, log scale, price return vs total return, and sequence-of-returns risk. app.js treats the glossary as a fourth page.  
*Adds missing definitions and a reference page.*

**F099 · Make every chart readable without seeing it** — overall 4 · function 5 · feasibility 6 · look 2 · skipped: score  
The ECharts charts are drawn on canvases, which a screen reader can't read. Give each chart container role="img" and a label written from the data, in the form "SPY grew from $10,000 to $X; its deepest fall was Y% on &lt;date>". Add a "Show as table" toggle under each chart that lists the plotted points (monthly for long ranges) in an ordinary table. Put the helper next to frame() in backtester.js so the Creator and Monte Carlo charts reuse it.  
*ECharts aria labels are already on; a table toggle adds modest value.*

**F100 · Recently used tickers in every search box** — overall 4 · function 4 · feasibility 8 · look 3 · skipped: score  
An empty ticker box shows nothing until you type. As soon as the box gets focus, show your saved portfolios and the last 8 tickers that loaded successfully, under a "Recent" label, with the same ↑ ↓ Enter keys. The list is stored in localStorage key `recent`, newest first, and recorded in fetchPrices. These are only the user's own history, so the decision that suggestions come from Yahoo still holds. A "Clear" link empties the list.  
*A small convenience for repeat visitors.*

## Design ideas

**D001 · One small set of text sizes for the whole site** — overall 4 · function 1 · feasibility 7 · look 4 · skipped: score  
styles.css uses about 13 different font sizes today (0.6875, 0.8125, 0.9375rem and so on), so small labels drift from one part to the next. Add size tokens at the top of styles.css (--text-xs 0.75rem, --text-sm 0.875rem, --text-base 1rem, --text-md 1.125rem, --text-lg for the lede, --figure-sm 1.625rem, --figure 2.25rem, --figure-xl 3.5rem, --title for the h1 clamp) and point every rule at them, folding the odd sizes into the nearest step. Let the lede shrink on phones with clamp(1.125rem, 2.5vw, 1.3125rem), since it now takes three big lines on a 375px screen.  
*Mostly an internal refactor; the smaller lede on phones is the visible gain.*

**D002 · Even spacing between sections, titles and forms** — overall 3 · function 1 · feasibility 6 · look 3 · skipped: score  
Gaps are hand-picked per rule today: 2.5rem under the lede, 2rem + 2rem between blocks, 1.5rem above panels, 0.375rem or 0.75rem above hints and charts. Add a spacing scale (--space-1 0.25rem up to --space-8 3.5rem) at the top of styles.css and use it for the lede, .panel, .block, .hint, .chart, .status and footer. Then the gap after a page title, between sections and under each section title is the same on every tab.  
*A refactor with regression risk and little visible change.*

**D003 · Tokens for corners, shadows, the blue marker and white text** — overall 4 · function 1 · feasibility 8 · look 3 · skipped: score  
Corners use 3, 4, 5, 8, 10, 12 and 999px; shadows mix a navy tint (rgba 21,35,59) on menus and suggestions with an ink tint on the popover and toast; the rail marker hard-codes #2a78d6; and #fff is typed in about eight places. Add --radius, --radius-lg, --radius-pill, one --shadow-float in the ink tint, --accent for the section marker and --on-ink for white text, then replace the literals. The look stays the same but every floating layer casts the same shadow and future changes happen in one place.  
*Tidier tokens and one shadow tint, barely visible to users.*

**D004 · Slim top bar that stays put and names the open tab** — overall 4 · function 3 · feasibility 6 · look 5 · skipped: score  
Make .topbar sticky with a paper background and its hairline, and add a body.scrolled class (an IntersectionObserver on the open tab's h1 in js/app.js) that trims its padding and shows '/ Backtester' (or the open tab) beside the wordmark. The inflation switch, which re-runs every result, then stays in reach on long pages. Paint the paper full width with box-shadow 0 0 0 100vmax var(--paper) plus clip-path so content does not show beside it, and keep the fixed menu button above it.  
*Keeps the switch in reach but costs height on phones and adds stacking work.*

**D005 · Logo becomes a home link with a two-weight wordmark** — overall 5 · function 3 · feasibility 10 · look 4 · to build  
The .brand in the top bar is a plain div, yet styles.css already styles it like a link (no underline, inherited colour). Change it to &lt;a href="#backtester" class="brand"> so clicking the logo returns to the first tab, the way most sites work. Set 'Investment' at weight 600 and 'Simulator' at 300 so the wordmark echoes the light headings.  
*A conventional home link in one line.*

**D006 · Favicon that matches the logo, plus a paper-coloured browser bar** — overall 5 · function 2 · feasibility 6 · look 5 · to build  
The favicon is a navy triangle with an amber line, which looks nothing like the header mark (amber sun over a line chart on a baseline). Redraw the inline SVG favicon as a simplified version of the header mark in ink #1a1a1a and amber #e9a21b, readable at 16px. Add &lt;meta name="theme-color" content="#fafaf8"> so mobile browser bars match the warm paper, and a 180px apple-touch-icon PNG for home-screen saves.  
*Brand consistency in browser tabs; the PNG must be made by hand.*

**D007 · Browser tab title follows the open tab** — overall 6 · function 4 · feasibility 10 · look 3 · to build  
Every tab shows 'Investment Simulator' in the browser tab and in history, so three open tabs look identical. In showTab() in js/app.js, set document.title to the open tab's menu label plus ' · Investment Simulator' (for example 'Monte Carlo Simulation · Investment Simulator'). One line, and bookmarks and history entries become tellable apart.  
*One line makes browser tabs and history entries distinguishable.*

**D008 · Inflation pill lines up with the page edges on phones** — overall 6 · function 2 · feasibility 9 · look 5 · to build  
On a 375px screen with inflation turned on, the pill reaches 368px while the page edge is at 351px, so it pokes past the right margin. Under 40rem, give .realbar flex: 1 1 100% and margin-left 0, and give .real-country flex: 1 with min-width 0 instead of its fixed 10.5rem. The pill then fills its own row edge to edge and the country box takes the leftover space.  
*Fixes a visible overflow on phones.*

**D009 · Mark the open tab in the menu with the blue bar** — overall 4 · function 2 · feasibility 10 · look 5 · skipped: score  
The current menu link is a solid black block (background ink, white text), the heaviest thing on the page next to the main button. Change .sidebar a[aria-current] to the wash background with ink text and the same 3px blue bar that marks section titles (.block h2::before). The menu and the section rail then speak one visual language and the page stays calm.  
*A taste change; the ink block already fits the one-ink palette.*

**D010 · Short description under each menu item** — overall 4 · function 3 · feasibility 9 · look 4 · skipped: score  
Add one muted line under each link in the side menu: 'Compare assets over time' under Backtester, 'Build and save a mix' under Portfolio Creator, 'Try thousands of possible futures' under Monte Carlo Simulation. Lay each link out as a small grid with the icon spanning both lines, at 0.8125rem in --muted. New visitors learn what each tab is for before they open it, in the spirit of Wealthsimple's menus.  
*Small help on first visits; the tab names already say most of it.*

**D011 · Jump links to the open tab's sections in the menu** — overall 3 · function 3 · feasibility 6 · look 3 · skipped: score  
When the menu opens, js/app.js lists the visible .block titles of the open tab (Growth of $10,000, Returns by Period, Drawdowns, Monthly Returns and so on) as indented links under the current menu item. Clicking one scrolls that section into view without changing the URL hash, so tab routing is untouched. Building the list on open means it only shows sections that currently have results.  
*Rarely used navigation that adds menu clutter.*

**D012 · Clear open state for the menu: close icon and dimmed page** — overall 5 · function 3 · feasibility 8 · look 5 · to build  
While the menu is open, the three-line icon in #open-menu turns into a close mark (swap the SVG path when aria-expanded is true) and its label reads 'Close menu'. Under 60rem, where the menu floats over the page, add a soft ink veil (about 15% opacity) behind it that closes the menu when tapped. People then see at once that the menu is open and how to leave it.  
*A clear open state and tap-to-close where the menu floats.*

**D013 · Number the sections in the left rail** — overall 3 · function 1 · feasibility 9 · look 3 · skipped: score  
Use a CSS counter reset on each results panel (#results, #profile, #mc-results) and incremented on each .block, shown as a small light '01', '02' above each rail title. Move the blue marker to a left border so ::before can carry the number. Hidden blocks are skipped automatically, and long result pages read like a numbered report, as on Simply Wall St.  
*Decorative, and the numbers shift as blocks hide.*

**D014 · Section titles stay in view beside long sections** — overall 4 · function 2 · feasibility 8 · look 4 · skipped: score  
In the two-column layout, give .block h2 position: sticky, a top offset (just below the top bar) and align-self: start, so the title rides down beside tall content such as the monthly-returns heatmap or the statistics table. Under 40rem, where titles stack above the content, it stays static. Readers always know which section they are looking at.  
*A subtle gain that may clash with other sticky elements.*

**D015 · Layout follows the page's real width, not the screen's** — overall 5 · function 2 · feasibility 7 · look 5 · to build  
The section-stacking rule (40rem), the growth toolbar's wrap rule (72rem) and the head-to-head stacking all check the screen width. When the side menu pushes the page 15rem to the right, the page gets narrower but these rules do not notice, so the toolbar can squeeze or clip. Set container-type: inline-size on main and switch those three rules to @container queries so they react to the space the page really has.  
*Fixes squeezed layouts when the menu pushes the page.*

**D016 · Tidier line breaks in titles, ledes and notes** — overall 5 · function 1 · feasibility 10 · look 4 · to build  
Add text-wrap: balance to h1, .profile-title and empty-state headings, and text-wrap: pretty to .lede, .hint, footer and popover text. Headings then split into even lines and paragraphs stop ending on a single lonely word. Browsers without support simply ignore it.  
*Two CSS lines that browsers without support ignore.*

**D017 · Footer names where the data comes from** — overall 5 · function 4 · feasibility 9 · look 2 · to build  
Keep the one-line disclaimer and add a second short line in the footer: prices from Tiingo, Yahoo Finance (non-US) and PSE Edge (Philippine stocks, not dividend-adjusted), T-bill yields from PDS, inflation from FRED and the World Bank, and saved portfolios kept only in this browser. Set it as two quiet muted lines with the same hairline above, no boxes. It is honest about the sources and their limits without adding notes under every chart.  
*Honest about the sources and the missing PSE dividends.*

**D018 · One calm house style for every table** — overall 4 · function 2 · feasibility 9 · look 5 · skipped: score  
Table headers are bold ink and right-aligned today, styled no differently from the body. Give thead th the rail's small-caps look (0.75rem, muted, letter-spaced) with a 1px ink rule under the header row, keep hairlines between body rows, and add a faint wash on row hover for the statistics and crises tables (not the heatmap or correlation grid, whose cells carry colour). Tables then read like Vanguard's fund pages.  
*A taste change; the current tables read fine.*

**D019 · Wide tables keep their first column and show there is more** — overall 6 · function 4 · feasibility 8 · look 5 · to build  
Inside .table-scroll, make the first column (row labels such as Sharpe or the year) sticky with left: 0 and a paper background, so names stay visible when the statistics or monthly table scrolls sideways on a phone. Add soft fade edges with the background-attachment: local scroll-shadow trick so a cut-off table shows it can scroll. Pure CSS, no change to the table code.  
*A real phone usability gain in CSS only.*

**D020 · One button family with hover, press and disabled states** — overall 5 · function 3 · feasibility 9 · look 5 · to build  
The primary button and button.quiet have no hover or press feedback, and every disabled button shows a 'progress' cursor even when nothing is loading. Give both a shared min-height (2.75rem, same as fields and .dd-btn), a hover state (primary a touch lighter, quiet gets an ink border and wash), a slight press scale like the menu button, and a plain not-allowed cursor when disabled. Keep the progress cursor only on buttons marked aria-busy.  
*Adds missing hover and press states and drops a misleading progress cursor.*

**D021 · Focus ring that shows on dark surfaces too** — overall 5 · function 3 · feasibility 9 · look 3 · to build  
The global focus ring is a 2px ink outline, which disappears on ink backgrounds: the Undo button inside the black toast and the highlighted ticker suggestion row. Add a --focus token and switch the ring to white (--on-ink) inside .toast and on selected .suggest rows, and give .dd-btn and chip remove buttons the same offset ring as the chip box. Keyboard users can then always see where they are.  
*An accessibility fix for the focus ring lost on ink surfaces.*

**D022 · Skip-to-content link for keyboard users** — overall 4 · function 2 · feasibility 7 · look 1 · skipped: score  
Add a 'Skip to content' link as the first thing in body, hidden until it gets focus, then shown as a small ink pill in the top-left corner. Because tabs are routed by the URL hash, it must not use href="#main" (that would switch to the Backtester); instead js/app.js prevents the default and moves focus to the open tab's h1 (given tabindex=-1). Keyboard users skip the menu button and inflation switch in one key press.  
*Only a few controls come before the content, so the gain is small.*

**D023 · Clean printouts of results** — overall 4 · function 3 · feasibility 8 · look 3 · skipped: repeats F081  
Add @media print rules: hide the menu button, side menu, inflation switch controls, forms' buttons, chart toolbars and zoom hints; drop the menu's left padding; keep each .block from splitting across pages; let tables print in full without the scroll box; keep the footer disclaimer. In js/app.js, fire a resize on beforeprint and afterprint so ECharts redraws at paper width instead of being cut off. Printing to PDF then gives a tidy report of a comparison or simulation.  
*A simpler form of F081; build one print stylesheet at most.*

**D024 · Stop all three tabs flashing on first load** — overall 6 · function 2 · feasibility 10 · look 4 · to build  
All three tab sections are visible in the HTML until the deferred js/app.js runs showTab(), so on a slow connection the Creator and Monte Carlo pages can flash stacked under the Backtester. Add the hidden attribute to #creator and #monte-carlo in index.html; showTab() already un-hides the right one. The first paint then shows a single tab.  
*Two attributes stop every tab flashing on load.*

**D025 · Browser-drawn parts in the house ink, and no sideways jump** — overall 5 · function 1 · feasibility 10 · look 4 · to build  
Set accent-color and caret-color to var(--ink) on :root so the log-scale checkbox and date pickers stop using the system blue, and give ::selection a warm grey highlight. Add scrollbar-gutter: stable and a thin scrollbar-color in the field-border grey on html, so on Windows the page no longer shifts sideways when switching from the empty Backtester (no scrollbar) to a long tab. All CSS, a few lines.  
*Tiny CSS polish that stops the sideways jump between tabs.*

**D026 · Name and final value at the end of each growth line** — overall 6 · function 5 · feasibility 8 · look 6 · to build  
The growth chart has no legend, so today you must hover or scroll back up to the chips to tell the lines apart. Add a small label at the right end of each line: a colour dot, the name and its ending value in ink, for example "QQQ $10,803". ECharts endLabel does this, and labelLayout moveOverlap 'shiftY' nudges labels apart when lines finish close together. Widen the chart's right margin to about 90px to make room.  
*The growth chart has no legend, and end labels fix that cleanly.*

**D027 · Starting line at $10,000 and a firm zero line** — overall 5 · function 4 · feasibility 9 · look 5 · to build  
On the growth chart, draw a dashed hairline at $10,000 with a small muted label, "Start $10,000", so you can see at a glance whether each line ended above or below where it began. On the returns-by-period chart, draw the 0% line as a solid ink hairline and keep the other gridlines in the faint GRID colour, so gains and losses split cleanly.  
*Cheap reference lines that make the charts easier to read.*

**D028 · Shade past market crashes on the growth and drawdown charts** — overall 5 · function 5 · feasibility 8 · look 5 · to build  
Paint faint wash-coloured bands (var(--wash)) behind the growth and drawdown lines for the dot-com crash, 2008, the 2020 pandemic crash and the 2022 sell-off, with a small muted caption at the top of each band. Reuse the dates in CRISES from js/montecarlo.js through an ECharts markArea, and draw only the bands that fall inside the visible period. Dips then line up with the events that caused them.  
*Ties dips to known events using the existing CRISES.*

**D029 · Percent axis labels that never repeat** — overall 5 · function 3 · feasibility 8 · look 5 · to build  
Percent axes round to whole numbers, so a narrow range prints the same label several times. Over 1Y the scatter's return axis reads "9%, 9%, 9%, 8%", and the drawdown axis has uneven steps like -2%, -3%, -5%. Pick the number of decimals from the axis step: none above 2 points, one down to 0.2, two below that. Use it on the drawdown, returns and scatter axes.  
*Fixes repeated and uneven axis labels.*

**D030 · Roomier risk-and-return scatter with labels that don't collide** — overall 5 · function 3 · feasibility 8 · look 5 · to build  
With scale:true the dots sit right on the frame. Over 1Y, QQQ sits in the bottom-right corner on top of the "Volatility" axis name. Pad both axes by about 15% of the range, centre the axis names under and beside the axes, and let ECharts labelLayout move overlapping name labels apart. When any return is negative, add a dashed 0% line so above and below zero is obvious.  
*Fixes dots sitting on the frame and clashing labels.*

**D031 · S&P 500 reference point on the risk-and-return scatter** — overall 5 · function 5 · feasibility 7 · look 5 · to build  
SPY is always fetched as the benchmark. Plot it on the scatter as a hollow ink ring labelled "S&P 500 (SPY)", with faint dashed lines through it across the chart. That splits the chart into four areas, each with a tiny muted corner caption: "swung more, grew more", "swung less, grew less" and so on, so every dot reads against the market. Skip it when SPY is already one of the compared lines.  
*A market reference point gives each dot meaning; keep the corner captions light.*

**D032 · Line up the dates of the growth and drawdown charts** — overall 5 · function 3 · feasibility 9 · look 4 · to build  
The two charts share a crosshair, but their plot areas start at slightly different x positions because their value labels have different widths ("$12.5K" against "-15%"). Give both charts the same fixed left margin with right-aligned axis labels, so the date axes match exactly. The crosshair then falls on the same day in both charts.  
*The shared crosshair then lands on the same day in both charts.*

**D033 · Calmer, sorted chart tooltip** — overall 4 · function 3 · feasibility 7 · look 4 · skipped: score  
Restyle the floating tooltip to match the glossary popover: 12px corners, the same soft shadow, no hard border, and a hairline under the date. Sort the rows from highest to lowest value at the hovered date. On the growth chart, add each line's change since the start of the period in gain/loss colour after the dollar value, with names and values staying in ink. Done through the Backtester's own formatter and extraCssText, so the Creator and Monte Carlo tooltips keep their current look unless chosen later.  
*Rows reordering on every hover can confuse; a modest gain.*

**D034 · One quiet line saying which period is shown** — overall 5 · function 4 · feasibility 8 · look 5 · to build  
Under the growth toolbar, swap the always-visible zoom instructions for a muted caption of the current window, for example "19 Nov 2025 to 19 Nov 2026 · 1 year · 251 trading days", updated on every redraw, zoom and drag. Move the zoom instructions into a small dotted "How to zoom" glossary word at the end of that line, so the help is one hover away instead of always on screen.  
*A useful period caption and less help text on screen.*

**D035 · Gain in dollars and percent under each headline figure** — overall 5 · function 4 · feasibility 9 · look 5 · to build  
Under each big ending value in the summary, add one line in gain/loss colour, for example "+$920 (+9.2%)", and a muted line, "from $10,000 on 19 Nov 2025", in the calm Wealthsimple style. When the period is under a year, the "Annualised return" row, which now shows a bare dash, becomes "Total return", so no headline row is ever blank.  
*Adds the dollar gain and removes a blank row for periods under a year.*

**D036 · Head-to-head bars in the two-asset summary** — overall 3 · function 2 · feasibility 7 · look 4 · skipped: score  
When exactly two lines are compared, replace the small ▲ winner marker with a thin two-sided bar under each row, like the head-to-head stats in a sports app. Each side's length is its share of the pair, in that asset's colour; the winning side is solid and the other side is 35% opacity. Figures stay in ink. You can see who leads on return, volatility, drawdown and Sharpe without comparing digits.  
*Share-of-pair bars make no sense for negative values such as drawdowns.*

**D037 · Mark the best figure in each statistics row** — overall 5 · function 4 · feasibility 9 · look 4 · to build  
With two or more lines, the best value in each statistics row turns semibold with a small ink dot before it. Best means higher return, lower volatility, the shallower drawdown and a higher Sharpe or Sortino, using the same better-direction flags drawSummary already has. Beta is left unmarked because neither high nor low is better, ties and dashes are skipped, and the row's text stays ink. Today the table has no emphasis at all.  
*Cheap emphasis using direction flags that already exist.*

**D038 · Group the statistics table into short labelled sections** — overall 5 · function 3 · feasibility 9 · look 4 · to build  
Split the ten rows under small-caps subheads in the notch-label style (0.6875rem, uppercase, muted). "Growth" holds total return, annualised return and $10,000 became. "Ups and downs" holds volatility, maximum drawdown, best year and worst year. "Reward for the risk" holds Sharpe and Sortino. "Compared with the market" holds beta. A newcomer then reads the table in chunks, not a flat list.  
*Makes the table easy to scan, more so once rows are added.*

**D039 · Statistics rows that don't apply say why** — overall 5 · function 3 · feasibility 9 · look 4 · to build  
Under one year, annualised return, best year and worst year show a dash in every column (seen on 1Y). Instead, show one muted cell spanning the columns that reads "Needs at least one full year", and fade that row's label. The table no longer looks broken, and it tells you what to change.  
*Explains the dashes instead of looking broken.*

**D040 · Pin the first column when tables scroll sideways** — overall 3 · function 4 · feasibility 8 · look 5 · skipped: repeats D019  
On narrow screens the statistics table and the monthly heatmap scroll sideways, and the metric names or years scroll out of view. Make the row-label column sticky (position: sticky; left: 0; paper background) and add a soft fade at the right edge of .table-scroll while more columns are hidden. CSS only.  
*Same as D019.*

**D041 · Difference column shows who is ahead, not a signed subtraction** — overall 5 · function 4 · feasibility 8 · look 4 · to build  
The two-asset column is headed "SPY − QQQ" and shows signed gaps like "-7.82 pts", which you must decode, and for volatility a minus is good news. Rename the header "Gap" and start each cell with the colour dot of the asset that is ahead on that row, then the unsigned size of the gap, for example "● 7.82 pts". It uses the same better-direction flags as the best-figure marking.  
*Removes sign decoding, especially for volatility.*

**D042 · Heatmap in clear colour steps with a key** — overall 5 · function 4 · feasibility 7 · look 5 · to build  
Replace the see-through rgba cells with five solid steps each for gains and losses, each step a fixed colour on paper. Text contrast is then checked once per step, with white text only on the two darkest. Add a small key under the table, "-10% … 0 … +10%", noting that the full-year column uses its own wider scale. Today there is no key, so nobody can tell what a shade means.  
*A key makes the shades readable and solid steps fix contrast.*

**D043 · Ring the best and worst months; label the full-year column** — overall 4 · function 3 · feasibility 9 · look 4 · skipped: score  
Outline the best and worst month in the heatmap with a 1.5px ink ring and give each a tooltip, "Best month" or "Worst month". Rename the right-hand header from "Year" to "Full year" and set that column apart with a wider gap and a hairline. Today two columns are both headed "Year".  
*Fixing the duplicate 'Year' header is the useful part.*

**D044 · Hatching for part-period bars and heatmap cells** — overall 4 · function 3 · feasibility 7 · look 4 · skipped: score  
Partial years and months are shown at 45 to 55% opacity, which looks like a paler colour, not an unfinished period. Use an ECharts decal (diagonal hatch in the bar's own colour) on partial bars, and a matching CSS repeating-linear-gradient on partial heatmap cells. Add one muted key line under the returns chart, "Hatched: only part of the period", shown only when a partial bar is on screen.  
*Clearer partial marking, but it adds a key line.*

**D045 · Return bars that adapt to how many there are** — overall 4 · function 3 · feasibility 8 · look 4 · skipped: score  
With 12 or fewer periods and at most two lines, print each bar's return at its tip in small ink text, for example "+26%", so you need not read the axis; Best and Worst badges keep their place. With more than 60 bars (monthly over many years), drop the rounded ends and the gaps, so the chart becomes a clean dense barcode, not a smear of tiny pills.  
*Minor bar polish.*

**D046 · Readable deepest-point pins on the drawdown chart** — overall 5 · function 3 · feasibility 8 · look 5 · to build  
Over 1Y with SPY and QQQ, the two "deepest point" labels in March overlap, and the November one is cut off at the right edge. Let ECharts labelLayout move overlapping pins apart, flip a label to the left when its pin sits near the right edge, and add the month, for example "-15% · Nov 2026", so the pin says when as well as how deep.  
*Fixes overlapping and clipped labels.*

**D047 · Correction and bear-market guide lines on the drawdown chart** — overall 5 · function 4 · feasibility 9 · look 4 · to build  
Draw faint dashed hairlines at -10% and -20%, each with a small muted label at the right end, "Correction -10%" and "Bear market -20%". Draw each line only when the chart actually goes that deep. Make both labels glossary words that explain the terms. Readers learn the market's own yardsticks while they look at their own falls.  
*Teaches the market's yardsticks right where they apply.*

**D048 · Keep the chip box in view as the legend while scrolling** — overall 4 · function 4 · feasibility 6 · look 4 · skipped: score  
The charts have no legend; the chips are the only colour key, and they scroll away above the first chart. Make the compare form sticky at the top of the screen once results show, on a paper background with a hairline underneath only while it is stuck (an IntersectionObserver toggles a class). Chip colours stay on screen next to every chart.  
*Keeps colours in view but takes screen space.*

**D049 · Log scale as a switch, matching the header toggle** — overall 4 · function 1 · feasibility 9 · look 4 · skipped: score  
The Scale group in the growth toolbar uses a plain browser checkbox, the only one on the page; the header's inflation control already uses a small ink switch (.switch). Restyle the log-scale control with the same switch and label, so the toolbar's controls all look alike.  
*Visual consistency only.*

**D050 · A plain-English takeaway line at the top of each chart** — overall 5 · function 5 · feasibility 7 · look 5 · to build  
Above each chart, add one short muted sentence written from the numbers already computed, in the infographic spirit of Simply Wall St. For example, growth: "SPY ended highest, at $10,920." Drawdowns: "QQQ fell furthest: -15.1% in Nov 2026." Scatter: "QQQ swung more than SPY and grew less." Sentences describe the past only, with no advice. They are built from fixed templates, so names are inserted as text, never as HTML.  
*Plain-English takeaways suit the brief; the templates must stay factual.*

**D051 · Colour dot and asset icon at the start of each holding row** — overall 4 · function 3 · feasibility 8 · look 4 · skipped: score  
In the Creator's Holdings list, each row starts with a small dot in the colour that holding will get in the treemap (COLORS[i]) and the asset-class icon from glyph(assetClass(ticker)). The icon updates as the ticker is typed. The form then matches the profile below it, and a row is easy to find later in the treemap.  
*Links the form to the profile; minor.*

**D052 · Live split bar under the holdings** — overall 5 · function 5 · feasibility 8 · look 6 · to build  
Under the holding rows, add a thin rounded bar split into one segment per holding, each in its holding colour and sized by its weight. Weight not yet assigned shows as an empty hairline-outlined gap labelled 'x% left'. Anything over 100% shows as a hatched loss-red end piece. The 'Total 100%' text stays beside it, so the split reads at a glance while typing.  
*Shows the split and the weight left to assign while typing.*

**D053 · Small round remove buttons instead of 'Remove' text buttons** — overall 4 · function 2 · feasibility 9 · look 4 · skipped: score  
Swap each holding row's bordered 'Remove' button for a small round × button like the one on the Backtester chips, with aria-label 'Remove SPY'. The rows get narrower and calmer, and the ticker and weight boxes carry the visual weight.  
*Calmer rows; minor.*

**D054 · Both forms use the same left label rail as the results** — overall 4 · function 3 · feasibility 6 · look 5 · skipped: score  
Split the Creator form into rail sections (Portfolio, Holdings, Rebalancing). Split the Monte Carlo form into three (What to test, Money in and out, Simulation). Each uses the existing .block layout: a small-caps title with the blue bar on the left, fields on the right. Forms and results then read as one document, and the Monte Carlo grid of nine equal boxes gets visible groups. The duplicate legend text becomes visually hidden for screen readers.  
*Groups the Monte Carlo fields but restructures two forms.*

**D055 · Unit signs inside the boxes instead of in the labels** — overall 4 · function 3 · feasibility 6 · look 4 · skipped: score  
Show '%' inside the right edge of each Creator weight box. Show '$' at the left of the Monte Carlo money boxes, '%' in the withdrawal-rise box and 'years' in the years box. Drop '($)' and '(%)' from the labels. liveField copies a data-prefix or data-suffix from the input onto its .fx wrapper, and CSS draws it in muted text with padding so it clears the tick. Labels get shorter and the unit sits right next to the number.  
*Cleaner labels, but units on the right clash with the tick.*

**D056 · Treemap labels readable on every tile colour** — overall 6 · function 3 · feasibility 8 · look 5 · to build  
Pick the label colour per tile from its luminance: dark ink on the light amber, pink and green tiles, white on blue and orange. White on #eda100 fails contrast today. Show the ticker in semibold and the weight on its own line in a lighter, larger figure. Leave labels off tiles under about 4%, where text gets clipped; the tooltip still shows them.  
*Fixes a contrast failure on the light tiles.*

**D057 · Allocation list as aligned rows with weight bars** — overall 5 · function 4 · feasibility 8 · look 6 · to build  
Turn the wrapped allocation chips under the treemap into a vertical list. Each row shows the colour swatch, asset icon and ticker, then a hairline track with a filled bar in the holding's colour (length relative to the largest holding), then the weight right-aligned in tabular figures. It reads like Vanguard's holdings table and makes small weights easy to compare.  
*Vanguard-style rows that make small weights easy to compare.*

**D058 · Treemap and allocation list side by side on wide screens** — overall 4 · function 2 · feasibility 7 · look 5 · skipped: score  
Inside the Allocation section, place the treemap on the left (about 60%) and the allocation list on the right in a two-column grid. They stack again under about 56rem. The section gets shorter, and each tile sits level with its row in the list.  
*A shorter section on wide screens; minor.*

**D059 · Asset-class mix strip above the treemap** — overall 4 · function 4 · feasibility 7 · look 4 · skipped: score  
Group the holdings by assetClass() (stocks, bonds, cash, precious metals, real estate, international, other) and draw one thin stacked bar in shades of the ink colour, with a caption like '60% Stocks · 40% Bonds' and each class icon. It gives a Vanguard-style asset mix without paid fund data. Unknown tickers fall into 'Other listed securities' instead of a guess.  
*assetClass knows few tickers, so most holdings land in Other.*

**D060 · Calmer correlation grid with a colour key** — overall 5 · function 4 · feasibility 8 · look 5 · to build  
Show only the lower half of the grid, since the upper half repeats it. Draw the diagonal as a muted dash. Make the cells fixed squares and put each holding's colour dot before its ticker in the headers. Under the grid, add a small gradient key running from orange 'moves opposite' through white 'unrelated' to blue 'moves together', so the colours explain themselves.  
*A key and a half grid make the colours readable.*

**D061 · Risk and Return figures in two rows, with SPY under each** — overall 5 · function 5 · feasibility 8 · look 4 · to build  
Split the seven figures into a 'Return' row (annualised return, best year, worst year) and a 'Risk' row (volatility, maximum drawdown, beta, Sharpe) with a hairline between them. Under each figure, add a small muted caption with SPY's value over the same dates, e.g. 'SPY 10.2%'. SPY's prices are already loaded, so it only takes one more summarize call on SPY's window.  
*SPY beside each figure gives instant context.*

**D062 · Profile header with a growth line and a one-line summary** — overall 5 · function 4 · feasibility 8 · look 5 · to build  
Under the portfolio name, add a small sparkline of the portfolio's growth over the measured period, with its total change in gain or loss colour. Add a muted meta line like '2 holdings · Rebalanced every year · 2 Jan 2008 to 20 Nov 2026'. The top of the profile then says what the portfolio is and how it did, like a fund page header. The shortest-history note stays with the figures.  
*A fund-page header that says what the portfolio is and how it did.*

**D063 · Ghosted preview for the Sector and Regional Mix section** — overall 3 · function 1 · feasibility 9 · look 3 · skipped: score  
Replace the plain 'Not available yet' text with faint washed-out bars in the shape the section will take: a sector bar list and a region bar list, unlabelled and drawn in --wash. Put the short note over them. The empty section then looks planned, not broken, and shows what is coming once a fund-data source is chosen.  
*Ghost bars can look like a stuck loader; the note is enough.*

**D064 · Gain and loss colours on signed figures** — overall 5 · function 3 · feasibility 9 · look 4 · to build  
Colour annualised return, best year and worst year in the profile with the existing .gain/.loss classes by sign. In the crises table, show the lowest-point percentages and 'Ran out in…' in loss red, while 'left' amounts stay in ink. This follows the rule that green and red are only for gain/loss data, and readers can spot the bad numbers at once.  
*Fits the gain/loss colour rule; cheap.*

**D065 · Segmented controls for number of runs and contribution timing** — overall 4 · function 3 · feasibility 7 · look 4 · skipped: score  
In the Monte Carlo form, replace the 'Number of runs' dropdown with the site's segmented control (1K · 10K · 50K · 100K · 1M) and 'Contributions are added' with Monthly · Annually. Both use the sliding pill and keep their one-line explanation underneath. Every choice is visible without opening a menu, and the form has fewer boxes that look alike.  
*Departs from the decided dropdown pattern for a small gain.*

**D066 · Money boxes repeat the amount with commas as you type** — overall 5 · function 4 · feasibility 8 · look 3 · to build  
The Monte Carlo money boxes show raw '1000000'. Once a value is valid, the help line under each box changes from 'From 1 to 1,000,000,000,000' to the typed amount formatted, e.g. '$1,000,000'. Large amounts can then be read without counting zeros. liveField gets an optional formatter used only for the valid message.  
*Big amounts become readable; a small change.*

**D067 · Summary of the inputs above the results** — overall 5 · function 4 · feasibility 8 · look 4 · to build  
At the top of the Monte Carlo results, add one row of small hairline tags: 'SPY · $1,000,000 start · $40,000 a year out, rising 3% · 30 years · 10,000 runs · Future dollars'. The results then make sense on their own, even after the form scrolls away or in a screenshot.  
*Results read on their own and in screenshots.*

**D068 · Scale marks and a printed reading on the survival dial** — overall 4 · function 3 · feasibility 8 · look 4 · skipped: score  
Add short tick marks at 0, 25, 50, 75 and 100% around the dial's arc, with tiny labels at 0 and 100. Print the share of runs that lasted (e.g. '92% lasted') under the needle hub. The dial then stands on its own, and readers no longer have to square the big failure number with an unlabelled arc.  
*Minor; the headline text already states the share.*

**D069 · Ending balances drawn as a range strip** — overall 3 · function 3 · feasibility 7 · look 4 · skipped: score  
Under the three ending-balance tiles, draw one hairline axis from $0 to just past the 90th percentile. Mark the 10th percentile, median and 90th percentile as dots with labels, plus a small tick labelled 'Start' at the starting amount. Readers see at a glance how wide the spread is and whether the median ends above or below where they began.  
*Repeats the three tiles in another form.*

**D070 · Final values labelled at the right edge of the cone** — overall 4 · function 3 · feasibility 8 · look 4 · skipped: score  
Print the 90th percentile, median and 10th percentile balances at the right end of the cone chart (e.g. '$4.1M', '$1.8M', '$420K'). Use ECharts endLabel on three thin helper lines, since the stacked bands hold gaps, not levels. Widen the grid's right margin to fit. The outcome reads without hovering.  
*The tiles above already show these values.*

**D071 · Dashed starting-amount line across the cone** — overall 5 · function 4 · feasibility 9 · look 4 · to build  
Add a dashed hairline markLine at the starting amount, labelled 'Starting amount', across the cone chart. If the start is above the current cap, raise the y-axis cap to include it. Readers can see when and for how many runs the balance drops below where it began.  
*Shows when balances fall below the start with one markLine.*

**D072 · Sample runs that ran out drawn in faint red** — overall 5 · function 4 · feasibility 9 · look 5 · to build  
Of the 30 faint sample runs, draw the ones that hit zero in a faint loss red and the ones that lasted in the current faint grey. Split the legend into 'Sample runs that lasted' and 'Sample runs that ran out'. The failure rate then shows up in the chart itself, which fits the gain/loss colour rule.  
*Makes failures visible in the chart itself; cheap.*

**D073 · Legend swatches shaped like the marks they stand for** — overall 4 · function 3 · feasibility 8 · look 4 · skipped: score  
In the Monte Carlo legend, draw the median as a short 2px blue line, the two bands as filled blocks, and the sample runs as a thin grey line. Make the sample swatch darker than the chart's 16% grey, which is nearly invisible on paper today. All four are identical squares now. Readers can then match each legend entry to the chart without guessing.  
*Fixes a nearly invisible swatch; minor.*

**D074 · Plain axis labels and a dollar-unit tag on the cone** — overall 5 · function 4 · feasibility 9 · look 4 · to build  
Label the cone's x axis 'Now, 5 yrs, 10 yrs…' with the axis name 'Years from now' instead of bare numbers. Add a small muted tag under the chart title saying 'Future dollars' or 'Today's dollars, adjusted for inflation' to match the header toggle. Readers know what the axes mean before reading the method note.  
*Clear axes and money basis for little work.*

**D075 · Depth bars in the crises table** — overall 4 · function 3 · feasibility 8 · look 4 · skipped: score  
In the 'Lowest point' and 'SPY's lowest point' cells, add a thin loss-red bar under the percentage, with length set by the size of the drop on one shared scale (−55% is 55% of the cell width). The portfolio and SPY then compare at a glance in every crisis row, without reading two numbers.  
*A minor aid in a dense table.*

**D076 · Fade old results while new ones load** — overall 5 · function 4 · feasibility 8 · look 4 · to build  
Right now, when results are already on screen and a new load starts (adding a chip, flipping Inflation-adjusted, running again), the old charts stay at full strength and only a 'Loading…' line changes. While loading, fade the results panel (#results, #mc-results, #profile) to about 45% with aria-busy, and run a thin ink line slowly across its top hairline. Restore it when the new data is drawn. Under reduced motion the line stays still.  
*Makes reloading visible instead of quietly stale.*

**D077 · Loading placeholders shaped like the real results** — overall 4 · function 3 · feasibility 6 · look 4 · skipped: score  
The Backtester placeholder is three plain grey bars and the Creator profile has no placeholder at all, so it shows nothing for seconds while new tickers load. Rebuild #bt-skeleton to match the real layout: the label rail stub, a row of toolbar pills, a tall chart, then two summary columns. Make #mc-skeleton a half dial, three figure tiles and a cone. Add a #profile-skeleton (title line, treemap block, figures grid) that creator.js shows while showProfile loads. When the data arrives, the real content fades in over the placeholder so nothing jumps.  
*More markup to maintain for a brief state.*

**D078 · Buttons that show they are working** — overall 4 · function 3 · feasibility 8 · look 3 · skipped: score  
Compare, Save portfolio and Run simulation only drop to 60% opacity while busy. Instead, the button keeps its width and swaps its label for a small spinner and a verb: 'Comparing…', 'Checking tickers…', 'Running…'. Then it returns to its label. One small helper, busy(button, text), in visuals.js does this and is used by all three tabs. Under reduced motion it shows three static dots instead of a spinner.  
*The status line already says what is happening.*

**D079 · Progress bar and Stop button for long simulations** — overall 4 · function 4 · feasibility 6 · look 3 · skipped: score  
A 1,000,000-run simulation takes about ten seconds and shows only 'Running 1,000,000 simulations…'. simulate() already works year by year, so it can report progress after each year. The worker passes that to the tab, which fills a hairline bar under the button with 'Year 12 of 30'. Beside the bar, a quiet Stop button ends the worker and puts back the previous results. Shown only for runs of 50,000 or more.  
*Matters only for the largest runs.*

**D080 · Plain error messages with a Try again button** — overall 4 · function 5 · feasibility 7 · look 3 · skipped: repeats F085  
Load failures show as a red line, and one of them is meant for the developer ('Check that it is deployed and that PROXY\_URL in js/data.js is its address'). Replace these with a calm message in a hairline frame. It says what happened in plain words ('We couldn't reach the price service'), gives one line on what to do, and has a Try again button that sends the form again. Use the status codes the Worker already returns for specific wording: 404 'Check the spelling, or search by company name'; 429 'The price service is busy; try again in a few minutes'.  
*Overlaps F085; fold the plain rewrite of the developer-facing proxy message into it.*

**D081 · Mark the chip that failed to load** — overall 4 · function 4 · feasibility 7 · look 4 · skipped: score  
When one of several Backtester tickers fails, its chip still looks normal and the reason only appears in the status line. Give the failed chip a red outline and a small '!' in place of its sparkline, with the reason as its tooltip and accessible name. Tapping the '!' tries that ticker again; the ✕ removes it as before. The other lines keep drawing.  
*Helpful, but the status line already names the failure.*

**D082 · Chips grow in and shrink out, and Backspace asks twice** — overall 4 · function 3 · feasibility 7 · look 4 · skipped: score  
Chips appear and vanish instantly, and one Backspace in an empty box removes the last chip with no warning. New chips scale up from 90% and fade in. Removed chips shrink to zero width before they go, so the rest slide over. The first Backspace marks the last chip with an ink outline, and only the second removes it, like Gmail recipients. Under reduced motion there is no animation, but the two-step Backspace stays.  
*Two-step Backspace prevents slips; the animation is optional.*

**D083 · Holding rows open and close smoothly, with Undo** — overall 4 · function 4 · feasibility 7 · look 4 · skipped: score  
In the Portfolio Creator, 'Add holding' pops a row in and 'Remove' deletes it at once. New rows open from zero height and the cursor lands in their ticker box. Removed rows fold shut, and the existing toast offers 'Removed BND · Undo', which puts the row back with its ticker and weight in the same place. Under reduced motion rows appear and disappear instantly, and Undo stays.  
*Undo for removed rows is the useful part.*

**D084 · Clear save confirmation with a shortcut onward** — overall 5 · function 4 · feasibility 8 · look 4 · to build  
After 'Save portfolio' the only sign of success is a line of status text below the button. For about 1.5 seconds the button itself turns into 'Saved' with the same drawn tick the fields use. A toast then offers 'Saved 60/40 · Open in Backtester', which calls the existing addToCompare(name). The status text stays for screen readers.  
*Clear success and a natural next step through addToCompare.*

**D085 · Toast that waits while you read it** — overall 4 · function 3 · feasibility 8 · look 3 · skipped: score  
The Undo toast vanishes after 6 seconds even if the pointer or focus is on it. Pause its timer while it is hovered or focused. Show the time left as a thin line that shrinks along its bottom edge. Add a small ✕, let Escape close it, and on phones let a downward swipe dismiss it. Under reduced motion the countdown line is hidden and the timer still pauses.  
*Pausing on hover or focus is an accessibility nicety.*

**D086 · Search box says when it is searching or finds nothing** — overall 5 · function 4 · feasibility 8 · look 3 · to build  
While the ticker search waits for Yahoo there is no sign of activity. When nothing matches (for example 'apple inc', which has a space), the list just closes. Add a faint 'Searching…' row with a softly pulsing dot while the request is out. Show 'No matches for "apple inc". Try the ticker symbol.' when there are no results. Show 'Search is unavailable; type the exact symbol' when the proxy can't be reached. Applies to every box using attachTickerSearch.  
*Explains silent empty search results.*

**D087 · Hover only for mice, and a press feel for every button** — overall 4 · function 2 · feasibility 9 · look 4 · skipped: repeats D020  
The black Compare/Save/Run buttons, the white 'quiet' buttons, chip ✕ and segmented buttons have no hover or pressed look. Meanwhile, hover rules on menu links and dropdown rows stick after a tap on phones. Put all hover rules inside @media (hover: hover). Add one shared set of states: primary buttons lighten slightly on hover, quiet buttons get the wash background, and everything shrinks to 97% for 80 ms when pressed. The ink-only palette stays.  
*Mostly D020; the hover-only media query is the extra.*

**D088 · Bigger tap targets on touch screens** — overall 5 · function 4 · feasibility 9 · look 2 · to build  
Several controls are too small for a finger: the chip ✕ is 22 px, segmented buttons are about 30 px tall, and the field clear ✕ is 20 px. Under @media (pointer: coarse), widen their tap area to at least 40 px with invisible padding, so they look the same. Also make suggestion and dropdown rows 3 rem tall and give dotted glossary words extra vertical tap room.  
*Fixes small touch targets in CSS only.*

**D089 · Glossary definitions that open with a tap on phones** — overall 6 · function 5 · feasibility 7 · look 2 · to build  
Definitions open on pointerover and close on pointerout. On a phone that means the popover flashes and disappears as the finger lifts, and iPhone buttons don't take focus, so it never stays open. For touch input, a tap opens the definition and keeps it open. Tapping elsewhere, scrolling or tapping the word again closes it. On touch it sits under the word so the finger doesn't hide it. Mouse and keyboard behaviour is unchanged.  
*Definitions are unusable on phones today.*

**D090 · Stop iPhone zooming in on small boxes** — overall 5 · function 3 · feasibility 9 · look 3 · to build  
The From/To date boxes (0.8125rem) and the inflation country search (0.875rem) use text under 16 px. iPhone Safari zooms the whole page when they are tapped and leaves it zoomed. Under @media (pointer: coarse), set those inputs to 1rem and adjust their widths so the toolbar and header pill still fit.  
*Stops iPhone auto-zoom with CSS.*

**D091 · Growth toolbar that fits on a phone** — overall 6 · function 4 · feasibility 8 · look 5 · to build  
On a 375 px screen the Date range frame runs past the right edge, so the To date is cut off, and the frames wrap unevenly. Under 40rem: each labelled frame (.notch) takes the full width, the Time horizon buttons share the width evenly, From and To sit side by side at 50% each, and Step and Scale share one row. The labelled-frame look stays.  
*Fixes the cut-off To date on phones.*

**D092 · Wide tables that show they scroll sideways** — overall 3 · function 4 · feasibility 8 · look 4 · skipped: repeats D019  
On phones the Statistics, monthly returns, correlation and past-crises tables cut off the right column mid-number with no hint that there is more. Make the row-label column sticky so names stay put while numbers scroll. Add soft shadows at whichever edge has more content, done in CSS only with background-attachment: local on .table-scroll, so no script is needed.  
*Same as D019.*

**D093 · Page scrolling doesn't get stuck on charts** — overall 5 · function 4 · feasibility 6 · look 2 · to build  
The mouse wheel over the growth or drawdown chart always zooms. So when you scroll down the Backtester and the pointer passes over a chart, the page stops and the chart zooms instead. If the page was scrolled within the last 400 ms, let the wheel keep scrolling the page. Zooming starts once the pointer has rested on the chart. The first time someone hovers a chart, show a small 'Scroll to zoom' label that fades after a few seconds. Zoom itself works as now.  
*Wheel zoom hijacking page scroll is a real annoyance.*

**D094 · Pinch to zoom the charts on phones** — overall 4 · function 4 · feasibility 4 · look 2 · skipped: score  
On touch screens the growth and drawdown charts can't be zoomed or moved: a drag scrolls the page and a pinch zooms the whole site. Set touch-action: pan-y on the two chart boxes so one finger still scrolls the page. Turn a two-finger pinch into a change of date range through the existing setSpan(), and a two-finger drag into a sideways move. A double-tap resets to 1Y, like the desktop double-click.  
*Fiddly gesture code; phones can use the presets and dates.*

**D095 · Side menu that behaves like a phone menu** — overall 4 · function 4 · feasibility 7 · look 4 · skipped: repeats D012  
Under 60rem the side menu floats over the page with a shadow. Only Escape or a link closes it, and the page behind still scrolls. Add a faint paper-coloured layer over the page that closes the menu when tapped, close on a left swipe, and stop the page scrolling while the menu is open. Move focus to the current tab's link on open and back to the button on close. Once the page is scrolled, also give the fixed menu button a frosted paper background and a hairline, because it currently covers headings (it hid 'Name' in the Creator).  
*Mostly D012; fold the scroll lock and focus return into it.*

**D096 · Soft crossfade between tabs** — overall 3 · function 1 · feasibility 6 · look 3 · skipped: score  
Switching tabs swaps sections instantly and jumps to the top. Wrap showTab() in document.startViewTransition where the browser supports it: a 180 ms crossfade with the new section rising 8 px, while the current-tab highlight in the menu slides to its new link. Browsers without support and reduced-motion users get today's instant switch.  
*Decorative, and the snapshots can fight chart resizing.*

**D097 · Numbers move from their old value, and changes flash** — overall 5 · function 3 · feasibility 7 · look 5 · to build  
countUp() always rolls figures up from zero. So every period click (1Y to 3Y) makes the summary figures, profile facts and tiles race up from $0, which is noisy and hides what changed. Count from the value already shown to the new one. Give any figure whose shown value changed a brief soft wash behind it (300 ms) so the eye catches what moved. Under reduced motion, figures update instantly with no flash.  
*Counting up from zero on every period click is noisy.*

**D098 · Money boxes read the amount back as you type** — overall 3 · function 4 · feasibility 8 · look 3 · skipped: repeats D066  
The Monte Carlo money boxes show raw digits ('1000000'), which are hard to read at a glance. Add a money option to liveField. While the value is valid, the help line under the box reads it back ('$1,000,000 · 1 million', '$40,000 a year') instead of repeating the allowed range. The range only shows when the value is out of bounds.  
*Same as D066.*

**D099 · Mark Monte Carlo results as out of date after edits** — overall 5 · function 5 · feasibility 8 · look 3 · to build  
If you change the withdrawal or years after a run, the old dial and cone stay as if they still matched the form. When any input changes after a run, fade #mc-results slightly and show a hairline note at its top: 'These results are for the previous settings. Run again to update.' The note's button runs the form again. Running again or putting the old values back clears it.  
*Prevents misreading results that no longer match the form.*

**D100 · Point to the exact box that needs fixing** — overall 5 · function 4 · feasibility 7 · look 3 · to build  
When Save portfolio or Run simulation is refused, the reason appears as one sentence in the status line below the form, for example 'Every holding needs a weight above 0' or 'Check the amounts…'. The user then has to hunt for the box. readForm() and the Monte Carlo check also return which input is at fault. That box is scrolled into view, focused, shaken and outlined red, reusing liveField's existing shake and .bad styles, and the status line names the field.  
*Points users straight at the field that needs fixing.*
