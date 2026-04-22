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
    const aTotal = a.onTimeCount + a.lateCount;
    const bTotal = b.onTimeCount + b.lateCount;
    if (aTotal === 0 && bTotal === 0) return 0;
    if (aTotal === 0) return 1;
    if (bTotal === 0) return -1;
    const aConsistency = a.onTimeCount / aTotal;
    const bConsistency = b.onTimeCount / bTotal;
    return bConsistency - aConsistency;
  });
}

function getRankStyle(rank: number) {
  if (rank === 1) return "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100";
  if (rank === 2) return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  if (rank === 3) return "bg-orange-50 text-orange-700 dark:bg-orange-900 dark:text-orange-200";
  return "bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500";
}

function ConsistencyChart({ onTime, late, total }: { onTime: number; late: number; total: number }) {
  if (total === 0) return null;
  const onTimePct = (onTime / total) * 100;
  const latePct = (late / total) * 100;
  return (
    <div className="flex h-3 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
      <div
        className="h-full bg-emerald-500 transition-all"
        style={{ width: `${onTimePct}%` }}
      />
      <div
        className="h-full bg-amber-400 transition-all"
        style={{ width: `${latePct}%` }}
      />
    </div>
  );
}

function BatchProgressBar({ completed, pending, missed, total }: { completed: number; pending: number; missed: number; total: number }) {
  if (total === 0) return null;
  const completedPct = (completed / total) * 100;
  const pendingPct = (pending / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
      <div
        className="h-full bg-emerald-500 transition-all"
        style={{ width: `${completedPct}%` }}
      />
      <div
        className="h-full bg-amber-400 transition-all"
        style={{ width: `${pendingPct}%` }}
      />
      <div
        className="h-full bg-rose-400 transition-all"
        style={{ width: `${(missed / total) * 100}%` }}
      />
    </div>
  );
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
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);

  const batches = [...new Set(lectureStats.map((l) => l.batchName))].sort();
  const filteredLectures = lectureStats.filter((lecture) => {
    const batchMatches = batchFilter === "all" || lecture.batchName === batchFilter;
    const dateFromMatches = !dateFrom || lecture.lectureDate >= dateFrom;
    const dateToMatches = !dateTo || lecture.lectureDate <= dateTo;
    return batchMatches && dateFromMatches && dateToMatches;
  });

  const leaderboard = buildLeaderboard(userStats);

  const overall = userStats.reduce(
    (acc, user) => {
      const total = user.completedTasks + user.pendingTasks + user.missedTasks;
      return {
        completed: acc.completed + user.completedTasks,
        pending: acc.pending + user.pendingTasks,
        missed: acc.missed + user.missedTasks,
        total: acc.total + total,
        users: acc.users + 1
      };
    },
    { completed: 0, pending: 0, missed: 0, total: 0, users: 0 }
  );

  function renderStatus(status: TaskStatus | null) {
    if (!status) return <span className="text-xs text-slate-400">N/A</span>;
    const classes =
      status === "completed"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : status === "pending"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";
    return (
      <span className={`inline-flex min-w-20 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${classes}`}>
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
          <div className="space-y-6 p-5">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="group relative theme-subpanel rounded-3xl p-5 transition hover:scale-[1.02]">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">User Performance</h3>
                <div className="mt-4 space-y-3">
                  {leaderboard.slice(0, 5).map((user, index) => {
                    const total = user.onTimeCount + user.lateCount;
                    const consistency = total > 0 ? Math.round((user.onTimeCount / total) * 100) : 0;
                    return (
                      <div
                        key={user.userId}
                        className="flex items-center gap-3"
                        onMouseEnter={() => setHoveredUser(user.userId)}
                        onMouseLeave={() => setHoveredUser(null)}
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${getRankStyle(index + 1)}`}>
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-ink truncate">{user.email.split("@")[0]}</p>
                          <ConsistencyChart
                            onTime={user.onTimeCount}
                            late={user.lateCount}
                            total={total}
                          />
                        </div>
                        <span className={`text-sm font-bold ${consistency >= 80 ? "text-emerald-600" : consistency >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                          {consistency}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                {hoveredUser && (
                  <div className="absolute right-4 top-4 theme-subpanel rounded-2xl p-3 text-xs">
                    {leaderboard.find((u) => u.userId === hoveredUser)?.email}
                  </div>
                )}
              </div>

              <div className="theme-subpanel rounded-3xl p-5">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">Batch Progress</h3>
                <div className="mt-4 space-y-4">
                  {batchStats.slice(0, 4).map((batch) => {
                    const total = batch.completedTasks + batch.pendingTasks + batch.missedTasks;
                    const pct = total > 0 ? Math.round((batch.completedTasks / total) * 100) : 0;
                    return (
                      <div key={batch.batchName}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-ink">{batch.batchName}</p>
                          <span className="text-xs text-slate-500">{pct}%</span>
                        </div>
                        <BatchProgressBar
                          completed={batch.completedTasks}
                          pending={batch.pendingTasks}
                          missed={batch.missedTasks}
                          total={total}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="theme-subpanel rounded-3xl p-5 flex flex-col justify-center items-center">
                <div className="relative w-40 h-40">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle
                      cx="50" cy="50" r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      className="text-slate-100 dark:text-slate-700"
                    />
                    <circle
                      cx="50" cy="50" r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeDasharray={`${(overall.completed / overall.total) * 251.2} 251.2`}
                      strokeLinecap="round"
                      className="text-emerald-500 transition-all duration-500"
                    />
                    <circle
                      cx="50" cy="50" r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeDasharray={`${(overall.pending / overall.total) * 251.2} 251.2`}
                      strokeDashoffset={`-${(overall.completed / overall.total) * 251.2}`}
                      strokeLinecap="round"
                      className="text-amber-400 transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-ink">
                      {overall.total > 0 ? Math.round((overall.completed / overall.total) * 100) : 0}%
                    </span>
                    <span className="text-xs text-slate-500">Completion</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-900/30">
                <p className="text-2xl font-bold text-emerald-600">{overall.completed}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Completed</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 text-center dark:bg-amber-900/30">
                <p className="text-2xl font-bold text-amber-600">{overall.pending}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">Pending</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4 text-center dark:bg-rose-900/30">
                <p className="text-2xl font-bold text-rose-600">{overall.missed}</p>
                <p className="text-xs text-rose-700 dark:text-rose-400">Missed</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Leaderboard" && (
          <div className="p-5">
            <div className="theme-subpanel overflow-hidden rounded-3xl">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">
                  Consistency Leaderboard
                </h3>
                <p className="theme-muted mt-1 text-sm">
                  Ranked by on-time completion rate
                </p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {leaderboard.map((user, index) => {
                  const total = user.onTimeCount + user.lateCount;
                  const consistency = total > 0 ? Math.round((user.onTimeCount / total) * 100) : 0;
                  return (
                    <div
                      key={user.userId}
                      className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${getRankStyle(index + 1)}`}>
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-ink">{user.email}</p>
                        <p className="text-xs text-slate-500">
                          {user.batchConfigs.map((c) => c.batch_name).join(", ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <ConsistencyChart onTime={user.onTimeCount} late={user.lateCount} total={total} />
                        <p className="mt-1 text-xs text-slate-500">
                          {user.onTimeCount} on-time / {total} completed
                        </p>
                      </div>
                      <div className={`w-16 text-right font-bold ${consistency >= 80 ? "text-emerald-600" : consistency >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                        {consistency}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "Batches" && (
          <div className="p-5">
            <div className="theme-subpanel overflow-hidden rounded-3xl">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">
                  Batch Analytics
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="p-4">Batch</th>
                      <th className="p-4 text-center">Lectures</th>
                      <th className="p-4 text-center">Completed</th>
                      <th className="p-4 text-center">Pending</th>
                      <th className="p-4 text-center">Missed</th>
                      <th className="p-4 text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {batchStats.map((batch) => {
                      const total = batch.completedTasks + batch.pendingTasks + batch.missedTasks;
                      const rate = total > 0 ? Math.round((batch.completedTasks / total) * 100) : 0;
                      return (
                        <tr key={batch.batchName} className="align-top">
                          <td className="p-4 font-semibold text-ink">{batch.batchName}</td>
                          <td className="p-4 text-center font-semibold text-ink">{batch.lectureCount}</td>
                          <td className="p-4 text-center text-emerald-600">{batch.completedTasks}</td>
                          <td className="p-4 text-center text-amber-600">{batch.pendingTasks}</td>
                          <td className="p-4 text-center text-rose-600">{batch.missedTasks}</td>
                          <td className="p-4 text-right">
                            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${rate >= 80 ? "bg-emerald-50 text-emerald-700" : rate >= 50 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Lectures" && (
          <div className="p-5">
            <div className="flex flex-col gap-4 mb-4 lg:flex-row lg:items-end">
              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                Batch
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="theme-input rounded-2xl px-4 py-2 text-sm"
                >
                  <option value="all">All</option>
                  {batches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <div className="theme-muted flex flex-col gap-2 text-sm font-medium">
                Week
                <div className="flex items-center gap-2">
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="theme-input rounded-2xl px-4 py-2 text-sm" />
                  <span>→</span>
                  <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} className="theme-input rounded-2xl px-4 py-2 text-sm" />
                </div>
              </div>
            </div>

            <div className="theme-subpanel overflow-hidden rounded-3xl">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full table-fixed">
                  <thead className="sticky top-0 bg-white dark:bg-slate-800">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="p-3">Lecture</th>
                      <th className="p-3">Batch</th>
                      <th className="p-3">Schedule</th>
                      <th className="p-3 text-center">Pre-read</th>
                      <th className="p-3 text-center">Notes</th>
                      <th className="p-3 text-center">Assignment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredLectures.map((lecture) => (
                      <tr key={lecture.id}>
                        <td className="p-3 font-semibold text-ink">{lecture.lectureName}</td>
                        <td className="p-3 text-slate-600">{lecture.batchName}</td>
                        <td className="p-3 text-slate-600">
                          <p>{formatLectureDate(lecture.lectureDate)}</p>
                          <p className="text-xs">{formatLectureTime(lecture.startTime)}</p>
                        </td>
                        <td className="p-3 text-center">{renderStatus(lecture.prereadStatus)}</td>
                        <td className="p-3 text-center">{renderStatus(lecture.notesStatus)}</td>
                        <td className="p-3 text-center">{renderStatus(lecture.assignmentStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Reports" && <ReportsTab />}
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
        case "leaderboard": filename = "leaderboard.csv"; content = data.leaderboardCsv ?? ""; break;
        case "batch": filename = "batch-report.csv"; content = data.batchCsv ?? ""; break;
        case "lecture": filename = "lecture-report.csv"; content = data.lectureCsv ?? ""; break;
        case "all": filename = "admin-report.csv"; content = [`# LEADERBOARD`, data.leaderboardCsv ?? "", `# BATCHES`, data.batchCsv ?? "", `# LECTURES`, data.lectureCsv ?? ""].join("\n\n"); break;
      }

      const blob = new Blob([content], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setMessage(`Exported ${filename}`);
    } catch { setMessage("Export failed"); }

    setIsExporting(false);
  }

  return (
    <div className="space-y-6 p-5">
      <div className="theme-subpanel rounded-3xl p-5">
        <h3 className="font-[var(--font-heading)] text-lg font-bold text-ink">Export Reports</h3>
        <p className="theme-muted mt-1 text-sm">Download CSV reports for offline analysis</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={isExporting} onClick={() => handleExport("leaderboard")} className="theme-button-secondary px-5 py-2.5 text-sm font-semibold">
            Leaderboard
          </button>
          <button type="button" disabled={isExporting} onClick={() => handleExport("batch")} className="theme-button-secondary px-5 py-2.5 text-sm font-semibold">
            Batch Report
          </button>
          <button type="button" disabled={isExporting} onClick={() => handleExport("lecture")} className="theme-button-secondary px-5 py-2.5 text-sm font-semibold">
            Lecture Report
          </button>
          <button type="button" disabled={isExporting} onClick={() => handleExport("all")} className="theme-button-primary px-5 py-2.5 text-sm font-semibold">
            Full Report
          </button>
        </div>

        {message && <p className="theme-muted mt-4 text-sm">{message}</p>}
      </div>
    </div>
  );
}