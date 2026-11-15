// Ticker search inside a text box, modelled on the King Crab House search: suggestions drop down
// under the box as you type; ↑ ↓ Enter pick one, Esc closes.
// The ~40 named tickers below come first; tickers.csv ("TICKER,EXCHANGE") adds every active stock and ETF Tiingo
// lists on NYSE, Nasdaq, NYSE Arca/American, Cboe BZX, Shanghai and Shenzhen (no company names; regenerate from
// Tiingo's supported_tickers.zip). Not a live lookup: anything typed that isn't listed is offered as "Use XYZ".
import { PROXY_URL } from "./data.js";
import { glyph, assetClass } from "./visuals.js";
const TICKERS = [
  ["SPY", "SPDR S&P 500 ETF"], ["VOO", "Vanguard S&P 500 ETF"], ["VTI", "Vanguard Total Stock Market ETF"],
  ["QQQ", "Invesco QQQ (Nasdaq-100)"], ["IWM", "iShares Russell 2000 ETF"], ["DIA", "SPDR Dow Jones Industrial ETF"],
  ["VXUS", "Vanguard Total International Stock ETF"], ["VEA", "Vanguard Developed Markets ETF"],
  ["VWO", "Vanguard Emerging Markets ETF"], ["EFA", "iShares MSCI EAFE ETF"], ["BND", "Vanguard Total Bond Market ETF"],
  ["AGG", "iShares Core U.S. Aggregate Bond ETF"], ["TLT", "iShares 20+ Year Treasury Bond ETF"],
  ["IEF", "iShares 7-10 Year Treasury Bond ETF"], ["SHY", "iShares 1-3 Year Treasury Bond ETF"],
  ["LQD", "iShares Investment Grade Corporate Bond ETF"], ["HYG", "iShares High Yield Corporate Bond ETF"],
  ["GLD", "SPDR Gold Shares"], ["SLV", "iShares Silver Trust"], ["USO", "United States Oil Fund"],
  ["VNQ", "Vanguard Real Estate ETF"], ["XLK", "Technology Select Sector SPDR"], ["XLF", "Financial Select Sector SPDR"],
  ["XLE", "Energy Select Sector SPDR"], ["XLV", "Health Care Select Sector SPDR"], ["VFINX", "Vanguard 500 Index Fund"],
  ["VTSAX", "Vanguard Total Stock Market Index Fund"], ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["AMZN", "Amazon"],
  ["GOOGL", "Alphabet (Class A)"], ["META", "Meta Platforms"], ["NVDA", "NVIDIA"], ["TSLA", "Tesla"],
  ["BRK-B", "Berkshire Hathaway (Class B)"], ["JPM", "JPMorgan Chase"], ["JNJ", "Johnson & Johnson"],
  ["XOM", "Exxon Mobil"], ["KO", "Coca-Cola"],
];
fetch(new URL("./tickers.csv", import.meta.url)).then((r) => r.ok ? r.text() : "").then((text) => {
  const known = new Set(TICKERS.map(([t]) => t));
  for (const line of text.split("\n")) {
    const [t, ex] = line.split(",");
    if (t && !known.has(t)) TICKERS.push([t, ex]);
  }
}).catch(() => {}); // offline or missing file: the short list still works

// Adds suggestions to `input`. extra(): more [text, hint] entries listed before the tickers (saved portfolios).
// shortcut: a portfolio name containing a comma is searched from after its last comma.
// multi: the box holds a comma list and only the last entry is searched.
// onPick(text, hint): called with the chosen entry instead of writing it into the box (which is cleared).
export function attachTickerSearch(input, { multi = false, extra = () => [], onPick } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "combo";
  input.before(wrap);
  const list = document.createElement("ul");
  list.className = "suggest";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  wrap.append(input, list);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  let hits = [], at = 0, remote = [], remoteFor = "", timer;
  const start = () => (multi ? input.value.search(/[^,\s]*$/) : 0); // where the entry being typed begins
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); };

  function render() {
    const q = input.value.slice(start()).trim().toUpperCase();
    const mine = remoteFor === q ? remote : []; // name matches from Yahoo, for the text as typed now
    hits = q ? [...extra(), ...mine, ...TICKERS.filter(([t]) => !mine.some(([m]) => m === t))].filter(([t, name]) => t.toUpperCase().includes(q) || name.toUpperCase().includes(q) || mine.some((m) => m[0] === t))
      .sort((a, b) => Number(b[0].toUpperCase().startsWith(q)) - Number(a[0].toUpperCase().startsWith(q))).slice(0, 10) : [];
    if (q && /^[A-Z0-9.-]{1,10}$/.test(q) && !hits.some(([t]) => t.toUpperCase() === q)) hits.push([q, "Use this ticker"]);
    // A finished ticker shows no list, so Enter still submits the form.
    if (!hits.length || hits[0][0].toUpperCase() === q) return close();
    at = Math.min(at, hits.length - 1);
    list.replaceChildren(...hits.map(([t, name], k) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", k === at);
      li.dataset.k = k;
      const b = document.createElement("strong");
      b.textContent = t; // textContent, never innerHTML, for anything typed
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = name;
      li.append(glyph(name === "Saved portfolio" ? "portfolio" : name === "Tab" ? "tab" : assetClass(t)), b, hint);
      return li;
    }));
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function choose(k) {
    if (onPick) {
      const [text, hint] = hits[k];
      input.value = "";
      close();
      return onPick(text, hint);
    }
    input.value = input.value.slice(0, start()) + hits[k][0] + (multi ? ", " : "");
    close();
    input.focus();
  }

  // Names aren't in the local list, so ask the proxy (Yahoo search) a moment after typing stops.
  function lookup() {
    const q = input.value.slice(start()).trim().toUpperCase();
    if (q.length < 2) return;
    fetch(`${PROXY_URL}/search?q=${encodeURIComponent(q)}`).then((r) => r.ok ? r.json() : []).then((rows) => {
      remote = rows.map((x) => [x.symbol.toUpperCase(), [x.name, x.exchange].filter(Boolean).join(" · ")]);
      remoteFor = q;
      if (document.activeElement === input && input.value.slice(start()).trim().toUpperCase() === q) render();
    }).catch(() => {}); // offline or blocked: local suggestions still work
  }
  input.addEventListener("input", () => { at = 0; render(); clearTimeout(timer); timer = setTimeout(lookup, 250); });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      at = (at + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(at);
    } else if (e.key === "Escape") close();
  });
  // mousedown, not click: the box would lose focus (and close the list) before a click lands
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("[data-k]");
    if (li) { e.preventDefault(); choose(Number(li.dataset.k)); }
  });
}
