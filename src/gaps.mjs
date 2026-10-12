import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "data", "conversations");

const gaps = [];
const big = [];

for (const f of await fs.readdir(dir)) {
  const c = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  const utts = (c.transcriptions ?? [])
    .flatMap((t) => t.utterances ?? [])
    .filter((u) => Number.isFinite(u.spoken_at))
    .sort((a, b) => a.spoken_at - b.spoken_at);

  for (let i = 1; i < utts.length; i++) {
    const prev = utts[i - 1];
    const spoken = Math.max(0, (prev.end ?? 0) - (prev.start ?? 0));
    const gap = (utts[i].spoken_at - prev.spoken_at) / 1000 - spoken;
    if (gap < 0) continue;
    gaps.push(gap);
    if (gap > 120) {
      big.push({
        gap,
        title: c.short_summary ?? "",
        before: (prev.text ?? "").slice(0, 60),
        after: (utts[i].text ?? "").slice(0, 60),
      });
    }
  }
}

gaps.sort((a, b) => a - b);

const edges = [1, 5, 15, 30, 60, 120, 300, 900, Infinity];
let lo = 0;
let seen = 0;

console.log(`${gaps.length} gaps\n`);
console.log("range           count    cumulative");
for (const hi of edges) {
  const n = gaps.filter((g) => g >= lo && g < hi).length;
  seen += n;
  const label = hi === Infinity ? `${lo}s+` : `${lo}-${hi}s`;
  console.log(
    `${label.padEnd(14)} ${String(n).padStart(6)}    ${((seen / gaps.length) * 100).toFixed(1)}%`
  );
  lo = hi;
}

console.log(`\nlongest gaps (${big.length} over 2 min):\n`);
for (const b of big.sort((x, y) => y.gap - x.gap).slice(0, 15)) {
  console.log(`${Math.round(b.gap)}s  ${b.title}`);
  console.log(`   before: ${b.before}`);
  console.log(`   after:  ${b.after}\n`);
}