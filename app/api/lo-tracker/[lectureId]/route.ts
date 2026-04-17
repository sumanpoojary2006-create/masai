export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getCurrentUser } from "@/lib/auth";
import { getAppTimezone } from "@/lib/env";
import { analyzeLosFromTranscript } from "@/lib/lo-analyzer";
import { createServerSupabase } from "@/lib/supabase";
import { LoReport } from "@/lib/types";

async function resolveParams(context: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await context.params;
  if (!lectureId) throw new Error("lectureId is required.");
  return lectureId;
}

// PATCH — update session_link for a lecture
export async function PATCH(
  request: Request,
  context: { params: Promise<{ lectureId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Please log in first." }, { status: 401 });

    const lectureId = await resolveParams(context);
    const payload = (await request.json()) as { session_link?: string };
    const sessionLink = String(payload.session_link ?? "").trim();

    const supabase = createServerSupabase();

    const { error } = await supabase
      .from("lectures")
      .update({ session_link: sessionLink })
      .eq("id", lectureId)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Session link updated." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update session link." },
      { status: 500 }
    );
  }
}

// POST — save transcript and trigger LO analysis
export async function POST(
  request: Request,
  context: { params: Promise<{ lectureId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Please log in first." }, { status: 401 });

    const lectureId = await resolveParams(context);
    const payload = (await request.json()) as { transcript?: string };
    const transcript = String(payload.transcript ?? "").trim();

    if (!transcript) {
      return NextResponse.json({ message: "Transcript text is required." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // Fetch the lecture to get learning_objective and check timing
    const { data: lecture, error: lectureError } = await supabase
      .from("lectures")
      .select("id, lecture_name, learning_objective, lecture_date, end_time")
      .eq("id", lectureId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lectureError) throw new Error(lectureError.message);
    if (!lecture) return NextResponse.json({ message: "Lecture not found." }, { status: 404 });

    const learningObjective = String((lecture as Record<string, unknown>).learning_objective ?? "").trim();
    if (!learningObjective) {
      return NextResponse.json(
        { message: "No Learning Objectives found for this lecture. Import the sheet with LOs first." },
        { status: 400 }
      );
    }

    // Check: lecture must have ended before analysis is allowed (end_time + 1 hour)
    const lectureEnd = DateTime.fromISO(
      `${lecture.lecture_date}T${lecture.end_time}`,
      { zone: getAppTimezone() }
    ).plus({ hours: 1 });

    const now = DateTime.now().setZone(getAppTimezone());
    if (now < lectureEnd) {
      const minutesLeft = Math.ceil(lectureEnd.diff(now, "minutes").minutes);
      return NextResponse.json(
        { message: `Analysis available ${minutesLeft} min after lecture ends.` },
        { status: 400 }
      );
    }

    // Mark as analyzing
    const reportBase = {
      lecture_id: lectureId,
      user_id: user.id,
      transcript,
      status: "analyzing",
      covered_los: [],
      missing_los: [],
      generated_at: null,
      updated_at: new Date().toISOString()
    };

    await supabase.from("lo_reports").upsert(reportBase, { onConflict: "lecture_id" });

    // Run analysis
    const result = await analyzeLosFromTranscript(learningObjective, transcript);

    // Save completed report
    const { data: savedReport, error: saveError } = await supabase
      .from("lo_reports")
      .upsert(
        {
          lecture_id: lectureId,
          user_id: user.id,
          transcript,
          covered_los: result.covered_los,
          missing_los: result.missing_los,
          status: "completed",
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "lecture_id" }
      )
      .select("*")
      .maybeSingle();

    if (saveError) throw new Error(saveError.message);

    return NextResponse.json({
      message: "LO analysis complete.",
      report: savedReport as LoReport
    });
  } catch (error) {
    // On error, reset to "pending" so transcript is preserved and retryable
    try {
      const lectureId = await resolveParams(context);
      const user = await getCurrentUser();
      if (user) {
        const supabase = createServerSupabase();
        await supabase
          .from("lo_reports")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("lecture_id", lectureId)
          .eq("user_id", user.id);
      }
    } catch {
      // best effort
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "LO analysis failed." },
      { status: 500 }
    );
  }
}
