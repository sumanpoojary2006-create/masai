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

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const results = await syncAndAnalyze(user.id);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync failed.", results: [] },
      { status: 500 }
    );
  }
}

/**
 * For each of this week's lectures that have started and aren't yet completed:
 * 1. Fetch summary/transcript from the LMS MySQL DB (lectures_ai table)
 * 2. Store in lo_reports
 * 3. Run LO analysis immediately
 */
async function syncAndAnalyze(userId: string): Promise<ActionResult[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  // This week's range (include last weekend on Mondays)
  const lookback = now.weekday === 1 ? 2 : 0;
  const weekStart = now.startOf("week").minus({ days: lookback }).toISODate()!;
  const weekEnd = now.startOf("week").plus({ days: 8 }).toISODate()!;

  const { data: lectures, error: lectErr } = await supabase
    .from("lectures")
    .select("id, lecture_name, learning_objective, session_link, lecture_date, start_time")
    .eq("user_id", userId)
    .is("archived_at", null)
    .gte("lecture_date", weekStart)
    .lte("lecture_date", weekEnd);

  if (lectErr) throw new Error(lectErr.message);
  if (!lectures?.length) {
    return [{ lectureId: "none", lectureName: "—", status: "skipped", reason: "No lectures this week." }];
  }

  const lectureIds = lectures.map((l) => l.id);
  const { data: existingReports } = await supabase
    .from("lo_reports")
    .select("lecture_id, transcript, status")
    .in("lecture_id", lectureIds);

  const reportMap = new Map(
    (existingReports ?? []).map((r) => [r.lecture_id, { transcript: r.transcript ?? "", status: r.status }])
  );

  const results: ActionResult[] = [];

  for (const lecture of lectures) {
    const { id: lectureId, lecture_name: lectureName } = lecture;
    const sessionLink = (lecture as Record<string, unknown>).session_link as string ?? "";
    const learningObjective = (lecture as Record<string, unknown>).learning_objective as string ?? "";

    // Skip lectures that haven't started yet (< 45 min)
    const lectureStart = DateTime.fromISO(`${lecture.lecture_date}T${lecture.start_time}`, { zone: timezone });
    if (now.diff(lectureStart, "minutes").minutes < 45) {
      results.push({ lectureId, lectureName, status: "skipped", reason: "Not started yet." });
      continue;
    }

    const existing = reportMap.get(lectureId);
    const hasTranscript = Boolean(existing?.transcript?.trim());

    // Skip already-completed lectures
    if (existing?.status === "completed" && hasTranscript) {
      results.push({ lectureId, lectureName, status: "skipped", reason: "Already analyzed." });
      continue;
    }

    let transcript = existing?.transcript ?? "";

    // ── Step 1: fetch from LMS DB if we don't have a transcript yet ──
    if (!hasTranscript) {
      if (!sessionLink?.includes("masaischool.com")) {
        results.push({ lectureId, lectureName, status: "skipped", reason: "No valid session link." });
        continue;
      }

      const lmsId = extractLmsLectureIdFromUrl(sessionLink);
      if (!lmsId) {
        results.push({ lectureId, lectureName, status: "skipped", reason: "Could not parse LMS lecture ID from session link." });
        continue;
      }

      try {
        transcript = (await fetchLectureSummaryFromDb(lmsId)) ?? "";
      } catch (err) {
        results.push({ lectureId, lectureName, status: "error", reason: (err instanceof Error ? err.message : "LMS DB error").slice(0, 200) });
        continue;
      }

      if (!transcript) {
        results.push({ lectureId, lectureName, status: "skipped", reason: "Summary not yet in LMS database." });
        continue;
      }

      // Save transcript so Fetch Summary button picks it up immediately
      await supabase.from("lo_reports").upsert(
        { lecture_id: lectureId, user_id: userId, transcript, status: "pending", covered_los: [], missing_los: [], generated_at: null, updated_at: nowIST() },
        { onConflict: "lecture_id" }
      );
    }

    // ── Step 2: run LO analysis ──
    if (!learningObjective.trim()) {
      results.push({ lectureId, lectureName, status: "skipped", reason: "No Learning Objectives set. Run Match LOs first." });
      continue;
    }

    try {
      await supabase.from("lo_reports").upsert(
        { lecture_id: lectureId, user_id: userId, transcript, status: "analyzing", covered_los: [], missing_los: [], generated_at: null, updated_at: nowIST() },
        { onConflict: "lecture_id" }
      );

      const analysis = await analyzeLosFromTranscript(learningObjective, transcript);

      await supabase.from("lo_reports").upsert(
        { lecture_id: lectureId, user_id: userId, transcript, covered_los: analysis.covered_los, missing_los: analysis.missing_los, status: "completed", fallback: analysis.fallback ?? false, generated_at: nowIST(), updated_at: nowIST() },
        { onConflict: "lecture_id" }
      );

      results.push({
        lectureId, lectureName, status: "analyzed",
        coveredCount: analysis.covered_los.length,
        missingCount: analysis.missing_los.length,
        reason: analysis.fallback ? "⚠ Keyword fallback used (AI quota exceeded)" : undefined
      });
    } catch (err) {
      await supabase.from("lo_reports").update({ status: "pending", updated_at: nowIST() })
        .eq("lecture_id", lectureId).eq("user_id", userId);
      results.push({ lectureId, lectureName, status: "error", reason: (err instanceof Error ? err.message : "Analysis failed").slice(0, 200) });
    }
  }

  return results;
}
