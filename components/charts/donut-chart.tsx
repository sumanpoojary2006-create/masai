"use client";

import React from "react";

type DonutChartProps = {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
};

export function DonutChart({ value, size = 180, stroke = 14, color = "#10b981", trackColor = "#e5e7eb", label }: DonutChartProps) {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * c;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Completion ${clamped}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="6" fontSize="22" fill="#111">{clamped.toFixed(0)}%</text>
      {label ? <text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#6b7280">{label}</text> : null}
    </svg>
  );
}
