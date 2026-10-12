import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient } from "./bee.mjs";
import { classify } from "./classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const startArg = Number(process.argv[3]);
const count = Number(process.argv[4] ?? 120);

if (!id) {
  console.error("usage: node --env-file=.env src/smoke.mjs <id> [start] [count]");
  process.exit(1);
}

const file = path.join(here, "..", "data", "conversations", `${id}.json`);
const c = JSON.parse(await fs.readFile(file, "utf8"));
const all = (c.transcriptions ?? []).flatMap((t) => t.utterances ?? []);

const from = Number.isFinite(startArg)
  ? startArg
  : Math.max(0, Math.floor(all.length / 2) - Math.floor(count / 2));
const window = all.slice(from, from + count);

console.log(c.short_summary ?? "(no title)");
console.log(`utterances ${from} to ${from + window.length} of ${all.length}\n`);

let facts = [];
try {
  const bee = makeClient();
  const res = await bee.api.facts.list();
  const list = res.facts ?? res ?? [];
  facts = list.map((f) => (typeof f === "string" ? f : f.text)).filter(Boolean);
  console.log(`grounding on ${facts.length} facts\n`);
} catch (e) {
  console.log(`no facts available (${e.message})\n`);
}

console.log(JSON.stringify(await classify(window, facts), null, 2));