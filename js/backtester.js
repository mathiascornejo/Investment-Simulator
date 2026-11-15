// Backtester tab: load tickers, pick a period, draw three charts and a statistics table.
// All maths lives in stats.js; this file is fetching, state and drawing.
import { fetchPrices } from "./data.js";
import { attachTickerSearch } from "./ticker-search.js";
import { windowOf, summarize, drawdowns, periodReturns } from "./stats.js";
import { loadPortfolios, portfolioSeries } from "./portfolios.js";
import { pct, num, money, moneyCompact, longDate, monthLabel, show, element } from "./format.js";
import { glyph, assetClass, countUp } from "./visuals.js";
import { term } from "./glossary.js";

const BENCHMARK = "SPY"; // beta is measured against this
const START_VALUE = 10000;
const MAX_SERIES = 10; // one colour each; see COLORS
// Fixed order, checked colour-blind safe on white. A colour belongs to a position in the
// ticker list, so an asset keeps its colour when others fail to load.
export const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#7b5cc4", "#8c6239", "#22a6b8", "#5d6b7a", "#a8a22a"]; // shortcut: colours 6-10 not colour-blind validated
const INK = "#1a1a1a";
const MUTED = "#66665f";
const GRID = "#ecece7";
const AXIS = "#cfcfc8";

const $ = (id) => document.getElementById(id);
const form = $("compare-form");

const status = $("compare-status");
const input = $("tickers");
let chips = ["SPY", "BND"]; // what is being compared, in colour order: a ticker or a saved portfolio's name

// Adds a ticker or saved portfolio to the comparison and redraws.
export function addToCompare(label) {
  if (!chips.some((c) => c.toUpperCase() === label.toUpperCase())) chips.push(label);
  if (location.hash !== "#backtester") location.hash = "#backtester";
  form.requestSubmit();
}

input.addEventListener("input", () => { input.value = input.value.replace(/[^A-Za-z0-9.\- ]/g, ""); }); // tickers and portfolio names only
attachTickerSearch(input, { extra: () => loadPortfolios().map((p) => [p.name, "Saved portfolio"]), onPick: addToCompare });
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

// One chip per compared line: colour, kind of asset, the change over the chosen period.
function renderChips(windows = []) {
  $("chips").replaceChildren(
    ...chips.map((label, i) => {
      const w = windows.find((x) => x.label === label);
      const dot = Object.assign(element("span"), { className: "dot" });
      dot.style.background = COLORS[i] ?? MUTED;
      const isPortfolio = loadPortfolios().some((p) => p.name === label);
      const remove = Object.assign(element("button", "✕"), { type: "button", title: `Remove ${label}` });
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.addEventListener("click", () => removeChip(label));
      const parts = [dot, glyph(isPortfolio ? "portfolio" : assetClass(label)), label];
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
  benchmark: [],
  min: "", // first date every asset has
  max: "", // last date every asset has
  start: "",
  end: "",
  preset: "12",
  log: false,
  step: "day", // time between chart points: day | week | month (statistics always use every day)
  keyLength: 4, // 4 = returns by year, 7 = by month
  heat: 0, // which line the monthly heatmap shows
  windows: [],
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

const monthsBefore = (date, months) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

// Select a preset (months back from the latest date, or "max"), clamped to the data we have.
function applyPreset(months) {
  state.preset = months;
  state.end = state.max;
  const wanted = months === "max" ? state.min : monthsBefore(state.max, months);
  state.start = wanted < state.min ? state.min : wanted;
}

// Loading
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  // Saved portfolios are typed by name (names may hold spaces), so lift those out; what's left is tickers.
  let text = [...chips, input.value].filter((t) => t.trim()).join(", ");
  const picked = [];
  for (const p of [...loadPortfolios()].sort((a, b) => b.name.length - a.name.length)) {
    const name = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(`(^|,)\\s*${name}\\s*(?=,|$)`, "i");
    if (found.test(text)) { picked.push(p); text = text.replace(found, "$1"); }
  }
  const tickers = [...new Set(text.toUpperCase().split(/[\s,]+/).filter(Boolean))];
  if (tickers.some((t) => !/^[A-Z0-9.-]{1,12}$/.test(t))) {
    say("Tickers can only contain letters, digits, dots and dashes.", true);
    return;
  }
  // Portfolios first, then tickers. A line's colour comes from its position in this list.
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
  button.disabled = true;
  $("bt-skeleton").hidden = !$("results").hidden;
  say(`Loading ${lines.map((l) => l.label).join(", ")}…`);
  const wanted = [...new Set([...lines.flatMap((l) => l.tickers), BENCHMARK])];
  const loaded = await Promise.allSettled(wanted.map(fetchPrices));
  button.disabled = false;
  $("bt-skeleton").hidden = true;
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
  applyPreset("12"); // 1 year is the default period

  say(problems.join(" "), problems.length > 0);
  $("results").hidden = false;
  draw();
});

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
    state.start = from < state.min ? state.min : from;
    state.end = to > state.max ? state.max : to;
    draw();
  });
}

