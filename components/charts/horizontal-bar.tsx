"use client";

import React from "react";

type Bar = { label: string; value: number; color?: string };

export function HorizontalBarChart({ bars }: { bars: Bar[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="w-full space-y-2" aria-label="horizontal bars">
      {bars.map((b) => {
        const w = Math.round((b.value / max) * 100);
        return (
          <div key={b.label} className="flex items-center gap-2">
            <span className="w-28 text-sm text-slate-600 truncate" title={b.label}>{b.label}</span>
            <div className="flex-1 h-4 rounded-full bg-slate-200 overflow-hidden">
              <span style={{ display: "block", width: `${w}%`, height: '100%', background: b.color ?? '#10b981' }} />
            </div>
            <span className="w-12 text-right text-sm" aria-label={b.label + ' value'}>{b.value}%</span>
          </div>
        );
      })}
    </div>
  );
}
