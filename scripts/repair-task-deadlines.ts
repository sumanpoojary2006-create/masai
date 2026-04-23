import { DateTime } from "luxon";

import { TASK_TYPES } from "../lib/constants";
import { computeDeadline } from "../lib/deadlines";
import { getAppTimezone } from "../lib/env";
import { createServerSupabase } from "../lib/supabase";
import { TaskRecord, TaskType } from "../lib/types";

async function main() {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const nowIso = DateTime.now().setZone(timezone).toUTC().toISO();

  if (!nowIso) {
    throw new Error("Unable to resolve current timestamp.");
  }

  const { data: lectures, error: lectureError } = await supabase
    .from("lectures")
    .select("id, lecture_name, lecture_date, start_time, end_time, tasks(id, type, deadline, status, completed_at)")
    .is("archived_at", null);

  if (lectureError) {
    throw new Error(lectureError.message);
  }

  const updates: Array<{
    id: string;
    deadline: string;
    status: string;
  }> = [];

  for (const lecture of lectures ?? []) {
    const tasks = (lecture.tasks ?? []) as TaskRecord[];
    const taskMap = new Map(tasks.map((task) => [task.type, task]));

    for (const type of TASK_TYPES) {
      const existing = taskMap.get(type);
      if (!existing) {
        continue;
      }

      const deadline = computeDeadline(type as TaskType, lecture.lecture_date, lecture.start_time, lecture.end_time);
      const status =
        existing.status === "completed"
          ? "completed"
          : deadline < nowIso
            ? "missed"
            : "pending";

      if (existing.deadline === deadline && existing.status === status) {
        continue;
      }

      updates.push({
        id: existing.id,
        deadline,
        status
      });
    }
  }

  if (updates.length === 0) {
    console.log("No task deadline changes needed.");
    return;
  }

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        deadline: update.deadline,
        status: update.status
      })
      .eq("id", update.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  console.log(`Updated ${updates.length} task deadline(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
