// Run with: node --test js/montecarlo.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { walk, percentile, simulate, crisisTest, historicalRun } from "./montecarlo.js";

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
