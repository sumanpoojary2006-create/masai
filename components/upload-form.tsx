"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export function UploadForm({ batchNames }: { batchNames: string[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const configuredBatchLabel = useMemo(() => batchNames.join(", "), [batchNames]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setMessage("Choose a CSV or Excel file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      setMessage("Importing lectures and generating tasks...");

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(payload.message ?? "Import failed.");
        return;
      }

      setMessage(payload.message ?? "Upload completed.");
      setFile(null);
      router.refresh();
    });
  }

  async function handleSyncWeek() {
    setIsSyncing(true);
    setMessage("Syncing this week's live sessions from LMS...");

    try {
      const response = await fetch("/api/lectures/sync-week", { method: "POST" });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(payload.message ?? "Sync failed.");
        return;
      }

      setMessage(payload.message ?? "Sync started.");
      // Refresh after a short delay to show newly added lectures
      setTimeout(() => router.refresh(), 8000);
    } catch {
      setMessage("Sync request failed. Check your connection.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="theme-panel rounded-3xl p-6 shadow-panel backdrop-blur space-y-5">
      {/* ── Sync from LMS ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
            Auto Import
          </p>
          <h2 className="mt-1 font-[var(--font-heading)] text-xl font-bold text-ink">
            Sync from LMS
          </h2>
          <p className="theme-muted mt-1 max-w-xl text-sm">
            Automatically fetch this week's live sessions from the Masai LMS and add them to the
            tracker. Runs in the background — lectures appear in ~2 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSyncWeek}
          disabled={isSyncing || isPending}
          className="shrink-0 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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

      <div className="border-t border-slate-200 dark:border-slate-700" />

      {/* ── Manual CSV upload ── */}
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Manual Import
            </p>
            <h2 className="mt-1 font-[var(--font-heading)] text-xl font-bold text-ink">
              Upload a lecture sheet
            </h2>
            <p className="theme-muted mt-1 max-w-2xl text-sm">
              Batches: <span className="font-medium">{configuredBatchLabel}</span>. Upload a{" "}
              <code>.csv</code>, <code>.xlsx</code>, or <code>.xls</code> file with columns for
              batch, module, lecture name, and date.
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending || isSyncing}
            className="shrink-0 inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isPending ? "Uploading..." : "Import Schedule"}
          </button>
        </div>

        <label className="theme-dropzone mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl px-6 py-6 text-center transition">
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
            Each imported lecture automatically creates Pre-read, Lecture Notes, and Assignment tasks.
          </span>
        </label>
      </form>

      {message ? (
        <p className="theme-muted text-sm">{message}</p>
      ) : null}
    </div>
  );
}
