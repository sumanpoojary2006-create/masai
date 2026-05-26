"use client";

import { useState } from "react";
import { useTabData, Spinner, ErrorBox, RAGDot, SectionTitle } from "./shared";
import type { TATByBatchRow, TATByCCRow } from "@/lib/support-tickets-mysql";

type TATData = {
  byBatch: (TATByBatchRow & { domain: string })[];
  byCC: TATByCCRow[];
};

const TAT_THRESHOLDS: [number, number] = [24, 48];

function SLABar({ total, breached }: { total: number; breached: number }) {
  const pct = total > 0 ? (breached / total) * 100 : 0;
  const color = pct > 50 ? "bg-rose-500" : pct > 25 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 min-w-[60px]">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-10 text-right">{breached}</span>
    </div>
  );
}

export function TATTracking() {
  const { data, loading, error } = useTabData<TATData>("tat");
  const [view, setView] = useState<"batch" | "cc">("cc");

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const { byBatch, byCC } = data;

  // Summary cards
  const allTATs = byCC.map((r) => r.avgTat).filter(Boolean);
  const overallAvgTAT = allTATs.length
    ? (allTATs.reduce((a, b) => a + b, 0) / allTATs.length).toFixed(1)
    : "—";
  const total24h = byCC.reduce((s, r) => s + r.breached24h, 0);
  const total48h = byCC.reduce((s, r) => s + r.breached48h, 0);
  const totalResolved = byCC.reduce((s, r) => s + r.totalResolved, 0);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-zinc-900 border border-indigo-500/30 p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Avg TAT (all CCs)</p>
          <p className="text-3xl font-bold text-indigo-400">{overallAvgTAT}h</p>
          <p className="text-xs text-zinc-500 mt-1">capped at 168h</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-amber-500/30 p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">SLA Breached &gt;24h</p>
          <p className="text-3xl font-bold text-amber-400">{total24h.toLocaleString()}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {totalResolved > 0 ? `${((total24h / totalResolved) * 100).toFixed(0)}% of resolved` : ""}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-rose-500/30 p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">SLA Breached &gt;48h</p>
          <p className="text-3xl font-bold text-rose-400">{total48h.toLocaleString()}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {totalResolved > 0 ? `${((total48h / totalResolved) * 100).toFixed(0)}% of resolved` : ""}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-emerald-500/30 p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Within 24h SLA</p>
          <p className="text-3xl font-bold text-emerald-400">
            {totalResolved > 0 ? `${(((totalResolved - total24h) / totalResolved) * 100).toFixed(0)}%` : "—"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">{(totalResolved - total24h).toLocaleString()} tickets</p>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex gap-2">
        {(["cc", "batch"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === v
                ? "bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            By {v === "cc" ? "CC" : "Batch"}
          </button>
        ))}
      </div>

      {/* By CC */}
      {view === "cc" && (
        <div>
          <SectionTitle>TAT by CC — SLA Breach Tracker</SectionTitle>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
                  <th className="text-left px-4 py-3">CC Name</th>
                  <th className="text-right px-4 py-3">Resolved</th>
                  <th className="text-right px-4 py-3">Avg TAT</th>
                  <th className="text-left px-4 py-3 w-40">Breached &gt;24h</th>
                  <th className="text-left px-4 py-3 w-40">Breached &gt;48h</th>
                  <th className="text-center px-4 py-3">SLA</th>
                </tr>
              </thead>
              <tbody>
                {byCC.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 font-medium text-zinc-200">{row.ccName}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{row.totalResolved.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-100">{row.avgTat.toFixed(1)}h</td>
                    <td className="px-4 py-3">
                      <SLABar total={row.totalResolved} breached={row.breached24h} />
                    </td>
                    <td className="px-4 py-3">
                      <SLABar total={row.totalResolved} breached={row.breached48h} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RAGDot value={row.avgTat} thresholds={TAT_THRESHOLDS} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Batch */}
      {view === "batch" && (
        <div>
          <SectionTitle>TAT by Batch — SLA Breach Tracker</SectionTitle>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
                  <th className="text-left px-4 py-3">Batch</th>
                  <th className="text-left px-4 py-3">Domain</th>
                  <th className="text-right px-4 py-3">Resolved</th>
                  <th className="text-right px-4 py-3">Avg TAT</th>
                  <th className="text-left px-4 py-3 w-40">Breached &gt;24h</th>
                  <th className="text-left px-4 py-3 w-40">Breached &gt;48h</th>
                  <th className="text-center px-4 py-3">SLA</th>
                </tr>
              </thead>
              <tbody>
                {byBatch.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 font-medium text-zinc-200">{row.batchName ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{row.domain}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{row.totalResolved.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-100">{row.avgTat.toFixed(1)}h</td>
                    <td className="px-4 py-3">
                      <SLABar total={row.totalResolved} breached={row.breached24h} />
                    </td>
                    <td className="px-4 py-3">
                      <SLABar total={row.totalResolved} breached={row.breached48h} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RAGDot value={row.avgTat} thresholds={TAT_THRESHOLDS} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
