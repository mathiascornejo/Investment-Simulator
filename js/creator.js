// Portfolio creator tab: edit and save portfolios, and show a profile of the saved one.
import { fetchPrices, PROXY_URL, inflation } from "./data.js";
import { summarize, correlation, windowOf, dailyReturns, totalReturn, cagr, volatility, maxDrawdown } from "./stats.js";
import { REBALANCE_RULES, loadPortfolios, savePortfolios, portfolioSeries, portfolioProblem, readPortfolio, freeName, riskShares, effectiveHoldings, diversificationRatio } from "./portfolios.js";
import { attachTickerSearch } from "./ticker-search.js";
import { dropdown, liveField } from "./fields.js";
import { pct, num, longDate, show, element } from "./format.js";
import { COLORS, frame, addToCompare } from "./backtester.js";
import { glyph, assetClass, countUp, toast, sparkline } from "./visuals.js";
import { term } from "./glossary.js";

const BENCHMARK = "SPY";
const INK = "#1a1a1a"; // --ink in styles.css (ECharts can't read CSS variables)
const EXAMPLE = [{ ticker: "SPY", weight: 60 }, { ticker: "BND", weight: 40 }];
// Textbook mixes for "Start from". Launch years are the funds' own, so the shortest history is known up front.
const MODELS = {
  "60-40": {
    name: "60/40", label: "60/40 stocks and bonds", holdings: [["SPY", 60], ["AGG", 40]],
    help: "The classic split: 60% US stocks to grow, 40% US bonds to soften the falls. Shortest history: AGG, from 2003.",
  },
  "three-fund": {
    name: "Three-fund", label: "Three-fund portfolio", holdings: [["VTI", 42], ["VXUS", 18], ["BND", 40]],
    help: "The whole US stock market, the rest of the world and US bonds, in three index funds. This is one common split. Shortest history: VXUS, from 2011.",
  },
  permanent: {
    name: "Permanent Portfolio", label: "Permanent Portfolio (Harry Browne)", holdings: [["VTI", 25], ["TLT", 25], ["GLD", 25], ["BIL", 25]],
    help: "Equal parts stocks, long Treasury bonds, gold and Treasury bills, so one part does well in boom, recession, inflation or deflation. Shortest history: BIL, from 2007.",
  },
  butterfly: {
    name: "Golden Butterfly", label: "Golden Butterfly", holdings: [["VTI", 20], ["VBR", 20], ["TLT", 20], ["SHY", 20], ["GLD", 20]],
    help: "Fifths of US stocks, small value stocks, long and short Treasury bonds, and gold: the Permanent Portfolio leaning a little more to growth. Shortest history: GLD, from November 2004.",
  },
  "all-weather": {
    name: "All Weather", label: "All Weather (public version)", holdings: [["VTI", 30], ["TLT", 40], ["IEF", 15], ["GLD", 7.5], ["DBC", 7.5]],
    help: "A public copy of Ray Dalio's idea: mostly Treasury bonds, some stocks, a little gold and commodities, so no single kind of economy hurts too much. Shortest history: DBC, from 2006.",
  },
};
// Holding names that the search can't give: these tickers are built by the app, not listed anywhere.
const names = new Map(Object.entries({ CASH: "Cash", TBILL91: "PH T-bill, 91 days", TBILL182: "PH T-bill, 182 days", TBILL364: "PH T-bill, 364 days" }).map(([t, n]) => [t, Promise.resolve(n)]));
const TICK = '<svg class="tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>'; // as in fields.js
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // names come from the search or a file

const $ = (id) => document.getElementById(id);
const form = $("portfolio-form");
const picker = $("portfolio-pick");
const status = $("portfolio-status");
let editing = ""; // name of the saved portfolio in the form; "" while creating a new one
let snapshot = ""; // the form as last loaded or saved, to tell when it has unsaved changes
let treemap; // ECharts instance, created the first time a profile is shown
let nameIds = 0; // numbers each holding row's name label

const showEmpty = () => ($("creator-empty").hidden = loadPortfolios().length > 0);
addEventListener("portfolios-changed", showEmpty);

function say(text, isError = false, node = status) {
  node.textContent = text;
  if (isError) node.dataset.state = "error";
  else delete node.dataset.state;
}

