// Proxy between the browser and Tiingo: keeps the API key secret and caches each ticker in KV.
const TTL_SECONDS = 6 * 60 * 60; // end-of-day data changes once a day; 6h keeps us far under Tiingo's 50 requests/hour

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export default {
  async fetch(request, env, ctx) {
    // Stops other websites using this proxy from a browser. A script can fake the Origin header,
    // so this is not real authentication; the cache and Tiingo's own limits cap the damage.
    const origin = request.headers.get("Origin");
    if (!env.ALLOWED_ORIGINS.split(",").includes(origin)) return json({ error: "Origin not allowed" }, 403);
    const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin" };

    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/prices") return json({ error: "Not found" }, 404, cors);

    const ticker = (url.searchParams.get("ticker") || "").toUpperCase();
    if (!/^[A-Z0-9-]{1,10}$/.test(ticker)) return json({ error: "Invalid ticker" }, 400, cors);

    let body = await env.CACHE.get(ticker);
    if (body === null) {
      // shortcut: passes Tiingo's full daily JSON through untouched (about 2 MB for 30 years).
      // Trim to date + adjClose here if load time becomes a problem.
      const upstream = await fetch(`https://api.tiingo.com/tiingo/daily/${ticker}/prices?startDate=1970-01-01`, {
        headers: { Authorization: `Token ${env.TIINGO_KEY}`, "Content-Type": "application/json" },
      });
      if (upstream.status === 404) return json({ error: `No data for ${ticker}` }, 404, cors);
      if (upstream.status === 429) return json({ error: "Tiingo's hourly limit is used up. Try again later." }, 429, cors);
      if (!upstream.ok) return json({ error: `Tiingo returned an error (${upstream.status})` }, 502, cors);
      body = await upstream.text();
      ctx.waitUntil(env.CACHE.put(ticker, body, { expirationTtl: TTL_SECONDS }));
    }
    return new Response(body, { headers: { "Content-Type": "application/json", ...cors } });
  },
};
