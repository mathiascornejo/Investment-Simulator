// Pure statistics on price series. No DOM, no network, so it runs under `node --test`.
// A series is [{ date: "YYYY-MM-DD", adjClose }], oldest first. adjClose includes dividends,
// so every return here is a total return.

const TRADING_DAYS = 252;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function stdev(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

// The part of a series between two dates (inclusive). The first point is the base: its value is
// the starting amount. `nextDate` is the date just after the window, used to tell whether the
// last calendar period in the window is complete.
export function windowOf(points, startDate, endDate) {
  const from = points.findIndex((p) => p.date >= startDate);
  const to = points.findLastIndex((p) => p.date <= endDate);
  if (from === -1 || to <= from) return { points: [], nextDate: undefined };
  return { points: points.slice(from, to + 1), nextDate: points[to + 1]?.date };
}

export const dailyReturns = (points) => points.slice(1).map((p, i) => p.adjClose / points[i].adjClose - 1);

export const totalReturn = (points) => points.at(-1).adjClose / points[0].adjClose - 1;

// Annualised return. Null for windows under a year: annualising a few months is misleading.
export function cagr(points) {
  const years = (Date.parse(points.at(-1).date) - Date.parse(points[0].date)) / (365.25 * 864e5);
  return years < 1 ? null : (1 + totalReturn(points)) ** (1 / years) - 1;
}

// How far below its previous peak the series sits on each date (0 at a new high, negative otherwise).
export function drawdowns(points) {
  let peak = -Infinity;
  return points.map((p) => {
    peak = Math.max(peak, p.adjClose);
    return { date: p.date, value: p.adjClose / peak - 1 };
  });
}

export const maxDrawdown = (points) => drawdowns(points).reduce((worst, d) => Math.min(worst, d.value), 0);

export const volatility = (returns) => stdev(returns) * Math.sqrt(TRADING_DAYS);

// shortcut: Sharpe and Sortino assume a 0% risk-free rate. Subtract a daily T-bill return
// (e.g. from FRED) from each return here once that data is wired in.
export const sharpe = (returns) => (mean(returns) * TRADING_DAYS) / volatility(returns);

export function sortino(returns) {
  const downside = Math.sqrt(mean(returns.map((r) => Math.min(r, 0) ** 2)) * TRADING_DAYS);
  return (mean(returns) * TRADING_DAYS) / downside;
}

// Sensitivity to the benchmark, from daily returns on the dates both series have.
export function beta(points, benchmark) {
  const dated = (series) => series.slice(1).map((p, i) => [p.date, p.adjClose / series[i].adjClose - 1]);
  const bench = new Map(dated(benchmark));
  const pairs = dated(points).filter(([date]) => bench.has(date)).map(([date, r]) => [r, bench.get(date)]);
  if (pairs.length < 2) return NaN;
  const meanA = mean(pairs.map(([a]) => a));
  const meanB = mean(pairs.map(([, b]) => b));
  const cov = pairs.reduce((sum, [a, b]) => sum + (a - meanA) * (b - meanB), 0);
  const varB = pairs.reduce((sum, [, b]) => sum + (b - meanB) ** 2, 0);
  return cov / varB;
}

// Return for each calendar period in the window. keyLength 4 groups by year ("2020"), 7 by month
// ("2020-03"). A period is partial when the window starts or stops part-way through it.
export function periodReturns(points, keyLength, nextDate) {
  const key = (date) => date.slice(0, keyLength);
  const out = [];
  let base = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const isLast = i === points.length - 1;
    if (!isLast && key(points[i + 1].date) === key(p.date)) continue;
    const startsInside = key(base.date) === key(p.date);
    const stopsEarly = isLast && (!nextDate || key(nextDate) === key(p.date));
    out.push({ period: key(p.date), value: p.adjClose / base.adjClose - 1, partial: startsInside || stopsEarly });
    base = p;
  }
  return out;
}

// Every headline number for one series over one window.
export function summarize(points, benchmark, nextDate, startValue = 10000) {
  const returns = dailyReturns(points);
  const fullYears = periodReturns(points, 4, nextDate).filter((y) => !y.partial).map((y) => y.value);
  return {
    totalReturn: totalReturn(points),
    cagr: cagr(points),
    volatility: volatility(returns),
    maxDrawdown: maxDrawdown(points),
    bestYear: fullYears.length ? Math.max(...fullYears) : null,
    worstYear: fullYears.length ? Math.min(...fullYears) : null,
    sharpe: sharpe(returns),
    sortino: sortino(returns),
    beta: beta(points, benchmark),
    finalValue: startValue * (1 + totalReturn(points)),
  };
}
