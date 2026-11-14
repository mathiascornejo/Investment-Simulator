// Number and date formatting shared by every tab.
// signDisplay "negative" stops a tiny negative number printing as "-0.00".
export const pct = new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "negative" });
export const num = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "negative" });
export const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const moneyCompact = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }); // $1.2M, for axes and tiles

export const longDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// "2020-03" -> "Mar 2020"
export const monthLabel = (key) =>
  new Date(`${key}-01`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

// A dash for anything that can't be measured (null, NaN, infinite).
export const show = (value, format) => (Number.isFinite(value) ? format.format(value) : "–");

// Builds an element; children can be nodes or text (text is never parsed as HTML).
export function element(tag, ...children) {
  const node = document.createElement(tag);
  node.append(...children);
  return node;
}
