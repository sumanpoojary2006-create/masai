import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export interface LoAnalysisResult {
  covered_los: string[];
  missing_los: string[];
}

export async function analyzeLosFromTranscript(
  learningObjectives: string,
  transcript: string
): Promise<LoAnalysisResult> {
  const prompt = `You are an educational quality analyst. You will be given:
1. A list of Learning Objectives (LOs) for a lecture
2. A transcript or summary of what was actually taught in the lecture

Your task is to analyse which Learning Objectives were COVERED in the transcript and which were MISSED.

---

LEARNING OBJECTIVES:
${learningObjectives}

---

TRANSCRIPT / SUMMARY:
${transcript}

---

Instructions:
- Read each Learning Objective individually.
- If the transcript discusses the concept, topic, or skill described in the LO — even if not word-for-word — mark it as COVERED.
- If the transcript does not address the LO at all — mark it as MISSING.
- Return ONLY a valid JSON object with two keys: "covered_los" and "missing_los".
- Each key holds an array of strings — the exact LO text (copy from the list above).
- Do NOT add any commentary, markdown, or text outside the JSON.

Example output format:
{
  "covered_los": ["Understand transformer architecture", "Explain attention mechanism"],
  "missing_los": ["Implement BERT fine-tuning from scratch"]
}`;

  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const raw = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude did not return valid JSON for LO analysis.");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    covered_los?: unknown;
    missing_los?: unknown;
  };

  return {
    covered_los: Array.isArray(parsed.covered_los)
      ? parsed.covered_los.map(String)
      : [],
    missing_los: Array.isArray(parsed.missing_los)
      ? parsed.missing_los.map(String)
      : []
  };
}
