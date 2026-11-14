// Run with: node --test js/portfolios.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioSeries } from "./portfolios.js";

const series = (pairs) => pairs.map(([date, adjClose]) => ({ date, adjClose }));
const values = (out) => out.points.map((p) => +p.adjClose.toFixed(6));

// A doubles then holds; B holds then halves. Dates are month-ends so monthly rebalancing triggers.
const prices = {
  A: series([["2020-01-31", 100], ["2020-02-28", 200], ["2020-03-31", 200]]),
  B: series([["2020-01-31", 100], ["2020-02-28", 100], ["2020-03-31", 50]]),
};
const half = (rebalance, band) => ({ holdings: [{ ticker: "A", weight: 50 }, { ticker: "B", weight: 50 }], rebalance, band });

test("buy and hold lets the weights drift", () => {
  const out = portfolioSeries(half("none"), prices);
  assert.deepEqual(values(out), [100, 150, 125]); // 50 in A -> 100, 50 in B -> 25
  assert.equal(out.rebalances, 0);
});

test("monthly rebalancing resets to target at each month-end", () => {
  const out = portfolioSeries(half("monthly"), prices);
  // End of Feb: 150, reset to 75/75. March: A flat, B halves -> 75 + 37.5.
  assert.deepEqual(values(out), [100, 150, 112.5]);
  assert.equal(out.rebalances, 1);
});

test("annual rebalancing does nothing inside a single year", () => {
  assert.deepEqual(values(portfolioSeries(half("annual"), prices)), [100, 150, 125]);
});

test("a drift band rebalances only once the band is crossed", () => {
  // After February A is 66.7% of the portfolio: 16.7 points off target.
  assert.deepEqual(values(portfolioSeries(half("band", 5), prices)), [100, 150, 112.5]);
  assert.deepEqual(values(portfolioSeries(half("band", 20), prices)), [100, 150, 125]);
});

test("weights are scaled to 100% and only shared dates are used", () => {
  const uneven = {
    A: series([["2020-01-30", 90], ["2020-01-31", 100], ["2020-02-28", 110]]),
    B: series([["2020-01-31", 100], ["2020-02-14", 999], ["2020-02-28", 100]]),
  };
  const out = portfolioSeries({ holdings: [{ ticker: "A", weight: 3 }, { ticker: "B", weight: 1 }], rebalance: "none" }, uneven);
  assert.deepEqual(out.points.map((p) => p.date), ["2020-01-31", "2020-02-28"]);
  assert.deepEqual(values(out), [100, 107.5]); // 75% of the money gained 10%
});

test("a single holding tracks its asset exactly", () => {
  const out = portfolioSeries({ holdings: [{ ticker: "A", weight: 100 }], rebalance: "monthly" }, prices);
  assert.deepEqual(values(out), [100, 200, 200]);
  assert.equal(out.rebalances, 0);
});
