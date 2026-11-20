// Run with: node --test js/portfolios.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioSeries, freeName, readPortfolio } from "./portfolios.js";

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

test("cash holding lines up with a ticker and earns nothing", async () => {
  const { cashSeries } = await import("./data.js");
  const stock = [{ date: "2024-01-02", adjClose: 10 }, { date: "2024-01-03", adjClose: 20 }];
  const { points } = portfolioSeries({ holdings: [{ ticker: "SPY", weight: 50 }, { ticker: "CASH", weight: 50 }], rebalance: "none" }, { SPY: stock, CASH: cashSeries() });
  assert.equal(points.at(-1).adjClose, 150); // 50 doubles, 50 stays
});

test("each rebalance pays the trading cost on the money moved, and turnover is per year", () => {
  // Same moves as above, a year apart. 31 Jan 2020 to 31 Jan 2022 is 731 days.
  const yearly = {
    A: series([["2020-01-31", 100], ["2021-01-29", 200], ["2022-01-31", 200]]),
    B: series([["2020-01-31", 100], ["2021-01-29", 100], ["2022-01-31", 50]]),
  };
  const out = portfolioSeries({ ...half("annual"), cost: 1 }, yearly);
  // End of year one: 100 in A, 50 in B. Back to 75/75 moves 25 + 25 = 50; 1% of 50 is 0.5, leaving 149.5.
  // Year two: 74.75 in A stays, 74.75 in B halves -> 74.75 + 37.375.
  assert.deepEqual(values(out), [100, 149.5, 112.125]);
  const years = 731 / 365.25;
  assert.ok(Math.abs(out.yearlyTurnover - 25 / 150 / years) < 1e-12); // one way: half of 50, over 150
  assert.ok(Math.abs(out.yearlyCost - 0.5 / 150 / years) < 1e-12);
  assert.equal(portfolioSeries(half("none"), yearly).yearlyTurnover, 0);
});

test("turnover and cost are not given for less than a year", () => {
  const out = portfolioSeries({ ...half("monthly"), cost: 0.5 }, prices);
  assert.equal(out.yearlyTurnover, null);
  assert.equal(out.yearlyCost, null);
  assert.deepEqual(values(out), [100, 149.75, 112.3125]); // 0.5% of 50 moved
});

test("free names add (2), (3)... or (copy), (copy 2)... and stay within 40 characters", () => {
  assert.equal(freeName("Growth", []), "Growth");
  assert.equal(freeName("Growth", ["Growth"]), "Growth (2)");
  assert.equal(freeName("Growth", ["Growth", "Growth (2)"]), "Growth (3)");
  assert.equal(freeName("Growth", ["Growth"], "copy"), "Growth (copy)");
  assert.equal(freeName("Growth", ["Growth", "Growth (copy)"], "copy"), "Growth (copy 2)");
  const long = "x".repeat(40);
  assert.equal(freeName(long, [long], "copy"), `${"x".repeat(33)} (copy)`);
});

test("a backup entry is rebuilt and checked before it is used", () => {
  const ok = readPortfolio({ name: " Mix ", holdings: [{ ticker: "spy", weight: "60", name: "SPDR S&P 500 ETF Trust" }, { ticker: "BND", weight: 40, extra: 1 }], rebalance: "band", band: 5, junk: true });
  assert.deepEqual(ok, {
    name: "Mix",
    holdings: [{ ticker: "SPY", weight: 60, name: "SPDR S&P 500 ETF Trust" }, { ticker: "BND", weight: 40 }],
    rebalance: "band",
    band: 5,
    cost: 0,
  });
  assert.equal(readPortfolio({ name: "A" }), "It has no list of holdings.");
  assert.equal(readPortfolio(null), "It has no list of holdings.");
  assert.equal(readPortfolio({ name: "A", holdings: [{ ticker: "SPY", weight: 90 }], rebalance: "none" }), "The weights must add up to 100%.");
  assert.equal(readPortfolio({ name: "A", holdings: [{ ticker: "<b>", weight: 100 }], rebalance: "none" }), "Every holding needs a ticker made of letters, digits, dots or dashes.");
  assert.equal(readPortfolio({ name: "A", holdings: [{ ticker: "SPY", weight: 100 }], rebalance: "toString" }), "Pick a rebalancing rule.");
  assert.equal(readPortfolio({ name: "A", holdings: [{ ticker: "SPY", weight: 100 }], rebalance: "none", cost: 9 }), "Set the trading cost between 0% and 5%.");
});
