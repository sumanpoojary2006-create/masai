import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768"
];

async function matchWithGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });

  for (const model of GROQ_MODELS) {
    try {
      console.log(`[lo-matcher] Groq model "${model}"…`);
      const chat = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1024
      });
      const text = chat.choices[0]?.message?.content ?? "";
      if (text) return text.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota")) {
        continue;
      }
    }
  }
  throw new Error("GROQ_EXHAUSTED");
}

const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

async function matchWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of GEMINI_MODELS) {
    const model = genAI.getGenerativeModel({ model: modelName });
    try {
      console.log(`[lo-matcher] Gemini "${modelName}"…`);
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) return text.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
        continue;
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

export async function matchLearningObjectiveAI(
  lmsLectureName: string,
  curriculumList: { lecture_name: string; learning_objective: string }[]
): Promise<string | null> {
  if (!curriculumList.length) return null;

  const curriculumText = curriculumList
    .map((c, i) => `${i + 1}. Lecture: "${c.lecture_name}"\nObjective: ${c.learning_objective}`)
    .join("\n\n");

  const prompt = `You are an AI matching system.
We have a lecture from an LMS named: "${lmsLectureName}"

Below is the approved curriculum list containing Lecture names and their Learning Objectives:
---
${curriculumText}
---

Your task: Find the single curriculum item that semantically matches the LMS lecture name "${lmsLectureName}". The names might be slightly different, abbreviated, or have extra words (e.g. "Live Session", "Part 1").

If you find a match, reply ONLY with the exact text of the "Objective". Do NOT include the lecture name, no commentary, no markdown quotes. Just the raw objective string.
If there is NO reasonable match, reply ONLY with the exact string: NO_MATCH`;

  let result = "NO_MATCH";
  try {
    result = await matchWithGroq(prompt);
  } catch {
    try {
      result = await matchWithGemini(prompt);
    } catch {
      // Fallback: simple text includes matching
      const targetLower = lmsLectureName.toLowerCase().replace(/live session/g, "").replace(/[^a-z0-9]/g, " ").trim();
      const tokens = targetLower.split(/\s+/).filter((t) => t.length > 3);
      if (tokens.length > 0) {
        for (const c of curriculumList) {
          const cLower = c.lecture_name.toLowerCase();
          if (tokens.every(t => cLower.includes(t))) {
            return c.learning_objective;
          }
        }
      }
      return null;
    }
  }

  if (result.includes("NO_MATCH") || !result) {
    return null;
  }

  return result;
}
