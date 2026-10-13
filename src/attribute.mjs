// Assigns a topic to each utterance inside segments the filter called "own",
// then sums utterance durations per topic.
//
// Runs only over own time. Media and ambient segments are skipped entirely:
// the denominator decision in docs/denominator.md says topic shares are
// computed over conversation the wearer took part in, and television is not
// eligible to be a topic under either column.
//
// Attribution is per utterance rather than per conversation because Bee
// over-merges. One record titled "Potty Duty, The Menu, Warzone" runs 153
// minutes and contains three unrelated activities, so a conversation-level
// topic would be wrong for two thirds of it.
//
// Attribution is semantic, not lexical. Keyword matching was not tried and
// will not be: lexical features were measured on this corpus and fail to
// separate even the much easier real-versus-media question (src/features.mjs).
//
// THREE KINDS OF UNASSIGNED TIME, kept apart on purpose:
//   none      the model read the line and judged it to carry no subject:
//             backchannel, greetings, fragments. A real category.
//   omitted   the model simply left the index out of its reply. A defect in
//             the run, not a fact about the audio. Repaired by re-asking for
//             the missing indices with the surrounding chunk still in view,
//             and whatever survives repair is reported as its own row rather
//             than pooled into "no subject", where it would have silently
//             padded the second-largest number in the table.
//   failed    every attempt on the chunk threw. Reported separately again.
//
// Usage:
//   node --env-file=.env src/attribute.mjs            all conversations
//   node --env-file=.env src/attribute.mjs 11191002   one conversation

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepare } from "./segment.mjs";
import { definitionBlock, topicIds, UNPREDICTED } from "./topics.mjs";
import { ask, parseJson } from "./llm.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const convDir = path.join(here, "..", "data", "conversations");
const segDir = path.join(here, "..", "data", "segments");
const outDir = path.join(here, "..", "data", "attribution");

// Smaller than the classification window. Classification asks one question of
// a whole run; attribution asks a question per line, so the reply grows with
// the window and a long one risks truncation.
const CHUNK = 40;
const CONCURRENCY = 3;
const ATTEMPTS = 4;
const REPAIRS = 2;

