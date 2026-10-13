// Runs attribution on one conversation several times and reports the spread.
//
// Why this exists: attributing the same conversation twice with identical code
// and identical input produced different topic totals. Conversation 10910324
// put a five minute block in "unpredicted" on one run and "ai-and-hacks" on
// the next. Conversation 11046928 reported "no subject" at 35, 39 and 29
// minutes across three runs.
//
// The sealed prediction is scored on mean absolute error and Spearman rank
// correlation. Both are arithmetic on these numbers, so a single run cannot
// support either. This measures how much the measurement moves, so the final
// result can be reported as a mean with a range instead of a point value
// carrying more precision than it has.
//
// Implemented as a subprocess runner on purpose. src/attribute.mjs is the
// working path for the whole denominator and is not refactored to make it
// importable; this calls the real script exactly as a person would.
//
// Usage:
//   node --env-file=.env src/variance.mjs 10910324 3

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const attribution = path.join(here, "..", "data", "attribution");
const outDir = path.join(here, "..", "data", "variance");

const id = process.argv[2];
const runs = Number(process.argv[3] ?? 3);

if (!id) {
  console.log("Usage: node --env-file=.env src/variance.mjs <id> [runs]");
  process.exit(1);
}

function runAttributor() {
  return new Promise((resolve, reject) => {
    // Inherit the environment, including whatever --env-file loaded into it,
    // so the child reaches the same provider with the same credentials.
    const child = spawn(
      process.execPath,
      [path.join(here, "attribute.mjs"), id],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))
    );
  });
}

const observed = [];

for (let i = 1; i <= runs; i++) {
  process.stdout.write(`run ${i} of ${runs} `);
  await runAttributor();
  const file = JSON.parse(
    await fs.readFile(path.join(attribution, `${id}.json`), "utf8")
  );
  observed.push({
    topics: file.topics ?? {},
    noneSec: file.noneSec ?? 0,
    omittedSec: file.omittedSec ?? 0,
  });
  console.log("done");
}

// Every row any run produced, so a topic that appears in one run and not
// another is visible rather than averaged away silently.
const rows = new Set();
for (const o of observed) {
  for (const k of Object.keys(o.topics)) rows.add(k);
}
rows.add("(no subject)");

const valueOf = (o, row) =>
  row === "(no subject)" ? o.noneSec : (o.topics[row] ?? 0);

const summary = [...rows]
  .map((row) => {
    const values = observed.map((o) => valueOf(o, row));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      row,
      mean,
      min: Math.min(...values),
      max: Math.max(...values),
      runs: values,
      // How many runs assigned this topic any time at all. Less than every
      // run means the topic itself is unstable, not merely its size.
      present: values.filter((v) => v > 0).length,
    };
  })
  .sort((a, b) => b.mean - a.mean);

const m = (s) => (s / 60).toFixed(1);

console.log(`\n${id}, ${runs} runs`);
console.log(
  `${"topic".padEnd(22)} ${"mean".padStart(7)} ${"min".padStart(7)} ` +
    `${"max".padStart(7)} ${"swing".padStart(7)}  runs`
);
for (const r of summary) {
  const swing = r.max - r.min;
  console.log(
    `${r.row.padEnd(22)} ${m(r.mean).padStart(7)} ${m(r.min).padStart(7)} ` +
      `${m(r.max).padStart(7)} ${m(swing).padStart(7)}` +
      `  ${r.runs.map((v) => m(v)).join(" ")}` +
      (r.present < runs ? `  (absent in ${runs - r.present} run(s))` : "")
  );
}

// The ranking is what the sealed prediction is scored against, so its
// stability matters more than any single topic's minutes.
const orderings = observed.map((o) =>
  Object.entries(o.topics)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .join(" > ")
);
const distinct = new Set(orderings);
console.log(`\nTopic orderings across runs: ${distinct.size} distinct`);
for (const o of distinct) console.log(`  ${o}`);

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(
  path.join(outDir, `${id}.json`),
  JSON.stringify({ id, runs, summary, orderings }, null, 2),
  "utf8"
);
