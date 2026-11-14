// Portfolio creator tab: edit and save portfolios, and show a profile of the saved one.
import { fetchPrices } from "./data.js";
import { summarize } from "./stats.js";
import { REBALANCE_RULES, loadPortfolios, savePortfolios, portfolioSeries } from "./portfolios.js";
import { pct, num, longDate, show, element } from "./format.js";

const BENCHMARK = "SPY";
const MAX_HOLDINGS = 10; // each holding is one request to Tiingo, and the free plan allows 50 an hour
const EXAMPLE = [["SPY", 60], ["BND", 40]];

const $ = (id) => document.getElementById(id);
const form = $("portfolio-form");
const picker = $("portfolio-pick");
const status = $("portfolio-status");
let editing = ""; // name of the saved portfolio in the form; "" while creating a new one

function say(text, isError = false) {
  status.textContent = text;
  if (isError) status.dataset.state = "error";
  else delete status.dataset.state;
}

// The form
function addHolding(ticker = "", weight = "") {
  const n = $("holdings").children.length + 1;
  const tickerInput = Object.assign(element("input"), { value: ticker, className: "ticker", autocomplete: "off", spellcheck: false });
  tickerInput.setAttribute("aria-label", `Ticker of holding ${n}`);
  const weightInput = Object.assign(element("input"), { type: "number", value: weight, min: "0.01", max: "100", step: "any" });
  weightInput.setAttribute("aria-label", `Weight of holding ${n}, in percent`);
  const remove = Object.assign(element("button", "Remove"), { type: "button", className: "quiet" });
  remove.addEventListener("click", () => {
    row.remove();
    showTotal();
  });
  const row = Object.assign(element("div", tickerInput, weightInput, remove), { className: "holding" });
  $("holdings").append(row);
}

const readHoldings = () =>
  [...$("holdings").children].map((row) => {
    const [ticker, weight] = row.querySelectorAll("input");
    return { ticker: ticker.value.trim().toUpperCase(), weight: Number(weight.value) };
  });

function showTotal() {
  const total = readHoldings().reduce((sum, h) => sum + h.weight, 0);
  const gap = 100 - total;
  $("weight-total").textContent =
    Math.abs(gap) < 0.005 ? "Total 100%" : `Total ${num.format(total)}%: ${gap > 0 ? `${num.format(gap)}% left to assign` : `${num.format(-gap)}% too much`}`;
  $("weight-total").toggleAttribute("data-off", Math.abs(gap) >= 0.005);
}

function fillPicker() {
  picker.replaceChildren(
    new Option("New portfolio", ""),
    ...loadPortfolios().map((p) => new Option(p.name, p.name)),
  );
  picker.value = editing;
}

// Puts a saved portfolio (or a blank example) into the form.
function edit(portfolio) {
  editing = portfolio?.name ?? "";
  fillPicker();
  $("portfolio-name").value = editing;
  $("holdings").replaceChildren();
  for (const [ticker, weight] of portfolio ? portfolio.holdings.map((h) => [h.ticker, h.weight]) : EXAMPLE) addHolding(ticker, weight);
  $("rebalance").value = portfolio?.rebalance ?? "annual";
  $("band").value = portfolio?.band ?? 5;
  $("band-field").hidden = $("rebalance").value !== "band";
  $("delete-portfolio").hidden = !portfolio;
  $("profile").hidden = true;
  showTotal();
  say("");
  if (portfolio) showProfile(portfolio);
}

// Returns the portfolio in the form, or a message saying what to fix.
function readForm() {
  const name = $("portfolio-name").value.trim();
  const holdings = readHoldings();
  const tickers = holdings.map((h) => h.ticker);
  const band = Number($("band").value);
  const rebalance = $("rebalance").value;
  if (!name) return "Give the portfolio a name.";
  if (name !== editing && loadPortfolios().some((p) => p.name === name)) return `You already have a portfolio called ${name}. Pick another name.`;
  if (!holdings.length) return "Add at least one holding.";
  if (tickers.some((t) => !/^[A-Z0-9-]{1,10}$/.test(t))) return "Every holding needs a ticker made of letters, digits or dashes.";
  if (new Set(tickers).size < tickers.length) return "Each ticker can appear only once. Combine the duplicates.";
  if (holdings.some((h) => !(h.weight > 0))) return "Every holding needs a weight above 0.";
  if (Math.abs(holdings.reduce((sum, h) => sum + h.weight, 0) - 100) >= 0.005) return "The weights must add up to 100%.";
  if (rebalance === "band" && !(band >= 1 && band <= 50)) return "Set the drift limit between 1 and 50 percentage points.";
  return { name, holdings, rebalance, band };
}

