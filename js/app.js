// Tabs: each nav link points at a section id; only the section named in the URL hash is shown.
const tabs = ["backtester", "creator", "monte-carlo"];

function showTab() {
  const hash = location.hash.slice(1);
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
const network = () => { offline.textContent = navigator.onLine ? "" : "You're offline. Prices already loaded still work."; };
addEventListener("offline", network);
addEventListener("online", network);
network();
// Any other failure nobody caught gets a toast instead of nothing.
addEventListener("unhandledrejection", () => {
  import("./visuals.js").then(({ toast }) => toast("Something didn't work. Try again, or reload the page.", "Reload", () => location.reload()), showBroken);
});

try {
  // Inflation toggle: remembered, and every tab that is showing results re-runs them with real or nominal prices.
  const { inflation } = await import("./data.js");
  const { countryPicker, countryName } = await import("./countries.js");
  const real = document.getElementById("real-toggle");
  const country = document.getElementById("real-country");
  const showCountry = (code) => { country.dataset.name = country.value = countryName(code); };
  const growthTitle = () => { document.getElementById("growth-title").textContent = inflation.real ? "Growth of $10,000 (today's dollars)" : "Growth of $10,000"; };
  const changed = () => { growthTitle(); dispatchEvent(new Event("inflation-changed")); };
  growthTitle();
  real.checked = inflation.real;
  country.hidden = !inflation.real;
  showCountry(inflation.country);
  countryPicker(country, (code) => {
    inflation.country = code;
    localStorage.setItem("country", code);
    showCountry(code);
    changed();
  });
  real.addEventListener("change", () => {
    inflation.real = real.checked;
    country.hidden = !real.checked;
    localStorage.setItem("real", real.checked ? "1" : "0");
    changed();
  });

  // Each tab's own code. Imported after the tabs are set up so charts measure visible containers.
  // One tab failing to load leaves the others working.
  const loaded = await Promise.allSettled([import("./backtester.js"), import("./creator.js"), import("./montecarlo-tab.js")]);

  // Every segmented control gets the sliding pill.
  const { slidingPill } = await import("./visuals.js");
  document.querySelectorAll(".segmented").forEach(slidingPill);
  const failed = loaded.find((tab) => tab.status === "rejected");
  if (failed) throw failed.reason;
} catch (error) {
  console.error(error);
  showBroken();
}
