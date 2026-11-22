// Backtester tab: load tickers, pick a period, draw three charts and a statistics table.
// All maths lives in stats.js; this file is fetching, state and drawing.
import { fetchPrices, inflationNote, inflation, basisTag, within } from "./data.js";
import { attachTickerSearch } from "./ticker-search.js";
import { windowOf, summarize, drawdowns, periodReturns, niceAxis, gapRange, drawdownEpisodes, rollingReturns, holdingPeriods, spread, correlation, moments, histogram, normalCdf } from "./stats.js";
import { loadPortfolios, portfolioSeries } from "./portfolios.js";
import { CRISES } from "./montecarlo.js";
import { TBILLS, US_TBILL } from "./tbills.js";
import { pct, num, moneyIn, longDate, monthLabel, show, element, downloadCsv } from "./format.js";
import { glyph, assetClass, countUp, tryAgain } from "./visuals.js";
import { term } from "./glossary.js";
import { currencyOf, currencyName, currencyLabel, currencyNotes, currencyWord, sharedCurrency } from "./currency.js";
import { priceWarnings } from "./quality.js";
import { linkFor, clearLink, linkedPortfolios, copyLink, offerSave, recipe, exampleCards } from "./links.js";

const DEFAULT_BENCHMARK = "SPY"; // what beta and the other relative figures compare with, unless the Benchmark box says otherwise
const START_VALUE = 10000;
const MAX_SERIES = 10; // one colour each; see COLORS
// Fixed order, checked colour-blind safe on white. A colour belongs to the line, never its place in the list
// (see paint), so a line keeps its colour when others are removed or fail to load.
export const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#7b5cc4", "#8c6239", "#22a6b8", "#5d6b7a", "#a8a22a"]; // shortcut: colours 6-10 not colour-blind validated
const INK = "#1a1a1a";
const MUTED = "#66665f";
const GRID = "#ecece7";
const AXIS = "#cfcfc8";
const WASH = "#f0f0ec"; // --wash in styles.css (ECharts can't read CSS variables)

const $ = (id) => document.getElementById(id);
const form = $("compare-form");

const status = $("compare-status");
const input = $("tickers");
let chips = []; // what is being compared, in colour order: a ticker or a saved portfolio's name
let linked = []; // portfolios a share link brought that aren't saved here; they compare like saved ones
const portfolios = () => [...linked, ...loadPortfolios()];
// A chip's tickers: a portfolio's holdings, or the ticker itself.
const tickersOf = (label) => portfolios().find((p) => p.name === label)?.holdings.map((h) => h.ticker) ?? [label];

// Adds a ticker or saved portfolio to the comparison and redraws.
export function addToCompare(label) {
  if (!chips.some((c) => c.toUpperCase() === label.toUpperCase())) chips.push(label);
  if (location.hash !== "#backtester") location.hash = "#backtester";
  form.requestSubmit();
}

// Tickers and portfolio names only. A comma ends an entry and adds it, like picking a suggestion; checked on input,
// not on the key, since phone keyboards don't always say which key was pressed. (Before the search's own listener,
// so it searches only what is left.)
input.addEventListener("input", () => {
  const entries = input.value.replace(/[^A-Za-z0-9.\-, ]/g, "").split(",");
  input.value = entries.pop().trimStart(); // the text after the last comma is still being typed
  const ended = entries.map((t) => t.trim()).filter(Boolean);
  for (const label of ended) if (!chips.some((c) => c.toUpperCase() === label.toUpperCase())) chips.push(label);
  if (ended.length) form.requestSubmit();
});
attachTickerSearch(input, { extra: () => portfolios().map((p) => [p.name, "Saved portfolio"]), onPick: addToCompare });
input.addEventListener("keydown", (event) => {
  if (event.key === "Backspace" && !input.value && chips.length) removeChip(chips.at(-1));
});

function removeChip(label) {
  chips = chips.filter((c) => c !== label);
  if (chips.length) return form.requestSubmit();
  renderChips();
  $("results").hidden = true;
  say("");
}

// Each compared line keeps its colour while it stays; a new one takes the first colour no other line has.
const colorOf = new Map(); // chip label -> colour
function paint() {
  for (const label of colorOf.keys()) if (!chips.includes(label)) colorOf.delete(label);
  for (const label of chips) if (!colorOf.has(label)) colorOf.set(label, COLORS.find((c) => ![...colorOf.values()].includes(c)) ?? MUTED);
}

// Lines in different currencies (or none in dollars) show each one's currency beside its name.
const showCodes = (labels) => sharedCurrency(labels.flatMap(tickersOf)) !== "USD";
const codeTag = (label) => Object.assign(element("small", currencyLabel(tickersOf(label))), { className: "cur" });

// One chip per compared line: colour, kind of asset, its currency when they differ, the change over the chosen period.
function renderChips(windows = []) {
  input.placeholder = chips.length ? "" : "Add a ticker or portfolio"; // the hint only shows while the box is empty
  paint();
  const codes = showCodes(chips);
  $("chips").replaceChildren(
    ...chips.map((label) => {
      const w = windows.find((x) => x.label === label);
      const dot = Object.assign(element("span"), { className: "dot" });
      dot.style.background = colorOf.get(label);
      const isPortfolio = portfolios().some((p) => p.name === label);
      const remove = Object.assign(element("button", "✕"), { type: "button", title: `Remove ${label}` });
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.addEventListener("click", () => removeChip(label));
      const parts = [dot, glyph(isPortfolio ? "portfolio" : assetClass(label)), label, ...(codes && currencyLabel(tickersOf(label)) ? [codeTag(label)] : [])];
      if (w) {
        const change = w.points.at(-1).adjClose / w.points[0].adjClose - 1;
        parts.push(Object.assign(element("span", pct.format(change)), { className: `chg ${change < 0 ? "loss" : "gain"}` }));
      }
      return Object.assign(element("li", ...parts, remove), { className: "chip" });
    }),
  );
}

const state = {
  series: [], // [{ label, color, points }]: a ticker or a saved portfolio
  benchName: DEFAULT_BENCHMARK, // a ticker or a saved portfolio's name
  benchmark: [], // its whole price history ([] when it didn't load)
  showBench: false, // draw it as a dashed grey line on the growth and drawdown charts
  bench: null, // { label, color, points } over the period on show, when it covers the whole period
  bill: null, // USTBILL's whole price history, for the risk-free rate in Sharpe and Sortino (null when it didn't load)
  billLoading: false, // it hadn't come when the results were drawn: they use 0% until it does, then redraw
  min: "", // first date every asset has
  max: "", // last date every asset has
  start: "",
  end: "",
  preset: "12",
  log: false,
  step: "day", // time between chart points: day | week | month (statistics always use every day)
  keyLength: 4, // 4 = returns by year, 7 = by month
  heat: 0, // which line the monthly heatmap shows
  spreadLine: 0, // which line the spread of monthly returns shows
  crisis: null, // a past crash from CRISES while its button is on; any other period change turns it off
  rollYears: 1, // years in each stretch of the rolling returns chart
  windows: [],
  stats: [], // summarize() of each window, for the CSV download
};
let unit = moneyIn("USD"); // how amounts read: in the lines' shared currency, or plain numbers when they differ
let mixed = false; // the lines are in different currencies, so each amount is in its line's own
let linkPeriod = null; // the period a share link asks for, applied once its lines have loaded
let charts; // created on first draw, once the containers are visible and have a size

// Formatting (the shared formatters live in format.js; these are only for chart axes)
const pctAxis = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0, signDisplay: "negative" });
const pctPin = new Intl.NumberFormat(undefined, { style: "percent", maximumSignificantDigits: 2, signDisplay: "negative" }); // -15%, -2.3%
const ruler = document.createElement("canvas").getContext("2d");
const textWidth = (text, size, weight = 400) => {
  ruler.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
  return ruler.measureText(text).width;
};
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // portfolio names are typed by the user

// Statistics table rows, in labelled groups: [label, key, format, better, why it can be missing].
// better: 1 when higher is better, -1 when lower is (volatility), 0 when neither is (beta).
// benchWhy: why the benchmark rows are blank, when they are (the benchmark has no prices for the whole period).
// rfWhy: why there is no risk-free rate, so Sharpe and Sortino used 0%.
const statGroups = (name, benchWhy, rfWhy) => [
  ["Growth", [
    ["Total return", "totalReturn", pct, 1],
    ["Annualised return", "cagr", pct, 1, "Needs at least one year"],
    [`${unit.money.format(START_VALUE)} became`, "finalValue", unit.money, 1],
  ]],
  ["Ups and downs", [
    ["Volatility (annualised)", "volatility", pct, -1],
    ["Maximum drawdown", "maxDrawdown", pct, 1],
    ["Best year", "bestYear", pct, 1, "Needs at least one full calendar year"],
    ["Worst year", "worstYear", pct, 1, "Needs at least one full calendar year"],
    ["Monthly value at risk (95%)", "valueAtRisk", pct, 1, "Needs at least 24 full calendar months"],
    ["Expected shortfall (95%)", "expectedShortfall", pct, 1, "Needs at least 24 full calendar months"],
  ]],
  ["Reward for the risk", [
    ["Sharpe ratio", "sharpe", num, 1, "Needs a line that moves up and down"],
    ["Sortino ratio", "sortino", num, 1, "Needs a line that moves up and down"],
    ["Risk-free rate (average)", "riskFree", pct, 0, rfWhy],
  ]],
  ["Compared with the benchmark", [
    [`Beta vs ${name}`, "beta", num, 0, benchWhy],
    [`Alpha vs ${name}`, "alpha", pct, 1, benchWhy],
    [`R-squared vs ${name}`, "rSquared", pct, 0, benchWhy],
    [`Tracking error vs ${name}`, "trackingError", pct, 0, benchWhy],
    [`Information ratio vs ${name}`, "informationRatio", num, 1, benchWhy],
  ]],
];

// "+$920", "-$80", "$0": a plus only when the figure doesn't round to zero.
const withSign = (value, format) => (value > 0 && format.format(value) !== format.format(0) ? "+" : "") + format.format(value);
const hiddenText = (text) => Object.assign(element("span", text), { className: "visually-hidden" });

function say(text, isError = false) {
  status.textContent = text;
  status.toggleAttribute("data-state", isError);
  if (isError) status.dataset.state = "error";
}

const monthsBefore = (date, months) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

// Select a preset (months back from the latest date, or "max"), clamped to the data we have.
function applyPreset(months) {
  state.preset = months;
  state.crisis = null;
  state.end = state.max;
  const wanted = months === "max" ? state.min : monthsBefore(state.max, months);
  state.start = wanted < state.min ? state.min : wanted;
}

