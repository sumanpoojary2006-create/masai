"use client";

import { useRef, useState } from "react";

interface Props {
  batchName: string;
  initialCount: number;
}

export function CcCurriculumUpload({ batchName, initialCount }: Props) {
  const [count, setCount] = useState(initialCount);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setResult({ text: "Select a CSV or Excel file first.", ok: false });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("batch_name", batchName);

      const res = await fetch("/api/admin/cc-management/upload-curriculum", {
        method: "POST",
        body: fd,
      });

      const json = (await res.json()) as { message?: string; count?: number };

      if (res.ok) {
        setResult({ text: json.message ?? "Uploaded.", ok: true });
        if (json.count !== undefined) setCount(json.count);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setResult({ text: json.message ?? "Upload failed.", ok: false });
      }
    } catch {
      setResult({ text: "Network error. Please try again.", ok: false });
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/8 bg-[#0f1729] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Curriculum</h2>
          <p className="mt-1 text-sm text-slate-400">
            Upload a CSV or Excel file with{" "}
            <code className="rounded bg-slate-800 px-1 text-xs">lecture_name</code> and{" "}
            <code className="rounded bg-slate-800 px-1 text-xs">learning_objective</code>{" "}
            columns. Re-uploading replaces the existing curriculum.
          </p>
        </div>
        {count > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            ✓ {count} learning objectives loaded
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-slate-600/50 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-400">
            No curriculum uploaded yet
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="flex-1 min-w-[220px] rounded-xl border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600/20 file:px-3 file:py-1 file:text-xs file:text-indigo-300 file:cursor-pointer"
        />
        <button
          type="submit"
          disabled={uploading}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {result && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            result.ok
              ? "bg-emerald-500/12 text-emerald-300 border border-emerald-500/20"
              : "bg-rose-500/12 text-rose-300 border border-rose-500/20"
          }`}
        >
          <span className="shrink-0 mt-px">{result.ok ? "✓" : "✗"}</span>
          <span>{result.text}</span>
        </div>
      )}
    </section>
  );
}
