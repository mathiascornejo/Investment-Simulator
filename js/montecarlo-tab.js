// Monte Carlo tab: simulate many futures for one portfolio (or ticker) and show past crises.
// The maths lives in montecarlo.js; this file is inputs, loading and drawing.
import { fetchPrices } from "./data.js";
import { attachTickerSearch } from "./ticker-search.js";
import { dropdown, liveField } from "./fields.js";
import { periodReturns } from "./stats.js";
import { loadPortfolios, portfolioSeries } from "./portfolios.js";
import { simulate, crisisTest, historicalRun, CRISES } from "./montecarlo.js";
import { pct, moneyFit, moneyCompact, longDate, monthLabel, element } from "./format.js";
import { frame } from "./backtester.js";
import { gauge, countUp, reducedMotion } from "./visuals.js";
import { term } from "./glossary.js";


const BENCHMARK = "SPY";
const MIN_MONTHS = 24; // fewer real months than this is too little history to resample from
// One hue, light to dark: the wider the band, the lighter it is.
const MEDIAN = "#2a78d6";
const MIDDLE_50 = "#9ec5f4";
const MIDDLE_80 = "#cde2fb";
const SAMPLE = "rgba(26, 26, 26, 0.16)"; // individual runs, drawn faintly behind the bands
const SAMPLES = 30;

const $ = (id) => document.getElementById(id);
attachTickerSearch($("mc-ticker"));
$("mc-ticker").placeholder = "Add a ticker";
$("mc-ticker").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^A-Za-z0-9.\-]/g, ""); }); // same as the Backtester box
for (const id of ["mc-start", "mc-withdrawal", "mc-growth", "mc-contribution", "mc-years"]) liveField($(id));
const form = $("mc-form");
const status = $("mc-status");
const rate = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
let chart; // created on first run, once its container is visible

function say(text, isError = false) {
  status.textContent = text;
  if (isError) status.dataset.state = "error";
  else delete status.dataset.state;
}

// The portfolio list: saved portfolios, then the option to test one ticker.
function listPortfolios() {
  const picker = $("mc-portfolio");
  const before = picker.value;
  const saved = loadPortfolios();
  picker.replaceChildren(...saved.map((p) => new Option(p.name, p.name)), new Option("A single ticker", ""));
  if (saved.some((p) => p.name === before) || (before === "" && picker.dataset.ready)) picker.value = before;
  picker.dataset.ready = "yes";
  $("mc-ticker-field").hidden = picker.value !== "";
}
addEventListener("portfolios-changed", listPortfolios);
$("mc-portfolio").addEventListener("change", () => {
  $("mc-ticker-field").hidden = $("mc-portfolio").value !== "";
});
listPortfolios();
dropdown($("mc-portfolio"), { help: {} });
dropdown($("mc-contribute-every"), { help: { month: "One twelfth of the yearly amount, every month.", year: "The whole yearly amount, at the start of each year." } });
dropdown($("mc-runs"), { help: { 1000: "Quick, rougher estimate.", 10000: "A good balance of speed and detail.", 50000: "Smoother bands.", 100000: "Smoother still; a few seconds.", 1000000: "Smoothest; around ten seconds." } });

