// One model call, two providers behind one interface.
//
// Bedrock is the production path. The direct Anthropic API exists because new
// AWS accounts ship with a daily token quota too small to develop against,
// which is recorded in docs/friction-log.md.
//
// src/classify.mjs carries its own copy of this plumbing. It is committed,
// working, and load-bearing for the denominator, so it is left alone rather
// than refactored to import this. The duplication is deliberate.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const PROVIDER = process.env.LLM_PROVIDER ?? "bedrock";

// Reads every text block, not just the first. A reply split across blocks
// silently returned empty before this, which presented as a JSON parse error
// several layers away from the cause.
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

async function callBedrock(prompt, maxTokens) {
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
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  );

  return textOf(JSON.parse(new TextDecoder().decode(res.body)));
}

async function callAnthropic(prompt, maxTokens) {
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
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  return textOf(await res.json());
}

export async function ask(prompt, { maxTokens = 2048 } = {}) {
  return PROVIDER === "anthropic"
    ? callAnthropic(prompt, maxTokens)
    : callBedrock(prompt, maxTokens);
}

export function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in reply: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

export { PROVIDER };
