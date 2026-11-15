// Ticker search inside a text box, modelled on the King Crab House search: suggestions drop down
// under the box as you type; ↑ ↓ Enter pick one, Esc closes.
// Suggestions come only from Yahoo (via the proxy) plus the saved portfolios passed in as extra(); there is no local ticker list.
import { PROXY_URL } from "./data.js";
import { glyph, assetClass } from "./visuals.js";
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
  const typed = () => input.value.slice(start()).trim().toUpperCase();
  const rank = ([t], q) => (t.toUpperCase() === q ? 2 : t.toUpperCase().startsWith(q) ? 1 : 0); // exact, then prefix
  const foreign = ([t]) => t.includes(".") ? 1 : 0; // then the common (undotted, home-market) listing before foreign ones; ties keep Yahoo's relevance order
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); };

  function render() {
    const q = input.value.slice(start()).trim().toUpperCase();
    const mine = remoteFor === q ? remote : []; // name matches from Yahoo, for the text as typed now
    hits = q ? [...extra().filter(([t, name]) => t.toUpperCase().includes(q) || name.toUpperCase().includes(q)), ...mine]
      .sort((a, b) => rank(b, q) - rank(a, q) || foreign(a) - foreign(b)).slice(0, 10) : [];
    if (q && /^[A-Z0-9.-]{1,12}$/.test(q) && !hits.some(([t]) => t.toUpperCase() === q)) hits[q.length <= 5 ? "unshift" : "push"]([q, "Use this ticker"]); // short text is likely a ticker: offer it first
    // A finished ticker still shows the list (exact match first) so a near miss can be corrected.
    if (!hits.length) return close();
    at = Math.min(at, hits.length - 1);
    list.replaceChildren(...hits.map(([t, name, type], k) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", k === at);
      li.dataset.k = k;
      li.title = `${t} · ${name}`; // full text when the row is cut short
      const b = document.createElement("strong");
      b.textContent = t; // textContent, never innerHTML, for anything typed
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = name;
      li.append(glyph(name === "Saved portfolio" ? "portfolio" : name === "Tab" ? "tab" : assetClass(t, name, type)), b, hint);
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
    const done = () => { if (document.activeElement === input && input.value.slice(start()).trim().toUpperCase() === q) render(); };
    fetch(`${PROXY_URL}/search?v=2&q=${encodeURIComponent(q)}`).then((r) => r.ok ? r.json() : []).then((rows) => {
      remote = rows.map((x) => [x.symbol.toUpperCase(), [x.name, x.exchange].filter(Boolean).join(" · "), x.type]);
      remoteFor = q;
    }).catch(() => {}).then(done); // offline or blocked: fall back to the local list
  }
  // From 1 character the list waits for Yahoo (kept as it was meanwhile) so it never shows a local guess first.
  input.addEventListener("input", () => {
    at = 0; clearTimeout(timer);
    if (!typed()) return render();
    timer = setTimeout(lookup, 150);
  });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      at = (at + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      render();
    } else if (e.key === "Enter") {
      // Enter on the exact ticker already typed just closes the list and lets the form submit.
      if (!onPick && hits[at][0].toUpperCase() === typed()) return close();
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
