// Run with: node --test worker/worker.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const ORIGIN = "http://localhost:8000";

function setup(upstream = () => new Response('[{"date":"2020-01-02","adjClose":1}]')) {
  const store = new Map();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return upstream();
  };
  const env = {
    ALLOWED_ORIGINS: `${ORIGIN},https://someone.github.io`,
    TIINGO_KEY: "test-key",
    CACHE: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) },
  };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const get = async (path, origin = ORIGIN) => {
    const res = await worker.fetch(new Request(`https://proxy.test${path}`, { headers: origin ? { Origin: origin } : {} }), env, ctx);
    await Promise.all(pending);
    return res;
  };
  return { get, calls, store };
}

test("rejects origins that are not on the list, without calling Tiingo", async () => {
  const { get, calls } = setup();
  assert.equal((await get("/prices?ticker=SPY", "https://evil.example")).status, 403);
  assert.equal((await get("/prices?ticker=SPY", null)).status, 403);
  assert.equal(calls.length, 0);
});

test("rejects bad tickers and unknown paths", async () => {
  const { get, calls } = setup();
  assert.equal((await get("/prices?ticker=../../etc")).status, 400);
  assert.equal((await get("/prices")).status, 400);
  assert.equal((await get("/other?ticker=SPY")).status, 404);
  assert.equal(calls.length, 0);
});

test("fetches once with the key, then serves from cache", async () => {
  const { get, calls } = setup();
  const first = await get("/prices?ticker=spy");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.deepEqual(await first.json(), [{ date: "2020-01-02", adjClose: 1 }]);
  assert.match(calls[0].url, /\/tiingo\/daily\/SPY\/prices/);
  assert.equal(calls[0].init.headers.Authorization, "Token test-key");

  const second = await get("/prices?ticker=SPY");
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1);
});

test("passes on Tiingo errors and does not cache them", async () => {
  const { get, store } = setup(() => new Response("{}", { status: 404 }));
  const res = await get("/prices?ticker=NOPE");
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(store.size, 0);
});

test("dotted tickers go straight to Yahoo and come back as date + adjClose", async () => {
  const yahooJson = { chart: { result: [{ meta: { exchangeTimezoneName: "Europe/London" }, timestamp: [1577955600, 1578042000, 1578128400],
    indicators: { adjclose: [{ adjclose: [10, null, 12] }] } }] } };
  const { get, calls } = setup(() => new Response(JSON.stringify(yahooJson)));
  const res = await get("/prices?ticker=vod.l");
  assert.deepEqual(await res.json(), [{ date: "2020-01-02", adjClose: 10 }, { date: "2020-01-04", adjClose: 12 }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /query1\.finance\.yahoo\.com\/v8\/finance\/chart\/VOD\.L/);
});

test("a ticker Tiingo doesn't know falls back to Yahoo", async () => {
  const { get, calls } = setup(() => calls.length === 1 ? new Response("{}", { status: 404 })
    : new Response(JSON.stringify({ chart: { result: [{ timestamp: [1577955600], indicators: { adjclose: [{ adjclose: [5] }] } }] } })));
  const res = await get("/prices?ticker=XYZ");
  assert.deepEqual(await res.json(), [{ date: "2020-01-02", adjClose: 5 }]);
  assert.equal(calls.length, 2);
});

test("SYMBOL.PS reads raw closes from PSE Edge, oldest first, and search adds PSE rows", async () => {
  const { get, calls } = setup((u = calls.at(-1).url) => /autoComplete/.test(u) ? new Response('[{"cmpyId":"260","cmpyNm":"BDO Unibank, Inc.","symbol":"BDO"}]')
    : /stockData/.test(u) ? new Response('<option value="468" selected>BDO</option>')
    : new Response(JSON.stringify({ chartData: [{ CHART_DATE: "Nov 17, 2025 00:00:00", CLOSE: 126 }, { CHART_DATE: "Nov 18, 2025 00:00:00", CLOSE: 127.5 }] })));
  assert.deepEqual(await (await get("/prices?ticker=bdo.ps")).json(), [{ date: "2025-11-17", adjClose: 126 }, { date: "2025-11-18", adjClose: 127.5 }]);
  assert.equal(calls.length, 3);
  const found = await (await get("/search?q=bdo")).json();
  assert.deepEqual(found.at(-1), { symbol: "BDO.PS", name: "BDO Unibank, Inc.", exchange: "Philippine Stock Exchange", type: "EQUITY" });
});

test("search returns symbol, name and exchange for stocks and funds only", async () => {
  const quotes = [{ symbol: "VOD.L", quoteType: "EQUITY", longname: "Vodafone Group Plc", exchDisp: "LSE" },
    { symbol: "^FTSE", quoteType: "INDEX", shortname: "FTSE 100" }];
  const { get, calls } = setup(() => new Response(JSON.stringify({ quotes })));
  const res = await get("/search?q=vodafone");
  assert.deepEqual(await res.json(), [{ symbol: "VOD.L", name: "Vodafone Group Plc", exchange: "LSE", type: "EQUITY" }]);
  assert.ok(calls.some((c) => /v1\/finance\/search\?q=vodafone/.test(c.url)));
  assert.equal((await get("/search?q=v")).status, 200);
  assert.equal(calls.length, 4); // one character is looked up too
  assert.deepEqual(await (await get("/search?q=")).json(), []);
  assert.equal(calls.length, 4); // an empty query is not
  assert.equal((await get("/search?q=vodafone", "https://evil.example")).status, 403);
});

test("/cpi parses FRED's CSV and caches it", async () => {
  const { get, calls } = setup(() => new Response("observation_date,CPIAUCNS\n2020-01-01,257.971\n2020-02-01,.\n2020-03-01,258.115\n"));
  const res = await get("/cpi");
  assert.deepEqual(await res.json(), [{ date: "2020-01-01", value: 257.971 }, { date: "2020-03-01", value: 258.115 }]);
  assert.equal(calls.length, 1);
});
