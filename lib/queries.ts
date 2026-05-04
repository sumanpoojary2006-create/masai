import { DateTime } from "luxon";

import { TASK_TYPES } from "@/lib/constants";
import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
import { decryptLmsPassword } from "@/lib/lms-password";
import { createServerSupabase } from "@/lib/supabase";
import {
  CacheLecture,
  DashboardLecture,
  LoReport,
  LoTrackerRow,
  TaskRecord,
  TaskStatus,
  TaskType,
  UserBatchConfigRecord,
  UserProfileRecord,
  WeeklyReportLecture,
  WeeklyReportWeek
} from "@/lib/types";

function buildTaskMap(tasks: TaskRecord[]) {
  return TASK_TYPES.reduce(
    (accumulator, type) => {
      accumulator[type] = tasks.find((task) => task.type === type) ?? null;
      return accumulator;
    },
    {} as DashboardLecture["tasks"]
  );
}

export async function getDashboardData(filters: {
  userId: string;
  batch?: string;
  status?: TaskStatus | "all";
}) {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const weekStart = now.startOf("week").toISODate()!;
  const weekEnd = now.startOf("week").plus({ days: 7 }).toISODate()!;

  const { data, error } = await supabase
    .from("lectures")
    .select(
      "id, user_id, batch_name, module_name, lecture_name, learning_objective, session_link, lecture_date, start_time, end_time, tasks(id, lecture_id, type, deadline, status, completed_at, last_checked_at)"
    )
    .eq("user_id", filters.userId)
    .is("archived_at", null)
    .gte("lecture_date", weekStart)
    .lte("lecture_date", weekEnd)
    .order("lecture_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let lectures = (data ?? []).map((lecture) => ({
    id: lecture.id,
    user_id: lecture.user_id,
    batch_name: lecture.batch_name,
    module_name: lecture.module_name,
    lecture_name: lecture.lecture_name,
    learning_objective: (lecture as Record<string, unknown>).learning_objective as string ?? "",
    session_link: (lecture as Record<string, unknown>).session_link as string ?? "",
    lecture_date: lecture.lecture_date,
    start_time: lecture.start_time,
    end_time: lecture.end_time,
    tasks: buildTaskMap((lecture.tasks ?? []) as TaskRecord[])
  })) as DashboardLecture[];

  if (filters?.batch) {
    lectures = lectures.filter((lecture) => lecture.batch_name === filters.batch);
  }

  if (filters?.status && filters.status !== "all") {
    lectures = lectures.filter((lecture) =>
      TASK_TYPES.some((type) => lecture.tasks[type]?.status === filters.status)
    );
  }

  return lectures;
}

export async function getAutomationLectures(userId: string) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("lectures")
    .select(
      "id, user_id, batch_name, module_name, lecture_name, learning_objective, session_link, lecture_date, start_time, end_time, tasks(id, lecture_id, type, deadline, status, completed_at, last_checked_at)"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("lecture_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((lecture) => ({
    id: lecture.id,
    user_id: lecture.user_id,
    batch_name: lecture.batch_name,
    module_name: lecture.module_name,
    lecture_name: lecture.lecture_name,
    learning_objective: (lecture as Record<string, unknown>).learning_objective as string ?? "",
    session_link: (lecture as Record<string, unknown>).session_link as string ?? "",
    lecture_date: lecture.lecture_date,
    start_time: lecture.start_time,
    end_time: lecture.end_time,
    tasks: (lecture.tasks ?? []) as TaskRecord[]
  }));
}

