export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/lo-tracker/auto-sync
 *
 * Called by Vercel Cron every 30 minutes on weekdays.
 * For each CC user who has lectures that started 45–180 minutes ago
 * and don't yet have a completed lo_report, fetches the LMS summary
 * and runs LO analysis.
 *
 * Protected by CRON_SECRET (set as Vercel env var).
 */

import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getAppTimezone, nowIST } from "@/lib/env";
import { analyzeLosFromTranscript } from "@/lib/lo-analyzer";
import { scrapeLectureSummary } from "@/lib/lms-scraper";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  const todayStr = now.toISODate()!;

  // Find all lectures scheduled for today that started 45–180 minutes ago
  const cutoffFrom = now.minus({ minutes: 180 }).toFormat("HH:mm:ss");
  const cutoffTo = now.minus({ minutes: 45 }).toFormat("HH:mm:ss");

  const { data: lectures, error: lectErr } = await supabase
    .from("lectures")
    .select("id, user_id, lecture_name, learning_objective, session_link, start_time")
    .eq("lecture_date", todayStr)
    .is("archived_at", null)
    .gte("start_time", cutoffFrom)
    .lte("start_time", cutoffTo);

  if (lectErr) {
    console.error("[auto-sync] Error fetching lectures:", lectErr.message);
    return NextResponse.json({ message: lectErr.message }, { status: 500 });
  }

  if (!lectures?.length) {
    return NextResponse.json({ message: "No lectures in auto-sync window.", processed: 0 });
  }

  const lectureIds = lectures.map((l) => l.id);

  // Skip lectures that already have a completed report
  const { data: existingReports } = await supabase
    .from("lo_reports")
    .select("lecture_id, status")
    .in("lecture_id", lectureIds)
    .eq("status", "completed");

  const completedIds = new Set((existingReports ?? []).map((r) => r.lecture_id));
  const pending = lectures.filter((l) => !completedIds.has(l.id));

  if (!pending.length) {
    return NextResponse.json({ message: "All lectures already analyzed.", processed: 0 });
  }

  // Batch-fetch LMS credentials for all affected users
  const userIds = [...new Set(pending.map((l) => l.user_id))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, lms_username, lms_password")
    .in("user_id", userIds);

  const credsByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, { username: p.lms_username, password: p.lms_password }])
  );

  let processed = 0;
  let errors = 0;

  for (const lecture of pending) {
    const sessionLink = (lecture as Record<string, unknown>).session_link as string ?? "";
    const learningObjective = (lecture as Record<string, unknown>).learning_objective as string ?? "";
    const creds = credsByUser.get(lecture.user_id);

    if (!sessionLink || !sessionLink.includes("masaischool.com") || !creds?.username || !creds?.password) {
      continue;
    }

    if (!learningObjective.trim()) {
      console.log(`[auto-sync] No LO for "${lecture.lecture_name}" — skipping analysis`);
      continue;
    }

    try {
      const transcript = await scrapeLectureSummary(sessionLink, {
        username: creds.username,
        password: creds.password
      });

      if (!transcript.trim()) continue;

      // Store transcript and mark as pending
      await supabase.from("lo_reports").upsert(
        {
          lecture_id: lecture.id,
          user_id: lecture.user_id,
          transcript,
          status: "pending",
          covered_los: [],
          missing_los: [],
          generated_at: null,
          updated_at: nowIST()
        },
        { onConflict: "lecture_id" }
      );

      // Run analysis
      const analysis = await analyzeLosFromTranscript(learningObjective, transcript);

      await supabase.from("lo_reports").upsert(
        {
          lecture_id: lecture.id,
          user_id: lecture.user_id,
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

      console.log(`[auto-sync] ✓ "${lecture.lecture_name}" — ${analysis.covered_los.length} covered / ${analysis.missing_los.length} missing`);
      processed++;
    } catch (err) {
      console.error(`[auto-sync] ✗ "${lecture.lecture_name}":`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return NextResponse.json({ message: `Auto-sync complete: ${processed} processed, ${errors} errors.`, processed, errors });
}
