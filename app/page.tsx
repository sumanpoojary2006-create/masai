export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { DashboardClient } from "@/components/dashboard-client";
import { CcProxySelector, type ProxyCoordinator } from "@/components/cc/CcProxySelector";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser, getUserProfile } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig, isAdminUser, getAppTimezone } from "@/lib/env";
import { getCCLectures } from "@/lib/queries";
import { createServerSupabase } from "@/lib/supabase";
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

type SearchParams = Promise<{ proxy?: string }>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="flex items-center justify-between gap-4">
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            MasaiLens by Masai
          </h1>
          <ThemeToggle />
        </section>
        <section className="theme-notice rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Add your Supabase environment variables first
          </h2>
          <p className="mt-2 text-sm">
            This app needs SUPABASE_URL, SUPABASE_KEY, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        </section>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile?.onboarding_complete) redirect("/setup");

  const { proxy: proxyParam } = await searchParams;
  const supabase = createServerSupabase();
  const tz = getAppTimezone();

  // ── Fetch all coordinators + authorization for the dropdown ──────────────
  let coordinators: ProxyCoordinator[] = [];

  const { data: allAssignments } = await supabase
    .from("cc_batch_assignments")
    .select("cc_user_id");

  const allCcIds = [
    ...new Set((allAssignments ?? []).map((a) => a.cc_user_id as string)),
  ].filter((id) => id !== user.id);

  let authorizedIds = new Set<string>();
  try {
    const today = DateTime.now().setZone(tz).toISODate()!;
    const { data: coverages } = await supabase
      .from("cc_leave_coverage")
      .select("on_leave_cc_id")
      .eq("covering_cc_id", user.id)
      .eq("coverage_date", today);
    authorizedIds = new Set((coverages ?? []).map((c) => c.on_leave_cc_id as string));
  } catch {
    // Table may not exist yet — all CCs will show as unauthorized
  }

  if (allCcIds.length > 0) {
    try {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const nameMap: Record<string, { email: string; full_name: string }> = {};
      for (const u of authUsers?.users ?? []) {
        nameMap[u.id] = {
          email: u.email ?? "",
          full_name: (u.user_metadata?.full_name as string) ?? "",
        };
      }
      coordinators = allCcIds
        .map((id) => ({
          user_id: id,
          email: nameMap[id]?.email ?? "",
          name: nameMap[id]?.full_name || nameMap[id]?.email || id,
          authorized: authorizedIds.has(id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      coordinators = allCcIds.map((id) => ({
        user_id: id,
        email: id,
        name: id,
        authorized: authorizedIds.has(id),
      }));
    }
  }

  // ── Resolve proxy CC if selected ─────────────────────────────────────────
  let effectiveUserId = user.id;
  let proxyName: string | null = null;

  if (proxyParam && proxyParam !== user.id) {
    const authorizedProxy = coordinators.find(
      (c) => c.user_id === proxyParam && c.authorized
    );
    if (authorizedProxy) {
      effectiveUserId = proxyParam;
      proxyName = authorizedProxy.name;
    } else {
      redirect("/");
    }
  }

  const isProxy = Boolean(proxyName);

  // ── Load lectures for effective user ─────────────────────────────────────
  let lectures: DashboardLecture[] = [];
  let loadError: string | null = null;

  try {
    lectures = await getCCLectures(effectiveUserId);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unable to load lecture records.";
  }

  const summary = buildSummary(lectures);

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            MasaiLens by Masai
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Signed in as {user.email}
            {isProxy && (
              <> &bull; Viewing <strong>{proxyName}&apos;s</strong> dashboard</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdminUser(user.id) && (
            <Link href="/batch-details/dashboard" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">
              Admin
            </Link>
          )}
          <Link href="/lo-tracker" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">
            LO Tracker
          </Link>
          <Link href="/weekly-report" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">
            Weekly Report
          </Link>
          <Link href="/profile" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">
            Profile
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </section>

      {/* CC Proxy Selector — always rendered */}
      <section>
        <CcProxySelector
          coordinators={coordinators}
          currentProxyId={isProxy ? effectiveUserId : null}
          currentProxyName={proxyName}
          basePath="/"
        />
      </section>

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

      {loadError && (
        <section className="theme-error rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">Could not load lectures</h2>
          <p className="mt-2 text-sm">{loadError}</p>
        </section>
      )}

      {lectures.length === 0 && !loadError && (
        <section className="theme-panel rounded-3xl p-8 text-center shadow-panel">
          <p className="font-semibold text-ink">No lectures this week</p>
          <p className="theme-muted mt-2 text-sm">
            {isProxy
              ? `${proxyName} has no lectures configured for this week.`
              : "Either no batches have been assigned to you yet, or the Admin hasn't synced lecture data for this week."}
          </p>
        </section>
      )}

      <DashboardClient lectures={lectures} proxyUserId={isProxy ? effectiveUserId : undefined} />
    </main>
  );
}
