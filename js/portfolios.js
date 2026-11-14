// Portfolios: the saved list (browser storage) and the engine that turns holdings into one price series.
// A portfolio is { name, holdings: [{ ticker, weight }], rebalance, band }.
// weight is a percentage (60 = 60%); band is in percentage points and only used when rebalance is "band".

export const REBALANCE_RULES = {
  none: "Never (buy and hold)",
  monthly: "Every month",
  quarterly: "Every quarter",
  annual: "Every year",
  band: "When a holding drifts from its target",
};

const STORAGE_KEY = "portfolios";

export function loadPortfolios() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return []; // unreadable storage is treated as "nothing saved"
  }
}

export function savePortfolios(portfolios) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
  dispatchEvent(new Event("portfolios-changed")); // other tabs of the app refresh their lists
}

const periodKey = {
  monthly: (date) => date.slice(0, 7),
  quarterly: (date) => `${date.slice(0, 4)}-Q${Math.ceil(date.slice(5, 7) / 3)}`,
  annual: (date) => date.slice(0, 4),
};

// Simulates holding the portfolio and returns one series shaped like a price series,
// [{ date, adjClose }], starting at 100, so every function in stats.js works on it unchanged.
// `prices` maps ticker -> price series. Only dates that every holding has are used.
// Rebalancing happens at that day's closing prices. Trading costs and taxes are ignored.
export function portfolioSeries(portfolio, prices) {
  const total = portfolio.holdings.reduce((sum, h) => sum + h.weight, 0);
  const holdings = portfolio.holdings.map((h) => ({
    target: h.weight / total,
    byDate: new Map(prices[h.ticker].map((p) => [p.date, p.adjClose])),
  }));
  const dates = prices[portfolio.holdings[0].ticker]
    .map((p) => p.date)
    .filter((date) => holdings.every((h) => h.byDate.has(date)));

  const points = [];
  let rebalances = 0;
  let value = 100;
  let units;
  dates.forEach((date, i) => {
    const price = holdings.map((h) => h.byDate.get(date));
    if (i === 0) units = holdings.map((h, k) => (value * h.target) / price[k]);
    value = units.reduce((sum, u, k) => sum + u * price[k], 0);
    points.push({ date, adjClose: value });

    const drift = Math.max(...holdings.map((h, k) => Math.abs((units[k] * price[k]) / value - h.target)));
    if (drift < 1e-9) return; // already on target: nothing to trade
    const key = periodKey[portfolio.rebalance];
    const next = dates[i + 1];
    const due =
      portfolio.rebalance === "band" ? drift * 100 > portfolio.band : key && next !== undefined && key(next) !== key(date);
    if (due) {
      units = holdings.map((h, k) => (value * h.target) / price[k]);
      rebalances++;
    }
  });
  return { points, rebalances };
}
