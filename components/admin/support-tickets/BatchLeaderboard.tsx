"use client";

import { useState } from "react";
import { useTabData, Spinner, ErrorBox, RAGDot, SectionTitle } from "./shared";
import type { BatchLeaderboardRow } from "@/lib/support-tickets-mysql";

type SortKey = "total" | "avgTat" | "reopenRate";

// RAG thresholds: [green, amber] — below green=green, below amber=amber, else red
const TAT_THRESHOLDS: [number, number] = [24, 48];
const REOPEN_THRESHOLDS: [number, number] = [1, 5];

export function BatchLeaderboard() {
  const { data, loading, error } = useTabData<BatchLeaderboardRow[]>("batch-leaderboard");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data?.length) return <p className="text-zinc-500 text-sm">No data for 2026.</p>;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(false); }
  }

  const sorted = [...data].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return asc ? diff : -diff;
  });

  const thCol = (label: string, key: SortKey) => (
    <th
      className="text-right px-4 py-3 cursor-pointer select-none hover:text-zinc-200 transition-colors"
      onClick={() => toggleSort(key)}
    >
      {label} {sortKey === key ? (asc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="space-y-4">
      <SectionTitle>Batch Leaderboard — Volume, TAT &amp; Re-Open Rate</SectionTitle>
      <p className="text-xs text-zinc-500">
        RAG: TAT (green ≤24h / amber ≤48h / red &gt;48h) · Re-open rate (green &lt;1% / amber &lt;5% / red ≥5%)
        · TAT capped at 168h for averages
      </p>
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
              <th className="text-left px-4 py-3">Rank</th>
              <th className="text-left px-4 py-3">Batch</th>
              <th className="text-left px-4 py-3">Program</th>
              {thCol("Volume", "total")}
              {thCol("Avg TAT (h)", "avgTat")}
              {thCol("Re-Open %", "reopenRate")}
              <th className="text-center px-4 py-3">TAT</th>
              <th className="text-center px-4 py-3">Re-Open</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                <td className="px-4 py-3 text-zinc-500 text-xs">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-zinc-200">{row.batchName ?? "Unassigned"}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{row.program ?? "—"}</td>
                <td className="px-4 py-3 text-right text-zinc-100">{row.total.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-zinc-200">{row.avgTat.toFixed(1)}h</td>
                <td className="px-4 py-3 text-right text-zinc-200">{row.reopenRate.toFixed(1)}%</td>
                <td className="px-4 py-3 text-center">
                  <RAGDot value={row.avgTat} thresholds={TAT_THRESHOLDS} />
                </td>
                <td className="px-4 py-3 text-center">
                  <RAGDot value={row.reopenRate} thresholds={REOPEN_THRESHOLDS} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
