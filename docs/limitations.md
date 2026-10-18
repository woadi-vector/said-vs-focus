# Limitations

Started 2026-10-18 after the window closed, extended the same day as the
filter review turned things up. Recorded here rather than left for a reader to
find.

## The window is not a typical week

Stated by the subject on reading the first result:

> I think I was off since we had 2 days off from school this last week. So if
> I'm not at class, not talking to many people.

Two of the eight days in the window were school holidays. That is a real
constraint on generalizing from these shares to a normal week.

It does not rescue the result, and the direction is worth stating plainly:

- School measured 18.7% against 10% predicted. If the holidays suppressed any
  category it was that one, and it still came in at nearly double.
- The three stated priorities (finish the hackathon builds, finish the ACSM
  abstract, finish more Handshake tasks) are not classroom activities. Days
  away from class are precisely the discretionary hours those three compete
  for. They measured 5.2% combined. Warzone measured 32.9% on the same hours.

A week with two unplanned free days is the best chance a stated priority gets.
The free hours went elsewhere.

## A segment is too blunt a unit

This is the largest source of error in the result, larger than filter accuracy
by a factor of four.

The filter labels a run of utterances with one label. In the human review,
**242.5 minutes landed in segments carrying two kinds of audio at once**: a
class with the television on, a game with music over it, a dog and a cooking
show in the same kitchen. The reviewer flagged a segment as mixed when roughly
a quarter or more of it was something other than the label, which puts at
least 60.6 minutes in the wrong bucket. Eight sampled lines cannot measure
where the split falls, so that is a floor rather than an estimate.

Nothing in the current design fixes this. Shorter windows trade one error for
another: classification gets less context and gets worse. The honest statement
is that these shares are accurate to roughly the size of a segment, and a
segment in this corpus runs from two minutes to a hundred and thirty-seven.

## The human reviewer is not ground truth either

The filter review was done by the one person who was in every room, which is
the strongest available ground truth and still not a clean one.

The first pass marked `11290480`, 111.7 minutes, as television. It is a
graduate seminar: 985 utterances, a faculty member among the speakers, and the
line "can I throw up a few concepts on the board real quick." The reviewer had
read the sampled lines, four of them, and the last one was the television
playing afterward.

That single verdict would have moved School from 18.7% to roughly 12.2%
against a predicted 10%, converting the forecast's worst miss into a near hit,
and would have lifted Warzone to 37%. It was the largest segment in the
corpus, reviewed by the person whose prediction it flattered, in a pass that
covered 68 segments in sixteen minutes.

It was caught by checking the verdict against the transcript rather than
trusting the reviewer, and corrected to a mixed verdict with the original
`own` label standing. The uncorrected first-pass numbers were 16 disagreements,
215.4 misclassified minutes, and own time overstated by 96.7 minutes. The
published numbers are the second pass.

Both passes are reported because the useful finding is not the error rate. It
is that an audit needs an audit, and that a subject reviewing a measurement of
himself will make his largest mistake in his own favour without intending to.

## The lyrics rule was built on a premise that is false here

`src/classify.mjs` holds an absolute rule, written 2026-10-16: a run that is
mostly song lyrics is `unclear`, because a person singing along produces the
same words as the recording and a transcript cannot say who made the sound.

The premise is that the recording reaches the microphone. The subject listens
on headphones, so it does not. Lyrics in these transcripts can only be his own
voice. The rule was correct given its inputs and wrong given a fact nobody had
given it, and Bee's own facts endpoint returned empty, which is why the
classifier never had it.

Four of the five `unclear` segments in the review were his own speech, mostly
singing. Correcting them is what moved Singing from sixth place to fourth.

**The classifier was not changed.** Editing a pre-registered rule after seeing
which direction its errors ran is the move this project exists to avoid. The
headphone fact belongs in next steps, as an argument for why a wearable needs
to know something about its wearer, not in a post-window patch.

## Capture is not uniform across settings

37.5% of captured audio in the window is classified as the wearer's own
participation. The remaining 1,218 minutes are media, ambient, or unclear.

Capture is also uneven across places. The wearer carries the device by choice,
and during this window carried it at home more than away from it. Topics that
happen at home are better represented than topics that happen elsewhere. This
is a property of the instrument. No correction is applied, because any
correction would require knowing the unobserved time, which is the thing the
instrument cannot see.

## Not measured, or measured poorly

- **Silent work.** Bee observes conversation. An hour spent writing the ACSM
  abstract alone produces no conversational evidence and is not counted
  anywhere. These shares describe conversational focus and nothing else. They
  are not a claim about how the week was spent.
- **Unassigned own time.** 129.7 minutes of own speech, 17.8% of the window,
  carry no identifiable subject: greetings, logistics, fragments. That time
  stays in the denominator rather than being redistributed, which deflates
  every topic share. Forcing each utterance into a topic would inflate all of
  them. On attributed time alone the ordering is unchanged.
- **Residual media inside the topics.** Roughly 5 minutes of film and
  cooking-show audio survived the filter and were named as discovered topics
  in the unpredicted pool. `docs/denominator.md` says television is not
  eligible to be a topic, so they are excluded from claim 4 and reported here.
  They surfaced only because no registry topic fit them; media resembling a
  real topic would have been absorbed silently.
- **One run, not three.** The corrected numbers are a single attribution run.
  The 3.1-minute floor still governs them, since relabelling a segment changes
  neither the attributor nor its prompt, and the floor was derived from the
  uncorrected replicates before any correction existed.
