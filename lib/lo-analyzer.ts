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
  /** true when Gemini was unavailable and keyword matching was used instead */
  fallback?: boolean;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(prompt: string): Promise<string> {
  let lastError: unknown;

  for (const modelName of MODEL_PRIORITY) {
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[lo-analyzer] Trying model "${modelName}" (attempt ${attempt})`);
        const result = await model.generateContent(prompt);
        console.log(`[lo-analyzer] Success with model "${modelName}"`);
        return result.response.text();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);

        // 429 quota exceeded — short wait then try next model immediately
        if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
          if (attempt === 1) {
            console.warn(`[lo-analyzer] Quota on "${modelName}" (attempt ${attempt}), waiting 3s…`);
            await sleep(3000);
            continue;
          }
          console.warn(`[lo-analyzer] Quota on "${modelName}" still exhausted, moving to next model`);
          break;
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
    `QUOTA_EXHAUSTED: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/**
 * Keyword-based fallback matcher used when all Gemini models are quota-exhausted.
 *
 * Strategy: for each LO, extract meaningful words (≥4 chars, not stopwords),
 * then check how many appear in the transcript (case-insensitive).
 * If ≥ 40% of the keywords match → COVERED.
 */
function keywordFallbackAnalysis(
  learningObjectives: string,
  transcript: string
): LoAnalysisResult {
  const STOPWORDS = new Set([
    "the","and","for","that","this","with","from","have","will","are","was",
    "been","they","their","there","which","when","what","where","into","about",
    "each","some","then","than","also","more","such","its","can","how","use",
    "used","using","understand","explain","describe","implement","apply","know",
    "able","list","define","identify"
  ]);

  const transcriptLower = transcript.toLowerCase();

  // Parse LOs — split by newline or semicolon
  const loLines = learningObjectives
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const covered_los: string[] = [];
  const missing_los: string[] = [];

  for (const lo of loLines) {
    // Extract keywords: words ≥4 chars, not stopwords
    const keywords = lo
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

    if (keywords.length === 0) {
      // No meaningful keywords — assume covered
      covered_los.push(lo);
      continue;
    }

    const matched = keywords.filter((kw) => transcriptLower.includes(kw));
    const matchRatio = matched.length / keywords.length;

    console.log(
      `[lo-analyzer:fallback] "${lo}" — ${matched.length}/${keywords.length} keywords matched (${Math.round(matchRatio * 100)}%)`
    );

    if (matchRatio >= 0.4) {
      covered_los.push(lo);
    } else {
      missing_los.push(lo);
    }
  }

  return { covered_los, missing_los, fallback: true };
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

  try {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // All Gemini models quota-exhausted → fall back to keyword matching
    if (msg.startsWith("QUOTA_EXHAUSTED")) {
      console.warn("[lo-analyzer] All Gemini models exhausted — using keyword fallback");
      return keywordFallbackAnalysis(learningObjectives, transcript);
    }

    throw err;
  }
}