// The fund or company name for a ticker, looked up once per visit through the proxy's search ("" if unknown).
function nameOf(ticker) {
  if (!names.has(ticker)) {
    names.set(ticker, fetch(`${PROXY_URL}/search?v=2&q=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((found) => found.find((x) => x.symbol?.toUpperCase() === ticker)?.name ?? "")
      .catch(() => ""));
  }
  return names.get(ticker);
}

// The form
function addHolding(ticker = "", weight = "", name = "") {
  const n = $("holdings").children.length + 1;
  const tickerInput = Object.assign(element("input"), { value: ticker, className: "ticker", autocomplete: "off", spellcheck: false });
  tickerInput.setAttribute("aria-label", `Ticker of holding ${n}`);
  const weightInput = Object.assign(element("input"), { type: "number", value: weight, min: "0.01", max: "100", step: "any" });
  weightInput.setAttribute("aria-label", `Weight of holding ${n}, in percent`);
  const remove = Object.assign(element("button", "Remove"), { type: "button", className: "quiet" });
  remove.addEventListener("click", () => {
    row.remove();
    changed();
  });
  const label = Object.assign(element("span"), { className: "name", id: `holding-name-${++nameIds}` });
  tickerInput.setAttribute("aria-describedby", label.id);
  const row = Object.assign(element("div", tickerInput, weightInput, remove, label), { className: "holding" });
  $("holdings").append(row);
  // A picked suggestion brings its name ("Name · Exchange"); anything else is looked up.
  attachTickerSearch(tickerInput, { // after append: it wraps the input in place
    onPick: (text, hint) => {
      tickerInput.value = text;
      const [first, rest] = hint.split(" · ");
      setName(row, rest ? first : "");
      if (!rest) lookUpName(row);
      tickerInput.focus();
      changed();
    },
  });
  tickerInput.placeholder = "Add a ticker";
  tickerInput.addEventListener("input", () => {
    tickerInput.value = tickerInput.value.replace(/[^A-Za-z0-9.\-]/g, ""); // same as the Backtester box
    setName(row, "");
  });
  tickerInput.addEventListener("change", () => { if (!row.dataset.name) lookUpName(row); });
  liveField(weightInput, { compact: true });
  setName(row, name);
  if (ticker && !name) lookUpName(row);
}

function setName(row, name) {
  row.dataset.name = name;
  row.querySelector(".name").textContent = name;
  row.querySelector(".name").title = name; // the full name when it is cut short
}

async function lookUpName(row) {
  const input = row.querySelector("input");
  const ticker = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return;
  const name = await nameOf(ticker);
  if (input.value.trim().toUpperCase() === ticker) setName(row, name); // unless the ticker changed meanwhile
}

const readHoldings = () =>
  [...$("holdings").children].map((row) => {
    const [ticker, weight] = row.querySelectorAll("input");
    return { ticker: ticker.value.trim().toUpperCase(), weight: Number(weight.value), ...(row.dataset.name ? { name: row.dataset.name } : {}) };
  });

// The form's contents as text, compared with the snapshot to spot unsaved changes.
const formState = () =>
  JSON.stringify([...form.querySelectorAll("#portfolio-name, #holdings input, #band, #trade-cost")].map((i) => i.value).concat($("rebalance").value));
const dirty = () => formState() !== snapshot;

function changed() {
  showTotal();
  $("unsaved").hidden = !dirty();
}

function showTotal() {
  const total = readHoldings().reduce((sum, h) => sum + h.weight, 0);
  const gap = 100 - total;
  $("weight-total").textContent =
    Math.abs(gap) < 0.005 ? "Total 100%" : `Total ${num.format(total)}%: ${gap > 0 ? `${num.format(gap)}% left to assign` : `${num.format(-gap)}% too much`}`;
  $("weight-total").toggleAttribute("data-off", Math.abs(gap) >= 0.005);

  // The split bar: a segment per holding in its colour, then the share left to assign or, past 100%, a hatched end piece.
  const parts = readHoldings().map((h, i) => {
    const part = element("span");
    part.style.flexGrow = h.weight > 0 ? h.weight : 0;
    part.style.background = COLORS[i % COLORS.length];
    part.title = `${h.ticker || `Holding ${i + 1}`} ${num.format(h.weight || 0)}%`;
    return part;
  });
  if (gap >= 0.005) {
    const left = Object.assign(element("span"), { className: "left", title: `${num.format(gap)}% left` });
    left.style.flexGrow = gap;
    parts.push(left);
  } else if (gap <= -0.005) {
    const over = Object.assign(element("span"), { className: "over", title: `${num.format(-gap)}% too much` });
    over.style.width = `${(-gap / total) * 100}%`;
    parts.push(over);
  }
  $("split").replaceChildren(...parts);
}

function fillPicker() {
  picker.replaceChildren(
    new Option("New portfolio", ""),
    ...loadPortfolios().map((p) => new Option(p.name, p.name)),
  );
  picker.value = editing;
}

// Puts a portfolio into the form: a saved one (with its profile), an unsaved one (a model), or none (a blank example).
function edit(portfolio, saved = Boolean(portfolio)) {
  editing = saved ? portfolio.name : "";
  fillPicker();
  $("start-from").value = "";
  $("portfolio-name").value = portfolio?.name ?? "";
  $("holdings").replaceChildren();
  for (const h of portfolio?.holdings ?? EXAMPLE) addHolding(h.ticker, h.weight, h.name);
  $("rebalance").value = portfolio?.rebalance ?? "annual";
  $("band").value = portfolio?.band ?? 5;
  $("trade-cost").value = portfolio?.cost ?? 0;
  $("band-field").hidden = $("rebalance").value !== "band";
  $("delete-portfolio").hidden = $("copy-portfolio").hidden = !saved;
  $("profile").hidden = true;
  showEmpty();
  say("");
  snapshot = formState();
  changed();
  if (saved) showProfile(portfolio);
}

// Runs open() at once, or first asks in the status line whether to drop the unsaved changes.
function guard(open) {
  if (!dirty()) return open();
  fillPicker(); // the menus show what is in the form until the user decides
  $("start-from").value = "";
  const discard = Object.assign(element("button", "Discard"), { type: "button", className: "quiet" });
  const keep = Object.assign(element("button", "Keep editing"), { type: "button", className: "quiet" });
  discard.addEventListener("click", open);
  keep.addEventListener("click", () => {
    say("");
    $("portfolio-name").focus();
  });
  say("Discard your changes?");
  status.append(discard, keep);
  setTimeout(() => keep.focus()); // after the menu that was used takes focus back
}

// Returns the portfolio in the form, or a message saying what to fix.
// copy: save under a free name ("Growth (copy)") when the name is taken, leaving the original alone.
function readForm(copy = false) {
  const taken = loadPortfolios().map((p) => p.name);
  const name = $("portfolio-name").value.trim();
  const portfolio = {
    name: copy && name ? freeName(name, taken, "copy") : name,
    holdings: readHoldings(),
    rebalance: $("rebalance").value,
    band: Number($("band").value),
    cost: Number($("trade-cost").value),
  };
  const problem = portfolioProblem(portfolio);
  if (problem) return problem;
  if (portfolio.name !== editing && taken.includes(portfolio.name)) return `You already have a portfolio called ${name}. Pick another name.`;
  return portfolio;
}

// Events
$("add-holding").addEventListener("click", () => {
  addHolding();
  $("holdings").lastElementChild.querySelector("input").focus();
  changed();
});

form.addEventListener("input", changed);
form.addEventListener("change", changed);

$("rebalance").addEventListener("change", () => {
  $("band-field").hidden = $("rebalance").value !== "band";
});

picker.addEventListener("change", () => {
  const next = loadPortfolios().find((p) => p.name === picker.value);
  guard(() => edit(next));
});

$("start-from").addEventListener("change", () => {
  const key = $("start-from").value;
  const model = MODELS[key];
  if (!model) return;
  guard(() => {
    const holdings = model.holdings.map(([ticker, weight]) => ({ ticker, weight }));
    edit({ name: freeName(model.name, loadPortfolios().map((p) => p.name)), holdings, rebalance: "annual", band: 5, cost: 0 }, false);
    $("start-from").value = key; // edit() cleared it; keep the model's explanation showing
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  save(form.querySelector("button[type=submit]"));
});
$("copy-portfolio").addEventListener("click", (event) => save(event.currentTarget, true));

async function save(button, copy = false) {
  const portfolio = readForm(copy);
  if (typeof portfolio === "string") return say(portfolio, true);
  const original = editing; // before the wait: another portfolio may be opened meanwhile

  // Loading the prices proves every ticker exists before anything is saved. Names missing from the rows are looked up meanwhile.
  const buttons = form.querySelectorAll("button[type=submit], #copy-portfolio");
  buttons.forEach((b) => (b.disabled = true));
  say("Checking the tickers…");
  const [loaded, found] = await Promise.all([
    Promise.allSettled(portfolio.holdings.map((h) => fetchPrices(h.ticker))),
    Promise.all(portfolio.holdings.map((h) => h.name || nameOf(h.ticker))),
  ]);
  buttons.forEach((b) => (b.disabled = false));
  const failed = portfolio.holdings.filter((_, i) => loaded[i].status === "rejected").map((h) => h.ticker);
  if (failed.length) return say(`Not saved. No price data was found for ${failed.join(", ")}.`, true);
  portfolio.holdings.forEach((h, i) => { if (found[i]) h.name = found[i]; });

  savePortfolios([...loadPortfolios().filter((p) => copy || p.name !== original), portfolio]);
  edit(portfolio);
  say(copy ? `Saved a copy as ${portfolio.name}. ${original} is unchanged.` : `Saved ${portfolio.name}. It is now available in the Backtester.`);
  flashSaved(button);
  toast(`Saved ${portfolio.name}`, "Open in Backtester", () => addToCompare(portfolio.name));
}

// For a moment the button itself says "Saved", with the tick the fields draw.
function flashSaved(button) {
  if (button.classList.contains("saved")) return; // still showing from a moment ago
  const label = button.textContent;
  button.style.minWidth = `${button.offsetWidth}px`; // the shorter word doesn't make the row jump
  button.classList.add("saved");
  button.innerHTML = `${TICK}Saved`; // our own constant markup
  setTimeout(() => {
    button.classList.remove("saved");
    button.textContent = label;
    button.style.minWidth = "";
  }, 1500);
}

// Deletes at once; the toast's Undo puts it back where it was.
$("delete-portfolio").addEventListener("click", () => {
  const saved = loadPortfolios();
  const at = saved.findIndex((p) => p.name === editing);
  if (at === -1) return;
  const [removed] = saved.splice(at, 1);
  savePortfolios(saved);
  edit();
  toast(`Deleted ${removed.name}`, "Undo", () => {
    const now = loadPortfolios().filter((p) => p.name !== removed.name);
    now.splice(at, 0, removed);
    savePortfolios(now);
    if (dirty()) {
      fillPicker(); // don't overwrite what has been typed since
      return say(`Restored ${removed.name}. Pick it from the Portfolio menu to open it.`);
    }
    edit(removed);
    say(`Restored ${removed.name}.`);
  });
});

// Backup: every saved portfolio as one JSON file, and back again. A restore adds; it never overwrites.
const backupStatus = $("backup-status");
$("backup-portfolios").addEventListener("click", () => {
  const saved = loadPortfolios();
  if (!saved.length) return say("You have no saved portfolios to download yet.", false, backupStatus);
  const file = `portfolios-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }));
  Object.assign(element("a"), { href: url, download: file }).click();
  setTimeout(() => URL.revokeObjectURL(url)); // after the download has started
  say(`Downloaded ${saved.length} portfolio${saved.length === 1 ? "" : "s"} as ${file}.`, false, backupStatus);
});

