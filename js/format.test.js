// Run with: node --test js/format.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { csv, moneyIn, money } from "./format.js";

test("csv: unrounded numbers with a dot, quoted text, empty cells for missing figures", () => {
  assert.equal(csv([["Date", "SPY"], ["2024-01-02", 10123.456789], ["2024-01-03", null], ["", NaN]]), "Date,SPY\r\n2024-01-02,10123.456789\r\n2024-01-03,\r\n,\r\n");
  assert.equal(csv([['Stocks, "core"', -0.25]]), '"Stocks, ""core""",-0.25\r\n');
});

test("csv: text that starts like a formula gets an apostrophe; negative numbers don't", () => {
  assert.equal(csv([["=1+1", "+X", "-Y", "@Z", -1]]), "'=1+1,'+X,'-Y,'@Z,-1\r\n");
  assert.equal(csv([["=HYPERLINK(\"x\",\"y\")"]]), `"'=HYPERLINK(""x"",""y"")"\r\n`);
});

test("moneyIn: dollars as before, pence as pounds, mixed as plain numbers", () => {
  assert.equal(moneyIn("USD").money, money);
  assert.equal(moneyIn("GBp").money.format(1234), new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(1234));
  assert.equal(moneyIn("mixed").money.format(12345.6), new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(12346));
  assert.equal(moneyIn("mixed").moneyFit.format(2e9), new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(2e9));
});
