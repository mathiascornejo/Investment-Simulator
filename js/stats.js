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
// A week of slack: a "1 year" window starts a few days late when its first day is a weekend or holiday.
export function cagr(points) {
  const days = (Date.parse(points.at(-1).date) - Date.parse(points[0].date)) / 864e5;
  return days < 365.25 - 7 ? null : (1 + totalReturn(points)) ** (365.25 / days) - 1;
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

// Daily returns of two series on the dates both have: [[a, b], ...], plus the sums beta and correlation need.
function paired(points, other) {
  const dated = (series) => series.slice(1).map((p, i) => [p.date, p.adjClose / series[i].adjClose - 1]);
  const byDate = new Map(dated(other));
  const pairs = dated(points).filter(([date]) => byDate.has(date)).map(([date, r]) => [r, byDate.get(date)]);
  if (pairs.length < 2) return null;
  const meanA = mean(pairs.map(([a]) => a));
  const meanB = mean(pairs.map(([, b]) => b));
  const sum = (f) => pairs.reduce((total, pair) => total + f(...pair), 0);
  return { cov: sum((a, b) => (a - meanA) * (b - meanB)), varA: sum((a) => (a - meanA) ** 2), varB: sum((_, b) => (b - meanB) ** 2) };
}

// Sensitivity to the benchmark, from daily returns on the dates both series have.
export function beta(points, benchmark) {
  const p = paired(points, benchmark);
  return p ? p.cov / p.varB : NaN;
}

// How closely two series' daily returns move together, from -1 (opposite) to 1 (in step).
export function correlation(points, other) {
  const p = paired(points, other);
  return p ? p.cov / Math.sqrt(p.varA * p.varB) : NaN;
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

// Is the gap between two lines more than luck? A 95% confidence range for the yearly return gap (A minus B),
// from a paired t-test on the calendar months both have in full: 12 x (mean +/- t x sd / sqrt(months)) of the
// monthly differences. It treats each month as independent. Takes periodReturns(points, 7) of each; null under 6 months.
export function gapRange(monthsA, monthsB) {
  const other = new Map(monthsB.filter((m) => !m.partial).map((m) => [m.period, m.value]));
  const diffs = monthsA.filter((m) => !m.partial && other.has(m.period)).map((m) => m.value - other.get(m.period));
  if (diffs.length < 6) return null;
  // Student's t for 95% two-sided, by the Cornish-Fisher expansion: within 0.2% of the printed table from 5 degrees of freedom up.
  const [z, df] = [1.959964, diffs.length - 1];
  const t = z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3);
  const [m, margin] = [mean(diffs), (t * stdev(diffs)) / Math.sqrt(diffs.length)];
  return { months: diffs.length, gap: 12 * m, low: 12 * (m - margin), high: 12 * (m + margin) };
}

// Round, evenly spaced ticks for a percent axis covering lo to hi (fractions: 0.05 is 5%). Steps are 1, 2, 3
// or 5 times a power of ten, as ECharts picks them; `decimals` is what a label needs so no two ticks read alike.
export function niceAxis(lo, hi, splitNumber = 5) {
  // A flat line, or values equal but for rounding noise (a 100% SPY portfolio next to SPY), still gets an axis.
  if (!(hi - lo > 1e-6)) [lo, hi] = [lo - 0.01, hi + 0.01];
  const raw = (hi - lo) / splitNumber;
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  const tidy = (x) => +x.toFixed(12); // drops floating-point dust such as 0.30000000000000004
  const interval = tidy((f < 1.5 ? 1 : f < 2.5 ? 2 : f < 4 ? 3 : f < 7 ? 5 : 10) * power);
  const min = tidy(Math.floor(lo / interval + 1e-9) * interval);
  const max = tidy(Math.ceil(hi / interval - 1e-9) * interval);
  // The step in percentage points is 1, 2, 3 or 5 times a power of ten: 0.2 points needs one decimal, 0.05 two.
  const decimals = Math.max(0, -Math.floor(Math.log10(interval * 100) + 1e-9));
  return { min, max, interval, decimals };
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