$("restore-portfolios").addEventListener("click", () => $("restore-file").click());
$("restore-file").addEventListener("change", async () => {
  const file = $("restore-file").files[0];
  $("restore-file").value = ""; // the same file can be picked again
  if (!file) return;
  let list = null;
  try {
    if (file.size <= 2e6) list = JSON.parse(await file.text()); // a real backup is far smaller
  } catch {} // not JSON: handled below
  if (!Array.isArray(list)) return say("That file isn't a portfolio backup. Use a file made with Download my portfolios.", true, backupStatus);

  const saved = loadPortfolios();
  const taken = saved.map((p) => p.name);
  const added = [], skipped = [];
  let already = 0;
  for (const raw of list) {
    const portfolio = readPortfolio(raw);
    if (typeof portfolio === "string") {
      skipped.push(`${String(raw?.name ?? "").trim() || "One without a name"}: ${portfolio}`);
    } else if (saved.some((p) => JSON.stringify(readPortfolio(p)) === JSON.stringify(portfolio))) {
      already++; // restoring the same backup twice adds nothing
    } else {
      portfolio.name = freeName(portfolio.name, taken); // a clash becomes "Name (2)"
      taken.push(portfolio.name);
      added.push(portfolio);
    }
  }
  try {
    if (added.length) savePortfolios([...saved, ...added]);
  } catch {
    return say("Nothing was added: this browser's storage for the site is full.", true, backupStatus);
  }
  fillPicker();
  const plural = (n) => `${n} portfolio${n === 1 ? "" : "s"}`;
  say(
    [
      `Added ${plural(added.length)}${added.length ? `: ${added.map((p) => p.name).join(", ")}` : ""}.`,
      already ? `${plural(already)} you already had ${already === 1 ? "was" : "were"} left as ${already === 1 ? "it was" : "they were"}.` : "",
      skipped.length ? `Skipped ${skipped.length}. ${skipped.join(" ")}` : "",
    ].filter(Boolean).join(" "),
    skipped.length > 0 && !added.length,
    backupStatus,
  );
});