// Loading
let loads = 0; // counts loads: only the latest one draws its results (an older one can finish later) and un-fades them
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const keep = keepPeriod; // only the benchmark changed (benchChanged)
  keepPeriod = false;
  // Saved portfolios are typed by name (names may hold spaces), so lift those out; what's left is tickers.
  let text = [...chips, input.value].filter((t) => t.trim()).join(", ");
  const picked = [];
  for (const p of portfolios().sort((a, b) => b.name.length - a.name.length)) {
    const name = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(`(^|,)\\s*${name}\\s*(?=,|$)`, "i");
    if (found.test(text)) { picked.push(p); text = text.replace(found, "$1"); }
  }
  const tickers = [...new Set(text.toUpperCase().split(/[\s,]+/).filter(Boolean))];
  if (tickers.some((t) => !/^[A-Z0-9.-]{1,12}$/.test(t))) {
    say("Tickers can only contain letters, digits, dots and dashes.", true);
    return;
  }
  // The benchmark: a saved portfolio by name, else a ticker. An empty box means the default.
  const benchText = benchInput.value.trim() || DEFAULT_BENCHMARK;
  const benchPortfolio = portfolios().find((p) => p.name.toUpperCase() === benchText.toUpperCase());
  const bench = benchPortfolio
    ? { label: benchPortfolio.name, tickers: benchPortfolio.holdings.map((h) => h.ticker), portfolio: benchPortfolio }
    : { label: benchText.toUpperCase(), tickers: [benchText.toUpperCase()] };
  if (!benchPortfolio && !/^[A-Z0-9.-]{1,12}$/.test(bench.label)) {
    say("The benchmark must be a ticker (letters, digits, dots and dashes) or the name of a saved portfolio.", true);
    return;
  }
  benchInput.value = benchAsked = bench.label;
  // Portfolios first, then tickers. Each line's colour comes from paint(), not from this order.
  const lines = [
    ...picked.map((p) => ({ label: p.name, tickers: p.holdings.map((h) => h.ticker), portfolio: p })),
    ...tickers.map((t) => ({ label: t, tickers: [t] })),
  ];
  if (!lines.length || lines.length > MAX_SERIES) {
    say(`Choose between 1 and ${MAX_SERIES} portfolios and tickers in total.`, true);
    return;
  }

  chips = lines.map((l) => l.label);
  input.value = "";
  renderChips();
  const button = form.querySelector("button[type=submit]");
  const hadFocus = document.activeElement === button;
  button.disabled = true;
  $("bt-skeleton").hidden = !$("results").hidden;
  const ticket = ++loads;
  $("results").setAttribute("aria-busy", "true"); // results already on screen fade until the new ones are drawn below
  say(`Loading ${lines.map((l) => l.label).join(", ")}…`);
  const wanted = [...new Set([...lines.flatMap((l) => l.tickers), ...bench.tickers])];
  // The risk-free rate for Sharpe and Sortino. It holds the results up a second at most: if it hasn't come by then,
  // they use 0% and are drawn again when it does. If it fails, they use 0% and the table says so.
  const billLoad = fetchPrices(US_TBILL).catch(() => null);
  const loaded = await Promise.allSettled(wanted.map(fetchPrices));
  const bill = await within(billLoad, 1000);
  if (ticket !== loads) return; // a newer Compare (or a setting change) started meanwhile: only its results are drawn
  state.bill = bill ?? null;
  state.billLoading = bill === undefined;
  if (bill === undefined) billLoad.then((b) => { if (ticket === loads && !$("results").hidden) { Object.assign(state, { bill: b, billLoading: false }); draw(); } });
  button.disabled = false;
  if (hadFocus && document.activeElement === document.body) button.focus({ preventScroll: true }); // disabling it dropped focus
  $("bt-skeleton").hidden = true;
  $("results").setAttribute("aria-busy", "false");
  const prices = {};
  const errors = {};
  wanted.forEach((t, i) => {
    if (loaded[i].status === "fulfilled") prices[t] = loaded[i].value;
    else errors[t] = loaded[i].reason;
  });
  const why = (t) => errors[t].message.replace(/\.$/, "");
  // After the message: anything odd in the prices that did load, and a Try again button when it could help.
  const report = (problems) => {
    say([...problems, priceWarnings(prices)].filter(Boolean).join(" "), problems.length > 0);
    if (Object.values(errors).some((e) => e.retry !== false)) tryAgain(status, () => form.requestSubmit());
  };

  const problems = [];
  state.series = [];
  lines.forEach((l) => {
    const missing = l.tickers.find((t) => !prices[t]);
    if (missing) return problems.push(`${l.label} didn't load: ${why(missing)}.`);
    const points = l.portfolio ? portfolioSeries(l.portfolio, prices).points : prices[l.label];
    if (points.length < 3) return problems.push(`${l.label} can't be measured: its holdings have no dates in common.`);
    state.series.push({ label: l.label, color: colorOf.get(l.label), points, tickers: l.tickers });
  });
  state.benchName = bench.label;
  state.benchmark = [];
  const benchMissing = bench.tickers.find((t) => !prices[t]);
  const benchPoints = benchMissing ? [] : bench.portfolio ? portfolioSeries(bench.portfolio, prices).points : prices[bench.label];
  if (benchMissing) problems.push(`The benchmark, ${bench.label}, didn't load: ${why(benchMissing)}. Figures compared with it are left blank.`);
  else if (benchPoints.length < 3) problems.push(`The benchmark, ${bench.label}, can't be used: its holdings have no dates in common.`);
  else state.benchmark = benchPoints;

  if (!state.series.length) {
    $("results").hidden = true;
    report(problems);
    return;
  }

  // Only the dates every asset has can be compared.
  const latestStarter = state.series.reduce((a, b) => (b.points[0].date > a.points[0].date ? b : a));
  state.min = latestStarter.points[0].date;
  state.max = state.series.map((s) => s.points.at(-1).date).sort()[0];
  if (state.min >= state.max) {
    $("results").hidden = true;
    say("These assets have no dates in common, so they can't be compared.", true);
    return;
  }
  // 1 year is the default period; a new benchmark keeps the period on show when it still fits; a link brings its own.
  const asked = linkPeriod;
  linkPeriod = null;
  if (asked) applyLinkPeriod(asked);
  else if (!(keep && state.start >= state.min && state.end <= state.max)) applyPreset("12");
  drawDataNotes(latestStarter);
  drawHolding();

  report(problems);
  $("results").hidden = false;
  $("bt-examples").hidden = true; // the example cards go after the first comparison
  $("bt-share-status").replaceChildren();
  draw();
});

// A share link's period: a past crash (when a line has prices for all of it), a preset, or From and To dates
// (kept inside the dates every line has). Anything else falls back to 1 year.
function applyLinkPeriod({ preset, from, to, crisis }) {
  const crash = CRISES.find((c) => c.name === crisis);
  if (crash && state.series.some((s) => covers(s.points, crash.start, crash.end))) return Object.assign(state, { crisis: crash, preset: "", start: crash.start, end: crash.end });
  if (["1", "12", "36", "60", "120", "max"].includes(preset)) return applyPreset(preset);
  const day = /^\d{4}-\d\d-\d\d$/;
  const [start, end] = [from < state.min ? state.min : from, to > state.max ? state.max : to];
  if (day.test(from) && day.test(to) && start < end) return Object.assign(state, { preset: "", crisis: null, start, end });
  applyPreset("12");
}

// Controls
for (const group of document.querySelectorAll(".presets")) group.addEventListener("click", (event) => {
  const months = event.target.dataset.months;
  if (!months) return;
  applyPreset(months);
  draw();
});

for (const id of ["from", "to"]) {
  $(id).addEventListener("change", () => {
    const from = $("from").value;
    const to = $("to").value;
    if (!from || !to || from >= to) {
      say("Pick a From date that is before the To date.", true);
      return;
    }
    say("");
    state.preset = "";
    state.crisis = null;
    state.start = from < state.min ? state.min : from;
    state.end = to > state.max ? state.max : to;
    draw();
  });
}

$("log-scale").addEventListener("change", (event) => {
  state.log = event.target.checked;
  draw();
});

// A new benchmark loads straight away when results are showing (otherwise with the next Compare).
const benchInput = $("benchmark");
let benchAsked = DEFAULT_BENCHMARK; // the benchmark the last Compare asked for, so a pick and the box's change event load it once
let keepPeriod = false;
function benchChanged() {
  const text = benchInput.value.trim() || DEFAULT_BENCHMARK;
  if (text.toUpperCase() === benchAsked.toUpperCase() || $("results").hidden) return;
  keepPeriod = true;
  form.requestSubmit();
}
attachTickerSearch(benchInput, { extra: () => portfolios().map((p) => [p.name, "Saved portfolio"]), onPick: (text) => { benchInput.value = text; benchChanged(); } });
benchInput.addEventListener("change", benchChanged);
$("show-bench").addEventListener("change", (event) => {
  state.showBench = event.target.checked;
  if (!$("results").hidden) draw();
});

$("heat-pick").addEventListener("click", (event) => {
  const index = event.target.dataset.index;
  if (index === undefined) return;
  state.heat = Number(index);
  drawHeatmap(state.windows);
});

$("spread-pick").addEventListener("click", (event) => {
  const index = event.target.dataset.index;
  if (index === undefined) return;
  state.spreadLine = Number(index);
  if (charts) drawSpread(state.windows);
});

$("step").addEventListener("click", (event) => {
  if (!event.target.dataset.step) return;
  state.step = event.target.dataset.step;
  draw();
});

// Zoom (wheel, around the pointer) and pan (drag) on the growth and drawdown charts, like TradingView.
// Both just move state.start / state.end and redraw, so the dates, table and every chart follow.
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
// Does a series have prices for the whole of start..end? A week's slack for holidays and other markets' closed days.
const covers = (points, start, end) => Date.parse(points[0].date) - Date.parse(start) <= 7 * DAY && Date.parse(end) - Date.parse(points.at(-1).date) <= 7 * DAY;
function setSpan(start, end) {
  const span = Math.min(end - start, Date.parse(state.max) - Date.parse(state.min));
  const lo = Math.min(Math.max(start, Date.parse(state.min)), Date.parse(state.max) - span);
  const { preset, crisis, start: from, end: to } = state;
  Object.assign(state, { preset: "", crisis: null, start: iso(lo), end: iso(lo + span) });
  if (state.series.some((s) => windowOf(s.points, state.start, state.end).points.length < 3)) Object.assign(state, { preset, crisis, start: from, end: to }); // too few points: keep the old range
  else requestAnimationFrame(draw);
}
// While the wheel is scrolling the page, a chart passing under the pointer lets it carry on scrolling;
// zooming starts once the wheel has been still for 400 ms with the pointer on the chart.
let pageWheelAt = -Infinity;
addEventListener("wheel", (event) => { if (!event.defaultPrevented) pageWheelAt = event.timeStamp; }, { passive: true });
let zoomTipShown = false; // "Scroll to zoom" shows once per visit, on the first mouse hover over either chart
for (const id of ["growth-chart", "drawdown-chart"]) {
  const box = $(id);
  const chart = () => charts?.[id.split("-")[0]];
  const msAt = (event) => chart().convertFromPixel({ xAxisIndex: 0 }, event.offsetX);
  box.addEventListener("pointerenter", (event) => {
    if (zoomTipShown || event.pointerType !== "mouse" || !chart()) return;
    zoomTipShown = true;
    const tip = Object.assign(element("span", "Scroll to zoom"), { className: "zoom-tip" });
    tip.setAttribute("aria-hidden", "true"); // the "How to zoom" word above the chart says the same in words
    box.append(tip);
    setTimeout(() => tip.remove(), 4000);
  });
  box.addEventListener("wheel", (event) => {
    if (!chart() || !state.start || event.timeStamp - pageWheelAt < 400) return;
    event.preventDefault();
    const [start, end] = [Date.parse(state.start), Date.parse(state.end)];
    // Like TradingView: while the latest date is showing, it stays put and the left side moves.
    const at = state.end === state.max ? end : Math.min(Math.max(msAt(event), start), end);
    // Scaled by how far the wheel turned (a trackpad fires many small events, a mouse a few big ones): 100 px = 5%.
    const k = Math.exp((Math.max(-100, Math.min(100, event.deltaY * (event.deltaMode === 1 ? 33 : 1))) * 0.05) / 100);
    setSpan(at - (at - start) * k, at + (end - at) * k);
  }, { passive: false });
  box.addEventListener("pointerdown", (event) => {
    if (!chart() || !state.start) return;
    box.setPointerCapture(event.pointerId);
    const [start, end, x0] = [Date.parse(state.start), Date.parse(state.end), event.offsetX];
    const msPerPx = (msAt({ offsetX: x0 + 100 }) - msAt({ offsetX: x0 })) / 100;
    // Dragging along the date axis (bottom strip) stretches the range instead of moving it.
    if (event.offsetY > box.clientHeight - 30) {
      box.onpointermove = (e) => setSpan(end - (end - start) * 1.0005 ** ((x0 - e.offsetX)), end);
    } else box.onpointermove = (e) => setSpan(start - (e.offsetX - x0) * msPerPx, end - (e.offsetX - x0) * msPerPx);
    box.onpointerup = () => { box.onpointermove = box.onpointerup = null; };
  });
  box.addEventListener("dblclick", () => { applyPreset("12"); draw(); }); // reset, like double-clicking a TradingView axis
}

