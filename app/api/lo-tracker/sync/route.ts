export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getCurrentUser } from "@/lib/auth";
import { getAppTimezone, nowIST } from "@/lib/env";
import { analyzeLosFromTranscript } from "@/lib/lo-analyzer";
import { extractLmsLectureIdFromUrl, fetchLectureSummaryFromDb } from "@/lib/lms-db";
import { createServerSupabase } from "@/lib/supabase";

interface ActionResult {
  lectureId: string;
  lectureName: string;
  status: "fetched" | "analyzed" | "skipped" | "error";
  reason?: string;
  coveredCount?: number;
  missingCount?: number;
}

/** Dispatch to GitHub Actions if the token is set. Returns true on success. */
async function dispatchGitHubWorkflow(userId: string): Promise<{ ok: boolean; message: string }> {
  const githubToken = process.env.WORKFLOW_DISPATCH_TOKEN;
  const githubRepo = process.env.GITHUB_REPO ?? "sumanpoojary2006-create/masai";
  const githubRef = process.env.GITHUB_WORKFLOW_REF ?? "main";

  if (!githubToken) return { ok: false, message: "No token" };

  const [owner, repo] = githubRepo.split("/");
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/lo-sync.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ ref: githubRef, inputs: { target_user_id: userId } })
    }
  );

  if (!response.ok) {
    const failure = await response.text();
    return { ok: false, message: `GitHub dispatch failed: ${failure || response.statusText}` };
  }

  return { ok: true, message: "LO sync workflow dispatched. Check back in 2–3 minutes." };
}

/**
 * Inline sync: for each lecture that has started ≥ 45 min ago and has a session_link
 * but no stored transcript, fetch the summary from the LMS MySQL DB and run LO analysis.
 * Also re-analyzes any "pending" transcripts that already exist.
 */
async function inlineSync(userId: string): Promise<ActionResult[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  // Get this week's lectures for the user
  const lookback = now.weekday === 1 ? 2 : 0;
  const weekStart = now.startOf("week").minus({ days: lookback }).toISODate()!;
  const weekEnd = now.startOf("week").plus({ days: 8 }).toISODate()!;

  const { data: lectures, error: lectErr } = await supabase
    .from("lectures")
    .select("id, lecture_name, learning_objective, session_link, lecture_date, start_time, end_time")
    .eq("user_id", userId)
    .is("archived_at", null)
    .gte("lecture_date", weekStart)
    .lte("lecture_date", weekEnd);

  if (lectErr) throw new Error(lectErr.message);
  if (!lectures?.length) return [{ lectureId: "none", lectureName: "—", status: "skipped", reason: "No lectures this week." }];

  const lectureIds = lectures.map((l) => l.id);
  const { data: existingReports } = await supabase
    .from("lo_reports")
    .select("lecture_id, transcript, status")
    .in("lecture_id", lectureIds);

  const reportByLecture = new Map<string, { transcript: string; status: string }>(
    (existingReports ?? []).map((r) => [r.lecture_id, { transcript: r.transcript ?? "", status: r.status }])
  );

  const results: ActionResult[] = [];

  for (const lecture of lectures) {
    const lectureName = lecture.lecture_name;
    const lectureId = lecture.id;
    const sessionLink = (lecture as Record<string, unknown>).session_link as string ?? "";
    const learningObjective = (lecture as Record<string, unknown>).learning_objective as string ?? "";

    // Only process lectures that have started (≥ 45 min ago)
    const lectureStart = DateTime.fromISO(
      `${lecture.lecture_date}T${lecture.start_time}`, { zone: timezone }
    );
    const minutesSinceStart = now.diff(lectureStart, "minutes").minutes;
    if (minutesSinceStart < 45) {
      results.push({ lectureId, lectureName, status: "skipped", reason: "Lecture hasn't started yet or started < 45 min ago." });
      continue;
    }

    const existing = reportByLecture.get(lectureId);
    const hasTranscript = Boolean(existing?.transcript?.trim());
    const isCompleted = existing?.status === "completed";

    if (isCompleted && hasTranscript) {
      results.push({ lectureId, lectureName, status: "skipped", reason: "Already analyzed." });
      continue;
    }

    let transcript = existing?.transcript ?? "";

    // Fetch transcript from LMS MySQL DB if not already stored
    if (!hasTranscript && sessionLink && sessionLink.includes("masaischool.com")) {
      const lmsId = extractLmsLectureIdFromUrl(sessionLink);
      if (lmsId) {
        try {
          const fetched = await fetchLectureSummaryFromDb(lmsId);
          if (fetched) {
            transcript = fetched;
            await supabase.from("lo_reports").upsert(
              {
                lecture_id: lectureId,
                user_id: userId,
                transcript,
                status: "pending",
                covered_los: [],
                missing_los: [],
                generated_at: null,
                updated_at: nowIST()
              },
              { onConflict: "lecture_id" }
            );
          }
        } catch (dbErr) {
          const reason = dbErr instanceof Error ? dbErr.message : "LMS DB query failed";
          results.push({ lectureId, lectureName, status: "error", reason: reason.slice(0, 200) });
          continue;
        }
      }
    }

    if (!transcript.trim()) {
      results.push({ lectureId, lectureName, status: "skipped", reason: "No summary in LMS database yet. It may still be generating." });
      continue;
    }

    if (!learningObjective.trim()) {
      results.push({ lectureId, lectureName, status: "skipped", reason: "No Learning Objectives set for this lecture. Run Match Missing LOs first." });
      continue;
    }

    // Run LO analysis
    try {
      await supabase.from("lo_reports").upsert(
        { lecture_id: lectureId, user_id: userId, transcript, status: "analyzing", covered_los: [], missing_los: [], generated_at: null, updated_at: nowIST() },
        { onConflict: "lecture_id" }
      );

      const analysis = await analyzeLosFromTranscript(learningObjective, transcript);

      await supabase.from("lo_reports").upsert(
        {
          lecture_id: lectureId,
          user_id: userId,
          transcript,
          covered_los: analysis.covered_los,
          missing_los: analysis.missing_los,
          status: "completed",
          fallback: analysis.fallback ?? false,
          generated_at: nowIST(),
          updated_at: nowIST()
        },
        { onConflict: "lecture_id" }
      );

      results.push({
        lectureId,
        lectureName,
        status: "analyzed",
        coveredCount: analysis.covered_los.length,
        missingCount: analysis.missing_los.length,
        reason: analysis.fallback ? "⚠ Keyword matching used (AI quota exceeded)" : undefined
      });
    } catch (analyzeErr) {
      await supabase.from("lo_reports").update({ status: "pending", updated_at: nowIST() })
        .eq("lecture_id", lectureId).eq("user_id", userId);
      const reason = analyzeErr instanceof Error ? analyzeErr.message : "Analysis failed";
      results.push({ lectureId, lectureName, status: "error", reason: reason.slice(0, 200) });
    }
  }

  return results;
}


export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    // Try GitHub Actions first (async, fast response)
    const dispatch = await dispatchGitHubWorkflow(user.id);
    if (dispatch.ok) {
      return NextResponse.json({
        dispatched: true,
        message: dispatch.message
      });
    }

    // GitHub Actions not available — run inline sync
    console.log("[lo-sync] GitHub Actions unavailable, running inline sync:", dispatch.message);
    const results = await inlineSync(user.id);

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync failed.", results: [] },
      { status: 500 }
    );
  }
}
