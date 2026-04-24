import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";
import { BatchDashboardClient } from "@/components/batch/BatchDashboardClient";

export default async function BatchDetailsDashboardPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  return (
    <main className="grid gap-6">
      <BatchDashboardClient />
    </main>
  );
}
