// Pulls conversation history to disk so development stops hitting the API.
// Resumable: skips anything already saved. Run it again any time.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient } from "./bee.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "data", "conversations");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bee = makeClient();
await fs.mkdir(outDir, { recursive: true });

const existing = new Set(
  (await fs.readdir(outDir)).map((f) => f.replace(/\.json$/, ""))
);
console.log(`already on disk: ${existing.size}`);

let cursor;
let page = 0;
let seen = 0;
let fetched = 0;

while (true) {
  const res = await bee.api.conversations.list({ limit: 50, cursor });
  const list = res.conversations ?? [];
  page += 1;
  console.log(`page ${page}: ${list.length} conversations`);
  if (list.length === 0) break;

  for (const summary of list) {
    seen += 1;
    const id = String(summary.id);
    if (existing.has(id)) continue;

    const full = await bee.api.conversations.get(id);
    const conv = full.conversation ?? full;
    await fs.writeFile(
      path.join(outDir, `${id}.json`),
      JSON.stringify(conv, null, 2),
      "utf8"
    );
    fetched += 1;
    const n = (conv.transcriptions ?? []).reduce(
      (t, s) => t + (s.utterances?.length ?? 0),
      0
    );
    console.log(`  saved ${id}  ${n} utterances  ${conv.short_summary ?? ""}`);
    await sleep(250);
  }

  cursor = res.next_cursor;
  if (!cursor) break;
}

console.log(`\nseen ${seen}, newly fetched ${fetched}`);