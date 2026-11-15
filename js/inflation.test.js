// Run with: node --test js/inflation.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflate } from "./inflation.js";

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
