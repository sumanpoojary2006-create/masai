export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminDashboardClient } from "@/components/admin-dashboard-client";
import { getAdminBatchStats, getAdminDashboardData, getAdminLectureStats } from "@/lib/queries";
import { redirect } from "next/navigation";

function hasAdminCookie() {
  try {
    const cookieStore = cookies();
    return cookieStore.get("admin_session")?.value === "true";
  } catch {
    return false;
  }
}

export default async function AdminPage() {
  if (!hasAdminCookie()) {
    redirect("/login");
  }

  const [userStats, batchStats, lectureStats] = await Promise.all([
    getAdminDashboardData(),
    getAdminBatchStats(),
    getAdminLectureStats()
  ]);

  const overallStats = userStats.reduce(
    (acc, user) => ({
      totalLectures: acc.totalLectures + user.totalLectures,
      completedTasks: acc.completedTasks + user.completedTasks,
      pendingTasks: acc.pendingTasks + user.pendingTasks,
      missedTasks: acc.missedTasks + user.missedTasks,
      totalUsers: acc.totalUsers + 1
    }),
    { totalLectures: 0, completedTasks: 0, pendingTasks: 0, missedTasks: 0, totalUsers: 0 }
  );

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            Admin Dashboard
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Platform-wide analytics and management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            My Dashboard
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </section>

      <section className="summary-strip theme-panel grid gap-4 rounded-[2rem] p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-3xl bg-ink p-5 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
            Total Users
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {overallStats.totalUsers}
          </p>
        </div>
        <div className="rounded-3xl bg-indigo-50 p-5 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
          <p className="text-xs uppercase tracking-[0.22em] text-indigo-700 dark:text-indigo-400">
            Lectures
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {overallStats.totalLectures}
          </p>
        </div>
        <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            Completed
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {overallStats.completedTasks}
          </p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-700 dark:text-amber-400">
            Pending
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {overallStats.pendingTasks}
          </p>
        </div>
        <div className="rounded-3xl bg-rose-50 p-5 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-700 dark:text-rose-400">
            Missed
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">
            {overallStats.missedTasks}
          </p>
        </div>
      </section>

      <AdminDashboardClient
        userStats={userStats}
        batchStats={batchStats}
        lectureStats={lectureStats}
      />
    </main>
  );
}