export async function getLoTrackerData(userId: string): Promise<LoTrackerRow[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();

  // Current week: Monday to next Monday
  const now = DateTime.now().setZone(timezone);
  const currentMonday = now.startOf("week").toISODate()!;
  const nextMonday = now.startOf("week").plus({ weeks: 1 }).toISODate()!;

  const { data: lectures, error: lectureError } = await supabase
    .from("lectures")
    .select(
      "id, user_id, batch_name, module_name, lecture_name, learning_objective, session_link, lecture_date, start_time, end_time"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .gte("lecture_date", currentMonday)
    .lt("lecture_date", nextMonday)
    .order("lecture_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (lectureError) throw new Error(lectureError.message);
  if (!lectures || lectures.length === 0) return [];

  const lectureIds = lectures.map((l) => l.id);
  const { data: reports, error: reportError } = await supabase
    .from("lo_reports")
    .select("*")
    .in("lecture_id", lectureIds);

  if (reportError) throw new Error(reportError.message);

  const reportMap = new Map<string, LoReport>(
    ((reports ?? []) as LoReport[]).map((r) => [r.lecture_id, r])
  );

  return lectures.map((lecture) => ({
    id: lecture.id,
    user_id: lecture.user_id,
    batch_name: lecture.batch_name,
    module_name: lecture.module_name ?? "",
    lecture_name: lecture.lecture_name,
    learning_objective: (lecture as Record<string, unknown>).learning_objective as string ?? "",
    session_link: (lecture as Record<string, unknown>).session_link as string ?? "",
    lecture_date: lecture.lecture_date,
    start_time: lecture.start_time,
    end_time: lecture.end_time,
    lo_report: reportMap.get(lecture.id) ?? null
  }));
}

export async function getWeeklyReportData(userId: string): Promise<WeeklyReportWeek[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();

  const { data, error } = await supabase
    .from("lectures")
    .select(
      "id, user_id, batch_name, lecture_name, lecture_date, start_time, end_time, week_label, archived_at, tasks(id, lecture_id, type, deadline, status, completed_at, last_checked_at)"
    )
    .eq("user_id", userId)
    .not("archived_at", "is", null)
    .order("lecture_date", { ascending: false });

  if (error) throw new Error(error.message);

  type RawRow = {
    id: string;
    user_id: string;
    batch_name: string;
    lecture_name: string;
    lecture_date: string;
    start_time: string;
    end_time: string;
    week_label: string | null;
    archived_at: string | null;
    tasks: TaskRecord[];
  };

  const rows = (data ?? []) as unknown as RawRow[];

  // Fetch lo_reports for all archived lectures in one query
  const lectureIds = rows.map((r) => r.id);
  const reportMap = new Map<string, LoReport>();

  if (lectureIds.length > 0) {
    const { data: reports } = await supabase
      .from("lo_reports")
      .select("*")
      .in("lecture_id", lectureIds);

    ((reports ?? []) as LoReport[]).forEach((r) => reportMap.set(r.lecture_id, r));
  }

  // Group by week_label
  const weekMap = new Map<string, WeeklyReportWeek>();

  for (const row of rows) {
    const label = row.week_label ?? "Unknown week";

    if (!weekMap.has(label)) {
      const monday =
        DateTime.fromISO(row.lecture_date, { zone: timezone })
          .startOf("week")
          .toISODate() ?? row.lecture_date;

      weekMap.set(label, { week_label: label, week_start: monday, lectures: [] });
    }

    const lecture: WeeklyReportLecture = {
      id: row.id,
      user_id: row.user_id,
      batch_name: row.batch_name,
      lecture_name: row.lecture_name,
      lecture_date: row.lecture_date,
      start_time: row.start_time,
      end_time: row.end_time,
      week_label: label,
      archived_at: row.archived_at ?? "",
      tasks: buildTaskMap(row.tasks ?? []),
      lo_report: reportMap.get(row.id) ?? null
    };

    weekMap.get(label)!.lectures.push(lecture);
  }

  // Sort weeks newest first
  return Array.from(weekMap.values()).sort((a, b) =>
    b.week_start.localeCompare(a.week_start)
  );
}

export async function getAutomationProfiles(userId?: string) {
  const supabase = createServerSupabase();
  let profileQuery = supabase
    .from("user_profiles")
    .select("user_id, email, lms_username, lms_password, onboarding_complete, slack_member_id")
    .eq("onboarding_complete", true)
    .order("email", { ascending: true });

  if (userId) {
    profileQuery = profileQuery.eq("user_id", userId);
  }

  const { data: profiles, error: profileError } = await profileQuery;

  if (profileError) {
    throw new Error(profileError.message);
  }

  const typedProfiles = (profiles ?? []) as UserProfileRecord[];

  if (typedProfiles.length === 0) {
    return [];
  }

  let batchConfigQuery = supabase
    .from("user_batch_configs")
    .select("id, user_id, batch_name, lecture_batch_url, assignment_batch_url")
    .in(
      "user_id",
      typedProfiles.map((profile) => profile.user_id)
    )
    .order("batch_name", { ascending: true });

  if (userId) {
    batchConfigQuery = batchConfigQuery.eq("user_id", userId);
  }

  const { data: batchConfigs, error: batchConfigError } = await batchConfigQuery;

  if (batchConfigError) {
    throw new Error(batchConfigError.message);
  }

  const batchConfigsByUser = (batchConfigs ?? []).reduce<Map<string, UserBatchConfigRecord[]>>(
    (accumulator, config) => {
      const current = accumulator.get(config.user_id) ?? [];
      current.push(config as UserBatchConfigRecord);
      accumulator.set(config.user_id, current);
      return accumulator;
    },
    new Map()
  );

  return typedProfiles.map((profile) => ({
    ...profile,
    lms_password: profile.lms_password ? decryptLmsPassword(profile.lms_password) : "",
    batch_configs: batchConfigsByUser.get(profile.user_id) ?? []
  }));
}

export interface AdminUserStats {
  userId: string;
  email: string;
  batchConfigs: UserBatchConfigRecord[];
  totalLectures: number;
  completedTasks: number;
  pendingTasks: number;
  missedTasks: number;
  onTimeCount: number;
  lateCount: number;
}

function isOnTime(completedAt: string | null, deadline: string): boolean {
  if (!completedAt) return false;
  return new Date(completedAt) <= new Date(deadline);
}

export async function getAdminDashboardData(): Promise<AdminUserStats[]> {
  const supabase = createServerSupabase();

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, email, onboarding_complete")
    .eq("onboarding_complete", true)
    .order("email", { ascending: true });

  if (profileError) throw new Error(profileError.message);
  if (!profiles || profiles.length === 0) return [];

  const userIds = profiles.map((p) => p.user_id);

  const { data: batchConfigs, error: configError } = await supabase
    .from("user_batch_configs")
    .select("id, user_id, batch_name, lecture_batch_url, assignment_batch_url")
    .in("user_id", userIds)
    .order("batch_name", { ascending: true });

  if (configError) throw new Error(configError.message);

  const { data: lectures, error: lectureError } = await supabase
    .from("lectures")
    .select("id, user_id, batch_name, tasks(id, type, deadline, status, completed_at)")
    .in("user_id", userIds)
    .is("archived_at", null);

  if (lectureError) throw new Error(lectureError.message);

  const batchConfigsByUser = (batchConfigs ?? []).reduce<Map<string, UserBatchConfigRecord[]>>(
    (accumulator, config) => {
      const current = accumulator.get(config.user_id) ?? [];
      current.push(config as UserBatchConfigRecord);
      accumulator.set(config.user_id, current);
      return accumulator;
    },
    new Map()
  );

  const lecturesByUser = lectures?.reduce<Map<string, DashboardLecture[]>>(
    (accumulator, lecture) => {
      const current = accumulator.get(lecture.user_id) ?? [];
      current.push({
        id: lecture.id,
        user_id: lecture.user_id,
        batch_name: lecture.batch_name,
        module_name: "",
        lecture_name: "",
        learning_objective: "",
        session_link: "",
        lecture_date: "",
        start_time: "",
        end_time: "",
        tasks: buildTaskMap((lecture.tasks ?? []) as TaskRecord[])
      });
      accumulator.set(lecture.user_id, current);
      return accumulator;
    },
    new Map()
  ) ?? new Map();

  return profiles.map((profile) => {
    const userLectures = lecturesByUser.get(profile.user_id) ?? [];
    const allTasks = userLectures.flatMap((lecture) => Object.values(lecture.tasks));

    let onTimeCount = 0;
    let lateCount = 0;
    let completedCount = 0;

    for (const task of allTasks) {
      if (!task) continue;
      if (task.status === "completed") {
        completedCount++;
        if (isOnTime(task.completed_at, task.deadline)) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      }
    }

    return {
      userId: profile.user_id,
      email: profile.email,
      batchConfigs: batchConfigsByUser.get(profile.user_id) ?? [],
      totalLectures: userLectures.length,
      completedTasks: completedCount,
      pendingTasks: allTasks.filter((task) => task?.status === "pending").length,
      missedTasks: allTasks.filter((task) => task?.status === "missed").length,
      onTimeCount,
      lateCount
    };
  });
}

export interface AdminBatchStats {
  batchName: string;
  ownerEmail: string | null;
  lectureCount: number;
  completedTasks: number;
  pendingTasks: number;
  missedTasks: number;
}

async function getBatchOwnerEmailMap(
  supabase: ReturnType<typeof createServerSupabase>,
  lectureUserIds: string[] = []
) {
  const { data: batchConfigs, error: batchConfigError } = await supabase
    .from("user_batch_configs")
    .select("batch_name, user_id");

  if (batchConfigError) {
    throw new Error(batchConfigError.message);
  }

  const configUserIds = (batchConfigs ?? []).map((config) => config.user_id);
  const profileUserIds = [...new Set([...lectureUserIds, ...configUserIds].filter(Boolean))];

  if (profileUserIds.length === 0) {
    return new Map<string, string>();
  }

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, email")
    .in("user_id", profileUserIds);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const emailByUserId = new Map<string, string>(
    (profiles ?? []).map((profile) => [profile.user_id, profile.email])
  );

  const ownersByBatch = new Map<string, string>();
  for (const config of batchConfigs ?? []) {
    const email = emailByUserId.get(config.user_id);
    if (!email || ownersByBatch.has(config.batch_name)) {
      continue;
    }
    ownersByBatch.set(config.batch_name, email);
  }

  return ownersByBatch;
}

export async function getAdminBatchStats(): Promise<AdminBatchStats[]> {
  const supabase = createServerSupabase();

  const { data: lectures, error } = await supabase
    .from("lectures")
    .select("id, user_id, batch_name, tasks(id, type, deadline, status, completed_at)")
    .is("archived_at", null);

  if (error) throw new Error(error.message);

  const lectureUserIds = [...new Set((lectures ?? []).map((lecture) => lecture.user_id))];
  const batchOwnerEmailMap = await getBatchOwnerEmailMap(supabase, lectureUserIds);

  const batchMap = new Map<string, AdminBatchStats>();

  for (const lecture of lectures ?? []) {
    const batchName = lecture.batch_name;
    const current = batchMap.get(batchName) ?? {
      batchName,
      ownerEmail:
        batchOwnerEmailMap.get(batchName) ??
        null,
      lectureCount: 0,
      completedTasks: 0,
      pendingTasks: 0,
      missedTasks: 0
    };

    current.lectureCount++;
    const tasks = (lecture.tasks ?? []) as TaskRecord[];
    for (const task of tasks) {
      if (task.status === "completed") current.completedTasks++;
      else if (task.status === "pending") current.pendingTasks++;
      else if (task.status === "missed") current.missedTasks++;
    }

    batchMap.set(batchName, current);
  }

  return Array.from(batchMap.values()).sort((a, b) =>
    b.lectureCount - a.lectureCount
  );
}

export interface AdminLectureStats {
  id: string;
  batchName: string;
  lectureName: string;
  lectureDate: string;
  startTime: string;
  endTime: string;
  userEmail: string;
  prereadStatus: TaskStatus | null;
  notesStatus: TaskStatus | null;
  assignmentStatus: TaskStatus | null;
}

export async function getAdminLectureStats(): Promise<AdminLectureStats[]> {
  const supabase = createServerSupabase();

  const { data: lectures, error } = await supabase
    .from("lectures")
    .select("id, user_id, batch_name, module_name, lecture_name, lecture_date, start_time, end_time, tasks(id, type, deadline, status, completed_at)")
    .is("archived_at", null)
    .order("lecture_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = [...new Set((lectures ?? []).map((l) => l.user_id))];
  const batchOwnerEmailMap = await getBatchOwnerEmailMap(supabase, userIds);

  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from("user_profiles").select("user_id, email").in("user_id", userIds)
      : { data: [] };

  const userEmailMap = new Map<string, string>((profiles ?? []).map((p) => [p.user_id, p.email]));

  return (lectures ?? []).map((lecture) => {
    const tasks = (lecture.tasks ?? []) as TaskRecord[];
    const preread = tasks.find((t) => t.type === "preread");
    const notes = tasks.find((t) => t.type === "notes");
    const assignment = tasks.find((t) => t.type === "assignment");

    return {
      id: lecture.id,
      batchName: lecture.batch_name,
      lectureName: lecture.lecture_name,
      lectureDate: lecture.lecture_date,
      startTime: lecture.start_time,
      endTime: lecture.end_time,
      userEmail:
        userEmailMap.get(lecture.user_id) ??
        batchOwnerEmailMap.get(lecture.batch_name) ??
        "Unassigned",
      prereadStatus: (preread?.status ?? null) as TaskStatus | null,
      notesStatus: (notes?.status ?? null) as TaskStatus | null,
      assignmentStatus: (assignment?.status ?? null) as TaskStatus | null
    };
  });
}

/** Fetch this week's lectures for a CC from lms_lecture_cache via cc_batch_assignments */
export async function getCCLectures(userId: string): Promise<DashboardLecture[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  // LMS stores IST wall-clock times labeled as +00:00 (no UTC conversion done by LMS).
  // Use IST date strings directly as range boundaries to avoid off-by-5:30h errors.
  // On Monday the deadline for Saturday lectures falls today (+2 days). Extend
  // the lookback by 2 days so Saturday sessions appear in the to-do list.
  const lookback = now.weekday === 1 ? 2 : 0;
  const weekStartDate = now.startOf("week").minus({ days: lookback }).toISODate()!;
  const weekEndDate = now.startOf("week").plus({ days: 8 }).toISODate()!;
  const weekStart = `${weekStartDate}T00:00:00+00:00`;
  const weekEnd = `${weekEndDate}T00:00:00+00:00`;

  const { data: assignments } = await supabase
    .from("cc_batch_assignments")
    .select("batch_id, batch_name")
    .eq("cc_user_id", userId);

  if (!assignments || assignments.length === 0) return [];

  const batchIds = assignments.map((a) => a.batch_id);
  const batchNameMap = Object.fromEntries(assignments.map((a) => [a.batch_id, a.batch_name]));

  const { data, error } = await supabase
    .from("lms_lecture_cache")
    .select("id, batch_id, lecture_id, title, module, schedule, concludes, preread_uploaded, notes_uploaded, assignment_uploaded")
    .in("batch_id", batchIds)
    .neq("module", "general")
    .or("title.ilike.Faculty Session%,title.ilike.IM Session%,title.ilike.Academic Session%")
    .gte("schedule", weekStart)
    .lte("schedule", weekEnd)
    .order("schedule", { ascending: false });

  if (error) throw new Error(error.message);

  // Deduplicate by (batch_id, title, schedule): the LMS stores one row per
  // section for the same live session. Merge compliance flags with OR.
  type CacheRow = (typeof data)[number];
  const dedupMap = new Map<string, CacheRow>();
  for (const row of data ?? []) {
    const key = `${row.batch_id}::${row.schedule}::${row.title}`;
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, row);
    } else {
      dedupMap.set(key, {
        ...existing,
        preread_uploaded: existing.preread_uploaded || row.preread_uploaded,
        notes_uploaded: existing.notes_uploaded || row.notes_uploaded,
        assignment_uploaded: existing.assignment_uploaded || row.assignment_uploaded,
      });
    }
  }

  return [...dedupMap.values()].map((row) => {
    // Supabase stores timestamptz as UTC (+00:00). Parse respecting the offset,
    // then convert to IST for display. (Old approach of slicing off "+00:00" and
    // re-interpreting as IST wall-clock was wrong: it showed 14:30 instead of 20:00.)
    const dt = DateTime.fromISO(row.schedule as string).setZone(timezone);
    const end = DateTime.fromISO(row.concludes as string).setZone(timezone);
    const lectureId = row.lecture_id.toString();
    const lectureDate = dt.toISODate()!;
    const startTime = dt.toFormat("HH:mm:ss");
    const endTime = end.toFormat("HH:mm:ss");

    const makeTask = (type: TaskType, uploaded: boolean): TaskRecord => ({
      id: `${lectureId}-${type}`,
      lecture_id: lectureId,
      type,
      deadline: computeDeadline(type, lectureDate, startTime, endTime),
      status: uploaded ? "completed" : "pending",
      completed_at: null,
    });

    return {
      id: lectureId,
      user_id: userId,
      batch_name: batchNameMap[row.batch_id] ?? `Batch ${row.batch_id}`,
      module_name: row.module ?? "",
      lecture_name: row.title,
      learning_objective: "",
      session_link: "",
      lecture_date: lectureDate,
      start_time: startTime,
      end_time: endTime,
      tasks: {
        preread: makeTask("preread", row.preread_uploaded),
        notes: makeTask("notes", row.notes_uploaded),
        assignment: makeTask("assignment", row.assignment_uploaded),
      },
    } satisfies DashboardLecture;
  });
}

/**
 * Fetch all admin-configured batch lectures from lms_lecture_cache for a given CC.
 * Used by runComplianceCheck() to bridge admin-batch lectures into the task-update pipeline.
 */
export async function getCacheLecturesForProfile(userId: string): Promise<CacheLecture[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();

  // 1. Get batch assignments for this CC
  const { data: assignments, error: assignErr } = await supabase
    .from("cc_batch_assignments")
    .select("batch_id, batch_name")
    .eq("cc_user_id", userId);

  if (assignErr) throw new Error(assignErr.message);
  if (!assignments?.length) return [];

  const batchIds = assignments.map((a) => a.batch_id as number);
  const batchNameById = Object.fromEntries(
    assignments.map((a) => [a.batch_id, a.batch_name])
  );

  // 2. Fetch current-week cache rows for all assigned batches.
  // Matching the same ±8-day window as getCCLectures so we only check the lectures
  // the dashboard actually shows — prevents 700+ per-lecture MySQL calls on large accounts.
  const now = DateTime.now().setZone(timezone);
  // On Monday the deadline for Saturday lectures falls today (+2 days). Extend
  // the lookback by 2 days so those lectures are included and reminders fire.
  const lookback = now.weekday === 1 ? 2 : 0;
  const weekStart = `${now.startOf("week").minus({ days: lookback }).toISODate()!}T00:00:00+00:00`;
  const weekEnd = `${now.startOf("week").plus({ days: 8 }).toISODate()!}T00:00:00+00:00`;

  const { data: rows, error: cacheErr } = await supabase
    .from("lms_lecture_cache")
    .select(
      "batch_id, lecture_id, title, module, schedule, concludes, preread_uploaded, notes_uploaded, assignment_uploaded"
    )
    .in("batch_id", batchIds)
    .neq("module", "general")
    .or("title.ilike.Faculty Session%,title.ilike.IM Session%,title.ilike.Academic Session%")
    .gte("schedule", weekStart)
    .lte("schedule", weekEnd)
    .order("schedule", { ascending: false });

  if (cacheErr) throw new Error(cacheErr.message);
  if (!rows?.length) return [];

  // Deduplicate by (batch_id, title, schedule) before mapping.
  // The LMS stores one row per section for the same live session; merge flags with OR.
  type CRow = (typeof rows)[number];
  const dedupMap = new Map<string, CRow>();
  for (const row of rows) {
    const key = `${row.batch_id}::${row.schedule}::${row.title}`;
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, row);
    } else {
      dedupMap.set(key, {
        ...existing,
        preread_uploaded: existing.preread_uploaded || row.preread_uploaded,
        notes_uploaded: existing.notes_uploaded || row.notes_uploaded,
        assignment_uploaded: existing.assignment_uploaded || row.assignment_uploaded,
      });
    }
  }

  return [...dedupMap.values()].map((row) => {
    const batchId = row.batch_id as number;
    const lmsLectureId = row.lecture_id as number;
    const lectureId = lmsLectureId.toString();

    // Parse Supabase UTC timestamp respecting the offset, then convert to IST.
    const dt = DateTime.fromISO(row.schedule as string).setZone(timezone);
    const end = DateTime.fromISO(row.concludes as string).setZone(timezone);
    const lectureDate = dt.toISODate()!;
    const startTime = dt.toFormat("HH:mm:ss");
    const endTime = end.toFormat("HH:mm:ss");

    return {
      lectureId,
      lmsBatchId: batchId,
      ccUserId: userId,
      batch_name: batchNameById[batchId] ?? `Batch ${batchId}`,
      module_name: (row.module as string) ?? "",
      lecture_name: row.title as string,
      lecture_date: lectureDate,
      start_time: startTime,
      end_time: endTime,
      preread_uploaded: Boolean(row.preread_uploaded),
      notes_uploaded: Boolean(row.notes_uploaded),
      assignment_uploaded: Boolean(row.assignment_uploaded),
    } satisfies CacheLecture;
  });
}
