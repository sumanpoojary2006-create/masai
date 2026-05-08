"use client";

import { useEffect, useState } from "react";

export function TopProgressBar({
  isLoading,
  progress
}: {
  isLoading: boolean;
  /** 0-100. If omitted, bar animates indeterminately. */
  progress?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (isLoading) {
      setVisible(true);
      setWidth(progress ?? 0);
    } else {
      // Flash to 100 % then fade out
      setWidth(100);
      const t = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(t);
    }
  }, [isLoading, progress]);

  // Indeterminate animation: crawl to ~85 % while loading
  useEffect(() => {
    if (!isLoading || progress !== undefined) return;
    const targets = [15, 35, 55, 70, 80, 85];
    let i = 0;
    setWidth(targets[i]);
    const interval = setInterval(() => {
      i = Math.min(i + 1, targets.length - 1);
      setWidth(targets[i]);
    }, 900);
    return () => clearInterval(interval);
  }, [isLoading, progress]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1">
      <div
        className="h-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.7)] transition-all duration-500 ease-out dark:bg-teal-400"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
