export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deriveAssignmentBatchUrl } from "@/lib/lms-batch-urls";
import { createServerSupabase } from "@/lib/supabase";

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          message: "Please log in first."
        },
        {
          status: 401
        }
      );
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const lmsUsername = String(payload.lms_username ?? "").trim();
    const lmsPassword = String(payload.lms_password ?? "").trim();
    const batchName = String(payload.batch_name ?? "").trim();
    const lectureBatchUrl = String(payload.lecture_batch_url ?? "").trim();
    const assignmentBatchUrl = String(
      payload.assignment_batch_url || deriveAssignmentBatchUrl(lectureBatchUrl)
    ).trim();

    if (!lmsUsername || !lmsPassword || !batchName || !lectureBatchUrl) {
      return NextResponse.json(
        {
          message: "LMS username, LMS password, batch name, and lecture batch URL are required."
        },
        {
          status: 400
        }
      );
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        email: user.email ?? "",
        lms_username: lmsUsername,
        lms_password: lmsPassword,
        batch_name: batchName,
        lecture_batch_url: lectureBatchUrl,
        assignment_batch_url: assignmentBatchUrl,
        onboarding_complete: true
      },
      {
        onConflict: "user_id"
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      message: "Profile saved."
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to save your profile."
      },
      {
        status: 500
      }
    );
  }
}
