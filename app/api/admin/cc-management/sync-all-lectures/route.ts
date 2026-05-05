export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { upsertAssignedLecturesFromCache } from "@/lib/cc-lo-sync";
import { syncLmsLectureCacheForBatch } from "@/lib/lms-lecture-cache";
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
  if (batchIds.length === 0) return { batchesSynced: 0, lecturesSynced: 0, staleDeleted: 0 };

  let lecturesSynced = 0;
  let staleDeleted = 0;

  for (const batchId of batchIds) {
    const lectures = await fetchBatchCompliance(batchId);
    const cacheSync = await syncLmsLectureCacheForBatch(batchId, lectures);
    lecturesSynced += lectures.length;
    staleDeleted += cacheSync.staleDeleted;
  }

  const loSync = await upsertAssignedLecturesFromCache({ batchIds });

  return {
    batchesSynced: batchIds.length,
    lecturesSynced,
    staleDeleted,
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
    console.log(`[sync-all-lectures] Cron complete: ${result.batchesSynced} batches, ${result.lecturesSynced} lectures, ${result.staleDeleted} stale deleted`);
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
      message: `Synced ${result.lecturesSynced} lectures across ${result.batchesSynced} batches. Removed ${result.staleDeleted} stale cached lecture(s). LO Tracker updated with ${result.loLecturesSynced} lecture(s).`,
      ...result
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
