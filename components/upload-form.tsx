"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export function UploadForm({ batchNames }: { batchNames: string[] }) {
  const router = useRouter();

  // ── Bulk options state ──
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
          LMS Sync & CSV Import
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
