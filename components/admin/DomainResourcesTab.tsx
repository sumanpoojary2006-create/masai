"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";

import type {
  DomainResourcesReportData,
  DomainResourceStatus,
  DomainResourceTask,
  DomainReport
} from "@/lib/domain-resource-report";

const TZ = "Asia/Kolkata";

const STATUS_STYLES: Record<DomainResourceStatus, string> = {
  completed: "border-emerald-400/25 bg-emerald-500/12 text-emerald-200",
  pending: "border-amber-400/25 bg-amber-500/12 text-amber-100",
  late: "border-rose-400/25 bg-rose-500/12 text-rose-200",
};

const RESOURCE_LABELS: Record<string, string> = {
  preread: "Pre-read",
  notes: "Notes",
  assignment: "Assignment",
};

function formatDate(iso: string) {
  const value = DateTime.fromISO(iso, { zone: TZ });
  return value.isValid ? value.toFormat("dd LLL yyyy") : iso;
}

function formatTime(iso: string) {
  const value = DateTime.fromISO(iso, { zone: "utc" }).setZone(TZ);
  return value.isValid ? value.toFormat("hh:mm a") : "Due time unavailable";
}

function statusLabel(status: DomainResourceStatus) {
  if (status === "late") return "Late";
  if (status === "completed") return "Done";
  return "Pending";
}

function SummaryCard({ report }: { report: DomainReport }) {
  const open = report.pending + report.late;
  return (
    <section className="rounded-[22px] border border-slate-800/90 bg-[#0b1329] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/75">
            {report.domain}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-white">{report.leadName ?? "Unassigned"}</h3>
          <p className="mt-1 text-xs text-slate-500">{report.leadEmail ?? "No lead configured"}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
          {open} open
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Metric label="Done" value={report.completed} className="text-emerald-300" />
        <Metric label="Pending" value={report.pending} className="text-amber-200" />
        <Metric label="Late" value={report.late} className="text-rose-200" />
      </div>
    </section>
  );
}

function Metric({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${className}`}>{value}</p>
    </div>
  );
}

function TaskRow({ task }: { task: DomainResourceTask }) {
  return (
    <tr className="border-b border-slate-800/70 last:border-0">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-slate-100">{task.batchName}</p>
        <p className="mt-1 text-xs text-slate-500">{task.moduleName ?? "Module unavailable"}</p>
      </td>
      <td className="px-4 py-3">
        <p className="max-w-[24rem] truncate text-sm text-slate-200">{task.lectureName}</p>
        <p className="mt-1 text-xs text-slate-500">{RESOURCE_LABELS[task.resourceType] ?? task.resourceType}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-300">{formatTime(task.deadline)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[task.status]}`}>
          {statusLabel(task.status)}
        </span>
      </td>
    </tr>
  );
}

function DomainSection({ report }: { report: DomainReport }) {
  return (
    <section className="rounded-[26px] border border-slate-800/90 bg-[#10162a] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">{report.domain}</p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {report.leadName ?? "Unassigned domain"} resources
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {report.ccReports.length} CC{report.ccReports.length === 1 ? "" : "s"} with resources due today
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-200">
            {report.completed} done
          </span>
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-100">
            {report.pending} pending
          </span>
          <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1 text-rose-200">
            {report.late} late
          </span>
        </div>
      </div>

      {report.ccReports.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/50 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-200">No resources due today</p>
          <p className="mt-1 text-sm text-slate-500">This domain has no CC resource deadlines for the selected day.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {report.ccReports.map((ccReport) => (
            <div key={`${report.domain}-${ccReport.ccUserId ?? ccReport.ccName}`} className="rounded-[22px] border border-slate-800/80 bg-slate-950/55">
              <div className="flex flex-col gap-3 border-b border-slate-800/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-white">{ccReport.ccName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ccReport.ccEmail ?? "No email"} • {ccReport.assignedBatches.length} assigned batch{ccReport.assignedBatches.length === 1 ? "" : "es"}
                  </p>
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">{ccReport.completed} done</span>
                  <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-100">{ccReport.pending} pending</span>
                  <span className="rounded-full bg-rose-500/10 px-3 py-1 text-rose-200">{ccReport.late} late</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-slate-950/80">
                      {["Batch", "Resource", "Due", "Status"].map((header) => (
                        <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ccReport.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
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

export function DomainResourcesTab() {
  const [data, setData] = useState<DomainResourcesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/domain-resources", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message ?? "Failed to load report.");
        if (!cancelled) setData(payload as DomainResourcesReportData);
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "Failed to load report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (!data) return { total: 0, completed: 0, pending: 0, late: 0 };
    return data.domains.reduce(
      (acc, domain) => ({
        total: acc.total + domain.total,
        completed: acc.completed + domain.completed,
        pending: acc.pending + domain.pending,
        late: acc.late + domain.late,
      }),
      { total: 0, completed: 0, pending: 0, late: 0 }
    );
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-[26px] border border-slate-800/90 bg-[#10162a] px-6 py-12 text-center text-sm text-slate-400">
        Loading domain resources report…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[26px] border border-rose-400/25 bg-rose-500/10 px-6 py-8">
        <p className="text-sm font-semibold text-rose-100">Domain resources report is unavailable</p>
        <p className="mt-2 text-sm text-rose-200/80">{error ?? "No report data returned."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/8 bg-[#10162a] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300/75">Daily report</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Domain Resources</h2>
            <p className="mt-2 text-sm text-slate-400">
              CC resource checklist for {formatDate(data.reportDate)} across Data, Non-Tech, and Tech domains.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/8 bg-slate-950/60 p-2 text-center">
            <Metric label="Total" value={totals.total} className="text-white" />
            <Metric label="Done" value={totals.completed} className="text-emerald-300" />
            <Metric label="Pending" value={totals.pending} className="text-amber-200" />
            <Metric label="Late" value={totals.late} className="text-rose-200" />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {data.domains.filter((report) => report.domain !== "Unassigned").map((report) => (
          <SummaryCard key={report.domain} report={report} />
        ))}
      </div>

      {data.domains.map((report) => (
        <DomainSection key={report.domain} report={report} />
      ))}
    </div>
  );
}
