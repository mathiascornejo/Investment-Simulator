// Monte Carlo tab: simulate many futures for one portfolio (or ticker) and show past crises.
// The maths lives in montecarlo.js; this file is inputs, loading and drawing.
import { fetchPrices, inflation, basisTag } from "./data.js";
import { attachTickerSearch } from "./ticker-search.js";
import { dropdown, liveField, flagField } from "./fields.js";
import { periodReturns } from "./stats.js";
import { loadPortfolios, portfolioSeries } from "./portfolios.js";
import { simulate, crisisTest, historicalRun, crisisMonths, failureYears, logStats, everyStart, shareAtOrBelow, percentile, withStandIns, standIns, CRISES } from "./montecarlo.js";
import { pct, moneyIn, currencySymbol, longDate, monthLabel, element, downloadCsv } from "./format.js";
import { frame } from "./backtester.js";
import { gauge, countUp, reducedMotion, tryAgain } from "./visuals.js";
import { term } from "./glossary.js";
import { countryName } from "./countries.js";
import { currencyNotes, currencyWord, sharedCurrency } from "./currency.js";
import { priceWarnings } from "./quality.js";
import { linkFor, clearLink, linkedPortfolios, copyLink, offerSave, recipe, exampleCards } from "./links.js";

const BENCHMARK = "SPY";
const MIN_MONTHS = 24; // fewer real months than this is too little history to resample from
// One hue, light to dark: the wider the band, the lighter it is.
const MEDIAN = "#2a78d6";
const MIDDLE_50 = "#9ec5f4";
const MIDDLE_80 = "#cde2fb";
const SAMPLE = "rgba(26, 26, 26, 0.16)"; // individual runs, drawn faintly behind the bands
const RAN_OUT = "rgba(179, 55, 43, 0.3)"; // --loss, faint: sample runs that ran out of money
const INK = "#1a1a1a"; // --ink in styles.css: the marker for the user's own withdrawal
const PLAN = "#66665f"; // --muted: reference lines (what the fixed rule would pay; the starting amount)
const SAMPLES = 30;
const BLOCK = 12; // average block length in months: each month has a 1-in-12 chance of starting a new block

const $ = (id) => document.getElementById(id);
attachTickerSearch($("mc-ticker"));
$("mc-ticker").placeholder = "Add a ticker";
$("mc-ticker").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^A-Za-z0-9.\-]/g, ""); }); // same as the Backtester box
// Amounts are in the currency of the portfolio or ticker (plain numbers when its holdings differ): the form's as
// chosen now, the results' as of the run on screen.
let formUnit = moneyIn("USD");
let { money, moneyFit, moneyCompact } = formUnit;
let linked = null; // a portfolio a share link brought that isn't saved here
let linkSeed = null; // the random seed a share link asks for, used by the next run only
const choices = () => [...loadPortfolios(), ...(linked ? [linked] : [])];
const chosen = () => choices().find((p) => p.name === $("mc-portfolio").value);
function showFormUnit() {
  const p = chosen();
  formUnit = moneyIn(sharedCurrency(p ? p.holdings.map((h) => h.ticker) : [$("mc-ticker").value.trim().toUpperCase()]));
  const symbol = currencySymbol(formUnit);
  for (const node of $("mc-form").querySelectorAll("[data-unit]")) node.textContent = symbol && `(${symbol})`;
  readBacks.forEach((readBack) => readBack()); // the amounts in that currency
}
// Money boxes read the amount back with commas once it is valid.
const yearly = (v) => `${formUnit.money.format(v)} a year`;
const formats = { "mc-start": (v) => formUnit.money.format(v), "mc-withdrawal": yearly, "mc-contribution": yearly };
const readBacks = ["mc-start", "mc-withdrawal", "mc-growth", "mc-contribution", "mc-fee", "mc-years"].map((id) => liveField($(id), { format: formats[id] }));
// What each box needs, said in the status line when a run is refused (the box itself is pointed at too).
// m formats an amount in the form's currency ("$1", "₱1", or a plain number when the holdings' currencies differ).
const NEEDS = {
  "mc-start": (m) => `Check the starting amount: from ${m(1)} to ${m(1)} trillion.`,
  "mc-withdrawal": (m) => `Check the withdrawal per year: from ${m(0)} to ${m(1)} trillion.`,
  "mc-growth": () => "Check how much withdrawals rise each year: from 0% to 20%.",
  "mc-contribution": (m) => `Check the contribution per year: from ${m(0)} to ${m(1)} trillion.`,
  "mc-fee": () => "Check the fee per year: from 0% to 10%.",
  "mc-years": () => "Check the years to simulate: a whole number from 1 to 60.",
};
const form = $("mc-form");
const status = $("mc-status");
const rate = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const feeRate = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 }); // 0.25% stays 0.25%
const lower = (text) => text[0].toLowerCase() + text.slice(1); // "Dot-com crash" inside a sentence
const and = new Intl.ListFormat("en");
const yearsWord = (n) => `${n} ${n === 1 ? "year" : "years"}`;
const charts = {}; // each created on first use, once its container is visible
let current = null; // the run on screen: its settings in words, results, seed and which random months it drew
let pinned = null; // a run kept for comparison (memory only); while kept, every run reuses its seed
let ranWith = null; // formNow() of the run on screen

function say(text, isError = false) {
  status.textContent = text;
  if (isError) status.dataset.state = "error";
  else delete status.dataset.state;
}

function chartIn(id) {
  if (!charts[id]) {
    const chart = (charts[id] = echarts.init($(id)));
    const resize = () => chart.resize();
    addEventListener("resize", resize);
    addEventListener("hashchange", resize);
  }
  return charts[id];
}

