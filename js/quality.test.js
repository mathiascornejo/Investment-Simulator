// Run with: node --test js/quality.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataWarnings, warningText, priceWarnings } from "./quality.js";

// Weekday prices from 2024-01-01 (a Monday), one per value.
function series(values, start = "2024-01-01") {
  const points = [];
  for (let d = new Date(start), i = 0; i < values.length; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6) points.push({ date: d.toISOString().slice(0, 10), adjClose: values[i++] });
  }
  return points;
}
const TODAY = "2024-01-12";

test("a calm series has no warnings", () => {
  assert.deepEqual(dataWarnings(series([100, 101, 99, 102, 103, 100, 98, 99, 101, 102]), TODAY), []);
});

test("a fall to a third, within 1.5%, reads as a 3-for-1 split; 2x as a reverse split", () => {
  const [w] = dataWarnings(series([300, 301, 100.5, 101]), "2024-01-04");
  assert.equal(w.kind, "split");
  assert.equal(w.split, "a 3-for-1 split");
  assert.equal(w.date, "2024-01-03");
  assert.ok(Math.abs(w.change - (100.5 / 301 - 1)) < 1e-12);
  assert.equal(dataWarnings(series([10, 20]), "2024-01-02")[0].split, "a 1-for-2 reverse split");
  // 51 is 2% away from half of 100, so no split; the 49% fall is still beyond 40%, so it is a plain jump.
  assert.equal(dataWarnings(series([100, 51]), "2024-01-02")[0].kind, "jump");
});

test("moves beyond ±40% that match no split are flagged; 40% exactly is not", () => {
  assert.deepEqual(dataWarnings(series([100, 140]), "2024-01-02"), []);
  const [w] = dataWarnings(series([100, 145]), "2024-01-02");
  assert.equal(w.kind, "jump");
  assert.ok(Math.abs(w.change - 0.45) < 1e-12);
});

test("more than 10 weekdays without a price is a gap; 10 is not", () => {
  // 2024-01-01 (Mon) to 2024-01-16 (Tue): 10 weekdays between (2nd to 5th, 8th to 12th, 15th).
  assert.deepEqual(dataWarnings([{ date: "2024-01-01", adjClose: 1 }, { date: "2024-01-16", adjClose: 1 }], "2024-01-16"), []);
  const [w] = dataWarnings([{ date: "2024-01-01", adjClose: 1 }, { date: "2024-01-17", adjClose: 1 }], "2024-01-17");
  assert.deepEqual(w, { kind: "gap", from: "2024-01-01", to: "2024-01-17", weekdays: 11 });
});

test("a latest price more than 10 days old is stale", () => {
  const points = series([1, 1, 1]); // last date 2024-01-03
  assert.deepEqual(dataWarnings(points, "2024-01-13"), []);
  assert.deepEqual(dataWarnings(points, "2024-01-14"), [{ kind: "stale", date: "2024-01-03", days: 11 }]);
});

test("the words name the ticker, the move and the split; more than three are counted", () => {
  const text = warningText("XYZ.PS", dataWarnings(series([300, 100]), "2024-01-02"));
  assert.match(text, /^XYZ\.PS fell 66\.7% in one day, on .*2024, which matches a 3-for-1 split\. It looks like a split in unadjusted prices, so returns across that date are wrong\.$/);
  const many = dataWarnings(series([100, 200, 100, 200, 100, 200]), "2024-01-08");
  assert.equal(many.length, 5);
  assert.match(warningText("ABC", many), /ABC has 2 more warnings like these\.$/);
  assert.equal(priceWarnings({ SPY: series([1, 1.01]) }, "2024-01-02"), "");
});
