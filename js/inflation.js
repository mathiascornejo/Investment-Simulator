// Inflation adjustment: turns a nominal price series into "today's dollars" using a CPI series.
// cpi: [{ date: "YYYY-MM-DD", value }], oldest first (monthly for the US, mid-year annual for other countries).
// A day's index is interpolated between the two readings around it (a step would put a whole period of inflation into one day's return).
// shortcut: days after the latest reading reuse it (recent real returns look slightly better than they were, by up to
// a year or two for annual countries); days before the first reading are dropped. Upgrade to extrapolating the last trend if the lag matters.
// points must be oldest first.
export function deflate(points, cpi) {
  const t = cpi.map((c) => Date.parse(c.date));
  const last = cpi.at(-1).value;
  let i = 0;
  return points.flatMap((p) => {
    const x = Date.parse(p.date);
    if (x < t[0]) return [];
    while (i + 1 < t.length && t[i + 1] <= x) i++;
    const index = i + 1 < t.length ? cpi[i].value + ((x - t[i]) / (t[i + 1] - t[i])) * (cpi[i + 1].value - cpi[i].value) : last;
    return [{ date: p.date, adjClose: (p.adjClose * last) / index }];
  });
}

// The index itself as a price-like series on the dates of `points` (the INFLATION ticker), filled in exactly as deflate() does.
export const priceIndex = (points, cpi) =>
  deflate(points.map((p) => ({ date: p.date, adjClose: 1 })), cpi).map((p) => ({ date: p.date, adjClose: cpi.at(-1).value / p.adjClose }));

// Figures for the note beside the inflation switch: the first and latest readings, the rise over the year to the latest
// reading (null without a reading a year earlier), and the rise since 1 Jan 2000 (null if the readings start later).
export function cpiFacts(cpi) {
  const latest = cpi.at(-1);
  const yearBefore = cpi.find((c) => c.date === `${latest.date.slice(0, 4) - 1}${latest.date.slice(4)}`);
  const [since2000] = deflate([{ date: "2000-01-01", adjClose: 1 }], cpi); // latest index ÷ the index on that day
  return { first: cpi[0].date, latest: latest.date, lastYear: yearBefore ? latest.value / yearBefore.value - 1 : null, since2000: since2000 ? since2000.adjClose - 1 : null };
}
