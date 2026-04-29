export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const formData = await request.formData();
    const displayName = String(formData.get("display_name") ?? "").trim() || null;
    const slackMemberId = String(formData.get("slack_member_id") ?? "").trim() || null;

    const supabase = createServerSupabase();
    const { error } = await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        email: user.email ?? "",
        // store display name in lms_username column until migration adds display_name
        lms_username: displayName ?? "",
        lms_password: "",
        batch_name: "",
        lecture_batch_url: "",
        assignment_batch_url: "",
        slack_member_id: slackMemberId,
        onboarding_complete: true,
      },
      { onConflict: "user_id" }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Profile saved." });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to save profile." },
      { status: 500 }
    );
  }
}
