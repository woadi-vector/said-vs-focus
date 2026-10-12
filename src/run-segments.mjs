// Windows a conversation, classifies each window, merges adjacent windows
// sharing a label, and writes the segments to disk.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { windows, merge } from "./segment.mjs";
import { classify } from "./classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const inDir = path.join(here, "..", "data", "conversations");
const outDir = path.join(here, "..", "data", "segments");

const CONCURRENCY = 4;

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

const only = process.argv[2];
await fs.mkdir(outDir, { recursive: true });

const files = (await fs.readdir(inDir)).filter(
  (f) => !only || f === `${only}.json`
);

for (const f of files) {
  const id = f.replace(/\.json$/, "");
  const c = JSON.parse(await fs.readFile(path.join(inDir, f), "utf8"));
  const utts = (c.transcriptions ?? []).flatMap((t) => t.utterances ?? []);
  const ws = windows(utts);
  if (ws.length === 0) continue;

  process.stdout.write(`${id}  ${ws.length} windows  `);

  const labelled = await pool(ws, CONCURRENCY, async (w) => {
    try {
      const r = await classify(w.utterances);
      process.stdout.write(r.label === "own" ? "o" : r.label === "media" ? "m" : "?");
      return { ...w, label: r.label, confidence: r.confidence, mixed: r.mixed, reasoning: r.reasoning };
    } catch (e) {
      process.stdout.write("!");
      return { ...w, label: "error", confidence: 0, mixed: null, error: e.message };
    }
  });

  const segments = merge(labelled).map((s) => ({
    ...s,
    utterances: undefined,
    utteranceCount: s.utterances.length,
  }));

  await fs.writeFile(
    path.join(outDir, `${id}.json`),
    JSON.stringify({ id, title: c.short_summary ?? "", segments }, null, 2),
    "utf8"
  );

  const own = segments.filter((s) => s.label === "own");
  const ownSec = own.reduce((t, s) => t + s.speechSec, 0);
  const allSec = segments.reduce((t, s) => t + s.speechSec, 0);
  console.log(
    `\n  ${segments.length} segments, own ${Math.round(ownSec / 60)}m of ${Math.round(allSec / 60)}m  ${c.short_summary ?? ""}`
  );
}