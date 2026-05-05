import { mysqlDateToIST, nowIST } from "@/lib/env";
import type { LmsLectureCompliance } from "@/lib/lms-mysql";
import { createServerSupabase } from "@/lib/supabase";

type SyncOptions = {
  preserveCompletedFlags?: boolean;
};

function toCacheTimestamp(value: LmsLectureCompliance["schedule"]) {
  if (!value) return null;
  return mysqlDateToIST(value instanceof Date ? value : new Date(value));
}

export async function syncLmsLectureCacheForBatch(
  batchId: number,
  lectures: LmsLectureCompliance[],
  options: SyncOptions = {}
) {
  const supabase = createServerSupabase();
  const currentLectureIds = [...new Set(lectures.map((lecture) => lecture.lecture_id))];
  let staleDeleted = 0;

  if (currentLectureIds.length > 0) {
    const { count, error: deleteError } = await supabase
      .from("lms_lecture_cache")
      .delete({ count: "exact" })
      .eq("batch_id", batchId)
      .not("lecture_id", "in", `(${currentLectureIds.join(",")})`);

    if (deleteError) throw new Error(`Batch ${batchId} cache prune: ${deleteError.message}`);
    staleDeleted = count ?? 0;
  } else {
    const { count, error: deleteError } = await supabase
      .from("lms_lecture_cache")
      .delete({ count: "exact" })
      .eq("batch_id", batchId);

    if (deleteError) throw new Error(`Batch ${batchId} cache prune: ${deleteError.message}`);
    staleDeleted = count ?? 0;
  }

  if (lectures.length === 0) {
    return { lecturesSynced: 0, staleDeleted };
  }

  const rows = lectures.map((lecture) => ({
    batch_id: batchId,
    lecture_id: lecture.lecture_id,
    section_id: lecture.section_id ?? null,
    title: lecture.lecture_title,
    module: lecture.module ?? null,
    schedule: toCacheTimestamp(lecture.schedule),
    concludes: toCacheTimestamp(lecture.concludes),
    synced_at: nowIST(),
    ...(options.preserveCompletedFlags
      ? {}
      : {
          preread_uploaded: lecture.preread_uploaded,
          notes_uploaded: lecture.notes_uploaded,
          assignment_uploaded: lecture.assignment_uploaded
        })
  }));

  const { error: upsertError } = await supabase
    .from("lms_lecture_cache")
    .upsert(rows, { onConflict: "batch_id,lecture_id" });

  if (upsertError) throw new Error(`Batch ${batchId} cache upsert: ${upsertError.message}`);

  if (options.preserveCompletedFlags) {
    for (const lecture of lectures) {
      const patch: Record<string, boolean> = {};
      if (lecture.preread_uploaded) patch.preread_uploaded = true;
      if (lecture.notes_uploaded) patch.notes_uploaded = true;
      if (lecture.assignment_uploaded) patch.assignment_uploaded = true;
      if (Object.keys(patch).length === 0) continue;

      const { error: flagError } = await supabase
        .from("lms_lecture_cache")
        .update(patch)
        .eq("batch_id", batchId)
        .eq("lecture_id", lecture.lecture_id);

      if (flagError) {
        console.warn(
          `[cache-sync] Flag update failed batch=${batchId} lecture=${lecture.lecture_id}: ${flagError.message}`
        );
      }
    }
  }

  return { lecturesSynced: lectures.length, staleDeleted };
}