// Events
$("add-holding").addEventListener("click", () => {
  if ($("holdings").children.length >= MAX_HOLDINGS) return say(`A portfolio can have up to ${MAX_HOLDINGS} holdings.`, true);
  addHolding();
  $("holdings").lastElementChild.querySelector("input").focus();
  showTotal();
});

$("holdings").addEventListener("input", showTotal);

$("rebalance").addEventListener("change", () => {
  $("band-field").hidden = $("rebalance").value !== "band";
});

picker.addEventListener("change", () => edit(loadPortfolios().find((p) => p.name === picker.value)));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const portfolio = readForm();
  if (typeof portfolio === "string") return say(portfolio, true);

  // Loading the prices proves every ticker exists before anything is saved.
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  say("Checking the tickers…");
  const loaded = await Promise.allSettled(portfolio.holdings.map((h) => fetchPrices(h.ticker)));
  button.disabled = false;
  const failed = portfolio.holdings.filter((_, i) => loaded[i].status === "rejected").map((h) => h.ticker);
  if (failed.length) return say(`Not saved. No price data was found for ${failed.join(", ")}.`, true);

  savePortfolios([...loadPortfolios().filter((p) => p.name !== editing), portfolio]);
  edit(portfolio);
  say(`Saved ${portfolio.name}. It is now available in the Backtester.`);
});

$("delete-portfolio").addEventListener("click", () => {
  if (!confirm(`Delete the portfolio ${editing}? This can't be undone.`)) return;
  const name = editing;
  savePortfolios(loadPortfolios().filter((p) => p.name !== name));
  edit();
  say(`Deleted ${name}.`);
});

// The profile of a saved portfolio
async function showProfile(portfolio) {
  const tickers = [...new Set([...portfolio.holdings.map((h) => h.ticker), BENCHMARK])];
  let loaded;
  try {
    loaded = await Promise.all(tickers.map(fetchPrices));
  } catch (error) {
    return say(`The profile couldn't be loaded: ${error.message}`, true);
  }
  if (editing !== portfolio.name) return; // another portfolio was opened while this one loaded
  const prices = Object.fromEntries(tickers.map((t, i) => [t, loaded[i]]));
  const { points } = portfolioSeries(portfolio, prices);
  if (points.length < 3) return say("These holdings have no dates in common, so the portfolio can't be measured.", true);

  const count = portfolio.holdings.length;
  $("profile-title").textContent = portfolio.name;

  const sorted = [...portfolio.holdings].sort((a, b) => b.weight - a.weight);
  $("allocation").replaceChildren(
    ...sorted.map((h) => {
      const bar = element("span");
      bar.style.width = `${h.weight}%`;
      return element("div", element("span", h.ticker), Object.assign(element("span", bar), { className: "track" }), element("span", `${num.format(h.weight)}%`));
    }),
  );

  // The measured period is limited by the holding with the shortest history.
  const newest = portfolio.holdings.reduce((a, b) => (prices[b.ticker][0].date > prices[a.ticker][0].date ? b : a));
  $("profile-range").textContent =
    `Measured from ${longDate(points[0].date)} to ${longDate(points.at(-1).date)}` +
    (count > 1 ? `, the period every holding has data for. ${newest.ticker} has the shortest history.` : ".");

  const stats = summarize(points, prices[BENCHMARK]);
  const facts = [
    ["Annualised return", stats.cagr, pct],
    ["Volatility (annualised)", stats.volatility, pct],
    ["Maximum drawdown", stats.maxDrawdown, pct],
    ["Best year", stats.bestYear, pct],
    ["Worst year", stats.worstYear, pct],
    ["Sharpe ratio", stats.sharpe, num],
    [`Beta vs ${BENCHMARK}`, stats.beta, num],
  ];
  $("facts").replaceChildren(...facts.map(([label, value, format]) => element("div", element("dt", label), element("dd", show(value, format)))));
  $("profile").hidden = false;
}

// Start
$("rebalance").replaceChildren(...Object.entries(REBALANCE_RULES).map(([value, label]) => new Option(label, value)));
edit();