// The portfolio list: saved portfolios, then the option to test one ticker.
function listPortfolios() {
  const picker = $("mc-portfolio");
  const before = picker.value;
  const saved = choices();
  picker.replaceChildren(...saved.map((p) => new Option(p === linked ? `${p.name} (from a link)` : p.name, p.name)), new Option("A single ticker", ""));
  if (saved.some((p) => p.name === before) || (before === "" && picker.dataset.ready)) picker.value = before;
  picker.dataset.ready = "yes";
  $("mc-ticker-field").hidden = picker.value !== "";
  showFormUnit();
}
addEventListener("portfolios-changed", listPortfolios);
$("mc-portfolio").addEventListener("change", () => {
  $("mc-ticker-field").hidden = $("mc-portfolio").value !== "";
  showFormUnit();
});
// A picked suggestion fills the box without an input event: keyup (Enter) and click (a suggestion) catch it.
for (const type of ["input", "keyup", "change", "click"]) $("mc-ticker-field").addEventListener(type, showFormUnit);
listPortfolios();
dropdown($("mc-portfolio"), { help: {} });
dropdown($("mc-rule"), {
  help: {
    fixed: "The withdrawal rises by the set percentage every year, whatever the markets do.",
    guardrails: "Cut 10% when it grows too big for the balance, raised 10% when it gets small, and no rise after a losing year.",
  },
});
dropdown($("mc-contribute-every"), { help: { month: "One twelfth of the yearly amount, every month.", year: "The whole yearly amount, at the start of each year." } });
dropdown($("mc-runs"), { help: { 1000: "Quick, rougher estimate.", 10000: "A good balance of speed and detail.", 50000: "Smoother bands.", 100000: "Smoother still; a few seconds.", 1000000: "Smoothest; ten to twenty seconds." } });
dropdown($("mc-draw"), {
  help: {
    month: "Each month is a random real month.",
    block: "Stretches of real months in order, about a year each, so bad months stay together.",
    normal: "Made-up months from a bell curve with the history's average and spread.",
    t: "Like the bell curve, but extreme months come more often, as in real markets.",
  },
});
$("mc-begin").append(...CRISES.map((c) => new Option(c.name, c.start)));
dropdown($("mc-begin"), {
  help: {
    "": "Each run starts with a random month.",
    ...Object.fromEntries(CRISES.map((c) => [c.start, `The real fall from ${monthLabel(c.start.slice(0, 7))} to ${monthLabel(c.end.slice(0, 7))} first, then random months.`])),
  },
});

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

// Results already on screen fade while a new run loads and runs. Runs can overlap (a link, a setting change or
// Try again starts one while another is going), so only the latest draws its results and un-fades them.
let launches = 0;
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ticket = ++launches;
  const button = form.querySelector("button[type=submit]");
  const hadFocus = document.activeElement === button;
  $("mc-results").setAttribute("aria-busy", "true");
  try {
    await run(ticket);
  } finally {
    if (ticket === launches) {
      $("mc-results").setAttribute("aria-busy", "false");
      if (hadFocus && document.activeElement === document.body) button.focus({ preventScroll: true }); // disabling it dropped focus
    }
  }
});

