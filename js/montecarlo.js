// Monte Carlo simulation and historical crisis tests. Pure maths: no DOM, no network.
import { windowOf, periodReturns, percentile } from "./stats.js";

export { percentile }; // lives in stats.js, which the Backtester also uses for value at risk

// Peak-to-trough dates of the S&P 500 (by closing price) in each crisis, oldest first (the Backtester's bands rely on the order).
// Each name starts with a word that can stand alone ("1987", "Dot-com") for when a band is too narrow for the whole name.
export const CRISES = [
  { name: "1987 crash", start: "1987-08-25", end: "1987-12-04" },
  { name: "1990 recession", start: "1990-07-16", end: "1990-10-11" },
  { name: "Dot-com crash", start: "2000-03-24", end: "2002-10-09" },
  { name: "2008 financial crisis", start: "2007-10-09", end: "2009-03-09" },
  { name: "2011 debt-ceiling sell-off", start: "2011-04-29", end: "2011-10-03" },
  { name: "2018 year-end sell-off", start: "2018-09-20", end: "2018-12-24" },
  { name: "2020 pandemic crash", start: "2020-02-19", end: "2020-03-23" },
  { name: "2022 rate-rise sell-off", start: "2022-01-03", end: "2022-10-12" },
  { name: "2025 tariff sell-off", start: "2025-02-19", end: "2025-04-08" },
];

// Older funds that follow the same index, used before a young fund's first day in crisis tests only.
// Chains are followed: VOO uses SPY, and before SPY's first day, VFINX.
export const PROXIES = { VOO: "SPY", IVV: "SPY", SPY: "VFINX", VTI: "VTSMX", BND: "VBMFX", VXUS: "VGTSX", QQQM: "QQQ" };
export const standIns = (ticker) => (PROXIES[ticker] ? [PROXIES[ticker], ...standIns(PROXIES[ticker])] : []);

// Lengthens a fund's daily total-return prices with its stand-ins, nearest first: before the fund's first date,
// each stand-in's prices, scaled so they join the later prices on that date (the stand-in's last close on or
// before it), so the stand-in's returns carry over unchanged. `used` says which stand-in covers dates before which
// day, for the label. A stand-in with no earlier prices is left out.
export function withStandIns(points, others) {
  let out = points;
  const used = [];
  for (const { ticker, points: other } of others) {
    const first = out[0].date;
    if (!other?.length || other[0].date >= first) continue;
    const scale = out[0].adjClose / other.findLast((p) => p.date <= first).adjClose;
    out = other.filter((p) => p.date < first).map((p) => ({ date: p.date, adjClose: p.adjClose * scale })).concat(out);
    used.push({ ticker, before: first });
  }
  return { points: out, used };
}

// Next year's withdrawal. "fixed": it rises by `growth` every year. "guardrails" (after Guyton and Klinger): the rise
// is skipped after a year the investments lost money; then, compared with the starting rate (withdrawal ÷ balance),
// a withdrawal above 120% of it is cut 10% and one below 80% of it is raised 10%.
export function nextWithdrawal(rule, withdrawal, growth, balance, startRate, yearReturn) {
  if (rule !== "guardrails") return withdrawal * (1 + growth);
  const next = yearReturn < 0 ? withdrawal : withdrawal * (1 + growth);
  const rate = next / balance;
  return rate > 1.2 * startRate ? next * 0.9 : rate < 0.8 * startRate ? next * 1.1 : next;
}

// Follows one balance through a list of monthly returns. Each month: take the withdrawal, then
// apply the return. The yearly withdrawal is split into 12 and changes each year by the `rule` (nextWithdrawal).
// A contribution (flat) is added first: 1/12 of `annualContribution` every month, or all of it in the
// first month of each year when `contributeMonthly` is false.
// A yearly `fee` (0.01 = 1%) is taken monthly with the return: what is left is (1 - fee)^(1/12).
// Returns the balance at the end of every 12 months (index 0 is the start) and the month the
// money ran out (null if it never did).
export function walk(monthlyReturns, { startValue, annualWithdrawal = 0, growth = 0, annualContribution = 0, contributeMonthly = true, fee = 0, rule = "fixed" }) {
  const yearly = [startValue];
  const keep = (1 - fee) ** (1 / 12);
  const startRate = annualWithdrawal / startValue;
  let value = startValue;
  let ranOutAt = null;
  let withdrawal = annualWithdrawal; // this year's
  let grew = 1; // this year's growth of the investments
  monthlyReturns.forEach((r, m) => {
    if (ranOutAt === null) {
      if (m > 0 && m % 12 === 0) {
        withdrawal = nextWithdrawal(rule, withdrawal, growth, value, startRate, grew - 1);
        grew = 1;
      }
      value += contribution(annualContribution, contributeMonthly, m);
      value -= withdrawal / 12;
      if (value <= 0.005) {
        value = 0;
        ranOutAt = m;
      } else {
        value *= (1 + r) * keep;
        grew *= (1 + r) * keep;
      }
    }
    if ((m + 1) % 12 === 0) yearly.push(value);
  });
  return { yearly, ranOutAt, final: value };
}

