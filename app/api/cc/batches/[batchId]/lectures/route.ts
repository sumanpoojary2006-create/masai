export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";

/** GET — return cached lecture compliance for one of the CC's assigned batches */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { batchId: batchIdStr } = await params;
    const batchId = parseInt(batchIdStr, 10);
    if (Number.isNaN(batchId)) {
      return NextResponse.json({ message: "Invalid batchId." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // Verify this batch is actually assigned to the requesting CC
    const { data: assignment } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id")
      .eq("cc_user_id", user.id)
      .eq("batch_id", batchId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json({ message: "Batch not assigned to you." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("lms_lecture_cache")
      .select(
        "lecture_id, title, module, schedule, concludes, preread_uploaded, notes_uploaded, assignment_uploaded, synced_at"
      )
      .eq("batch_id", batchId)
      .order("schedule", { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({ lectures: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch lectures." },
      { status: 500 }
    );
  }
}
