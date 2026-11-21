// Run with: node --test js/data.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { lastClose, fresh, cashSeries } from "./data.js";

const at = (iso) => Date.parse(iso);

test("lastClose: a weekday's close counts from 22:00 UTC; weekends keep Friday's", () => {
  assert.equal(lastClose(at("2026-11-23T21:59:00Z")), "2026-11-20"); // Monday before the close: Friday
  assert.equal(lastClose(at("2026-11-23T22:00:00Z")), "2026-11-23"); // Monday after it
  assert.equal(lastClose(at("2026-11-24T05:00:00Z")), "2026-11-23"); // early Tuesday: still Monday's
  assert.equal(lastClose(at("2026-11-21T12:00:00Z")), "2026-11-20"); // Saturday
  assert.equal(lastClose(at("2026-11-22T23:00:00Z")), "2026-11-20"); // Sunday night
});

test("fresh: a saved copy lasts until the next close, or 6 hours after saving", () => {
  const friday = [{ date: "2026-11-20", adjClose: 1 }];
  const savedFriday = at("2026-11-20T23:00:00Z");
  assert.equal(fresh(friday, savedFriday, at("2026-11-22T10:00:00Z")), true); // the weekend: nothing new
  assert.equal(fresh(friday, savedFriday, at("2026-11-23T22:30:00Z")), false); // Monday's close has passed
  const thursday = [{ date: "2026-11-19", adjClose: 1 }]; // the Worker's copy was older than Friday's close
  assert.equal(fresh(thursday, savedFriday, at("2026-11-21T04:00:00Z")), true); // within 6 hours
  assert.equal(fresh(thursday, savedFriday, at("2026-11-21T05:30:00Z")), false); // then ask again
});

test("cashSeries: weekdays only, from the given start", () => {
  const days = cashSeries(new Date("2026-11-24"), "2026-11-20").map((p) => p.date);
  assert.deepEqual(days, ["2026-11-20", "2026-11-23", "2026-11-24"]);
});
