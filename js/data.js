import { deflate, priceIndex } from "./inflation.js";
import { TBILLS, fetchTbill } from "./tbills.js";
import { countryName } from "./countries.js";
import { longDate, monthLabel } from "./format.js";
import { toast } from "./visuals.js";
// Address of the Cloudflare Worker proxy (see worker/), as printed by `npx wrangler deploy`.
export const PROXY_URL = "https://investment-simulator-proxy.investmentsimulator.workers.dev";

// Full daily history for one ticker, oldest first: [{ date: "YYYY-MM-DD", adjClose: number }].
// adjClose is adjusted for splits and dividends, so returns computed from it are total returns.
// Each ticker is downloaded once per visit, however many tabs and portfolios ask for it.
const loading = new Map(); // ticker -> promise

// "CASH" is not downloaded: it is a flat price (0% return, no interest) on every weekday since 1990,
// so it lines up with any ticker's dates and every function that takes prices works on it unchanged.
// `start` lets INFLATION use the same weekdays from its first reading.
export function cashSeries(end = new Date(), start = "1990-01-01") {
  const points = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6) points.push({ date: d.toISOString().slice(0, 10), adjClose: 1 });
  }
  return points;
}

// Downloads are also saved in the browser (Cache API), so a reload or a later visit doesn't fetch them again.
// A saved price series is reused while it holds the latest weekday close, counted from 22:00 UTC, and for 6 hours
// after saving whatever it holds: the Worker keeps its own copy for 6 hours, so a download just after a close can
// predate it, and holidays bring no new close. Inflation figures are reused for 24 hours, as the Worker does.
const STORE = "prices-v1";
const HOUR = 36e5;
// The date of the latest weekday close at or before `now` (ms), as "YYYY-MM-DD".
export function lastClose(now) {
  const d = new Date(now - 22 * HOUR); // the day turns over at 22:00 UTC
  while (d.getUTCDay() % 6 === 0) d.setUTCDate(d.getUTCDate() - 1); // Saturday or Sunday: Friday's close
  return d.toISOString().slice(0, 10);
}
export const fresh = (rows, savedAt, now) => now - savedAt < 6 * HOUR || rows.at(-1).date >= lastClose(now);

// Saved copies not refreshed for 30 days are dropped. A copy in use is saved again after each close, so that is
// within a weekend of its last use.
globalThis.caches?.open(STORE).then(async (store) => {
  for (const request of await store.keys()) {
    const hit = await store.match(request);
    if (!(Date.now() - Number(hit?.headers.get("X-Saved")) < 30 * 24 * HOUR)) store.delete(request);
  }
}).catch(() => {});

// Gets `url` through its saved copy: a fresh copy skips the download; if the download fails, any saved copy
// is used instead and a toast says from when. `name` is how the toast refers to it.
async function throughCache(url, isFresh, download, name) {
  let store, copy;
  try {
    store = await caches.open(STORE);
    const hit = await store.match(url);
    const rows = await hit?.json();
    if (Array.isArray(rows) && rows.length) copy = { rows, savedAt: Number(hit.headers.get("X-Saved")) };
  } catch {} // no Cache API (plain http, some private windows) or a damaged copy: download as before
  if (copy && isFresh(copy)) return copy.rows;
  try {
    const rows = await download();
    store?.put(url, new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json", "X-Saved": String(Date.now()) } })).catch(() => {}); // storage full: just don't save
    return rows;
  } catch (error) {
    if (!copy) throw error;
    usedSaved(name, copy.savedAt);
    return copy.rows;
  }
}

// One toast for all the saved copies used at once (a comparison loads several tickers together).
const usedNow = new Map();
let usedTimer;
function usedSaved(name, savedAt) {
  usedNow.set(name, savedAt);
  clearTimeout(usedTimer);
  usedTimer = setTimeout(() => {
    toast(`Couldn't get fresh data. Using copies saved in this browser: ${[...usedNow].map(([n, t]) => `${n} from ${longDate(t)}`).join(", ")}.`);
    usedNow.clear();
  }, 100);
}

// "Real" mode: every price series comes back in today's dollars (see inflation.js), so each tab's maths
// (returns, drawdowns, Monte Carlo balances and withdrawals) is inflation-adjusted without knowing it.
export const inflation = { real: globalThis.localStorage?.getItem("real") === "1", country: globalThis.localStorage?.getItem("country") || "US" };
const cpiLoading = new Map(); // country code -> promise
const latestReading = new Map(); // country code -> date of its latest CPI reading, once loaded
export function fetchCpi(country) {
  if (!cpiLoading.has(country)) {
    const url = `${PROXY_URL}/cpi?country=${country}`;
    const promise = throughCache(url, ({ savedAt }) => Date.now() - savedAt < 24 * HOUR, async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`inflation data ${r.status}`);
      return r.json();
    }, `${countryName(country)} inflation`);
    promise.then((cpi) => latestReading.set(country, cpi.at(-1).date), () => cpiLoading.delete(country));
    cpiLoading.set(country, promise);
  }
  return cpiLoading.get(country);
}

export async function fetchPrices(ticker) {
  const nominal = await fetchNominal(ticker);
  if (!inflation.real) return nominal;
  let cpi;
  try { cpi = await fetchCpi(inflation.country); } catch { throw new Error("Couldn't load inflation data, so inflation-adjusted returns aren't available for that country. Turn the option off to see nominal returns."); }
  return deflate(nominal, cpi);
}

// "INFLATION" is the chosen country's consumer price index on every weekday from its first reading.
// Its name avoids "CPI", which could be a listed fund's ticker.
async function inflationSeries() {
  const country = inflation.country;
  const cpi = await fetchCpi(country).catch(() => { throw new Error(`Couldn't load ${countryName(country)} inflation figures`); });
  return priceIndex(cashSeries(new Date(), cpi[0].date), cpi);
}

// What the INFLATION line is, for the Backtester's notes about the data.
export function inflationNote() {
  const monthly = inflation.country === "US";
  const latest = latestReading.get(inflation.country);
  return `${countryName(inflation.country)} consumer prices (${monthly ? "FRED CPI-U, monthly" : "World Bank, yearly"}), filled in between readings.` +
    ` The line runs flat after the latest reading${latest ? `, ${monthly ? monthLabel(latest.slice(0, 7)) : `the ${latest.slice(0, 4)} average`}` : ""}.` +
    (inflation.real ? " With Inflation-adjusted on it is flat all the way, because it is measured against itself." : "");
}

function fetchNominal(ticker) {
  if (ticker === "CASH") return Promise.resolve(cashSeries());
  if (ticker === "INFLATION") return inflationSeries();
  if (ticker in TBILLS) return fetchTbill(ticker); // static file in the repo, not the proxy
  if (!loading.has(ticker)) {
    const url = `${PROXY_URL}/prices?ticker=${encodeURIComponent(ticker)}`;
    const promise = throughCache(url, ({ rows, savedAt }) => fresh(rows, savedAt, Date.now()), () => request(url, ticker), ticker);
    promise.catch(() => loading.delete(ticker)); // a failed load can be tried again
    loading.set(ticker, promise);
  }
  return loading.get(ticker);
}

async function request(url, ticker) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Couldn't reach the data proxy. Check that it is deployed and that PROXY_URL in js/data.js is its address.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `The data proxy returned an error (${response.status}).`);
  if (!Array.isArray(data) || data.length === 0) throw new Error(`No price data for ${ticker}.`);
  return data.map((row) => ({ date: row.date.slice(0, 10), adjClose: row.adjClose }));
}
