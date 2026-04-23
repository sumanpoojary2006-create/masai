"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";

import { formatLectureDate, formatLectureTime } from "@/lib/deadlines";
import { AdminBatchStats, AdminLectureStats, AdminUserStats } from "@/lib/queries";
import { TaskStatus } from "@/lib/types";

type ExportedData = {
  leaderboardCsv?: string;
  batchCsv?: string;
  lectureCsv?: string;
  error?: string;
};

type NavKey = "overview" | "health" | "batches" | "attention" | "exports";

const NAV_ITEMS: Array<{ key: NavKey; label: string }> = [
  { key: "overview", label: "Dashboard" },
  { key: "health", label: "Task Health" },
  { key: "batches", label: "Batches" },
  { key: "attention", label: "Attention" },
  { key: "exports", label: "Reports" }
];

const STATUS_ACCENTS: Record<TaskStatus, string> = {
  completed: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
  pending: "bg-amber-500/15 text-amber-200 ring-amber-400/20",
  missed: "bg-rose-500/15 text-rose-200 ring-rose-400/20"
};

function getWeekBounds() {
  const today = DateTime.now().setZone("Asia/Kolkata");
  return {
    from: today.startOf("week").toISODate() ?? "",
    to: today.endOf("week").toISODate() ?? ""
  };
}

function getTaskStatuses(lecture: AdminLectureStats) {
  return [lecture.prereadStatus, lecture.notesStatus, lecture.assignmentStatus].filter(
    Boolean
  ) as TaskStatus[];
}

function buildLeaderboard(users: AdminUserStats[]) {
  return [...users].sort((left, right) => {
    const leftTotal = (left.onTimeCount || 0) + (left.lateCount || 0);
    const rightTotal = (right.onTimeCount || 0) + (right.lateCount || 0);
    const leftScore = leftTotal > 0 ? (left.onTimeCount || 0) / leftTotal : 0;
    const rightScore = rightTotal > 0 ? (right.onTimeCount || 0) / rightTotal : 0;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return right.completedTasks - left.completedTasks;
  });
}

