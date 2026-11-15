// ⌘K / Ctrl+K command palette: jump to a tab, or add a ticker or saved portfolio to the Backtester.
// It reuses the ticker search, so suggestions, keyboard handling and icons match the rest of the site.
import { attachTickerSearch } from "./ticker-search.js";
import { loadPortfolios } from "./portfolios.js";
import { addToCompare } from "./backtester.js";

const TABS = [["Backtester", "#backtester"], ["Portfolio creator", "#creator"], ["Monte Carlo", "#monte-carlo"]];
const dialog = document.getElementById("palette");
const input = document.getElementById("palette-input");

function go(text) {
  dialog.close();
  const tab = TABS.find(([name]) => name.toLowerCase() === text.toLowerCase());
  if (tab) location.hash = tab[1];
  else if (text.trim()) addToCompare(text.trim());
}

attachTickerSearch(input, {
  extra: () => [...TABS.map(([name]) => [name, "Tab"]), ...loadPortfolios().map((p) => [p.name, "Saved portfolio"])],
  onPick: go,
});
// Enter with no suggestion open (an exact ticker): use what was typed.
document.getElementById("palette-form").addEventListener("submit", () => {
  const text = input.value;
  input.value = "";
  go(text);
});

const open = () => {
  input.value = "";
  dialog.showModal();
  input.focus();
};
document.getElementById("open-palette").addEventListener("click", open);
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    dialog.open ? dialog.close() : open();
  }
});
// A click on the dimmed backdrop closes it.
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