// Runs in a background thread so the page stays responsive; falls back to the page itself if workers are unavailable.
function simulateAway(input) {
  try {
    const worker = new Worker(new URL("./montecarlo-worker.js", import.meta.url), { type: "module" });
    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => { worker.terminate(); resolve(e.data); };
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || "worker error")); };
      worker.postMessage(input);
    });
  } catch {
    return Promise.resolve(simulate(input));
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const portfolio = loadPortfolios().find((p) => p.name === $("mc-portfolio").value);
  const ticker = $("mc-ticker").value.trim().toUpperCase();
  if (!portfolio && !/^[A-Z0-9.-]{1,12}$/.test(ticker)) return say("Enter a ticker made of letters, digits, dots or dashes.", true);
  const startValue = Number($("mc-start").value);
  const annualWithdrawal = Number($("mc-withdrawal").value);
  const growth = Number($("mc-growth").value) / 100;
  const annualContribution = Number($("mc-contribution").value);
  const contributeMonthly = $("mc-contribute-every").value === "month";
  const years = Number($("mc-years").value);
  const runs = Number($("mc-runs").value);
  const MAX = 1e12; // same cap as the inputs' max: bigger amounts add nothing and could overflow over 60 years
  if (!(startValue > 0 && startValue <= MAX) || !(annualWithdrawal >= 0 && annualWithdrawal <= MAX) || !(annualContribution >= 0 && annualContribution <= MAX) || !(growth >= 0 && growth <= 0.2) || !(Number.isInteger(years) && years >= 1 && years <= 60)) {
    return say("Check the amounts: a starting amount above 0 and a withdrawal and a contribution of 0 or more (all up to $1 trillion), a rise of 0 to 20%, and 1 to 60 whole years.", true);
  }

  const name = portfolio ? portfolio.name : ticker;
  const tickers = [...new Set([...(portfolio ? portfolio.holdings.map((h) => h.ticker) : [ticker]), BENCHMARK])];
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  $("mc-skeleton").hidden = !$("mc-results").hidden;
  say(`Loading ${name}…`);
  let prices;
  try {
    const loaded = await Promise.all(tickers.map(fetchPrices));
    prices = Object.fromEntries(tickers.map((t, i) => [t, loaded[i]]));
  } catch (error) {
    $("mc-skeleton").hidden = true;
    return say(`${name} didn't load: ${error.message.replace(/\.$/, "")}.`, true);
  } finally {
    button.disabled = false;
  }

  const points = portfolio ? portfolioSeries(portfolio, prices).points : prices[ticker];
  // Whole calendar months only: a part-month would count as a full month's return.
  const months = points.length > 2 ? periodReturns(points, 7).filter((m) => !m.partial) : [];
  if (months.length < MIN_MONTHS) {
    $("mc-skeleton").hidden = true;
    return say(`${name} has under two years of history, which is too little to simulate from.`, true);
  }

  say(`Running ${runs.toLocaleString()} simulations…`);
  button.disabled = true;
  let result;
  try {
    result = await simulateAway({ monthlyReturns: months.map((m) => m.value), startValue, annualWithdrawal, growth, annualContribution, contributeMonthly, years, runs, samples: SAMPLES });
  } catch (error) {
    return say(`The simulation failed: ${error.message}`, true);
  } finally {
    button.disabled = false;
    $("mc-skeleton").hidden = true;
  }
  const { failureRate, bands, paths } = result;
  say("");

  countUp($("mc-failure"), failureRate, rate);
  $("mc-failure-label").textContent = `of ${runs.toLocaleString()} runs ran out of money within ${years} ${years === 1 ? "year" : "years"}`;
  $("mc-lasted").textContent = `The dial shows the other ${rate.format(1 - failureRate)}: runs that lasted.`;
  // The needle swings from empty to the result once the dial is on screen.
  $("mc-gauge").replaceChildren(gauge(1 - failureRate));
  $("mc-gauge").classList.add("start");
  const tiles = [
    ["Median ending balance", bands.p50.at(-1)],
    ["Poor outcome (10th percentile)", bands.p10.at(-1)],
    ["Strong outcome (90th percentile)", bands.p90.at(-1)],
  ];
  $("mc-tiles").replaceChildren(
    ...tiles.map(([label, value]) => {
      const dd = element("dd");
      countUp(dd, value, moneyFit);
      return element("div", element("dt", label.includes("percentile") ? term(label, "percentile") : label), dd);
    }),
  );

  $("mc-chart-title").textContent = `Range of Outcomes for ${name} Over ${years} ${years === 1 ? "Year" : "Years"}`;
  $("mc-legend").replaceChildren(
    ...[["Median run", MEDIAN], ["Middle 50% of runs", MIDDLE_50], ["Middle 80% of runs", MIDDLE_80], [`${paths.length} sample runs`, SAMPLE]].map(([label, color]) => {
      const swatch = Object.assign(element("span"), { className: "swatch" });
      swatch.style.background = color;
      return element("li", swatch, label);
    }),
  );
  $("mc-method").textContent =
    `Method: historical bootstrap. Each run is built month by month, drawing every month at random (with replacement) from ` +
    `the ${months.length} real monthly returns of ${name} between ${monthLabel(months[0].period)} and ${monthLabel(months.at(-1).period)}. ` +
    `Withdrawals are taken monthly.${annualContribution > 0 ? ` Contributions of ${moneyFit.format(annualContribution)} a year are added ${contributeMonthly ? "monthly" : "at the start of each year"} and stay the same every year.` : ""} Balances are in future dollars, not adjusted for inflation. ` +
    `The future can be worse than anything in this history, and a short history makes the result less reliable.`;

  drawCrises(points, prices[BENCHMARK], { startValue, annualWithdrawal, growth, annualContribution, contributeMonthly });
  $("mc-results").hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => $("mc-gauge").classList.remove("start")));
  drawCone(bands, paths);
});

