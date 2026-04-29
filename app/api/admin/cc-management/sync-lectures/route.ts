export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { fetchBatchCompliance } from "@/lib/lms-mysql";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { batchId } = (await request.json()) as { batchId?: number };
    if (!batchId) {
      return NextResponse.json({ message: "batchId is required." }, { status: 400 });
    }

    const lectures = await fetchBatchCompliance(batchId);

    if (lectures.length === 0) {
      return NextResponse.json({ message: "No live lectures found for this batch.", synced: 0 });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("lms_lecture_cache").upsert(
      lectures.map((l) => ({
        batch_id: batchId,
        lecture_id: l.lecture_id,
        section_id: l.section_id,
        title: l.lecture_title,
        module: l.module,
        schedule: l.schedule?.toISOString() ?? null,
        concludes: l.concludes?.toISOString() ?? null,
        preread_uploaded: l.preread_uploaded,
        notes_uploaded: l.notes_uploaded,
        assignment_uploaded: l.assignment_uploaded,
        synced_at: new Date().toISOString()
      })),
      { onConflict: "batch_id,lecture_id" }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      message: `Synced ${lectures.length} lectures for batch ${batchId}.`,
      synced: lectures.length
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