async function run(ticket) {
  const seed = linkSeed; // read at once: a link's seed belongs to the run it started, not one already going
  linkSeed = null;
  const portfolio = chosen();
  const ticker = $("mc-ticker").value.trim().toUpperCase();
  if (!portfolio && !/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
    say("Check the ticker: letters, digits, dots or dashes, up to 12.", true);
    return flagField($("mc-ticker"));
  }
  // The boxes' own rules (min, max, whole years) decide; an empty box counts as wrong.
  const wrong = Object.keys(NEEDS).find((id) => $(id).value === "" || !$(id).validity.valid);
  if (wrong) {
    say(NEEDS[wrong]((v) => formUnit.money.format(v)), true);
    return flagField($(wrong));
  }
  const startValue = Number($("mc-start").value);
  const annualWithdrawal = Number($("mc-withdrawal").value);
  const growth = Number($("mc-growth").value) / 100;
  const annualContribution = Number($("mc-contribution").value);
  const contributeMonthly = $("mc-contribute-every").value === "month";
  const fee = Number($("mc-fee").value) / 100;
  const years = Number($("mc-years").value);
  const runs = Number($("mc-runs").value);
  const method = $("mc-draw").value;
  const crisis = CRISES.find((c) => c.start === $("mc-begin").value);
  const rule = $("mc-rule").value;

  const name = portfolio ? portfolio.name : ticker;
  // Read now, before loading: the form can change while prices load.
  const ranFrom = formNow();
  const link = linkPairs(portfolio);
  const holdings = portfolio ? portfolio.holdings.map((h) => h.ticker) : [ticker];
  const code = sharedCurrency(holdings);
  const unit = moneyIn(code);
  ({ money, moneyFit, moneyCompact } = unit);
  const word = currencyWord(code);
  const basis = inflation.real ? `Today's ${word}, adjusted for ${countryName(inflation.country)} inflation` : `Future ${word}, not adjusted for inflation`;
  const settings = describe({ name, startValue, annualWithdrawal, growth, rule, annualContribution, contributeMonthly, fee, years, runs, crisis, basis });
  const tickers = [...new Set([...holdings, BENCHMARK])];
  // Older funds that stand in for young ones in the crisis tests. One that fails to load is left out, and the table says so.
  const spares = [...new Set(tickers.flatMap(standIns))].filter((t) => !tickers.includes(t));
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  $("mc-skeleton").hidden = !$("mc-results").hidden;
  say(`Loading ${name}…`);
  let prices, spare, failure;
  try {
    const [loaded, loadedSpares] = await Promise.all([Promise.all(tickers.map(fetchPrices)), Promise.all(spares.map((t) => fetchPrices(t).catch(() => null)))]);
    prices = Object.fromEntries(tickers.map((t, i) => [t, loaded[i]]));
    spare = Object.fromEntries(spares.map((t, i) => [t, loadedSpares[i]]));
  } catch (error) {
    failure = error;
  }
  if (ticket !== launches) return; // a newer run started while this one loaded
  button.disabled = false;
  // A run that can't go ahead takes the previous results away, so they aren't read as this setup's.
  const refuse = (text) => {
    $("mc-skeleton").hidden = $("mc-results").hidden = true;
    say(text, true);
  };
  if (failure) {
    refuse(`${name} didn't load: ${failure.message.replace(/\.$/, "")}.`);
    if (failure.retry !== false) tryAgain(status, () => form.requestSubmit()); // prices that did load are kept
    return;
  }

  const points = portfolio ? portfolioSeries(portfolio, prices).points : prices[ticker];
  // Whole calendar months only: a part-month would count as a full month's return.
  const months = points.length > 2 ? periodReturns(points, 7).filter((m) => !m.partial) : [];
  if (months.length < MIN_MONTHS) return refuse(`${name} has under two years of history, which is too little to simulate from.`);
  // Crisis tests (the table, and a crash at the start of every run) reach back before a young fund's first day through
  // its stand-ins, and say so wherever one is used. The simulation itself draws only on the real history above.
  const all = { ...spare, ...prices };
  const long = Object.fromEntries(tickers.map((t) => [t, withStandIns(prices[t], standIns(t).map((s) => ({ ticker: s, points: all[s] })))]));
  const longPrices = Object.fromEntries(tickers.map((t) => [t, long[t].points]));
  const crisisPoints = portfolio ? portfolioSeries(portfolio, longPrices).points : longPrices[ticker];
  const notes = {
    fund: (from) => standInNotes(long, holdings, from),
    benchmark: (from) => standInNotes(long, [BENCHMARK], from),
    missing: spares.filter((t) => !spare[t]),
  };
  const prefix = crisis ? crisisMonths(crisisPoints, crisis) : [];
  if (!prefix) return refuse(`${name} has no data for the whole ${lower(crisis.name)}: its history runs from ${longDate(crisisPoints[0].date)} to ${longDate(crisisPoints.at(-1).date)}. Pick another crisis or a random month.`);

  // Comparisons rerun the same random draws with one thing changed, so the gap comes from that change, not from chance.
  const plan = { startValue, annualWithdrawal, growth, annualContribution, contributeMonthly, fee, rule };
  // With a run kept for comparison, its seed is reused, so both runs draw the same random months.
  // A share link's seed comes first, so whoever opens it gets the same random months as the sender.
  const input = { ...plan, monthlyReturns: months.map((m) => m.value), years, runs, method, blockLength: BLOCK, prefix, seed: seed ?? (pinned ? pinned.seed : (Math.random() * 2 ** 32) >>> 0) };
  const guarded = rule === "guardrails";
  const extra = (crisis ? 1 : 0) + (fee > 0 ? 1 : 0) + (guarded ? 1 : 0);
  say(`Running ${runs.toLocaleString()} simulations${extra ? `, plus ${(runs * extra).toLocaleString()} more to compare` : ""}…`);
  button.disabled = true;
  let result, randomStart, noFee, fixed;
  try {
    // Each setup runs in its own background thread, side by side.
    [result, randomStart, noFee, fixed] = await Promise.all([
      // The other-amounts curve is exact only with the fixed rule and no contributions, so it is worked out only then.
      simulateAway({ ...input, samples: SAMPLES, perfectRates: !guarded && annualContribution === 0 }),
      crisis && simulateAway({ ...input, prefix: [] }),
      fee > 0 && simulateAway({ ...input, fee: 0 }),
      guarded && simulateAway({ ...input, rule: "fixed" }),
    ]);
  } catch (error) {
    failure = error;
  }
  if (ticket !== launches) return; // a newer run started while this one ran
  button.disabled = false;
  $("mc-skeleton").hidden = true;
  if (failure) return refuse(`The simulation failed: ${failure.message}`);
  const { failureRate, bands, paths, ranOut } = result;
  say(priceWarnings(prices)); // anything odd in the prices behind the run
  // The same seed gives the same random months only with the same number of runs, way of drawing and history.
  current = { settings, failureRate, bands, paths, startValue, unit, seed: input.seed, draws: `${runs} ${method} ${months[0].period} ${months.length}`, link, history: [months[0].period, months.at(-1).period] };
  $("mc-examples").hidden = true; // the example card goes after the first run
  $("mc-share-status").replaceChildren();
  ranWith = ranFrom;
  $("mc-summary").replaceChildren(...settings.filter((s) => s.tag).map((s) => element("li", s.tag)));
  $("mc-basis").textContent = basis;
  $("mc-pin-status").textContent = "";
  drawPin();

  countUp($("mc-failure"), failureRate, rate, "mc|failure");
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
      countUp(dd, value, moneyFit, `mc|${label}`);
      return element("div", element("dt", label.includes("percentile") ? term(label, "percentile") : label), dd);
    }),
  );

  $("mc-chart-title").textContent = `Range of Outcomes for ${name} Over ${years} ${years === 1 ? "Year" : "Years"}`;
  // The same setup with one thing changed, on the same random months.
  const fitted = Math.min(prefix.length, years * 12);
  const crisisNotes = crisis ? notes.fund(crisis.start) : [];
  const compared = [
    crisis &&
      `Starting with the ${lower(crisis.name)}: ${rate.format(failureRate)} of runs ran out, against ${rate.format(randomStart.failureRate)} with a random start.` +
        (fitted < prefix.length ? ` Only the first ${fitted} of its ${prefix.length} months fit in ${years} ${years === 1 ? "year" : "years"}.` : ""),
    noFee && feeLine(fee, result, noFee),
    fixed && `With the guardrails, ${rate.format(failureRate)} of runs ran out, against ${rate.format(fixed.failureRate)} with the same amount rising every year.`,
  ].filter(Boolean);
  $("mc-compare").replaceChildren(...compared.map((text) => element("p", text)), Object.assign(element("p", "Each comparison reran the same random months with only that one thing changed, so the gap comes from that change, not from luck."), { className: "hint" }));
  $("mc-compare").hidden = !compared.length;

  const history = `the ${months.length} real monthly returns of ${name} between ${monthLabel(months[0].period)} and ${monthLabel(months.at(-1).period)}`;
  const { mean, sd } = logStats(input.monthlyReturns);
  const curve = `with the same average and spread as ${history} (monthly log returns: average ${pct.format(mean)}, standard deviation ${pct.format(sd)})`;
  const how = {
    month: `Method: historical bootstrap, one month at a time. Each run is built month by month, drawing every month at random (with replacement) from ${history}.`,
    block:
      `Method: historical block bootstrap (the stationary bootstrap). Each run takes stretches of ${history}, in their real order, going back to the first month after the last. ` +
      `Every month there is a 1-in-${BLOCK} chance of jumping to a new random month, so a stretch lasts ${BLOCK} months on average and bad months stay together, as they do in real crashes.`,
    normal: `Method: bell curve (normal distribution). Each month is made up at random from a bell curve ${curve}.`,
    t: `Method: fat-tailed curve (Student-t, 4 degrees of freedom). Each month is made up at random from a curve ${curve}. Extreme months come more often than on a bell curve.`,
  }[method];
  $("mc-method").textContent =
    `${how}${crisis ? ` Every run first replays the real fall of ${name} from ${longDate(crisis.start)} to ${longDate(crisis.end)} (${fitted < prefix.length ? `the first ${fitted} of its ${prefix.length} months` : `${fitted} ${fitted === 1 ? "month" : "months"}`}), then carries on as above.${crisisNotes.map((note) => ` In that fall, ${note}.`).join("")}` : ""} ` +
    `Withdrawals are taken monthly.${guarded ? " They follow the guardrails rule (after Guyton and Klinger): after a year the investments lost money, the yearly rise is skipped; then, if the withdrawal has grown above 120% of the starting rate (withdrawal divided by balance), it is cut by 10%, and if it has fallen below 80% of that rate, it is raised by 10%." : ""}${annualContribution > 0 ? ` Contributions of ${moneyFit.format(annualContribution)} a year are added ${contributeMonthly ? "monthly" : "at the start of each year"} and stay the same every year.` : ""}${fee > 0 ? ` A yearly fee of ${feeRate.format(fee)} is taken a little each month, on top of fund costs, which the prices already include.` : ""} ${inflation.real ? `Balances, withdrawals and contributions are in today's ${word} (inflation-adjusted).` : `Balances are in future ${word}, not adjusted for inflation.`} ` +
    `${currencyNotes(portfolio ? portfolio.holdings.map((h) => ({ label: h.ticker, tickers: [h.ticker] })) : [{ label: ticker, tickers: [ticker] }], inflation.real, inflation.country).map((note) => `${note} `).join("")}` +
    `The future can be worse than anything in this history, and a short history makes the result less reliable.`;

  drawCrises(crisisPoints, long[BENCHMARK].points, plan, notes);
  $("mc-spending-block").hidden = !(result.spending && annualWithdrawal > 0);
  $("mc-results").hidden = false;
  checkStale(); // the form may have changed while this ran
  requestAnimationFrame(() => requestAnimationFrame(() => $("mc-gauge").classList.remove("start")));
  if (!window.echarts) return say("The chart library didn't load, so the charts are missing. Check your connection and reload.", true);
  drawCone(current, kept());
  if (!$("mc-spending-block").hidden) drawSpending(result.spending, plan);
  drawTiming(ranOut, runs, years);
  drawRates(result, plan, runs, years);
  drawStarts(months, name, years, plan);
}

