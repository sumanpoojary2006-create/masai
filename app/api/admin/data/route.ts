import { NextRequest, NextResponse } from "next/server";

import { getAdminBatchStats, getAdminDashboardData, getAdminLectureStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const adminParam = request.nextUrl.searchParams.get("admin");

  if (adminParam !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [userStats, batchStats, lectureStats] = await Promise.all([
      getAdminDashboardData(),
      getAdminBatchStats(),
      getAdminLectureStats()
    ]);

    const overallStats = userStats.reduce(
      (acc, user) => ({
        totalLectures: acc.totalLectures + user.totalLectures,
        completedTasks: acc.completedTasks + user.completedTasks,
        pendingTasks: acc.pendingTasks + user.pendingTasks,
        missedTasks: acc.missedTasks + user.missedTasks,
        totalUsers: acc.totalUsers + 1
      }),
      { totalLectures: 0, completedTasks: 0, pendingTasks: 0, missedTasks: 0, totalUsers: 0 }
    );

    return NextResponse.json({
      userStats,
      batchStats,
      lectureStats,
      overallStats
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch admin data" },
      { status: 500 }
    );
  }
}