// lib/generateRecap.ts
//
// Shared between the manual "New Recap" API route (called from the frontend)
// and the Fathom webhook handler described in the Recap Automation SOP. Both
// entry points call this same function, so the prompt can never drift between
// "someone clicked New Recap" and "Fathom triggered it automatically."

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateRecapFromTranscript(transcript: string, clientName: string, callDate: string) {
  const prompt = `You're turning a coaching call transcript into a structured recap for a UGC creator coaching client.

Client: ${clientName}
Call date: ${callDate}

Transcript:
"""
${transcript}
"""

Task: produce a structured recap of this call.
- title: a short, specific title capturing what this call was actually about — not generic like "Coaching Call"
- tldr: 2-4 sentences summarizing the key outcome and what's changing going forward
- actionItems: concrete tasks for the CLIENT to do (not the coach), each with:
  - body: a clear, specific action item, phrased as a full sentence ending in a period
  - due: a short deadline phrase in the coach's own words if — and only if — the transcript
    actually states or clearly implies one for that item (e.g. "this month", "Wed", "by Friday").
    null if no deadline was mentioned — never invent one.
- decisions: a short list of decisions or agreements that got locked in during the call

Respond with ONLY valid JSON, no markdown fences, no preamble. Exact shape:
{"title":"...","tldr":"...","actionItems":[{"body":"...","due":"..." | null}],"decisions":["...","..."]}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();
  return JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
    title: string;
    tldr: string;
    actionItems: { body: string; due: string | null }[];
    decisions: string[];
  };
}
