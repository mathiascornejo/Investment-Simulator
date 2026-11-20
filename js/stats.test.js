// Run with: node --test js/stats.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as s from "./stats.js";

const series = (pairs) => pairs.map(([date, adjClose]) => ({ date, adjClose }));
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("total return and annualised return", () => {
  const p = series([["2020-01-01", 100], ["2021-01-01", 110], ["2022-01-01", 121]]);
  close(s.totalReturn(p), 0.21);
  close(s.cagr(p), 0.1, 1e-3); // 21% over two years is 10% a year
});

test("annualised return is withheld for windows under a year", () => {
  assert.equal(s.cagr(series([["2020-01-01", 100], ["2020-06-01", 110]])), null);
});

test("max drawdown is the worst peak-to-trough fall", () => {
  const p = series([["2020-01-01", 100], ["2020-01-02", 120], ["2020-01-03", 90], ["2020-01-06", 95], ["2020-01-07", 130]]);
  close(s.maxDrawdown(p), 90 / 120 - 1);
  assert.deepEqual(s.drawdowns(p).map((d) => +d.value.toFixed(4)), [0, 0, -0.25, -0.2083, 0]);
});

test("volatility, Sharpe and Sortino from daily returns", () => {
  const r = [0.01, -0.01, 0.01, -0.01];
  close(s.volatility(r), Math.sqrt(4e-4 / 3) * Math.sqrt(252)); // sample standard deviation, annualised
  const up = [0.02, -0.01, 0.02, -0.01]; // mean 0.005
  close(s.sharpe(up), (0.005 * 252) / s.volatility(up));
  close(s.sortino(up), (0.005 * 252) / Math.sqrt((2e-4 / 4) * 252)); // only the two falls count as risk
});

test("beta is 2 for a series that moves twice as much as the benchmark", () => {
  const bench = series([["2020-01-01", 100], ["2020-01-02", 101], ["2020-01-03", 99.99], ["2020-01-06", 102.9897]]);
  const double = series([["2020-01-01", 100], ["2020-01-02", 102], ["2020-01-03", 99.96], ["2020-01-06", 105.9576]]);
  close(s.beta(double, bench), 2, 1e-6);
  close(s.beta(bench, bench), 1);
});

test("beta ignores dates the benchmark does not have", () => {
  const bench = series([["2020-01-02", 100], ["2020-01-03", 110], ["2020-01-06", 99]]);
  const longer = series([["2019-12-31", 50], ["2020-01-02", 80], ["2020-01-03", 88], ["2020-01-06", 79.2]]);
  close(s.beta(longer, bench), 1);
});

test("windowOf keeps the dates in range and reports the date after", () => {
  const p = series([["2020-01-01", 1], ["2020-01-02", 2], ["2020-01-03", 3], ["2020-01-06", 4]]);
  const w = s.windowOf(p, "2020-01-02", "2020-01-05");
  assert.deepEqual(w.points.map((x) => x.adjClose), [2, 3]);
  assert.equal(w.nextDate, "2020-01-06");
  assert.deepEqual(s.windowOf(p, "2021-01-01", "2021-12-31").points, []);
});

test("period returns flag the partial first and last periods", () => {
  const p = series([
    ["2019-06-28", 100], // window starts mid-2019
    ["2019-12-31", 110],
    ["2020-12-31", 99],
    ["2021-03-31", 108.9], // data stops mid-2021
  ]);
  const years = s.periodReturns(p, 4, undefined);
  assert.deepEqual(years.map((y) => [y.period, +y.value.toFixed(4), y.partial]), [
    ["2019", 0.1, true],
    ["2020", -0.1, false],
    ["2021", 0.1, true],
  ]);
  // The last year counts as complete when the next data point falls in a later year.
  assert.equal(s.periodReturns(p.slice(0, 3), 4, "2021-01-04").at(-1).partial, false);
});

test("summarize uses full years only for best and worst year", () => {
  const p = series([["2019-06-28", 100], ["2019-12-31", 150], ["2020-12-31", 165], ["2021-12-31", 148.5], ["2022-03-31", 200]]);
  const out = s.summarize(p, p, undefined);
  close(out.bestYear, 0.1);
  close(out.worstYear, -0.1);
  close(out.finalValue, 20000);
  close(out.beta, 1);
});

test("correlation: in step is 1, mirror image is -1, only shared dates count", () => {
  const a = series([["2020-01-01", 100], ["2020-01-02", 110], ["2020-01-03", 99], ["2020-01-06", 104]]);
  const same = series([["2020-01-01", 50], ["2020-01-02", 55], ["2020-01-03", 49.5], ["2020-01-06", 52]]); // same daily returns
  close(s.correlation(a, same), 1);
  const returns = s.dailyReturns(a);
  let v = 100;
  const mirror = series([["2020-01-01", 100], ...a.slice(1).map((p, i) => [p.date, (v *= 1 - returns[i])])]);
  close(s.correlation(a, mirror), -1);
  assert.ok(Number.isNaN(s.correlation(a, series([["2019-01-01", 1], ["2019-01-02", 2]]))));
});

test("percent axes get round, even steps and just enough decimals", () => {
  // Drawdown to -15.3%: steps of 3 points from -18% to 0, whole numbers.
  assert.deepEqual(s.niceAxis(-0.153, 0), { min: -0.18, max: 0, interval: 0.03, decimals: 0 });
  // Returns between 8.1% and 9.3%: 0.2-point steps need one decimal, else labels repeat ("9%, 9%").
  assert.deepEqual(s.niceAxis(0.081, 0.093), { min: 0.08, max: 0.094, interval: 0.002, decimals: 1 });
  assert.deepEqual(s.niceAxis(-0.35, 0.42), { min: -0.4, max: 0.6, interval: 0.2, decimals: 0 });
  assert.equal(s.niceAxis(0.0001, 0.0009).decimals, 2); // 0.02-point steps
  // A flat series (cash) still gets a usable axis around its value.
  assert.deepEqual(s.niceAxis(0, 0), { min: -0.01, max: 0.01, interval: 0.005, decimals: 1 });
  // Two values equal but for rounding noise count as flat, not as a near-zero step.
  assert.deepEqual(s.niceAxis(0.1, 0.1 + 1e-16), { min: 0.09, max: 0.11, interval: 0.005, decimals: 1 });
});