// A run's settings in words, in a fixed order: `value` for the kept-run comparison, `tag` (when worth showing) for the
// row of tags above the results.
function describe({ name, startValue, annualWithdrawal, growth, rule, annualContribution, contributeMonthly, fee, years, runs, crisis, basis }) {
  const start = moneyFit.format(startValue);
  const rise = growth ? `, rising ${rate.format(growth)}` : "";
  const out = moneyFit.format(annualWithdrawal);
  const into = moneyFit.format(annualContribution);
  const when = contributeMonthly ? "monthly" : "at the start of each year";
  const text = (id) => $(id).selectedOptions[0].text;
  return [
    { label: "Portfolio", value: name, tag: name },
    { label: "Starting amount", value: start, tag: `${start} start` },
    { label: "Withdrawal per year", value: annualWithdrawal ? `${out}${rise}` : "None", tag: annualWithdrawal ? `${out} a year out${rise}` : "No withdrawals" },
    { label: "Withdrawal rule", value: text("mc-rule"), tag: rule === "guardrails" && "Guardrails withdrawal rule" },
    { label: "Contribution per year", value: annualContribution ? `${into}, ${when}` : "None", tag: annualContribution > 0 && `${into} a year in, ${when}` },
    { label: "Fee per year", value: fee ? feeRate.format(fee) : "None", tag: fee > 0 && `${feeRate.format(fee)} yearly fee` },
    { label: "Years to simulate", value: yearsWord(years), tag: yearsWord(years) },
    { label: "Number of runs", value: runs.toLocaleString(), tag: `${runs.toLocaleString()} runs` },
    { label: "How months are drawn", value: text("mc-draw"), tag: text("mc-draw") },
    { label: "Start every run with", value: crisis ? crisis.name : "A random month", tag: crisis && `Starts with the ${lower(crisis.name)}` },
    { label: "Money", value: basis, tag: basis },
  ];
}

// Everything in the form a run depends on, as one string, including the chosen saved portfolio's recipe.
function formNow() {
  const portfolio = chosen();
  return JSON.stringify([portfolio ?? $("mc-ticker").value.trim().toUpperCase(), ...[...form.querySelectorAll("input:not(#mc-ticker), select")].map((el) => el.value)]);
}

// Results that no longer match the form fade under a note; running again or putting the old values back clears it.
const runAgain = Object.assign(element("button", "Run again"), { type: "button", className: "quiet" });
runAgain.addEventListener("click", () => {
  const button = form.querySelector("button[type=submit]");
  if (button.disabled) return; // a run is already going
  button.focus(); // the note and this button go once the new results are in
  form.requestSubmit();
});
function checkStale() {
  const stale = !$("mc-results").hidden && ranWith !== null && formNow() !== ranWith;
  if (stale === $("mc-results").classList.contains("stale")) return; // only a change is announced
  $("mc-results").classList.toggle("stale", stale);
  $("mc-stale").replaceChildren(...(stale ? ["These results are for the previous settings. Run again to update.", runAgain] : []));
}
// keyup and click too: picking a ticker suggestion fills the box without an input event.
for (const type of ["input", "change", "keyup", "click"]) form.addEventListener(type, checkStale);
addEventListener("portfolios-changed", checkStale);

