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
// Returns the balance at the end of every 12 months (index 0 is the start) and the month the
// money ran out (null if it never did).
export function walk(monthlyReturns, startValue, annualWithdrawal, growth, annualContribution = 0, contributeMonthly = true) {
  const yearly = [startValue];
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
        value *= 1 + r;
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

// Runs many possible futures. Each one draws its months at random, with replacement, from
// `monthlyReturns` (the portfolio's real history), so it keeps the real mix of good and bad months.
// shortcut: months are drawn independently, which loses the way bad months cluster in a crisis.
// Draw blocks of consecutive months instead if failure rates look too optimistic.
// `samples` runs are also returned year by year (paths), for drawing individual futures.
export function simulate({ monthlyReturns, startValue, annualWithdrawal, growth, years, runs, samples = 0, random = Math.random, annualContribution = 0, contributeMonthly = true }) {
  // Year by year, all runs at once, in typed arrays: one balance per run (never a list per run) and a native numeric sort.
  const n = monthlyReturns.length;
  const balance = new Float64Array(runs).fill(startValue);
  const failed = new Uint8Array(runs);
  const bands = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  const paths = Array.from({ length: Math.min(samples, runs) }, () => [startValue]);
  const record = () => {
    const sorted = Float64Array.from(balance).sort();
    for (const key of Object.keys(bands)) bands[key].push(percentile(sorted, key.slice(1) / 100));
  };
  record();
  let failures = 0;
  for (let year = 0; year < years; year++) {
    const monthly = (annualWithdrawal / 12) * (1 + growth) ** year;
    for (let run = 0; run < runs; run++) {
      if (failed[run]) continue;
      let value = balance[run];
      for (let m = 0; m < 12; m++) {
        value += contribution(annualContribution, contributeMonthly, m); // same order as walk(): contribute, withdraw, then apply the return
        value -= monthly;
        if (value <= 0.005) { value = 0; failed[run] = 1; failures++; break; }
        value *= 1 + monthlyReturns[Math.floor(random() * n)];
      }
      balance[run] = value;
    }
    record();
    paths.forEach((path, run) => path.push(balance[run]));
  }
  return { failureRate: failures / runs, bands, paths };
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
export function historicalRun(points, startDate, startValue, annualWithdrawal, growth, annualContribution = 0, contributeMonthly = true) {
  const months = periodReturns(windowOf(points, startDate, "9999-12-31").points, 7);
  const { ranOutAt, final } = walk(months.map((m) => m.value), startValue, annualWithdrawal, growth, annualContribution, contributeMonthly);
  return { final, ranOutIn: ranOutAt === null ? null : months[ranOutAt].period };
}
