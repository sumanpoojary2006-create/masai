import { statusClasses } from "@/lib/utils";
import { TaskStatus } from "@/lib/types";

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${statusClasses(
        status
      )}`}
    >
      {status}
    </span>
  );
}