// Keep for comparison: the kept run's figures beside the latest, and the settings that differ.
function drawPin() {
  const comparing = Boolean(pinned) && pinned !== current;
  $("mc-keep").hidden = pinned === current;
  $("mc-keep").textContent = comparing ? "Keep this run instead" : "Keep for comparison";
  $("mc-unpin").hidden = !pinned;
  $("mc-pin-compare").hidden = !comparing;
  if (!comparing) return;
  const row = (label, before, after) => element("tr", Object.assign(element("th", label), { scope: "row" }), element("td", before), element("td", after));
  const changed = current.settings.map((now, i) => [now, pinned.settings[i]]).filter(([now, then]) => now.value !== then.value);
  $("mc-pin-table").replaceChildren(
    element("thead", element("tr", element("td"), ...["Kept run", "This run"].map((h) => Object.assign(element("th", h), { scope: "col" })))),
    element(
      "tbody",
      row("Runs that ran out of money", rate.format(pinned.failureRate), rate.format(current.failureRate)),
      row("Median ending balance", pinned.unit.moneyFit.format(pinned.bands.p50.at(-1)), current.unit.moneyFit.format(current.bands.p50.at(-1))), // each in its own run's currency
      ...changed.map(([now, then]) => row(now.label, then.value, now.value)),
    ),
  );
  const same = pinned.draws === current.draws;
  const apart = kept() ? "" : " The two runs are in different currencies, so the kept run's lines aren't drawn on the chart.";
  $("mc-pin-hint").textContent = (changed.length
    ? same
      ? "Below the two results are the settings that changed. Both runs used the same random months, so the gap comes from those changes, not from luck."
      : "Below the two results are the settings that changed. The number of runs, how months are drawn or the price history differs, so the two runs drew different random months and part of the gap is luck."
    : same
      ? "No setting here changed, and both runs used the same random months."
      : "No setting here changed, but the price history behind the runs did, so they drew different random months and the gap is luck.") + apart;
}
// The kept run to draw on the cone: only when it is in the same currency as the run on screen, so both share an axis.
const kept = () => (pinned && pinned !== current && pinned.unit === current.unit ? pinned : null);
// Only a run kept and then changed draws kept lines on the cone; keeping or letting go of a run removes them.
function setPin(run) {
  const hadLines = Boolean(pinned) && pinned !== current;
  pinned = run;
  if (hadLines && window.echarts) drawCone(current, null);
  drawPin();
}
$("mc-keep").addEventListener("click", () => {
  setPin(current);
  $("mc-unpin").focus(); // the Keep button has just hidden itself
  $("mc-pin-status").textContent = "Kept. Change a setting and run again to compare. Until you stop comparing, each run reuses the kept run's random months.";
});
$("mc-unpin").addEventListener("click", () => {
  setPin(null);
  $("mc-keep").focus();
  $("mc-pin-status").textContent = "Stopped comparing. The next run draws new random months.";
});

// "VOO uses SPY before 9 Sep 2010 and VFINX before 29 Jan 1993": for each fund, the stand-ins that cover dates from `from` on.
function standInNotes(long, funds, from) {
  return funds.flatMap((t) => {
    const used = long[t].used.filter((u) => u.before > from);
    return used.length ? [`${t} uses ${and.format(used.map((u) => `${u.ticker} before ${longDate(u.before)}`))}`] : [];
  });
}

// Entries are [label, colour] for a filled square, or [label, colour, "dashed" or "dotted"] for a line.
function legend(list, entries) {
  list.replaceChildren(
    ...entries.map(([label, color, line]) => {
      const swatch = Object.assign(element("span"), { className: line ? "swatch mc-line" : "swatch" });
      if (line) swatch.style.borderTop = `2px ${line} ${color}`;
      else swatch.style.background = color;
      return element("li", swatch, label);
    }),
  );
}

// Guardrails: what runs withdrew each year (median and middle 80%) beside what the fixed rule would pay.
function drawSpending(spending, { annualWithdrawal, growth }) {
  const fixedPlan = spending.p50.map((_, i) => annualWithdrawal * (1 + growth) ** i);
  // The year a poor run falls furthest below the fixed rule's amount.
  const worst = spending.p10.reduce((w, v, i) => (v / fixedPlan[i] < spending.p10[w] / fixedPlan[w] ? i : w), 0);
  const tenth = term("10th percentile", "percentile");
  $("mc-spending-lead").replaceChildren(
    ...(spending.p10[worst] < fixedPlan[worst] * 0.995
      ? ["In a poor run (", tenth, `), spending in year ${worst + 1} is ${moneyFit.format(spending.p10[worst])}, against ${moneyFit.format(fixedPlan[worst])} with the same amount rising every year.`]
      : ["Even in a poor run (", tenth, "), spending never falls below what the same amount rising every year would pay."]),
  );
  legend($("mc-spending-legend"), [["Median run", MEDIAN], ["Middle 80% of runs", MIDDLE_80], ["Same amount, rising each year", PLAN]]);
  const chart = chartIn("mc-spending-chart");
  chart.resize(); // the block may have been hidden since the chart was made
  const base = frame(String, moneyFit);
  const rows = [["Strong run (90th percentile)", spending.p90], ["Median run", spending.p50], ["Poor run (10th percentile)", spending.p10], ["Same amount, rising each year", fixedPlan]];
  const band = (name, data, color) => ({ name, type: "line", stack: "spending", data, showSymbol: false, lineStyle: { opacity: 0 }, areaStyle: { color: color ?? "transparent", opacity: 0.92 }, emphasis: { disabled: true } });
  chart.setOption(
    {
      ...base,
      tooltip: {
        ...base.tooltip,
        formatter: (items) =>
          `<strong>Year ${items[0].dataIndex + 1}</strong>` +
          rows.map(([label, list]) => `<div style="display:flex;justify-content:space-between;gap:1.5rem"><span>${label}</span><span>${moneyFit.format(list[items[0].dataIndex])}</span></div>`).join(""),
      },
      xAxis: { ...base.xAxis, type: "category", boundaryGap: false, data: spending.p50.map((_, i) => i + 1) },
      yAxis: { ...base.yAxis, type: "value", min: 0, axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => moneyCompact.format(v) } },
      series: [
        band("10th percentile", spending.p10),
        band("10th to 90th", spending.p90.map((v, i) => v - spending.p10[i]), MIDDLE_80),
        { name: "Median run", type: "line", data: spending.p50, showSymbol: false, z: 4, lineStyle: { width: 2, color: MEDIAN }, itemStyle: { color: MEDIAN }, emphasis: { disabled: true } },
        { name: "Same amount, rising each year", type: "line", data: fixedPlan, showSymbol: false, z: 3, lineStyle: { width: 1.5, color: PLAN, type: "dashed" }, itemStyle: { color: PLAN }, emphasis: { disabled: true } },
      ],
    },
    true,
  );
}

