import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { TaskStatus } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function statusClasses(status: TaskStatus) {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  }

  if (status === "missed") {
    return "bg-rose-100 text-rose-700 ring-rose-200";
  }

  return "bg-amber-100 text-amber-700 ring-amber-200";
}

