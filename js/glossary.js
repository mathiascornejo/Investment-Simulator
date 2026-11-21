// Plain-English definitions. term("Sharpe ratio") returns the label with a dotted underline;
// hovering, focusing or tapping it shows the definition in one shared popover that sits in the top layer,
// so scrolling tables and chart panels never clip it. The same definitions fill the Glossary page.
import { element } from "./format.js";

const DEFINITIONS = {
  "total return": ["How much the value changed over the period, with dividends reinvested.", "end value ÷ start value − 1"],
  "annualised return": ["The steady yearly growth rate that would turn the start value into the end value. Not shown for periods under a year.", "(end ÷ start)^(1 ÷ years) − 1"],
  volatility: ["How much returns swing around their average, scaled to a year. Higher means a bumpier ride.", "st. dev. of daily returns × √252"],
  "maximum drawdown": ["The biggest fall from a high point to a later low, before a new high.", "lowest (value ÷ previous peak) − 1"],
  "best year": ["The return in the best full calendar year inside the period.", null],
  "worst year": ["The return in the worst full calendar year inside the period.", null],
  "sharpe ratio": ["Return earned per unit of volatility. Higher means more reward for the ups and downs. Here the risk-free rate is taken as 0%.", "annualised mean return ÷ volatility"],
  "sortino ratio": ["Like the Sharpe ratio, but only the downward swings count as risk.", "annualised mean return ÷ downside deviation"],
  beta: ["How much it tends to move when SPY moves 1%. 1 means in step, 0.5 half as much, above 1 more.", "covariance with SPY ÷ variance of SPY"],
  drawdown: ["How far the value sits below its previous high on each day. 0% means it is at a new high.", null],
  correlation: ["How closely two holdings' daily returns move together: 1 is in step, 0 unrelated, −1 opposite. Lower numbers mean more diversification.", null],
  "share of risk": ["How much of the portfolio's ups and downs come from this holding, at its target weight. The shares add up to 100%. A holding that tends to move further than the portfolio as a whole causes more than its share of the money.", "weight × covariance with the portfolio ÷ portfolio variance"],
  "effective number of holdings": ["How many equal-sized holdings the weights are worth. Ten holdings with one at 90% count as only about 1.2.", "1 ÷ sum of squared weights"],
  "diversification ratio": ["The holdings' own volatility, averaged by weight, divided by the portfolio's. 1 means mixing them calmed nothing; higher means a calmer ride than the parts.", "weighted average volatility ÷ portfolio volatility"],
  rebalancing: ["Trading back to the target weights after prices have moved them apart.", null],
  percentile: ["The 10th percentile is the result that 10% of runs ended below; the median is the middle run.", null],
  "nominal return": ["The return in the money of each day, with no allowance for rising prices. Every figure is nominal unless Inflation-adjusted is switched on.", null],
  "real return": ["The return after inflation: the change in what the money can buy. With Inflation-adjusted on, every price is divided by the chosen country's consumer price index, so every figure on the site is real, in today's money.", "(1 + nominal return) ÷ (1 + inflation) − 1"],
  "consumer price index": ["What a typical basket of goods and services costs; its rise is inflation. The US uses FRED's CPI-U, monthly. Other countries use the World Bank's index, one figure a year. Days between readings are filled in on a straight line, and days after the latest reading reuse it. Type INFLATION in a ticker box to compare against it.", "inflation = index now ÷ index then − 1"],
  bootstrap: ["How the Monte Carlo runs are built from history. One month at a time: each month of a run is drawn at random, with replacement, from the portfolio's own past monthly returns, so a month can come up more than once. In blocks: runs take stretches of real months in order, about a year each on average, so bad months stay together.", null],
  "ran-out-of-money rate": ["The share of Monte Carlo runs whose balance reached zero before the end of the chosen number of years, with the withdrawals you chose.", "runs that reached zero ÷ all runs"],
  median: ["The middle result: half the runs ended above it and half below. Unlike an average, a few huge runs can't pull it up.", null],
  "drift band": ["A rebalancing rule: trade back to the target weights only when a holding has drifted more than the set number of percentage points from its target. It is checked every trading day.", "rebalance when |holding's share − target| > band"],
  "log scale": ["A chart scale where each step up is the same percentage rise, not the same dollar amount. A fall from $20,000 to $10,000 looks as big as one from $2,000 to $1,000, so early and late years compare fairly.", null],
  "price return": ["The change in price alone, leaving out dividends. The simulator uses total return instead, except for Philippine stocks, whose prices leave out dividends and splits.", "end price ÷ start price − 1"],
  "sequence-of-returns risk": ["The risk that bad years come early while money is being taken out. Selling after a fall locks in the loss, so the same returns in a different order can last or run out. The Monte Carlo crises table and its every-start-date chart show it.", null],
};

