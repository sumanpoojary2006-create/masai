"use client";

import { useEffect, useRef, useState } from "react";

type CcUser = { id: string; email: string; full_name: string };
type Assignment = {
  id: string;
  batch_id: number;
  batch_name: string;
  batch_program: string | null;
  cc_user_id: string;
  cc_email: string;
  cc_name: string;
  created_at: string;
};
type Batch = {
  batch_id: number;
  name: string;
  program: string | null;
};

export function CCManagementTab() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<CcUser[]>([]);
  const [cachedBatches, setCachedBatches] = useState<Batch[]>([]);
  const [unassigned, setUnassigned] = useState<Batch[]>([]);

  const [selectedCcId, setSelectedCcId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");

  const [loading, setLoading] = useState(true);
  const [syncingBatches, setSyncingBatches] = useState(false);
  const [syncingAllLectures, setSyncingAllLectures] = useState(false);
  const [syncingLecture, setSyncingLecture] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [uploadBatchName, setUploadBatchName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [assignRes, userRes, unassignedRes] = await Promise.all([
        fetch("/api/admin/cc-management/assignments"),
        fetch("/api/admin/cc-management/users"),
        fetch("/api/admin/cc-management/unassigned-batches")
      ]);
      const [assignJson, userJson, unassignedJson] = await Promise.all([
        assignRes.json(),
        userRes.json(),
        unassignedRes.json()
      ]);
      setAssignments(assignJson.assignments ?? []);
      setUsers(userJson.users ?? []);
      setUnassigned(unassignedJson.batches ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function syncBatches() {
    setSyncingBatches(true);
    try {
      const res = await fetch("/api/admin/cc-management/sync-batches", { method: "POST" });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Synced.", res.ok);
      if (res.ok) await loadData();
    } finally {
      setSyncingBatches(false);
    }
  }

  async function syncLectures(batchId: number) {
    setSyncingLecture(batchId);
    try {
      const res = await fetch("/api/admin/cc-management/sync-lectures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId })
      });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Synced.", res.ok);
    } finally {
      setSyncingLecture(null);
    }
  }

  async function syncAllLectures() {
    setSyncingAllLectures(true);
    try {
      const res = await fetch("/api/admin/cc-management/sync-all-lectures", { method: "POST" });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Synced.", res.ok);
    } finally {
      setSyncingAllLectures(false);
    }
  }

  async function assign() {
    if (!selectedCcId || !selectedBatchId) {
      flash("Select a CC and a batch first.", false);
      return;
    }
    const batch = unassigned.find((b) => String(b.batch_id) === selectedBatchId);
    if (!batch) return;

    setAssigning(true);
    try {
      const res = await fetch("/api/admin/cc-management/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cc_user_id: selectedCcId,
          batch_id: batch.batch_id,
          batch_name: batch.name,
          batch_program: batch.program
        })
      });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Assigned.", res.ok);
      if (res.ok) {
        setSelectedCcId("");
        setSelectedBatchId("");
        await loadData();
      }
    } finally {
      setAssigning(false);
    }
  }

  async function removeAssignment(batchId: number) {
    setRemoving(batchId);
    try {
      const res = await fetch("/api/admin/cc-management/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId })
      });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Removed.", res.ok);
      if (res.ok) await loadData();
    } finally {
      setRemoving(null);
    }
  }

  async function uploadCurriculum(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !uploadBatchName) {
      flash("Select a batch and a file.", false);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("batch_name", uploadBatchName);
      const res = await fetch("/api/admin/cc-management/upload-curriculum", {
        method: "POST",
        body: fd
      });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Uploaded.", res.ok);
      if (res.ok && fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }

  const allBatches = [
    ...assignments.map((a) => ({ batch_id: a.batch_id, name: a.batch_name, program: a.batch_program })),
    ...unassigned
  ].sort((a, b) => a.name.localeCompare(b.name));

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-400">Loading CC management data…</p>;
  }

  return (
    <div className="space-y-8">
      {/* ── Flash message ── */}
      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            msg.ok
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ── Sync Batches + Sync All Lectures ── */}
      <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">LMS Sync</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Pull latest batches and sync lecture compliance data for all assigned batches.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={syncBatches}
              disabled={syncingBatches}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {syncingBatches ? "Syncing…" : "Sync Batches"}
            </button>
            <button
              onClick={syncAllLectures}
              disabled={syncingAllLectures}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {syncingAllLectures ? "Syncing…" : "Sync All Lectures"}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {allBatches.length} batch{allBatches.length !== 1 ? "es" : ""} in cache ·{" "}
          {unassigned.length} unassigned · auto-syncs every Sunday at 2 AM IST
        </p>
      </section>

      {/* ── Assign CC ── */}
      <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
        <h3 className="mb-4 text-base font-semibold text-white">Assign CC to Batch</h3>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedCcId}
            onChange={(e) => setSelectedCcId(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white"
          >
            <option value="">— Select CC —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ? `${u.full_name} (${u.email})` : u.email}
              </option>
            ))}
          </select>

          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white"
          >
            <option value="">— Select Unassigned Batch —</option>
            {unassigned.map((b) => (
              <option key={b.batch_id} value={String(b.batch_id)}>
                {b.name}{b.program ? ` · ${b.program}` : ""}
              </option>
            ))}
          </select>

          <button
            onClick={assign}
            disabled={assigning || !selectedCcId || !selectedBatchId}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {assigning ? "Assigning…" : "Assign"}
          </button>
        </div>
        {unassigned.length === 0 && (
          <p className="mt-3 text-xs text-amber-400">
            All batches are assigned. Sync from LMS to add more batches.
          </p>
        )}
      </section>

      {/* ── Current Assignments ── */}
      <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
        <h3 className="mb-4 text-base font-semibold text-white">Current CC Assignments</h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-400">No assignments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Batch</th>
                  <th className="pb-2 pr-4 font-medium">Program</th>
                  <th className="pb-2 pr-4 font-medium">CC</th>
                  <th className="pb-2 pr-4 font-medium">Sync Lectures</th>
                  <th className="pb-2 font-medium">Remove</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-white/5 text-slate-300">
                    <td className="py-2 pr-4 font-medium text-white">{a.batch_name}</td>
                    <td className="py-2 pr-4 text-slate-400">{a.batch_program ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="text-xs">
                        <div className="text-white">{a.cc_name || a.cc_email}</div>
                        {a.cc_name && <div className="text-slate-400">{a.cc_email}</div>}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        onClick={() => syncLectures(a.batch_id)}
                        disabled={syncingLecture === a.batch_id}
                        className="rounded-md bg-indigo-600/20 px-3 py-1 text-xs text-indigo-300 hover:bg-indigo-600/40 disabled:opacity-50"
                      >
                        {syncingLecture === a.batch_id ? "Syncing…" : "Sync"}
                      </button>
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => removeAssignment(a.batch_id)}
                        disabled={removing === a.batch_id}
                        className="rounded-md bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                      >
                        {removing === a.batch_id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Upload Curriculum ── */}
      <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
        <h3 className="mb-1 text-base font-semibold text-white">Upload Curriculum File</h3>
        <p className="mb-4 text-xs text-slate-400">
          CSV or Excel with <code className="rounded bg-slate-800 px-1">lecture_name</code> and{" "}
          <code className="rounded bg-slate-800 px-1">learning_objective</code> columns.
          This feeds the LO Tracker.
        </p>
        <form onSubmit={uploadCurriculum} className="flex flex-wrap gap-3">
          <select
            value={uploadBatchName}
            onChange={(e) => setUploadBatchName(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white"
          >
            <option value="">— Select Batch —</option>
            {allBatches.map((b) => (
              <option key={b.batch_id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-indigo-600/20 file:px-3 file:py-1 file:text-xs file:text-indigo-300"
          />
          <button
            type="submit"
            disabled={uploading}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </section>
    </div>
  );
}
