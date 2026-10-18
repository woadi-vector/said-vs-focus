// Writes the human spot-check verdicts back into data/segments, so a
// correction a person made in review actually moves the measurement.
//
// This is the point of the whole review loop. A disagreement rate that
// nobody acts on is a confession, not a correction.
//
// WHAT IT DOES NOT DO: it does not touch the classifier. src/classify.mjs is
// unchanged, and will make the same calls on the same audio tomorrow. The
// corrections recorded here are verdicts about these specific segments by the
// one person who was in the room, applied to this measurement only. Teaching
// the classifier from them, after seeing which way the errors fell, is the
// move this project exists to avoid.
//
// PROVENANCE. Nothing is silently overwritten. Every corrected segment keeps
// its original label, who changed it and when, so the viewer can show both and
// a reader can tell a machine judgement from a human one.
//
// The uncorrected segments are copied to data/segments-uncorrected first, so
// the pre-correction measurement stays reproducible and both can be published.
//
// Usage:
//   node src/apply-corrections.mjs          dry run, prints what would change
//   node src/apply-corrections.mjs --write  applies it

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const segDir = path.join(dataDir, "segments");
const backupDir = path.join(dataDir, "segments-uncorrected");
const spotPath = path.join(dataDir, "spot-check.json");
const recordPath = path.join(dataDir, "corrections.json");

const VALID = new Set(["own", "media", "ambient", "unclear"]);
const WRITE = process.argv.includes("--write");
const STAMP = new Date().toISOString().slice(0, 10);

const f1 = (s) => (s / 60).toFixed(1);

let spot;
try {
  spot = JSON.parse(await fs.readFile(spotPath, "utf8"));
} catch {
  console.log(`No ${spotPath}. Run: node src/spot-check.mjs score`);
  process.exit(1);
}

const corrections = spot.rows.filter(
  (r) => r.verdict === "n" && VALID.has(r.correction)
);

const unusable = spot.rows.filter(
  (r) => r.verdict === "n" && !VALID.has(r.correction)
);
if (unusable.length) {
  console.log(
    `${unusable.length} verdict(s) say the label is wrong but do not name a ` +
      `valid replacement, so they cannot be applied:`
  );
  for (const r of unusable) console.log(`  ${r.key}  "${r.raw}"`);
  console.log("");
}

if (corrections.length === 0) {
  console.log("No applicable corrections.");
  process.exit(0);
}

// Group by conversation.
const byConv = new Map();
for (const r of corrections) {
  const [id, idxStr] = r.key.split(":");
  const list = byConv.get(id) ?? [];
  list.push({ ...r, index: Number(idxStr) });
  byConv.set(id, list);
}

const changed = [];
const needsAttribution = new Set();
const skipped = [];

for (const [id, list] of byConv) {
  const file = path.join(segDir, `${id}.json`);
  let seg;
  try {
    seg = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    skipped.push({ id, why: "segment file missing" });
    continue;
  }

  for (const c of list) {
    const target = seg.segments?.[c.index];
    if (!target) {
      skipped.push({ id, why: `segment ${c.index} missing` });
      continue;
    }
    // The draw recorded the label at draw time. If it no longer matches, the
    // segmentation moved underneath the review and the verdict is about a
    // segment that no longer exists.
    if (target.label !== c.label) {
      skipped.push({
        id,
        why: `segment ${c.index} is now "${target.label}", was "${c.label}" when drawn`,
      });
      continue;
    }

    // own time changes only when own is entered or left.
    if (target.label === "own" || c.correction === "own") {
      needsAttribution.add(id);
    }

    changed.push({
      key: c.key,
      id,
      index: c.index,
      from: target.label,
      to: c.correction,
      sec: target.speechSec,
      mixed: c.mixed === true,
    });

    if (WRITE) {
      target.originalLabel = target.label;
      target.label = c.correction;
      target.correctedBy = `human spot check ${STAMP}`;
      if (c.mixed) target.humanMixed = true;
      seg.corrected = true;
    }
  }

  if (WRITE && changed.some((c) => c.id === id)) {
    await fs.mkdir(backupDir, { recursive: true });
    const backup = path.join(backupDir, `${id}.json`);
    try {
      await fs.access(backup);
    } catch {
      // Only back up the first time, so re-running cannot overwrite the
      // original with an already-corrected copy.
      await fs.copyFile(file, backup);
    }
    await fs.writeFile(file, JSON.stringify(seg, null, 2), "utf8");
  }
}

const ownIn = changed
  .filter((c) => c.to === "own")
  .reduce((t, c) => t + c.sec, 0);
const ownOut = changed
  .filter((c) => c.from === "own")
  .reduce((t, c) => t + c.sec, 0);

console.log(`${WRITE ? "Applied" : "Would apply"} ${changed.length} correction(s):\n`);
const pad = (s, n) => String(s).padEnd(n);
for (const c of changed.sort((a, b) => b.sec - a.sec)) {
  console.log(
    `  ${pad(c.key, 16)} ${pad(`${c.from} -> ${c.to}`, 20)} ${f1(c.sec).padStart(7)} min` +
      (c.mixed ? "  mixed" : "")
  );
}

if (skipped.length) {
  console.log(`\nSkipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  ${s.id}  ${s.why}`);
}

console.log(
  `\nOwn time: +${f1(ownIn)} min entering, -${f1(ownOut)} min leaving, ` +
    `net ${ownOut > ownIn ? "-" : "+"}${f1(Math.abs(ownIn - ownOut))} min`
);

const ids = [...needsAttribution].sort();
console.log(
  `\n${ids.length} conversation(s) need re-attribution because their own ` +
    `segments changed:\n  ${ids.join(" ")}`
);

if (!WRITE) {
  console.log(`\nDry run. Nothing written. Re-run with --write to apply.`);
  process.exit(0);
}

await fs.writeFile(
  recordPath,
  JSON.stringify(
    {
      appliedAt: new Date().toISOString(),
      source: "human spot check, docs/spot-check-draw.md",
      note:
        "Verdicts by the person who was present, applied to these segments " +
        "only. src/classify.mjs is deliberately unchanged.",
      changed,
      needsAttribution: ids,
      ownSecIn: ownIn,
      ownSecOut: ownOut,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`\nWrote ${recordPath}`);
console.log(`Originals preserved in ${backupDir}`);
console.log(
  `\nNext, re-attribute those conversations:\n\n` +
    `  foreach ($id in "${ids.join('","')}") { node --env-file=.env src\\attribute.mjs $id }\n\n` +
    `then rebuild: node src\\build-view.mjs`
);