// The profile of a saved portfolio
async function showProfile(portfolio) {
  const tickers = [...new Set([...portfolio.holdings.map((h) => h.ticker), BENCHMARK])];
  let loaded, found;
  try {
    // Names are looked up for holdings saved before names were kept (nameOf never fails).
    [loaded, found] = await Promise.all([Promise.all(tickers.map(fetchPrices)), Promise.all(portfolio.holdings.map((h) => h.name || nameOf(h.ticker)))]);
  } catch (error) {
    return say(`The profile couldn't be loaded: ${error.message}`, true);
  }
  if (editing !== portfolio.name) return; // another portfolio was opened while this one loaded
  portfolio = { ...portfolio, holdings: portfolio.holdings.map((h, i) => (found[i] ? { ...h, name: found[i] } : h)) };
  const prices = Object.fromEntries(tickers.map((t, i) => [t, loaded[i]]));
  const run = portfolioSeries(portfolio, prices);
  const { points } = run;
  if (points.length < 3) return say("These holdings have no dates in common, so the portfolio can't be measured.", true);

  // Colour follows the holding's place in the portfolio, as in the Backtester.
  const colored = portfolio.holdings.map((h, i) => ({ ...h, color: COLORS[i % COLORS.length] }));
  // Each holding's prices on the portfolio's own dates, so the risk figures and the grid use the same days.
  const aligned = portfolio.holdings.map((h) => {
    const byDate = new Map(prices[h.ticker].map((p) => [p.date, p.adjClose]));
    return points.map((p) => ({ date: p.date, adjClose: byDate.get(p.date) }));
  });
  const returns = aligned.map(dailyReturns);
  const weights = portfolio.holdings.map((h) => h.weight);
  const shares = riskShares(weights, returns);
  const sorted = colored.map((h, i) => ({ ...h, risk: shares[i] })).sort((a, b) => b.weight - a.weight);

  drawHeader(portfolio, points);
  drawAllocation(sorted);

  // The measured period is limited by the holding with the shortest history.
  const newest = portfolio.holdings.reduce((a, b) => (prices[b.ticker][0].date > prices[a.ticker][0].date ? b : a));
  const benchmark = windowOf(prices[BENCHMARK], points[0].date, points.at(-1).date).points;
  const benchmarkCovers = benchmark.length > 2 && benchmark[0].date <= points[0].date;
  $("profile-range").textContent =
    (portfolio.holdings.length > 1
      ? `Measured over the period every holding has data for. ${newest.ticker} has the shortest history.`
      : `Measured over ${newest.ticker}'s whole price history.`) +
    (benchmarkCovers ? "" : ` ${BENCHMARK} has no prices before ${longDate(prices[BENCHMARK][0].date)}, so its figures aren't shown.`);
  drawFacts(summarize(points, prices[BENCHMARK]), benchmarkCovers ? summarize(benchmark, prices[BENCHMARK]) : null);
  $("profile-trading").textContent = tradingNote(portfolio, run);
  drawCorrelation(colored, aligned, weights, returns);
  drawRules(portfolio, prices);
  $("profile").hidden = false;
  drawTreemap(sorted);
}

