import { TaskType } from "@/lib/types";

export const TASK_TYPES: TaskType[] = ["preread", "notes", "assignment"];

export const TASK_LABELS: Record<TaskType, string> = {
  preread: "Pre-read",
  notes: "Lecture Notes",
  assignment: "Assignment"
};

