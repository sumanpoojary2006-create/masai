"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import { useTabData, Spinner, ErrorBox, SectionTitle } from "./shared";
import type { IntelligenceData } from "@/lib/support-tickets-mysql";

const DOW_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function TicketIntelligence() {
  const { data, loading, error } = useTabData<IntelligenceData>("intelligence");

  const catMoMChart = useMemo(() => {
    if (!data?.categoryMoM) return { months: [], categories: [], rows: [] };
    const months = [...new Set(data.categoryMoM.map((r) => r.month))].sort();
    const categories = [...new Set(data.categoryMoM.map((r) => r.category))];
    const rows = months.map((month) => {
      const entry: Record<string, unknown> = { month };
      for (const cat of categories) {
        const found = data.categoryMoM.find((r) => r.month === month && r.category === cat);
        entry[cat] = found?.count ?? 0;
      }
      return entry;
    });
    return { months, categories, rows };
  }, [data]);

  const dowSorted = useMemo(() => {
    if (!data?.dayOfWeek) return [];
    return [...DOW_ORDER].map((day) => {
      const found = data.dayOfWeek.find((r) => r.day === day);
      return { day: day.slice(0, 3), count: found?.count ?? 0 };
    });
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const maxDow = Math.max(...dowSorted.map((r) => r.count), 1);

  const CAT_COLORS = [
    "#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6",
    "#8b5cf6","#14b8a6","#f97316","#ec4899","#84cc16",
  ];

  return (
    <div className="space-y-10">
      {/* Top categories */}
      <div>
        <SectionTitle>Top Recurring Categories (2026)</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.topCategories.slice(0, 15)}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 160, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis type="category" dataKey="category" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={155} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#e4e4e7" }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Day-of-week spike */}
      <div>
        <SectionTitle>Day-of-Week Spike Analysis</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex items-end gap-3 h-32">
            {dowSorted.map(({ day, count }) => {
              const h = Math.round((count / maxDow) * 100);
              const isMax = count === maxDow;
              return (
                <div key={day} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-xs text-zinc-400">{count.toLocaleString()}</span>
                  <div
                    className={`w-full rounded-t transition-all ${isMax ? "bg-rose-500" : "bg-indigo-600"}`}
                    style={{ height: `${Math.max(h, 4)}%` }}
                  />
                  <span className={`text-xs font-medium ${isMax ? "text-rose-300" : "text-zinc-400"}`}>{day}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500 mt-3">
            Peak: <span className="text-rose-300 font-medium">{dowSorted.find(d => d.count === maxDow)?.day}</span>
          </p>
        </div>
      </div>

      {/* Re-open rate by category */}
      <div>
        <SectionTitle>Re-Open Rate by Category (quality signal)</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Re-Opened</th>
                <th className="text-right px-4 py-3">Re-Open %</th>
              </tr>
            </thead>
            <tbody>
              {data.reopenByCategory.slice(0, 15).map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <td className="px-4 py-3 text-zinc-200 font-medium">{row.category}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{row.total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-rose-400">{row.reopened}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      row.reopenRate > 2
                        ? "bg-rose-500/15 text-rose-300"
                        : row.reopenRate > 0.5
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-emerald-500/15 text-emerald-300"
                    }`}>
                      {row.reopenRate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MoM category trends */}
      {catMoMChart.rows.length > 0 && (
        <div>
          <SectionTitle>Top 8 Category MoM Trends</SectionTitle>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={catMoMChart.rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                  labelStyle={{ color: "#e4e4e7" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {catMoMChart.categories.map((cat, i) => (
                  <Line
                    key={cat} type="monotone" dataKey={cat}
                    stroke={CAT_COLORS[i % CAT_COLORS.length]} strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
