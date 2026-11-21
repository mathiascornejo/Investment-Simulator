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

// shortcut: Philippine Stock Exchange (BDO.PS) from PSE Edge's website endpoints, which Yahoo lacks. Unofficial and
// unlicensed; closes are RAW (no dividend or split adjustment), so returns understate total return. Upgrade to a paid feed for adjusted data.
const PSE = "https://edge.pse.com.ph";
async function pse(symbol) {
  const hit = (await (await fetch(`${PSE}/autoComplete/searchCompanyNameSymbol.ax?term=${symbol}`)).json()).find((x) => x.symbol === symbol);
  if (!hit) return { status: 404 };
  const page = await (await fetch(`${PSE}/companyPage/stockData.do?cmpy_id=${hit.cmpyId}`)).text();
  const sec = page.match(new RegExp(`<option value="(\\d+)"[^>]*>${symbol}</option>`))?.[1];
  if (!sec) return { status: 404 };
  const end = new Date(), mmddyyyy = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;
  const res = await fetch(`${PSE}/common/DisclosureCht.ax`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmpy_id: hit.cmpyId, security_id: sec, startDate: "01-01-1990", endDate: mmddyyyy(end) }) });
  if (!res.ok) return { status: 502 };
  const rows = ((await res.json()).chartData || []).filter((r) => r.CLOSE > 0)
    .map((r) => ({ date: new Date(r.CHART_DATE.replace(" 00:00:00", " UTC")).toISOString().slice(0, 10), adjClose: r.CLOSE }));
  return rows.length ? { body: JSON.stringify(rows) } : { status: 404 };
}

// PSE name/symbol matches for the ticker box, as SYMBOL.PS; null if PSE Edge failed (then the reply isn't cached).
async function searchPse(q) {
  try {
    const res = await fetch(`${PSE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(q)}`);
    return (await res.json()).slice(0, 3).map((x) => ({ symbol: `${x.symbol}.PS`, name: x.cmpyNm, exchange: "Philippine Stock Exchange", type: "EQUITY" }));
  } catch { return null; }
}

// Company-name lookup for the ticker box, from Yahoo's unofficial search (same caveats as yahoo()).
async function search(q, cors) {
  q = q.trim().slice(0, 40);
  if (!q) return json([], 200, cors);
  const phRows = searchPse(q);
  const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return json({ error: "Search unavailable" }, 502, cors);
  const quotes = (await res.json()).quotes || [];
  const rows = quotes.filter((x) => ["EQUITY", "ETF", "MUTUALFUND"].includes(x.quoteType) && x.symbol)
    .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || "", exchange: x.exchDisp || "", type: x.quoteType }));
  const ph = await phRows;
  rows.push(...ph || []);
  return json(rows, 200, { ...cors, ...ph && { "Cache-Control": "public, max-age=3600" } });
}

// US consumer prices (CPI-U, not seasonally adjusted, monthly since 1913) from FRED's keyless CSV download,
// as [{ date: "YYYY-MM-01", value }]. FRED publishes each month about two weeks after it ends.
async function cpiUs() {
  const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS");
  if (!res.ok) return null;
  const rows = (await res.text()).trim().split("\n").slice(1).map((l) => l.split(","))
    .filter(([d, v]) => /^\d{4}-\d\d-\d\d$/.test(d) && Number(v) > 0).map(([d, v]) => ({ date: d, value: Number(v) }));
  return rows.length ? JSON.stringify(rows) : null;
}

// Any other country: World Bank annual CPI (FP.CPI.TOTL, 2010 = 100, keyless), dated mid-year since it is a yearly average.
// shortcut: annual only and published late, so the latest year or two are missing; the app reuses the last value after that.
async function cpiWorldBank(code) {
  const res = await fetch(`https://api.worldbank.org/v2/country/${code}/indicator/FP.CPI.TOTL?format=json&per_page=100`);
  if (!res.ok) return null;
  const rows = ((await res.json())[1] || []).filter((r) => r.value > 0)
    .map((r) => ({ date: `${r.date}-07-01`, value: r.value })).sort((x, y) => (x.date < y.date ? -1 : 1));
  return rows.length ? JSON.stringify(rows) : null;
}

// US 3-month Treasury bill rate (DTB3: secondary market, discount basis, in percent, each business day since 1954):
// FRED's keyless CSV, passed through as it is, since reading its 19,000 rows here could overrun the free plan's
// 10 ms of CPU. The browser reads it (readDtb3 in js/tbills.js).
async function tbillUs() {
  const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3");
  if (!res.ok) return null;
  const text = await res.text();
  return text.split("\n", 1)[0].includes("DTB3") ? text : null; // not an error page
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
    if (request.method === "GET" && url.pathname === "/cpi") {
      const code = (url.searchParams.get("country") || "US").toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) return json({ error: "Invalid country" }, 400, cors);
      const key = `_cpi_${code}`; // no ticker can start with "_"
      let body = await env.CACHE.get(key);
      if (body === null) {
        body = await (code === "US" ? cpiUs() : cpiWorldBank(code)).catch(() => null);
        if (body === null) return json({ error: `No inflation data for ${code}` }, 502, cors);
        ctx.waitUntil(env.CACHE.put(key, body, { expirationTtl: 24 * TTL_SECONDS }));
      }
      return new Response(body, { headers: { "Content-Type": "application/json", ...cors } });
    }
    if (request.method === "GET" && url.pathname === "/tbill") {
      const key = "_tbill_US"; // no ticker can start with "_"
      let body = await env.CACHE.get(key);
      if (body === null) {
        body = await tbillUs().catch(() => null);
        if (body === null) return json({ error: "No T-bill rates" }, 502, cors);
        ctx.waitUntil(env.CACHE.put(key, body, { expirationTtl: TTL_SECONDS }));
      }
      return new Response(body, { headers: { "Content-Type": "text/csv", ...cors } });
    }
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
        const y = ticker.endsWith(".PS") ? await pse(ticker.slice(0, -3)) : await yahoo(ticker);
        if (y.status === 404) return json({ error: `No data for ${ticker}` }, 404, cors);
        if (y.status) return json({ error: "The price source returned an error" }, 502, cors);
        body = y.body;
      }
      ctx.waitUntil(env.CACHE.put(ticker, body, { expirationTtl: TTL_SECONDS }));
    }
    return new Response(body, { headers: { "Content-Type": "application/json", ...cors } });
  },
};
