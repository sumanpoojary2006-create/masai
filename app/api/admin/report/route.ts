import { NextRequest, NextResponse } from "next/server";

import { isAdminUser } from "@/lib/env";
import { getAdminBatchStats, getAdminDashboardData, getAdminLectureStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server configuration missing" },
      { status: 500 }
    );
  }

  try {
    const supabaseJwt = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(Buffer.from(supabaseJwt.split(".")[1]).toString());
    const userId = payload.sub;

    if (!isAdminUser(userId)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

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

    const leaderboard = [...userStats]
      .sort((a, b) => {
        const aScore = a.completedTasks / (a.totalLectures * 3) || 0;
        const bScore = b.completedTasks / (b.totalLectures * 3) || 0;
        return bScore - aScore;
      })
      .map((user, index) => ({
        rank: index + 1,
        email: user.email,
        batches: user.batchConfigs.map((c) => c.batch_name),
        lectures: user.totalLectures,
        completed: user.completedTasks,
        pending: user.pendingTasks,
        missed: user.missedTasks,
        score:
          user.totalLectures > 0
            ? Math.round((user.completedTasks / (user.totalLectures * 3)) * 100)
            : 0
      }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      overall: overallStats,
      leaderboard,
      batches: batchStats.map((batch) => ({
        name: batch.batchName,
        lectures: batch.lectureCount,
        completed: batch.completedTasks,
        pending: batch.pendingTasks,
        missed: batch.missedTasks,
        rate:
          batch.lectureCount > 0
            ? Math.round(
                (batch.completedTasks /
                  (batch.lectureCount * 3)) *
                  100
              )
            : 0
      })),
      lectures: lectureStats.map((lecture) => ({
        id: lecture.id,
        name: lecture.lectureName,
        batch: lecture.batchName,
        date: lecture.lectureDate,
        startTime: lecture.startTime,
        endTime: lecture.endTime,
        user: lecture.userEmail,
        preread: lecture.prereadStatus,
        notes: lecture.notesStatus,
        assignment: lecture.assignmentStatus
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}