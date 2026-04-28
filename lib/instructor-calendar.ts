import { createServerSupabase } from "@/lib/supabase";

export interface InstructorCalendarSession {
  id: string;
  batchId: string;
  batchName: string;
  instructorKey: string;
  instructorName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  sessionTitle: string | null;
  sessionType: string | null;
  moduleName: string | null;
  weekNumber: number | null;
  sessionNumber: number | null;
  blockedMinutes: number;
}

export interface InstructorCalendarSummary {
  instructorKey: string;
  instructorName: string;
  totalSessions: number;
  facultySessions: number;
  mentorSessions: number;
  distinctBatches: number;
  totalBlockedMinutes: number;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
}

export interface InstructorCalendarData {
  instructors: InstructorCalendarSummary[];
  sessions: InstructorCalendarSession[];
}

type SessionQueryRow = {
  id: string;
  batch_id: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  session_title: string | null;
  to_be_taken_by: string | null;
  instructor_name: string | null;
  module_name: string | null;
  week_number: number | null;
  session_number: number | null;
  batches: { batch_name: string | null } | Array<{ batch_name: string | null }> | null;
};

function normalizeInstructorName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function toInstructorKey(name: string) {
  return normalizeInstructorName(name).toLowerCase();
}

function toMinutes(value: string | null) {
  if (!value) {
    return null;
  }

  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText ?? "");
  const minutes = Number(minutesText ?? "");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function computeBlockedMinutes(startTime: string | null, endTime: string | null) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (start == null || end == null || end <= start) {
    return 0;
  }

  return end - start;
}

export async function getInstructorCalendarData(): Promise<InstructorCalendarData> {
  const supabase = createServerSupabase();
  const pageSize = 1000;
  const rows: SessionQueryRow[] = [];
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, batch_id, date, start_time, end_time, session_title, to_be_taken_by, instructor_name, module_name, week_number, session_number, batches(batch_name)"
      )
      .not("instructor_name", "is", null)
      .not("date", "is", null)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const currentPage = (data ?? []) as SessionQueryRow[];
    rows.push(...currentPage);

    if (currentPage.length < pageSize) {
      break;
    }

    page += 1;
  }

  const summaries = new Map<
    string,
    {
      instructorKey: string;
      instructorName: string;
      totalSessions: number;
      facultySessions: number;
      mentorSessions: number;
      batchNames: Set<string>;
      totalBlockedMinutes: number;
      firstSessionDate: string | null;
      lastSessionDate: string | null;
    }
  >();

  const sessions: InstructorCalendarSession[] = [];

  for (const row of rows) {
    const rawInstructorName = row.instructor_name ? normalizeInstructorName(row.instructor_name) : "";
    if (!rawInstructorName || !row.date) {
      continue;
    }

    const instructorKey = toInstructorKey(rawInstructorName);
    const batchRecord = Array.isArray(row.batches) ? row.batches[0] : row.batches;
    const batchName = batchRecord?.batch_name?.trim() || "Unknown Batch";
    const blockedMinutes = computeBlockedMinutes(row.start_time, row.end_time);

    sessions.push({
      id: row.id,
      batchId: row.batch_id,
      batchName,
      instructorKey,
      instructorName: rawInstructorName,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      sessionTitle: row.session_title,
      sessionType: row.to_be_taken_by,
      moduleName: row.module_name,
      weekNumber: row.week_number,
      sessionNumber: row.session_number,
      blockedMinutes
    });

    const summary = summaries.get(instructorKey) ?? {
      instructorKey,
      instructorName: rawInstructorName,
      totalSessions: 0,
      facultySessions: 0,
      mentorSessions: 0,
      batchNames: new Set<string>(),
      totalBlockedMinutes: 0,
      firstSessionDate: row.date,
      lastSessionDate: row.date
    };

    summary.totalSessions += 1;
    summary.totalBlockedMinutes += blockedMinutes;
    summary.batchNames.add(batchName);

    if (row.to_be_taken_by === "professor") {
      summary.facultySessions += 1;
    }

    if (row.to_be_taken_by === "industry-mentor") {
      summary.mentorSessions += 1;
    }

    if (!summary.firstSessionDate || row.date < summary.firstSessionDate) {
      summary.firstSessionDate = row.date;
    }

    if (!summary.lastSessionDate || row.date > summary.lastSessionDate) {
      summary.lastSessionDate = row.date;
    }

    summaries.set(instructorKey, summary);
  }

  return {
    instructors: Array.from(summaries.values())
      .map((summary) => ({
        instructorKey: summary.instructorKey,
        instructorName: summary.instructorName,
        totalSessions: summary.totalSessions,
        facultySessions: summary.facultySessions,
        mentorSessions: summary.mentorSessions,
        distinctBatches: summary.batchNames.size,
        totalBlockedMinutes: summary.totalBlockedMinutes,
        firstSessionDate: summary.firstSessionDate,
        lastSessionDate: summary.lastSessionDate
      }))
      .sort((left, right) => {
        if (right.totalSessions !== left.totalSessions) {
          return right.totalSessions - left.totalSessions;
        }

        return left.instructorName.localeCompare(right.instructorName);
      }),
    sessions
  };
}
