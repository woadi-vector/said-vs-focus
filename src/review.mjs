// Dumps every segment with a text sample and its predicted label into a
// reviewable file. Mark each verdict column y or n. The result is both the
// labelled fixture set and the accuracy number.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const segDir = path.join(here, "..", "data", "segments");
const convDir = path.join(here, "..", "data", "conversations");
const out = path.join(here, "..", "data", "review.md");

const lines = ["# Segment review", "", "Mark each verdict y if the label is right, n if wrong. If n, write the correct label after it.", ""];

for (const f of (await fs.readdir(segDir)).sort()) {
  const s = JSON.parse(await fs.readFile(path.join(segDir, f), "utf8"));
  const c = JSON.parse(await fs.readFile(path.join(convDir, f), "utf8"));
  const utts = (c.transcriptions ?? [])
    .flatMap((t) => t.utterances ?? [])
    .filter((u) => Number.isFinite(u.spoken_at) && (u.text ?? "").trim())
    .sort((a, b) => a.spoken_at - b.spoken_at);

  lines.push(`## ${s.id}  ${s.title}`, "");

  for (const [i, seg] of s.segments.entries()) {
    const slice = utts.slice(seg.from, seg.to);
    const step = Math.max(1, Math.floor(slice.length / 8));
    const sample = [];
    for (let j = 0; j < slice.length; j += step) sample.push(slice[j].text.trim());

    const when = new Date(seg.startMs).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

    lines.push(
      `### seg ${i}  **${seg.label}**  ${Math.round(seg.speechSec / 60)}m  ${when}`,
      "",
      "verdict: ",
      "",
      ...sample.slice(0, 8).map((t) => `- ${t.slice(0, 110)}`),
      ""
    );
  }
}

await fs.writeFile(out, lines.join("\n"), "utf8");
console.log(`wrote ${out}`);