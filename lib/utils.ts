import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { TaskStatus } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isLateCompletion(completedAt: string | null, deadline: string) {
  if (!completedAt) return false;

  const completedAtMs = Date.parse(completedAt);
  const deadlineMs = Date.parse(deadline);

  if (Number.isNaN(completedAtMs) || Number.isNaN(deadlineMs)) return false;

  // Use a 5-minute grace period to be generous (e.g. sync delay)
  const GRACE_MS = 5 * 60_000;
  return completedAtMs > deadlineMs + GRACE_MS;
}

export function statusClasses(status: TaskStatus, isLate = false) {
  if (status === "completed") {
    if (isLate) {
      // Uploaded after deadline — keep completed semantics but show delayed accent.
      return "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/45 dark:text-amber-300 dark:ring-amber-700/70";
    }
    // Uploaded on time — green
    return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800";
  }

  if (status === "missed") {
    // Deadline passed, never uploaded — red
    return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800";
  }

  // Not released yet — subtle neutral
  return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700";
}
