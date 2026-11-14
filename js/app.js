import { fetchPrices } from "./data.js";

// Tabs: each nav link points at a section id; only the section named in the URL hash is shown.
const tabs = ["backtester", "creator", "monte-carlo"];

function showTab() {
  const hash = location.hash.slice(1);
  const current = tabs.includes(hash) ? hash : tabs[0];
  for (const id of tabs) {
    document.getElementById(id).hidden = id !== current;
    document.querySelector(`nav a[href="#${id}"]`).toggleAttribute("aria-current", id === current);
  }
  scrollTo(0, 0);
}

addEventListener("hashchange", showTab);
showTab();

// Backtester: data check.
const form = document.getElementById("load-form");
const status = document.getElementById("load-status");
const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ticker = form.elements.ticker.value.trim().toUpperCase();
  const button = form.querySelector("button");
  button.disabled = true;
  delete status.dataset.state;
  status.textContent = `Loading ${ticker}…`;
  try {
    const prices = await fetchPrices(ticker);
    const last = prices.at(-1);
    status.textContent =
      `Loaded ${ticker}: ${prices.length.toLocaleString()} daily prices, ` +
      `${formatDate(prices[0].date)} to ${formatDate(last.date)}. Latest adjusted close ${last.adjClose.toFixed(2)}.`;
  } catch (error) {
    status.dataset.state = "error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
