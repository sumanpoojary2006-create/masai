export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { analyzeLosFromTranscript } from "@/lib/lo-analyzer";
import { createServerSupabase } from "@/lib/supabase";

export interface AnalyzePendingResult {
  lectureId: string;
  lectureName: string;
  status: "analyzed" | "skipped" | "error";
  reason?: string;
  coveredCount?: number;
  missingCount?: number;
}

/**
 * POST /api/lo-tracker/analyze-pending
 *
 * Finds every lo_report that has a transcript but is NOT yet "completed"
 * (status = "pending" / "error") and runs Gemini LO analysis on each.
 * Skips lectures with no learning_objective set.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const supabase = createServerSupabase();

    // Fetch all pending/errored lo_reports that have a transcript
    const { data: reports, error: reportsError } = await supabase
      .from("lo_reports")
      .select("lecture_id, transcript, status")
      .eq("user_id", user.id)
      .in("status", ["pending", "error"])
      .not("transcript", "is", null)
      .neq("transcript", "");

    if (reportsError) throw new Error(reportsError.message);
    if (!reports || reports.length === 0) {
      return NextResponse.json({
        message: "No pending transcripts to analyze.",
        results: []
      });
    }

    const lectureIds = reports.map((r) => r.lecture_id);

    // Fetch matching lectures to get learning_objective
    const { data: lectures, error: lecturesError } = await supabase
      .from("lectures")
      .select("id, lecture_name, learning_objective")
      .eq("user_id", user.id)
      .in("id", lectureIds);

    if (lecturesError) throw new Error(lecturesError.message);

    const lectureMap = new Map(
      (lectures ?? []).map((l) => [l.id, l])
    );

    const results: AnalyzePendingResult[] = [];

    for (const report of reports) {
      const lecture = lectureMap.get(report.lecture_id);
      const lectureName = lecture?.lecture_name ?? report.lecture_id;

      if (!lecture) {
        results.push({ lectureId: report.lecture_id, lectureName, status: "skipped", reason: "Lecture not found" });
        continue;
      }

      const learningObjective = String(lecture.learning_objective ?? "").trim();
      if (!learningObjective) {
        results.push({ lectureId: report.lecture_id, lectureName, status: "skipped", reason: "No Learning Objectives set — add them in the import sheet" });
        continue;
      }

      try {
        // Mark as analyzing
        await supabase
          .from("lo_reports")
          .update({ status: "analyzing", updated_at: new Date().toISOString() })
          .eq("lecture_id", report.lecture_id)
          .eq("user_id", user.id);

        const analysis = await analyzeLosFromTranscript(learningObjective, report.transcript as string);

        await supabase.from("lo_reports").upsert(
          {
            lecture_id: report.lecture_id,
            user_id: user.id,
            transcript: report.transcript,
            covered_los: analysis.covered_los,
            missing_los: analysis.missing_los,
            status: "completed",
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          { onConflict: "lecture_id" }
        );

        results.push({
          lectureId: report.lecture_id,
          lectureName,
          status: "analyzed",
          coveredCount: analysis.covered_los.length,
          missingCount: analysis.missing_los.length
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Analysis failed";

        await supabase
          .from("lo_reports")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("lecture_id", report.lecture_id)
          .eq("user_id", user.id);

        results.push({ lectureId: report.lecture_id, lectureName, status: "error", reason: reason.slice(0, 200) });
      }
    }

    const analyzed = results.filter((r) => r.status === "analyzed").length;
    const failed = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      message: `${analyzed} analyzed, ${failed} failed.`,
      results
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 }
    );
  }
}
