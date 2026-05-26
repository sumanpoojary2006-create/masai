"use client";

import { useTabData, Spinner, ErrorBox, StatCard, SectionTitle } from "./shared";
import type { OverviewSummary } from "@/lib/support-tickets-mysql";

export function LiveOverview() {
  const { data, loading, error } = useTabData<OverviewSummary>("overview");

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const resolutionRate = data.total > 0
    ? Math.round((data.resolved / data.total) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="Total (2026)"  value={data.total.toLocaleString()}    color="indigo" />
        <StatCard label="Open"          value={data.open}                       color="amber"  sub="currently open" />
        <StatCard label="Resolved"      value={data.resolved.toLocaleString()}  color="emerald" sub={`${resolutionRate}% of total`} />
        <StatCard label="Re-Opened"     value={data.reopened}                   color="rose" />
        <StatCard label="Today New"     value={data.todayNew}                   color="indigo" />
        <StatCard label="Today Resolved" value={data.todayResolved}             color="emerald" />
      </div>

      {/* SLA alert */}
      {data.overdue24h > 0 && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 flex items-center gap-3">
          <span className="text-rose-400 text-xl">⚠</span>
          <div>
            <p className="text-rose-300 font-medium text-sm">
              {data.overdue24h} open ticket{data.overdue24h !== 1 ? "s" : ""} unresolved beyond 24 hrs
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">Requires immediate CC attention</p>
          </div>
        </div>
      )}

      {/* CC-level overdue */}
      {data.ccOverdue.length > 0 && (
        <div>
          <SectionTitle>Open &gt;24h by CC</SectionTitle>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
                  <th className="text-left px-4 py-3">CC Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-right px-4 py-3">Overdue Tickets</th>
                </tr>
              </thead>
              <tbody>
                {data.ccOverdue.map((cc, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-200">{cc.ccName}</td>
                    <td className="px-4 py-3 text-zinc-400">{cc.ccEmail}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 rounded bg-rose-500/15 text-rose-300 font-medium text-xs">
                        {cc.count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status breakdown donut-style bars */}
      <div>
        <SectionTitle>Status Breakdown</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-3">
          {[
            { label: "Resolved / Closed", value: data.resolved, color: "bg-emerald-500" },
            { label: "Automatic",          value: data.automatic, color: "bg-blue-500" },
            { label: "Open",               value: data.open,     color: "bg-amber-400" },
            { label: "Re-Opened",          value: data.reopened, color: "bg-rose-500" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 w-36 shrink-0">{s.label}</span>
              <div className="flex-1 bg-zinc-800 rounded-full h-2">
                <div
                  className={`${s.color} h-2 rounded-full transition-all`}
                  style={{ width: `${data.total > 0 ? Math.max((s.value / data.total) * 100, 0.5) : 0}%` }}
                />
              </div>
              <span className="text-xs text-zinc-300 w-16 text-right">{s.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
