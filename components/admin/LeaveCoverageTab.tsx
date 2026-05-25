"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

import { TopProgressBar } from "@/components/top-progress-bar";

type CcUser = { id: string; email: string; full_name: string };
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

export function LeaveCoverageTab() {
  const [users, setUsers] = useState<CcUser[]>([]);
  const [coverages, setCoverages] = useState<LeaveCoverage[]>([]);
  const [coverageDate, setCoverageDate] = useState(DateTime.now().toISODate() ?? "");
  const [leaveOnLeaveId, setLeaveOnLeaveId] = useState("");
  const [leaveCoveringId, setLeaveCoveringId] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigningCoverage, setAssigningCoverage] = useState(false);
  const [removingCoverageId, setRemovingCoverageId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cc-management/users");
      const json = (await res.json()) as { users?: CcUser[] };
      setUsers(json.users ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadCoverages(date: string) {
    const res = await fetch(`/api/admin/cc-management/leave-coverage?date=${date}`);
    if (res.ok) {
      const json = (await res.json()) as { coverages?: LeaveCoverage[] };
      setCoverages(json.coverages ?? []);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadCoverages(coverageDate);
  }, [coverageDate]);

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
      const json = (await res.json()) as { message?: string };
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
      const json = (await res.json()) as { message?: string };
      flash(json.message ?? "Removed.", res.ok);
      if (res.ok) await loadCoverages(coverageDate);
    } finally {
      setRemovingCoverageId(null);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-400">Loading coverage data…</p>;
  }

  return (
    <>
      <TopProgressBar isLoading={assigningCoverage || removingCoverageId !== null} />
      <div className="space-y-6">
        {msg && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              msg.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Assign form */}
        <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
          <h3 className="mb-1 text-base font-semibold text-white">Assign Coverage</h3>
          <p className="mb-5 text-xs text-slate-400">
            The covering CC will be able to view and sync the absent CC&apos;s data for the
            selected date.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              type="date"
              value={coverageDate}
              onChange={(e) => setCoverageDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
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
        </section>

        {/* Coverage list for selected date */}
        <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
          <h3 className="mb-4 text-base font-semibold text-white">
            Coverage for{" "}
            <span className="text-amber-400">{coverageDate}</span>
          </h3>
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
                          <div className="font-medium text-white">{c.on_leave_name}</div>
                          <div className="text-slate-400">{c.on_leave_email}</div>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="text-xs">
                          <div className="font-medium text-white">{c.covering_name}</div>
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
        </section>
      </div>
    </>
  );
}