function drawCone(bands, paths) {
  if (!window.echarts) return say("The chart library didn't load, so the chart is missing. Check your connection and reload.", true);
  if (!chart) {
    chart = echarts.init($("mc-chart"));
    const resize = () => chart.resize();
    addEventListener("resize", resize);
    addEventListener("hashchange", resize);
  }
  const base = frame(String, moneyFit);
  const gap = (upper, lower) => upper.map((v, i) => v - lower[i]);
  // Stacked areas draw the bands: an invisible base at the 10th percentile, then the gaps above it.
  // Sample runs draw themselves first, left to right; the bands fade in once they are done.
  const animate = !reducedMotion();
  const layer = (name, data, color) => ({
    name,
    type: "line",
    stack: "cone",
    data,
    showSymbol: false,
    lineStyle: { opacity: 0 },
    areaStyle: { color: color ?? "transparent", opacity: 0.92 },
    emphasis: { disabled: true },
    animationDelay: 1100,
    animationDuration: 500,
  });
  const sample = (data, i) => ({
    name: "Sample run",
    type: "line",
    data,
    showSymbol: false,
    silent: true,
    z: 3,
    lineStyle: { width: 1, color: SAMPLE },
    emphasis: { disabled: true },
    animationDuration: 1100,
    animationDelay: i * 12,
    tooltip: { show: false },
  });
  const rows = [
    ["Strong outcome (90th percentile)", "p90"],
    ["75th percentile", "p75"],
    ["Median", "p50"],
    ["25th percentile", "p25"],
    ["Poor outcome (10th percentile)", "p10"],
  ];
  chart.setOption(
    {
      ...base,
      animation: animate,
      tooltip: {
        ...base.tooltip,
        // Pinned top-left so the readout never covers the cone it describes.
        position: (point, params, dom, rect, size) => [Math.min(point[0] + 16, size.viewSize[0] - size.contentSize[0]), 8],
        formatter: (items) => {
          const year = items[0].dataIndex;
          return (
            `<strong>${year === 0 ? "Start" : `After ${year} ${year === 1 ? "year" : "years"}`}</strong>` +
            rows.map(([label, key]) => `<div style="display:flex;justify-content:space-between;gap:1.5rem"><span>${label}</span><span>${moneyFit.format(bands[key][year])}</span></div>`).join("")
          );
        },
      },
      xAxis: { ...base.xAxis, type: "category", boundaryGap: false, data: bands.p50.map((_, year) => year) },
      // Capped just above the 90th percentile: a few wild sample runs would otherwise squash the cone.
      yAxis: { ...base.yAxis, type: "value", min: 0, max: Number((Math.max(...bands.p90) * 1.1).toPrecision(2)), axisLabel: { ...base.yAxis.axisLabel, showMaxLabel: false, formatter: (v) => moneyCompact.format(v) } },
      series: [
        ...paths.map(sample),
        layer("10th percentile", bands.p10),
        layer("10th to 25th", gap(bands.p25, bands.p10), MIDDLE_80),
        layer("25th to 75th", gap(bands.p75, bands.p25), MIDDLE_50),
        layer("75th to 90th", gap(bands.p90, bands.p75), MIDDLE_80),
        { name: "Median", type: "line", data: bands.p50, showSymbol: false, z: 4, lineStyle: { width: 2, color: MEDIAN }, itemStyle: { color: MEDIAN }, emphasis: { disabled: true }, animationDelay: 1100 },
      ],
    },
    true,
  );
}

// A table cell with a main line and a smaller second line.
const cell = (main, detail) => element("td", main, ...(detail ? [element("small", detail)] : []));

function drawCrises(points, benchmark, { startValue, annualWithdrawal, growth, annualContribution, contributeMonthly }) {
  const last = points.at(-1).date;
  const heads = ["Crisis", "Lowest point", `${BENCHMARK}'s lowest point`, "Back to its starting level", annualContribution > 0 ? "With your withdrawals and contributions" : "With your withdrawals"];
  const rows = CRISES.map((crisis) => {
    const title = Object.assign(element("th", crisis.name, element("small", `${longDate(crisis.start)} to ${longDate(crisis.end)}`)), { scope: "row" });
    const test = crisisTest(points, crisis);
    if (!test) {
      // Never silently skip: say why this crisis can't be measured.
      const why = element("td", `No data. This portfolio's history starts on ${longDate(points[0].date)}, after this crisis began.`);
      why.colSpan = heads.length - 1;
      return element("tr", title, why);
    }
    const spy = crisisTest(benchmark, crisis);
    const yearsToRecover = test.recovered && ((Date.parse(test.recovered) - Date.parse(crisis.start)) / (365.25 * 864e5)).toFixed(1);
    const run = historicalRun(points, crisis.start, startValue, annualWithdrawal, growth, annualContribution, contributeMonthly);
    return element(
      "tr",
      title,
      cell(pct.format(test.lowest), `on ${longDate(test.lowDate)}`),
      spy ? cell(pct.format(spy.lowest), `on ${longDate(spy.lowDate)}`) : cell("–"),
      test.recovered ? cell(longDate(test.recovered), `${yearsToRecover} years after the start`) : cell("Not yet", `as of ${longDate(last)}`),
      run.ranOutIn ? cell(`Ran out in ${monthLabel(run.ranOutIn)}`) : cell(`${moneyFit.format(run.final)} left`, `on ${longDate(last)}`),
    );
  });
  $("mc-crises").replaceChildren(
    element("thead", element("tr", ...heads.map((h) => Object.assign(element("th", h), { scope: "col" })))),
    element("tbody", ...rows),
  );
}