const contribution = (annual, monthly, m) => (monthly ? annual / 12 : m % 12 === 0 ? annual : 0);

// Every real start month (the Trinity-study method): walk() through the real months in their real order from each
// month that has the whole `years` ahead of it, oldest start first. Empty when the history is shorter than that.
export function everyStart(monthlyReturns, years, plan) {
  const span = years * 12;
  return Array.from({ length: Math.max(0, monthlyReturns.length - span + 1) }, (_, i) => walk(monthlyReturns.slice(i, i + span), plan));
}

// Share of a sorted list at or below x.
export function shareAtOrBelow(sorted, x) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
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
// and ranOut[y] counts the runs that had run out by the end of year y. `rule` is the withdrawal rule (nextWithdrawal);
// with "guardrails", spending gives the 10th, 50th and 90th percentile of what runs withdrew in each year (index 0 is
// year 1; a run that ran out withdrew only what was left, then nothing).
// perfectRates (when asked for) is, for every run, sorted, the first-year withdrawal as a share of the starting amount that
// would leave exactly 0 at the end with the fixed rule: 1 ÷ the sum over months of (that year's rise, (1 + growth)^year,
// ÷ 12 ÷ the growth of the investments before that month). A run runs out at any first-year withdrawal at or above its
// rate, so the share of rates at or below x is the failure rate at x. Exact only with no contributions.
export function simulate({ monthlyReturns, startValue, annualWithdrawal, growth, years, runs, samples = 0, seed, random = seed === undefined ? Math.random : mulberry32(seed), method = "month", blockLength = 12, prefix = [], fee = 0, annualContribution = 0, contributeMonthly = true, rule = "fixed", perfectRates = false }) {
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
  // Guardrails only: each run's yearly withdrawal, and what it withdrew this year.
  const withdrawal = rule === "guardrails" ? new Float64Array(runs).fill(annualWithdrawal) : null;
  const spent = withdrawal && new Float64Array(runs);
  const spending = { p10: [], p50: [], p90: [] };
  const startRate = annualWithdrawal / startValue;
  // Perfect rates only: each run's sum of withdrawal shares over growth so far, and its growth so far.
  const owed = perfectRates ? new Float64Array(runs) : null;
  const grown = owed && new Float64Array(runs).fill(1);
  let failures = 0;
  for (let year = 0; year < years; year++) {
    const planned = annualWithdrawal * (1 + growth) ** year;
    const share = (1 + growth) ** year / 12;
    for (let run = 0; run < runs; run++) {
      let value = balance[run];
      const monthly = (withdrawal ? withdrawal[run] : planned) / 12;
      let grew = 1;
      let taken = 0;
      for (let m = 0; m < 12; m++) {
        const month = year * 12 + m;
        const drawn = draw(run); // drawn even when unused (run out, or replaying a crisis) so the random numbers line up across setups
        const step = (1 + (month < prefix.length ? prefix[month] : drawn)) * keep;
        if (owed) { owed[run] += share / grown[run]; grown[run] *= step; } // whether or not this run has run out
        if (failed[run]) continue;
        value += contribution(annualContribution, contributeMonthly, m); // same order as walk(): contribute, withdraw, then apply the return
        taken += Math.min(monthly, value);
        value -= monthly;
        if (value <= 0.005) { value = 0; failed[run] = 1; failures++; continue; }
        value *= step;
        grew *= step;
      }
      balance[run] = value;
      if (withdrawal) {
        spent[run] = taken;
        if (!failed[run]) withdrawal[run] = nextWithdrawal(rule, withdrawal[run], growth, value, startRate, grew - 1);
      }
    }
    ranOut.push(failures);
    record();
    paths.forEach((path, run) => path.push(balance[run]));
    if (spent) {
      const sorted = Float64Array.from(spent).sort();
      for (const key of Object.keys(spending)) spending[key].push(percentile(sorted, key.slice(1) / 100));
    }
  }
  return {
    failureRate: failures / runs,
    bands,
    paths,
    ranOut,
    ...(withdrawal && { spending }),
    ...(owed && { perfectRates: Float64Array.from(owed, (x) => 1 / x).sort() }),
  };
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

// What actually happened to a balance that started on `startDate` and followed the same plan (walk()'s second
// argument), through the series' real monthly returns from then to its last date.
export function historicalRun(points, startDate, plan) {
  const months = periodReturns(windowOf(points, startDate, "9999-12-31").points, 7);
  const { ranOutAt, final } = walk(months.map((m) => m.value), plan);
  return { final, ranOutIn: ranOutAt === null ? null : months[ranOutAt].period };
}
