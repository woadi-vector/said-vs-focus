# Sealed prediction

Written 2026-10-09, before the measurement window opens on 2026-10-10.
Committed and pushed before any window data existed. The git author date is
trivially forgeable; what carries weight is GitHub's server-side record of
when this push landed, which the author does not control.

Nothing in this file is edited after the window opens. Results go in a
separate file.

## What is being predicted

Among the conversations Bee captures between 2026-10-10 and 2026-10-17,
what share of captured conversation time each topic accounts for.

This is conversational focus, not time spent. Bee cannot observe silent
work, and no inference fills that gap.

## Topics and predicted share

| Topic | Predicted share |
| --- | --- |
| Warzone | 30 |
| School | 10 |
| AI and hacks | 10 |
| Dogs | 10 |
| ACSM and VRL research | 10 |
| Singing | 5 |
| Handshake | 1 |
| Everything unpredicted | 24 |

## Topic definitions

These seed the topic registry. Both extractors resolve into them.

- **Warzone** — gameplay, squad comms, loadouts, anything about the game
- **School** — coursework, TA work, and anything discussed with faculty or classmates
- **AI and hacks** — tools, models, technique, and the specific builds (Bucket, the hackathon app, the lightning night light). Merged deliberately; they do not split cleanly
- **Dogs** — the dogs, as a subject
- **ACSM and VRL research** — the ACSM abstract and the VRL study behind it, including research conversations with Marissa
- **Singing** — singing and music-making
- **Handshake** — the contributor work
- **Everything unpredicted** — any topic not named above. Topics discovered here are reported individually, not pooled

## Claims

Each is marked true or false after the window. No partial credit.

1. Warzone exceeds the combined share of AI and hacks, ACSM and VRL research, and Handshake.
2. Warzone is the single largest topic.
3. AI and hacks, ACSM and VRL research, and Handshake together stay under 25 percent, and Handshake alone stays under 3 percent.
4. No single unpredicted topic exceeds 10 percent.

## Scoring rule

Fixed now so no metric can be chosen after the fact.

- Top-three membership: how many of the predicted top three appear in the measured top three
- Spearman rank correlation across the seven named topics
- Mean absolute error on predicted share
- Share of the largest single unpredicted topic
- Each of the four claims, true or false

## Stated priorities, for comparison

Asked separately what his top three priorities were, before any numbers were
assigned, the author answered: finish the hackathon builds, finish the ACSM
abstract, finish more Handshake tasks.

Two of those are predicted at 10 percent and 1 percent. The gap between
stated priority and predicted conversational focus is visible in this file
before any measurement exists.

## Disclosures

- The author is both the subject and the developer, and will see partial
  results while building during the window. The prediction predates all of
  it, but visibility into interim data is real and is noted here rather than
  discovered later.
- The prediction was made after reviewing the short summaries (titles only,
  not contents) of 11 conversations captured between 2026-09-29 and
  2026-10-09, before