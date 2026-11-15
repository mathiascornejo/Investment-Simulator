// Appends new days of PDS BVAL 3M/6M/1Y yields to data/tbills.json. Run daily by .github/workflows/tbills.yml.
// Needs PDS_KEY (the api_key PDS's own public widget uses; kept out of the repo). Unofficial and unlicensed: may break.
import { readFile, writeFile } from "node:fs/promises";
const FILE = new URL("../data/tbills.json", import.meta.url);
const key = process.env.PDS_KEY;
if (!key) throw new Error("Set PDS_KEY.");
const rows = JSON.parse(await readFile(FILE, "utf8").catch(() => "[]"));
const day = new Date((rows.at(-1)?.[0] ?? "2022-11-14") + "T00:00:00Z");
const dates = [];
for (day.setUTCDate(day.getUTCDate() + 1); day <= new Date(); day.setUTCDate(day.getUTCDate() + 1)) {
  if (day.getUTCDay() % 6) dates.push(day.toISOString().slice(0, 10));
}
async function rates(d) {
  const res = await fetch("https://www.pds.com.ph/api-mp/graphql/", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `APIKey ${key}` },
    body: JSON.stringify({ query: "query($d: Date){bvalRates(tradeDate:$d){tenor bvalRateToday}}", variables: { d } }),
  });
  if (!res.ok) throw new Error(`PDS returned ${res.status} for ${d}`);
  const list = (await res.json()).data.bvalRates;
  const get = (t) => list.find((x) => x.tenor === t)?.bvalRateToday;
  return [get("3M"), get("6M"), get("1Y")];
}
const found = [];
for (let i = 0; i < dates.length; i += 5) { // 5 at a time, to be polite
  await Promise.all(dates.slice(i, i + 5).map(async (d) => { const r = await rates(d); if (r.every((x) => x > 0)) found.push([d, ...r]); }));
}
found.sort((a, b) => (a[0] < b[0] ? -1 : 1));
if (found.length) await writeFile(FILE, JSON.stringify([...rows, ...found]).replace(/\],\[/g, "],\n[") + "\n");
console.log(`added ${found.length} days; now ${rows.length + found.length}`);