$("period").addEventListener("click", (event) => {
  const keyLength = event.target.dataset.keyLength;
  if (!keyLength) return;
  state.keyLength = Number(keyLength);
  draw();
});

// Past crashes: From and To jump to the S&P 500's peak-to-trough dates (CRISES). A line without prices for the
// whole crash is left out of that view and named in the note above the chart, so nothing is cut short quietly.
const lower = (text) => text[0].toLowerCase() + text.slice(1);
const crashButtons = [...$("crashes").querySelectorAll("button")];
for (const b of crashButtons) {
  const c = CRISES.find((x) => x.name === b.dataset.crisis);
  b.title = `${c.name}: ${longDate(c.start)} to ${longDate(c.end)}`;
}
$("crashes").addEventListener("click", (event) => {
  const crisis = CRISES.find((c) => c.name === event.target.dataset.crisis);
  if (!crisis) return;
  if (!state.series.some((s) => covers(s.points, crisis.start, crisis.end))) {
    $("crisis-note").textContent = `No line here has prices for the whole ${lower(crisis.name)}, from ${longDate(crisis.start)} to ${longDate(crisis.end)}, so the period stays as it was.`;
    return;
  }
  Object.assign(state, { crisis, preset: "", start: crisis.start, end: crisis.end });
  draw();
});

$("rolling-years").addEventListener("click", (event) => {
  const years = Number(event.target.dataset.years);
  if (!years) return;
  state.rollYears = years;
  if (charts) drawRolling(state.windows);
});

// Drawing
function draw() {
  const c = state.crisis;
  const shown = c ? state.series.filter((s) => covers(s.points, c.start, c.end)) : state.series;
  // history: the line's whole series, for the charts that look back before From.
  const windows = shown.map((s) => ({ ...s, history: s.points, ...windowOf(s.points, state.start, state.end) }));
  if (windows.some((w) => w.points.length < 3)) {
    say("That period is too short to measure. Pick a longer one.", true);
    return;
  }
  $("crisis-note").textContent = c ? [
    `${c.name}: the S&P 500's fall from its high on ${longDate(c.start)} to its low on ${longDate(c.end)}.`,
    ...state.series.filter((s) => !shown.includes(s)).map((s) => `${s.label} isn't shown: it has no prices ${s.points[0].date > c.start ? `before ${longDate(s.points[0].date)}` : `after ${longDate(s.points.at(-1).date)}`}.`),
  ].join(" ") : "";

  for (const b of document.querySelectorAll(".presets button")) b.setAttribute("aria-pressed", b.dataset.months === state.preset);
  for (const b of $("step").children) b.setAttribute("aria-pressed", b.dataset.step === state.step);
  for (const b of $("period").children) b.setAttribute("aria-pressed", Number(b.dataset.keyLength) === state.keyLength);
  for (const b of crashButtons) b.setAttribute("aria-pressed", b.dataset.crisis === c?.name);
  for (const [id, value] of [["from", state.start], ["to", state.end]]) {
    Object.assign($(id), { min: state.start < state.min ? state.start : state.min, max: state.max, value }); // a crash can start before the common dates
  }

  // The period in words, from the same From and To as the boxes; trading days are the days with a price move.
  const days = Math.max(...windows.map((w) => w.points.length)) - 1;
  $("period-caption").textContent = `${longDate(state.start)} to ${longDate(state.end)} · ${duration(state.start, state.end)} · ${days.toLocaleString()} trading days`;

  // The benchmark counts only when it has prices for the whole period: never a shorter stretch, quietly.
  const bw = windowOf(state.benchmark, state.start, state.end);
  state.bench = bw.points.length > 2 && covers(bw.points, state.start, state.end) ? { label: state.benchName, color: MUTED, ...bw } : null;
  const compared = windows.some((w) => w.label === state.benchName);
  const drawn = state.showBench && state.bench && !compared ? state.bench : null; // the dashed line, when one is wanted
  const gap = state.benchmark.length ? benchGap() : ""; // one that didn't load is explained in the status line
  $("bench-note").textContent = gap ? `The benchmark, ${state.benchName}, has ${gap}, so the figures compared with it are left blank${state.showBench ? " and it isn't drawn" : ""}.`
    : drawn ? `The grey dashed line is the benchmark, ${benchTitle()}.`
    : state.showBench && compared ? `The benchmark, ${state.benchName}, is already one of the lines, so it isn't drawn twice.` : "";

  // Amounts in the lines' shared currency; when they differ, plain numbers, each in its own line's currency.
  const code = sharedCurrency(windows.flatMap((w) => w.tickers));
  unit = moneyIn(code);
  mixed = code === "mixed";
  $("growth-title").textContent = `Growth of ${unit.money.format(START_VALUE)}${inflation.real ? ` (today's ${currencyWord(code)})` : ""}`;

  state.windows = windows;
  renderChips(windows);
  // The only bill rate is in US dollars, so a line priced in another currency takes off 0% (the data notes say so).
  const stats = windows.map((w) => summarize(w.points, state.bench ? state.benchmark : [], w.nextDate, START_VALUE, inDollars(w.tickers) ? state.bill : null));
  state.stats = stats;
  drawTable(windows, stats);
  drawSummary(windows, stats);
  drawGapNote(windows, stats);
  drawHeatmap(windows);
  drawFalls(windows);
  drawCorrelation(windows);

  if (!window.echarts) {
    say("The chart library didn't load, so only the table is shown. Check your connection and reload.", true);
    return;
  }
  if (!charts) {
    charts = Object.fromEntries(["growth", "returns", "rolling", "drawdown", "spread", "scatter"].map((n) => [n, echarts.init($(`${n}-chart`))]));
    echarts.connect([charts.growth, charts.drawdown]); // hovering one moves the crosshair on the other
    const resize = () => Object.values(charts).forEach((c) => c.resize());
    addEventListener("resize", resize);
    addEventListener("hashchange", resize); // the tab may have been hidden while the window changed size
  }
  const grid = timeGrid(drawn ? [...windows, drawn] : windows);
  drawGrowth(windows, grid, drawn);
  drawReturns(windows);
  drawRolling(windows);
  drawDrawdowns(windows, grid, drawn);
  drawSpread(windows);
  drawScatter(windows, stats);
}

const inDollars = (tickers) => sharedCurrency(tickers) === "USD";

// "the S&P 500 (SPY)" for the default benchmark, else its ticker or portfolio name.
const benchTitle = (start = false) => (state.benchName === DEFAULT_BENCHMARK ? `${start ? "The" : "the"} S&P 500 (SPY)` : state.benchName);
// Why the benchmark can't be used for the period on show ("no prices before 29 Jan 1993"), or "" when it can.
function benchGap() {
  if (state.bench || !state.benchmark.length) return "";
  return state.benchmark[0].date > state.start ? `no prices before ${longDate(state.benchmark[0].date)}` : `no prices after ${longDate(state.benchmark.at(-1).date)}`;
}

function swatch(color) {
  const node = element("span");
  node.className = "swatch";
  node.style.background = color;
  return node;
}

// A table group's heading row: the line's colour and name in the first column (which stays put when a phone scrolls
// the table sideways, like the statistics table's group rows), an empty cell across the rest.
const groupRow = (w, columns) => Object.assign(element("tr", Object.assign(element("th", swatch(w.color), w.label), { scope: "rowgroup" }), Object.assign(element("td"), { colSpan: columns - 1 })), { className: "group" });
const headRow = (...labels) => element("tr", ...labels.map((text) => Object.assign(element("th", text), { scope: "col" })));
const names = new Intl.ListFormat(undefined, { type: "conjunction" }); // "SPY, QQQ and GLD"
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
// Calendar time between two dates: "12 days", "5 months", "2.3 years".
function duration(from, to) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY);
  const months = Math.round(days / 30.44);
  if (days < 31) return days === 1 ? "1 day" : `${days} days`;
  if (months < 24) return months === 1 ? "1 month" : `${months} months`;
  return `${oneDecimal.format(days / 365.25)} years`;
}
// A share in whole percent that never rounds a few cases away: "under 1%" rather than "0%".
const shareOf = (x) => (x > 0 && x < 0.005 ? "under 1%" : x < 1 && x > 0.995 ? "over 99%" : pctAxis.format(x));

