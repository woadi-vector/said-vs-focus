import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "data", "conversations");

const files = await fs.readdir(dir);
const rows = [];

for (const f of files) {
  const c = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  const utt = (c.transcriptions ?? []).reduce(
    (t, s) => t + (s.utterances?.length ?? 0), 0
  );
  rows.push({
    start: c.start_time,
    mins: Math.round((c.end_time - c.start_time) / 60000),
    utt,
    title: c.short_summary ?? "",
  });
}

rows.sort((a, b) => a.start - b.start);

let total = 0;
for (const r of rows) {
  total += r.mins;
  const d = new Date(r.start);
  const when = d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  console.log(
    `${when.padEnd(18)} ${String(r.mins).padStart(4)} min  ${String(r.utt).padStart(5)} utt  ${r.title}`
  );
}
console.log(`\n${rows.length} conversations, ${total} minutes, ${(total / 60).toFixed(1)} hours`);