// Portfolios: the saved list (browser storage) and the engine that turns holdings into one price series.
// A portfolio is { name, holdings: [{ ticker, weight, name? }], rebalance, band, cost? }.
// weight is a percentage (60 = 60%); band is in percentage points and only used when rebalance is "band";
// cost is the trading cost in percent of each trade (0.1 = 0.1%), missing on portfolios saved before it existed.
// A holding's name is the fund or company name, when the search knew it.

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

// What is wrong with a portfolio, in words, or "" if nothing. The form and file restores both use it.
export function portfolioProblem(p) {
  const tickers = p.holdings.map((h) => h.ticker);
  if (!p.name) return "Give the portfolio a name.";
  if (!p.holdings.length) return "Add at least one holding.";
  if (tickers.some((t) => !/^[A-Z0-9.-]{1,12}$/.test(t))) return "Every holding needs a ticker made of letters, digits, dots or dashes.";
  if (new Set(tickers).size < tickers.length) return "Each ticker can appear only once. Combine the duplicates.";
  if (p.holdings.some((h) => !(h.weight > 0))) return "Every holding needs a weight above 0.";
  if (Math.abs(p.holdings.reduce((sum, h) => sum + h.weight, 0) - 100) >= 0.005) return "The weights must add up to 100%.";
  if (!Object.hasOwn(REBALANCE_RULES, p.rebalance)) return "Pick a rebalancing rule.";
  if (p.rebalance === "band" && !(p.band >= 1 && p.band <= 50)) return "Set the drift limit between 1 and 50 percentage points.";
  if (!(p.cost >= 0 && p.cost <= 5)) return "Set the trading cost between 0% and 5%.";
  return "";
}

// One entry of a backup file -> a clean portfolio, or a message saying why it can't be used.
// The file comes from outside the app, so every field is rebuilt rather than trusted.
export function readPortfolio(raw) {
  if (!Array.isArray(raw?.holdings)) return "It has no list of holdings.";
  const p = {
    name: String(raw.name ?? "").trim().slice(0, 40),
    holdings: raw.holdings.map((h) => ({
      ticker: String(h?.ticker ?? "").trim().toUpperCase(),
      weight: Number(h?.weight),
      ...(typeof h?.name === "string" && h.name.trim() ? { name: h.name.trim().slice(0, 100) } : {}),
    })),
    rebalance: raw.rebalance,
    band: Number(raw.band ?? 5),
    cost: Number(raw.cost ?? 0),
  };
  return portfolioProblem(p) || p;
}

// The first free name: name, then "name (2)", "name (3)"... With a tag: name, "name (copy)", "name (copy 2)"...
// The name is shortened so the result stays within the form's 40 characters.
export function freeName(name, taken, tag = "") {
  const fit = (suffix) => name.slice(0, 40 - suffix.length).trimEnd() + suffix;
  if (!taken.includes(name)) return name;
  if (tag && !taken.includes(fit(` (${tag})`))) return fit(` (${tag})`);
  for (let n = 2; ; n++) {
    const candidate = fit(` (${tag ? `${tag} ` : ""}${n})`);
    if (!taken.includes(candidate)) return candidate;
  }
}

const periodKey = {
  monthly: (date) => date.slice(0, 7),
  quarterly: (date) => `${date.slice(0, 4)}-Q${Math.ceil(date.slice(5, 7) / 3)}`,
  annual: (date) => date.slice(0, 4),
};

// Simulates holding the portfolio and returns one series shaped like a price series,
// [{ date, adjClose }], starting at 100, so every function in stats.js works on it unchanged.
// `prices` maps ticker -> price series. Only dates that every holding has are used.
// Rebalancing happens at that day's closing prices. Each rebalance pays the trading cost on the money moved,
// sum of |target value - current value|, before resetting to target; the first purchase is free. Taxes are ignored.
// Also returns, per year (null under a year of data, like cagr in stats.js), the one-way share of the portfolio
// traded (half the money moved over the value) and the share of the value paid in trading costs.
export function portfolioSeries(portfolio, prices) {
  const total = portfolio.holdings.reduce((sum, h) => sum + h.weight, 0);
  const cost = (portfolio.cost ?? 0) / 100;
  const holdings = portfolio.holdings.map((h) => ({
    target: h.weight / total,
    byDate: new Map(prices[h.ticker].map((p) => [p.date, p.adjClose])),
  }));
  const dates = prices[portfolio.holdings[0].ticker]
    .map((p) => p.date)
    .filter((date) => holdings.every((h) => h.byDate.has(date)));

  const points = [];
  let rebalances = 0;
  let traded = 0; // sum over rebalances of one-way trades / value
  let paid = 0; // sum over rebalances of cost / value
  let value = 100;
  let units;
  dates.forEach((date, i) => {
    const price = holdings.map((h) => h.byDate.get(date));
    if (i === 0) units = holdings.map((h, k) => (value * h.target) / price[k]);
    value = units.reduce((sum, u, k) => sum + u * price[k], 0);

    const drift = Math.max(...holdings.map((h, k) => Math.abs((units[k] * price[k]) / value - h.target)));
    const key = periodKey[portfolio.rebalance];
    const next = dates[i + 1];
    const due =
      drift >= 1e-9 && // already on target: nothing to trade
      (portfolio.rebalance === "band" ? drift * 100 > portfolio.band : key && next !== undefined && key(next) !== key(date));
    if (due) {
      const moved = holdings.reduce((sum, h, k) => sum + Math.abs(value * h.target - units[k] * price[k]), 0);
      traded += moved / 2 / value;
      paid += (cost * moved) / value;
      value -= cost * moved;
      units = holdings.map((h, k) => (value * h.target) / price[k]);
      rebalances++;
    }
    points.push({ date, adjClose: value });
  });
  const years = dates.length > 1 ? (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 864e5) : 0;
  return {
    points,
    rebalances,
    yearlyTurnover: years >= 1 ? traded / years : null,
    yearlyCost: years >= 1 ? paid / years : null,
  };
}
