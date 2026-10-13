# Measurement variance

Written 2026-10-12, before the measurement window closes on 2026-10-17, so
the procedure for the final run is fixed before the final numbers exist.

## What was measured

Attribution assigns a topic to each utterance by asking a model, so running it
twice on identical input does not produce identical output. `src/variance.mjs`
runs the real attributor as a subprocess N times on one conversation and
reports the spread.

Conversation 10910324, seventeen minutes of own time, six chunks, three runs:

| Topic | Mean | Min | Max | Swing |
| --- | --- | --- | --- | --- |
| ai-and-hacks | 4.9 | 4.5 | 5.3 | 0.8 |
| acsm-vrl-research | 4.3 | 4.1 | 4.6 | 0.6 |
| school | 3.9 | 3.8 | 3.9 | 0.1 |
| unpredicted | 2.4 | 1.9 | 2.8 | 0.9 |
| (no subject) | 1.3 | 1.2 | 1.4 | 0.2 |

Minutes, three runs each.

## What it means

**Durations are stable. Rankings between near-tied topics are not.**

Swing is under one minute on a seventeen minute conversation, roughly five
percent relative, and `school` moved by six seconds. But `ai-and-hacks` and
`acsm-vrl-research` sit 0.6 minutes apart with swings of 0.8 and 0.6, so their
intervals overlap, and across three runs the two swapped places. Two distinct
orderings appeared:

```
ai-and-hacks > acsm-vrl-research > school > unpredicted
acsm-vrl-research > ai-and-hacks > school > unpredicted
```

An earlier reading of this project's own output overstated the problem,
claiming a five minute block changed topic between runs. It did not. The
console rounds to whole minutes, so 4.5 and 5.3 both printed as `5m`, and the
topics that seemed to appear and vanish from the top-three summary were the
ordering flipping. The correction is recorded here because the same rounding
will mislead anyone else reading that output.

## Procedure for the final run

1. Attribution runs three times over the closed window. Every run is kept.
2. Each topic is reported as a mean with its observed range.
3. Mean absolute error on predicted share is computed from the means.
4. Spearman rank correlation is computed from the means, and **any pair of
   topics whose ranges overlap is reported as tied rather than ranked.** A
   ranking the measurement cannot reproduce is not evidence about the author's
   self-knowledge.
5. The number of distinct orderings observed is published alongside the
   correlation.

## What this does not cover

The real-versus-media filter carries the denominator and has not been tested
this way. It answers one question per eighty-utterance window rather than one
per line, so it has fewer chances to wobble, but "fewer" is not "none" and the
assumption is untested. Running the same conversation through classification
three times is the obvious next check, and if the filter's own labels move,
every number in the project inherits that.
