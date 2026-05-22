"use client";

import { useState } from "react";

import { TASK_LABELS } from "@/lib/constants";
import { TaskType, WeeklyReportLecture, WeeklyReportWeek } from "@/lib/types";
import { isLateCompletion, statusClasses } from "@/lib/utils";

const TASK_TYPES: TaskType[] = ["preread", "notes", "assignment"];

function TaskChip({
  task
}: {
  task: { status: string; completed_at: string | null; deadline: string; last_checked_at?: string | null } | null;
}) {
  if (!task) return <span className="text-xs text-slate-400 dark:text-slate-600">—</span>;
  const isLate =
    task.status === "completed" && isLateCompletion(task.completed_at, task.deadline, task.last_checked_at);
  const cls = statusClasses(task.status as "pending" | "completed" | "missed", isLate);
  return (
    <span
      title={isLate ? "Uploaded after deadline" : undefined}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1 ${cls}`}
    >
      {task.status}
    </span>
  );
}

function LoSection({ lecture }: { lecture: WeeklyReportLecture }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const report = lecture.lo_report;

  if (!report) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 italic">No LO report available</p>
    );
  }

  const covered = report.covered_los ?? [];
  const missing = report.missing_los ?? [];
  const total = covered.length + missing.length;
  const pct = total > 0 ? Math.round((covered.length / total) * 100) : 0;
  const bar = pct === 100 ? "🟢" : pct >= 60 ? "🟡" : "🔴";

  return (
    <div className="space-y-3">
      {/* Coverage summary */}
      <div className="flex items-center gap-2">
        <span>{bar}</span>
        <span className="text-sm font-semibold text-ink">
          {covered.length}/{total} LOs covered ({pct}%)
        </span>
        {report.fallback && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800">
            ⚠ Keyword match
          </span>
        )}
      </div>

      {/* Covered LOs */}
      {covered.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Covered
          </p>
          <ul className="space-y-0.5">
            {covered.map((lo, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                {lo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing LOs */}
      {missing.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-rose-600 dark:text-rose-400">
            Missing
          </p>
          <ul className="space-y-0.5">
            {missing.map((lo, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="mt-0.5 shrink-0 text-rose-500">✗</span>
                {lo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript toggle */}
      {report.transcript && (
        <div>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs font-semibold text-teal-600 underline-offset-2 hover:underline dark:text-teal-400"
          >
            {showTranscript ? "Hide transcript ▲" : "Show transcript ▼"}
          </button>
          {showTranscript && (
            <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {report.transcript}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function LectureRow({ lecture }: { lecture: WeeklyReportLecture }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
          {new Date(lecture.lecture_date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short"
          })}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{lecture.lecture_name}</span>
            {lecture.lo_report && (
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                {expanded ? "▲" : "▼"}
              </span>
            )}
          </div>
        </td>
        {TASK_TYPES.map((type) => (
          <td key={type} className="px-4 py-3 text-center">
            <TaskChip
              task={
                lecture.tasks[type] as {
                  status: string;
                  completed_at: string | null;
                  deadline: string;
                } | null
              }
            />
          </td>
        ))}
        <td className="px-4 py-3 text-center">
          {lecture.lo_report?.status === "completed" ? (
            (() => {
              const covered = lecture.lo_report.covered_los?.length ?? 0;
              const total =
                covered + (lecture.lo_report.missing_los?.length ?? 0);
              const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
              return (
                <span className="text-xs font-semibold text-ink">
                  {pct === 100 ? "🟢" : pct >= 60 ? "🟡" : "🔴"} {covered}/{total}
                </span>
              );
            })()
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
          )}
        </td>
      </tr>

      {/* Expanded LO detail row */}
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/20">
          <td colSpan={6} className="px-6 py-4">
            <LoSection lecture={lecture} />
          </td>
        </tr>
      )}
    </>
  );
}

function WeekSection({ week }: { week: WeeklyReportWeek }) {
  const [open, setOpen] = useState(true);

  // Per-week summary
  let completed = 0, missed = 0, pending = 0;
  for (const lecture of week.lectures) {
    for (const type of TASK_TYPES) {
      const t = lecture.tasks[type];
      if (!t) continue;
      if (t.status === "completed") completed++;
      else if (t.status === "missed") missed++;
      else pending++;
    }
  }

  // Group by batch
  const byBatch = week.lectures.reduce<Record<string, WeeklyReportLecture[]>>(
    (acc, l) => {
      acc[l.batch_name] = [...(acc[l.batch_name] ?? []), l];
      return acc;
    },
    {}
  );

  return (
    <div className="theme-panel overflow-hidden rounded-3xl shadow-panel">
      {/* Week header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:opacity-80"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-ink">{week.week_label}</span>
          <span className="theme-muted text-sm">
            {week.lectures.length} lecture{week.lectures.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {completed > 0 && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800">
              {completed} done
            </span>
          )}
          {missed > 0 && (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800">
              {missed} missed
            </span>
          )}
          {pending > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800">
              {pending} pending
            </span>
          )}
          <span className="theme-muted text-lg">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-6 pb-6 dark:border-slate-700">
          {Object.entries(byBatch)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([batchName, lectures]) => (
              <div key={batchName} className="mt-5">
                {/* Batch sub-header */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-teal-50 px-3 py-0.5 text-xs font-bold uppercase tracking-widest text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800">
                    {batchName}
                  </span>
                  <span className="theme-muted text-xs">
                    {lectures.length} lecture{lectures.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Date
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Lecture
                        </th>
                        {TASK_TYPES.map((type) => (
                          <th
                            key={type}
                            className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400"
                          >
                            {TASK_LABELS[type]}
                          </th>
                        ))}
                        <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          LOs
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lectures
                        .sort((a, b) => b.lecture_date.localeCompare(a.lecture_date))
                        .map((lecture) => (
                          <LectureRow key={lecture.id} lecture={lecture} />
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                  Click a lecture row to expand LO details
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function WeeklyReportClient({ weeks }: { weeks: WeeklyReportWeek[] }) {
  if (weeks.length === 0) {
    return (
      <div className="theme-panel rounded-3xl p-10 text-center shadow-panel">
        <p className="text-2xl">📅</p>
        <p className="mt-3 font-semibold text-ink">No archived weeks yet</p>
        <p className="theme-muted mt-1 text-sm">
          Lectures are archived every Monday at 12 PM. Check back next week.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {weeks.map((week) => (
        <WeekSection key={week.week_label} week={week} />
      ))}
    </div>
  );
}
