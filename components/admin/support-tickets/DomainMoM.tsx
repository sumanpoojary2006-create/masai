"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useTabData, Spinner, ErrorBox, SectionTitle, PctBadge } from "./shared";

type Row = { batchName: string | null; domain: string; month: string; total: number };

const DOMAIN_COLORS: Record<string, string> = {
  Software:   "#10b981",
  Data:       "#6366f1",
  "Non-tech": "#f59e0b",
  Unassigned: "#52525b",
};

export function DomainMoM() {
  const { data, loading, error } = useTabData<Row[]>("domain-mom");

  const { chartData, domains, momChanges } = useMemo(() => {
    if (!data) return { chartData: [], domains: [], momChanges: {} };

    const agg = new Map<string, Map<string, number>>();
    for (const row of data) {
      const d = row.domain ?? "Unassigned";
      if (!agg.has(d)) agg.set(d, new Map());
      const mm = agg.get(d)!;
      mm.set(row.month, (mm.get(row.month) ?? 0) + row.total);
    }

    const domains = [...agg.keys()].sort();
    const allMonths = [...new Set(data.map((r) => r.month))].sort();

    const chartData = allMonths.map((month) => {
      const entry: Record<string, unknown> = { month };
      for (const [domain, mm] of agg) entry[domain] = mm.get(month) ?? 0;
      return entry;
    });

    // MoM % change for the last two months
    const lastTwo = allMonths.slice(-2);
    const momChanges: Record<string, number> = {};
    for (const [domain, mm] of agg) {
      const cur = mm.get(lastTwo[1]) ?? 0;
      const prev = mm.get(lastTwo[0]) ?? 0;
      momChanges[domain] = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
    }

    return { chartData, domains, momChanges };
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
      <div>
        <SectionTitle>Domain Rolling Monthly Trend</SectionTitle>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#e4e4e7" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {domains.map((d) => (
                <Line
                  key={d} type="monotone" dataKey={d}
                  stroke={DOMAIN_COLORS[d] ?? "#71717a"} strokeWidth={2}
                  dot={{ r: 3 }} activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MoM summary cards */}
      <div>
        <SectionTitle>Month-over-Month Change (latest two months)</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {domains.map((domain) => {
            const pct = momChanges[domain] ?? 0;
            const lastMonth = (chartData.at(-1)?.[domain] as number) ?? 0;
            return (
              <div key={domain} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: DOMAIN_COLORS[domain] + "22", color: DOMAIN_COLORS[domain] }}
                >
                  {domain}
                </span>
                <p className="text-2xl font-bold text-zinc-100 mt-2">{lastMonth.toLocaleString()}</p>
                <div className="mt-1">
                  <PctBadge pct={pct} />
                  <span className="text-xs text-zinc-500 ml-2">vs prev month</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