const VALID = new Set([...topicIds(), UNPREDICTED.id, "none"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTRUCTIONS = `
You are assigning a topic to each line of a transcribed conversation the
wearer of an always-on microphone took part in.

Topics:
${definitionBlock()}
  ${UNPREDICTED.id}: a real subject of conversation that none of the topics
           above covers
  none     no subject matter at all: greetings, backchannel ("mhm", "yeah"),
           filler, inaudible fragments, or lines too short to carry a topic

Rules:
  - Assign by subject matter, not by who is speaking. Every participant's
    speech counts, including people other than the wearer.
  - A line continues the surrounding topic unless its own content changes the
    subject. Short reactions inside a run about one topic belong to that topic.
  - Use "none" freely. Most conversations contain a lot of it, and inflating
    topic time with backchannel is worse than leaving it unassigned.
  - Use "${UNPREDICTED.id}" for a genuine subject with no matching topic. Do
    not stretch a topic definition to fit.
  - Do not infer a topic from tone, vocabulary level, or how fluent a line is.

Reply with JSON only, leading with {. Use the compact pair form:

{
  "a": [[0,"none"],[1,"warzone"],[2,"warzone"]],
  "why": { "warzone": "one short sentence of evidence for this topic" }
}

"why" holds one entry per topic you assigned, excluding "none". Keep each to
one sentence. No prose outside the JSON.
`.trim();

function buildPrompt(slice, offset, needed) {
  const lines = slice
    .map((u, i) => `[${offset + i}] ${(u.text ?? "").trim()}`)
    .join("\n");

  const ask =
    needed && needed.length
      ? `Your previous reply left out some lines. Assign ONLY these indices, ` +
        `every one of them, using the lines below for context:\n` +
        `${needed.join(", ")}`
      : `Assign every index from ${offset} to ${offset + slice.length - 1}, ` +
        `exactly once each.`;

  return `${INSTRUCTIONS}\n\n${ask}\n\nLines:\n${lines}`;
}

async function callChunk(slice, offset, needed) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const reply = await ask(buildPrompt(slice, offset, needed), {
        maxTokens: 2048,
      });
      const parsed = parseJson(reply);
      const pairs = Array.isArray(parsed.a) ? parsed.a : [];

      const assigned = new Map();
      for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const [idx, topic] = pair;
        if (!Number.isInteger(idx) || !VALID.has(topic)) continue;
        if (idx < offset || idx >= offset + slice.length) continue;
        assigned.set(idx, topic);
      }
      return { assigned, why: parsed.why ?? {} };
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

function mergeWhy(into, from) {
  for (const [topic, reason] of Object.entries(from ?? {})) {
    if (!VALID.has(topic) || topic === "none") continue;
    if (!into[topic]) into[topic] = reason;
  }
  return into;
}

// One chunk, including however many repair rounds it takes to get a complete
// set of indices back, or an honest record that it never arrived.
async function attributeChunk(c) {
  const first = await callChunk(c.slice, c.from);
  const assigned = first.assigned;
  const why = mergeWhy({}, first.why);

  const stillMissing = () => {
    const out = [];
    for (let i = c.from; i < c.to; i++) if (!assigned.has(i)) out.push(i);
    return out;
  };

  let missing = stillMissing();
  let repairs = 0;

  while (missing.length && repairs < REPAIRS) {
    repairs += 1;
    const again = await callChunk(c.slice, c.from, missing);
    for (const [idx, topic] of again.assigned) {
      if (!assigned.has(idx)) assigned.set(idx, topic);
    }
    mergeWhy(why, again.why);
    missing = stillMissing();
  }

  return { assigned, why, repairs, omitted: missing };
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

const dur = (u) => Math.max(0, (u.end ?? 0) - (u.start ?? 0));
const mins = (s) => Math.round(s / 60);

const only = process.argv[2];
await fs.mkdir(outDir, { recursive: true });

const segFiles = (await fs.readdir(segDir)).filter(
  (f) => !only || f === `${only}.json`
);

if (segFiles.length === 0) {
  console.log(
    only
      ? `No segment file for ${only}. Run src/run-segments.mjs first.`
      : "No segment files. Run src/run-segments.mjs first."
  );
  process.exit(1);
}

const failures = [];
const corpusTotals = new Map();
let corpusNone = 0;
let corpusOmitted = 0;
let corpusOmittedCount = 0;
let corpusRepairs = 0;

for (const f of segFiles) {
  const id = f.replace(/\.json$/, "");
  const seg = JSON.parse(await fs.readFile(path.join(segDir, f), "utf8"));
  const own = seg.segments.filter((s) => s.label === "own");
  if (own.length === 0) continue;

  const conv = JSON.parse(
    await fs.readFile(path.join(convDir, `${id}.json`), "utf8")
  );
  // Same filter and sort the segmenter used, so from/to line up.
  const utts = prepare(
    (conv.transcriptions ?? []).flatMap((t) => t.utterances ?? [])
  );

  // Every own utterance, cut into chunks that do not straddle segments.
  const chunks = [];
  for (const s of own) {
    for (let i = s.from; i < s.to; i += CHUNK) {
      chunks.push({ from: i, to: Math.min(i + CHUNK, s.to) });
    }
  }
  for (const c of chunks) c.slice = utts.slice(c.from, c.to);

  process.stdout.write(`${id}  ${chunks.length} chunks  `);

  const results = await pool(chunks, CONCURRENCY, async (c) => {
    try {
      const r = await attributeChunk(c);
      // + clean, : needed repair, ~ still incomplete after repair
      process.stdout.write(r.omitted.length ? "~" : r.repairs ? ":" : "+");
      return { ...c, ...r };
    } catch (e) {
      process.stdout.write("!");
      failures.push(`${id} chunk ${c.from}-${c.to}: ${e.message}`);
      return {
        ...c,
        assigned: new Map(),
        why: {},
        repairs: 0,
        omitted: [],
        failed: e.message,
      };
    }
  });

  const totals = new Map();
  const why = new Map();
  // Which utterances each topic was built from, so a topic can show its own
  // lines rather than only asserting a number. The UI resolves these against
  // data/conversations/<id>.json, which is indexed the same way via prepare().
  const lines = new Map();
  let noneSec = 0;
  let omittedSec = 0;
  let omittedCount = 0;
  let repairCount = 0;

  for (const r of results) {
    repairCount += r.repairs ?? 0;
    for (const [topic, reason] of Object.entries(r.why ?? {})) {
      if (!VALID.has(topic) || topic === "none") continue;
      if (!why.has(topic)) why.set(topic, []);
      why.get(topic).push({ from: r.from, to: r.to, reason });
    }
    for (let i = r.from; i < r.to; i++) {
      const seconds = dur(utts[i]);
      const topic = r.assigned.get(i);

      if (topic === undefined) {
        omittedSec += seconds;
        omittedCount += 1;
        continue;
      }
      if (topic === "none") {
        noneSec += seconds;
        continue;
      }
      totals.set(topic, (totals.get(topic) ?? 0) + seconds);
      if (!lines.has(topic)) lines.set(topic, []);
      lines.get(topic).push(i);
    }
  }

  const ownSec = own.reduce((t, s) => t + s.speechSec, 0);

  await fs.writeFile(
    path.join(outDir, `${id}.json`),
    JSON.stringify(
      {
        id,
        title: seg.title ?? "",
        ownSec,
        noneSec,
        omittedSec,
        omittedCount,
        repairCount,
        topics: Object.fromEntries([...totals].sort((a, b) => b[1] - a[1])),
        evidence: Object.fromEntries(why),
        lines: Object.fromEntries(
          [...lines].map(([k, v]) => [k, v.sort((a, b) => a - b)])
        ),
        failures: results
          .filter((r) => r.failed)
          .map((r) => ({ from: r.from, to: r.to, error: r.failed })),
      },
      null,
      2
    ),
    "utf8"
  );

  for (const [topic, seconds] of totals) {
    corpusTotals.set(topic, (corpusTotals.get(topic) ?? 0) + seconds);
  }
  corpusNone += noneSec;
  corpusOmitted += omittedSec;
  corpusOmittedCount += omittedCount;
  corpusRepairs += repairCount;

  const top = [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} ${mins(v)}m`)
    .join(", ");
  console.log(
    `\n  own ${mins(ownSec)}m, no subject ${mins(noneSec)}m` +
      (omittedSec ? `, unresolved ${mins(omittedSec)}m` : "") +
      `  ${top || "nothing assigned"}`
  );
}

const attributed = [...corpusTotals.values()].reduce((a, b) => a + b, 0);
const denominator = attributed + corpusNone + corpusOmitted;
const pct = (s) => (denominator ? ((s / denominator) * 100).toFixed(1) : "0.0");
const row = (label, seconds) =>
  console.log(
    `  ${label.padEnd(22)} ${String(mins(seconds)).padStart(4)}m  ${pct(seconds)}%`
  );

console.log("\nOwn-time topic shares");
for (const [topic, seconds] of [...corpusTotals].sort((a, b) => b[1] - a[1])) {
  row(topic, seconds);
}
row("(no subject)", corpusNone);
if (corpusOmitted) row("(unresolved)", corpusOmitted);

if (corpusRepairs) {
  console.log(`\n${corpusRepairs} chunks needed a repair round.`);
}
if (corpusOmittedCount) {
  console.log(
    `${corpusOmittedCount} utterances never came back from the model after ` +
      `${REPAIRS} repair rounds. They are counted as unresolved, not as "no ` +
      `subject", and are excluded from every topic.`
  );
} else {
  console.log("\nEvery own utterance got an assignment.");
}
if (failures.length) {
  console.log(`\n${failures.length} chunks failed after ${ATTEMPTS} attempts:`);
  for (const line of failures) console.log(`  ${line}`);
} else {
  console.log("no failures");
}
