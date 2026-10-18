// The filter accuracy measurement docs/denominator.md promised:
//
//   "A spot-check pass over sampled segments records human agreement or
//    disagreement per segment, and the disagreement rate is published with
//    the shares."
//
// Human, not a second model pass. The filter decides the denominator for
// every number in this project, so it is the one component that cannot grade
// itself.
//
// STRATIFIED, because the denominator is minutes and segments are not equal.
// A 96 minute Warzone block and a 2 minute kitchen exchange are one segment
// each. A per-segment rate would leave the segments carrying almost all the
// minutes unverified. So:
//
//   large   every segment of LARGE_MIN minutes or more, reviewed in full.
//           Few of them, most of the minutes, no sampling error at all.
//   short   a seeded random sample of the rest. The seed is recorded in the
//           drawn file so the draw is reproducible and cannot have been
//           repeated until an easy sample came up.
//
// Both labels are sampled, not just own. The filter errs in two directions
// and they do opposite things to the result: media called own inflates the
// denominator and invents topics, own called media deletes real conversation.
// A one-sided check would only find the first.
//
// ORDER OF OPERATIONS, and it matters:
//   1. draw, then COMMIT docs/spot-check-draw.md, which lists exactly which
//      segments came up, before a single verdict is written
//   2. fill the verdicts in data/spot-check.md
//   3. score
// Committing the draw before reviewing it is what makes the sample a sample
// rather than a selection. The review file stays out of the repository
// because it quotes a real household verbatim; the manifest carries the seed,
// the keys and the durations, which is all the proof the claim needs.
//
// Usage:
//   node src/spot-check.mjs draw            census + 40 sampled short segments
//   node src/spot-check.mjs draw 60 1234    sample size and seed
//   node src/spot-check.mjs score           read verdicts back, print the rate

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepare } from "./segment.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const segDir = path.join(dataDir, "segments");
const convDir = path.join(dataDir, "conversations");
const mdPath = path.join(dataDir, "spot-check.md");
const jsonPath = path.join(dataDir, "spot-check.json");
// The draw manifest is the only part of this that enters the repo. data/ is
// gitignored and holds real transcripts, so the proof of the draw has to be
// separable from its contents: seed, keys, predicted labels, durations, and
// not one word of what was said.
const manifestPath = path.join(here, "..", "docs", "spot-check-draw.md");

const WINDOW_FROM = Date.parse("2026-10-10T00:00:00-05:00");
const WINDOW_TO = Date.parse("2026-10-18T00:00:00-05:00");

const LARGE_MIN = 15;
const SAMPLES = 8; // transcript lines shown per segment

const f1 = (s) => (s / 60).toFixed(1);

// Deterministic PRNG so a recorded seed reproduces the draw exactly.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function collect() {
  const out = [];
  for (const f of (await fs.readdir(segDir)).sort()) {
    const s = JSON.parse(await fs.readFile(path.join(segDir, f), "utf8"));
    const c = JSON.parse(await fs.readFile(path.join(convDir, f), "utf8"));
    const utts = prepare((c.transcriptions ?? []).flatMap((t) => t.utterances ?? []));
    if (!utts.length) continue;
    if (!(utts[0].spoken_at >= WINDOW_FROM && utts[0].spoken_at < WINDOW_TO)) continue;

    for (const [i, seg] of s.segments.entries()) {
      out.push({
        key: `${s.id}:${i}`,
        id: s.id,
        title: s.title ?? s.id,
        index: i,
        label: seg.label,
        sec: seg.speechSec,
        startMs: seg.startMs,
        slice: utts.slice(seg.from, seg.to),
      });
    }
  }
  return out;
}

const mode = process.argv[2] ?? "draw";

