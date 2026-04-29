export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BatchList } from "@/components/cc/BatchList";
import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";
import { hasAdminAccess } from "@/lib/admin-access";

export default async function CCDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Admins shouldn't land here
  const isAdmin = await hasAdminAccess(user.id);
  if (isAdmin) redirect("/admin/dashboard");

  // Verify the user has at least one batch assigned
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

  return (
    <div className="min-h-screen bg-[#080d1a]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#080d1a]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-bold text-white">CC Dashboard</h1>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">Your Batches</h2>
          <p className="mt-1 text-sm text-slate-400">
            Click on a batch to view lecture compliance details.
          </p>
        </div>
        <BatchList />
      </main>
    </div>
  );
}
