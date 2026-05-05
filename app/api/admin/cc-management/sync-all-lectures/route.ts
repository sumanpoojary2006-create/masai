export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { upsertAssignedLecturesFromCache } from "@/lib/cc-lo-sync";
import { mysqlDateToIST, nowIST } from "@/lib/env";
import { fetchBatchCompliance } from "@/lib/lms-mysql";
import { createServerSupabase } from "@/lib/supabase";

async function syncAll() {
  const supabase = createServerSupabase();

  const { data: assignments, error: assignError } = await supabase
    .from("cc_batch_assignments")
    .select("batch_id")
    .order("batch_id", { ascending: true });

  if (assignError) throw new Error(assignError.message);

  const batchIds = [...new Set((assignments ?? []).map((a) => a.batch_id as number))];
  if (batchIds.length === 0) return { batchesSynced: 0, lecturesSynced: 0 };

  let lecturesSynced = 0;

  for (const batchId of batchIds) {
    const lectures = await fetchBatchCompliance(batchId);
    if (lectures.length === 0) continue;

    const { error } = await supabase.from("lms_lecture_cache").upsert(
      lectures.map((l) => ({
        batch_id: batchId,
        lecture_id: l.lecture_id,
        section_id: l.section_id,
        title: l.lecture_title,
        module: l.module,
        schedule: l.schedule ? mysqlDateToIST(l.schedule) : null,
        concludes: l.concludes ? mysqlDateToIST(l.concludes) : null,
        preread_uploaded: l.preread_uploaded,
        notes_uploaded: l.notes_uploaded,
        assignment_uploaded: l.assignment_uploaded,
        synced_at: nowIST()
      })),
      { onConflict: "batch_id,lecture_id" }
    );

    if (error) throw new Error(`Batch ${batchId}: ${error.message}`);
    lecturesSynced += lectures.length;
  }

  const loSync = await upsertAssignedLecturesFromCache({ batchIds });

  return {
    batchesSynced: batchIds.length,
    lecturesSynced,
    loLecturesSynced: loSync.lecturesUpserted,
    objectivesMatched: loSync.objectivesMatched
  };
}

function isCronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/** GET — called by Vercel cron every Sunday */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAll();
    console.log(`[sync-all-lectures] Cron complete: ${result.batchesSynced} batches, ${result.lecturesSynced} lectures`);
    return NextResponse.json({ message: "Sync complete.", ...result });
  } catch (err) {
    console.error("[sync-all-lectures] Cron failed:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}

/** POST — called by admin "Sync All" button */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const result = await syncAll();
    return NextResponse.json({
      message: `Synced ${result.lecturesSynced} lectures across ${result.batchesSynced} batches. LO Tracker updated with ${result.loLecturesSynced} lecture(s).`,
      ...result
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
