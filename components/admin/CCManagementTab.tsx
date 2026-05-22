"use client";

import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";

import { TopProgressBar } from "@/components/top-progress-bar";

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
type LeaveCoverage = {
  id: string;
  on_leave_cc_id: string;
  covering_cc_id: string;
  coverage_date: string;
  on_leave_name: string;
  on_leave_email: string;
  covering_name: string;
  covering_email: string;
  assigned_by_name: string;
};

export function CCManagementTab() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<CcUser[]>([]);
  const [unassigned, setUnassigned] = useState<Batch[]>([]);

  const [selectedCcId, setSelectedCcId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);
  const batchSearchRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [syncingBatches, setSyncingBatches] = useState(false);
  const [syncingAllLectures, setSyncingAllLectures] = useState(false);
  const [syncingLecture, setSyncingLecture] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [uploadBatchName, setUploadBatchName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ text: string; ok: boolean; count?: number } | null>(null);
  const [curriculumCounts, setCurriculumCounts] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Leave Coverage state
  const [coverages, setCoverages] = useState<LeaveCoverage[]>([]);
  const [coverageDate, setCoverageDate] = useState(DateTime.now().toISODate() ?? "");
  const [leaveOnLeaveId, setLeaveOnLeaveId] = useState("");
  const [leaveCoveringId, setLeaveCoveringId] = useState("");
  const [assigningCoverage, setAssigningCoverage] = useState(false);
  const [removingCoverageId, setRemovingCoverageId] = useState<string | null>(null);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [assignRes, userRes, unassignedRes, curriculumRes] = await Promise.all([
        fetch("/api/admin/cc-management/assignments"),
        fetch("/api/admin/cc-management/users"),
        fetch("/api/admin/cc-management/unassigned-batches"),
        fetch("/api/admin/cc-management/curriculum-counts")
      ]);
      const [assignJson, userJson, unassignedJson, curriculumJson] = await Promise.all([
        assignRes.json(),
        userRes.json(),
        unassignedRes.json(),
        curriculumRes.ok ? curriculumRes.json() : Promise.resolve({ counts: {} })
      ]);
      setAssignments(assignJson.assignments ?? []);
      setUsers(userJson.users ?? []);
      setUnassigned(unassignedJson.batches ?? []);
      setCurriculumCounts(curriculumJson.counts ?? {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function loadCoverages(date: string) {
    const res = await fetch(`/api/admin/cc-management/leave-coverage?date=${date}`);
    if (res.ok) {
      const json = await res.json() as { coverages?: LeaveCoverage[] };
      setCoverages(json.coverages ?? []);
    }
  }

  useEffect(() => { loadCoverages(coverageDate); }, [coverageDate]);

  async function assignCoverage() {
    if (!leaveOnLeaveId || !leaveCoveringId || !coverageDate) {
      flash("Select both CCs and a date.", false);
      return;
    }
    setAssigningCoverage(true);
    try {
      const res = await fetch("/api/admin/cc-management/leave-coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          on_leave_cc_id: leaveOnLeaveId,
          covering_cc_id: leaveCoveringId,
          coverage_date: coverageDate,
        }),
      });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Coverage assigned.", res.ok);
      if (res.ok) {
        setLeaveOnLeaveId("");
        setLeaveCoveringId("");
        await loadCoverages(coverageDate);
      }
    } finally {
      setAssigningCoverage(false);
    }
  }

  async function removeCoverage(id: string) {
    setRemovingCoverageId(id);
    try {
      const res = await fetch("/api/admin/cc-management/leave-coverage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Removed.", res.ok);
      if (res.ok) await loadCoverages(coverageDate);
    } finally {
      setRemovingCoverageId(null);
    }
  }

  async function syncBatches() {
    setSyncingBatches(true);
    try {
      const res = await fetch("/api/admin/cc-management/sync-batches", { method: "POST" });
      const json = await res.json() as { message?: string };
      flash(json.message ?? "Synced.", res.ok);
      if (res.ok) {
        await loadData();
        window.location.reload();
      }
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
      if (res.ok) window.location.reload();
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
      if (res.ok) window.location.reload();
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
        setBatchSearch("");
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
      setUploadResult({ text: "Select a batch and a file.", ok: false });
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("batch_name", uploadBatchName);
      const res = await fetch("/api/admin/cc-management/upload-curriculum", {
        method: "POST",
        body: fd
      });
      const json = await res.json() as { message?: string; count?: number };
      if (res.ok) {
        setUploadResult({ text: json.message ?? "Uploaded.", ok: true, count: json.count });
        if (fileInputRef.current) fileInputRef.current.value = "";
        // Refresh curriculum counts to update the assignments table badge
        const countRes = await fetch("/api/admin/cc-management/curriculum-counts");
        if (countRes.ok) {
          const countJson = await countRes.json() as { counts?: Record<string, number> };
          setCurriculumCounts(countJson.counts ?? {});
        }
      } else {
        setUploadResult({ text: json.message ?? "Upload failed.", ok: false });
      }
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (batchSearchRef.current && !batchSearchRef.current.contains(e.target as Node)) {
        setBatchDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBatches = unassigned.filter((b) =>
    b.name.toLowerCase().includes(batchSearch.toLowerCase()) ||
    (b.program ?? "").toLowerCase().includes(batchSearch.toLowerCase())
  );

  const selectedBatch = unassigned.find((b) => String(b.batch_id) === selectedBatchId);

  const allBatches = [
    ...assignments.map((a) => ({ batch_id: a.batch_id, name: a.batch_name, program: a.batch_program })),
    ...unassigned
  ].sort((a, b) => a.name.localeCompare(b.name));

  const isAnyLoading =
    loading ||
    syncingBatches ||
    syncingAllLectures ||
    syncingLecture !== null ||
    assigning ||
    uploading;

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-400">Loading CC management data…</p>;
  }

  return (
    <>
    <TopProgressBar isLoading={isAnyLoading} />
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

          <div ref={batchSearchRef} className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder={selectedBatch ? `${selectedBatch.name}${selectedBatch.program ? ` · ${selectedBatch.program}` : ""}` : "— Select Unassigned Batch —"}
              value={batchSearch}
              onChange={(e) => {
                setBatchSearch(e.target.value);
                setBatchDropdownOpen(true);
                if (!e.target.value) setSelectedBatchId("");
              }}
              onFocus={() => setBatchDropdownOpen(true)}
              className="w-full rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
            {batchDropdownOpen && filteredBatches.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-white/10 bg-[#1a2236] py-1 shadow-xl">
                {filteredBatches.map((b) => (
                  <li
                    key={b.batch_id}
                    onMouseDown={() => {
                      setSelectedBatchId(String(b.batch_id));
                      setBatchSearch("");
                      setBatchDropdownOpen(false);
                    }}
                    className="cursor-pointer px-3 py-2 text-sm text-white hover:bg-indigo-600/30"
                  >
                    {b.name}{b.program ? <span className="ml-1 text-slate-400">· {b.program}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {batchDropdownOpen && batchSearch && filteredBatches.length === 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-slate-400 shadow-xl">
                No batches match &ldquo;{batchSearch}&rdquo;
              </div>
            )}
          </div>

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
                  <th className="pb-2 pr-4 font-medium">Curriculum</th>
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
                      {curriculumCounts[a.batch_name] ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                          ✓ {curriculumCounts[a.batch_name]} LOs
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                          No curriculum
                        </span>
                      )}
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

      {/* ── Leave Coverage ── */}
      <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
        <h3 className="mb-1 text-base font-semibold text-white">Leave Coverage</h3>
        <p className="mb-4 text-xs text-slate-400">
          Assign a CC to cover another CC&apos;s dashboard when they are on leave. The covering CC
          will be able to view and sync the absent CC&apos;s data for that date.
        </p>

        {/* Assign form */}
        <div className="flex flex-wrap gap-3">
          <input
            type="date"
            value={coverageDate}
            onChange={(e) => setCoverageDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={leaveOnLeaveId}
            onChange={(e) => setLeaveOnLeaveId(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white"
          >
            <option value="">— CC on leave —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id} disabled={u.id === leaveCoveringId}>
                {u.full_name ? `${u.full_name} (${u.email})` : u.email}
              </option>
            ))}
          </select>
          <select
            value={leaveCoveringId}
            onChange={(e) => setLeaveCoveringId(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white"
          >
            <option value="">— Covering CC —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id} disabled={u.id === leaveOnLeaveId}>
                {u.full_name ? `${u.full_name} (${u.email})` : u.email}
              </option>
            ))}
          </select>
          <button
            onClick={assignCoverage}
            disabled={assigningCoverage || !leaveOnLeaveId || !leaveCoveringId || !coverageDate}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {assigningCoverage ? "Assigning…" : "Assign Coverage"}
          </button>
        </div>

        {/* Coverage table for selected date */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Coverage for {coverageDate}
          </p>
          {coverages.length === 0 ? (
            <p className="text-sm text-slate-500">No coverage assigned for this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-xs text-slate-400">
                    <th className="pb-2 pr-4 font-medium">CC on Leave</th>
                    <th className="pb-2 pr-4 font-medium">Covered By</th>
                    <th className="pb-2 pr-4 font-medium">Assigned By</th>
                    <th className="pb-2 font-medium">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {coverages.map((c) => (
                    <tr key={c.id} className="border-b border-white/5 text-slate-300">
                      <td className="py-2 pr-4">
                        <div className="text-xs">
                          <div className="text-white">{c.on_leave_name}</div>
                          <div className="text-slate-400">{c.on_leave_email}</div>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="text-xs">
                          <div className="text-white">{c.covering_name}</div>
                          <div className="text-slate-400">{c.covering_email}</div>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-400">{c.assigned_by_name}</td>
                      <td className="py-2">
                        <button
                          onClick={() => removeCoverage(c.id)}
                          disabled={removingCoverageId === c.id}
                          className="rounded-md bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                        >
                          {removingCoverageId === c.id ? "Removing…" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
        {uploadResult && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
              uploadResult.ok
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            <span className="shrink-0">{uploadResult.ok ? "✓" : "✗"}</span>
            <span>
              {uploadResult.text}
              {uploadResult.ok && uploadResult.count !== undefined && (
                <span className="ml-1 font-semibold">({uploadResult.count} rows uploaded)</span>
              )}
            </span>
          </div>
        )}
      </section>
    </div>
    </>
  );
}
