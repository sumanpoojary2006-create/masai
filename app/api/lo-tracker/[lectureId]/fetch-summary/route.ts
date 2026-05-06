import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
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

    // Verify the lecture belongs to this user
    const { data: lecture, error: lectureError } = await supabase
      .from("lectures")
      .select("id")
      .eq("id", lectureId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lectureError) throw new Error(lectureError.message);
    if (!lecture) {
      return NextResponse.json({ message: "Lecture not found." }, { status: 404 });
    }

    // Read transcript from DB
    const { data: report, error: reportError } = await supabase
      .from("lo_reports")
      .select("transcript")
      .eq("lecture_id", lectureId)
      .maybeSingle();

    if (reportError) throw new Error(reportError.message);

    const transcript = report?.transcript?.trim() ?? "";
    if (!transcript) {
      return NextResponse.json(
        { message: "No summary available yet. It will be fetched automatically after the session ends." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Summary fetched successfully.",
      transcript
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch summary." },
      { status: 500 }
    );
  }
}
