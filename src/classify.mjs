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

const INSTRUCTIONS = `
You are classifying a run of transcribed audio captured by an always-on
wearable microphone worn by one person.

Labels:
  own      speech the wearer took part in, including solo speech. Talking to
           pets, singing, thinking aloud, and game comms where only the
           wearer's side reached the microphone all count as own.
  media    television, film, radio, podcast, music, a recorded or streamed
           talk. Audio produced by a device in the room rather than by people
           present.
  ambient  speech near the wearer that they are not part of. Overheard
           conversation, a public address system, strangers nearby.
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

Reply with JSON only, no prose around it:
{
  "label": "own" | "media" | "ambient" | "unclear",
  "confidence": 0.0 to 1.0,
  "mixed": true | false,
  "evidence": [{ "index": 0, "why": "short reason" }],
  "reasoning": "one or two sentences"
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
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  );

  const payload = JSON.parse(new TextDecoder().decode(res.body));
  return payload.content?.[0]?.text ?? "";
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
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  const payload = await res.json();
  return payload.content?.[0]?.text ?? "";
}

export async function classify(utterances, facts = []) {
  const prompt = buildPrompt(utterances, facts);
  const text =
    PROVIDER === "anthropic"
      ? await callAnthropic(prompt)
      : await callBedrock(prompt);

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No JSON in model reply: ${text.slice(0, 200)}`);
  }
  return JSON.parse(match[0]);
}