"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";

import { formatLectureDate, formatLectureTime } from "@/lib/deadlines";
import { LoTrackerRow } from "@/lib/types";

function canAddSessionLink(lectureDate: string): boolean {
  // Link can be added / edited any time (admin always has access)
  // The "1 day prior" is a guideline shown in the UI
  return true;
}

function lectureEnded(lectureDate: string, endTime: string): boolean {
  const end = DateTime.fromISO(`${lectureDate}T${endTime}`, {
    zone: "Asia/Kolkata"
  }).plus({ hours: 1 });
  return DateTime.now().setZone("Asia/Kolkata") >= end;
}

function LoStatusBadge({ covered, missing }: { covered: number; missing: number }) {
  if (covered === 0 && missing === 0) return null;
  const total = covered + missing;
  const pct = Math.round((covered / total) * 100);
  const color =
    pct === 100
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
      : pct >= 60
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
        : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-current/20 ${color}`}>
      {pct}% covered
    </span>
  );
}

function TranscriptPanel({
  row,
  onDone
}: {
  row: LoTrackerRow;
  onDone: () => void;
}) {
  const [transcript, setTranscript] = useState(row.lo_report?.transcript ?? "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const canAnalyze = lectureEnded(row.lecture_date, row.end_time);

  function handleAnalyze() {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/lo-tracker/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript })
      });
      const json = (await res.json()) as { message?: string };
      setMessage(json.message ?? (res.ok ? "Analysis complete!" : "Analysis failed."));
      if (res.ok) onDone();
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        rows={5}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the lecture transcript or summary here…"
        className="theme-input w-full rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100 resize-none"
      />
      {!canAnalyze && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Analysis unlocks 1 hour after the lecture ends.
        </p>
      )}
      {message && <p className="text-xs theme-muted">{message}</p>}
      <button
        type="button"
        disabled={isPending || !transcript.trim() || !canAnalyze}
        onClick={handleAnalyze}
        className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-5 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        {isPending ? "Analyzing…" : "Analyze LOs"}
      </button>
    </div>
  );
}

export function LoTrackerClient({ rows }: { rows: LoTrackerRow[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcriptOpenId, setTranscriptOpenId] = useState<string | null>(null);
  const [editLinkId, setEditLinkId] = useState<string | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [savingLinkId, setSavingLinkId] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<Record<string, string>>({});
  const [batchFilter, setBatchFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isPending, startTransition] = useTransition();

  const batches = [...new Set(rows.map((r) => r.batch_name))].sort();

  const filtered = rows.filter((r) => {
    const batchOk = batchFilter === "all" || r.batch_name === batchFilter;
    const fromOk = !dateFrom || r.lecture_date >= dateFrom;
    const toOk = !dateTo || r.lecture_date <= dateTo;
    return batchOk && fromOk && toOk;
  });

  function startEditLink(row: LoTrackerRow) {
    setEditLinkId(row.id);
    setLinkValue(row.session_link ?? "");
  }

  function saveLink(lectureId: string) {
    startTransition(async () => {
      setSavingLinkId(lectureId);
      const res = await fetch(`/api/lo-tracker/${lectureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_link: linkValue })
      });
      const json = (await res.json()) as { message?: string };
      setLinkMessage((prev) => ({ ...prev, [lectureId]: json.message ?? "" }));
      setSavingLinkId(null);
      setEditLinkId(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-12 text-center shadow-panel dark:border-slate-700 dark:bg-slate-800/40">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">No Data Yet</p>
        <h3 className="mt-3 font-[var(--font-heading)] text-3xl font-bold text-ink">
          Import a weekly sheet to see Learning Objectives
        </h3>
        <p className="theme-muted mx-auto mt-3 max-w-xl text-sm">
          Make sure your import sheet includes a <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">Learning_Objective</code> column.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section className="theme-panel rounded-3xl p-6 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">LO Tracker</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-ink">
              Learning Objectives coverage per lecture
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
              Batch
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
              >
                <option value="all">All batches</option>
                {batches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>

            <div className="theme-muted flex flex-col gap-2 text-sm font-medium">
              Week
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <span className="text-slate-400 dark:text-slate-500">→</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 transition hover:border-rose-300 hover:text-rose-500 dark:border-slate-600 dark:text-slate-500 dark:hover:border-rose-700 dark:hover:text-rose-400"
                    title="Clear date filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">No Matching Lectures</p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/70 dark:divide-slate-700/70">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  <th className="pb-3 pr-4 pt-3">Lecture</th>
                  <th className="pb-3 pr-4 pt-3">Learning Objectives</th>
                  <th className="pb-3 pr-4 pt-3">Session Link</th>
                  <th className="pb-3 pr-4 pt-3">Transcript</th>
                  <th className="pb-3 pr-4 pt-3">Covered LO's</th>
                  <th className="pb-3 pt-3">Missing LO's</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-700/60">
                {filtered.map((row) => {
                  const report = row.lo_report;
                  const isTranscriptOpen = transcriptOpenId === row.id;
                  const isEditingLink = editLinkId === row.id;
                  const ended = lectureEnded(row.lecture_date, row.end_time);

                  return (
                    <tr key={row.id} className="align-top">
                      {/* Lecture */}
                      <td className="py-4 pr-4 min-w-[160px]">
                        <p className="font-semibold text-ink">{row.lecture_name}</p>
                        <p className="theme-muted mt-1 text-xs">{row.batch_name}</p>
                        <p className="theme-muted mt-0.5 text-xs">
                          {formatLectureDate(row.lecture_date)} · {formatLectureTime(row.start_time)} – {formatLectureTime(row.end_time)}
                        </p>
                        {report && (
                          <div className="mt-2">
                            <LoStatusBadge
                              covered={report.covered_los?.length ?? 0}
                              missing={report.missing_los?.length ?? 0}
                            />
                          </div>
                        )}
                      </td>

                      {/* LOs */}
                      <td className="py-4 pr-4 max-w-[240px]">
                        {row.learning_objective ? (
                          <p className="theme-muted text-sm leading-relaxed whitespace-pre-line">
                            {row.learning_objective}
                          </p>
                        ) : (
                          <span className="theme-muted text-sm italic">Not set</span>
                        )}
                      </td>

                      {/* Session Link */}
                      <td className="py-4 pr-4 min-w-[180px]">
                        {isEditingLink ? (
                          <div className="flex flex-col gap-2">
                            <input
                              value={linkValue}
                              onChange={(e) => setLinkValue(e.target.value)}
                              placeholder="https://..."
                              className="theme-input rounded-2xl px-3 py-1.5 text-xs text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100 w-full"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => saveLink(row.id)}
                                className="inline-flex h-7 items-center justify-center rounded-full bg-brand px-3 text-xs font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                              >
                                {savingLinkId === row.id ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditLinkId(null)}
                                className="theme-button-secondary inline-flex h-7 items-center justify-center rounded-full px-3 text-xs font-semibold"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {row.session_link ? (
                              <a
                                href={row.session_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-brand hover:underline break-all"
                              >
                                View Session ↗
                              </a>
                            ) : (
                              <span className="theme-muted text-xs italic">No link yet</span>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditLink(row)}
                              className="theme-button-secondary inline-flex h-7 w-fit items-center justify-center rounded-full px-3 text-xs font-semibold"
                            >
                              Edit
                            </button>
                            {linkMessage[row.id] && (
                              <p className="text-xs theme-muted">{linkMessage[row.id]}</p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Transcript */}
                      <td className="py-4 pr-4 min-w-[200px]">
                        {isTranscriptOpen ? (
                          <TranscriptPanel
                            row={row}
                            onDone={() => { setTranscriptOpenId(null); router.refresh(); }}
                          />
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {report?.transcript ? (
                              <p className="theme-muted text-xs line-clamp-3 leading-relaxed">
                                {report.transcript}
                              </p>
                            ) : (
                              <span className="theme-muted text-xs italic">
                                {ended ? "No transcript yet" : "Available after lecture ends"}
                              </span>
                            )}
                            {report?.status === "analyzing" && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse">
                                Analyzing…
                              </span>
                            )}
                            {ended && (
                              <button
                                type="button"
                                onClick={() => setTranscriptOpenId(row.id)}
                                className="theme-button-secondary inline-flex h-7 w-fit items-center justify-center rounded-full px-3 text-xs font-semibold"
                              >
                                {report?.transcript ? "Edit & Re-analyze" : "Add Transcript"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Covered LOs */}
                      <td className="py-4 pr-4 min-w-[200px]">
                        {report?.covered_los && report.covered_los.length > 0 ? (
                          <ul className="space-y-1">
                            {report.covered_los.map((lo, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0">✓</span>
                                <span className="text-xs text-ink leading-relaxed">{lo}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="theme-muted text-xs italic">
                            {report?.status === "completed" ? "None covered" : "—"}
                          </span>
                        )}
                      </td>

                      {/* Missing LOs */}
                      <td className="py-4 min-w-[200px]">
                        {report?.missing_los && report.missing_los.length > 0 ? (
                          <ul className="space-y-1">
                            {report.missing_los.map((lo, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="mt-0.5 text-rose-500 dark:text-rose-400 flex-shrink-0">✗</span>
                                <span className="text-xs text-ink leading-relaxed">{lo}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="theme-muted text-xs italic">
                            {report?.status === "completed" ? "All covered! 🎉" : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