export function term(label, key = label) {
  const found = DEFINITIONS[key.toLowerCase().replace(/ \(.*\)$/, "").replace(/ vs .*$/, "")];
  if (!found) return document.createTextNode(label);
  const button = Object.assign(element("button", label), { type: "button", className: "term" });
  button.dataset.term = key.toLowerCase().replace(/ \(.*\)$/, "").replace(/ vs .*$/, "");
  button.setAttribute("aria-describedby", "glossary-pop");
  return button;
}

const pop = Object.assign(element("div"), { id: "glossary-pop", className: "pop" });
pop.setAttribute("role", "tooltip");
pop.popover = "manual";
document.body.append(pop);

// Above the word, or under it when there is no room. below: under it first, because a finger would hide it above.
function open(button, below = false) {
  const [text, formula] = DEFINITIONS[button.dataset.term];
  pop.replaceChildren(element("strong", button.textContent), element("p", text), ...(formula ? [element("code", formula)] : []));
  pop.showPopover();
  const at = button.getBoundingClientRect();
  const left = Math.min(Math.max(8, at.left - 12), innerWidth - pop.offsetWidth - 8);
  const above = at.top - pop.offsetHeight - 10;
  const up = below ? at.bottom + 10 + pop.offsetHeight > innerHeight - 8 && above > 8 : above > 8;
  pop.style.left = `${left}px`;
  pop.style.top = `${up ? above : at.bottom + 10}px`;
  pop.style.transformOrigin = `${at.left - left + 12}px ${up ? "100%" : "0"}`;
}
let pinned = null; // the word a tap opened
const close = () => { pinned = null; if (pop.matches(":popover-open")) pop.hidePopover(); };

// Static headings in index.html carry data-term already; give them the same treatment.
for (const node of document.querySelectorAll("[data-term]:not(button)")) {
  const button = term(node.textContent, node.dataset.term);
  node.replaceWith(button);
}
// Mouse and keyboard: hovering or focusing a word shows its definition. Touch has no hover, and iPhone buttons
// don't take focus, so a tap opens it and keeps it open; tapping the word again, tapping elsewhere or scrolling closes it.
let touch = false; // the last press was a finger
document.addEventListener("pointerdown", (e) => {
  touch = e.pointerType === "touch";
  if (pinned && !e.target.closest?.(".term")) close();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".term");
  if (!b || !touch) return;
  if (pinned === b) return close();
  open(b, true);
  pinned = b;
});
document.addEventListener("pointerover", (e) => { const b = e.pointerType !== "touch" && e.target.closest?.(".term"); if (b) open(b); });
document.addEventListener("pointerout", (e) => { if (e.pointerType !== "touch" && e.target.closest?.(".term")) close(); });
document.addEventListener("focusin", (e) => {
  if (touch) return; // a tap is handled on click
  if (e.target.matches(".term")) open(e.target);
  else close();
});
document.addEventListener("keydown", (e) => { touch = false; if (e.key === "Escape") close(); });
addEventListener("scroll", close, { passive: true, capture: true }); // capture: scrolling a table counts too

// The Glossary page (#glossary): every definition with its formula, a filter box, and a direct link to each
// entry, such as #glossary/sharpe-ratio.
const list = document.getElementById("glossary-list");
if (list) {
  const filter = document.getElementById("glossary-filter");
  const count = document.getElementById("glossary-count");
  const slug = (key) => key.replace(/[^a-z0-9]+/g, "-");
  const entries = Object.keys(DEFINITIONS).sort().map((key) => {
    const [text, formula] = DEFINITIONS[key];
    const link = Object.assign(element("a", key[0].toUpperCase() + key.slice(1)), { href: `#glossary/${slug(key)}` });
    const entry = element("div", element("dt", link), element("dd", text), ...(formula ? [element("dd", element("code", formula))] : []));
    entry.id = `term-${slug(key)}`;
    return entry;
  });
  list.replaceChildren(...entries);
  filter.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    for (const entry of entries) entry.hidden = Boolean(q) && !entry.textContent.toLowerCase().includes(q);
    const shown = entries.filter((entry) => !entry.hidden).length;
    count.textContent = !q ? "" : shown ? `${shown} of ${entries.length} terms` : `No term matches “${filter.value.trim()}”.`;
  });
  // A direct link scrolls to its entry, marks it for a moment and focuses its link.
  const goTo = () => {
    const [page, name] = location.hash.slice(1).split("/");
    const entry = page === "glossary" && name && document.getElementById(`term-${name}`);
    if (!entry) return;
    if (entry.hidden) { filter.value = ""; filter.dispatchEvent(new Event("input")); }
    entry.classList.remove("lit");
    void entry.offsetWidth; // restarts the fade when the same entry is linked again
    entry.classList.add("lit");
    entry.querySelector("a").focus({ preventScroll: true });
    entry.scrollIntoView({ block: "start" });
  };
  addEventListener("hashchange", goTo); // after app.js's own handler, which scrolls to the top
  goTo();
}