// The failure rate at every first-year withdrawal, from each run's largest withdrawal that would just have lasted.
function drawRates(result, { startValue, annualWithdrawal, growth }, runs, years) {
  const sorted = result.perfectRates;
  $("mc-rates-chart").hidden = $("mc-rates-lead").hidden = !sorted; // an empty lead would leave a gap beside the title
  if (!sorted) {
    $("mc-rates-lead").textContent = "";
    $("mc-rates-hint").textContent = "This chart is hidden for these settings: it can only be worked out with no contributions and the “Same amount, rising each year” withdrawal rule.";
    return;
  }
  const yours = annualWithdrawal / startValue;
  const amount = (share) => `${rate.format(share)} of the starting amount (${moneyFit.format(share * startValue)})`;
  const [at5, at10] = [0.05, 0.1].map((p) => percentile(sorted, p));
  $("mc-rates-lead").textContent = `A first-year withdrawal of ${amount(at5)} ran out in 5% of runs, and ${amount(at10)} in 10%. Yours, ${rate.format(yours)} (${moneyFit.format(annualWithdrawal)}), ran out in ${rate.format(result.failureRate)}.`;
  $("mc-rates-hint").textContent =
    `From the same ${runs.toLocaleString()} runs: for each run, the largest first-year withdrawal that would just have lasted ${yearsWord(years)}` +
    `${growth > 0 ? `, rising ${rate.format(growth)} a year like yours` : ""}. The curve shows the share of runs that would have run out at each amount. The dashed line marks yours.`;
  // 1% to 8% of the starting amount in steps of 0.1%, widened to take in the user's own rate (up to 100%).
  const lo = Math.min(0.01, Math.floor(yours * 1000) / 1000);
  const hi = Math.min(1, Math.max(0.08, Math.ceil(yours * 1000) / 1000 + 0.005));
  const data = Array.from({ length: Math.round((hi - lo) * 1000) + 1 }, (_, i) => [lo + i / 1000, shareAtOrBelow(sorted, lo + i / 1000)]);
  const chart = chartIn("mc-rates-chart");
  chart.resize(); // the box may have been hidden since the chart was made
  const base = frame((x) => `First-year withdrawal of ${rate.format(x)} (${moneyFit.format(x * startValue)})`, rate);
  chart.setOption(
    {
      ...base,
      grid: { ...base.grid, top: 28 }, // room for the "Yours" label above the marker
      xAxis: { ...base.xAxis, type: "value", min: lo, max: hi, axisLabel: { ...base.xAxis.axisLabel, formatter: (v) => rate.format(v) } },
      yAxis: { ...base.yAxis, type: "value", min: 0, axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => rate.format(v) } },
      series: [
        {
          name: "Runs that ran out",
          type: "line",
          data,
          showSymbol: false,
          lineStyle: { width: 2, color: MEDIAN },
          itemStyle: { color: MEDIAN },
          areaStyle: { color: MIDDLE_80 },
          markLine: { silent: true, symbol: "none", lineStyle: { color: INK, type: "dashed", width: 1 }, label: { formatter: "Yours", position: "end", color: INK }, data: yours <= hi ? [{ xAxis: yours }] : [] },
        },
      ],
    },
    true,
  );
}

// Every real start date with the whole horizon ahead of it, followed through the real months in order.
function drawStarts(months, name, years, plan) {
  const span = years * 12;
  const starts = everyStart(months.map((m) => m.value), years, plan);
  $("mc-starts-chart").hidden = !starts.length;
  if (!starts.length) {
    $("mc-starts-lead").textContent = `${name} has ${months.length} whole months of history, fewer than the ${span} in ${yearsWord(years)}, so no real start date has the whole period ahead of it.`;
    $("mc-starts-hint").textContent = "Try fewer years to test every real start date.";
    return;
  }
  const count = starts.length.toLocaleString();
  const out = starts.filter((s) => s.ranOutAt !== null).length;
  // The worst start: the one that ran out soonest, or if none did, the one that ended lowest.
  const worst = starts.indexOf(starts.toSorted((a, b) => (a.ranOutAt ?? Infinity) - (b.ranOutAt ?? Infinity) || a.final - b.final)[0]);
  const month = (i) => monthLabel(months[i].period);
  $("mc-starts-lead").textContent =
    `${out ? `${out.toLocaleString()} of ${count}` : `None of the ${count}`} real start ${starts.length === 1 ? "month" : "months"} ran out of money within ${yearsWord(years)}. ` +
    `The worst start was ${month(worst)}: ${starts[worst].ranOutAt === null ? `it ended with ${moneyFit.format(starts[worst].final)}` : `the money ran out in ${month(worst + starts[worst].ranOutAt)}`}.`;
  const apart = Math.floor(months.length / span);
  $("mc-starts-hint").textContent =
    `Each start follows the real monthly returns of ${name} in their real order for ${yearsWord(years)}, with the same ${planWords(plan)} as above. ` +
    (starts.length > 1 ? `These ${count} periods overlap: starts a month apart share all but one month, so they are far from ${count} separate tests. ${name}'s ${months.length} months hold only ${apart} ${years}-year ${apart === 1 ? "period that doesn't" : "periods that don't"} overlap.` : "");
  const chart = chartIn("mc-starts-chart");
  chart.resize(); // the box may have been hidden since the chart was made
  const base = frame((period) => `Starting ${monthLabel(period)}`, { format: (v) => (v > 0 ? moneyFit.format(v) : "Ran out") });
  chart.setOption(
    {
      ...base,
      xAxis: { ...base.xAxis, type: "category", data: starts.map((_, i) => months[i].period), axisLabel: { ...base.xAxis.axisLabel, formatter: (period) => monthLabel(period) } },
      yAxis: { ...base.yAxis, type: "value", min: 0, axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => moneyCompact.format(v) } },
      series: [{ name: "Ending balance", type: "line", data: starts.map((s) => s.final), showSymbol: starts.length === 1, lineStyle: { width: 2, color: MEDIAN }, itemStyle: { color: MEDIAN } }],
    },
    true,
  );
}

// "withdrawals, contributions, and fee": the parts of the plan in use.
const planWords = ({ annualContribution, fee }) => and.format(["withdrawals", annualContribution > 0 && "contributions", fee > 0 && "fee"].filter(Boolean));

// "A 1% yearly fee raises the share of runs that ran out from 6% to 14% and cuts the median ending balance by $410,000."
// With the same months, a fee can only lower every run's balance, so the share can only rise and the median only fall.
function feeLine(fee, charged, free) {
  const [withFee, without] = [rate.format(charged.failureRate), rate.format(free.failureRate)];
  const cut = free.bands.p50.at(-1) - charged.bands.p50.at(-1);
  return (
    `A ${feeRate.format(fee)} yearly fee ` +
    (withFee === without ? `leaves the share of runs that ran out at ${withFee}` : `raises the share of runs that ran out from ${without} to ${withFee}`) +
    (cut >= 1 ? ` and cuts the median ending balance by ${moneyFit.format(cut)}.` : ".")
  );
}

