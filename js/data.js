import { deflate } from "./inflation.js";
// Address of the Cloudflare Worker proxy (see worker/), as printed by `npx wrangler deploy`.
export const PROXY_URL = "https://investment-simulator-proxy.investmentsimulator.workers.dev";

// Full daily history for one ticker, oldest first: [{ date: "YYYY-MM-DD", adjClose: number }].
// adjClose is adjusted for splits and dividends, so returns computed from it are total returns.
// Each ticker is downloaded once per visit, however many tabs and portfolios ask for it.
const loading = new Map(); // ticker -> promise

// "CASH" is not downloaded: it is a flat price (0% return, no interest) on every weekday since 1990,
// so it lines up with any ticker's dates and every function that takes prices works on it unchanged.
export function cashSeries(end = new Date()) {
  const points = [];
  for (const d = new Date(Date.UTC(1990, 0, 1)); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6) points.push({ date: d.toISOString().slice(0, 10), adjClose: 1 });
  }
  return points;
}

// "Real" mode: every price series comes back in today's dollars (see inflation.js), so each tab's maths
// (returns, drawdowns, Monte Carlo balances and withdrawals) is inflation-adjusted without knowing it.
export const inflation = { real: localStorage.getItem("real") === "1" };
let cpiLoading;
function fetchCpi() {
  cpiLoading ??= fetch(`${PROXY_URL}/cpi`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`inflation data ${r.status}`))));
  cpiLoading.catch(() => (cpiLoading = undefined));
  return cpiLoading;
}

export async function fetchPrices(ticker) {
  const nominal = await fetchNominal(ticker);
  if (!inflation.real) return nominal;
  let cpi;
  try { cpi = await fetchCpi(); } catch { throw new Error("Couldn't load inflation data, so inflation-adjusted returns aren't available. Turn the option off to see nominal returns."); }
  return deflate(nominal, cpi);
}

function fetchNominal(ticker) {
  if (ticker === "CASH") return Promise.resolve(cashSeries());
  if (!loading.has(ticker)) {
    const promise = request(ticker);
    promise.catch(() => loading.delete(ticker)); // a failed load can be tried again
    loading.set(ticker, promise);
  }
  return loading.get(ticker);
}

async function request(ticker) {
  let response;
  try {
    response = await fetch(`${PROXY_URL}/prices?ticker=${encodeURIComponent(ticker)}`);
  } catch {
    throw new Error("Couldn't reach the data proxy. Check that it is deployed and that PROXY_URL in js/data.js is its address.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `The data proxy returned an error (${response.status}).`);
  if (!Array.isArray(data) || data.length === 0) throw new Error(`No price data for ${ticker}.`);
  return data.map((row) => ({ date: row.date.slice(0, 10), adjClose: row.adjClose }));
}