const swatch = (color) => {
  const dot = Object.assign(element("span"), { className: "swatch" });
  dot.style.background = color;
  return dot;
};
const and = (items) => new Intl.ListFormat("en").format(items); // "A, B and C"

// One figure: its label, the number (rolling up), and an optional small line beneath.
function fact(label, value, format, note) {
  const dd = element("dd");
  countUp(dd, value, format);
  return element("div", element("dt", term(label)), dd, ...(note ? [Object.assign(element("dd", note), { className: "note" })] : []));
}

const RULE_TEXT = { none: "Never rebalanced", monthly: "Rebalanced every month", quarterly: "Rebalanced every quarter", annual: "Rebalanced every year" };

// Like a fund page's header: how it grew, and what it is.
function drawHeader(portfolio, points) {
  $("profile-title").textContent = portfolio.name;
  const change = totalReturn(points);
  $("profile-growth").replaceChildren(
    sparkline(points, "currentColor", 120, 32),
    Object.assign(element("strong", pct.format(change)), { className: change < 0 ? "loss" : "gain" }),
    term("total return"),
  );
  const count = portfolio.holdings.length;
  $("profile-meta").textContent = [
    `${count} holding${count === 1 ? "" : "s"}`,
    RULE_TEXT[portfolio.rebalance] ?? `Rebalanced when a holding drifts more than ${portfolio.band} points from its target`,
    `${longDate(points[0].date)} to ${longDate(points.at(-1).date)}`,
    ...(inflation.real ? ["after inflation"] : []),
  ].join(" · ");
}