if (mode === "draw") {
  const n = Number(process.argv[3] ?? 40);
  const seed = Number(process.argv[4] ?? 20261018);

  const all = await collect();
  const large = all.filter((s) => s.sec >= LARGE_MIN * 60);
  const short = all.filter((s) => s.sec < LARGE_MIN * 60);

  const rng = mulberry32(seed);
  const shuffled = short
    .map((s) => ({ s, r: rng() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s);
  const drawn = shuffled.slice(0, Math.min(n, shuffled.length));

  const totalSec = all.reduce((t, s) => t + s.sec, 0);
  const largeSec = large.reduce((t, s) => t + s.sec, 0);
  const shortSec = short.reduce((t, s) => t + s.sec, 0);
  const drawnSec = drawn.reduce((t, s) => t + s.sec, 0);

  const lines = [
    "# Filter spot check",
    "",
    `Drawn ${new Date().toISOString().slice(0, 10)}. Seed ${seed}, sample size ${n}.`,
    "",
    "Commit this file with the verdicts still blank before filling any of them.",
    "",
    "Stratification:",
    "",
    `- large: every segment ${LARGE_MIN} min or longer. ${large.length} segments, ${f1(largeSec)} min, reviewed in full.`,
    `- short: everything else. ${short.length} segments, ${f1(shortSec)} min, of which ${drawn.length} segments and ${f1(drawnSec)} min were drawn.`,
    `- window total: ${all.length} segments, ${f1(totalSec)} min.`,
    "",
    "For each segment: read the lines, then write the verdict.",
    "",
    "- `verdict: y` the label is right",
    "- `verdict: n own` the label is wrong and the right one is own",
    "- `verdict: ?` you cannot tell from these lines",
    "",
    "Valid labels: own, media, ambient, unclear.",
    "",
    "Judge the label, not the topic. The question is only whether this is",
    "conversation you took part in, recorded entertainment you were an",
    "audience to, speech nearby that you had no part in, or genuinely",
    "undecidable. A `?` is a real answer and is counted separately, not as",
    "agreement.",
    "",
  ];

  const emit = (seg, stratum) => {
    const step = Math.max(1, Math.floor(seg.slice.length / SAMPLES));
    const sample = [];
    for (let j = 0; j < seg.slice.length && sample.length < SAMPLES; j += step) {
      const t = (seg.slice[j].text ?? "").trim();
      if (t) sample.push(t);
    }
    const when = new Date(seg.startMs).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    lines.push(
      `<!-- spot ${seg.key} ${stratum} ${seg.label} ${seg.sec} -->`,
      `## ${seg.key}  ${seg.title}`,
      `**${seg.label}** · ${f1(seg.sec)} min · ${when} · ${stratum}`,
      "",
      "verdict: ",
      "",
      ...sample.map((t) => `- ${t.slice(0, 140)}`),
      ""
    );
  };

  lines.push("---", "", `# Large segments (${large.length})`, "");
  for (const s of large.sort((a, b) => b.sec - a.sec)) emit(s, "large");

  lines.push("---", "", `# Sampled short segments (${drawn.length})`, "");
  for (const s of drawn.sort((a, b) => a.startMs - b.startMs)) emit(s, "short");

  await fs.writeFile(mdPath, lines.join("\n"), "utf8");

  const manifest = [
    "# Spot check draw",
    "",
    `Drawn ${new Date().toISOString().slice(0, 10)}. Seed ${seed}, short-stratum sample size ${n},`,
    `large stratum is every segment ${LARGE_MIN} min or longer.`,
    "",
    "This manifest is the committed record of which segments were drawn, pushed",
    "before any verdict was written. The review file itself stays out of the",
    "repository: it contains verbatim transcripts of a real household.",
    "",
    `Population: ${all.length} segments, ${f1(totalSec)} min, in the closed window.`,
    `Large: ${large.length} segments, ${f1(largeSec)} min, full census.`,
    `Short: ${short.length} segments, ${f1(shortSec)} min, of which ${drawn.length} drawn (${f1(drawnSec)} min).`,
    `Directly verified: ${f1(largeSec + drawnSec)} min, ` +
      `${(((largeSec + drawnSec) / totalSec) * 100).toFixed(1)}% of window capture.`,
    "",
    "| segment | stratum | predicted | min |",
    "| --- | --- | --- | --- |",
    ...[...large.map((s) => [s, "large"]), ...drawn.map((s) => [s, "short"])]
      .sort((a, b) => a[0].key.localeCompare(b[0].key))
      .map(([s, st]) => `| ${s.key} | ${st} | ${s.label} | ${f1(s.sec)} |`),
    "",
  ];
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, manifest.join("\n"), "utf8");

  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${manifestPath}  (this one is committed, the review file is not)`);
  console.log(
    `${large.length} large (${f1(largeSec)} min, full census) + ` +
      `${drawn.length} short sampled of ${short.length} (${f1(drawnSec)} of ${f1(shortSec)} min)`
  );
  console.log(
    `Directly verified minutes will be ${f1(largeSec + drawnSec)} of ${f1(totalSec)}, ` +
      `${(((largeSec + drawnSec) / totalSec) * 100).toFixed(1)}% of window capture.`
  );
  console.log(
    `\nCommit docs/spot-check-draw.md now, blank verdicts and all, then fill ` +
      `data/spot-check.md, then: node src/spot-check.mjs score`
  );
  process.exit(0);
}

if (mode !== "score") {
  console.log("Usage: node src/spot-check.mjs draw [n] [seed]  |  node src/spot-check.mjs score");
  process.exit(1);
}

// Score.
let md;
try {
  md = await fs.readFile(mdPath, "utf8");
} catch {
  console.log(`No ${mdPath}. Run: node src/spot-check.mjs draw`);
  process.exit(1);
}

const all = await collect();
const byKey = new Map(all.map((s) => [s.key, s]));

const rows = [];
const blocks = md.split(/<!-- spot /).slice(1);
for (const b of blocks) {
  const head = b.slice(0, b.indexOf("-->"));
  const [key, stratum, label, secStr] = head.trim().split(/\s+/);
  const m = b.match(/^verdict:\s*(.*)$/m);
  const raw = (m?.[1] ?? "").trim().toLowerCase();
  rows.push({
    key,
    stratum,
    label,
    sec: Number(secStr),
    raw,
    verdict: raw.startsWith("y") ? "y" : raw.startsWith("n") ? "n" : raw.startsWith("?") ? "?" : "",
    correction: raw.startsWith("n") ? (raw.split(/\s+/)[1] ?? "") : "",
    exists: byKey.has(key),
  });
}

const missing = rows.filter((r) => !r.exists);
if (missing.length) {
  console.log(
    `${missing.length} segment(s) in the draw no longer exist in data/segments. ` +
      `The segmentation changed after the draw; redraw before scoring.`
  );
  process.exit(1);
}

const blank = rows.filter((r) => !r.verdict);
if (blank.length) {
  console.log(`${blank.length} of ${rows.length} verdicts are still blank:`);
  for (const r of blank.slice(0, 12)) console.log(`  ${r.key}  ${r.label}  ${f1(r.sec)} min`);
  if (blank.length > 12) console.log(`  ...and ${blank.length - 12} more`);
  console.log("\nFill every verdict before scoring. A partial pass is not a rate.");
  process.exit(1);
}

const stratum = (name) => {
  const r = rows.filter((x) => x.stratum === name);
  const sec = r.reduce((t, x) => t + x.sec, 0);
  const wrong = r.filter((x) => x.verdict === "n");
  const unsure = r.filter((x) => x.verdict === "?");
  return {
    name,
    n: r.length,
    sec,
    wrong: wrong.length,
    wrongSec: wrong.reduce((t, x) => t + x.sec, 0),
    unsure: unsure.length,
    unsureSec: unsure.reduce((t, x) => t + x.sec, 0),
    rows: r,
  };
};

const large = stratum("large");
const short = stratum("short");

// The short stratum is a sample, so its minutes extrapolate to the whole
// short population by the ratio of minutes reviewed.
const shortPop = all.filter((s) => s.sec < LARGE_MIN * 60);
const shortPopSec = shortPop.reduce((t, s) => t + s.sec, 0);
const scale = short.sec ? shortPopSec / short.sec : 0;
const shortWrongEst = short.wrongSec * scale;
const shortUnsureEst = short.unsureSec * scale;

const totalSec = all.reduce((t, s) => t + s.sec, 0);
const estWrongSec = large.wrongSec + shortWrongEst;
const estUnsureSec = large.unsureSec + shortUnsureEst;

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

console.log("Filter spot check\n");
console.log(
  `${pad("stratum", 10)} ${rpad("segs", 6)} ${rpad("min", 9)} ${rpad("wrong", 7)} ${rpad("wrong min", 11)} ${rpad("unsure", 8)}`
);
for (const s of [large, short]) {
  console.log(
    `${pad(s.name, 10)} ${rpad(s.n, 6)} ${rpad(f1(s.sec), 9)} ${rpad(s.wrong, 7)} ${rpad(f1(s.wrongSec), 11)} ${rpad(s.unsure, 8)}`
  );
}

console.log(
  `\nPer segment disagreement: ${rows.filter((r) => r.verdict === "n").length} of ${rows.length}, ` +
    `${((rows.filter((r) => r.verdict === "n").length / rows.length) * 100).toFixed(1)}%`
);
console.log(
  `Reviewed minutes: ${f1(large.sec + short.sec)} of ${f1(totalSec)} in window, ` +
    `${(((large.sec + short.sec) / totalSec) * 100).toFixed(1)}%`
);
console.log(
  `Estimated misclassified minutes across the window: ${f1(estWrongSec)} ` +
    `(${((estWrongSec / totalSec) * 100).toFixed(1)}% of capture)`
);
if (estUnsureSec > 0) {
  console.log(
    `Minutes a human could not call either way: ${f1(estUnsureSec)} ` +
      `(${((estUnsureSec / totalSec) * 100).toFixed(1)}%)`
  );
}

// Direction matters more than the headline rate.
const dir = new Map();
for (const r of rows.filter((x) => x.verdict === "n")) {
  const k = `${r.label} -> ${r.correction || "unspecified"}`;
  const v = dir.get(k) ?? { n: 0, sec: 0, keys: [] };
  v.n += 1;
  v.sec += r.sec;
  v.keys.push(r.key);
  dir.set(k, v);
}
if (dir.size) {
  console.log("\nDirection of error:");
  for (const [k, v] of [...dir].sort((a, b) => b[1].sec - a[1].sec)) {
    console.log(`  ${pad(k, 22)} ${rpad(v.n, 4)} seg  ${rpad(f1(v.sec), 8)} min   ${v.keys.join(", ")}`);
  }
  const intoOwn = [...dir]
    .filter(([k]) => k.endsWith("-> own"))
    .reduce((t, [, v]) => t + v.sec, 0);
  const outOfOwn = [...dir]
    .filter(([k]) => k.startsWith("own ->"))
    .reduce((t, [, v]) => t + v.sec, 0);
  console.log(
    `\nNet effect on own time in the reviewed set: ` +
      `${outOfOwn > intoOwn ? "-" : "+"}${f1(Math.abs(outOfOwn - intoOwn))} min ` +
      `(${f1(intoOwn)} min wrongly excluded, ${f1(outOfOwn)} min wrongly included)`
  );
} else {
  console.log("\nNo disagreements recorded.");
}

await fs.writeFile(
  jsonPath,
  JSON.stringify(
    {
      reviewed: rows.length,
      reviewedSec: large.sec + short.sec,
      windowSec: totalSec,
      large: { n: large.n, sec: large.sec, wrong: large.wrong, wrongSec: large.wrongSec, unsure: large.unsure },
      short: { n: short.n, sec: short.sec, wrong: short.wrong, wrongSec: short.wrongSec, unsure: short.unsure, scale },
      estWrongSec,
      estUnsureSec,
      direction: Object.fromEntries(dir),
      rows: rows.map(({ slice, ...r }) => r),
    },
    null,
    2
  ),
  "utf8"
);
console.log(`\nWrote ${jsonPath}`);
