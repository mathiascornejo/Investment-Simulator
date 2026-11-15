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

// Side menu: the top-left button slides it out and pushes the page right; Esc closes it. On a narrow
// screen there is no room to push, so picking a section closes it.
const menu = document.getElementById("menu");
const button = document.getElementById("open-menu");
function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  menu.inert = !open;
  button.setAttribute("aria-expanded", open);
}
button.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
menu.addEventListener("click", (e) => { if (e.target.closest("a") && matchMedia("(max-width: 60rem)").matches) setMenu(false); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) { setMenu(false); button.focus(); } });
// The page width changes as it slides, so charts must re-measure once it stops.
document.body.addEventListener("transitionend", (e) => { if (e.target === document.body) dispatchEvent(new Event("resize")); });
showTab();

// Inflation toggle: remembered, and every tab that is showing results re-runs them with real or nominal prices.
const { inflation } = await import("./data.js");
const { countryPicker, countryName } = await import("./countries.js");
const real = document.getElementById("real-toggle");
const country = document.getElementById("real-country");
const showCountry = (code) => { country.dataset.name = country.value = countryName(code); };
const changed = () => dispatchEvent(new Event("inflation-changed"));
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
await Promise.all([import("./backtester.js"), import("./creator.js"), import("./montecarlo-tab.js")]);

// Every segmented control gets the sliding pill.
const { slidingPill } = await import("./visuals.js");
document.querySelectorAll(".segmented").forEach(slidingPill);
