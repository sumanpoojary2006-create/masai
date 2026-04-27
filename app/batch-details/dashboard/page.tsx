export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { AdminDashboardClient } from "@/components/admin-dashboard-client";
import { BatchDashboardClient } from "@/components/batch/BatchDashboardClient";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig, isAdminUser } from "@/lib/env";
import { getAdminBatchStats, getAdminDashboardData, getAdminLectureStats } from "@/lib/queries";

export default async function BatchDetailsDashboardPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  const isAdmin = isAdminUser(user.id);

  if (isAdmin) {
    const [userStats, batchStats, lectureStats] = await Promise.all([
      getAdminDashboardData(),
      getAdminBatchStats(),
      getAdminLectureStats(),
    ]);

    return (
      <div className="space-y-8">
        {/* MasaiLens Admin Report — embedded without its own page wrapper */}
        <AdminDashboardClient
          userStats={userStats}
          batchStats={batchStats}
          lectureStats={lectureStats}
          embedded
        />

        {/* Batch Wise */}
        <div style={{ borderTop: "1px solid #1f2937", paddingTop: "32px" }}>
          <BatchDashboardClient />
        </div>
      </div>
    );
  }

  return (
    <main className="grid gap-6">
      <BatchDashboardClient />
    </main>
  );
}