// When the failing runs ran out: a sentence and the share of all runs out of money by each year.
function drawTiming(ranOut, runs, years) {
  const when = failureYears(ranOut);
  $("mc-out-chart").hidden = !when;
  if (!when) {
    $("mc-timing").textContent = "No run ran out of money.";
    return;
  }
  $("mc-timing").textContent =
    `Runs started running out in year ${when.first}. By year ${when.half}, half of the runs that ran out had done so.` +
    (when.half > years / 2 ? ` So more than half ran out in the second half of the ${years} years, after many years of withdrawals.` : "");
  const chart = chartIn("mc-out-chart");
  chart.resize(); // the box may have been hidden since the chart was made
  const base = frame((year) => (Number(year) === 0 ? "Start" : `By the end of year ${year}`), rate);
  chart.setOption(
    {
      ...base,
      xAxis: { ...base.xAxis, type: "category", boundaryGap: false, data: ranOut.map((_, year) => year) },
      yAxis: { ...base.yAxis, type: "value", min: 0, axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => rate.format(v) } },
      series: [{ name: "Runs out of money", type: "line", data: ranOut.map((count) => count / runs), showSymbol: false, lineStyle: { width: 2, color: MEDIAN }, itemStyle: { color: MEDIAN }, areaStyle: { color: MIDDLE_80 } }],
    },
    true,
  );
}

// `kept` is a run kept for comparison: its median and 10th percentile are drawn as dashed and dotted lines.
function drawCone({ bands, paths, startValue }, kept) {
  const runsThat = (list, what) => (list.length ? [[`${list.length} sample ${list.length === 1 ? "run" : "runs"} that ${what}`, what === "lasted" ? SAMPLE : RAN_OUT]] : []);
  const ranOut = (path) => path.at(-1) === 0; // a run that runs out stays at exactly 0
  legend($("mc-legend"), [
    ["Median run", MEDIAN],
    ["Middle 50% of runs", MIDDLE_50],
    ["Middle 80% of runs", MIDDLE_80],
    ...runsThat(paths.filter((p) => !ranOut(p)), "lasted"),
    ...runsThat(paths.filter(ranOut), "ran out"),
    ...(kept ? [["Kept run's median", INK, "dashed"], ["Kept run's 10th percentile", INK, "dotted"]] : []),
  ]);
  const years = bands.p50.length - 1;
  const keptBands = kept && { p50: kept.bands.p50.slice(0, years + 1), p10: kept.bands.p10.slice(0, years + 1) };
  const every = [1, 2, 5, 10].find((step) => years / step <= 8); // "Now, 5 yrs, 10 yrs": at most about 8 labels
  const chart = chartIn("mc-chart");
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
    lineStyle: { width: 1, color: ranOut(data) ? RAN_OUT : SAMPLE },
    emphasis: { disabled: true },
    animationDuration: 1100,
    animationDelay: i * 12,
    tooltip: { show: false },
  });
  const keptLine = (name, data, type) => ({ name, type: "line", data, showSymbol: false, silent: true, z: 5, lineStyle: { width: 1.5, color: INK, type }, emphasis: { disabled: true }, animationDelay: 1100 });
  const rows = [
    ["Strong outcome (90th percentile)", bands.p90],
    ["75th percentile", bands.p75],
    ["Median", bands.p50],
    ["25th percentile", bands.p25],
    ["Poor outcome (10th percentile)", bands.p10],
    ...(kept ? [["Kept run's median", keptBands.p50], ["Kept run's 10th percentile", keptBands.p10]] : []),
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
            rows
              .filter(([, list]) => year < list.length) // a kept run with fewer years stops early
              .map(([label, list]) => `<div style="display:flex;justify-content:space-between;gap:1.5rem"><span>${label}</span><span>${moneyFit.format(list[year])}</span></div>`)
              .join("")
          );
        },
      },
      xAxis: {
        ...base.xAxis,
        type: "category",
        boundaryGap: false,
        data: bands.p50.map((_, year) => year),
        name: "Years from now",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: base.xAxis.axisLabel.color, fontSize: 12 },
        axisLabel: { ...base.xAxis.axisLabel, interval: (i) => i % every === 0, formatter: (year) => (Number(year) === 0 ? "Now" : `${year} ${Number(year) === 1 ? "yr" : "yrs"}`) },
      },
      // Capped just above the 90th percentile (and the kept median): a few wild sample runs would otherwise squash the cone.
      // The 90th percentile starts at the starting amount, so the starting-amount line always fits under the cap.
      yAxis: { ...base.yAxis, type: "value", min: 0, max: Number((Math.max(...bands.p90, ...(keptBands?.p50 ?? [])) * 1.1).toPrecision(2)), axisLabel: { ...base.yAxis.axisLabel, showMaxLabel: false, formatter: (v) => moneyCompact.format(v) } },
      series: [
        ...paths.map(sample),
        layer("10th percentile", bands.p10),
        layer("10th to 25th", gap(bands.p25, bands.p10), MIDDLE_80),
        layer("25th to 75th", gap(bands.p75, bands.p25), MIDDLE_50),
        layer("75th to 90th", gap(bands.p90, bands.p75), MIDDLE_80),
        {
          name: "Median",
          type: "line",
          data: bands.p50,
          showSymbol: false,
          z: 4,
          lineStyle: { width: 2, color: MEDIAN },
          itemStyle: { color: MEDIAN },
          emphasis: { disabled: true },
          animationDelay: 1100,
          // Where the balance began, so runs that fall below it stand out.
          markLine: { silent: true, symbol: "none", lineStyle: { color: PLAN, type: "dashed", width: 1 }, label: { formatter: "Starting amount", position: "insideStartTop", color: PLAN }, data: [{ yAxis: startValue }] },
        },
        ...(kept ? [keptLine("Kept run's median", keptBands.p50, "dashed"), keptLine("Kept run's 10th percentile", keptBands.p10, "dotted")] : []),
      ],
    },
    true,
  );
}

// A table cell with a main line and smaller lines under it.
const cell = (main, ...details) => element("td", main, ...details.map((detail) => element("small", detail)));
// A fall or a run that ran out, in loss red. The amounts left stay in ink.
const lossText = (text, isLoss = true) => Object.assign(element("span", text), { className: isLoss ? "loss" : "" });