function drawTable(windows, stats) {
  const pair = windows.length === 2;
  const columns = windows.length + (pair ? 1 : 0);
  const codes = showCodes(windows.map((w) => w.label));
  const columnHeads = windows.map((w) => Object.assign(element("th", swatch(w.color), w.label, ...(codes ? [codeTag(w.label)] : [])), { scope: "col" }));
  if (pair) columnHeads.push(Object.assign(element("th", "Gap"), { scope: "col", title: "How far ahead the better of the two is. The colour shows which one." }));

  const why = state.bench ? undefined : state.benchmark.length ? `${state.benchName} has ${benchGap()}` : `${state.benchName} didn't load`;
  const rfWhy = !windows.some((w) => inDollars(w.tickers)) ? `${windows.length > 1 ? "These lines aren't" : "This line isn't"} priced in US dollars, and the only bill rate here is for dollars, so Sharpe and Sortino use 0%`
    : state.billLoading ? "US T-bill rates are still loading, so Sharpe and Sortino use 0% for now"
    : `${state.bill ? `US T-bill rates start on ${longDate(state.bill[0].date)}` : "US T-bill rates didn't load"}, so Sharpe and Sortino use 0%`;
  const groups = statGroups(state.benchName, why, rfWhy).map(([name, metrics]) => element(
    "tbody",
    Object.assign(element("tr", Object.assign(element("th", name), { scope: "rowgroup" }), Object.assign(element("td"), { colSpan: columns })), { className: "group" }),
    ...metrics.map(([label, key, format, better, why]) => {
      const head = Object.assign(element("th", term(label)), { scope: "row" });
      const values = stats.map((s) => s[key]);
      // A row no line can fill (under a year, say) gets one note across the columns instead of a row of dashes.
      if (why && !values.some(Number.isFinite)) {
        return Object.assign(element("tr", head, Object.assign(element("td", why), { colSpan: columns, className: "why" })), { className: "na" });
      }
      const best = bestIndex(values, format, better);
      const cells = values.map((v, i) => (i === best
        ? Object.assign(element("td", show(v, format), hiddenText(" (best)")), { className: "best" })
        : element("td", show(v, format))));
      if (pair) cells.push(gapCell(windows, values, format, better));
      return element("tr", head, ...cells);
    }),
  ));
  $("stats").replaceChildren(element("thead", element("tr", element("td"), ...columnHeads)), ...groups);
}

// The column with the best figure in a row, or -1: never for beta (better = 0), for ties as shown, or under two figures.
function bestIndex(values, format, better) {
  const figures = values.filter(Number.isFinite);
  if (!better || figures.length < 2) return -1;
  const top = better > 0 ? Math.max(...figures) : Math.min(...figures);
  return figures.filter((v) => format.format(v) === format.format(top)).length > 1 ? -1 : values.indexOf(top);
}

// Two lines: the colour of the one ahead on this row, then the size of the gap (never a signed subtraction).
function gapCell(windows, [a, b], format, better) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return element("td", "–");
  // A gap between two percentages is in percentage points, not percent.
  const size = format === pct ? `${num.format(Math.abs(a - b) * 100)} pts` : format.format(Math.abs(a - b));
  if (!better || format.format(a) === format.format(b)) return element("td", size); // beta, or level: nobody is ahead
  const ahead = windows[(a - b) * better > 0 ? 0 : 1];
  return Object.assign(element("td", swatch(ahead.color), hiddenText(`${ahead.label} ahead by `), size), { className: "gap", title: `${ahead.label} is ahead by ${size}` });
}

const listed = (tickers) => `${tickers.join(" and ")} ${tickers.length > 1 ? "are" : "is"}`;

// About the data, under the table: each line's first and last price, its currency and what its prices leave out,
// and which line limits the dates the comparison can cover. Built once per load: it doesn't depend on the period on show.
function drawDataNotes(latestStarter) {
  const notes = state.series.map((s) => {
    const tickers = s.tickers;
    const currencies = [...new Set(tickers.map(currencyOf).filter(Boolean))].map(currencyName);
    const raw = tickers.filter((t) => t.endsWith(".PS"));
    const bills = tickers.filter((t) => t in TBILLS);
    const parts = [`prices from ${longDate(s.points[0].date)} to ${longDate(s.points.at(-1).date)}${tickers.length > 1 ? ", the dates all its holdings have" : ""}.`];
    if (currencies.length === 1) parts.push(`Priced in ${currencies[0]}.`);
    if (currencies.length > 1) parts.push(`Its holdings are priced in ${currencies.join(" and ")}, each left in its own currency.`);
    if (tickers.includes("CASH")) parts.push("Cash earns no interest.");
    if (tickers.includes("INFLATION")) parts.push(inflationNote());
    if (bills.length) parts.push(`${listed(bills)} built from benchmark yields, earning the yield each day and ignoring price moves.`);
    if (tickers.includes(US_TBILL)) parts.push(`${US_TBILL} is built from the 3-month US Treasury bill rate (FRED, DTB3), earning it each day and ignoring price moves.`);
    if (raw.length) parts.push(`${listed(raw)} priced without dividends or splits, so returns understate what holders earned, and a split shows as a sudden fall.`);
    else if (tickers.some((t) => currencyOf(t) && !(t in TBILLS) && t !== US_TBILL)) parts.push("Dividends are reinvested.");
    if (!inDollars(tickers)) parts.push("Its Sharpe and Sortino ratios use a 0% risk-free rate, because the only bill rate here is for US dollars.");
    return element("li", swatch(s.color), element("strong", s.label), `: ${parts.join(" ")}`);
  });
  if (state.series.some((s) => s.points[0].date < state.min)) {
    notes.push(element("li", `The earliest the comparison can start is ${longDate(state.min)}, because ${latestStarter.label}'s prices start then.`));
  }
  const ender = state.series.find((s) => s.points.at(-1).date === state.max);
  if (state.series.some((s) => s.points.at(-1).date > state.max)) {
    notes.push(element("li", `The latest it can end is ${longDate(state.max)}, because ${ender.label}'s prices stop then.`));
  }
  notes.push(...currencyNotes(state.series.map((s) => ({ label: s.label, tickers: s.tickers })), inflation.real, inflation.country).map((text) => element("li", text)));
  $("data-notes").replaceChildren(...notes);
}

// Holding periods: bought at each month-end of a line's whole history and held 1 to 20 years (holdingPeriods in
// stats.js). Built once per load, since it doesn't depend on the period on show. A dash: the history is too short.
const HOLDS = [1, 3, 5, 10, 15, 20];
function drawHolding() {
  const groups = state.series.map((s) => element("tbody", groupRow(s, 6), ...HOLDS.map((years) => {
    const h = holdingPeriods(s.points, years);
    return element(
      "tr",
      Object.assign(element("th", years === 1 ? "1 year" : `${years} years`), { scope: "row" }),
      element("td", h ? h.count.toLocaleString() : "–"),
      element("td", h ? shareOf(h.lossShare) : "–"),
      ...["low", "median", "high"].map((key) => element("td", h ? pct.format(h[key]) : "–")),
    );
  })));
  $("holding").replaceChildren(element("thead", headRow("Held for", "Start months", "Lost money", "Worst", "Median", "Best")), ...groups);
}

// Options shared by all three charts. Tooltip text comes from tickers (validated A-Z, 0-9, dash)
// and our own formatted numbers, so building it as HTML is safe.
export function frame(formatHeader, format, pointer = "line") {
  const axisLabel = { color: MUTED, fontSize: 12 };
  return {
    useUTC: true,
    animation: false, // charts redraw on every control change; animating each one only adds delay
    aria: { enabled: true },
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily },
    grid: { left: 4, right: 16, top: 12, bottom: 4 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: pointer, snap: true, lineStyle: { color: MUTED, type: "dashed" }, shadowStyle: { color: "rgba(21, 35, 59, 0.06)" } },
      backgroundColor: "#fff",
      borderColor: AXIS,
      textStyle: { color: INK, fontSize: 13 },
      formatter: (items) =>
        `<strong>${formatHeader(items[0].axisValue)}</strong>` +
        items
          .map((item) => {
            const value = Array.isArray(item.value) ? item.value[1] : item.value;
            return `<div style="display:flex;justify-content:space-between;gap:1.5rem"><span>${item.marker}${escapeHtml(item.seriesName)}</span><span>${show(value, format)}</span></div>`;
          })
          .join(""),
    },
    xAxis: { axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false }, axisLabel: { ...axisLabel, hideOverlap: true }, splitLine: { show: false } }, // narrow charts drop dates that would overlap
    yAxis: { axisLabel, splitLine: { lineStyle: { color: GRID } } },
  };
}

// The benchmark: a thin grey dashed line, so it never takes one of the ten series colours.
const benchLine = (w, data, extra = {}) => line(w, data, { name: `${w.label} (benchmark)`, z: 1, lineStyle: { width: 1.5, color: MUTED, type: "dashed" }, ...extra });

const line = (w, data, extra = {}) => ({
  name: w.label,
  type: "line",
  showSymbol: false, // no downsampling: it drops different dates per line, so the tooltip would miss assets
  symbol: "circle", symbolSize: 6, // the circle shown on each line where the crosshair sits (TradingView style)
  lineStyle: { width: 2, color: w.color },
  itemStyle: { color: w.color, borderColor: "#fff", borderWidth: 2 },
  emphasis: { focus: "none", scale: 1.6 }, // axis hover highlights the circle on each line
  data,
  ...extra,
});

// Readable ticks for a log axis: 1, 1.5, 2, 3, 5 and 7 times each power of ten inside the range.
// (Left alone, a log axis only marks powers of ten, which can mean one label for the whole chart.)
function logTicks(min, max) {
  const ticks = [];
  for (let power = 10 ** Math.floor(Math.log10(min)); power <= max; power *= 10) {
    for (const m of [1, 1.5, 2, 3, 5, 7]) if (m * power >= min && m * power <= max) ticks.push(m * power);
  }
  return ticks;
}

// Thin [date, value] pairs to one point per day / week / month: the last value in each, placed at the
// start of its bucket so every line shares the same dates (the shared tooltip needs that).
function resample(pairs) {
  const key = (date) => {
    if (state.step === "month") return `${date.slice(0, 7)}-01`;
    if (state.step === "week") return iso(Date.parse(date) - ((new Date(date).getUTCDay() + 6) % 7) * DAY); // Monday
    return date;
  };
  const last = new Map(pairs.map(([date, value]) => [key(date), value]));
  return [...last].map(([date, value]) => [Date.parse(date), value]);
}

// The label at the end of a growth line: its name (shortened if long, more so on narrow screens) and what $10,000 became.
function endText(w) {
  const name = w.label.replace(/[{}]/g, ""); // braces would be read as ECharts rich-text markup
  const narrow = charts.growth.getWidth() < 560;
  const most = narrow ? 8 : 18;
  // On narrow charts the value is shortened too ($168K), so the labels leave room for the lines.
  const value = (narrow ? unit.moneyCompact : unit.moneyFit).format((START_VALUE * w.points.at(-1).adjClose) / w.points[0].adjClose);
  // In different currencies each value is in its own line's, so its code follows (the benchmark's too).
  const code = mixed ? ` ${currencyLabel(w.tickers ?? tickersOf(w.label))}` : "";
  return `${name.length > most ? `${name.slice(0, most - 1)}…` : name} ${value}${code}`.trimEnd();
}

// One fixed plot area for the growth and drawdown charts, so their date axes line up exactly under the
// shared crosshair. The right margin fits the widest end label on the growth chart.
function timeGrid(windows) {
  const widest = Math.max(...windows.map((w) => textWidth(endText(w), 12, 600)));
  return { left: 64, right: Math.ceil(widest) + 28, top: 12, bottom: 28 };
}

// A percent value axis from lo to hi with round, even steps and labels that never repeat.
function percentAxis(axis, lo, hi) {
  const { min, max, interval, decimals } = niceAxis(lo, hi);
  const label = new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: "negative" });
  return { ...axis, type: "value", min, max, interval, axisLabel: { ...axis.axisLabel, formatter: (v) => label.format(v) } };
}

