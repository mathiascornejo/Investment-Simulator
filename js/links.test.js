// Run with: node --test js/links.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedPortfolios, recipe, linkTo } from "./links.js";

const sixtyForty = { name: "Test 60/40", holdings: [{ ticker: "SPY", weight: 60 }, { ticker: "BND", weight: 40 }], rebalance: "annual", band: 5, cost: 0 };
const link = (...portfolios) => new URLSearchParams(linkTo("backtester", portfolios.map((p) => ["pf", typeof p === "string" ? p : recipe(p)])).split("?")[1]);

test("a portfolio travels in a link and comes back the same", () => {
  const { found, bad } = linkedPortfolios(link(sixtyForty), []);
  assert.equal(bad, 0);
  assert.deepEqual(found, [{ asked: "Test 60/40", portfolio: sixtyForty, saved: false }]);
});

test("one already saved is the saved one; a clashing name gets (2); broken ones are counted, not used", () => {
  const saved = [{ ...sixtyForty, holdings: sixtyForty.holdings.map((h) => ({ ...h, name: "A fund" })) }];
  assert.equal(linkedPortfolios(link(sixtyForty), saved).found[0].saved, true);
  const other = { ...sixtyForty, holdings: [{ ticker: "SPY", weight: 100 }] };
  const { found } = linkedPortfolios(link(other), saved);
  assert.equal(found[0].portfolio.name, "Test 60/40 (2)");
  assert.equal(found[0].asked, "Test 60/40");
  const broken = linkedPortfolios(link("not json", { ...sixtyForty, holdings: [{ ticker: "SPY", weight: 50 }] }), []);
  assert.deepEqual(broken, { found: [], bad: 2 }); // the second's weights don't add up to 100%
});
