import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const file = path.join(here, "..", "data", "conversations", `${id}.json`);

const c = JSON.parse(await fs.readFile(file, "utf8"));
const utts = (c.transcriptions ?? []).flatMap((t) => t.utterances ?? []);

console.log(`${c.short_summary}   ${utts.length} utterances\n`);

const step = Math.max(1, Math.floor(utts.length / 25));
for (let i = 0; i < utts.length; i += step) {
  console.log(`[${i}] ${utts[i].text}`);
}