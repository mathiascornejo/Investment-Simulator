// Backtester tab: load tickers, pick a period, draw three charts and a statistics table.
// All maths lives in stats.js; this file is fetching, state and drawing.
import { fetchPrices } from "./data.js";
import { windowOf, summarize, drawdowns, periodReturns } from "./stats.js";
import { loadPortfolios, portfolioSeries } from "./portfolios.js";
import { pct, num, money, moneyCompact, longDate, monthLabel, show, element } from "./format.js";

const BENCHMARK = "SPY"; // beta is measured against this
const START_VALUE = 10000;
const MAX_SERIES = 5; // one colour each; see COLORS
// Fixed order, checked colour-blind safe on white. A colour belongs to a position in the
// ticker list, so an asset keeps its colour when others fail to load.
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const INK = "#15233b";
const MUTED = "#5a6779";
const GRID = "#e6eae5";
const AXIS = "#c5ccc4";

const $ = (id) => document.getElementById(id);
const form = $("compare-form");
const status = $("compare-status");

const state = {
  series: [], // [{ label, color, points }]: a ticker or a saved portfolio
  benchmark: [],
  min: "", // first date every asset has
  max: "", // last date every asset has
  start: "",
  end: "",
  preset: "max",
  log: false,
  keyLength: 4, // 4 = returns by year, 7 = by month
};
let charts; // created on first draw, once the containers are visible and have a size

// Formatting (the shared formatters live in format.js; these are only for chart axes)
const pctAxis = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0, signDisplay: "negative" });
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // portfolio names are typed by the user

const METRICS = [
  ["Total return", "totalReturn", pct],
  ["Annualised return", "cagr", pct],
  ["Volatility (annualised)", "volatility", pct],
  ["Maximum drawdown", "maxDrawdown", pct],
  ["Best year", "bestYear", pct],
  ["Worst year", "worstYear", pct],
  ["Sharpe ratio", "sharpe", num],
  ["Sortino ratio", "sortino", num],
  [`Beta vs ${BENCHMARK}`, "beta", num],
  ["$10,000 became", "finalValue", money],
];

function showDifference(a, b, format) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "–";
  const d = a - b;
  const sign = d > 0 ? "+" : "";
  // A gap between two percentages is in percentage points, not percent.
  return format === pct ? `${sign}${num.format(d * 100)} pts` : `${sign}${format.format(d)}`;
}

function say(text, isError = false) {
  status.textContent = text;
  status.toggleAttribute("data-state", isError);
  if (isError) status.dataset.state = "error";
}

const yearsBefore = (date, years) => `${date.slice(0, 4) - years}${date.slice(4)}`;

// Saved portfolios appear as checkboxes above the tickers box.
function listPortfolios() {
  const checked = new Set([...$("portfolio-checks").querySelectorAll(":checked")].map((box) => box.value));
  const saved = loadPortfolios();
  $("portfolio-picks").hidden = !saved.length;
  $("portfolio-checks").replaceChildren(
    ...saved.map((p) => {
      const box = Object.assign(element("input"), { type: "checkbox", value: p.name, checked: checked.has(p.name) });
      return Object.assign(element("label", box, p.name), { className: "check" });
    }),
  );
}
addEventListener("portfolios-changed", listPortfolios);
listPortfolios();

