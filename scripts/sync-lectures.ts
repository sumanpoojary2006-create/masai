import { DateTime } from "luxon";

import { computeDeadline } from "../lib/deadlines";
import { getAppTimezone } from "../lib/env";
import { syncCurrentWeekLectures } from "../lib/lms-scraper";
import { closeLmsDb } from "../lib/lms-db";
import { matchLearningObjectiveAI } from "../lib/lo-matcher";
import { getAutomationProfiles } from "../lib/queries";
import { createServerSupabase } from "../lib/supabase";
import { TASK_TYPES } from "../lib/constants";
import { TaskRecord } from "../lib/types";

function computeWeekLabel(lectureDate: string, timezone: string): string {
  const dt = DateTime.fromISO(lectureDate, { zone: timezone });
  const monday = dt.startOf("week");
  const sunday = monday.plus({ days: 6 });

  if (monday.month === sunday.month) {
    return `${monday.day} - ${sunday.day} ${sunday.toFormat("LLL")}`;
  }
  return `${monday.day} ${monday.toFormat("LLL")} - ${sunday.day} ${sunday.toFormat("LLL")}`;
}

function lectureIdentityKey(input: {
  batch_name: string;
  module_name: string;
  lecture_name: string;
  lecture_date: string;
  start_time: string;
}) {
  return [
    input.batch_name.trim().toLowerCase(),
    input.module_name.trim().toLowerCase(),
    input.lecture_name.trim().toLowerCase(),
    input.lecture_date,
    input.start_time
  ].join("::");
}

