import { TASK_TYPES } from "@/lib/constants";
import { createServerSupabase } from "@/lib/supabase";
import {
  DashboardLecture,
  LoReport,
  LoTrackerRow,
  TaskRecord,
  TaskStatus,
  UserBatchConfigRecord,
  UserProfileRecord
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
      "id, user_id, batch_name, module_name, lecture_name, learning_objective, lecture_date, start_time, end_time, tasks(id, lecture_id, type, deadline, status, completed_at, last_checked_at)"
    )
    .eq("user_id", filters.userId)
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
    batch_configs: batchConfigsByUser.get(profile.user_id) ?? []
  }));
}
