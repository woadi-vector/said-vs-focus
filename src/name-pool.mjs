// Names the topics inside the "unpredicted" pool.
//
// docs/sealed-prediction.md defines "Everything unpredicted" as "any topic not
// named above" and then says plainly: "Topics discovered here are reported
// individually, not pooled." Claim 4, that no single unpredicted topic exceeds
// 10 percent, cannot be scored against a pool. This closes that.
//
// Input is the utterance indices src/attribute.mjs already assigned to
// UNPREDICTED, read from data/attribution. No re-reading of own time, no
// second opinion on what counts as the wearer's: the pool is taken exactly as
// the attributor left it, so this adds names without moving any boundary.
//
// TWO PASSES, both cheap:
//   discover     each chunk of pooled lines gets a short label of its own
//   consolidate  one call maps those labels onto canonical names, merging
//                synonyms. Minutes travel with their chunk through the map,
//                so nothing is re-attributed and the totals cannot drift.
//
// GRANULARITY, and the escalation rule, both stated here before any number
// exists. This pass labels a chunk, not an utterance, so its minutes are
// coarser than the main attribution. A chunk in this corpus is worth roughly
// seven minutes. If any named topic lands within 15 minutes of the 10 percent
// line, about two chunks of possible error, the chunk-level answer is not
// good enough to score claim 4 and the pass must be redone per utterance with
// the vocabulary this run discovers. The script prints that verdict itself.
//
// Usage:
//   node --env-file=.env src/name-pool.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepare } from "./segment.mjs";
import { UNPREDICTED } from "./topics.mjs";
import { ask, parseJson } from "./llm.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const convDir = path.join(dataDir, "conversations");
const attrDir = path.join(dataDir, "attribution");
const segDir = path.join(dataDir, "segments");
const outDir = path.join(dataDir, "pool");

// Same boundaries as src/build-view.mjs and src/replicates.mjs.
const WINDOW_FROM = Date.parse("2026-10-10T00:00:00-05:00");
const WINDOW_TO = Date.parse("2026-10-18T00:00:00-05:00");

const CHUNK = 40;
const CONCURRENCY = 3;
const ATTEMPTS = 4;

// Claim 4's threshold, and the band inside which chunk-level is too coarse.
const CLAIM_SHARE = 0.10;
const ESCALATE_BAND_SEC = 15 * 60;

const dur = (u) => Math.max(0, (u.end ?? 0) - (u.start ?? 0));
const f1 = (s) => (s / 60).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DISCOVER = `
You are reading lines from a conversation an always-on microphone captured.
The wearer took part in this conversation. Every line below was already judged
to be about a real subject, and to be about none of the subjects this project
tracks, so your job is only to say what it IS about.

Give the chunk one short topic label: two to four words, lowercase, plain
English, the words a person would use to describe what was being discussed.
Prefer the specific over the general. "parkinson's exercise class" beats
"health". "navy service stories" beats "personal history".

If the chunk genuinely holds two subjects, label the dominant one and say so
in the note.

Reply with JSON only, leading with {.

{
  "label": "short topic label",
  "note": "one sentence saying what was discussed",
  "mixed": true or false
}
`.trim();

const CONSOLIDATE = `
Below is a list of topic labels, each discovered independently from a
different stretch of the same person's week, with the minutes attached.

Merge labels that name the same subject into one canonical label. Keep
distinct subjects apart even when they are adjacent in someone's life: a
class about a condition and a research project about that condition are two
subjects, not one.

Do not invent a label that covers everything. Do not merge two subjects
because they are both small. A label that appears once and names something
specific stays as it is.

Reply with JSON only, leading with {. Map every input label to a canonical
label, including the ones that do not change.

{
  "map": { "input label": "canonical label" }
}
`.trim();

