import * as XLSX from "xlsx";

import { TASK_TYPES } from "@/lib/constants";
import { computeDeadline } from "@/lib/deadlines";
import { createServerSupabase } from "@/lib/supabase";
import { ParsedLectureRow, TaskRecord } from "@/lib/types";

const REQUIRED_HEADERS = [
  "batch_name",
  "module_name",
  "lecture_name",
  "lecture_date",
  "lecture_start_time",
  "lecture_end_time"
] as const;

function normaliseHeader(input: string) {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function toIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      throw new Error(`Unable to parse Excel date value: ${value}`);
    }

    return `${parsed.y.toString().padStart(4, "0")}-${parsed.m
      .toString()
      .padStart(2, "0")}-${parsed.d.toString().padStart(2, "0")}`;
  }

  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error("lecture_date is required");
  }

  const isoCandidate = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoCandidate) {
    return `${isoCandidate[1]}-${isoCandidate[2].padStart(2, "0")}-${isoCandidate[3].padStart(2, "0")}`;
  }

  const dayFirstCandidate = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dayFirstCandidate) {
    const year =
      dayFirstCandidate[3].length === 2
        ? `20${dayFirstCandidate[3]}`
        : dayFirstCandidate[3];

    return `${year}-${dayFirstCandidate[2].padStart(2, "0")}-${dayFirstCandidate[1].padStart(2, "0")}`;
  }

  const asDate = new Date(text);
  if (Number.isNaN(asDate.getTime())) {
    throw new Error(`Invalid lecture_date value: ${text}`);
  }

  return asDate.toISOString().slice(0, 10);
}

function toSqlTime(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(11, 19);
  }

  if (typeof value === "number") {
    const seconds = Math.round(value * 24 * 60 * 60);
    const hours = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");

    return `${hours}:${minutes}:00`;
  }

  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error("Lecture time is required");
  }

  const maybeTime = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);

  if (!maybeTime) {
    throw new Error(`Invalid time value: ${text}`);
  }

  let hours = Number.parseInt(maybeTime[1], 10);
  const minutes = maybeTime[2];
  const meridiem = maybeTime[4]?.toLowerCase();

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes}:00`;
}

function compactRows(rows: ParsedLectureRow[]) {
  const deduped = new Map<string, ParsedLectureRow>();

  for (const row of rows) {
    const key = [
      row.batch_name,
      row.module_name,
      row.lecture_name,
      row.lecture_date,
      row.lecture_start_time
    ].join("::");

    deduped.set(key, row);
  }

  return [...deduped.values()];
}

export function parseLectureWorkbook(fileBuffer: Buffer) {
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
    cellDates: true
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!firstSheet) {
    throw new Error("The uploaded file does not contain any sheets.");
  }

  const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: ""
  });

  const parsed = sourceRows
    .map((rawRow) => {
      const normalised = Object.fromEntries(
        Object.entries(rawRow).map(([key, value]) => [normaliseHeader(key), value])
      );

      const missing = REQUIRED_HEADERS.filter((header) => !(header in normalised));
      if (missing.length > 0) {
        throw new Error(
          `Missing required columns: ${missing
            .map((header) => `"${header}"`)
            .join(", ")}`
        );
      }

      const row: ParsedLectureRow = {
        batch_name: String(normalised.batch_name).trim(),
        module_name: String(normalised.module_name).trim(),
        lecture_name: String(normalised.lecture_name).trim(),
        lecture_date: toIsoDate(normalised.lecture_date),
        lecture_start_time: toSqlTime(normalised.lecture_start_time),
        lecture_end_time: toSqlTime(normalised.lecture_end_time)
      };

      if (!row.batch_name || !row.module_name || !row.lecture_name) {
        return null;
      }

      return row;
    })
    .filter((row): row is ParsedLectureRow => Boolean(row));

  return compactRows(parsed);
}

export async function importLectureSheet(fileBuffer: Buffer) {
  const lectures = parseLectureWorkbook(fileBuffer);
  const supabase = createServerSupabase();

  if (lectures.length === 0) {
    return {
      lectureCount: 0,
      taskCount: 0
    };
  }

  const { data: upsertedLectures, error: lectureError } = await supabase
    .from("lectures")
    .upsert(
      lectures.map((lecture) => ({
        batch_name: lecture.batch_name,
        module_name: lecture.module_name,
        lecture_name: lecture.lecture_name,
        lecture_date: lecture.lecture_date,
        start_time: lecture.lecture_start_time,
        end_time: lecture.lecture_end_time
      })),
      {
        onConflict: "batch_name,module_name,lecture_name,lecture_date,start_time"
      }
    )
    .select("id, batch_name, module_name, lecture_name, lecture_date, start_time, end_time");

  if (lectureError || !upsertedLectures) {
    throw new Error(lectureError?.message ?? "Unable to upsert lectures");
  }

  const lectureIds = upsertedLectures.map((lecture) => lecture.id);
  const { data: existingTasks, error: taskFetchError } = await supabase
    .from("tasks")
    .select("id, lecture_id, type, deadline, status, completed_at")
    .in("lecture_id", lectureIds);

  if (taskFetchError) {
    throw new Error(taskFetchError.message);
  }

  const existingTaskMap = new Map<string, TaskRecord>();

  for (const task of (existingTasks ?? []) as TaskRecord[]) {
    existingTaskMap.set(`${task.lecture_id}:${task.type}`, task);
  }

  const now = new Date().toISOString();
  const taskPayload = upsertedLectures.flatMap((lecture) =>
    TASK_TYPES.map((type) => {
      const existingTask = existingTaskMap.get(`${lecture.id}:${type}`);
      const deadline = computeDeadline(
        type,
        lecture.lecture_date,
        lecture.start_time,
        lecture.end_time
      );

      return {
        lecture_id: lecture.id,
        type,
        deadline,
        status:
          existingTask?.status === "completed"
            ? "completed"
            : deadline < now
              ? "missed"
              : "pending",
        completed_at: existingTask?.completed_at ?? null
      };
    })
  );

  const { error: taskError } = await supabase.from("tasks").upsert(taskPayload, {
    onConflict: "lecture_id,type"
  });

  if (taskError) {
    throw new Error(taskError.message);
  }

  return {
    lectureCount: upsertedLectures.length,
    taskCount: taskPayload.length
  };
}
