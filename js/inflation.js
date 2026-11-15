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
