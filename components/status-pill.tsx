import { TaskRecord } from "@/lib/types";
import { statusClasses } from "@/lib/utils";

export function StatusPill({ task }: { task: TaskRecord }) {
  return (
    <span
      className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${statusClasses(
        task.status
      )}`}
    >
      {task.status}
    </span>
  );
}
