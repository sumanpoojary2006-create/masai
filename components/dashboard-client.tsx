"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";

import { StatusPill } from "@/components/status-pill";
import { formatDeadline, formatLectureDate, formatLectureTime } from "@/lib/deadlines";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    batch_name: "",
    module_name: "",
    lecture_name: "",
    lecture_date: "",
    start_time: "",
    end_time: ""
  });
  const [isPending, startTransition] = useTransition();

  const batches = [...new Set(lectures.map((lecture) => lecture.batch_name))].sort();
  const filteredLectures = lectures.filter((lecture) => {
    const batchMatches = batchFilter === "all" || lecture.batch_name === batchFilter;
    const statusMatches =
      statusFilter === "all" ||
      Object.values(lecture.tasks).some((task) => task?.status === statusFilter);

    return batchMatches && statusMatches;
  });
  const groupedLectures = Object.entries(
    filteredLectures.reduce<Record<string, DashboardLecture[]>>((accumulator, lecture) => {
      const current = accumulator[lecture.batch_name] ?? [];
      current.push(lecture);
      accumulator[lecture.batch_name] = current;
      return accumulator;
    }, {})
  ).sort(([leftBatch], [rightBatch]) => leftBatch.localeCompare(rightBatch));

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

  function startEditing(lecture: DashboardLecture) {
    setEditingId(lecture.id);
    setMessage(null);
    setEditForm({
      batch_name: lecture.batch_name,
      module_name: lecture.module_name,
      lecture_name: lecture.lecture_name,
      lecture_date: lecture.lecture_date,
      start_time: lecture.start_time.slice(0, 5),
      end_time: lecture.end_time.slice(0, 5)
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setMessage(null);
  }

  function updateField(field: keyof typeof editForm, value: string) {
    setEditForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function handleSave(lectureId: string) {
    startTransition(async () => {
      setMessage(null);

      const response = await fetch(`/api/lectures/${lectureId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(editForm)
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(payload.message ?? "Unable to update the lecture.");
        return;
      }

      setMessage(payload.message ?? "Lecture updated.");
      setEditingId(null);
      router.refresh();
    });
  }

  function handleSync() {
    startTransition(async () => {
      setIsSyncing(true);
      setMessage(null);

      const response = await fetch("/api/compliance", {
        method: "POST"
      });

      const payload = (await response.json()) as {
        message?: string;
        result?: {
          checkedLectures: number;
          trackedResources: number;
          updatedTasks: number;
          alertsSent: number;
        };
      };

      if (!response.ok) {
        setMessage(payload.message ?? "Unable to run compliance sync.");
        setIsSyncing(false);
        return;
      }

      if (payload.result) {
        setMessage(
          `Sync complete. Checked ${payload.result.checkedLectures} lectures, updated ${payload.result.updatedTasks} tasks, and sent ${payload.result.alertsSent} Slack message(s).`
        );
      } else {
        setMessage(payload.message ?? "Compliance sync completed.");
      }

      setIsSyncing(false);
      router.refresh();
    });
  }

  function renderTaskCell(lecture: DashboardLecture, type: "preread" | "notes" | "assignment") {
    const task = lecture.tasks[type];

    if (!task) {
      return <span className="theme-muted text-sm">Not created</span>;
    }

    return (
      <div className="space-y-2">
        <StatusPill task={task} />
        <p className="theme-muted text-xs font-medium">
          Release by {formatDeadline(task.deadline)}
        </p>
      </div>
    );
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
          <p className="theme-muted mx-auto mt-3 max-w-2xl text-sm">
            The dashboard fills automatically after the file upload route stores the
            lectures and generates the three tracked tasks for each session.
          </p>
        <button
          type="button"
          disabled={isPending || isSyncing}
          onClick={handleSync}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSyncing ? "Syncing..." : "Sync Up"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="theme-panel rounded-3xl p-6 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Compliance Dashboard
            </p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-ink">
              Lecture resources across every batch
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <button
              type="button"
              disabled={isPending || isSyncing}
              onClick={handleSync}
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSyncing ? "Syncing..." : "Sync Up"}
            </button>

            <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
              Batch
              <select
                value={batchFilter}
                onChange={(event) => setBatchFilter(event.target.value)}
                className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
              >
                <option value="all">All batches</option>
                {batches.map((batch) => (
                  <option key={batch} value={batch}>
                    {batch}
                  </option>
                ))}
              </select>
            </label>

            <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "all")}
                className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
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

        {message ? <p className="theme-muted mt-4 text-sm">{message}</p> : null}

        {groupedLectures.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              No Matching Lectures
            </p>
            <p className="theme-muted mt-2 text-sm">
              Try a different batch or status filter to see grouped lecture results.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {groupedLectures.map(([batchName, batchLectures]) => (
              <div
                key={batchName}
                className="theme-subpanel overflow-hidden rounded-3xl"
              >
                <div className="theme-subpanel-header px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Batch
                  </p>
                  <h3 className="mt-1 font-[var(--font-heading)] text-xl font-bold text-ink">
                    {batchName}
                  </h3>
                  <p className="theme-muted mt-1 text-sm">
                    {batchLectures.length} lecture{batchLectures.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="overflow-x-auto px-5 py-2">
                  <table className="min-w-full divide-y divide-slate-200/70">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <th className="pb-3 pr-4 pt-3">Lecture</th>
                        <th className="pb-3 pr-4 pt-3">Schedule</th>
                        <th className="pb-3 pr-4 pt-3">Pre-read</th>
                        <th className="pb-3 pr-4 pt-3">Notes</th>
                        <th className="pb-3 pr-4 pt-3">Assignment</th>
                        <th className="pb-3 pt-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80">
                      {batchLectures.map((lecture) => (
                        <Fragment key={lecture.id}>
                          <tr className="align-top">
                            <td className="py-4 pr-4">
                              <p className="font-semibold text-ink">{lecture.lecture_name}</p>
                              <p className="theme-muted mt-1 text-sm">{lecture.module_name}</p>
                            </td>
                            <td className="theme-muted py-4 pr-4 text-sm">
                              <p>{formatLectureDate(lecture.lecture_date)}</p>
                              <p className="mt-1">
                                {formatLectureTime(lecture.start_time)} -{" "}
                                {formatLectureTime(lecture.end_time)}
                              </p>
                            </td>
                            <td className="py-4 pr-4">{renderTaskCell(lecture, "preread")}</td>
                            <td className="py-4 pr-4">{renderTaskCell(lecture, "notes")}</td>
                            <td className="py-4 pr-4">{renderTaskCell(lecture, "assignment")}</td>
                            <td className="py-4">
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => startEditing(lecture)}
                                  className="theme-button-secondary inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={isPending && deletingId === lecture.id}
                                  onClick={() => handleDelete(lecture.id, lecture.lecture_name)}
                                  className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                >
                                  {deletingId === lecture.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {editingId === lecture.id ? (
                            <tr className="bg-white/90">
                              <td colSpan={6} className="px-0 pb-5 pt-1">
                                <div className="theme-edit-panel rounded-2xl p-4">
                                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                                Batch
                                <input
                                  value={editForm.batch_name}
                                  onChange={(event) => updateField("batch_name", event.target.value)}
                                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                                />
                              </label>
                              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                                Module
                                <input
                                  value={editForm.module_name}
                                  onChange={(event) => updateField("module_name", event.target.value)}
                                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                                />
                              </label>
                              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                                Lecture Name
                                <input
                                  value={editForm.lecture_name}
                                  onChange={(event) => updateField("lecture_name", event.target.value)}
                                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                                />
                              </label>
                              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                                Date
                                <input
                                  type="date"
                                  value={editForm.lecture_date}
                                  onChange={(event) => updateField("lecture_date", event.target.value)}
                                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                                />
                              </label>
                              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                                Start Time
                                <input
                                  type="time"
                                  value={editForm.start_time}
                                  onChange={(event) => updateField("start_time", event.target.value)}
                                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                                />
                              </label>
                              <label className="theme-muted flex flex-col gap-2 text-sm font-medium">
                                End Time
                                <input
                                  type="time"
                                  value={editForm.end_time}
                                  onChange={(event) => updateField("end_time", event.target.value)}
                                  className="theme-input rounded-2xl px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                                />
                              </label>
                            </div>

                                  <div className="mt-4 flex flex-wrap gap-3">
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() => handleSave(lecture.id)}
                                      className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                                    >
                                      Save Changes
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={cancelEditing}
                                      className="theme-button-secondary inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:text-slate-400"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
