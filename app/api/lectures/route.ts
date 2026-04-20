export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, getUserBatchConfigs } from "@/lib/auth";
import { TASK_TYPES } from "@/lib/constants";
import { computeDeadline } from "@/lib/deadlines";
import { toIsoDate, toSqlTime } from "@/lib/importer";
import { getDashboardData } from "@/lib/queries";
import { createServerSupabase } from "@/lib/supabase";
import { TaskRecord, TaskStatus } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const payload = (await request.json()) as Record<string, unknown>;

    const batchName = String(payload.batch_name ?? "").trim();
    const moduleName = String(payload.module_name ?? "").trim();
    const lectureName = String(payload.lecture_name ?? "").trim();
    const learningObjective = String(payload.learning_objective ?? "").trim();
    const lectureDate = toIsoDate(payload.lecture_date);
    const startTime = toSqlTime(payload.start_time ?? "20:00:00");
    const endTime = toSqlTime(payload.end_time ?? "21:30:00");

    if (!batchName || !lectureName || !lectureDate) {
      return NextResponse.json(
        { message: "Batch name, lecture name and date are required." },
        { status: 400 }
      );
    }

    // Validate batch belongs to this user
    const batchConfigs = await getUserBatchConfigs(user.id);
    const allowedBatches = batchConfigs.map((c) => c.batch_name);
    if (!allowedBatches.includes(batchName)) {
      return NextResponse.json(
        { message: `Batch "${batchName}" is not configured for your account.` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    const { data: inserted, error: insertError } = await supabase
      .from("lectures")
      .upsert(
        {
          user_id: user.id,
          batch_name: batchName,
          module_name: moduleName,
          lecture_name: lectureName,
          learning_objective: learningObjective,
          lecture_date: lectureDate,
          start_time: startTime,
          end_time: endTime
        },
        { onConflict: "user_id,batch_name,module_name,lecture_name,lecture_date,start_time" }
      )
      .select("id, lecture_date, start_time, end_time")
      .maybeSingle();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Failed to create lecture.");
    }

    // Fetch existing tasks to preserve completed status
    const { data: existingTasks } = await supabase
      .from("tasks")
      .select("id, lecture_id, type, deadline, status, completed_at, last_checked_at")
      .eq("lecture_id", inserted.id);

    const taskMap = new Map(
      ((existingTasks ?? []) as TaskRecord[]).map((t) => [t.type, t])
    );
    const now = new Date().toISOString();

    const taskPayload = TASK_TYPES.map((type) => {
      const existing = taskMap.get(type);
      const deadline = computeDeadline(type, inserted.lecture_date, inserted.start_time, inserted.end_time);
      return {
        lecture_id: inserted.id,
        type,
        deadline,
        status:
          existing?.status === "completed" ? "completed" : deadline < now ? "missed" : "pending",
        completed_at: existing?.completed_at ?? null,
        last_checked_at: existing?.last_checked_at ?? null
      };
    });

    await supabase.from("tasks").upsert(taskPayload, { onConflict: "lecture_id,type" });

    return NextResponse.json({ message: "Lecture added successfully." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to add lecture." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          message: "Please log in first."
        },
        {
          status: 401
        }
      );
    }

    const batch = request.nextUrl.searchParams.get("batch") ?? undefined;
    const status = (request.nextUrl.searchParams.get("status") as TaskStatus | "all" | null) ?? "all";

    const lectures = await getDashboardData({
      userId: user.id,
      batch,
      status
    });

    return NextResponse.json({
      lectures
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to fetch lectures."
      },
      {
        status: 500
      }
    );
  }
}
