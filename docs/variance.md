# Measurement variance

Written 2026-10-12, before the measurement window closes on 2026-10-17, so
the procedure for the final run is fixed before the final numbers exist.
Section "Reporting floor" added 2026-10-16, also before the window closed and
before the final run.

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

## Reporting floor

Added 2026-10-16, before the window closed.

A measurement that cannot reproduce a number should not report it. Two
refusals follow from the spread above, and both are refusals to make a claim
rather than adjustments to one:

1. **Below the floor, a topic is not ranked and gets no share.** The floor is
   the largest swing observed across replicate runs: currently 0.9 minutes.
   A topic measured under it cannot be distinguished from a single
   mis-assignment, so it is reported as withheld, naming how much was found
   and why that is not enough. It keeps its place in the registry and its
   evidence stays inspectable; what it does not get is a rank or a percentage.

2. **Overlapping ranges are tied, not ordered.** Where replicate runs exist
   and two topics' observed ranges overlap, they are reported as tied. The
   number of distinct orderings observed is published with the result.

The floor is derived, not chosen. It recomputes from the replicate runs of the
final measurement rather than carrying today's value forward, so it cannot be
tuned after the fact to admit or exclude a particular topic.

This has a cost worth stating plainly. Two of the three stated priorities are
currently measured in seconds, and under this rule they will be reported as
withheld rather than as a share near zero. Withheld is weaker evidence for the
project's own thesis than a printed 0.0 percent would be. The rule is adopted
anyway, because a project whose argument is that wearable summaries overclaim
cannot itself report a number it could not reproduce.

## Procedure for the final run

1. Attribution runs three times over the closed window. Every run is kept.
2. Each topic is reported as a mean with its observed range.
3. The reporting floor is recomputed from those runs and applied.
4. Mean absolute error on predicted share is computed from the means, over
   topics that clear the floor. Topics withheld are listed with their
   predicted share and the evidence found, and are excluded from the error
   figure rather than counted as zero.
5. Spearman rank correlation is computed from the means, with tied pairs
   reported as tied. A ranking the measurement cannot reproduce is not
   evidence about the author's self-knowledge.
6. The number of distinct orderings observed is published alongside the
   correlation.

## What this does not cover

The real-versus-media filter carries the denominator and has not been tested
this way. It answers one question per eighty-utterance window rather than one
per line, so it has fewer chances to wobble, but "fewer" is not "none" and the
assumption is untested. Running the same conversation through classification
three times is the obvious next check, and if the filter's own labels move,
every number in the project inherits that.
