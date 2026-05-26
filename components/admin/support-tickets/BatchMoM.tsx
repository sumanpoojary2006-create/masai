"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useTabData, Spinner, ErrorBox, SectionTitle } from "./shared";
import type { BatchMonthRow } from "@/lib/support-tickets-mysql";

export function BatchMoM() {
  const { data, loading, error } = useTabData<BatchMonthRow[]>("batch-mom");

  // Top 10 batches by total volume for the stacked chart
  const { chartData, topBatches } = useMemo(() => {
    if (!data) return { chartData: [], topBatches: [] };

    const allMonths = [...new Set(data.map((r) => r.month))].sort();

    // Aggregate total per batch
    const batchTotals = new Map<string, number>();
    for (const row of data) {
      const k = row.batchName ?? "Unassigned";
      batchTotals.set(k, (batchTotals.get(k) ?? 0) + row.total);
    }
    const topBatches = [...batchTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    const chartData = allMonths.map((month) => {
      const entry: Record<string, unknown> = { month };
      for (const batch of topBatches) {
        const row = data.find((r) => r.month === month && (r.batchName ?? "Unassigned") === batch);
        entry[batch] = row?.total ?? 0;
      }
      return entry;
    });

    return { chartData, topBatches };
  }, [data]);

  // Table: open vs resolved per batch per month
  const tableData = useMemo(() => {
    if (!data) return [];
    return [...data]
      .sort((a, b) => b.total - a.total)
      .slice(0, 80);
  }, [data]);

  const COLORS = [
    "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
    "#8b5cf6", "#14b8a6", "#f97316", "#ec4899", "#84cc16",
  ];

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data?.length) return <p className="text-zinc-500 text-sm">No data for 2026.</p>;

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>Top 10 Batches — Monthly Volume (Stacked)</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4" style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#e4e4e7" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topBatches.map((batch, i) => (
                <Bar key={batch} dataKey={batch} stackId="a" fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <SectionTitle>Open vs Resolved by Batch × Month</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
                <th className="text-left px-4 py-3">Batch</th>
                <th className="text-left px-4 py-3">Month</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Resolved</th>
                <th className="text-right px-4 py-3">Open</th>
                <th className="text-right px-4 py-3">Re-Opened</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <td className="px-4 py-3 text-zinc-200 font-medium">{row.batchName ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-zinc-400">{row.month}</td>
                  <td className="px-4 py-3 text-right text-zinc-100">{row.total}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">{row.resolved}</td>
                  <td className="px-4 py-3 text-right text-amber-400">{row.open}</td>
                  <td className="px-4 py-3 text-right text-rose-400">{row.reopened}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
