export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { nowIST } from "@/lib/env";

import { getCurrentUser } from "@/lib/auth";
import { extractLmsLectureId, fetchLectureSummaryFromDb } from "@/lib/lms-db";
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

    const lectureResult = await supabase
      .from("lectures")
      .select("id, lecture_name, session_link")
      .eq("id", lectureId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lectureResult.error) throw new Error(lectureResult.error.message);
    if (!lectureResult.data) {
      return NextResponse.json({ message: "Lecture not found." }, { status: 404 });
    }

    const lecture = lectureResult.data;
    const sessionLink = (lecture as Record<string, unknown>).session_link as string ?? "";

    if (!sessionLink) {
      return NextResponse.json(
        { message: "No session link set for this lecture. Add one first." },
        { status: 400 }
      );
    }

    if (!sessionLink.includes("masaischool.com")) {
      return NextResponse.json(
        { message: "Session link must be a masaischool.com URL." },
        { status: 400 }
      );
    }

    const lmsLectureId = extractLmsLectureId(sessionLink);
    if (!lmsLectureId) {
      return NextResponse.json(
        { message: "Could not parse LMS lecture id from the session link." },
        { status: 400 }
      );
    }

    const summary = await fetchLectureSummaryFromDb(lmsLectureId);

    // Save to lo_reports (upsert so existing reports are updated)
    const { error: upsertError } = await supabase.from("lo_reports").upsert(
      {
        lecture_id: lectureId,
        user_id: user.id,
        transcript: summary,
        status: "pending",
        covered_los: [],
        missing_los: [],
        generated_at: null,
        updated_at: nowIST()
      },
      { onConflict: "lecture_id" }
    );

    if (upsertError) throw new Error(upsertError.message);

    return NextResponse.json({
      message: "Summary fetched successfully.",
      transcript: summary
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch summary." },
      { status: 500 }
    );
  }
}
