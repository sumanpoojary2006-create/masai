export const dynamic = "force-dynamic";

import Link from "next/link";

import { DashboardClient } from "@/components/dashboard-client";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadForm } from "@/components/upload-form";
import { getCurrentUser, getUserBatchConfigs, getUserProfile } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig, isAdminUser } from "@/lib/env";
import { getDashboardData } from "@/lib/queries";
import { DashboardLecture } from "@/lib/types";
import { redirect } from "next/navigation";

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
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="flex items-center justify-between gap-4">
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            Masai Resource Tracker
          </h1>
          <ThemeToggle />
        </section>

        <section className="theme-notice rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Add your Supabase environment variables first
          </h2>
          <p className="mt-2 text-sm">
            This multi-login version needs `SUPABASE_URL`, `SUPABASE_KEY`,
            `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
          </p>
        </section>
      </main>
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, batchConfigs] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id)
  ]);

  if (!profile?.onboarding_complete || batchConfigs.length === 0) {
    redirect("/setup");
  }

  let lectures: DashboardLecture[] = [];
  let loadError: string | null = null;

  try {
    lectures = await getDashboardData({
      userId: user.id
    });
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Unable to load lecture records.";
  }

  const summary = buildSummary(lectures);

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            Masai Resource Tracker
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Signed in as {user.email} • {batchConfigs.length} batch
            {batchConfigs.length === 1 ? "" : "es"} configured
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdminUser(user.id) && (
            <Link
              href="/admin"
              className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
            >
              Admin
            </Link>
          )}
          <Link
            href="/lo-tracker"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            LO Tracker
          </Link>
          <Link
            href="/weekly-report"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            Weekly Report
          </Link>
          <Link
            href="/profile"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            Profile
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
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
        <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            Completed
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {summary.completed}
          </p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-700 dark:text-amber-400">
            Pending
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {summary.pending}
          </p>
        </div>
        <div className="rounded-3xl bg-rose-50 p-5 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-700 dark:text-rose-400">
            Missed
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {summary.missed}
          </p>
        </div>
      </section>

      {loadError ? (
        <section className="theme-error rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Dashboard data could not be loaded
          </h2>
          <p className="mt-2 text-sm">{loadError}</p>
        </section>
      ) : null}

      <UploadForm batchNames={batchConfigs.map((config) => config.batch_name)} />
      <DashboardClient lectures={lectures} />
    </main>
  );
}
