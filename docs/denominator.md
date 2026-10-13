# Denominator decision

Written 2026-10-12, five days into the measurement window, which closes
2026-10-17. Recorded now rather than at analysis time, because the decision
affects every number the sealed prediction is scored against and the honest
version of this project cannot have that decision made after the results are
visible.

## The ambiguity

`docs/sealed-prediction.md`, committed 2026-10-09 before the window opened,
says two things that pointed at the same quantity when it was written:

> what share of captured conversation time each topic accounts for

> This is conversational focus, not time spent.

Those phrases diverge once capture is measured. Across the window, 478 of 686
captured minutes are television, film, or other recorded audio the wearer was
an audience to rather than a participant in. Roughly 70 percent. "Captured
time" and "conversation the wearer took part in" are now very different
denominators, and the predicted shares were plainly written against the
second: nobody assigns Warzone 30 percent of a figure that turns out to be
mostly a baking competition.

## The decision

**Topic shares are computed over own time: conversation the wearer
participated in, after the media filter. For the window as measured on
2026-10-12 that is 208 minutes of 686.**

**All-capture shares are reported beside them as a sensitivity column.** Both
columns are published. Publishing both costs nothing and removes any question
of whether the denominator was chosen to flatter the prediction. The
all-capture column is also where the more interesting result lives, since it
shows what a wearable's own summaries assert about a week when nothing filters
them.

## Why this is not a post-hoc rescue

The media problem was a committed design element before the window opened, not
a discovery that needed accommodating afterward.

`docs/friction-log.md`, written 2026-10-09, closes with:

> A webinar played through laptop speakers was recorded, transcribed, and
> summarized as a conversation, complete with atmosphere and key takeaways. So
> was an episode of a television show. Captured audio cannot be assumed to be
> conversation the user took part in, and nothing in the record flags the
> difference.

Both documents were pushed before 2026-10-10. The filter was therefore
pre-registered, and own time is the denominator those documents describe. What
was not known on 2026-10-09 was the magnitude: 70 percent was not anticipated
by anyone, including the author.

## Consequence for the four claims

Claims 1 through 3 concern named topics and are scored unchanged against own
time.

Claim 4 needs an explicit boundary, or it becomes gameable: *No single
unpredicted topic exceeds 10 percent.*

**Television is not a topic. It is excluded from the measured universe.** An
unpredicted topic means a subject discussed in participatory conversation that
the registry does not name. Media time is not eligible to satisfy or to break
claim 4, under either column. Stating this now, before the unpredicted topics
are known, prevents the claim being settled by a definitional choice later.

## What would falsify the filter itself

The filter carries the whole denominator, so its error rate is reportable
rather than assumed. A spot-check pass over sampled segments records human
agreement or disagreement per segment, and the disagreement rate is published
with the shares. If the filter is wrong often enough to move a claim, that is
the result and it gets reported as one.

Known filter behavior as of today, from the full corpus run: no failures
across 20 conversations and 211 windows; two segments reviewed in detail
(11186705, 11032696) were both correct, and both cases are ones where Bee's
own conversation title asserts an activity the wearer never performed.
