// Cuts an utterance stream into windows for classification, then merges
// adjacent windows that share a label into segments.
//
// Fixed windows rather than silence detection. Gap distribution was measured
// across the corpus: 99.7% of gaps fall under two minutes and the longest is
// 349 seconds, inside a conversation running 349 minutes. Ambient audio has no
// silence structure, so context changes are not marked by time. See
// docs/segmentation.md.
//
// Merging keeps every window's own verdict in `notes`. A segment is an
// aggregate, and a user asking why a block was called television is owed the
// evidence that produced that call, not just the label it collapsed into.

export const WINDOW = 80;

// A trailing slice this small is folded into the window before it. Measured
// reason: conversation 10910324 ended with a one-utterance window, which cost
// a classification call and returned "unclear" because a single generic
// reaction line carries no evidence either way. That is an artifact of where
// the cut landed, not a property of the audio.
export const MIN_TAIL = 16;

// Every `from` and `to` written into a segment file indexes into THIS array.
// Anything that later re-reads a conversation and slices by those indices must
// build its array the same way, so the one definition lives here and callers
// import it rather than repeating the filter and the sort.
export function prepare(utterances) {
  return utterances
    .filter((x) => Number.isFinite(x.spoken_at) && (x.text ?? "").trim())
    .sort((a, b) => a.spoken_at - b.spoken_at);
}

export function windows(utterances, size = WINDOW, minTail = MIN_TAIL) {
  const u = prepare(utterances);

  const bounds = [];
  for (let i = 0; i < u.length; i += size) {
    bounds.push([i, Math.min(i + size, u.length)]);
  }

  // Fold a short tail back, unless it is the only window.
  if (bounds.length > 1) {
    const [tailFrom, tailTo] = bounds.at(-1);
    if (tailTo - tailFrom < minTail) {
      bounds.pop();
      bounds[bounds.length - 1][1] = tailTo;
    }
  }

  return bounds.map(([from, to]) => {
    const slice = u.slice(from, to);
    return {
      from,
      to,
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
      reasoning: null,
      error: null,
    };
  });
}

// One note per contributing window: what it was called, how sure, and why.
function noteOf(w) {
  return {
    from: w.from,
    to: w.to,
    startMs: w.startMs,
    confidence: w.confidence ?? null,
    mixed: w.mixed ?? null,
    reasoning: w.reasoning ?? null,
    error: w.error ?? null,
  };
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
      last.confidence = Math.min(last.confidence ?? 1, w.confidence ?? 1);
      last.mixed = last.mixed || Boolean(w.mixed);
      last.notes.push(noteOf(w));
      if (w.error) last.errors.push(`${w.from}-${w.to}: ${w.error}`);
    } else {
      segments.push({
        label: w.label,
        confidence: w.confidence ?? null,
        mixed: Boolean(w.mixed),
        from: w.from,
        to: w.to,
        startMs: w.startMs,
        endMs: w.endMs,
        speechSec: w.speechSec,
        utterances: [...w.utterances],
        windows: 1,
        notes: [noteOf(w)],
        errors: w.error ? [`${w.from}-${w.to}: ${w.error}`] : [],
      });
    }
  }
  return segments;
}
