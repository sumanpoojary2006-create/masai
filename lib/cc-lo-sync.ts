import { DateTime } from "luxon";

import { getAppTimezone } from "@/lib/env";
import { matchLearningObjectiveAI } from "@/lib/lo-matcher";
import { createServerSupabase } from "@/lib/supabase";

const LMS_DETAIL_BASE = "https://experience-admin.masaischool.com/lectures/detail/";

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function lectureIdentityKey(input: {
  batch_name: string;
  module_name: string;
  lecture_name: string;
  lecture_date: string;
  start_time: string;
}) {
  return [
    normalizeKey(input.batch_name),
    normalizeKey(input.module_name),
    normalizeKey(input.lecture_name),
    input.lecture_date,
    input.start_time
  ].join("::");
}

type AssignmentRow = {
  cc_user_id: string;
  batch_id: number;
  batch_name: string;
};

type CacheRow = {
  batch_id: number;
  lecture_id: number;
  title: string;
  module: string | null;
  schedule: string | null;
  concludes: string | null;
};

export async function upsertAssignedLecturesFromCache(options?: {
  batchIds?: number[];
  ccUserIds?: string[];
}) {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const weekStart = `${now.startOf("week").toISODate()!}T00:00:00+00:00`;
  const weekEnd = `${now.startOf("week").plus({ days: 8 }).toISODate()!}T00:00:00+00:00`;

  let assignmentQuery = supabase
    .from("cc_batch_assignments")
    .select("cc_user_id, batch_id, batch_name");

  if (options?.batchIds?.length) {
    assignmentQuery = assignmentQuery.in("batch_id", options.batchIds);
  }
  if (options?.ccUserIds?.length) {
    assignmentQuery = assignmentQuery.in("cc_user_id", options.ccUserIds);
  }

  const { data: assignments, error: assignmentError } = await assignmentQuery;
  if (assignmentError) throw new Error(assignmentError.message);
  if (!assignments?.length) return { lecturesUpserted: 0, objectivesMatched: 0 };

  const typedAssignments = assignments as AssignmentRow[];
  const batchIds = [...new Set(typedAssignments.map((row) => row.batch_id))];
  const batchNames = [...new Set(typedAssignments.map((row) => row.batch_name))];
  const ccUserIds = [...new Set(typedAssignments.map((row) => row.cc_user_id))];

  const { data: cacheRows, error: cacheError } = await supabase
    .from("lms_lecture_cache")
    .select("batch_id, lecture_id, title, module, schedule, concludes")
    .in("batch_id", batchIds)
    .neq("module", "general")
    .or("title.ilike.Faculty Session%,title.ilike.IM Session%,title.ilike.Academic Session%")
    .gte("schedule", weekStart)
    .lte("schedule", weekEnd)
    .order("schedule", { ascending: true });

  if (cacheError) throw new Error(cacheError.message);
  if (!cacheRows?.length) return { lecturesUpserted: 0, objectivesMatched: 0 };

  const { data: curriculums, error: curriculumError } = await supabase
    .from("batch_curriculums")
    .select("user_id, batch_name, lecture_name, learning_objective")
    .in("batch_name", batchNames)
    .or(`user_id.is.null,user_id.in.(${ccUserIds.join(",")})`);

  if (curriculumError) throw new Error(curriculumError.message);

  const globalCurriculumByBatch = new Map<string, Array<{ lecture_name: string; learning_objective: string }>>();
  const userCurriculumByUserBatch = new Map<string, Array<{ lecture_name: string; learning_objective: string }>>();
  const exactObjectiveMap = new Map<string, string>();

  for (const row of curriculums ?? []) {
    const entry = {
      lecture_name: row.lecture_name,
      learning_objective: row.learning_objective
    };
    const exactKey = `${row.user_id ?? "global"}::${row.batch_name}::${normalizeKey(row.lecture_name)}`;
    exactObjectiveMap.set(exactKey, row.learning_objective);

    if (row.user_id) {
      const key = `${row.user_id}::${row.batch_name}`;
      userCurriculumByUserBatch.set(key, [...(userCurriculumByUserBatch.get(key) ?? []), entry]);
    } else {
      globalCurriculumByBatch.set(row.batch_name, [...(globalCurriculumByBatch.get(row.batch_name) ?? []), entry]);
    }
  }

  const assignmentByBatch = new Map<number, AssignmentRow[]>();
  for (const assignment of typedAssignments) {
    assignmentByBatch.set(assignment.batch_id, [
      ...(assignmentByBatch.get(assignment.batch_id) ?? []),
      assignment
    ]);
  }

  const candidateRows = (cacheRows as CacheRow[])
    .filter((row) => row.schedule && row.concludes)
    .flatMap((row) => {
      const assignmentsForBatch = assignmentByBatch.get(row.batch_id) ?? [];
      return assignmentsForBatch.map((assignment) => {
        const start = DateTime.fromISO(row.schedule as string).setZone(timezone);
        const end = DateTime.fromISO(row.concludes as string).setZone(timezone);
        const moduleName = row.module ?? "";
        const lectureDate = start.toISODate()!;
        const startTime = start.toFormat("HH:mm:ss");
        const exactUserObjective =
          exactObjectiveMap.get(`${assignment.cc_user_id}::${assignment.batch_name}::${normalizeKey(row.title)}`) ?? "";
        const exactGlobalObjective =
          exactObjectiveMap.get(`global::${assignment.batch_name}::${normalizeKey(row.title)}`) ?? "";

        return {
          user_id: assignment.cc_user_id,
          batch_name: assignment.batch_name,
          module_name: moduleName,
          lecture_name: row.title,
          learning_objective: exactUserObjective || exactGlobalObjective,
          lecture_date: lectureDate,
          start_time: startTime,
          end_time: end.toFormat("HH:mm:ss"),
          session_link: `${LMS_DETAIL_BASE}?id=${row.lecture_id}`
        };
      });
    });

  if (candidateRows.length === 0) return { lecturesUpserted: 0, objectivesMatched: 0 };

  const { data: existingRows, error: existingError } = await supabase
    .from("lectures")
    .select("id, user_id, batch_name, module_name, lecture_name, lecture_date, start_time, learning_objective")
    .in("user_id", ccUserIds)
    .in("batch_name", batchNames)
    .is("archived_at", null)
    .gte("lecture_date", now.startOf("week").toISODate()!)
    .lt("lecture_date", now.startOf("week").plus({ days: 8 }).toISODate()!);

  if (existingError) throw new Error(existingError.message);

  const existingObjectiveMap = new Map<string, string>();
  for (const lecture of existingRows ?? []) {
    existingObjectiveMap.set(
      `${lecture.user_id}::${lectureIdentityKey({
        batch_name: lecture.batch_name,
        module_name: lecture.module_name ?? "",
        lecture_name: lecture.lecture_name,
        lecture_date: lecture.lecture_date,
        start_time: lecture.start_time
      })}`,
      String(lecture.learning_objective ?? "").trim()
    );
  }

  const rowsToUpsert = candidateRows.map((row) => ({
    ...row,
    learning_objective:
      row.learning_objective ||
      existingObjectiveMap.get(`${row.user_id}::${lectureIdentityKey(row)}`) ||
      ""
  }));

  const { data: upsertedRows, error: upsertError } = await supabase
    .from("lectures")
    .upsert(rowsToUpsert, {
      onConflict: "user_id,batch_name,module_name,lecture_name,lecture_date,start_time"
    })
    .select("id, user_id, batch_name, lecture_name, learning_objective");

  if (upsertError) throw new Error(upsertError.message);

  let objectivesMatched = 0;
  for (const lecture of upsertedRows ?? []) {
    if (String(lecture.learning_objective ?? "").trim()) continue;

    const userEntries = userCurriculumByUserBatch.get(`${lecture.user_id}::${lecture.batch_name}`) ?? [];
    const globalEntries = globalCurriculumByBatch.get(lecture.batch_name) ?? [];
    const curriculum = [...globalEntries, ...userEntries];
    if (curriculum.length === 0) continue;

    const matchedObjective = await matchLearningObjectiveAI(lecture.lecture_name, curriculum);
    if (!matchedObjective) continue;

    const { error: updateError } = await supabase
      .from("lectures")
      .update({ learning_objective: matchedObjective })
      .eq("id", lecture.id);

    if (!updateError) objectivesMatched++;
  }

  return {
    lecturesUpserted: upsertedRows?.length ?? 0,
    objectivesMatched
  };
}