// Past market crashes (the S&P 500's peak-to-trough dates) as faint bands behind the lines, cut to the
// dates on show. Each caption is the crash's name if it fits inside its band, else its first word ("2008").
// When two captions would run into each other (2020 and 2022 on a narrow chart), only the wider band keeps its caption.
function crisisBands(chart, grid, data) {
  const first = Math.min(...data.map((d) => d[0][0]));
  const last = Math.max(...data.map((d) => d.at(-1)[0]));
  const pxPerMs = (chart.getWidth() - grid.left - grid.right) / (last - first);
  return {
    silent: true,
    itemStyle: { color: WASH },
    label: { position: "insideTop", color: MUTED, fontSize: 11 },
    data: CRISES.map((c) => [Math.max(Date.parse(c.start), first), Math.min(Date.parse(c.end), last), c.name])
      .filter(([from, to]) => from < to)
      .map(([from, to, name]) => {
        const width = (to - from) * pxPerMs;
        const label = textWidth(name, 11) + 8 <= width ? name : name.split(" ")[0];
        const [mid, half] = [((from + to) / 2 - first) * pxPerMs, textWidth(label, 11) / 2 + 4];
        return { from, to, width, label, lo: mid - half, hi: mid + half };
      })
      .map((band, i, bands) => {
        const before = bands.slice(0, i).findLast((b) => b.label);
        if (before && band.lo < before.hi) (band.width > before.width ? before : band).label = "";
        return band;
      })
      .map(({ from, to, label }) => [{ name: label, xAxis: from }, { xAxis: to }]),
  };
}

// The sentence over the growth chart: where the lines ended. Like every takeaway it states past facts only,
// from fixed templates, and names go in as text, never as HTML.
function growthLead(windows) {
  const finals = windows.map((w) => (START_VALUE * w.points.at(-1).adjClose) / w.points[0].adjClose);
  const fit = (v) => unit.moneyFit.format(v);
  if (windows.length === 1) {
    const change = finals[0] / START_VALUE - 1;
    const how = pct.format(Math.abs(change)) === pct.format(0) ? "unchanged" : `${change < 0 ? "down" : "up"} ${pct.format(Math.abs(change))}`;
    return `${windows[0].label} ended at ${fit(finals[0])}, ${how}.`;
  }
  const [top, bottom] = [Math.max(...finals), Math.min(...finals)];
  if (fit(top) === fit(bottom)) return `${windows.length === 2 ? "Both" : "All of them"} ended level, at ${fit(top)}.`;
  const at = (v) => names.format(windows.filter((_, i) => fit(finals[i]) === fit(v)).map((w) => w.label));
  return `${at(top)} ended highest, at ${fit(top)}, and ${at(bottom)} lowest, at ${fit(bottom)}.`;
}

// Where the dashed start line's caption goes: its end, start or middle, above or below the line, wherever the fewest
// points of the lines fall under the text (BND hovering near $10,000 would otherwise run through it). Ties keep the end.
function startSpot(lines, grid, caption) {
  const f = state.log ? Math.log : (v) => v;
  let [lo, hi, t0, t1] = [f(START_VALUE), f(START_VALUE), Infinity, -Infinity];
  for (const line of lines) for (const [t, v] of line) [lo, hi, t0, t1] = [Math.min(lo, f(v)), Math.max(hi, f(v)), Math.min(t0, t), Math.max(t1, t)];
  const [width, height] = [charts.growth.getWidth() - grid.left - grid.right, charts.growth.getHeight() - grid.top - grid.bottom];
  const w = (textWidth(caption, 11) + 12) / width; // the caption's share of the chart's width
  const h = (24 / height) * (hi - lo); // its height and gap, in the axis's units
  const y = f(START_VALUE);
  const spots = ["End", "Start", "Middle"].flatMap((at) => {
    const x0 = { End: 1 - w, Start: 0, Middle: 0.5 - w / 2 }[at];
    return [[`inside${at}Top`, x0, y, y + h], [`inside${at}Bottom`, x0, y - h, y]];
  });
  const hits = spots.map(([, x0, y0, y1]) => {
    let n = 0;
    for (const line of lines) for (const [t, v] of line) {
      const x = (t - t0) / (t1 - t0 || 1);
      if (x >= x0 && x <= x0 + w && f(v) > y0 && f(v) < y1) n++;
    }
    return n;
  });
  return spots[hits.indexOf(Math.min(...hits))][0];
}

function drawGrowth(windows, grid, bench) {
  $("growth-lead").textContent = growthLead(windows);
  const base = frame(longDate, unit.money);
  const growth = (w) => resample(w.points.map((p) => [p.date, (START_VALUE * p.adjClose) / w.points[0].adjClose]));
  const data = windows.map(growth);
  const benchData = bench && growth(bench);
  const axisLabel = { ...base.yAxis.axisLabel, formatter: (v) => unit.moneyCompact.format(v) };
  // $10,000 always stays on the axis (a weekly or monthly step can skip the first day), so the start line shows.
  let yAxis = { ...base.yAxis, type: "value", scale: true, axisLabel, min: (v) => (v.min > START_VALUE ? START_VALUE : null), max: (v) => (v.max < START_VALUE ? START_VALUE : null) };
  if (state.log) {
    const values = [...data, ...(bench ? [benchData] : [])].flat().map(([, v]) => v);
    const min = values.reduce((a, b) => Math.min(a, b), START_VALUE);
    const max = values.reduce((a, b) => Math.max(a, b), START_VALUE);
    const customValues = logTicks(min, max);
    yAxis = { ...base.yAxis, type: "log", min, max, axisTick: { show: false, customValues }, axisLabel: { ...axisLabel, customValues, hideOverlap: true } };
  }
  const caption = `Start ${unit.money.format(START_VALUE)}`;
  const startLine = {
    silent: true,
    symbol: "none",
    lineStyle: { color: MUTED, type: "dashed", width: 1, opacity: 0.6 },
    label: { position: startSpot(bench ? [...data, benchData] : data, grid, caption), formatter: caption, color: MUTED, fontSize: 11 },
    data: [{ yAxis: START_VALUE }],
  };
  charts.growth.setOption(
    {
      ...base,
      grid,
      xAxis: { ...base.xAxis, type: "time" },
      yAxis,
      series: [...windows.map((w, i) => line(w, data[i], {
        // Name and final value at the line's end, in ink with a dot of the line's colour; close ones are nudged apart.
        endLabel: { show: true, formatter: `{dot|} ${endText(w)}`, color: INK, fontSize: 12, fontWeight: 600, rich: { dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: w.color } } },
        labelLayout: { moveOverlap: "shiftY" },
        ...(i === 0 && { markLine: startLine, markArea: crisisBands(charts.growth, grid, data) }),
      })),
      ...(bench ? [benchLine(bench, benchData, { endLabel: { show: true, formatter: endText(bench), color: MUTED, fontSize: 12 }, labelLayout: { moveOverlap: "shiftY" } })] : []),
      ],
    },
    true,
  );
}

