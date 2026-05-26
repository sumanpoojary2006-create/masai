"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { useTabData, Spinner, ErrorBox, SectionTitle, PctBadge } from "./shared";

type Row = { program: string | null; domain: string; yw: number; weekStart: string; total: number };

const DOMAIN_COLORS: Record<string, string> = {
  Data:       "#6366f1",
  Software:   "#10b981",
  Business:   "#f59e0b",
  Operations: "#3b82f6",
  Other:      "#71717a",
  Unassigned: "#52525b",
};

export function DomainWoW() {
  const { data, loading, error } = useTabData<Row[]>("domain-wow");

  const { chartData, domains, latestByDomain, prevByDomain } = useMemo(() => {
    if (!data) return { chartData: [], domains: [], latestByDomain: {}, prevByDomain: {} };

    // Aggregate by domain per week
    const agg = new Map<string, Map<number, { total: number; weekStart: string }>>();
    for (const row of data) {
      const d = row.domain ?? "Unassigned";
      if (!agg.has(d)) agg.set(d, new Map());
      const wm = agg.get(d)!;
      const ex = wm.get(row.yw) ?? { total: 0, weekStart: row.weekStart };
      wm.set(row.yw, { total: ex.total + row.total, weekStart: ex.weekStart || row.weekStart });
    }

    const domains = [...agg.keys()].sort();
    const allWeeks = [...new Set(data.map((r) => r.yw))].sort();

    const chartData = allWeeks.map((yw) => {
      const entry: Record<string, unknown> = { yw, weekStart: "" };
      for (const [domain, wm] of agg) {
        const w = wm.get(yw);
        entry[domain] = w?.total ?? 0;
        if (w?.weekStart) entry.weekStart = w.weekStart.slice(5); // "MM-DD"
      }
      return entry;
    });

    // Latest two weeks per domain
    const lastTwo = allWeeks.slice(-2);
    const latestByDomain: Record<string, number> = {};
    const prevByDomain: Record<string, number> = {};
    for (const [domain, wm] of agg) {
      latestByDomain[domain] = wm.get(lastTwo[1])?.total ?? 0;
      prevByDomain[domain] = wm.get(lastTwo[0])?.total ?? 0;
    }

    return { chartData, domains, latestByDomain, prevByDomain };
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;
  if (!data?.length) return (
    <p className="text-zinc-500 text-sm">
      No data — configure domain mappings in the <span className="text-amber-400">Domain Config</span> tab first.
    </p>
  );

  return (
    <div className="space-y-8">
      {/* Domain health cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {domains.map((domain) => {
          const cur = latestByDomain[domain] ?? 0;
          const prev = prevByDomain[domain] ?? 0;
          const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
          const spike = pct > 50;
          return (
            <div
              key={domain}
              className={`rounded-xl bg-zinc-900 border p-4 ${spike ? "border-rose-500/40" : "border-zinc-800"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: DOMAIN_COLORS[domain] + "22", color: DOMAIN_COLORS[domain] }}
                >
                  {domain}
                </span>
                {spike && <span className="text-xs text-rose-400">⚡ Spike</span>}
              </div>
              <p className="text-2xl font-bold text-zinc-100">{cur}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-zinc-500">vs prev week: {prev}</span>
                {prev > 0 && <PctBadge pct={pct} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grouped bar chart */}
      <div>
        <SectionTitle>Domain Week-over-Week Comparison</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="weekStart" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#e4e4e7" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {domains.map((d) => (
                <Bar key={d} dataKey={d} fill={DOMAIN_COLORS[d] ?? "#71717a"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
