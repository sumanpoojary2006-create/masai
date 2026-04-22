"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export function UploadForm({ batchNames }: { batchNames: string[] }) {
  const router = useRouter();

  // ── Optional import section state ──
  const [showImportOptions, setShowImportOptions] = useState(false);

  // ── CSV import state ──
  const [file, setFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, startImporting] = useTransition();

  // ── LMS sync state ──
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const configuredBatchLabel = useMemo(() => batchNames.join(", "), [batchNames]);

  // ── Handlers ──

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
    setSyncMessage("Loading... syncing this week's live sessions from LMS.");

    try {
      const response = await fetch("/api/lectures/sync-week", { method: "POST" });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setSyncMessage(payload.message ?? "Sync failed.");
        setIsSyncing(false);
        return;
      }

      // Keep loading state visible while background workflow processes the sync.
      setSyncMessage("Loading... sync in progress. Please wait.");
      setTimeout(() => {
        router.refresh();
        setIsSyncing(false);
      }, 120000);
    } catch {
      setSyncMessage("Sync request failed. Check your connection.");
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      {isSyncing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Loading</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              Sync in progress. Lectures will refresh once complete.
            </p>
          </div>
        </div>
      ) : null}

      {/* Standalone sync action */}
      <div className="theme-panel rounded-3xl shadow-panel backdrop-blur overflow-hidden">
        <div className="px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand/80">
              Sync
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Fetch this week's live sessions from LMS.
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Runs in background and updates dashboard after completion.
            </p>
            <button
              type="button"
              onClick={handleSyncWeek}
              disabled={isSyncing || isImporting}
              className="shrink-0 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              ⬇ Sync This Week
            </button>
          </div>
          {syncMessage && <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{syncMessage}</p>}
        </div>
      </div>

      {/* Optional import area (instead of forced bulk dropdown) */}
      <div className="theme-panel rounded-3xl shadow-panel backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => setShowImportOptions((value) => !value)}
          className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand/80">
              Import Options (Optional)
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Upload a CSV or Excel lecture sheet.
            </p>
          </div>
          <span
            className="text-lg text-slate-500 transition-transform dark:text-slate-300"
            style={{ transform: showImportOptions ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▾
          </span>
        </button>

        {showImportOptions ? (
          <div className="border-t border-slate-200 px-6 pb-6 pt-5 dark:border-slate-700">
            <form onSubmit={handleImport}>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="font-semibold text-ink">Upload a Lecture Sheet</h3>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
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
                <span className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Each imported lecture automatically creates Pre-read, Lecture Notes, and
                  Assignment tasks.
                </span>
              </label>

              {importMessage ? <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{importMessage}</p> : null}
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
