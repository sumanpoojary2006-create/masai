export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/dashboard-client";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BatchList } from "@/components/cc/BatchList";
import { getCurrentUser, getUserBatchConfigs } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";
import { hasAdminAccess } from "@/lib/admin-access";
import { getDashboardData } from "@/lib/queries";
import { DashboardLecture } from "@/lib/types";

function buildSummary(lectures: DashboardLecture[]) {
  const taskStatuses = lectures.flatMap((l) => Object.values(l.tasks));
  return {
    lectures: lectures.length,
    completed: taskStatuses.filter((t) => t?.status === "completed").length,
    pending: taskStatuses.filter((t) => t?.status === "pending").length,
    missed: taskStatuses.filter((t) => t?.status === "missed").length,
  };
}

export default async function CCDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = await hasAdminAccess(user.id);
  if (isAdmin) redirect("/admin/dashboard");

  const supabase = createServerSupabase();
  const { data: assignments } = await supabase
    .from("cc_batch_assignments")
    .select("batch_id")
    .eq("cc_user_id", user.id)
    .limit(1);

  if (!assignments || assignments.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#080d1a] px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-bold text-white">No Batches Assigned</h1>
          <p className="mt-3 text-sm text-slate-400">
            Your account hasn't been configured yet. Please contact your Admin to get your batches set up.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </div>
      </main>
    );
  }

  const batchConfigs = await getUserBatchConfigs(user.id);

  let lectures: DashboardLecture[] = [];
  let loadError: string | null = null;
  try {
    lectures = await getDashboardData({ userId: user.id });
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unable to load lecture records.";
  }

  const summary = buildSummary(lectures);

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            MasaiLens by Masai
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Signed in as {user.email} &bull;{" "}
            {batchConfigs.length > 0
              ? `${batchConfigs.length} batch${batchConfigs.length === 1 ? "" : "es"} configured`
              : `${assignments.length} batch${assignments.length === 1 ? "" : "es"} assigned`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/lo-tracker"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            LO Tracker
          </Link>
          <Link
            href="/batch-details/dashboard"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            Batch Details
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

      {/* Summary strip */}
      <section className="summary-strip theme-panel grid gap-4 rounded-[2rem] p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl bg-ink p-5 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Lectures</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{summary.lectures}</p>
        </div>
        <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">Completed</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{summary.completed}</p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-700 dark:text-amber-400">Pending</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{summary.pending}</p>
        </div>
        <div className="rounded-3xl bg-rose-50 p-5 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-700 dark:text-rose-400">Missed</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{summary.missed}</p>
        </div>
      </section>

      {loadError ? (
        <section className="theme-error rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">Dashboard data could not be loaded</h2>
          <p className="mt-2 text-sm">{loadError}</p>
        </section>
      ) : null}

      {/* This week's lectures */}
      <DashboardClient lectures={lectures} />

      {/* Assigned batches */}
      <section className="theme-panel rounded-[2rem] p-6">
        <h2 className="mb-4 font-[var(--font-heading)] text-xl font-bold text-ink">
          Your Assigned Batches
        </h2>
        <BatchList />
      </section>
    </main>
  );
}
