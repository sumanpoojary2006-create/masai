/**
 * check-tasks.ts
 *
 * For every user's pending / missed tasks, query the LMS MySQL DB to see if
 * the corresponding pre-read, lecture notes, or assignment has been uploaded.
 * Marks tasks as "completed" where content is found.
 *
 * Also back-fills `session_link` (Zoom URL) for lectures that don't have one
 * yet by looking up the live session's zoom_link in the LMS DB.
 *
 * Run via:   npx tsx scripts/check-tasks.ts
 * Or via GitHub Actions.
 */

import { DateTime } from "luxon";

import { checkLmsTasksForLecture, closeLmsDb } from "../lib/lms-db";
import { getAutomationProfiles } from "../lib/queries";
import { createServerSupabase } from "../lib/supabase";
import { getAppTimezone } from "../lib/env";
import { TaskRecord, TaskType } from "../lib/types";

/** Extract the LMS batch ID from the stored lecture_batch_url */
function extractBatchId(url: string): number | null {
  try {
    const u = new URL(url);
    const raw = u.searchParams.get("batch");
    if (!raw) return null;
    const obj = JSON.parse(decodeURIComponent(raw)) as { id?: unknown };
    return typeof obj.id === "number" ? obj.id : null;
  } catch {
    return null;
  }
}

async function main() {
  const supabase = createServerSupabase();
  const profiles = await getAutomationProfiles();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  for (const profile of profiles) {
    console.log(`\n════════════════════════════════════`);
    console.log(`Checking tasks for: ${profile.email}`);
    console.log(`════════════════════════════════════`);

    if (profile.batch_configs.length === 0) {
      console.log("  No batch configs — skipping.");
      continue;
    }

    // Build batch_name → batch_id map
    const batchIdMap = new Map<string, number>();
    for (const cfg of profile.batch_configs) {
      const id = extractBatchId(cfg.lecture_batch_url);
      if (id) batchIdMap.set(cfg.batch_name, id);
    }

    // Fetch all lectures for this user
    const { data: lectures, error: lectErr } = await supabase
      .from("lectures")
      .select("id, batch_name, lecture_name, lecture_date, session_link")
      .eq("user_id", profile.user_id);

    if (lectErr || !lectures) {
      console.error("  Failed to fetch lectures:", lectErr?.message);
      continue;
    }

    // Fetch all tasks for this user's lectures that are not already completed
    const lectureIds = lectures.map((l) => l.id);
    if (lectureIds.length === 0) {
      console.log("  No lectures found.");
      continue;
    }

    const { data: tasks, error: taskErr } = await supabase
      .from("tasks")
      .select("id, lecture_id, type, deadline, status, completed_at")
      .in("lecture_id", lectureIds)
      .in("status", ["pending", "missed"]);

    if (taskErr) {
      console.error("  Failed to fetch tasks:", taskErr.message);
      continue;
    }

    const taskList = (tasks ?? []) as TaskRecord[];
    if (taskList.length === 0) {
      console.log("  No pending/missed tasks.");
      continue;
    }

    // Group tasks by lecture_id for batch processing
    const tasksByLecture = new Map<string, TaskRecord[]>();
    for (const t of taskList) {
      const arr = tasksByLecture.get(t.lecture_id) ?? [];
      arr.push(t);
      tasksByLecture.set(t.lecture_id, arr);
    }

    let completedCount = 0;
    let linkUpdatedCount = 0;
    const nowIso = now.toUTC().toISO()!;

    for (const lecture of lectures) {
      const batchId = batchIdMap.get(lecture.batch_name);
      if (!batchId) continue;

      const lectureTasks = tasksByLecture.get(lecture.id);
      if (!lectureTasks?.length) continue;

      // Query LMS DB for this lecture's task completion + session link
      let check;
      try {
        check = await checkLmsTasksForLecture(batchId, lecture.lecture_name, lecture.lecture_date);
      } catch (err) {
        console.error(`  DB check failed for "${lecture.lecture_name}":`, err instanceof Error ? err.message : err);
        continue;
      }

      // ── Always overwrite session_link with the LMS detail page URL ────────
      if (check.session_link && check.session_link !== lecture.session_link) {
        const { error } = await supabase
          .from("lectures")
          .update({ session_link: check.session_link })
          .eq("id", lecture.id);

        if (!error) {
          console.log(`  🔗 [${lecture.batch_name}] "${lecture.lecture_name}" → link updated`);
          linkUpdatedCount++;
        }
      }

      // ── Update task statuses ─────────────────────────────────────────────
      if (!lectureTasks?.length) continue;

      const completionMap: Record<TaskType, boolean> = {
        preread: check.preread,
        notes: check.notes,
        assignment: check.assignment
      };

      const updates: Array<{ id: string; status: string; completed_at: string | null }> = [];

      for (const task of lectureTasks) {
        const found = completionMap[task.type as TaskType] ?? false;
        if (found) {
          updates.push({
            id: task.id,
            status: "completed",
            completed_at: task.completed_at ?? nowIso
          });
        }
      }

      if (updates.length > 0) {
        for (const upd of updates) {
          await supabase
            .from("tasks")
            .update({ status: upd.status, completed_at: upd.completed_at })
            .eq("id", upd.id);
        }

        completedCount += updates.length;
        const taskTypes = updates.map((u) => {
          const t = taskList.find((x) => x.id === u.id);
          return t?.type ?? "?";
        });
        console.log(
          `  ✓ [${lecture.batch_name}] "${lecture.lecture_name}" → completed: ${taskTypes.join(", ")}`
        );
      }
    }

    console.log(
      `  Summary: ${completedCount} task(s) marked completed, ${linkUpdatedCount} link(s) updated.`
    );
  }

  console.log("\nDone.");
  await closeLmsDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeLmsDb();
  process.exit(1);
});
