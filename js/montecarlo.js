// Monte Carlo simulation and historical crisis tests. Pure maths: no DOM, no network.
import { windowOf, periodReturns } from "./stats.js";

// Peak-to-trough dates of the S&P 500 in each crisis.
export const CRISES = [
  { name: "Dot-com crash", start: "2000-03-24", end: "2002-10-09" },
  { name: "2008 financial crisis", start: "2007-10-09", end: "2009-03-09" },
  { name: "2020 pandemic crash", start: "2020-02-19", end: "2020-03-23" },
  { name: "2022 rate-rise sell-off", start: "2022-01-03", end: "2022-10-12" },
];

// Follows one balance through a list of monthly returns. Each month: take the withdrawal, then
// apply the return. The yearly withdrawal is split into 12 and grows by `growth` each year.
// A contribution (flat) is added first: 1/12 of `annualContribution` every month, or all of it in the
// first month of each year when `contributeMonthly` is false.
// A yearly `fee` (0.01 = 1%) is taken monthly with the return: what is left is (1 - fee)^(1/12).
// Returns the balance at the end of every 12 months (index 0 is the start) and the month the
// money ran out (null if it never did).
export function walk(monthlyReturns, startValue, annualWithdrawal, growth, annualContribution = 0, contributeMonthly = true, fee = 0) {
  const yearly = [startValue];
  const keep = (1 - fee) ** (1 / 12);
  let value = startValue;
  let ranOutAt = null;
  monthlyReturns.forEach((r, m) => {
    if (ranOutAt === null) {
      value += contribution(annualContribution, contributeMonthly, m);
      value -= (annualWithdrawal / 12) * (1 + growth) ** Math.floor(m / 12);
      if (value <= 0.005) {
        value = 0;
        ranOutAt = m;
      } else {
        value *= (1 + r) * keep;
      }
    }
    if ((m + 1) % 12 === 0) yearly.push(value);
  });
  return { yearly, ranOutAt, final: value };
}

const contribution = (annual, monthly, m) => (monthly ? annual / 12 : m % 12 === 0 ? annual : 0);

// Value below which the fraction p of a sorted list falls (linear interpolation).
export function percentile(sorted, p) {
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.ceil(at)] - sorted[lo]) * (at - lo);
}

// A small repeatable random number generator (mulberry32): the same seed always gives the same numbers,
// and a seed is a plain number, so it can cross into the Web Worker where a function cannot.
export function mulberry32(seed) {
  const state = new Int32Array([seed]); // a typed array wraps at 32 bits and, unlike a plain variable, is fast to rewrite
  return () => {
    state[0] += 0x6d2b79f5;
    const a = state[0];
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Average and spread (sample standard deviation) of the monthly log returns, ln(1 + r).
export function logStats(monthlyReturns) {
  const logs = monthlyReturns.map(Math.log1p);
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, logs.length - 1));
  return { mean, sd };
}

// Both curves below pick a random point inside a circle of radius 1 (u, v from -1 to 1, w = u² + v² below 1),
// which avoids the slower sine and cosine. Polar methods: Marsaglia for the bell curve, Bailey for Student-t.
// Bell-curve draws with average 0 and spread 1: each point gives two draws, the second kept for the next call.
function bellCurve(random) {
  const spare = new Float64Array(1); // a typed array, like mulberry32's state, is fast to rewrite
  let hasSpare = false;
  return () => {
    if (hasSpare) { hasSpare = false; return spare[0]; }
    let u, v, w;
    do { u = 2 * random() - 1; v = 2 * random() - 1; w = u * u + v * v; } while (w >= 1 || w === 0);
    const scale = Math.sqrt((-2 * Math.log(w)) / w);
    spare[0] = v * scale;
    hasSpare = true;
    return u * scale;
  };
}
// Fat-tailed draws (Student-t, 4 degrees of freedom) scaled to spread 1: t = u √(4 (w^(-1/2) - 1) / w), whose
// spread of √2 is then scaled by √((4 - 2) / 4).
function fatTailed(random) {
  return () => {
    let u, v, w;
    do { u = 2 * random() - 1; v = 2 * random() - 1; w = u * u + v * v; } while (w >= 1 || w === 0);
    return u * Math.sqrt((4 / Math.sqrt(w) - 4) / w) * Math.SQRT1_2;
  };
}

// Returns draw(run): the next month's return for that run.
//   "month"  one real month at random, with replacement (historical bootstrap)
//   "block"  stationary bootstrap (Politis and Romano): each month a run has a 1-in-`blockLength` chance of jumping to
//            a random real month, otherwise it takes the next real month (wrapping round), so bad months stay bunched
//   "normal" / "t"  a made-up month from a bell curve / fat-tailed curve with the history's log-return average and spread
// simulate() calls draw() once for every month of every run, in the same order, so two simulations with the same
// seed get the same months even when a run fails in one and not the other.
export function monthDrawer({ monthlyReturns, method = "month", blockLength = 12, random = Math.random, runs = 1 }) {
  const n = monthlyReturns.length;
  if (method === "block") {
    const at = new Int32Array(runs).fill(-1); // each run's place in the history; -1 before its first month
    const jump = 1 / blockLength;
    return (run) => {
      let i = at[run] + 1;
      if (i === 0 || random() < jump) i = Math.floor(random() * n);
      else if (i === n) i = 0;
      at[run] = i;
      return monthlyReturns[i];
    };
  }
  if (method === "normal" || method === "t") {
    const { mean, sd } = logStats(monthlyReturns);
    const shape = (method === "t" ? fatTailed : bellCurve)(random);
    return () => Math.expm1(mean + sd * shape());
  }
  return () => monthlyReturns[Math.floor(random() * n)];
}