// One row per holding, largest first: its share of the money and of the ups and downs.
function drawAllocation(holdings) {
  // Both columns share one scale, so a row's two bars can be compared; the longest bar fills its track.
  const top = Math.max(...holdings.flatMap((h) => [h.weight / 100, h.risk]).filter(Number.isFinite));
  const share = (value, color) => {
    const fill = element("i");
    fill.style.width = `${(Math.max(0, value) / top) * 100 || 0}%`; // a negative share has no bar; its figure says it
    fill.style.background = color;
    const figure = Object.assign(element("span", show(value, pct)), { className: "figure" });
    return element("td", Object.assign(element("div", Object.assign(element("span", fill), { className: "track" }), figure), { className: "share" }));
  };
  const head = element("tr", ...["Holding", "Share of money", term("Share of risk")].map((label) => Object.assign(element("th", label), { scope: "col" })));
  const rows = holdings.map((h) => {
    const name = h.name ? [Object.assign(element("small", h.name), { title: h.name })] : [];
    const holding = Object.assign(element("th", swatch(h.color), glyph(assetClass(h.ticker)), h.ticker, ...name), { scope: "row" });
    return element("tr", holding, share(h.weight / 100, h.color), share(h.risk, h.color));
  });
  $("allocation").replaceChildren(element("thead", head), element("tbody", ...rows));
  $("risk-note").textContent = riskNote(holdings);
}

// The lesson of the two columns, told with this portfolio's own numbers.
function riskNote(holdings) {
  if (!holdings.every((h) => Number.isFinite(h.risk))) return "This portfolio's value never moved, so there are no ups and downs to share out.";
  if (holdings.length < 2) return "";
  const gap = (h) => h.risk - h.weight / 100;
  const most = holdings.reduce((a, b) => (gap(b) > gap(a) ? b : a));
  const lesson = gap(most) < 0.02
    ? "Each holding causes about as much of the ups and downs as its share of the money."
    : `${most.ticker} is ${pct.format(most.weight / 100)} of the money but causes ${pct.format(most.risk)} of the ups and downs, because it tends to move further than the portfolio as a whole.`;
  const calming = holdings.filter((h) => h.risk < 0).map((h) => h.ticker);
  const calm = !calming.length ? ""
    : calming.length === 1 ? ` ${calming[0]} tended to move against the rest, so its share is below zero: it calmed the swings.`
    : ` ${and(calming)} tended to move against the rest, so their shares are below zero: they calmed the swings.`;
  return `${lesson}${calm} Shares of risk come from daily returns over the measured period, at the target weights.`;
}

