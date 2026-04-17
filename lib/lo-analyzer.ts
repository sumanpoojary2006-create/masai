import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// Models tried in order — if one is 429/unavailable we fall through to the next
const MODEL_PRIORITY = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

export interface LoAnalysisResult {
  covered_los: string[];
  missing_los: string[];
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(prompt: string): Promise<string> {
  let lastError: unknown;

  for (const modelName of MODEL_PRIORITY) {
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[lo-analyzer] Trying model "${modelName}" (attempt ${attempt})`);
        const result = await model.generateContent(prompt);
        console.log(`[lo-analyzer] Success with model "${modelName}"`);
        return result.response.text();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);

        // 429 quota exceeded — wait then retry same model, then fall through to next model
        if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
          const waitMs = attempt * 5000; // 5s, 10s, 15s
          console.warn(`[lo-analyzer] Quota exceeded on "${modelName}" (attempt ${attempt}), waiting ${waitMs / 1000}s…`);
          await sleep(waitMs);
          continue;
        }

        // 404 / model not found — skip to next model immediately
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          console.warn(`[lo-analyzer] Model "${modelName}" not found, trying next…`);
          break;
        }

        // Other error — rethrow immediately
        throw err;
      }
    }
  }

  throw new Error(
    `All Gemini models exhausted. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
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
- Each key holds an array of strings — copy the exact LO text from the list above.
- Do NOT add any commentary, markdown fences, or text outside the JSON.

Example output:
{
  "covered_los": ["Understand transformer architecture", "Explain attention mechanism"],
  "missing_los": ["Implement BERT fine-tuning from scratch"]
}`;

  const raw = await generateWithRetry(prompt);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini did not return valid JSON for LO analysis.");
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
