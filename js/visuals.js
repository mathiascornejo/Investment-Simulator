// Small hand-drawn visuals shared by the tabs: sparklines, asset-class icons, count-up figures,
// the survival gauge, sliding segmented controls and the undo toast. No chart library needed.
import { show } from "./format.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (viewBox, markup) => {
  const node = document.createElementNS(SVG, "svg");
  node.setAttribute("viewBox", viewBox);
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = markup; // only ever our own constant markup and numbers
  return node;
};
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A tiny line of a price series. Thins long series to ~60 points: it only has to show the shape.
export function sparkline(points, color, width = 48, height = 16) {
  const step = Math.max(1, Math.floor(points.length / 60));
  const values = points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p) => p.adjClose);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1 || 1)) * (width - 2) + 1).toFixed(1)} ${(height - 1 - ((v - min) / range) * (height - 2)).toFixed(1)}`)
    .join("");
  const node = svg(`0 0 ${width} ${height}`, `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`);
  node.classList.add("spark");
  return node;
}

// Asset classes for the named tickers. Anything else gets the neutral "listed security" icon
// rather than a guess: the price source doesn't say what a ticker is.
const CLASS_OF = {
  bonds: ["BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG"],
  gold: ["GLD", "SLV"],
  commodities: ["USO"],
  property: ["VNQ"],
  international: ["VXUS", "VEA", "VWO", "EFA"],
  cash: ["CASH", "TBILL91", "TBILL182", "TBILL364", "USTBILL"],
  inflation: ["INFLATION"],
  stocks: ["SPY", "VOO", "VTI", "QQQ", "IWM", "DIA", "XLK", "XLF", "XLE", "XLV", "VFINX", "VTSAX", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "BRK-B", "JPM", "JNJ", "XOM", "KO"],
};
const ICONS = {
  stocks: ["Stocks", '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],
  bonds: ["Bonds", '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>'],
  gold: ["Precious metals", '<path d="M3 18l3-7h12l3 7z"/><path d="M8 11l2-5h4l2 5"/>'],
  commodities: ["Commodities", '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>'],
  property: ["Real estate", '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'],
  international: ["International stocks", '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
  fund: ["Fund", '<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1 1 9 3.5"/>'],
  portfolio: ["Saved portfolio", '<path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="m2 13 10 5 10-5"/>'],
  cash: ["Cash", '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'],
  inflation: ["Consumer prices", '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>'],
  tab: ["Tab", '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'],
  other: ["Listed security", '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'],
};
// Name clues for tickers not in the list above (Yahoo gives the fund's name, e.g. "iShares Gold Trust").
const NAME_CLUES = [
  ["bonds", /\b(bond|treasury|aggregate|fixed income|corporate debt)\b/i],
  ["gold", /\b(gold|silver|platinum|palladium|precious)\b/i],
  ["commodities", /\b(commodit|crude|oil|natural gas|agricult)/i],
  ["property", /\b(real estate|reit|property|properties)\b/i],
  ["international", /\b(international|emerging|global|world|europe|asia|japan|china|ex-us|ex us)\b/i],
];
// type is Yahoo's quoteType: a fund of unknown kind gets the fund icon, a company the stocks icon.
export function assetClass(ticker, name = "", type = "") {
  const known = Object.keys(CLASS_OF).find((k) => CLASS_OF[k].includes(ticker));
  if (known) return known;
  const clue = NAME_CLUES.find(([, re]) => re.test(name));
  if (clue && type !== "EQUITY") return clue[0];
  return type === "EQUITY" ? "stocks" : type === "ETF" || type === "MUTUALFUND" ? "fund" : "other";
}

export function glyph(kind) {
  const [title, paths] = ICONS[kind] ?? ICONS.other;
  const node = svg("0 0 24 24", paths);
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "1.8");
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("stroke-linejoin", "round");
  node.classList.add("glyph", `glyph-${kind in ICONS ? kind : "other"}`);
  node.removeAttribute("aria-hidden");
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", title);
  return node;
}

// Rolls a figure to `value`. With a `key` (what the figure is, such as "bt|SPY|cagr"), it rolls from the value last
// shown under that key, not from zero, and a figure whose shown text changed gets a brief wash. Reduced motion: the
// final text at once, no wash.
const lastShown = new Map(); // key -> value
const rolling = new WeakMap(); // node -> start time of its latest roll, so an older roll stops writing
export function countUp(node, value, format, key) {
  const before = key === undefined ? undefined : lastShown.get(key);
  if (key !== undefined) lastShown.set(key, value);
  const text = show(value, format);
  const still = reducedMotion();
  if (before !== undefined && show(before, format) !== text && !still) {
    node.classList.remove("moved");
    void node.offsetWidth; // restarts the wash on a figure that is reused
    node.classList.add("moved");
    node.addEventListener("animationend", () => node.classList.remove("moved"), { once: true });
  }
  const from = Number.isFinite(before) ? before : 0;
  if (!Number.isFinite(value) || still || format.format(from) === text) {
    rolling.delete(node);
    node.textContent = text;
    return;
  }
  const started = performance.now();
  rolling.set(node, started);
  const step = (now) => {
    if (rolling.get(node) !== started) return;
    const k = Math.min(1, (now - started) / 700);
    node.textContent = format.format(from + (value - from) * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  node.textContent = format.format(from);
  requestAnimationFrame(step);
}

// A half dial: how much of the arc is filled is the share of runs that lasted the whole horizon.
export function gauge(share) {
  const angle = -90 + 180 * share;
  return svg(
    "0 0 200 112",
    `<defs><linearGradient id="gauge-fill"><stop offset="0" stop-color="var(--loss)"/><stop offset=".55" stop-color="#d9a21b"/><stop offset="1" stop-color="var(--gain)"/></linearGradient></defs>
     <path d="M20 100A80 80 0 0 1 180 100" fill="none" stroke="var(--line)" stroke-width="14" stroke-linecap="round"/>
     <path d="M20 100A80 80 0 0 1 180 100" fill="none" stroke="url(#gauge-fill)" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="${(share * 100).toFixed(2)} 100"/>
     <g class="needle" style="--angle:${angle.toFixed(1)}deg"><path d="M100 100V34" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="var(--ink)"/></g>`,
  );
}

// Segmented controls get a white pill that glides to the pressed button. It follows aria-pressed,
// so the tabs' own code only has to keep setting that attribute.
export function slidingPill(group) {
  const pill = Object.assign(document.createElement("span"), { className: "pill" });
  pill.setAttribute("aria-hidden", "true");
  group.prepend(pill);
  const place = () => {
    if (pill.parentNode !== group) group.prepend(pill); // the buttons were redrawn with replaceChildren
    const on = group.querySelector('[aria-pressed="true"]');
    pill.hidden = !on || !group.offsetWidth;
    if (pill.hidden) return;
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
    pill.style.width = `${on.offsetWidth}px`;
  };
  new MutationObserver(place).observe(group, { attributes: true, subtree: true, childList: true, attributeFilter: ["aria-pressed"] });
  new ResizeObserver(place).observe(group);
}

// One toast at a time, bottom of the screen, with an optional action button (Undo).
let toastTimer;
export function toast(message, action, onAction) {
  let node = document.getElementById("toast");
  if (!node) {
    node = Object.assign(document.createElement("div"), { id: "toast", className: "toast" });
    node.setAttribute("role", "status");
    document.body.append(node);
  }
  const text = document.createElement("span");
  text.textContent = message;
  node.replaceChildren(text);
  if (action) {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: action });
    button.addEventListener("click", () => {
      node.classList.remove("show");
      onAction();
    });
    node.append(button);
  }
  requestAnimationFrame(() => node.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 6000);
}

// A "Try again" button after a load error in a status line. It runs `again`, which loads only what failed:
// prices that did load are kept for the visit. The button goes with the message, so focus moves to the status
// line, which then says what is happening.
export function tryAgain(node, again) {
  const button = Object.assign(document.createElement("button"), { type: "button", className: "quiet try-again", textContent: "Try again" });
  button.addEventListener("click", () => {
    node.tabIndex = -1;
    node.focus();
    again();
  });
  node.append(" ", button);
}
