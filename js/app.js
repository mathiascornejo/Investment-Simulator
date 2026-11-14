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
showTab();

// Each tab's own code. Imported after the tabs are set up so charts measure visible containers.
await Promise.all([import("./backtester.js"), import("./creator.js")]);
