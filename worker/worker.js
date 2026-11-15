// Proxy between the browser and Tiingo (US + Shanghai/Shenzhen), with Yahoo Finance as the source for everything else
// (tickers with a dot, e.g. VOD.L, and any ticker Tiingo doesn't know). Keeps the API key secret and caches each ticker in KV.
const TTL_SECONDS = 6 * 60 * 60; // end-of-day data changes once a day; 6h keeps us far under Tiingo's 50 requests/hour

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

// shortcut: Yahoo's unofficial chart endpoint, not a licensed API (may break or be blocked; its terms don't allow
// redistribution). Prices stay in the listing currency (London is pence). Returns Tiingo's shape: [{ date, adjClose }].
async function yahoo(ticker) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return { status: res.status === 404 ? 404 : 502 };
  const r = (await res.json()).chart?.result?.[0];
  const adj = r?.indicators?.adjclose?.[0]?.adjclose;
  if (!r?.timestamp || !adj) return { status: 404 };
  const tz = r.meta?.exchangeTimezoneName || "UTC"; // the trading day in the exchange's own timezone
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const rows = [];
  r.timestamp.forEach((t, i) => { if (adj[i] != null) rows.push({ date: day.format(t * 1000), adjClose: adj[i] }); });
  return rows.length ? { body: JSON.stringify(rows) } : { status: 404 };
}

// Company-name lookup for the ticker box, from Yahoo's unofficial search (same caveats as yahoo()).
async function search(q, cors) {
  q = q.trim().slice(0, 40);
  if (q.length < 2) return json([], 200, cors);
  const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return json({ error: "Search unavailable" }, 502, cors);
  const quotes = (await res.json()).quotes || [];
  const rows = quotes.filter((x) => ["EQUITY", "ETF", "MUTUALFUND"].includes(x.quoteType) && x.symbol)
    .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || "", exchange: x.exchDisp || "", type: x.quoteType }));
  return json(rows, 200, { ...cors, "Cache-Control": "public, max-age=3600" });
}

export default {
  async fetch(request, env, ctx) {
    // Stops other websites using this proxy from a browser. A script can fake the Origin header,
    // so this is not real authentication; the cache and Tiingo's own limits cap the damage.
    const origin = request.headers.get("Origin");
    if (!env.ALLOWED_ORIGINS.split(",").includes(origin)) return json({ error: "Origin not allowed" }, 403);
    const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin" };

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/search") return search(url.searchParams.get("q") || "", cors);
    if (request.method !== "GET" || url.pathname !== "/prices") return json({ error: "Not found" }, 404, cors);

    const ticker = (url.searchParams.get("ticker") || "").toUpperCase();
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return json({ error: "Invalid ticker" }, 400, cors);

    let body = await env.CACHE.get(ticker);
    if (body === null) {
      let tiingo = null;
      if (!ticker.includes(".")) {
        // shortcut: passes Tiingo's full daily JSON through untouched (about 2 MB for 30 years).
        // Trim to date + adjClose here if load time becomes a problem.
        const upstream = await fetch(`https://api.tiingo.com/tiingo/daily/${ticker}/prices?startDate=1970-01-01`, {
          headers: { Authorization: `Token ${env.TIINGO_KEY}`, "Content-Type": "application/json" },
        });
        if (upstream.status === 429) return json({ error: "Tiingo's hourly limit is used up. Try again later." }, 429, cors);
        if (upstream.ok) tiingo = await upstream.text();
        else if (upstream.status !== 404) return json({ error: `Tiingo returned an error (${upstream.status})` }, 502, cors);
      }
      if (tiingo !== null) body = tiingo;
      else {
        const y = await yahoo(ticker);
        if (y.status === 404) return json({ error: `No data for ${ticker}` }, 404, cors);
        if (y.status) return json({ error: "Yahoo Finance returned an error" }, 502, cors);
        body = y.body;
      }
      ctx.waitUntil(env.CACHE.put(ticker, body, { expirationTtl: TTL_SECONDS }));
    }
    return new Response(body, { headers: { "Content-Type": "application/json", ...cors } });
  },
};
