import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { TaskStatus } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isLateCompletion(completedAt: string | null, deadline: string, lastCheckedAt?: string | null) {
  const deadlineMs = Date.parse(deadline);
  if (Number.isNaN(deadlineMs)) return false;

  // Use a 5-minute grace period to be generous (e.g. sync delay)
  const GRACE_MS = 5 * 60_000;

  if (completedAt) {
    const completedAtMs = Date.parse(completedAt);
    if (Number.isNaN(completedAtMs)) return false;
    return completedAtMs > deadlineMs + GRACE_MS;
  }

  // Fallback: if we first confirmed completion after the deadline, treat as late.
  // This covers cases where the LMS doesn't return an upload timestamp.
  if (lastCheckedAt) {
    const checkedMs = Date.parse(lastCheckedAt);
    if (!Number.isNaN(checkedMs)) return checkedMs > deadlineMs + GRACE_MS;
  }

  return false;
}

export function statusClasses(status: TaskStatus, isLate = false) {
  if (status === "completed") {
    if (isLate) {
      // Uploaded after deadline — yellow text on green background
      return "bg-emerald-100 text-amber-600 ring-emerald-200 dark:bg-emerald-900/30 dark:text-amber-300 dark:ring-emerald-800";
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
