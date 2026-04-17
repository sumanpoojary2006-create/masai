import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface LoAnalysisResult {
  covered_los: string[];
  missing_los: string[];
  /** true when AI was unavailable and keyword matching was used instead */
  fallback?: boolean;
}

// ─────────────────────────────────────────────
// 1. Groq (free, 14 400 req/day — primary)
// ─────────────────────────────────────────────
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768"
];

async function analyzeWithGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });

  for (const model of GROQ_MODELS) {
    try {
      console.log(`[lo-analyzer] Groq model "${model}"…`);
      const chat = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1024
      });
      const text = chat.choices[0]?.message?.content ?? "";
      if (text) {
        console.log(`[lo-analyzer] Groq success with "${model}"`);
        return text;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota")) {
        console.warn(`[lo-analyzer] Groq "${model}" rate-limited, trying next…`);
        continue;
      }
      console.warn(`[lo-analyzer] Groq "${model}" error: ${msg}`);
    }
  }
  throw new Error("GROQ_EXHAUSTED");
}

// ─────────────────────────────────────────────
// 2. Gemini (free fallback)
// ─────────────────────────────────────────────
const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

async function analyzeWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of GEMINI_MODELS) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[lo-analyzer] Gemini "${modelName}" (attempt ${attempt})…`);
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text) {
          console.log(`[lo-analyzer] Gemini success with "${modelName}"`);
          return text;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
          if (attempt === 1) { await new Promise((r) => setTimeout(r, 3000)); continue; }
          break; // try next model
        }
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) break;
        throw err;
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────────
// 3. Keyword fallback (always works, no API)
// ─────────────────────────────────────────────
function keywordFallback(learningObjectives: string, transcript: string): LoAnalysisResult {
  const STOPWORDS = new Set([
    "the","and","for","that","this","with","from","have","will","are","was",
    "been","they","their","there","which","when","what","where","into","about",
    "each","some","then","than","also","more","such","its","can","how","use",
    "used","using","understand","explain","describe","implement","apply","know",
    "able","list","define","identify"
  ]);

  const transcriptLower = transcript.toLowerCase();
  const loLines = learningObjectives.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
  const covered_los: string[] = [];
  const missing_los: string[] = [];

  for (const lo of loLines) {
    const keywords = lo.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

    if (keywords.length === 0) { covered_los.push(lo); continue; }

    const matched = keywords.filter((kw) => transcriptLower.includes(kw));
    const ratio = matched.length / keywords.length;
    console.log(`[lo-analyzer:fallback] "${lo}" — ${matched.length}/${keywords.length} (${Math.round(ratio * 100)}%)`);
    // Generous threshold: even 1 keyword match out of 4+ counts as covered
    (ratio >= 0.25 || matched.length >= 1 ? covered_los : missing_los).push(lo);
  }

  return { covered_los, missing_los, fallback: true };
}

// ─────────────────────────────────────────────
// Parse JSON from AI response
// ─────────────────────────────────────────────
function parseLoJson(raw: string): { covered_los: string[]; missing_los: string[] } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI did not return valid JSON.");
  const parsed = JSON.parse(jsonMatch[0]) as { covered_los?: unknown; missing_los?: unknown };
  return {
    covered_los: Array.isArray(parsed.covered_los) ? parsed.covered_los.map(String) : [],
    missing_los: Array.isArray(parsed.missing_los) ? parsed.missing_los.map(String) : []
  };
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────
export async function analyzeLosFromTranscript(
  learningObjectives: string,
  transcript: string
): Promise<LoAnalysisResult> {
  const prompt = `You are an educational quality analyst. You will be given:
1. A list of Learning Objectives (LOs) for a lecture
2. A transcript or summary of what was actually taught in the lecture

Your task is to decide which Learning Objectives were COVERED and which were completely MISSING.

---

LEARNING OBJECTIVES:
${learningObjectives}

---

TRANSCRIPT / SUMMARY:
${transcript}

---

Evaluation rules — read carefully:
- Be GENEROUS. Mark an LO as COVERED if the topic appears ANYWHERE in the summary, even briefly.
- A topic is COVERED if: it was introduced, mentioned, touched upon, defined, demonstrated, or discussed — even at a surface level.
- A topic is MISSING ONLY IF: the topic is completely absent from the summary — not mentioned or referenced in any way whatsoever.
- Do NOT penalise for depth. An introduction or brief mention counts as covered.
- Do NOT require exact wording. If the concept behind the LO is present, it is covered.
- When in doubt, mark it as COVERED.

Return ONLY a valid JSON object with two keys: "covered_los" and "missing_los".
Each key holds an array of strings — copy the exact LO text from the list above.
Do NOT add any commentary, markdown fences, or text outside the JSON.

Example output:
{
  "covered_los": ["Understand transformer architecture", "Explain attention mechanism"],
  "missing_los": ["Implement BERT fine-tuning from scratch"]
}`;

  // 1. Try Groq
  try {
    const raw = await analyzeWithGroq(prompt);
    return parseLoJson(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== "GROQ_EXHAUSTED" && !msg.includes("GROQ_API_KEY")) throw err;
    console.warn("[lo-analyzer] Groq unavailable, trying Gemini…");
  }

  // 2. Try Gemini
  try {
    const raw = await analyzeWithGemini(prompt);
    return parseLoJson(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== "GEMINI_EXHAUSTED" && !msg.includes("GEMINI_API_KEY")) throw err;
    console.warn("[lo-analyzer] Gemini unavailable, using keyword fallback…");
  }

  // 3. Keyword fallback — always works
  return keywordFallback(learningObjectives, transcript);
}