// Runs many possible futures. Each run builds its months with monthDrawer() from `monthlyReturns` (the
// portfolio's real history). `prefix` is a list of real months every run replays first (a crisis), and `fee`
// a yearly fee taken monthly. Pass a `seed` to make the runs repeatable, and the same seed to compare two setups
// on the same random draws. `samples` runs are also returned year by year (paths), for drawing individual futures,
// and ranOut[y] counts the runs that had run out by the end of year y.
export function simulate({ monthlyReturns, startValue, annualWithdrawal, growth, years, runs, samples = 0, seed, random = seed === undefined ? Math.random : mulberry32(seed), method = "month", blockLength = 12, prefix = [], fee = 0, annualContribution = 0, contributeMonthly = true }) {
  // Year by year, all runs at once, in typed arrays: one balance per run (never a list per run) and a native numeric sort.
  const draw = monthDrawer({ monthlyReturns, method, blockLength, random, runs });
  const keep = (1 - fee) ** (1 / 12);
  const balance = new Float64Array(runs).fill(startValue);
  const failed = new Uint8Array(runs);
  const bands = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  const paths = Array.from({ length: Math.min(samples, runs) }, () => [startValue]);
  const ranOut = [0];
  const record = () => {
    const sorted = Float64Array.from(balance).sort();
    for (const key of Object.keys(bands)) bands[key].push(percentile(sorted, key.slice(1) / 100));
  };
  record();
  let failures = 0;
  for (let year = 0; year < years; year++) {
    const monthly = (annualWithdrawal / 12) * (1 + growth) ** year;
    for (let run = 0; run < runs; run++) {
      let value = balance[run];
      for (let m = 0; m < 12; m++) {
        const month = year * 12 + m;
        const drawn = draw(run); // drawn even when unused (run out, or replaying a crisis) so the random numbers line up across setups
        if (failed[run]) continue;
        value += contribution(annualContribution, contributeMonthly, m); // same order as walk(): contribute, withdraw, then apply the return
        value -= monthly;
        if (value <= 0.005) { value = 0; failed[run] = 1; failures++; continue; }
        value *= (1 + (month < prefix.length ? prefix[month] : drawn)) * keep;
      }
      balance[run] = value;
    }
    ranOut.push(failures);
    record();
    paths.forEach((path, run) => path.push(balance[run]));
  }
  return { failureRate: failures / runs, bands, paths, ranOut };
}

// When the failing runs ran out, from simulate()'s ranOut counts: the first year any did, and the year by
// which half of them had. Null when none ran out.
export function failureYears(ranOut) {
  const total = ranOut.at(-1);
  if (!total) return null;
  return { first: ranOut.findIndex((c) => c > 0), half: ranOut.findIndex((c) => c >= total / 2) };
}

// A crisis replayed as month-long steps: the series' real returns from the crisis start to its low point, in
// steps of one month counted from the start date (the last step ends on the low date), so together they give
// exactly the peak-to-trough fall. Each step uses the last close on or before its date. Null when the series
// doesn't cover the whole crisis.
export function crisisMonths(points, { start, end }) {
  if (!points.length || points[0].date > start || points.at(-1).date < end) return null;
  const steps = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / (30.44 * 864e5)));
  const dates = Array.from({ length: steps }, (_, i) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    return d.toISOString().slice(0, 10);
  }).concat(end);
  const close = (date) => points.findLast((p) => p.date <= date).adjClose;
  return dates.slice(1).map((date, i) => close(date) / close(dates[i]) - 1);
}

// How a series behaved in one crisis: its lowest point relative to the day the crisis began, and
// when it got back to that starting level. Null when the series has no data at the crisis start.
export function crisisTest(points, { start, end }) {
  if (!points.length || points[0].date > start) return null;
  const during = windowOf(points, start, end).points;
  if (during.length < 2) return null;
  const base = during[0].adjClose;
  const low = during.reduce((a, b) => (b.adjClose < a.adjClose ? b : a));
  const recovery = points.find((p) => p.date > low.date && p.adjClose >= base);
  return { lowest: low.adjClose / base - 1, lowDate: low.date, recovered: recovery?.date ?? null };
}

// What actually happened to a balance that started on `startDate` and took the same withdrawals,
// following the series' real monthly returns from then to its last date.
export function historicalRun(points, startDate, startValue, annualWithdrawal, growth, annualContribution = 0, contributeMonthly = true, fee = 0) {
  const months = periodReturns(windowOf(points, startDate, "9999-12-31").points, 7);
  const { ranOutAt, final } = walk(months.map((m) => m.value), startValue, annualWithdrawal, growth, annualContribution, contributeMonthly, fee);
  return { final, ranOutIn: ranOutAt === null ? null : months[ranOutAt].period };
}
