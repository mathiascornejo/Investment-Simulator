// Run with: node --test js/inflation.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflate, priceIndex, cpiFacts } from "./inflation.js";

const cpi = [{ date: "2020-01-01", value: 100 }, { date: "2020-02-01", value: 102 }, { date: "2020-03-01", value: 104 }];

test("a price that rises exactly with CPI stays flat in real terms", () => {
  const out = deflate([{ date: "2020-01-01", adjClose: 100 }, { date: "2020-02-01", adjClose: 102 }], cpi);
  assert.ok(Math.abs(out[0].adjClose - out[1].adjClose) < 1e-9);
});

test("mid-month CPI is interpolated; later months reuse the last reading; earlier dates are dropped", () => {
  const out = deflate([{ date: "2019-12-31", adjClose: 1 }, { date: "2020-01-16", adjClose: 1 }, { date: "2020-06-01", adjClose: 1 }], cpi);
  assert.equal(out.length, 2);
  assert.ok(Math.abs(out[0].adjClose - 104 / (100 + (15 / 31) * 2)) < 1e-9); // day 16 of 31
  assert.equal(out[1].adjClose, 1);
});

test("the INFLATION series is the index filled in between readings, and flat once deflated", () => {
  const days = [{ date: "2019-12-31", adjClose: 7 }, { date: "2020-01-16", adjClose: 7 }, { date: "2020-06-01", adjClose: 7 }];
  const out = priceIndex(days, cpi);
  assert.deepEqual(out.map((p) => p.date), ["2020-01-16", "2020-06-01"]);
  assert.ok(Math.abs(out[0].adjClose - (100 + (15 / 31) * 2)) < 1e-9);
  assert.ok(Math.abs(out[1].adjClose - 104) < 1e-9);
  for (const p of deflate(out, cpi)) assert.ok(Math.abs(p.adjClose - 104) < 1e-9); // real mode: a flat 0% line
});

test("cpiFacts: rise over the latest year and since 1 Jan 2000", () => {
  // 1 Jan 2000 is 31 of the 62 days from 1 Dec 1999 to 1 Feb 2000, so its index is 101.
  const f = cpiFacts([{ date: "1999-12-01", value: 100 }, { date: "2000-02-01", value: 102 }, { date: "2025-06-01", value: 180 }, { date: "2026-06-01", value: 189 }]);
  assert.equal(f.first, "1999-12-01");
  assert.equal(f.latest, "2026-06-01");
  assert.ok(Math.abs(f.lastYear - 0.05) < 1e-12);
  assert.ok(Math.abs(f.since2000 - (189 / 101 - 1)) < 1e-12);
  const late = cpiFacts([{ date: "2010-07-01", value: 100 }, { date: "2012-07-01", value: 104 }]);
  assert.equal(late.since2000, null);
  assert.equal(late.lastYear, null);
});
