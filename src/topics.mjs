// The topic registry: the shared vocabulary both columns rank against.
//
// Definitions are copied verbatim from docs/sealed-prediction.md, which was
// committed and pushed on 2026-10-09, before the measurement window opened.
// They are not edited here. If a definition needs to change, the change is
// recorded as a correction in data/topics.json with a reason, so the registry
// the measurement ran against stays visible.
//
// GROUNDING, stated plainly: Bee's facts endpoint returns empty for this
// account, so no topic here is grounded in a stored Bee fact. The three
// commitments below come from the stated-priorities section of the sealed
// prediction, recorded in conversation before any share numbers were
// assigned. Four topics carry no commitment at all, which is the point: they
// were predicted to dominate conversation without ever being named as
// something that mattered.

// `cues` are hints for the human-readable explanation and for sampling, NOT
// the attribution rule. Lexical features were measured on this corpus and do
// not separate classes (see src/features.mjs and docs/friction-log.md).
// Attribution is semantic, same as classification.

export const TOPICS = [
  {
    id: "warzone",
    label: "Warzone",
    definition:
      "gameplay, squad comms, loadouts, anything about the game",
    cues: ["loadout", "squad", "gulag", "revive", "ping", "rotate"],
    statedPriority: null,
    commitment: null,
    commitmentSource: null,
    predictedShare: 30,
    status: "seed",
  },
  {
    id: "school",
    label: "School",
    definition:
      "coursework, TA work, and anything discussed with faculty or classmates",
    cues: ["class", "assignment", "syllabus", "exam", "students", "professor"],
    statedPriority: null,
    commitment: null,
    commitmentSource: null,
    predictedShare: 10,
    status: "seed",
  },
  {
    id: "ai-and-hacks",
    label: "AI and hacks",
    definition:
      "tools, models, technique, and the specific builds (Bucket, the " +
      "hackathon app, the lightning night light). Merged deliberately; they " +
      "do not split cleanly",
    cues: ["model", "prompt", "build", "repo", "API", "Bucket"],
    statedPriority: 1,
    commitment: "finish the hackathon builds",
    commitmentSource: "docs/sealed-prediction.md, stated 2026-10-09",
    predictedShare: 10,
    status: "seed",
  },
  {
    id: "dogs",
    label: "Dogs",
    definition: "the dogs, as a subject",
    cues: ["Luna", "walk", "treat", "vet", "good girl"],
    statedPriority: null,
    commitment: null,
    commitmentSource: null,
    predictedShare: 10,
    status: "seed",
  },
  {
    id: "acsm-vrl-research",
    label: "ACSM and VRL research",
    definition:
      "the ACSM abstract and the VRL study behind it, including research " +
      "conversations with Marissa",
    cues: ["abstract", "ACSM", "study", "participants", "reliability"],
    statedPriority: 2,
    commitment: "finish the ACSM abstract",
    commitmentSource: "docs/sealed-prediction.md, stated 2026-10-09",
    predictedShare: 10,
    status: "seed",
  },
  {
    id: "singing",
    label: "Singing",
    definition: "singing and music-making",
    cues: [],
    statedPriority: null,
    commitment: null,
    commitmentSource: null,
    predictedShare: 5,
    status: "seed",
  },
  {
    id: "handshake",
    label: "Handshake",
    definition: "the contributor work",
    cues: ["rubric", "task", "grading", "Handshake"],
    statedPriority: 3,
    commitment: "finish more Handshake tasks",
    commitmentSource: "docs/sealed-prediction.md, stated 2026-10-09",
    predictedShare: 1,
    status: "seed",
  },
];

// Not a topic. Anything the attributor cannot place lands here, and topics
// discovered inside it are reported individually rather than pooled, per the
// sealed prediction.
export const UNPREDICTED = {
  id: "unpredicted",
  label: "Everything unpredicted",
  definition: "any topic not named above",
  predictedShare: 24,
};

export const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function topicIds() {
  return TOPICS.map((t) => t.id);
}

// The left column. Only topics the wearer actually named as a priority are
// ranked; the rest are present in the registry but unranked, and the gap
// between this list and the measured ranking is the product.
export function statedRanking() {
  return TOPICS.filter((t) => t.statedPriority !== null).sort(
    (a, b) => a.statedPriority - b.statedPriority
  );
}

// A topic block for the classifier prompt. Definitions only: cues are kept
// out so the model reasons about meaning rather than matching words.
export function definitionBlock() {
  return TOPICS.map((t) => `  ${t.id}: ${t.definition}`).join("\n");
}