function drawDrawdowns(windows, grid, bench) {
  const base = frame(longDate, pct);
  const dds = windows.map((w) => drawdowns(w.points));
  const data = dds.map((dd) => resample(dd.map((d) => [d.date, d.value])));
  const deepest = dds.map((dd) => dd.reduce((a, b) => (b.value < a.value ? b : a)));
  const benchDd = bench && drawdowns(bench.points);
  const floor = Math.min(...deepest.map((d) => d.value), ...(bench ? [benchDd.reduce((a, b) => Math.min(a, b.value), 0)] : []));
  // The market's yardsticks, each drawn only when the chart goes that deep, named in words (glossary terms) under the chart.
  const guides = [[-0.1, "Correction"], [-0.2, "Bear market"]].filter(([y]) => floor <= y);
  const lineWord = (n) => (n > 1 ? "lines mark" : "line marks");
  const words = [];
  if (guides.length) words.push(`The faint dashed ${lineWord(guides.length)} `, term("a correction", "correction"), " (10% below a previous high)");
  if (guides.length > 1) words.push(" and ", term("a bear market", "bear market"), " (20% below)");
  $("dd-guides").replaceChildren(...words, ...(words.length ? ["."] : []));
  const worst = deepest.reduce((a, d, i) => (d.value < deepest[a].value ? i : a), 0);
  const { date: worstDate, value: worstValue } = deepest[worst];
  const when = `${pctShort.format(worstValue)}, in ${monthLabel(worstDate.slice(0, 7))}`;
  $("drawdown-lead").textContent = worstValue >= 0
    ? `${windows.length > 1 ? "None of them" : `${windows[0].label} never`} fell below a previous high in this period.`
    : windows.length > 1 ? `${windows[worst].label} fell furthest: ${when}.` : `${windows[0].label}'s deepest fall was ${when}.`;
  const first = Math.min(...data.map((d) => d[0][0]));
  const last = Math.max(...data.map((d) => d.at(-1)[0]));
  // Each line's deepest point, pinned with how deep and when. Near either edge the label runs inward,
  // and labels that would overlap are moved apart.
  const pins = {
    name: "Deepest point",
    type: "scatter",
    silent: true,
    tooltip: { show: false }, // keeps the pins out of the shared date tooltip
    z: 3,
    symbolSize: 9,
    label: { show: true, position: "bottom", color: INK, fontSize: 11, fontWeight: 600 },
    labelLayout: { moveOverlap: "shiftY" },
    // On this top series so the lines never cover the guides' labels, which sit on a paper patch.
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: MUTED, type: "dashed", width: 1, opacity: 0.5 },
      label: { position: "insideEndTop", color: MUTED, fontSize: 11, backgroundColor: "rgba(250, 250, 248, 0.85)", padding: [1, 4], borderRadius: 3 },
      data: guides.map(([y, name]) => ({ yAxis: y, label: { formatter: `${name} ${pctAxis.format(y)}` } })),
    },
    data: windows.flatMap((w, i) => {
      const { date, value } = deepest[i];
      if (value >= 0) return [];
      const at = (Date.parse(date) - first) / (last - first);
      return [{
        value: [Date.parse(date), value],
        itemStyle: { color: "#fff", borderColor: w.color, borderWidth: 2 },
        label: { formatter: `${pctPin.format(value)} · ${monthLabel(date.slice(0, 7))}`, align: at > 0.9 ? "right" : at < 0.1 ? "left" : "center" },
      }];
    }),
  };
  charts.drawdown.setOption(
    {
      ...base,
      grid,
      // Dates along the bottom, as on the growth chart (left on zero, they would sit at the top).
      xAxis: { ...base.xAxis, type: "time", axisLine: { ...base.xAxis.axisLine, onZero: false } },
      // Some room under the deepest pin for its label.
      yAxis: percentAxis(base.yAxis, Math.min(-0.01, floor * 1.15), 0),
      series: [
        ...windows.map((w, i) => line(w, data[i], {
          lineStyle: { width: 1.5, color: w.color },
          // Underwater: the deeper below the previous high, the stronger the colour.
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${w.color}0d` }, { offset: 1, color: `${w.color}66` }] } },
          ...(i === 0 && { markArea: crisisBands(charts.drawdown, grid, data) }),
        })),
        ...(bench ? [benchLine(bench, resample(benchDd.map((d) => [d.date, d.value])), { lineStyle: { width: 1, color: MUTED, type: "dashed" } })] : []),
        pins,
      ],
    },
    true,
  );
}

// Under the drawdown chart: each line's five deepest falls in the period (drawdownEpisodes, so the same falls the
// chart shows), deepest first, then the share of days each spent below a previous high.
function drawFalls(windows) {
  const groups = windows.map((w) => {
    const end = w.points.at(-1).date;
    const rows = drawdownEpisodes(w.points).sort((a, b) => a.depth - b.depth).slice(0, 5).map((f) => element(
      "tr",
      Object.assign(element("th", pct.format(f.depth)), { scope: "row" }),
      element("td", longDate(f.peak)),
      element("td", longDate(f.trough)),
      element("td", duration(f.peak, f.trough)),
      element("td", f.recovery ? longDate(f.recovery) : "Not yet"),
      element("td", f.recovery ? duration(f.peak, f.recovery) : `${duration(f.peak, end)} so far`),
    ));
    if (!rows.length) rows.push(element("tr", Object.assign(element("td", "No falls: it never dropped below a previous high in this period."), { colSpan: 6, className: "why" })));
    return element("tbody", groupRow(w, 6), ...rows);
  });
  $("falls").replaceChildren(element("thead", headRow("Fall", "High on", "Low on", "High to low", "Back at the high", "Time below the high")), ...groups);
  const below = windows.map((w) => `${w.label} ${shareOf(drawdowns(w.points).filter((d) => d.value < 0).length / w.points.length)}`);
  $("underwater").textContent = `Share of trading days spent below a previous high: ${names.format(below)}.`;
}

// A firm ink line at 0% splits gains from losses; the other gridlines stay faint.
const zeroLine = () => ({ silent: true, symbol: "none", label: { show: false }, lineStyle: { color: INK, width: 1, type: "solid" }, data: [{ yAxis: 0 }] });

function drawReturns(windows) {
  const byPeriod = windows.map((w) => new Map(periodReturns(w.points, state.keyLength, w.nextDate).map((p) => [p.period, p])));
  const periods = [...new Set(byPeriod.flatMap((m) => [...m.keys()]))].sort();
  const isPartial = (key) => byPeriod.some((m) => m.get(key)?.partial);
  const label = (key) => (state.keyLength === 4 ? key : monthLabel(key));
  const values = byPeriod.flatMap((m) => [...m.values()].map((p) => p.value));
  const [lo, hi] = [Math.min(0, ...values), Math.max(0, ...values)];

  // Takeaway: the best and worst full period across the lines.
  const unit = state.keyLength === 4 ? "year" : "month";
  const full = byPeriod.flatMap((m, i) => [...m.values()].filter((p) => !p.partial).map((p) => ({ ...p, w: windows[i] })));
  const said = (p) => `${windows.length > 1 ? `${p.w.label}, ` : ""}${pctShort.format(p.value)} in ${label(p.period)}`;
  const best = full.reduce((a, b) => (b.value > a.value ? b : a), full[0]);
  const worst = full.reduce((a, b) => (b.value < a.value ? b : a), full[0]);
  $("returns-lead").textContent = !full.length
    ? `This period holds no full calendar ${unit}, so every bar covers part of one and is faded.`
    : full.length === 1 ? `The only full ${unit}: ${said(best)}.` : `Best full ${unit}: ${said(best)}. Worst: ${said(worst)}.`;

  const base = frame((key) => label(key) + (isPartial(key) ? " (partial)" : ""), pct, "shadow");
  charts.returns.setOption(
    {
      ...base,
      // Axis at the bottom edge (not on zero) so negative bars never cover the labels; headroom on the value axis keeps Best/Worst badges inside the chart.
      xAxis: { ...base.xAxis, type: "category", data: periods, axisLine: { ...base.xAxis.axisLine, onZero: false }, axisLabel: { ...base.xAxis.axisLabel, formatter: label, margin: 10, hideOverlap: true } },
      yAxis: percentAxis(base.yAxis, lo < 0 ? lo - 0.12 * (hi - lo) : 0, hi > 0 ? hi + 0.12 * (hi - lo) : 0),
      series: windows.map((w, i) => ({
        name: w.label,
        type: "bar",
        barMaxWidth: 24,
        barGap: "10%",
        itemStyle: { color: w.color },
        emphasis: { disabled: true },
        markPoint: badges(byPeriod[i], windows.length, i),
        markLine: i === 0 ? zeroLine() : undefined,
        data: periods.map((key) => {
          const p = byPeriod[i].get(key);
          if (!p) return null;
          // Rounded at the data end, square at the zero line; partial periods are faded.
          return { value: p.value, itemStyle: { borderRadius: p.value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4], opacity: p.partial ? 0.45 : 1 } };
        }),
      })),
    },
    true,
  );
}

// Best and worst full period of a line, called out on the bars. Only for one or two lines: more gets cluttered.
function badges(periods, lineCount, index) {
  const full = [...periods.values()].filter((p) => !p.partial);
  if (lineCount > 2 || full.length < 2) return undefined;
  const best = full.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = full.reduce((a, b) => (b.value < a.value ? b : a));
  const badge = (p, text, label) => ({ coord: [p.period, p.value], label: { formatter: `${text} ${pctAxis.format(p.value)}`, ...label } });
  return {
    symbol: "circle",
    symbolSize: 0,
    label: { fontSize: 11, fontWeight: 700, padding: [3, 7], borderRadius: 8 },
    data: [
      badge(best, "Best", { position: "top", color: "#fff", backgroundColor: INK }),
      badge(worst, "Worst", { position: "bottom", offset: [index ? 34 : -34, 0], /* sideways so two lines' badges in one period never stack */ color: "#b3372b", backgroundColor: "#fff", borderColor: "#b3372b", borderWidth: 1 }),
    ],
  };
}

// Rolling returns: the annualised return over the N years up to each day of the period (rollingReturns in stats.js).
// The look-back can reach before From, but only into dates every shown line has, so all lines cover the same days.
function drawRolling(windows) {
  const years = state.rollYears;
  for (const b of $("rolling-years").querySelectorAll("button")) b.setAttribute("aria-pressed", Number(b.dataset.years) === years);
  const stretch = years === 1 ? "1 year" : `${years} years`;
  const first = windows.map((w) => w.history[0].date).sort().at(-1); // the first date every line has
  const rolls = windows.map((w) => rollingReturns(windowOf(w.history, first, state.end).points, years, state.start));
  const fits = rolls.every((r) => r.length);
  for (const node of [$("rolling-chart"), $("rolling-range").parentElement]) node.hidden = !fits;
  if (!fits) {
    const since = windows.length > 1 ? "these lines' shared prices start" : "its prices start";
    $("rolling-lead").textContent = `No ${years}-year stretch fits between ${longDate(first)}, when ${since}, and ${longDate(state.end)}. ${years > 1 ? "Pick fewer years." : "Rolling returns need more than a year of prices."}`;
    $("rolling-note").textContent = "";
    return;
  }

  const ranges = rolls.map((r) => spread(r.map((x) => x.value)));
  const range = ({ low, high }) => `from ${pctShort.format(low)} to ${pctShort.format(high)} a year`;
  const widest = ranges.reduce((a, r, i) => (r.high - r.low > ranges[a].high - ranges[a].low ? i : a), 0);
  const flat = pctShort.format(ranges[widest].low) === pctShort.format(ranges[widest].high); // cash: the same whatever the start
  $("rolling-lead").textContent = flat
    ? `${windows.length > 1 ? "Every line's" : `${windows[0].label}'s`} ${years}-year return stayed the same whatever the start day.`
    : windows.length > 1
      ? `${windows[widest].label} varied most: its ${years}-year returns ran ${range(ranges[widest])}, depending on the start day.`
      : `${windows[0].label}'s ${years}-year returns ran ${range(ranges[0])}, depending on the start day.`;
  // Never cut short quietly: say when the lines start later than From because the earlier days lack the history.
  const starts = rolls[0][0].date;
  $("rolling-note").textContent = Date.parse(starts) - Date.parse(state.start) > 7 * DAY
    ? `The lines start on ${longDate(starts)}, the first day with ${stretch} of ${windows.length > 1 ? "shared " : ""}prices before it.`
    : "";
  $("rolling-range").replaceChildren(
    element("thead", element("tr", element("td"), ...["Lowest", "Median", "Highest"].map((t) => Object.assign(element("th", t), { scope: "col" })))),
    element("tbody", ...windows.map((w, i) => element(
      "tr",
      Object.assign(element("th", swatch(w.color), w.label), { scope: "row" }),
      ...["low", "median", "high"].map((key) => element("td", pct.format(ranges[i][key]))),
    ))),
  );

  const base = frame((v) => `${stretch} to ${longDate(v)}`, pct);
  const [lo, hi] = [Math.min(0, ...ranges.map((r) => r.low)), Math.max(0, ...ranges.map((r) => r.high))];
  charts.rolling.resize(); // it may have been hidden since the last draw
  charts.rolling.setOption(
    {
      ...base,
      xAxis: { ...base.xAxis, type: "time" },
      yAxis: percentAxis(base.yAxis, lo, hi),
      series: windows.map((w, i) => line(w, rolls[i].map((x) => [Date.parse(x.date), x.value]), i === 0 ? { markLine: zeroLine() } : {})),
    },
    true,
  );
}

// Headline figures per line. Exactly two lines become a head-to-head, with the better value in each row marked.
function drawSummary(windows, stats) {
  const rows = [
    // Under a year nothing is annualised, so the first row shows the plain total return rather than a dash.
    stats.every((s) => s.cagr !== null) ? ["Annualised return", "cagr", pct, 1] : ["Total return", "totalReturn", pct, 1],
    ["Volatility (annualised)", "volatility", pct, -1],
    ["Maximum drawdown", "maxDrawdown", pct, 1],
    ["Sharpe ratio", "sharpe", num, 1],
  ];
  const versus = windows.length === 2;
  const sides = windows.map((w, i) => {
    const big = Object.assign(element("strong"), { className: "big" });
    countUp(big, stats[i].finalValue, unit.money, `bt|${w.label}|finalValue`);
    // The gain in dollars and percent under the ending value, and where it started from.
    const gain = stats[i].finalValue - START_VALUE;
    const change = Object.assign(element("p", `${withSign(gain, unit.moneyFit)} (${withSign(stats[i].totalReturn, pct)})`), { className: `change ${gain > 0 ? "gain" : gain < 0 ? "loss" : ""}` });
    const from = Object.assign(element("p", `from ${unit.money.format(START_VALUE)}${mixed ? ` ${currencyLabel(w.tickers)}` : ""} on ${longDate(w.points[0].date)}`), { className: "from" });
    const facts = rows.map(([label, key, format, better]) => {
      const value = element("dd");
      countUp(value, stats[i][key], format, `bt|${w.label}|${key}`);
      const other = versus ? stats[1 - i][key] : NaN;
      if (Number.isFinite(other) && Number.isFinite(stats[i][key]) && (stats[i][key] - other) * better > 0) value.classList.add("win");
      return element("div", element("dt", term(label)), value);
    });
    return Object.assign(element("section", element("h3", swatch(w.color), w.label), big, change, from, element("dl", ...facts)), { className: "side" });
  });
  if (versus) sides.splice(1, 0, Object.assign(element("span", "VS"), { className: "vs-badge", ariaHidden: "true" }));
  $("summary").className = `summary${versus ? " versus" : ""}`;
  $("summary").replaceChildren(...sides);
}

// Two lines: is the gap between their returns more than luck? A 95% range from a paired t-test (gapRange in stats.js).
function drawGapNote(windows, stats) {
  const note = $("gap-note");
  note.hidden = windows.length !== 2;
  if (note.hidden) return;
  const [a, b] = windows;
  const r = gapRange(periodReturns(a.points, 7, a.nextDate), periodReturns(b.points, 7, b.nextDate));
  const title = element("strong", "Is the gap more than luck? ");
  if (!r) return note.replaceChildren(title, "Judging that takes at least 6 full calendar months, and this period has fewer. Pick a longer one.");
  const pts = (x) => `${num.format(Math.abs(x) * 100)} points`;
  if (Math.max(Math.abs(r.low), Math.abs(r.high)) < 5e-5) return note.replaceChildren(title, `Over ${r.months} full months, the two lines returned the same, month after month.`);
  const [lead, lag, sign] = r.gap >= 0 ? [a, b, 1] : [b, a, -1];
  const [low, high] = [r.low * sign, r.high * sign].sort((x, y) => x - y); // in the leader's favour
  const range = low > 0
    ? `between ${pts(low)} and ${pts(high)} a year in ${lead.label}'s favour. That range stays clear of zero, so the gap is unlikely to be luck alone.`
    : `anywhere from ${lag.label} ahead by ${pts(low)} to ${lead.label} ahead by ${pts(high)} a year. That range includes no gap at all, so this history is too short to tell whether one truly beats the other.`;
  // It uses full calendar months only, so it can disagree with the headline figures, which use every day.
  const key = stats.every((s) => s.cagr !== null) ? "cagr" : "totalReturn";
  const [x, y] = stats.map((s) => s[key]);
  const headlineLead = pct.format(x) === pct.format(y) ? null : x > y ? a : b;
  const why = headlineLead && headlineLead !== lead
    ? `The figures above put ${headlineLead.label} ahead because they count every day from ${longDate(state.start)} to ${longDate(state.end)}. This counts only the ${r.months} calendar months both lines have in full. `
    : "";
  note.replaceChildren(
    title,
    `Over ${r.months} full months, ${lead.label} grew about ${pts(r.gap)} a year faster than ${lag.label}. `,
    why,
    `With 95% confidence (a range that holds the true gap 19 times in 20), the true yearly gap lies ${range} `,
    element("small", "Method: a paired t-test on each month's growth, compounded so that a 10% gain and then a 10% fall count as the small loss they are. It treats each month as independent of the others."),
  );
}

// Every month of the chosen line, a row per year: green gains, red losses, stronger for bigger moves.
const pctShort = new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2000, m)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }));

// Five solid shades each for gains and losses (heat-g1..g5, heat-l1..l5 in styles.css, with the key under the table),
// one shade per `step`: 2.5 points for a month, 10 for a full year. The fifth shade is that many steps and more.
function heatCell(p, step, extra = "") {
  if (!p) return element("td");
  const cell = element("td", pctShort.format(p.value));
  cell.className = `heat-${p.value >= 0 ? "g" : "l"}${Math.min(5, 1 + Math.floor(Math.abs(p.value) / step))} ${extra}`.trim();
  if (p.partial) {
    cell.classList.add("partial");
    cell.title = "Part of the period only";
  }
  return cell;
}

function drawHeatmap(windows) {
  state.heat = Math.min(state.heat, windows.length - 1);
  $("heat-pick").replaceChildren(...windows.map((w, i) => {
    const b = Object.assign(element("button", w.label), { type: "button" });
    b.dataset.index = i;
    b.setAttribute("aria-pressed", i === state.heat);
    return b;
  }));
  $("heat-pick").hidden = windows.length < 2;
  const w = windows[state.heat];
  const months = new Map(periodReturns(w.points, 7, w.nextDate).map((p) => [p.period, p]));
  const years = periodReturns(w.points, 4, w.nextDate);
  const head = element("tr", Object.assign(element("th", "Year"), { scope: "col" }), ...MONTHS.map((m) => Object.assign(element("th", m), { scope: "col" })), Object.assign(element("th", "Year"), { scope: "col" }));
  const body = years.map((y) =>
    element(
      "tr",
      Object.assign(element("th", y.period), { scope: "row" }),
      ...MONTHS.map((_, m) => heatCell(months.get(`${y.period}-${String(m + 1).padStart(2, "0")}`), 0.025)),
      heatCell(y, 0.1, "year"),
    ),
  );
  $("heatmap").replaceChildren(element("thead", head), element("tbody", ...body));
  $("heatmap").setAttribute("aria-label", `Monthly returns of ${w.label}`);
}

// How the chosen line's full calendar months spread out: a 1-point histogram with a bell curve of the same average
// and volatility over it (the expected count in each bucket), then the shape in figures (moments in stats.js).
const MIN_MONTHS = 24; // fewer months say little about the shape of their spread
function drawSpread(windows) {
  state.spreadLine = Math.min(state.spreadLine, windows.length - 1);
  $("spread-pick").replaceChildren(...windows.map((w, i) => {
    const b = Object.assign(element("button", w.label), { type: "button" });
    b.dataset.index = i;
    b.setAttribute("aria-pressed", i === state.spreadLine);
    return b;
  }));
  $("spread-pick").hidden = windows.length < 2;
  const w = windows[state.spreadLine];
  const values = periodReturns(w.points, 7, w.nextDate).filter((p) => !p.partial).map((p) => p.value);
  const enough = values.length >= MIN_MONTHS;
  $("spread-chart").hidden = $("spread-facts").hidden = !enough;
  if (!enough) {
    $("spread-lead").textContent = `This period holds ${values.length === 1 ? "1 full calendar month" : `${values.length} full calendar months`} of ${w.label}. The spread needs at least ${MIN_MONTHS} to mean much, so pick a longer period, such as 3Y.`;
    return;
  }
  const m = moments(values);
  const width = 0.01;
  const buckets = histogram(values, width);
  const curve = m.sd > 0 ? buckets.map((b) => values.length * (normalCdf((b.from + width - m.mean) / m.sd) - normalCdf((b.from - m.mean) / m.sd))) : null; // a flat line (cash) has no bell curve
  const gained = values.filter((v) => v > 0).length / values.length;
  const tails = m.excessKurtosis > 0.5 ? "more very good and very bad months than a bell curve predicts: fat tails"
    : m.excessKurtosis < -0.5 ? "fewer very good and very bad months than a bell curve predicts" : "about as many very good and very bad months as a bell curve predicts";
  $("spread-lead").textContent = `${w.label} gained in ${shareOf(gained)} of ${values.length} full months${Number.isFinite(m.excessKurtosis) ? `, and had ${tails}` : ""}.`;
  $("spread-facts").replaceChildren(...[
    ["Months that gained", shareOf(gained)],
    ["Best month", pctShort.format(Math.max(...values))],
    ["Worst month", pctShort.format(Math.min(...values))],
    [term("Skewness"), show(m.skewness, num)],
    [term("Excess kurtosis"), show(m.excessKurtosis, num)],
  ].map(([label, value]) => element("div", element("dt", label), element("dd", value))));

  const months = { format: (v) => `${oneDecimal.format(v)} ${v === 1 ? "month" : "months"}` };
  const bucketName = (from) => `${pctAxis.format(+from)} to ${pctAxis.format(+from + width)}`;
  const base = frame(bucketName, months, "shadow");
  charts.spread.resize(); // it may have been hidden since the last draw
  charts.spread.setOption(
    {
      ...base,
      grid: { left: 40, right: 16, top: 12, bottom: 28 },
      xAxis: { ...base.xAxis, type: "category", data: buckets.map((b) => String(b.from)), axisLabel: { ...base.xAxis.axisLabel, formatter: (v) => pctAxis.format(+v) } },
      yAxis: { ...base.yAxis, type: "value", minInterval: 1 },
      series: [
        { name: w.label, type: "bar", barCategoryGap: "8%", itemStyle: { color: w.color, borderRadius: [3, 3, 0, 0] }, emphasis: { disabled: true }, data: buckets.map((b) => b.count) },
        ...(curve ? [{ name: "Bell curve", type: "line", smooth: true, showSymbol: false, lineStyle: { color: INK, width: 1.5 }, itemStyle: { color: INK }, data: curve }] : []),
      ],
    },
    true,
  );
}

// How the lines move together: the correlation of daily returns for each pair over the period, the lower half of the
// grid only, coloured like the Creator's (blue for together, orange for apart, stronger for bigger numbers).
function drawCorrelation(windows) {
  $("bt-corr-block").hidden = windows.length < 2;
  if (windows.length < 2) return;
  const head = element("tr", element("td"), ...windows.map((w) => Object.assign(element("th", swatch(w.color), w.label), { scope: "col" })));
  const rows = windows.map((a, i) => element(
    "tr",
    Object.assign(element("th", swatch(a.color), a.label), { scope: "row" }),
    ...windows.map((b, j) => {
      if (j > i) return element("td"); // the upper half would repeat the lower half
      if (j === i) {
        const dash = element("span", "–");
        dash.setAttribute("aria-hidden", "true");
        return Object.assign(element("td", dash, hiddenText("same line")), { className: "self" });
      }
      const c = correlation(a.points, b.points);
      const cell = element("td", show(c, num));
      if (Number.isFinite(c)) cell.style.background = c >= 0 ? `rgba(42, 120, 214, ${0.08 + 0.6 * c})` : `rgba(235, 104, 52, ${0.08 + 0.6 * -c})`;
      return cell;
    }),
  ));
  $("bt-correlation").replaceChildren(element("thead", head), element("tbody", ...rows));
}

// The sentence over the scatter: which swung more and which returned more, against the other line or the benchmark.
// Figures that print the same count as level.
function scatterLead(windows, stats, spy, annual) {
  const ret = (s) => (annual ? s.cagr : s.totalReturn);
  const compare = (a, b, more, less, level) => (pct.format(a) === pct.format(b) ? level : a > b ? more : less);
  const versus = (name, s, otherName, other) =>
    `${name} swung ${compare(s.volatility, other.volatility, "more than", "less than", "as much as")} ${otherName} and returned ${compare(ret(s), ret(other), "more", "less", "the same")}.`;
  if (windows.length === 1) {
    return spy
      ? versus(windows[0].label, stats[0], benchTitle(), spy)
      : `${windows[0].label}'s volatility was ${pct.format(stats[0].volatility)}, and it returned ${pct.format(ret(stats[0]))}${annual ? " a year" : ""}.`;
  }
  if (windows.length === 2) {
    const [a, b] = stats[0].volatility >= stats[1].volatility ? [0, 1] : [1, 0];
    return versus(windows[a].label, stats[a], windows[b].label, stats[b]);
  }
  const most = stats.reduce((a, s, i) => (ret(s) > ret(stats[a]) ? i : a), 0);
  const calmest = stats.reduce((a, s, i) => (s.volatility < stats[a].volatility ? i : a), 0);
  return most === calmest
    ? `${windows[most].label} returned most and swung least.`
    : `${windows[most].label} returned most, and ${windows[calmest].label} swung least.`;
}

// Volatility across, return up: one dot per line, coloured like its line. The benchmark (the S&P 500 unless another
// is picked) is a hollow ring whose dashed cross splits the chart into four corners, so every dot reads against it.
function drawScatter(windows, stats) {
  // Only when it covers the whole period (state.bench), never a shorter stretch.
  const b = state.bench;
  const compared = windows.some((w) => w.label === state.benchName);
  const spy = b && !compared ? summarize(b.points, state.benchmark, b.nextDate) : null;
  const annual = (spy ? [...stats, spy] : stats).every((s) => s.cagr !== null);
  const yName = annual ? "Annualised return" : "Total return";
  const missing = compared ? "" : !state.benchmark.length ? ` ${benchTitle(true)} didn't load, so it isn't shown.` : !spy ? ` ${benchTitle(true)} has no prices for part of this period, so it isn't shown.` : "";
  $("scatter-note").textContent = `Each dot is one compared asset: further right swings more, higher ${annual ? "grew faster per year" : "gained more over the period (it is under a year, so returns are not annualised)"}.${spy ? ` The ring is the benchmark, ${benchTitle()}, over the same dates. Its dashed lines split the chart into four corners that say how each dot did against it.` : missing}`;

  $("scatter-lead").textContent = scatterLead(windows, stats, spy, annual);

  const point = (s) => [s.volatility, annual ? s.cagr : s.totalReturn];
  const dots = stats.map(point);
  const ref = spy && point(spy);
  const all = ref ? [...dots, ref] : dots;
  const belowZero = all.some(([, y]) => y < 0);
  // About 15% of the range as room on every side, so no dot sits on the frame. Volatility can't go below 0.
  const padded = (values) => {
    const [lo, hi] = [Math.min(...values), Math.max(...values)];
    return [lo - 0.15 * (hi - lo), hi + 0.15 * (hi - lo)];
  };
  const [xLo, xHi] = padded(all.map(([x]) => x));
  const [yLo, yHi] = padded([...all.map(([, y]) => y), ...(belowZero ? [0] : [])]);
  const base = frame(String, pct);
  const axisName = { nameLocation: "middle", nameTextStyle: { color: MUTED, fontSize: 12 } };
  // The volatility axis stays at the bottom edge even when 0% return is inside the chart.
  const xAxis = { ...percentAxis(base.xAxis, Math.max(0, xLo), Math.max(xHi, 0.01)), ...axisName, name: "Volatility", nameGap: 30, axisLine: { ...base.xAxis.axisLine, onZero: false } };
  const yAxis = percentAxis(base.yAxis, yLo, yHi);
  // The y axis name sits just clear of the widest tick label (the widest is always at one end).
  const labelWidth = Math.max(...[yAxis.min, yAxis.max].map((v) => textWidth(yAxis.axisLabel.formatter(v), 12)));
  Object.assign(yAxis, axisName, { name: yName, nameGap: Math.ceil(labelWidth) + 18 });
  // Names go left of dots in the right part of the chart, so they never run off the edge.
  const side = (x) => ((x - xAxis.min) / (xAxis.max - xAxis.min) > 0.6 ? "left" : "right");
  // shortcut: moveOverlap only shifts up or down, so two names at one height but far apart still get nudged; a per-label placer would fix that if it looks off.
  const labelLayout = { moveOverlap: "shiftY" };
  const dashed = { color: MUTED, type: "dashed", width: 1, opacity: 0.6 };

  const corner = (x0, x1, y0, y1, text, position) => [{ name: text, xAxis: x0, yAxis: y0, label: { position } }, { xAxis: x1, yAxis: y1 }];
  const reference = ref && {
    name: state.benchName === DEFAULT_BENCHMARK ? "S&P 500 (SPY)" : state.benchName,
    type: "scatter",
    symbolSize: 16, // drawn first and a little bigger, so a dot on the same spot (VOO) sits inside the ring
    itemStyle: { color: "#fff", borderColor: INK, borderWidth: 2 },
    label: { show: true, position: side(ref[0]), formatter: "{a}", color: INK },
    labelLayout,
    emphasis: { scale: 1.2 },
    markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: dashed, data: [{ xAxis: ref[0] }, { yAxis: ref[1] }] },
    // Corner captions, left out on narrow charts where they would run into each other.
    markArea: charts.scatter.getWidth() < 480 ? undefined : {
      silent: true,
      itemStyle: { color: "transparent" },
      label: { color: MUTED, fontSize: 11 },
      data: [
        corner(xAxis.min, ref[0], ref[1], yAxis.max, "Swung less, grew more", "insideTopLeft"),
        corner(ref[0], xAxis.max, ref[1], yAxis.max, "Swung more, grew more", "insideTopRight"),
        corner(xAxis.min, ref[0], yAxis.min, ref[1], "Swung less, grew less", "insideBottomLeft"),
        corner(ref[0], xAxis.max, yAxis.min, ref[1], "Swung more, grew less", "insideBottomRight"),
      ],
    },
    data: [ref],
  };
  charts.scatter.setOption(
    {
      ...base,
      grid: { left: yAxis.nameGap + 20, right: 24, top: 16, bottom: 52 },
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (item) => `<strong>${escapeHtml(item.seriesName)}</strong><div>Volatility ${pct.format(item.value[0])}</div><div>${yName} ${pct.format(item.value[1])}</div>`,
      },
      xAxis,
      yAxis,
      series: [
        ...(reference ? [reference] : []),
        ...windows.map((w, i) => ({
          name: w.label,
          type: "scatter",
          symbolSize: 14,
          itemStyle: { color: w.color, borderColor: "#fff", borderWidth: 2 },
          label: { show: true, position: side(dots[i][0]), formatter: "{a}", color: INK, fontWeight: 600 },
          labelLayout,
          emphasis: { scale: 1.2 },
          // A dashed 0% line when any return is a loss, so above and below zero is plain to see.
          markLine: i === 0 && belowZero ? { silent: true, symbol: "none", label: { show: false }, lineStyle: dashed, data: [{ yAxis: 0 }] } : undefined,
          data: [dots[i]],
        })),
      ],
    },
    true,
  );
}

