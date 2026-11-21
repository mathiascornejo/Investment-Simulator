// Number and date formatting shared by every tab.
// signDisplay "negative" stops a tiny negative number printing as "-0.00".
export const pct = new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "negative" });
export const num = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "negative" });

// Whole amounts (money), the same shortened ($1.2M, $3.4T; past $999T compact runs long, so $1E18), and the one that
// fits a tile or table cell (whole up to a billion, then short). `style` is a currency, or {} for plain numbers.
function amounts(style) {
  const whole = new Intl.NumberFormat(undefined, { ...style, maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat(undefined, { ...style, notation: "compact", maximumFractionDigits: 1 });
  const scientific = new Intl.NumberFormat(undefined, { ...style, notation: "scientific", maximumFractionDigits: 1 });
  const moneyCompact = { format: (v) => (Math.abs(v) < 1e15 ? compact : scientific).format(v) };
  return { money: whole, moneyCompact, moneyFit: { format: (v) => (Math.abs(v) < 1e9 ? whole : moneyCompact).format(v) } };
}
export const { money, moneyCompact, moneyFit } = amounts({ style: "currency", currency: "USD" });

// The same three for amounts in another currency (see currency.js): "GBp" (London's pence) counts as pounds, since
// a sum of money is in pounds whatever the prices are quoted in. null, "mixed" or an unknown code: plain numbers.
const byCode = new Map();
export function moneyIn(code) {
  const currency = code === "GBp" ? "GBP" : code;
  if (currency === "USD") return { money, moneyCompact, moneyFit };
  if (!byCode.has(currency)) {
    byCode.set(currency, amounts(/^[A-Z]{3}$/.test(currency) ? { style: "currency", currency } : {}));
  }
  return byCode.get(currency);
}

// "$" or "₱" for labels such as "Starting amount ($)"; "" for plain numbers.
export const currencySymbol = (unit) => unit.money.formatToParts(0).find((part) => part.type === "currency")?.value ?? "";

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

// Rows (arrays) as spreadsheet text. Numbers are written unrounded with a dot decimal, dates as YYYY-MM-DD, and
// null or NaN as an empty cell. Text holding a comma, quote or line break is quoted. Text starting with = + - or @
// gets an apostrophe first, so a spreadsheet shows a portfolio named "=1+1" instead of running it as a formula.
export function csv(rows) {
  const cell = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    if (v === null || v === undefined) return "";
    let text = String(v);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

// Saves text as a file in the browser's downloads.
export function download(text, file, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(element("a"), { href: url, download: file }).click();
  setTimeout(() => URL.revokeObjectURL(url)); // after the download has started
}
export const downloadCsv = (rows, file) => download(csv(rows), file, "text/csv");
