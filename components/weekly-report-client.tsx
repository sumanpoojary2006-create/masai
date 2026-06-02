"use client";

import { useMemo, useState } from "react";

import { TASK_LABELS } from "@/lib/constants";
import { TaskRecord, TaskType, WeeklyReportLecture, WeeklyReportWeek } from "@/lib/types";
import { isLateCompletion, statusClasses } from "@/lib/utils";

const TASK_TYPES: TaskType[] = ["preread", "notes", "assignment"];
const BATCH_ACCENTS = [
  "20, 184, 166",
  "59, 130, 246",
  "139, 92, 246",
  "236, 72, 153",
  "245, 158, 11",
  "34, 197, 94",
  "14, 165, 233",
  "168, 85, 247"
];

type TaskCounts = {
  total: number;
  completed: number;
  pending: number;
  missed: number;
};

type MonthReport = {
  monthKey: string;
  monthLabel: string;
  lectures: WeeklyReportLecture[];
};

function batchAccentStyle(batchName: string) {
  let hash = 0;
  for (let index = 0; index < batchName.length; index += 1) {
    hash = (hash * 31 + batchName.charCodeAt(index)) % BATCH_ACCENTS.length;
  }

  return { "--batch-rgb": BATCH_ACCENTS[hash] } as React.CSSProperties;
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function toLocalDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function getMonthKey(value: string) {
  const date = toLocalDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(value: string) {
  return toLocalDate(value).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric"
  });
}

