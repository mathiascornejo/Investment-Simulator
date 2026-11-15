// Inflation adjustment: turns a nominal price series into "today's dollars" using US CPI.
// cpi: [{ date: "YYYY-MM-01", value }], oldest first. Each month's value is the index at the month's start, so a day's
// index is interpolated between its month and the next (a step would put a month of inflation into one day's return).
// shortcut: months after the latest CPI reading reuse it (recent real returns look slightly better than they were);
// dates before the first reading are dropped. Upgrade to a CPI forecast if the lag matters.
export function deflate(points, cpi) {
  const at = new Map(cpi.map((c, i) => [c.date.slice(0, 7), i]));
  const first = cpi[0].date.slice(0, 7), last = cpi.at(-1);
  return points.flatMap((p) => {
    const month = p.date.slice(0, 7);
    let index = last.value;
    if (month < first) return [];
    const i = at.get(month);
    if (i !== undefined && i < cpi.length - 1) {
      const [y, m, d] = p.date.split("-").map(Number);
      index = cpi[i].value + ((d - 1) / new Date(Date.UTC(y, m, 0)).getUTCDate()) * (cpi[i + 1].value - cpi[i].value);
    }
    return [{ date: p.date, adjClose: (p.adjClose * last.value) / index }];
  });
}
