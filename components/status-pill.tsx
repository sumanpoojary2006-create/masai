import { TaskRecord } from "@/lib/types";
import { isLateCompletion, statusClasses } from "@/lib/utils";

export function StatusPill({ task }: { task: TaskRecord }) {
  const lateCompletion =
    task.status === "completed" && isLateCompletion(task.completed_at, task.deadline);
  const displayStatus = lateCompletion ? "delayed" : task.status;

  return (
    <span
      title={
        task.status === "completed"
          ? `Uploaded: ${task.completed_at ? new Date(task.completed_at).toLocaleString() : "Unknown"} | Deadline: ${new Date(task.deadline).toLocaleString()}${lateCompletion ? " (Delayed)" : " (On Time)"}`
          : `Deadline: ${new Date(task.deadline).toLocaleString()}`
      }
      className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${statusClasses(
        task.status,
        lateCompletion
      )}`}
    >
      {displayStatus}
    </span>
  );
}
