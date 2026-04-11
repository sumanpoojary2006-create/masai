import { TASK_TYPES } from "@/lib/constants";
import { createServerSupabase } from "@/lib/supabase";
import {
  DashboardLecture,
  TaskRecord,
  TaskStatus,
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
      "id, user_id, batch_name, module_name, lecture_name, lecture_date, start_time, end_time, tasks(id, lecture_id, type, deadline, status, completed_at, last_checked_at)"
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
      "id, user_id, batch_name, module_name, lecture_name, lecture_date, start_time, end_time, tasks(id, lecture_id, type, deadline, status, completed_at, last_checked_at)"
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
    lecture_date: lecture.lecture_date,
    start_time: lecture.start_time,
    end_time: lecture.end_time,
    tasks: (lecture.tasks ?? []) as TaskRecord[]
  }));
}

export async function getAutomationProfiles(userId?: string) {
  const supabase = createServerSupabase();
  let query = supabase
    .from("user_profiles")
    .select(
      "user_id, email, lms_username, lms_password, batch_name, lecture_batch_url, assignment_batch_url, onboarding_complete"
    )
    .eq("onboarding_complete", true)
    .order("email", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserProfileRecord[];
}
