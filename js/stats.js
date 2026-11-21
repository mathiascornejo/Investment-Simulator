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

// Each fall below a previous high, oldest first: the high's date, the lowest point (date and depth, as in drawdowns()),
// and the first date back at the high, or null if it hasn't got back yet.
export function drawdownEpisodes(points) {
  const out = [];
  let peak = points[0];
  let fall = null;
  for (const p of points.slice(1)) {
    if (p.adjClose >= peak.adjClose) {
      if (fall) out.push({ ...fall, recovery: p.date });
      [peak, fall] = [p, null];
      continue;
    }
    const depth = p.adjClose / peak.adjClose - 1;
    if (!fall) fall = { peak: peak.date, trough: p.date, depth };
    else if (depth < fall.depth) Object.assign(fall, { trough: p.date, depth });
  }
  if (fall) out.push({ ...fall, recovery: null });
  return out;
}

// Lowest, median and highest of a list of numbers.
export function spread(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { low: sorted[0], median, high: sorted.at(-1) };
}

// The same date `years` earlier ("2021-06-30" -> "2018-06-30"); a 29 Feb that doesn't exist still sorts right.
const yearsBack = (date, years) => `${+date.slice(0, 4) - years}${date.slice(4)}`;

// For each day on or after `from`: the annualised return over the `years` years up to it, starting from the
// last day on or before the same date `years` earlier. Days with less history than that before them are left out.
export function rollingReturns(points, years, from = "") {
  const out = [];
  let start = 0;
  for (const p of points) {
    const back = yearsBack(p.date, years);
    if (p.date < from || points[0].date > back) continue;
    while (points[start + 1].date <= back) start++;
    out.push({ date: p.date, value: cagr([points[start], p]) });
  }
  return out;
}

// Every holding period of `years` years from one month-end to the same month-end `years` later (the last
// month-end is the latest price): how many there were, the share that lost money, and the worst, median and best
// annualised return. Null when the history is shorter than `years`.
export function holdingPeriods(points, years) {
  const monthEnds = points.filter((p, i) => points[i + 1]?.date.slice(0, 7) !== p.date.slice(0, 7));
  const byMonth = new Map(monthEnds.map((p) => [p.date.slice(0, 7), p]));
  const returns = monthEnds.flatMap((p) => {
    const end = byMonth.get(yearsBack(p.date, -years).slice(0, 7));
    return end ? [(end.adjClose / p.adjClose) ** (1 / years) - 1] : [];
  });
  if (!returns.length) return null;
  return { count: returns.length, lossShare: returns.filter((r) => r < 0).length / returns.length, ...spread(returns) };
}

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
  return { n: pairs.length, meanA, meanB, cov: sum((a, b) => (a - meanA) * (b - meanB)), varA: sum((a) => (a - meanA) ** 2), varB: sum((_, b) => (b - meanB) ** 2) };
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

// Every figure measured against the benchmark, from daily returns on the dates both have (NaN when they share
// under two). The risk-free rate is 0%, as in sharpe(). alpha: Jensen's, annualised. trackingError: st. dev. of the
// daily differences x sqrt(252); their sum of squares is varA + varB - 2 cov. informationRatio: NaN when the
// line is the benchmark itself (no difference to measure).
export function relative(points, benchmark) {
  const p = paired(points, benchmark);
  if (!p) return { beta: NaN, alpha: NaN, rSquared: NaN, trackingError: NaN, informationRatio: NaN };
  const b = p.cov / p.varB;
  const trackingError = Math.sqrt((Math.max(0, p.varA + p.varB - 2 * p.cov) / (p.n - 1)) * TRADING_DAYS);
  return {
    beta: b,
    alpha: (p.meanA - b * p.meanB) * TRADING_DAYS,
    rSquared: p.cov ** 2 / (p.varA * p.varB),
    trackingError,
    informationRatio: trackingError > 1e-9 ? ((p.meanA - p.meanB) * TRADING_DAYS) / trackingError : NaN,
  };
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

// The value a share p of a sorted list sits at or below, interpolating between neighbours (p 0.5 is the median).
export function percentile(sorted, p) {
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.ceil(at)] - sorted[lo]) * (at - lo);
}

// Historical value at risk and expected shortfall at 95%, from full calendar months (periodReturns(points, 7)):
// the 5th percentile of the monthly returns, and the average of the months at or below it. Null under 24 months.
export function tailRisk(months) {
  const sorted = months.filter((m) => !m.partial).map((m) => m.value).sort((a, b) => a - b);
  if (sorted.length < 24) return null;
  const valueAtRisk = percentile(sorted, 0.05);
  return { valueAtRisk, expectedShortfall: mean(sorted.filter((v) => v <= valueAtRisk)) };
}

// Average, sample standard deviation, and the sample-adjusted skewness and excess kurtosis (as a spreadsheet's
// SKEW and KURT give them) of a list of numbers. Needs at least 4.
export function moments(values) {
  const n = values.length;
  const [m, sd] = [mean(values), stdev(values)];
  const z = (power) => values.reduce((total, x) => total + ((x - m) / sd) ** power, 0);
  return {
    mean: m,
    sd,
    skewness: (n / ((n - 1) * (n - 2))) * z(3),
    excessKurtosis: ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * z(4) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)),
  };
}

// Share of a bell curve (standard normal) below z. Abramowitz and Stegun 7.1.26: off by under 0.0000002.
export function normalCdf(z) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// Counts of values in buckets `width` wide, from the lowest value's bucket to the highest's, empty ones included:
// [{ from, count }], where a bucket holds from <= x < from + width.
export function histogram(values, width) {
  const bucket = (x) => Math.floor(x / width + 1e-9); // the nudge keeps 0.03 in the 3% bucket despite floating-point dust
  const [lo, hi] = [Math.min(...values.map(bucket)), Math.max(...values.map(bucket))];
  const counts = Array.from({ length: hi - lo + 1 }, (_, i) => ({ from: +((lo + i) * width).toFixed(12), count: 0 }));
  for (const x of values) counts[bucket(x) - lo].count++;
  return counts;
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
  const tail = tailRisk(periodReturns(points, 7, nextDate));
  return {
    totalReturn: totalReturn(points),
    cagr: cagr(points),
    volatility: volatility(returns),
    maxDrawdown: maxDrawdown(points),
    bestYear: fullYears.length ? Math.max(...fullYears) : null,
    worstYear: fullYears.length ? Math.min(...fullYears) : null,
    sharpe: sharpe(returns),
    sortino: sortino(returns),
    ...relative(points, benchmark), // beta, alpha, rSquared, trackingError, informationRatio
    valueAtRisk: tail?.valueAtRisk ?? null,
    expectedShortfall: tail?.expectedShortfall ?? null,
    finalValue: startValue * (1 + totalReturn(points)),
  };
}
