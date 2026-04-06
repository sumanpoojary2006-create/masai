import { TaskRecord } from "@/lib/types";
import { isLateCompletion, statusClasses } from "@/lib/utils";

export function StatusPill({ task }: { task: TaskRecord }) {
  const lateCompletion =
    task.status === "completed" && isLateCompletion(task.completed_at, task.deadline);

  return (
    <span
      title={lateCompletion ? "Completed after deadline" : undefined}
      className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${statusClasses(
        task.status,
        lateCompletion
      )}`}
    >
      {task.status}
    </span>
  );
}
