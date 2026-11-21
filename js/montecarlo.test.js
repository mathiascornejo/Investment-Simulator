// Run with: node --test js/montecarlo.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { walk, percentile, simulate, crisisTest, historicalRun, mulberry32, logStats, monthDrawer, failureYears, crisisMonths, everyStart, shareAtOrBelow, withStandIns, standIns, CRISES } from "./montecarlo.js";

const series = (pairs) => pairs.map(([date, adjClose]) => ({ date, adjClose }));
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not within ${tolerance} of ${expected}`);
const flat = (months) => Array(months).fill(0);

test("walk: with no growth, withdrawals drain the balance on schedule", () => {
  // 1,000,000 with 100,000 a year lasts exactly ten years.
  const out = walk(flat(240), { startValue: 1_000_000, annualWithdrawal: 100_000 });
  close(out.yearly[1], 900_000, 0.01);
  close(out.yearly[5], 500_000, 0.01);
  assert.equal(out.yearly[10], 0);
  assert.equal(out.ranOutAt, 119); // the 120th month
  assert.equal(out.final, 0);
  assert.equal(out.yearly.length, 21);
});

test("walk: returns compound and nothing fails without withdrawals", () => {
  const out = walk(Array(24).fill(0.01), { startValue: 1000 });
  close(out.yearly[1], 1000 * 1.01 ** 12);
  close(out.final, 1000 * 1.01 ** 24);
  assert.equal(out.ranOutAt, null);
});

test("walk: withdrawals rise each year by the growth rate", () => {
  const out = walk(flat(24), { startValue: 1000, annualWithdrawal: 120, growth: 0.5 }); // 10 a month, then 15 a month
  close(out.yearly[1], 880);
  close(out.yearly[2], 700);
});

test("percentile interpolates between ranks", () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
  assert.equal(percentile([10, 20, 30, 40, 50], 0), 10);
  close(percentile([10, 20, 30, 40, 50], 0.9), 46);
});

test("simulate: a certain outcome gives a 0% or 100% failure rate and flat bands", () => {
  const safe = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 0, growth: 0, years: 3, runs: 50 });
  assert.equal(safe.failureRate, 0);
  assert.deepEqual(safe.bands.p10, [1000, 1000, 1000, 1000]);
  assert.deepEqual(safe.bands.p90, [1000, 1000, 1000, 1000]);

  const doomed = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 600, growth: 0, years: 3, runs: 50 });
  assert.equal(doomed.failureRate, 1);
  assert.equal(doomed.bands.p50.at(-1), 0);
});

test("simulate: draws months from history using the random source", () => {
  // A source that always returns 0.99 picks the last month every time: +10% a month.
  const out = simulate({ monthlyReturns: [-0.5, 0, 0.1], startValue: 100, annualWithdrawal: 0, growth: 0, years: 1, runs: 5, random: () => 0.99 });
  close(out.bands.p50[1], 100 * 1.1 ** 12);
  close(out.bands.p10[1], out.bands.p90[1]);
});

test("simulate: bands are ordered and spread out when returns vary", () => {
  let seed = 42;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // repeatable
  const out = simulate({ monthlyReturns: [-0.06, -0.02, 0.01, 0.03, 0.07], startValue: 1000, annualWithdrawal: 40, growth: 0.03, years: 20, runs: 2000, random });
  const end = (key) => out.bands[key].at(-1);
  // Some runs fail (so the lowest band can sit at zero) and the rest fan out above it.
  assert.ok(end("p10") <= end("p25") && end("p25") < end("p50") && end("p50") < end("p75") && end("p75") < end("p90"));
  assert.ok(out.failureRate > 0.05 && out.failureRate < 0.2);
  assert.ok(out.bands.p10.every((v) => v >= 0));
});

const crash = series([
  ["2019-12-31", 100],
  ["2020-02-19", 110], // crisis starts here
  ["2020-03-10", 90],
  ["2020-03-23", 77], // the low: 30% below the start
  ["2020-06-01", 100],
  ["2020-08-18", 111], // back above 110
  ["2020-12-31", 120],
]);

test("crisisTest finds the low point and the recovery date", () => {
  const out = crisisTest(crash, { start: "2020-02-19", end: "2020-03-23" });
  close(out.lowest, -0.3);
  assert.equal(out.lowDate, "2020-03-23");
  assert.equal(out.recovered, "2020-08-18");
});

test("crisisTest reports no data when the series starts after the crisis began", () => {
  assert.equal(crisisTest(crash, { start: "2007-10-09", end: "2009-03-09" }), null);
  const never = crisisTest(crash.slice(0, 5), { start: "2020-02-19", end: "2020-03-23" });
  assert.equal(never.recovered, null); // data ends before it gets back to 110
});

test("historicalRun follows the real months from the start date", () => {
  const p = series([["2020-01-31", 100], ["2020-02-28", 50], ["2020-03-31", 100], ["2020-04-30", 100]]);
  const kept = historicalRun(p, "2020-01-31", { startValue: 1000 });
  close(kept.final, 1000); // halves, doubles, flat
  assert.equal(kept.ranOutIn, null);
  const drained = historicalRun(p, "2020-01-31", { startValue: 1000, annualWithdrawal: 7200 }); // 600 a month
  assert.equal(drained.ranOutIn, "2020-03"); // 400 -> 200 after February, then March's 600 empties it
  assert.equal(drained.final, 0);
});

test("simulate: sample paths follow the first runs year by year", () => {
  const out = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 120, growth: 0, years: 3, runs: 5, samples: 2 });
  assert.equal(out.paths.length, 2);
  assert.deepEqual(out.paths[0].map((v) => Math.round(v)), [1000, 880, 760, 640]);
  assert.deepEqual(simulate({ monthlyReturns: [0], startValue: 1, annualWithdrawal: 0, growth: 0, years: 1, runs: 3 }).paths, []);
});

test("simulate: a sample run that ran out stays at exactly 0, even with contributions", () => {
  // 1,000 with 100 a month out and 50 a month in loses 50 a month: 400 after a year, empty after 20 months,
  // and the contributions of year 3 don't bring it back.
  const out = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 1200, growth: 0, years: 3, runs: 2, samples: 2, annualContribution: 600 });
  assert.equal(out.failureRate, 1);
  for (const path of out.paths) assert.deepEqual(path.map((v) => Math.round(v)), [1000, 400, 0, 0]);
  // A run that lasts never reads 0: the tab colours sample runs by whether they end at 0.
  const lasting = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 120, growth: 0, years: 3, runs: 2, samples: 2 });
  assert.ok(lasting.paths.every((path) => path.at(-1) > 0));
});

test("contributions: monthly and annual add the same money, annual a little later", () => {
  const monthly = walk(Array(12).fill(0), { startValue: 0, annualContribution: 1200 });
  const annual = walk(Array(12).fill(0), { startValue: 0, annualContribution: 1200, contributeMonthly: false });
  assert.equal(monthly.final, 1200);
  assert.equal(annual.final, 1200);
  assert.deepEqual(walk([0, 0], { startValue: 0, annualContribution: 1200, contributeMonthly: false }).yearly, [0]); // nothing at the year-end mark yet
  assert.equal(walk([0, 0], { startValue: 0, annualContribution: 1200, contributeMonthly: false }).final, 1200); // all of it lands in month 1
  assert.equal(simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 600, growth: 0, annualContribution: 600, years: 3, runs: 5 }).failureRate, 0); // contributions cancel the withdrawals
});

test("mulberry32: matches the published algorithm and repeats with the same seed", () => {
  const random = mulberry32(42);
  assert.equal(random(), 0.6011037519201636); // first numbers from the reference mulberry32 code with seed 42
  assert.equal(random(), 0.44829055899754167);
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
  const many = Array.from({ length: 100_000 }, mulberry32(1));
  assert.ok(many.every((u) => u >= 0 && u < 1));
  close(many.reduce((s, u) => s + u, 0) / many.length, 0.5, 0.005);
});

test("logStats: average and sample spread of the log returns", () => {
  const out = logStats([Math.E - 1, 1 / Math.E - 1]); // log returns +1 and -1
  close(out.mean, 0);
  close(out.sd, Math.SQRT2); // √((1 + 1) / (2 - 1))
});

test("block draws: real months in their real order, wrapping round, until a jump", () => {
  // A run's first month takes one number (where to start); later months take one for the jump check, plus one
  // for where to jump to when it does.
  const script = [0.5, 0.9, 0.9, 0.01, 0.25, 0.9, 0.75];
  const random = () => script.shift();
  const draw = monthDrawer({ monthlyReturns: [0.1, 0.2, 0.3, 0.4], method: "block", blockLength: 12, random, runs: 2 });
  // First month: a random start (0.5 of 4 months -> the 3rd). Then the 4th, then round to the 1st.
  // 0.01 is under 1/12, so the run jumps (0.25 -> the 2nd month) and carries on from there.
  assert.deepEqual([draw(0), draw(0), draw(0), draw(0), draw(0)], [0.3, 0.4, 0.1, 0.2, 0.3]);
  assert.equal(draw(1), 0.4); // a second run keeps its own place: it starts at random (0.75 -> the 4th)
  assert.equal(script.length, 0);
});

test("bell-curve and fat-tailed draws keep the history's average and spread", () => {
  for (const method of ["normal", "t"]) {
    // No spread in history: every draw is that one return.
    const steady = monthDrawer({ monthlyReturns: [0.01, 0.01, 0.01], method, random: mulberry32(3) });
    for (let i = 0; i < 10; i++) close(steady(), 0.01, 1e-12);
  }
  const history = [-0.08, -0.03, 0.01, 0.02, 0.04, 0.09];
  const { mean, sd } = logStats(history);
  const tails = {};
  for (const method of ["normal", "t"]) {
    const draw = monthDrawer({ monthlyReturns: history, method, random: mulberry32(11) });
    const logs = Array.from({ length: 200_000 }, () => Math.log1p(draw()));
    const m = logs.reduce((a, b) => a + b, 0) / logs.length;
    const s = Math.sqrt(logs.reduce((a, b) => a + (b - m) ** 2, 0) / logs.length);
    close(m, mean, 0.002);
    close(s / sd, 1, 0.05);
    tails[method] = logs.filter((x) => Math.abs(x - mean) > 3 * sd).length / logs.length;
  }
  close(tails.normal, 0.0027, 0.001); // a bell curve puts 0.27% of months beyond 3 spreads
  // Student-t with 4 degrees of freedom, scaled to spread 1: beyond 3 spreads means |t| > 3√2. With sin θ = 3/√5.5,
  // the two tails hold 2 × 3/4 × (2/3 - sin θ + sin³θ / 3) = 1.32%, five times the bell curve.
  close(tails.t, 0.0132, 0.0015);
});

test("simulate: the same seed repeats a run; a fee only ever makes the same runs worse", () => {
  const setup = { monthlyReturns: [-0.06, -0.02, 0.01, 0.03, 0.07], startValue: 1000, annualWithdrawal: 45, growth: 0.03, years: 25, runs: 3000, seed: 9 };
  assert.deepEqual(simulate(setup), simulate(setup));
  const plain = simulate(setup);
  const charged = simulate({ ...setup, fee: 0.01 });
  assert.ok(charged.failureRate > plain.failureRate);
  for (const key of ["p10", "p50", "p90"]) assert.ok(charged.bands[key].at(-1) <= plain.bands[key].at(-1));
  // 10% a year, taken monthly, leaves exactly 90% after a flat year.
  close(simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 0, growth: 0, years: 1, runs: 3, fee: 0.1 }).bands.p50[1], 900);
  close(walk(flat(12), { startValue: 1000, fee: 0.1 }).final, 900);
});

test("simulate: counts when runs ran out, year by year", () => {
  // 50 a month empties 1,000 in the 20th month, which is in year 2.
  const out = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 600, growth: 0, years: 3, runs: 4 });
  assert.deepEqual(out.ranOut, [0, 0, 4, 4]);
  assert.deepEqual(failureYears([0, 0, 1, 1, 3, 4]), { first: 2, half: 4 });
  assert.equal(failureYears([0, 0, 0]), null);
});

test("simulate: a crisis prefix is replayed first by every run", () => {
  const out = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 0, growth: 0, years: 2, runs: 5, prefix: [-0.5, 0.2] });
  assert.deepEqual(out.bands.p10, [1000, 600, 600]);
  assert.deepEqual(out.bands.p90, [1000, 600, 600]);
  // Longer than the horizon: only the months that fit are used.
  close(simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 0, growth: 0, years: 1, runs: 1, prefix: flat(12).concat(-0.5) }).bands.p50[1], 1000);
});

test("crisisMonths: month-long steps from the start date to the low, from the last close on or before each", () => {
  const p = series([
    ["2020-01-10", 90],
    ["2020-01-15", 100], // crisis starts here
    ["2020-02-14", 90], // Friday: the close used for 15 Feb
    ["2020-03-20", 72], // the low
    ["2020-04-30", 95],
  ]);
  const months = crisisMonths(p, { start: "2020-01-15", end: "2020-03-20" }); // 65 days: two steps
  assert.equal(months.length, 2);
  close(months[0], -0.1);
  close(months[1], -0.2);
  assert.equal(crisisMonths(p, { start: "2019-12-01", end: "2020-03-20" }), null); // starts before the data
  assert.equal(crisisMonths(p, { start: "2020-03-01", end: "2020-06-01" }), null); // ends after the data
  const charged = historicalRun(series([["2020-01-31", 100], ["2020-02-28", 100]]), "2020-01-31", { startValue: 1000, fee: 0.1 });
  close(charged.final, 1000 * 0.9 ** (1 / 12)); // one month of a 10% yearly fee
});

// Three years worked by hand: returns are 0 except the last month of each year (-50%, +100%, +100%), then one flat month.
const threeYears = [...flat(11), -0.5, ...flat(11), 1, ...flat(11), 1, 0];

test("guardrails: no rise after a losing year, cut above 120% of the starting rate, raised below 80%", () => {
  // Starting rate 50 / 1,000 = 5%, so the guardrails sit at 6% and 4%.
  // Year 1: (1,000 - 50) × 0.5 = 475. A losing year: no rise. 50 / 475 = 10.5%, above 6%: cut to 45.
  // Year 2: (475 - 45) × 2 = 860. Rise 10% to 49.5; 49.5 / 860 = 5.8%, inside the guardrails.
  // Year 3: (860 - 49.5) × 2 = 1,621. Rise to 54.45; 54.45 / 1,621 = 3.4%, below 4%: raised to 59.895.
  const plan = { startValue: 1000, annualWithdrawal: 50, growth: 0.1 };
  const guarded = walk(threeYears, { ...plan, rule: "guardrails" });
  [1000, 475, 860, 1621].forEach((v, i) => close(guarded.yearly[i], v, 1e-9));
  close(guarded.final, 1621 - 59.895 / 12, 1e-9);
  // The fixed rule rises 10% every year: (475 - 55) × 2 = 840, (840 - 60.5) × 2 = 1,559.
  const fixed = walk(threeYears, plan);
  [1000, 475, 840, 1559].forEach((v, i) => close(fixed.yearly[i], v, 1e-9));
  // simulate() follows the same rule, and reports what was spent each year.
  const out = simulate({ monthlyReturns: [0], prefix: threeYears, ...plan, rule: "guardrails", years: 3, runs: 2 });
  [1000, 475, 860, 1621].forEach((v, i) => close(out.bands.p50[i], v, 1e-9));
  [50, 45, 49.5].forEach((v, i) => close(out.spending.p50[i], v, 1e-9));
  assert.equal(simulate({ monthlyReturns: [0], ...plan, years: 1, runs: 1 }).spending, undefined); // fixed rule: not tracked
});

test("guardrails: a run that runs out spends only what was left, then nothing", () => {
  // Year 1: 700 spent, 300 left. 700 / 300 is far above 120% of the starting 70%, so year 2's withdrawal is cut to 630.
  // Year 2: 52.5 a month; the 6th withdrawal finds 37.5 left. Spent: 5 × 52.5 + 37.5 = 300.
  const out = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 700, growth: 0, rule: "guardrails", years: 3, runs: 1 });
  close(out.spending.p50[0], 700);
  close(out.spending.p50[1], 300);
  assert.equal(out.spending.p50[2], 0);
  assert.equal(out.failureRate, 1);
});

test("perfect withdrawal rates: flat months give the starting amount divided by the years", () => {
  const out = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 40, growth: 0, years: 25, runs: 3, perfectRates: true });
  for (const r of out.perfectRates) close(r, 1 / 25, 1e-12);
  assert.equal(simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 40, growth: 0, years: 1, runs: 1 }).perfectRates, undefined);
});

test("perfect withdrawal rates: a hand-worked year, and the exact line between lasting and running out", () => {
  // Month 1 doubles, the rest are flat: per dollar of yearly withdrawal, 1/12 is owed before the doubling and 11/12
  // after it (worth half as much in starting money), 13/24 in all, so the rate is 24/13. Check: 1,846.15 a year is
  // 153.85 a month; (1,000 - 153.85) × 2 = 1,692.31, which the other 11 withdrawals empty exactly.
  const year = [1, ...flat(11)];
  close(simulate({ monthlyReturns: [0], prefix: year, startValue: 1000, annualWithdrawal: 0, growth: 0, years: 1, runs: 1, perfectRates: true }).perfectRates[0], 24 / 13, 1e-12);
  // With varied months, a yearly rise and a fee: just under the rate lasts, just over runs out in the last month.
  const months = [0.05, -0.08, 0.03, 0.02, -0.04, 0.06, 0.01, -0.02, 0.04, -0.06, 0.03, 0.02, -0.1, 0.07, 0.01, 0.02, -0.03, 0.05, 0.02, -0.01, 0.04, 0.03, -0.05, 0.02];
  const setup = { startValue: 1000, growth: 0.03, fee: 0.01 };
  const rate = simulate({ monthlyReturns: [0], prefix: months, ...setup, annualWithdrawal: 0, years: 2, runs: 1, perfectRates: true }).perfectRates[0];
  assert.equal(walk(months, { ...setup, annualWithdrawal: rate * 1000 * 0.999 }).ranOutAt, null);
  assert.equal(walk(months, { ...setup, annualWithdrawal: rate * 1000 * 1.001 }).ranOutAt, 23);
  // Over many random runs, the share of rates at or below yours is your failure rate.
  const many = { monthlyReturns: [-0.06, -0.02, 0.01, 0.03, 0.07], startValue: 1000, annualWithdrawal: 45, growth: 0.03, years: 25, runs: 3000, seed: 9 };
  const result = simulate({ ...many, perfectRates: true });
  close(shareAtOrBelow(result.perfectRates, 0.045), result.failureRate, 1e-9);
});

test("shareAtOrBelow counts ties as at or below", () => {
  const sorted = [0.02, 0.03, 0.03, 0.05];
  assert.equal(shareAtOrBelow(sorted, 0.01), 0);
  assert.equal(shareAtOrBelow(sorted, 0.03), 0.75);
  assert.equal(shareAtOrBelow(sorted, 0.05), 1);
});

test("everyStart: one real run from every month with the whole horizon ahead", () => {
  // 13 months, the first a 50% fall: two one-year starts at 50 a month from 1,000.
  // From month 1: (1,000 - 50) × 0.5 = 475, which the 11th withdrawal (month index 10) runs out on.
  // From month 2: twelve flat months leave 1,000 - 600 = 400.
  const starts = everyStart([-0.5, ...flat(12)], 1, { startValue: 1000, annualWithdrawal: 600 });
  assert.equal(starts.length, 2);
  assert.equal(starts[0].ranOutAt, 10);
  assert.equal(starts[1].ranOutAt, null);
  close(starts[1].final, 400);
  assert.deepEqual(everyStart(flat(11), 1, { startValue: 1000 }), []); // shorter than the horizon
});

test("withStandIns joins the stand-in's returns onto the fund's first price", () => {
  const fund = series([["2010-09-09", 100], ["2010-09-10", 101]]);
  const spy = series([["2010-09-07", 40], ["2010-09-08", 50], ["2010-09-09", 55], ["2010-09-10", 56]]);
  const out = withStandIns(fund, [{ ticker: "SPY", points: spy }]);
  assert.deepEqual(out.points.map((p) => p.date), ["2010-09-07", "2010-09-08", "2010-09-09", "2010-09-10"]);
  close(out.points[1].adjClose, (50 * 100) / 55); // 50 -> 55 is +10%, and so is the joined step to 100
  close(out.points[1].adjClose / out.points[0].adjClose, 50 / 40); // the stand-in's own returns are kept
  assert.deepEqual(out.points.slice(2), fund); // the fund's own prices are unchanged
  assert.deepEqual(out.used, [{ ticker: "SPY", before: "2010-09-09" }]);
  // A chain: VFINX before SPY's first day; a stand-in that starts later than the fund adds nothing.
  const vfinx = series([["2010-09-06", 10], ["2010-09-07", 11]]);
  const chained = withStandIns(fund, [{ ticker: "SPY", points: spy }, { ticker: "VFINX", points: vfinx }, { ticker: "LATE", points: fund.slice(1) }]);
  assert.equal(chained.points[0].date, "2010-09-06");
  close(chained.points[1].adjClose / chained.points[0].adjClose, 11 / 10); // VFINX's 10% rise joins SPY's first close
  assert.deepEqual(chained.used, [{ ticker: "SPY", before: "2010-09-09" }, { ticker: "VFINX", before: "2010-09-07" }]);
  assert.deepEqual(standIns("VOO"), ["SPY", "VFINX"]);
  assert.deepEqual(standIns("GLD"), []);
});

test("crises are in date order, each from the S&P 500's peak to its low", () => {
  CRISES.forEach((c, i) => {
    assert.ok(c.start < c.end, c.name);
    if (i) assert.ok(CRISES[i - 1].end < c.start, c.name);
  });
  assert.equal(CRISES.length, 9);
});
