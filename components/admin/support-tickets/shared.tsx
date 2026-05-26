"use client";

import { useEffect, useState } from "react";

export function useTabData<T>(tab: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/support-tickets/tab?tab=${tab}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tab]);

  return { data, loading, error };
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
    </div>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-rose-300 text-sm">
      {msg}
    </div>
  );
}

export function StatCard({
  label, value, sub, color = "indigo",
}: {
  label: string; value: string | number; sub?: string; color?: "indigo" | "emerald" | "rose" | "amber";
}) {
  const border: Record<string, string> = {
    indigo: "border-indigo-500/30",
    emerald: "border-emerald-500/30",
    rose: "border-rose-500/30",
    amber: "border-amber-500/30",
  };
  const text: Record<string, string> = {
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
  };
  return (
    <div className={`rounded-xl bg-zinc-900 border ${border[color]} p-5`}>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${text[color]}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

// Simple sparkline using SVG
export function Sparkline({ values, color = "#6366f1" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 80, h = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function PctBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${up ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function RAGDot({ value, thresholds: [green, amber] }: { value: number; thresholds: [number, number] }) {
  const color = value <= green ? "bg-emerald-500" : value <= amber ? "bg-amber-400" : "bg-rose-500";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{children}</h2>;
}