// Return and risk figures in two rows, each with SPY's figure over the same dates beneath it (when SPY has them).
function drawFacts(stats, spy) {
  const rows = [
    ["Return", [["Annualised return", "cagr", pct], ["Best year", "bestYear", pct], ["Worst year", "worstYear", pct]]],
    ["Risk", [["Volatility (annualised)", "volatility", pct], ["Maximum drawdown", "maxDrawdown", pct], [`Beta vs ${BENCHMARK}`, "beta", num], ["Sharpe ratio", "sharpe", num]]],
  ];
  $("facts").replaceChildren(
    ...rows.map(([title, facts]) => {
      const list = Object.assign(element("dl", ...facts.map(([label, key, format]) => fact(label, stats[key], format, spy && `${BENCHMARK} ${show(spy[key], format)}`))), { className: "facts" });
      return Object.assign(element("div", element("h3", title), list), { className: "fact-row" });
    }),
  );
}

// The same holdings and dates under every rebalancing rule, with the saved rule marked. One holding never trades.
function drawRules(portfolio, prices) {
  $("rules-block").hidden = portfolio.holdings.length < 2;
  if (portfolio.holdings.length < 2) return;
  const band = portfolio.band >= 1 && portfolio.band <= 50 ? portfolio.band : 5; // the saved limit; 5 if it was never set
  const head = element("tr", ...["Rule", term("Annualised return"), term("Volatility"), term("Maximum drawdown"), "Times rebalanced"].map((label) => Object.assign(element("th", label), { scope: "col" })));
  const rows = Object.entries(REBALANCE_RULES).map(([rule, label]) => {
    const { points, rebalances } = portfolioSeries({ ...portfolio, rebalance: rule, band }, prices);
    const mine = rule === portfolio.rebalance;
    const name = Object.assign(element("th", rule === "band" ? `${label} by more than ${band} points` : label), { scope: "row" });
    if (mine) name.append(" ", Object.assign(element("span", "Your rule"), { className: "tag" }));
    const row = element("tr", name, ...[cagr(points), volatility(dailyReturns(points)), maxDrawdown(points)].map((v) => element("td", show(v, pct))), element("td", String(rebalances)));
    row.classList.toggle("mine", mine);
    return row;
  });
  $("rules").replaceChildren(element("thead", head), element("tbody", ...rows));
  $("rules-note").textContent = portfolio.cost
    ? `Each rebalance pays your trading cost of ${pct.format(portfolio.cost / 100)} on the money moved. Taxes are left out.`
    : "Trading costs and taxes are left out. Set a trading cost above to include it.";
}

// How much rebalancing traded, and what it cost, per year.
function tradingNote(portfolio, run) {
  if (portfolio.rebalance === "none") return "Never rebalanced, so nothing was traded after the first purchase.";
  const times = `Rebalanced ${run.rebalances} time${run.rebalances === 1 ? "" : "s"}`;
  if (run.yearlyTurnover === null) return `${times}. There is less than a year of data, so no yearly trading figures.`;
  const paid = run.yearlyCost < 0.00005 ? "less than 0.01%" : `about ${pct.format(run.yearlyCost)}`; // pct shows 2 decimals
  const cost = portfolio.cost ? `Trading costs took ${paid} a year.` : "No trading cost is set.";
  return `${times}, trading about ${pct.format(run.yearlyTurnover)} of the portfolio a year. ${cost}`;
}

// Ink or white text, whichever contrasts more with a #rrggbb tile (WCAG relative luminance; ink's is 0.0103).
function labelColor(hex) {
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05;
  return light / 0.0603 >= 1.05 / light ? INK : "#fff";
}

// Weights as tiles: area is the weight.
function drawTreemap(holdings) {
  if (!window.echarts) return;
  if (!treemap) {
    treemap = echarts.init($("treemap"));
    addEventListener("resize", () => treemap.resize());
    addEventListener("hashchange", () => treemap.resize());
  }
  const base = frame(String, num);
  treemap.setOption(
    {
      aria: base.aria,
      textStyle: base.textStyle,
      animation: false,
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (item) => `<strong>${item.name}</strong> ${num.format(item.value)}%${item.data.title ? `<br>${escapeHtml(item.data.title)}` : ""}`,
      },
      series: [{
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        left: 0, right: 0, top: 0, bottom: 0,
        itemStyle: { borderColor: "#fafaf8", borderWidth: 3, gapWidth: 3, borderRadius: 6 },
        // Tickers are letters, digits, dots and dashes, so they can't break the {style|text} markup.
        label: {
          formatter: (item) => `{ticker|${item.name}}\n{weight|${num.format(item.value)}%}`,
          rich: { ticker: { fontWeight: 600, fontSize: 13, lineHeight: 18 }, weight: { fontWeight: 300, fontSize: 18, lineHeight: 24 } },
        },
        // Labels only where they fit (the tooltip still names small tiles), in whichever of ink or white reads better.
        data: holdings.map((h) => ({ name: h.ticker, title: h.name, value: h.weight, itemStyle: { color: h.color }, label: { show: h.weight >= 4, color: labelColor(h.color) } })),
      }],
    },
    true,
  );
}

