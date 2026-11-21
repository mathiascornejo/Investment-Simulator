// Run with: node --test js/currency.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyOf, sharedCurrency, currencyLabel, currencyNotes } from "./currency.js";

test("currency by ticker suffix: plain letters are US dollars, cash and inflation have none", () => {
  assert.equal(currencyOf("SPY"), "USD");
  assert.equal(currencyOf("VOD.L"), "GBp");
  assert.equal(currencyOf("7203.T"), "JPY");
  assert.equal(currencyOf("BDO.PS"), "PHP");
  assert.equal(currencyOf("TBILL91"), "PHP");
  assert.equal(currencyOf("ABC.XX"), "local");
  assert.equal(currencyOf("CASH"), null);
  assert.equal(currencyOf("INFLATION"), null);
});

test("the shared currency of several lines; cash doesn't count", () => {
  assert.equal(sharedCurrency(["SPY", "QQQ", "CASH"]), "USD");
  assert.equal(sharedCurrency(["CASH"]), "USD");
  assert.equal(sharedCurrency(["BDO.PS", "TBILL91"]), "PHP");
  assert.equal(sharedCurrency(["SPY", "VOD.L"]), "mixed");
  assert.equal(currencyLabel(["SPY", "VOD.L", "BND"]), "USD/GBp");
});

test("notes for mixed currencies and for another country's inflation", () => {
  assert.deepEqual(currencyNotes([{ label: "SPY", tickers: ["SPY"] }], false, "PH"), []);
  const mixed = currencyNotes([{ label: "SPY", tickers: ["SPY"] }, { label: "VOD.L", tickers: ["VOD.L"] }], false, "US");
  assert.equal(mixed.length, 1);
  assert.match(mixed[0], /a dollar investor/);
  const [note] = currencyNotes([{ label: "SPY", tickers: ["SPY"] }, { label: "BDO.PS", tickers: ["BDO.PS"] }], true, "PH").slice(1);
  assert.match(note, /^The inflation figures \(Philippines\) are in Philippine pesos, but SPY is priced in US dollars\./);
  assert.deepEqual(currencyNotes([{ label: "VOD.L", tickers: ["VOD.L"] }], true, "GB"), []); // pence are pounds
});
