import { DateTime } from "luxon";

import { TASK_TYPES } from "@/lib/constants";
import { getAppTimezone } from "@/lib/env";
import { decryptLmsPassword } from "@/lib/lms-password";
import { createServerSupabase } from "@/lib/supabase";
import {
  DashboardLecture,
  LoReport,
  LoTrackerRow,
  TaskRecord,
  TaskStatus,
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
  const { data, error } = await supabase
    .from("lectures")
    .select(
      "id, user_id, batch_name, module_name, lecture_name, learning_objective, session_link, lecture_date, start_time, end_time, tasks(id, lecture_id, type, deadline, status, completed_at, last_checked_at)"
    )
    .eq("user_id", filters.userId)
    .is("archived_at", null)
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

  const { data: lectures, error: lectureError } = await supabase
    .from("lectures")
    .select(
      "id, user_id, batch_name, module_name, lecture_name, learning_objective, session_link, lecture_date, start_time, end_time"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
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
  lectureCount: number;
  completedTasks: number;
  pendingTasks: number;
  missedTasks: number;
}

export async function getAdminBatchStats(): Promise<AdminBatchStats[]> {
  const supabase = createServerSupabase();

  const { data: lectures, error } = await supabase
    .from("lectures")
    .select("id, batch_name, tasks(id, type, deadline, status, completed_at)")
    .is("archived_at", null);

  if (error) throw new Error(error.message);

  const batchMap = new Map<string, AdminBatchStats>();

  for (const lecture of lectures ?? []) {
    const batchName = lecture.batch_name;
    const current = batchMap.get(batchName) ?? {
      batchName,
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
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, email")
    .in("user_id", userIds);

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
      userEmail: userEmailMap.get(lecture.user_id) ?? "Unknown",
      prereadStatus: (preread?.status ?? null) as TaskStatus | null,
      notesStatus: (notes?.status ?? null) as TaskStatus | null,
      assignmentStatus: (assignment?.status ?? null) as TaskStatus | null
    };
  });
}
