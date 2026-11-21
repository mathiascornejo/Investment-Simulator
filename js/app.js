// Tabs: each nav link points at a section id; only the section named in the URL hash is shown.
// The glossary takes an entry after a slash (#glossary/sharpe-ratio); glossary.js scrolls to it.
const tabs = ["backtester", "creator", "monte-carlo", "glossary"];

function showTab() {
  const hash = location.hash.slice(1).split("/")[0];
  const current = tabs.includes(hash) ? hash : tabs[0];
  for (const id of tabs) {
    document.getElementById(id).hidden = id !== current;
    document.querySelector(`nav a[href="#${id}"]`).toggleAttribute("aria-current", id === current);
  }
  document.title = `${document.querySelector(`nav a[href="#${current}"]`).textContent.trim()} · Investment Simulator`;
  scrollTo(0, 0);
}

addEventListener("hashchange", showTab);

// Side menu: the top-left button slides it out and pushes the page right; Esc closes it. On a narrow
// screen there is no room to push: it floats over a dimmed page, and picking a section or tapping the page closes it.
const menu = document.getElementById("menu");
const button = document.getElementById("open-menu");
function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  menu.inert = !open;
  button.setAttribute("aria-expanded", open);
  button.setAttribute("aria-label", open ? "Close menu" : "Menu");
  button.querySelector("path").setAttribute("d", open ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"); // a cross while open
}
button.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
menu.addEventListener("click", (e) => { if (e.target.closest("a") && matchMedia("(max-width: 60rem)").matches) setMenu(false); });
document.getElementById("veil").addEventListener("click", () => { setMenu(false); button.focus(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) { setMenu(false); button.focus(); } });
// The page width changes as it slides, so charts must re-measure once it stops.
document.body.addEventListener("transitionend", (e) => { if (e.target === document.body) dispatchEvent(new Event("resize")); });
showTab();

// Safety net. Right after a deploy a browser can mix new files with old cached ones, so an import fails and
// buttons go dead without a word. These notices are built here, with no other module, so they still work then.
function notice(text, reload) {
  const note = Object.assign(document.createElement("p"), { className: "notice", textContent: text });
  note.setAttribute("role", reload ? "alert" : "status");
  if (reload) note.append(Object.assign(document.createElement("button"), { type: "button", className: "quiet", textContent: "Reload", onclick: () => location.reload() }));
  document.querySelector(".topbar").append(note);
  return note;
}
let broken = false;
const showBroken = () => { if (!broken) notice("Part of the site didn't load, usually because it was just updated.", true); broken = true; };
const offline = notice(""); // empty until the connection drops
const network = () => { offline.textContent = navigator.onLine ? "" : "You're offline. Prices already loaded or saved in this browser still work."; };
addEventListener("offline", network);
addEventListener("online", network);
network();
// Any other failure nobody caught gets a toast instead of nothing.
addEventListener("unhandledrejection", () => {
  import("./visuals.js").then(({ toast }) => toast("Something didn't work. Try again, or reload the page.", "Reload", () => location.reload()), showBroken);
});

