"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export function UploadForm({ batchNames }: { batchNames: string[] }) {
  const router = useRouter();

  // ── Single-lecture form state ──
  const [batchName, setBatchName] = useState(batchNames[0] ?? "");
  const [moduleName, setModuleName] = useState("");
  const [lectureName, setLectureName] = useState("");
  const [lectureDate, setLectureDate] = useState("");
  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("21:30");
  const [learningObjective, setLearningObjective] = useState("");
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [isAdding, startAdding] = useTransition();

  // ── Secondary section state ──
  const [showSecondary, setShowSecondary] = useState(false);

  // ── CSV import state ──
  const [file, setFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, startImporting] = useTransition();

  // ── LMS sync state ──
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const configuredBatchLabel = useMemo(() => batchNames.join(", "), [batchNames]);

  // ── Handlers ──

  async function handleAddLecture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddMessage(null);

    if (!batchName || !lectureName || !lectureDate) {
      setAddMessage("Batch, lecture name and date are required.");
      return;
    }

    startAdding(async () => {
      const response = await fetch("/api/lectures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_name: batchName,
          module_name: moduleName,
          lecture_name: lectureName,
          learning_objective: learningObjective,
          lecture_date: lectureDate,
          start_time: startTime ? `${startTime}:00` : undefined,
          end_time: endTime ? `${endTime}:00` : undefined
        })
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setAddMessage(payload.message ?? "Failed to add lecture.");
        return;
      }

      setAddMessage(payload.message ?? "Lecture added.");
      setModuleName("");
      setLectureName("");
      setLectureDate("");
      setStartTime("20:00");
      setEndTime("21:30");
      setLearningObjective("");
      router.refresh();
    });
  }

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setImportMessage("Choose a CSV or Excel file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    startImporting(async () => {
      setImportMessage("Importing lectures and generating tasks...");

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setImportMessage(payload.message ?? "Import failed.");
        return;
      }

      setImportMessage(payload.message ?? "Upload completed.");
      setFile(null);
      router.refresh();
    });
  }

  async function handleSyncWeek() {
    setIsSyncing(true);
    setSyncMessage("Syncing this week's live sessions from LMS...");

    try {
      const response = await fetch("/api/lectures/sync-week", { method: "POST" });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setSyncMessage(payload.message ?? "Sync failed.");
        return;
      }

      setSyncMessage(payload.message ?? "Sync started.");
      setTimeout(() => router.refresh(), 8000);
    } catch {
      setSyncMessage("Sync request failed. Check your connection.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ════════════════════════════════════════
          PRIMARY — Add a single lecture
      ════════════════════════════════════════ */}
      <div className="theme-panel rounded-3xl p-6 shadow-panel backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Add Lecture</p>
        <h2 className="mt-1 font-[var(--font-heading)] text-xl font-bold text-ink">
          Track a new lecture
        </h2>
        <p className="theme-muted mt-1 text-sm">
          Fill in the details below. Pre-read, Notes and Assignment tasks are created automatically.
        </p>

        <form onSubmit={handleAddLecture} className="mt-5 space-y-4">
          {/* Row 1 — Batch + Module */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                Batch <span className="text-red-500">*</span>
              </label>
              <select
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                required
                className="theme-input h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand dark:border-slate-700 dark:bg-slate-800"
              >
                {batchNames.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                Module / Subject
              </label>
              <input
                type="text"
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                placeholder="e.g. DSA, Full Stack"
                className="theme-input h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Row 2 — Lecture name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Lecture Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lectureName}
              onChange={(e) => setLectureName(e.target.value)}
              placeholder="e.g. Arrays & Strings"
              required
              className="theme-input h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          {/* Row 3 — Date + Start + End */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={lectureDate}
                onChange={(e) => setLectureDate(e.target.value)}
                required
                className="theme-input h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="theme-input h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="theme-input h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Row 4 — Learning objective */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Learning Objective <span className="text-ink/30">(optional)</span>
            </label>
            <textarea
              value={learningObjective}
              onChange={(e) => setLearningObjective(e.target.value)}
              rows={2}
              placeholder="What should students be able to do after this lecture?"
              className="theme-input rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isAdding}
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isAdding ? "Adding…" : "Add Lecture"}
            </button>

            {addMessage && (
              <p className="text-sm text-ink/70">{addMessage}</p>
            )}
          </div>
        </form>
      </div>

      {/* ════════════════════════════════════════
          SECONDARY — LMS Sync & CSV Import
      ════════════════════════════════════════ */}
      <div className="theme-panel rounded-3xl shadow-panel backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSecondary((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand/80">
              Bulk Options
            </p>
            <p className="mt-0.5 text-sm text-ink/60">
              Auto-sync from LMS or upload a CSV / Excel file
            </p>
          </div>
          <span className="text-lg text-ink/40 transition-transform" style={{ transform: showSecondary ? "rotate(180deg)" : "rotate(0deg)" }}>
            ▾
          </span>
        </button>

        {showSecondary && (
          <div className="border-t border-slate-200 px-6 pb-6 pt-5 space-y-6 dark:border-slate-700">
            {/* ── Sync from LMS ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-ink">Sync from LMS</h3>
                <p className="theme-muted mt-1 max-w-xl text-sm">
                  Automatically fetch this week&apos;s live sessions from the Masai LMS and add them to
                  the tracker. Runs in the background — lectures appear in ~2 minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSyncWeek}
                disabled={isSyncing || isImporting}
                className="shrink-0 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSyncing ? (
                  <>
                    <span className="animate-spin">⟳</span> Syncing…
                  </>
                ) : (
                  <>⬇ Sync This Week</>
                )}
              </button>
            </div>

            {syncMessage && <p className="text-sm text-ink/70">{syncMessage}</p>}

            <div className="border-t border-slate-200 dark:border-slate-700" />

            {/* ── CSV upload ── */}
            <form onSubmit={handleImport}>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="font-semibold text-ink">Upload a Lecture Sheet</h3>
                  <p className="theme-muted mt-1 max-w-2xl text-sm">
                    Batches: <span className="font-medium">{configuredBatchLabel}</span>. Upload a{" "}
                    <code>.csv</code>, <code>.xlsx</code>, or <code>.xls</code> file with columns
                    for batch, module, lecture name, and date.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isImporting || isSyncing}
                  className="shrink-0 inline-flex h-10 items-center justify-center rounded-full bg-slate-700 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isImporting ? "Uploading..." : "Import Schedule"}
                </button>
              </div>

              <label className="theme-dropzone mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl px-6 py-5 text-center transition">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <span className="text-sm font-semibold text-ink">
                  {file ? file.name : "Drop a file here or click to browse"}
                </span>
                <span className="theme-muted mt-1 text-xs">
                  Each imported lecture automatically creates Pre-read, Lecture Notes, and
                  Assignment tasks.
                </span>
              </label>

              {importMessage && <p className="mt-3 text-sm text-ink/70">{importMessage}</p>}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
