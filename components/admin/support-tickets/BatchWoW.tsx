"use client";

import { useMemo } from "react";
import { useTabData, Spinner, ErrorBox, Sparkline, PctBadge, SectionTitle } from "./shared";
import type { BatchWeekRow } from "@/lib/support-tickets-mysql";

export function BatchWoW() {
  const { data, loading, error } = useTabData<BatchWeekRow[]>("batch-wow");

  const batchMap = useMemo(() => {
    if (!data) return new Map<string, BatchWeekRow[]>();
    const map = new Map<string, BatchWeekRow[]>();
    for (const row of data) {
      const key = row.batchName ?? "Unassigned";
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    return map;
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data?.length) return <p className="text-zinc-500 text-sm">No data for 2026.</p>;

  const allWeeks = [...new Set(data.map((r) => r.yw))].sort();
  const lastTwoWeeks = allWeeks.slice(-2);
  const currentYW = lastTwoWeeks[1];
  const prevYW = lastTwoWeeks[0];

  return (
    <div className="space-y-6">
      <SectionTitle>Batch Week-over-Week Ticket Volume (last 4 weeks)</SectionTitle>
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
              <th className="text-left px-4 py-3">Batch</th>
              <th className="text-left px-4 py-3">Program</th>
              <th className="text-right px-4 py-3">Trend (4w)</th>
              <th className="text-right px-4 py-3">Prev Week</th>
              <th className="text-right px-4 py-3">Current Week</th>
              <th className="text-right px-4 py-3">WoW Δ</th>
            </tr>
          </thead>
          <tbody>
            {[...batchMap.entries()]
              .sort((a, b) => {
                const cur = (yw: number) => b[1].find((r) => r.yw === yw)?.total ?? 0;
                return cur(currentYW) - (a[1].find((r) => r.yw === currentYW)?.total ?? 0);
              })
              .map(([batchName, rows]) => {
                const sorted = [...rows].sort((a, b) => a.yw - b.yw);
                const sparkVals = allWeeks.slice(-4).map(
                  (yw) => sorted.find((r) => r.yw === yw)?.total ?? 0
                );
                const cur = sorted.find((r) => r.yw === currentYW)?.total ?? 0;
                const prev = sorted.find((r) => r.yw === prevYW)?.total ?? 0;
                const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
                return (
                  <tr key={batchName} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 font-medium text-zinc-200">{batchName}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{rows[0]?.program ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Sparkline values={sparkVals} />
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">{prev}</td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-100">{cur}</td>
                    <td className="px-4 py-3 text-right">
                      {prev > 0 ? <PctBadge pct={pct} /> : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
