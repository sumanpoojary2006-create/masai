"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

type Lecture = {
  lecture_id: number;
  title: string;
  module: string | null;
  schedule: string | null;
  concludes: string | null;
  preread_uploaded: boolean;
  notes_uploaded: boolean;
  assignment_uploaded: boolean;
  synced_at: string;
};

function StatusBadge({ uploaded, label }: { uploaded: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        uploaded
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-rose-500/15 text-rose-300"
      }`}
    >
      {uploaded ? "✓" : "✗"} {label}
    </span>
  );
}

function formatSchedule(ts: string | null) {
  if (!ts) return "—";
  return DateTime.fromISO(ts).setZone("Asia/Kolkata").toFormat("dd MMM yyyy, HH:mm");
}

export function LectureComplianceTable({ batchId }: { batchId: number }) {
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function loadLectures() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cc/batches/${batchId}/lectures`);
      const json = await res.json() as { lectures?: Lecture[]; message?: string };
      if (!res.ok) throw new Error(json.message ?? "Failed to load.");
      setLectures(json.lectures ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lectures.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLectures(); }, [batchId]);

  async function requestSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/admin/cc-management/sync-lectures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId })
      });
      const json = await res.json() as { message?: string };
      setSyncMsg(json.message ?? (res.ok ? "Synced." : "Sync failed."));
      if (res.ok) await loadLectures();
    } finally {
      setSyncing(false);
    }
  }

  const lastSynced = lectures[0]?.synced_at
    ? DateTime.fromISO(lectures[0].synced_at).setZone("Asia/Kolkata").toRelative()
    : null;

  const stats = {
    total: lectures.length,
    preread: lectures.filter((l) => l.preread_uploaded).length,
    notes: lectures.filter((l) => l.notes_uploaded).length,
    assignment: lectures.filter((l) => l.assignment_uploaded).length
  };

  if (loading) return <p className="py-8 text-center text-sm text-slate-400">Loading lectures…</p>;

  if (error)
    return <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4 text-xs text-slate-400">
          <span className="text-white font-medium">{stats.total} lectures</span>
          <span className="text-emerald-400">Pre-read: {stats.preread}/{stats.total}</span>
          <span className="text-emerald-400">Notes: {stats.notes}/{stats.total}</span>
          <span className="text-emerald-400">Assignment: {stats.assignment}/{stats.total}</span>
          {lastSynced && <span>Last synced {lastSynced}</span>}
        </div>
        <button
          onClick={requestSync}
          disabled={syncing}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Refresh from LMS"}
        </button>
      </div>

      {syncMsg && (
        <p className="rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300">{syncMsg}</p>
      )}

      {lectures.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 py-12 text-center text-sm text-slate-400">
          No lectures in cache. Click "Refresh from LMS" to sync.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full text-sm">
            <thead className="bg-white/3">
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">Lecture</th>
                <th className="px-4 py-3 font-medium">Module</th>
                <th className="px-4 py-3 font-medium">Schedule (IST)</th>
                <th className="px-4 py-3 font-medium">Pre-read</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 font-medium">Assignment</th>
              </tr>
            </thead>
            <tbody>
              {lectures.map((l, i) => (
                <tr
                  key={l.lecture_id}
                  className={`border-t border-white/5 ${i % 2 === 0 ? "" : "bg-white/2"}`}
                >
                  <td className="px-4 py-3 font-medium text-white">{l.title}</td>
                  <td className="px-4 py-3 text-slate-400">{l.module ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {formatSchedule(l.schedule)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge uploaded={l.preread_uploaded} label="Pre-read" />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge uploaded={l.notes_uploaded} label="Notes" />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge uploaded={l.assignment_uploaded} label="Assignment" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
