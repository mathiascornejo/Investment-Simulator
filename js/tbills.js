// PH Treasury bills as tickers TBILL91 / TBILL182 / TBILL364. data/tbills.json holds PDS's BVAL benchmark yields
// (3M, 6M, 1Y: a proxy for the Treasury's own 91/182/364-day auction rates), rows of [date, 3M, 6M, 1Y] in percent.
// The price-like series is the value of a bill held to maturity and rolled: each period earns the previous day's yield
// pro rata. shortcut: ignores price moves when yields change (small for bills); starts Nov 2022 (the feed's start).
export const TBILLS = { TBILL91: 1, TBILL182: 2, TBILL364: 3 }; // ticker -> column in a row

export function tbillSeries(rows, column) {
  let value = 1;
  return rows.map((row, i) => {
    if (i) {
      const days = (Date.parse(row[0]) - Date.parse(rows[i - 1][0])) / 864e5;
      value *= 1 + (rows[i - 1][column] / 100) * days / 365;
    }
    return { date: row[0], adjClose: value };
  });
}

export async function fetchTbill(ticker) {
  const res = await fetch(new URL("../data/tbills.json", import.meta.url));
  if (!res.ok) throw new Error(`T-bill rates didn't load (${res.status}).`);
  return tbillSeries(await res.json(), TBILLS[ticker]);
}
