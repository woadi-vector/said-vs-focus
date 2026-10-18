# Results

Measured 2026-10-18, after the window closed on 2026-10-17.

`docs/sealed-prediction.md` was committed and pushed 2026-10-09, before the
window opened and before any of this data existed. This file scores it. The
prediction file has not been edited since it was pushed; GitHub's server-side
record of that push is the part the author does not control.

Scored against the rules in that file, which were fixed before the numbers
were visible: the denominator in `docs/denominator.md` (2026-10-12), the
reporting floor in `docs/variance.md` (2026-10-12, with the floor addendum
2026-10-16), and the claim-4 boundary excluding television (2026-10-12).

## Denominator

| | Minutes | |
| --- | --- | --- |
| Captured in window | 1,949 | all audio Bee transcribed |
| Own participation | **730.7** | 37.5% of capture |

Topic shares below are over own time, per `docs/denominator.md`. The remaining
1,218 minutes are television, film, ambient speech, or undecidable, and are
not eligible to be topics under either column.

Reporting floor: **3.1 minutes**, the largest swing any topic showed between
three replicate attribution runs on identical input. A topic below it is
reported but not ranked.

## Predicted against measured

| Topic | Predicted | Measured | Minutes | Error |
| --- | --- | --- | --- | --- |
| Warzone | 30% | **32.9%** | 241 | +2.9 |
| School | 10% | **18.7%** | 137 | +8.7 |
| Everything unpredicted | 24% | 13.8% | 101 | -10.2 |
| Singing | 5% | **6.9%** | 51 | +1.9 |
| Dogs | 10% | 4.6% | 33 | -5.4 |
| ACSM and VRL research | 10% | 3.5% | 25 | -6.5 |
| AI and hacks | 10% | 1.6% | 12 | -8.4 |
| Handshake | 1% | withheld | 1 | -0.8 |

A further 129.7 minutes, 17.8% of own time, carry no identifiable subject:
greetings, logistics, fragments. That time stays in the denominator rather
than being redistributed, which deflates every share above. The alternative
inflates all of them.

## Scoring rule, applied

**Mean absolute error on predicted share: 4.9 points** across the seven named
topics.

**Spearman rank correlation: 0.34** across the six topics the floor permits
ranking. Including Handshake it reads 0.61, and that higher number should not
be used: the floor says a topic below it cannot be ranked, and Handshake is
below it. Reporting 0.61 would mean using a topic the method excludes in order
to improve the score.

**Top three: not well defined by the prediction.** The sealed file assigns
Warzone 30% and then four topics exactly 10%, so it names a first place and a
four-way tie, not a top three. Measured top three among named topics is
Warzone, School, Singing. Warzone was predicted first. School was inside the
tie. Singing was predicted sixth. The ambiguity is a flaw in the prediction and
is reported rather than resolved in the author's favour.

**Largest single unpredicted topic: 3.2%**, 23.3 minutes, labelled "work,
leisure, and life balance." The unpredicted pool was broken into 23 named
topics rather than reported as a pool, per the instruction in the sealed file.

## The four claims

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | Warzone exceeds AI and hacks, ACSM and VRL research, and Handshake combined | **True.** 241 min against 38, a factor of 6.3 |
| 2 | Warzone is the single largest topic | **True.** 241 min against School at 137 |
| 3 | Those three together under 25%, Handshake alone under 3% | **True.** 5.2% combined, Handshake 0.2% |
| 4 | No single unpredicted topic exceeds 10% | **True.** Largest is 3.2%, threshold 73.1 min |

Four of four. That is a weaker result than it reads as. The claims are
directional with wide margins, and claim 3 in particular passes because the
measurement came in at 5.2% against a 25% ceiling, which is to say it passed
by missing low rather than by being right. The precise half of the prediction,
the shares, missed by 4.9 points on average, and the ranking correlation is
0.34. Four coarse claims true and every fine-grained share wrong except
Warzone and Singing is the honest summary.