// Loading
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const tickers = [...new Set($("tickers").value.toUpperCase().split(/[\s,]+/).filter(Boolean))];
  if (tickers.some((t) => !/^[A-Z0-9-]{1,10}$/.test(t))) {
    say("Tickers can only contain letters, digits and dashes. Separate them with commas.", true);
    return;
  }
  const picked = new Set([...$("portfolio-checks").querySelectorAll(":checked")].map((box) => box.value));
  // Portfolios first, then tickers. A line's colour comes from its position in this list.
  const lines = [
    ...loadPortfolios().filter((p) => picked.has(p.name)).map((p) => ({ label: p.name, tickers: p.holdings.map((h) => h.ticker), portfolio: p })),
    ...tickers.map((t) => ({ label: t, tickers: [t] })),
  ];
  if (!lines.length || lines.length > MAX_SERIES) {
    say(`Choose between 1 and ${MAX_SERIES} portfolios and tickers in total.`, true);
    return;
  }

  const button = form.querySelector("button");
  button.disabled = true;
  say(`Loading ${lines.map((l) => l.label).join(", ")}…`);
  const wanted = [...new Set([...lines.flatMap((l) => l.tickers), BENCHMARK])];
  const loaded = await Promise.allSettled(wanted.map(fetchPrices));
  button.disabled = false;
  const prices = {};
  const errors = {};
  wanted.forEach((t, i) => {
    if (loaded[i].status === "fulfilled") prices[t] = loaded[i].value;
    else errors[t] = loaded[i].reason.message.replace(/\.$/, "");
  });

  const problems = [];
  state.series = [];
  lines.forEach((l, i) => {
    const missing = l.tickers.find((t) => !prices[t]);
    if (missing) return problems.push(`${l.label} didn't load: ${errors[missing]}.`);
    const points = l.portfolio ? portfolioSeries(l.portfolio, prices).points : prices[l.label];
    if (points.length < 3) return problems.push(`${l.label} can't be measured: its holdings have no dates in common.`);
    state.series.push({ label: l.label, color: COLORS[i], points });
  });
  state.benchmark = prices[BENCHMARK] ?? [];

  if (!state.series.length) {
    $("results").hidden = true;
    say(problems.join(" "), true);
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
  state.start = state.min;
  state.end = state.max;
  state.preset = "max";

  const notes = [];
  if (state.series.some((s) => s.points[0].date < state.min)) {
    notes.push(`The comparison starts on ${longDate(state.min)}, when ${latestStarter.label}'s data begins.`);
  }
  say([...notes, ...problems].join(" "), problems.length > 0);
  $("results").hidden = false;
  draw();
});

// Controls
$("presets").addEventListener("click", (event) => {
  const years = event.target.dataset.years;
  if (!years) return;
  state.preset = years;
  state.end = state.max;
  const wanted = years === "max" ? state.min : yearsBefore(state.max, years);
  state.start = wanted < state.min ? state.min : wanted; // clamp to the data we have
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
    state.start = from < state.min ? state.min : from;
    state.end = to > state.max ? state.max : to;
    draw();
  });
}

$("log-scale").addEventListener("change", (event) => {
  state.log = event.target.checked;
  draw();
});

$("period").addEventListener("click", (event) => {
  const keyLength = event.target.dataset.keyLength;
  if (!keyLength) return;
  state.keyLength = Number(keyLength);
  draw();
});

// Drawing
function draw() {
  const windows = state.series.map((s) => ({ ...s, ...windowOf(s.points, state.start, state.end) }));
  if (windows.some((w) => w.points.length < 3)) {
    say("That period is too short to measure. Pick a longer one.", true);
    return;
  }

  for (const b of $("presets").children) b.setAttribute("aria-pressed", b.dataset.years === state.preset);
  for (const b of $("period").children) b.setAttribute("aria-pressed", Number(b.dataset.keyLength) === state.keyLength);
  for (const [id, value] of [["from", state.start], ["to", state.end]]) {
    Object.assign($(id), { min: state.min, max: state.max, value });
  }

  $("legend").replaceChildren(...windows.map((w) => element("li", swatch(w.color), w.label)));
  drawTable(windows);

  if (!window.echarts) {
    say("The chart library didn't load, so only the table is shown. Check your connection and reload.", true);
    return;
  }
  if (!charts) {
    charts = Object.fromEntries(["growth", "returns", "drawdown"].map((n) => [n, echarts.init($(`${n}-chart`))]));
    echarts.connect([charts.growth, charts.drawdown]); // hovering one moves the crosshair on the other
    const resize = () => Object.values(charts).forEach((c) => c.resize());
    addEventListener("resize", resize);
    addEventListener("hashchange", resize); // the tab may have been hidden while the window changed size
  }
  drawGrowth(windows);
  drawReturns(windows);
  drawDrawdowns(windows);
}

function swatch(color) {
  const node = element("span");
  node.className = "swatch";
  node.style.background = color;
  return node;
}

