import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";
import { createAuthSupabase } from "@/lib/supabase-server";
import { AdminSyncControls } from "@/components/batch/AdminSyncControls";
import { UserRolesManager } from "@/components/batch/UserRolesManager";

export default async function BatchDetailsAdminPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  // Check if this user is an admin in the batch user_roles table
  const supabase = await createAuthSupabase();
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleData?.role !== "admin") {
    redirect("/batch-details/dashboard");
  }

  return (
    <main className="grid gap-6">
      <section className="rounded-[2rem] bg-white p-8 shadow-panel">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink">
              Admin Controls
            </h2>
            <p className="theme-muted mt-1 text-sm">
              Manually trigger syncs and compliance checks across all users.
            </p>
          </div>
          <a
            href="/batch-details/dashboard"
            className="theme-button-secondary inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition"
          >
            ← Dashboard
          </a>
        </div>
        <AdminSyncControls />
      </section>

      <section className="rounded-[2rem] bg-white p-8 shadow-panel">
        <div className="mb-6">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink">
            User Access Management
          </h2>
          <p className="theme-muted mt-1 text-sm">
            Manage roles for all Batch Wise users. Changes take effect immediately.
          </p>
        </div>
        <UserRolesManager />
      </section>
    </main>
  );
}
