"use client";

import { useState } from "react";
import { useTabData, Spinner, ErrorBox, RAGDot, SectionTitle } from "./shared";
import type { CCLeaderboardRow } from "@/lib/support-tickets-mysql";

type SortKey = "ticketsHandled" | "avgTat" | "reopenedCount" | "avgRating";
const TAT_THRESHOLDS: [number, number] = [24, 48];

export function CCLeaderboard() {
  const { data, loading, error } = useTabData<CCLeaderboardRow[]>("cc-leaderboard");
  const [sortKey, setSortKey] = useState<SortKey>("avgTat");
  const [asc, setAsc] = useState(true);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data?.length) return <p className="text-zinc-500 text-sm">No data for 2026.</p>;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(key === "avgTat"); }
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

  function RatingStars({ rating }: { rating: number }) {
    if (!rating) return <span className="text-zinc-600 text-xs">—</span>;
    const filled = Math.round(rating);
    return (
      <span className="text-amber-400 tracking-tight text-xs">
        {"★".repeat(filled)}{"☆".repeat(5 - filled)}
        <span className="text-zinc-400 ml-1">{rating.toFixed(1)}</span>
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle>CC Leaderboard — Lowest Avg TAT = Best</SectionTitle>
      <p className="text-xs text-zinc-500">
        Default sorted by avg TAT (ascending). TAT capped at 168h. Minimum 5 tickets to appear.
      </p>
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
              <th className="text-left px-4 py-3">Rank</th>
              <th className="text-left px-4 py-3">CC Name</th>
              <th className="text-left px-4 py-3">Email</th>
              {thCol("Handled", "ticketsHandled")}
              {thCol("Avg TAT (h)", "avgTat")}
              {thCol("Re-Opened", "reopenedCount")}
              {thCol("Rating", "avgRating")}
              <th className="text-center px-4 py-3">SLA</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </td>
                <td className="px-4 py-3 font-medium text-zinc-200">{row.ccName}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{row.ccEmail}</td>
                <td className="px-4 py-3 text-right text-zinc-100">{row.ticketsHandled.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-semibold text-zinc-100">{row.avgTat.toFixed(1)}h</td>
                <td className="px-4 py-3 text-right">
                  {row.reopenedCount > 0
                    ? <span className="text-rose-400">{row.reopenedCount}</span>
                    : <span className="text-zinc-600">0</span>}
                </td>
                <td className="px-4 py-3 text-right"><RatingStars rating={row.avgRating} /></td>
                <td className="px-4 py-3 text-center">
                  <RAGDot value={row.avgTat} thresholds={TAT_THRESHOLDS} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