Claims 1 and 3 sum a topic the floor withholds from ranking. The floor governs
whether a topic can be placed in an order, not whether its minutes exist.
Handshake's entire range is 1.2 to 1.4 minutes, fifteen times under the 3%
ceiling, so no version of the measurement uncertainty touches either claim.

## What the measurement found

The three things the author named as priorities, asked before any numbers were
assigned, were: finish the hackathon builds, finish the ACSM abstract, finish
more Handshake tasks. Together they account for **38 minutes, 5.2%** of
conversation he took part in.

Warzone accounts for 241. Singing accounts for 51.

He sang for a third more minutes than he spent talking about everything he
said mattered, and played for six times as long.

The week contained two school holidays, which is recorded in
`docs/limitations.md` as a constraint on generalizing. It does not rescue the
result: days away from class are the discretionary hours those three
priorities compete for.

## Filter accuracy

`docs/denominator.md` committed to publishing a disagreement rate. The draw is
recorded in `docs/spot-check-draw.md`, pushed before any verdict was written.

| | |
| --- | --- |
| Segments reviewed | 68 of 79 in window |
| Minutes reviewed | 1,915.9 of 1,948.7, **98.3%** |
| Per-segment disagreement | 15 of 68, 22.1% |
| Estimated misclassified | 103.7 min, **5.3% of capture** |
| Net effect on own time | **+15.1 min**, understated |

Every segment 15 minutes or longer was reviewed in full rather than sampled,
because the denominator is minutes and a per-segment rate would leave the
segments carrying nearly all the minutes unchecked.

The filter is conservative: it excludes more participation than it wrongly
includes. Four of the five `unclear` segments reviewed were the wearer's own
speech, mostly singing.

**The larger limitation is not accuracy, it is granularity.** 242.5 minutes
sit inside segments that carry two kinds of audio at once, putting at least
60.6 minutes in the wrong bucket by the flagging threshold alone, four times
the misclassification error. A segment is too blunt a unit for a room where a
class, a television and a dog are all producing sound.

## Corrections applied

15 segment labels were corrected from the human review and the affected
conversations re-attributed. `src/classify.mjs` was deliberately not changed:
these are verdicts about specific segments by the person who was present, not
training signal, and editing the classifier after seeing which way its errors
ran is the move this project exists to avoid.

The correction moved a ranking. **Singing went from 25.7 minutes and sixth
place to 51 minutes and fourth**, passing Dogs and passing ACSM research. The
replicate runs had reported Singing and ACSM as a tie whose ranges overlapped
and could not be separated; the correction separates them.

It also made the prediction look worse. Spearman over the rankable topics fell
from 0.60 to 0.34, because Singing was predicted near the bottom and landed
third among named topics. The published number is the lower one.

Uncorrected segments are preserved in `data/segments-uncorrected` and the
change log in `data/corrections.json`, so both measurements remain
reproducible.

## Where this measurement is weakest

- **Granularity**, above. The single largest source of error in the result.
- **The human reviewer is not ground truth either.** The first review pass
  marked a 111.7-minute graduate seminar as television, in the direction that
  flattered the author's own forecast. It was caught by checking the verdict
  against the transcript, where a faculty member says "can I throw up a few
  concepts on the board," and corrected. `docs/limitations.md` carries the
  detail.
- **Residual media in the pool.** Roughly 5 minutes of film and cooking-show
  audio survived the filter into the named topics. Under
  `docs/denominator.md` television is not eligible to be a topic, so it is
  excluded from claim 4 and reported here instead.
- **One run, not three.** The corrected numbers are a single attribution run.
  The 3.1-minute floor still governs them, since relabelling a segment changes
  neither the attributor nor its prompt, and that floor was derived from the
  uncorrected replicates before any correction was made.
- **Silent work is invisible.** Bee observes conversation. An hour spent
  writing the ACSM abstract alone produces no evidence and is counted nowhere.
  These shares describe conversational focus. They are not a claim about how
  the week was spent.
