// Plain-English definitions. term("Sharpe ratio") returns the label with a dotted underline;
// hovering or focusing it shows the definition in one shared popover that sits in the top layer,
// so scrolling tables and chart panels never clip it.
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
  rebalancing: ["Trading back to the target weights after prices have moved them apart.", null],
  percentile: ["The 10th percentile is the result that 10% of runs ended below; the median is the middle run.", null],
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

function open(button) {
  const [text, formula] = DEFINITIONS[button.dataset.term];
  pop.replaceChildren(element("strong", button.textContent), element("p", text), ...(formula ? [element("code", formula)] : []));
  pop.showPopover();
  const at = button.getBoundingClientRect();
  const left = Math.min(Math.max(8, at.left - 12), innerWidth - pop.offsetWidth - 8);
  const above = at.top - pop.offsetHeight - 10;
  pop.style.left = `${left}px`;
  pop.style.top = `${above > 8 ? above : at.bottom + 10}px`;
  pop.style.transformOrigin = `${at.left - left + 12}px ${above > 8 ? "100%" : "0"}`;
}
const close = () => pop.matches(":popover-open") && pop.hidePopover();

// Static headings in index.html carry data-term already; give them the same treatment.
for (const node of document.querySelectorAll("[data-term]:not(button)")) {
  const button = term(node.textContent, node.dataset.term);
  node.replaceWith(button);
}
document.addEventListener("pointerover", (e) => { const b = e.target.closest?.(".term"); if (b) open(b); });
document.addEventListener("pointerout", (e) => { if (e.target.closest?.(".term")) close(); });
document.addEventListener("focusin", (e) => (e.target.matches(".term") ? open(e.target) : close()));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
addEventListener("scroll", close, { passive: true });
