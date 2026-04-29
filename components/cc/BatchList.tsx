"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BatchRow = {
  batch_id: number;
  batch_name: string;
  batch_program: string | null;
  created_at: string;
};

export function BatchList() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cc/batches")
      .then((r) => r.json())
      .then((json) => {
        if (json.message && !json.batches) {
          setError(json.message);
        } else {
          setBatches(json.batches ?? []);
        }
      })
      .catch(() => setError("Failed to load batches."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading your batches…</p>;
  }

  if (error) {
    return <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>;
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-8 text-center">
        <p className="text-sm font-medium text-amber-200">No batches assigned to you yet.</p>
        <p className="mt-1 text-xs text-slate-400">Contact the Admin to get your batches configured.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {batches.map((b) => (
        <Link
          key={b.batch_id}
          href={`/cc/batch/${b.batch_id}`}
          className="group flex flex-col gap-2 rounded-2xl border border-white/8 bg-[#10162a] p-5 transition hover:border-indigo-500/40 hover:bg-indigo-900/10"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300">
              {b.batch_name}
            </h3>
            {b.batch_program && (
              <span className="shrink-0 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300">
                {b.batch_program}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Batch ID: {b.batch_id}
          </p>
          <p className="mt-auto text-xs font-medium text-indigo-400 group-hover:text-indigo-300">
            View lectures →
          </p>
        </Link>
      ))}
    </div>
  );
}
