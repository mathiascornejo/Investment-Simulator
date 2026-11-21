import test from "node:test";
import assert from "node:assert/strict";
import { tbillSeries, billYield, usTbillSeries, readDtb3 } from "./tbills.js";

test("a bill earns the previous day's yield for the days elapsed", () => {
  const s = tbillSeries([["2024-01-01", 0, 3.65, 0], ["2024-01-02", 0, 9, 0], ["2024-01-05", 0, 9, 0]], 2);
  assert.equal(s[0].adjClose, 1);
  assert.ok(Math.abs(s[1].adjClose - 1.0001) < 1e-12); // 3.65% x 1/365
  assert.ok(Math.abs(s[2].adjClose - 1.0001 * (1 + 0.09 * 3 / 365)) < 1e-12); // over a weekend gap: 3 days at 9%
});

test("USTBILL: a 5% discount rate is a 5.134% yield, earned day by day", () => {
  const y = 18.25 / 355.45; // 365 x 0.05 ÷ (360 − 91 x 0.05)
  assert.ok(Math.abs(billYield(0.05) - y) < 1e-15);
  assert.ok(Math.abs(y - 0.051343) < 1e-6);
  const s = usTbillSeries([["2020-01-02", 5], ["2020-01-03", 5], ["2020-01-06", 4]]);
  assert.equal(s[0].adjClose, 1);
  assert.ok(Math.abs(s[1].adjClose - (1 + y / 365)) < 1e-15);
  assert.ok(Math.abs(s[2].adjClose - (1 + y / 365) * (1 + (y * 3) / 365)) < 1e-15); // the weekend earns Friday's rate
});

test("USTBILL: FRED's CSV becomes [date, rate] rows, blank days left out", () => {
  assert.deepEqual(readDtb3("observation_date,DTB3\r\n2020-01-01,\r\n2020-01-02,1.52\r\n2020-01-03,.\n2020-01-06,1.50\n2015-09-30,-0.02\n"),
    [["2020-01-02", 1.52], ["2020-01-06", 1.5], ["2015-09-30", -0.02]]);
});
