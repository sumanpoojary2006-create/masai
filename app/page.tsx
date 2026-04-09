export const dynamic = "force-dynamic";

import { DashboardClient } from "@/components/dashboard-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadForm } from "@/components/upload-form";
import { hasSupabaseConfig } from "@/lib/env";
import { getDashboardData } from "@/lib/queries";
import { DashboardLecture } from "@/lib/types";

function buildSummary(lectures: DashboardLecture[]) {
  const taskStatuses = lectures.flatMap((lecture) => Object.values(lecture.tasks));

  return {
    lectures: lectures.length,
    completed: taskStatuses.filter((task) => task?.status === "completed").length,
    pending: taskStatuses.filter((task) => task?.status === "pending").length,
    missed: taskStatuses.filter((task) => task?.status === "missed").length
  };
}

export default async function HomePage() {
  let lectures: DashboardLecture[] = [];
  let loadError: string | null = null;

  if (hasSupabaseConfig()) {
    try {
      lectures = await getDashboardData();
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Unable to load lecture records.";
    }
  }

  const summary = buildSummary(lectures);

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-4">
        <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
          Masai Resource Tracker
        </h1>
        <ThemeToggle />
      </section>

      <section className="summary-strip theme-panel grid gap-4 rounded-[2rem] p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl bg-ink p-5 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
            Lectures
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {summary.lectures}
          </p>
        </div>
        <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700">
            Completed
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {summary.completed}
          </p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5 text-amber-900">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-700">
            Pending
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {summary.pending}
          </p>
        </div>
        <div className="rounded-3xl bg-rose-50 p-5 text-rose-900">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-700">
            Missed
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {summary.missed}
          </p>
        </div>
      </section>

      {!hasSupabaseConfig() ? (
        <section className="theme-notice rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Add your environment variables to connect the app
          </h2>
          <p className="mt-2 text-sm">
            Set `SUPABASE_URL` and `SUPABASE_KEY` first, then add LMS and Slack
            credentials before running the scheduled compliance job.
          </p>
        </section>
      ) : null}

      {loadError ? (
        <section className="theme-error rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Dashboard data could not be loaded
          </h2>
          <p className="mt-2 text-sm">{loadError}</p>
        </section>
      ) : null}

      <UploadForm />
      <DashboardClient lectures={lectures} />
    </main>
  );
}
