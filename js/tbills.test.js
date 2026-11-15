import test from "node:test";
import assert from "node:assert/strict";
import { tbillSeries } from "./tbills.js";

test("a bill earns the previous day's yield for the days elapsed", () => {
  const s = tbillSeries([["2024-01-01", 0, 3.65, 0], ["2024-01-02", 0, 9, 0], ["2024-01-05", 0, 9, 0]], 2);
  assert.equal(s[0].adjClose, 1);
  assert.ok(Math.abs(s[1].adjClose - 1.0001) < 1e-12); // 3.65% x 1/365
  assert.ok(Math.abs(s[2].adjClose - 1.0001 * (1 + 0.09 * 3 / 365)) < 1e-12); // over a weekend gap: 3 days at 9%
});
