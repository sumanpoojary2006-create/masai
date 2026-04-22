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

    const leaderboard = [...userStats]
      .sort((a, b) => {
        const aScore = a.completedTasks / (a.totalLectures * 3) || 0;
        const bScore = b.completedTasks / (b.totalLectures * 3) || 0;
        return bScore - aScore;
      })
      .map((user, index) => ({
        rank: index + 1,
        email: user.email,
        batches: user.batchConfigs.map((c) => c.batch_name).join(";"),
        lectures: user.totalLectures,
        completed: user.completedTasks,
        pending: user.pendingTasks,
        missed: user.missedTasks,
        score:
          user.totalLectures > 0
            ? Math.round((user.completedTasks / (user.totalLectures * 3)) * 100)
            : 0
      }));

    const batchCsv = [
      ["Batch", "Lectures", "Completed", "Pending", "Missed", "Rate"].join(","),
      ...batchStats.map((b) =>
        [
          `"${b.batchName}"`,
          b.lectureCount,
          b.completedTasks,
          b.pendingTasks,
          b.missedTasks,
          b.lectureCount > 0
            ? Math.round(
                (b.completedTasks / (b.lectureCount * 3)) * 100
              )
            : 0
        ].join(",")
      )
    ].join("\n");

    const lectureCsv = [
      ["Lecture", "Batch", "Date", "Start Time", "End Time", "User", "Pre-read", "Notes", "Assignment"].join(","),
      ...lectureStats.map((l) =>
        [
          `"${l.lectureName}"`,
          `"${l.batchName}"`,
          l.lectureDate,
          l.startTime,
          l.endTime,
          `"${l.userEmail}"`,
          l.prereadStatus ?? "N/A",
          l.notesStatus ?? "N/A",
          l.assignmentStatus ?? "N/A"
        ].join(",")
      )
    ].join("\n");

    const leaderboardCsv = [
      ["Rank", "Email", "Batches", "Lectures", "Completed", "Pending", "Missed", "Score"].join(","),
      ...leaderboard.map((u) =>
        [
          u.rank,
          `"${u.email}"`,
          `"${u.batches}"`,
          u.lectures,
          u.completed,
          u.pending,
          u.missed,
          `${u.score}%`
        ].join(",")
      )
    ].join("\n");

    return NextResponse.json({
      leaderboardCsv,
      batchCsv,
      lectureCsv
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}