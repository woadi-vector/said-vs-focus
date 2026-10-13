// Classifies a run of utterances as the wearer's own speech, media playback,
// or ambient speech they are not part of.
//
// Deliberately semantic rather than statistical. Disfluency, sentence length
// and punctuation were measured across this wearer's corpus and do not
// separate the classes. Scripted dialogue is written to sound casual, so the
// only reliable evidence is whether the content connects to a known life.
//
// Two providers behind one interface. Bedrock is the production path; the
// direct Anthropic API exists because new AWS accounts ship with daily token
// quotas too small to develop against.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const PROVIDER = process.env.LLM_PROVIDER ?? "bedrock";
const MAX_TOKENS = 2048;

const INSTRUCTIONS = `
You are classifying a run of transcribed audio captured by an always-on
wearable microphone worn by one person.

Labels:
  own      an activity the wearer was present for and part of, including
           stretches where they say nothing at all. A class they are enrolled
           in, a meeting they are attending, a call, a game they are playing,
           a conversation at home. Solo speech counts too: talking to pets,
           singing, thinking aloud. The wearer does not have to be the one
           speaking for a run to be theirs.
  media    broadcast or recorded entertainment the wearer is an audience to
           rather than a participant in. Television, film, streamed video,
           music, radio. The test is participation, not where the sound comes
           from: a class delivered over video is own, a drama on the TV is
           media.
  ambient  incidental audio the wearer has no part in and did not choose.
           Strangers at a nearby table, a public address system, background
           chatter in a public place.
  unclear  the evidence genuinely does not settle it.

Evidence that works:
  - Does the content reference people, places, projects or commitments from
    the wearer's known facts, listed below?
  - Is there narrative structure, meaning plot, stakes, scenes, characters
    with arcs? Real conversation runs on logistics, plans, reactions and
    repair instead.
  - Does anyone address the wearer, or respond to something the wearer said?
  - Does the subject drift the way channel surfing drifts, or hold the way a
    conversation holds?

Evidence that does NOT work. Do not rely on any of it:
  - Fluency, grammar, filler words, sentence length or punctuation. These were
    measured on this wearer's own corpus and do not separate the classes. A
    clean run is not evidence of media. A messy run is not evidence of own
    speech.
  - Profanity, subject seriousness, or emotional register.

If the run contains more than one kind, set mixed to true and classify the
dominant kind.

Output rules. Follow these exactly:
  - Your entire reply is one JSON object and nothing else. No preamble, no
    explanation before or after, no code fences.
  - The first character you write is {
  - Keep evidence to at most four entries and each why under fifteen words.
  - Keep reasoning to one sentence.

{
  "label": "own" | "media" | "ambient" | "unclear",
  "confidence": 0.0 to 1.0,
  "mixed": true | false,
  "evidence": [{ "index": 0, "why": "short reason" }],
  "reasoning": "one sentence"
}
`.trim();

function buildPrompt(utterances, facts) {
  const lines = utterances
    .map((u, i) => `[${i}] ${(u.text ?? "").trim()}`)
    .filter((l) => l.length > 4);

  const factBlock = facts.length
    ? facts.map((f) => `- ${f}`).join("\n")
    : "(none available)";

  return (
    `${INSTRUCTIONS}\n\n` +
    `Known facts about the wearer:\n${factBlock}\n\n` +
    `Transcribed run (${lines.length} utterances):\n${lines.join("\n")}`
  );
}

// Reads text from every text block rather than assuming it is the first one,
// and reports what actually came back when there is none.
function textOf(payload) {
  const blocks = payload.content ?? [];
  const text = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  if (text) return text;
  throw new Error(
    `empty reply, stop_reason=${payload.stop_reason}, ` +
    `blocks=${JSON.stringify(blocks).slice(0, 300)}`
  );
}

async function callBedrock(prompt) {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    throw new Error("Set BEDROCK_MODEL_ID, or set LLM_PROVIDER=anthropic.");
  }

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? "us-east-1",
  });

  const res = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  );

  return textOf(JSON.parse(new TextDecoder().decode(res.body)));
}

async function callAnthropic(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Set ANTHROPIC_API_KEY.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  return textOf(await res.json());
}

export async function classify(utterances, facts = []) {
  const prompt = buildPrompt(utterances, facts);
  const text =
    PROVIDER === "anthropic"
      ? await callAnthropic(prompt)
      : await callBedrock(prompt);

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`no JSON in reply: ${text.slice(0, 300)}`);
  }
  return JSON.parse(match[0]);
}