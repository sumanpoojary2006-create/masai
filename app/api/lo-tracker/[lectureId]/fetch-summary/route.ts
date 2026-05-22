export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { nowIST } from "@/lib/env";
import { extractLmsLectureIdFromUrl, fetchLectureSummaryFromDb } from "@/lib/lms-db";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(
  _request: Request,
  context: { params: Promise<{ lectureId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const { lectureId } = await context.params;
    const supabase = createServerSupabase();

    // Fetch lecture (need session_link to query LMS DB)
    const { data: lecture, error: lectureError } = await supabase
      .from("lectures")
      .select("id, session_link")
      .eq("id", lectureId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lectureError) throw new Error(lectureError.message);
    if (!lecture) {
      return NextResponse.json({ message: "Lecture not found." }, { status: 404 });
    }

    // 1. Check if transcript is already cached in lo_reports
    const { data: report, error: reportError } = await supabase
      .from("lo_reports")
      .select("transcript")
      .eq("lecture_id", lectureId)
      .maybeSingle();

    if (reportError) throw new Error(reportError.message);

    const cached = report?.transcript?.trim() ?? "";
    if (cached) {
      return NextResponse.json({ message: "Summary fetched successfully.", transcript: cached });
    }

    // 2. Not cached — fetch directly from LMS MySQL DB
    const sessionLink = (lecture as Record<string, unknown>).session_link as string ?? "";
    if (!sessionLink) {
      return NextResponse.json(
        { message: "No session link set for this lecture. Add one first." },
        { status: 400 }
      );
    }

    const lmsId = extractLmsLectureIdFromUrl(sessionLink);
    if (!lmsId) {
      return NextResponse.json(
        { message: "Could not parse LMS lecture ID from session link." },
        { status: 400 }
      );
    }

    const transcript = await fetchLectureSummaryFromDb(lmsId);
    if (!transcript) {
      return NextResponse.json(
        { message: "Summary not yet available in LMS. It may still be generating after the session." },
        { status: 404 }
      );
    }

    // 3. Cache it in lo_reports so future loads are instant
    await supabase.from("lo_reports").upsert(
      {
        lecture_id: lectureId,
        user_id: user.id,
        transcript,
        status: "pending",
        covered_los: [],
        missing_los: [],
        generated_at: null,
        updated_at: nowIST()
      },
      { onConflict: "lecture_id" }
    );

    return NextResponse.json({ message: "Summary fetched successfully.", transcript });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch summary." },
      { status: 500 }
    );
  }
}
