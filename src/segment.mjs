// Cuts an utterance stream into windows for classification, then merges
// adjacent windows that share a label into segments.
//
// Fixed windows rather than silence detection. Gap distribution was measured
// across the corpus: 99.7% of gaps fall under two minutes and the longest is
// 349 seconds, inside a conversation running 349 minutes. Ambient audio has no
// silence structure, so context changes are not marked by time. See
// docs/segmentation.md.

export const WINDOW = 80;

export function windows(utterances, size = WINDOW) {
  const u = utterances
    .filter((x) => Number.isFinite(x.spoken_at) && (x.text ?? "").trim())
    .sort((a, b) => a.spoken_at - b.spoken_at);

  const out = [];
  for (let i = 0; i < u.length; i += size) {
    const slice = u.slice(i, i + size);
    if (slice.length === 0) continue;
    out.push({
      from: i,
      to: i + slice.length,
      utterances: slice,
      startMs: slice[0].spoken_at,
      endMs: slice.at(-1).spoken_at,
      speechSec: slice.reduce(
        (t, x) => t + Math.max(0, (x.end ?? 0) - (x.start ?? 0)),
        0
      ),
      label: null,
      confidence: null,
      mixed: null,
    });
  }
  return out;
}

export function merge(labelled) {
  const segments = [];
  for (const w of labelled) {
    const last = segments.at(-1);
    if (last && last.label === w.label) {
      last.to = w.to;
      last.endMs = w.endMs;
      last.speechSec += w.speechSec;
      last.utterances.push(...w.utterances);
      last.windows += 1;
      last.confidence = Math.min(last.confidence, w.confidence ?? 1);
    } else {
      segments.push({
        label: w.label,
        confidence: w.confidence ?? null,
        from: w.from,
        to: w.to,
        startMs: w.startMs,
        endMs: w.endMs,
        speechSec: w.speechSec,
        utterances: [...w.utterances],
        windows: 1,
      });
    }
  }
  return segments;
}