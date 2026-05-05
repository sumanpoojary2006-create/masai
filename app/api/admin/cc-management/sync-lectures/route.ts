export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { upsertAssignedLecturesFromCache } from "@/lib/cc-lo-sync";
import { syncLmsLectureCacheForBatch } from "@/lib/lms-lecture-cache";
import { fetchBatchCompliance } from "@/lib/lms-mysql";

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
    const cacheSync = await syncLmsLectureCacheForBatch(batchId, lectures);

    if (lectures.length === 0) {
      return NextResponse.json({
        message: `No live lectures found for this batch. Removed ${cacheSync.staleDeleted} stale cached lecture(s).`,
        synced: 0,
        staleDeleted: cacheSync.staleDeleted
      });
    }

    const loSync = await upsertAssignedLecturesFromCache({ batchIds: [batchId] });

    return NextResponse.json({
      message: `Synced ${lectures.length} lectures for batch ${batchId}. Removed ${cacheSync.staleDeleted} stale cached lecture(s). LO Tracker updated with ${loSync.lecturesUpserted} lecture(s).`,
      synced: lectures.length,
      staleDeleted: cacheSync.staleDeleted,
      loLecturesSynced: loSync.lecturesUpserted,
      objectivesMatched: loSync.objectivesMatched
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
