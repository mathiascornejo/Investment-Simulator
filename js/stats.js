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

// Your own money in a price series: `start` on the first day, then `monthly` at the close of the first trading day
// of every later month. A negative `monthly` is a withdrawal, never more than what is left. flows are dated as the
// investor sees them, for xirr(): money paid in is negative, money taken out and the ending balance positive.
export function withDeposits(points, start, monthly) {
  let balance = start;
  let paidIn = start;
  let takenOut = 0;
  const flows = [{ date: points[0].date, amount: -start }];
  for (let i = 1; i < points.length; i++) {
    balance *= points[i].adjClose / points[i - 1].adjClose;
    if (points[i].date.slice(0, 7) === points[i - 1].date.slice(0, 7)) continue;
    const amount = Math.max(monthly, -balance);
    balance += amount;
    if (amount > 0) paidIn += amount;
    else takenOut -= amount;
    if (amount) flows.push({ date: points[i].date, amount: -amount });
  }
  flows.push({ date: points.at(-1).date, amount: balance });
  return { flows, final: balance, paidIn, takenOut };
}

// The money-weighted return: the yearly rate at which every flow, discounted back to the first one, adds up to 0.
// Years are 365.25 days, as in cagr(), so with no deposits it equals the annualised return. Found by bisection;
// null when no rate between -99.99% and +1,000,000% a year fits.
export function xirr(flows) {
  const used = flows.filter((f) => f.amount !== 0);
  if (used.length < 2) return null;
  const years = used.map((f) => (Date.parse(f.date) - Date.parse(used[0].date)) / (365.25 * 864e5));
  const npv = (r) => used.reduce((sum, f, i) => sum + f.amount / (1 + r) ** years[i], 0);
  let lo = -0.9999;
  let hi = 1;
  const below = Math.sign(npv(lo));
  while (Math.sign(npv(hi)) === below && hi < 1e4) hi *= 10;
  if (Math.sign(npv(hi)) === below) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(npv(mid)) === below) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export const volatility = (returns) => stdev(returns) * Math.sqrt(TRADING_DAYS);

// The risk-free return over each step of `points` (the steps dailyReturns() measures), read off a price-like bill
// series such as USTBILL's, so in inflation-adjusted mode it is a real return like the line's. A date between two
// bill readings takes the latest one before it: interest can land a step late, but none is lost. Past the last
// reading, the bill keeps growing at its last daily rate. Null when the bill starts after the points do.
export function billReturns(points, bill) {
  if (!bill?.length || bill[0].date > points[0].date) return null;
  const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
  const [prev, last] = [bill.at(-2) ?? bill.at(-1), bill.at(-1)];
  const perDay = (last.adjClose / prev.adjClose) ** (1 / Math.max(1, days(prev.date, last.date)));
  let j = 0;
  const values = points.map(({ date }) => {
    if (date > last.date) return last.adjClose * perDay ** days(last.date, date);
    while (bill[j + 1]?.date <= date) j++;
    return bill[j].adjClose;
  });
  return values.slice(1).map((v, i) => v / values[i] - 1);
}

// Sharpe and Sortino take the risk-free return off each daily return first. rf: one per return (billReturns),
// or null for a 0% rate.
const excess = (returns, rf) => (rf ? returns.map((r, i) => r - rf[i]) : returns);

// A line that never moved (cash) took no risk, so it has no reward for risk to measure. Without this, the bill's
// calendar-day steps (three days' interest on a Monday) would be the only ups and downs left, and make up a big figure.
const still = (returns) => !(volatility(returns) > 1e-6);

export function sharpe(returns, rf = null) {
  if (still(returns)) return NaN;
  const x = excess(returns, rf);
  return (mean(x) * TRADING_DAYS) / volatility(x);
}

export function sortino(returns, rf = null) {
  if (still(returns)) return NaN;
  const x = excess(returns, rf);
  const downside = Math.sqrt(mean(x.map((r) => Math.min(r, 0) ** 2)) * TRADING_DAYS);
  return (mean(x) * TRADING_DAYS) / downside;
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
// under two). The risk-free rate is 0%. alpha: Jensen's, annualised. trackingError: st. dev. of the
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

// Is the gap between two lines more than luck? A 95% confidence range for the yearly growth gap (A minus B),
// from a paired t-test on the calendar months both have in full: 12 x (mean +/- t x sd / sqrt(months)) of the
// monthly differences in compounded growth, ln(1 + return). These add up over time, so the gap's sign always says
// which line grew more over those months; a plain average of returns can favour the bumpier one (+15% then -12%
// averages +1.5% a month but grows only 0.6%). It treats each month as independent. Takes periodReturns(points, 7)
// of each; null under 6 months.
export function gapRange(monthsA, monthsB) {
  const other = new Map(monthsB.filter((m) => !m.partial).map((m) => [m.period, Math.log1p(m.value)]));
  const diffs = monthsA.filter((m) => !m.partial && other.has(m.period)).map((m) => Math.log1p(m.value) - other.get(m.period));
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

// Every headline number for one series over one window. bill: a price-like T-bill series (USTBILL) for the
// risk-free rate in Sharpe and Sortino; without one, or when it starts too late, they use 0% and riskFree is null.
export function summarize(points, benchmark, nextDate, startValue = 10000, bill = null) {
  const returns = dailyReturns(points);
  const rf = billReturns(points, bill);
  const fullYears = periodReturns(points, 4, nextDate).filter((y) => !y.partial).map((y) => y.value);
  const tail = tailRisk(periodReturns(points, 7, nextDate));
  return {
    totalReturn: totalReturn(points),
    cagr: cagr(points),
    volatility: volatility(returns),
    maxDrawdown: maxDrawdown(points),
    bestYear: fullYears.length ? Math.max(...fullYears) : null,
    worstYear: fullYears.length ? Math.min(...fullYears) : null,
    sharpe: sharpe(returns, rf),
    sortino: sortino(returns, rf),
    riskFree: rf ? mean(rf) * TRADING_DAYS : null, // what Sharpe and Sortino took off, as a yearly rate
    ...relative(points, benchmark), // beta, alpha, rSquared, trackingError, informationRatio
    valueAtRisk: tail?.valueAtRisk ?? null,
    expectedShortfall: tail?.expectedShortfall ?? null,
    finalValue: startValue * (1 + totalReturn(points)),
  };
}
