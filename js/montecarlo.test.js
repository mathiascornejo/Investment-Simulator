// Run with: node --test js/montecarlo.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { walk, percentile, simulate, crisisTest, historicalRun, mulberry32, logStats, monthDrawer, failureYears, crisisMonths } from "./montecarlo.js";

const series = (pairs) => pairs.map(([date, adjClose]) => ({ date, adjClose }));
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not within ${tolerance} of ${expected}`);
const flat = (months) => Array(months).fill(0);

test("walk: with no growth, withdrawals drain the balance on schedule", () => {
  // 1,000,000 with 100,000 a year lasts exactly ten years.
  const out = walk(flat(240), 1_000_000, 100_000, 0);
  close(out.yearly[1], 900_000, 0.01);
  close(out.yearly[5], 500_000, 0.01);
  assert.equal(out.yearly[10], 0);
  assert.equal(out.ranOutAt, 119); // the 120th month
  assert.equal(out.final, 0);
  assert.equal(out.yearly.length, 21);
});

test("walk: returns compound and nothing fails without withdrawals", () => {
  const out = walk(Array(24).fill(0.01), 1000, 0, 0);
  close(out.yearly[1], 1000 * 1.01 ** 12);
  close(out.final, 1000 * 1.01 ** 24);
  assert.equal(out.ranOutAt, null);
});

test("walk: withdrawals rise each year by the growth rate", () => {
  const out = walk(flat(24), 1000, 120, 0.5); // 10 a month, then 15 a month
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
  const kept = historicalRun(p, "2020-01-31", 1000, 0, 0);
  close(kept.final, 1000); // halves, doubles, flat
  assert.equal(kept.ranOutIn, null);
  const drained = historicalRun(p, "2020-01-31", 1000, 7200, 0); // 600 a month
  assert.equal(drained.ranOutIn, "2020-03"); // 400 -> 200 after February, then March's 600 empties it
  assert.equal(drained.final, 0);
});

test("simulate: sample paths follow the first runs year by year", () => {
  const out = simulate({ monthlyReturns: [0], startValue: 1000, annualWithdrawal: 120, growth: 0, years: 3, runs: 5, samples: 2 });
  assert.equal(out.paths.length, 2);
  assert.deepEqual(out.paths[0].map((v) => Math.round(v)), [1000, 880, 760, 640]);
  assert.deepEqual(simulate({ monthlyReturns: [0], startValue: 1, annualWithdrawal: 0, growth: 0, years: 1, runs: 3 }).paths, []);
});

test("contributions: monthly and annual add the same money, annual a little later", () => {
  const monthly = walk(Array(12).fill(0), 0, 0, 0, 1200, true);
  const annual = walk(Array(12).fill(0), 0, 0, 0, 1200, false);
  assert.equal(monthly.final, 1200);
  assert.equal(annual.final, 1200);
  assert.deepEqual(walk([0, 0], 0, 0, 0, 1200, false).yearly, [0]); // nothing at the year-end mark yet
  assert.equal(walk([0, 0], 0, 0, 0, 1200, false).final, 1200); // all of it lands in month 1
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
  close(walk(flat(12), 1000, 0, 0, 0, true, 0.1).final, 900);
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
  const charged = historicalRun(series([["2020-01-31", 100], ["2020-02-28", 100]]), "2020-01-31", 1000, 0, 0, 0, true, 0.1);
  close(charged.final, 1000 * 0.9 ** (1 / 12)); // one month of a 10% yearly fee
});
