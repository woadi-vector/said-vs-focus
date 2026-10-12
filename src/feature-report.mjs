import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { features } from "./features.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "data", "conversations");

const rows = [];
for (const f of await fs.readdir(dir)) {
  const c = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  const utts = (c.transcriptions ?? []).flatMap((t) => t.utterances ?? []);
  const fx = features(utts);
  if (!fx || fx.count < 20) continue;
  rows.push({ start: c.start_time, title: c.short_summary ?? "", fx });
}

rows.sort((a, b) => a.fx.fillerRate - b.fx.fillerRate);

const pct = (x) => (x * 100).toFixed(0).padStart(3) + "%";

console.log("filler restart  short  term   words   n     title");
for (const r of rows) {
  const f = r.fx;
  console.log(
    `${pct(f.fillerRate)}   ${pct(f.restartRate)}   ${pct(f.shortRate)}  ${pct(f.terminalRate)}  ` +
    `${f.meanWords.toFixed(1).padStart(5)}  ${String(f.count).padStart(4)}  ${r.title}`
  );
}