// `points` and `benchmark` include stand-in history; `notes` says where (see standInNotes) and which stand-ins didn't load.
function drawCrises(points, benchmark, plan, notes) {
  const last = points.at(-1).date;
  const heads = ["Crisis", "Lowest point", `${BENCHMARK}'s lowest point`, "Back to its starting level", `With your ${planWords(plan)}`];
  let marked = false; // whether any row uses a stand-in
  crisisRows = [];
  const rows = CRISES.map((crisis) => {
    const test = crisisTest(points, crisis);
    const used = test ? notes.fund(crisis.start) : [];
    const spy = crisisTest(benchmark, crisis);
    const spyUsed = test && spy ? notes.benchmark(crisis.start) : [];
    marked ||= used.length + spyUsed.length > 0;
    const title = Object.assign(element("th", crisis.name, ...[`${longDate(crisis.start)} to ${longDate(crisis.end)}`, ...used].map((line) => element("small", line))), { scope: "row" });
    if (!test) {
      crisisRows.push([crisis.name, crisis.start, crisis.end, `No data: the history starts on ${points[0].date}`]);
      // Never silently skip: say why this crisis can't be measured.
      const why = element("td", `No data. This portfolio's history starts on ${longDate(points[0].date)}, after this crisis began.`);
      why.colSpan = heads.length - 1;
      return element("tr", title, why);
    }
    const yearsToRecover = test.recovered && ((Date.parse(test.recovered) - Date.parse(crisis.start)) / (365.25 * 864e5)).toFixed(1);
    const run = historicalRun(points, crisis.start, plan);
    crisisRows.push([crisis.name, crisis.start, crisis.end, test.lowest, test.lowDate, spy?.lowest ?? null, spy?.lowDate ?? null, test.recovered ?? null, run.ranOutIn ?? null, run.ranOutIn ? 0 : run.final]);
    return element(
      "tr",
      title,
      cell(lossText(pct.format(test.lowest), test.lowest < 0), `on ${longDate(test.lowDate)}`),
      spy ? cell(lossText(pct.format(spy.lowest), spy.lowest < 0), `on ${longDate(spy.lowDate)}`, ...spyUsed) : cell("No data", `${BENCHMARK}'s history starts on ${longDate(benchmark[0].date)}`),
      test.recovered ? cell(longDate(test.recovered), `${yearsToRecover} years after the start`) : cell("Not yet", `as of ${longDate(last)}`),
      run.ranOutIn ? cell(lossText(`Ran out in ${monthLabel(run.ranOutIn)}`)) : cell(`${moneyFit.format(run.final)} left`, `on ${longDate(last)}`),
    );
  });
  $("mc-crises").replaceChildren(
    element("thead", element("tr", ...heads.map((h) => Object.assign(element("th", h), { scope: "col" })))),
    element("tbody", ...rows),
  );
  const said = [
    marked && "Where a row says a fund uses another, the older fund follows the same index and its returns stand in before the young fund's first day, so the crisis can still be measured.",
    notes.missing.length && `${and.format(notes.missing)} didn't load, so ${notes.missing.length === 1 ? "it" : "they"} couldn't stand in for younger funds here.`,
  ].filter(Boolean);
  $("mc-crises-note").textContent = said.join(" ");
  $("mc-crises-note").hidden = !said.length;
}

let crisisRows = []; // the crises table as figures, for the CSV download

// Every box and menu of the form, by id without "mc-", plus the chosen portfolio's recipe: what a share link holds.
function linkPairs(portfolio) {
  return [
    ...[...form.querySelectorAll("input[id], select[id]")].map((box) => [box.id.replace(/^mc-/, ""), box.value]),
    ...(portfolio ? [["pf", recipe(portfolio)]] : []),
  ];
}

// Copy link: the settings of the run on screen (even if the form has changed since) and its random seed.
$("mc-link").addEventListener("click", () => copyLink("monte-carlo", [...current.link, ["seed", String(current.seed)]], $("mc-share-status")));

// Download CSV: the yearly percentile balances, then the past-crises table, unrounded.
$("mc-csv").addEventListener("click", () => {
  const { bands, history } = current;
  downloadCsv([
    ["Year", "10th percentile", "25th percentile", "Median", "75th percentile", "90th percentile"],
    ...bands.p50.map((_, year) => [year, ...["p10", "p25", "p50", "p75", "p90"].map((k) => bands[k][year])]),
    [],
    ["Crisis", "Start", "End", "Lowest point (fraction)", "Lowest on", `${BENCHMARK}'s lowest point (fraction)`, `${BENCHMARK}'s lowest on`, "Back to its starting level on", "Ran out in", "Left at the end"],
    ...crisisRows,
  ], `monte-carlo-${history[0]}-to-${history[1]}-${basisTag()}.csv`);
});

// Opening a share link (or the example card): fill in every setting it names, then run with its seed.
function openLink() {
  const link = linkFor("monte-carlo");
  if (!link) return;
  clearLink("monte-carlo");
  const { found: [first], bad } = linkedPortfolios(link);
  linked = first && !first.saved ? first.portfolio : null;
  listPortfolios();
  for (const box of form.querySelectorAll("input[id], select[id]")) {
    const value = link.get(box.id.replace(/^mc-/, ""));
    if (value === null || box.id === "mc-portfolio") continue;
    if (box.tagName === "SELECT" && ![...box.options].some((o) => o.value === value)) continue; // run() checks the boxes
    box.value = value;
    if (box.tagName === "INPUT") box.dispatchEvent(new Event("input", { bubbles: true })); // their ticks and read-backs
  }
  $("mc-portfolio").value = first ? first.portfolio.name : "";
  $("mc-ticker-field").hidden = Boolean(first);
  showFormUnit();
  const seed = link.get("seed");
  linkSeed = /^\d{1,10}$/.test(seed ?? "") ? Number(seed) >>> 0 : null;
  offerSave($("mc-linked"), linked ? [linked] : [], () => { linked = null; listPortfolios(); });
  if (bad) $("mc-linked").append(element("span", "The portfolio in the link couldn't be read, so a single ticker is used instead."));
  form.requestSubmit();
}
addEventListener("hashchange", openLink);

// The example shown until the first run. Its lesson was checked against the result the link opens.
exampleCards($("mc-examples"), "monte-carlo", [{
  title: "The 4% rule",
  lesson: "Take $40,000 a year, rising 3% a year, from $1,000,000 in US stocks (SPY) for 30 years. Most runs last, but some run out of money.",
  link: [["portfolio", ""], ["ticker", "SPY"], ["start", "1000000"], ["withdrawal", "40000"], ["growth", "3"], ["rule", "fixed"], ["contribution", "0"], ["fee", "0"], ["years", "30"], ["runs", "10000"], ["draw", "month"], ["begin", ""], ["seed", "4"]],
}]);
openLink();

addEventListener("inflation-changed", () => { if (!$("mc-results").hidden) form.requestSubmit(); });
