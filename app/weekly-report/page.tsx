export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { WeeklyReportClient } from "@/components/weekly-report-client";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser, getUserBatchConfigs, getUserProfile } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";
import { getWeeklyReportData } from "@/lib/queries";
import { WeeklyReportWeek } from "@/lib/types";

export default async function WeeklyReportPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, batchConfigs] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id)
  ]);

  if (!profile?.onboarding_complete || batchConfigs.length === 0) {
    redirect("/setup");
  }

  let weeks: WeeklyReportWeek[] = [];
  let loadError: string | null = null;

  try {
    weeks = await getWeeklyReportData(user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load weekly report data.";
  }

  const monthCount = new Set(
    weeks.flatMap((week) =>
      week.lectures.map((lecture) => lecture.lecture_date.slice(0, 7))
    )
  ).size;

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            Weekly Report
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Month-wise archived lecture history • {monthCount} month{monthCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            ← Dashboard
          </Link>
          <Link
            href="/profile"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            Profile
          </Link>
          <LogoutButton />
        </div>
      </section>

      {loadError ? (
        <section className="theme-error rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Could not load weekly report
          </h2>
          <p className="mt-2 text-sm">{loadError}</p>
        </section>
      ) : null}

      <WeeklyReportClient weeks={weeks} />
    </main>
  );
}