// Download CSV: one row per trading day in the period (each line's value of 10,000 and its drawdown), then the
// statistics at full precision. Dates every line lacks are blank cells rather than filled in.
$("bt-csv").addEventListener("click", () => {
  const windows = state.windows;
  const codes = showCodes(windows.map((w) => w.label));
  const days = windows.map((w) => {
    const dd = drawdowns(w.points);
    return new Map(w.points.map((p, i) => [p.date, [(START_VALUE * p.adjClose) / w.points[0].adjClose, dd[i].value]]));
  });
  const dates = [...new Set(windows.flatMap((w) => w.points.map((p) => p.date)))].sort();
  const name = (w) => `${w.label}${codes ? ` (${currencyLabel(w.tickers)})` : ""}`;
  const metrics = statGroups(state.benchName).flatMap(([, rows]) => rows);
  downloadCsv([
    ["Date", ...windows.flatMap((w) => [`${name(w)} value of ${START_VALUE}`, `${w.label} drawdown (fraction)`])],
    ...dates.map((date) => [date, ...days.flatMap((d) => d.get(date) ?? [null, null])]),
    [],
    ["Statistic (returns as fractions: 0.1 is 10%)", ...windows.map(name)],
    ...metrics.map(([label, key]) => [label, ...state.stats.map((s) => s[key])]),
  ], `backtest-${state.start}-to-${state.end}-${basisTag()}.csv`);
});

