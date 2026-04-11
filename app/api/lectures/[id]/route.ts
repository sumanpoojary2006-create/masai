export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { TASK_TYPES } from "@/lib/constants";
import { computeDeadline } from "@/lib/deadlines";
import { toIsoDate, toSqlTime } from "@/lib/importer";
import { createServerSupabase } from "@/lib/supabase";
import { TaskRecord } from "@/lib/types";

async function resolveParams(context: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await context.params;

  if (!id) {
    throw new Error("Lecture id is required.");
  }

  return { id };
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
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

    const { id } = await resolveParams(context);
    const payload = (await request.json()) as Record<string, unknown>;

    const batchName = String(payload.batch_name ?? "").trim();
    const moduleName = String(payload.module_name ?? "").trim();
    const lectureName = String(payload.lecture_name ?? "").trim();
    const lectureDate = toIsoDate(payload.lecture_date);
    const startTime = toSqlTime(payload.start_time);
    const endTime = toSqlTime(payload.end_time);

    if (!batchName || !moduleName || !lectureName) {
      return NextResponse.json(
        {
          message: "Batch, module, and lecture name are required."
        },
        {
          status: 400
        }
      );
    }

    const supabase = createServerSupabase();
    const { data: updatedLecture, error: lectureError } = await supabase
      .from("lectures")
      .update({
        batch_name: batchName,
        module_name: moduleName,
        lecture_name: lectureName,
        lecture_date: lectureDate,
        start_time: startTime,
        end_time: endTime
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, lecture_date, start_time, end_time")
      .maybeSingle();

    if (lectureError) {
      throw new Error(lectureError.message);
    }

    if (!updatedLecture) {
      return NextResponse.json(
        {
          message: "Lecture not found."
        },
        {
          status: 404
        }
      );
    }

    const { data: existingTasks, error: taskError } = await supabase
      .from("tasks")
      .select("id, lecture_id, type, deadline, status, completed_at, last_checked_at")
      .eq("lecture_id", id);

    if (taskError) {
      throw new Error(taskError.message);
    }

    const now = new Date().toISOString();
    const taskMap = new Map(
      ((existingTasks ?? []) as TaskRecord[]).map((task) => [task.type, task] as const)
    );

    const refreshedTasks = TASK_TYPES.map((type) => {
      const existingTask = taskMap.get(type);
      const deadline = computeDeadline(
        type,
        updatedLecture.lecture_date,
        updatedLecture.start_time,
        updatedLecture.end_time
      );

      return {
        lecture_id: id,
        type,
        deadline,
        status:
          existingTask?.status === "completed"
            ? "completed"
            : deadline < now
              ? "missed"
              : "pending",
        completed_at: existingTask?.completed_at ?? null,
        last_checked_at: existingTask?.last_checked_at ?? null
      };
    });

    const { error: upsertTaskError } = await supabase.from("tasks").upsert(refreshedTasks, {
      onConflict: "lecture_id,type"
    });

    if (upsertTaskError) {
      throw new Error(upsertTaskError.message);
    }

    return NextResponse.json({
      message: "Lecture updated successfully."
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to update lecture."
      },
      {
        status: 500
      }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
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

    const { id } = await resolveParams(context);

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("lectures")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        {
          message: "Lecture not found."
        },
        {
          status: 404
        }
      );
    }

    return NextResponse.json({
      message: "Lecture deleted successfully."
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to delete lecture."
      },
      {
        status: 500
      }
    );
  }
}