async function main() {
  const targetUserId = process.env.TARGET_USER_ID?.trim() || undefined;
  const profiles = await getAutomationProfiles(targetUserId);

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const weekStartDate = now.startOf("week").toISODate()!;
  const weekEndDate = now.startOf("week").plus({ days: 7 }).toISODate()!;

  for (const profile of profiles) {
    console.log(`\n════════════════════════════════════`);
    console.log(`Syncing lectures for: ${profile.email}`);
    console.log(`════════════════════════════════════`);

    if (profile.batch_configs.length === 0) {
      console.log("  No batch configs — skipping.");
      continue;
    }

    // Fetch live sessions for the current week directly from the LMS MySQL DB
    let synced;
    try {
      synced = await syncCurrentWeekLectures(
        profile.batch_configs.map((c) => ({
          batch_name: c.batch_name,
          lecture_batch_url: c.lecture_batch_url
        }))
      );
    } catch (err) {
      console.error(`  [sync] Failed to fetch lectures:`, err instanceof Error ? err.message : err);
      continue;
    }

    if (synced.length === 0) {
      console.log("  No live sessions found for the current week.");
      continue;
    }

    console.log(`  Found ${synced.length} live session(s) — upserting…`);

    const batchNamesInSync = [...new Set(synced.map((l) => l.batch_name))];
    const { data: curriculums } = await supabase
      .from("batch_curriculums")
      .select("batch_name, lecture_name, learning_objective")
      .in("batch_name", batchNamesInSync)
      .eq("user_id", profile.user_id);

    const curriculumMap = new Map<string, string>();
    if (curriculums) {
      for (const c of curriculums) {
        curriculumMap.set(`${c.batch_name}::${c.lecture_name.toLowerCase()}`, c.learning_objective);
      }
    }

    // Preserve existing learning objectives for synced lectures when there is no
    // exact curriculum-key match in this run (e.g. AI-matched values from LO Tracker).
    const { data: existingLecturesForUser, error: existingLecturesError } = await supabase
      .from("lectures")
      .select("id, batch_name, module_name, lecture_name, lecture_date, start_time, learning_objective")
      .eq("user_id", profile.user_id)
      .is("archived_at", null)
      .in("batch_name", batchNamesInSync)
      .gte("lecture_date", weekStartDate)
      .lte("lecture_date", weekEndDate);

    if (existingLecturesError) {
      console.error("  [sync] Failed to fetch existing lectures for LO preservation:", existingLecturesError.message);
      continue;
    }

    const existingLearningObjectiveMap = new Map<string, string>();
    for (const lecture of existingLecturesForUser ?? []) {
      existingLearningObjectiveMap.set(
        lectureIdentityKey({
          batch_name: lecture.batch_name,
          module_name: lecture.module_name ?? "",
          lecture_name: lecture.lecture_name,
          lecture_date: lecture.lecture_date,
          start_time: lecture.start_time
        }),
        String(lecture.learning_objective ?? "").trim()
      );
    }

    // Upsert lectures
    const { data: upsertedLectures, error: lectureError } = await supabase
      .from("lectures")
      .upsert(
        synced.map((lec) => {
          const exactCurriculumObjective =
            curriculumMap.get(`${lec.batch_name}::${lec.lecture_name.toLowerCase()}`) ?? "";
          const existingObjective =
            existingLearningObjectiveMap.get(
              lectureIdentityKey({
                batch_name: lec.batch_name,
                module_name: lec.module_name,
                lecture_name: lec.lecture_name,
                lecture_date: lec.lecture_date,
                start_time: lec.start_time
              })
            ) ?? "";

          return {
            user_id: profile.user_id,
            batch_name: lec.batch_name,
            module_name: lec.module_name,
            lecture_name: lec.lecture_name,
            learning_objective: exactCurriculumObjective || existingObjective,
            lecture_date: lec.lecture_date,
            start_time: lec.start_time,
            end_time: lec.end_time,
            session_link: lec.session_link
          };
        }),
        { onConflict: "user_id,batch_name,module_name,lecture_name,lecture_date,start_time" }
      )
      .select("id, lecture_date, start_time, end_time");

    if (lectureError || !upsertedLectures) {
      console.error("  [sync] Lecture upsert failed:", lectureError?.message);
      continue;
    }

    console.log(`  Upserted ${upsertedLectures.length} lecture(s).`);

    // Fetch existing tasks to preserve completed status
    const lectureIds = upsertedLectures.map((l) => l.id);
    const { data: existingTasks } = await supabase
      .from("tasks")
      .select("id, lecture_id, type, deadline, status, completed_at")
      .in("lecture_id", lectureIds);

    const existingTaskMap = new Map<string, TaskRecord>();
    for (const t of (existingTasks ?? []) as TaskRecord[]) {
      existingTaskMap.set(`${t.lecture_id}:${t.type}`, t);
    }

    const nowIso = now.toUTC().toISO()!;
    const taskPayload = upsertedLectures.flatMap((lecture) =>
      TASK_TYPES.map((type) => {
        const existing = existingTaskMap.get(`${lecture.id}:${type}`);
        const deadline = computeDeadline(type, lecture.lecture_date, lecture.start_time, lecture.end_time);
        return {
          lecture_id: lecture.id,
          type,
          deadline,
          status:
            existing?.status === "completed"
              ? "completed"
              : deadline < nowIso
                ? "missed"
                : "pending",
          completed_at: existing?.completed_at ?? null
        };
      })
    );

    const { error: taskError } = await supabase
      .from("tasks")
      .upsert(taskPayload, { onConflict: "lecture_id,type" });

    if (taskError) {
      console.error("  [sync] Task upsert failed:", taskError.message);
    } else {
      console.log(`  Created/refreshed ${taskPayload.length} task(s).`);
    }

    // Archive stale current-week (+ next Monday) lectures that no longer exist in LMS sync result.
    const syncedKeys = new Set(
      synced.map((lecture) =>
        lectureIdentityKey({
          batch_name: lecture.batch_name,
          module_name: lecture.module_name,
          lecture_name: lecture.lecture_name,
          lecture_date: lecture.lecture_date,
          start_time: lecture.start_time
        })
      )
    );
    // Name-only keys to detect rescheduled lectures (same lecture, different date).
    const syncedNameKeys = new Set(
      synced.map((lecture) =>
        `${lecture.batch_name.trim().toLowerCase()}::${lecture.module_name.trim().toLowerCase()}::${lecture.lecture_name.trim().toLowerCase()}`
      )
    );
    const configuredBatchNames = profile.batch_configs.map((config) => config.batch_name);
    const { data: currentWeekLectures, error: currentWeekLecturesError } = await supabase
      .from("lectures")
      .select("id, batch_name, module_name, lecture_name, lecture_date, start_time")
      .eq("user_id", profile.user_id)
      .is("archived_at", null)
      .in("batch_name", configuredBatchNames)
      .gte("lecture_date", weekStartDate)
      .lte("lecture_date", weekEndDate);

    if (currentWeekLecturesError) {
      console.error("  [sync] Failed to fetch current-week lectures for stale cleanup:", currentWeekLecturesError.message);
    } else {
      const staleLectures = (currentWeekLectures ?? []).filter(
        (lecture) =>
          !syncedKeys.has(
            lectureIdentityKey({
              batch_name: lecture.batch_name,
              module_name: lecture.module_name ?? "",
              lecture_name: lecture.lecture_name,
              lecture_date: lecture.lecture_date,
              start_time: lecture.start_time
            })
          )
      );

      if (staleLectures.length > 0) {
        const staleLectureIds = staleLectures.map((lecture) => lecture.id);
        const weekLabel =
          staleLectures.length === 1
            ? computeWeekLabel(staleLectures[0].lecture_date, timezone)
            : null;

        const { error: archiveError } = await supabase
          .from("lectures")
          .update({
            archived_at: now.toUTC().toISO(),
            ...(weekLabel ? { week_label: weekLabel } : {})
          })
          .in("id", staleLectureIds);

        if (archiveError) {
          console.error("  [sync] Failed to archive stale lectures:", archiveError.message);
        } else {
          console.log(`  Archived ${staleLectures.length} stale lecture(s) not present in LMS current-week sync.`);
        }
      }
    }

    // Detect rescheduled lectures: same lecture name in the synced result but with a DIFFERENT
    // date — the old record sits outside the current-week window and won't be caught by the
    // stale cleanup above.  Query all non-archived lectures for this user across these batches
    // and archive any whose name matches a synced lecture but whose date/time differs.
    const { data: allActiveLectures, error: allActiveErr } = await supabase
      .from("lectures")
      .select("id, batch_name, module_name, lecture_name, lecture_date, start_time")
      .eq("user_id", profile.user_id)
      .is("archived_at", null)
      .in("batch_name", configuredBatchNames);

    if (allActiveErr) {
      console.error("  [sync] Failed to fetch active lectures for reschedule check:", allActiveErr.message);
    } else {
      const rescheduledIds: string[] = [];
      for (const existing of allActiveLectures ?? []) {
        const nameKey = `${existing.batch_name.trim().toLowerCase()}::${(existing.module_name ?? "").trim().toLowerCase()}::${existing.lecture_name.trim().toLowerCase()}`;
        const fullKey = lectureIdentityKey({
          batch_name: existing.batch_name,
          module_name: existing.module_name ?? "",
          lecture_name: existing.lecture_name,
          lecture_date: existing.lecture_date,
          start_time: existing.start_time
        });
        // Archive if this lecture name is in the new sync but with a different date/time
        if (syncedNameKeys.has(nameKey) && !syncedKeys.has(fullKey)) {
          rescheduledIds.push(existing.id);
        }
      }

      if (rescheduledIds.length > 0) {
        const { error: rescheduleArchiveError } = await supabase
          .from("lectures")
          .update({ archived_at: now.toUTC().toISO() })
          .in("id", rescheduledIds);

        if (rescheduleArchiveError) {
          console.error("  [sync] Failed to archive rescheduled lectures:", rescheduleArchiveError.message);
        } else {
          console.log(`  Archived ${rescheduledIds.length} rescheduled lecture(s) with updated dates.`);
        }
      }
    }

    // Print what was synced
    for (const lec of synced) {
      console.log(`  ✓ [${lec.batch_name}] ${lec.lecture_name} — ${lec.lecture_date} ${lec.start_time}`);
    }

    // ── AI fallback: match LOs for lectures that didn't get an exact match ──
    if (curriculumMap.size > 0) {
      const { data: unmatched } = await supabase
        .from("lectures")
        .select("id, batch_name, lecture_name")
        .eq("user_id", profile.user_id)
        .in("id", upsertedLectures.map((l) => l.id))
        .or("learning_objective.is.null,learning_objective.eq.");

      if (unmatched && unmatched.length > 0) {
        console.log(`  Attempting AI LO matching for ${unmatched.length} lecture(s)…`);

        // Build per-batch curriculum lists
        const curriculumByBatch = new Map<string, { lecture_name: string; learning_objective: string }[]>();
        for (const cfg of profile.batch_configs) {
          const entries: { lecture_name: string; learning_objective: string }[] = [];
          for (const [key, lo] of curriculumMap.entries()) {
            if (key.startsWith(`${cfg.batch_name}::`)) {
              entries.push({ lecture_name: key.slice(cfg.batch_name.length + 2), learning_objective: lo });
            }
          }
          if (entries.length > 0) curriculumByBatch.set(cfg.batch_name, entries);
        }

        for (const lecture of unmatched) {
          const batchCurriculum = curriculumByBatch.get(lecture.batch_name) ?? [];
          if (batchCurriculum.length === 0) continue;

          try {
            const lo = await matchLearningObjectiveAI(lecture.lecture_name, batchCurriculum);
            if (lo) {
              await supabase
                .from("lectures")
                .update({ learning_objective: lo })
                .eq("id", lecture.id);
              console.log(`  🎯 [${lecture.batch_name}] "${lecture.lecture_name}" → LO matched`);
            }
          } catch (err) {
            console.warn(`  AI match failed for "${lecture.lecture_name}":`, err instanceof Error ? err.message : err);
          }
        }
      }
    }
  }

  // Archive lectures from last week and older
  console.log(`\n════════════════════════════════════`);
  console.log(`Archiving old lectures...`);
  console.log(`════════════════════════════════════`);

  const { data: oldLectures, error: fetchOldError } = await supabase
    .from("lectures")
    .select("id, lecture_date")
    .is("archived_at", null)
    .lt("lecture_date", weekStartDate);

  if (fetchOldError) {
    console.error("[archive] Fetch error:", fetchOldError.message);
  } else if (!oldLectures || oldLectures.length === 0) {
    console.log("[archive] No old lectures to archive.");
  } else {
    console.log(`[archive] Found ${oldLectures.length} old lecture(s) to archive.`);

    const archiveTime = now.toUTC().toISO();
    let archivedCount = 0;

    for (const lecture of oldLectures) {
      const weekLabel = computeWeekLabel(lecture.lecture_date, timezone);

      const { error: updateError } = await supabase
        .from("lectures")
        .update({ archived_at: archiveTime, week_label: weekLabel })
        .eq("id", lecture.id);

      if (updateError) {
        console.error(`[archive] Failed to archive lecture ${lecture.id}:`, updateError.message);
      } else {
        archivedCount++;
      }
    }

    console.log(`[archive] Archived ${archivedCount}/${oldLectures.length} old lectures.`);
  }

  console.log("\nDone.");
  closeLmsDb();
}

main().catch((error) => {
  console.error(error);
  closeLmsDb();
  process.exit(1);
});