// Correlation of each pair of holdings' daily returns over the measured period, then how much the mix diversifies.
function drawCorrelation(holdings, aligned, weights, returns) {
  const n = holdings.length;
  $("correlation-block").hidden = n < 2;
  if (n < 2) return;
  const corr = aligned.map((a, i) => aligned.map((b, j) => (j < i ? correlation(a, b) : NaN)));
  const head = element("tr", element("td"), ...holdings.map((h) => Object.assign(element("th", swatch(h.color), h.ticker), { scope: "col", title: h.name ?? "" })));
  const rows = holdings.map((h, i) =>
    element(
      "tr",
      Object.assign(element("th", swatch(h.color), h.ticker, ...(h.name ? [element("small", h.name)] : [])), { scope: "row", title: h.name ?? "" }),
      ...holdings.map((_, j) => {
        if (j > i) return element("td"); // the upper half would repeat the lower half
        if (j === i) {
          const dash = element("span", "–");
          dash.setAttribute("aria-hidden", "true");
          return Object.assign(element("td", dash, Object.assign(element("span", "same holding"), { className: "visually-hidden" })), { className: "self" });
        }
        const c = corr[i][j];
        const cell = element("td", show(c, num));
        // Blue for moving together, orange for moving apart; stronger for bigger numbers. The key under the grid matches.
        if (Number.isFinite(c)) cell.style.background = c >= 0 ? `rgba(42, 120, 214, ${0.08 + 0.6 * c})` : `rgba(235, 104, 52, ${0.08 + 0.6 * -c})`;
        return cell;
      }),
    ),
  );
  $("correlation").replaceChildren(element("thead", head), element("tbody", ...rows));

  $("diversity").replaceChildren(
    fact("Effective number of holdings", effectiveHoldings(weights), num, `Out of ${n} holdings`),
    fact("Diversification ratio", diversificationRatio(weights, returns), num, "1.00 means mixing calmed nothing"),
  );
  const twins = [];
  corr.forEach((row, i) => row.forEach((c, j) => { if (c > 0.95) twins.push([holdings[j].ticker, holdings[i].ticker, c]); }));
  const pair = ([a, b, c]) => `${a} and ${b} (${num.format(c)})`;
  $("duplicates").textContent = !twins.length
    ? "No two holdings move almost identically (a correlation above 0.95)."
    : twins.length === 1
      ? `${twins[0][0]} and ${twins[0][1]} move almost identically (correlation ${num.format(twins[0][2])}), so together they work like one holding.`
      : `These pairs move almost identically, so each pair works like one holding: ${and(twins.map(pair))}.`;
  $("duplicates").classList.toggle("flag", twins.length > 0);
}

// Start
$("rebalance").replaceChildren(...Object.entries(REBALANCE_RULES).map(([value, label]) => new Option(label, value)));
dropdown($("rebalance"), {
  help: {
    none: "Weights drift with the market; no rebalancing trades.",
    monthly: "Back to target weights at the start of each month.",
    quarterly: "Back to target weights every three months.",
    annual: "Back to target weights once a year.",
    band: "Rebalance only when a holding is further from its target than the limit you set.",
  },
});
dropdown(picker);
$("start-from").replaceChildren(new Option("Choose a model…", ""), ...Object.entries(MODELS).map(([key, m]) => new Option(m.label, key)));
dropdown($("start-from"), {
  help: { "": "Fills in the holdings below. You can change them before saving.", ...Object.fromEntries(Object.entries(MODELS).map(([key, m]) => [key, m.help])) },
});
liveField($("band"), { compact: true });
liveField($("trade-cost"), { compact: true });
edit();

addEventListener("inflation-changed", () => { const p = loadPortfolios().find((x) => x.name === editing); if (p) showProfile(p); });
