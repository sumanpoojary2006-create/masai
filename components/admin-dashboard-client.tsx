"use client";

import { useState } from "react";

import { formatLectureDate, formatLectureTime } from "@/lib/deadlines";
import { AdminBatchStats, AdminLectureStats, AdminUserStats } from "@/lib/queries";
import { TaskStatus } from "@/lib/types";

const TABS = ["Overview", "Leaderboard", "Batches", "Lectures", "Reports"] as const;
type Tab = (typeof TABS)[number];

interface ExportedData {
  leaderboardCsv?: string;
  batchCsv?: string;
  lectureCsv?: string;
  error?: string;
}

function buildLeaderboard(users: AdminUserStats[]) {
  return [...users].sort((a, b) => {
    const aScore = a.completedTasks / (a.totalLectures * 3) || 0;
    const bScore = b.completedTasks / (b.totalLectures * 3) || 0;
    return bScore - aScore;
  });
}

function getRankStyle(rank: number) {
  if (rank === 1) return "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100";
  if (rank === 2) return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  if (rank === 3) return "bg-orange-50 text-orange-700 dark:bg-orange-900 dark:text-orange-200";
  return "bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500";
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
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [batchFilter, setBatchFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const batches = [...new Set(lectureStats.map((l) => l.batchName))].sort();
  const filteredLectures = lectureStats.filter((lecture) => {
    const batchMatches = batchFilter === "all" || lecture.batchName === batchFilter;
    const dateFromMatches = !dateFrom || lecture.lectureDate >= dateFrom;
    const dateToMatches = !dateTo || lecture.lectureDate <= dateTo;
    return batchMatches && dateFromMatches && dateToMatches;
  });

  const leaderboard = buildLeaderboard(userStats);

  function renderStatus(status: TaskStatus | null) {
    if (!status) {
      return <span className="text-xs text-slate-400">N/A</span>;
    }
    const classes =
      status === "completed"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-800"
        : status === "pending"
        ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-800"
        : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:ring-rose-800";
    return (
      <span
        className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${classes}`}
      >
        {status}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <section className="theme-panel rounded-3xl p-2">
        <div className="flex gap-2 overflow-x-auto px-2 pt-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === tab
                  ? "bg-brand text-white"
                  : "theme-button-secondary text-ink hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Overview" && (
          <div className="p-5">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="theme-subpanel rounded-3xl p-5">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">
                  Top Performers
                </h3>
                <div className="mt-4 space-y-3">
                  {leaderboard.slice(0, 5).map((user, index) => {
                    const score = user.totalLectures > 0
                      ? Math.round((user.completedTasks / (user.totalLectures * 3)) * 100)
                      : 0;
                    return (
                      <div key={user.userId} className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${getRankStyle(index + 1)}`}
                        >
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-ink">{user.email}</p>
                          <p className="text-xs text-slate-500">
                            {user.batchConfigs.map((c) => c.batch_name).join(", ")}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-emerald-600">
                          {score}%
                        </span>
                      </div>
                    );
                  })}
                  {leaderboard.length === 0 && (
                    <p className="theme-muted text-sm">No user data available.</p>
                  )}
                </div>
              </div>

              <div className="theme-subpanel rounded-3xl p-5">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">
                  Batch Overview
                </h3>
                <div className="mt-4 space-y-3">
                  {batchStats.slice(0, 5).map((batch) => {
                    const total = batch.completedTasks + batch.pendingTasks + batch.missedTasks;
                    const pct = total > 0 ? Math.round((batch.completedTasks / total) * 100) : 0;
                    return (
                      <div key={batch.batchName}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-ink">{batch.batchName}</p>
                          <span className="text-sm font-bold text-slate-500">{pct}%</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {batch.completedTasks} / {total} tasks
                        </p>
                      </div>
                    );
                  })}
                  {batchStats.length === 0 && (
                    <p className="theme-muted text-sm">No batch data available.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Leaderboard" && (
          <div className="p-5">
            <div className="theme-subpanel overflow-hidden rounded-3xl">
              <div className="px-5 py-4">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">
                  User Leaderboard
                </h3>
                <p className="theme-muted mt-1 text-sm">
                  Ranked by completion rate (completed tasks / total tasks)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <th className="w-[10%] pb-3 pl-5 pr-4 pt-3">Rank</th>
                      <th className="w-[35%] pb-3 pr-4 pt-3">User</th>
                      <th className="w-[20%] pb-3 pr-4 pt-3">Batches</th>
                      <th className="w-[10%] pb-3 pr-4 pt-3 text-center">Lectures</th>
                      <th className="w-[8%] pb-3 pr-4 pt-3 text-center text-emerald-600">Done</th>
                      <th className="w-[8%] pb-3 pr-4 pt-3 text-center text-amber-600">Pend</th>
                      <th className="w-[9%] pb-3 pr-5 pt-3 text-center text-rose-600">Miss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80 dark:divide-slate-700/60">
                    {leaderboard.map((user, index) => {
                      const total = user.completedTasks + user.pendingTasks + user.missedTasks;
                      const score = total > 0
                        ? Math.round((user.completedTasks / total) * 100)
                        : 0;
                      return (
                        <tr key={user.userId} className="align-top">
                          <td className="py-4 pl-5 pr-4">
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${getRankStyle(index + 1)}`}
                            >
                              {index + 1}
                            </span>
                          </td>
                          <td className="py-4 pr-4">
                            <p className="font-semibold text-ink">{user.email}</p>
                          </td>
                          <td className="py-4 pr-4">
                            <p className="theme-muted text-sm">
                              {user.batchConfigs.map((c) => c.batch_name).join(", ")}
                            </p>
                          </td>
                          <td className="py-4 pr-4 text-center">
                            <p className="font-semibold text-ink">{user.totalLectures}</p>
                          </td>
                          <td className="py-4 pr-4 text-center">
                            <p className="font-semibold text-emerald-600">{user.completedTasks}</p>
                          </td>
                          <td className="py-4 pr-4 text-center">
                            <p className="font-semibold text-amber-600">{user.pendingTasks}</p>
                          </td>
                          <td className="py-4 pr-5 text-center">
                            <p className="font-semibold text-rose-600">{user.missedTasks}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {leaderboard.length === 0 && (
                <div className="p-8 text-center">
                  <p className="theme-muted text-sm">No user data available.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "Batches" && (
          <div className="p-5">
            <div className="theme-subpanel overflow-hidden rounded-3xl">
              <div className="px-5 py-4">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">
                  Batch Analytics
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <th className="w-[30%] pb-3 pl-5 pr-4 pt-3">Batch</th>
                      <th className="w-[15%] pb-3 pr-4 pt-3 text-center">Lectures</th>
                      <th className="w-[14%] pb-3 pr-4 pt-3 text-center text-emerald-600">Completed</th>
                      <th className="w-[14%] pb-3 pr-4 pt-3 text-center text-amber-600">Pending</th>
                      <th className="w-[14%] pb-3 pr-5 pt-3 text-center text-rose-600">Missed</th>
                      <th className="w-[13%] pb-3 pt-3 text-right pr-5">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80 dark:divide-slate-700/60">
                    {batchStats.map((batch) => {
                      const total = batch.completedTasks + batch.pendingTasks + batch.missedTasks;
                      const rate = total > 0 ? Math.round((batch.completedTasks / total) * 100) : 0;
                      return (
                        <tr key={batch.batchName} className="align-top">
                          <td className="py-4 pl-5 pr-4">
                            <p className="font-semibold text-ink">{batch.batchName}</p>
                          </td>
                          <td className="py-4 pr-4 text-center">
                            <p className="font-semibold text-ink">{batch.lectureCount}</p>
                          </td>
                          <td className="py-4 pr-4 text-center">
                            <p className="font-semibold text-emerald-600">{batch.completedTasks}</p>
                          </td>
                          <td className="py-4 pr-4 text-center">
                            <p className="font-semibold text-amber-600">{batch.pendingTasks}</p>
                          </td>
                          <td className="py-4 pr-5 text-center">
                            <p className="font-semibold text-rose-600">{batch.missedTasks}</p>
                          </td>
                          <td className="py-4 pr-5 text-right">
                            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {batchStats.length === 0 && (
                <div className="p-8 text-center">
                  <p className="theme-muted text-sm">No batch data available.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "Lectures" && (
          <div className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                Batch
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
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

              <div className="theme-muted flex flex-col gap-2 text-sm font-medium">
                Week
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      onClick={() => { setDateFrom(""); setDateTo(""); }}
                      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 transition hover:border-rose-300 hover:text-rose-500 dark:border-slate-600 dark:text-slate-500 dark:hover:border-rose-700 dark:hover:text-rose-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 theme-subpanel overflow-hidden rounded-3xl">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <th className="w-[25%] pb-3 pl-5 pr-4 pt-3">Lecture</th>
                      <th className="w-[12%] pb-3 pr-4 pt-3">Batch</th>
                      <th className="w-[12%] pb-3 pr-4 pt-3">Schedule</th>
                      <th className="w-[15%] pb-3 pr-4 pt-3 text-center">Pre-read</th>
                      <th className="w-[15%] pb-3 pr-4 pt-3 text-center">Notes</th>
                      <th className="w-[15%] pb-3 pr-5 pt-3 text-center">Assignment</th>
                      <th className="w-[6%] pb-3 pt-3">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80 dark:divide-slate-700/60">
                    {filteredLectures.map((lecture) => (
                      <tr key={lecture.id} className="align-top">
                        <td className="py-4 pl-5 pr-4">
                          <p className="font-semibold text-ink">{lecture.lectureName}</p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className="theme-muted text-sm">{lecture.batchName}</p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className="theme-muted text-sm">{formatLectureDate(lecture.lectureDate)}</p>
                          <p className="theme-muted text-xs">
                            {formatLectureTime(lecture.startTime)}
                          </p>
                        </td>
                        <td className="py-4 pr-4 text-center">
                          {renderStatus(lecture.prereadStatus)}
                        </td>
                        <td className="py-4 pr-4 text-center">
                          {renderStatus(lecture.notesStatus)}
                        </td>
                        <td className="py-4 pr-5 text-center">
                          {renderStatus(lecture.assignmentStatus)}
                        </td>
                        <td className="py-4">
                          <p className="theme-muted text-xs" title={lecture.userEmail}>
                            {lecture.userEmail.split("@")[0]}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredLectures.length === 0 && (
                <div className="p-8 text-center">
                  <p className="theme-muted text-sm">
                    No lectures found. Try a different filter.
                  </p>
                </div>
              )}
            </div>

            <p className="theme-muted mt-4 text-sm text-right">
              Showing {filteredLectures.length} of {lectureStats.length} lectures
            </p>
          </div>
        )}

        {activeTab === "Reports" && (
          <ReportsTab />
        )}
      </section>
    </div>
  );
}

function ReportsTab() {
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport(reportType: "leaderboard" | "batch" | "lecture" | "all") {
    setIsExporting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/export", { method: "GET" });
      const data = (await response.json()) as ExportedData;

      if (!response.ok) {
        setMessage(data.error ?? "Export failed");
        setIsExporting(false);
        return;
      }

      let filename = "";
      let content = "";

      switch (reportType) {
        case "leaderboard":
          filename = "leaderboard.csv";
          content = data.leaderboardCsv ?? "";
          break;
        case "batch":
          filename = "batch-report.csv";
          content = data.batchCsv ?? "";
          break;
        case "lecture":
          filename = "lecture-report.csv";
          content = data.lectureCsv ?? "";
          break;
        case "all":
          filename = "admin-report.csv";
          content = [
            "# LEADERBOARD",
            data.leaderboardCsv ?? "",
            "",
            "# BATCHES",
            data.batchCsv ?? "",
            "",
            "# LECTURES",
            data.lectureCsv ?? ""
          ].join("\n\n");
          break;
      }

      const blob = new Blob([content], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage(`Exported ${filename}`);
    } catch {
      setMessage("Export failed");
    }

    setIsExporting(false);
  }

  return (
    <div className="space-y-6 p-5">
      <div className="theme-subpanel rounded-3xl p-5">
        <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">
          Export Reports
        </h3>
        <p className="theme-muted mt-1 text-sm">
          Download CSV reports for offline analysis
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("leaderboard")}
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed"
          >
            Leaderboard CSV
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("batch")}
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed"
          >
            Batch Report CSV
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("lecture")}
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed"
          >
            Lecture Report CSV
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("all")}
            className="theme-button-primary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed"
          >
            Full Report (All)
          </button>
        </div>

        {message && <p className="theme-muted mt-4 text-sm">{message}</p>}
      </div>
    </div>
  );
}