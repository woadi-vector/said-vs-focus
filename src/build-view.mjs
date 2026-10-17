// Builds the single payload the viewer reads: data/view/payload.json.
//
// Everything the page needs, computed once here rather than in the browser,
// with one exception that matters. Topic seconds are broken out PER SEGMENT,
// not just per conversation, because the page has to be able to exclude a
// segment and show the ranking change. Excluding the Angel Investing webinar
// has to actually move the numbers, and that is impossible if a topic's time
// is only known at conversation granularity.
//
// PRIVACY: this file contains real utterance text, real names, and real
// locations. data/ is gitignored and stays that way. Nothing built here is
// committed or published. A shareable payload, if one is ever wanted, is a
// separate redacted build made on purpose.
//
// Usage:
//   node src/build-view.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepare } from "./segment.mjs";
import { TOPICS, UNPREDICTED, statedRanking } from "./topics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const convDir = path.join(here, "..", "data", "conversations");
const segDir = path.join(here, "..", "data", "segments");
const attrDir = path.join(here, "..", "data", "attribution");
const varDir = path.join(here, "..", "data", "variance");
const outDir = path.join(here, "..", "data", "view");

// The measurement window from docs/sealed-prediction.md, in the wearer's own
// time zone. Written as explicit offsets rather than local-time parsing so the
// boundary does not move with the machine running the build.
const WINDOW_FROM = Date.parse("2026-10-10T00:00:00-05:00");
const WINDOW_TO = Date.parse("2026-10-18T00:00:00-05:00");

const SAMPLES_PER_TOPIC = 6;
const SAMPLE_CHARS = 220;

const dur = (u) => Math.max(0, (u.end ?? 0) - (u.start ?? 0));

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

const conversations = [];
const segFiles = (await fs.readdir(segDir)).filter((f) => f.endsWith(".json"));

for (const f of segFiles) {
  const id = f.replace(/\.json$/, "");
  const seg = await readJson(path.join(segDir, f));
  const conv = await readJson(path.join(convDir, `${id}.json`));
  if (!seg || !conv) continue;

  const attr = await readJson(path.join(attrDir, `${id}.json`));
  const utts = prepare(
    (conv.transcriptions ?? []).flatMap((t) => t.utterances ?? [])
  );
  if (utts.length === 0) continue;

  // Which topic each attributed utterance belongs to, so segment-level sums
  // and samples can both be built from one index.
  const topicOf = new Map();
  for (const [topic, indices] of Object.entries(attr?.lines ?? {})) {
    for (const i of indices) topicOf.set(i, topic);
  }

  const startMs = utts[0].spoken_at;

  const segments = seg.segments.map((s, order) => {
    const topics = {};
    const samples = {};

    if (s.label === "own") {
      for (let i = s.from; i < s.to; i++) {
        const topic = topicOf.get(i);
        if (!topic) continue;
        topics[topic] = (topics[topic] ?? 0) + dur(utts[i]);

        const bucket = (samples[topic] ??= []);
        const text = (utts[i].text ?? "").trim();
        // Longest lines first would be better evidence, but order is cheaper
        // to reason about and these are shown as "lines from this segment",
        // not as the strongest ones.
        if (bucket.length < SAMPLES_PER_TOPIC && text.length > 12) {
          bucket.push({
            index: i,
            atMs: utts[i].spoken_at,
            sec: Math.round(dur(utts[i])),
            text: text.slice(0, SAMPLE_CHARS),
          });
        }
      }
    }

    return {
      order,
      label: s.label,
      confidence: s.confidence,
      mixed: s.mixed ?? false,
      from: s.from,
      to: s.to,
      startMs: s.startMs,
      endMs: s.endMs,
      speechSec: s.speechSec,
      windows: s.windows,
      // Why the filter called it what it called it. This is what a person
      // clicking a segment is owed before being asked to confirm it.
      reasons: (s.notes ?? [])
        .map((n) => n.reasoning)
        .filter(Boolean)
        .slice(0, 4),
      errors: s.errors ?? [],
      topics,
      samples,
    };
  });

  const byLabel = {};
  for (const s of segments) {
    byLabel[s.label] = (byLabel[s.label] ?? 0) + s.speechSec;
  }

  conversations.push({
    id,
    title: seg.title ?? "",
    startMs,
    inWindow: startMs >= WINDOW_FROM && startMs < WINDOW_TO,
    capturedSec: segments.reduce((t, s) => t + s.speechSec, 0),
    byLabel,
    noneSec: attr?.noneSec ?? 0,
    omittedSec: attr?.omittedSec ?? 0,
    attributed: Boolean(attr),
    segments,
  });
}