function drawTable(windows) {
  const stats = windows.map((w) => summarize(w.points, state.benchmark, w.nextDate, START_VALUE));
  const columnHeads = windows.map((w) => Object.assign(element("th", swatch(w.color), w.label), { scope: "col" }));
  if (windows.length === 2) {
    columnHeads.push(Object.assign(element("th", `${windows[0].label} − ${windows[1].label}`), { scope: "col" }));
  }

  const rows = METRICS.map(([label, key, format]) => {
    const cells = stats.map((s) => element("td", show(s[key], format)));
    if (windows.length === 2) cells.push(element("td", showDifference(stats[0][key], stats[1][key], format)));
    return element("tr", Object.assign(element("th", label), { scope: "row" }), ...cells);
  });
  $("stats").replaceChildren(element("thead", element("tr", element("td"), ...columnHeads)), element("tbody", ...rows));
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
      axisPointer: { type: pointer, lineStyle: { color: MUTED, type: "solid" }, shadowStyle: { color: "rgba(21, 35, 59, 0.06)" } },
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
    xAxis: { axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false }, axisLabel, splitLine: { show: false } },
    yAxis: { axisLabel, splitLine: { lineStyle: { color: GRID } } },
  };
}

const line = (w, data, extra = {}) => ({
  name: w.label,
  type: "line",
  showSymbol: false, // no downsampling: it drops different dates per line, so the tooltip would miss assets
  lineStyle: { width: 2, color: w.color },
  itemStyle: { color: w.color },
  emphasis: { disabled: true },
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

function drawGrowth(windows) {
  const base = frame(longDate, money);
  const data = windows.map((w) => w.points.map((p) => [Date.parse(p.date), (START_VALUE * p.adjClose) / w.points[0].adjClose]));
  const axisLabel = { ...base.yAxis.axisLabel, formatter: (v) => moneyCompact.format(v) };
  let yAxis = { ...base.yAxis, type: "value", scale: true, axisLabel };
  if (state.log) {
    const values = data.flat().map(([, v]) => v);
    const min = values.reduce((a, b) => Math.min(a, b));
    const max = values.reduce((a, b) => Math.max(a, b));
    const customValues = logTicks(min, max);
    yAxis = { ...base.yAxis, type: "log", min, max, axisTick: { show: false, customValues }, axisLabel: { ...axisLabel, customValues, hideOverlap: true } };
  }
  charts.growth.setOption(
    { ...base, xAxis: { ...base.xAxis, type: "time" }, yAxis, series: windows.map((w, i) => line(w, data[i])) },
    true,
  );
}

function drawDrawdowns(windows) {
  const base = frame(longDate, pct);
  charts.drawdown.setOption(
    {
      ...base,
      xAxis: { ...base.xAxis, type: "time" },
      yAxis: { ...base.yAxis, type: "value", max: 0, axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => pctAxis.format(v) } },
      series: windows.map((w) =>
        line(w, drawdowns(w.points).map((d) => [Date.parse(d.date), d.value]), {
          lineStyle: { width: 1.5, color: w.color },
          areaStyle: { color: w.color, opacity: 0.1 },
        }),
      ),
    },
    true,
  );
}

function drawReturns(windows) {
  const byPeriod = windows.map((w) => new Map(periodReturns(w.points, state.keyLength, w.nextDate).map((p) => [p.period, p])));
  const periods = [...new Set(byPeriod.flatMap((m) => [...m.keys()]))].sort();
  const isPartial = (key) => byPeriod.some((m) => m.get(key)?.partial);
  const label = (key) => (state.keyLength === 4 ? key : monthLabel(key));

  const base = frame((key) => label(key) + (isPartial(key) ? " (partial)" : ""), pct, "shadow");
  charts.returns.setOption(
    {
      ...base,
      xAxis: { ...base.xAxis, type: "category", data: periods, axisLabel: { ...base.xAxis.axisLabel, formatter: label } },
      yAxis: { ...base.yAxis, type: "value", axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => pctAxis.format(v) } },
      series: windows.map((w, i) => ({
        name: w.label,
        type: "bar",
        barMaxWidth: 24,
        barGap: "10%",
        itemStyle: { color: w.color },
        emphasis: { disabled: true },
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

form.requestSubmit(); // open with the default comparison already drawn
