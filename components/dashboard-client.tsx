"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { StatusPill } from "@/components/status-pill";
import { TopProgressBar } from "@/components/top-progress-bar";
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

const SYNC_STEPS = [
  "Pulling LMS task statuses…",
  "Syncing batch cache…",
  "Checking pending deadlines…",
  "Sending Slack digest…",
  "Wrapping up…",
];

type TodayTaskItem = {
  lectureId: string;
  displayLectureId: string;
  batchName: string;
  lectureName: string;
  lectureDate: string;
  taskType: "preread" | "notes" | "assignment";
  deadline: string;
  status: TaskStatus;
};

function hslToRgbString(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] =
    segment < 1
      ? [chroma, second, 0]
      : segment < 2
        ? [second, chroma, 0]
        : segment < 3
          ? [0, chroma, second]
          : segment < 4
            ? [0, second, chroma]
            : segment < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];

  return [red, green, blue]
    .map((value) => Math.round((value + match) * 255))
    .join(", ");
}

function batchAccentRgb(index: number, total: number) {
  const hue = (174 + index * (360 / Math.max(total, 1))) % 360;
  return hslToRgbString(hue, 0.72, 0.56);
}

function batchAccentStyle(rgb: string) {
  return { "--batch-rgb": rgb } as React.CSSProperties;
}

function buildSummary(lectures: DashboardLecture[]) {
  const taskStatuses = lectures.flatMap((lecture) => Object.values(lecture.tasks));
  return {
    lectures: lectures.length,
    completed: taskStatuses.filter((task) => task?.status === "completed").length,
    pending: taskStatuses.filter((task) => task?.status === "pending").length,
    missed: taskStatuses.filter((task) => task?.status === "missed").length,
  };
}

