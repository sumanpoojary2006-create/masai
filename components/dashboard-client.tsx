"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";

import { StatusPill } from "@/components/status-pill";
import { formatDeadline, formatLectureDate, formatLectureTime } from "@/lib/deadlines";
import { DashboardLecture, TaskStatus } from "@/lib/types";

const STATUS_FILTERS: Array<TaskStatus | "all"> = [
  "all",
  "pending",
  "completed",
  "missed"
];

const TASK_LABELS = {
  preread: "Pre-read",
  notes: "Notes",
  assignment: "Assignment"
} as const;

const APP_TIMEZONE = "Asia/Kolkata";

type TodayTaskItem = {
  lectureId: string;
  batchName: string;
  lectureName: string;
  lectureDate: string;
  taskType: "preread" | "notes" | "assignment";
  deadline: string;
  status: TaskStatus;
};

export function DashboardClient({ lectures }: { lectures: DashboardLecture[] }) {
  const router = useRouter();
  const [batchFilter, setBatchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showTodayTodo, setShowTodayTodo] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const batches = [...new Set(lectures.map((lecture) => lecture.batch_name))].sort();
  const filteredLectures = lectures.filter((lecture) => {
    const batchMatches = batchFilter === "all" || lecture.batch_name === batchFilter;
    const statusMatches =
      statusFilter === "all" ||
      Object.values(lecture.tasks).some((task) => task?.status === statusFilter);
    const dateFromMatches = !dateFrom || lecture.lecture_date >= dateFrom;
    const dateToMatches = !dateTo || lecture.lecture_date <= dateTo;

    return batchMatches && statusMatches && dateFromMatches && dateToMatches;
  });
  const groupedLectures = Object.entries(
    filteredLectures.reduce<Record<string, DashboardLecture[]>>((accumulator, lecture) => {
      const current = accumulator[lecture.batch_name] ?? [];
      current.push(lecture);
      accumulator[lecture.batch_name] = current;
      return accumulator;
    }, {})
  ).sort(([leftBatch], [rightBatch]) => leftBatch.localeCompare(rightBatch));

  const todayIsoDate = DateTime.now().setZone(APP_TIMEZONE).toISODate();
  const todayTasks = filteredLectures.flatMap<TodayTaskItem>((lecture) =>
    (Object.entries(lecture.tasks) as Array<
      [TodayTaskItem["taskType"], DashboardLecture["tasks"][TodayTaskItem["taskType"]]]
    >).flatMap(([taskType, task]) => {
      if (!task) {
        return [];
      }

      const deadlineDate = DateTime.fromISO(task.deadline)
        .setZone(APP_TIMEZONE)
        .toISODate();

      if (deadlineDate !== todayIsoDate) {
        return [];
      }

      return [
        {
          lectureId: lecture.id,
          batchName: lecture.batch_name,
          lectureName: lecture.lecture_name,
          lectureDate: lecture.lecture_date,
          taskType,
          deadline: task.deadline,
          status: task.status
        }
      ];
    })
  );
  const pendingTodayTasks = todayTasks.filter((task) => task.status !== "completed");
  const completedTodayTasks = todayTasks.filter((task) => task.status === "completed");
  const groupedPendingTodayTasks = Object.entries(
    pendingTodayTasks.reduce<Record<string, TodayTaskItem[]>>((accumulator, task) => {
      const current = accumulator[task.batchName] ?? [];
      current.push(task);
      accumulator[task.batchName] = current;
      return accumulator;
    }, {})
  ).sort(([leftBatch], [rightBatch]) => leftBatch.localeCompare(rightBatch));
  const groupedCompletedTodayTasks = Object.entries(
    completedTodayTasks.reduce<Record<string, TodayTaskItem[]>>((accumulator, task) => {
      const current = accumulator[task.batchName] ?? [];
      current.push(task);
      accumulator[task.batchName] = current;
      return accumulator;
    }, {})
  ).sort(([leftBatch], [rightBatch]) => leftBatch.localeCompare(rightBatch));

  function handleDelete(lectureId: string, lectureName: string) {
    const confirmed = window.confirm(
      `Delete "${lectureName}" from the dashboard? This will also remove its tasks and tracking history.`
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setDeletingId(lectureId);
      setMessage(null);

      const response = await fetch(`/api/lectures/${lectureId}`, {
        method: "DELETE"
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(payload.message ?? "Unable to delete the lecture.");
        setDeletingId(null);
        return;
      }

      setMessage(payload.message ?? "Lecture deleted.");
      setDeletingId(null);
      router.refresh();
    });
  }

  function handleSync() {
    startTransition(async () => {
      setIsSyncing(true);
      setMessage(null);

      const response = await fetch("/api/compliance", {
        method: "POST"
      });

      const payload = (await response.json()) as {
        message?: string;
        result?: {
          checkedLectures: number;
          trackedResources: number;
          updatedTasks: number;
          alertsSent: number;
        };
      };

      if (!response.ok) {
        setMessage(payload.message ?? "Unable to run compliance sync.");
        setIsSyncing(false);
        return;
      }

      if (payload.result) {
        setMessage(
          `Sync complete. Checked ${payload.result.checkedLectures} lectures, updated ${payload.result.updatedTasks} tasks, and sent ${payload.result.alertsSent} Slack message(s).`
        );
      } else {
        setMessage(payload.message ?? "Compliance sync completed.");
      }

      setIsSyncing(false);
      router.refresh();
    });
  }

  function renderTaskCell(lecture: DashboardLecture, type: "preread" | "notes" | "assignment") {
    const task = lecture.tasks[type];

    if (!task) {
      return <span className="theme-muted text-sm">Not created</span>;
    }

    return (
      <div className="flex min-h-[88px] flex-col justify-start gap-2">
        <StatusPill task={task} />
        <p className="theme-muted text-[11px] leading-relaxed whitespace-nowrap">
          <span className="font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Deadline
          </span>
          <span className="ml-1 font-medium">{formatDeadline(task.deadline)}</span>
        </p>
      </div>
    );
  }

  function getDisplayLectureId(lecture: DashboardLecture) {
    try {
      if (lecture.session_link) {
        const sessionLectureId = new URL(lecture.session_link).searchParams.get("id");
        if (sessionLectureId) {
          return sessionLectureId;
        }
      }
    } catch {
      // Ignore malformed URLs and fall back to DB lecture id.
    }

    return lecture.id;
  }

  if (lectures.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-12 text-center shadow-panel dark:border-slate-700 dark:bg-slate-800/40">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
          No Data Yet
        </p>
        <h3 className="mt-3 font-[var(--font-heading)] text-3xl font-bold text-ink">
          Import a weekly sheet to start tracking compliance
        </h3>
          <p className="theme-muted mx-auto mt-3 max-w-2xl text-sm">
            The dashboard fills automatically after the file upload route stores the
            lectures and generates the three tracked tasks for each session.
          </p>
        <button
          type="button"
          disabled={isPending || isSyncing}
          onClick={handleSync}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-brand dark:hover:bg-teal-500 dark:shadow-[0_0_16px_rgba(15,118,110,0.5)] dark:hover:shadow-[0_0_24px_rgba(15,118,110,0.7)] dark:disabled:bg-slate-700 dark:disabled:shadow-none"
        >
          {isSyncing ? "Syncing..." : "Sync Up"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="theme-panel rounded-3xl p-6 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Compliance Dashboard
            </p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-ink">
              Lecture resources across every batch
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <button
              type="button"
              onClick={() => setShowTodayTodo((current) => !current)}
              className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
            >
              {showTodayTodo ? "Hide today's to do list" : "Today's to do list"}
            </button>

            <button
              type="button"
              disabled={isPending || isSyncing}
              onClick={handleSync}
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-brand dark:hover:bg-teal-500 dark:shadow-[0_0_16px_rgba(15,118,110,0.5)] dark:hover:shadow-[0_0_24px_rgba(15,118,110,0.7)] dark:disabled:bg-slate-700 dark:disabled:shadow-none"
            >
              {isSyncing ? "Syncing..." : "Sync Up"}
            </button>

            <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
              Batch
              <select
                value={batchFilter}
                onChange={(event) => setBatchFilter(event.target.value)}
                className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
              >
                <option value="all">All batches</option>
                {batches.map((batch) => (
                  <option key={batch} value={batch}>
                    {batch}
                  </option>
                ))}
              </select>
            </label>

            <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "all")}
                className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "All statuses" : status}
                  </option>
                ))}
              </select>
            </label>

            {/* From / To date range — grouped so they never split across rows */}
            <div className="theme-muted flex flex-col gap-2 text-sm font-medium">
              Week
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <span className="text-slate-400 dark:text-slate-500">→</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 transition hover:border-rose-300 hover:text-rose-500 dark:border-slate-600 dark:text-slate-500 dark:hover:border-rose-700 dark:hover:text-rose-400"
                    title="Clear date filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {message ? <p className="theme-muted mt-4 text-sm">{message}</p> : null}

        {showTodayTodo ? (
          <div className="mt-6 rounded-3xl border border-slate-200/80 bg-slate-50/90 p-5 dark:border-slate-700/70 dark:bg-slate-900/40">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                  Today's to do list
                </p>
                <h3 className="mt-2 font-[var(--font-heading)] text-xl font-bold text-ink">
                  Release tasks due today
                </h3>
                <p className="theme-muted mt-1 text-sm">
                  {DateTime.now().setZone(APP_TIMEZONE).toFormat("dd LLL yyyy")} • built from tasks whose release deadline falls today
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                    Open today
                  </p>
                  <p className="mt-2 text-2xl font-bold text-amber-900 dark:text-amber-200">
                    {pendingTodayTasks.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                    Done today
                  </p>
                  <p className="mt-2 text-2xl font-bold text-emerald-900 dark:text-emerald-200">
                    {completedTodayTasks.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/50">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Total today
                  </p>
                  <p className="mt-2 text-2xl font-bold text-ink">
                    {todayTasks.length}
                  </p>
                </div>
              </div>
            </div>

            {todayTasks.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300/80 bg-white/80 px-5 py-6 text-sm text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-400">
                No resource releases are due today for the current dashboard view.
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-ink">Still pending today</h4>
                    <p className="theme-muted text-xs uppercase tracking-[0.16em]">
                      Action required
                    </p>
                  </div>

                  {groupedPendingTodayTasks.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                      Everything due today is already completed.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {groupedPendingTodayTasks.map(([batchName, tasks]) => (
                        <div
                          key={batchName}
                          className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 dark:border-slate-700/70 dark:bg-slate-950/30"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            {batchName}
                          </p>
                          <div className="mt-3 space-y-3">
                            {tasks.map((task) => (
                              <div
                                key={`${task.lectureId}-${task.taskType}`}
                                className="flex flex-col gap-2 rounded-2xl border border-slate-100/90 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50"
                              >
                                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                  <div>
                                    <p className="font-semibold text-ink">{task.lectureName}</p>
                                    <p className="theme-muted mt-1 text-xs uppercase tracking-[0.12em]">
                                      Lecture date {formatLectureDate(task.lectureDate)}
                                    </p>
                                  </div>
                                  <StatusPill
                                    task={{
                                      id: `${task.lectureId}-${task.taskType}`,
                                      lecture_id: task.lectureId,
                                      type: task.taskType,
                                      deadline: task.deadline,
                                      status: task.status,
                                      completed_at: null
                                    }}
                                  />
                                </div>
                                <p className="theme-muted text-sm">
                                  <span className="font-semibold text-ink">{TASK_LABELS[task.taskType]}</span> needs to be released by{" "}
                                  <span className="font-semibold text-ink">{formatDeadline(task.deadline)}</span>.
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {groupedCompletedTodayTasks.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold text-ink">Already completed today</h4>
                      <p className="theme-muted text-xs uppercase tracking-[0.16em]">
                        For quick verification
                      </p>
                    </div>
                    <div className="space-y-4">
                      {groupedCompletedTodayTasks.map(([batchName, tasks]) => (
                        <div
                          key={batchName}
                          className="rounded-2xl border border-emerald-200/60 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                            {batchName}
                          </p>
                          <div className="mt-3 space-y-2">
                            {tasks.map((task) => (
                              <p
                                key={`${task.lectureId}-${task.taskType}`}
                                className="text-sm text-emerald-900 dark:text-emerald-200"
                              >
                                <span className="font-semibold">{task.lectureName}</span> • {TASK_LABELS[task.taskType]} done
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {groupedLectures.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              No Matching Lectures
            </p>
            <p className="theme-muted mt-2 text-sm">
              Try a different batch or status filter to see grouped lecture results.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {groupedLectures.map(([batchName, batchLectures]) => (
              <div
                key={batchName}
                className="theme-subpanel overflow-hidden rounded-3xl"
              >
                <div className="theme-subpanel-header px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Batch
                  </p>
                  <h3 className="mt-1 font-[var(--font-heading)] text-xl font-bold text-ink">
                    {batchName}
                  </h3>
                  <p className="theme-muted mt-1 text-sm">
                    {batchLectures.length} lecture{batchLectures.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="overflow-x-auto px-5 py-2">
                  <table className="w-full table-fixed divide-y divide-slate-200/70 dark:divide-slate-700/70">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        <th className="w-[30%] pb-3 pr-4 pt-3">Lecture</th>
                        <th className="w-[15%] pb-3 pr-4 pt-3">Schedule</th>
                        <th className="w-[15%] pb-3 pr-4 pt-3">Pre-read</th>
                        <th className="w-[15%] pb-3 pr-4 pt-3">Notes</th>
                        <th className="w-[15%] pb-3 pr-4 pt-3">Assignment</th>
                        <th className="w-[10%] pb-3 pt-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 dark:divide-slate-700/60">
                      {batchLectures.map((lecture) => (
                        <Fragment key={lecture.id}>
                          <tr className="align-top">
                            <td className="py-4 pr-4">
                              <p className="font-semibold text-ink">{lecture.lecture_name}</p>
                              <p className="theme-muted mt-1 text-xs font-medium uppercase tracking-wider">
                                Lecture ID: <span className="text-brand">{getDisplayLectureId(lecture)}</span>
                              </p>
                            </td>
                            <td className="theme-muted py-4 pr-4 text-sm">
                              <p>{formatLectureDate(lecture.lecture_date)}</p>
                              <p className="mt-1">{formatLectureTime(lecture.start_time)}</p>
                            </td>
                            <td className="py-4 pr-4 align-top">{renderTaskCell(lecture, "preread")}</td>
                            <td className="py-4 pr-4 align-top">{renderTaskCell(lecture, "notes")}</td>
                            <td className="py-4 pr-4 align-top">{renderTaskCell(lecture, "assignment")}</td>
                            <td className="py-4">
                              <div className="flex items-start">
                                <button
                                  type="button"
                                  disabled={isPending && deletingId === lecture.id}
                                  onClick={() => handleDelete(lecture.id, lecture.lecture_name)}
                                  title="Delete lecture"
                                  aria-label="Delete lecture"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:disabled:border-slate-700 dark:disabled:text-slate-600"
                                >
                                  {deletingId === lecture.id ? (
                                    <span className="text-[10px] font-semibold">...</span>
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className="h-4 w-4"
                                    >
                                      <path d="M3 6h18" />
                                      <path d="M8 6V4h8v2" />
                                      <path d="M19 6l-1 14H6L5 6" />
                                      <path d="M10 11v6" />
                                      <path d="M14 11v6" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
