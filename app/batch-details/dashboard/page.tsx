export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function BatchDetailsDashboardPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  const isAdmin = await hasAdminAccess(user.id);

  return (
    <main className="grid gap-6">
      <AdminDashboardClient isAdmin={isAdmin} />
    </main>
  );
}
