export type TaskType = "preread" | "notes" | "assignment";
export type TaskStatus = "pending" | "completed" | "missed";
export type AlertType =
  | "reminder_10h"
  | "reminder_6h"
  | "reminder_2h"
  | "reminder_30m"
  | "missed"
  | "completed";

export interface LectureRecord {
  id: string;
  user_id: string;
  batch_name: string;
  module_name: string;
  lecture_name: string;
  lecture_date: string;
  start_time: string;
  end_time: string;
}

export interface UserProfileRecord {
  user_id: string;
  email: string;
  lms_username: string;
  lms_password: string;
  batch_name: string;
  lecture_batch_url: string;
  assignment_batch_url: string;
  onboarding_complete: boolean;
}

export interface TaskRecord {
  id: string;
  lecture_id: string;
  type: TaskType;
  deadline: string;
  status: TaskStatus;
  completed_at: string | null;
  last_checked_at?: string | null;
}

export interface DashboardLecture extends LectureRecord {
  tasks: Record<TaskType, TaskRecord | null>;
}

export interface ParsedLectureRow {
  batch_name: string;
  module_name: string;
  lecture_name: string;
  lecture_date: string;
  lecture_start_time: string;
  lecture_end_time: string;
}

export interface LmsTrackingRecord {
  lectureId: string;
  resourceType: TaskType;
  found: boolean;
  uploadedAt: string | null;
  rawPayload?: Record<string, unknown>;
}

export interface AutomationLecture extends LectureRecord {
  tasks: TaskRecord[];
}

export interface AutomationProfile extends UserProfileRecord {
  lectures: AutomationLecture[];
}

export interface ComplianceAlertEvent {
  taskId: string;
  lecture: LectureRecord;
  taskType: TaskType;
  alertType: AlertType;
  deadline: string;
  completedAt?: string | null;
}

export interface ComplianceRunSummary {
  checkedLectures: number;
  trackedResources: number;
  updatedTasks: number;
  alertsSent: number;
}
