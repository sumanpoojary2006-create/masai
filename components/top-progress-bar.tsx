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
      if (progress !== undefined) {
        setWidth(progress);
      }
    } else {
      setWidth(100);
      const t = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(t);
    }
  }, [isLoading, progress]);

  // Indeterminate crawl while loading with no explicit progress
  useEffect(() => {
    if (!isLoading || progress !== undefined) return;
    const targets = [20, 40, 58, 72, 83, 90];
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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1.5">
      <div
        className="h-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)] transition-all duration-500 ease-out dark:bg-teal-400"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