function Sparkline({
  values,
  color,
  className = "h-12 w-full"
}: {
  values: number[];
  color: string;
  className?: string;
}) {
  const points = useMemo(() => {
    if (values.length === 0) return "";
    const max = Math.max(...values, 1);
    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = 100 - (value / max) * 80 - 10;
        return `${x},${y}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg viewBox="0 0 100 100" className={className} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function RingMeter({
  completed,
  pending,
  missed
}: {
  completed: number;
  pending: number;
  missed: number;
}) {
  const total = Math.max(completed + pending + missed, 1);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const completedLength = (completed / total) * circumference;
  const pendingLength = (pending / total) * circumference;
  const missedLength = (missed / total) * circumference;

  return (
    <div className="relative h-56 w-56">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth="12"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#34d399"
          strokeWidth="12"
          strokeDasharray={`${completedLength} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="12"
          strokeDasharray={`${pendingLength} ${circumference}`}
          strokeDashoffset={-completedLength}
          strokeLinecap="round"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="12"
          strokeDasharray={`${missedLength} ${circumference}`}
          strokeDashoffset={-(completedLength + pendingLength)}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-4xl font-bold text-white">{Math.round((completed / total) * 100)}%</p>
        <p className="text-sm text-slate-400">completion</p>
      </div>
    </div>
  );
}

function ActivityBars({
  labels,
  completed,
  open
}: {
  labels: string[];
  completed: number[];
  open: number[];
}) {
  const max = Math.max(...completed, ...open, 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-3">
        {labels.map((label, index) => (
          <div key={label} className="flex flex-col items-center gap-3">
            <div className="flex h-40 items-end gap-2">
              <div
                className="w-3 rounded-full bg-sky-400/90"
                style={{ height: `${Math.max((completed[index] / max) * 100, 6)}%` }}
              />
              <div
                className="w-3 rounded-full bg-violet-500/90"
                style={{ height: `${Math.max((open[index] / max) * 100, 6)}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-6 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
          Completed
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          Open items
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  accent,
  sparkline,
  badge
}: {
  label: string;
  value: string;
  note: string;
  accent: string;
  sparkline: number[];
  badge: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/8 bg-slate-900/70 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.35)]">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300">{label}</p>
          <p className="mt-3 text-5xl font-bold tracking-tight text-white">{value}</p>
          <p className="mt-2 text-sm text-slate-400">{note}</p>
        </div>
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-semibold text-white"
          style={{ background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}44` }}
        >
          {badge}
        </div>
      </div>
      <div className="mt-6">
        <Sparkline values={sparkline} color={accent} />
      </div>
    </div>
  );
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminDashboardClient({
  userStats,
  batchStats,
  lectureStats
}: {
  userStats: AdminUserStats[];
  batchStats: AdminBatchStats[];
  lectureStats: AdminLectureStats[];
}) {
  const router = useRouter();
  const defaultWeek = useMemo(() => getWeekBounds(), []);
  const [dateFrom, setDateFrom] = useState(defaultWeek.from);
  const [dateTo, setDateTo] = useState(defaultWeek.to);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [autoRefresh, router]);

  const filteredLectures = useMemo(() => {
    return lectureStats.filter((lecture) => {
      const fromMatches = !dateFrom || lecture.lectureDate >= dateFrom;
      const toMatches = !dateTo || lecture.lectureDate <= dateTo;
      return fromMatches && toMatches;
    });
  }, [dateFrom, dateTo, lectureStats]);

  const lectureBatches = useMemo(
    () => [...new Set(filteredLectures.map((lecture) => lecture.batchName))].sort(),
    [filteredLectures]
  );

  const taskSummary = useMemo(() => {
    return filteredLectures.reduce(
      (accumulator, lecture) => {
        for (const status of getTaskStatuses(lecture)) {
          if (status === "completed") accumulator.completed += 1;
          if (status === "pending") accumulator.pending += 1;
          if (status === "missed") accumulator.missed += 1;
        }
        return accumulator;
      },
      { completed: 0, pending: 0, missed: 0 }
    );
  }, [filteredLectures]);

  const totalTrackedTasks = taskSummary.completed + taskSummary.pending + taskSummary.missed;
  const completionRate =
    totalTrackedTasks > 0 ? (taskSummary.completed / totalTrackedTasks) * 100 : 0;

  const activeUsers = useMemo(
    () => new Set(filteredLectures.map((lecture) => lecture.userEmail)).size,
    [filteredLectures]
  );

  const recentDates = useMemo(() => {
    const allDates = [...new Set(lectureStats.map((lecture) => lecture.lectureDate))]
      .sort()
      .slice(-7);

    return allDates;
  }, [lectureStats]);

  const activitySeries = useMemo(() => {
    return recentDates.map((date) => {
      const lecturesForDate = lectureStats.filter((lecture) => lecture.lectureDate === date);
      const statuses = lecturesForDate.flatMap(getTaskStatuses);
      return {
        label: DateTime.fromISO(date).toFormat("LLL dd"),
        completed: statuses.filter((status) => status === "completed").length,
        open: statuses.filter((status) => status !== "completed").length
      };
    });
  }, [lectureStats, recentDates]);

  const leaderboard = useMemo(() => buildLeaderboard(userStats).slice(0, 5), [userStats]);

  const batchPerformance = useMemo(() => {
    const ownerLookup = new Map<string, string>();
    for (const lecture of lectureStats) {
      if (!ownerLookup.has(lecture.batchName)) {
        ownerLookup.set(lecture.batchName, lecture.userEmail);
      }
    }

    return lectureBatches.map((batchName) => {
      const lectures = filteredLectures.filter((lecture) => lecture.batchName === batchName);
      const statuses = lectures.flatMap(getTaskStatuses);
      const completed = statuses.filter((status) => status === "completed").length;
      const pending = statuses.filter((status) => status === "pending").length;
      const missed = statuses.filter((status) => status === "missed").length;
      const total = Math.max(completed + pending + missed, 1);

      return {
        batchName,
        owner: ownerLookup.get(batchName) ?? "Unknown",
        lectureCount: lectures.length,
        completed,
        pending,
        missed,
        rate: Math.round((completed / total) * 100)
      };
    });
  }, [filteredLectures, lectureBatches, lectureStats]);

  const attentionLectures = useMemo(() => {
    return [...filteredLectures]
      .map((lecture) => {
        const statuses = getTaskStatuses(lecture);
        const missedCount = statuses.filter((status) => status === "missed").length;
        const pendingCount = statuses.filter((status) => status === "pending").length;
        return {
          ...lecture,
          missedCount,
          pendingCount,
          score: missedCount * 3 + pendingCount
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.lectureDate.localeCompare(right.lectureDate);
      })
      .slice(0, 5);
  }, [filteredLectures]);

  async function handleExport() {
    setIsExporting(true);
    setExportMessage(null);

    try {
      const response = await fetch("/api/admin/export", { method: "GET" });
      const payload = (await response.json()) as ExportedData;

      if (!response.ok) {
        setExportMessage(payload.error ?? "Export failed.");
        setIsExporting(false);
        return;
      }

      const bundle = [
        "# LEADERBOARD",
        payload.leaderboardCsv ?? "",
        "",
        "# BATCHES",
        payload.batchCsv ?? "",
        "",
        "# LECTURES",
        payload.lectureCsv ?? ""
      ].join("\n");

      downloadCsv("masailens-admin-report.csv", bundle);
      setExportMessage("Exported masailens-admin-report.csv");
    } catch {
      setExportMessage("Export failed.");
    }

    setIsExporting(false);
  }

  function scrollToSection(sectionId: NavKey) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-5 sm:px-6 xl:px-8">
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-72 flex-col justify-between rounded-[30px] border border-white/8 bg-[#10162a] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)] xl:flex">
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-500 text-lg font-bold">
                M
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight text-white">MasaiLens</p>
                <p className="mt-1 inline-flex rounded-full bg-white/6 px-2.5 py-1 text-xs text-slate-300">
                  Admin Console
                </p>
              </div>
            </div>

            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => scrollToSection(item.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    item.key === "overview"
                      ? "bg-gradient-to-r from-violet-600 to-indigo-500 text-white shadow-[0_12px_32px_rgba(79,70,229,0.35)]"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-xs font-semibold">
                    {item.label.slice(0, 1)}
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="rounded-[26px] border border-white/8 bg-gradient-to-b from-[#121b34] to-[#0f1730] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">System Status</p>
                  <p className="mt-1 text-xs text-slate-400">Live platform health</p>
                </div>
                <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/6 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Users</p>
                  <p className="mt-2 text-2xl font-bold text-white">{userStats.length}</p>
                </div>
                <div className="rounded-2xl bg-white/6 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Batches</p>
                  <p className="mt-2 text-2xl font-bold text-white">{batchStats.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/8 bg-[#0b1329] p-4">
            <p className="text-sm font-semibold text-white">Admin User</p>
            <p className="mt-1 text-xs text-slate-400">Super administrator access</p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
            >
              Go to main dashboard
            </Link>
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          <section
            id="overview"
            className="rounded-[34px] border border-white/8 bg-[#10162a] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-6"
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-teal-300/70">Masai admin intelligence</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Welcome back, Admin.
                </h1>
                <p className="mt-3 max-w-2xl text-base text-slate-400">
                  A live view of platform operations, batch health, and lecture compliance
                  across all active owners.
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-end">
                <div className="flex flex-col gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Date range</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-[#0b1329] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400"
                    />
                    <span className="text-slate-500">→</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(event) => setDateTo(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-[#0b1329] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoRefresh((current) => !current)}
                  className="inline-flex h-12 items-center rounded-2xl border border-white/10 bg-[#0b1329] px-5 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                >
                  Auto refresh: <span className="ml-1 text-emerald-300">{autoRefresh ? "On" : "Off"}</span>
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExport}
                  className="inline-flex h-12 items-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-500 px-5 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(79,70,229,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isExporting ? "Exporting..." : "Export"}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Logged Users"
                value={`${userStats.length}`}
                note={`${userStats.filter((user) => user.totalLectures > 0).length} owners with activity`}
                accent="#8b5cf6"
                sparkline={activitySeries.map((item) => item.completed + item.open)}
                badge="US"
              />
              <MetricCard
                label="Active Users (Range)"
                value={`${activeUsers}`}
                note={`${filteredLectures.length} lectures in selected window`}
                accent="#38bdf8"
                sparkline={activitySeries.map((item) => item.completed)}
                badge="AC"
              />
              <MetricCard
                label="Running Batches"
                value={`${lectureBatches.length}`}
                note={`${batchPerformance.filter((batch) => batch.pending === 0 && batch.missed === 0).length} fully on track`}
                accent="#2dd4bf"
                sparkline={activitySeries.map((item) => item.open)}
                badge="BT"
              />
              <MetricCard
                label="Platform Performance"
                value={`${completionRate.toFixed(1)}%`}
                note={`${taskSummary.completed} of ${totalTrackedTasks} tracked tasks completed`}
                accent="#fbbf24"
                sparkline={activitySeries.map((item) => item.completed)}
                badge="PF"
              />
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
            <section
              id="health"
              className="rounded-[32px] border border-white/8 bg-[#10162a] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Task health overview</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Completion mix and recent activity in the selected range.
                  </p>
                </div>
                <div className="rounded-full border border-white/8 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                  {filteredLectures.length} lectures
                </div>
              </div>

              <div className="mt-8 grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="flex flex-col items-center justify-center gap-5 rounded-[28px] border border-white/8 bg-[#0b1329] p-6">
                  <RingMeter
                    completed={taskSummary.completed}
                    pending={taskSummary.pending}
                    missed={taskSummary.missed}
                  />
                  <div className="grid w-full grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-emerald-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-300">{taskSummary.completed}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-200/80">Done</p>
                    </div>
                    <div className="rounded-2xl bg-sky-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-sky-300">{taskSummary.pending}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-sky-200/80">Open</p>
                    </div>
                    <div className="rounded-2xl bg-amber-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-amber-300">{taskSummary.missed}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-amber-200/80">Missed</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/8 bg-[#0b1329] p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-white">User activity overview</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Daily completed vs open tasks over the latest seven lecture dates.
                      </p>
                    </div>
                  </div>
                  <div className="mt-8">
                    <ActivityBars
                      labels={activitySeries.map((item) => item.label)}
                      completed={activitySeries.map((item) => item.completed)}
                      open={activitySeries.map((item) => item.open)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section
              className="rounded-[32px] border border-white/8 bg-[#10162a] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Leaderboard</p>
                  <p className="mt-1 text-sm text-slate-400">Ranked by on-time completion consistency.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-2 text-sm text-slate-300">
                  Top 5
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {leaderboard.map((user, index) => {
                  const total = (user.onTimeCount || 0) + (user.lateCount || 0);
                  const consistency = total > 0 ? Math.round(((user.onTimeCount || 0) / total) * 100) : 0;
                  return (
                    <div
                      key={user.userId}
                      className="flex items-center gap-4 rounded-[24px] border border-white/8 bg-[#0b1329] px-4 py-4"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-sm font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{user.email}</p>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {(user.batchConfigs || []).map((config) => config.batch_name).join(", ") || "No configured batch"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-white">{consistency}%</p>
                        <p className="text-xs text-slate-400">{user.completedTasks} completed</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
            <section
              id="batches"
              className="rounded-[32px] border border-white/8 bg-[#10162a] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Running batches</p>
                  <p className="mt-1 text-sm text-slate-400">Operational pulse for every batch in scope.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-2 text-sm text-slate-300">
                  {batchPerformance.length} active
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-[26px] border border-white/8 bg-[#0b1329]">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                      <th className="px-4 py-4 font-medium">Batch</th>
                      <th className="px-4 py-4 font-medium">Owner</th>
                      <th className="px-4 py-4 font-medium">Lectures</th>
                      <th className="px-4 py-4 font-medium">Progress</th>
                      <th className="px-4 py-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchPerformance.map((batch) => {
                      const health =
                        batch.missed > 0 ? "Needs attention" : batch.pending > 0 ? "In progress" : "On track";

                      return (
                        <tr key={batch.batchName} className="border-t border-white/6 text-sm text-slate-200">
                          <td className="px-4 py-4">
                            <p className="font-semibold text-white">{batch.batchName}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-300">{batch.owner}</td>
                          <td className="px-4 py-4 font-semibold text-white">{batch.lectureCount}</td>
                          <td className="px-4 py-4">
                            <div className="space-y-2">
                              <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-400"
                                  style={{ width: `${batch.rate}%` }}
                                />
                              </div>
                              <p className="text-xs text-slate-400">{batch.rate}% completed</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                batch.missed > 0
                                  ? "bg-amber-500/15 text-amber-200"
                                  : batch.pending > 0
                                    ? "bg-sky-500/15 text-sky-200"
                                    : "bg-emerald-500/15 text-emerald-200"
                              }`}
                            >
                              {health}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              id="attention"
              className="rounded-[32px] border border-white/8 bg-[#10162a] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Needs attention</p>
                  <p className="mt-1 text-sm text-slate-400">Lectures with the highest unresolved pressure.</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {attentionLectures.map((lecture) => (
                  <div
                    key={lecture.id}
                    className="rounded-[24px] border border-white/8 bg-[#0b1329] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{lecture.lectureName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {lecture.batchName} • {formatLectureDate(lecture.lectureDate)} • {formatLectureTime(lecture.startTime)}
                        </p>
                      </div>
                      <div className="rounded-full bg-white/6 px-3 py-1 text-xs text-slate-300">
                        {lecture.userEmail}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lecture.prereadStatus ? (
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_ACCENTS[lecture.prereadStatus]}`}>
                          Pre-read {lecture.prereadStatus}
                        </span>
                      ) : null}
                      {lecture.notesStatus ? (
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_ACCENTS[lecture.notesStatus]}`}>
                          Notes {lecture.notesStatus}
                        </span>
                      ) : null}
                      {lecture.assignmentStatus ? (
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_ACCENTS[lecture.assignmentStatus]}`}>
                          Assignment {lecture.assignmentStatus}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <section
            id="exports"
            className="rounded-[32px] border border-white/8 bg-[#10162a] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Lecture ledger</p>
                <p className="mt-1 text-sm text-slate-400">
                  A quick ledger of the current filtered range, plus export for offline review.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-2 text-sm text-slate-300">
                  {filteredLectures.length} lectures in view
                </div>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExport}
                  className="inline-flex h-11 items-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-500 px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isExporting ? "Exporting..." : "Export report"}
                </button>
              </div>
            </div>

            {exportMessage ? (
              <p className="mt-4 text-sm text-slate-300">{exportMessage}</p>
            ) : null}

            <div className="mt-6 overflow-hidden rounded-[26px] border border-white/8 bg-[#0b1329]">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                    <th className="px-4 py-4 font-medium">Lecture</th>
                    <th className="px-4 py-4 font-medium">Batch</th>
                    <th className="px-4 py-4 font-medium">Schedule</th>
                    <th className="px-4 py-4 font-medium">Pre-read</th>
                    <th className="px-4 py-4 font-medium">Notes</th>
                    <th className="px-4 py-4 font-medium">Assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLectures.slice(0, 8).map((lecture) => (
                    <tr key={lecture.id} className="border-t border-white/6 text-sm text-slate-200">
                      <td className="px-4 py-4 font-semibold text-white">{lecture.lectureName}</td>
                      <td className="px-4 py-4 text-slate-300">{lecture.batchName}</td>
                      <td className="px-4 py-4 text-slate-300">
                        <p>{formatLectureDate(lecture.lectureDate)}</p>
                        <p className="mt-1 text-xs">{formatLectureTime(lecture.startTime)}</p>
                      </td>
                      <td className="px-4 py-4">
                        {lecture.prereadStatus ? (
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_ACCENTS[lecture.prereadStatus]}`}>
                            {lecture.prereadStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {lecture.notesStatus ? (
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_ACCENTS[lecture.notesStatus]}`}>
                            {lecture.notesStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {lecture.assignmentStatus ? (
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_ACCENTS[lecture.assignmentStatus]}`}>
                            {lecture.assignmentStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