function SummaryOverview({
  summary
}: {
  summary: ReturnType<typeof buildSummary>;
}) {
  const totalTasks = summary.completed + summary.pending + summary.missed;
  const completionRate = totalTasks > 0 ? Math.round((summary.completed / totalTasks) * 100) : 0;
  const pendingRate = totalTasks > 0 ? Math.round((summary.pending / totalTasks) * 100) : 0;
  const missedRate = totalTasks > 0 ? Math.round((summary.missed / totalTasks) * 100) : 0;
  const circumference = 2 * Math.PI * 42;
  const completedDash = totalTasks > 0 ? (summary.completed / totalTasks) * circumference : 0;
  const pendingWidth = totalTasks > 0 ? Math.max((summary.pending / totalTasks) * 100, summary.pending > 0 ? 4 : 0) : 0;
  const missedWidth = totalTasks > 0 ? Math.max((summary.missed / totalTasks) * 100, summary.missed > 0 ? 4 : 0) : 0;
  const completedWidth =
    totalTasks > 0 ? Math.max((summary.completed / totalTasks) * 100, summary.completed > 0 ? 4 : 0) : 0;

  const statTiles = [
    {
      label: "Lectures",
      value: summary.lectures,
      helper: `${totalTasks} resource tasks`,
      tone: "border-slate-600/35 bg-slate-950/28 text-slate-100"
    },
    {
      label: "Completed",
      value: summary.completed,
      helper: `${completionRate}% complete`,
      tone: "border-slate-500/35 bg-slate-900/32 text-slate-100"
    },
    {
      label: "Pending",
      value: summary.pending,
      helper: `${pendingRate}% remaining`,
      tone: "border-slate-500/35 bg-slate-900/32 text-slate-100"
    },
    {
      label: "Missed",
      value: summary.missed,
      helper: `${missedRate}% overdue`,
      tone: "border-slate-500/35 bg-slate-900/32 text-slate-100"
    }
  ];

  return (
    <section className="theme-panel overflow-hidden rounded-[2rem] p-5 shadow-panel">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-stretch">
        <div className="rounded-[1.5rem] border border-slate-700/55 bg-slate-950/35 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                Completion
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-xl font-bold text-ink">
                Resource health
              </h3>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400">
              Today
            </span>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="relative h-40 w-40">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`${completionRate}% completed`}>
                <circle
                  cx="60"
                  cy="60"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="13"
                  className="text-slate-800"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeDasharray={`${completedDash} ${circumference}`}
                  className="text-emerald-400 transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-[var(--font-heading)] text-4xl font-bold text-ink">{completionRate}%</span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Done
                </span>
              </div>
            </div>
          </div>

          <p className="theme-muted mt-5 text-center text-sm">
            {summary.completed} of {totalTasks} resources are released.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statTiles.map((tile) => (
              <div key={tile.label} className={`rounded-[1.25rem] border p-4 ${tile.tone}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{tile.label}</p>
                <p className="mt-3 font-[var(--font-heading)] text-3xl font-bold">{tile.value}</p>
                <p className="mt-1 text-xs opacity-70">{tile.helper}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[1.5rem] border border-slate-700/55 bg-slate-950/35 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Task mix</p>
                <p className="theme-muted mt-1 text-xs">
                  Completed, pending, and missed resources across all lectures.
                </p>
              </div>
              <p className="theme-muted text-xs font-semibold uppercase tracking-[0.14em]">
                {totalTasks} total tasks
              </p>
            </div>

            <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-800">
              <div className="flex h-full">
                <div
                  className="bg-emerald-400"
                  style={{ width: `${completedWidth}%` }}
                  title={`${summary.completed} completed`}
                />
                <div
                  className="bg-amber-300"
                  style={{ width: `${pendingWidth}%` }}
                  title={`${summary.pending} pending`}
                />
                <div
                  className="bg-rose-400"
                  style={{ width: `${missedWidth}%` }}
                  title={`${summary.missed} missed`}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Completed {summary.completed}
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                Pending {summary.pending}
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                Missed {summary.missed}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConfiguredBatchFilter({
  batches,
  batchAccentMap,
  batchFilter,
  lectureCounts,
  onSelect
}: {
  batches: string[];
  batchAccentMap: Map<string, string>;
  batchFilter: string;
  lectureCounts: Map<string, number>;
  onSelect: (batch: string) => void;
}) {
  return (
    <section className="theme-panel rounded-[2rem] p-5 shadow-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
            Configured batches
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-xl font-bold text-ink">
            Filter by batch color
          </h2>
        </div>
        {batchFilter !== "all" ? (
          <button
            type="button"
            onClick={() => onSelect("all")}
            className="theme-button-secondary inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition"
          >
            Show all batches
          </button>
        ) : null}
      </div>

      <div className="batch-filter-strip mt-5">
        {batches.map((batch) => {
          const accent = batchAccentMap.get(batch) ?? batchAccentRgb(0, 1);
          const selected = batchFilter === batch;
          return (
            <button
              key={batch}
              type="button"
              onClick={() => onSelect(batch)}
              className={`batch-accent-pill inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[clamp(0.68rem,0.78vw,0.875rem)] font-semibold transition ${
                selected ? "ring-2 ring-offset-2 ring-offset-transparent" : "hover:-translate-y-0.5"
              }`}
              style={batchAccentStyle(accent)}
              aria-pressed={selected}
              title={`Show only ${batch}`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_18px_rgba(var(--batch-rgb),0.55)]"
                style={{ backgroundColor: `rgb(${accent})` }}
              />
              <span className="min-w-0 truncate">{batch}</span>
              <span className="theme-muted shrink-0 text-xs font-medium">
                {lectureCounts.get(batch) ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function DashboardClient({
  lectures,
  proxyUserId,
  dashboardSelector
}: {
  lectures: DashboardLecture[];
  proxyUserId?: string;
  dashboardSelector?: React.ReactNode;
}) {
  const router = useRouter();
  const [batchFilter, setBatchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showTodayTodo, setShowTodayTodo] = useState(false);
  const [showTodayLectures, setShowTodayLectures] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [syncStep, setSyncStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isSyncing) {
      setSyncStep(0);
      // Advance one step every 1.8 s — stays on last step until API responds
      stepIntervalRef.current = setInterval(() => {
        setSyncStep((prev) => Math.min(prev + 1, SYNC_STEPS.length - 1));
      }, 1800);
    } else {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
        stepIntervalRef.current = null;
      }
    }
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    };
  }, [isSyncing]);

  const batches = [...new Set(lectures.map((lecture) => lecture.batch_name))].sort();
  const batchSignature = batches.join("\u001f");
  const batchAccentMap = useMemo(
    () => new Map(batches.map((batch, index) => [batch, batchAccentRgb(index, batches.length)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batchSignature]
  );
  const lectureCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lecture of lectures) {
      counts.set(lecture.batch_name, (counts.get(lecture.batch_name) ?? 0) + 1);
    }
    return counts;
  }, [lectures]);
  const summary = buildSummary(lectures);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredLectures = lectures.filter((lecture) => {
    const batchMatches = batchFilter === "all" || lecture.batch_name === batchFilter;
    const statusMatches =
      statusFilter === "all" ||
      Object.values(lecture.tasks).some((task) => task?.status === statusFilter);
    const dateFromMatches = !dateFrom || lecture.lecture_date >= dateFrom;
    const dateToMatches = !dateTo || lecture.lecture_date <= dateTo;
    const searchMatches =
      !normalizedSearchQuery ||
      [
        lecture.lecture_name,
        lecture.module_name,
        lecture.batch_name,
        lecture.learning_objective,
        getDisplayLectureId(lecture),
        lecture.id
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearchQuery));

    return batchMatches && statusMatches && dateFromMatches && dateToMatches && searchMatches;
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
  const todayLectures = filteredLectures.filter((lecture) => lecture.lecture_date === todayIsoDate);
  const groupedTodayLectures = Object.entries(
    todayLectures.reduce<Record<string, DashboardLecture[]>>((accumulator, lecture) => {
      const current = accumulator[lecture.batch_name] ?? [];
      current.push(lecture);
      accumulator[lecture.batch_name] = current;
      return accumulator;
    }, {})
  ).sort(([leftBatch], [rightBatch]) => leftBatch.localeCompare(rightBatch));
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
          displayLectureId: getDisplayLectureId(lecture),
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

  async function handleSync() {
    setIsSyncing(true);
    setSyncStatus("idle");
    setMessage(null);

    // Safety net: reload after 58 s regardless of API outcome so the
    // user never gets permanently stuck on the overlay.
    const safetyTimer = setTimeout(() => window.location.reload(), 58_000);

    try {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 55_000);

      const response = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proxyUserId ? { target_cc_id: proxyUserId } : {}),
        signal: controller.signal,
      });
      clearTimeout(abortTimer);

      let payload: {
        message?: string;
        result?: {
          checkedLectures: number;
          trackedResources: number;
          updatedTasks: number;
        };
      } = {};

      try {
        payload = await response.json();
      } catch {
        // non-JSON response (e.g. Vercel error page)
      }

      clearTimeout(safetyTimer);

      if (!response.ok) {
        setSyncStatus("error");
        setMessage(payload.message ?? "Unable to run compliance sync.");
        setIsSyncing(false);
        return;
      }

      setSyncStatus("success");
      setMessage(
        payload.result
          ? `Checked ${payload.result.checkedLectures} lectures · ${payload.result.updatedTasks} tasks updated.`
          : (payload.message ?? "Compliance sync completed.")
      );
      setIsSyncing(false);
      window.location.reload();
    } catch {
      clearTimeout(safetyTimer);
      setSyncStatus("error");
      setMessage("Sync is taking longer than expected. Reloading…");
      setIsSyncing(false);
      // Reload anyway — partial sync may have updated some tasks.
      setTimeout(() => window.location.reload(), 2_000);
    }
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
      <>
        <TopProgressBar isLoading={isSyncing} />
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
          className="mt-6 inline-flex h-11 items-center gap-2 justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-brand dark:hover:bg-teal-500 dark:shadow-[0_0_16px_rgba(15,118,110,0.5)] dark:hover:shadow-[0_0_24px_rgba(15,118,110,0.7)] dark:disabled:bg-slate-700 dark:disabled:shadow-none"
        >
          {isSyncing && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          {isSyncing ? "Syncing..." : "Sync Up"}
        </button>
        {isSyncing && (
          <div className="mx-auto mt-4 w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left dark:border-slate-700 dark:bg-slate-800/60">
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-700 ease-out dark:bg-teal-400"
                style={{ width: `${((syncStep + 1) / SYNC_STEPS.length) * 100}%` }}
              />
            </div>
            <p className="text-xs font-medium text-ink">{SYNC_STEPS[syncStep]}</p>
          </div>
        )}
      </div>
      </>
    );
  }

  return (
    <>
      <TopProgressBar isLoading={isSyncing} />
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-end">
        <div className="theme-panel rounded-[1.5rem] px-5 py-4 shadow-panel">
          {dashboardSelector}
        </div>

        <label className="theme-panel flex rounded-[1.5rem] px-5 py-4 shadow-panel">
          <div className="flex w-full flex-col gap-2">
            <span className="theme-muted text-sm font-medium">Search lectures</span>
            <div className="theme-input flex h-11 w-full items-center gap-3 rounded-2xl px-4 text-ink focus-within:border-brand focus-within:ring-2 focus-within:ring-teal-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4 flex-shrink-0 text-slate-400"
                aria-hidden="true"
              >
                <path d="m21 21-4.3-4.3" />
                <circle cx="11" cy="11" r="8" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by lecture name, ID, batch, or module"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Clear lecture search"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        </label>
      </section>

      <ConfiguredBatchFilter
        batches={batches}
        batchAccentMap={batchAccentMap}
        batchFilter={batchFilter}
        lectureCounts={lectureCounts}
        onSelect={setBatchFilter}
      />

      <SummaryOverview summary={summary} />

      <section className="theme-panel rounded-3xl p-6 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Compliance Dashboard
            </p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-ink">
              Lecture resources across every batch
            </h2>
          </div>

          <div className="w-full lg:max-w-[940px]">
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
              <div className="flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowTodayTodo((current) => !current)}
                  className="group inline-flex h-11 w-full items-center justify-center rounded-2xl border border-fuchsia-300/70 bg-gradient-to-r from-fuchsia-100 via-violet-50 to-cyan-50 px-4 text-sm font-semibold text-slate-800 shadow-[0_10px_30px_rgba(124,58,237,0.12)] backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-fuchsia-400/80 hover:from-fuchsia-200 hover:via-violet-100 hover:to-cyan-100 hover:text-slate-900 hover:shadow-[0_18px_36px_rgba(124,58,237,0.2)] dark:border-fuchsia-400/40 dark:from-fuchsia-500/15 dark:via-violet-500/15 dark:to-cyan-400/15 dark:text-white dark:hover:border-fuchsia-300/60 dark:hover:from-fuchsia-500/25 dark:hover:via-violet-500/25 dark:hover:to-cyan-400/25 dark:hover:text-white dark:hover:shadow-[0_18px_36px_rgba(124,58,237,0.28)]"
                >
                  <span className="mr-2 text-sm text-fuchsia-600 transition group-hover:scale-110 dark:text-white">✦</span>
                  {showTodayTodo ? "Hide today's to do list" : "Today's to do list"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowTodayLectures((current) => !current)}
                  className="group inline-flex h-11 w-full items-center justify-center rounded-2xl border border-cyan-300/70 bg-gradient-to-r from-cyan-100 via-teal-50 to-emerald-50 px-4 text-sm font-semibold text-slate-800 shadow-[0_10px_30px_rgba(20,184,166,0.12)] backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/80 hover:from-cyan-200 hover:via-teal-100 hover:to-emerald-100 hover:text-slate-900 hover:shadow-[0_18px_36px_rgba(20,184,166,0.2)] dark:border-cyan-400/40 dark:from-cyan-500/15 dark:via-teal-500/15 dark:to-emerald-500/15 dark:text-white dark:hover:border-cyan-300/60 dark:hover:from-cyan-500/25 dark:hover:via-teal-500/25 dark:hover:to-emerald-500/25 dark:hover:text-white dark:hover:shadow-[0_18px_36px_rgba(20,184,166,0.24)]"
                >
                  <span className="mr-2 text-sm text-cyan-700 transition group-hover:scale-110 dark:text-white">☼</span>
                  {showTodayLectures ? "Hide today's session" : "Today's session"}
                </button>
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-end justify-start gap-3 lg:justify-end">
                  <button
                    type="button"
                    disabled={isPending || isSyncing}
                    onClick={handleSync}
                    className="inline-flex h-11 items-center gap-2 justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-brand dark:hover:bg-teal-500 dark:shadow-[0_0_16px_rgba(15,118,110,0.5)] dark:hover:shadow-[0_0_24px_rgba(15,118,110,0.7)] dark:disabled:bg-slate-700 dark:disabled:shadow-none"
                  >
                    {isSyncing && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    )}
                    {isSyncing ? "Syncing..." : "Sync Up"}
                  </button>

                  <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                    Batch
                    <select
                      value={batchFilter}
                      onChange={(event) => setBatchFilter(event.target.value)}
                      className="theme-input min-w-[180px] rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
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
                      className="theme-input min-w-[180px] rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                    >
                      {STATUS_FILTERS.map((status) => (
                        <option key={status} value={status}>
                          {status === "all" ? "All statuses" : status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="theme-muted flex flex-wrap items-end justify-start gap-3 text-sm font-medium lg:justify-end">
                  <span className="pb-2">Week</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="theme-input w-[150px] rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  <span className="pb-2 text-slate-400 dark:text-slate-500">→</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="theme-input w-[150px] rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 transition hover:border-rose-300 hover:text-rose-500 dark:border-slate-600 dark:text-slate-500 dark:hover:border-rose-700 dark:hover:text-rose-400"
                      title="Clear date filter"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Sync feedback banner (error only — success triggers reload) */}

                {/* Sync feedback banner */}
                {!isSyncing && message && (
                  <div
                    className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                      syncStatus === "error"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    }`}
                  >
                    <span className="mt-px shrink-0 text-base leading-none">
                      {syncStatus === "error" ? "✗" : "✓"}
                    </span>
                    <span>{message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

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
                                    <p className="theme-muted mt-1 text-xs font-medium uppercase tracking-[0.12em]">
                                      Lecture ID: <span className="text-brand">{task.displayLectureId}</span>
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
                                <span className="font-semibold">{task.lectureName}</span>{" "}
                                <span className="text-emerald-700/80 dark:text-emerald-300/80">
                                  (Lecture ID: {task.displayLectureId})
                                </span>{" "}
                                • {TASK_LABELS[task.taskType]} done
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

        {showTodayLectures ? (
          <div className="mt-6 rounded-3xl border border-cyan-200/30 bg-gradient-to-br from-cyan-500/10 via-slate-900/10 to-emerald-500/10 p-5 dark:border-cyan-500/20 dark:from-cyan-500/10 dark:via-slate-900/40 dark:to-emerald-500/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300 dark:text-cyan-300">
                  Today's session
                </p>
                <h3 className="mt-2 font-[var(--font-heading)] text-xl font-bold text-ink">
                  Lectures scheduled today
                </h3>
                <p className="theme-muted mt-1 text-sm">
                  {DateTime.now().setZone(APP_TIMEZONE).toFormat("dd LLL yyyy")} • filtered from the current dashboard view
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-300/30 bg-white/5 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                  Scheduled today
                </p>
                <p className="mt-2 text-2xl font-bold text-white">{todayLectures.length}</p>
              </div>
            </div>

            {groupedTodayLectures.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300/30 bg-white/5 px-5 py-6 text-sm text-slate-300">
                No lectures are scheduled today for the current dashboard filters.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {groupedTodayLectures.map(([batchName, batchLectures]) => (
                  <div
                    key={batchName}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                      {batchName}
                    </p>
                    <div className="mt-3 space-y-3">
                      {batchLectures.map((lecture) => (
                        <div
                          key={lecture.id}
                          className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-slate-950/20 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div>
                            <p className="font-semibold text-white">{lecture.lecture_name}</p>
                            <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                              Lecture ID: <span className="text-cyan-300">{getDisplayLectureId(lecture)}</span>
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                              <p>{formatLectureDate(lecture.lecture_date)}</p>
                              <p className="mt-1 font-semibold text-white">{formatLectureTime(lecture.start_time)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {lecture.tasks.preread ? <StatusPill task={lecture.tasks.preread} /> : null}
                              {lecture.tasks.notes ? <StatusPill task={lecture.tasks.notes} /> : null}
                              {lecture.tasks.assignment ? <StatusPill task={lecture.tasks.assignment} /> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
                className="batch-accent-card theme-subpanel overflow-hidden rounded-3xl"
                style={batchAccentStyle(batchAccentMap.get(batchName) ?? batchAccentRgb(0, 1))}
              >
                <div className="batch-accent-header theme-subpanel-header px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Batch
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h3 className="font-[var(--font-heading)] text-xl font-bold text-ink">
                      {batchName}
                    </h3>
                    <span className="batch-accent-pill rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                      configured
                    </span>
                  </div>
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

    {/* Full-screen sync overlay */}
    {isSyncing && (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-300 border-t-teal-600 dark:border-teal-600 dark:border-t-teal-300" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">
              Syncing…
            </span>
          </div>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-700 ease-out dark:bg-teal-400"
              style={{ width: `${((syncStep + 1) / SYNC_STEPS.length) * 100}%` }}
            />
          </div>
          <ol className="space-y-2">
            {SYNC_STEPS.map((label, index) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                {index < syncStep ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold text-white dark:bg-teal-400">✓</span>
                ) : index === syncStep ? (
                  <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-teal-300 border-t-teal-600 dark:border-teal-600 dark:border-t-teal-300" />
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" />
                )}
                <span className={
                  index < syncStep
                    ? "text-teal-600 line-through dark:text-teal-400"
                    : index === syncStep
                    ? "font-semibold text-ink"
                    : "text-slate-400 dark:text-slate-500"
                }>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )}
    </>
  );
}
