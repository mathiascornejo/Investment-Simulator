// Tabs: each nav link points at a section id; only the section named in the URL hash is shown.
const tabs = ["backtester", "creator", "monte-carlo"];

function showTab() {
  const hash = location.hash.slice(1);
  const current = tabs.includes(hash) ? hash : tabs[0];
  for (const id of tabs) {
    document.getElementById(id).hidden = id !== current;
    document.querySelector(`nav a[href="#${id}"]`).toggleAttribute("aria-current", id === current);
  }
  scrollTo(0, 0);
}

addEventListener("hashchange", showTab);

// Side menu: the logo opens it; picking a section, Esc or a click outside closes it.
const menu = document.getElementById("menu");
document.getElementById("open-menu").addEventListener("click", () => menu.showModal());
menu.addEventListener("click", (e) => { if (e.target === menu || e.target.closest("a")) menu.close(); });
showTab();

// Each tab's own code. Imported after the tabs are set up so charts measure visible containers.
await Promise.all([import("./backtester.js"), import("./creator.js"), import("./montecarlo-tab.js"), import("./palette.js")]);

// Every segmented control gets the sliding pill.
const { slidingPill } = await import("./visuals.js");
document.querySelectorAll(".segmented").forEach(slidingPill);
