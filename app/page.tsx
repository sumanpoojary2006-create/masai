export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { BrandLogo } from "@/components/brand-logo";
import { DashboardClient } from "@/components/dashboard-client";
import { CcProxySelector, type ProxyCoordinator } from "@/components/cc/CcProxySelector";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser, getUserProfile } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig, isAdminUser, getAppTimezone } from "@/lib/env";
import { getCCLectures } from "@/lib/queries";
import { createServerSupabase } from "@/lib/supabase";
import type { DashboardLecture } from "@/lib/types";

type SearchParams = Promise<{ proxy?: string }>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="flex items-center justify-between gap-4">
          <BrandLogo />
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

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-4">
        <div>
          <BrandLogo />
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
          <LogoutButton />
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

      <DashboardClient
        lectures={lectures}
        proxyUserId={isProxy ? effectiveUserId : undefined}
        dashboardSelector={
          <CcProxySelector
            coordinators={coordinators}
            currentProxyId={isProxy ? effectiveUserId : null}
            currentProxyName={proxyName}
            basePath="/"
          />
        }
      />
    </main>
  );
}