conversations.sort((a, b) => a.startMs - b.startMs);

// Observed spread per topic, where it has been measured. Absent for topics
// no variance run has covered, and the page says so rather than implying
// precision it does not have.
const variance = {};
let floorSec = 0;
for (const f of (await fs.readdir(varDir).catch(() => [])).filter((x) =>
  x.endsWith(".json")
)) {
  const v = await readJson(path.join(varDir, f));
  if (!v) continue;
  for (const row of v.summary ?? []) {
    const entry = (variance[row.row] ??= { runs: 0, minSec: 0, maxSec: 0 });
    entry.runs = Math.max(entry.runs, v.runs ?? 0);
    entry.minSec += row.min ?? 0;
    entry.maxSec += row.max ?? 0;
    // The reporting floor, per docs/variance.md: the largest swing seen
    // between identical runs. Below it, a topic total cannot be told apart
    // from a single mis-assignment, so the viewer declines to rank it.
    // Derived from the runs rather than chosen, and recomputed every build so
    // it cannot be tuned after the fact.
    floorSec = Math.max(floorSec, (row.max ?? 0) - (row.min ?? 0));
  }
}

const payload = {
  builtAt: new Date().toISOString(),
  window: {
    fromMs: WINDOW_FROM,
    toMs: WINDOW_TO,
    label: "2026-10-10 to 2026-10-17",
  },
  // Left column. Only what the wearer actually named, with its source.
  stated: statedRanking().map((t) => ({
    id: t.id,
    label: t.label,
    rank: t.statedPriority,
    commitment: t.commitment,
    source: t.commitmentSource,
  })),
  topics: TOPICS.map((t) => ({
    id: t.id,
    label: t.label,
    definition: t.definition,
    predictedShare: t.predictedShare,
    commitment: t.commitment,
    source: t.commitmentSource,
    statedRank: t.statedPriority,
  })).concat([
    {
      id: UNPREDICTED.id,
      label: UNPREDICTED.label,
      definition: UNPREDICTED.definition,
      predictedShare: UNPREDICTED.predictedShare,
      commitment: null,
      source: null,
      statedRank: null,
    },
  ]),
  variance,
  floorSec,
  floorMeasured: floorSec > 0,
  conversations,
};

await fs.mkdir(outDir, { recursive: true });
const file = path.join(outDir, "payload.json");
await fs.writeFile(file, JSON.stringify(payload), "utf8");

// A build that writes a payload nobody checks is how a demo ends up showing
// zeros on camera, so print what the page will show.
const inWindow = conversations.filter((c) => c.inWindow);
const sum = (list, label) =>
  list.reduce((t, c) => t + (c.byLabel[label] ?? 0), 0);
const mins = (s) => Math.round(s / 60);

const ownWindow = sum(inWindow, "own");
const capturedWindow = inWindow.reduce((t, c) => t + c.capturedSec, 0);

const topicWindow = new Map();
for (const c of inWindow) {
  for (const s of c.segments) {
    for (const [topic, sec] of Object.entries(s.topics)) {
      topicWindow.set(topic, (topicWindow.get(topic) ?? 0) + sec);
    }
  }
}

console.log(`Wrote ${file}`);
console.log(
  `${conversations.length} conversations, ${inWindow.length} in window ` +
    `(${payload.window.label})`
);
console.log(
  `Window: ${mins(ownWindow)}m own of ${mins(capturedWindow)}m captured ` +
    `(${capturedWindow ? ((ownWindow / capturedWindow) * 100).toFixed(1) : "0"}% own)`
);
console.log(
  floorSec
    ? `Reporting floor: ${(floorSec / 60).toFixed(1)} min, the largest swing between replicate runs.`
    : "Reporting floor: not set. No variance runs on disk, so nothing is withheld."
);
console.log("Window topics by own time:");
for (const [topic, sec] of [...topicWindow].sort((a, b) => b[1] - a[1])) {
  const pct = ownWindow ? ((sec / ownWindow) * 100).toFixed(1) : "0.0";
  const held = sec < floorSec ? "  withheld, below floor" : "";
  console.log(
    `  ${topic.padEnd(22)} ${String(mins(sec)).padStart(4)}m  ${pct}%${held}`
  );
}

const unattributed = conversations.filter(
  (c) => !c.attributed && (c.byLabel.own ?? 0) > 0
);
if (unattributed.length) {
  console.log(
    `\n${unattributed.length} conversation(s) have own time but no ` +
      `attribution file. Run src/attribute.mjs first: ` +
      unattributed.map((c) => c.id).join(", ")
  );
}
