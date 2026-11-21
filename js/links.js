// Share links: a tab's setup written after the # (#backtester?l=SPY&l=QQQ&p=12), read back when the page opens or
// the address changes. Browsers never send the part after the # to a server, so a link carries portfolios and
// settings without any server seeing them.
import { inflation } from "./data.js";
import { readPortfolio, loadPortfolios, savePortfolios, freeName } from "./portfolios.js";
import { element } from "./format.js";

// The settings in the address for `tab`, or null when it holds none for that tab.
export function linkFor(tab) {
  const [name, query] = location.hash.slice(1).split("?");
  return name === tab && query !== undefined ? new URLSearchParams(query) : null;
}
// Takes the settings out of the address once the tab has used them, so the same link (an example card) works twice.
export const clearLink = (tab) => history.replaceState(history.state, "", `${location.pathname}${location.search}#${tab}`);
export const linkTo = (tab, pairs) => `#${tab}?${new URLSearchParams(pairs)}`;

// A portfolio as it travels in a link: its recipe, without the fund names (they are looked up again).
export const recipe = (p) => JSON.stringify({ name: p.name, holdings: p.holdings.map(({ ticker, weight }) => ({ ticker, weight })), rebalance: p.rebalance, band: p.band, cost: p.cost ?? 0 });
const key = (p) => {
  const clean = readPortfolio(p);
  return typeof clean === "string" ? null : recipe(clean);
};

// The portfolios in a link (`pf`), checked like a backup file, as { asked, portfolio, saved }: `asked` is the name
// the link uses. One that matches a saved portfolio is that one (saved: true). A name that a different saved
// portfolio already uses gets "(2)", so a link never changes or hides what is saved. `bad` counts unreadable ones.
export function linkedPortfolios(link, saved = loadPortfolios()) {
  const taken = saved.map((p) => p.name);
  const found = [];
  let bad = 0;
  for (const text of link.getAll("pf")) {
    let portfolio;
    try { portfolio = readPortfolio(JSON.parse(text)); } catch { portfolio = "unreadable"; }
    if (typeof portfolio === "string") { bad++; continue; }
    const same = saved.find((s) => key(s) === recipe(portfolio));
    if (same) { found.push({ asked: portfolio.name, portfolio: same, saved: true }); continue; }
    const asked = portfolio.name;
    portfolio.name = freeName(asked, taken);
    taken.push(portfolio.name);
    found.push({ asked, portfolio, saved: false });
  }
  return { found, bad };
}

// Writes `pairs` (and the inflation setting, which every tab shares) after the #, then copies the address.
// If the browser won't allow copying, the link is shown selected in a box to copy by hand.
export async function copyLink(tab, pairs, node) {
  const setting = [["real", inflation.real ? "1" : "0"], ...(inflation.real ? [["country", inflation.country]] : [])];
  history.replaceState(history.state, "", linkTo(tab, [...pairs, ...setting]));
  try {
    await navigator.clipboard.writeText(location.href);
    node.replaceChildren("Link copied. Whoever opens it sees this same view.");
  } catch {
    const box = Object.assign(element("input"), { value: location.href, readOnly: true, className: "link-box" });
    box.setAttribute("aria-label", "Link to this view");
    node.replaceChildren("Copy this link: ", box);
    box.focus();
    box.select();
  }
}

// For portfolios a link brought that aren't saved here: a line saying so, with a button to save each one.
// onSaved(portfolio) runs after each save.
export function offerSave(node, portfolios, onSaved) {
  if (!portfolios.length) return node.replaceChildren();
  const buttons = portfolios.map((p) => Object.assign(element("button", `Save ${p.name}`), { type: "button", className: "quiet" }));
  const text = element("span", `This link brought ${new Intl.ListFormat("en").format(portfolios.map((p) => p.name))}, which ${portfolios.length > 1 ? "aren't" : "isn't"} saved in this browser.`);
  portfolios.forEach((p, i) => buttons[i].addEventListener("click", () => {
    const saved = loadPortfolios();
    const portfolio = { ...p, name: freeName(p.name, saved.map((s) => s.name)) };
    if (!savePortfolios([...saved, portfolio])) return text.replaceChildren("Not saved: this browser didn't let the site store it. Its storage may be full or switched off.");
    buttons[i].remove();
    text.replaceChildren(`Saved ${portfolio.name}. It is now in your portfolios on every tab.`);
    (buttons.find((b) => b.isConnected) ?? node.closest("section")?.querySelector("button[type=submit]"))?.focus();
    onSaved(p);
  }));
  node.replaceChildren(text, ...buttons);
}

// Example cards: each a share link (pairs, as for linkTo) with a title and the one-line lesson it shows.
export function exampleCards(node, tab, examples) {
  node.replaceChildren(
    Object.assign(element("h2", "Try an example"), { className: "data-head" }),
    element("ul", ...examples.map(({ title, lesson, link }) => element("li", Object.assign(element("a", element("strong", title), element("span", lesson)), { href: linkTo(tab, link), className: "example" })))),
  );
}
