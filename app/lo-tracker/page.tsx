export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { LoTrackerClient } from "@/components/lo-tracker-client";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser, getUserBatchConfigs, getUserProfile } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";
import { getLoTrackerData } from "@/lib/queries";
import { createServerSupabase } from "@/lib/supabase";
import { LoTrackerRow } from "@/lib/types";

export default async function LoTrackerPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createServerSupabase();

  // Check both access paths in parallel:
  // 1. Personal CC: has onboarding_complete + user_batch_configs
  // 2. Admin-assigned CC: has cc_batch_assignments (no personal setup required)
  const [profile, batchConfigs, ccAssignmentsResult] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id),
    supabase
      .from("cc_batch_assignments")
      .select("batch_id, batch_name")
      .eq("cc_user_id", user.id)
  ]);

  const ccAssignments = ccAssignmentsResult.data ?? [];
  const isPersonalCC = profile?.onboarding_complete && batchConfigs.length > 0;
  const isAdminCC = ccAssignments.length > 0;

  if (!isPersonalCC && !isAdminCC) {
    redirect("/setup");
  }

  // Build a readable batch summary for the subtitle
  const batchSummary = isAdminCC
    ? `${ccAssignments.length} batch${ccAssignments.length === 1 ? "" : "es"} assigned`
    : `${batchConfigs.length} batch${batchConfigs.length === 1 ? "" : "es"} configured`;

  let rows: LoTrackerRow[] = [];
  let loadError: string | null = null;

  try {
    rows = await getLoTrackerData(user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load LO tracker data.";
  }

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            LO Tracker
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Signed in as {user.email} · {batchSummary}
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
          <ThemeToggle />
          <LogoutButton />
        </div>
      </section>

      {loadError ? (
        <section className="theme-error rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Could not load LO data
          </h2>
          <p className="mt-2 text-sm">{loadError}</p>
        </section>
      ) : null}

      <LoTrackerClient rows={rows} />
    </main>
  );
}
