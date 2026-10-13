// Windows a conversation, classifies each window, merges adjacent windows
// sharing a label, and writes the segments to disk.
//
// Failures are retried with backoff, then recorded on the window itself so the
// error survives the merge and lands in the written record. A segment labelled
// "error" with no explanation is worse than no segment at all.
//
// The label string is printed in window order, not completion order. Four
// windows classify at once, so writing each character as it lands produces a
// string that looks like a timeline and is not one.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { windows, merge } from "./segment.mjs";
import { classify } from "./classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const inDir = path.join(here, "..", "data", "conversations");
const outDir = path.join(here, "..", "data", "segments");

const CONCURRENCY = 4;
const ATTEMPTS = 4;

const MARK = { own: "o", media: "m", ambient: "a", unclear: "?", error: "!" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function classifyWithRetry(w) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await classify(w.utterances);
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

const only = process.argv[2];
await fs.mkdir(outDir, { recursive: true });

const files = (await fs.readdir(inDir)).filter(
  (f) => !only || f === `${only}.json`
);

const failures = [];

for (const f of files) {
  const id = f.replace(/\.json$/, "");
  const c = JSON.parse(await fs.readFile(path.join(inDir, f), "utf8"));
  const utts = (c.transcriptions ?? []).flatMap((t) => t.utterances ?? []);
  const ws = windows(utts);
  if (ws.length === 0) continue;

  process.stdout.write(`${id}  ${ws.length} windows  `);

  const labelled = await pool(ws, CONCURRENCY, async (w) => {
    try {
      const r = await classifyWithRetry(w);
      return {
        ...w,
        label: r.label,
        confidence: r.confidence,
        mixed: r.mixed,
        reasoning: r.reasoning,
      };
    } catch (e) {
      failures.push(`${id} window ${w.from}-${w.to}: ${e.message}`);
      return {
        ...w,
        label: "error",
        confidence: 0,
        mixed: null,
        error: e.message,
      };
    }
  });

  // In window order, so position means time.
  process.stdout.write(labelled.map((w) => MARK[w.label] ?? "?").join(""));

  const segments = merge(labelled).map((s) => {
    const { utterances, ...rest } = s;
    return { ...rest, utteranceCount: utterances.length };
  });

  await fs.writeFile(
    path.join(outDir, `${id}.json`),
    JSON.stringify({ id, title: c.short_summary ?? "", segments }, null, 2),
    "utf8"
  );

  const own = segments.filter((s) => s.label === "own");
  const ownSec = own.reduce((t, s) => t + s.speechSec, 0);
  const allSec = segments.reduce((t, s) => t + s.speechSec, 0);
  console.log(
    `\n  ${segments.length} segments, own ${Math.round(ownSec / 60)}m of ` +
      `${Math.round(allSec / 60)}m  ${c.short_summary ?? ""}`
  );
}

if (failures.length) {
  console.log(`\n${failures.length} windows failed after ${ATTEMPTS} attempts:`);
  for (const line of failures) console.log(`  ${line}`);
} else {
  console.log("\nno failures");
}
