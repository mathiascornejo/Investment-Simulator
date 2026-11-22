// Checks a price series for signs that something is wrong with the data, rather than with the market:
// a one-day move that matches a stock split (prices not adjusted for it), any other one-day move beyond ±40%,
// a gap of more than 10 weekdays, and a latest price more than 10 days old (it may have stopped trading).
// Raw Philippine closes (.PS) need this most: a split there shows as a crash.
import { longDate } from "./format.js";

const SPLITS = [[1 / 2, "a 2-for-1 split"], [1 / 3, "a 3-for-1 split"], [1 / 4, "a 4-for-1 split"], [1 / 5, "a 5-for-1 split"], [1 / 10, "a 10-for-1 split"], [2, "a 1-for-2 reverse split"], [3, "a 1-for-3 reverse split"]];
const DAY = 864e5;

// Weekdays strictly between two "YYYY-MM-DD" dates.
function weekdaysBetween(from, to) {
  let count = 0;
  for (let t = Date.parse(from) + DAY; t < Date.parse(to); t += DAY) if (new Date(t).getUTCDay() % 6) count++;
  return count;
}

// points: [{ date, adjClose }], oldest first. today: "YYYY-MM-DD". Returns the findings, oldest first:
// { kind: "split", date, change, split } | { kind: "jump", date, change } | { kind: "gap", from, to, weekdays } | { kind: "stale", date, days }
export function dataWarnings(points, today = new Date().toISOString().slice(0, 10)) {
  const found = [];
  for (let i = 1; i < points.length; i++) {
    const [before, now] = [points[i - 1], points[i]];
    const ratio = now.adjClose / before.adjClose;
    const split = SPLITS.find(([r]) => Math.abs(ratio / r - 1) <= 0.015);
    if (split) found.push({ kind: "split", date: now.date, change: ratio - 1, split: split[1] });
    else if (Math.abs(ratio - 1) > 0.4) found.push({ kind: "jump", date: now.date, change: ratio - 1 });
    const weekdays = weekdaysBetween(before.date, now.date);
    if (weekdays > 10) found.push({ kind: "gap", from: before.date, to: now.date, weekdays });
  }
  const days = points.length ? Math.round((Date.parse(today) - Date.parse(points.at(-1).date)) / DAY) : 0;
  if (days > 10) found.push({ kind: "stale", date: points.at(-1).date, days });
  return found;
}

const share = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });
const MOST = 3; // sentences per ticker; the rest are counted

// The findings in words, one sentence each, at most three per ticker.
export function warningText(ticker, found) {
  const moved = (w) => `${ticker} ${w.change < 0 ? "fell" : "rose"} ${share.format(Math.abs(w.change))} in one day, on ${longDate(w.date)}`;
  const say = {
    split: (w) => `${moved(w)}, which matches ${w.split}. It looks like a split in unadjusted prices, so returns across that date are wrong.`,
    jump: (w) => `${moved(w)}. That may have happened, or it may be an error in the prices.`,
    gap: (w) => `${ticker} has no prices for ${w.weekdays} weekdays between ${longDate(w.from)} and ${longDate(w.to)}.`,
    stale: (w) => `${ticker}'s latest price is from ${longDate(w.date)}, ${w.days} days ago. It may have stopped trading.`,
  };
  const text = found.slice(0, MOST).map((w) => say[w.kind](w));
  if (found.length > MOST) text.push(`${ticker} has ${found.length - MOST} more ${found.length - MOST === 1 ? "warning" : "warnings"} like these.`);
  return text.join(" ");
}

// Every loaded series ({ ticker: points }) checked, in words; "" when nothing looks wrong. With from and to
// ("YYYY-MM-DD"), only findings on dates inside that span count (a stale latest price always does), so a gap
// years before the dates being compared isn't listed.
export function priceWarnings(prices, today, from = "", to = "9999") {
  const inside = (w) => w.kind === "stale" || ((w.to ?? w.date) >= from && (w.from ?? w.date) <= to);
  return Object.entries(prices).map(([ticker, points]) => warningText(ticker, dataWarnings(points, today).filter(inside))).filter(Boolean).join(" ");
}