$("log-scale").addEventListener("change", (event) => {
  state.log = event.target.checked;
  draw();
});

$("heat-pick").addEventListener("click", (event) => {
  const index = event.target.dataset.index;
  if (index === undefined) return;
  state.heat = Number(index);
  drawHeatmap(state.windows);
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
function setSpan(start, end) {
  const span = Math.min(end - start, Date.parse(state.max) - Date.parse(state.min));
  const lo = Math.min(Math.max(start, Date.parse(state.min)), Date.parse(state.max) - span);
  const [from, to] = [state.start, state.end];
  Object.assign(state, { preset: "", start: iso(lo), end: iso(lo + span) });
  if (state.series.some((s) => windowOf(s.points, state.start, state.end).points.length < 3)) Object.assign(state, { start: from, end: to }); // too few points: keep the old range
  else requestAnimationFrame(draw);
}
for (const id of ["growth-chart", "drawdown-chart"]) {
  const box = $(id);
  const chart = () => charts?.[id.split("-")[0]];
  const msAt = (event) => chart().convertFromPixel({ xAxisIndex: 0 }, event.offsetX);
  box.addEventListener("wheel", (event) => {
    if (!chart() || !state.start) return;
    event.preventDefault();
    const [start, end] = [Date.parse(state.start), Date.parse(state.end)];
    const at = Math.min(Math.max(msAt(event), start), end);
    const k = event.deltaY < 0 ? 0.8 : 1.25; // in: shrink the span around the pointer
    setSpan(at - (at - start) * k, at + (end - at) * k);
  }, { passive: false });
  box.addEventListener("pointerdown", (event) => {
    if (!chart() || !state.start) return;
    box.setPointerCapture(event.pointerId);
    const [start, end, x0] = [Date.parse(state.start), Date.parse(state.end), event.offsetX];
    const msPerPx = (msAt({ offsetX: x0 + 100 }) - msAt({ offsetX: x0 })) / 100;
    box.onpointermove = (e) => setSpan(start - (e.offsetX - x0) * msPerPx, end - (e.offsetX - x0) * msPerPx);
    box.onpointerup = () => { box.onpointermove = box.onpointerup = null; };
  });
}

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

  for (const b of document.querySelectorAll(".presets button")) b.setAttribute("aria-pressed", b.dataset.months === state.preset);
  for (const b of $("step").children) b.setAttribute("aria-pressed", b.dataset.step === state.step);
  for (const b of $("period").children) b.setAttribute("aria-pressed", Number(b.dataset.keyLength) === state.keyLength);
  for (const [id, value] of [["from", state.start], ["to", state.end]]) {
    Object.assign($(id), { min: state.min, max: state.max, value });
  }

  state.windows = windows;
  renderChips(windows);
  const stats = windows.map((w) => summarize(w.points, state.benchmark, w.nextDate, START_VALUE));
  drawTable(windows, stats);
  drawSummary(windows, stats);
  drawHeatmap(windows);

  if (!window.echarts) {
    say("The chart library didn't load, so only the table is shown. Check your connection and reload.", true);
    return;
  }
  if (!charts) {
    charts = Object.fromEntries(["growth", "returns", "drawdown", "scatter"].map((n) => [n, echarts.init($(`${n}-chart`))]));
    echarts.connect([charts.growth, charts.drawdown]); // hovering one moves the crosshair on the other
    const resize = () => Object.values(charts).forEach((c) => c.resize());
    addEventListener("resize", resize);
    addEventListener("hashchange", resize); // the tab may have been hidden while the window changed size
  }
  drawGrowth(windows);
  drawReturns(windows);
  drawDrawdowns(windows);
  drawScatter(windows, stats);
}

function swatch(color) {
  const node = element("span");
  node.className = "swatch";
  node.style.background = color;
  return node;
}

function drawTable(windows, stats) {
  const columnHeads = windows.map((w) => Object.assign(element("th", swatch(w.color), w.label), { scope: "col" }));
  if (windows.length === 2) {
    columnHeads.push(Object.assign(element("th", `${windows[0].label} − ${windows[1].label}`), { scope: "col" }));
  }

  const rows = METRICS.map(([label, key, format]) => {
    const cells = stats.map((s) => element("td", show(s[key], format)));
    if (windows.length === 2) cells.push(element("td", showDifference(stats[0][key], stats[1][key], format)));
    return element("tr", Object.assign(element("th", term(label)), { scope: "row" }), ...cells);
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
    xAxis: { axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false }, axisLabel, splitLine: { show: false } },
    yAxis: { axisLabel, splitLine: { lineStyle: { color: GRID } } },
  };
}

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

function drawGrowth(windows) {
  const base = frame(longDate, money);
  const data = windows.map((w) => resample(w.points.map((p) => [p.date, (START_VALUE * p.adjClose) / w.points[0].adjClose])));
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
      series: windows.map((w) => {
        const dd = drawdowns(w.points);
        const deepest = dd.reduce((a, b) => (b.value < a.value ? b : a));
        return line(w, resample(dd.map((d) => [d.date, d.value])), {
          lineStyle: { width: 1.5, color: w.color },
          // Underwater: the deeper below the previous high, the stronger the colour.
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${w.color}0d` }, { offset: 1, color: `${w.color}66` }] } },
          markPoint: deepest.value < 0 ? {
            symbol: "circle",
            symbolSize: 9,
            itemStyle: { color: "#fff", borderColor: w.color, borderWidth: 2 },
            label: { position: "bottom", color: INK, fontSize: 11, fontWeight: 600, formatter: () => pctAxis.format(deepest.value) },
            data: [{ coord: [Date.parse(deepest.date), deepest.value] }],
          } : undefined,
        });
      }),
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
        markPoint: badges(byPeriod[i], windows.length),
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
function badges(periods, lineCount) {
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
      badge(worst, "Worst", { position: "bottom", color: "#b3372b", backgroundColor: "#fff", borderColor: "#b3372b", borderWidth: 1 }),
    ],
  };
}

// Headline figures per line. Exactly two lines become a head-to-head, with the better value in each row marked.
function drawSummary(windows, stats) {
  const rows = [
    ["Annualised return", "cagr", pct, 1],
    ["Volatility (annualised)", "volatility", pct, -1],
    ["Maximum drawdown", "maxDrawdown", pct, 1],
    ["Sharpe ratio", "sharpe", num, 1],
  ];
  const versus = windows.length === 2;
  const sides = windows.map((w, i) => {
    const big = Object.assign(element("strong"), { className: "big" });
    countUp(big, stats[i].finalValue, money);
    const facts = rows.map(([label, key, format, better]) => {
      const value = element("dd");
      countUp(value, stats[i][key], format);
      const other = versus ? stats[1 - i][key] : NaN;
      if (Number.isFinite(other) && Number.isFinite(stats[i][key]) && (stats[i][key] - other) * better > 0) value.classList.add("win");
      return element("div", element("dt", term(label)), value);
    });
    return Object.assign(element("section", element("h3", swatch(w.color), w.label), big, element("dl", ...facts)), { className: "side" });
  });
  if (versus) sides.splice(1, 0, Object.assign(element("span", "VS"), { className: "vs-badge", ariaHidden: "true" }));
  $("summary").className = `summary${versus ? " versus" : ""}`;
  $("summary").replaceChildren(...sides);
}

// Every month of the chosen line, a row per year: green gains, red losses, stronger for bigger moves.
const pctShort = new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2000, m)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }));

function heatCell(p, scale) {
  if (!p) return element("td");
  const strength = 0.1 + 0.75 * Math.min(1, Math.abs(p.value) / scale);
  const cell = element("td", pctShort.format(p.value));
  cell.style.background = p.value >= 0 ? `rgba(31, 122, 77, ${strength})` : `rgba(179, 55, 43, ${strength})`;
  if (strength > 0.55) cell.style.color = "#fff";
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
      ...MONTHS.map((_, m) => heatCell(months.get(`${y.period}-${String(m + 1).padStart(2, "0")}`), 0.1)),
      Object.assign(heatCell(y, 0.3), { className: `year${y.partial ? " partial" : ""}` }),
    ),
  );
  $("heatmap").replaceChildren(element("thead", head), element("tbody", ...body));
  $("heatmap").setAttribute("aria-label", `Monthly returns of ${w.label}`);
}

// Volatility across, return up: one dot per line, coloured like its line.
function drawScatter(windows, stats) {
  const annual = stats.every((s) => s.cagr !== null);
  const yName = annual ? "Annualised return" : "Total return";
  $("scatter-note").textContent = `Each dot is one compared asset: further right swings more, higher ${annual ? "grew faster per year" : "gained more over the period (it is under a year, so returns are not annualised)"}.`;
  const base = frame(String, pct);
  const axis = (name) => ({ name, nameLocation: "end", nameTextStyle: { color: MUTED, fontSize: 12 }, type: "value", scale: true, axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => pctAxis.format(v) } });
  charts.scatter.setOption(
    {
      ...base,
      grid: { left: 8, right: 80, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (item) => `<strong>${escapeHtml(item.seriesName)}</strong><div>Volatility ${pct.format(item.value[0])}</div><div>${yName} ${pct.format(item.value[1])}</div>`,
      },
      xAxis: { ...base.xAxis, ...axis("Volatility") },
      yAxis: { ...base.yAxis, ...axis(yName) },
      series: windows.map((w, i) => ({
        name: w.label,
        type: "scatter",
        symbolSize: 14,
        itemStyle: { color: w.color, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, position: "right", formatter: "{a}", color: INK, fontWeight: 600 },
        emphasis: { scale: 1.2 },
        data: [[stats[i].volatility, annual ? stats[i].cagr : stats[i].totalReturn]],
      })),
    },
    true,
  );
}

renderChips();
form.requestSubmit(); // open with the default comparison already drawn