// Copy link: the lines (saved portfolios as their full recipe), benchmark, period, step and scale.
$("bt-link").addEventListener("click", () => {
  const used = [...new Set([...chips, state.benchName].map((label) => portfolios().find((p) => p.name === label)).filter(Boolean))];
  copyLink("backtester", [
    ...chips.map((label) => ["l", label]),
    ...used.map((p) => ["pf", recipe(p)]),
    ...(state.benchName === DEFAULT_BENCHMARK ? [] : [["b", state.benchName]]),
    ...(state.crisis ? [["crisis", state.crisis.name]] : state.preset ? [["p", state.preset]] : [["from", state.start], ["to", state.end]]),
    ...(state.step === "day" ? [] : [["step", state.step]]),
    ...(state.log ? [["log", "1"]] : []),
    ...(state.showBench ? [["showb", "1"]] : []),
  ], $("bt-share-status"));
});

// Opening a share link (or an example card): set everything it names, then compare.
function openLink() {
  const link = linkFor("backtester");
  if (!link) return;
  clearLink("backtester");
  const { found, bad } = linkedPortfolios(link);
  linked = found.filter((f) => !f.saved).map((f) => f.portfolio);
  const named = (label) => found.find((f) => f.asked === label)?.portfolio.name ?? label; // a clash renamed it "(2)"
  chips = [...new Set(link.getAll("l").map(named))].slice(0, MAX_SERIES);
  benchInput.value = named(link.get("b") || DEFAULT_BENCHMARK);
  state.showBench = $("show-bench").checked = link.get("showb") === "1";
  state.log = $("log-scale").checked = link.get("log") === "1";
  state.step = ["week", "month"].includes(link.get("step")) ? link.get("step") : "day";
  linkPeriod = { preset: link.get("p"), from: link.get("from") ?? "", to: link.get("to") ?? "", crisis: link.get("crisis") };
  offerSave($("bt-linked"), linked, (p) => { linked = linked.filter((x) => x !== p); });
  if (bad) $("bt-linked").append(element("span", `${bad === 1 ? "A portfolio" : `${bad} portfolios`} in the link couldn't be read, so ${bad === 1 ? "it was" : "they were"} left out.`));
  if (!chips.length) return renderChips();
  form.requestSubmit();
}
addEventListener("hashchange", openLink);

// Examples shown until the first comparison, each a share link with its lesson. Each lesson was checked against
// the result it opens.
exampleCards($("bt-examples"), "backtester", [
  {
    title: "Bonds in the 2008 crash",
    lesson: "From the stock market's high in October 2007 to its low in March 2009, US stocks (SPY) lost about half their value while US bonds (AGG) gained.",
    link: [["l", "SPY"], ["l", "AGG"], ["crisis", "2008 financial crisis"]],
  },
  {
    title: "Home or the world",
    lesson: "Since 2011, US stocks (VTI) have grown far faster than stocks in the rest of the world (VXUS).",
    link: [["l", "VTI"], ["l", "VXUS"], ["p", "max"]],
  },
  {
    title: "Gold beside stocks",
    lesson: "Gold (GLD) and US stocks (SPY) have hardly moved together, so one often held up while the other fell.",
    link: [["l", "GLD"], ["l", "SPY"], ["p", "max"]],
  },
]);

renderChips();
openLink();

addEventListener("inflation-changed", () => { if (!$("results").hidden) form.requestSubmit(); });
