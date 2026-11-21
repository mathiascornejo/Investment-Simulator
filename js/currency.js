// Which currency each ticker's prices are in, from its market suffix. Nothing is converted: every line keeps its
// listing's own currency (London quotes pence, "GBp"). Plain tickers are US listings.
import { TBILLS } from "./tbills.js";
import { countryName } from "./countries.js";

const SUFFIX = {
  L: "GBp", PS: "PHP", T: "JPY", TO: "CAD", V: "CAD", AX: "AUD", NZ: "NZD", HK: "HKD", SS: "CNY", SZ: "CNY", TW: "TWD",
  KS: "KRW", KQ: "KRW", NS: "INR", BO: "INR", SI: "SGD", KL: "MYR", BK: "THB", JK: "IDR", SW: "CHF", ST: "SEK", OL: "NOK",
  CO: "DKK", DE: "EUR", F: "EUR", PA: "EUR", AS: "EUR", MI: "EUR", MC: "EUR", BR: "EUR", LS: "EUR", HE: "EUR", VI: "EUR",
  IR: "EUR", SA: "BRL", MX: "MXN", WA: "PLN", IS: "TRY",
};
const NAMES = { USD: "US dollars", GBp: "British pence", GBP: "British pounds", PHP: "Philippine pesos", JPY: "Japanese yen", EUR: "euros", CAD: "Canadian dollars", AUD: "Australian dollars", HKD: "Hong Kong dollars", CHF: "Swiss francs", KRW: "Korean won", INR: "Indian rupees", SGD: "Singapore dollars", CNY: "Chinese yuan" };
// Short words for "today's dollars"; any other currency is "money".
const WORDS = { USD: "dollars", GBp: "pounds", GBP: "pounds", PHP: "pesos", JPY: "yen", EUR: "euros", CAD: "dollars", AUD: "dollars", HKD: "dollars", SGD: "dollars", NZD: "dollars" };
// The currency of each country in countries.js, for the inflation figures.
const COUNTRY = {
  US: "USD", PH: "PHP", CN: "CNY", DE: "EUR", JP: "JPY", IN: "INR", GB: "GBP", FR: "EUR", IT: "EUR", BR: "BRL", CA: "CAD",
  RU: "RUB", MX: "MXN", KR: "KRW", AU: "AUD", ES: "EUR", ID: "IDR", TR: "TRY", NL: "EUR", SA: "SAR", CH: "CHF", PL: "PLN",
  AR: "ARS", SE: "SEK", BE: "EUR", TH: "THB", IE: "EUR", IL: "ILS", AT: "EUR", NO: "NOK", AE: "AED", SG: "SGD", VN: "VND",
  MY: "MYR", ZA: "ZAR", DK: "DKK", CO: "COP", EG: "EGP", HK: "HKD", BD: "BDT", CL: "CLP", FI: "EUR", PK: "PKR", PT: "EUR",
  NZ: "NZD", CZ: "CZK", PE: "PEN", RO: "RON", GR: "EUR", NG: "NGN", KE: "KES",
};

// A currency code ("USD", "GBp", "PHP"), "local" for a market suffix not listed above, or null for CASH and
// INFLATION, which have no prices to speak of (cash earns nothing; the other is an index).
export function currencyOf(ticker) {
  if (ticker === "CASH" || ticker === "INFLATION") return null;
  if (ticker in TBILLS) return "PHP";
  const suffix = ticker.split(".")[1];
  return suffix ? SUFFIX[suffix] ?? "local" : "USD";
}

// The different currencies among some tickers, in order.
export const currencies = (tickers) => [...new Set(tickers.map(currencyOf).filter(Boolean))];

// The one currency every line's amounts can be shown in: "USD" when there is none (cash only), else the shared
// code, or "mixed".
export function sharedCurrency(tickers) {
  const codes = currencies(tickers);
  return codes.length > 1 ? "mixed" : codes[0] ?? "USD";
}

export const currencyName = (code) => NAMES[code] ?? (code === "local" ? "its market's own currency" : code);
export const currencyWord = (code) => WORDS[code] ?? "money";
// "(GBp)" beside a line's name; a portfolio of several currencies lists them ("USD/GBp").
export const currencyLabel = (tickers) => currencies(tickers).join("/");

const same = (a, b) => (a === "GBp" ? "GBP" : a) === (b === "GBp" ? "GBP" : b);

// Plain-words notes about currencies for a set of lines ({ label, tickers }): when they aren't all in one currency,
// and when inflation-adjusted figures divide prices in one currency by another country's consumer prices.
export function currencyNotes(lines, real, country) {
  const notes = [];
  const all = currencies(lines.flatMap((l) => l.tickers));
  if (all.length > 1) {
    notes.push(`Not everything here is in the same currency. Each return is in its own currency, and exchange-rate moves aren't included, so the figures aren't what ${all.includes("USD") ? "a dollar investor" : "someone investing in one currency"} would have earned.`);
  }
  const home = COUNTRY[country];
  if (real && home) {
    const other = lines.filter((l) => currencies(l.tickers).some((c) => !same(c, home)));
    if (other.length) {
      const names = other.map((l) => l.label);
      const priced = currencies(other.flatMap((l) => l.tickers)).filter((c) => !same(c, home)).map(currencyName);
      notes.push(`The inflation figures (${countryName(country)}) are in ${currencyName(home)}, but ${listed(names)} priced in ${listed(priced, false)}. Exchange-rate moves between the two are left out, so the inflation-adjusted figures aren't what someone living there would have earned.`);
    }
  }
  return notes;
}
const and = new Intl.ListFormat("en");
const listed = (items, verb = true) => `${and.format(items)}${verb ? (items.length > 1 ? " are" : " is") : ""}`;
