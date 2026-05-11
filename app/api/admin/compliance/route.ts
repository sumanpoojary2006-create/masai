export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { syncTaskStatusesFromLms } from "@/lib/automation";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    if (!(await hasAdminAccess(user.id))) {
      return NextResponse.json({ message: "Admin access required." }, { status: 403 });
    }

    // Sync LMS state into both lms_lecture_cache and the tasks table for ALL CC profiles.
    // This is the same logic the CC-side /api/compliance uses, but scoped to every user.
    const syncResult = await syncTaskStatusesFromLms();

    console.log(
      `[admin/compliance] Checked ${syncResult.checkedLectures} lectures, updated ${syncResult.updatedTasks} tasks, ${syncResult.newlyCompleted.length} newly completed.`
    );

    return NextResponse.json({
      message:
        syncResult.newlyCompleted.length > 0
          ? `Sync complete. ${syncResult.updatedTasks} tasks updated · ${syncResult.newlyCompleted.length} newly completed.`
          : syncResult.pendingToday.length > 0
          ? `Sync complete. ${syncResult.updatedTasks} tasks updated · ${syncResult.pendingToday.length} still pending today.`
          : `Sync complete. All resources are on track — no overdue pending items.`,
      checkedLectures: syncResult.checkedLectures,
      updatedTasks: syncResult.updatedTasks,
      newlyCompleted: syncResult.newlyCompleted.length,
      pendingToday: syncResult.pendingToday.length,
    });
  } catch (error) {
    console.error("[admin/compliance] Error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync Up failed." },
      { status: 500 }
    );
  }
}
