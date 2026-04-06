"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-panel backdrop-blur"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
            Weekly Import
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-ink">
            Upload the lecture sheet
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Accepts `.csv`, `.xlsx`, or `.xls` with the required columns for batch,
            module, lecture, date, and timings.
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isPending ? "Uploading..." : "Import Schedule"}
        </button>
      </div>

      <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-brand hover:bg-teal-50">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <span className="text-sm font-semibold text-slate-700">
          {file ? file.name : "Drop a file here or click to browse"}
        </span>
        <span className="mt-2 text-xs text-slate-500">
          Each imported lecture automatically creates Pre-read, Lecture Notes, and
          Assignment tasks.
        </span>
      </label>

      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
    </form>
  );
}

