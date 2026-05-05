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

function normalizeLectureTitle(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/â|—|–/g, " ")
    .replace(/\bw\/\b/g, " with ")
    .replace(/&/g, " and ")
    .replace(
      /^(faculty|tutorial|im|industry mentor|industry|live)\s+session\s*\d*\s*[-:]\s*/i,
      ""
    )
    .replace(/^(faculty|tutorial|im)\s+session\s+/i, "")
    .replace(/\bextra\s+class\b/gi, " ")
    .replace(/\bpart\s*\d+\b/gi, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(input: string) {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "for",
    "to",
    "of",
    "with",
    "in",
    "on",
    "at"
  ]);

  return normalizeLectureTitle(input)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

export function deterministicMatchLearningObjective(
  lmsLectureName: string,
  curriculumList: { lecture_name: string; learning_objective: string }[]
) {
  const normalizedTarget = normalizeLectureTitle(lmsLectureName);
  const targetTokens = titleTokens(lmsLectureName);

  if (!normalizedTarget || targetTokens.length === 0) {
    return null;
  }

  let bestMatch: { learning_objective: string; score: number } | null = null;

  for (const curriculum of curriculumList) {
    const normalizedCurriculum = normalizeLectureTitle(curriculum.lecture_name);
    const curriculumTokens = titleTokens(curriculum.lecture_name);

    if (!normalizedCurriculum || curriculumTokens.length === 0) {
      continue;
    }

    if (normalizedTarget === normalizedCurriculum) {
      return curriculum.learning_objective;
    }

    if (
      normalizedTarget.includes(normalizedCurriculum) ||
      normalizedCurriculum.includes(normalizedTarget)
    ) {
      const shorterLength = Math.min(normalizedTarget.length, normalizedCurriculum.length);
      if (shorterLength >= 8) {
        return curriculum.learning_objective;
      }
    }

    const overlap = targetTokens.filter((token) => curriculumTokens.includes(token));
    const coverageScore = overlap.length / Math.max(targetTokens.length, curriculumTokens.length);
    const targetCoverage = overlap.length / targetTokens.length;
    const curriculumCoverage = overlap.length / curriculumTokens.length;

    const score =
      overlap.length * 10 +
      targetCoverage * 5 +
      curriculumCoverage * 5 +
      coverageScore * 5;

    if (
      overlap.length >= 2 &&
      targetCoverage >= 0.6 &&
      (!bestMatch || score > bestMatch.score)
    ) {
      bestMatch = {
        learning_objective: curriculum.learning_objective,
        score
      };
    }
  }

  return bestMatch?.learning_objective ?? null;
}

export async function matchLearningObjectiveAI(
  lmsLectureName: string,
  curriculumList: { lecture_name: string; learning_objective: string }[]
): Promise<string | null> {
  if (!curriculumList.length) return null;

  const deterministicMatch = deterministicMatchLearningObjective(lmsLectureName, curriculumList);
  if (deterministicMatch) {
    return deterministicMatch;
  }

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
      return deterministicMatchLearningObjective(lmsLectureName, curriculumList);
    }
  }

  if (result.includes("NO_MATCH") || !result) {
    return null;
  }

  return result;
}