function formatShortDate(value: string) {
  return toLocalDate(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}

function getTaskCounts(lectures: WeeklyReportLecture[]): TaskCounts {
  const counts: TaskCounts = { total: 0, completed: 0, pending: 0, missed: 0 };

  for (const lecture of lectures) {
    for (const type of TASK_TYPES) {
      const task = lecture.tasks[type];
      if (!task) continue;
      counts.total += 1;
      if (task.status === "completed") counts.completed += 1;
      else if (task.status === "missed") counts.missed += 1;
      else counts.pending += 1;
    }
  }

  return counts;
}

function getLoCoverage(lectures: WeeklyReportLecture[]) {
  let covered = 0;
  let missing = 0;

  for (const lecture of lectures) {
    covered += lecture.lo_report?.covered_los?.length ?? 0;
    missing += lecture.lo_report?.missing_los?.length ?? 0;
  }

  return pct(covered, covered + missing);
}

function duplicateKey(monthKey: string, lecture: WeeklyReportLecture) {
  return [
    monthKey,
    lecture.batch_name.trim().toLowerCase(),
    lecture.lecture_name.trim().toLowerCase().replace(/\s+/g, " ")
  ].join("|");
}

function taskRank(task: TaskRecord | null) {
  if (!task) return 0;
  if (task.status === "completed") return 3;
  if (task.status === "missed") return 2;
  return 1;
}

function chooseTask(current: TaskRecord | null, incoming: TaskRecord | null) {
  if (taskRank(incoming) > taskRank(current)) return incoming;
  if (taskRank(incoming) < taskRank(current)) return current;

  const currentChecked = current?.last_checked_at ?? current?.completed_at ?? "";
  const incomingChecked = incoming?.last_checked_at ?? incoming?.completed_at ?? "";
  return incomingChecked > currentChecked ? incoming : current;
}

function chooseLoReport(current: WeeklyReportLecture["lo_report"], incoming: WeeklyReportLecture["lo_report"]) {
  if (!incoming) return current;
  if (!current) return incoming;

  const currentTotal = (current.covered_los?.length ?? 0) + (current.missing_los?.length ?? 0);
  const incomingTotal = (incoming.covered_los?.length ?? 0) + (incoming.missing_los?.length ?? 0);
  if (incomingTotal > currentTotal) return incoming;
  if (incoming.status === "completed" && current.status !== "completed") return incoming;
  return current;
}

function mergeDuplicateLecture(current: WeeklyReportLecture, incoming: WeeklyReportLecture): WeeklyReportLecture {
  return {
    ...current,
    id: current.id,
    lecture_date: current.lecture_date <= incoming.lecture_date ? current.lecture_date : incoming.lecture_date,
    archived_at: current.archived_at >= incoming.archived_at ? current.archived_at : incoming.archived_at,
    tasks: {
      preread: chooseTask(current.tasks.preread, incoming.tasks.preread),
      notes: chooseTask(current.tasks.notes, incoming.tasks.notes),
      assignment: chooseTask(current.tasks.assignment, incoming.tasks.assignment)
    },
    lo_report: chooseLoReport(current.lo_report, incoming.lo_report)
  };
}

function buildMonthReports(weeks: WeeklyReportWeek[]) {
  const monthMap = new Map<string, MonthReport>();
  const lectureMap = new Map<string, WeeklyReportLecture>();

  for (const lecture of weeks.flatMap((week) => week.lectures)) {
    const monthKey = getMonthKey(lecture.lecture_date);
    const key = duplicateKey(monthKey, lecture);
    const current = monthMap.get(monthKey) ?? {
      monthKey,
      monthLabel: getMonthLabel(lecture.lecture_date),
      lectures: []
    };

    const existingLecture = lectureMap.get(key);
    const mergedLecture = existingLecture
      ? mergeDuplicateLecture(existingLecture, lecture)
      : lecture;

    lectureMap.set(key, mergedLecture);
    current.lectures = [
      ...current.lectures.filter((item) => duplicateKey(monthKey, item) !== key),
      mergedLecture
    ];
    monthMap.set(monthKey, current);
  }

  return Array.from(monthMap.values())
    .map((month) => ({
      ...month,
      lectures: month.lectures.sort((a, b) => b.lecture_date.localeCompare(a.lecture_date))
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function TaskChip({
  task
}: {
  task: { status: string; completed_at: string | null; deadline: string; last_checked_at?: string | null } | null;
}) {
  if (!task) return <span className="text-xs text-slate-400 dark:text-slate-600">-</span>;
  const isLate =
    task.status === "completed" && isLateCompletion(task.completed_at, task.deadline, task.last_checked_at);
  const cls = statusClasses(task.status as "pending" | "completed" | "missed", isLate);
  return (
    <span
      title={isLate ? "Uploaded after deadline" : undefined}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1 ${cls}`}
    >
      {isLate ? "late" : task.status}
    </span>
  );
}

function LoSection({ lecture }: { lecture: WeeklyReportLecture }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const report = lecture.lo_report;

  if (!report) {
    return (
      <p className="text-xs italic text-slate-400 dark:text-slate-500">No LO report available</p>
    );
  }

  const covered = report.covered_los ?? [];
  const missing = report.missing_los ?? [];
  const total = covered.length + missing.length;
  const coverage = pct(covered.length, total);

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          LO coverage
        </p>
        <p className="mt-2 text-2xl font-bold text-ink">{coverage}%</p>
        <p className="theme-muted mt-1 text-xs">{covered.length}/{total} objectives covered</p>
        {report.fallback && (
          <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            Keyword match used
          </p>
        )}
      </div>

      <div className="space-y-3">
        {covered.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Covered
            </p>
            <ul className="space-y-1">
              {covered.map((lo, i) => (
                <li key={i} className="text-xs text-slate-700 dark:text-slate-300">
                  {lo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {missing.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-rose-600 dark:text-rose-400">
              Missing
            </p>
            <ul className="space-y-1">
              {missing.map((lo, i) => (
                <li key={i} className="text-xs text-slate-700 dark:text-slate-300">
                  {lo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.transcript && (
          <div>
            <button
              type="button"
              onClick={() => setShowTranscript((value) => !value)}
              className="text-xs font-semibold text-teal-600 underline-offset-2 hover:underline dark:text-teal-400"
            >
              {showTranscript ? "Hide transcript" : "Show transcript"}
            </button>
            {showTranscript && (
              <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {report.transcript}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LectureRow({ lecture }: { lecture: WeeklyReportLecture }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
        onClick={() => setExpanded((value) => !value)}
      >
        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
          {formatShortDate(lecture.lecture_date)}
        </td>
        <td className="px-4 py-3">
          <div className="min-w-[16rem]">
            <p className="font-medium text-ink">{lecture.lecture_name}</p>
            <p className="theme-muted mt-1 text-xs">{lecture.batch_name}</p>
          </div>
        </td>
        {TASK_TYPES.map((type) => (
          <td key={type} className="px-4 py-3 text-center">
            <TaskChip task={lecture.tasks[type]} />
          </td>
        ))}
        <td className="px-4 py-3 text-center">
          {lecture.lo_report?.status === "completed" ? (
            (() => {
              const covered = lecture.lo_report.covered_los?.length ?? 0;
              const total = covered + (lecture.lo_report.missing_los?.length ?? 0);
              return <span className="text-xs font-semibold text-ink">{covered}/{total}</span>;
            })()
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
          )}
        </td>
      </tr>

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

function TableHeader({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 ${
        center ? "text-center" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="theme-muted text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-1 font-[var(--font-heading)] text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function MonthSection({ month }: { month: MonthReport }) {
  const [open, setOpen] = useState(true);
  const tasks = getTaskCounts(month.lectures);
  const completionRate = pct(tasks.completed, tasks.total);
  const loRate = getLoCoverage(month.lectures);
  const byBatch = month.lectures.reduce<Record<string, WeeklyReportLecture[]>>((acc, lecture) => {
    acc[lecture.batch_name] = [...(acc[lecture.batch_name] ?? []), lecture];
    return acc;
  }, {});

  return (
    <section className="theme-panel overflow-hidden rounded-3xl shadow-panel">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-col gap-4 px-6 py-5 text-left transition hover:opacity-90 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <p className="font-[var(--font-heading)] text-2xl font-bold text-ink">{month.monthLabel}</p>
          <p className="theme-muted mt-1 text-sm">
            {month.lectures.length} lectures · {Object.keys(byBatch).length} batches
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-xl">
          <MiniMetric label="Tasks done" value={`${completionRate}%`} />
          <MiniMetric label="Pending" value={tasks.pending} />
          <MiniMetric label="LO coverage" value={`${loRate}%`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-6 pb-6 dark:border-slate-700">
          <div className="my-5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${completionRate}%` }} />
          </div>

          {Object.entries(byBatch)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([batchName, lectures]) => (
              <div key={batchName} className="mt-5">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="batch-accent-pill rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-widest"
                    style={batchAccentStyle(batchName)}
                  >
                    {batchName}
                  </span>
                  <span className="theme-muted text-xs">
                    {lectures.length} lecture{lectures.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div
                  className="batch-accent-card overflow-x-auto rounded-2xl border"
                  style={batchAccentStyle(batchName)}
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                        <TableHeader>Date</TableHeader>
                        <TableHeader>Lecture</TableHeader>
                        {TASK_TYPES.map((type) => (
                          <TableHeader key={type} center>{TASK_LABELS[type]}</TableHeader>
                        ))}
                        <TableHeader center>LOs</TableHeader>
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
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

export function WeeklyReportClient({ weeks }: { weeks: WeeklyReportWeek[] }) {
  const [query, setQuery] = useState("");
  const months = useMemo(() => buildMonthReports(weeks), [weeks]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMonths = useMemo(() => {
    if (!normalizedQuery) return months;
    return months
      .map((month) => ({
        ...month,
        lectures: month.lectures.filter((lecture) =>
          [lecture.lecture_name, lecture.batch_name, month.monthLabel]
            .some((value) => value.toLowerCase().includes(normalizedQuery))
        )
      }))
      .filter((month) => month.lectures.length > 0);
  }, [months, normalizedQuery]);

  if (months.length === 0) {
    return (
      <div className="theme-panel rounded-3xl p-10 text-center shadow-panel">
        <p className="mt-3 font-semibold text-ink">No archived months yet</p>
        <p className="theme-muted mt-1 text-sm">
          Lectures are archived every Monday at 12 PM. Monthly reports will appear here once history is available.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Monthly reports</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-xl font-bold text-ink">Archived lecture history</h2>
        </div>
        <label className="theme-panel flex rounded-[1.25rem] px-4 py-3 shadow-panel sm:w-[360px]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search month, batch, or lecture"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
          />
        </label>
      </section>

      {filteredMonths.length === 0 ? (
        <div className="theme-panel rounded-3xl p-8 text-center shadow-panel">
          <p className="font-semibold text-ink">No matching lectures</p>
          <p className="theme-muted mt-1 text-sm">Try a different search term.</p>
        </div>
      ) : (
        filteredMonths.map((month) => (
          <MonthSection key={month.monthKey} month={month} />
        ))
      )}
    </div>
  );
}
