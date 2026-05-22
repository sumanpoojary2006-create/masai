import { TaskRecord } from "@/lib/types";
import { isLateCompletion, statusClasses } from "@/lib/utils";

export function StatusPill({ task }: { task: TaskRecord }) {
  const now = Date.now();
  const deadlineMs = Date.parse(task.deadline);
  const deadlinePassed = !Number.isNaN(deadlineMs) && now > deadlineMs;

  const lateCompletion =
    task.status === "completed" && isLateCompletion(task.completed_at, task.deadline, task.last_checked_at);

  // Derive effective display status: pending past deadline → missed
  const effectiveStatus =
    task.status === "pending" && deadlinePassed ? "missed" : task.status;

  let titleText: string;
  if (effectiveStatus === "completed") {
    titleText = `Uploaded: ${task.completed_at ? new Date(task.completed_at).toLocaleString() : "Unknown"} | Deadline: ${new Date(task.deadline).toLocaleString()}${lateCompletion ? " (LATE)" : " (On Time)"}`;
  } else if (effectiveStatus === "missed") {
    titleText = `Missed — Deadline: ${new Date(task.deadline).toLocaleString()}`;
  } else {
    titleText = `Deadline: ${new Date(task.deadline).toLocaleString()}`;
  }

  return (
    <span
      title={titleText}
      className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${statusClasses(
        effectiveStatus,
        lateCompletion
      )}`}
    >
      {lateCompletion ? "delayed" : effectiveStatus}
    </span>
  );
}
