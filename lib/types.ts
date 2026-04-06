export type TaskType = "preread" | "notes" | "assignment";
export type TaskStatus = "pending" | "completed" | "missed";
export type AlertType = "reminder_6h" | "reminder_2h" | "missed" | "completed";

export interface LectureRecord {
  id: string;
  batch_name: string;
  module_name: string;
  lecture_name: string;
  lecture_date: string;
  start_time: string;
  end_time: string;
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
