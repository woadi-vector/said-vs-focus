// Deterministic text features for separating real speech from media audio.
// No API calls. These are the evidence the classifier reasons over, computed
// the same way every time so any decision can be re-checked later.

const FILLER = /\b(um+|uh+|erm|hmm+|mm+|you know|i mean|sort of|kinda|kind of)\b/i;
const RESTART = /\b(\w+)[\s-]+\1\b/i;

export function features(utterances) {
  const texts = utterances
    .map((u) => (u.text ?? "").trim())
    .filter(Boolean);

  if (texts.length === 0) return null;

  let filler = 0;
  let restart = 0;
  let short = 0;
  let terminal = 0;
  let words = 0;

  for (const t of texts) {
    if (FILLER.test(t)) filler += 1;
    if (RESTART.test(t)) restart += 1;
    const w = t.split(/\s+/).filter(Boolean);
    words += w.length;
    if (w.length < 5) short += 1;
    if (/[.!?]$/.test(t)) terminal += 1;
  }

  const n = texts.length;
  return {
    count: n,
    fillerRate: filler / n,
    restartRate: restart / n,
    shortRate: short / n,
    terminalRate: terminal / n,
    meanWords: words / n,
  };
}