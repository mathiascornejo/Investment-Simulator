// Address of the Cloudflare Worker proxy (see worker/), as printed by `npx wrangler deploy`.
export const PROXY_URL = "https://investment-simulator-proxy.investmentsimulator.workers.dev";

// Full daily history for one ticker, oldest first: [{ date: "YYYY-MM-DD", adjClose: number }].
// adjClose is adjusted for splits and dividends, so returns computed from it are total returns.
export async function fetchPrices(ticker) {
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
