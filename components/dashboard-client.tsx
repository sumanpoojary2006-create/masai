"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusPill } from "@/components/status-pill";
import { formatLectureDate, formatLectureTime } from "@/lib/deadlines";
import { DashboardLecture, TaskStatus } from "@/lib/types";

const STATUS_FILTERS: Array<TaskStatus | "all"> = [
  "all",
  "pending",
  "completed",
  "missed"
];

export function DashboardClient({ lectures }: { lectures: DashboardLecture[] }) {
  const router = useRouter();
  const [batchFilter, setBatchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const batches = [...new Set(lectures.map((lecture) => lecture.batch_name))].sort();
  const filteredLectures = lectures.filter((lecture) => {
    const batchMatches = batchFilter === "all" || lecture.batch_name === batchFilter;
    const statusMatches =
      statusFilter === "all" ||
      Object.values(lecture.tasks).some((task) => task?.status === statusFilter);

    return batchMatches && statusMatches;
  });

  function handleDelete(lectureId: string, lectureName: string) {
    const confirmed = window.confirm(
      `Delete "${lectureName}" from the dashboard? This will also remove its tasks and tracking history.`
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setDeletingId(lectureId);
      setMessage(null);

      const response = await fetch(`/api/lectures/${lectureId}`, {
        method: "DELETE"
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(payload.message ?? "Unable to delete the lecture.");
        setDeletingId(null);
        return;
      }

      setMessage(payload.message ?? "Lecture deleted.");
      setDeletingId(null);
      router.refresh();
    });
  }

  if (lectures.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-12 text-center shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
          No Data Yet
        </p>
        <h3 className="mt-3 font-[var(--font-heading)] text-3xl font-bold text-ink">
          Import a weekly sheet to start tracking compliance
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
          The dashboard fills automatically after the file upload route stores the
          lectures and generates the three tracked tasks for each session.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
            Compliance Dashboard
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-ink">
            Lecture resources across every batch
          </h2>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-600">
            Batch
            <select
              value={batchFilter}
              onChange={(event) => setBatchFilter(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <option value="all">All batches</option>
              {batches.map((batch) => (
                <option key={batch} value={batch}>
                  {batch}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-600">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "all")}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="pb-3 pr-4">Lecture</th>
              <th className="pb-3 pr-4">Batch</th>
              <th className="pb-3 pr-4">Schedule</th>
              <th className="pb-3 pr-4">Pre-read</th>
              <th className="pb-3 pr-4">Notes</th>
              <th className="pb-3 pr-4">Assignment</th>
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLectures.map((lecture) => (
              <tr key={lecture.id} className="align-top">
                <td className="py-4 pr-4">
                  <p className="font-semibold text-ink">{lecture.lecture_name}</p>
                  <p className="mt-1 text-sm text-slate-500">{lecture.module_name}</p>
                </td>
                <td className="py-4 pr-4 text-sm text-slate-600">{lecture.batch_name}</td>
                <td className="py-4 pr-4 text-sm text-slate-600">
                  <p>{formatLectureDate(lecture.lecture_date)}</p>
                  <p className="mt-1">
                    {formatLectureTime(lecture.start_time)} -{" "}
                    {formatLectureTime(lecture.end_time)}
                  </p>
                </td>
                <td className="py-4 pr-4">
                  {lecture.tasks.preread ? (
                    <StatusPill status={lecture.tasks.preread.status} />
                  ) : (
                    <span className="text-sm text-slate-400">Not created</span>
                  )}
                </td>
                <td className="py-4 pr-4">
                  {lecture.tasks.notes ? (
                    <StatusPill status={lecture.tasks.notes.status} />
                  ) : (
                    <span className="text-sm text-slate-400">Not created</span>
                  )}
                </td>
                <td className="py-4">
                  {lecture.tasks.assignment ? (
                    <StatusPill status={lecture.tasks.assignment.status} />
                  ) : (
                    <span className="text-sm text-slate-400">Not created</span>
                  )}
                </td>
                <td className="py-4">
                  <button
                    type="button"
                    disabled={isPending && deletingId === lecture.id}
                    onClick={() => handleDelete(lecture.id, lecture.lecture_name)}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    {deletingId === lecture.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