async function callJson(prompt, maxTokens) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return parseJson(await ask(prompt, { maxTokens }));
    } catch (e) {
      last = e;
      if (attempt < ATTEMPTS) {
        process.stdout.write(".");
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }
  throw last;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

const inWindow = (utts) =>
  utts.length &&
  utts[0].spoken_at >= WINDOW_FROM &&
  utts[0].spoken_at < WINDOW_TO;

// Collect every pooled line in the window, grouped into chunks that do not
// straddle a conversation.
// Own time and the pool are both read against the CURRENT segmentation, not
// against whatever an attribution file happens to remember.
//
// src/attribute.mjs skips a conversation with no own segments, so when a
// correction takes a conversation's last own segment away, its old attribution
// file stays on disk asserting own minutes and topics that no longer exist.
// src/build-view.mjs scopes by segment and ignores them. Summing attr.ownSec
// here instead produced a 30-minute disagreement between two numbers that are
// supposed to describe the same window, which is how this was found.
const files = (await fs.readdir(attrDir)).filter((f) => f.endsWith(".json"));
const chunks = [];
const stale = [];
let ownSecTotal = 0;

for (const f of files) {
  const id = f.replace(/\.json$/, "");
  const attr = JSON.parse(await fs.readFile(path.join(attrDir, f), "utf8"));

  const conv = JSON.parse(
    await fs.readFile(path.join(convDir, `${id}.json`), "utf8")
  );
  const utts = prepare(
    (conv.transcriptions ?? []).flatMap((t) => t.utterances ?? [])
  );
  if (!inWindow(utts)) continue;

  let seg;
  try {
    seg = JSON.parse(await fs.readFile(path.join(segDir, `${id}.json`), "utf8"));
  } catch {
    stale.push({ id, why: "no segment file" });
    continue;
  }

  const own = (seg.segments ?? []).filter((s) => s.label === "own");
  if (own.length === 0) {
    stale.push({
      id,
      why: `attribution claims ${f1(attr.ownSec ?? 0)} min of own time, ` +
        `but no own segments remain`,
    });
    continue;
  }

  ownSecTotal += own.reduce((t, s) => t + s.speechSec, 0);

  // A pooled index is only pooled own time if it still falls inside an own
  // segment. After a relabel, some will not.
  const inOwn = (n) => own.some((s) => n >= s.from && n < s.to);
  const idx = (attr.lines?.[UNPREDICTED.id] ?? []).filter(inOwn);

  for (let i = 0; i < idx.length; i += CHUNK) {
    const slice = idx.slice(i, i + CHUNK);
    chunks.push({
      id,
      title: attr.title ?? id,
      indices: slice,
      lines: slice.map((n) => utts[n]).filter(Boolean),
    });
  }
}

if (stale.length) {
  console.log(
    `Ignoring ${stale.length} stale attribution file(s) whose own segments ` +
      `were corrected away. Delete them so nothing else reads them:`
  );
  for (const s of stale) console.log(`  data/attribution/${s.id}.json  (${s.why})`);
  console.log("");
}

if (chunks.length === 0) {
  console.log("No pooled lines in the window. Nothing to name.");
  process.exit(0);
}

const pooledSec = chunks.reduce(
  (t, c) => t + c.lines.reduce((s, u) => s + dur(u), 0),
  0
);

console.log(
  `${chunks.length} chunks of pooled time, ` +
    `${f1(pooledSec)} min, across ${new Set(chunks.map((c) => c.id)).size} conversations\n`
);

// Pass one: label each chunk.
await pool(chunks, CONCURRENCY, async (c) => {
  const body = c.indices
    .map((n, i) => `[${n}] ${(c.lines[i]?.text ?? "").trim()}`)
    .join("\n");
  try {
    const r = await callJson(`${DISCOVER}\n\nLines:\n${body}`, 512);
    c.label = String(r.label ?? "").trim().toLowerCase() || "(unlabelled)";
    c.note = r.note ?? "";
    c.mixed = r.mixed === true;
    process.stdout.write(c.mixed ? "~" : "+");
  } catch (e) {
    c.label = "(failed)";
    c.error = String(e.message ?? e);
    process.stdout.write("!");
  }
});
console.log("\n");

// Pass two: merge synonyms.
const rough = new Map();
for (const c of chunks) {
  const sec = c.lines.reduce((s, u) => s + dur(u), 0);
  rough.set(c.label, (rough.get(c.label) ?? 0) + sec);
}

const listing = [...rough]
  .sort((a, b) => b[1] - a[1])
  .map(([label, sec]) => `- ${label} (${f1(sec)} min)`)
  .join("\n");

console.log("Discovered labels before merging:");
console.log(listing, "\n");

let map = {};
try {
  const r = await callJson(`${CONSOLIDATE}\n\nLabels:\n${listing}`, 1024);
  map = r.map ?? {};
} catch (e) {
  console.log(`Consolidation failed, reporting unmerged: ${e.message ?? e}`);
}

const canon = (label) => map[label] ?? label;

const totals = new Map();
for (const c of chunks) {
  const name = canon(c.label);
  const sec = c.lines.reduce((s, u) => s + dur(u), 0);
  const row = totals.get(name) ?? { sec: 0, chunks: 0, mixed: 0, notes: [] };
  row.sec += sec;
  row.chunks += 1;
  if (c.mixed) row.mixed += 1;
  if (c.note && row.notes.length < 3) row.notes.push(c.note);
  totals.set(name, row);
}

const summary = [...totals]
  .map(([label, r]) => ({ label, ...r }))
  .sort((a, b) => b.sec - a.sec);

const threshold = ownSecTotal * CLAIM_SHARE;

console.log(`Own time in window: ${f1(ownSecTotal)} min`);
console.log(`Claim 4 threshold, 10 percent of own time: ${f1(threshold)} min\n`);

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
console.log(
  `${pad("discovered topic", 34)} ${rpad("min", 8)} ${rpad("share", 7)} ${rpad("chunks", 7)}`
);
for (const r of summary) {
  const share = ownSecTotal ? (r.sec / ownSecTotal) * 100 : 0;
  console.log(
    `${pad(r.label, 34)} ${rpad(f1(r.sec), 8)} ${rpad(`${share.toFixed(1)}%`, 7)} ` +
      `${rpad(r.chunks, 7)}${r.mixed ? `  ${r.mixed} mixed` : ""}`
  );
}

const failed = chunks.filter((c) => c.label === "(failed)");
const failedSec = failed.reduce(
  (t, c) => t + c.lines.reduce((s, u) => s + dur(u), 0),
  0
);

// A claim verdict computed over chunks that never got a label is not a
// verdict. An earlier run of this script printed "Claim 4 is FALSE" off 42
// consecutive API failures, which is a false published result waiting to
// happen, so scoring now refuses rather than guesses.
if (failed.length) {
  console.log(
    `\n${failed.length} of ${chunks.length} chunks failed (${f1(failedSec)} min ` +
      `of ${f1(pooledSec)}). First error:\n  ${failed[0].error}`
  );
  console.log(
    `\nClaim 4 NOT SCORED. Unlabelled time cannot be ruled above or below ` +
      `the threshold, and reporting a verdict over it would be reporting the ` +
      `failure as a finding. Fix the cause and re-run.`
  );
  if (/BEDROCK_MODEL_ID|ANTHROPIC_API_KEY/.test(failed[0].error ?? "")) {
    console.log(`\n  Looks like the env was not loaded. Try:`);
    console.log(`  node --env-file=.env src/name-pool.mjs`);
  }
  process.exit(1);
}

const largest = summary[0];
const over = summary.filter((r) => r.sec > threshold);
const nearBand = summary.filter(
  (r) => Math.abs(r.sec - threshold) <= ESCALATE_BAND_SEC
);

console.log(
  `\nLargest single unpredicted topic: ${largest.label}, ` +
    `${f1(largest.sec)} min, ${((largest.sec / ownSecTotal) * 100).toFixed(1)}%`
);

if (nearBand.length) {
  console.log(
    `\nESCALATE. ${nearBand.map((r) => r.label).join(", ")} ` +
      `${nearBand.length === 1 ? "sits" : "sit"} within 15 minutes of the ` +
      `threshold. Chunk-level labelling is too coarse to score claim 4 here. ` +
      `Redo this pass per utterance using the vocabulary above.`
  );
} else {
  console.log(
    `\nClaim 4 is ${over.length ? "FALSE" : "TRUE"}: ` +
      `${over.length ? `${over.length} topic(s) exceed` : "no single unpredicted topic exceeds"} ` +
      `10 percent, and nothing sits close enough to the line for the ` +
      `chunk-level granularity to be in question.`
  );
}

await fs.mkdir(outDir, { recursive: true });
const out = path.join(outDir, "named.json");
await fs.writeFile(
  out,
  JSON.stringify(
    {
      ownSec: ownSecTotal,
      pooledSec,
      threshold,
      escalate: nearBand.map((r) => r.label),
      summary,
      map,
      chunks: chunks.map((c) => ({
        id: c.id,
        title: c.title,
        label: c.label,
        canonical: canon(c.label),
        note: c.note,
        mixed: c.mixed === true,
        from: c.indices[0],
        to: c.indices[c.indices.length - 1],
        sec: c.lines.reduce((s, u) => s + dur(u), 0),
      })),
    },
    null,
    2
  ),
  "utf8"
);
console.log(`\nWrote ${out}`);
