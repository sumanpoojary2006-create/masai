"use client";

import { useEffect, useRef, useState } from "react";

import { TopProgressBar } from "@/components/top-progress-bar";

type Batch = { batch_id: number; name: string; program: string | null };

export function CurriculumTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [curriculumCounts, setCurriculumCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [uploadBatchName, setUploadBatchName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    text: string;
    ok: boolean;
    count?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [assignRes, unassignedRes, curriculumRes] = await Promise.all([
        fetch("/api/admin/cc-management/assignments"),
        fetch("/api/admin/cc-management/unassigned-batches"),
        fetch("/api/admin/cc-management/curriculum-counts"),
      ]);
      const [assignJson, unassignedJson, curriculumJson] = await Promise.all([
        assignRes.json() as Promise<{
          assignments?: { batch_id: number; batch_name: string; batch_program: string | null }[];
        }>,
        unassignedRes.json() as Promise<{ batches?: Batch[] }>,
        curriculumRes.ok
          ? (curriculumRes.json() as Promise<{ counts?: Record<string, number> }>)
          : Promise.resolve({ counts: {} }),
      ]);
      const assigned = (assignJson.assignments ?? []).map((a) => ({
        batch_id: a.batch_id,
        name: a.batch_name,
        program: a.batch_program,
      }));
      const unassigned = unassignedJson.batches ?? [];
      const all = [...assigned, ...unassigned].sort((a, b) => a.name.localeCompare(b.name));
      setBatches(all);
      setCurriculumCounts(curriculumJson.counts ?? {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

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
        body: fd,
      });
      const json = (await res.json()) as { message?: string; count?: number };
      if (res.ok) {
        setUploadResult({ text: json.message ?? "Uploaded.", ok: true, count: json.count });
        if (fileInputRef.current) fileInputRef.current.value = "";
        const countRes = await fetch("/api/admin/cc-management/curriculum-counts");
        if (countRes.ok) {
          const countJson = (await countRes.json()) as { counts?: Record<string, number> };
          setCurriculumCounts(countJson.counts ?? {});
        }
      } else {
        setUploadResult({ text: json.message ?? "Upload failed.", ok: false });
      }
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-400">Loading curriculum data…</p>;
  }

  const batchesWithCurriculum = batches.filter((b) => curriculumCounts[b.name]);

  return (
    <>
      <TopProgressBar isLoading={uploading} />
      <div className="space-y-6">
        {/* Upload form */}
        <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
          <h3 className="mb-1 text-base font-semibold text-white">Upload Curriculum File</h3>
          <p className="mb-5 text-xs text-slate-400">
            CSV or Excel with{" "}
            <code className="rounded bg-slate-800 px-1">lecture_name</code> and{" "}
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
              {batches.map((b) => (
                <option key={b.batch_id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#1a2236] px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-purple-600/20 file:px-3 file:py-1 file:text-xs file:text-purple-300"
            />
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
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

        {/* Curriculum status grid */}
        <section className="rounded-2xl border border-white/8 bg-[#10162a] p-6">
          <h3 className="mb-4 text-base font-semibold text-white">
            Curriculum Status
            <span className="ml-2 text-sm font-normal text-slate-400">
              ({batchesWithCurriculum.length} of {batches.length} batches)
            </span>
          </h3>
          {batchesWithCurriculum.length === 0 ? (
            <p className="text-sm text-slate-500">No curriculum uploaded yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {batchesWithCurriculum.map((b) => (
                <div
                  key={b.batch_id}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1a2236] px-4 py-3"
                >
                  <span className="mr-3 truncate text-sm text-white">{b.name}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                    ✓ {curriculumCounts[b.name]} LOs
                  </span>
                </div>
              ))}
            </div>
          )}
          {batches.length > 0 && batchesWithCurriculum.length < batches.length && (
            <p className="mt-4 text-xs text-slate-500">
              {batches.length - batchesWithCurriculum.length} batch
              {batches.length - batchesWithCurriculum.length !== 1 ? "es" : ""} without curriculum.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