try {
  // Inflation toggle: remembered, and every tab that is showing results re-runs them with real or nominal prices.
  const { inflation, fetchCpi } = await import("./data.js");
  const { countryPicker, countryName } = await import("./countries.js");
  const { cpiFacts } = await import("./inflation.js");
  const { pct, monthLabel, element } = await import("./format.js");
  const real = document.getElementById("real-toggle");
  const country = document.getElementById("real-country");
  const info = document.getElementById("real-info");
  const note = document.getElementById("real-note");
  const showCountry = (code) => { country.dataset.name = country.value = countryName(code); };
  // The country box and its "i" show only while the switch is on.
  const showControls = (on) => {
    country.hidden = info.hidden = !on;
    if (!on && note.matches(":popover-open")) note.hidePopover();
  };
  const growthTitle = () => { document.getElementById("growth-title").textContent = inflation.real ? "Growth of $10,000 (today's dollars)" : "Growth of $10,000"; };
  const changed = () => { growthTitle(); dispatchEvent(new Event("inflation-changed")); };
  growthTitle();
  real.checked = inflation.real;
  showControls(inflation.real);
  showCountry(inflation.country);
  countryPicker(country, (code) => {
    inflation.country = code;
    localStorage.setItem("country", code);
    showCountry(code);
    changed();
  });
  real.addEventListener("change", () => {
    inflation.real = real.checked;
    showControls(real.checked);
    localStorage.setItem("real", real.checked ? "1" : "0");
    changed();
  });
  // Another browser tab of the site saved portfolios or changed the inflation setting: follow it here too.
  // (The browser only tells the other tabs, so nothing here runs twice.) A null key means storage was cleared.
  addEventListener("storage", (e) => {
    if (e.key === "portfolios" || e.key === null) dispatchEvent(new Event("portfolios-changed"));
    if (e.key !== "real" && e.key !== "country" && e.key !== null) return;
    const on = localStorage.getItem("real") === "1";
    const code = localStorage.getItem("country") || "US";
    if (on === inflation.real && code === inflation.country) return;
    inflation.real = real.checked = on;
    inflation.country = code;
    showControls(on);
    showCountry(code);
    changed();
  });

  // The "i" note: where the inflation figures come from, how recent they are, what they add up to, and their limits.
  // It uses the figures the tabs load anyway (fetchCpi keeps them), so it costs no extra request.
  async function explain() {
    const code = inflation.country;
    const monthly = code === "US";
    const head = element("strong", `${countryName(code)} inflation`);
    note.replaceChildren(head, element("p", "Loading the figures…"));
    let facts;
    try { facts = cpiFacts(await fetchCpi(code)); } catch { return note.replaceChildren(head, element("p", "Couldn't load the figures. Try again later.")); }
    if (code !== inflation.country) return; // the country changed while they loaded
    const year = Number(facts.latest.slice(0, 4));
    const rose = (r) => `${r < 0 ? "fell" : "rose"} ${pct.format(Math.abs(r))}`;
    note.replaceChildren(
      head,
      element("p", monthly ? "Source: FRED, US consumer prices for city households (CPI-U), one reading a month." : "Source: the World Bank's consumer price index, one figure a year (the year's average)."),
      element("p", facts.lastYear === null ? `The latest reading is for ${monthly ? monthLabel(facts.latest.slice(0, 7)) : year}.`
        : monthly ? `Prices ${rose(facts.lastYear)} in the 12 months to ${monthLabel(facts.latest.slice(0, 7))}, the latest reading.` : `Prices ${rose(facts.lastYear)} from ${year - 1} to ${year}, the latest figure.`),
      element("p", facts.since2000 === null ? `The figures start in ${facts.first.slice(0, 4)}, so there is nothing to compare with 2000.`
        : `Since the start of 2000 prices ${rose(facts.since2000)}, so money kept as cash since then buys ${pct.format(1 / (1 + facts.since2000))} of what it did.`),
      element("p", monthly ? "Days after the latest reading reuse it, so the last few weeks show no inflation."
        : "Yearly figures arrive late, and days after the latest one reuse it. So returns after inflation for the last year or two look better than they were."),
      Object.assign(element("a", "What the consumer price index is"), { href: "#glossary/consumer-price-index" }),
    );
  }
  // Opens under the "i", right edges lined up. Absolute in the top layer, so it scrolls with the page like the button.
  note.addEventListener("beforetoggle", (e) => {
    if (e.newState !== "open") return;
    const at = info.getBoundingClientRect();
    note.style.top = `${at.bottom + scrollY + 8}px`;
    note.style.right = `${Math.max(8, document.documentElement.clientWidth - at.right - 4)}px`;
    explain();
  });
  note.addEventListener("click", (e) => { if (e.target.closest("a")) note.hidePopover(); });

  // Each tab's own code. Imported after the tabs are set up so charts measure visible containers.
  // One tab failing to load leaves the others working. The glossary page needs no tab, so it loads on its own too.
  const loaded = await Promise.allSettled([import("./backtester.js"), import("./creator.js"), import("./montecarlo-tab.js"), import("./glossary.js")]);

  // Every segmented control gets the sliding pill.
  const { slidingPill } = await import("./visuals.js");
  document.querySelectorAll(".segmented").forEach(slidingPill);
  const failed = loaded.find((tab) => tab.status === "rejected");
  if (failed) throw failed.reason;
} catch (error) {
  console.error(error);
  showBroken();
}
